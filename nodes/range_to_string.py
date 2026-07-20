class RangeToString:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "start": ("INT", {"default": 0}),
                "end": ("INT", {"default": 3}),
                # Nå kan step gå både opp og ned
                "step": ("INT", {"default": 1, "min": -999999, "max": 999999}),
                "separator": ("STRING", {"default": ","}),
                "mode": (["inclusive", "exclusive"],),
            }
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "make_range"
    CATEGORY = "Dehypnotic/📝 Text Utils"

    def make_range(self, start, end, step, separator, mode):
        if step == 0:
            raise ValueError("Step kan ikke være 0")

        # Juster stopp basert på step-retning og inclusive/exclusive
        if step > 0:
            stop_val = end + 1 if mode == "inclusive" else end
        else:  # step < 0
            stop_val = end - 1 if mode == "inclusive" else end

        values = [str(i) for i in range(start, stop_val, step)]
        return (separator.join(values),)
