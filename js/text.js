import { app } from "../../scripts/app.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough, installResizeFloor } from "./shared/index.mjs";

const TEXT_DIR = "Dehypnotic/text";
const DEFAULT_W = 380;
const DEFAULT_H = 260;
const MIN_W = 320;
const MIN_H = 180;
const WIDGET_MIN_H = 140;

async function listTextFiles() {
    try {
        const resp = await fetch("/dehypnotic/user_text/list?type=text");
        if (!resp.ok) return [];
        const files = await resp.json();
        return files.map(f => ({
            path: f.path,
            name: f.name,
            modified: f.modified || 0,
        }));
    } catch (e) {
        console.warn("[Text] listTextFiles exception:", e);
        return [];
    }
}

async function saveTextFile(filename, text, overwrite = true) {
    const safeFilename = filename.replace(/[/\\:*?"<>|]/g, "_");
    try {
        const resp = await fetch("/dehypnotic/user_text/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "text", filename: safeFilename, content: text, overwrite })
        });
        return resp.ok;
    } catch (e) {
        console.error("[Text] saveTextFile exception:", e);
        return false;
    }
}

async function loadTextFile(filePath) {
    try {
        const resp = await fetch(`/dehypnotic/user_text/load?type=text&filename=${encodeURIComponent(filePath)}`, { cache: "no-store" });
        if (!resp.ok) {
            console.warn("[Text] loadTextFile error:", resp.status);
            return null;
        }
        return await resp.text();
    } catch (e) {
        console.error("[Text] loadTextFile exception:", e);
        return null;
    }
}

function createButton(text, onClick, textColor = "#34d399") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.style.backgroundColor = "#27272a";
    btn.style.border = "1px solid #3f3f46";
    btn.style.borderRadius = "3px";
    btn.style.color = textColor;
    btn.style.padding = "4px 10px";
    btn.style.fontSize = "11px";
    btn.style.fontFamily = "sans-serif";
    btn.style.cursor = "pointer";
    btn.style.transition = "all 0.1s ease";
    btn.style.flex = "1 1 auto";
    btn.style.userSelect = "none";
    
    btn.addEventListener("mouseover", () => {
        btn.style.backgroundColor = "#3f3f46";
    });
    btn.addEventListener("mouseout", () => {
        btn.style.backgroundColor = "#27272a";
        btn.style.color = textColor;
    });
    btn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        btn.style.transform = "scale(0.95)";
    });
    btn.addEventListener("mouseup", (e) => {
        e.stopPropagation();
        btn.style.transform = "scale(1)";
    });
    btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
    });
    
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });
    
    return btn;
}

function hideNativeTextWidget(node) {
    let textWidget = null;
    for (const w of (node.widgets || [])) {
        if (!w) continue;
        if (w.name === "text") textWidget = w;
        w.hidden = true;
        w.computeSize = () => [0, -4];
        if (!w.options) w.options = {};
        w.options.canvasOnly = true;
        const _el = w.element || w.inputEl;
        if (_el) _el.style.display = "none";
    }
    requestAnimationFrame(() => {
        for (const w of (node.widgets || [])) {
            if (!w || w.name === "text_ui") continue;
            const _el = w.element || w.inputEl;
            if (_el) _el.style.display = "none";
        }
    });
    return textWidget;
}

function measureTextFloor(root) {
    if (!root) return 0;
    const TAWRAP_MIN = 60;
    const header = root.querySelector(".dh-text-header");
    const footer = root.querySelector(".dh-text-footer");
    const cs = getComputedStyle(root);
    const gap = parseFloat(cs.rowGap || cs.gap) || 0;
    const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    let h = TAWRAP_MIN;
    let count = 1;
    if (header) { h += header.offsetHeight; count += 1; }
    if (footer) { h += footer.offsetHeight; count += 1; }
    if (count > 1) h += gap * (count - 1);
    return h + padV;
}

