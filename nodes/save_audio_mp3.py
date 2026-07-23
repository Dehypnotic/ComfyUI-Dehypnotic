# save_audio_mp3_enhanced.py
import io
import os
import time
import wave
import shutil
import subprocess
import typing as _t
import re
import uuid
import json

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None  # type: ignore

try:  # optional torch support
    import torch  # type: ignore
except Exception:  # pragma: no cover
    torch = None  # type: ignore

try:  # optional pure-Python MP3 encoder (fallback)
    import lameenc  # type: ignore
except Exception:  # pragma: no cover
    lameenc = None  # type: ignore

try:  # auto-download static ffmpeg if needed
    import imageio_ffmpeg  # type: ignore
except Exception:  # pragma: no cover
    imageio_ffmpeg = None  # type: ignore


# --------------------------- utils ---------------------------

def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _find_ffmpeg() -> str:
    """
    Finn en ffmpeg-binær. Prioriter:
    - env FFMPEG_BINARY/FFMPEG_PATH (kan peke på exe)
    - bundled bin i ./bin/
    - imageio-ffmpeg (auto-nedlastning)
    - system-ffmpeg i PATH
    """
    env = os.environ.get("FFMPEG_BINARY") or os.environ.get("FFMPEG_PATH")
    if env:
        p = shutil.which(env) if os.path.basename(env) == env else env
        if p and os.path.isfile(p):
            return p

    here = os.path.dirname(__file__)
    for rel in (os.path.join("bin", "ffmpeg.exe"), os.path.join("bin", "ffmpeg")):
        cand = os.path.join(here, rel)
        if os.path.isfile(cand):
            return cand

    if imageio_ffmpeg is not None:
        try:
            path = imageio_ffmpeg.get_ffmpeg_exe()
            if path and os.path.isfile(path):
                return path
        except Exception:
            pass

    for name in ("ffmpeg", "ffmpeg.exe"):
        p = shutil.which(name)
        if p:
            return p

    return ""


def _to_int16_pcm(arr: "np.ndarray") -> "np.ndarray":
    """
    Konverter til little-endian int16, forventer arr shape (T, C).
    Tillater float i [-1,1] eller integer-typer.
    """
    if np.issubdtype(arr.dtype, np.integer):
        if arr.dtype != np.int16:
            arr = arr.astype(np.float64) / max(1, float(np.iinfo(arr.dtype).max))
            arr = np.clip(arr, -1.0, 1.0)
            return (arr * 32767.0).astype("<i2")
        return arr.astype("<i2", copy=False)

    # float/other
    arr = arr.astype(np.float32, copy=False)
    arr = np.clip(arr, -1.0, 1.0)
    return (arr * 32767.0).astype("<i2")


