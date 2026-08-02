# frame_save.py
# ComfyUI custom node: FrameSave (Dehypnotic)
#
# - Accepts a sequence of images (input: images)
# - Filters frames between start_frame and end_frame (inclusive, 1-indexed) with step interval
# - Empties and saves filtered images temporarily to temp directory 'dehypnotic_frame_save'
# - Fast PNG saving without blocking optimize pass
# - Provides HTTP POST endpoints for media info inspection, folder directory navigation & native OS folder picker
# - Provides HTTP POST endpoint to save selected frames to target path with whitelist validation

import os
import shutil
import json
import asyncio
import subprocess
import string
import typing as _t
from pathlib import Path
from typing import List, Optional

import numpy as np
import torch
from PIL import Image

try:
	import folder_paths
except ImportError:
	folder_paths = None

try:
	from server import PromptServer
	from aiohttp import web
except ImportError:
	PromptServer = None
	web = None


# -----------------------------------------------------------------------------#
# Helpers
# -----------------------------------------------------------------------------#

def to_pil(img: np.ndarray) -> Image.Image:
	"""Safe conversion from ComfyUI tensor to PIL Image."""
	a = np.asarray(img)
	if a.dtype != np.uint8:
		a = np.clip(a, 0.0, 1.0)
		a = (a * 255.0).round().astype(np.uint8)
	mode = "RGBA" if a.ndim == 3 and a.shape[2] == 4 else "RGB"
	return Image.fromarray(a, mode=mode)


def list_directory_contents(target_path: str = "") -> dict:
	"""Lists subdirectories and drives for in-browser folder picker modal."""
	drives = []
	if os.name == "nt":
		for letter in string.ascii_uppercase:
			drive = f"{letter}:\\"
			if os.path.exists(drive):
				drives.append(drive)

	comfy_output = PathValidator._get_comfy_dir("output") or os.path.abspath("output")

	if not target_path or not target_path.strip():
		current_path = comfy_output
	elif os.path.isabs(target_path):
		current_path = os.path.abspath(target_path)
	else:
		current_path = PathValidator._resolve_out_dir(target_path)

	if not os.path.exists(current_path) or not os.path.isdir(current_path):
		current_path = comfy_output

	parent_path = os.path.dirname(current_path) if current_path != os.path.dirname(current_path) else ""

	subfolders = []
	try:
		for entry in os.scandir(current_path):
			if entry.is_dir(follow_symlinks=False):
				subfolders.append(entry.name)
		subfolders.sort(key=lambda s: s.lower())
	except Exception:
		pass

	return {
		"success": True,
		"current_path": current_path,
		"parent_path": parent_path,
		"comfy_output": comfy_output,
		"drives": drives,
		"subfolders": subfolders,
	}


def open_native_folder_dialog(initial_dir: str = "") -> Optional[str]:
	"""Opens native Windows/OS folder selection dialog attached to active browser window."""
	if os.name == "nt":
		try:
			init_script = ""
			if initial_dir and os.path.isdir(initial_dir):
				clean_init = initial_dir.replace("'", "''")
				init_script = f"if (Test-Path '{clean_init}') {{ $f.SelectedPath = '{clean_init}' }}; "

			ps_script = (
				'Add-Type -TypeDefinition @"\n'
				'using System;\n'
				'using System.Runtime.InteropServices;\n'
				'public class Win32 {\n'
				'    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();\n'
				'}\n'
				'"@; '
				'[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null; '
				'$hwnd = [Win32]::GetForegroundWindow(); '
				'$f = New-Object System.Windows.Forms.FolderBrowserDialog; '
				f'{init_script}'
				'$f.Description = "Select Destination Folder"; '
				'$f.ShowNewFolderButton = $true; '
				'if ($hwnd -ne [IntPtr]::Zero) { '
				'    $owner = New-Object System.Windows.Forms.NativeWindow; '
				'    $owner.AssignHandle($hwnd); '
				'    $res = $f.ShowDialog($owner); '
				'    $owner.ReleaseHandle(); '
				'} else { '
				'    $res = $f.ShowDialog(); '
				'} '
				'if ($res -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath };'
			)

			creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
			res = subprocess.check_output(
				["powershell", "-NoProfile", "-Command", ps_script],
				text=True,
				timeout=180,
				creationflags=creation_flags,
			).strip()

			if res and os.path.isdir(res):
				norm = os.path.normpath(res)
				print(f"[FrameSave] Selected folder: {norm}")
				return norm
		except Exception as pe:
			print("[FrameSave] PowerShell folder browser notice:", pe)

	# Fallback to Tkinter
	try:
		import tkinter as tk
		from tkinter import filedialog

		root = tk.Tk()
		root.withdraw()
		root.attributes("-topmost", True)

		start_dir = initial_dir if initial_dir and os.path.isdir(initial_dir) else None
		selected_path = filedialog.askdirectory(
			title="Select Destination Folder",
			initialdir=start_dir,
		)
		root.destroy()
		if selected_path and os.path.isdir(selected_path):
			norm = os.path.normpath(selected_path)
			print(f"[FrameSave] Selected folder (Tkinter): {norm}")
			return norm
	except Exception as te:
		print("[FrameSave] Tkinter folder browser notice:", te)

	return None


