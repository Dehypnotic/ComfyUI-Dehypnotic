import os
import math
import json
import logging
import numpy as np
import torch

try:
    import folder_paths
except ImportError:
    folder_paths = None

try:
    import scipy.signal as signal
except ImportError:
    signal = None

try:
    from server import PromptServer
except ImportError:
    PromptServer = None

logger = logging.getLogger(__name__)


def get_user_presets_dir() -> str:
    if folder_paths is not None and hasattr(folder_paths, "get_user_directory"):
        user_dir = os.path.abspath(folder_paths.get_user_directory())
    else:
        user_dir = os.path.abspath(os.path.expanduser("~/ComfyUI/user"))
    target_dir = os.path.join(user_dir, "Dehypnotic", "sonic_color")
    os.makedirs(target_dir, exist_ok=True)
    return target_dir


def load_preset_file(preset_name: str) -> dict | None:
    if preset_name in ["New Preset", "Custom"]:
        return None
    target_dir = get_user_presets_dir()
    filepath = os.path.join(target_dir, f"{preset_name}.json")
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load preset {preset_name}: {e}")
    return None


class SonicColor:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "params": ("STRING", {"default": "{}", "multiline": True}),
            },
            "optional": {
                "audio": ("AUDIO",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "generate_noise"
    CATEGORY = "Dehypnotic/Audio"
    OUTPUT_NODE = True

    def _biquad_filter(self, x: np.ndarray, f0: float, fs: float, Q: float, filter_type: str, db_gain: float = 0.0) -> np.ndarray:
        if signal is None:
            return x

        w0 = 2.0 * math.pi * f0 / fs
        cos_w0 = math.cos(w0)
        sin_w0 = math.sin(w0)
        alpha = sin_w0 / (2.0 * max(Q, 0.001))

        if filter_type == "lowpass":
            b0 = (1.0 - cos_w0) / 2.0
            b1 = 1.0 - cos_w0
            b2 = (1.0 - cos_w0) / 2.0
            a0 = 1.0 + alpha
            a1 = -2.0 * cos_w0
            a2 = 1.0 - alpha

        elif filter_type == "highpass":
            b0 = (1.0 + cos_w0) / 2.0
            b1 = -(1.0 + cos_w0)
            b2 = (1.0 + cos_w0) / 2.0
            a0 = 1.0 + alpha
            a1 = -2.0 * cos_w0
            a2 = 1.0 - alpha

        elif filter_type == "bandpass":
            b0 = sin_w0 / 2.0
            b1 = 0.0
            b2 = -sin_w0 / 2.0
            a0 = 1.0 + alpha
            a1 = -2.0 * cos_w0
            a2 = 1.0 - alpha

        elif filter_type == "notch":
            b0 = 1.0
            b1 = -2.0 * cos_w0
            b2 = 1.0
            a0 = 1.0 + alpha
            a1 = -2.0 * cos_w0
            a2 = 1.0 - alpha

        elif filter_type == "peaking":
            A = 10.0 ** (db_gain / 40.0)
            b0 = 1.0 + alpha * A
            b1 = -2.0 * cos_w0
            b2 = 1.0 - alpha * A
            a0 = 1.0 + alpha / A
            a1 = -2.0 * cos_w0
            a2 = 1.0 - alpha / A

        elif filter_type == "lowshelf":
            A = 10.0 ** (db_gain / 40.0)
            beta = 2.0 * math.sqrt(A) * alpha
            b0 = A * ((A + 1.0) - (A - 1.0) * cos_w0 + beta)
            b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cos_w0)
            b2 = A * ((A + 1.0) - (A - 1.0) * cos_w0 - beta)
            a0 = (A + 1.0) + (A - 1.0) * cos_w0 + beta
            a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cos_w0)
            a2 = (A + 1.0) - (A - 1.0) * cos_w0 - beta

        elif filter_type == "highshelf":
            A = 10.0 ** (db_gain / 40.0)
            beta = 2.0 * math.sqrt(A) * alpha
            b0 = A * ((A + 1.0) + (A - 1.0) * cos_w0 + beta)
            b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cos_w0)
            b2 = A * ((A + 1.0) - (A - 1.0) * cos_w0 - beta)
            a0 = (A + 1.0) - (A - 1.0) * cos_w0 + beta
            a1 = 2.0 * ((A - 1.0) + (A + 1.0) * cos_w0)
            a2 = (A + 1.0) - (A - 1.0) * cos_w0 - beta

        else:
            return x

        b = np.array([b0 / a0, b1 / a0, b2 / a0], dtype=np.float64)
        a = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float64)
        return signal.lfilter(b, a, x).astype(np.float32)

    def _generate_single_channel(self, num_samples: int, data: dict, sample_rate: int) -> np.ndarray:
        # 1. White Noise
        white = np.random.uniform(-1.0, 1.0, size=num_samples).astype(np.float64)

        # 2. Pink Noise (Paul Kellet filter approximation)
        pink_gain = float(data.get("pink_gain", 0.0))
        blue_gain = float(data.get("blue_gain", 0.0))
        brown_gain = float(data.get("brown_gain", 0.0))
        violet_gain = float(data.get("violet_gain", 0.0))
        white_gain = float(data.get("white_gain", 0.0))

        if pink_gain > 0.001 or blue_gain > 0.001:
            if signal is not None:
                b0 = signal.lfilter([0.0555179], [1.0, -0.99886], white)
                b1 = signal.lfilter([0.0750759], [1.0, -0.99332], white)
                b2 = signal.lfilter([0.1538520], [1.0, -0.96900], white)
                b3 = signal.lfilter([0.3104856], [1.0, -0.86650], white)
                b4 = signal.lfilter([0.5500000], [1.0, -0.55000], white)
                b5 = signal.lfilter([-0.0168980], [1.0, 0.76160], white)
                b6 = 0.115926 * white
                pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + 0.5362 * white
                pink_scaled = pink * 0.11
            else:
                pink_scaled = white * 0.5
        else:
            pink_scaled = np.zeros(num_samples, dtype=np.float64)

        # 3. Brown Noise (Leaky Integrator)
        if brown_gain > 0.001:
            if signal is not None:
                brown = signal.lfilter([0.02 / 1.02], [1.0, -1.0 / 1.02], white)
                brown_scaled = brown * 3.5
            else:
                brown_scaled = white * 0.5
        else:
            brown_scaled = np.zeros(num_samples, dtype=np.float64)

        # 4. Blue Noise
        if blue_gain > 0.001:
            blue = np.diff(pink_scaled, prepend=0.0) * 3.0
        else:
            blue = np.zeros(num_samples, dtype=np.float64)

        # 5. Violet Noise
        if violet_gain > 0.001:
            violet = np.diff(white, prepend=0.0) * 0.5
        else:
            violet = np.zeros(num_samples, dtype=np.float64)

        raw_weights = [white_gain, pink_gain, brown_gain, blue_gain, violet_gain]
        total_w = sum(raw_weights)
        if total_w > 0.0:
            norm_w = [w / total_w for w in raw_weights]
        else:
            norm_w = [1.0, 0.0, 0.0, 0.0, 0.0]

        mixed = (
            white * norm_w[0] +
            pink_scaled * norm_w[1] +
            brown_scaled * norm_w[2] +
            blue * norm_w[3] +
            violet * norm_w[4]
        ).astype(np.float32)

        filter_type = str(data.get("filter_type", "off"))
        cutoff_freq = float(data.get("cutoff_freq", 1000.0))
        resonance = float(data.get("resonance", 1.0))

        if filter_type != "off" and signal is not None:
            fc = min(max(cutoff_freq, 20.0), sample_rate * 0.49)
            mixed = self._biquad_filter(mixed, fc, sample_rate, resonance, filter_type)

        eq_bands = [
            (50.0, "lowshelf", float(data.get("eq_50hz", 0.0))),
            (100.0, "peaking", float(data.get("eq_100hz", 0.0))),
            (200.0, "peaking", float(data.get("eq_200hz", 0.0))),
            (400.0, "peaking", float(data.get("eq_400hz", 0.0))),
            (800.0, "peaking", float(data.get("eq_800hz", 0.0))),
            (1600.0, "peaking", float(data.get("eq_1600hz", 0.0))),
            (3200.0, "peaking", float(data.get("eq_3200hz", 0.0))),
            (6400.0, "peaking", float(data.get("eq_6400hz", 0.0))),
            (12800.0, "peaking", float(data.get("eq_12800hz", 0.0))),
            (16000.0, "highshelf", float(data.get("eq_16000hz", 0.0))),
        ]
        if signal is not None:
            for freq, f_type, gain_db in eq_bands:
                if abs(gain_db) > 0.01:
                    fc = min(freq, sample_rate * 0.49)
                    mixed = self._biquad_filter(mixed, fc, sample_rate, 1.0, f_type, db_gain=gain_db)

        return mixed

    def generate_noise(self, params: str = "{}", audio: dict = None, unique_id: str = None, **kwargs):
        data = {}
        if isinstance(params, str) and params.strip():
            try:
                data = json.loads(params)
            except Exception:
                data = {}
        elif isinstance(params, dict):
            data = params

        for k, v in kwargs.items():
            if k not in data or data[k] is None:
                data[k] = v

        hours = int(data.get("hours", 0))
        minutes = int(data.get("minutes", 1))
        seconds = int(math.ceil(float(data.get("seconds", 0.0))))
        sample_rate = int(data.get("sample_rate", 44100))
        stereo = bool(data.get("stereo", True))
        preset = str(data.get("preset", "New Preset"))
        audio_input_vol = float(data.get("audio_input_vol", 1.0))

        # Preset override if selected
        preset_data = load_preset_file(preset)
        if preset not in ["New Preset", "Custom"] and preset_data is not None:
            for k, v in preset_data.items():
                if k not in ["hours", "minutes", "seconds", "sample_rate", "stereo", "audio_input_vol"]:
                    data[k] = v

        # If audio input is provided and duration is 0, auto-set duration to match incoming audio length
        in_audio_np = None
        in_duration_sec = 0.0
        if audio is not None and isinstance(audio, dict) and "waveform" in audio:
            try:
                in_wf = audio["waveform"] # shape (batch, channels, samples) or (channels, samples)
                in_sr = audio.get("sample_rate", sample_rate)

                if isinstance(in_wf, torch.Tensor):
                    in_wf = in_wf.cpu().numpy()

                in_wf = np.squeeze(in_wf)
                if in_wf.ndim == 1:
                    in_audio_np = in_wf
                elif in_wf.ndim >= 2:
                    in_audio_np = np.mean(in_wf, axis=0) # convert to mono for mixing

                in_num_samples = len(in_audio_np)
                in_duration_sec = in_num_samples / float(in_sr)

                # Resample input audio if sample rates differ
                if in_sr != sample_rate and signal is not None and in_num_samples > 0:
                    target_samples = int(in_duration_sec * sample_rate)
                    in_audio_np = signal.resample(in_audio_np, target_samples)

                # If duration set by user is 0, use incoming audio duration (rounded up to whole seconds)
                if hours == 0 and minutes == 0 and seconds <= 0:
                    total_seconds = float(math.ceil(in_duration_sec))
                else:
                    total_seconds = float(hours * 3600 + minutes * 60 + seconds)
            except Exception as e:
                logger.warning(f"[SonicColor] Error reading audio input: {e}")
                total_seconds = float(hours * 3600 + minutes * 60 + seconds)
        else:
            total_seconds = float(hours * 3600 + minutes * 60 + seconds)

        if total_seconds <= 0:
            total_seconds = 1.0  # fallback to 1 sec minimum if set to 0

        num_samples = int(total_seconds * sample_rate)

        if stereo:
            ch_left = self._generate_single_channel(num_samples, data, sample_rate)
            ch_right = self._generate_single_channel(num_samples, data, sample_rate)
            channels_list = [ch_left, ch_right]
        else:
            ch_mono = self._generate_single_channel(num_samples, data, sample_rate)
            channels_list = [ch_mono]

        # ADSR Envelope
        attack = float(data.get("attack", 0.1))
        decay = float(data.get("decay", 0.3))
        sustain = float(data.get("sustain", 1.0))
        release = float(data.get("release", 1.0))

        a_samp = int(attack * sample_rate)
        d_samp = int(decay * sample_rate)
        r_samp = int(release * sample_rate)

        if a_samp + d_samp + r_samp > num_samples:
            scale = num_samples / max(a_samp + d_samp + r_samp, 1)
            a_samp = int(a_samp * scale)
            d_samp = int(d_samp * scale)
            r_samp = int(r_samp * scale)

        s_samp = num_samples - (a_samp + d_samp + r_samp)

        env = np.ones(num_samples, dtype=np.float32)
        idx = 0
        if a_samp > 0:
            env[idx:idx + a_samp] = np.linspace(0.0, 1.0, a_samp, endpoint=False, dtype=np.float32)
            idx += a_samp

        if d_samp > 0:
            env[idx:idx + d_samp] = np.linspace(1.0, sustain, d_samp, endpoint=False, dtype=np.float32)
            idx += d_samp

        if s_samp > 0:
            env[idx:idx + s_samp] = float(sustain)
            idx += s_samp

        if r_samp > 0:
            env[idx:idx + r_samp] = np.linspace(sustain, 0.0, r_samp, dtype=np.float32)

        volume = float(data.get("volume", 0.5))

        processed_channels = []
        for ch in channels_list:
            ch = ch * env * (volume * 0.5)

            # Mix in external audio input if connected (NO REPEAT/LOOPING: Play ONCE, pad remainder with silence!)
            if in_audio_np is not None and audio_input_vol > 0.001:
                in_len = len(in_audio_np)
                if in_len < num_samples:
                    in_padded = np.zeros(num_samples, dtype=np.float32)
                    in_padded[:in_len] = in_audio_np
                else:
                    in_padded = in_audio_np[:num_samples]

                ch = ch + (in_padded.astype(np.float32) * audio_input_vol)

            processed_channels.append(ch)

        if stereo:
            waveform_data = np.stack(processed_channels, axis=0)
        else:
            waveform_data = processed_channels[0][np.newaxis, :]

        waveform_tensor = torch.from_numpy(waveform_data).unsqueeze(0).float()

        audio_output = {
            "waveform": waveform_tensor,
            "sample_rate": sample_rate,
        }

        # Calculate actual resulting duration in Hours, Minutes, Whole Seconds
        calc_h = int(total_seconds // 3600)
        calc_m = int((total_seconds % 3600) // 60)
        calc_s = int(math.ceil(total_seconds % 60))

        if unique_id is not None and PromptServer is not None:
            try:
                PromptServer.instance.send_sync("sonic_color.update_duration", {
                    "node_id": str(unique_id),
                    "hours": calc_h,
                    "minutes": calc_m,
                    "seconds": calc_s,
                })
            except Exception as e:
                logger.warning(f"[SonicColor] Error sending duration sync: {e}")

        return {
            "ui": {
                "duration": [{"hours": calc_h, "minutes": calc_m, "seconds": calc_s}]
            },
            "result": (audio_output,)
        }