def _normalize_audio_input(audio: _t.Any) -> _t.Tuple["np.ndarray", int]:
    """
    Normaliser ulike AUDIO-formater til (pcm_int16[T,C], sample_rate:int).

    Støtter:
    - (np.ndarray, sample_rate) eller (sample_rate, np.ndarray)
    - dict med keys: samples/waveform/audio + sample_rate/sr
    - ComfyUI-varianter med batch-dim: (B,C,T), (B,T,C) (vi tar B=0)
    - 1D: (T,) -> (T,1)
    """
    if np is None:
        raise RuntimeError("numpy er påkrevd for SaveAudioMP3")

    sr = None
    arr = None

    if isinstance(audio, (list, tuple)) and len(audio) == 2:
        a, b = audio
        if hasattr(a, "shape"):
            arr, sr = a, int(b)
        else:
            sr, arr = int(a), b

    elif isinstance(audio, dict):
        # ---- sample rate (tensor/np-scalar safe) ----
        sr_val = audio.get("sample_rate")
        if sr_val is None:
            sr_val = audio.get("sr")
        if sr_val is None:
            raise ValueError("Audio sample rate mangler i dict (sample_rate/sr).")

        if torch is not None and isinstance(sr_val, torch.Tensor):
            sr = int(sr_val.detach().cpu().item())
        elif hasattr(sr_val, "item"):
            sr = int(sr_val.item())
        else:
            sr = int(sr_val)

        # ---- samples/waveform/audio (uten truthiness) ----
        arr = audio.get("samples")
        if arr is None:
            arr = audio.get("waveform")
        if arr is None:
            arr = audio.get("audio")
        if arr is None:
            raise ValueError("Fant ingen av keys: samples/waveform/audio i dict-input.")

    elif hasattr(audio, "shape"):
        raise ValueError("Rå array uten sample rate. Bruk (array, sr) eller dict med sample_rate/sr.")
    else:
        raise TypeError("Unsupported audio input type for SaveAudioMP3")

    # torch -> numpy
    if torch is not None and isinstance(arr, torch.Tensor):
        arr = arr.detach().cpu().numpy()

    arr = np.asarray(arr)
    if arr.size == 0:
        raise ValueError("Audio array is empty")

    # ---- Håndter batch: tillat 3D (B,*,*) og klem singleton-dim'er ----
    # Klem bort dimensjoner med lengde 1 (typisk B=1)
    arr = np.squeeze(arr)

    if arr.ndim == 1:
        # (T,) -> (T,1)
        arr = arr[:, None]

    elif arr.ndim == 2:
        # (T,C) eller (C,T) -> gjør til (T,C)
        h, w = arr.shape
        # tolker minste dimensjon <= 8 som kanaler
        if min(h, w) <= 8:
            if h <= w:
                # (C,T) -> (T,C)
                if h == 1:
                    arr = arr.reshape(1, w).T
                else:
                    arr = arr.T
            # else: allerede (T,C)
        else:
            # antag at lengste er tid, minste er kanaler
            if h < w:
                arr = arr.T

    elif arr.ndim == 3:
        # Prøv å identifisere (B,C,T) eller (B,T,C) eller (C,T,B)/(T,C,B)
        # Finn én tidsakse (stor), én kanalsakse (<=8), og én batch-akse.
        shapes = list(arr.shape)
        axes = list(range(3))

        # Finn kandidat for kanaler (dim <= 8)
        ch_axes = [ax for ax, n in enumerate(shapes) if n <= 8]
        # Finn kandidat for tid (størst dim)
        t_axis = int(np.argmax(shapes))
        # Hvis flere små, velg den som ikke er t_axis som kanaler
        c_axis = None
        for ax in ch_axes:
            if ax != t_axis:
                c_axis = ax
                break

        # Batch-aksen er resten
        if c_axis is None:
            # Fallback: anta at den minste er kanaler, største er tid, midtre er batch
            c_axis = int(np.argmin(shapes))
            if c_axis == t_axis:
                # hvis min==max (uvanlig), ta en av de andre som kanaler
                c_axis = [ax for ax in axes if ax != t_axis][0]
        b_axis = [ax for ax in axes if ax not in (t_axis, c_axis)][0]

        B = shapes[b_axis]
        if B > 1:
            print("[SaveAudioMP3] Advarsel: batch={B}, bruker batch[0].")
        # Ta batch 0
        slicer = [slice(None)] * 3
        slicer[b_axis] = 0
        arr = arr[tuple(slicer)]

        # Nå 2D: bring til (T,C)
        # Flytt akser slik at (t_axis -> 0), (c_axis -> 1)
        # Finn nye posisjoner etter slicing
        # Etter slicing forsvant b_axis, så vi må recomputere
        # arr nå har to akser; finn hvilken som er tid (størst)
        if arr.ndim != 2:
            arr = np.squeeze(arr)
        if arr.ndim != 2:
            raise ValueError("Kunne ikke redusere batch-array til 2D. shape={arr.shape}")

        h, w = arr.shape
        if min(h, w) <= 8:
            if h <= w:
                arr = arr.T  # (C,T) -> (T,C)
        else:
            if h < w:
                arr = arr.T

    else:
        raise ValueError("Audio-array må være 1D, 2D eller 3D (med batch). Fikk shape={arr.shape}")

    # Begrens til mono/stereo for MP3
    if arr.shape[1] > 2:
        arr = arr[:, :2]

    pcm = _to_int16_pcm(arr)  # (T,C) int16 LE
    return pcm, int(sr)


