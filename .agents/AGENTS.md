# Project Guidelines for ComfyUI-Dehypnotic

Update this guide when the user expresses that a problem has been solved that probably will be usefull for future projects with JavaScript/DOM-nodes for ComfyUI.

## 1. Scope & Change Control
- **Strict Node Scoping**: Never modify, refactor, or convert nodes that have not been explicitly requested by the user.
- **Preserve Fixed Layouts**: Do not apply dynamic UI scaling to existing compact nodes unless specifically instructed.
- **Documentation**: Update `README.md` when relevant node features or parameters are changed.

## 2. DOM Widget Scaling Architecture (Pixaroma Pattern)
Use the following pattern as the standard reference when building **new DOM-widget nodes** or when **explicitly requested** to add responsive UI scaling.

### Best Fit & Applicability
- **Recommended for**: Large text fields (`Text`, `NumberedText`), galleries (`FrameSave`), scrollable logs, or rich expandable preview panels.
- **Avoid for**: Compact parameter forms, static input control nodes, or fixed dimension tools (such as `AspectRatio`) unless requested.

### Implementation Blueprint (`node.addDOMWidget`)
1. **Flexible Widget Heights**:
   - Use `getMinHeight: () => MIN_H` (e.g., 140 or 240), set `margin: 4`, and `serialize: false`.

2. **CSS Flexbox Structure**:
   - **Main Container**: `display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box;`
   - **Expandable Content Area** (Textarea, Gallery, Preview): `flex: 1 1 auto; width: 100%; height: 100%; min-height: 60px; resize: none;`
   - **Toolbars & Button Rows**: `flex: 0 0 auto; flex-wrap: wrap; row-gap: 4px;`

3. **Shared Compatibility & Render Helpers**:
   - Import `applyAdaptiveCanvasOnly`, `installCanvasZoomPassthrough`, and `installResizeFloor` from `./shared/index.mjs`.
   - Use `applyAdaptiveCanvasOnly(widget)` to support both Classic LiteGraph and Nodes 2.0 (Vue) renderers.
   - Use `installCanvasZoomPassthrough(container)` to allow seamless canvas zooming/scrolling over node bounds.
   - Use `installResizeFloor(container, measureFloorFn)` to enforce minimum height floor during resize handle dragging in Nodes 2.0.
   - Implement `onResize` and `onDrawForeground` size clamping (`MIN_W`, `MIN_H`) for Classic LiteGraph renderer.

4. **Lifecycle Hooks & Initial Node Sizing**:
   - Register new node setups using the `nodeCreated(node)` hook on `app.registerExtension` (instead of `beforeRegisterNodeDef` prototype monkey-patching). This ensures initial size overrides (`node.size = [DEFAULT_W, DEFAULT_H]`, `node.setSize([DEFAULT_W, DEFAULT_H])`) run after LiteGraph's default compute pass, preventing DOM elements from overflowing when spawned from the node menu.
   - Set `widget.computeSize = (width) => [width || MIN_W, DOM_MIN_H]` on the DOM widget object.

5. **Dynamic Container Height & Canvas Scaling**:
   - In Classic LiteGraph renderer, update DOM container height dynamically inside `node.onResize`:
     `targetDOMH = Math.max(DOM_MIN_H, node.size[1] - topWidgetsHeight - titleHeight - padding);`
     `container.style.height = targetDOMH + "px";`
   - Attach a `ResizeObserver` to the inner expandable wrapper (e.g. `<canvas>` wrapper) to automatically update canvas resolution (`canvas.width`, `canvas.height`) and trigger redraws whenever the node is resized.

6. **Web Audio API Preview Scheduling**:
   - For audio preview widgets, do NOT use single-pulse `setTimeout` loops. Use Web Audio API lookahead scheduling (`scheduleAheadTime = 0.2s`) with hardware timeline ramps (`gain.setValueAtTime`, `gain.linearRampToValueAtTime`, `gain.setTargetAtTime`) for smooth, clickless, jitter-free playback.

## 3. User Storage & Preset Directory Standard
- **Storage Location**: User presets, templates, and user-generated node data should be saved in a node-specific subdirectory under `ComfyUI/user/Dehypnotic/<node_name>` (e.g., `ComfyUI/user/Dehypnotic/numbered_text`).
- **ComfyUI Path API**: Always resolve the base directory using ComfyUI's standard `folder_paths.get_user_directory()` function:
  ```python
  import folder_paths
  from pathlib import Path

  user_dir = Path(folder_paths.get_user_directory()).resolve()
  target_dir = user_dir / "Dehypnotic" / "<node_name>"
  target_dir.mkdir(parents=True, exist_ok=True)
  ```
- **Naming Convention**: Directory names beneath `Dehypnotic/` must reflect the node's name or type to keep user presets organized.
