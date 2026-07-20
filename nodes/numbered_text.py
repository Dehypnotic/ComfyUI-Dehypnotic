from __future__ import annotations
import re
from typing import Tuple, List

def _norm(s: str) -> str:
    return s.replace("\r\n", "\n").replace("\r", "\n")

def _parse_numbered_blocks(text: str) -> List[Tuple[bool, str]]:
    lines = _norm(text).split("\n")
    blocks = []
    current_block = []
    current_checked = False

    for line in lines:
        # Match [x] or [ ] checkbox prefix
        match = re.match(r'^\[([xX ]?)\]\s*(.*)', line)
        if match:
            # We found a new block
            if current_block:
                blocks.append((current_checked, "\n".join(current_block)))
            current_checked = match.group(1).lower() == 'x'
            current_block = [match.group(2)]
        else:
            # Check if this is a legacy format line with standard numbering (e.g. "1. Prompt")
            legacy_match = re.match(r'^\s*\d+\.\s*(.*)', line)
            if legacy_match:
                if current_block:
                    blocks.append((current_checked, "\n".join(current_block)))
                current_checked = True  # Default legacy lines to checked
                current_block = [legacy_match.group(1)]
            else:
                # Normal sub-line
                if current_block:
                    current_block.append(line)
                elif line.strip():
                    # If there is no block yet, start a checked block
                    current_block = [line]
                    current_checked = True

    if current_block:
        blocks.append((current_checked, "\n".join(current_block)))

    return blocks

def _unescape(s: str) -> str:
    try:
        # Convert escaped sequence (like \n or \t) to actual character
        return bytes(s, "utf-8").decode("unicode_escape")
    except Exception:
        return s

def _get_joined_text(text: str, separator: str = "\n") -> str:
    blocks = _parse_numbered_blocks(text)
    # Output only the checked blocks, stripped of whitespace
    selected_blocks = [b.strip() for checked, b in blocks if checked and b.strip()]
    return separator.join(selected_blocks)

class NumberedText:
    DESCRIPTION = (
        "Pressing Enter creates a new text associated with the next number in the "
        "sequence. Use Shift + Enter to create a new line within the same text. "
        "Only checkmarked texts will be sent to output during execution, separated "
        "by the separator at the bottom right if several. The cursor may be moved "
        "up and down the sequence with the arrow keys. Swap the content of any two "
        "numbers at the bottom. If you still got the node with the deprecated ID, "
        "replace it with the new since the old will be removed."
    )
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": "1. ",
                    "placeholder": "Write text. Text divisions are numbered on run.",
                }),
                "separator": ("STRING", {
                    "multiline": False,
                    "default": ", ",
                    "placeholder": "Delimiter to join active texts, e.g. \\n or , ",
                }),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "run"
    CATEGORY = "Dehypnotic/📝 Text Utils"

    def run(self, text: str, separator: str) -> Tuple[str]:
        unescaped_separator = _unescape(separator)
        joined_text = _get_joined_text(text, unescaped_separator)
        return (joined_text,)
