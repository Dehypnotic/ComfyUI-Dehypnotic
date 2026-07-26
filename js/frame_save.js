import { app } from "../../scripts/app.js";

// ─── Dehypnotic FrameSave Extension ─────────────────────────────────────────
// Interactive frame selection, start/end frame filtering, frame step interval,
// custom +/- steppers, live total frame detection, 500px scroll gallery,
// size slider (50px - 250px), mint-green (#34d399) selection borders.

const EXTENSION_NAME = "Dehypnotic.FrameSave";
const NODE_TYPE = "FrameSaveDehypnotic";
const GALLERY_HEIGHT = 500;
const DEFAULT_THUMB_HEIGHT = 100;
const MINT_GREEN = "#34d399";
const MIN_NODE_WIDTH = 580;

// ── Upstream Source & Frame Count Tracing ───────────────────────────────────
function findUpstreamSourceInfo(node, visited = new Set()) {
  if (!app.graph || !node || visited.has(node.id)) return null;
  visited.add(node.id);

  // 1. Check if node is SetNode / GetNode
  if (node.comfyClass === "DehypnoticGetNode") {
    const targetVar = node.widgets?.find((w) => w.name === "variable")?.value;
    if (targetVar) {
      const setNode = app.graph._nodes?.find(
        (n) => n.comfyClass === "DehypnoticSetNode" && n.widgets?.find((w) => w.name === "variable")?.value === targetVar
      );
      if (setNode) {
        return findUpstreamSourceInfo(setNode, visited);
      }
    }
  }

  // 2. Check if node has direct frame count properties or numeric widgets
  if (node.properties && typeof node.properties.frame_count === "number" && node.properties.frame_count > 0) {
    return { count: node.properties.frame_count };
  }
  if (typeof node._dhFrameCount === "number" && node._dhFrameCount > 0) {
    return { count: node._dhFrameCount };
  }

  if (node.widgets) {
    const targetNumNames = [
      "frame_count", "num_frames", "frame_load_cap", "batch_size",
      "image_count", "count", "length", "amount", "total_frames"
    ];
    for (const name of targetNumNames) {
      const w = node.widgets.find((w) => w && w.name === name);
      if (w && typeof w.value === "number" && w.value > 0) {
        return { count: w.value };
      }
    }

    // Check video or image filename widgets
    const targetFileNames = ["video", "file", "path", "image", "filename"];
    for (const name of targetFileNames) {
      const w = node.widgets.find((w) => w && w.name === name);
      if (w && typeof w.value === "string" && w.value && w.value !== "none") {
        return { filename: w.value };
      }
    }
  }

  // 3. Trace upstream input links recursively
  if (node.inputs) {
    for (const input of node.inputs) {
      if (input.link != null) {
        const link = app.graph.links[input.link];
        if (link) {
          const parentNode = app.graph.getNodeById(link.origin_id);
          if (parentNode) {
            const res = findUpstreamSourceInfo(parentNode, visited);
            if (res) return res;
          }
        }
      }
    }
  }

  return null;
}

// ── Image Zoom Overlay ──────────────────────────────────────────────────────
function showImageOverlay(src) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.88);
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
    box-shadow: 0 4px 20px rgba(0,0,0,0.6);
  `;

  const closeText = document.createElement("div");
  closeText.textContent = "Click anywhere or press ESC to close";
  closeText.style.cssText = `
    color: #aaa;
    font-family: Inter, sans-serif;
    font-size: 13px;
    margin-top: 14px;
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
    if (e.key === "Escape") removeOverlay();
  };

  overlay.onclick = removeOverlay;
  document.addEventListener("keydown", escListener);
  document.body.appendChild(overlay);
}

