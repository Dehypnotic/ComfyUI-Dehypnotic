import { app } from "/scripts/app.js";

// ── Nodes 2.0 compatibility helper ──────────────────────────────────────────
export function applyAdaptiveCanvasOnly(widget) {
  if (!widget || !widget.options) return widget;
  try {
    Object.defineProperty(widget.options, "canvasOnly", {
      configurable: true,
      enumerable: true,
      get() {
        return !window.LiteGraph?.vueNodesMode;
      },
    });
  } catch (e) {
    widget.options.canvasOnly = !window.LiteGraph?.vueNodesMode;
  }
  return widget;
}

// ── Canvas zoom passthrough for Classic renderer ────────────────────────────
function scrollRegionWantsWheel(target, root, deltaX, deltaY) {
  const vertical = Math.abs(deltaY) >= Math.abs(deltaX);
  let el = target;
  while (el && el !== root.parentElement) {
    if (el.nodeType === 1) {
      const cs = getComputedStyle(el);
      if (vertical) {
        const oy = cs.overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
        }
      } else {
        const ox = cs.overflowX;
        if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) {
          const atLeft = el.scrollLeft <= 0;
          const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
          if ((deltaX < 0 && !atLeft) || (deltaX > 0 && !atRight)) return true;
        }
      }
    }
    el = el.parentElement;
  }
  return false;
}

export function installCanvasZoomPassthrough(root) {
  if (!root || typeof root.addEventListener !== "function") return () => {};
  const onWheel = (e) => {
    if (window.LiteGraph?.vueNodesMode) return; // Nodes 2.0 forwards to the canvas itself
    if (scrollRegionWantsWheel(e.target, root, e.deltaX, e.deltaY)) return;
    const canvasEl = app?.canvas?.canvas;
    if (!canvasEl) return;
    e.preventDefault();
    e.stopPropagation();
    const { clientX, clientY, deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey } = e;
    canvasEl.dispatchEvent(new WheelEvent("wheel", {
      clientX, clientY, deltaX, deltaY, deltaMode,
      ctrlKey, metaKey, shiftKey, bubbles: true, cancelable: true,
    }));
  };
  root.addEventListener("wheel", onWheel, { passive: false });
  return () => root.removeEventListener("wheel", onWheel);
}

// ── Lightweight Help system registry (non-crashing fallback) ────────────────
const _nodeHelp = new Map();
export function registerNodeHelp(comfyClass, helpDef) {
  if (comfyClass && helpDef) _nodeHelp.set(comfyClass, helpDef);
}
export function getNodeHelp(comfyClass) {
  return comfyClass ? _nodeHelp.get(comfyClass) || null : null;
}
export const PIXAROMA_JS_VERSION = "1.0.0-dehypnotic";
