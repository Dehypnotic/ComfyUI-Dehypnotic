// ╔═══════════════════════════════════════════════════════════════╗
// ║  Set / Get Dehypnotic - best-effort value readout             ║
// ╚═══════════════════════════════════════════════════════════════╝
//
// A tiny, SUBTLE "= 81" line, display-only (never serialized), shown only when
// the node is EXPANDED and the wired value is a simple type (INT / FLOAT /
// STRING / BOOLEAN). Image / latent / model / conditioning show nothing.
//
// The value is read best-effort from the upstream source widget (e.g. a Number
// node feeding the Set). If the source is computed (a math node, a sampler,
// etc.) there is no frontend-knowable value, so we show nothing. A light poll
// keeps it live when the user edits the upstream number.
//
// Rendering is per-renderer so the line sits tight under the name field:
//   - Classic (LiteGraph): PAINTED in onDrawForeground at the bottom of the
//     node body (node grows by one row when shown). Gives exact positioning.
//   - Nodes 2.0 (Vue): a DOM element row (the grid lays it out tightly).

import { app } from "/scripts/app.js";
import { applyAdaptiveCanvasOnly,
  installCanvasZoomPassthrough,
} from "../shared/index.mjs";
import { isGraphLoading } from "../shared/graph_loading.mjs";
import { SET_TYPE, GET_TYPE, getLink, findSetterByName } from "./scope.mjs";
import { inheritSetColor } from "./colors.mjs";

const SIMPLE_TYPES = new Set(["INT", "FLOAT", "NUMBER", "STRING", "BOOLEAN", "BOOL"]);
const CSS_ID = "dehypnotic-setget-css";
const ROW_H = 18;

function isVue() {
  return !!window.LiteGraph?.vueNodesMode;
}

export function isSimpleType(t) {
  return false;
}

export function deriveSetValue(setNode) {
  return null;
}

export function deriveGetValue(getNode) {
  return null;
}

export function ensureValueWidget(node) {
  return null;
}

export function paintReadout(node, ctx) {
  // Disabled bottom value display
}

export function refreshValue(node) {
  node._dehypnoticSgValShown = false;
  node._dehypnoticSgValText = "";
}

// Classic only: when the readout is HIDDEN, shrink the node back to its content
// (drop the row the painted line used). When SHOWN, paintReadout sizes the node
// to the real name-field anchor during draw, so nothing to do here. Vue's grid
// handles its own height. Never resize during a load.
function fitNodeForReadout(node) {
  if (isVue() || node._dehypnoticSgValShown) return;
  try {
    if (isGraphLoading()) return;
  } catch {
    /* ignore */
  }
  const base = node.computeSize?.();
  if (base) node.setSize?.([node.size?.[0] || base[0], base[1]]);
}

// Single shared poll: keeps readouts live when the user edits an upstream
// number. Only touches expanded Set/Get nodes in the currently-viewed graph,
// and only repaints on a real change.
export function startValuePoll() {
  // Window-scoped guard so a module re-import (hot reload) cannot start a second
  // interval running in parallel.
  if (window.__dehypnoticSgValPoll) return;
  window.__dehypnoticSgValPoll = setInterval(() => {
    const g = app.canvas?.graph || app.graph;
    if (!g?._nodes) return;
    for (const n of g._nodes) {
      // A Get mirrors its Set's colour - keep it synced even when collapsed.
      if (n.type === GET_TYPE) {
        // Self-heal: if a transient race cleared the combo selection, restore it
        // from the stable backstop property. Only when the chosen Set still
        // exists and we're not mid-load, so it never fights a genuine re-pick or
        // a faithful configure() restore. The combo has no "blank" option, so an
        // empty value is always an accidental clear, never a user choice.
        try {
          const want = n.properties?.dehypnoticSGName;
          if (
            want &&
            !n.widgets?.[0]?.value &&
            !isGraphLoading() &&
            findSetterByName(n.graph, want)
          ) {
            n.widgets[0].value = want;
            n.onRename?.();
          }
        } catch {
          /* ignore */
        }
        try {
          inheritSetColor(n);
        } catch {
          /* ignore */
        }
      }
      if ((n.type === SET_TYPE || n.type === GET_TYPE) && !n.flags?.collapsed) {
        refreshValue(n);
      }
    }
  }, 450);
}
