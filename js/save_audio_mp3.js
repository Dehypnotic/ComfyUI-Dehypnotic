import { app } from "../../scripts/app.js";

// ─── Dehypnotic SaveAudio: Dynamic widgets + Inline Audio Player ──────────────
// 1. Removes/restores format-specific widgets from node.widgets based on the
//    "format" dropdown. Removing them is the only reliable way to prevent
//    LiteGraph from drawing them (type="hidden" stops interaction but not drawing).
// 2. Shows an inline audio player that auto-plays the last rendered preview.

const EXTENSION_NAME = "Dehypnotic.SaveAudio.Player";
const NODE_TYPE      = "SaveAudioMP3Dehypnotic";

// ── Format widget maps ────────────────────────────────────────────────────────

// Which format-specific widgets are visible for each format
const FORMAT_WIDGETS = {
  mp3:  ["bitrate_mode", "quality"],
  wav:  ["sample_rate", "bit_depth"],
  flac: ["sample_rate", "bit_depth", "flac_compression"],
  opus: ["opus_bitrate", "opus_application", "opus_vbr"],
};

// All format-specific widget names (superset across all formats)
const ALL_FORMAT_WIDGETS = new Set(Object.values(FORMAT_WIDGETS).flat());

// The complete ordered list of managed widgets (matches INPUT_TYPES order).
// Any widget whose name is NOT here is treated as "unmanaged" (e.g., DOM player).
const WIDGET_ORDER = [
  "file_path",
  "date_subfolder_pattern",
  "filename_prefix",
  "autoplay",
  "format",
  // mp3
  "bitrate_mode",
  "quality",
  // wav + flac
  "sample_rate",
  "bit_depth",
  // flac
  "flac_compression",
  // opus
  "opus_bitrate",
  "opus_application",
  "opus_vbr",
];
const WIDGET_ORDER_SET = new Set(WIDGET_ORDER);

// ── Layout ───────────────────────────────────────────────────────────────────
const PLAYER_WIDGET_HEIGHT = 110;

