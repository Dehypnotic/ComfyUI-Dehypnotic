import torch
import torch.nn.functional as F
import math

class AspectRatioAdvanced:
    """
    Advanced Aspect Ratio Node v0.2.0 - Fixed UX with proper separation
    - aspect_ratio: Which ratio to use
    - scaling_mode: How to scale it (including custom dimensions)
    """
    
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(cls):
        # Aspect ratios without "custom" — only pure aspect ratios
        aspect_ratios = [
            "1:1 square", 
            "4:3 standard",
            "3:2 classic",
            "16:9 widescreen",
            "21:9 ultrawide",
            "3:4 portrait",
            "2:3 photo",
            "9:16 mobile",
            "9:21 vertical",
            "4:5 social",
            "5:7 print"
        ]
        
        # Scaling modes include "custom dimensions"
        scaling_modes = [
            "custom dimensions",
            "input dimensions",
            "target megapixels", 
            "min side", 
            "max side"
        ]

        scaling_methods = [
            "nearest-exact",
            "bilinear",
            "area",
            "bicubic",
            "lanczos"
        ]
        
        return {
            "required": {
                "scaling_mode": (scaling_modes,),
                "custom_width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "custom_height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "use_input_image_ratio": (["No", "Yes"], {"default": "Yes", "tooltip": "Use connected image's aspect ratio when available. Set to No to use aspect_ratio preset even with image connected."}),
                "use_aspect_ratio": (aspect_ratios,{"tooltip": "Used if neither custom dimensions nor input image ratio is used."}),
                "target_megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1}),
                "min_side": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "max_side": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "scaling_method": (scaling_methods, {"default": "bilinear"}),
                "flip_dimensions": (["No", "Yes"],),
                "batch_count": ("INT", {"default": 1, "min": 1, "max": 64})
            },
            "optional": {
                "image": ("IMAGE",),
            }
        }
    
    RETURN_TYPES = ("INT", "INT", "INT", "LATENT", "IMAGE", "STRING")
    RETURN_NAMES = ("width", "height", "batch_count", "empty_latent", "scaled_image", "resolution_info")
    FUNCTION = "calculate_resolution"
    CATEGORY = "CustomNodes/Resolution"
    
    def calculate_resolution(self, custom_width, custom_height, use_aspect_ratio, scaling_mode, use_input_image_ratio, target_megapixels, min_side, max_side, scaling_method, flip_dimensions, batch_count, image=None):
        
        ratio_map = {
            "1:1 square": (1, 1),
            "4:3 standard": (4, 3), 
            "3:2 classic": (3, 2),
            "16:9 widescreen": (16, 9),
            "21:9 ultrawide": (21, 9),
            "3:4 portrait": (3, 4),
            "2:3 photo": (2, 3),
            "9:16 mobile": (9, 16),
            "9:21 vertical": (9, 21),
            "4:5 social": (4, 5),
            "5:7 print": (5, 7)
        }
        
        def make_divisible_by_8(value):
            return max(64, (value // 8) * 8)

        def _scale_image(img_permuted, height, width, mode):
            if mode in ['bilinear', 'bicubic']: # Only these support align_corners
                return F.interpolate(img_permuted, size=(height, width), mode=mode, align_corners=False)
            else:
                return F.interpolate(img_permuted, size=(height, width), mode=mode)

        scaled_image = None

        # PyTorch doesn't support Lanczos, so we'll fall back to Bicubic
        interpolation_mode = scaling_method
        if interpolation_mode == 'lanczos':
            interpolation_mode = 'bicubic'
        
        # Image ratio has priority when the toggle is on
        if image is not None and use_input_image_ratio == "Yes":
            img_height = image.shape[1]
            img_width = image.shape[2]
            image_ratio = img_width / img_height
            
            if scaling_mode == "target megapixels":
                total_pixels = target_megapixels * 1_000_000
                k = math.sqrt(total_pixels / (img_width * img_height))
                width = int(img_width * k)
                height = int(img_height * k)
            elif scaling_mode == "min side":
                if img_width <= img_height:
                    width = min_side
                    height = int(min_side / image_ratio)
                else:
                    height = min_side
                    width = int(min_side * image_ratio)
            elif scaling_mode == "max side":
                if img_width >= img_height:
                    width = max_side
                    height = int(max_side / image_ratio)
                else:
                    height = max_side
                    width = int(max_side * image_ratio)
            elif scaling_mode == "input dimensions":
                width = img_width
                height = img_height
            else:  # custom dimensions
                width = custom_width
                height = custom_height
            
            width = make_divisible_by_8(width)
            height = make_divisible_by_8(height)
            
            # Scale image
            image_permuted = image.permute(0, 3, 1, 2)
            scaled_image_permuted = _scale_image(image_permuted, height, width, interpolation_mode)
            scaled_image = scaled_image_permuted.permute(0, 2, 3, 1)
        
        # Use exact input image dimensions
        elif scaling_mode == "input dimensions":
            if image is not None:
                img_height = image.shape[1]
                img_width = image.shape[2]
                width = make_divisible_by_8(img_width)
                height = make_divisible_by_8(img_height)
                image_permuted = image.permute(0, 3, 1, 2)
                scaled_image_permuted = _scale_image(image_permuted, height, width, interpolation_mode)
                scaled_image = scaled_image_permuted.permute(0, 2, 3, 1)
            else:
                width = make_divisible_by_8(custom_width)
                height = make_divisible_by_8(custom_height)

        # Use aspect ratio preset
        elif scaling_mode == "custom dimensions":
            width = make_divisible_by_8(custom_width)
            height = make_divisible_by_8(custom_height)
            
            # Scale image to custom dimensions if provided
            if image is not None:
                image_permuted = image.permute(0, 3, 1, 2)
                scaled_image_permuted = _scale_image(image_permuted, height, width, interpolation_mode)
                scaled_image = scaled_image_permuted.permute(0, 2, 3, 1)
        
        elif use_aspect_ratio in ratio_map:
            ratio_w, ratio_h = ratio_map[use_aspect_ratio]
            
            if scaling_mode == "target megapixels":
                total_pixels = target_megapixels * 1_000_000
                k = math.sqrt(total_pixels / (ratio_w * ratio_h))
                width = int(ratio_w * k)
                height = int(ratio_h * k)
            elif scaling_mode == "min side":
                shorter_ratio = min(ratio_w, ratio_h)
                scaling_factor = min_side / shorter_ratio
                width = int(ratio_w * scaling_factor)
                height = int(ratio_h * scaling_factor)
            elif scaling_mode == "max side":
                longer_ratio = max(ratio_w, ratio_h)
                scaling_factor = max_side / longer_ratio
                width = int(ratio_w * scaling_factor)
                height = int(ratio_h * scaling_factor)
            
            width = make_divisible_by_8(width)
            height = make_divisible_by_8(height)
            
            # Scale image to preset ratio if provided
            if image is not None:
                image_permuted = image.permute(0, 3, 1, 2)
                scaled_image_permuted = _scale_image(image_permuted, height, width, interpolation_mode)
                scaled_image = scaled_image_permuted.permute(0, 2, 3, 1)
        
        # Flip if requested
        if flip_dimensions == "Yes":
            width, height = height, width
            if scaled_image is not None:
                scaled_image_permuted = scaled_image.permute(0, 3, 1, 2)
                scaled_image_permuted = _scale_image(scaled_image_permuted, height, width, interpolation_mode)
                scaled_image = scaled_image_permuted.permute(0, 2, 3, 1)
        
        # Fallback: return original image if no scaled image was produced
        if scaled_image is None and image is not None:
            scaled_image = image

        # Create latent
        latent_width = width // 8
        latent_height = height // 8
        latent = torch.zeros([batch_count, 4, latent_height, latent_width])
        
        # Info
        actual_mp = (width * height) / 1_000_000
        actual_min = min(width, height)
        actual_max = max(width, height)
        
        if scaling_mode == "input dimensions":
            source_info = "input dimensions"
        elif image is not None and use_input_image_ratio == "Yes":
            source_info = "from image"
        elif scaling_mode == "custom dimensions":
            source_info = "custom dimensions"
        else:
            source_info = f"{use_aspect_ratio} + {scaling_mode}"
        
        resolution_info = f"{width}x{height} ({actual_mp:.2f}MP, {width/height:.2f}:1, {source_info})"
        
        return (width, height, batch_count, {"samples": latent}, scaled_image, resolution_info)

# Node mapping
NODE_CLASS_MAPPINGS = {
    "AspectRatioAdvanced": AspectRatioAdvanced
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AspectRatioAdvanced": "AspectRatioAdvanced (Dehypnotic)",
}
