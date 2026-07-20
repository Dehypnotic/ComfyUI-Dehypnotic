# save_image_multiformat.py
# ComfyUI node: Image Save (Multi-format)
#
# - Lagrer PNG / JPG / WEBP / GIF / BMP / TIFF via Pillow (som følger med ComfyUI)
# - Sekvensiell filnavngiving med padding og startverdi
# - Valgfri datobasert undermappe (strftime-mønster)
# - Kvalitet/optimering, WEBP lossless, DPI
# - Sekvensiell lagring bruker alltid automatisk increment
# - Embed workflow (PNG via tEXt/iTXt, WEBP via XMP)
# - Returnerer input-bildet (passthrough) og lagrede filstier (linjedelt streng)

import os
import re
import json
import time
import uuid
import typing as _t
from pathlib import Path
from typing import List, Optional

import numpy as np
from PIL import Image

# -----------------------------------------------------------------------------#
# Helpers
# -----------------------------------------------------------------------------#

VALID_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"]


def to_pil(img: np.ndarray) -> Image.Image:
	"""Trygg konvertering fra ComfyUI-tensor til PIL-bilde."""
	a = np.asarray(img)
	if a.dtype != np.uint8:
		a = np.clip(a, 0.0, 1.0)
		a = (a * 255.0).round().astype(np.uint8)
	mode = "RGBA" if a.ndim == 3 and a.shape[2] == 4 else "RGB"
	return Image.fromarray(a, mode=mode)


def next_seq_number(folder: Path, prefix: str, delim: str, padding: int) -> int:
	pattern = re.compile(rf"^{re.escape(prefix)}{re.escape(delim)}(\d{{{padding}}})\b")
	max_num = 0
	if folder.exists():
		for entry in folder.iterdir():
			if not entry.is_file():
				continue
			match = pattern.match(entry.stem)
			if not match:
				continue
			try:
				num = int(match.group(1))
			except ValueError:
				continue
			if num > max_num:
				max_num = num
	return max_num + 1


def _make_webp_xmp(workflow_json: str) -> bytes:
	from xml.sax.saxutils import escape

	payload = escape(workflow_json)
	xmp = (
		'<?xpacket begin="\\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
		'<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
		' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
		'  <rdf:Description xmlns:comfy="https://comfy.org/ns/1.0/">\n'
		f'   <comfy:Workflow>{payload}</comfy:Workflow>\n'
		'  </rdf:Description>\n'
		' </rdf:RDF>\n'
		'</x:xmpmeta>\n'
		'<?xpacket end="w"?>'
	)
	return xmp.encode("utf-8")


# -----------------------------------------------------------------------------#
# Node
# -----------------------------------------------------------------------------#


