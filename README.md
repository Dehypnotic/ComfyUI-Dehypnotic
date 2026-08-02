#### Important: This is my only repository now, so delete any old folders (comfyui-aspect-ratio-advanced, comfyui-numbered-text, comfyui-range-to-string, or comfyui-dehypnotic-save-nodes) you may have in ComfyUI\custom_nodes to avoid conflicts. 

# ComfyUI-Dehypnotic Custom Nodes

A suite of feature-rich, high-performance custom nodes for [ComfyUI](https://github.com/comfyanonymous/ComfyUI). This repository provides nodes for image, video, audio saving, dynamic aspect ratio calculation, wireless data rerouting, and text generation.

---

## Table of Contents

- [Nodes Overview](#nodes-overview)
  - [🧘 AspectRatio (Dehypnotic)](#-aspectratio-dehypnotic)
  - [🧘 Set Dehypnotic & Get Dehypnotic](#-set-dehypnotic--get-dehypnotic)
  - [🧘 NumberedText (Dehypnotic)](#-numberedtext-dehypnotic)
  - [🧘 Text (Dehypnotic)](#-text-dehypnotic)
  - [🧘 RangeToString (Dehypnotic)](#-rangetostring-dehypnotic)
  - [🧘 Save Audio (Dehypnotic)](#-save-audio-dehypnotic)
  - [🧘 Save Images (Dehypnotic)](#-save-images-dehypnotic)
  - [🧘 FrameSave (Dehypnotic)](#-framesave-dehypnotic)
  - [🧘 Load Video (Dehypnotic)](#-load-video-dehypnotic)
  - [🧘 Save Video (Dehypnotic)](#-save-video-dehypnotic)
  - [🧘 SonicColor Noise (Dehypnotic)](#-soniccolor-noise-dehypnotic)
- [Security and External Save Paths](#security-and-external-save-paths-comfyui-manager-compliant)
- [Installation](#installation)
- [License](#license)

---

## Nodes Overview

### 🧘 AspectRatio (Dehypnotic)
**Class Name**: `AspectRatio` / `dehypnotic_AspectRatio`  
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

<table cellspacing="0" cellpadding="0" style="width:100%">
  <tr>
    <th><img width="310" height="654" alt="image" src="https://github.com/user-attachments/assets/54c66c6f-fc14-4c14-a4ee-39a8eaacc2b7" /></th>
    <th><img width="309" height="659" alt="image" src="https://github.com/user-attachments/assets/b10afae3-a249-42e8-8644-6652f4bd4211" /></th>
    <th><img width="316" height="659" alt="image" src="https://github.com/user-attachments/assets/746cc7ff-3a55-4fe5-b4e5-89ea7c33729c" /></th>
    <th><img width="312" height="652" alt="image" src="https://github.com/user-attachments/assets/f3b08a28-c996-47b8-ac3e-a5aa1eb66d44" /></th>
  </tr>
</table>

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

<img width="517" height="112" alt="image" src="https://github.com/user-attachments/assets/341d46ed-7c25-4fd8-8466-311d476ce4d4" />

---

### 🧘 NumberedText (Dehypnotic)
**Class Name**: `NumberedText` / `dehypnotic_NumberedText`  
**Category**: `Dehypnotic/📝 Text Utils`

A prompt management and text block organizer node. Allows writing multi-line text entries with interactive checkbox toggles to selectively combine prompts. Now features a robust preset saving system.

#### Key Features:
- **Interactive Numbered Blocks**: Create new numbered entries using `Enter`. Create multi-line sub-texts within the same item using `Shift + Enter`.
- **Selective Output**: Toggle checkboxes (`[x]` / `[ ]`) next to numbered items. Only checked text items are combined and output.
- **Preset Management**: Save and load your text lists as `.json` files directly from the UI. A dropdown picker lets you easily load, update, or delete saved files. Automatically creates and stores files under `ComfyUI/user/Dehypnotic/numbered_text/`.
- **Custom Delimiters**: Joins active text blocks using any custom separator (e.g., `, `, `\n`, ` | `).
- **Swap & Clone Operations**: Quick UI shortcuts to swap the content of any two numbered items, or clone one to another. Steppers start at `1` by default and their values persist after execution. The second index's max value is set to `1` more than the current sequence size, enabling swapping or cloning directly to a new item. Operation on non-existent entries behaves as if they were empty.
- **Quick Operations**: Dedicated buttons to "Check All", "Uncheck All", "Copy Checked" to clipboard, "Delete Checked" lines, and "Paste New" to paste clipboard text directly as the next sequence item.

#### Inputs & Outputs:
| Type | Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `text` | `STRING` (Multiline) | Multi-line structured text containing numbered/checked entries. |
| **Required Input** | `separator` | `STRING` | Delimiter string used to join active blocks (supports `\n`, `\t`). |
| **Output** | `text` | `STRING` | Combined text of all active (checked) items. |

<img width="792" height="406" alt="image" src="https://github.com/user-attachments/assets/34e4fc59-fa0e-4ff9-88d8-bec990940c59" />

---

### 🧘 Text (Dehypnotic)
**Class Name**: `Text`  
**Category**: `Dehypnotic/📝 Text Utils`

A pure text block node equipped with a plain multi-line text editor, built-in file saving/loading (`.txt` files), and clipboard convenience buttons.

#### Key Features:
- **Plain Text Editor**: Just a classic text field without numbers or checkboxes.
- **Preset Management**: Load and save plain text as `.txt` files directly from the UI dropdown. Automatically creates and stores files under `ComfyUI/user/Dehypnotic/text/`.
- **Quick Operations & Input Toggle**: Dedicated "Input ON / Input OFF" toggle button (placed next to Copy) to easily enable or disable incoming text from `text_in` without disconnecting wires. Also includes "Copy", "Paste", and "Clear" buttons at the bottom.
- **Dynamic Text Replacing**: An optional `text_in` input (displayed as `text` on the node). When `Input ON` is active (default), text provided from another node will replace the text in this node upon execution. When `Input OFF` is active, incoming text is ignored and the text in the editor remains unchanged.

#### Inputs & Outputs:
| Type | Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **Optional Input** | `text_in` (UI: `text`) | `STRING` | Incoming text that replaces the node's current text when `Input ON` is active. |
| **Optional Input** | `input_on` | `BOOLEAN` | Controls whether incoming `text_in` is processed (`True`/`Input ON`) or ignored (`False`/`Input OFF`). |
| **Output** | `text` | `STRING` | The output plain text. |

<img width="380" height="358" alt="image" src="https://github.com/user-attachments/assets/560f9216-215b-415c-832f-e08c6210fb1c" />

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

<img width="377" height="220" alt="image" src="https://github.com/user-attachments/assets/e3c2dd40-d556-4999-8510-7ad6a63117cb" />


---

### 🧘 Save Audio (Dehypnotic)
**Class Name**: `SaveAudioMP3`  
**Category**: `Dehypnotic/💾 IO`

A specialized, multi-format audio output node with dynamic UI and built-in playback. Seamlessly encode audio to MP3, WAV, FLAC, or Opus.

#### Key Features:
- **Multi-Format Support**: Save audio as MP3, WAV (16-bit or 24-bit), FLAC, or Opus.
- **Dynamic Interface**: The node's widget layout automatically adapts to show only the settings relevant to the selected audio format, keeping your graph clean.
- **Inline Audio Player**: Preview your saved audio directly inside the ComfyUI node. Includes play/pause, seek bar, volume control, and an autoplay toggle.
- **Preview Only Mode**: Toggle `preview_only` (`on`/`off`) to audition/preview audio streams in the built-in player without saving output files to disk (`off` by default).
- **Format-Specific Tuning**:
  - MP3: `variable` (VBR), `constant` (CBR), and `average` (ABR) encoding across `low`, `medium`, and `high` quality.
  - WAV/FLAC: Choose target sample rate and 16-bit or 24-bit depth.
  - FLAC: Configurable compression level.
  - Opus: Configurable bitrate, application mode (`audio` or `voip`), and VBR toggle.
- **Audio Format Auto-Normalization**: Handles mono/stereo inputs, arbitrary sample rates, numpy arrays, and PyTorch audio tensors seamlessly via FFmpeg.
- **Dynamic Path Expansion**: Supports date placeholders (`%Y-%m-%d`), timestamp variables, environment variables, and unique IDs in output paths.

#### Inputs & Outputs:
| Type | Name | Options / Type | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `audio` | `AUDIO` | Audio input stream or dictionary structure. |
| **Required Input** | `file_path` | `STRING` | Output directory path. |
| **Required Input** | `date_subfolder_pattern` | `STRING` | Strftime pattern for subfolders (e.g., `%Y-%m-%d`). |
| **Required Input** | `filename_prefix` | `STRING` | Filename prefix (e.g., `ComfyUI`). |
| **Required Input** | `autoplay` | `["on", "off"]` | Toggle automatic playback in the node player after generation. |
| **Required Input** | `preview_only` | `["on", "off"]` | Skip saving audio file to disk while keeping player preview functionality (`off` by default). |
| **Required Input** | `format` | `["mp3", "wav", "flac", "opus"]` | Desired output audio format. |
| **Dynamic Input** | `bitrate_mode` | `["variable", "constant", "average"]` | MP3: Encoding strategy. |
| **Dynamic Input** | `quality` | `["low", "medium", "high"]` | MP3: Audio quality / target bitrate. |
| **Dynamic Input** | `sample_rate` | `["source", "16000", "22050", ...]` | WAV/FLAC: Target sample rate in Hz. |
| **Dynamic Input** | `bit_depth` | `["16", "24"]` | WAV/FLAC: Audio bit depth. |
| **Dynamic Input** | `flac_compression`| `INT` | FLAC: Compression level from 0 (fast/large) to 8 (slow/small). |
| **Dynamic Input** | `opus_bitrate` | `INT` | Opus: Target bitrate (kbps). |
| **Dynamic Input** | `opus_application`| `["audio", "voip"]` | Opus: Optimization mode. |
| **Dynamic Input** | `opus_vbr` | `["on", "off"]` | Opus: Variable bitrate toggle. |
| **Output** | `audio` | `AUDIO` | Passthrough of input audio data. |
| **Output** | `format_info` | `STRING` | Detailed summary of encoding parameters used. |

<table cellspacing="0" cellpadding="0" style="width:100%">
  <tr valign=top>
    <th><img width="333" height="403" alt="image" src="https://github.com/user-attachments/assets/cb8c3c75-a4b2-4bdb-94ec-9ee614a37d6a" /></th>
    <th><img width="331" height="404" alt="image" src="https://github.com/user-attachments/assets/292e4db5-bcf5-4c67-822c-9a79e7979a56" /></th>
    <th><img width="330" height="428" alt="image" src="https://github.com/user-attachments/assets/3c6215d5-a870-4638-a347-bb80109faf65" /></th>
    <th><img width="334" height="426" alt="image" src="https://github.com/user-attachments/assets/b2e149a5-4b91-476a-933d-f1610dbedac6" /></th>
  </tr>
</table>

---

### 🧘 Save Images (Dehypnotic)
**Class Name**: `SaveImagesDehypnotic`  
**Category**: `Dehypnotic/💾 IO`

An advanced multi-format image saving node featuring sequence numbering, date-based folder grouping, image optimization, and workflow metadata embedding.

#### Key Features:
- **Interactive Thumbnail Gallery**: Displays a scrollable history of recently saved images directly on the node with an elegant, space-saving UI.
- **Fullscreen Image Viewer**: Click any thumbnail in the gallery to open a full-screen, high-resolution preview overlay.
- **Toggleable Preview**: Hide or show the gallery instantly via a custom toggle button to free up canvas space.
- **Smart UI Layout**: Configurable parameters like `number_padding` and `number_start` are automatically moved to the node's right-click Properties panel, keeping the main node body compact.
- **Multi-Format Export**: Supports PNG, JPG/JPEG, WEBP, GIF, BMP, and TIFF formats.
- **Workflow Metadata Embedding**: Embeds full ComfyUI workflow metadata into PNG (via `tEXt` chunks) and WebP images (via XMP metadata).
- **Sequential File Naming**: Automatic file index incrementing with customizable zero-padding (e.g. `0001`, `0002`) and prefix/delimiter settings.
- **Quality & Compression Controls**: Configurable image quality percentage, WEBP lossless encoding option, PNG/JPG image optimization, and custom DPI metadata.
- **Compactness**: `number_padding`, `number_start`, and `dpi` moved to the properties panel for a more compact node.

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

<table style="width:100%">
  <tr>
    <th><img width="252" height="581" alt="image" src="https://github.com/user-attachments/assets/c7000281-861b-4583-8f3d-7bc2c989ca8c" /></th>
    <th valign=top><img width="246" height="302" alt="image" src="https://github.com/user-attachments/assets/2e95f903-7b48-4e8e-b025-9796c587b2df" /></th>
  </tr>
</table>

---

### 🧘 FrameSave (Dehypnotic)
**Class Name**: `FrameSave` / `FrameSaveDehypnotic`  
**Category**: `Dehypnotic/💾 IO`

An interactive frame selection, inspection, and temporary saving node designed for working with image sequences and animation batches. Automatically clears its temporary folder on every execution, filters frame ranges with custom stepper controls, and provides an interactive full-brightness gallery with full-resolution zoom.

#### Key Features:
- **Automatic Temp Folder Clearance**: Empties old temporary files from `temp/dehypnotic_frame_save` automatically on every run before saving the current filtered frame batch.
- **Range & Step Filtering**: Filter visible and saved frames using 1-indexed `Start frame`, `End frame` (`0` = all remaining frames), and `Step` interval controls.
- **Custom `[-]` & `[+]` Steppers**: Clean stepper buttons around `Start frame`, `End frame`, and `Step` fields for intuitive value adjustments.
- **Live Upstream Frame Count**: Automatically traces input graph links recursively (past `Set/Get` wireless nodes, `AspectRatio`, and processing nodes) to detect and display the total frame count of connected video/image sources `(Total: N)` live before workflow execution.
- **In-Browser Directory Picker Modal**: Built-in interactive folder browser modal (`📁`) that allows visual directory and drive navigation (`C:\`, `D:\`, `Output`, etc.) with zero browser upload security prompts.
- **Full-Brightness Gallery & Fullscreen Zoom**: Scrollable 500px thumbnail gallery displaying filtered frames at 100% brightness with mint-green (`#34d399`) selection borders, double-click fullscreen zoom overlay, and instant "Select All" / "Deselect All" buttons. Default selection is set to none on first view.
- **Security & Whitelist Validation**: Ensures saving to chosen target locations strictly obeys ComfyUI output path restrictions or custom allowed paths defined in `dehypnotic_save_allowed_paths.json`.

#### Inputs & Outputs:
| Type | Name | Default | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `images` | - | Input image batch sequence (`IMAGE`). |
| **Optional Input** | `file_path` | `""` | Destination folder path (relative or absolute). |
| **Optional Input** | `start_frame` | `1` | First frame index to include (1-indexed). |
| **Optional Input** | `end_frame` | `0` | Last frame index to include (0 = all remaining frames). |
| **Optional Input** | `frame_step` | `1` | Frame step interval (e.g., 3 = frames 1, 4, 7...). |

<img width="529" height="615" alt="image" src="https://github.com/user-attachments/assets/8dd633a3-450f-494b-b77c-3d27117602ae" />

---

### 🧘 Load Video (Dehypnotic)
**Class Name**: `LoadVideoDehypnotic`  
**Category**: `Dehypnotic/IO`

A streamlined video loading node with an interactive frontend, built-in file uploading, and drag-and-drop support. It extracts frames and audio from video files seamlessly.

#### Key Features:
- **Built-in Upload & Drag-and-Drop**: Easily upload videos directly into ComfyUI's input folder using the "Upload video" button, or simply drag and drop a video file onto the node.
- **Dynamic Video Player**: Features a compact, native video player at the bottom of the node to preview the selected video (plays on mouseover).
- **Format Support**: Automatically lists known video formats (`mp4`, `mkv`, `webm`, `avi`, `mov`, `gif`) from your input directory, sorted by newest first.
- **Frame & Audio Extraction**: Outputs high-quality `IMAGE` tensors (via OpenCV) and extracts audio tracks natively into ComfyUI's standard `AUDIO` format (via FFmpeg).

#### Inputs & Outputs:
| Type | Name | Default / Options | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `video` | *Dynamic dropdown* | Select a video file from the ComfyUI input folder. |
| **Output** | `images` | `IMAGE` | Extracted video frame sequence. |
| **Output** | `audio` | `AUDIO` | Extracted audio track (if present). |
| **Output** | `fps` | `FLOAT` | Video framerate. |

<img width="308" height="685" alt="image" src="https://github.com/user-attachments/assets/9fb96f61-f689-4c25-8b9e-327017b22554" />

---

### 🧘 Save Video (Dehypnotic)
**Class Name**: `SaveVideoDehypnotic`  
**Category**: `Dehypnotic/💾 IO`

A comprehensive video renderer and frame exporter node leveraging bundled `imageio-ffmpeg` for high quality video generation with optional audio multiplexing.

#### Key Features:
- **Multiple Containers & Professional Codecs**:
  - Containers: `mp4`, `mkv`, `webm`, `mov`.
  - Codecs: H.264 (`libx264`), H.265/HEVC (`libx265`), VP9 (`libvpx-vp9`), AV1 (`libaom-av1`), ProRes 422 HQ (`prores_ks`), DNxHR HQ (`dnxhr_hq`).
- **Audio Integration & Single-Frame Looping**: Attach mono or stereo `AUDIO`. If a single image frame and an audio track are provided, the node automatically loops the frame for the full duration of the audio.
- **Frame Extraction & Selection**: Extract specific frames (e.g. first frame `0`, last frame `-2`, all frames `-1`, or explicit lists like `0,5,10`) to a subfolder during video export.
- **Quality & Performance Tuning**: CRF (Constant Rate Factor) quality control, encoder speed presets (`ultrafast` to `veryslow`), and optional frame preview rendering in the node output.
- **Preview Only Mode**: Toggle `preview_only` (`off`/`on`) to audition video previews in the node player without saving video files to disk (`off` by default).

#### Key Inputs & Outputs:
| Type | Name | Default / Options | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `images` | `IMAGE` | Input video frame batch. |
| **Required Input** | `file_path` | `output/video` | Output destination folder. |
| **Required Input** | `date_subfolder_pattern` | `%Y-%m-%d` | Dated subfolder format pattern. |
| **Required Input** | `filename_prefix` | `VID` | Filename prefix. |
| **Required Input** | `filename_delimiter` | `_` | Separator between prefix and sequence number. |
| **Required Input** | `preview_only` | `off`, `on` | Skip saving video file to disk while keeping player preview functionality (`off` by default). |
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

<table style="width:100%">
  <tr>
    <th><img width="236" height="628" alt="image" src="https://github.com/user-attachments/assets/33206e06-4c83-4d38-b85a-6e348f856974" /></th>
    <th><img width="233" height="627" alt="image" src="https://github.com/user-attachments/assets/ddbde53e-7dcf-4684-8980-55b16dc56bc4" />
</th>
  </tr>
</table>

---

### 🧘 SonicColor Noise (Dehypnotic)
**Class Name**: `SonicColor`  
**Category**: `Dehypnotic/Audio`

A feature-rich noise generator and audio processor with an embedded dark GUI interface. Features 5 noise colors (White, Pink, Brown, Blue, Violet), a resonant filter with 5 modes, a 10-Band graphic equalizer, ADSR amplitude envelope shaping, real-time WebAudio live playback preview, user preset management, and non-looping audio mixing.

#### Key Features:
- **5 Noise Color Mixing**: Blend White, Pink (Paul Kellet filter), Brown (Leaky integrator), Blue, and Violet noise with individual gain controls.
- **Embedded Custom GUI**: 3-tab dark-themed UI (Color Mix, Filter & Env, 10-Band EQ) with a fixed height and smooth internal scrollbar.
- **Real-Time Live WebAudio Preview**: Interactive ▶️ Play/Stop preview button allowing you to hear adjustments to noise colors, filters, ADSR, and EQ in real time.
- **Real-Time Media Duration Detection**: Automatically detects and populates media duration live from connected `Load Audio` or `Load Video` nodes, rounded up to whole seconds.
- **Non-Looping External Audio Mix**: Mixes connected input audio once (padded with silence if shorter than target duration) with adjustable input volume.
- **Resonant Filter & 10-Band Equalizer**: Built-in Lowpass, Highpass, Bandpass, and Notch filters plus a 10-Band graphic EQ (50Hz to 16kHz) for precise sound design.
- **Preset System**: Easily save, load, update, and delete custom user presets directly from the GUI (saved safely in `ComfyUI/user/Dehypnotic/sonic_color/`).

#### Inputs & Outputs:
| Type | Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **Required Input** | `params` | `STRING` | Embedded JSON string containing noise colors, filter, EQ, ADSR, and time settings. |
| **Optional Input** | `audio` | `AUDIO` | Optional external audio track to mix with generated noise. |
| **Output** | `audio` | `AUDIO` | Output audio dictionary containing waveform tensor and sample rate. |

<table style="width:100%">
  <tr>
    <th><img width="393" height="544" alt="image" src="https://github.com/user-attachments/assets/2b81c58e-b2a7-4bfb-ad01-f94712c75fd4" /></th>
    <th><img width="394" height="544" alt="image" src="https://github.com/user-attachments/assets/82636213-0c67-4df9-9559-6d99fa25c9d6" /></th>
    <th><img width="411" height="556" alt="image" src="https://github.com/user-attachments/assets/c327c9e6-d368-49e2-b23e-6110b5724c4a" /></th>
  </tr>
</table>

---

## Security and external save paths (ComfyUI Manager compliant)
- By default, saving is allowed under ComfyUI’s `output/` directory.
- To allow external locations (e.g., other drives), create a local text-file next to this node named `dehypnotic_save_allowed_paths.json` containing for example:
  ```json
  { "allowed_roots": ["D:/AudioExports", "E:/TeamShare/Audio"] }
  ```

Whitelist behavior and safety
- The node refuses to write outside `ComfyUI/output/` unless the path is under one of the whitelisted roots.
- Recommended location in ComfyUI/config/ instead of the node folder so it survives node updates.
- Loader lookup order: env var → global ComfyUI locations → node folder.
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

Install from ComfyUI Manager (search for Dehypnotic), or

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

⚖️ Licensed under <a href="https://github.com/Dehypnotic/ComfyUI-Dehypnotic/blob/main/LICENSE">MIT</a>