// ── In-Browser Interactive Folder Browser Modal ─────────────────────────────
function showFolderBrowserModal(initialPath, onSelect) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.80);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Inter, sans-serif;
  `;

  const dialog = document.createElement("div");
  dialog.style.cssText = `
    width: 520px;
    max-width: 90vw;
    max-height: 80vh;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.7);
    color: #e4e4e7;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center;";
  const title = document.createElement("div");
  title.style.cssText = "font-weight: bold; font-size: 14px; color: #fff;";
  title.textContent = "Select Destination Directory";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background: none; border: none; color: #aaa; cursor: pointer; font-size: 16px;";
  closeBtn.onclick = () => removeModal();

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Path input row
  const pathRow = document.createElement("div");
  pathRow.style.cssText = "display: flex; gap: 6px; width: 100%;";
  const pathInput = document.createElement("input");
  pathInput.type = "text";
  pathInput.className = "dh-input-field";
  pathInput.style.cssText = "flex: 1; background: #27272a; border: 1px solid #3f3f46; color: #fff; padding: 6px; border-radius: 4px; font-size: 12px;";
  pathInput.value = initialPath || "";

  const goBtn = document.createElement("button");
  goBtn.className = "dh-btn";
  goBtn.textContent = "GO";

  pathRow.appendChild(pathInput);
  pathRow.appendChild(goBtn);

  // Drives & Quick Navigation row
  const quickNavRow = document.createElement("div");
  quickNavRow.style.cssText = "display: flex; gap: 6px; flex-wrap: wrap; font-size: 11px;";

  const upBtn = document.createElement("button");
  upBtn.className = "dh-btn";
  upBtn.style.height = "22px";
  upBtn.textContent = "⬆ Up";

  quickNavRow.appendChild(upBtn);

  // Subfolders list container
  const folderList = document.createElement("div");
  folderList.className = "dh-gallery-scroll";
  folderList.style.cssText = `
    width: 100%;
    height: 280px;
    overflow-y: auto;
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 4px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    box-sizing: border-box;
  `;

  // Action Bar
  const actionBar = document.createElement("div");
  actionBar.style.cssText = "display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "dh-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = () => removeModal();

  const selectBtn = document.createElement("button");
  selectBtn.className = "dh-btn";
  selectBtn.style.cssText = `background: ${MINT_GREEN}; color: #000; border: none; font-weight: bold; padding: 0 16px;`;
  selectBtn.textContent = "SELECT THIS FOLDER";

  actionBar.appendChild(cancelBtn);
  actionBar.appendChild(selectBtn);

  dialog.appendChild(header);
  dialog.appendChild(pathRow);
  dialog.appendChild(quickNavRow);
  dialog.appendChild(folderList);
  dialog.appendChild(actionBar);
  overlay.appendChild(dialog);

  let currentActivePath = initialPath || "";

  const removeModal = () => {
    if (overlay.parentNode) document.body.removeChild(overlay);
  };

  const loadDirectory = async (targetPath) => {
    folderList.innerHTML = "<div style='color: #666; font-size: 11px; padding: 12px;'>Loading folders...</div>";
    try {
      const resp = await fetch("/dehypnotic/frame_save/list_dirs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath || "" }),
      });
      const data = await resp.json();
      if (data && data.success) {
        currentActivePath = data.current_path;
        pathInput.value = data.current_path;

        // Render Drives
        quickNavRow.innerHTML = "";
        quickNavRow.appendChild(upBtn);

        upBtn.onclick = () => {
          if (data.parent_path) loadDirectory(data.parent_path);
        };

        if (data.comfy_output) {
          const outPill = document.createElement("button");
          outPill.className = "dh-btn";
          outPill.style.height = "22px";
          outPill.textContent = "Output";
          outPill.onclick = () => loadDirectory(data.comfy_output);
          quickNavRow.appendChild(outPill);
        }

        if (data.drives) {
          data.drives.forEach((drv) => {
            const drvPill = document.createElement("button");
            drvPill.className = "dh-btn";
            drvPill.style.height = "22px";
            drvPill.textContent = drv;
            drvPill.onclick = () => loadDirectory(drv);
            quickNavRow.appendChild(drvPill);
          });
        }

        // Render Subfolders
        folderList.innerHTML = "";

        if (!data.subfolders || data.subfolders.length === 0) {
          const empty = document.createElement("div");
          empty.style.cssText = "color: #555; font-size: 11px; padding: 12px; text-align: center;";
          empty.textContent = "(No subfolders inside this directory)";
          folderList.appendChild(empty);
        } else {
          data.subfolders.forEach((sub) => {
            const item = document.createElement("div");
            item.style.cssText = `
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 6px 8px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 12px;
              color: #d4d4d8;
              transition: background 0.15s;
            `;
            item.innerHTML = `<span style="font-size: 14px;">📁</span> <span>${sub}</span>`;
            item.onmouseover = () => (item.style.background = "#27272a");
            item.onmouseout = () => (item.style.background = "transparent");
            item.onclick = () => {
              const nextPath = `${currentActivePath.replace(/[/\\]$/, "")}/${sub}`;
              loadDirectory(nextPath);
            };
            folderList.appendChild(item);
          });
        }
      } else {
        folderList.innerHTML = "<div style='color: #f87171; font-size: 11px; padding: 12px;'>Could not access directory</div>";
      }
    } catch (err) {
      folderList.innerHTML = "<div style='color: #f87171; font-size: 11px; padding: 12px;'>Failed to load directory</div>";
    }
  };

  goBtn.onclick = () => loadDirectory(pathInput.value.trim());
  selectBtn.onclick = () => {
    if (onSelect) onSelect(currentActivePath);
    removeModal();
  };

  document.body.appendChild(overlay);
  loadDirectory(initialPath);
}

