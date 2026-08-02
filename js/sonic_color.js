import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough, installResizeFloor, measureRootContent } from "./shared/index.mjs";

const EXTENSION_NAME = "Dehypnotic.SonicColor";
const NODE_TYPE = "SonicColor";

const DEFAULT_W = 410;
const DEFAULT_H = 475;
const MIN_W = 380;
const MIN_H = 340;
const WIDGET_MIN_H = 300;

const EQ_BANDS = [
    { key: "eq_50hz", label: "50Hz", type: "lowshelf", freq: 50 },
    { key: "eq_100hz", label: "100Hz", type: "peaking", freq: 100 },
    { key: "eq_200hz", label: "200Hz", type: "peaking", freq: 200 },
    { key: "eq_400hz", label: "400Hz", type: "peaking", freq: 400 },
    { key: "eq_800hz", label: "800Hz", type: "peaking", freq: 800 },
    { key: "eq_1600hz", label: "1.6k", type: "peaking", freq: 1600 },
    { key: "eq_3200hz", label: "3.2k", type: "peaking", freq: 3200 },
    { key: "eq_6400hz", label: "6.4k", type: "peaking", freq: 6400 },
    { key: "eq_12800hz", label: "12.8k", type: "peaking", freq: 12800 },
    { key: "eq_16000hz", label: "16k", type: "highshelf", freq: 16000 },
];

let userPresetsCache = {};

async function fetchUserPresets() {
    try {
        const resp = await fetch("/dehypnotic/sonic_color/presets/list");
        if (!resp.ok) return {};
        const json = await resp.json();
        const map = {};
        if (json.custom) {
            json.custom.forEach(item => {
                map[item.name] = item.data;
            });
        }
        userPresetsCache = map;
        return map;
    } catch (e) {
        console.warn("[SonicColor] Failed to list custom presets:", e);
        return {};
    }
}

function injectCSS() {
    if (document.getElementById("sonic-color-css")) return;
    const style = document.createElement("style");
    style.id = "sonic-color-css";
    style.textContent = `
    .sc-gui-root {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: 8px;
        background: #12151e;
        border-radius: 8px;
        border: 1px solid #232938;
        color: #e2e8f0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        gap: 8px;
        user-select: none;
        overflow-y: auto;
        overflow-x: hidden;
    }
    .sc-tab-content-container {
        flex: 1 1 auto;
        width: 100%;
        display: flex;
        flex-direction: column;
        min-height: 140px;
    }

    .sc-gui-root::-webkit-scrollbar {
        width: 6px;
    }
    .sc-gui-root::-webkit-scrollbar-track {
        background: #0f172a;
        border-radius: 3px;
    }
    .sc-gui-root::-webkit-scrollbar-thumb {
        background: #334155;
        border-radius: 3px;
    }
    .sc-gui-root::-webkit-scrollbar-thumb:hover {
        background: #475569;
    }

    .sc-header-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        background: #1a202c;
        padding: 6px;
        border-radius: 6px;
        border: 1px solid #2d3748;
        flex-shrink: 0;
    }
    .sc-select {
        flex: 1;
        min-width: 120px;
        background: #0f172a;
        color: #38bdf8;
        border: 1px solid #334155;
        border-radius: 4px;
        padding: 4px 6px;
        font-size: 11px;
        font-weight: 600;
        outline: none;
    }
    .sc-btn {
        background: #1e293b;
        color: #cbd5e1;
        border: 1px solid #334155;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .sc-btn:hover {
        background: #334155;
        color: #ffffff;
        border-color: #475569;
    }
    .sc-btn-accent {
        background: #0284c7;
        color: #ffffff;
        border-color: #0369a1;
    }
    .sc-btn-accent:hover {
        background: #0369a1;
    }
    .sc-btn-play {
        background: #059669;
        color: #ffffff;
        border-color: #047857;
        font-weight: 700;
    }
    .sc-btn-play:hover {
        background: #047857;
    }
    .sc-btn-stop {
        background: #dc2626;
        color: #ffffff;
        border-color: #b91c1c;
        font-weight: 700;
    }
    .sc-btn-stop:hover {
        background: #b91c1c;
    }
    .sc-time-group {
        display: flex;
        align-items: center;
        gap: 3px;
        background: #0f172a;
        padding: 3px 5px;
        border-radius: 4px;
        border: 1px solid #334155;
    }
    .sc-time-input {
        width: 30px;
        background: transparent;
        border: none;
        color: #38bdf8;
        font-weight: 700;
        font-size: 11px;
        text-align: center;
        outline: none;
    }
    .sc-tabs {
        display: flex;
        gap: 4px;
        background: #1e293b;
        padding: 3px;
        border-radius: 6px;
        flex-shrink: 0;
    }
    .sc-tab-btn {
        flex: 1;
        text-align: center;
        padding: 5px 0;
        border-radius: 4px;
        background: transparent;
        border: none;
        color: #94a3b8;
        font-weight: 600;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s;
    }
    .sc-tab-btn.active {
        background: #0284c7;
        color: #ffffff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .sc-section {
        background: #1a202c;
        padding: 8px 10px;
        border-radius: 6px;
        border: 1px solid #2d3748;
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1 1 auto;
        box-sizing: border-box;
    }
    .sc-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }
    .sc-label {
        font-weight: 600;
        color: #cbd5e1;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 85px;
    }
    .sc-color-pill {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
    }
    .sc-val {
        color: #38bdf8;
        font-weight: 700;
        min-width: 45px;
        text-align: right;
    }
    .sc-slider {
        flex: 1;
        height: 5px;
        -webkit-appearance: none;
        appearance: none;
        background: #334155;
        border-radius: 3px;
        outline: none;
    }
    .sc-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #38bdf8;
        cursor: pointer;
        box-shadow: 0 0 4px rgba(56, 189, 248, 0.5);
    }
    .sc-eq-container {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 5px;
    }
    .sc-eq-band {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #0f172a;
        padding: 4px 2px;
        border-radius: 5px;
        border: 1px solid #334155;
        gap: 2px;
    }
    .sc-eq-slider {
        writing-mode: bt-lr;
        -webkit-appearance: slider-vertical;
        width: 14px;
        height: 54px;
        cursor: pointer;
    }
    .sc-footer {
        display: flex;
        align-items: center;
        gap: 10px;
        background: #1a202c;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid #2d3748;
        flex-shrink: 0;
    }
    `;
    document.head.appendChild(style);
}

