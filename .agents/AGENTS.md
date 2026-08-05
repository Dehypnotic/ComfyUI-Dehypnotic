# Project Rules for ComfyUI-Dehypnotic

## DOM Widget Scaling & Layout Guidelines (Pixaroma Architecture)

When building ComfyUI custom nodes that utilize custom HTML/DOM widgets (`node.addDOMWidget`):

1. **Avoid Hardcoded Widget Heights**:
   - Use `getMinHeight: () => MIN_H` (e.g., 140) and set `margin: 4` and `serialize: false`.

2. **CSS Flexbox Structure**:
   - Main Container: `display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box;`.
   - Main Content (Textarea, Canvas, Image View): `flex: 1 1 auto; width: 100%; height: 100%; min-height: 60px; resize: none;`.
   - Toolbars / Button Rows: `flex: 0 0 auto; flex-wrap: wrap; row-gap: 4px;`.

3. **Use Shared Scaling & Compatibility Helpers**:
   - Import `applyAdaptiveCanvasOnly`, `installCanvasZoomPassthrough`, and `installResizeFloor` from `./shared/index.mjs`.
   - Apply `applyAdaptiveCanvasOnly(widget)` to support both Classic LiteGraph and Nodes 2.0 (Vue) renderers.
   - Apply `installCanvasZoomPassthrough(container)` to allow canvas zooming over node bounds.
   - Apply `installResizeFloor(container, measureFloorFn)` to lock minimum height during resize handle dragging in Nodes 2.0.
   - Implement `onResize` and `onDrawForeground` size clamping (`MIN_W`, `MIN_H`) for the Classic renderer.

   4. **Limitations**:
   - Don't change nodes that are not mentioned in the user request.
