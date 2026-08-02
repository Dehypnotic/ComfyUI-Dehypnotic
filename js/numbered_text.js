import { app } from "../../scripts/app.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough, installResizeFloor } from "./shared/index.mjs";

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function parseSerializedText(text) {
    const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Check if the text contains any custom checkbox markup
    if (/\[[ xX]\]/.test(cleanText)) {
        const lines = cleanText.split("\n");
        const items = [];
        let currentItem = null;

        for (let line of lines) {
            const match = line.match(/^\[([xX ]?)\]\s*(.*)/);
            if (match) {
                if (currentItem) {
                    items.push(currentItem);
                }
                currentItem = {
                    checked: match[1].toLowerCase() === "x",
                    text: match[2]
                };
            } else {
                if (currentItem) {
                    currentItem.text += "\n" + line;
                } else if (line.trim()) {
                    currentItem = {
                        checked: true,
                        text: line
                    };
                }
            }
        }
        if (currentItem) {
            items.push(currentItem);
        }
        return items;
    } else {
        // Upgrade from standard numbering (e.g. "1. Bla\n2. Bla bla")
        const lines = cleanText.split("\n");
        const items = [];
        let currentItem = null;

        for (let line of lines) {
            const match = line.match(/^\s*\d+\.\s*(.*)/);
            if (match) {
                if (currentItem) {
                    items.push(currentItem);
                }
                currentItem = {
                    checked: true,
                    text: match[1]
                };
            } else {
                if (currentItem) {
                    currentItem.text += "\n" + line;
                } else if (line.trim()) {
                    currentItem = {
                        checked: true,
                        text: line
                    };
                }
            }
        }
        if (currentItem) {
            items.push(currentItem);
        }
        if (items.length === 0) {
            items.push({ checked: false, text: "" });
        }
        return items;
    }
}

function serializeItems(items) {
    return items.map(item => {
        const prefix = item.checked ? "[x]" : "[ ]";
        return `${prefix} ${item.text}`;
    }).join("\n");
}

// ---------------------------------------------------------------------------
// Userdata API helpers  (ComfyUI /userdata endpoints)
// ---------------------------------------------------------------------------

const TEXT_DIR = "Dehypnotic/numbered_text";

async function listTextFiles() {
    try {
        const resp = await fetch("/dehypnotic/user_text/list?type=numbered_text");
        if (!resp.ok) return [];
        const files = await resp.json();
        return files.map(f => ({
            path: f.path,
            name: f.name,
            modified: f.modified || 0,
        }));
    } catch (e) {
        console.warn("[NumberedText] listTextFiles exception:", e);
        return [];
    }
}

