import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// --- Dehypnotic Save Video: Properties + Video Preview Extension -------------
// 1. Moves number_padding and number_start to the Properties panel.
// 2. Adds a looping video preview widget at the bottom of the node.

const EXTENSION_NAME = "Dehypnotic.SaveVideo";
const NODE_TYPE = "SaveVideoDehypnotic";
const PROPERTY_WIDGETS = ["number_padding", "number_start"];

// ---- helpers ----------------------------------------------------------------

function fitHeight(node) {
  node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]]);
  node.graph?.setDirtyCanvas(true, true);
}

// ---- main extension ---------------------------------------------------------

app.registerExtension({
  name: EXTENSION_NAME,

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // =========================================================
    // 1. Move number_padding + number_start to Properties panel
    // =========================================================
    setTimeout(() => {
      if (!node.widgets) return;
      for (const w of node.widgets) {
        if (PROPERTY_WIDGETS.includes(w.name)) {
          w.type = "hidden";
          w.computeSize = () => [0, -4];

          if (node.properties[w.name] === undefined) {
            node.properties[w.name] = w.value;
          }

          node.properties_info = node.properties_info || [];
          if (!node.properties_info.find((p) => p.name === w.name)) {
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
      node.setSize(node.computeSize());
      app.graph?.setDirtyCanvas(true, true);
    }, 100);

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
      setTimeout(() => {
        if (!node.widgets) return;
        for (const w of node.widgets) {
          if (PROPERTY_WIDGETS.includes(w.name)) {
            w.type = "hidden";
            w.computeSize = () => [0, -4];
            if (node.properties[w.name] !== undefined) {
              w.value = node.properties[w.name];
            }
          }
        }
        node.setSize(node.computeSize());
        app.graph?.setDirtyCanvas(true, true);
      }, 100);
    };

    // =========================================================
    // 2. Video preview widget
    // =========================================================
    const container = document.createElement("div");
    container.style.cssText = `
      width: 100%;
      background: #111;
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    `;

    // Path label
    const pathLabel = document.createElement("div");
    pathLabel.style.cssText = `
      width: 100%;
      font-size: 10px;
      color: #888;
      text-align: center;
      padding: 3px 6px;
      box-sizing: border-box;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: monospace;
      min-height: 18px;
    `;
    container.appendChild(pathLabel);

    // Video element
    const videoEl = document.createElement("video");
    videoEl.controls = true;
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.style.cssText = `
      width: 100%;
      display: none;
      border-radius: 0 0 4px 4px;
    `;
    container.appendChild(videoEl);

    // Placeholder shown before first execution
    const placeholder = document.createElement("div");
    placeholder.style.cssText = `
      width: 100%;
      padding: 16px 0;
      text-align: center;
      color: #444;
      font-size: 11px;
      font-family: Inter, sans-serif;
    `;
    placeholder.textContent = "Run the node to see video preview";
    container.appendChild(placeholder);

    // Block canvas events from propagating through the widget
    const blockEvents = ["mousedown", "mouseup", "click", "dblclick",
      "pointerdown", "pointerup", "pointermove", "wheel"];
    blockEvents.forEach((evt) => container.addEventListener(evt, (e) => e.stopPropagation()));

    // Register as DOM widget
    const previewWidget = node.addDOMWidget("dh_video_preview", "custom_ui", container);

    // Dynamic height based on video aspect ratio
    let aspectRatio = null;

    previewWidget.computeSize = function (width) {
      const pathH = 22;
      if (aspectRatio && videoEl.style.display !== "none") {
        const videoH = (node.size[0] - 20) / aspectRatio;
        return [width, pathH + videoH + 4];
      }
      return [width, pathH + 36]; // placeholder height
    };

    videoEl.addEventListener("loadedmetadata", () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
        fitHeight(node);
      }
    });

    videoEl.addEventListener("error", () => {
      videoEl.style.display = "none";
      placeholder.style.display = "block";
      placeholder.textContent = "Preview unavailable";
      aspectRatio = null;
      fitHeight(node);
    });

    // Unmute on hover (like VHS)
    videoEl.addEventListener("mouseenter", () => { videoEl.muted = false; });
    videoEl.addEventListener("mouseleave", () => { videoEl.muted = true; });

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
      placeholder.style.display = "none";

      // Show shortened path in label
      const text = message?.text || info.filename;
      const parts = (typeof text === "string" ? text : "").split(/[/\\]/);
      const outIdx = parts.lastIndexOf("output");
      pathLabel.textContent = outIdx >= 0
        ? parts.slice(outIdx).join("\\")
        : parts.slice(-3).join("\\");

      videoEl.play().catch(() => {});
      fitHeight(node);
    };
  },
});
