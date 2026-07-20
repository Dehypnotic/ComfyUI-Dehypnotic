# save_video.py
# ComfyUI node: Save Video (imageio-ffmpeg, audio as input w/ auto SR)
#
# - Inputs: images (IMAGE), optional audio (AUDIO)
# - Containers/codecs configurable (mp4/mkv/webm/mov with h264/h265/vp9/av1/prores/dnxhr)
# - Sequential filenames, optional date subfolder; can also export selected frames only
# - Loops single frame to audio length automatically
# - Uses imageio-ffmpeg (bundled FFmpeg), no system install needed
#
# pip install imageio imageio-ffmpeg

import os
import re
import math
import wave
import json
import time
import uuid
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Tuple, Union

import numpy as np

try:
    import imageio_ffmpeg  # type: ignore
    _IMAGEIO_FFMPEG_ERROR = None
except Exception as exc:
    imageio_ffmpeg = None  # type: ignore
    _IMAGEIO_FFMPEG_ERROR = exc


VALID_PRESETS = ("ultrafast","superfast","veryfast","faster","fast","medium","slow","slower","veryslow")

VIDEO_CODEC_OPTIONS = {
    "h264": {
        "label": "H.264 (libx264)",
        "ffmpeg": "libx264",
        "pix_fmt": "yuv420p",
        "args": [],
        "supports_crf": True,
        "supports_preset": True,
    },
    "h265": {
        "label": "H.265 / HEVC (libx265)",
        "ffmpeg": "libx265",
        "pix_fmt": "yuv420p",
        "args": [],
        "supports_crf": True,
        "supports_preset": True,
    },
    "vp9": {
        "label": "VP9 (libvpx-vp9)",
        "ffmpeg": "libvpx-vp9",
        "pix_fmt": "yuv420p",
        "args": [["-b:v", "0"]],
        "supports_crf": True,
        "supports_preset": False,
    },
    "av1": {
        "label": "AV1 (libaom-av1)",
        "ffmpeg": "libaom-av1",
        "pix_fmt": "yuv420p",
        "args": [["-b:v", "0"], ["-cpu-used", "6"], ["-row-mt", "1"]],
        "supports_crf": True,
        "supports_preset": False,
    },
    "prores": {
        "label": "ProRes 422 HQ (prores_ks)",
        "ffmpeg": "prores_ks",
        "pix_fmt": "yuv422p10le",
        "args": [["-profile:v", "3"]],
        "supports_crf": False,
        "supports_preset": False,
    },
    "dnxhr": {
        "label": "DNxHR HQ (dnxhr_hq)",
        "ffmpeg": "dnxhr_hq",
        "pix_fmt": "yuv422p10le",
        "args": [],
        "supports_crf": False,
        "supports_preset": False,
    },
}

CONTAINER_OPTIONS = {
    "mp4": {
        "label": "MP4",
        "extension": "mp4",
        "allowed_codecs": {"h264", "h265", "av1"},
        "audio_codec": "aac",
        "extra": [["-movflags", "+faststart"]],
    },
    "mkv": {
        "label": "Matroska (MKV)",
        "extension": "mkv",
        "allowed_codecs": set(VIDEO_CODEC_OPTIONS.keys()),
        "audio_codec": "aac",
        "extra": [],
    },
    "webm": {
        "label": "WebM",
        "extension": "webm",
        "allowed_codecs": {"vp9", "av1"},
        "audio_codec": "libopus",
        "extra": [],
    },
    "mov": {
        "label": "QuickTime MOV",
        "extension": "mov",
        "allowed_codecs": {"h264", "h265", "prores", "dnxhr"},
        "audio_codec": "aac",
        "extra": [],
    },
}

# ------------------------- helpers -------------------------

def _next_seq_number(folder: Path, prefix: str, delim: str, padding: int) -> int:
    pattern = re.compile(rf"^{re.escape(prefix)}{re.escape(delim)}(\d{{{padding}}})\b")
    max_num = 0
    if folder.exists():
        for p in folder.iterdir():
            if not p.is_file():
                continue
            m = pattern.match(p.stem)
            if m:
                try:
                    n = int(m.group(1))
                    if n > max_num:
                        max_num = n
                except ValueError:
                    pass
    return max_num + 1