// Extract exact duration from audio or video blob in browser
const getMediaDurationFromBlob = async (blob) => {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(blob);
        const video = document.createElement("video");
        video.preload = "metadata";

        const cleanup = () => {
            URL.revokeObjectURL(objectUrl);
            video.remove();
        };

        video.onloadedmetadata = () => {
            const dur = video.duration;
            cleanup();
            if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
                resolve(dur);
            } else {
                resolve(0);
            }
        };

        video.onerror = async () => {
            cleanup();
            try {
                const arrayBuf = await blob.arrayBuffer();
                const tempAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await tempAudioCtx.decodeAudioData(arrayBuf);
                const dur = audioBuffer.duration;
                tempAudioCtx.close();
                resolve(dur && !isNaN(dur) ? dur : 0);
            } catch (e) {
                resolve(0);
            }
        };

        video.src = objectUrl;
    });
};

// Global synchronization listener for PromptServer "sonic_color.update_duration" event (matching AspectRatio pattern)
api.addEventListener("sonic_color.update_duration", (e) => {
    const { node_id, hours, minutes, seconds } = e.detail;
    const visit = (graph) => {
        if (!graph) return null;
        const nodes = graph._nodes || graph.nodes || [];
        for (const n of nodes) {
            if (!n) continue;
            if (String(n.id) === String(node_id)) return n;
            const inner = n.subgraph || n.graph || n._graph;
            if (inner && inner !== graph) {
                const found = visit(inner);
                if (found) return found;
            }
        }
        return null;
    };

    const targetNode = visit(app.graph);
    if (targetNode && (targetNode.comfyClass === "SonicColor" || targetNode.type === "SonicColor")) {
        if (targetNode._updateDurationUI) {
            targetNode._updateDurationUI(hours, minutes, seconds);
        }
    }
});