// ── CSS (injected once) ──────────────────────────────────────────────────────
let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .dh-audio-player-wrap {
      display: flex;
      flex-direction: column;
      width: 100%;
      box-sizing: border-box;
      font-family: Inter, Consolas, monospace;
    }
    .dh-audio-path {
      font-size: 10px;
      color: #34d399;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      padding: 8px 4px 6px;
      line-height: 14px;
      flex-shrink: 0;
    }
    .dh-audio-player-body {
      display: none;
      flex-direction: column;
      gap: 6px;
      background: rgba(0,0,0,0.28);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 6px;
      padding: 6px 10px;
      margin-top: 4px;
      box-sizing: border-box;
    }
    .dh-audio-top-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dh-audio-btn {
      flex-shrink: 0;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 1.5px solid #10b981;
      background: rgba(16,185,129,0.12);
      color: #34d399;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, transform 0.1s;
      outline: none;
      user-select: none;
    }
    .dh-audio-btn:hover  { background: rgba(16,185,129,0.28); transform: scale(1.08); }
    .dh-audio-btn:active { transform: scale(0.95); }
    .dh-audio-seek {
      -webkit-appearance: none;
      appearance: none;
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: #3f3f46;
      outline: none;
      cursor: pointer;
    }
    .dh-audio-seek::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #10b981;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .dh-audio-seek::-webkit-slider-thumb:hover { transform: scale(1.3); }
    .dh-audio-bottom-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-left: 38px;
    }
    .dh-audio-time {
      font-size: 9px;
      color: #71717a;
      user-select: none;
      flex-shrink: 0;
    }
    .dh-audio-spacer { flex: 1; }
    .dh-audio-vol-icon {
      font-size: 10px;
      color: #52525b;
      flex-shrink: 0;
      user-select: none;
    }
    .dh-audio-vol {
      -webkit-appearance: none;
      appearance: none;
      flex-shrink: 0;
      width: 56px;
      height: 3px;
      border-radius: 2px;
      background: #3f3f46;
      outline: none;
      cursor: pointer;
    }
    .dh-audio-vol::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 9px; height: 9px;
      border-radius: 50%;
      background: #71717a;
      cursor: pointer;
      transition: background 0.15s;
    }
    .dh-audio-vol:hover::-webkit-slider-thumb { background: #a1a1aa; }
    .dh-audio-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 44px;
      color: #52525b;
      font-size: 10px;
      letter-spacing: 0.3px;
    }
  `;
  document.head.appendChild(style);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(sec) {
  if (!isFinite(sec) || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildAudioUrl(info) {
  const params = new URLSearchParams({
    filename: info.filename,
    subfolder: info.subfolder ?? "",
    type:      info.type     ?? "temp",
    rand:      Date.now(),
  });
  return `/api/view?${params.toString()}`;
}

// ── Widget visibility (via widget removal from node.widgets) ──────────────────
//
// type="hidden" + computeSize=[0,-4] stops INTERACTION but NOT DRAWING in
// this version of LiteGraph. Removing the widget from node.widgets entirely
// is the only guaranteed way to make it invisible.
//
// We keep a snapshot (node._dhSnap) of all named widgets so we can restore them.

function applyFormatVisibility(node, fmt) {
  if (!node.widgets) return;

  const visible = new Set(FORMAT_WIDGETS[fmt] ?? []);

  // ── Snapshot: capture every named widget exactly once ──────────────────
  if (!node._dhSnap) {
    node._dhSnap = new Map();
  }
  // Add any new widgets to the snapshot (runs on every call to catch DOM widget)
  for (const w of node.widgets) {
    if (w.name && !node._dhSnap.has(w.name)) {
      node._dhSnap.set(w.name, w);
    }
  }

  // ── Rebuild node.widgets ───────────────────────────────────────────────
  // Step 1 – ordered, managed widgets (only include visible format-specific ones)
  const next = [];
  for (const name of WIDGET_ORDER) {
    const w = node._dhSnap.get(name);
    if (!w) continue;
    if (ALL_FORMAT_WIDGETS.has(name) && !visible.has(name)) continue; // skip hidden
    next.push(w);
  }

  // Step 2 – unmanaged widgets (DOM player, any future additions) go at the end.
  // We check the CURRENT node.widgets (not snapshot) for unmanaged ones still present,
  // plus any unmanaged ones in the snapshot.
  const added = new Set(next.map(w => w.name));
  for (const [name, w] of node._dhSnap) {
    if (!WIDGET_ORDER_SET.has(name) && !added.has(name)) {
      next.push(w);
      added.add(name);
    }
  }

  node.widgets = next;
  node.setSize([node.size[0], node.computeSize()[1]]);
  app.graph?.setDirtyCanvas(true, true);
}

// ── Build the audio player DOM widget ────────────────────────────────────────
function buildPlayerWidget() {
  injectCSS();

  const root = document.createElement("div");
  root.className = "dh-audio-player-wrap";

  const pathLabel = document.createElement("div");
  pathLabel.className = "dh-audio-path";
  root.appendChild(pathLabel);

  const emptyDiv = document.createElement("div");
  emptyDiv.className = "dh-audio-empty";
  emptyDiv.textContent = "▶  Run the node to load audio preview";
  root.appendChild(emptyDiv);

  const playerBody = document.createElement("div");
  playerBody.className = "dh-audio-player-body";
  root.appendChild(playerBody);

  const audio = document.createElement("audio");
  audio.preload = "metadata";
  playerBody.appendChild(audio);

  // Top row: [play btn] [seek bar]
  const topRow = document.createElement("div");
  topRow.className = "dh-audio-top-row";

  const playBtn = document.createElement("button");
  playBtn.className = "dh-audio-btn";
  playBtn.title = "Play / Pause";
  playBtn.textContent = "▶";

  const seekBar = document.createElement("input");
  seekBar.type = "range";
  seekBar.className = "dh-audio-seek";
  seekBar.min = "0"; seekBar.max = "100"; seekBar.step = "0.1"; seekBar.value = "0";

  topRow.appendChild(playBtn);
  topRow.appendChild(seekBar);
  playerBody.appendChild(topRow);

  // Bottom row: [time] spacer [🔈 vol]
  const bottomRow = document.createElement("div");
  bottomRow.className = "dh-audio-bottom-row";

  const timeLabel = document.createElement("div");
  timeLabel.className = "dh-audio-time";
  timeLabel.textContent = "0:00 / 0:00";

  const spacer = document.createElement("div");
  spacer.className = "dh-audio-spacer";

  const volIcon = document.createElement("span");
  volIcon.className = "dh-audio-vol-icon";
  volIcon.textContent = "🔈";

  const volSlider = document.createElement("input");
  volSlider.type = "range";
  volSlider.className = "dh-audio-vol";
  volSlider.min = "0"; volSlider.max = "1"; volSlider.step = "0.02"; volSlider.value = "1";
  volSlider.title = "Volume";

  bottomRow.appendChild(timeLabel);
  bottomRow.appendChild(spacer);
  bottomRow.appendChild(volIcon);
  bottomRow.appendChild(volSlider);
  playerBody.appendChild(bottomRow);

  // ── Event wiring ──────────────────────────────────────────────────────────
  playBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  });
  audio.addEventListener("play",  () => { playBtn.textContent = "⏸"; });
  audio.addEventListener("pause", () => { playBtn.textContent = "▶"; });
  audio.addEventListener("ended", () => {
    playBtn.textContent = "▶";
    seekBar.value = 0;
    timeLabel.textContent = `0:00 / ${fmtTime(audio.duration)}`;
  });
  audio.addEventListener("timeupdate", () => {
    if (!isFinite(audio.duration) || audio.duration === 0) return;
    seekBar.value = (audio.currentTime / audio.duration) * 100;
    timeLabel.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`;
  });
  audio.addEventListener("loadedmetadata", () => {
    timeLabel.textContent = `0:00 / ${fmtTime(audio.duration)}`;
  });
  seekBar.addEventListener("input", (e) => {
    e.stopPropagation();
    if (isFinite(audio.duration))
      audio.currentTime = (seekBar.value / 100) * audio.duration;
  });
  volSlider.addEventListener("input", (e) => {
    e.stopPropagation();
    audio.volume = parseFloat(volSlider.value);
  });

  const blockEvents = [
    "mousedown", "mouseup", "click", "dblclick",
    "pointerdown", "pointerup", "pointermove", "wheel",
  ];
  blockEvents.forEach((evt) => root.addEventListener(evt, (e) => e.stopPropagation()));

  // ── Public API ────────────────────────────────────────────────────────────
  root._dhLoadAudio = (info, savedPath, autoplayEnabled = true) => {
    audio.pause();
    audio.src = buildAudioUrl(info);
    audio.currentTime = 0;
    seekBar.value = 0;
    playBtn.textContent = "▶";
    timeLabel.textContent = "0:00 / ...";

    emptyDiv.style.display = "none";
    playerBody.style.display = "flex";

    if (savedPath) {
      const filename = savedPath.replace(/\\/g, "/").split("/").pop() ?? savedPath;
      pathLabel.innerHTML = `<span style="color:#71717a">Saved: </span>${filename}`;
    } else {
      pathLabel.textContent = "";
    }

    if (autoplayEnabled) {
      audio.addEventListener("canplay", () => audio.play().catch(() => {}), { once: true });
    }
  };

  return root;
}