def _normalize_frames(images) -> List[np.ndarray]:
    try:
        import torch  # type: ignore
    except Exception:
        torch = None  # type: ignore

    data = images

    if isinstance(data, (list, tuple)) and len(data) == 1:
        single = data[0]
        if torch is not None and isinstance(single, torch.Tensor):
            single = single.detach().cpu().numpy()
        if isinstance(single, np.ndarray) and single.ndim == 4:
            data = single

    if torch is not None and isinstance(data, torch.Tensor):
        data = data.detach().cpu().numpy()

    frames_list: List[np.ndarray] = []

    if isinstance(data, np.ndarray):
        if data.ndim == 4:
            frames_list = [data[i] for i in range(data.shape[0])]
        elif data.ndim == 3:
            frames_list = [data]
        else:
            raise ValueError(f"Expected IMAGE as [N,H,W,C] or [H,W,C], got {data.shape}")
    elif isinstance(data, (list, tuple)):
        for item in data:
            if torch is not None and isinstance(item, torch.Tensor):
                item = item.detach().cpu().numpy()
            if isinstance(item, np.ndarray) and item.ndim == 4:
                frames_list.extend([item[i] for i in range(item.shape[0])])
            else:
                frames_list.append(item)
    else:
        frames_list = [data]

    out: List[np.ndarray] = []
    for f in frames_list:
        a = np.asarray(f)
        if a.ndim == 4 and a.shape[0] == 1:
            a = a[0]
        if a.ndim != 3 or a.shape[2] not in (3, 4):
            raise ValueError(f"Expected frame [H,W,3/4], got {a.shape}")
        if a.dtype != np.uint8:
            a = np.clip(a, 0.0, 1.0)
            a = (a * 255.0).round().astype(np.uint8)
        if a.shape[2] == 4:
            a = a[:, :, :3]
        out.append(a)
    return out

