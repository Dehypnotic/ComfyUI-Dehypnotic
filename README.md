# ComfyUI-Dehypnotic Custom Nodes

A suite of feature-rich, high-performance custom nodes for [ComfyUI](https://github.com/comfyanonymous/ComfyUI). This repository provides enhanced nodes for image, video, audio saving, dynamic aspect ratio calculation, wireless data rerouting, and text generation.

---

## Table of Contents

- [Nodes Overview](#nodes-overview)
  - [🧘 AspectRatio (Dehypnotic)](#-aspectratio-dehypnotic)
  - [🧘 Set Dehypnotic & Get Dehypnotic](#-set-dehypnotic--get-dehypnotic)
  - [🧘 NumberedText (Dehypnotic)](#-numberedtext-dehypnotic)
  - [🧘 RangeToString (Dehypnotic)](#-rangetostring-dehypnotic)
  - [🧘 Save MP3 (Dehypnotic)](#-save-mp3-dehypnotic)
  - [🧘 Save Images (Dehypnotic)](#-save-images-dehypnotic)
  - [🧘 Save Video & Frames (Dehypnotic)](#-save-video--frames-dehypnotic)
- [Installation](#installation)
- [License](#license)

---

## Nodes Overview

### 🧘 AspectRatio (Dehypnotic)
**Class Name**: `AspectRatioAdvancedV2` / `dehypnotic_AspectRatio`  
**Category**: `Dehypnotic/📐 Aspect Ratio`

A flexible aspect ratio and resolution generator node with interactive frontend controls, visual aspect ratio presets, image reference scaling, grid snapping, and VAE encoding support.

#### Key Features:
- **Preset & Custom Ratio Modes**: Choose standard presets (1:1, 16:9, 4:3, etc.) or set custom width/height ratios and dimensions.
- **Reference Image Scaling**: Connect an optional input `IMAGE` to scale it to the calculated aspect ratio/dimensions using Lanczos, Bicubic, Bilinear, Area, or Nearest Exact interpolation.
- **Grid Snapping**: Automatically rounds dimensions to the nearest multiple of 8, 16, 32, or 64 (ideal for diffusion models like SD1.5, SDXL, FLUX, etc.).
- **Optional VAE Encoding**: Connect a `VAE` model to directly encode the scaled image into a `LATENT` representation.

#### Inputs & Outputs:
| Type | Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **Optional Input** | `image` | `IMAGE` | Reference image to measure ratio from or scale. |
| **Optional Input** | `vae` | `VAE` | VAE model for direct latent encoding. |
| **Output** | `width` | `INT` | Calculated width in pixels (snapped). |
| **Output** | `height` | `INT` | Calculated height in pixels (snapped). |
| **Output** | `latent` | `LATENT` | Encoded latent (if VAE input and encoding are enabled). |
| **Output** | `scaled_image` | `IMAGE` | Resized reference image matching the target dimensions. |

---

### 🧘 Set Dehypnotic & Get Dehypnotic
**Class Name**: `DehypnoticSetNode`, `DehypnoticGetNode`  
**Category**: `Dehypnotic/🔀 Wireless Links`

Wireless routing nodes designed to keep your ComfyUI node graphs organized, readable, and free of crossing connection wires ("spaghetti cables").

#### Key Features:
- **Universal Data Support**: Works with any ComfyUI data type (`IMAGE`, `LATENT`, `MODEL`, `CLIP`, `CONDITIONING`, `INT`, `FLOAT`, `STRING`, custom types, etc.).
- **Virtual Node Architecture**: Operates on the frontend with zero backend execution overhead. ComfyUI automatically resolves connections directly from the source during graph execution.
- **Passthrough Output**: `Set Dehypnotic` outputs the connected value so you can chain nodes without extra splits.

#### How to Use:
1. Attach any output to a `Set Dehypnotic` node and enter a variable name.
2. Place a `Get Dehypnotic` node anywhere in your graph, select the variable name from the dropdown, and connect its output to your target node.

---

### 🧘 NumberedText (Dehypnotic)
**Class Name**: `NumberedText` / `dehypnotic_NumberedText`  
**Category**: `Dehypnotic/📝 Text Utils`

A prompt management and text block organizer node. Allows writing multi-line text entries with interactive checkbox toggles to selectively combine prompts.

#### Key Features:
- **Interactive Numbered Blocks**: Create new numbered entries using `Enter`. Create multi-line sub-texts within the same item using `Shift + Enter`.
- **Selective Output**: Toggle checkboxes (`[x]` / `[ ]`) next to numbered items. Only checked text items are combined and output.
- **Custom Delimiters**: Joins active text blocks using any custom separator (e.g., `, `, `\n`, ` | `).
- **Line Swapping**: Quick UI shortcuts to swap the content of any two numbered items.

#### Inputs & Outputs:
| Type | Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `text` | `STRING` (Multiline) | Multi-line structured text containing numbered/checked entries. |
| **Required Input** | `separator` | `STRING` | Delimiter string used to join active blocks (supports `\n`, `\t`). |
| **Output** | `text` | `STRING` | Combined text of all active (checked) items. |

---

### 🧘 RangeToString (Dehypnotic)
**Class Name**: `RangeToString` / `dehypnotic_RangeToString`  
**Category**: `Dehypnotic/📝 Text Utils`

Generates a formatted string representing a numerical sequence. Useful for batching, prompt scheduling, frame indices, or automated parameter sweeps.

#### Key Features:
- Supports forward and reverse numerical ranges (positive or negative steps).
- Configurable range boundary rules (`inclusive` or `exclusive`).
- Customizable delimiter string.

#### Inputs & Outputs:
| Type | Name | Options / Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Required Input** | `start` | `INT` | `0` | Starting integer value. |
| **Required Input** | `end` | `INT` | `3` | Ending integer boundary. |
| **Required Input** | `step` | `INT` | `1` | Increment/decrement step (cannot be 0). |
| **Required Input** | `separator` | `STRING` | `,` | Delimiter string inserted between numbers. |
| **Required Input** | `mode` | `["inclusive", "exclusive"]` | `inclusive` | Whether to include the `end` value in output. |
| **Output** | `STRING` | `STRING` | - | Generated sequence string (e.g. `"0,1,2,3"`). |

---

### 🧘 Save MP3 (Dehypnotic)
**Class Name**: `SaveAudioMP3Dehypnotic`  
**Category**: `Dehypnotic/💾 IO`

A specialized audio output node for encoding audio inputs directly to MP3 format with flexible bitrate controls and path templating.

#### Key Features:
- **Audio Format Auto-Normalization**: Handles mono/stereo inputs, arbitrary sample rates, numpy arrays, and PyTorch audio tensors seamlessy.
- **Encoder Fallbacks**: Uses `imageio-ffmpeg` or system FFmpeg binary, with automatic fallback to `lameenc`.
- **Bitrate Modes & Quality Levels**: Supports `variable` (VBR), `constant` (CBR), and `average` (ABR) encoding across `low`, `medium`, and `high` quality presets.
- **Dynamic Path Expansion**: Supports date placeholders (`%Y-%m-%d`), timestamp variables, environment variables, and unique IDs in output paths.

#### Inputs & Outputs:
| Type | Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `audio` | `AUDIO` | Audio input stream or dictionary structure. |
| **Required Input** | `file_path` | `STRING` | Output directory path. |
| **Required Input** | `date_subfolder_pattern` | `STRING` | Strftime pattern for subfolders (e.g., `%Y-%m-%d`). |
| **Required Input** | `filename_prefix` | `STRING` | Filename prefix (e.g., `ComfyUI`). |
| **Required Input** | `bitrate_mode` | `["variable", "constant", "average"]` | MP3 encoding strategy. |
| **Required Input** | `quality` | `["low", "medium", "high"]` | Audio quality / target bitrate setting. |
| **Output** | `audio` | `AUDIO` | Passthrough of input audio data. |
| **Output** | `bitrate_info` | `STRING` | Detailed summary of encoding parameters used. |

---

### 🧘 Save Images (Dehypnotic)
**Class Name**: `SaveImagesDehypnotic`  
**Category**: `Dehypnotic/💾 IO`

An advanced multi-format image saving node featuring sequence numbering, date-based folder grouping, image optimization, and workflow metadata embedding.

#### Key Features:
- **Multi-Format Export**: Supports PNG, JPG/JPEG, WEBP, GIF, BMP, and TIFF formats.
- **Workflow Metadata Embedding**: Embeds full ComfyUI workflow metadata into PNG (via `tEXt` chunks) and WebP images (via XMP metadata).
- **Sequential File Naming**: Automatic file index incrementing with customizable zero-padding (e.g. `0001`, `0002`) and prefix/delimiter settings.
- **Quality & Compression Controls**: Configurable image quality percentage, WEBP lossless encoding option, PNG/JPG image optimization, and custom DPI metadata.

#### Inputs & Outputs:
| Type | Name | Default | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `images` | - | Input image batch (`IMAGE`). |
| **Required Input** | `file_path` | `""` | Destination folder path (relative or absolute). |
| **Required Input** | `date_subfolder_pattern` | `%Y-%m-%d` | Strftime pattern for dated subfolders. |
| **Required Input** | `filename_prefix` | `QIE` | Prefix for saved file names. |
| **Required Input** | `filename_delimiter` | `_` | Separator between prefix and index number. |
| **Required Input** | `number_padding` | `4` | Number of digits for index padding (1–10). |
| **Required Input** | `number_start` | `1` | Initial sequence number. |
| **Required Input** | `extension` | `png` | Image format (`png`, `jpg`, `webp`, `gif`, `bmp`, `tiff`). |
| **Required Input** | `quality` | `100` | Output compression quality (1–100). |
| **Required Input** | `optimize_image` | `True` | Enable image optimization pass. |
| **Required Input** | `lossless_webp` | `True` | Enable lossless encoding for WebP images. |
| **Required Input** | `dpi` | `300` | Set DPI resolution metadata. |
| **Required Input** | `embed_workflow` | `False` | Embed ComfyUI workflow JSON into metadata. |
| **Output** | `images` | `IMAGE` | Passthrough input images tensor. |
| **Output** | `saved_path` | `STRING` | Line-separated paths of all saved files on disk. |

---

### 🧘 Save Video & Frames (Dehypnotic)
**Class Name**: `SaveVideoDehypnotic`  
**Category**: `Dehypnotic/💾 IO`

A comprehensive video renderer and frame exporter node leveraging bundled `imageio-ffmpeg` for high quality video generation with optional audio multiplexing.

#### Key Features:
- **Multiple Containers & Professional Codecs**:
  - Containers: `mp4`, `mkv`, `webm`, `mov`.
  - Codecs: H.264 (`libx264`), H.265/HEVC (`libx265`), VP9 (`libvpx-vp9`), AV1 (`libaom-av1`), ProRes 422 HQ (`prores_ks`), DNxHR HQ (`dnxhr_hq`).
- **Flexible Modes (`save_mode`)**: Choose to export `video`, individual `frames`, or `video & frames` simultaneously.
- **Audio Integration & Single-Frame Looping**: Attach mono or stereo `AUDIO`. If a single image frame and an audio track are provided, the node automatically loops the frame for the full duration of the audio.
- **Frame Extraction & Selection**: Extract specific frames (e.g. first frame `0`, last frame `-2`, all frames `-1`, or explicit lists like `0,5,10`) to a subfolder during video export.
- **Quality & Performance Tuning**: CRF (Constant Rate Factor) quality control, encoder speed presets (`ultrafast` to `veryslow`), and optional frame preview rendering in the node output.

#### Key Inputs & Outputs:
| Type | Name | Default / Options | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `save_mode` | `video`, `frames`, `video & frames` | Export mode selection. |
| **Required Input** | `images` | `IMAGE` | Input video frame batch. |
| **Required Input** | `file_path` | `output/video` | Output destination folder. |
| **Required Input** | `container` | `mp4`, `mkv`, `webm`, `mov` | Target video container format. |
| **Required Input** | `video_codec` | `h264`, `h265`, `vp9`, `av1`, `prores`, `dnxhr` | Video codec for encoding. |
| **Required Input** | `fps` | `24` | Target framerate (1–240 FPS). |
| **Required Input** | `crf` | `23` | Quality factor (lower = higher quality, 0–51). |
| **Required Input** | `preset` | `fast` (`ultrafast` ... `veryslow`) | Encoder speed vs. compression efficiency. |
| **Optional Input** | `audio` | `AUDIO` | Optional audio track to mux into video. |
| **Optional Input** | `loop_still_to_audio` | `True` | Loop single image to match audio duration. |
| **Optional Input** | `frames_dir` | `""` | Subfolder name for extracted image frames. |
| **Optional Input** | `frames_select` | `"-2"` | Frame selection criteria (`-2` last, `-1` all, `0` first, or list). |
| **Output** | `images` | `IMAGE` | Passthrough image batch (or preview sequence). |
| **Output** | `video_path` | `STRING` | File path of the saved output video. |

---

## Security and external save paths (ComfyUI Manager compliant)
- By default, saving is allowed under ComfyUI’s `output/` directory.
- To allow external locations (e.g., other drives), create a local JSON file next to this node named `dehypnotic_save_allowed_paths.json` with:
  ```json
  { "allowed_roots": ["D:/AudioExports", "E:/TeamShare/Audio"] }
  ```
Alternatively (advanced): you can set the environment variable `SAVE_MP3_ALLOWED_PATHS` to point to the JSON file. This is optional — for most users it’s enough to place the JSON file next to the node or in one of the global ComfyUI locations listed below.
- You can also place the file globally under your ComfyUI root:
  - `<ComfyUI>/dehypnotic_save_allowed_paths.json`
  - `<ComfyUI>/config/dehypnotic_save_allowed_paths.json`
  - `<ComfyUI>/user/dehypnotic_save_allowed_paths.json`
  - `<ComfyUI>/user/config/dehypnotic_save_allowed_paths.json`
- The node refuses writes outside `output/` unless the path is under one of the whitelisted roots. Edit this file offline and restart ComfyUI.

Whitelist behavior and safety
- Recommended location under ComfyUI root (e.g., `ComfyUI/config/`) so it survives node updates.
- Loader lookup order: env var → global ComfyUI locations → node folder.
- A node‑local file is used only if it defines at least one allowed root; empty example files are ignored.
- Lines starting with `#` are treated as comments in the JSON file.
- An allowed root permits saving in that folder and all subfolders; whitelist a deeper path to restrict more tightly.

Path and filename templates
Placeholders supported in `file_path` and `filename_prefix`:
- `[time(%Y-%m-%d)]` → formatted time (strftime)
- `[date]` → `YYYY-MM-DD`
- `[datetime]` → `YYYY-MM-DD_HH-MM-SS`
- `[unix]` → epoch seconds
- `[guid]` / `[uuid]` → random UUID4 hex
- `[model]` → tries `extra_pnginfo` keys: `model`, `checkpoint`, `ckpt_name`, `model_name`; else `unknown`
- `[env(NAME)]` → environment variable `NAME`

Examples
- `audio/[time(%Y-%m-%d)]`
- `runs/[model]/[datetime]`
- `D:/Exports/[env(USERNAME)]/[guid]`

---

## Installation

1. Navigate to your ComfyUI `custom_nodes` directory:
   ```bash
   cd ComfyUI/custom_nodes
   ```
2. Clone this repository:
   ```bash
   git clone https://github.com/your-username/ComfyUI-Dehypnotic.git
   ```
3. Restart ComfyUI.

---

## License

MIT License. Feel free to modify and adapt these custom nodes for your ComfyUI workflows.