app.registerExtension({
    name: "dehypnotic.Text",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "Text" && nodeData.name !== "dehypnotic_Text" && nodeData.name !== "TextDehypnotic") return;

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
            this._dhTextFloorOff?.();
            this._dhTextFloorOff = null;
            if (origRemoved) return origRemoved.apply(this, arguments);
        };
    },

    async nodeCreated(node) {
        if (node.comfyClass === "Text" || node.comfyClass === "dehypnotic_Text" || node.comfyClass === "TextDehypnotic") {
            const textWidget = hideNativeTextWidget(node);
            
            if (textWidget) {
                const hideInput = () => {
                    const el = textWidget.element || textWidget.inputEl;
                    if (el) {
                        el.style.display = "none";
                        el.style.width = "0px";
                        el.style.height = "0px";
                        el.style.position = "absolute";
                        el.style.opacity = "0";
                        el.style.pointerEvents = "none";
                    }
                };
                hideInput();
                
                const origOnShown = node.onShown;
                node.onShown = function () {
                    origOnShown?.apply(this, arguments);
                    hideInput();
                };

                const mainContainer = document.createElement("div");
                mainContainer.style.display = "flex";
                mainContainer.style.flexDirection = "column";
                mainContainer.style.width = "100%";
                mainContainer.style.height = "100%";
                mainContainer.style.gap = "4px";
                mainContainer.style.backgroundColor = "transparent";
                mainContainer.style.boxSizing = "border-box";
                mainContainer.style.border = "1px solid #333";
                mainContainer.style.borderRadius = "4px";
                mainContainer.style.overflow = "hidden";
                mainContainer.style.padding = "4px";

                // --- Header Row ---
                const filePickerRow = document.createElement("div");
                filePickerRow.className = "dh-text-header";
                filePickerRow.style.display = "flex";
                filePickerRow.style.flexDirection = "row";
                filePickerRow.style.alignItems = "center";
                filePickerRow.style.width = "100%";
                filePickerRow.style.padding = "4px 6px";
                filePickerRow.style.boxSizing = "border-box";
                filePickerRow.style.gap = "5px";
                filePickerRow.style.flexWrap = "wrap";
                filePickerRow.style.rowGap = "4px";
                filePickerRow.style.backgroundColor = "#1a1a1a";
                filePickerRow.style.borderBottom = "1px solid #333";
                filePickerRow.style.flex = "0 0 auto";
                filePickerRow.style.userSelect = "none";

                let currentFilePath = "";
                let currentFileName = "";

                const loadFileBtn = document.createElement("button");
                loadFileBtn.type = "button";
                loadFileBtn.textContent = "Load";
                loadFileBtn.style.backgroundColor = "#27272a";
                loadFileBtn.style.border = "1px solid #3f3f46";
                loadFileBtn.style.borderRadius = "3px";
                loadFileBtn.style.color = "#34d399";
                loadFileBtn.style.padding = "2px 8px";
                loadFileBtn.style.fontSize = "10px";
                loadFileBtn.style.cursor = "pointer";
                loadFileBtn.style.flex = "none";

                const saveBtn = document.createElement("button");
                saveBtn.type = "button";
                saveBtn.textContent = "Save";
                saveBtn.style.backgroundColor = "#27272a";
                saveBtn.style.border = "1px solid #3f3f46";
                saveBtn.style.borderRadius = "3px";
                saveBtn.style.color = "#34d399";
                saveBtn.style.padding = "2px 8px";
                saveBtn.style.fontSize = "10px";
                saveBtn.style.cursor = "pointer";
                saveBtn.style.flex = "none";

                const fileSelect = document.createElement("select");
                fileSelect.style.flex = "1 1 100px";
                fileSelect.style.minWidth = "50px";
                fileSelect.style.backgroundColor = "#121212";
                fileSelect.style.color = "#eee";
                fileSelect.style.border = "1px solid #3f3f46";
                fileSelect.style.borderRadius = "3px";
                fileSelect.style.padding = "2px";
                fileSelect.style.fontSize = "10px";
                fileSelect.style.cursor = "pointer";

                const placeholderOpt = document.createElement("option");
                placeholderOpt.value = "";
                placeholderOpt.textContent = "— New file —";
                fileSelect.appendChild(placeholderOpt);

                const deleteFileBtn = document.createElement("button");
                deleteFileBtn.type = "button";
                deleteFileBtn.textContent = "Del";
                deleteFileBtn.style.backgroundColor = "#5c1b1b";
                deleteFileBtn.style.border = "1px solid #8a2b2b";
                deleteFileBtn.style.borderRadius = "3px";
                deleteFileBtn.style.color = "#fca5a5";
                deleteFileBtn.style.padding = "2px 6px";
                deleteFileBtn.style.fontSize = "10px";
                deleteFileBtn.style.cursor = "pointer";
                deleteFileBtn.style.flex = "none";
                deleteFileBtn.disabled = true;
                deleteFileBtn.style.opacity = "0.4";

                filePickerRow.appendChild(loadFileBtn);
                filePickerRow.appendChild(saveBtn);
                filePickerRow.appendChild(fileSelect);
                filePickerRow.appendChild(deleteFileBtn);
                mainContainer.appendChild(filePickerRow);

                for (const elem of [loadFileBtn, saveBtn, fileSelect, deleteFileBtn]) {
                    elem.addEventListener("mousedown", (e) => e.stopPropagation());
                    elem.addEventListener("pointerdown", (e) => e.stopPropagation());
                }

                // --- Text Area ---
                const textAreaContainer = document.createElement("div");
                textAreaContainer.className = "dh-text-tawrap";
                textAreaContainer.style.flex = "1 1 auto";
                textAreaContainer.style.display = "flex";
                textAreaContainer.style.position = "relative";
                textAreaContainer.style.minHeight = "60px";
                textAreaContainer.style.width = "100%";
                textAreaContainer.style.height = "100%";
                
                const textarea = document.createElement("textarea");
                textarea.value = textWidget.value || "";
                textarea.style.flex = "1 1 auto";
                textarea.style.width = "100%";
                textarea.style.height = "100%";
                textarea.style.background = "#1e1e1e";
                textarea.style.border = "none";
                textarea.style.color = "#eee";
                textarea.style.fontFamily = "monospace";
                textarea.style.fontSize = "12px";
                textarea.style.padding = "8px";
                textarea.style.outline = "none";
                textarea.style.resize = "none";
                textarea.style.boxSizing = "border-box";
                textarea.style.lineHeight = "1.4";
                textarea.style.overflowY = "auto";
                textarea.style.overflowX = "hidden";

                textarea.addEventListener("input", () => {
                    textWidget.value = textarea.value;
                    if (textWidget.callback) textWidget.callback(textWidget.value);
                    node.trigger("change");
                });

                textarea.addEventListener("keydown", (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") return;
                    e.stopPropagation();
                });
                textarea.addEventListener("mousedown", (e) => e.stopPropagation());
                textarea.addEventListener("pointerdown", (e) => e.stopPropagation());

                textAreaContainer.appendChild(textarea);
                mainContainer.appendChild(textAreaContainer);

                // --- Footer Row (Copy/Paste) ---
                const footerRow = document.createElement("div");
                footerRow.className = "dh-text-footer";
                footerRow.style.display = "flex";
                footerRow.style.flexDirection = "row";
                footerRow.style.gap = "5px";
                footerRow.style.flexWrap = "wrap";
                footerRow.style.rowGap = "4px";
                footerRow.style.padding = "4px 6px";
                footerRow.style.backgroundColor = "#1a1a1a";
                footerRow.style.borderTop = "1px solid #333";
                footerRow.style.flex = "0 0 auto";
                footerRow.style.userSelect = "none";

                const copyBtn = createButton("Copy", () => {
                    navigator.clipboard.writeText(textarea.value).then(() => {
                        const origText = copyBtn.textContent;
                        copyBtn.textContent = "Copied!";
                        copyBtn.style.backgroundColor = "#2b5e2b";
                        setTimeout(() => {
                            copyBtn.textContent = origText;
                            copyBtn.style.backgroundColor = "#27272a";
                        }, 1000);
                    });
                });

                const pasteBtn = createButton("Paste", () => {
                    navigator.clipboard.readText().then(text => {
                        textarea.value = text;
                        textWidget.value = text;
                        if (textWidget.callback) textWidget.callback(text);
                        node.trigger("change");
                        
                        const origText = pasteBtn.textContent;
                        pasteBtn.textContent = "Pasted!";
                        pasteBtn.style.backgroundColor = "#2b5e2b";
                        setTimeout(() => {
                            pasteBtn.textContent = origText;
                            pasteBtn.style.backgroundColor = "#27272a";
                        }, 1000);
                    }).catch(err => {
                        console.error("Failed to read clipboard:", err);
                    });
                });

                const clearBtn = createButton("Clear", () => {
                    if (!textarea.value) return;
                    textarea.value = "";
                    textWidget.value = "";
                    if (textWidget.callback) textWidget.callback("");
                    node.trigger("change");
                }, "#fca5a5");

                footerRow.appendChild(copyBtn);
                footerRow.appendChild(pasteBtn);
                footerRow.appendChild(clearBtn);
                mainContainer.appendChild(footerRow);

                // --- Actions & API calls ---
                const refreshFileList = async (selectPath = null) => {
                    const files = await listTextFiles();
                    while (fileSelect.options.length > 1) {
                        fileSelect.remove(1);
                    }
                    files.forEach(f => {
                        const opt = document.createElement("option");
                        opt.value = f.path;
                        opt.textContent = f.name;
                        fileSelect.appendChild(opt);
                    });
                    if (selectPath) {
                        fileSelect.value = selectPath;
                    } else if (!fileSelect.value) {
                        fileSelect.value = "";
                    }
                    deleteFileBtn.disabled = !fileSelect.value;
                    deleteFileBtn.style.opacity = fileSelect.value ? "1" : "0.4";
                };

                fileSelect.addEventListener("change", () => {
                    const selected = fileSelect.value;
                    deleteFileBtn.disabled = !selected;
                    deleteFileBtn.style.opacity = selected ? "1" : "0.4";
                    if (selected) {
                        currentFilePath = selected;
                        currentFileName = selected.replace(/^.*[\/\\]/, "").replace(/\.txt$/i, "");
                    } else {
                        currentFilePath = "";
                        currentFileName = "";
                    }
                });

                loadFileBtn.addEventListener("click", async () => {
                    const selected = fileSelect.value;
                    if (!selected) return;
                    loadFileBtn.textContent = "Loading…";
                    
                    const text = await loadTextFile(selected);
                    if (text !== null) {
                        textarea.value = text;
                        textWidget.value = text;
                        if (textWidget.callback) textWidget.callback(textWidget.value);
                        node.trigger("change");
                        loadFileBtn.textContent = "Loaded!";
                        loadFileBtn.style.backgroundColor = "#2b5e2b";
                        currentFilePath = selected;
                        currentFileName = selected.replace(/^.*[\/\\]/, "").replace(/\.txt$/i, "");
                    } else {
                        loadFileBtn.textContent = "Error";
                        loadFileBtn.style.backgroundColor = "#962828";
                    }
                    setTimeout(() => {
                        loadFileBtn.textContent = "Load";
                        loadFileBtn.style.backgroundColor = "#27272a";
                    }, 1500);
                });

                saveBtn.addEventListener("click", async () => {
                    if (currentFilePath) {
                        saveBtn.textContent = "Saving…";
                        const ok = await saveTextFile(currentFileName, textarea.value, true);
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
                        }, 1500);
                        return;
                    }

                    let filename = prompt("Enter file name to save (without extension):");
                    if (!filename) return;
                    filename = filename.trim();
                    if (!filename) return;

                    const safeBase = filename.replace(/[/\\:*?"<>|]/g, "_");
                    const proposedPath = `${safeBase}.txt`;
                    const existingPaths = Array.from(fileSelect.options).map(o => o.value);
                    if (existingPaths.includes(proposedPath)) {
                        if (!confirm(`"${safeBase}.txt" already exists. Overwrite?`)) return;
                    }

                    saveBtn.textContent = "Saving…";
                    const ok = await saveTextFile(safeBase, textarea.value, true);
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
                    }, 1500);
                });

                deleteFileBtn.addEventListener("click", async () => {
                    const selected = fileSelect.value;
                    if (!selected) return;
                    const baseName = selected.replace(/^.*[\/\\]/, "");
                    if (!confirm(`Are you sure you want to delete "${baseName}"?`)) return;

                    try {
                        const resp = await fetch("/dehypnotic/user_text/delete", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ type: "text", filename: selected })
                        });
                        if (resp.ok) {
                            if (currentFilePath === selected) {
                                currentFilePath = "";
                                currentFileName = "";
                                fileSelect.value = "";
                            }
                            await refreshFileList(currentFilePath);
                        } else {
                            alert("Failed to delete file.");
                        }
                    } catch (e) {
                        console.error("[Text] Error deleting file:", e);
                        alert("Error deleting file.");
                    }
                });

                refreshFileList();

                // Custom DOM widget registration with responsive flex height
                const widget = node.addDOMWidget("text_ui", "custom", mainContainer, {
                    getValue() { return textWidget ? textWidget.value : ""; },
                    setValue(v) { 
                        if (textWidget) textWidget.value = v; 
                        if (textarea) textarea.value = v;
                    },
                    getMinHeight: () => WIDGET_MIN_H,
                    margin: 4,
                    serialize: false,
                });
                
                applyAdaptiveCanvasOnly(widget);
                installCanvasZoomPassthrough(mainContainer);
                node._dhTextFloorOff = installResizeFloor(mainContainer, () => measureTextFloor(mainContainer));

                if (node.size[0] < MIN_W) node.size[0] = DEFAULT_W;
                if (node.size[1] < MIN_H) node.size[1] = DEFAULT_H;

                const updateInputLabel = () => {
                    const textInput = node.inputs?.find(i => i.name === "text_in");
                    if (textInput && textInput.label !== "text") {
                        textInput.label = "text";
                    }
                };
                
                updateInputLabel();
                
                const origOnConfigure = node.onConfigure;
                node.onConfigure = function (info) {
                    origOnConfigure?.apply(this, arguments);
                    updateInputLabel();
                    if (textWidget && textarea) {
                        textarea.value = textWidget.value || "";
                    }
                };
                
                const origOnExecuted = node.onExecuted;
                node.onExecuted = function(message) {
                    origOnExecuted?.apply(this, arguments);
                    if (message && message.text) {
                        const newText = message.text[0];
                        if (textWidget) {
                            textWidget.value = newText;
                        }
                        if (textarea) {
                            textarea.value = newText;
                        }
                    }
                };
            }
        }
    }
});
