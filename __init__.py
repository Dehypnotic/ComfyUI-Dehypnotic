from .nodes.range_to_string import RangeToString
from .nodes.set_get import DehypnoticSetNode, DehypnoticGetNode
from .nodes.aspect_ratio import AspectRatio
from .nodes.save_audio_mp3 import SaveAudioMP3
from .nodes.save_images import SaveImages
from .nodes.frame_save import FrameSave
from .nodes.save_video import SaveVideo
from .nodes.load_video import LoadVideo
from .nodes.numbered_text import NumberedText
from .nodes.text import TextDehypnotic

NODE_CLASS_MAPPINGS = {
    "dehypnotic_RangeToString": RangeToString,
    "DehypnoticSetNode": DehypnoticSetNode,
    "DehypnoticGetNode": DehypnoticGetNode,
    "dehypnotic_AspectRatio": AspectRatio,
    "SaveAudioMP3Dehypnotic": SaveAudioMP3,
    "SaveImagesDehypnotic": SaveImages,
    "FrameSaveDehypnotic": FrameSave,
    "SaveVideoDehypnotic": SaveVideo,
    "LoadVideoDehypnotic": LoadVideo,
    "dehypnotic_NumberedText": NumberedText,
    "dehypnotic_Text": TextDehypnotic
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "dehypnotic_RangeToString": "🧘 RangeToString (Dehypnotic)",
    "DehypnoticSetNode": "🧘 Set Dehypnotic",
    "DehypnoticGetNode": "🧘 Get Dehypnotic",
    "dehypnotic_AspectRatio": "🧘 AspectRatio (Dehypnotic)",
    "SaveAudioMP3Dehypnotic": "🧘 Save Audio (Dehypnotic)",
    "SaveImagesDehypnotic": "🧘 Save Images (Dehypnotic)",
    "FrameSaveDehypnotic": "🧘 FrameSave (Dehypnotic)",
    "SaveVideoDehypnotic": "🧘 Save Video (Dehypnotic)",
    "LoadVideoDehypnotic": "🧘 Load Video (Dehypnotic)",
    "dehypnotic_NumberedText": "🧘 NumberedText (Dehypnotic)",
    "dehypnotic_Text": "🧘 Text (Dehypnotic)"
}
WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