app.registerExtension({
  name: EXTENSION_NAME,

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // Helper to hide native widgets completely
    const hideNativeWidgets = () => {
      if (node.widgets) {
        for (const w of node.widgets) {
          if (["file_path", "start_frame", "end_frame", "frame_step"].includes(w.name)) {
            w.type = "hidden";
            w.computeSize = () => [0, -4];
            w.draw = () => {};
          }
        }
      }
    };

    hideNativeWidgets();
    setTimeout(hideNativeWidgets, 10);
    setTimeout(hideNativeWidgets, 100);

    // Minimum visual dimensions
    const origComputeSize = node.computeSize;
    node.computeSize = function (out) {
      const size = origComputeSize ? origComputeSize.apply(this, arguments) : [MIN_NODE_WIDTH, 620];
      size[0] = Math.max(size[0], MIN_NODE_WIDTH);
      size[1] = Math.max(size[1], 600);
      return size;
    };
    node.size[0] = Math.max(node.size[0], MIN_NODE_WIDTH);
    node.size[1] = Math.max(node.size[1], 600);

    // State for items & slider height
    let currentThumbHeight = DEFAULT_THUMB_HEIGHT;
    let framesData = []; // [{ filename, subfolder, type, frame_number, selected: false, el, imgEl }]

    // ── Build DOM elements ─────────────────────────────────────────────
    const root = document.createElement("div");
    root.style.cssText = `
      display: flex;
      flex-direction: column;
      width: 100%;
      min-width: 100%;
      box-sizing: border-box;
      font-family: Inter, Consolas, sans-serif;
      gap: 6px;
      padding: 2px 0;
    `;

    // Inject custom scrollbar & stepper styles
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      .dh-gallery-scroll::-webkit-scrollbar { width: 6px; }
      .dh-gallery-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.15); }
      .dh-gallery-scroll::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.18);
        border-radius: 3px;
      }
      .dh-gallery-scroll::-webkit-scrollbar-thumb:hover {
        background: ${MINT_GREEN};
      }
      .dh-input-field {
        background: #1e1e22;
        border: 1px solid #3f3f46;
        color: #e4e4e7;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        outline: none;
        transition: border-color 0.2s, background 0.2s;
        box-sizing: border-box;
      }
      .dh-input-field:focus {
        border-color: ${MINT_GREEN};
      }
      .dh-input-field.error-state {
        background: rgba(239, 68, 68, 0.2) !important;
        border-color: #ef4444 !important;
        color: #fca5a5 !important;
      }
      .dh-btn {
        height: 26px;
        border: 1px solid #3f3f46;
        border-radius: 4px;
        background: #27272a;
        color: #a1a1aa;
        font: bold 10px Inter, sans-serif;
        cursor: pointer;
        outline: none;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        padding: 0 10px;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .dh-btn:hover {
        background: rgba(16, 185, 129, 0.12);
        border-color: #10b981;
        color: ${MINT_GREEN};
      }
      .dh-btn.error-state {
        background: rgba(239, 68, 68, 0.25) !important;
        border-color: #ef4444 !important;
        color: #ef4444 !important;
      }
      .dh-icon-btn {
        height: 26px;
        width: 28px;
        border: 1px solid #3f3f46;
        border-radius: 4px;
        background: #27272a;
        color: #a1a1aa;
        cursor: pointer;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 12px;
      }
      .dh-icon-btn:hover {
        border-color: ${MINT_GREEN};
        color: #ffffff;
      }
      .dh-num-input::-webkit-outer-spin-button,
      .dh-num-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .dh-num-input {
        -moz-appearance: textfield;
        width: 44px;
        height: 22px;
        background: #1e1e22;
        border: 1px solid #3f3f46;
        color: #e4e4e7;
        border-radius: 3px;
        font-size: 11px;
        text-align: center;
        outline: none;
      }
      .dh-num-input:focus {
        border-color: ${MINT_GREEN};
      }
      .dh-stepper-btn {
        width: 20px;
        height: 22px;
        background: #27272a;
        border: 1px solid #3f3f46;
        border-radius: 3px;
        color: #a1a1aa;
        font-weight: bold;
        font-size: 13px;
        cursor: pointer;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        user-select: none;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .dh-stepper-btn:hover {
        background: rgba(16, 185, 129, 0.15);
        border-color: ${MINT_GREEN};
        color: ${MINT_GREEN};
      }
      .dh-stepper-btn:active {
        transform: scale(0.95);
      }
    `;
    root.appendChild(styleEl);

    // ── Row 1: Path Input + Folder Browser Modal Button + Save Button ─
    const pathRow = document.createElement("div");
    pathRow.style.cssText = "display: flex; gap: 4px; align-items: center; width: 100%; box-sizing: border-box;";

    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.className = "dh-input-field";
    pathInput.style.flex = "1";
    pathInput.placeholder = "File path (empty = ComfyUI output)...";

    const pickerBtn = document.createElement("button");
    pickerBtn.className = "dh-icon-btn";
    pickerBtn.title = "Select destination folder";
    pickerBtn.innerHTML = "📁";
    pickerBtn.onclick = (e) => {
      e.stopPropagation();
      showFolderBrowserModal(pathInput.value, (selectedPath) => {
        if (selectedPath) {
          pathInput.value = selectedPath;
          syncWidgetValue("file_path", selectedPath);
        }
      });
    };

    const saveBtn = document.createElement("button");
    saveBtn.className = "dh-btn";
    saveBtn.style.color = MINT_GREEN;
    saveBtn.style.borderColor = "#10b981";
    saveBtn.textContent = "SAVE";

    pathRow.appendChild(pathInput);
    pathRow.appendChild(pickerBtn);
    pathRow.appendChild(saveBtn);

    // Helper to sync widget values back to LiteGraph node
    const syncWidgetValue = (name, val) => {
      const w = node.widgets?.find((w) => w.name === name);
      if (w) w.value = val;
      node.properties[name] = val;
    };
    pathInput.addEventListener("input", () => syncWidgetValue("file_path", pathInput.value));

    // Status / feedback line
    const statusText = document.createElement("div");
    statusText.style.cssText = `
      font-size: 10px;
      color: #888;
      min-height: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 2px;
    `;

    // ── Save action ───────────────────────────────────────────────────
    let errorTimer = null;

    const triggerErrorStyle = (msg) => {
      pathInput.classList.add("error-state");
      saveBtn.classList.add("error-state");
      statusText.style.color = "#f87171";
      statusText.textContent = `❌ ${msg}`;

      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        pathInput.classList.remove("error-state");
        saveBtn.classList.remove("error-state");
        statusText.style.color = "#888";
        statusText.textContent = "";
      }, 3000);
    };

    saveBtn.onclick = async (e) => {
      e.stopPropagation();

      const selectedFrames = framesData.filter((f) => f.selected);
      if (selectedFrames.length === 0) {
        triggerErrorStyle("No images selected!");
        return;
      }

      const targetPath = pathInput.value.trim();
      const filenames = selectedFrames.map((f) => f.filename);

      saveBtn.disabled = true;
      saveBtn.textContent = "SAVING...";

      try {
        const resp = await fetch("/dehypnotic/frame_save/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_path: targetPath,
            filenames: filenames,
          }),
        });

        const result = await resp.json();

        if (!resp.ok || !result.success) {
          triggerErrorStyle(result.error || "Save failed.");
        } else {
          statusText.style.color = MINT_GREEN;
          statusText.textContent = `✓ Saved ${result.saved_count} images to ${result.target_path}`;
          setTimeout(() => {
            if (statusText.textContent.startsWith("✓")) statusText.textContent = "";
          }, 3500);
        }
      } catch (err) {
        triggerErrorStyle("Server communication error.");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "SAVE";
      }
    };

    // ── Row 2: Custom Stepper Controls (Start frame / End frame / Step / Total)
    const rangeRow = document.createElement("div");
    rangeRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      font-size: 10px;
      color: #a1a1aa;
      background: rgba(30, 30, 35, 0.4);
      padding: 5px 8px;
      border-radius: 4px;
      box-sizing: border-box;
      flex-wrap: wrap;
    `;

    // Helper for Stepper Groups with [-] and [+] buttons
    const createStepperGroup = (labelTitle, initialVal, minVal, titleTooltip, onChangeCallback) => {
      const group = document.createElement("div");
      group.style.cssText = "display: flex; align-items: center; gap: 3px;";

      const label = document.createElement("span");
      label.textContent = labelTitle;
      label.style.cssText = "font-size: 10px; color: #a1a1aa; white-space: nowrap;";

      const btnMinus = document.createElement("button");
      btnMinus.className = "dh-stepper-btn";
      btnMinus.textContent = "-";

      const input = document.createElement("input");
      input.type = "number";
      input.className = "dh-num-input";
      input.min = String(minVal);
      input.value = String(initialVal);
      if (titleTooltip) input.title = titleTooltip;

      const btnPlus = document.createElement("button");
      btnPlus.className = "dh-stepper-btn";
      btnPlus.textContent = "+";

      const triggerChange = (newVal) => {
        const clamped = Math.max(minVal, parseInt(newVal, 10) || minVal);
        input.value = String(clamped);
        if (onChangeCallback) onChangeCallback(clamped);
      };

      btnMinus.onclick = (e) => {
        e.stopPropagation();
        const curr = parseInt(input.value, 10) || minVal;
        triggerChange(curr - 1);
      };

      btnPlus.onclick = (e) => {
        e.stopPropagation();
        const curr = parseInt(input.value, 10) || minVal;
        triggerChange(curr + 1);
      };

      input.onchange = () => {
        triggerChange(input.value);
      };

      group.appendChild(label);
      group.appendChild(btnMinus);
      group.appendChild(input);
      group.appendChild(btnPlus);

      return { group, input };
    };

    // 1. Start frame stepper
    const startStepper = createStepperGroup("Start frame:", 1, 1, null, (val) => {
      syncWidgetValue("start_frame", val);
    });

    // 2. End frame stepper
    const endStepper = createStepperGroup("End frame:", 0, 0, "0 = All remaining frames", (val) => {
      syncWidgetValue("end_frame", val);
    });

    // 3. Step stepper
    const stepStepper = createStepperGroup("Step:", 1, 1, "Frame step interval (e.g. 3 = frames 1, 4, 7...)", (val) => {
      syncWidgetValue("frame_step", val);
    });

    const startFrameInput = startStepper.input;
    const endFrameInput = endStepper.input;
    const stepInput = stepStepper.input;

    // Total frames badge
    const totalBadge = document.createElement("span");
    totalBadge.style.cssText = "font-size: 10px; color: #888; font-weight: bold; margin-left: auto; white-space: nowrap;";
    totalBadge.textContent = "(Total: ?)";

    let lastQueriedFilename = "";

    const updateUpstreamTotalFrames = async () => {
      const info = findUpstreamSourceInfo(node);

      if (info) {
        if (typeof info.count === "number" && info.count > 0) {
          totalBadge.textContent = `(Total: ${info.count})`;
          totalBadge.style.color = MINT_GREEN;
          return;
        }

        if (info.filename) {
          if (info.filename === lastQueriedFilename && totalBadge.textContent !== "(Total: ?)") {
            return;
          }
          lastQueriedFilename = info.filename;
          try {
            const resp = await fetch("/dehypnotic/frame_save/get_media_info", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: info.filename }),
            });
            const data = await resp.json();
            if (data && data.success && data.frame_count) {
              totalBadge.textContent = `(Total: ${data.frame_count})`;
              totalBadge.style.color = MINT_GREEN;
              return;
            }
          } catch (e) {
            // silent fail
          }
        }
      }

      if (!node._dhExecutedTotal) {
        totalBadge.textContent = "(Total: ?)";
        totalBadge.style.color = "#888";
      }
    };

    rangeRow.appendChild(startStepper.group);
    rangeRow.appendChild(endStepper.group);
    rangeRow.appendChild(stepStepper.group);
    rangeRow.appendChild(totalBadge);

    // Live connection listener to update total frames automatically when connected
    const origOnConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function () {
      origOnConnectionsChange?.apply(this, arguments);
      updateUpstreamTotalFrames();
    };

    // ── Row 3: Slider + Selection Count + Helper Buttons ───────────────
    const controlRow = document.createElement("div");
    controlRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      font-size: 10px;
      color: #a1a1aa;
      gap: 6px;
      box-sizing: border-box;
    `;

    // Slider container
    const sliderContainer = document.createElement("div");
    sliderContainer.style.cssText = "display: flex; align-items: center; gap: 4px; flex: 1; min-width: 150px;";

    const sliderLabel = document.createElement("span");
    sliderLabel.textContent = `Height: ${DEFAULT_THUMB_HEIGHT}px`;
    sliderLabel.style.cssText = "white-space: nowrap; font-size: 10px; color: #a1a1aa; width: 68px; flex-shrink: 0;";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "50";
    slider.max = "250";
    slider.value = String(DEFAULT_THUMB_HEIGHT);
    slider.style.cssText = "flex: 1; accent-color: " + MINT_GREEN + "; cursor: pointer; height: 14px; min-width: 60px;";

    sliderContainer.appendChild(sliderLabel);
    sliderContainer.appendChild(slider);

    // Selection buttons & badge
    const selControlContainer = document.createElement("div");
    selControlContainer.style.cssText = "display: flex; align-items: center; gap: 4px; flex-shrink: 0;";

    const selBadge = document.createElement("span");
    selBadge.style.cssText = `font-size: 10px; color: ${MINT_GREEN}; margin-right: 2px; font-weight: bold; white-space: nowrap;`;
    selBadge.textContent = "(0/0 selected)";

    const btnSelectAll = document.createElement("button");
    btnSelectAll.className = "dh-btn";
    btnSelectAll.style.padding = "0 6px";
    btnSelectAll.style.fontSize = "10px";
    btnSelectAll.textContent = "Select All";

    const btnDeselectAll = document.createElement("button");
    btnDeselectAll.className = "dh-btn";
    btnDeselectAll.style.padding = "0 6px";
    btnDeselectAll.style.fontSize = "10px";
    btnDeselectAll.textContent = "Deselect All";

    selControlContainer.appendChild(selBadge);
    selControlContainer.appendChild(btnSelectAll);
    selControlContainer.appendChild(btnDeselectAll);

    controlRow.appendChild(sliderContainer);
    controlRow.appendChild(selControlContainer);

    // ── Row 4: Gallery (Fixed height 500px with scroll, full width) ─────
    const gallery = document.createElement("div");
    gallery.className = "dh-gallery-scroll";
    gallery.style.cssText = `
      width: 100%;
      min-width: 100%;
      max-width: 100%;
      height: ${GALLERY_HEIGHT}px;
      overflow-y: auto;
      overflow-x: hidden;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      display: flex;
      flex-wrap: wrap;
      align-content: flex-start;
      gap: 6px;
      padding: 6px;
      box-sizing: border-box;
      flex: 1 1 100%;
    `;

    const emptyMsg = document.createElement("div");
    emptyMsg.style.cssText = `
      width: 100%;
      text-align: center;
      color: #555;
      font-size: 11px;
      padding: 40px 0;
    `;
    emptyMsg.textContent = "Run the node to preview images from temp";
    gallery.appendChild(emptyMsg);

    // Assemble root
    root.appendChild(pathRow);
    root.appendChild(rangeRow);
    root.appendChild(statusText);
    root.appendChild(controlRow);
    root.appendChild(gallery);

    // Prevent events from escaping to LiteGraph canvas
    const blockEvents = ["mousedown", "mouseup", "click", "dblclick", "pointerdown", "pointerup", "pointermove", "wheel"];
    blockEvents.forEach((evt) => {
      root.addEventListener(evt, (e) => e.stopPropagation());
    });

    // ── Update selection visuals ───────────────────────────────────────
    const updateSelectionVisuals = () => {
      let selectedCount = 0;
      framesData.forEach((f) => {
        if (f.selected) {
          selectedCount++;
          f.el.style.border = `3px solid ${MINT_GREEN}`;
          f.el.style.boxShadow = `0 0 8px rgba(52, 211, 153, 0.35)`;
          f.el.style.opacity = "1.0";
          f.el.style.filter = "none";
        } else {
          f.el.style.border = "3px solid transparent";
          f.el.style.boxShadow = "none";
          f.el.style.opacity = "1.0";
          f.el.style.filter = "none";
        }
      });
      selBadge.textContent = `(${selectedCount}/${framesData.length} selected)`;
    };

    btnSelectAll.onclick = (e) => {
      e.stopPropagation();
      framesData.forEach((f) => (f.selected = true));
      updateSelectionVisuals();
    };

    btnDeselectAll.onclick = (e) => {
      e.stopPropagation();
      framesData.forEach((f) => (f.selected = false));
      updateSelectionVisuals();
    };

    // Slider resize behavior
    slider.oninput = () => {
      currentThumbHeight = parseInt(slider.value, 10);
      sliderLabel.textContent = `Height: ${currentThumbHeight}px`;
      framesData.forEach((f) => {
        f.el.style.height = `${currentThumbHeight}px`;
      });
      app.graph?.setDirtyCanvas(true, true);
    };

    // Add DOM widget to node
    const domWidget = node.addDOMWidget("dh_framesave_ui", "custom_ui", root);
    domWidget.computeSize = () => [node.size[0], 600];

    // References for execution
    node._dhPathInput = pathInput;
    node._dhStartFrameInput = startFrameInput;
    node._dhEndFrameInput = endFrameInput;
    node._dhStepInput = stepInput;
    node._dhGalleryEl = gallery;

    // Helper to keep DOM root width locked to node size at all times
    const updateRootWidth = () => {
      if (root && node.size) {
        const targetW = Math.max(node.size[0] - 20, 540);
        root.style.width = targetW + "px";
        root.style.minWidth = targetW + "px";
      }
    };

    const origOnResize = node.onResize;
    node.onResize = function (size) {
      origOnResize?.apply(this, arguments);
      updateRootWidth();
    };

    // Prevent built-in canvas image rendering & lock root width on draw
    const origOnDrawBackground = node.onDrawBackground;
    node.onDrawBackground = function (ctx) {
      this.imgs = null;
      hideNativeWidgets();
      updateRootWidth();
      updateUpstreamTotalFrames();
      origOnDrawBackground?.apply(this, arguments);
    };

    // ── Execute handler: render new temp images ────────────────────────
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
      this.imgs = null;
      hideNativeWidgets();
      updateRootWidth();
      origOnExecuted?.apply(this, arguments);

      const imageInfos = message?.frame_images || message?.images;
      const initialPath = Array.isArray(message?.file_path) ? message.file_path[0] : message?.file_path;
      const sFrame = Array.isArray(message?.start_frame) ? message.start_frame[0] : message?.start_frame;
      const eFrame = Array.isArray(message?.end_frame) ? message.end_frame[0] : message?.end_frame;
      const stStep = Array.isArray(message?.frame_step) ? message.frame_step[0] : message?.frame_step;
      const totFrames = Array.isArray(message?.total_frames) ? message.total_frames[0] : message?.total_frames;

      if (initialPath && !pathInput.value) {
        pathInput.value = initialPath;
      }
      if (sFrame !== undefined) {
        startFrameInput.value = String(sFrame);
      }
      if (eFrame !== undefined) {
        endFrameInput.value = String(eFrame);
      }
      if (stStep !== undefined) {
        stepInput.value = String(stStep);
      }
      if (totFrames !== undefined) {
        node._dhExecutedTotal = totFrames;
        totalBadge.textContent = `(Total: ${totFrames})`;
        totalBadge.style.color = MINT_GREEN;
      }

      if (!imageInfos || imageInfos.length === 0) return;

      const gal = this._dhGalleryEl;
      gal.innerHTML = "";
      framesData = [];

      imageInfos.forEach((info) => {
        const frameCard = document.createElement("div");
        frameCard.style.cssText = `
          height: ${currentThumbHeight}px;
          flex-shrink: 0;
          border-radius: 4px;
          overflow: hidden;
          background: rgba(35, 35, 40, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: height 0.15s, border 0.15s, opacity 0.15s, transform 0.1s;
          position: relative;
          box-sizing: border-box;
        `;

        const img = document.createElement("img");
        const params = new URLSearchParams({
          filename: info.filename,
          subfolder: info.subfolder || "dehypnotic_frame_save",
          type: info.type || "temp",
          t: String(Date.now()),
        });

        img.src = `/api/view?${params.toString()}`;
        img.style.cssText = `
          height: 100%;
          width: auto;
          max-height: 100%;
          object-fit: contain;
          border-radius: 2px;
          display: block;
        `;
        img.alt = info.filename;

        // Card data object - NO images selected by default on initial view
        const itemData = {
          filename: info.filename,
          subfolder: info.subfolder,
          type: info.type,
          frame_number: info.frame_number,
          selected: false,
          el: frameCard,
          imgEl: img,
        };
        framesData.push(itemData);

        // Click frame to toggle selection
        frameCard.onclick = (e) => {
          e.stopPropagation();
          itemData.selected = !itemData.selected;
          updateSelectionVisuals();
        };

        // Double click to view full size overlay
        frameCard.ondblclick = (e) => {
          e.stopPropagation();
          showImageOverlay(img.src);
        };

        // Number badge
        const badge = document.createElement("div");
        badge.textContent = `${info.frame_number}`;
        badge.style.cssText = `
          position: absolute;
          bottom: 2px;
          right: 3px;
          background: rgba(0,0,0,0.75);
          color: #fff;
          font-size: 9px;
          padding: 1px 4px;
          border-radius: 3px;
          pointer-events: none;
        `;

        frameCard.appendChild(img);
        frameCard.appendChild(badge);
        gal.appendChild(frameCard);
      });

      updateSelectionVisuals();
    };

    // Configure handler
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
      origOnConfigure?.apply(this, arguments);
      hideNativeWidgets();
      updateRootWidth();

      const wPath = node.widgets?.find((w) => w.name === "file_path");
      if (wPath && wPath.value) pathInput.value = wPath.value;

      const wStart = node.widgets?.find((w) => w.name === "start_frame");
      if (wStart && wStart.value !== undefined) startFrameInput.value = String(wStart.value);

      const wEnd = node.widgets?.find((w) => w.name === "end_frame");
      if (wEnd && wEnd.value !== undefined) endFrameInput.value = String(wEnd.value);

      const wStep = node.widgets?.find((w) => w.name === "frame_step");
      if (wStep && wStep.value !== undefined) stepInput.value = String(wStep.value);

      updateUpstreamTotalFrames();
    };
  },
});
