"""Shared type helpers for Dehypnotic nodes.

AnyType bypasses ComfyUI's strict type matching so a single declared
input / output slot can accept or emit any wire type (MODEL, CLIP, IMAGE,
STRING, AUDIO, etc). Used by nodes that pass values through unchanged
or accept any incoming wire.
"""


class AnyType(str):
    """A string subclass that compares equal to every other string."""

    def __ne__(self, other):
        return False


ANY = AnyType("*")
