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

def _build_video_only_cmd(ffmpeg_exe: str, w: int, h: int, fps: int,
                          out_path: Path, codec_info: dict, container_info: dict,
                          crf: int, preset: str) -> list:
    cmd = [
        ffmpeg_exe, "-y", "-hide_banner", "-loglevel", "error",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps),
        "-i", "-"
    ]
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
    cmd += ["-an"]
    for extra in container_info.get("extra", []):
        cmd += extra
    cmd += [str(out_path)]
    return cmd


# --------------------------- node ---------------------------

class SaveVideo:
    """
    Save Video (simple) — minimal kontroller, audio som direkte input.
    """
    DESCRIPTION = (
    "Saves to ComfyUI/output by default. To allow external locations, create a file named "
	" dehypnotic_save_allowed_paths.json containing for example: { \"allowed_roots\": [\"D:/AudioExports\", \"E:/TeamShare/Audio\"] }. "
	"Preferably place it in a global area like e.g. <ComfyUI>/user/config/. Read the Github repository for more info. I have moved the "
	"more infrequently adjusted settings number_paddings, number_start, loop_still_to_audio, and show_progress to properties for the sake "
    "of compactness. You find the properties by right-clicking the node."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "Frame input. Batch data supported."}),
                "file_path": ("STRING", {"default": "output/video", "tooltip": "Folder where the video is saved."}),
                "date_subfolder_pattern": ("STRING", {"default": "%Y-%m-%d", "tooltip": "Optional strftime pattern or placeholders for subfolders."}),
                "filename_prefix": ("STRING", {"default": "VID", "tooltip": "Filename prefix, e.g. VID_0001.mp4."}),
                "filename_delimiter": ("STRING", {"default": "_", "tooltip": "Delimiter between prefix and sequence number."}),
                "number_padding": ("INT", {"default": 4, "min": 1, "max": 10, "tooltip": "Digits in the sequence number (0001, 0002, ...).", "display": "property"}),
                "number_start": ("INT", {"default": 1, "min": 0, "max": 1_000_000, "tooltip": "Starting value for the sequence number.", "display": "property"}),
                "container": (tuple(CONTAINER_OPTIONS.keys()), {"default": "mp4", "tooltip": "Container format (mp4, mkv, webm, mov)."}),
                "video_codec": (tuple(VIDEO_CODEC_OPTIONS.keys()), {"default": "h264", "tooltip": "Video codec to use for encoding."}),
                "fps": ("INT", {"default": 24, "min": 1, "max": 240, "tooltip": "Frames per second (CFR)."}),
                "crf": ("INT", {"default": 23, "min": 0, "max": 51, "tooltip": "Quality (lower = better, larger files). Typical 18-28 for H.264."}),
                "preset": (VALID_PRESETS, {"default": "fast", "tooltip": "Encoder speed versus quality (ultrafast ... veryslow)."}),
            },
            "optional": {
                "audio": ("AUDIO", {"tooltip": "Optional audio track. Mono/stereo supported."}),
                "loop_still_to_audio": ("BOOLEAN", {"default": True, "tooltip": "If only one frame plus audio, loop the frame to match audio length.", "display": "property"}),
                "show_progress": ("BOOLEAN", {"default": True, "tooltip": "Write progress information to the console.", "display": "property"}),
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
            "'dehypnotic_save_allowed_paths.json' in your ComfyUI root (or user/config) folder "
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
    ):
        if imageio_ffmpeg is None:
            msg = (
                "Save Video node requires 'imageio' and 'imageio-ffmpeg'. "
                "Install with: pip install imageio imageio-ffmpeg."
            )
            if _IMAGEIO_FFMPEG_ERROR:
                msg += f" Import error: {_IMAGEIO_FFMPEG_ERROR}"
            raise RuntimeError(msg)

        # --- Path Setup & Validation ---
        context = self._build_template_context()
        expanded_file_path = self._expand_path_templates(file_path, context)
        expanded_prefix = self._expand_path_templates(filename_prefix, context)
        subfolder = self._render_date_subfolder(date_subfolder_pattern, context)

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

        if subfolder:
            base_dir = base_dir / Path(subfolder)

        prefix_dir_part = os.path.dirname(expanded_prefix)
        if prefix_dir_part:
            base_dir = base_dir / Path(prefix_dir_part)

        final_video_dir = self._normalize_path(base_dir)
        final_video_dir.mkdir(parents=True, exist_ok=True)

        base_prefix = os.path.basename(expanded_prefix)

        # --- Get Frames & Codec Info ---
        frames = _normalize_frames(images)
        if not frames:
            raise ValueError("No frames provided.")

        container_key = str(container).lower()
        codec_key = str(video_codec).lower()
        container_info = CONTAINER_OPTIONS.get(container_key)
        codec_info = VIDEO_CODEC_OPTIONS.get(codec_key)

        if container_info is None: raise ValueError(f"Unsupported container '{container}'.")
        if codec_info is None: raise ValueError(f"Unsupported video codec '{video_codec}'.")
        if codec_key not in container_info["allowed_codecs"]:
            allowed = ", ".join(sorted(container_info["allowed_codecs"]))
            raise ValueError(f"Codec '{codec_key}' is not supported in '{container_key}'. Allowed: {allowed}.")

        # --- Sequence Numbering ---
        seq = _next_seq_number(final_video_dir, base_prefix, filename_delimiter, number_padding)
        if number_start > 0:
            seq = max(seq, number_start)
        stem = f"{base_prefix}{filename_delimiter}{seq:0{number_padding}d}"

        extension = container_info.get("extension", "mp4")
        out_path = self._normalize_path(final_video_dir / f"{stem}.{extension}")
        self._validate_path_is_allowed(out_path)

        # --- Audio Extraction (VHS method) ---
        audio_bytes = None
        sample_rate = 44100
        channels = 2
        acodec = container_info.get("audio_codec")

        if audio is not None and acodec:
            try:
                if isinstance(audio, dict) and "waveform" in audio:
                    wf_data = audio["waveform"]
                    sr_data = audio.get("sample_rate", 44100)
                    if hasattr(sr_data, "item"):
                        sample_rate = int(sr_data.item())
                    else:
                        sample_rate = int(sr_data)

                    import torch
                    if isinstance(wf_data, torch.Tensor):
                        wf = wf_data.detach().cpu().to(torch.float32)
                        if wf.ndim == 3:
                            wf = wf.squeeze(0)  # [channels, samples]
                        channels = int(wf.shape[0])
                        audio_bytes = wf.transpose(0, 1).numpy().tobytes()
                    elif isinstance(wf_data, np.ndarray):
                        a = np.squeeze(wf_data)
                        if a.ndim == 2 and a.shape[0] <= 8:
                            a = a.T
                        channels = int(a.shape[1])
                        audio_bytes = a.astype(np.float32).tobytes()
                else:
                    from .save_audio_mp3 import _normalize_audio_input
                    pcm, sr = _normalize_audio_input(audio)
                    sample_rate = int(sr)
                    channels = int(pcm.shape[1])
                    # pcm is int16 -> convert to float32 bytes for VHS f32le pipe
                    a_float = pcm.astype(np.float32) / 32767.0
                    audio_bytes = a_float.tobytes()

                if show_progress and audio_bytes:
                    dur_s = (len(audio_bytes) / (4 * channels)) / sample_rate if sample_rate else 0
                    print(f"[SaveVideo] Audio extracted: {channels}ch @ {sample_rate}Hz (~{dur_s:.2f}s, {len(audio_bytes)} bytes)")
            except Exception as exc:
                print(f"[SaveVideo] ERROR extracting audio: {exc}")
                import traceback
                traceback.print_exc()

        total_frames = len(frames)
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

        if len(frames) == 1 and audio_bytes is not None and loop_still_to_audio:
            dur = (len(audio_bytes) / (4 * channels)) / sample_rate if sample_rate else 0
            if dur > 0:
                total_frames = int(math.ceil(dur * fps))
                if show_progress: print(f"[SaveVideo] Looping single frame for {dur:.2f}s -> {total_frames} frames @ {fps} fps")

        h, w, _ = frames[0].shape

        # Pass 1: Encode Video Only (VHS approach)
        if audio_bytes is not None:
            tmp_video = tempfile.NamedTemporaryFile(
                delete=False, suffix=f".{container_info.get('extension', 'mp4')}")
            tmp_video.close()
            video_target = Path(tmp_video.name)
        else:
            video_target = out_path

        cmd1 = _build_video_only_cmd(ffmpeg_exe, w, h, fps, video_target,
                                     codec_info, container_info, crf, preset)
        if show_progress:
            print(f"[SaveVideo] Output: {out_path}")
            print(f"[SaveVideo] Pass 1 (video): {' '.join(cmd1)}")

        proc = subprocess.Popen(cmd1, stdin=subprocess.PIPE, stderr=subprocess.PIPE, text=False)
        try:
            if len(frames) == 1 and total_frames > 1:
                buf = frames[0].tobytes()
                step = max(1, total_frames // 50)
                for i in range(total_frames):
                    proc.stdin.write(buf)
                    if show_progress and (i + 1) % step == 0:
                        print(f"[SaveVideo] {i+1}/{total_frames} ({(100*(i+1)/total_frames):5.1f}%)")
            else:
                total = len(frames)
                step = max(1, total // 50)
                for i, f in enumerate(frames, 1):
                    proc.stdin.write(f.tobytes())
                    if show_progress and (i % step == 0):
                        print(f"[SaveVideo] {i}/{total} ({(100*i/total):5.1f}%)")
        finally:
            if proc.stdin: proc.stdin.close()
            stderr1 = proc.stderr.read() if proc.stderr else b""
            if proc.stderr: proc.stderr.close()
            ret1 = proc.wait()

        if ret1 != 0 or not video_target.exists():
            stderr_text = stderr1.decode("utf-8", errors="ignore")
            if audio_bytes is not None:
                try: os.unlink(video_target)
                except Exception: pass
            raise RuntimeError(f"FFmpeg Pass 1 failed (code {ret1}).\nCmd: {' '.join(cmd1)}\nStderr:\n{stderr_text.strip()}")

        # Pass 2: Mux Audio (VHS approach)
        if audio_bytes is not None:
            min_audio_dur = total_frames / fps + 1
            cmd2 = [
                ffmpeg_exe, "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(video_target),
                "-ar", str(sample_rate),
                "-ac", str(channels),
                "-f", "f32le",
                "-i", "-",
                "-c:v", "copy",
                "-c:a", acodec,
                "-af", f"apad=whole_dur={min_audio_dur:.3f}",
                "-shortest",
                str(out_path)
            ]
            if show_progress:
                print(f"[SaveVideo] Pass 2 (audio mux): {' '.join(cmd2)}")

            try:
                res = subprocess.run(cmd2, input=audio_bytes, capture_output=True, check=True)
                if show_progress and res.stderr:
                    print(f"[SaveVideo] Pass 2 stderr: {res.stderr.decode('utf-8', errors='ignore').strip()}")
            except subprocess.CalledProcessError as exc:
                err = exc.stderr.decode("utf-8", errors="ignore")
                raise RuntimeError(f"FFmpeg Pass 2 (audio mux) failed.\nCmd: {' '.join(cmd2)}\nStderr:\n{err.strip()}")
            finally:
                try: os.unlink(video_target)
                except Exception: pass

        out_exists = out_path.exists() and out_path.stat().st_size > 0
        if not out_exists:
            raise RuntimeError(f"Output file missing or empty: {out_path}")

        video_path_str = str(out_path.resolve())
        if show_progress: print(f"[SaveVideo] Done: {video_path_str} ({out_path.stat().st_size} bytes)")

        # --- UI Output ---
        abs_path = video_path_str or str(final_video_dir.resolve())

        # Build preview info for the JS frontend (same structure as VHS_VideoCombine)
        extension = out_path.suffix.lstrip(".")
        try:
            base_output = self._base_output_dir()
            rel = out_path.resolve().relative_to(base_output.resolve())
            preview_subfolder = str(rel.parent).replace("\\", "/")
            if preview_subfolder == ".":
                preview_subfolder = ""
            preview_filename = out_path.name
            preview_type = "output"
        except ValueError:
            preview_subfolder = ""
            preview_filename = out_path.name
            preview_type = "output"

        ui = {
            "text": abs_path,
            "video_preview": [{
                "filename": preview_filename,
                "subfolder": preview_subfolder,
                "type": preview_type,
                "format": f"video/{extension}",
            }],
        }

        return {"ui": ui, "result": (images, abs_path,)}
