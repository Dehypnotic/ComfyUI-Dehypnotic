import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// --- Dehypnotic Save Video: Properties + Video Preview Extension -------------
// 1. Moves number_padding and number_start to the Properties panel.
// 2. Adds a looping video preview widget at the bottom of the node.

const EXTENSION_NAME = "Dehypnotic.SaveVideo";
const NODE_TYPE = "SaveVideoDehypnotic";
const PROPERTY_WIDGETS = ["number_padding", "number_start", "loop_still_to_audio", "show_progress"];

// ---- helpers ----------------------------------------------------------------

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
        node.properties[w.name] = w.value;
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

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // =========================================================
    // 1. Move number_padding, number_start, loop_still_to_audio, show_progress to Properties panel
    // =========================================================
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
    const previewWidget = node.addDOMWidget("dh_video_preview", "custom_ui", container);

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

      // Show shortened path in label
      const text = message?.text || info.filename;
      const parts = (typeof text === "string" ? text : "").split(/[/\\]/);
      const outIdx = parts.lastIndexOf("output");
      pathLabel.textContent = outIdx >= 0
        ? parts.slice(outIdx).join("\\")
        : parts.slice(-3).join("\\");
      pathLabel.style.display = "block";

      videoEl.play().catch(() => {});
      fitHeight(node);
    };
  },
});