class SaveImages:
	"""Lagrer bilder til disk i flere formater med sekvensiell navngiving."""

	@classmethod
	def INPUT_TYPES(cls):
		return {
			"required": {
				"images": ("IMAGE",),
				"file_path": ("STRING", {"default": ""}),
				"date_subfolder_pattern": ("STRING", {"default": "%Y-%m-%d"}),
				"filename_prefix": ("STRING", {"default": "QIE"}),
				"filename_delimiter": ("STRING", {"default": "_"}),
				"number_padding": ("INT", {"default": 4, "min": 1, "max": 10}),
				"number_start": ("INT", {"default": 1, "min": 0, "max": 1_000_000}),
				"extension": (tuple(VALID_EXTS), {"default": "png"}),
				"quality": ("INT", {"default": 100, "min": 1, "max": 100}),
				"optimize_image": ("BOOLEAN", {"default": True}),
				"lossless_webp": ("BOOLEAN", {"default": True}),
				"dpi": ("INT", {"default": 300, "min": 1, "max": 1200}),
				"embed_workflow": ("BOOLEAN", {"default": False}),
			},
		}

	RETURN_TYPES = ("IMAGE", "STRING")
	RETURN_NAMES = ("images", "saved_path")
	FUNCTION = "save"
	OUTPUT_NODE = True
	CATEGORY = "Dehypnotic/💾 IO"

	def _save_single_image(
		self,
		pil_img: Image.Image,
		path: Path,
		ext: str,
		quality: int,
		optimize: bool,
		lossless_webp: bool,
		dpi: int,
		embed_workflow: bool,
		workflow_data: Optional[str],
	) -> None:
		self._validate_path_is_allowed(str(path))

		ext_l = ext.lower()
		save_kwargs: dict = {}

		if dpi and dpi > 0:
			save_kwargs["dpi"] = (dpi, dpi)

		if ext_l in ("jpg", "jpeg"):
			save_kwargs["quality"] = int(quality)
			save_kwargs["optimize"] = bool(optimize)
			pil_img = pil_img.convert("RGB")
		elif ext_l == "png":
			save_kwargs["optimize"] = bool(optimize)
		elif ext_l == "webp":
			if lossless_webp:
				save_kwargs["lossless"] = True
			else:
				save_kwargs["quality"] = int(quality)

		if ext_l == "png":
			try:
				from PIL import PngImagePlugin

				meta = PngImagePlugin.PngInfo()
				if embed_workflow and workflow_data:
					meta.add_text("workflow", workflow_data)
				if meta.text:
					pil_img.save(path, format="PNG", pnginfo=meta, **save_kwargs)
					return
			except Exception:
				pass

		if ext_l == "webp" and embed_workflow and workflow_data:
			try:
				xmp_bytes = _make_webp_xmp(workflow_data)
				pil_img.save(path, format="WEBP", xmp=xmp_bytes, **save_kwargs)
				return
			except TypeError:
				pass

		save_format = ext_l.upper()
		if save_format == "JPG":
			save_format = "JPEG"
		pil_img.save(path, format=save_format, **save_kwargs)

	# --- Whitelist Path Logic (ported fra audio-node) ---

	def _get_comfy_dir(self, name: str) -> _t.Optional[str]:
		try:
			import folder_paths
			getter = getattr(folder_paths, f"get_{name}_directory", None)
			if callable(getter):
				return getter()
			if name in getattr(folder_paths, "folder_names_and_paths", {}):
				return folder_paths.folder_names_and_paths[name][0]
		except Exception:
			pass
		return None

	def _get_comfy_root(self) -> str:
		comfy_output = self._get_comfy_dir("output")
		if comfy_output:
			return os.path.abspath(os.path.join(comfy_output, os.pardir))
		return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

	def _resolve_out_dir(self, path: str) -> str:
		if not path or not path.strip():
			return self._get_comfy_dir("output")
		if os.path.isabs(path):
			return path
		comfy_root = self._get_comfy_root()
		path_norm = path.replace("/", os.sep).replace("\\", os.sep)
		if path_norm.startswith("output" + os.sep):
			return os.path.join(comfy_root, path)
		base_output = self._get_comfy_dir("output")
		return os.path.join(base_output, path)

	def _load_allowed_roots(self) -> _t.List[str]:
		env_cfg = os.environ.get("DEHYPNOTIC_SAVE_ALLOWED_PATHS")
		candidates: List[str] = []
		if env_cfg and os.path.isfile(env_cfg):
			candidates.append(env_cfg)

		comfy_root = self._get_comfy_root()
		names = (
			"dehypnotic_save_allowed_paths.json",
			"allowed_paths.json",
		)
		for name in names:
			candidates.append(os.path.join(comfy_root, "user", "config", name))
			candidates.append(os.path.join(comfy_root, "user", name))
			candidates.append(os.path.join(comfy_root, "config", name))
			candidates.append(os.path.join(comfy_root, name))
			candidates.append(os.path.join(os.path.dirname(__file__), name))

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

	def _is_under_dir(self, path: str, base: str) -> bool:
		if not base:
			return False
		try:
			ap = os.path.abspath(path)
			bb = os.path.abspath(base)
			return os.path.commonpath([ap, bb]) == bb
		except Exception:
			return False

	def _validate_path_is_allowed(self, path_to_validate: str) -> None:
		abs_path = os.path.abspath(path_to_validate)

		comfy_output = self._get_comfy_dir("output")
		if self._is_under_dir(abs_path, comfy_output):
			return
		comfy_temp = self._get_comfy_dir("temp")
		if self._is_under_dir(abs_path, comfy_temp):
			return
		for root in self._load_allowed_roots():
			if self._is_under_dir(abs_path, root):
				return
		msg = (
			"External save path is not allowed.\n"
			"This node only writes inside ComfyUI's output directory, "
			"unless the path is whitelisted offline.\n\n"
			"To allow external locations, create/edit a JSON file named "
			"'dehypnotic_save_allowed_paths.json' in your ComfyUI root (or user/config) folder "
			"with content like:\n\n"
			'{\n  "allowed_roots": ["D:/ImageExports", "E:/TeamShare/Output"]\n}\n\n'
			"You can also set the DEHYPNOTIC_SAVE_ALLOWED_PATHS environment variable to point to this file."
		)
		raise PermissionError(msg)

	def _get_workflow_json(self) -> Optional[str]:
		for attr in ("workflow", "workflow_json", "workflow_str"):
			if hasattr(self, attr):
				value = getattr(self, attr)
				if isinstance(value, str) and value.strip():
					return value
		env_v = os.environ.get("COMFY_WORKFLOW_JSON")
		if env_v and env_v.strip():
			return env_v
		return None

	def _build_template_context(self) -> dict:
		return {
			"unix": str(int(time.time())),
			"guid": uuid.uuid4().hex,
			"uuid": uuid.uuid4().hex,
			"model": "unknown",
		}

	def _expand_path_templates(self, text: str, context: dict | None = None) -> str:
		if not isinstance(text, str):
			return text

		ctx = context or {}

		def repl_time(match):
			fmt = match.group(1)
			try:
				return time.strftime(fmt)
			except Exception:
				return time.strftime("%Y%m%d_%H%M%S")

		out = re.sub(r"[[]time\[(.*?)\]\]", repl_time, text)
		out = out.replace("[date]", time.strftime("%Y-%m-%d"))
		out = out.replace("[datetime]", time.strftime("%Y-%m-%d_%H-%M-%S"))
		out = out.replace("[unix]", ctx.get("unix", str(int(time.time()))))
		out = out.replace("[guid]", ctx.get("guid", uuid.uuid4().hex))
		out = out.replace("[uuid]", ctx.get("uuid", uuid.uuid4().hex))
		out = out.replace("[model]", ctx.get("model", "unknown"))

		def repl_env(match):
			name = match.group(1) or ""
			return os.environ.get(name, "")

		out = re.sub(r"[[]env\[(.*?)\]\]", repl_env, out)
		return out

	def _render_date_subfolder(self, pattern: str, context: dict | None = None) -> str:
		expanded = self._expand_path_templates(pattern or "", context).strip()
		if not expanded:
			return ""
		try:
			return time.strftime(expanded)
		except Exception:
			return expanded

	def save(
		self,
		images,
		file_path,
		date_subfolder_pattern,
		filename_prefix,
		filename_delimiter,
		number_padding,
		number_start,
		extension,
		quality,
		optimize_image,
		lossless_webp,
		dpi,
		embed_workflow,
	):
		context = self._build_template_context()
		expanded_file_path = self._expand_path_templates(file_path, context)
		expanded_prefix = self._expand_path_templates(filename_prefix, context)

		base_dir = self._resolve_out_dir(expanded_file_path)
		date_subfolder = self._render_date_subfolder(date_subfolder_pattern, context)
		if date_subfolder:
			base_dir = os.path.join(base_dir, date_subfolder)

		prefix_dir_part = os.path.dirname(expanded_prefix)
		final_dir = os.path.join(base_dir, prefix_dir_part)
		final_dir_path = Path(os.path.abspath(final_dir))
		final_dir_path.mkdir(parents=True, exist_ok=True)

		base_prefix = os.path.basename(expanded_prefix)
		seq = max(number_start, next_seq_number(final_dir_path, base_prefix, filename_delimiter, number_padding))

		workflow_json = self._get_workflow_json() if embed_workflow else None

		saved_paths: List[str] = []
		for image_tensor in images:
			pil_img = to_pil(image_tensor.cpu().numpy())

			stem = f"{base_prefix}{filename_delimiter}{seq:0{number_padding}d}"
			filename = f"{stem}.{extension.lower()}"
			path = final_dir_path / filename

			while path.exists():
				seq += 1
				stem = f"{base_prefix}{filename_delimiter}{seq:0{number_padding}d}"
				filename = f"{stem}.{extension.lower()}"
				path = final_dir_path / filename

			self._save_single_image(
				pil_img=pil_img,
				path=path,
				ext=extension,
				quality=quality,
				optimize=optimize_image,
				lossless_webp=lossless_webp,
				dpi=dpi,
				embed_workflow=embed_workflow,
				workflow_data=workflow_json,
			)

			saved_paths.append(str(path))
			seq += 1

		return (images, "\n".join(saved_paths))