async function saveTextFile(filename, items, overwrite = true) {
    const safeFilename = filename.replace(/[/\\:*?"<>|]/g, "_");
    const body = JSON.stringify({ type: "numbered_text", filename: safeFilename, content: { version: 1, items }, overwrite });
    try {
        const resp = await fetch("/dehypnotic/user_text/save", {
            method: "POST",
            body,
            headers: { "Content-Type": "application/json" }
        });
        return resp.ok;
    } catch (e) {
        console.error("[NumberedText] saveTextFile exception:", e);
        return false;
    }
}

async function loadTextFile(filePath) {
    try {
        const resp = await fetch(`/dehypnotic/user_text/load?type=numbered_text&filename=${encodeURIComponent(filePath)}`, { cache: "no-store" });
        if (!resp.ok) {
            console.warn("[NumberedText] loadTextFile error:", resp.status);
            return null;
        }
        const data = await resp.json();
        return data;
    } catch (e) {
        console.error("[NumberedText] loadTextFile exception:", e);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Render list
// ---------------------------------------------------------------------------

function renderList(container, textWidget, node) {
    // Clean up old resize observers to prevent memory leaks
    if (container.observers) {
        container.observers.forEach(obs => obs.disconnect());
    }
    container.observers = [];

    container.innerHTML = "";

    const textValue = textWidget.value || "[x] ";
    container.renderedValue = textValue;
    const items = parseSerializedText(textValue);

    if (container.fromInput) container.fromInput.max = items.length;
    if (container.toInput) container.toInput.max = items.length + 1;
    const separatorWidget = node.widgets.find(w => w.name === "separator");
    if (container.sepInput && separatorWidget) {
        container.sepInput.value = separatorWidget.value || ", ";
    }

    items.forEach((item, index) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "stretch";
        row.style.width = "100%";
        row.style.backgroundColor = index % 2 === 0 ? "#1e1e1e" : "#2d2d2d";
        row.style.borderBottom = "1px solid #222";

        // Margin container (checkmark & index label)
        const margin = document.createElement("div");
        margin.style.display = "flex";
        margin.style.alignItems = "center";
        margin.style.padding = "4px 8px";
        margin.style.userSelect = "none";
        margin.style.borderRight = "1px solid #252525";
        margin.style.backgroundColor = "rgba(0, 0, 0, 0.15)";
        margin.style.minWidth = "55px";
        margin.style.justifyContent = "space-between";

        // Checkbox
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.checked;
        checkbox.style.cursor = "pointer";
        checkbox.style.accentColor = "#4a90e2";
        checkbox.style.margin = "0";
        checkbox.style.width = "13px";
        checkbox.style.height = "13px";

        checkbox.addEventListener("change", () => {
            item.checked = checkbox.checked;
            updateWidgetValue();
        });
        checkbox.addEventListener("mousedown", (e) => e.stopPropagation());
        checkbox.addEventListener("pointerdown", (e) => e.stopPropagation());

        // Index Label
        const label = document.createElement("span");
        label.textContent = `${index + 1}.`;
        label.style.color = "#888";
        label.style.fontFamily = "monospace";
        label.style.fontSize = "10px";
        label.style.fontWeight = "bold";
        label.style.marginLeft = "4px";

        margin.appendChild(checkbox);
        margin.appendChild(label);

        // Textarea container
        const textContainer = document.createElement("div");
        textContainer.style.flex = "1";
        textContainer.style.display = "flex";
        textContainer.style.alignItems = "center";

        // Textarea
        const textarea = document.createElement("textarea");
        textarea.value = item.text;
        textarea.rows = 1;
        textarea.style.width = "100%";
        textarea.style.background = "transparent";
        textarea.style.border = "none";
        textarea.style.color = "#eee";
        textarea.style.fontFamily = "monospace";
        textarea.style.fontSize = "11px";
        textarea.style.padding = "4px 8px";
        textarea.style.outline = "none";
        textarea.style.resize = "none";
        textarea.style.boxSizing = "border-box";
        textarea.style.lineHeight = "1.3";
        textarea.style.overflow = "hidden";

        // Auto-resize height function
        const resizeTextarea = () => {
            textarea.style.height = "auto";
            textarea.style.height = `${textarea.scrollHeight}px`;
            node.setDirtyCanvas(true, true);
        };

        // Trigger resize on input and load
        textarea.addEventListener("input", () => {
            item.text = textarea.value;
            updateWidgetValue();
            resizeTextarea();
        });

        textarea.addEventListener("mousedown", (e) => e.stopPropagation());
        textarea.addEventListener("pointerdown", (e) => e.stopPropagation());

        // Keydown handlers
        textarea.addEventListener("keydown", (event) => {
            event.stopPropagation(); // Stop propagation to prevent LiteGraph canvas hotkeys
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();

                items.splice(index + 1, 0, { checked: false, text: "" });
                textWidget.value = serializeItems(items);
                renderList(container, textWidget, node);

                setTimeout(() => {
                    const nextRow = container.children[index + 1];
                    if (nextRow) {
                        const nextTextarea = nextRow.querySelector("textarea");
                        if (nextTextarea) {
                            nextTextarea.focus();
                        }
                    }
                }, 10);
            } else if (event.key === "Backspace" && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
                if (textarea.value === "" && items.length > 1) {
                    event.preventDefault();

                    items.splice(index, 1);
                    textWidget.value = serializeItems(items);
                    renderList(container, textWidget, node);

                    setTimeout(() => {
                        const prevRow = container.children[index - 1];
                        if (prevRow) {
                            const prevTextarea = prevRow.querySelector("textarea");
                            if (prevTextarea) {
                                prevTextarea.focus();
                                const len = prevTextarea.value.length;
                                prevTextarea.setSelectionRange(len, len);
                            }
                        }
                    }, 10);
                }
            } else if (event.key === "ArrowUp") {
                const firstNewline = textarea.value.indexOf("\n");
                if (firstNewline === -1 || textarea.selectionStart <= firstNewline) {
                    event.preventDefault();
                    const prevRow = container.children[index - 1];
                    if (prevRow) {
                        const prevTextarea = prevRow.querySelector("textarea");
                        if (prevTextarea) {
                            prevTextarea.focus();
                            const len = prevTextarea.value.length;
                            prevTextarea.setSelectionRange(len, len);
                        }
                    }
                }
            } else if (event.key === "ArrowDown") {
                const lastNewline = textarea.value.lastIndexOf("\n");
                if (lastNewline === -1 || textarea.selectionStart > lastNewline) {
                    event.preventDefault();
                    const nextRow = container.children[index + 1];
                    if (nextRow) {
                        const nextTextarea = nextRow.querySelector("textarea");
                        if (nextTextarea) {
                            nextTextarea.focus();
                            const len = nextTextarea.value.length;
                            nextTextarea.setSelectionRange(len, len);
                        }
                    }
                }
            }
        });

        textarea.addEventListener("keyup", (event) => {
            event.stopPropagation();
        });

        textarea.addEventListener("keypress", (event) => {
            event.stopPropagation();
        });

        textContainer.appendChild(textarea);
        row.appendChild(margin);
        row.appendChild(textContainer);
        container.appendChild(row);

        setTimeout(resizeTextarea, 0);

        try {
            const ro = new ResizeObserver(() => {
                resizeTextarea();
            });
            ro.observe(textarea);
            container.observers.push(ro);
        } catch (e) {
            console.warn("ResizeObserver not supported or failed", e);
        }
    });

    container.itemsCount = items.length;

    function updateWidgetValue() {
        textWidget.value = serializeItems(items);
        if (textWidget.callback) {
            textWidget.callback(textWidget.value);
        }
        node.trigger("change");
    }
}

function measureNumberedTextFloor(root) {
    if (!root) return 0;
    const LIST_MIN = 80;
    const header = root.querySelector(".dh-numtext-header");
    const buttons = root.querySelector(".dh-numtext-buttons");
    const swap = root.querySelector(".dh-numtext-swap");
    const cs = getComputedStyle(root);
    const gap = parseFloat(cs.rowGap || cs.gap) || 0;
    const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    let h = LIST_MIN;
    let count = 1;
    if (header) { h += header.offsetHeight; count += 1; }
    if (buttons) { h += buttons.offsetHeight; count += 1; }
    if (swap) { h += swap.offsetHeight; count += 1; }
    if (count > 1) h += gap * (count - 1);
    return h + padV;
}

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

const MIN_W = 360;
const MIN_H = 220;
const DEFAULT_W = 400;
const DEFAULT_H = 480;
const WIDGET_MIN_H = 180;

app.registerExtension({
    name: "dehypnotic.NumberedText",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "NumberedText" && nodeData.name !== "dehypnotic_NumberedText") return;

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
            this._dhNumTextFloorOff?.();
            this._dhNumTextFloorOff = null;
            if (origRemoved) return origRemoved.apply(this, arguments);
        };
    },

    async nodeCreated(node) {
        if (node.comfyClass === "NumberedText" || node.comfyClass === "dehypnotic_NumberedText") {
            const textWidget = node.widgets.find(w => w.name === "text");
            const separatorWidget = node.widgets.find(w => w.name === "separator");
            if (separatorWidget) {
                separatorWidget.type = "hidden";
                separatorWidget.computeSize = () => [0, -4];
                if (!separatorWidget.options) separatorWidget.options = {};
                separatorWidget.options.canvasOnly = true;
                if (!separatorWidget.draw) separatorWidget.draw = function () { };
            }
            if (textWidget) {
                textWidget.type = "hidden";
                textWidget.computeSize = () => [0, -4];
                if (!textWidget.options) textWidget.options = {};
                textWidget.options.canvasOnly = true;
                if (!textWidget.draw) textWidget.draw = function () { };

                const hideInput = () => {
                    const tEl = textWidget.element || textWidget.inputEl;
                    if (tEl) {
                        tEl.style.display = "none";
                        tEl.style.width = "0px";
                        tEl.style.height = "0px";
                        tEl.style.position = "absolute";
                        tEl.style.opacity = "0";
                        tEl.style.pointerEvents = "none";
                    }
                    const sEl = separatorWidget?.element || separatorWidget?.inputEl;
                    if (sEl) {
                        sEl.style.display = "none";
                        sEl.style.width = "0px";
                        sEl.style.height = "0px";
                        sEl.style.position = "absolute";
                        sEl.style.opacity = "0";
                        sEl.style.pointerEvents = "none";
                    }
                };
                hideInput();

                const origOnShown = node.onShown;
                node.onShown = function () {
                    origOnShown?.apply(this, arguments);
                    hideInput();
                };

                // --- File picker row ---
                const filePickerRow = document.createElement("div");
                filePickerRow.className = "dh-numtext-header";
                filePickerRow.style.display = "flex";
                filePickerRow.style.flexDirection = "row";
                filePickerRow.style.alignItems = "center";
                filePickerRow.style.width = "100%";
                filePickerRow.style.padding = "4px 6px";
                filePickerRow.style.boxSizing = "border-box";
                filePickerRow.style.gap = "5px";
                filePickerRow.style.flexWrap = "wrap";
                filePickerRow.style.rowGap = "4px";
                filePickerRow.style.backgroundColor = "transparent";
                filePickerRow.style.borderBottom = "1px solid #333";
                filePickerRow.style.flex = "0 0 auto";
                filePickerRow.style.userSelect = "none";

                const loadFileBtn = document.createElement("button");
                loadFileBtn.type = "button";
                loadFileBtn.textContent = "Load";
                loadFileBtn.title = "Load selected file into list";
                loadFileBtn.style.backgroundColor = "#27272a";
                loadFileBtn.style.border = "1px solid #3f3f46";
                loadFileBtn.style.borderRadius = "3px";
                loadFileBtn.style.color = "#34d399";
                loadFileBtn.style.padding = "2px 8px";
                loadFileBtn.style.fontSize = "10px";
                loadFileBtn.style.fontFamily = "sans-serif";
                loadFileBtn.style.cursor = "pointer";
                loadFileBtn.style.whiteSpace = "nowrap";
                loadFileBtn.style.transition = "background 0.15s, border-color 0.15s";
                loadFileBtn.style.flex = "none";

                loadFileBtn.addEventListener("mouseover", () => {
                    loadFileBtn.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
                    loadFileBtn.style.borderColor = "#10b981";
                });
                loadFileBtn.addEventListener("mouseout", () => {
                    loadFileBtn.style.backgroundColor = "#27272a";
                    loadFileBtn.style.borderColor = "#3f3f46";
                });

                const fileSelect = document.createElement("select");
                fileSelect.style.flex = "1 1 100px";
                fileSelect.style.minWidth = "50px";
                fileSelect.style.backgroundColor = "#2d2d2d";
                fileSelect.style.border = "1px solid #555";
                fileSelect.style.borderRadius = "3px";
                fileSelect.style.color = "#ccc";
                fileSelect.style.fontSize = "10px";
                fileSelect.style.padding = "2px 4px";
                fileSelect.style.cursor = "pointer";
                fileSelect.style.outline = "none";

                const placeholderOpt = document.createElement("option");
                placeholderOpt.value = "";
                placeholderOpt.textContent = "— New file —";
                fileSelect.appendChild(placeholderOpt);

                let currentFilePath = "";
                let currentFileName = "";

                async function refreshFileList(selectValue) {
                    const files = await listTextFiles();
                    while (fileSelect.options.length > 1) {
                        fileSelect.remove(1);
                    }
                    for (const f of files) {
                        const opt = document.createElement("option");
                        opt.value = f.path;
                        opt.textContent = f.name;
                        fileSelect.appendChild(opt);
                    }
                    if (selectValue) {
                        fileSelect.value = selectValue;
                    }
                }

                const deleteFileBtn = document.createElement("button");
                deleteFileBtn.type = "button";

                async function loadSelectedFile(selected) {
                    if (!selected) return;

                    const baseName = selected.replace(/^.*[\/\\]/, "").replace(/\.json$/i, "");
                    const data = await loadTextFile(selected);
                    if (!data || !Array.isArray(data.items)) {
                        alert("Failed to load file or invalid format.");
                        return;
                    }

                    const existingItems = parseSerializedText(textWidget.value || "");
                    const isEffectivelyEmpty =
                        existingItems.length === 0 ||
                        (existingItems.length === 1 && existingItems[0].text.trim() === "");

                    const mergedItems = isEffectivelyEmpty
                        ? data.items
                        : [...existingItems, ...data.items];

                    textWidget.value = serializeItems(mergedItems);
                    renderList(listContainer, textWidget, node);

                    currentFilePath = selected;
                    currentFileName = baseName;
                    deleteFileBtn.disabled = false;
                    deleteFileBtn.style.opacity = "1";
                }

                loadFileBtn.addEventListener("click", async () => {
                    await loadSelectedFile(fileSelect.value);
                });

                fileSelect.addEventListener("change", () => {
                    const selected = fileSelect.value;
                    deleteFileBtn.disabled = !selected;
                    deleteFileBtn.style.opacity = selected ? "1" : "0.4";
                    
                    if (selected) {
                        currentFilePath = selected;
                        currentFileName = selected.replace(/^.*[\/\\]/, "").replace(/\.json$/i, "");
                    } else {
                        currentFilePath = "";
                        currentFileName = "";
                    }
                });

                deleteFileBtn.textContent = "Del";
                deleteFileBtn.title = "Delete selected file from disk";
                deleteFileBtn.disabled = true;
                deleteFileBtn.style.backgroundColor = "#3a1515";
                deleteFileBtn.style.border = "1px solid #7f2020";
                deleteFileBtn.style.borderRadius = "3px";
                deleteFileBtn.style.color = "#e57373";
                deleteFileBtn.style.padding = "2px 7px";
                deleteFileBtn.style.fontSize = "10px";
                deleteFileBtn.style.fontFamily = "sans-serif";
                deleteFileBtn.style.cursor = "pointer";
                deleteFileBtn.style.whiteSpace = "nowrap";
                deleteFileBtn.style.opacity = "0.4";
                deleteFileBtn.style.transition = "background 0.15s, border-color 0.15s, opacity 0.15s";
                deleteFileBtn.style.flex = "none";

                deleteFileBtn.addEventListener("mouseover", () => {
                    if (!deleteFileBtn.disabled) {
                        deleteFileBtn.style.backgroundColor = "#5a1f1f";
                        deleteFileBtn.style.borderColor = "#c62828";
                    }
                });
                deleteFileBtn.addEventListener("mouseout", () => {
                    if (!deleteFileBtn.disabled) {
                        deleteFileBtn.style.backgroundColor = "#3a1515";
                        deleteFileBtn.style.borderColor = "#7f2020";
                    }
                });
                deleteFileBtn.addEventListener("click", async () => {
                    const pathToDelete = currentFilePath || fileSelect.value;
                    if (!pathToDelete) return;
                    const baseName = pathToDelete.replace(/^.*[\/\\]/, "").replace(/\.json$/i, "");
                    if (!confirm(`Delete "${baseName}.json" from disk?\nThis cannot be undone.`)) return;

                    try {
                        const resp = await fetch("/dehypnotic/user_text/delete", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ type: "numbered_text", filename: pathToDelete })
                        });
                        if (resp.ok || resp.status === 204) {
                            currentFilePath = "";
                            currentFileName = "";
                            deleteFileBtn.disabled = true;
                            deleteFileBtn.style.opacity = "0.4";
                            await refreshFileList("");
                        } else {
                            alert(`Failed to delete file (HTTP ${resp.status}).`);
                        }
                    } catch (e) {
                        console.error("[NumberedText] deleteFile exception:", e);
                        alert("Failed to delete file.");
                    }
                });

                filePickerRow.appendChild(loadFileBtn);
                filePickerRow.appendChild(fileSelect);
                filePickerRow.appendChild(deleteFileBtn);

                for (const elem of [loadFileBtn, fileSelect, deleteFileBtn]) {
                    elem.addEventListener("mousedown", (e) => e.stopPropagation());
                    elem.addEventListener("pointerdown", (e) => e.stopPropagation());
                }

                const refreshInterval = setInterval(() => {
                    refreshFileList(currentFilePath || fileSelect.value);
                }, 30000);

                refreshFileList("");

                // --- Parent Container (Flexbox) ---
                const parentContainer = document.createElement("div");
                parentContainer.className = "dh-numtext-root";
                parentContainer.style.display = "flex";
                parentContainer.style.flexDirection = "column";
                parentContainer.style.width = "100%";
                parentContainer.style.height = "100%";
                parentContainer.style.gap = "4px";
                parentContainer.style.backgroundColor = "transparent";
                parentContainer.style.boxSizing = "border-box";
                parentContainer.style.border = "1px solid #333";
                parentContainer.style.borderRadius = "4px";
                parentContainer.style.overflow = "hidden";
                parentContainer.style.padding = "4px";

                // --- Dynamic List Container ---
                const listContainer = document.createElement("div");
                listContainer.style.display = "flex";
                listContainer.style.flexDirection = "column";
                listContainer.style.width = "100%";
                listContainer.style.flex = "1 1 auto";
                listContainer.style.height = "100%";
                listContainer.style.minHeight = "80px";
                listContainer.style.overflowY = "auto";
                listContainer.style.backgroundColor = "#151515";

                // --- Button Container ---
                const buttonContainer = document.createElement("div");
                buttonContainer.className = "dh-numtext-buttons";
                buttonContainer.style.display = "flex";
                buttonContainer.style.flexDirection = "row";
                buttonContainer.style.flexWrap = "wrap";
                buttonContainer.style.justifyContent = "space-between";
                buttonContainer.style.padding = "4px 6px";
                buttonContainer.style.gap = "4px";
                buttonContainer.style.rowGap = "4px";
                buttonContainer.style.borderTop = "1px solid #333";
                buttonContainer.style.backgroundColor = "transparent";
                buttonContainer.style.flex = "0 0 auto";
                buttonContainer.style.userSelect = "none";

                // --- Swap Row ---
                const swapRow = document.createElement("div");
                swapRow.className = "dh-numtext-swap";
                swapRow.style.display = "flex";
                swapRow.style.flexDirection = "row";
                swapRow.style.flexWrap = "wrap";
                swapRow.style.alignItems = "center";
                swapRow.style.justifyContent = "center";
                swapRow.style.padding = "4px 6px";
                swapRow.style.gap = "6px";
                swapRow.style.rowGap = "4px";
                swapRow.style.borderTop = "1px solid #333";
                swapRow.style.backgroundColor = "transparent";
                swapRow.style.flex = "0 0 auto";
                swapRow.style.userSelect = "none";

                const createStepper = (inputClass) => {
                    const wrap = document.createElement("div");
                    wrap.style.display = "flex";
                    wrap.style.flexDirection = "row";
                    wrap.style.alignItems = "center";
                    wrap.style.gap = "2px";

                    const decBtn = document.createElement("button");
                    decBtn.type = "button";
                    decBtn.textContent = "-";
                    decBtn.style.width = "16px";
                    decBtn.style.height = "16px";
                    decBtn.style.display = "inline-flex";
                    decBtn.style.alignItems = "center";
                    decBtn.style.justifyContent = "center";
                    decBtn.style.backgroundColor = "#27272a";
                    decBtn.style.border = "1px solid #3f3f46";
                    decBtn.style.borderRadius = "2px";
                    decBtn.style.color = "#34d399";
                    decBtn.style.fontSize = "10px";
                    decBtn.style.cursor = "pointer";
                    decBtn.style.padding = "0";
                    decBtn.style.lineHeight = "1";
                    decBtn.style.transition = "background 0.15s, border-color 0.15s, color 0.15s";

                    decBtn.addEventListener("mouseover", () => {
                        decBtn.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
                        decBtn.style.borderColor = "#10b981";
                        decBtn.style.color = "#34d399";
                    });
                    decBtn.addEventListener("mouseout", () => {
                        decBtn.style.backgroundColor = "#27272a";
                        decBtn.style.borderColor = "#3f3f46";
                        decBtn.style.color = "#34d399";
                    });
                    decBtn.addEventListener("mousedown", (e) => e.stopPropagation());
                    decBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

                    const input = document.createElement("input");
                    input.className = inputClass;
                    input.type = "number";
                    input.min = "1";
                    input.placeholder = "1";
                    input.value = "1";
                    input.style.width = "28px";
                    input.style.backgroundColor = "#2d2d2d";
                    input.style.border = "1px solid #555";
                    input.style.borderRadius = "3px";
                    input.style.color = "#eee";
                    input.style.fontSize = "10px";
                    input.style.padding = "2px 0";
                    input.style.textAlign = "center";
                    input.style.mozAppearance = "textfield";
                    input.style.webkitAppearance = "none";
                    input.style.margin = "0";
                    input.addEventListener("mousedown", (e) => e.stopPropagation());
                    input.addEventListener("pointerdown", (e) => e.stopPropagation());

                    const incBtn = document.createElement("button");
                    incBtn.type = "button";
                    incBtn.textContent = "+";
                    incBtn.style.width = "16px";
                    incBtn.style.height = "16px";
                    incBtn.style.display = "inline-flex";
                    incBtn.style.alignItems = "center";
                    incBtn.style.justifyContent = "center";
                    incBtn.style.backgroundColor = "#27272a";
                    incBtn.style.border = "1px solid #3f3f46";
                    incBtn.style.borderRadius = "2px";
                    incBtn.style.color = "#34d399";
                    incBtn.style.fontSize = "10px";
                    incBtn.style.cursor = "pointer";
                    incBtn.style.padding = "0";
                    incBtn.style.lineHeight = "1";
                    incBtn.style.transition = "background 0.15s, border-color 0.15s, color 0.15s";

                    incBtn.addEventListener("mouseover", () => {
                        incBtn.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
                        incBtn.style.borderColor = "#10b981";
                        incBtn.style.color = "#34d399";
                    });
                    incBtn.addEventListener("mouseout", () => {
                        incBtn.style.backgroundColor = "#27272a";
                        incBtn.style.borderColor = "#3f3f46";
                        incBtn.style.color = "#34d399";
                    });
                    incBtn.addEventListener("mousedown", (e) => e.stopPropagation());
                    incBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

                    decBtn.addEventListener("click", () => {
                        let val = parseInt(input.value, 10);
                        if (isNaN(val)) val = 1;
                        else val = Math.max(1, val - 1);
                        input.value = val;
                    });

                    incBtn.addEventListener("click", () => {
                        let val = parseInt(input.value, 10);
                        const maxVal = parseInt(input.max, 10) || 1;
                        if (isNaN(val)) val = 1;
                        else val = Math.min(maxVal, val + 1);
                        input.value = val;
                    });

                    wrap.appendChild(decBtn);
                    wrap.appendChild(input);
                    wrap.appendChild(incBtn);

                    return { wrap, input };
                };

                if (!document.getElementById("swap-stepper-style")) {
                    const style = document.createElement("style");
                    style.id = "swap-stepper-style";
                    style.textContent = `
                          .swap-from-input::-webkit-outer-spin-button,
                          .swap-from-input::-webkit-inner-spin-button,
                          .swap-to-input::-webkit-outer-spin-button,
                          .swap-to-input::-webkit-inner-spin-button {
                              -webkit-appearance: none;
                              margin: 0;
                          }
                      `;
                    document.head.appendChild(style);
                }

                const fromStepper = createStepper("swap-from-input");

                const arrow = document.createElement("span");
                arrow.textContent = "➔";
                arrow.style.color = "#888";
                arrow.style.fontSize = "12px";
                arrow.style.userSelect = "none";

                const toStepper = createStepper("swap-to-input");

                listContainer.fromInput = fromStepper.input;
                listContainer.toInput = toStepper.input;

                const swapBtn = document.createElement("button");
                swapBtn.type = "button";
                swapBtn.textContent = "Swap";
                swapBtn.style.backgroundColor = "#27272a";
                swapBtn.style.border = "1px solid #3f3f46";
                swapBtn.style.borderRadius = "3px";
                swapBtn.style.color = "#34d399";
                swapBtn.style.padding = "3px 12px";
                swapBtn.style.fontSize = "10px";
                swapBtn.style.fontFamily = "sans-serif";
                swapBtn.style.cursor = "pointer";
                swapBtn.style.marginLeft = "4px";
                swapBtn.style.transition = "background 0.15s, border-color 0.15s, color 0.15s";
                swapBtn.addEventListener("mousedown", (e) => e.stopPropagation());
                swapBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

                swapBtn.addEventListener("mouseover", () => {
                    if (swapBtn.style.backgroundColor !== "rgb(43, 94, 43)" && swapBtn.style.backgroundColor !== "rgb(150, 40, 40)") {
                        swapBtn.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
                        swapBtn.style.borderColor = "#10b981";
                        swapBtn.style.color = "#34d399";
                    }
                });
                swapBtn.addEventListener("mouseout", () => {
                    if (swapBtn.style.backgroundColor !== "rgb(43, 94, 43)" && swapBtn.style.backgroundColor !== "rgb(150, 40, 40)") {
                        swapBtn.style.backgroundColor = "#27272a";
                        swapBtn.style.borderColor = "#3f3f46";
                        swapBtn.style.color = "#34d399";
                    }
                });

                swapBtn.addEventListener("click", () => {
                    const fromVal = parseInt(fromStepper.input.value, 10);
                    const toVal = parseInt(toStepper.input.value, 10);

                    if (isNaN(fromVal) || isNaN(toVal) || fromVal < 1 || toVal < 1) {
                        swapBtn.textContent = "Error!";
                        swapBtn.style.backgroundColor = "#962828";
                        swapBtn.style.color = "#fff";
                        setTimeout(() => {
                            swapBtn.textContent = "Swap";
                            swapBtn.style.backgroundColor = "#27272a";
                            swapBtn.style.borderColor = "#3f3f46";
                            swapBtn.style.color = "#34d399";
                        }, 1000);
                        return;
                    }

                    const currentText = textWidget.value || "";
                    const items = parseSerializedText(currentText);

                    const maxIdx = Math.max(fromVal, toVal) - 1;
                    while (items.length <= maxIdx) {
                        items.push({ checked: false, text: "" });
                    }

                    const idxA = fromVal - 1;
                    const idxB = toVal - 1;
                    const temp = items[idxA];
                    items[idxA] = items[idxB];
                    items[idxB] = temp;

                    textWidget.value = serializeItems(items);
                    renderList(listContainer, textWidget, node);

                    swapBtn.textContent = "Swapped!";
                    swapBtn.style.backgroundColor = "#2b5e2b";
                    swapBtn.style.color = "#fff";

                    setTimeout(() => {
                        swapBtn.textContent = "Swap";
                        swapBtn.style.backgroundColor = "#27272a";
                        swapBtn.style.borderColor = "#3f3f46";
                        swapBtn.style.color = "#34d399";
                    }, 1000);
                });

                const cloneBtn = document.createElement("button");
                cloneBtn.type = "button";
                cloneBtn.textContent = "Clone";
                cloneBtn.style.backgroundColor = "#27272a";
                cloneBtn.style.border = "1px solid #3f3f46";
                cloneBtn.style.borderRadius = "3px";
                cloneBtn.style.color = "#34d399";
                cloneBtn.style.padding = "3px 12px";
                cloneBtn.style.fontSize = "10px";
                cloneBtn.style.fontFamily = "sans-serif";
                cloneBtn.style.cursor = "pointer";
                cloneBtn.style.marginLeft = "4px";
                cloneBtn.style.transition = "background 0.15s, border-color 0.15s, color 0.15s";
                cloneBtn.addEventListener("mousedown", (e) => e.stopPropagation());
                cloneBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

                cloneBtn.addEventListener("mouseover", () => {
                    if (cloneBtn.style.backgroundColor !== "rgb(43, 94, 43)" && cloneBtn.style.backgroundColor !== "rgb(150, 40, 40)") {
                        cloneBtn.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
                        cloneBtn.style.borderColor = "#10b981";
                        cloneBtn.style.color = "#34d399";
                    }
                });
                cloneBtn.addEventListener("mouseout", () => {
                    if (cloneBtn.style.backgroundColor !== "rgb(43, 94, 43)" && cloneBtn.style.backgroundColor !== "rgb(150, 40, 40)") {
                        cloneBtn.style.backgroundColor = "#27272a";
                        cloneBtn.style.borderColor = "#3f3f46";
                        cloneBtn.style.color = "#34d399";
                    }
                });

                cloneBtn.addEventListener("click", () => {
                    const fromVal = parseInt(fromStepper.input.value, 10);
                    const toVal = parseInt(toStepper.input.value, 10);

                    if (isNaN(fromVal) || isNaN(toVal) || fromVal < 1 || toVal < 1) {
                        cloneBtn.textContent = "Error!";
                        cloneBtn.style.backgroundColor = "#962828";
                        cloneBtn.style.color = "#fff";
                        setTimeout(() => {
                            cloneBtn.textContent = "Clone";
                            cloneBtn.style.backgroundColor = "#27272a";
                            cloneBtn.style.borderColor = "#3f3f46";
                            cloneBtn.style.color = "#34d399";
                        }, 1000);
                        return;
                    }

                    const currentText = textWidget.value || "";
                    const items = parseSerializedText(currentText);

                    const maxIdx = Math.max(fromVal, toVal) - 1;
                    while (items.length <= maxIdx) {
                        items.push({ checked: false, text: "" });
                    }

                    const idxA = fromVal - 1;
                    const idxB = toVal - 1;
                    const sourceItem = items[idxA];
                    items[idxB] = { checked: sourceItem.checked, text: sourceItem.text };

                    textWidget.value = serializeItems(items);
                    renderList(listContainer, textWidget, node);

                    cloneBtn.textContent = "Cloned!";
                    cloneBtn.style.backgroundColor = "#2b5e2b";
                    cloneBtn.style.color = "#fff";

                    setTimeout(() => {
                        cloneBtn.textContent = "Clone";
                        cloneBtn.style.backgroundColor = "#27272a";
                        cloneBtn.style.borderColor = "#3f3f46";
                        cloneBtn.style.color = "#34d399";
                    }, 1000);
                });

                const sepLabel = document.createElement("span");
                sepLabel.textContent = "Separator:";
                sepLabel.style.color = "#888";
                sepLabel.style.fontSize = "10px";
                sepLabel.style.fontFamily = "sans-serif";
                sepLabel.style.userSelect = "none";
                sepLabel.style.marginLeft = "6px";

                const sepInput = document.createElement("input");
                sepInput.type = "text";
                sepInput.placeholder = ", ";
                sepInput.style.width = "48px";
                sepInput.style.backgroundColor = "#2d2d2d";
                sepInput.style.border = "1px solid #555";
                sepInput.style.borderRadius = "3px";
                sepInput.style.color = "#eee";
                sepInput.style.fontSize = "10px";
                sepInput.style.padding = "2px 4px";
                sepInput.style.textAlign = "center";
                sepInput.addEventListener("mousedown", (e) => e.stopPropagation());
                sepInput.addEventListener("pointerdown", (e) => e.stopPropagation());

                if (separatorWidget) {
                    sepInput.value = separatorWidget.value || ", ";
                }

                sepInput.addEventListener("input", () => {
                    if (separatorWidget) {
                        separatorWidget.value = sepInput.value;
                    }
                });

                listContainer.sepInput = sepInput;

                swapRow.appendChild(fromStepper.wrap);
                swapRow.appendChild(arrow);
                swapRow.appendChild(toStepper.wrap);
                swapRow.appendChild(swapBtn);
                swapRow.appendChild(cloneBtn);
                swapRow.appendChild(sepLabel);
                swapRow.appendChild(sepInput);

                // --- Button Helper ---
                const createButton = (text, onClick) => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.textContent = text;
                    btn.style.flex = "1 1 auto";
                    btn.style.backgroundColor = "#27272a";
                    btn.style.border = "1px solid #3f3f46";
                    btn.style.borderRadius = "3px";
                    btn.style.color = "#34d399";
                    btn.style.padding = "4px 6px";
                    btn.style.fontSize = "9.5px";
                    btn.style.fontFamily = "sans-serif";
                    btn.style.cursor = "pointer";
                    btn.style.whiteSpace = "nowrap";
                    btn.style.textAlign = "center";
                    btn.style.transition = "background 0.15s, border-color 0.15s, color 0.15s";
                    btn.style.userSelect = "none";

                    btn.addEventListener("mouseover", () => {
                        btn.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
                        btn.style.borderColor = "#10b981";
                        btn.style.color = "#34d399";
                    });
                    btn.addEventListener("mouseout", () => {
                        btn.style.backgroundColor = "#27272a";
                        btn.style.borderColor = "#3f3f46";
                        btn.style.color = "#34d399";
                    });
                    btn.addEventListener("mousedown", (e) => e.stopPropagation());
                    btn.addEventListener("pointerdown", (e) => e.stopPropagation());
                    btn.addEventListener("click", onClick);
                    return btn;
                };

                const unescapeString = (str) => {
                    return str.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r");
                };

                const deleteBtn = createButton("Delete Checked", () => {
                    const currentText = textWidget.value || "";
                    let items = parseSerializedText(currentText);
                    items = items.filter(item => !item.checked);
                    if (items.length === 0) {
                        items.push({ checked: false, text: "" });
                    }
                    textWidget.value = serializeItems(items);
                    renderList(listContainer, textWidget, node);
                });

                const copyBtn = createButton("Copy Checked", () => {
                    const currentText = textWidget.value || "";
                    const items = parseSerializedText(currentText);
                    const selectedTexts = items.filter(item => item.checked).map(item => item.text).filter(t => t !== "");

                    const separatorWidget = node.widgets.find(w => w.name === "separator");
                    const rawSeparator = separatorWidget ? separatorWidget.value : ", ";
                    const unescapedSeparator = unescapeString(rawSeparator);

                    let textToCopy = "";
                    for (let i = 0; i < selectedTexts.length; i++) {
                        if (i === 0) {
                            textToCopy += selectedTexts[i];
                        } else {
                            if (textToCopy.endsWith("\n") || selectedTexts[i].startsWith("\n")) {
                                textToCopy += selectedTexts[i];
                            } else {
                                textToCopy += unescapedSeparator + selectedTexts[i];
                            }
                        }
                    }

                    copyBtn.textContent = "Copied!";
                    copyBtn.style.backgroundColor = "#2b5e2b";
                    copyBtn.style.color = "#fff";

                    navigator.clipboard.writeText(textToCopy).then(() => {
                        setTimeout(() => {
                            copyBtn.textContent = "Copy Checked";
                            copyBtn.style.backgroundColor = "#27272a";
                            copyBtn.style.color = "#34d399";
                        }, 1500);
                    }).catch(err => {
                        console.error("Failed to copy text: ", err);
                        copyBtn.textContent = "Error!";
                        copyBtn.style.backgroundColor = "#962828";
                        copyBtn.style.color = "#fff";
                        setTimeout(() => {
                            copyBtn.textContent = "Copy Checked";
                            copyBtn.style.backgroundColor = "#27272a";
                            copyBtn.style.color = "#34d399";
                        }, 1500);
                    });
                });

                const checkAllBtn = createButton("Check All", () => {
                    const currentText = textWidget.value || "";
                    const items = parseSerializedText(currentText);
                    items.forEach(item => item.checked = true);
                    textWidget.value = serializeItems(items);
                    renderList(listContainer, textWidget, node);
                });

                const uncheckAllBtn = createButton("Uncheck All", () => {
                    const currentText = textWidget.value || "";
                    const items = parseSerializedText(currentText);
                    items.forEach(item => item.checked = false);
                    textWidget.value = serializeItems(items);
                    renderList(listContainer, textWidget, node);
                });

                const saveBtn = createButton("Save", async () => {
                    const items = parseSerializedText(textWidget.value || "");

                    if (currentFilePath) {
                        saveBtn.textContent = "Saving…";
                        saveBtn.style.backgroundColor = "#1e3a5f";
                        saveBtn.style.color = "#fff";

                        const ok = await saveTextFile(currentFileName, items, true);

                        if (ok) {
                            saveBtn.textContent = "Saved!";
                            saveBtn.style.backgroundColor = "#2b5e2b";
                            await refreshFileList(currentFilePath);
                        } else {
                            saveBtn.textContent = "Error!";
                            saveBtn.style.backgroundColor = "#962828";
                        }
                        setTimeout(() => {
                            saveBtn.textContent = "Save";
                            saveBtn.style.backgroundColor = "#27272a";
                            saveBtn.style.color = "#34d399";
                        }, 1500);
                        return;
                    }

                    let filename = prompt("Enter file name to save (without extension):");
                    if (!filename) return;
                    filename = filename.trim();
                    if (!filename) return;

                    const safeBase = filename.replace(/[/\\:*?"<>|]/g, "_");
                    const proposedPath = `${safeBase}.json`;

                    const existingPaths = Array.from(fileSelect.options).map(o => o.value);
                    const alreadyExists = existingPaths.includes(proposedPath);

                    if (alreadyExists) {
                        if (!confirm(`"${safeBase}.json" already exists. Overwrite?`)) return;
                    }

                    saveBtn.textContent = "Saving…";
                    saveBtn.style.backgroundColor = "#1e3a5f";
                    saveBtn.style.color = "#fff";

                    const ok = await saveTextFile(safeBase, items, true);

                    if (ok) {
                        saveBtn.textContent = "Saved!";
                        saveBtn.style.backgroundColor = "#2b5e2b";
                        currentFilePath = proposedPath;
                        currentFileName = safeBase;
                        await refreshFileList(proposedPath);
                        fileSelect.value = proposedPath;
                    } else {
                        saveBtn.textContent = "Error!";
                        saveBtn.style.backgroundColor = "#962828";
                    }
                    setTimeout(() => {
                        saveBtn.textContent = "Save";
                        saveBtn.style.backgroundColor = "#27272a";
                        saveBtn.style.color = "#34d399";
                    }, 1500);
                });

                saveBtn.addEventListener("mouseout", () => {
                    if (!["Saved!", "Saving…", "Error!"].includes(saveBtn.textContent)) {
                        saveBtn.style.backgroundColor = "#27272a";
                        saveBtn.style.color = "#34d399";
                    }
                });

                saveBtn.style.flex = "none";
                filePickerRow.insertBefore(saveBtn, fileSelect);

                buttonContainer.appendChild(deleteBtn);
                buttonContainer.appendChild(copyBtn);
                buttonContainer.appendChild(checkAllBtn);
                buttonContainer.appendChild(uncheckAllBtn);

                parentContainer.appendChild(filePickerRow);
                parentContainer.appendChild(listContainer);
                parentContainer.appendChild(buttonContainer);
                parentContainer.appendChild(swapRow);

                renderList(listContainer, textWidget, node);

                // Register responsive DOM widget
                const domWidget = node.addDOMWidget("custom_numbered_text", "custom_ui", parentContainer, {
                    getValue() { return textWidget ? textWidget.value : ""; },
                    setValue(v) {
                        if (textWidget) textWidget.value = v;
                        renderList(listContainer, textWidget, node);
                    },
                    getMinHeight: () => WIDGET_MIN_H,
                    margin: 4,
                    serialize: false,
                });

                applyAdaptiveCanvasOnly(domWidget);
                installCanvasZoomPassthrough(parentContainer);
                node._dhNumTextFloorOff = installResizeFloor(parentContainer, () => measureNumberedTextFloor(parentContainer));

                if (!node.size || node.size[0] < MIN_W) node.size[0] = DEFAULT_W;
                if (!node.size || node.size[1] < MIN_H) node.size[1] = DEFAULT_H;

                const origOnConfigure = node.onConfigure;
                node.onConfigure = function (info) {
                    origOnConfigure?.apply(this, arguments);
                    renderList(listContainer, textWidget, node);
                };

                const origOnRemoved = node.onRemoved;
                node.onRemoved = function () {
                    origOnRemoved?.apply(this, arguments);
                    clearInterval(refreshInterval);
                };
            }
        }
    }
});
