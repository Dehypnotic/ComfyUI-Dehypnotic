import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough, installResizeFloor, measureRootContent } from "./shared/index.mjs";

// --- Dehypnotic Save Video: Properties + Video Preview Extension -------------
// 1. Moves number_padding and number_start to the Properties panel.
// 2. Adds a looping video preview widget at the bottom of the node.

const EXTENSION_NAME = "Dehypnotic.SaveVideo";
const NODE_TYPE = "SaveVideoDehypnotic";
const PROPERTY_WIDGETS = ["number_padding", "number_start", "loop_still_to_audio", "show_progress"];

const SETTING_IDS = {
  number_padding: "Dehypnotic.SaveVideo.NumberPadding",
  number_start: "Dehypnotic.SaveVideo.NumberStart",
  loop_still_to_audio: "Dehypnotic.SaveVideo.LoopStillToAudio",
  show_progress: "Dehypnotic.SaveVideo.ShowProgress",
};

// ---- helpers ----------------------------------------------------------------

function getSettingValue(propName, fallbackDefault) {
  const id = SETTING_IDS[propName];
  if (!id) return fallbackDefault;
  const val = app.ui?.settings?.getSettingValue?.(id);
  return val !== undefined && val !== null ? val : fallbackDefault;
}

function syncSettingToNodes(propName, val) {
  if (val === undefined || val === null) return;
  const graph = app.canvas?.graph || app.graph;
  if (!graph) return;
  for (const n of graph._nodes || []) {
    if (n.comfyClass === NODE_TYPE || n.type === NODE_TYPE) {
      if (n.properties) {
        n.properties[propName] = val;
      }
      const w = n.widgets?.find((w) => w.name === propName);
      if (w) w.value = val;
      n.setDirtyCanvas?.(true, true);
    }
  }
}

function fitHeight(node) {
  node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]]);
  node.graph?.setDirtyCanvas(true, true);
}

function hidePropertyWidgets(node) {
  if (!node.widgets) return;
  for (const w of node.widgets) {
    if (PROPERTY_WIDGETS.includes(w.name)) {
      w.type = "hidden";
      w.computeSize = () => [0, -4];
      w.draw = () => {};

      if (node.properties[w.name] === undefined) {
        const val = getSettingValue(w.name, w.value);
        node.properties[w.name] = val;
        w.value = val;
      } else {
        w.value = node.properties[w.name];
      }

      const isBool = typeof w.value === "boolean";
      node.properties_info = node.properties_info || [];
      if (!node.properties_info.find((p) => p.name === w.name)) {
        if (isBool) {
          node.properties_info.push({
            name: w.name,
            type: "boolean",
          });
        } else {
          node.properties_info.push({
            name: w.name,
            type: "int",
            step: 1,
            precision: 0,
            min: w.options?.min ?? 0,
            max: w.options?.max ?? 1000000,
          });
        }
      }
    }
  }
  node.setSize(node.computeSize());
  app.graph?.setDirtyCanvas(true, true);
}

// ---- main extension ---------------------------------------------------------

