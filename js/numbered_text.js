import { app } from "../../scripts/app.js";

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

/**
 * List JSON files in the Dehypnotic/numbered_text userdata directory.
 * Returns an array of { name, path, modified } objects sorted newest first,
 * where `path` is the full relative path from the user root (e.g. "Dehypnotic/numbered_text/foo.json")
 * and `name` is just the base filename without extension.
 * Returns an empty array on error.
 */
async function listTextFiles() {
    try {
        // NOTE: the dir param is relative to the user directory.
        // full_info=true returns FileInfo objects where `path` is relative to the listed dir,
        // and `modified` is in milliseconds.
        const url = `/userdata?dir=${encodeURIComponent(TEXT_DIR)}&full_info=true&recurse=false`;
        const resp = await fetch(url);
        if (!resp.ok) {
            if (resp.status === 404) return []; // directory doesn't exist yet
            console.warn("[NumberedText] listTextFiles error:", resp.status, await resp.text());
            return [];
        }
        const files = await resp.json();
        // `files` is an array of FileInfo: { path (relative to listed dir), size, modified (ms), created (ms) }
        // Filter to .json only
        const jsonFiles = files
            .filter(f => typeof f === "object" && f.path && f.path.toLowerCase().endsWith(".json"))
            .map(f => ({
                // Build the full path relative to user root so we can use it with /userdata/{file}
                path: TEXT_DIR + "/" + f.path,
                // Friendly display name: base filename without extension
                name: f.path.replace(/\.json$/i, ""),
                modified: f.modified || 0,
            }));
        // Sort newest first
        jsonFiles.sort((a, b) => b.modified - a.modified);
        return jsonFiles;
    } catch (e) {
        console.warn("[NumberedText] listTextFiles exception:", e);
        return [];
    }
}

/**
 * Save items to a JSON file under Dehypnotic/numbered_text/<filename>.json
 * Returns true on success, false on failure.
 * @param {string} filename – just the base name, e.g. "my_prompts" (no path, no extension)
 * @param {Array}  items    – array of { checked, text }
 * @param {boolean} overwrite
 */
