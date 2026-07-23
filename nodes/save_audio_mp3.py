# save_audio_multi.py  (SaveAudioMP3Dehypnotic – multi-format edition)
import io
import os
import time
import wave
import shutil
import struct
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


def _require_ffmpeg(format_name: str) -> str:
    ff = _find_ffmpeg()
    if not ff:
        raise RuntimeError(
            f"FFmpeg er påkrevd for å lagre {format_name.upper()}-filer, men ble ikke funnet.\n"
            "Installer ffmpeg, sett FFMPEG_PATH/FFMPEG_BINARY, "
            "eller installer 'imageio-ffmpeg' for auto-nedlasting."
        )
    return ff


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


def _to_int24_pcm_bytes(arr: "np.ndarray") -> bytes:
    """
    Konverter float/int array (T,C) til interleaved 24-bit PCM bytes (little-endian).
    """
    arr_f = arr.astype(np.float32, copy=False)
    arr_f = np.clip(arr_f, -1.0, 1.0)
    int32 = (arr_f * 8388607.0).astype(np.int32)  # 2^23 - 1
    # interleave channels: (T, C) -> flat
    flat = int32.flatten(order="C")
    # Pack each sample as 3 bytes LE
    out = bytearray(len(flat) * 3)
    for i, v in enumerate(flat):
        b = struct.pack("<i", int(v))  # 4-byte LE int32
        out[i * 3: i * 3 + 3] = b[:3]  # take lowest 3 bytes
    return bytes(out)


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
        raise RuntimeError("numpy er påkrevd for SaveAudio")

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
        raise TypeError("Unsupported audio input type for SaveAudio")

    # torch -> numpy
    if torch is not None and isinstance(arr, torch.Tensor):
        arr = arr.detach().cpu().numpy()

    arr = np.asarray(arr)
    if arr.size == 0:
        raise ValueError("Audio array is empty")

    # ---- Håndter batch: tillat 3D (B,*,*) og klem singleton-dim'er ----
    arr = np.squeeze(arr)

    if arr.ndim == 1:
        arr = arr[:, None]

    elif arr.ndim == 2:
        h, w = arr.shape
        if min(h, w) <= 8:
            if h <= w:
                if h == 1:
                    arr = arr.reshape(1, w).T
                else:
                    arr = arr.T
        else:
            if h < w:
                arr = arr.T

    elif arr.ndim == 3:
        shapes = list(arr.shape)
        axes = list(range(3))
        ch_axes = [ax for ax, n in enumerate(shapes) if n <= 8]
        t_axis = int(np.argmax(shapes))
        c_axis = None
        for ax in ch_axes:
            if ax != t_axis:
                c_axis = ax
                break
        if c_axis is None:
            c_axis = int(np.argmin(shapes))
            if c_axis == t_axis:
                c_axis = [ax for ax in axes if ax != t_axis][0]
        b_axis = [ax for ax in axes if ax not in (t_axis, c_axis)][0]
        B = shapes[b_axis]
        if B > 1:
            print(f"[SaveAudio] Advarsel: batch={B}, bruker batch[0].")
        slicer = [slice(None)] * 3
        slicer[b_axis] = 0
        arr = arr[tuple(slicer)]
        if arr.ndim != 2:
            arr = np.squeeze(arr)
        if arr.ndim != 2:
            raise ValueError(f"Kunne ikke redusere batch-array til 2D. shape={arr.shape}")
        h, w = arr.shape
        if min(h, w) <= 8:
            if h <= w:
                arr = arr.T
        else:
            if h < w:
                arr = arr.T

    else:
        raise ValueError(f"Audio-array må være 1D, 2D eller 3D (med batch). Fikk shape={arr.shape}")

    # Begrens til stereo (MP3/Opus krever det; WAV/FLAC kan ha flere men vi støtter ikke det)
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


# ========================= MP3 encoding =========================

