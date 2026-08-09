from __future__ import annotations
import os
import shutil
import logging
from pathlib import Path
from typing import Dict, Any

from aiohttp import web
import folder_paths

try:
    from server import PromptServer
except ImportError:
    PromptServer = None

logger = logging.getLogger(__name__)

def _get_target_dir(type_name: str) -> Path:
    if type_name not in {"numbered_text", "text", "brainwave_sync"}:
        raise ValueError(f"Invalid preset type: {type_name}")
    user_dir = Path(folder_paths.get_user_directory()).resolve()
    target_dir = user_dir / "Dehypnotic" / type_name
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir

def _migrate_legacy_files(type_name: str, target_dir: Path) -> None:
    try:
        user_dir = Path(folder_paths.get_user_directory()).resolve()
        legacy_dir = user_dir / "default" / "Dehypnotic" / type_name
        if legacy_dir.exists() and legacy_dir.is_dir():
            ext = ".json" if type_name in {"numbered_text", "brainwave_sync"} else ".txt"
            for item in legacy_dir.iterdir():
                if item.is_file() and item.name.lower().endswith(ext):
                    dest = target_dir / item.name
                    if not dest.exists():
                        shutil.copy2(item, dest)
                        logger.info(f"[Dehypnotic] Migrated legacy preset {item.name} to {dest}")
    except Exception as e:
        logger.warning(f"[Dehypnotic] Error migrating legacy presets for {type_name}: {e}")

def _get_safe_filepath(type_name: str, filename: str) -> Path:
    target_dir = _get_target_dir(type_name)
    _migrate_legacy_files(type_name, target_dir)

    clean_filename = os.path.basename(filename).strip()
    ext = ".json" if type_name in {"numbered_text", "brainwave_sync"} else ".txt"
    if not clean_filename.lower().endswith(ext):
        clean_filename = f"{clean_filename}{ext}"

    resolved_path = (target_dir / clean_filename).resolve()
    if not str(resolved_path).startswith(str(target_dir.resolve())):
        raise ValueError("Invalid file path traversal attempt")

    return resolved_path

if PromptServer is not None:
    @PromptServer.instance.routes.get("/dehypnotic/user_text/list")
    async def handle_list_presets(request):
        try:
            type_name = request.query.get("type", "numbered_text")
            target_dir = _get_target_dir(type_name)
            _migrate_legacy_files(type_name, target_dir)

            ext = ".json" if type_name in {"numbered_text", "brainwave_sync"} else ".txt"
            files = []
            for f in target_dir.iterdir():
                if f.is_file() and f.name.lower().endswith(ext):
                    files.append({
                        "path": f.name,
                        "name": f.stem,
                        "modified": int(f.stat().st_mtime * 1000)
                    })
            files.sort(key=lambda x: x["modified"], reverse=True)
            return web.json_response(files)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)

    @PromptServer.instance.routes.post("/dehypnotic/user_text/save")
    async def handle_save_preset(request):
        try:
            data = await request.json()
            type_name = data.get("type", "numbered_text")
            filename = data.get("filename", "")
            content = data.get("content", "")
            overwrite = data.get("overwrite", True)

            if not filename:
                return web.json_response({"error": "No filename provided"}, status=400)

            target_path = _get_safe_filepath(type_name, filename)
            if target_path.exists() and not overwrite:
                return web.json_response({"error": "File already exists"}, status=409)

            if type_name in {"numbered_text", "brainwave_sync"} and isinstance(content, (dict, list)):
                import json
                content_str = json.dumps(content, indent=2)
            else:
                content_str = str(content)

            with open(target_path, "w", encoding="utf-8") as f:
                f.write(content_str)

            return web.json_response({"success": True, "name": target_path.stem, "path": target_path.name})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)

    @PromptServer.instance.routes.get("/dehypnotic/user_text/load")
    async def handle_load_preset(request):
        try:
            type_name = request.query.get("type", "numbered_text")
            filename = request.query.get("filename", "")
            if not filename:
                return web.json_response({"error": "No filename provided"}, status=400)

            target_path = _get_safe_filepath(type_name, filename)
            if not target_path.exists():
                return web.json_response({"error": "File not found"}, status=404)

            with open(target_path, "r", encoding="utf-8") as f:
                content = f.read()

            if type_name in {"numbered_text", "brainwave_sync"}:
                import json
                try:
                    data = json.loads(content)
                    return web.json_response(data)
                except Exception:
                    pass

            return web.Response(text=content, content_type="text/plain", charset="utf-8")
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)

    @PromptServer.instance.routes.post("/dehypnotic/user_text/delete")
    async def handle_delete_preset(request):
        try:
            data = await request.json()
            type_name = data.get("type", "numbered_text")
            filename = data.get("filename", "")
            if not filename:
                return web.json_response({"error": "No filename provided"}, status=400)

            target_path = _get_safe_filepath(type_name, filename)
            if target_path.exists():
                target_path.unlink()

            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)