def _split_audio_input(audio: Union[np.ndarray, tuple, list, dict]) -> Tuple[np.ndarray, int]:
    sr = 48000
    samples = None

    try:
        import torch  # type: ignore
    except Exception:
        torch = None  # type: ignore

    def _is_str_like(x) -> bool:
        return isinstance(x, (str, np.str_, bytes))

    def _is_numeric_array(x) -> bool:
        """Return True if x looks like a numeric waveform array, not a string array."""
        if torch is not None and isinstance(x, torch.Tensor):
            return True
        if isinstance(x, np.ndarray):
            return not np.issubdtype(x.dtype, np.character) and x.dtype != object
        return False

    def _extract_sr(val) -> int:
        if torch is not None and isinstance(val, torch.Tensor):
            return int(val.detach().cpu().item())
        if hasattr(val, "item"):
            return int(val.item())
        return int(val)

    # --- Normalise numpy arrays first ---
    if isinstance(audio, np.ndarray):
        if audio.ndim == 0:
            # 0-d array – unwrap to the contained Python object
            audio = audio.item()
        elif audio.dtype == object:
            # Object array: keep as list so items (tensors, scalars) stay intact
            audio = list(audio)
        elif np.issubdtype(audio.dtype, np.character):
            # String-dtype numpy array (e.g. np.array(['waveform','sample_rate']))
            # This means a dict was collapsed to its keys upstream — data is gone.
            raise ValueError(
                f"Audio input is a string-dtype numpy array ({audio!r}). "
                "A dict-type audio was likely serialised to only its keys. "
                "Check the audio connection in your workflow."
            )
        else:
            # Plain numeric numpy array — use directly as samples
            samples = audio

    # --- Torch tensor passed directly ---
    if samples is None and torch is not None and isinstance(audio, torch.Tensor):
        samples = audio.detach().cpu().numpy()

    # --- Dict (standard ComfyUI AUDIO format) ---
    if samples is None and isinstance(audio, dict):
        sr_val = audio.get("sample_rate") or audio.get("sr")
        if sr_val is not None:
            sr = _extract_sr(sr_val)
        for key in ("samples", "waveform", "audio", "data"):
            if key in audio:
                samples = audio[key]
                break
        if samples is None:
            raise ValueError("Audio dict missing samples (samples/waveform/audio/data).")

    # --- Tuple / list (e.g. (waveform_tensor, sample_rate) or flat key-value sequence) ---
    elif samples is None and isinstance(audio, (tuple, list)):
        sample_candidate = None
        sr_candidate = None
        for item in audio:
            if _is_str_like(item):
                continue
            # Prefer a numeric tensor/array over generic list/tuple
            if sample_candidate is None and _is_numeric_array(item):
                sample_candidate = item
                continue
            # Numeric Python scalar or numpy scalar → could be sample_rate
            if sr_candidate is None and not _is_str_like(item):
                if isinstance(item, (int, float)) and not isinstance(item, bool):
                    sr_candidate = int(item)
                    continue
                if isinstance(item, np.integer):
                    sr_candidate = int(item)
                    continue
            # Generic list/tuple as fallback waveform candidate
            if sample_candidate is None and isinstance(item, (list, tuple)):
                sample_candidate = item
                continue

        if sample_candidate is None:
            raise ValueError("AUDIO tuple/list did not contain numeric audio samples.")
        samples = sample_candidate
        if sr_candidate is not None:
            sr = sr_candidate

    elif samples is None:
        samples = audio

    # --- Convert to numpy ---
    if torch is not None and isinstance(samples, torch.Tensor):
        samples = samples.detach().cpu().numpy()

    a = np.asarray(samples)

    # Guard: reject string arrays that slipped through
    if np.issubdtype(a.dtype, np.character) or (
        a.dtype == object and a.size > 0 and _is_str_like(next(iter(a.flat), None))
    ):
        raise ValueError(
            f"Audio data resolved to a string array ({a!r}). "
            "Check your workflow's audio connection."
        )
    if a.ndim == 0:
        a = a.reshape(1, 1)
    if a.ndim == 3:
        shapes = a.shape
        sample_axis = int(np.argmax(shapes))
        remaining = [ax for ax in range(3) if ax != sample_axis]
        channel_axis = None
        batch_axis = None
        for ax in remaining:
            if channel_axis is None and shapes[ax] <= 8:
                channel_axis = ax
            else:
                batch_axis = ax
        if channel_axis is None:
            channel_axis = remaining[0]
            batch_axis = remaining[1]
        if batch_axis is None:
            batch_axis = remaining[1]
        a = np.moveaxis(a, (batch_axis, channel_axis, sample_axis), (0, 1, 2))
        a = a[0]

    if a.ndim == 1:
        a = a.reshape(1, -1)
    elif a.ndim == 2:
        if a.shape[0] < a.shape[1] and a.shape[1] <= 8:
            a = a.T
    else:
        a = np.squeeze(a)
        if a.ndim == 1:
            a = a.reshape(1, -1)
        elif a.ndim == 2:
            pass
        else:
            raise ValueError(f"AUDIO must be 1D or 2D, got {a.shape}")

    if a.dtype != np.float32:
        a = a.astype(np.float32)
    if a.max() > 1.5 or a.min() < -1.5:
        a = np.clip(a, -32768, 32767) / 32767.0
    else:
        a = np.clip(a, -1.0, 1.0)

    return a, int(sr)

def _audio_to_wav_path(audio_in: Union[np.ndarray, tuple, list]) -> str:
    a, sr = _split_audio_input(audio_in)
    a16 = (np.clip(a, -1.0, 1.0) * 32767.0).round().astype(np.int16)
    nch, nsamps = a16.shape

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp_path = tmp.name
    tmp.close()

    with wave.open(tmp_path, "wb") as wf:
        wf.setnchannels(nch)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(a16.T.tobytes())
    return tmp_path

def _parse_ffmpeg_duration(stderr_text: str) -> Optional[float]:
    m = re.search(r"Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+|\d{2})", stderr_text)
    if not m:
        return None
    hh, mm, ss = m.groups()
    try:
        return int(hh)*3600 + int(mm)*60 + float(ss)
    except Exception:
        return None