// ── Register extension ───────────────────────────────────────────────────────
app.registerExtension({
  name: EXTENSION_NAME,

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // Ensure minimum width
    const origComputeSize = node.computeSize?.bind(node);
    node.computeSize = function(out) {
      const size = origComputeSize ? origComputeSize(out) : [260, 26];
      size[0] = Math.max(size[0], 300);
      return size;
    };
    node.size[0] = Math.max(node.size[0], 300);

    // ── Attach audio player DOM widget first so it's in the snapshot ──────
    const playerRoot = buildPlayerWidget();
    const domWidget  = node.addDOMWidget("dh_audio_player", "custom_ui", playerRoot);
    domWidget.computeSize = () => [node.size[0], PLAYER_WIDGET_HEIGHT];
    node._dhPlayerRoot = playerRoot;

    // ── Wire up format widget ─────────────────────────────────────────────
    // Delay to ensure all widgets are fully registered before we snapshot them.
    const wireFormatWidget = () => {
      const formatWidget = node.widgets?.find((w) => w.name === "format");
      if (!formatWidget) return;

      const applyNow = () => applyFormatVisibility(node, formatWidget.value);

      // Hook into the combo widget's callback (fires when user clicks arrow)
      if (!formatWidget.__dhHooked) {
        formatWidget.__dhHooked = true;
        const origCallback = formatWidget.callback;
        formatWidget.callback = function(...args) {
          origCallback?.apply(this, args);
          applyNow();
        };

        // Shim .value so that workflow-load (sets .value directly) also triggers update
        let _val = formatWidget.value;
        Object.defineProperty(formatWidget, "value", {
          get: () => _val,
          set: (v) => {
            _val = v;
            requestAnimationFrame(applyNow);
          },
          configurable: true,
        });
      }

      applyNow();
    };

    setTimeout(wireFormatWidget, 150);

    // ── Hook into execution results ───────────────────────────────────────
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function(message) {
      origOnExecuted?.apply(this, arguments);
      const previews  = message?.audio_preview;
      const savedPath = message?.saved_path?.[0] ?? null;
      
      const autoplayWidget = this.widgets?.find((w) => w.name === "autoplay");
      const doAutoplay = (autoplayWidget?.value !== "off");

      if (previews?.length > 0 && this._dhPlayerRoot?._dhLoadAudio) {
        this._dhPlayerRoot._dhLoadAudio(previews[0], savedPath, doAutoplay);
      }
    };

    // ── Re-apply on workflow load / undo-redo ─────────────────────────────
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function(info) {
      origOnConfigure?.apply(this, arguments);
      // Reset snapshot so the new widget instances are picked up
      node._dhSnap = null;
      setTimeout(wireFormatWidget, 150);
    };
  },
});
