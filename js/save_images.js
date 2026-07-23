import { app } from "../../scripts/app.js";

// ─── Dehypnotic Save Images: Thumbnail Gallery Extension ────────────────────
// DOM-based thumbnail preview widget with fixed height and scrollbar.

const EXTENSION_NAME = "Dehypnotic.SaveImages.Gallery";
const NODE_TYPE = "SaveImagesDehypnotic";

// ── Layout constants ────────────────────────────────────────────────────────
const GALLERY_HEIGHT = 360;   // Fixed gallery viewport height (px)
const WIDGET_HEIGHT = 400;    // Total widget height including path text + toggle
const TOGGLE_COLOR_ON = "#34d399";
const TOGGLE_COLOR_OFF = "#a1a1aa";
const THUMB_SIZE = 80;        // Thumbnail square size (px)
const THUMB_GAP = 4;          // Gap between thumbnails (px)

function showImageOverlay(src) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
    flex-direction: column;
  `;
  
  const largeImg = document.createElement("img");
  largeImg.src = src;
  largeImg.style.cssText = `
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  `;
  
  const closeText = document.createElement("div");
  closeText.textContent = "Click anywhere or press ESC to close";
  closeText.style.cssText = `
    color: #ccc;
    font-family: sans-serif;
    font-size: 14px;
    margin-top: 15px;
  `;
  
  overlay.appendChild(largeImg);
  overlay.appendChild(closeText);
  
  const removeOverlay = () => {
    if (overlay.parentNode) {
      document.body.removeChild(overlay);
      document.removeEventListener("keydown", escListener);
    }
  };
  
  const escListener = (e) => {
    if (e.key === "Escape") {
      removeOverlay();
    }
  };
  
  overlay.onclick = removeOverlay;
  document.addEventListener("keydown", escListener);
  
  document.body.appendChild(overlay);
}

app.registerExtension({
  name: EXTENSION_NAME,

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // ── Persistent property ───────────────────────────────────────────────
    if (node.properties.showThumbnails === undefined) {
      node.properties.showThumbnails = true;
    }

    // ── Enforce 20% wider minimum width ───────────────────────────────────
    const origComputeSize = node.computeSize;
    node.computeSize = function (out) {
      const size = origComputeSize ? origComputeSize.apply(this, arguments) : [210, 26];
      size[0] = Math.max(size[0], 300); // Default is usually ~210, 260 is ~20% wider
      return size;
    }; 
    node.size[0] = Math.max(node.size[0], 300);

    // ── Move specific widgets to Properties Panel ─────────────────────────
    setTimeout(() => {
      if (node.widgets) {
        for (const w of node.widgets) {
          if (w.name === "number_padding" || w.name === "number_start" || w.name === "dpi") {
            // Hide the widget from the node body
            w.type = "hidden";
            w.computeSize = () => [0, -4];

            // Register as a property so it shows in the Properties menu
            if (node.properties[w.name] === undefined) {
              node.properties[w.name] = w.value;
            }

            // Tell LiteGraph it's an integer so it doesn't show 3 decimals
            node.properties_info = node.properties_info || [];
            if (!node.properties_info.find((p) => p.name === w.name)) {
              node.properties_info.push({
                name: w.name,
                type: "int",
                step: 1,
                precision: 0,
                min: w.options?.min || 0,
                max: w.options?.max || 1000000
              });
            }
          }
        }
        node.setSize(node.computeSize());
        app.graph?.setDirtyCanvas(true, true);
      }
    }, 100);

    // Sync property changes back to the hidden widgets so Python gets them
    const origOnPropertyChanged = node.onPropertyChanged;
    node.onPropertyChanged = function (name, value) {
      origOnPropertyChanged?.apply(this, arguments);
      const w = this.widgets?.find((w) => w.name === name);
      if (w) {
        w.value = value;
      }
    };

    // ── Build DOM structure ───────────────────────────────────────────────

    // Root container
    const root = document.createElement("div");
    root.style.cssText = `
      display: flex;
      flex-direction: column;
      width: 100%;
      font-family: Inter, Consolas, monospace;
      gap: 0;
    `;

    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.style.cssText = `
      width: 100%;
      height: 22px;
      border: 1px solid #3f3f46;
      border-radius: 4px;
      background: #27272a;
      color: #a1a1aa;
      font: bold 10px Inter, sans-serif;
      cursor: pointer;
      outline: none;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
      flex-shrink: 0;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    `;
    toggleBtn.addEventListener("mouseover", () => {
      // Lighten the green border and text on hover
      toggleBtn.style.borderColor = "#34d399";
      toggleBtn.style.color = "#ffffff";
    });
    toggleBtn.addEventListener("mouseout", () => {
      updateToggleStyle();
    });

    const updateToggleStyle = () => {
      const on = node.properties.showThumbnails;
      toggleBtn.textContent = on ? "▼ Hide Preview" : "▶ Show Preview";
      toggleBtn.style.background = "rgba(16, 185, 129, 0.12)";
      toggleBtn.style.borderColor = "#10b981";
      toggleBtn.style.color = TOGGLE_COLOR_ON;
    };

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      node.properties.showThumbnails = !node.properties.showThumbnails;
      updateToggleStyle();
      updateVisibility();
      node.setDirtyCanvas(true, true);
      requestAnimationFrame(() => {
        app.graph?.setDirtyCanvas(true, true);
        app.canvas?.draw?.(true, true);
      });
    });

    // Gallery scroll container
    const gallery = document.createElement("div");
    gallery.style.cssText = `
      width: 100%;
      height: ${GALLERY_HEIGHT}px;
      overflow-y: auto;
      overflow-x: hidden;
      background: rgba(0, 0, 0, 0.20);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      margin-top: 4px;
      display: flex;
      flex-wrap: wrap;
      align-content: flex-start;
      gap: ${THUMB_GAP}px;
      padding: 4px;
      box-sizing: border-box;
    `;

    // Scrollbar styling (thin, dark)
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      .dh-gallery-scroll::-webkit-scrollbar { width: 4px; }
      .dh-gallery-scroll::-webkit-scrollbar-track { background: transparent; }
      .dh-gallery-scroll::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.12);
        border-radius: 2px;
      }
      .dh-gallery-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.25);
      }
    `;
    root.appendChild(styleEl);
    gallery.classList.add("dh-gallery-scroll");

    // File path text
    const pathText = document.createElement("div");
    pathText.style.cssText = `
      width: 100%;
      font-size: 10px;
      color: #b0b0b0;
      margin-top: 0px;
      margin-bottom: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-align: center;
      flex-shrink: 0;
      min-height: 14px;
      box-sizing: border-box;
    `;

    // Empty state message
    const emptyMsg = document.createElement("div");
    emptyMsg.style.cssText = `
      width: 100%;
      text-align: center;
      color: #555;
      font-size: 10px;
      padding: 30px 0;
    `;
    emptyMsg.textContent = "Kjør noden for å se forhåndsvisning";
    gallery.appendChild(emptyMsg);

    // Assemble
    root.appendChild(pathText);
    root.appendChild(toggleBtn);
    root.appendChild(gallery);

    // Block events from propagating to canvas
    const blockEvents = ["mousedown", "mouseup", "click", "dblclick", "pointerdown", "pointerup", "pointermove", "wheel"];
    blockEvents.forEach(evt => {
      root.addEventListener(evt, (e) => e.stopPropagation());
    });

    // ── Visibility management ─────────────────────────────────────────────
    const updateVisibility = () => {
      const on = node.properties.showThumbnails;
      gallery.style.display = on ? "flex" : "none";
      // Recalculate widget height
      if (domWidget) {
        domWidget.computeSize = () => {
          if (!on) return [node.size[0], 56]; // path text + margin (22px) + toggle btn (22px) + bottom padding
          return [node.size[0], WIDGET_HEIGHT];
        };
      }

      // Force LiteGraph to recalculate the node's bounds. 
      // Setting height to 10 causes setSize to clamp to the new minimum needed.
      if (node.size) {
        node.setSize([node.size[0], 10]);
      }
    };


    // ── Add as DOM widget ─────────────────────────────────────────────────
    const domWidget = node.addDOMWidget("dh_preview_gallery", "custom_ui", root);
    domWidget.computeSize = () => [node.size[0], WIDGET_HEIGHT];

    // Initial state
    updateToggleStyle();
    updateVisibility();

    // ── Store references for onExecuted ───────────────────────────────────
    node._dhGalleryEl = gallery;
    node._dhPathEl = pathText;
    node._dhEmptyMsg = emptyMsg;
    node._dhUpdateToggle = updateToggleStyle;
    node._dhUpdateVis = updateVisibility;

    // ── onExecuted: receive UI data from backend ──────────────────────────
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
      origOnExecuted?.apply(this, arguments);

      const imageInfos = message?.thumbnails;
      const paths = message?.saved_paths;

      // Skip empty messages — keep previous data
      if ((!imageInfos || imageInfos.length === 0) && (!paths || paths.length === 0)) {
        return;
      }

      const gal = this._dhGalleryEl;
      const pathEl = this._dhPathEl;
      const emptyEl = this._dhEmptyMsg;

      // Update file path text
      if (paths && paths.length > 0) {
        const lastPath = paths[paths.length - 1];

        let displayPath = lastPath;
        const parts = lastPath.split(/[/\\]/);
        
        const filePathWidget = this.widgets?.find(w => w.name === "file_path");
        const isDefaultOutput = !filePathWidget || !filePathWidget.value || filePathWidget.value.trim() === "";

        if (isDefaultOutput) {
          const outIdx = parts.lastIndexOf("output");
          if (outIdx !== -1) {
            displayPath = parts.slice(outIdx).join("\\");
          } else if (parts.length > 3) {
            displayPath = `...\\${parts.slice(-3).join("\\")}`;
          }
        } else {
          if (parts.length > 4) {
            const first = parts.slice(0, 2).join("\\");
            const lastTwo = parts.slice(-2).join("\\");
            displayPath = `${first}\\...\\${lastTwo}`;
          }
        }

        pathEl.innerHTML = "";
        const lbl = document.createElement("span");
        lbl.style.color = "#707070";
        lbl.textContent = "Last saved: ";

        const val = document.createElement("span");
        val.textContent = displayPath;

        pathEl.appendChild(lbl);
        pathEl.appendChild(val);
      }

      // Update thumbnails
      if (imageInfos && imageInfos.length > 0 && gal) {
        if (emptyEl && emptyEl.parentNode === gal) {
          gal.removeChild(emptyEl);
        }

        for (const info of imageInfos) {
          const thumb = document.createElement("div");
          thumb.style.cssText = `
            width: ${THUMB_SIZE}px;
            height: ${THUMB_SIZE}px;
            flex-shrink: 0;
            border-radius: 3px;
            overflow: hidden;
            background: rgba(50, 50, 50, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: outline 0.15s;
          `;
          
          thumb.addEventListener("mouseover", () => thumb.style.outline = "1px solid #10b981");
          thumb.addEventListener("mouseout", () => thumb.style.outline = "none");
          
          thumb.onclick = (e) => {
            e.stopPropagation();
            showImageOverlay(img.src);
          };

          const img = document.createElement("img");
          const params = new URLSearchParams({
            filename: info.filename,
            subfolder: info.subfolder || "",
            type: info.type || "temp",
          });
          img.src = `/api/view?${params.toString()}`;
          img.style.cssText = `
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border-radius: 2px;
          `;
          img.alt = info.filename;

          // Loading indicator
          const loadingText = document.createElement("span");
          loadingText.textContent = "...";
          loadingText.style.cssText = "color: #555; font-size: 10px;";
          thumb.appendChild(loadingText);

          img.onload = () => {
            thumb.innerHTML = "";
            thumb.appendChild(img);
          };
          img.onerror = () => {
            loadingText.textContent = "✕";
            loadingText.style.color = "#833";
          };

          gal.prepend(thumb);
        }
      }
    };

    // ── Handle workflow load / undo-redo ───────────────────────────────────
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
      origOnConfigure?.apply(this, arguments);
      if (node._dhUpdateToggle) node._dhUpdateToggle();
      if (node._dhUpdateVis) node._dhUpdateVis();
    };
  },
});