def _probe_audio_duration(ffmpeg_exe: str, audio_path: str) -> Optional[float]:
    try:
        p = subprocess.run([ffmpeg_exe, "-hide_banner", "-i", audio_path],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return _parse_ffmpeg_duration(p.stderr or "")
    except Exception:
        return None

def _build_cmd(ffmpeg_exe: str, w: int, h: int, fps: int,
               out_path: Path, codec_info: dict, container_info: dict,
               acodec: Optional[str], audio_path: Optional[str],
               crf: int, preset: str) -> list:
    cmd = [
        ffmpeg_exe, "-y", "-hide_banner", "-loglevel", "error",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps),
        "-i", "-"
    ]
    if audio_path and acodec:
        cmd += ["-i", audio_path]

    vf = "pad=ceil(iw/2)*2:ceil(ih/2)*2"
    cmd += ["-vf", vf, "-c:v", codec_info["ffmpeg"]]

    if codec_info.get("supports_preset"):
        cmd += ["-preset", preset]
    if codec_info.get("supports_crf"):
        cmd += ["-crf", str(crf)]

    pix_fmt = codec_info.get("pix_fmt")
    if pix_fmt:
        cmd += ["-pix_fmt", pix_fmt]

    for extra in codec_info.get("args", []):
        cmd += extra

    if audio_path and acodec:
        cmd += ["-c:a", acodec, "-b:a", "192k", "-ar", "48000"]
    else:
        cmd += ["-an"]

    for extra in container_info.get("extra", []):
        cmd += extra

    cmd += [str(out_path)]
    return cmd

# --------------------------- node ---------------------------

