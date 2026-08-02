import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough, installResizeFloor, measureRootContent } from "./shared/index.mjs";

const EXTENSION_NAME = "Dehypnotic.LoadVideo";
const NODE_TYPE = "LoadVideoDehypnotic";

function fitHeight(node) {
  node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]]);
  node.graph?.setDirtyCanvas(true, true);
}

app.registerExtension({
  name: EXTENSION_NAME,

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
      this._dhLoadVideoFloorOff?.();
      this._dhLoadVideoFloorOff = null;
      if (origRemoved) return origRemoved.apply(this, arguments);
    };
  },

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // Enforce minimum node width
    const MIN_WIDTH = 310;
    const origComputeSize = node.computeSize;
    node.computeSize = function (out) {
      const size = origComputeSize ? origComputeSize.apply(this, arguments) : [MIN_WIDTH, 100];
      size[0] = Math.max(size[0], MIN_WIDTH);
      return size;
    };
    node.size[0] = Math.max(node.size[0], MIN_WIDTH);

    const videoWidget = node.widgets.find((w) => w.name === "video");

    // 1. Upload Button
    const uploadWidget = node.addWidget("button", "Upload video", "upload", () => {
      fileInput.click();
    });
    uploadWidget.serialize = false;

    // Custom styling to match VHS "Show Preview" button (dark background, green border/text)
    uploadWidget.draw = function(ctx, node, widget_width, y, widget_height) {
        const margin = 10;
        const color = "#27b376"; // Teal-green color

        // Background and border
        ctx.fillStyle = "#1e1e1e";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const rectY = y;
        const rectH = widget_height - 2;
        const radius = 3;
        
        ctx.moveTo(margin + radius, rectY);
        ctx.lineTo(widget_width - margin - radius, rectY);
        ctx.quadraticCurveTo(widget_width - margin, rectY, widget_width - margin, rectY + radius);
        ctx.lineTo(widget_width - margin, rectY + rectH - radius);
        ctx.quadraticCurveTo(widget_width - margin, rectY + rectH, widget_width - margin - radius, rectY + rectH);
        ctx.lineTo(margin + radius, rectY + rectH);
        ctx.quadraticCurveTo(margin, rectY + rectH, margin, rectY + rectH - radius);
        ctx.lineTo(margin, rectY + radius);
        ctx.quadraticCurveTo(margin, rectY, margin + radius, rectY);
        ctx.fill();
        ctx.stroke();

        // Text
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.font = "bold 12px Arial";
        ctx.fillText("⬆ UPLOAD VIDEO", widget_width * 0.5, y + rectH * 0.7);
    };

    const fileInput = document.createElement("input");
    Object.assign(fileInput, {
        type: "file",
        accept: "video/*",
        style: "display: none",
    });
    document.body.appendChild(fileInput);

    const uploadFile = async (file) => {
      try {
        const body = new FormData();
        body.append("image", file); // ComfyUI endpoint expects "image" field
        body.append("type", "input");
        
        const resp = await api.fetchApi("/upload/image", { method: "POST", body });
        if (resp.status === 200) {
          const data = await resp.json();
          const newFilename = data.name;
          
          if (!videoWidget.options.values.includes(newFilename)) {
            videoWidget.options.values.unshift(newFilename);
          }
          videoWidget.value = newFilename;
          
          if (node.onVideoSelected) {
              node.onVideoSelected(newFilename);
          }
        }
      } catch (error) {
        console.error("Upload failed", error);
      }
    };

    fileInput.addEventListener("change", () => {
      if (fileInput.files.length > 0) uploadFile(fileInput.files[0]);
    });

    // 2. Drag and Drop onto Node
    node.onDragOver = function(e) {
        if (e.dataTransfer && e.dataTransfer.items) {
            const item = [...e.dataTransfer.items].find(i => i.type.startsWith("video/"));
            if (item) {
                e.preventDefault();
                return true;
            }
        }
        return false;
    };

    node.onDragDrop = function(e) {
        if (e.dataTransfer && e.dataTransfer.files) {
            const file = [...e.dataTransfer.files].find(f => f.type.startsWith("video/"));
            if (file) {
                uploadFile(file);
                e.preventDefault();
                return true;
            }
        }
        return false;
    };

    // 3. Video Preview Widget
    const container = document.createElement("div");
    container.style.cssText = `
      width: 100%;
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    `;
    
    // Path label (matches SaveVideo style)
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
    videoEl.onmouseenter = () => { videoEl.muted = false; };
    videoEl.onmouseleave = () => { videoEl.muted = true; };
    container.appendChild(videoEl);

    const previewWidget = node.addDOMWidget("dh_video_preview", "custom_ui", container, {
      getMinHeight: () => (videoEl.style.display !== "none" ? 140 : 0),
      margin: 4,
      serialize: false,
    });

    applyAdaptiveCanvasOnly(previewWidget);
    installCanvasZoomPassthrough(container);
    node._dhLoadVideoFloorOff = installResizeFloor(container, () => measureRootContent(container));
    let aspectRatio = null;

    previewWidget.computeSize = function (width) {
      if (aspectRatio && videoEl.style.display !== "none") {
        const pathH = pathLabel.style.display !== "none" ? 20 : 0;
        const videoH = (node.size[0] - 20) / aspectRatio;
        return [width, pathH + videoH + 4];
      }
      return [width, -4]; 
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

    const blockEvents = ["mousedown", "mouseup", "click", "dblclick", "pointerdown", "pointerup", "pointermove", "wheel"];
    blockEvents.forEach((evt) => container.addEventListener(evt, (e) => e.stopPropagation()));

    node.onVideoSelected = (filename) => {
      if (!filename || filename === "none") {
          videoEl.style.display = "none";
          pathLabel.style.display = "none";
          return;
      }
      const params = new URLSearchParams({
        filename: filename,
        subfolder: "",
        type: "input",
        timestamp: Date.now(),
      });
      videoEl.src = api.apiURL(`/view?${params.toString()}`);
      videoEl.style.display = "block";
      
      pathLabel.textContent = filename;
      pathLabel.style.display = "block";
      
      videoEl.play().catch(() => {});
      fitHeight(node);
    };

    if (videoWidget && videoWidget.value) {
       node.onVideoSelected(videoWidget.value);
    }
    
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
      origOnConfigure?.apply(this, arguments);
      if (videoWidget && videoWidget.value) {
          node.onVideoSelected(videoWidget.value);
      }
    };
    
    if (videoWidget) {
        const origCallback = videoWidget.callback;
        videoWidget.callback = function() {
            if (origCallback) origCallback.apply(this, arguments);
            node.onVideoSelected(videoWidget.value);
        };
    }
    
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
      origOnExecuted?.apply(this, arguments);
      const previews = message?.video_preview;
      if (previews && previews.length > 0) {
          if (node.onVideoSelected) {
              node.onVideoSelected(previews[0].filename);
          }
      }
    };
  }
});
