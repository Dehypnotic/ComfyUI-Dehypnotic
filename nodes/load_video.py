# load_video.py
import os
import torch
import numpy as np
import subprocess
import folder_paths

try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    ffmpeg_exe = "ffmpeg"

class LoadVideo:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = []
        if os.path.exists(input_dir):
            files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        
        video_exts = {".mp4", ".mkv", ".webm", ".avi", ".mov", ".gif"}
        videos = [f for f in files if os.path.splitext(f)[1].lower() in video_exts]
        videos.sort(key=lambda x: os.path.getmtime(os.path.join(input_dir, x)), reverse=True)
        
        if not videos:
            videos = ["none"]
            
        return {
            "required": {
                "video": (videos, )
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT")
    RETURN_NAMES = ("images", "audio", "fps")
    FUNCTION = "load_video"
    CATEGORY = "Dehypnotic/💾 IO"

    @classmethod
    def IS_CHANGED(cls, video):
        video_path = os.path.join(folder_paths.get_input_directory(), video)
        if os.path.exists(video_path):
            return os.path.getmtime(video_path)
        return float("NaN")

    def load_video(self, video):
        if video == "none":
            raise ValueError("No video selected")
        
        video_path = os.path.join(folder_paths.get_input_directory(), video)
        if not os.path.exists(video_path):
            raise ValueError(f"Video file not found: {video_path}")

        import cv2
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
             raise ValueError(f"Failed to open video: {video_path}")
             
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(frame)
        cap.release()
        
        if not frames:
            raise ValueError(f"No frames could be read from {video}")
            
        images = np.array(frames).astype(np.float32) / 255.0
        images_tensor = torch.from_numpy(images)

        # Audio Extraction
        audio_tensor = None
        sample_rate = 44100
        try:
            cmd = [
                ffmpeg_exe, "-y", "-i", video_path, 
                "-vn", "-acodec", "pcm_f32le", "-ar", str(sample_rate), "-ac", "2", 
                "-f", "f32le", "-"
            ]
            res = subprocess.run(cmd, capture_output=True, check=False)
            if res.returncode == 0 and res.stdout:
                audio_data = np.frombuffer(res.stdout, dtype=np.float32)
                if len(audio_data) > 0:
                    audio_data = audio_data.reshape(-1, 2).T 
                    audio_tensor = torch.from_numpy(audio_data).unsqueeze(0) # [1, channels, samples]
        except Exception as e:
            print(f"[LoadVideo] Audio extraction failed: {e}")

        audio_out = {"waveform": audio_tensor, "sample_rate": sample_rate} if audio_tensor is not None else None

        return (images_tensor, audio_out, float(fps))