class SaveVideo:
    """
    Save Video (simple) â€” minimal kontroller, audio som direkte input.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "save_mode": (("video", "frames", "video & frames"), {"default": "video", "tooltip": "Choose whether to save video, frames, or both."}),
                "images": ("IMAGE", {"tooltip": "Frame input. Batch data supported."}),
                "file_path": ("STRING", {"default": "output/video", "tooltip": "Folder where the video is saved."}),
                "date_subfolder_pattern": ("STRING", {"default": "%Y-%m-%d", "tooltip": "Optional strftime pattern or placeholders for subfolders."}),
                "filename_prefix": ("STRING", {"default": "VID", "tooltip": "Filename prefix, e.g. VID_0001.mp4."}),
                "filename_delimiter": ("STRING", {"default": "_", "tooltip": "Delimiter between prefix and sequence number."}),
                "number_padding": ("INT", {"default": 4, "min": 1, "max": 10, "tooltip": "Digits in the sequence number (0001, 0002, ...)."}),
                "number_start": ("INT", {"default": 1, "min": 0, "max": 1_000_000, "tooltip": "Starting value for the sequence number."}),
                "container": (tuple(CONTAINER_OPTIONS.keys()), {"default": "mp4", "tooltip": "Container format (mp4, mkv, webm, mov)."}),
                "video_codec": (tuple(VIDEO_CODEC_OPTIONS.keys()), {"default": "h264", "tooltip": "Video codec to use for encoding."}),
                "fps": ("INT", {"default": 24, "min": 1, "max": 240, "tooltip": "Frames per second (CFR)."}),
                "crf": ("INT", {"default": 23, "min": 0, "max": 51, "tooltip": "Quality (lower = better, larger files). Typical 18-28 for H.264."}),
                "preset": (VALID_PRESETS, {"default": "fast", "tooltip": "Encoder speed versus quality (ultrafast ... veryslow)."}),
            },
            "optional": {
                "audio": ("AUDIO", {"tooltip": "Optional audio track. Mono/stereo supported."}),
                "loop_still_to_audio": ("BOOLEAN", {"default": True, "tooltip": "If only one frame plus audio, loop the frame to match audio length."}),
                "show_progress": ("BOOLEAN", {"default": True, "tooltip": "Write progress information to the console."}),
                "show_preview": ("BOOLEAN", {"default": False, "tooltip": "Generate preview sequence in the node output."}),
                "preview_step": ("INT", {"default": 1, "min": 1, "max": 50, "tooltip": "Show every Nth frame in the preview sequence."}),
                "preview_max_frames": ("INT", {"default": 24, "min": 1, "max": 120, "tooltip": "Maximum number of frames generated for preview."}),
                "frames_dir": ("STRING", {"default": "", "tooltip": "Save selected frames here (relative to the video folder). Leave empty to skip."}),
                "frames_select": ("STRING", {"default": "-2", "tooltip": "Frames to save: -2=last, -1=all, 0=first, or comma list (e.g. 0,5,10)."}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING",)
    RETURN_NAMES = ("images", "video_path",)
    FUNCTION = "save"
    CATEGORY = "Dehypnotic/💾 IO"
    OUTPUT_NODE = True

    # ----------------------- path helpers -----------------------

    def _normalize_path(self, path: Path) -> Path:
        return Path(os.path.abspath(str(path)))

    def _base_output_dir(self) -> Path:
        try:
            from folder_paths import get_output_directory  # type: ignore
            base = Path(get_output_directory()).expanduser()
        except Exception:
            base = Path.cwd() / "output"
        return self._normalize_path(base)

    def _comfy_root(self) -> Path:
        base = self._base_output_dir()
        return self._normalize_path(base.parent)

    def _load_allowed_roots(self) -> List[Path]:
        env_cfg = os.environ.get("DEHYPNOTIC_SAVE_ALLOWED_PATHS")
        candidates: List[str] = []
        if env_cfg:
            candidates.append(env_cfg)

        comfy_root = self._comfy_root()
        names = ("dehypnotic_save_allowed_paths.json", "allowed_paths.json")
        for name in names:
            candidates.append(str(comfy_root / "user" / "config" / name))
            candidates.append(str(comfy_root / "user" / name))
            candidates.append(str(comfy_root / "config" / name))
            candidates.append(str(comfy_root / name))

        here = Path(__file__).resolve().parent
        for name in names:
            candidates.append(str(here / name))

        seen = set()
        for path_str in candidates:
            if not path_str:
                continue
            candidate = Path(os.path.expandvars(path_str)).expanduser()
            key = str(candidate)
            if key in seen:
                continue
            seen.add(key)
            if candidate.is_file():
                try:
                    with open(candidate, "r", encoding="utf-8") as fh:
                        raw = fh.read()
                except Exception:
                    continue
                filtered = "\n".join(
                    line for line in raw.splitlines() if not line.lstrip().startswith("#")
                )
                try:
                    data = json.loads(filtered)
                except Exception:
                    continue
                entries = []
                if isinstance(data, dict):
                    entries = data.get("allowed_roots") or data.get("roots") or []
                elif isinstance(data, list):
                    entries = data
                roots: List[Path] = []
                for entry in entries:
                    if isinstance(entry, str):
                        roots.append(self._normalize_path(Path(os.path.expandvars(entry)).expanduser()))
                if roots:
                    return roots
        return []

    def _same_drive(self, a: Path, b: Path) -> bool:
        da = os.path.splitdrive(str(self._normalize_path(a)))[0].lower()
        db = os.path.splitdrive(str(self._normalize_path(b)))[0].lower()
        return da == db

    def _is_under_dir(self, path: Path, base: Path) -> bool:
        try:
            ap = self._normalize_path(path)
            bp = self._normalize_path(base)
            if not self._same_drive(ap, bp):
                return False
            return os.path.commonpath([str(ap), str(bp)]) == str(bp)
        except Exception:
            return False

    def _validate_path_is_allowed(self, target_path: Path) -> None:
        target_abs = self._normalize_path(target_path)
        base_output = self._base_output_dir()
        if self._is_under_dir(target_abs, base_output):
            return

        for root in self._load_allowed_roots():
            if self._is_under_dir(target_abs, root):
                return

        msg = (
            "External save path is not allowed.\n"
            "This node only writes inside ComfyUI's output directory, "
            "unless the path is whitelisted offline.\n\n"
            "To allow external locations, create/edit a JSON file named "
            "\'dehypnotic_save_allowed_paths.json\' in your ComfyUI root (or user/config) folder "
            "with content like:\n\n"
            '{\n  "allowed_roots": ["D:/VideoExports", "E:/TeamShare/Video"]\n}\n\n'
            "You can also set the DEHYPNOTIC_SAVE_ALLOWED_PATHS environment variable to point to this file."
        )
        raise PermissionError(msg)

    def _build_template_context(self) -> dict:
        return {
            "unix": str(int(time.time())),
            "guid": uuid.uuid4().hex,
            "uuid": uuid.uuid4().hex,
            "model": "unknown",
        }

    def _expand_path_templates(self, text: str, context: dict | None = None) -> str:
        if not isinstance(text, str):
            return text

        ctx = context or {}

        def repl_time(match):
            fmt = match.group(1)
            try:
                return time.strftime(fmt)
            except Exception:
                return time.strftime("%Y%m%d_%H%M%S")

        out = re.sub(r"[[]time\[(.*?)\]\]", repl_time, text)
        out = out.replace("[date]", time.strftime("%Y-%m-%d"))
        out = out.replace("[datetime]", time.strftime("%Y-%m-%d_%H-%M-%S"))
        out = out.replace("[unix]", ctx.get("unix", str(int(time.time()))))
        out = out.replace("[guid]", ctx.get("guid", uuid.uuid4().hex))
        out = out.replace("[uuid]", ctx.get("uuid", uuid.uuid4().hex))
        out = out.replace("[model]", ctx.get("model", "unknown"))

        def repl_env(match):
            name = match.group(1) or ""
            return os.environ.get(name, "")

        out = re.sub(r"[[]env\[(.*?)\]\]", repl_env, out)
        return out

    def _render_date_subfolder(self, pattern: str, context: dict | None = None) -> str:
        expanded = self._expand_path_templates(pattern or "", context).strip()
        if not expanded:
            return ""
        try:
            return time.strftime(expanded)
        except Exception:
            return expanded

    def save(
        self,
        save_mode,
        images,
        file_path,
        date_subfolder_pattern,
        filename_prefix,
        filename_delimiter,
        number_padding,
        number_start,
        container,
        video_codec,
        fps,
        crf,
        preset,
        audio=None,
        loop_still_to_audio=True,
        show_progress=True,
        show_preview=True,
        preview_step=1,
        preview_max_frames=24,
        frames_dir="",
        frames_select="-2",
    ):
        if imageio_ffmpeg is None:
            msg = (
                "Save Video node requires 'imageio' and 'imageio-ffmpeg'. "
                "Install with: pip install imageio imageio-ffmpeg."
            )
            if _IMAGEIO_FFMPEG_ERROR:
                msg += f" Import error: {_IMAGEIO_FFMPEG_ERROR}"
            raise RuntimeError(msg)

        # --- Sanitise audio input ---
        # Some ComfyUI pipelines call np.array() on an AUDIO dict, which iterates
        # its keys and produces np.array(['waveform', 'sample_rate'], dtype='<U11').
        # The actual audio data is gone at that point; skip audio gracefully.
        if audio is not None:
            _audio_check = audio
            try:
                import torch as _torch
                if isinstance(_audio_check, _torch.Tensor):
                    _audio_check = None  # valid tensor, leave it alone
            except Exception:
                pass
            if _audio_check is not None and isinstance(_audio_check, np.ndarray) and np.issubdtype(_audio_check.dtype, np.character):
                print(
                    f"[SaveVideo] Warning: audio input was converted to a string array "
                    f"{_audio_check!r} by the pipeline (likely np.array() called on an "
                    f"AUDIO dict). Audio will be skipped. Check your upstream audio node."
                )
                audio = None

        # --- Path Setup & Validation ---
        context = self._build_template_context()
        expanded_file_path = self._expand_path_templates(file_path, context)
        expanded_prefix = self._expand_path_templates(filename_prefix, context)
        subfolder = self._render_date_subfolder(date_subfolder_pattern, context)

        # Determine the base directory from user input `file_path`
        user_path = Path(str(expanded_file_path or "")).expanduser()
        if user_path.is_absolute():
            base_dir = user_path
        else:
            base_output = self._base_output_dir()
            rel_parts = [p for p in user_path.parts if p and p != "."]
            if rel_parts and rel_parts[0].lower() in ("output", "outputs"):
                rel_parts = rel_parts[1:]
            rel_path = Path(*rel_parts) if rel_parts else Path()
            base_dir = base_output / rel_path
        
        # Add subfolder
        if subfolder:
            base_dir = base_dir / Path(subfolder)

        # Add directory part from prefix
        prefix_dir_part = os.path.dirname(expanded_prefix)
        if prefix_dir_part:
            base_dir = base_dir / Path(prefix_dir_part)

        # Now we have the final intended directory. Normalize and validate it.
        final_video_dir = self._normalize_path(base_dir)
        final_video_dir.mkdir(parents=True, exist_ok=True)

        # Use only the filename part of the prefix
        base_prefix = os.path.basename(expanded_prefix)

        # --- Get Frames & Codec Info ---
        frames = _normalize_frames(images)
        if not frames:
            raise ValueError("No frames provided.")

        mode = str(save_mode).strip().lower()
        save_video = mode in ("video", "video & frames")
        save_frames = mode in ("frames", "video & frames")
        if not save_video and not save_frames:
            save_video = True

        container_key = str(container).lower()
        codec_key = str(video_codec).lower()
        container_info = CONTAINER_OPTIONS.get(container_key)
        codec_info = VIDEO_CODEC_OPTIONS.get(codec_key)

        if save_video:
            if container_info is None: raise ValueError(f"Unsupported container '{container}'.")
            if codec_info is None: raise ValueError(f"Unsupported video codec '{video_codec}'.")
            if codec_key not in container_info["allowed_codecs"]:
                allowed = ", ".join(sorted(container_info["allowed_codecs"]))
                raise ValueError(f"Codec '{codec_key}' is not supported in '{container_key}'. Allowed: {allowed}.")
        else:
            container_info = {"extension": "bin", "audio_codec": None, "extra": []}
            codec_info = VIDEO_CODEC_OPTIONS["h264"]

        # --- Sequence Numbering ---
        seq = _next_seq_number(final_video_dir, base_prefix, filename_delimiter, number_padding)
        if number_start > 0:
            seq = max(seq, number_start)
        stem = f"{base_prefix}{filename_delimiter}{seq:0{number_padding}d}"

        # --- Main Save Logic ---
        video_path_str = ""
        frames_saved_path = None

        if save_video:
            extension = container_info.get("extension", "mp4")
            out_path = self._normalize_path(final_video_dir / f"{stem}.{extension}")

            # Final validation before creating the subprocess
            self._validate_path_is_allowed(out_path)

            tmp_wav = None
            audio_path = None
            acodec = container_info.get("audio_codec")
            if audio is not None and acodec:
                try:
                    tmp_wav = _audio_to_wav_path(audio)
                    audio_path = tmp_wav
                except (ValueError, TypeError) as exc:
                    print(f"[SaveVideo] Warning: could not decode audio input, saving without audio. Reason: {exc}")

            total_frames = len(frames)
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            if len(frames) == 1 and audio_path and loop_still_to_audio:
                dur = _probe_audio_duration(ffmpeg_exe, audio_path)
                if dur and dur > 0:
                    total_frames = int(math.ceil(dur * fps))
                    if show_progress: print(f"[SaveVideo] Looping single frame for {dur:.2f}s -> {total_frames} frames @ {fps} fps")
                elif show_progress: print("[SaveVideo] Could not read audio duration; using single frame only.")

            h, w, _ = frames[0].shape
            cmd = _build_cmd(ffmpeg_exe, w, h, fps, out_path, codec_info, container_info, acodec, audio_path, crf, preset)

            if show_progress:
                print(f"[SaveVideo] Output base: {final_video_dir.resolve()}")
                print(f"[SaveVideo] Container: {container_key} | Codec: {codec_key} -> {out_path}")

            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, text=False)
            try:
                if len(frames) == 1 and total_frames > 1:
                    buf = frames[0].tobytes()
                    step = max(1, total_frames // 50)
                    for i in range(total_frames):
                        proc.stdin.write(buf)
                        if show_progress and (i + 1) % step == 0: print(f"[SaveVideo] {i+1}/{total_frames} ({(100 * (i + 1) / total_frames):5.1f}%)")
                else:
                    total = len(frames)
                    step = max(1, total // 50)
                    for i, f in enumerate(frames, 1):
                        proc.stdin.write(f.tobytes())
                        if show_progress and (i % step == 0): print(f"[SaveVideo] {i}/{total} ({(100 * i / total):5.1f}%)")
            finally:
                if proc.stdin: proc.stdin.close()
                stderr_bytes = proc.stderr.read() if proc.stderr else b""
                proc.stderr.close() if proc.stderr else None
                ret = proc.wait()

            if tmp_wav: 
                try:
                    os.unlink(tmp_wav)
                except Exception:
                    pass


            out_exists = out_path.exists() and out_path.stat().st_size > 0
            if ret != 0 or not out_exists:
                stderr_text = stderr_bytes.decode("utf-8", errors="ignore")
                raise RuntimeError(f"FFmpeg failed (code {ret}).\nCommand: {' '.join(cmd)}\nStderr:\n{stderr_text.strip()}")

            video_path_str = str(out_path.resolve())
            if show_progress: print(f"[SaveVideo] Done: {video_path_str} ({out_path.stat().st_size} bytes)")

        # --- Frame Saving Logic ---
        def _parse_frame_selection(spec: str, total: int) -> List[int]:
            s = (spec or "").strip()
            if not s: return []
            if s == "-1": return list(range(total))
            if s == "-2": return [max(0, total - 1)] if total > 0 else []
            try:
                parts = [x.strip() for x in s.split(',') if x.strip()]
                idxs: List[int] = []
                for p in parts:
                    v = int(p)
                    if v < 0:
                        if v == -1: return list(range(total))
                        if v == -2 and total > 0: idxs.append(total - 1)
                    elif v < total:
                        idxs.append(v)
                return sorted(set(idxs))
            except Exception:
                return []

        frames_dir_effective = self._expand_path_templates(frames_dir or "", context).strip()
        if save_frames and not frames_dir_effective:
            frames_dir_effective = "frames"

        if save_frames and frames_dir_effective:
            idxs = _parse_frame_selection(frames_select, len(frames))
            if idxs:
                frames_path = Path(frames_dir_effective).expanduser()
                if frames_path.is_absolute():
                    target_folder = self._normalize_path(frames_path)
                else:
                    target_folder = self._normalize_path(final_video_dir / frames_path)
                
                target_folder.mkdir(parents=True, exist_ok=True)
                frames_saved_path = target_folder

                if show_progress: print(f"[SaveVideo] Saving frames -> {target_folder} | select='{frames_select}' -> {len(idxs)} frames")

                try: 
                    import imageio.v2 as imageio
                except Exception: 
                    imageio = None

                if imageio:
                    for idx in idxs:
                        a = frames[idx]
                        fname = f"{stem}_frame_{idx:04d}.png"
                        frame_path = target_folder / fname
                        self._validate_path_is_allowed(frame_path)
                        try: 
                            imageio.imwrite(str(frame_path), a)
                        except Exception: 
                            pass

        # --- UI Output --- 
        abs_path = video_path_str or (str(frames_saved_path.resolve()) if frames_saved_path else str(final_video_dir.resolve()))
        ui = {"text": abs_path}
        
        ui_seq_images = []
        if show_preview:
            try: 
                import imageio.v2 as imageio
            except Exception: 
                imageio = None

            if imageio and frames and preview_max_frames > 0:
                try:
                    from folder_paths import get_temp_directory
                    seq_root = Path(get_temp_directory())
                except Exception:
                    seq_root = final_video_dir

                step = max(1, int(preview_step))
                idxs = list(range(0, len(frames), step))[:preview_max_frames]
                if len(frames) == 1: idxs = [0]

                for i, idx in enumerate(idxs):
                    a = frames[idx]
                    fname = f"{stem}_seq_{i:04d}.png"
                    try:
                        imageio.imwrite(str(seq_root / fname), a)
                        ui_seq_images.append({"filename": fname, "subfolder": "", "type": "temp"})
                    except Exception:
                        continue
        
        if ui_seq_images:
            ui["images"] = ui_seq_images

        return {"ui": ui, "result": (images, abs_path,)}



