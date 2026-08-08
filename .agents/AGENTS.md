# Project Guidelines for ComfyUI-Dehypnotic

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