async function saveTextFile(filename, items, overwrite = true) {
    const safeFilename = filename.replace(/[/\\:*?"<>|]/g, "_");
    const filePath = `${TEXT_DIR}/${safeFilename}.json`;
    const body = JSON.stringify({ version: 1, items }, null, 2);
    const url = `/userdata/${encodeURIComponent(filePath)}?overwrite=${overwrite}`;
    try {
        const resp = await fetch(url, {
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

/**
 * Load a JSON file from /userdata/<path>.
 * Returns the parsed { version, items } object, or null on error.
 * @param {string} filePath – relative path as returned by the listing API, e.g. "Dehypnotic/numbered_text/foo.json"
 */
async function loadTextFile(filePath) {
    try {
        const resp = await fetch(`/userdata/${encodeURIComponent(filePath)}`);
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
    if (container.toInput) container.toInput.max = items.length;
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

        // Margin container (checkmark & index label) - reduced padding
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

        // Index Label - reduced font size
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

        // Textarea - reduced padding, font size, and line-height
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
            // Request canvas redraw without changing the node window size
            node.setDirtyCanvas(true, true);
        };

        // Trigger resize on input and load
        textarea.addEventListener("input", () => {
            item.text = textarea.value;
            updateWidgetValue();
            resizeTextarea();
        });

        // Keydown handlers
        textarea.addEventListener("keydown", (event) => {
            event.stopPropagation(); // Stop propagation to prevent LiteGraph canvas hotkeys (like minimize)
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();

                // Add new item below this one (default to unchecked/false)
                items.splice(index + 1, 0, { checked: false, text: "" });
                textWidget.value = serializeItems(items);
                renderList(container, textWidget, node);

                // Focus the newly created textarea
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
                // Delete current item if empty (or join with previous item)
                if (textarea.value === "" && items.length > 1) {
                    event.preventDefault();

                    items.splice(index, 1);
                    textWidget.value = serializeItems(items);
                    renderList(container, textWidget, node);

                    // Focus the previous textarea
                    setTimeout(() => {
                        const prevRow = container.children[index - 1];
                        if (prevRow) {
                            const prevTextarea = prevRow.querySelector("textarea");
                            if (prevTextarea) {
                                prevTextarea.focus();
                                // Position caret at the end
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

        // Run initial resize
        setTimeout(resizeTextarea, 0);

        // Observe textarea resizing (like when user resizes node width) to auto-adjust height
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

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

app.registerExtension({
    name: "dehypnotic.NumberedText",
    async nodeCreated(node) {
        if (node.comfyClass === "NumberedText" || node.comfyClass === "dehypnotic_NumberedText") {
            const textWidget = node.widgets.find(w => w.name === "text");
            const separatorWidget = node.widgets.find(w => w.name === "separator");
            if (separatorWidget) {
                separatorWidget.type = "hidden";
                separatorWidget.computeSize = () => [0, 0];
                if (!separatorWidget.draw) {
                    separatorWidget.draw = function (ctx, node, widget_width, y, widget_height) { };
                }
            }
            if (textWidget) {
                textWidget.type = "hidden";
                textWidget.computeSize = () => [0, 0];
                if (!textWidget.draw) {
                    textWidget.draw = function (ctx, node, widget_width, y, widget_height) { };
                }

                // Completely hide the original textarea and inputs to avoid duplicates
                const hideInput = () => {
                    if (textWidget.inputEl) {
                        textWidget.inputEl.style.display = "none";
                        textWidget.inputEl.style.width = "0px";
                        textWidget.inputEl.style.height = "0px";
                        textWidget.inputEl.style.position = "absolute";
                        textWidget.inputEl.style.opacity = "0";
                        textWidget.inputEl.style.pointerEvents = "none";
                    }
                    if (separatorWidget && separatorWidget.inputEl) {
                        separatorWidget.inputEl.style.display = "none";
                        separatorWidget.inputEl.style.width = "0px";
                        separatorWidget.inputEl.style.height = "0px";
                        separatorWidget.inputEl.style.position = "absolute";
                        separatorWidget.inputEl.style.opacity = "0";
                        separatorWidget.inputEl.style.pointerEvents = "none";
                    }
                };
                hideInput();

                // Fallback shown listener to ensure it gets hidden
                const origOnShown = node.onShown;
                node.onShown = function () {
                    origOnShown?.apply(this, arguments);
                    hideInput();
                };

                // ---------------------------------------------------------------
                // File picker row  (load dropdown – displayed above the list)
                // ---------------------------------------------------------------

                const filePickerRow = document.createElement("div");
                filePickerRow.style.display = "flex";
                filePickerRow.style.flexDirection = "row";
                filePickerRow.style.alignItems = "center";
                filePickerRow.style.width = "100%";
                filePickerRow.style.padding = "4px 6px";
                filePickerRow.style.boxSizing = "border-box";
                filePickerRow.style.gap = "5px";
                filePickerRow.style.backgroundColor = "#1a1a1a";
                filePickerRow.style.borderBottom = "1px solid #333";
                filePickerRow.style.borderTopLeftRadius = "4px";
                filePickerRow.style.borderTopRightRadius = "4px";

                // "Load" button — acts as both label and trigger.
                // Reads fileSelect.value at click time — works for any file, same or different.
                const loadFileBtn = document.createElement("button");
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

                loadFileBtn.addEventListener("mouseover", () => {
                    loadFileBtn.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
                    loadFileBtn.style.borderColor = "#10b981";
                });
                loadFileBtn.addEventListener("mouseout", () => {
                    loadFileBtn.style.backgroundColor = "#27272a";
                    loadFileBtn.style.borderColor = "#3f3f46";
                });

                const fileSelect = document.createElement("select");
                fileSelect.style.flex = "1";
                fileSelect.style.backgroundColor = "#2d2d2d";
                fileSelect.style.border = "1px solid #555";
                fileSelect.style.borderRadius = "3px";
                fileSelect.style.color = "#ccc";
                fileSelect.style.fontSize = "10px";
                fileSelect.style.padding = "2px 4px";
                fileSelect.style.cursor = "pointer";
                fileSelect.style.outline = "none";

                // Placeholder option
                const placeholderOpt = document.createElement("option");
                placeholderOpt.value = "";
                placeholderOpt.textContent = "— New file —";
                fileSelect.appendChild(placeholderOpt);

                // Currently selected file path (set after save to enable direct-save)
                let currentFilePath = "";   // e.g. "Dehypnotic/numbered_text/foo.json"
                let currentFileName = "";   // e.g. "foo" (without extension)

                // Populate dropdown with JSON files from userdata
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

                // Delete-file button — declared before loadSelectedFile to avoid TDZ.
                const deleteFileBtn = document.createElement("button");

                // ---------------------------------------------------------------
                // Load logic — only ever called from the Load button click.
                // The dropdown change event does NOT trigger any loading.
                // ---------------------------------------------------------------
                async function loadSelectedFile(selected) {
                    if (!selected) return;

                    const baseName = selected.replace(/^.*[\/\\]/, "").replace(/\.json$/i, "");

                    const data = await loadTextFile(selected);
                    if (!data || !Array.isArray(data.items)) {
                        alert("Failed to load file or invalid format.");
                        return;
                    }

                    // Append from first free slot, or replace if list is empty/blank
                    const existingItems = parseSerializedText(textWidget.value || "");
                    const isEffectivelyEmpty =
                        existingItems.length === 0 ||
                        (existingItems.length === 1 && existingItems[0].text.trim() === "");

                    const mergedItems = isEffectivelyEmpty
                        ? data.items
                        : [...existingItems, ...data.items];

                    textWidget.value = serializeItems(mergedItems);
                    renderList(listContainer, textWidget, node);

                    // Remember for direct-save
                    currentFilePath = selected;
                    currentFileName = baseName;
                    deleteFileBtn.disabled = false;
                    deleteFileBtn.style.opacity = "1";
                }

                // Load button click — the one and only way to trigger loading.
                loadFileBtn.addEventListener("click", async () => {
                    await loadSelectedFile(fileSelect.value);
                });

                // Dropdown change enables/disables the Del button and updates current selection for Save
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

                // Delete-file button styling and event listeners
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
                        const resp = await fetch(`/userdata/${encodeURIComponent(pathToDelete)}`, { method: "DELETE" });
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
                // NOTE: saveBtn is appended to filePickerRow below, after it is declared.


                // Auto-refresh every 30 seconds
                const refreshInterval = setInterval(() => {
                    refreshFileList(currentFilePath || fileSelect.value);
                }, 30000);

                // Initial populate (async, non-blocking)
                refreshFileList("");

                // ---------------------------------------------------------------
                // Create parent container (flexbox to hold file picker, list, buttons)
                // ---------------------------------------------------------------

                const parentContainer = document.createElement("div");
                parentContainer.style.display = "flex";
                parentContainer.style.flexDirection = "column";
                parentContainer.style.width = "100%";
                parentContainer.style.backgroundColor = "transparent";
                parentContainer.style.border = "1px solid #333";
                parentContainer.style.borderRadius = "4px";
                parentContainer.style.marginTop = "5px";
                parentContainer.style.marginBottom = "5px";

                // Create custom list container
                const listContainer = document.createElement("div");
                listContainer.style.display = "flex";
                listContainer.style.flexDirection = "column";
                listContainer.style.width = "100%";
                listContainer.style.overflowY = "auto";
                listContainer.style.height = "300px";
                listContainer.style.maxHeight = "300px";
                listContainer.style.backgroundColor = "#151515";

                // Create horizontal button container
                const buttonContainer = document.createElement("div");
                buttonContainer.style.display = "flex";
                buttonContainer.style.flexDirection = "row";
                buttonContainer.style.flexWrap = "wrap";
                buttonContainer.style.justifyContent = "space-between";
                buttonContainer.style.padding = "5px";
                buttonContainer.style.gap = "4px";
                buttonContainer.style.borderTop = "1px solid #333";
                buttonContainer.style.backgroundColor = "transparent";

                // Stop mouse/pointer/keyboard event propagation to prevent canvas interactions/collapsing
                const blockEvents = ["mousedown", "mouseup", "click", "dblclick", "contextmenu", "pointerdown", "pointerup", "pointermove", "keydown", "keyup", "keypress"];
                blockEvents.forEach(evt => {
                    parentContainer.addEventListener(evt, (e) => {
                        e.stopPropagation();
                    });
                });

                // Create swap row container
                const swapRow = document.createElement("div");
                swapRow.style.display = "flex";
                swapRow.style.flexDirection = "row";
                swapRow.style.flexWrap = "wrap";
                swapRow.style.alignItems = "center";
                swapRow.style.justifyContent = "center";
                swapRow.style.padding = "5px 8px";
                swapRow.style.gap = "8px";
                swapRow.style.borderTop = "1px solid #333";
                swapRow.style.backgroundColor = "transparent";
                swapRow.style.borderBottomLeftRadius = "4px";
                swapRow.style.borderBottomRightRadius = "4px";

                // Helper to create styled stepper
                const createStepper = (inputClass) => {
                    const wrap = document.createElement("div");
                    wrap.style.display = "flex";
                    wrap.style.flexDirection = "row";
                    wrap.style.alignItems = "center";
                    wrap.style.gap = "2px";

                    const decBtn = document.createElement("button");
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

                    const input = document.createElement("input");
                    input.className = inputClass;
                    input.type = "number";
                    input.min = "1";
                    input.placeholder = "#";
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

                    const incBtn = document.createElement("button");
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

                // Hide webkit spinner style
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

                // Bind inputs to listContainer so renderList can dynamically set their max attribute
                listContainer.fromInput = fromStepper.input;
                listContainer.toInput = toStepper.input;

                const swapBtn = document.createElement("button");
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

                    const currentText = textWidget.value || "";
                    const items = parseSerializedText(currentText);

                    if (isNaN(fromVal) || isNaN(toVal) || fromVal < 1 || toVal < 1 || fromVal > items.length || toVal > items.length) {
                        // Flash red on error
                        swapBtn.textContent = "Error!";
                        swapBtn.style.backgroundColor = "#962828";
                        swapBtn.style.color = "#fff";
                        setTimeout(() => {
                            swapBtn.textContent = "Swap";
                            swapBtn.style.backgroundColor = "#27272a";
                            swapBtn.style.borderColor = "#3f3f46";
                            swapBtn.style.color = "#a1a1aa";
                        }, 1000);
                        return;
                    }

                    // Swap the items
                    const idxA = fromVal - 1;
                    const idxB = toVal - 1;
                    const temp = items[idxA];
                    items[idxA] = items[idxB];
                    items[idxB] = temp;

                    textWidget.value = serializeItems(items);
                    renderList(listContainer, textWidget, node);

                    // Flash green on success
                    swapBtn.textContent = "Swapped!";
                    swapBtn.style.backgroundColor = "#2b5e2b";
                    swapBtn.style.color = "#fff";

                    // Clear inputs
                    fromStepper.input.value = "";
                    toStepper.input.value = "";

                    setTimeout(() => {
                        swapBtn.textContent = "Swap";
                        swapBtn.style.backgroundColor = "#27272a";
                        swapBtn.style.borderColor = "#3f3f46";
                        swapBtn.style.color = "#a1a1aa";
                    }, 1000);
                });

                // Custom Separator Input on the right of the Swap button
                const sepLabel = document.createElement("span");
                sepLabel.textContent = "Separator:";
                sepLabel.style.color = "#888";
                sepLabel.style.fontSize = "10px";
                sepLabel.style.fontFamily = "sans-serif";
                sepLabel.style.userSelect = "none";
                sepLabel.style.marginLeft = "12px";

                const sepInput = document.createElement("input");
                sepInput.type = "text";
                sepInput.placeholder = ", ";
                sepInput.style.width = "64px";
                sepInput.style.backgroundColor = "#2d2d2d";
                sepInput.style.border = "1px solid #555";
                sepInput.style.borderRadius = "3px";
                sepInput.style.color = "#eee";
                sepInput.style.fontSize = "10px";
                sepInput.style.padding = "2px 4px";
                sepInput.style.textAlign = "center";

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
                swapRow.appendChild(sepLabel);
                swapRow.appendChild(sepInput);

                parentContainer.appendChild(filePickerRow);
                parentContainer.appendChild(listContainer);
                parentContainer.appendChild(buttonContainer);
                parentContainer.appendChild(swapRow);

                const domWidget = node.addDOMWidget("custom_numbered_text", "custom_ui", parentContainer);
                domWidget.computeSize = function () {
                    // Keep widget size stable based on node's current width, dynamic height based on button and swap row wrap
                    const width = node.size ? Math.max(350, node.size[0]) : 400;
                    const btnHeight = buttonContainer.clientHeight || 32;
                    const swapHeight = swapRow.clientHeight || 26;
                    const filePickerHeight = filePickerRow.clientHeight || 28;
                    return [width, filePickerHeight + 305 + btnHeight + swapHeight + 10];
                };

                // Set initial size of the node window
                if (!node.size || node.size[1] < 100) {
                    node.size = [400, 510];
                }

                // ---------------------------------------------------------------
                // Button helper function
                // ---------------------------------------------------------------
                const createButton = (text, onClick) => {
                    const btn = document.createElement("button");
                    btn.textContent = text;
                    btn.style.flex = "1";
                    btn.style.backgroundColor = "#27272a";
                    btn.style.border = "1px solid #3f3f46";
                    btn.style.borderRadius = "3px";
                    btn.style.color = "#34d399";
                    btn.style.padding = "4px 2px";
                    btn.style.fontSize = "9.5px";
                    btn.style.fontFamily = "sans-serif";
                    btn.style.cursor = "pointer";
                    btn.style.whiteSpace = "nowrap";
                    btn.style.textAlign = "center";
                    btn.style.transition = "background 0.15s, border-color 0.15s, color 0.15s";

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
                    btn.addEventListener("click", onClick);
                    return btn;
                };

                // Helper to unescape delimiter characters
                const unescapeString = (str) => {
                    return str.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r");
                };

                // ---------------------------------------------------------------
                // Delete button  (was "Delete Checked")
                // ---------------------------------------------------------------
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

                // ---------------------------------------------------------------
                // Copy button  (was "Copy Checked")
                // ---------------------------------------------------------------
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

                // ---------------------------------------------------------------
                // Check All / Uncheck All
                // ---------------------------------------------------------------
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

                // ---------------------------------------------------------------
                // Save button
                // ---------------------------------------------------------------
                const saveBtn = createButton("Save", async () => {
                    const items = parseSerializedText(textWidget.value || "");

                    // If a file is already selected in the dropdown, save directly
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

                    // No file selected – prompt for a filename
                    let filename = prompt("Enter file name to save (without extension):");
                    if (!filename) return;
                    filename = filename.trim();
                    if (!filename) return;

                    // Sanitise the name slightly for display
                    const safeBase = filename.replace(/[/\\:*?"<>|]/g, "_");
                    const proposedPath = `${TEXT_DIR}/${safeBase}.json`;

                    // Check if the file already exists (look in the dropdown options)
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

                // Override mouseout for saveBtn to avoid green flash during feedback
                saveBtn.addEventListener("mouseout", () => {
                    if (!["Saved!", "Saving…", "Error!"].includes(saveBtn.textContent)) {
                        saveBtn.style.backgroundColor = "#27272a";
                        saveBtn.style.color = "#34d399";
                    }
                });

                // Fix flex so Save doesn't stretch in the file-picker row
                saveBtn.style.flex = "none";

                // Insert Save into the file-picker row between Load and the dropdown
                filePickerRow.insertBefore(saveBtn, fileSelect);

                buttonContainer.appendChild(deleteBtn);
                buttonContainer.appendChild(copyBtn);
                buttonContainer.appendChild(checkAllBtn);
                buttonContainer.appendChild(uncheckAllBtn);

                renderList(listContainer, textWidget, node);

                // Override onConfigure to catch when ComfyUI restores node state (workflow load/refresh/copy-paste/undo-redo)
                const origOnConfigure = node.onConfigure;
                node.onConfigure = function (info) {
                    origOnConfigure?.apply(this, arguments);
                    renderList(listContainer, textWidget, node);
                    // Force node to snap to correct height after workflow restores a (possibly larger) saved size.
                    // Preserve the saved width so the node doesn't become too narrow — only the height is corrected.
                    setTimeout(() => {
                        const targetSize = node.computeSize();
                        const savedWidth = node.size[0];
                        node.setSize([Math.max(savedWidth, targetSize[0]), targetSize[1]]);
                        app.graph.setDirtyCanvas(true, true);
                    }, 50);
                };

                // Clean up interval when node is removed
                const origOnRemoved = node.onRemoved;
                node.onRemoved = function () {
                    origOnRemoved?.apply(this, arguments);
                    clearInterval(refreshInterval);
                };
            }
        }
    }
});
