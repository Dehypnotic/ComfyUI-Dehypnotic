from __future__ import annotations
import os
import json
import logging
from pathlib import Path
from aiohttp import web

try:
    import folder_paths
except ImportError:
    folder_paths = None

try:
    from server import PromptServer
except ImportError:
    PromptServer = None

logger = logging.getLogger(__name__)

def _get_preset_dir() -> Path:
    if folder_paths is not None and hasattr(folder_paths, "get_user_directory"):
        user_dir = Path(folder_paths.get_user_directory()).resolve()
    else:
        user_dir = Path(os.path.expanduser("~/ComfyUI/user")).resolve()
    target_dir = user_dir / "Dehypnotic" / "sonic_color"
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir

if PromptServer is not None:
    @PromptServer.instance.routes.get("/dehypnotic/sonic_color/presets/list")
    async def handle_list_sonic_presets(request):
        try:
            target_dir = _get_preset_dir()
            custom_presets = []
            for f in target_dir.iterdir():
                if f.is_file() and f.name.lower().endswith(".json"):
                    try:
                        with open(f, "r", encoding="utf-8") as fp:
                            data = json.load(fp)
                            custom_presets.append({
                                "name": f.stem,
                                "data": data
                            })
                    except Exception as e:
                        logger.warning(f"Could not read preset {f.name}: {e}")
            return web.json_response({"custom": custom_presets})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)

    @PromptServer.instance.routes.post("/dehypnotic/sonic_color/presets/save")
    async def handle_save_sonic_preset(request):
        try:
            req_data = await request.json()
            preset_name = req_data.get("name", "").strip()
            preset_values = req_data.get("data", {})
            if not preset_name:
                return web.json_response({"error": "No preset name provided"}, status=400)

            # Clean name
            safe_name = os.path.basename(preset_name)
            if safe_name.lower().endswith(".json"):
                safe_name = safe_name[:-5]

            target_dir = _get_preset_dir()
            target_file = target_dir / f"{safe_name}.json"

            with open(target_file, "w", encoding="utf-8") as f:
                json.dump(preset_values, f, indent=2)

            return web.json_response({"status": "success", "name": safe_name})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)

    @PromptServer.instance.routes.post("/dehypnotic/sonic_color/presets/delete")
    async def handle_delete_sonic_preset(request):
        try:
            req_data = await request.json()
            preset_name = req_data.get("name", "").strip()
            if not preset_name:
                return web.json_response({"error": "No preset name provided"}, status=400)

            safe_name = os.path.basename(preset_name)
            if safe_name.lower().endswith(".json"):
                safe_name = safe_name[:-5]

            target_dir = _get_preset_dir()
            target_file = target_dir / f"{safe_name}.json"

            if target_file.exists():
                target_file.unlink()
                return web.json_response({"status": "deleted", "name": safe_name})
            else:
                return web.json_response({"error": "Preset file not found"}, status=404)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)