app.registerExtension({
  name: EXTENSION_NAME,
  settings: [
    {
      id: SETTING_IDS.number_padding,
      name: "Default number_padding",
      type: "number",
      defaultValue: 4,
      attrs: { min: 1, max: 10, step: 1 },
      tooltip: "Default sequence number digit padding (0001, 0002, ...) for Save Video.",
      category: ["🧘 Dehypnotic", "Save Video", "Number Padding"],
      onChange: (val) => syncSettingToNodes("number_padding", val),
    },
    {
      id: SETTING_IDS.number_start,
      name: "Default number_start",
      type: "number",
      defaultValue: 1,
      attrs: { min: 0, max: 1000000, step: 1 },
      tooltip: "Default starting sequence number for Save Video.",
      category: ["🧘 Dehypnotic", "Save Video", "Number Start"],
      onChange: (val) => syncSettingToNodes("number_start", val),
    },
    {
      id: SETTING_IDS.loop_still_to_audio,
      name: "Default loop_still_to_audio",
      type: "boolean",
      defaultValue: false,
      tooltip: "If only one frame plus audio, loop the frame to match audio duration.",
      category: ["🧘 Dehypnotic", "Save Video", "Loop Still to Audio"],
      onChange: (val) => syncSettingToNodes("loop_still_to_audio", val),
    },
    {
      id: SETTING_IDS.show_progress,
      name: "Default show_progress",
      type: "boolean",
      defaultValue: true,
      tooltip: "Show rendering progress in console for Save Video.",
      category: ["🧘 Dehypnotic", "Save Video", "Show Progress"],
      onChange: (val) => syncSettingToNodes("show_progress", val),
    },
  ],

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const MIN_W = 310;
    const MIN_H = 140;

    const origOnResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (!window.LiteGraph?.vueNodesMode) {
        if (size[0] < MIN_W) size[0] = MIN_W;
        if (size[1] < MIN_H) size[1] = MIN_H;
        if (this.size[0] < MIN_W) this.size[0] = MIN_W;
        if (this.size[1] < MIN_H) this.size[1] = MIN_H;
      }
      if (origOnResize) return origOnResize.apply(this, arguments);
    };

    const origDraw = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      if (origDraw) origDraw.call(this, ctx);
      if (this.flags?.collapsed) return;
      if (window.LiteGraph?.vueNodesMode) return;
      if (this.size[0] < MIN_W) this.size[0] = MIN_W;
      if (this.size[1] < MIN_H) this.size[1] = MIN_H;
    };

    const origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this._dhSaveVideoFloorOff?.();
      this._dhSaveVideoFloorOff = null;
      if (origRemoved) return origRemoved.apply(this, arguments);
    };
  },

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // Enforce wider minimum node width (e.g., 310px)
    const MIN_WIDTH = 310;
    const origComputeSize = node.computeSize;
    node.computeSize = function (out) {
      const size = origComputeSize ? origComputeSize.apply(this, arguments) : [MIN_WIDTH, 100];
      size[0] = Math.max(size[0], MIN_WIDTH);
      return size;
    };
    node.size[0] = Math.max(node.size[0], MIN_WIDTH);

    hidePropertyWidgets(node);
    setTimeout(() => hidePropertyWidgets(node), 50);
    setTimeout(() => hidePropertyWidgets(node), 150);

    // Sync property -> hidden widget so Python receives the value
    const origOnPropertyChanged = node.onPropertyChanged;
    node.onPropertyChanged = function (name, value) {
      origOnPropertyChanged?.apply(this, arguments);
      const w = this.widgets?.find((w) => w.name === name);
      if (w) w.value = value;
    };

    // Restore hidden state on workflow load / undo-redo
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
      origOnConfigure?.apply(this, arguments);
      hidePropertyWidgets(node);
      setTimeout(() => hidePropertyWidgets(node), 50);
      setTimeout(() => hidePropertyWidgets(node), 150);
    };

    // =========================================================
    // 2. Video preview widget
    // =========================================================
    const container = document.createElement("div");
    container.style.cssText = `
      width: 100%;
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    `;

    // Path label — hidden until first execution
    const pathLabel = document.createElement("div");
    pathLabel.style.cssText = `
      display: none;
      width: 100%;
      font-size: 10px;
      color: #888;
      text-align: center;
      padding: 2px 6px;
      box-sizing: border-box;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: monospace;
    `;
    container.appendChild(pathLabel);

    // Video element — native controls enabled; audio unmuted on hover
    const videoEl = document.createElement("video");
    videoEl.controls = true;
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.style.cssText = `
      width: 100%;
      display: none;
      border-radius: 0 0 4px 4px;
      cursor: pointer;
    `;
    // Unmute on hover, re-mute on leave
    videoEl.onmouseenter = () => { videoEl.muted = false; };
    videoEl.onmouseleave = () => { videoEl.muted = true; };
    container.appendChild(videoEl);

    // Register as DOM widget
    const previewWidget = node.addDOMWidget("dh_video_preview", "custom_ui", container, {
      getMinHeight: () => (videoEl.style.display !== "none" ? 140 : 0),
      margin: 4,
      serialize: false,
    });

    applyAdaptiveCanvasOnly(previewWidget);
    installCanvasZoomPassthrough(container);
    node._dhSaveVideoFloorOff = installResizeFloor(container, () => measureRootContent(container));

    // Dynamic height based on video aspect ratio
    let aspectRatio = null;

    previewWidget.computeSize = function (width) {
      if (aspectRatio && videoEl.style.display !== "none") {
        const pathH = pathLabel.style.display !== "none" ? 20 : 0;
        const videoH = (node.size[0] - 20) / aspectRatio;
        return [width, pathH + videoH + 4];
      }
      return [width, -4]; // no content yet — collapse widget
    };

    videoEl.addEventListener("loadedmetadata", () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
        fitHeight(node);
      }
    });

    videoEl.addEventListener("error", () => {
      videoEl.style.display = "none";
      aspectRatio = null;
      fitHeight(node);
    });

    // Block canvas events from propagating through the widget
    const blockEvents = ["mousedown", "mouseup", "click", "dblclick",
      "pointerdown", "pointerup", "pointermove", "wheel"];
    blockEvents.forEach((evt) => container.addEventListener(evt, (e) => e.stopPropagation()));

    // =========================================================
    // 3. onExecuted: receive video_preview from backend
    // =========================================================
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
      origOnExecuted?.apply(this, arguments);

      const previews = message?.video_preview;
      if (!previews || previews.length === 0) return;

      const info = previews[0];
      if (!info?.filename) return;

      const params = new URLSearchParams({
        filename: info.filename,
        subfolder: info.subfolder || "",
        type: info.type || "output",
        timestamp: Date.now(),
      });

      const url = api.apiURL(`/view?${params.toString()}`);
      videoEl.src = url;
      videoEl.style.display = "block";

      // Show shortened path or Preview Only in label
      const text = message?.text || info.filename;
      if (text === "[Preview Only]") {
        pathLabel.innerHTML = `<span style="color:#eab308">Mode: </span>Preview Only (not saved)`;
      } else {
        const parts = (typeof text === "string" ? text : "").split(/[/\\]/);
        const outIdx = parts.lastIndexOf("output");
        pathLabel.textContent = outIdx >= 0
          ? parts.slice(outIdx).join("\\")
          : parts.slice(-3).join("\\");
      }
      pathLabel.style.display = "block";

      videoEl.play().catch(() => {});
      fitHeight(node);
    };
  },
});