# -----------------------------------------------------------------------------#
# Path validation & whitelist helper class
# -----------------------------------------------------------------------------#

class PathValidator:
	"""Validates file locations against ComfyUI output, temp, and offline whitelist."""

	@staticmethod
	def _get_comfy_dir(name: str) -> _t.Optional[str]:
		if folder_paths is None:
			return None
		try:
			getter = getattr(folder_paths, f"get_{name}_directory", None)
			if callable(getter):
				return getter()
			if name in getattr(folder_paths, "folder_names_and_paths", {}):
				return folder_paths.folder_names_and_paths[name][0]
		except Exception:
			pass
		return None

	@classmethod
	def _get_comfy_root(cls) -> str:
		comfy_output = cls._get_comfy_dir("output")
		if comfy_output:
			return os.path.abspath(os.path.join(comfy_output, os.pardir))
		return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

	@classmethod
	def _resolve_out_dir(cls, path: str) -> str:
		if not path or not path.strip():
			comfy_out = cls._get_comfy_dir("output")
			return comfy_out if comfy_out else os.path.abspath("output")
		if os.path.isabs(path):
			return os.path.abspath(path)
		comfy_root = cls._get_comfy_root()
		path_norm = path.replace("/", os.sep).replace("\\", os.sep)
		if path_norm.startswith("output" + os.sep):
			return os.path.abspath(os.path.join(comfy_root, path))
		base_output = cls._get_comfy_dir("output") or os.path.abspath("output")
		return os.path.abspath(os.path.join(base_output, path))

	@classmethod
	def _load_allowed_roots(cls) -> _t.List[str]:
		env_cfg = os.environ.get("DEHYPNOTIC_SAVE_ALLOWED_PATHS")
		candidates: List[str] = []
		if env_cfg and os.path.isfile(env_cfg):
			candidates.append(env_cfg)

		comfy_root = cls._get_comfy_root()
		names = (
			"dehypnotic_save_allowed_paths.json",
			"allowed_paths.json",
		)
		for name in names:
			candidates.append(os.path.join(comfy_root, "user", "config", name))
			candidates.append(os.path.join(comfy_root, "user", name))
			candidates.append(os.path.join(comfy_root, "config", name))
			candidates.append(os.path.join(comfy_root, name))
			candidates.append(os.path.join(os.path.dirname(__file__), "..", name))

		for candidate in candidates:
			if not candidate or not os.path.isfile(candidate):
				continue
			try:
				with open(candidate, "r", encoding="utf-8") as f:
					raw = "".join(line for line in f if not line.strip().startswith(("//", "#")))
					data = json.loads(raw)
				roots = data.get("allowed_roots", []) if isinstance(data, dict) else []
				if isinstance(roots, list):
					norm_roots = [os.path.abspath(os.path.expandvars(r)) for r in roots if isinstance(r, str)]
					if norm_roots:
						return norm_roots
			except Exception:
				pass
		return []

	@staticmethod
	def _is_under_dir(path: str, base: Optional[str]) -> bool:
		if not base:
			return False
		try:
			ap = os.path.abspath(path)
			bb = os.path.abspath(base)
			return os.path.commonpath([ap, bb]) == bb
		except Exception:
			return False

	@classmethod
	def validate_path(cls, path_to_validate: str) -> None:
		abs_path = os.path.abspath(path_to_validate)

		comfy_output = cls._get_comfy_dir("output")
		if comfy_output and cls._is_under_dir(abs_path, comfy_output):
			return

		comfy_temp = cls._get_comfy_dir("temp")
		if comfy_temp and cls._is_under_dir(abs_path, comfy_temp):
			return

		for root in cls._load_allowed_roots():
			if cls._is_under_dir(abs_path, root):
				return

		msg = (
			f"Invalid save location: '{path_to_validate}'. "
			"This node only allows saving inside ComfyUI's output directory, "
			"unless authorized in 'dehypnotic_save_allowed_paths.json'."
		)
		raise PermissionError(msg)