def _wav_bytes_from_pcm(pcm: "np.ndarray", sr: int) -> bytes:
    """
    Lag en minimal WAV (int16) i minne. FFmpeg leser korrekt sr/kanaler fra header.
    """
    channels = int(pcm.shape[1])
    with io.BytesIO() as bio:
        with wave.open(bio, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(2)  # int16
            wf.setframerate(int(sr))
            wf.writeframes(pcm.tobytes(order="C"))
        return bio.getvalue()


def _ffmpeg_args_for_mode(bitrate_mode: str, quality: str) -> _t.List[str]:
    m = (bitrate_mode or "variable").lower()
    q = (quality or "high").lower()

    if m == "variable":
        # VBR 0(best)..9(worst)
        qmap = {"high": 0, "medium": 4, "low": 7}
        return ["-c:a", "libmp3lame", "-q:a", str(qmap.get(q, 0))]
    if m == "constant":
        bmap = {"high": "320k", "medium": "192k", "low": "128k"}
        return ["-c:a", "libmp3lame", "-b:a", bmap.get(q, "320k"), "-compression_level", "2"]
    if m == "average":
        bmap = {"high": "256k", "medium": "192k", "low": "160k"}
        return ["-c:a", "libmp3lame", "-abr", "1", "-b:a", bmap.get(q, "192k")]
    # default VBR high
    return ["-c:a", "libmp3lame", "-q:a", "0"]


def _encode_mp3_ffmpeg_from_pcm(pcm: "np.ndarray", out_path: str,
                                bitrate_mode: str, quality: str,
                                sr: int, channels: int) -> None:
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError(
            "FFmpeg ikke funnet. Installer ffmpeg, sett FFMPEG_PATH/FFMPEG_BINARY, "
            "eller installer 'imageio-ffmpeg' for auto-nedlasting."
        )

    # Pipe WAV med header -> FFmpeg autodetekterer -ar/-ac korrekt
    args = [
        ffmpeg,
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", "pipe:0",
    ]
    args += _ffmpeg_args_for_mode(bitrate_mode, quality)
    # behold samme sr/kanaler i output (kan sløyfes siden input er slik allerede)
    args += ["-ar", str(int(sr)), "-ac", str(int(channels)), out_path]

    wav_bytes = _wav_bytes_from_pcm(pcm, sr)
    proc = subprocess.run(args, input=wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg feilet: {proc.stderr.decode('utf-8', errors='ignore')}")


def _encode_mp3_lameenc(pcm: "np.ndarray", sr: int, out_path: str,
                        bitrate_mode: str, quality: str) -> None:
    if lameenc is None:
        raise RuntimeError("lameenc er ikke tilgjengelig")

    channels = int(pcm.shape[1])
    if channels > 2:
        pcm = pcm[:, :2]
        channels = 2

    enc = lameenc.Encoder()
    if hasattr(enc, "set_in_sample_rate"):
        enc.set_in_sample_rate(int(sr))
    if hasattr(enc, "set_out_sample_rate"):
        try:
            enc.set_out_sample_rate(int(sr))
        except Exception:
            pass
    if hasattr(enc, "set_channels"):
        enc.set_channels(int(channels))

    q_map = {"high": 2, "medium": 4, "low": 7}
    q_val = q_map.get((quality or "high").lower(), 2)

    mode = (bitrate_mode or "variable").lower()
    if mode == "variable":
        if hasattr(enc, "set_vbr_quality"):
            try:
                if hasattr(enc, "set_vbr_mode") and hasattr(lameenc, "VBRMode"):
                    enc.set_vbr_mode(lameenc.VBRMode.VBR_DEFAULT)
                enc.set_vbr_quality(int(q_val))
            except Exception:
                if hasattr(enc, "set_quality"):
                    enc.set_quality(int(q_val))
        else:
            if hasattr(enc, "set_quality"):
                enc.set_quality(int(q_val))
    elif mode in ("constant", "average"):
        bmap_cbr = {"high": 320, "medium": 192, "low": 128}
        bmap_abr = {"high": 256, "medium": 192, "low": 160}
        kbps = bmap_cbr.get((quality or "high").lower(), 320) if mode == "constant" else bmap_abr.get((quality or "high").lower(), 192)
        if hasattr(enc, "set_bit_rate"):
            enc.set_bit_rate(int(kbps))
        if mode == "average" and hasattr(enc, "set_abr"):
            try:
                enc.set_abr(True)
            except Exception:
                pass
        if hasattr(enc, "set_quality"):
            enc.set_quality(int(q_val))
    else:
        if hasattr(enc, "set_quality"):
            enc.set_quality(int(q_val))

    mp3 = enc.encode(pcm.astype("<i2", copy=False).tobytes(order="C"))
    mp3 += enc.flush()
    with open(out_path, "wb") as f:
        f.write(mp3)


def _encode_mp3(pcm: "np.ndarray", sr: int, out_path: str,
                bitrate_mode: str, quality: str) -> None:
    ff = _find_ffmpeg()
    if ff:
        _encode_mp3_ffmpeg_from_pcm(pcm, out_path, bitrate_mode, quality, sr, int(pcm.shape[1]))
        return
    if lameenc is not None:
        _encode_mp3_lameenc(pcm, sr, out_path, bitrate_mode, quality)
        return
    raise RuntimeError("Ingen MP3-backend funnet. Installer 'imageio-ffmpeg' eller 'lameenc'.")


# --------------------------- ComfyUI node ---------------------------

class SaveAudioMP3:
    """
    Save Audio (MP3) – robust sr/kanal-håndtering, VBR/CBR/ABR, og auto-FFmpeg.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
                "file_path": ("STRING", {"default": "audio", "multiline": False}),
                "date_subfolder_pattern": ("STRING", {"default": "%Y-%m-%d", "multiline": False}),
                "filename_prefix": ("STRING", {"default": "ComfyUI", "multiline": False}),
                "bitrate_mode": (["variable", "constant", "average"], {"default": "variable"}),
                "quality": (["low", "medium", "high"], {"default": "high"}),
            }
        }

    RETURN_TYPES = ("AUDIO", "STRING")
    RETURN_NAMES = ("audio", "bitrate_info")
    FUNCTION = "save"
    CATEGORY = "Dehypnotic/💾 IO"
    OUTPUT_NODE = True

    def _base_output_dir(self) -> str:
        try:
            import folder_paths  # type: ignore
            return folder_paths.get_output_directory()
        except Exception:
            return os.path.join(os.getcwd(), "output")

    def _resolve_out_dir(self, file_path: str) -> str:
        if os.path.isabs(file_path):
            return file_path
        return os.path.join(self._base_output_dir(), file_path)

    # -------- Path whitelist helpers --------
    def _comfy_root(self) -> str:
        # Parent of output directory is ComfyUI root in typical setups
        base = self._base_output_dir()
        return os.path.abspath(os.path.join(base, os.pardir))

    def _load_allowed_roots(self) -> _t.List[str]:
        """Load external save roots from a shared JSON file or env var."""
        env_cfg = os.environ.get("DEHYPNOTIC_SAVE_ALLOWED_PATHS")
        candidates = []
        if env_cfg:
            candidates.append(env_cfg)

        comfy_root = self._comfy_root()
        # Search in user/config folders first, then comfy root, then node folder
        global_names = (
            "dehypnotic_save_allowed_paths.json",
            "allowed_paths.json",
        )
        for name in global_names:
            candidates.append(os.path.join(comfy_root, "user", "config", name))
            candidates.append(os.path.join(comfy_root, "user", name))
            candidates.append(os.path.join(comfy_root, "config", name))
            candidates.append(os.path.join(comfy_root, name))

        here = os.path.dirname(__file__)
        for name in global_names:
            candidates.append(os.path.join(here, name))

        for path in candidates:
            try:
                if path and os.path.isfile(path):
                    with open(path, "r", encoding="utf-8") as f:
                        raw = f.read()
                        filtered = "\n".join(
                            line for line in raw.splitlines() if not line.lstrip().startswith("#")
                        )
                        data = json.loads(filtered)
                        roots = data.get("allowed_roots") if isinstance(data, dict) else []
                        if not roots and isinstance(data, dict):
                            roots = data.get("roots") or []
                        if isinstance(roots, list):
                            norm = [os.path.abspath(os.path.expandvars(r)) for r in roots if isinstance(r, str)]
                            if len(norm) > 0:
                                return norm
            except Exception:
                pass
        return []

    def _same_drive(self, a: str, b: str) -> bool:
        da = os.path.splitdrive(os.path.abspath(a))[0].lower()
        db = os.path.splitdrive(os.path.abspath(b))[0].lower()
        return da == db

    def _is_under_dir(self, path: str, base: str) -> bool:
        try:
            ap = os.path.abspath(path)
            bb = os.path.abspath(base)
            if not self._same_drive(ap, bb):
                return False
            return os.path.commonpath([ap, bb]) == bb
        except Exception:
            return False

    def _validate_path_is_allowed(self, path_to_validate: str) -> None:
        """Raise PermissionError if path_to_validate is not in ComfyUI output or whitelisted."""
        base_output = self._base_output_dir()
        if self._is_under_dir(path_to_validate, base_output):
            return

        allowed_roots = self._load_allowed_roots()
        for root in allowed_roots:
            if self._is_under_dir(path_to_validate, root):
                return

        msg = (
            "External save path is not allowed.\n"
            "This node only writes inside ComfyUI's output directory, "
            "unless the path is whitelisted offline.\n\n"
            "To allow external locations, create/edit a JSON file named "
            "'dehypnotic_save_allowed_paths.json' in your ComfyUI root (or user/config) folder "
            "with content like:\n\n"
            '{\n  "allowed_roots": ["D:/AudioExports", "E:/TeamShare/Audio"]\n}\n\n'
            "You can also set the DEHYPNOTIC_SAVE_ALLOWED_PATHS environment variable to point to this file."
        )
        raise PermissionError(msg)

    def _build_template_context(self, prompt, extra_pnginfo) -> dict:
        ctx = {
            "unix": str(int(time.time())),
            "guid": uuid.uuid4().hex,
            "uuid": uuid.uuid4().hex,
            "model": "unknown",
        }
        # Try to glean a model name from extra_pnginfo or prompt if present
        try:
            if isinstance(extra_pnginfo, dict):
                for k in ("model", "checkpoint", "ckpt_name", "model_name"):
                    v = extra_pnginfo.get(k)
                    if isinstance(v, str) and v:
                        ctx["model"] = v
                        break
        except Exception:
            pass
        return ctx

    def _expand_path_templates(self, text: str, context: dict | None = None) -> str:
        """
        Supports simple placeholders inside paths/prefixes:
        - [time(%Y-%m-%d)] -> formatted current time via strftime
        - [date] -> YYYY-MM-DD
        - [datetime] -> YYYY-MM-DD_HH-MM-SS
        - [unix] -> epoch seconds
        - [guid] / [uuid] -> random UUID4 hex
        - [model] -> model name if detectable, else 'unknown'
        - [env(NAME)] -> environment variable NAME
        Unknown or invalid formats fall back gracefully.
        """
        if not isinstance(text, str):
            return text

        ctx = context or {}

        def repl_time(m):
            fmt = m.group(1)
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

        def repl_env(m):
            name = m.group(1) or ""
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

    def _try_rel_to_base(self, path: str) -> _t.Optional[str]:
        base = self._base_output_dir()
        try:
            rel = os.path.relpath(path, base)
            if rel.startswith(".."):
                return None
            return rel.replace("\\", "/")
        except Exception:
            return None

    def _next_filename(self, out_dir: str, prefix: str) -> str:
        ts = time.strftime("%Y%m%d_%H%M%S")
        base = f"{prefix}_{ts}"
        fname = base + ".mp3"
        i = 1
        while os.path.exists(os.path.join(out_dir, fname)):
            i += 1
            fname = f"{base}_{i}.mp3"
        return fname

    def save(self, audio, file_path, date_subfolder_pattern, filename_prefix, bitrate_mode, quality,
             prompt=None, extra_pnginfo=None):
        pcm, sr = _normalize_audio_input(audio)

        # Expand templates like [time(%Y-%m-%d)] plus [unix], [guid], [model], [env(NAME)]
        context = self._build_template_context(prompt, extra_pnginfo)
        file_path = self._expand_path_templates(file_path, context)
        subfolder = self._render_date_subfolder(date_subfolder_pattern, context)
        filename_prefix = self._expand_path_templates(filename_prefix, context)

        # Combine file_path and subfolder
        if subfolder:
            file_path = os.path.join(file_path, subfolder)

        # The user-provided path combined with the prefix's directory part
        # is the intended final directory.
        prefix_dir = os.path.dirname(filename_prefix)
        base_dir = self._resolve_out_dir(file_path)
        final_dir = os.path.join(base_dir, prefix_dir)

        # Resolve the final directory to its absolute, canonical path.
        # This processes any '..' parts from both file_path and filename_prefix.
        final_dir_abs = os.path.abspath(final_dir)
        _ensure_dir(final_dir_abs)

        # Use only the filename part of the prefix for the actual filename.
        base_prefix = os.path.basename(filename_prefix)
        filename = self._next_filename(final_dir_abs, base_prefix)
        out_path = os.path.join(final_dir_abs, filename)

        # Enforce ComfyUI Manager guideline: validate the *actual* final path.
        self._validate_path_is_allowed(out_path)

        # Encode til valgt sted
        _encode_mp3(pcm, sr, out_path, bitrate_mode, quality)

        # --- Lagre temp-kopi for JS-forhåndsvisning ---
        try:
            import folder_paths as _fp  # type: ignore
            temp_dir = _fp.get_temp_directory()
        except Exception:
            temp_dir = os.path.join(os.getcwd(), "temp")
        _ensure_dir(temp_dir)

        _PREVIEW_FILENAME = "dehypnotic_preview_mp3.mp3"
        temp_preview_path = os.path.join(temp_dir, _PREVIEW_FILENAME)
        try:
            _encode_mp3(pcm, sr, temp_preview_path, bitrate_mode, quality)
        except Exception as e:
            print(f"[SaveAudioMP3] Advarsel: Kunne ikke skrive temp-forhåndsvisning: {e}")

        # Bygg infosnutt om bitrate-valgene (9 kombinasjoner)
        info_lines = []
        info_lines.append("Bitrate options (kbps)")
        info_lines.append("")
        info_lines.append("Variable (VBR, approx avg):")
        info_lines.append("- high: ~245 kbps (V0)")
        info_lines.append("- medium: ~165 kbps (V4)")
        info_lines.append("- low: ~100 kbps (V7)")
        info_lines.append("")
        info_lines.append("Constant (CBR):")
        info_lines.append("- high: 320 kbps")
        info_lines.append("- medium: 192 kbps")
        info_lines.append("- low: 128 kbps")
        info_lines.append("")
        info_lines.append("Average (ABR):")
        info_lines.append("- high: 256 kbps")
        info_lines.append("- medium: 192 kbps")
        info_lines.append("- low: 160 kbps")
        info_lines.append("")
        # mark the active selection
        info_lines.append(f"Selected: mode={bitrate_mode}, quality={quality}")
        bitrate_info = "\n".join(info_lines)

        # Bygg ui-output for JS-spilleren
        ui = {
            "audio_preview": [
                {
                    "filename": _PREVIEW_FILENAME,
                    "subfolder": "",
                    "type": "temp",
                }
            ],
            "saved_path": [out_path],
        }

        # Returner AUDIO og tekst for visningsnode
        return {"ui": ui, "result": (audio, bitrate_info)}

