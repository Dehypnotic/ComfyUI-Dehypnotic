import json
import math
import torch
import torch.nn.functional as F
from PIL import Image
import numpy as np
try:
    from server import PromptServer
except ImportError:
    PromptServer = None

DEFAULT_STATE = {
    "mode": "preset",
    "ratio": "1:1 square",
    "preset_calc_mode": "min",
    "preset_value": 1024,
    "snap": 16,
    
    "preset_value_min": 1024,
    "preset_value_max": 1024,
    "preset_value_megapixels": 1.0,
    
    "custom_preset_1": "16:9",
    "custom_preset_2": "3:2",
    "custom_preset_3": "1:1",
    
    "custom_ratio_w": 4,
    "custom_ratio_h": 3,
    "custom_ratio_input_image": False,
    "custom_ratio_master": "width",
    "custom_ratio_width": 1024,
    "custom_ratio_height": 768,
    "custom_ratio_calc_mode": "min",
    "custom_ratio_value": 1024,
    "custom_ratio_value_min": 1024,
    "custom_ratio_value_max": 1024,
    "custom_ratio_value_megapixels": 1.0,
    
    "custom_dimensions_width": 1024,
    "custom_dimensions_height": 1024,
    "custom_dimensions_input_image": False,
    
    "scale_image_enabled": False,
    "scale_image_method": "auto",
    "vae_encode_enabled": False,
    
    "width": 1024,
    "height": 1024
}