# -----------------------------------------------------------------------------#
# Server API Registration
# -----------------------------------------------------------------------------#

TEMP_SUBFOLDER = "dehypnotic_frame_save"

if PromptServer is not None:

	@PromptServer.instance.routes.post("/dehypnotic/frame_save/get_media_info")
	async def handle_get_media_info_request(request):
		try:
			data = await request.json()
			filename = data.get("filename", "").strip()

			if not filename or filename == "none":
				return web.json_response({"success": False, "error": "No filename provided"})

			input_dir = folder_paths.get_input_directory() if folder_paths else os.path.abspath("input")
			output_dir = folder_paths.get_output_directory() if folder_paths else os.path.abspath("output")

			target_file = None
			for candidate in [
				os.path.join(input_dir, filename),
				os.path.join(output_dir, filename),
				filename,
			]:
				if os.path.isfile(candidate):
					target_file = candidate
					break

			if not target_file:
				return web.json_response({"success": False, "error": "File not found"})

			ext = os.path.splitext(target_file)[1].lower()
			frame_count = 0

			if ext in {".mp4", ".mkv", ".webm", ".avi", ".mov", ".gif", ".webp"}:
				try:
					import cv2
					cap = cv2.VideoCapture(target_file)
					if cap.isOpened():
						frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
						cap.release()
				except Exception:
					pass

			if frame_count <= 0 and ext in {".gif", ".webp", ".png"}:
				try:
					from PIL import Image, ImageSequence
					with Image.open(target_file) as im:
						frame_count = sum(1 for _ in ImageSequence.Iterator(im))
				except Exception:
					pass

			if frame_count > 0:
				return web.json_response({"success": True, "frame_count": frame_count, "filename": filename})

			return web.json_response({"success": False, "error": "Could not determine frame count"})
		except Exception as e:
			return web.json_response({"success": False, "error": str(e)}, status=500)

	@PromptServer.instance.routes.post("/dehypnotic/frame_save/list_dirs")
	async def handle_list_dirs_request(request):
		try:
			data = await request.json()
			target_path = data.get("path", "")
			res = list_directory_contents(target_path)
			return web.json_response(res)
		except Exception as e:
			return web.json_response({"success": False, "error": str(e)}, status=500)

	@PromptServer.instance.routes.post("/dehypnotic/frame_save/browse_folder")
	async def handle_browse_folder_request(request):
		try:
			data = await request.json()
			current_path = data.get("current_path", "")
			selected_path = await asyncio.to_thread(open_native_folder_dialog, current_path)

			if selected_path:
				return web.json_response({"success": True, "path": selected_path})
			return web.json_response({"success": False, "error": "Folder selection cancelled."})
		except Exception as e:
			return web.json_response({"success": False, "error": str(e)}, status=500)

	@PromptServer.instance.routes.post("/dehypnotic/frame_save/save")
	async def handle_frame_save_request(request):
		try:
			data = await request.json()
			target_path = data.get("target_path", "").strip()
			filenames = data.get("filenames", [])

			if not filenames:
				return web.json_response(
					{"success": False, "error": "No images selected for saving."}, status=400
				)

			# Resolve and validate target path
			resolved_dir = PathValidator._resolve_out_dir(target_path)
			PathValidator.validate_path(resolved_dir)

			# Get temp directory source
			temp_base = folder_paths.get_temp_directory() if folder_paths else "temp"
			source_dir = os.path.join(temp_base, TEMP_SUBFOLDER)

			if not os.path.exists(source_dir):
				return web.json_response(
					{"success": False, "error": "Temporary image directory not found on server."}, status=400
				)

			os.makedirs(resolved_dir, exist_ok=True)
			saved_files = []

			for fname in filenames:
				clean_name = os.path.basename(fname)
				src_path = os.path.join(source_dir, clean_name)
				if not os.path.isfile(src_path):
					continue

				dst_path = os.path.join(resolved_dir, clean_name)
				shutil.copy2(src_path, dst_path)
				saved_files.append(str(dst_path))

			return web.json_response(
				{
					"success": True,
					"saved_count": len(saved_files),
					"target_path": resolved_dir,
					"saved_files": saved_files,
				}
			)
		except PermissionError as pe:
			return web.json_response({"success": False, "error": str(pe)}, status=403)
		except Exception as e:
			return web.json_response({"success": False, "error": f"Error while saving: {str(e)}"}, status=500)