def _ffmpeg_args_for_mp3_mode(bitrate_mode: str, quality: str) -> _t.List[str]:
    m = (bitrate_mode or "variable").lower()
    q = (quality or "high").lower()

    if m == "variable":
        qmap = {"high": 0, "medium": 4, "low": 7}
        return ["-c:a", "libmp3lame", "-q:a", str(qmap.get(q, 0))]
    if m == "constant":
        bmap = {"high": "320k", "medium": "192k", "low": "128k"}
        return ["-c:a", "libmp3lame", "-b:a", bmap.get(q, "320k"), "-compression_level", "2"]
    if m == "average":
        bmap = {"high": "256k", "medium": "192k", "low": "160k"}
        return ["-c:a", "libmp3lame", "-abr", "1", "-b:a", bmap.get(q, "192k")]
    return ["-c:a", "libmp3lame", "-q:a", "0"]


def _encode_mp3_ffmpeg_from_pcm(pcm: "np.ndarray", out_path: str,
                                bitrate_mode: str, quality: str,
                                sr: int, channels: int) -> None:
    ffmpeg = _require_ffmpeg("mp3")
    args = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-i", "pipe:0",
    ]
    args += _ffmpeg_args_for_mp3_mode(bitrate_mode, quality)
    args += ["-ar", str(int(sr)), "-ac", str(int(channels)), out_path]
    wav_bytes = _wav_bytes_from_pcm(pcm, sr)
    proc = subprocess.run(args, input=wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg MP3 feilet: {proc.stderr.decode('utf-8', errors='ignore')}")


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
        kbps = (bmap_cbr if mode == "constant" else bmap_abr).get(
            (quality or "high").lower(), 320 if mode == "constant" else 192
        )
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


# ========================= WAV encoding =========================

def _encode_wav(pcm: "np.ndarray", sr: int, out_path: str,
                sample_rate: str, bit_depth: str) -> None:
    """
    Lagre WAV-fil.
    - sample_rate: "source" | "16000" | "22050" | "44100" | "48000" | "96000"
    - bit_depth:   "16" | "24"
    16-bit + ingen resample -> pure Python (wave module).
    24-bit eller resample -> ffmpeg.
    """
    target_sr = sr if sample_rate == "source" else int(sample_rate)
    needs_resample = (target_sr != sr)
    use_24bit = (bit_depth == "24")

    if not use_24bit and not needs_resample:
        # Pure Python path – raskest
        channels = int(pcm.shape[1])
        with wave.open(out_path, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(2)
            wf.setframerate(target_sr)
            wf.writeframes(pcm.tobytes(order="C"))
        return

    # ffmpeg path (resample og/eller 24-bit)
    ffmpeg = _require_ffmpeg("wav")
    sample_fmt = "s24" if use_24bit else "s16"
    wav_bytes = _wav_bytes_from_pcm(pcm, sr)
    args = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-i", "pipe:0",
        "-ar", str(target_sr),
        "-sample_fmt", sample_fmt,
        "-c:a", "pcm_s24le" if use_24bit else "pcm_s16le",
        out_path,
    ]
    proc = subprocess.run(args, input=wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg WAV feilet: {proc.stderr.decode('utf-8', errors='ignore')}")


# ========================= FLAC encoding ========================

def _encode_flac(pcm: "np.ndarray", sr: int, out_path: str,
                 sample_rate: str, bit_depth: str,
                 compression_level: int) -> None:
    """
    Lagre FLAC-fil via ffmpeg.
    - compression_level: 0 (rask/stor) … 8 (sakte/liten). Default 5.
    """
    ffmpeg = _require_ffmpeg("flac")
    target_sr = sr if sample_rate == "source" else int(sample_rate)
    sample_fmt = "s24" if bit_depth == "24" else "s16"
    wav_bytes = _wav_bytes_from_pcm(pcm, sr)
    args = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-i", "pipe:0",
        "-ar", str(target_sr),
        "-sample_fmt", sample_fmt,
        "-compression_level", str(int(compression_level)),
        "-c:a", "flac",
        out_path,
    ]
    proc = subprocess.run(args, input=wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg FLAC feilet: {proc.stderr.decode('utf-8', errors='ignore')}")


# ========================= Opus encoding ========================

def _encode_opus(pcm: "np.ndarray", sr: int, out_path: str,
                 bitrate_kbps: int, application: str, vbr: str) -> None:
    """
    Lagre Opus-fil via ffmpeg (.opus container).
    - application: "audio" | "voip"
    - vbr: "on" | "off"
    """
    ffmpeg = _require_ffmpeg("opus")
    # libopus krever 48000 Hz; ffmpeg resampler automatisk
    wav_bytes = _wav_bytes_from_pcm(pcm, sr)
    vbr_flag = "on" if vbr.lower() == "on" else "off"
    args = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-i", "pipe:0",
        "-c:a", "libopus",
        "-b:a", f"{int(bitrate_kbps)}k",
        "-vbr", vbr_flag,
        "-application", application.lower(),
        "-ar", "48000",       # Opus native rate; ffmpeg resamples if needed
        out_path,
    ]
    proc = subprocess.run(args, input=wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg Opus feilet: {proc.stderr.decode('utf-8', errors='ignore')}")


# ========================= Format info strings ==================

def _build_format_info(fmt: str, **kwargs) -> str:
    """Return a human-readable summary of the chosen format settings."""
    fmt = fmt.lower()
    lines = []
    if fmt == "mp3":
        bm = kwargs.get("bitrate_mode", "variable")
        q  = kwargs.get("quality", "high")
        lines.append("Format: MP3 (MPEG Layer 3)")
        lines.append("")
        lines.append("Bitrate options (kbps)")
        lines.append("Variable (VBR, approx avg):")
        lines.append("  high:   ~245 kbps (V0)")
        lines.append("  medium: ~165 kbps (V4)")
        lines.append("  low:    ~100 kbps (V7)")
        lines.append("Constant (CBR):")
        lines.append("  high: 320 kbps  medium: 192 kbps  low: 128 kbps")
        lines.append("Average (ABR):")
        lines.append("  high: 256 kbps  medium: 192 kbps  low: 160 kbps")
        lines.append("")
        lines.append(f"Selected: mode={bm}, quality={q}")
    elif fmt == "wav":
        sr  = kwargs.get("sample_rate", "source")
        bd  = kwargs.get("bit_depth", "16")
        lines.append("Format: WAV (PCM, lossless)")
        lines.append(f"Sample rate: {sr}")
        lines.append(f"Bit depth:   {bd}-bit")
    elif fmt == "flac":
        sr   = kwargs.get("sample_rate", "source")
        bd   = kwargs.get("bit_depth", "16")
        comp = kwargs.get("compression_level", 5)
        lines.append("Format: FLAC (lossless, compressed)")
        lines.append(f"Sample rate:       {sr}")
        lines.append(f"Bit depth:         {bd}-bit")
        lines.append(f"Compression level: {comp}  (0=fast/large … 8=slow/small)")
    elif fmt == "opus":
        br   = kwargs.get("bitrate_kbps", 128)
        app  = kwargs.get("application", "audio")
        vbr  = kwargs.get("vbr", "on")
        lines.append("Format: Opus (lossy, high quality)")
        lines.append(f"Bitrate:     {br} kbps")
        lines.append(f"Application: {app}")
        lines.append(f"VBR:         {vbr}")
        lines.append("Note: encoded at 48000 Hz (Opus native)")
    else:
        lines.append(f"Format: {fmt}")
    return "\n".join(lines)


# ========================= Extension lookup =====================

_FORMAT_EXT = {
    "mp3":  ".mp3",
    "wav":  ".wav",
    "flac": ".flac",
    "opus": ".opus",
}


# --------------------------- ComfyUI node ---------------------------

class SaveAudioMP3:
    """
    Save Audio – støtter MP3, WAV, FLAC og Opus med
    formatspesifikke parametere og dynamisk JS-widget-synlighet.
    """

    DESCRIPTION = (
    "Saves to ComfyUI/output by default. To allow external locations, create a file named "
	" dehypnotic_save_allowed_paths.json containing for example: { \"allowed_roots\": [\"D:/AudioExports\", \"E:/TeamShare/Audio\"] }. "
	"Preferably place it in a global area like e.g. <ComfyUI>/user/config/. Read the Github repository at "
    "https://github.com/Dehypnotic/ComfyUI-Dehypnotic for more info."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio":                  ("AUDIO",),
                "file_path":              ("STRING",  {"default": "audio",    "multiline": False}),
                "date_subfolder_pattern": ("STRING",  {"default": "%Y-%m-%d", "multiline": False}),
                "filename_prefix":        ("STRING",  {"default": "ComfyUI",  "multiline": False}),

                # ── Autoplay ─────────────────────────────────────────────────
                "autoplay":               (["on", "off"], {"default": "on"}),

                # ── Format selector ──────────────────────────────────────────
                "format":                 (["mp3", "wav", "flac", "opus"], {"default": "mp3"}),
            },
            "optional": {
                # ── MP3 ──────────────────────────────────────────────────────
                "bitrate_mode":           (["variable", "constant", "average"], {"default": "variable"}),
                "quality":                (["low", "medium", "high"],           {"default": "high"}),

                # ── WAV / FLAC shared ────────────────────────────────────────
                "sample_rate":            (["source", "16000", "22050", "44100", "48000", "96000"],
                                           {"default": "source"}),
                "bit_depth":              (["16", "24"], {"default": "16"}),

                # ── FLAC ─────────────────────────────────────────────────────
                "flac_compression":       ("INT", {"default": 5, "min": 0, "max": 8, "step": 1}),

                # ── Opus ─────────────────────────────────────────────────────
                "opus_bitrate":           ("INT", {"default": 128, "min": 6, "max": 510, "step": 1}),
                "opus_application":       (["audio", "voip"], {"default": "audio"}),
                "opus_vbr":               (["on", "off"],     {"default": "on"}),
            }
        }

    RETURN_TYPES  = ("AUDIO", "STRING")
    RETURN_NAMES  = ("audio", "format_info")
    FUNCTION      = "save"
    CATEGORY      = "Dehypnotic/💾 IO"
    OUTPUT_NODE   = True

    # ──────────────────────── path helpers (unchanged) ───────────────────────

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

    def _comfy_root(self) -> str:
        base = self._base_output_dir()
        return os.path.abspath(os.path.join(base, os.pardir))

    def _load_allowed_roots(self) -> _t.List[str]:
        env_cfg = os.environ.get("DEHYPNOTIC_SAVE_ALLOWED_PATHS")
        candidates = []
        if env_cfg:
            candidates.append(env_cfg)
        comfy_root = self._comfy_root()
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
                            if norm:
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
            "unix":  str(int(time.time())),
            "guid":  uuid.uuid4().hex,
            "uuid":  uuid.uuid4().hex,
            "model": "unknown",
        }
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
        if not isinstance(text, str):
            return text
        ctx = context or {}

        def repl_time(m):
            fmt = m.group(1)
            try:
                return time.strftime(fmt)
            except Exception:
                return time.strftime("%Y%m%d_%H%M%S")

        out = re.sub(r"\[time\[(.*?)\]\]", repl_time, text)
        out = out.replace("[date]",     time.strftime("%Y-%m-%d"))
        out = out.replace("[datetime]", time.strftime("%Y-%m-%d_%H-%M-%S"))
        out = out.replace("[unix]",     ctx.get("unix",  str(int(time.time()))))
        out = out.replace("[guid]",     ctx.get("guid",  uuid.uuid4().hex))
        out = out.replace("[uuid]",     ctx.get("uuid",  uuid.uuid4().hex))
        out = out.replace("[model]",    ctx.get("model", "unknown"))

        def repl_env(m):
            name = m.group(1) or ""
            return os.environ.get(name, "")

        out = re.sub(r"\[env\[(.*?)\]\]", repl_env, out)
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

    def _next_filename(self, out_dir: str, prefix: str, ext: str) -> str:
        ts = time.strftime("%Y%m%d_%H%M%S")
        base = f"{prefix}_{ts}"
        fname = base + ext
        i = 1
        while os.path.exists(os.path.join(out_dir, fname)):
            i += 1
            fname = f"{base}_{i}{ext}"
        return fname

    # ──────────────────────── main save method ───────────────────────────────

    def save(
        self,
        audio,
        file_path,
        date_subfolder_pattern,
        filename_prefix,
        autoplay="on",
        format="mp3",
        # MP3
        bitrate_mode="variable",
        quality="high",
        # WAV / FLAC shared
        sample_rate="source",
        bit_depth="16",
        # FLAC
        flac_compression=5,
        # Opus
        opus_bitrate=128,
        opus_application="audio",
        opus_vbr="on",
        # hidden
        prompt=None,
        extra_pnginfo=None,
    ):
        pcm, sr = _normalize_audio_input(audio)
        fmt = (format or "mp3").lower()
        ext = _FORMAT_EXT.get(fmt, f".{fmt}")

        # Expand templates
        context = self._build_template_context(prompt, extra_pnginfo)
        file_path       = self._expand_path_templates(file_path, context)
        subfolder       = self._render_date_subfolder(date_subfolder_pattern, context)
        filename_prefix = self._expand_path_templates(filename_prefix, context)

        if subfolder:
            file_path = os.path.join(file_path, subfolder)

        prefix_dir   = os.path.dirname(filename_prefix)
        base_dir     = self._resolve_out_dir(file_path)
        final_dir    = os.path.join(base_dir, prefix_dir)
        final_dir_abs = os.path.abspath(final_dir)
        _ensure_dir(final_dir_abs)

        base_prefix = os.path.basename(filename_prefix)
        filename    = self._next_filename(final_dir_abs, base_prefix, ext)
        out_path    = os.path.join(final_dir_abs, filename)

        self._validate_path_is_allowed(out_path)

        # ── Encode to final destination ───────────────────────────────────────
        if fmt == "mp3":
            _encode_mp3(pcm, sr, out_path, bitrate_mode, quality)
        elif fmt == "wav":
            _encode_wav(pcm, sr, out_path, sample_rate, bit_depth)
        elif fmt == "flac":
            _encode_flac(pcm, sr, out_path, sample_rate, bit_depth, flac_compression)
        elif fmt == "opus":
            _encode_opus(pcm, sr, out_path, opus_bitrate, opus_application, opus_vbr)
        else:
            raise ValueError(f"Ukjent format: {fmt!r}. Støttede formater: mp3, wav, flac, opus.")

        # ── Temp preview copy (fixed filename, always overwritten) ────────────
        _PREVIEW_FILENAME = f"dehypnotic_preview_audio{ext}"
        try:
            import folder_paths as _fp  # type: ignore
            temp_dir = _fp.get_temp_directory()
        except Exception:
            temp_dir = os.path.join(os.getcwd(), "temp")
        _ensure_dir(temp_dir)
        temp_preview_path = os.path.join(temp_dir, _PREVIEW_FILENAME)
        try:
            if fmt == "mp3":
                _encode_mp3(pcm, sr, temp_preview_path, bitrate_mode, quality)
            elif fmt == "wav":
                _encode_wav(pcm, sr, temp_preview_path, sample_rate, bit_depth)
            elif fmt == "flac":
                _encode_flac(pcm, sr, temp_preview_path, sample_rate, bit_depth, flac_compression)
            elif fmt == "opus":
                _encode_opus(pcm, sr, temp_preview_path, opus_bitrate, opus_application, opus_vbr)
        except Exception as e:
            print(f"[SaveAudio] Advarsel: Kunne ikke skrive temp-forhåndsvisning: {e}")

        # ── Build format info string ──────────────────────────────────────────
        format_info = _build_format_info(
            fmt,
            bitrate_mode=bitrate_mode,
            quality=quality,
            sample_rate=sample_rate,
            bit_depth=bit_depth,
            compression_level=flac_compression,
            bitrate_kbps=opus_bitrate,
            application=opus_application,
            vbr=opus_vbr,
        )

        # ── UI output for JS player ───────────────────────────────────────────
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

        return {"ui": ui, "result": (audio, format_info)}