app.registerExtension({
    name: EXTENSION_NAME,

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

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
            this._dhSonicColorFloorOff?.();
            this._dhSonicColorFloorOff = null;
            if (origRemoved) return origRemoved.apply(this, arguments);
        };
    },

    async nodeCreated(node) {
        if (node.comfyClass !== NODE_TYPE) return;
        injectCSS();

        const origComputeSize = node.computeSize;
        node.computeSize = function (out) {
            const size = origComputeSize ? origComputeSize.apply(this, arguments) : [DEFAULT_W, DEFAULT_H];
            size[0] = Math.max(size[0], MIN_W);
            size[1] = Math.max(size[1], MIN_H);
            return size;
        };

        if (node.size[0] < MIN_W) node.size[0] = DEFAULT_W;
        if (node.size[1] < MIN_H) node.size[1] = DEFAULT_H;

        const paramsWidget = node.widgets?.find(w => w.name === "params");
        if (paramsWidget) {
            paramsWidget.type = "hidden";
            paramsWidget.hidden = true;
            paramsWidget.computeSize = () => [0, -4];
            paramsWidget.draw = () => { };
        }

        // Live Web Audio Synthesizer State with Full Filter & 10-Band EQ Graph
        let audioCtx = null;
        let scriptNode = null;
        let liveFilterNode = null;
        let liveEqNodes = [];
        let masterGain = null;
        let isPlayingLive = false;

        // Kellet filter state variables for live WebAudio preview
        let live_b0 = 0, live_b1 = 0, live_b2 = 0, live_b3 = 0, live_b4 = 0, live_b5 = 0, live_b6 = 0;
        let live_lastBrown = 0, live_lastPink = 0, live_lastWhite = 0;

        const stopLiveAudio = () => {
            if (audioCtx) {
                try {
                    if (scriptNode) scriptNode.disconnect();
                    if (liveFilterNode) liveFilterNode.disconnect();
                    liveEqNodes.forEach(eq => eq.disconnect());
                    if (masterGain) masterGain.disconnect();
                    audioCtx.close();
                } catch (e) {}
                audioCtx = null;
                scriptNode = null;
                liveFilterNode = null;
                liveEqNodes = [];
                masterGain = null;
            }
            isPlayingLive = false;
        };

        const updateLiveAudioGraph = () => {
            if (!audioCtx || !isPlayingLive) return;
            const curState = getCurrentGuiState();
            const now = audioCtx.currentTime;

            // 1. Update Resonant Filter
            if (liveFilterNode) {
                const ft = curState.filter_type || "off";
                liveFilterNode.type = ft === "off" ? "allpass" : ft;
                const fc = Math.min(Math.max(curState.cutoff_freq || 1000, 20), audioCtx.sampleRate * 0.49);
                liveFilterNode.frequency.setTargetAtTime(fc, now, 0.02);
                liveFilterNode.Q.setTargetAtTime(curState.resonance || 1.0, now, 0.02);
            }

            // 2. Update 10-Band EQ
            EQ_BANDS.forEach((b, idx) => {
                if (liveEqNodes[idx]) {
                    const dbGain = curState[b.key] || 0.0;
                    liveEqNodes[idx].gain.setTargetAtTime(dbGain, now, 0.02);
                }
            });

            // 3. Update Master Volume
            if (masterGain) {
                const vol = (curState.volume !== undefined ? curState.volume : 0.5) * 0.5;
                masterGain.gain.setTargetAtTime(vol, now, 0.02);
            }
        };

        const startLiveAudio = () => {
            stopLiveAudio();
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioCtx();
            const curState = getCurrentGuiState();

            masterGain = audioCtx.createGain();
            masterGain.gain.setValueAtTime((curState.volume || 0.5) * 0.5, audioCtx.currentTime);
            masterGain.connect(audioCtx.destination);

            liveFilterNode = audioCtx.createBiquadFilter();
            const ft = curState.filter_type || "off";
            liveFilterNode.type = ft === "off" ? "allpass" : ft;
            liveFilterNode.frequency.value = Math.min(Math.max(curState.cutoff_freq || 1000, 20), audioCtx.sampleRate * 0.49);
            liveFilterNode.Q.value = curState.resonance || 1.0;

            liveEqNodes = [];
            let prevNode = liveFilterNode;

            EQ_BANDS.forEach(b => {
                const eq = audioCtx.createBiquadFilter();
                eq.type = b.type;
                eq.frequency.value = b.freq;
                eq.Q.value = 1.0;
                eq.gain.value = curState[b.key] || 0.0;
                liveEqNodes.push(eq);
                prevNode.connect(eq);
                prevNode = eq;
            });

            prevNode.connect(masterGain);

            scriptNode = audioCtx.createScriptProcessor(4096, 0, 2);
            scriptNode.onaudioprocess = (e) => {
                const outL = e.outputBuffer.getChannelData(0);
                const outR = e.outputBuffer.getChannelData(1);
                const len = outL.length;
                const cState = getCurrentGuiState();

                const wW = cState.white_gain || 0;
                const wP = cState.pink_gain || 0;
                const wBr = cState.brown_gain || 0;
                const wBl = cState.blue_gain || 0;
                const wV = cState.violet_gain || 0;
                const tot = wW + wP + wBr + wBl + wV;
                const nW = tot > 0 ? wW / tot : 1;
                const nP = tot > 0 ? wP / tot : 0;
                const nBr = tot > 0 ? wBr / tot : 0;
                const nBl = tot > 0 ? wBl / tot : 0;
                const nV = tot > 0 ? wV / tot : 0;

                for (let i = 0; i < len; i++) {
                    const white = Math.random() * 2.0 - 1.0;

                    live_b0 = 0.99886 * live_b0 + white * 0.0555179;
                    live_b1 = 0.99332 * live_b1 + white * 0.0750759;
                    live_b2 = 0.96900 * live_b2 + white * 0.1538520;
                    live_b3 = 0.86650 * live_b3 + white * 0.3104856;
                    live_b4 = 0.55000 * live_b4 + white * 0.5329522;
                    live_b5 = -0.7616 * live_b5 - white * 0.0168980;
                    const pink = live_b0 + live_b1 + live_b2 + live_b3 + live_b4 + live_b5 + live_b6 + white * 0.5362;
                    live_b6 = white * 0.115926;
                    const pinkScaled = pink * 0.11;

                    const brown = (live_lastBrown + 0.02 * white) / 1.02;
                    live_lastBrown = brown;
                    const brownScaled = brown * 3.5;

                    const blueScaled = (pinkScaled - live_lastPink) * 3.0;
                    live_lastPink = pinkScaled;

                    const violetScaled = (white - live_lastWhite) * 0.5;
                    live_lastWhite = white;

                    const mixed = (white * nW) + (pinkScaled * nP) + (brownScaled * nBr) + (blueScaled * nBl) + (violetScaled * nV);
                    outL[i] = mixed;
                    outR[i] = mixed;
                }
            };

            scriptNode.connect(liveFilterNode);
            isPlayingLive = true;
        };

        // Create Root GUI element with responsive flexbox layout
        const root = document.createElement("div");
        root.className = "sc-gui-root";

        // -------------------------------------------------------------
        // 1. Header Bar: Preset dropdown, Save/Delete, Duration (H/M/S)
        // -------------------------------------------------------------
        const header = document.createElement("div");
        header.className = "sc-header-bar";

        const presetSelect = document.createElement("select");
        presetSelect.className = "sc-select";

        const refreshPresetOptions = async () => {
            await fetchUserPresets();
            presetSelect.innerHTML = "";

            const defaultOpt = document.createElement("option");
            defaultOpt.value = "New Preset";
            defaultOpt.textContent = "New Preset";
            presetSelect.appendChild(defaultOpt);

            const userKeys = Object.keys(userPresetsCache);
            userKeys.forEach(p => {
                const opt = document.createElement("option");
                opt.value = p;
                opt.textContent = p;
                presetSelect.appendChild(opt);
            });
        };

        const saveBtn = document.createElement("button");
        saveBtn.className = "sc-btn sc-btn-accent";
        saveBtn.textContent = "💾 Save";

        const delBtn = document.createElement("button");
        delBtn.className = "sc-btn";
        delBtn.textContent = "🗑️ Delete";

        const timeGroup = document.createElement("div");
        timeGroup.className = "sc-time-group";

        const hInput = document.createElement("input");
        hInput.type = "number";
        hInput.min = "0"; hInput.max = "24";
        hInput.className = "sc-time-input";
        hInput.value = "0";

        const mInput = document.createElement("input");
        mInput.type = "number";
        mInput.min = "0"; mInput.max = "59";
        mInput.className = "sc-time-input";
        mInput.value = "1";

        const sInput = document.createElement("input");
        sInput.type = "number";
        sInput.min = "0"; sInput.max = "59"; sInput.step = "1";
        sInput.className = "sc-time-input";
        sInput.value = "0";

        timeGroup.appendChild(document.createTextNode("⏳"));
        timeGroup.appendChild(hInput);
        timeGroup.appendChild(document.createTextNode("h"));
        timeGroup.appendChild(mInput);
        timeGroup.appendChild(document.createTextNode("m"));
        timeGroup.appendChild(sInput);
        timeGroup.appendChild(document.createTextNode("s"));

        header.appendChild(presetSelect);
        header.appendChild(saveBtn);
        header.appendChild(delBtn);
        header.appendChild(timeGroup);
        root.appendChild(header);

        // Function exposed on node for PromptServer event sync & duration detection (rounded up to whole seconds)
        node._updateDurationUI = (hours, minutes, seconds) => {
            if (hours !== undefined) hInput.value = hours;
            if (minutes !== undefined) mInput.value = minutes;
            if (seconds !== undefined) sInput.value = Math.ceil(seconds);

            syncCurrentGuiToParamsWidget();
        };

        // -------------------------------------------------------------
        // 2. Navigation Tabs (Noise Mix / Filter & Env / 10-Band EQ)
        // -------------------------------------------------------------
        const tabsBar = document.createElement("div");
        tabsBar.className = "sc-tabs";

        const tab1Btn = document.createElement("button");
        tab1Btn.className = "sc-tab-btn active";
        tab1Btn.textContent = "🎨 Color Mix";

        const tab2Btn = document.createElement("button");
        tab2Btn.className = "sc-tab-btn";
        tab2Btn.textContent = "🎛️ Filter & Env";

        const tab3Btn = document.createElement("button");
        tab3Btn.className = "sc-tab-btn";
        tab3Btn.textContent = "🎚️ 10-Band EQ";

        tabsBar.appendChild(tab1Btn);
        tabsBar.appendChild(tab2Btn);
        tabsBar.appendChild(tab3Btn);
        root.appendChild(tabsBar);

        const tabContentContainer = document.createElement("div");
        root.appendChild(tabContentContainer);

        // --- TAB 1: NOISE COLOR MIX & LIVE PLAYBACK ---
        const tab1Content = document.createElement("div");
        tab1Content.className = "sc-section";

        const colorsDef = [
            { key: "white_gain", label: "White Noise", color: "#f8fafc" },
            { key: "pink_gain", label: "Pink Noise", color: "#ec4899" },
            { key: "brown_gain", label: "Brown Noise", color: "#b45309" },
            { key: "blue_gain", label: "Blue Noise", color: "#3b82f6" },
            { key: "violet_gain", label: "Violet Noise", color: "#8b5cf6" },
        ];

        const colorControls = {};

        colorsDef.forEach(c => {
            const row = document.createElement("div");
            row.className = "sc-row";

            const label = document.createElement("div");
            label.className = "sc-label";
            const pill = document.createElement("span");
            pill.className = "sc-color-pill";
            pill.style.background = c.color;
            label.appendChild(pill);
            label.appendChild(document.createTextNode(c.label));

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "0"; slider.max = "1.0"; slider.step = "0.01";
            slider.className = "sc-slider";
            slider.value = "0";

            const valLabel = document.createElement("div");
            valLabel.className = "sc-val";
            valLabel.textContent = "0%";

            slider.addEventListener("input", () => {
                const v = parseFloat(slider.value);
                valLabel.textContent = `${Math.round(v * 100)}%`;
                syncCurrentGuiToParamsWidget();
            });

            row.appendChild(label);
            row.appendChild(slider);
            row.appendChild(valLabel);
            tab1Content.appendChild(row);

            colorControls[c.key] = { slider, valLabel };
        });

        // External Audio Input Mix Volume Slider
        const audioVolRow = document.createElement("div");
        audioVolRow.className = "sc-row";
        audioVolRow.style.borderTop = "1px dashed #334155";
        audioVolRow.style.paddingTop = "6px";
        audioVolRow.style.marginTop = "2px";

        const audioVolLabel = document.createElement("div");
        audioVolLabel.className = "sc-label";
        audioVolLabel.textContent = "🎵 Input Audio Vol:";

        const audioVolSlider = document.createElement("input");
        audioVolSlider.type = "range";
        audioVolSlider.min = "0"; audioVolSlider.max = "1.0"; audioVolSlider.step = "0.01";
        audioVolSlider.className = "sc-slider";
        audioVolSlider.value = "1.0";

        const audioVolVal = document.createElement("div");
        audioVolVal.className = "sc-val";
        audioVolVal.textContent = "100%";

        audioVolSlider.addEventListener("input", () => {
            const v = parseFloat(audioVolSlider.value);
            audioVolVal.textContent = `${Math.round(v * 100)}%`;
            syncCurrentGuiToParamsWidget();
        });

        audioVolRow.appendChild(audioVolLabel);
        audioVolRow.appendChild(audioVolSlider);
        audioVolRow.appendChild(audioVolVal);
        tab1Content.appendChild(audioVolRow);

        // Combined Live Play/Stop Button
        const playBtn = document.createElement("button");
        playBtn.className = "sc-btn sc-btn-play";
        playBtn.style.width = "100%";
        playBtn.style.padding = "6px";
        playBtn.style.marginTop = "4px";
        playBtn.textContent = "▶️ Start Live Preview";

        playBtn.addEventListener("click", () => {
            if (isPlayingLive) {
                stopLiveAudio();
                playBtn.textContent = "▶️ Start Live Preview";
                playBtn.className = "sc-btn sc-btn-play";
            } else {
                startLiveAudio();
                playBtn.textContent = "⏹️ Stop Live Preview";
                playBtn.className = "sc-btn sc-btn-stop";
            }
        });

        tab1Content.appendChild(playBtn);

        // --- TAB 2: FILTER & ADSR ENVELOPE ---
        const tab2Content = document.createElement("div");
        tab2Content.className = "sc-section";

        const filterTitle = document.createElement("div");
        filterTitle.style.fontWeight = "700";
        filterTitle.style.color = "#38bdf8";
        filterTitle.textContent = "Resonant Filter Settings";
        tab2Content.appendChild(filterTitle);

        const fTypeRow = document.createElement("div");
        fTypeRow.className = "sc-row";
        const fTypeLabel = document.createElement("div");
        fTypeLabel.className = "sc-label";
        fTypeLabel.textContent = "Filter Type:";
        const fTypeSelect = document.createElement("select");
        fTypeSelect.className = "sc-select";
        ["off", "lowpass", "highpass", "bandpass", "notch"].forEach(ft => {
            const opt = document.createElement("option");
            opt.value = ft;
            opt.textContent = ft.toUpperCase();
            fTypeSelect.appendChild(opt);
        });
        fTypeSelect.value = "off";
        fTypeSelect.addEventListener("change", () => syncCurrentGuiToParamsWidget());
        fTypeRow.appendChild(fTypeLabel);
        fTypeRow.appendChild(fTypeSelect);
        tab2Content.appendChild(fTypeRow);

        const fcRow = document.createElement("div");
        fcRow.className = "sc-row";
        const fcLabel = document.createElement("div");
        fcLabel.className = "sc-label";
        fcLabel.textContent = "Cutoff Freq:";
        const fcSlider = document.createElement("input");
        fcSlider.type = "range";
        fcSlider.min = "20"; fcSlider.max = "20000"; fcSlider.step = "10";
        fcSlider.className = "sc-slider";
        fcSlider.value = "1000";

        const fcVal = document.createElement("div");
        fcVal.className = "sc-val";
        const updateFcVal = (v) => {
            fcVal.textContent = v >= 1000 ? `${(v / 1000).toFixed(1)}k Hz` : `${Math.round(v)} Hz`;
        };
        updateFcVal(1000);

        fcSlider.addEventListener("input", () => {
            const v = parseFloat(fcSlider.value);
            updateFcVal(v);
            syncCurrentGuiToParamsWidget();
        });
        fcRow.appendChild(fcLabel);
        fcRow.appendChild(fcSlider);
        fcRow.appendChild(fcVal);
        tab2Content.appendChild(fcRow);

        const resRow = document.createElement("div");
        resRow.className = "sc-row";
        const resLabel = document.createElement("div");
        resLabel.className = "sc-label";
        resLabel.textContent = "Resonance (Q):";
        const resSlider = document.createElement("input");
        resSlider.type = "range";
        resSlider.min = "0.1"; resSlider.max = "20.0"; resSlider.step = "0.1";
        resSlider.className = "sc-slider";
        resSlider.value = "1.0";
        const resVal = document.createElement("div");
        resVal.className = "sc-val";
        resVal.textContent = "1.0";
        resSlider.addEventListener("input", () => {
            const v = parseFloat(resSlider.value);
            resVal.textContent = v.toFixed(1);
            syncCurrentGuiToParamsWidget();
        });
        resRow.appendChild(resLabel);
        resRow.appendChild(resSlider);
        resRow.appendChild(resVal);
        tab2Content.appendChild(resRow);

        const envTitle = document.createElement("div");
        envTitle.style.fontWeight = "700";
        envTitle.style.color = "#38bdf8";
        envTitle.style.marginTop = "4px";
        envTitle.textContent = "ADSR Envelope Settings";
        tab2Content.appendChild(envTitle);

        const envDef = [
            { key: "attack", label: "Attack (s)", min: "0", max: "10.0", step: "0.05", def: "0.1" },
            { key: "decay", label: "Decay (s)", min: "0", max: "10.0", step: "0.05", def: "0.3" },
            { key: "sustain", label: "Sustain", min: "0", max: "1.0", step: "0.01", def: "1.0" },
            { key: "release", label: "Release (s)", min: "0", max: "10.0", step: "0.05", def: "1.0" },
        ];

        const envControls = {};

        envDef.forEach(e => {
            const row = document.createElement("div");
            row.className = "sc-row";
            const label = document.createElement("div");
            label.className = "sc-label";
            label.textContent = e.label;

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = e.min; slider.max = e.max; slider.step = e.step;
            slider.className = "sc-slider";
            slider.value = e.def;

            const valLabel = document.createElement("div");
            valLabel.className = "sc-val";
            valLabel.textContent = parseFloat(slider.value).toFixed(2);

            slider.addEventListener("input", () => {
                const v = parseFloat(slider.value);
                valLabel.textContent = v.toFixed(2);
                syncCurrentGuiToParamsWidget();
            });

            row.appendChild(label);
            row.appendChild(slider);
            row.appendChild(valLabel);
            tab2Content.appendChild(row);

            envControls[e.key] = { slider, valLabel };
        });

        // --- TAB 3: 10-BAND EQ ---
        const tab3Content = document.createElement("div");
        tab3Content.className = "sc-section";

        const eqHeader = document.createElement("div");
        eqHeader.className = "sc-row";

        const eqTitle = document.createElement("div");
        eqTitle.style.fontWeight = "700";
        eqTitle.style.color = "#38bdf8";
        eqTitle.textContent = "10-Band Graphic Equalizer";

        const resetEqBtn = document.createElement("button");
        resetEqBtn.className = "sc-btn";
        resetEqBtn.textContent = "Reset EQ";

        eqHeader.appendChild(eqTitle);
        eqHeader.appendChild(resetEqBtn);
        tab3Content.appendChild(eqHeader);

        const eqGrid = document.createElement("div");
        eqGrid.className = "sc-eq-container";

        const eqControls = {};

        EQ_BANDS.forEach(b => {
            const bandBox = document.createElement("div");
            bandBox.className = "sc-eq-band";

            const valLabel = document.createElement("span");
            valLabel.style.fontSize = "9px";
            valLabel.style.fontWeight = "700";
            valLabel.style.color = "#38bdf8";

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "-12.0"; slider.max = "12.0"; slider.step = "0.5";
            slider.className = "sc-eq-slider";
            slider.value = "0";

            const updateEqVal = (v) => {
                const sign = v > 0 ? "+" : "";
                valLabel.textContent = v === 0 ? "0 dB" : `${sign}${v.toFixed(1)}dB`;
            };
            updateEqVal(0);

            slider.addEventListener("input", () => {
                const v = parseFloat(slider.value);
                updateEqVal(v);
                syncCurrentGuiToParamsWidget();
            });

            const bandLabel = document.createElement("span");
            bandLabel.style.fontSize = "9px";
            bandLabel.style.color = "#94a3b8";
            bandLabel.textContent = b.label;

            bandBox.appendChild(valLabel);
            bandBox.appendChild(slider);
            bandBox.appendChild(bandLabel);
            eqGrid.appendChild(bandBox);

            eqControls[b.key] = { slider, valLabel, updateEqVal };
        });

        tab3Content.appendChild(eqGrid);

        resetEqBtn.addEventListener("click", () => {
            EQ_BANDS.forEach(b => {
                const c = eqControls[b.key];
                if (c) {
                    c.slider.value = 0;
                    c.updateEqVal(0);
                }
            });
            syncCurrentGuiToParamsWidget();
        });

        // Helper: Dynamically fit node height to current DOM content
        const fitNodeSizeToContent = () => {
            requestAnimationFrame(() => {
                const measured = measureRootContent(root);
                if (measured > 0) {
                    const titleH = window.LiteGraph?.NODE_TITLE_HEIGHT || 30;
                    const targetH = Math.max(MIN_H, Math.ceil(measured + titleH + 12));
                    const currentW = Math.max(node.size[0] || 0, MIN_W);
                    node.setSize([currentW, targetH]);
                    node.setDirtyCanvas(true, true);
                    app.graph?.setDirtyCanvas(true, true);
                }
            });
        };

        // Tab Switching Logic
        const switchTab = (tabIndex) => {
            tab1Btn.classList.toggle("active", tabIndex === 1);
            tab2Btn.classList.toggle("active", tabIndex === 2);
            tab3Btn.classList.toggle("active", tabIndex === 3);

            tabContentContainer.innerHTML = "";
            if (tabIndex === 1) tabContentContainer.appendChild(tab1Content);
            else if (tabIndex === 2) tabContentContainer.appendChild(tab2Content);
            else if (tabIndex === 3) tabContentContainer.appendChild(tab3Content);

            node.setDirtyCanvas(true, true);
            fitNodeSizeToContent();
        };

        tab1Btn.addEventListener("click", () => switchTab(1));
        tab2Btn.addEventListener("click", () => switchTab(2));
        tab3Btn.addEventListener("click", () => switchTab(3));

        switchTab(1); // Default to Color Mix tab

        // -------------------------------------------------------------
        // 3. Footer Bar: Master Volume
        // -------------------------------------------------------------
        const footer = document.createElement("div");
        footer.className = "sc-footer";

        const volLabel = document.createElement("div");
        volLabel.className = "sc-label";
        volLabel.textContent = "🔊 Master Volume:";

        const volSlider = document.createElement("input");
        volSlider.type = "range";
        volSlider.min = "0"; volSlider.max = "1.0"; volSlider.step = "0.01";
        volSlider.className = "sc-slider";
        volSlider.value = "0.5";

        const volVal = document.createElement("div");
        volVal.className = "sc-val";
        volVal.textContent = "50%";

        volSlider.addEventListener("input", () => {
            const v = parseFloat(volSlider.value);
            volVal.textContent = `${Math.round(v * 100)}%`;
            syncCurrentGuiToParamsWidget();
        });

        footer.appendChild(volLabel);
        footer.appendChild(volSlider);
        footer.appendChild(volVal);
        root.appendChild(footer);

        // Helper: Collect current GUI state into an object
        const getCurrentGuiState = () => {
            const state = {
                preset: presetSelect.value || "New Preset",
                hours: parseInt(hInput.value) || 0,
                minutes: parseInt(mInput.value) || 0,
                seconds: parseInt(sInput.value) || 0,
                sample_rate: 44100,
                stereo: true,
                white_gain: parseFloat(colorControls.white_gain.slider.value),
                pink_gain: parseFloat(colorControls.pink_gain.slider.value),
                brown_gain: parseFloat(colorControls.brown_gain.slider.value),
                blue_gain: parseFloat(colorControls.blue_gain.slider.value),
                violet_gain: parseFloat(colorControls.violet_gain.slider.value),
                audio_input_vol: parseFloat(audioVolSlider.value),
                filter_type: fTypeSelect.value,
                cutoff_freq: parseFloat(fcSlider.value),
                resonance: parseFloat(resSlider.value),
                attack: parseFloat(envControls.attack.slider.value),
                decay: parseFloat(envControls.decay.slider.value),
                sustain: parseFloat(envControls.sustain.slider.value),
                release: parseFloat(envControls.release.slider.value),
                volume: parseFloat(volSlider.value),
            };
            EQ_BANDS.forEach(b => {
                state[b.key] = parseFloat(eqControls[b.key].slider.value);
            });
            return state;
        };

        const syncCurrentGuiToParamsWidget = () => {
            const pW = node.widgets?.find(w => w.name === "params");
            if (pW) {
                pW.value = JSON.stringify(getCurrentGuiState());
            }
            updateLiveAudioGraph();
        };

        const updateAllGuiFromState = (data, keepSelectedPreset = false) => {
            if (!data) return;

            if (!keepSelectedPreset && data.preset !== undefined) {
                const optExists = Array.from(presetSelect.options).some(o => o.value === data.preset);
                if (optExists) {
                    presetSelect.value = data.preset;
                } else {
                    presetSelect.value = "New Preset";
                }
            }
            if (data.hours !== undefined) hInput.value = data.hours;
            if (data.minutes !== undefined) mInput.value = data.minutes;
            if (data.seconds !== undefined) sInput.value = Math.ceil(data.seconds);

            colorsDef.forEach(c => {
                if (data[c.key] !== undefined) {
                    const ctrl = colorControls[c.key];
                    if (ctrl) {
                        ctrl.slider.value = data[c.key];
                        ctrl.valLabel.textContent = `${Math.round(data[c.key] * 100)}%`;
                    }
                }
            });

            if (data.audio_input_vol !== undefined) {
                audioVolSlider.value = data.audio_input_vol;
                audioVolVal.textContent = `${Math.round(data.audio_input_vol * 100)}%`;
            }

            if (data.filter_type !== undefined) fTypeSelect.value = data.filter_type;
            if (data.cutoff_freq !== undefined) {
                fcSlider.value = data.cutoff_freq;
                updateFcVal(data.cutoff_freq);
            }
            if (data.resonance !== undefined) {
                resSlider.value = data.resonance;
                resVal.textContent = parseFloat(data.resonance).toFixed(1);
            }

            envDef.forEach(e => {
                if (data[e.key] !== undefined) {
                    const ctrl = envControls[e.key];
                    if (ctrl) {
                        ctrl.slider.value = data[e.key];
                        ctrl.valLabel.textContent = parseFloat(data[e.key]).toFixed(2);
                    }
                }
            });

            EQ_BANDS.forEach(b => {
                if (data[b.key] !== undefined) {
                    const ctrl = eqControls[b.key];
                    if (ctrl) {
                        ctrl.slider.value = data[b.key];
                        ctrl.updateEqVal(parseFloat(data[b.key]));
                    }
                }
            });

            if (data.volume !== undefined) {
                volSlider.value = data.volume;
                volVal.textContent = `${Math.round(data.volume * 100)}%`;
            }

            syncCurrentGuiToParamsWidget();
        };

        // Inspect connected audio OR video node to extract exact duration LIVE (rounded up to whole seconds)
        const inspectAndSetAudioDuration = async (originNode) => {
            if (!originNode) return;
            let detectedSec = 0;

            if (originNode.audio?.duration && !isNaN(originNode.audio.duration)) {
                detectedSec = originNode.audio.duration;
            } else if (originNode.video?.duration && !isNaN(originNode.video.duration)) {
                detectedSec = originNode.video.duration;
            } else if (originNode.audio_element?.duration && !isNaN(originNode.audio_element.duration)) {
                detectedSec = originNode.audio_element.duration;
            } else if (originNode.video_element?.duration && !isNaN(originNode.video_element.duration)) {
                detectedSec = originNode.video_element.duration;
            } else if (originNode.media_element?.duration && !isNaN(originNode.media_element.duration)) {
                detectedSec = originNode.media_element.duration;
            } else if (originNode.audio_duration) {
                detectedSec = originNode.audio_duration;
            } else if (originNode.video_duration) {
                detectedSec = originNode.video_duration;
            } else if (originNode.properties?.duration) {
                detectedSec = originNode.properties.duration;
            }

            if (!detectedSec && originNode.widgets) {
                const durW = originNode.widgets.find(w => w.name === "duration" || w.name === "seconds" || w.name === "length");
                if (durW && durW.value && !isNaN(parseFloat(durW.value))) {
                    detectedSec = parseFloat(durW.value);
                } else {
                    const fileW = originNode.widgets.find(w => 
                        w.name === "audio" || w.name === "video" || w.name === "file" || 
                        w.name === "filename" || w.name === "upload" || w.name === "video_path" || 
                        w.name === "audio_path" || w.name === "path" || w.name === "url"
                    );

                    if (fileW && fileW.value) {
                        let filename = "";
                        let subfolder = "";
                        let type = "input";

                        if (typeof fileW.value === "object" && fileW.value.filename) {
                            filename = fileW.value.filename;
                            subfolder = fileW.value.subfolder || "";
                            type = fileW.value.type || "input";
                        } else if (typeof fileW.value === "string") {
                            let str = fileW.value.trim();
                            if (str.includes("[output]")) {
                                type = "output";
                            }
                            filename = str.replace(/\s*\[(input|output)\]/g, "").trim();
                        }

                        if (filename && filename !== "none") {
                            const urlsToTry = [
                                `/view?filename=${encodeURIComponent(filename)}&type=${type}&subfolder=${encodeURIComponent(subfolder)}`,
                                `/api/view?filename=${encodeURIComponent(filename)}&type=${type}&subfolder=${encodeURIComponent(subfolder)}`,
                                `/input/${encodeURIComponent(filename)}`
                            ];

                            for (const url of urlsToTry) {
                                try {
                                    const resp = await fetch(url);
                                    if (resp.ok) {
                                        const blob = await resp.blob();
                                        const dur = await getMediaDurationFromBlob(blob);
                                        if (dur > 0) {
                                            detectedSec = dur;
                                            break;
                                        }
                                    }
                                } catch (e) {
                                    // continue
                                }
                            }
                        }
                    }
                }
            }

            if (detectedSec > 0) {
                const roundedSec = Math.ceil(detectedSec);
                const h = Math.floor(roundedSec / 3600);
                const m = Math.floor((roundedSec % 3600) / 60);
                const s = roundedSec % 60;
                node._updateDurationUI(h, m, s);
            }
        };

        // Live Audio/Video Check state tracking
        let lastInspectedKey = "";

        const checkConnectedAudioLive = async (originNode) => {
            if (!originNode) return;

            let audioKey = "";
            if (originNode.widgets) {
                const fileW = originNode.widgets.find(w => 
                    w.name === "audio" || w.name === "video" || w.name === "file" || 
                    w.name === "filename" || w.name === "upload" || w.name === "video_path" || 
                    w.name === "audio_path" || w.name === "path" || w.name === "url"
                );
                if (fileW) {
                    audioKey = typeof fileW.value === "object" ? JSON.stringify(fileW.value) : String(fileW.value);
                }
            }
            if (!audioKey && (originNode.audio?.src || originNode.video?.src)) {
                audioKey = originNode.audio?.src || originNode.video?.src;
            }

            if (audioKey && audioKey === lastInspectedKey) return;

            lastInspectedKey = audioKey || "connected";
            await inspectAndSetAudioDuration(originNode);
        };

        // Hook onDrawBackground to perform real-time LIVE detection whenever user connects or changes audio/video file
        const origOnDrawBackground = node.onDrawBackground;
        node.onDrawBackground = function (ctx) {
            if (origOnDrawBackground) origOnDrawBackground.apply(this, arguments);

            const linkId = node.inputs?.[0]?.link;
            if (linkId != null && app.graph) {
                const link = app.graph.links[linkId];
                if (link) {
                    const originNode = app.graph.getNodeById(link.origin_id);
                    if (originNode) {
                        checkConnectedAudioLive(originNode);
                    }
                }
            } else {
                if (lastInspectedKey !== "") {
                    lastInspectedKey = "";
                }
            }
        };

        // Auto Duration Detection on Audio/Video Connection Hook
        const origOnConnectionsChange = node.onConnectionsChange;
        node.onConnectionsChange = function (type, slot, isConnected, link_info) {
            if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);

            if (isConnected && type === 1 && link_info) {
                lastInspectedKey = "";
                const link = app.graph.links[link_info.id];
                if (link) {
                    const originNode = app.graph.getNodeById(link.origin_id);
                    if (originNode) {
                        checkConnectedAudioLive(originNode);
                    }
                }
            } else if (!isConnected && type === 1) {
                lastInspectedKey = "";
            }
        };

        // Header Listeners
        hInput.addEventListener("change", () => syncCurrentGuiToParamsWidget());
        mInput.addEventListener("change", () => syncCurrentGuiToParamsWidget());
        sInput.addEventListener("change", () => syncCurrentGuiToParamsWidget());

        presetSelect.addEventListener("change", () => {
            const val = presetSelect.value;
            if (val !== "New Preset" && userPresetsCache[val]) {
                updateAllGuiFromState(userPresetsCache[val], true);
            } else {
                syncCurrentGuiToParamsWidget();
            }
        });

        saveBtn.addEventListener("click", async () => {
            let currentVal = presetSelect.value;
            let targetName = "";

            if (currentVal === "New Preset") {
                const name = prompt("Enter a name for the new preset:");
                if (!name || !name.trim()) return;
                targetName = name.trim();
            } else {
                targetName = currentVal;
            }

            const presetData = getCurrentGuiState();
            try {
                const resp = await fetch("/dehypnotic/sonic_color/presets/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: targetName, data: presetData })
                });
                if (resp.ok) {
                    await refreshPresetOptions();
                    presetSelect.value = targetName;
                    syncCurrentGuiToParamsWidget();

                    // Visual feedback indicator on Save button
                    saveBtn.textContent = "✅ Saved!";
                    saveBtn.style.background = "#059669";
                    saveBtn.style.borderColor = "#047857";
                    setTimeout(() => {
                        saveBtn.textContent = "💾 Save";
                        saveBtn.style.background = "";
                        saveBtn.style.borderColor = "";
                    }, 1500);
                } else {
                    const err = await resp.json();
                    alert(`Failed to save preset: ${err.error || resp.statusText}`);
                }
            } catch (e) {
                console.error("[SonicColor] Save error:", e);
                alert(`Error saving preset: ${e}`);
            }
        });

        delBtn.addEventListener("click", async () => {
            const currentVal = presetSelect.value;
            if (currentVal === "New Preset" || !userPresetsCache[currentVal]) {
                alert("Select a saved preset to delete.");
                return;
            }

            if (!confirm(`Are you sure you want to delete preset "${currentVal}"?`)) return;

            try {
                const resp = await fetch("/dehypnotic/sonic_color/presets/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: currentVal })
                });
                if (resp.ok) {
                    await refreshPresetOptions();
                    presetSelect.value = "New Preset";
                    syncCurrentGuiToParamsWidget();
                } else {
                    const err = await resp.json();
                    alert(`Failed to delete preset: ${err.error || resp.statusText}`);
                }
            } catch (e) {
                console.error("[SonicColor] Delete error:", e);
                alert(`Error deleting preset: ${e}`);
            }
        });

        await refreshPresetOptions();

        // Initial sync of default state
        syncCurrentGuiToParamsWidget();

        // Block non-wheel mouse/pointer events from canvas dragging
        const blockEvents = ["mousedown", "mouseup", "click", "dblclick", "pointerdown", "pointerup", "pointermove"];
        blockEvents.forEach(evt => {
            root.addEventListener(evt, (e) => e.stopPropagation());
        });

        // Attach DOM Widget with adaptive sizing & floor locking
        const domWidget = node.addDOMWidget("sonic_color_gui", "custom_ui", root, {
            getValue: () => getCurrentGuiState(),
            setValue: (val) => updateAllGuiFromState(val),
            getMinHeight: () => WIDGET_MIN_H,
            margin: 4,
            serialize: false,
        });

        applyAdaptiveCanvasOnly(domWidget);
        installCanvasZoomPassthrough(root);
        node._dhSonicColorFloorOff = installResizeFloor(root, () => measureRootContent(root));

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function (info) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            const pW = node.widgets?.find(w => w.name === "params");
            if (pW) {
                pW.type = "hidden";
                pW.hidden = true;
                pW.computeSize = () => [0, -4];
                pW.draw = () => { };
                if (pW.value) {
                    try {
                        const restored = typeof pW.value === "string" ? JSON.parse(pW.value) : pW.value;
                        updateAllGuiFromState(restored);
                    } catch (e) { }
                }
            }
            if (node.size[0] < MIN_W) node.size[0] = DEFAULT_W;
            if (node.size[1] < MIN_H) node.size[1] = DEFAULT_H;
            fitNodeSizeToContent();
            node.setDirtyCanvas(true, true);
        };
    }
});
