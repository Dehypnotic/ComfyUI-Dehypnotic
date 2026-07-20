from .nodes.range_to_string import RangeToString
from .nodes.set_get import DehypnoticSetNode, DehypnoticGetNode

NODE_CLASS_MAPPINGS = {
    "dehypnotic_RangeToString": RangeToString,
    "DehypnoticSetNode": DehypnoticSetNode,
    "DehypnoticGetNode": DehypnoticGetNode
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "dehypnotic_RangeToString": "🧘 RangeToString (Dehypnotic)",
    "DehypnoticSetNode": "🧘 Set Dehypnotic",
    "DehypnoticGetNode": "🧘 Get Dehypnotic"
}
WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]