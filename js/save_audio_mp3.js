import { app } from "../../scripts/app.js";

// ─── Dehypnotic SaveAudioMP3: Inline Audio Player ────────────────────────────
// Adds a styled <audio> player widget at the bottom of the node that loads the
// last-rendered MP3 preview from ComfyUI's temp directory.

const EXTENSION_NAME = "Dehypnotic.SaveAudioMP3.Player";
const NODE_TYPE      = "SaveAudioMP3Dehypnotic";

// ── Layout ──────────────────────────────────────────────────────────────────
// Total DOM widget height when audio is loaded:
//   path row  : 16 px
//   player box: 6+6 padding + 30 btn + 4 seek + 6 gap + 12 time/vol row = ~78 px
//   margin-top: 4 px
const PLAYER_WIDGET_HEIGHT = 98;

// ── CSS (injected once) ──────────────────────────────────────────────────────
let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    /* ── Root wrapper ── */
    .dh-audio-player-wrap {
      display: flex;
      flex-direction: column;
      width: 100%;
      box-sizing: border-box;
      font-family: Inter, Consolas, monospace;
    }

    /* ── Saved-file path label ── */
    .dh-audio-path {
      font-size: 10px;
      color: #888;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      padding: 0 4px 2px;
      height: 14px;
      line-height: 14px;
      flex-shrink: 0;
    }

    /* ── Outer player box ── */
    .dh-audio-player-body {
      display: none;                        /* shown after first execution */
      flex-direction: column;
      gap: 6px;
      background: rgba(0,0,0,0.28);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 6px;
      padding: 6px 10px;
      margin-top: 4px;
      box-sizing: border-box;
    }

    /* ── Top row: [play btn]  [seek bar fills remaining width] ── */
    .dh-audio-top-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ── Play / Pause button ── */
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
    .dh-audio-btn:hover {
      background: rgba(16,185,129,0.28);
      transform: scale(1.08);
    }
    .dh-audio-btn:active { transform: scale(0.95); }

    /* ── Seek bar (fills top row) ── */
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
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #10b981;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .dh-audio-seek::-webkit-slider-thumb:hover { transform: scale(1.3); }

    /* ── Bottom row: [time label]  spacer  [🔈 vol slider] ── */
    .dh-audio-bottom-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-left: 38px;   /* indent to align under seek bar (btn 30 + gap 8) */
    }

    .dh-audio-time {
      font-size: 9px;
      color: #71717a;
      user-select: none;
      flex-shrink: 0;
    }

    .dh-audio-spacer { flex: 1; }

    /* ── Volume icon ── */
    .dh-audio-vol-icon {
      font-size: 10px;
      color: #52525b;
      flex-shrink: 0;
      user-select: none;
    }

    /* ── Volume slider ── */
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
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #71717a;
      cursor: pointer;
      transition: background 0.15s;
    }
    .dh-audio-vol:hover::-webkit-slider-thumb { background: #a1a1aa; }

    /* ── Empty / waiting state ── */
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
    rand:      Date.now(),   // cache-bust → always refetch
  });
  return `/api/view?${params.toString()}`;
}

// ── Build the DOM widget ─────────────────────────────────────────────────────
function buildPlayerWidget(node) {
  injectCSS();

  // Root
  const root = document.createElement("div");
  root.className = "dh-audio-player-wrap";

  // Path label
  const pathLabel = document.createElement("div");
  pathLabel.className = "dh-audio-path";
  root.appendChild(pathLabel);

  // Empty state
  const emptyDiv = document.createElement("div");
  emptyDiv.className = "dh-audio-empty";
  emptyDiv.textContent = "▶  Run the node to load audio preview";
  root.appendChild(emptyDiv);

  // Player box
  const playerBody = document.createElement("div");
  playerBody.className = "dh-audio-player-body";
  root.appendChild(playerBody);

  // Hidden <audio>
  const audio = document.createElement("audio");
  audio.preload = "metadata";
  playerBody.appendChild(audio);

  // ── Top row ──────────────────────────────────────────────────────────────
  const topRow = document.createElement("div");
  topRow.className = "dh-audio-top-row";

  const playBtn = document.createElement("button");
  playBtn.className = "dh-audio-btn";
  playBtn.title = "Play / Pause";
  playBtn.textContent = "▶";

  const seekBar = document.createElement("input");
  seekBar.type  = "range";
  seekBar.className = "dh-audio-seek";
  seekBar.min   = "0";
  seekBar.max   = "100";
  seekBar.step  = "0.1";
  seekBar.value = "0";

  topRow.appendChild(playBtn);
  topRow.appendChild(seekBar);
  playerBody.appendChild(topRow);

  // ── Bottom row ────────────────────────────────────────────────────────────
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
  volSlider.type  = "range";
  volSlider.className = "dh-audio-vol";
  volSlider.min   = "0";
  volSlider.max   = "1";
  volSlider.step  = "0.02";
  volSlider.value = "1";
  volSlider.title = "Volume";

  bottomRow.appendChild(timeLabel);
  bottomRow.appendChild(spacer);
  bottomRow.appendChild(volIcon);
  bottomRow.appendChild(volSlider);
  playerBody.appendChild(bottomRow);

  // ── Event wiring ─────────────────────────────────────────────────────────
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

  // Block canvas stealing pointer events inside the widget
  const blockEvents = [
    "mousedown", "mouseup", "click", "dblclick",
    "pointerdown", "pointerup", "pointermove", "wheel",
  ];
  blockEvents.forEach((evt) => root.addEventListener(evt, (e) => e.stopPropagation()));

  // ── Public load API ───────────────────────────────────────────────────────
  root._dhLoadAudio = (info, savedPath) => {
    audio.pause();
    audio.src = buildAudioUrl(info);
    audio.currentTime = 0;
    seekBar.value = 0;
    playBtn.textContent = "▶";
    timeLabel.textContent = "0:00 / ...";

    emptyDiv.style.display = "none";
    playerBody.style.display = "flex";

    // Show only the filename
    if (savedPath) {
      const filename = savedPath.replace(/\\/g, "/").split("/").pop() ?? savedPath;
      pathLabel.innerHTML = `<span style="color:#555">Saved: </span>${filename}`;
    } else {
      pathLabel.textContent = "";
    }

    audio.addEventListener("canplay", () => audio.play().catch(() => {}), { once: true });
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

    // Attach DOM widget
    const playerRoot = buildPlayerWidget(node);
    const domWidget  = node.addDOMWidget("dh_audio_player", "custom_ui", playerRoot);
    domWidget.computeSize = () => [node.size[0], PLAYER_WIDGET_HEIGHT];

    node._dhPlayerRoot = playerRoot;

    // Hook into execution results
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function(message) {
      origOnExecuted?.apply(this, arguments);
      const previews  = message?.audio_preview;
      const savedPath = message?.saved_path?.[0] ?? null;
      if (previews?.length > 0 && this._dhPlayerRoot?._dhLoadAudio) {
        this._dhPlayerRoot._dhLoadAudio(previews[0], savedPath);
      }
    };
  },
});
