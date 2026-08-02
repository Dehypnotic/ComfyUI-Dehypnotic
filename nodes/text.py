from __future__ import annotations
from typing import Tuple

class TextDehypnotic:
    DESCRIPTION = (
        "A plain text node with built-in saving and loading for .txt files. "
        "Allows copying/pasting whole text blocks. "
        "If 'text_in' is connected, the node's text will be entirely replaced "
        "by the incoming text upon execution."
    )
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "Enter text here...",
                }),
            },
            "optional": {
                "text_in": ("STRING", {
                    "forceInput": True,
                }),
                "input_on": ("BOOLEAN", {
                    "default": True,
                }),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "run"
    CATEGORY = "Dehypnotic/📝 Text Utils"
    OUTPUT_NODE = True

    def run(self, text: str, text_in: str = None, input_on: bool = True) -> dict:
        if input_on and text_in is not None:
            out_text = text_in
        else:
            out_text = text
            
        # We return a dictionary with "ui" to update the frontend widget,
        # and "result" for the actual output values.
        return {"ui": {"text": [out_text]}, "result": (out_text,)}