class AspectRatioAdvancedV2:
    DESCRIPTION = (
    "In Presets, double-click the 3 smaller preset-buttons to set your own presets. Attach an "
    "image to use it as a reference for custom ratio or 'dims' (short for dimensions). " 
    "You can also VAE encode the image for use in I2I or similar workflows. Switch for it in Processing "
    "and another for image scaling. The snap value is the nearest multiple of the value to which "
    "the width and height will be rounded."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image": ("IMAGE",),
                "vae": ("VAE",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "ResolutionState": (
                    "STRING",
                    {"default": json.dumps(DEFAULT_STATE)},
                ),
            },
        }

    RETURN_TYPES = ("INT", "INT", "LATENT", "IMAGE")
    RETURN_NAMES = ("width", "height", "latent", "scaled_image")
    FUNCTION = "calculate_resolution"
    CATEGORY = "Dehypnotic/📐 Aspect Ratio"

    def scale_image(self, image, width, height, method):
        # image tensor is expected to be [B, H, W, C]
        if method == "auto":
            orig_h = image.shape[1]
            orig_w = image.shape[2]
            if width * height < orig_w * orig_h:
                method_to_use = "lanczos"
            else:
                method_to_use = "bicubic"
        else:
            method_to_use = method

        if method_to_use == "lanczos":
            B, H, W, C = image.shape
            scaled_imgs = []
            for i in range(B):
                img_np = (image[i].cpu().numpy() * 255).astype(np.uint8)
                if C == 1:
                    img_pil = Image.fromarray(img_np[:, :, 0], mode="L")
                else:
                    img_pil = Image.fromarray(img_np, mode="RGB")
                
                img_resized = img_pil.resize((width, height), Image.Resampling.LANCZOS)
                img_resized_np = np.array(img_resized).astype(np.float32) / 255.0
                if C == 1:
                    img_resized_np = np.expand_dims(img_resized_np, axis=-1)
                
                img_resized_tensor = torch.from_numpy(img_resized_np).to(image.device)
                scaled_imgs.append(img_resized_tensor)
            return torch.stack(scaled_imgs, dim=0)
        else:
            image_permuted = image.permute(0, 3, 1, 2)
            
            mode_map = {
                "nearest exact": "nearest-exact",
                "nearest-exact": "nearest-exact",
                "bilinear": "bilinear",
                "area": "area",
                "bicubic": "bicubic"
            }
            mode = mode_map.get(method_to_use, "bilinear")
            
            if mode in ["bilinear", "bicubic"]:
                scaled = F.interpolate(image_permuted, size=(height, width), mode=mode, align_corners=False)
            else:
                scaled = F.interpolate(image_permuted, size=(height, width), mode=mode)
                
            return scaled.permute(0, 2, 3, 1)

    def calculate_resolution(self, ResolutionState, unique_id=None, image=None, vae=None):
        try:
            state = json.loads(ResolutionState)
        except Exception:
            state = {}

        mode = state.get("mode", "preset")
        snap = int(state.get("snap", 16))
        if snap not in [8, 16, 32, 64]:
            snap = 16

        w, h = 1024, 1024

        def snap_to(val, step):
            return max(64, int(math.floor(val / step + 0.5)) * step)

        if mode == "preset":
            ratio_str = state.get("ratio", "1:1 square")
            ratio_parts = ratio_str.split(" ")[0].split(":")
            try:
                rw = float(ratio_parts[0])
                rh = float(ratio_parts[1])
            except Exception:
                rw, rh = 1.0, 1.0
            
            calc_mode = state.get("preset_calc_mode", "min")
            try:
                val = float(state.get("preset_value", 1024))
            except Exception:
                val = 1024.0

            r = rw / rh

            if calc_mode == "min":
                if r >= 1.0:
                    h_calc = val
                    w_calc = val * r
                else:
                    w_calc = val
                    h_calc = val / r
            elif calc_mode == "max":
                if r >= 1.0:
                    w_calc = val
                    h_calc = val / r
                else:
                    h_calc = val
                    w_calc = val * r
            elif calc_mode == "megapixels":
                area = val * 1_000_000
                w_calc = math.sqrt(area * r)
                h_calc = w_calc / r
            else:
                w_calc, h_calc = 1024.0, 1024.0

            w = snap_to(w_calc, snap)
            h = snap_to(h_calc, snap)

        elif mode == "custom_ratio":
            use_input_image = state.get("custom_ratio_input_image", False)
            if use_input_image and image is not None:
                img_h = image.shape[1]
                img_w = image.shape[2]
                r = img_w / img_h
            else:
                try:
                    rw = float(state.get("custom_ratio_w", 4))
                    rh = float(state.get("custom_ratio_h", 3))
                except Exception:
                    rw, rh = 4.0, 3.0
                r = rw / rh

            calc_mode = state.get("custom_ratio_calc_mode", "min")
            try:
                val = float(state.get("custom_ratio_value", 1024))
            except Exception:
                val = 1024.0

            if calc_mode == "min":
                if r >= 1.0:
                    h_calc = val
                    w_calc = val * r
                else:
                    w_calc = val
                    h_calc = val / r
            elif calc_mode == "max":
                if r >= 1.0:
                    w_calc = val
                    h_calc = val / r
                else:
                    h_calc = val
                    w_calc = val * r
            elif calc_mode == "megapixels":
                area = val * 1_000_000
                w_calc = math.sqrt(area * r)
                h_calc = w_calc / r
            else:
                w_calc, h_calc = 1024.0, 1024.0

            w = snap_to(w_calc, snap)
            h = snap_to(h_calc, snap)

        elif mode == "custom_dimensions":
            use_input_image = state.get("custom_dimensions_input_image", False)
            if use_input_image and image is not None:
                img_h = image.shape[1]
                img_w = image.shape[2]
                w = snap_to(img_w, snap)
                h = snap_to(img_h, snap)
            else:
                try:
                    w_val = float(state.get("custom_dimensions_width", 1024))
                    h_val = float(state.get("custom_dimensions_height", 1024))
                except Exception:
                    w_val, h_val = 1024.0, 1024.0
                w = snap_to(w_val, snap)
                h = snap_to(h_val, snap)

        w = max(64, min(w, 8192))
        h = max(64, min(h, 8192))

        if unique_id is not None and PromptServer is not None:
            try:
                PromptServer.instance.send_sync("aspect_ratio_advanced_v2.update_dims", {
                    "node_id": str(unique_id),
                    "width": w,
                    "height": h,
                    "mode": mode
                })
            except Exception as e:
                print(f"[aspect_ratio_advanced_v2] Error sending sync: {e}")

        batch_size = 1
        if image is not None:
            batch_size = image.shape[0]

        scale_enabled = state.get("scale_image_enabled", False)
        scale_method = state.get("scale_image_method", "bilinear")
        vae_encode_enabled = state.get("vae_encode_enabled", False)

        scaled_image = None
        if image is not None:
            if scale_enabled or (vae_encode_enabled and vae is not None):
                img_to_encode = self.scale_image(image, w, h, scale_method)
            else:
                img_to_encode = image

            if scale_enabled:
                scaled_image = img_to_encode
            else:
                scaled_image = image
        else:
            scaled_image = torch.zeros([1, 64, 64, 3])
            img_to_encode = None

        if vae_encode_enabled and vae is not None and img_to_encode is not None:
            # VAE encode the scaled image. Slice channels to 3 (RGB) for VAE.
            pixels = img_to_encode[:, :, :, :3]
            latent = vae.encode(pixels)
        else:
            latent_w = w // 8
            latent_h = h // 8
            latent = torch.zeros([batch_size, 4, latent_h, latent_w])

        return (w, h, {"samples": latent}, scaled_image)