# -----------------------------------------------------------------------------#
# Node Implementation
# -----------------------------------------------------------------------------#

class FrameSave:
	"""
	Saves incoming image sequence temporarily to temp folder (filtered by start_frame, end_frame, and frame_step).
	Provides interactive UI selection and saving.
	"""

	DESCRIPTION = (
		"Saves to ComfyUI/output by default. "
		"To allow external locations, create a file named dehypnotic_save_allowed_paths.json containing for example: "
		"{ \"allowed_roots\": [\"D:/ImageExports\", \"E:/TeamShare/Images\"] }. Place it in <ComfyUI>/user/config/. "
		"Read the Github repository for more info."
	)

	@classmethod
	def INPUT_TYPES(cls):
		return {
			"required": {
				"images": ("IMAGE",),
			},
			"optional": {
				"file_path": ("STRING", {"default": ""}),
				"start_frame": ("INT", {"default": 1, "min": 1, "max": 999999}),
				"end_frame": ("INT", {"default": 0, "min": 0, "max": 999999}),
				"frame_step": ("INT", {"default": 1, "min": 1, "max": 999999}),
			},
		}

	RETURN_TYPES = ()
	RETURN_NAMES = ()
	FUNCTION = "save"
	OUTPUT_NODE = True
	CATEGORY = "Dehypnotic/💾 IO"

	def save(
		self,
		images,
		file_path: str = "",
		start_frame: int = 1,
		end_frame: int = 0,
		frame_step: int = 1,
	):
		total_frames = len(images)
		if total_frames == 0:
			raise ValueError("Input 'images' batch is empty.")

		# Safe 1-indexed bounds calculation
		s_frame = max(1, min(total_frames, start_frame))

		if end_frame <= 0 or end_frame > total_frames:
			e_frame = total_frames
		else:
			e_frame = max(s_frame, min(total_frames, end_frame))

		if 0 < end_frame < s_frame:
			e_frame = s_frame

		step = max(1, frame_step)

		# Convert to 0-indexed slicing range: [s_idx, e_idx)
		s_idx = s_frame - 1
		e_idx = e_frame

		# Locate temp directory
		if folder_paths is not None:
			temp_base = folder_paths.get_temp_directory()
		else:
			temp_base = os.path.abspath("temp")

		temp_dir = os.path.join(temp_base, TEMP_SUBFOLDER)

		# Clear directory for old images every run
		if os.path.exists(temp_dir):
			for item in os.listdir(temp_dir):
				item_path = os.path.join(temp_dir, item)
				try:
					if os.path.isfile(item_path) or os.path.islink(item_path):
						os.unlink(item_path)
					elif os.path.isdir(item_path):
						shutil.rmtree(item_path)
				except Exception:
					pass
		else:
			os.makedirs(temp_dir, exist_ok=True)

		ui_images = []
		filtered_indices = list(range(s_idx, e_idx, step))

		# Fast PNG saving without slow optimize pass for responsive temp rendering
		for idx in filtered_indices:
			image_tensor = images[idx]
			pil_img = to_pil(image_tensor.cpu().numpy())
			fname = f"frame_{idx + 1:04d}.png"
			file_full_path = os.path.join(temp_dir, fname)

			pil_img.save(file_full_path, format="PNG", compress_level=1)

			ui_images.append({
				"filename": fname,
				"subfolder": TEMP_SUBFOLDER,
				"type": "temp",
				"frame_number": idx + 1,
			})

		return {
			"ui": {
				"frame_images": ui_images,
				"file_path": [file_path or ""],
				"start_frame": [s_frame],
				"end_frame": [e_frame],
				"frame_step": [step],
				"total_frames": [total_frames],
			}
		}
