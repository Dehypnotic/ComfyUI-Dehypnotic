# nodes/brainwave_sync.py
import json
import logging
import math
import numpy as np
import torch

logger = logging.getLogger(__name__)

class BrainwaveSync:
    """
    BrainwaveSync custom node for ComfyUI.
    Generates brainwave entrainment audio (Isochronic pulses or Binaural beats)
    based on a custom frequency-over-time graph.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "carrier_hz": ("FLOAT", {"default": 200.0, "min": 20.0, "max": 2000.0, "step": 1.0, "display": "number"}),
                "beat_mode": (["Isochronic", "Binaural"], {"default": "Isochronic"}),
                "volume": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "sample_rate": ("INT", {"default": 44100, "min": 8000, "max": 192000, "step": 1000}),
            },
            "optional": {
                "points_json": ("STRING", {
                    "default": '[{"time":0,"hz":1.0},{"time":600,"hz":4.5},{"time":1200,"hz":1.0}]',
                    "multiline": True
                }),
            }
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "generate"
    CATEGORY = "Dehypnotic/🔊 Audio"

    def generate(
        self,
        carrier_hz: float = 200.0,
        beat_mode: str = "Isochronic",
        volume: float = 1.0,
        sample_rate: int = 44100,
        points_json: str = ""
    ):
        # 1. Parse points JSON
        pts = []
        if points_json and points_json.strip():
            try:
                raw_pts = json.loads(points_json)
                if isinstance(raw_pts, list):
                    for item in raw_pts:
                        if isinstance(item, dict) and "time" in item and "hz" in item:
                            pts.append({
                                "time": float(item["time"]),
                                "hz": max(0.1, float(item["hz"]))
                            })
            except Exception as e:
                logger.warning(f"[BrainwaveSync] Failed to parse points_json: {e}")

        if not pts:
            pts = [
                {"time": 0.0, "hz": 1.0},
                {"time": 600.0, "hz": 4.5},
                {"time": 1200.0, "hz": 1.0}
            ]

        # Sort points by time
        pts.sort(key=lambda p: p["time"])

        total_dur = 1200.0
        if pts and pts[-1]["time"] > 0:
            total_dur = pts[-1]["time"]

        times = np.array([p["time"] for p in pts], dtype=np.float64)
        hzs = np.array([p["hz"] for p in pts], dtype=np.float64)

        # 2. Time grid
        num_samples = int(math.ceil(total_dur * sample_rate))
        dt = 1.0 / float(sample_rate)
        t_arr = np.linspace(0.0, total_dur, num_samples, endpoint=False, dtype=np.float64)

        # Interpolate beat frequency over time
        beat_hz_curve = np.interp(t_arr, times, hzs)

        vol = max(0.0, min(1.0, float(volume)))

        # 3. Audio generation based on beat_mode
        if beat_mode == "Isochronic":
            # Mono waveform
            c_hz_arr = np.full(num_samples, float(carrier_hz), dtype=np.float64)
            carrier_phase = np.cumsum(2.0 * np.pi * c_hz_arr * dt)
            carrier_signal = np.sin(carrier_phase)

            # Triangular pulse gain calculation
            pulse_phase = np.cumsum(beat_hz_curve * dt) % 1.0

            gain = np.zeros_like(pulse_phase)
            active_mask = pulse_phase < 0.5

            if np.any(active_mask):
                k = pulse_phase[active_mask] / 0.5
                # Triangular rise (0->1) and fall (1->0)
                g_vals = np.where(k < 0.5, k * 2.0, (1.0 - k) * 2.0)
                gain[active_mask] = g_vals

            samples = (carrier_signal * gain * vol).astype(np.float32)
            # Shape: [1, 1, num_samples] (batch=1, channels=1, samples)
            waveform_tensor = torch.from_numpy(samples).unsqueeze(0).unsqueeze(0)

        else:  # Binaural mode
            # Stereo waveform
            c_left_hz_arr = np.full(num_samples, float(carrier_hz), dtype=np.float64)
            c_right_hz_arr = float(carrier_hz) + beat_hz_curve

            phase_left = np.cumsum(2.0 * np.pi * c_left_hz_arr * dt)
            phase_right = np.cumsum(2.0 * np.pi * c_right_hz_arr * dt)

            sample_left = (np.sin(phase_left) * vol).astype(np.float32)
            sample_right = (np.sin(phase_right) * vol).astype(np.float32)

            samples_stereo = np.stack([sample_left, sample_right], axis=0)
            # Shape: [1, 2, num_samples] (batch=1, channels=2, samples)
            waveform_tensor = torch.from_numpy(samples_stereo).unsqueeze(0)

        audio_dict = {
            "waveform": waveform_tensor,
            "sample_rate": sample_rate
        }

        return (audio_dict,)
