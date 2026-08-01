// ╔═══════════════════════════════════════════════════════════════╗
// ║  Set / Get Dehypnotic - wireless "named variable" node pair   ║
// ╚═══════════════════════════════════════════════════════════════╝
//
// Dehypnotic's own wireless "named variable" node pair, in a PRIVATE namespace:
// classes DehypnoticSetNode / DehypnoticGetNode with their own registry
// (js/set_get/scope.mjs) that only ever scans Dehypnotic Set/Get. It coexists with
// any other pack's Set/Get-style nodes in one workflow with zero interference.
//
// Both are pure-frontend VIRTUAL nodes (isVirtualNode = true): no Python, never
// in the prompt. Resolution at submission goes straight through to the real
// source via getInputLink (same-graph) + resolveVirtualOutput (subgraph). Works
// in both Classic and Nodes 2.0, and inside subgraphs (native path verified on
// frontend 1.45.15).

// The following function/section is based on code by Pixaroma
// MIT License - Copyright (c) 2026 pixaroma
// Full license terms: https://gitlab.com/pixaroma/comfyui-pixaroma/-/blob/main/LICENSE

import { app } from "/scripts/app.js";
import { registerDehypnoticSetNode } from "./set_node.mjs";
import { registerDehypnoticGetNode } from "./get_node.mjs";
import { startValuePoll } from "./value_preview.mjs";
import "./help.mjs"; // registers help for both nodes (convention #16)

app.registerExtension({
  name: "Dehypnotic.SetGet",
  registerCustomNodes() {
    registerDehypnoticSetNode();
    registerDehypnoticGetNode();
  },
  setup() {
    startValuePoll();
  },
});
