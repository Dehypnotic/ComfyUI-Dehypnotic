from __future__ import annotations
import re
from typing import Tuple, List

def _norm(s: str) -> str:
    return s.replace("\r\n", "\n").replace("\r", "\n")

def _strip_prefix(line: str) -> str:
    return re.sub(r'^\s*\d+\.\s*', '', line)

_blank_pref_re = re.compile(r'^\s*\d+\.\s*$')  # "  3.  " regnes som blank

def _is_blank_after_strip_pref(line: str) -> bool:
    raw = line.strip()
    if not raw:
        return True
    if _blank_pref_re.match(raw):
        return True
    return len(_strip_prefix(line).strip()) == 0

def _filter_nonblank_lines_preserve_order(lines: List[str]) -> List[str]:
    return [ln for ln in lines if not _is_blank_after_strip_pref(ln)]

def _renumber(text: str) -> str:
    lines = _norm(text).split("\n")
    lines = _filter_nonblank_lines_preserve_order(lines)
    out = []
    for i, ln in enumerate(lines, start=1):
        out.append(f"{i}. {_strip_prefix(ln).strip()}")
    return "\n".join(out)

def _get_line_from_numbered(text_numbered: str, idx: int) -> str:
    lines = _norm(text_numbered).split("\n")
    if idx < 1 or idx > len(lines):
        return ""
    return _strip_prefix(lines[idx - 1]).strip()

def _make_numbered_preview(text_numbered: str, max_lines: int = 50) -> str:
    lines = _norm(text_numbered).split("\n")[:max_lines]
    width = len(str(len(lines))) if lines else 1
    preview = []
    for i, ln in enumerate(lines, start=1):
        num = str(i).rjust(width)
        content = _strip_prefix(ln)
        preview.append(f"{num}. {content}")
    return "\n".join(preview)

def _parse_index_list(s: str) -> List[int]:
    if not s:
        return []
    parts = [p.strip() for p in s.split(",")]
    result: List[int] = []
    for p in parts:
        if not p:
            continue
        m = re.match(r'^(\d+)\s*-\s*(\d+)$', p)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if a <= b:
                result.extend(list(range(a, b + 1)))
            else:
                result.extend(list(range(a, b - 1, -1)))
            continue
        if p.isdigit():
            result.append(int(p))
    return result

class NumberedText:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": "1. ",
                    "placeholder": "Write text. Text divisions are numbered on run.",
                }),
                "selected_text": ("INT", {
                    "default": 1, "min": 1, "max": 1_000_000, "step": 1,
                }),
                "selected_texts": ("STRING", {
                    "default": "",
                    "placeholder": "e.g. 5,1,3 or 2-4,7",
                }),
                "join_separator": ("STRING", {
                    "default": "\n",
                    "placeholder": "Separator when multiple divisions are selected",
                }),
                "max_numbered_texts": ("INT", {
                    "default": 50, "min": 1, "max": 500, "step": 1,
                }),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("selected_text(s)", "numbered_texts")
    FUNCTION = "run"
    CATEGORY = "text/utils"

    def run(self, text: str, selected_text: int, selected_texts: str, join_separator: str, max_numbered_texts: int) -> Tuple[str, str]:
        numbered = _renumber(text)  # nå uten blanke divisions

        if selected_texts.strip():
            indices = _parse_index_list(selected_texts)
            pieces: List[str] = []
            for idx in indices:
                piece = _get_line_from_numbered(numbered, idx)
                if piece != "":
                    pieces.append(piece)
            selected = join_separator.join(pieces)
        else:
            selected = _get_line_from_numbered(numbered, selected_text)

        preview = _make_numbered_preview(numbered, max_lines=max_numbered_texts)
        return (selected, preview)

NODE_CLASS_MAPPINGS = {
    "NumberedText": NumberedText,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NumberedText": "NumberedText (Dehypnotic)",
}

