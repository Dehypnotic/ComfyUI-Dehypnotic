from .nodes.range_to_string import RangeToString
from .nodes.set_get import DehypnoticSetNode, DehypnoticGetNode
from .nodes.aspect_ratio_advanced_v2 import AspectRatioAdvancedV2
from .nodes.save_audio_mp3 import SaveAudioMP3
from .nodes.save_images import SaveImages
from .nodes.save_video import SaveVideo
from .nodes.numbered_text import NumberedText

NODE_CLASS_MAPPINGS = {
    "dehypnotic_RangeToString": RangeToString,
    "DehypnoticSetNode": DehypnoticSetNode,
    "DehypnoticGetNode": DehypnoticGetNode,
    "AspectRatioAdvanced": AspectRatioAdvancedV2,
    "dehypnotic_AspectRatio": AspectRatioAdvancedV2,
    "SaveAudioMP3Dehypnotic": SaveAudioMP3,
    "SaveImagesDehypnotic": SaveImages,
    "SaveVideoDehypnotic": SaveVideo,
    "NumberedText": NumberedText,
    "dehypnotic_NumberedText": NumberedText
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "dehypnotic_RangeToString": "🧘 RangeToString (Dehypnotic)",
    "DehypnoticSetNode": "🧘 Set Dehypnotic",
    "DehypnoticGetNode": "🧘 Get Dehypnotic",
    "AspectRatioAdvanced": "AspectRatioAdvanced - DEPRECATED - REPLACE",
    "dehypnotic_AspectRatio": "🧘 AspectRatio (Dehypnotic)",
    "SaveAudioMP3Dehypnotic": "🧘 Save MP3 (Dehypnotic)",
    "SaveImagesDehypnotic": "🧘 Save Images (Dehypnotic)",
    "SaveVideoDehypnotic": "🧘 Save Video & Frames (Dehypnotic)",
    "NumberedText": "NumberedText - DEPRECATED - REPLACE",
    "dehypnotic_NumberedText": "🧘 NumberedText (Dehypnotic)"
}
WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]