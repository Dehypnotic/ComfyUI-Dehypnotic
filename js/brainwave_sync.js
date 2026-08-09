import { app } from "../../scripts/app.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough, installResizeFloor } from "./shared/index.mjs";

const PRESET_TYPE = "brainwave_sync";

const DEFAULT_POINTS = [
    { time: 0, hz: 1.0 },
    { time: 600, hz: 4.5 },
    { time: 1200, hz: 1.0 }
];

function formatTime(seconds) {
    if (seconds <= 0) return "0s";
    const ts = Math.round(seconds);
    const m = Math.floor(ts / 60);
    const s = ts % 60;
    if (m >= 60) {
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return `${h}h ${rm}m`;
    }
    if (m > 0) {
        return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
    }
    return `${s}s`;
}

function setupBrainwaveSyncNode(node) {
    if (node._brainwaveSyncInitialized) return;
    node._brainwaveSyncInitialized = true;

    // Find backend widgets
    const carrierWidget = node.widgets?.find(w => w.name === "carrier_hz");
    const modeWidget = node.widgets?.find(w => w.name === "beat_mode");
    const volumeWidget = node.widgets?.find(w => w.name === "volume");
    const pointsWidget = node.widgets?.find(w => w.name === "points_json");

    // Hide raw JSON points widget if present
    if (pointsWidget) {
        pointsWidget.type = "hidden";
        pointsWidget.computeSize = () => [0, -4];
        if (pointsWidget.element) pointsWidget.element.style.display = "none";
    }

    // State
    let points = JSON.parse(JSON.stringify(DEFAULT_POINTS));
    if (pointsWidget?.value) {
        try {
            const parsed = JSON.parse(pointsWidget.value);
            if (Array.isArray(parsed) && parsed.length > 0) {
                points = parsed;
            }
        } catch (e) { }
    }

    let durationSeconds = points[points.length - 1]?.time || 1200;
    let isMuted = false;
    let timeSnapSec = 60; // default 1 min
    let hzSnapVal = 0.5;  // default 0.5 Hz
    let selectedPointIdx = -1;
    let isDragging = false;
    let currentPresetName = "Custom session";

    // Dynamic getters from node widgets
    function getCarrierHz() {
        return carrierWidget ? (parseFloat(carrierWidget.value) || 200) : 200;
    }
    function getBeatMode() {
        return modeWidget ? (modeWidget.value || "Isochronic") : "Isochronic";
    }
    function getVolume() {
        return volumeWidget ? (parseFloat(volumeWidget.value) || 1.0) : 1.0;
    }

    // Web Audio Preview state
    let audioCtx = null;
    let isPlaying = false;
    let playStartTime = 0;
    let animFrameId = null;
    let audioGainNode = null;
    let oscLeft = null;
    let oscRight = null;
    let isochronicTimer = null;
    let pulseGainNode = null;
    let pannerL = null;
    let pannerR = null;

    // Build UI DOM Container
    const container = document.createElement("div");
    container.className = "dehypnotic-brainwave-sync-container";
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        width: 100%;
        box-sizing: border-box;
        font-family: system-ui, -apple-system, sans-serif;
        background: #11141d;
        color: #d1d5db;
        border-radius: 8px;
        padding: 6px;
        gap: 5px;
        user-select: none;
        overflow: hidden;
    `;

    // 1. Graph Canvas Container
    const canvasWrapper = document.createElement("div");
    canvasWrapper.style.cssText = `
        flex: 1 1 auto;
        width: 100%;
        min-height: 120px;
        position: relative;
        background: #0b0d13;
        border: 1px solid #1f293d;
        border-radius: 6px;
        overflow: hidden;
    `;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display: block; width: 100%; height: 100%; cursor: crosshair;";
    canvasWrapper.appendChild(canvas);
    container.appendChild(canvasWrapper);

    // Helper to push state changes to hidden widgets
    function syncWidgetValues() {
        if (pointsWidget) pointsWidget.value = JSON.stringify(points);
    }

    // 2. Graph Renderer
    function drawGraph() {
        const rect = canvasWrapper.getBoundingClientRect();
        const width = rect.width || 340;
        const height = rect.height || 140;

        if (canvas.width !== Math.floor(width) || canvas.height !== Math.floor(height)) {
            canvas.width = Math.floor(width);
            canvas.height = Math.floor(height);
        }

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, width, height);

        const paddingLeft = 36;
        const paddingRight = 16;
        const paddingTop = 16;
        const paddingBottom = 24;

        const graphW = width - paddingLeft - paddingRight;
        const graphH = height - paddingTop - paddingBottom;

        const maxHz = Math.max(20.0, ...points.map(p => p.hz)) * 1.05;
        const minHz = 0.0;

        // Scale helpers
        function tToX(t) {
            const ratio = durationSeconds > 0 ? t / durationSeconds : 0;
            return paddingLeft + Math.max(0, Math.min(1, ratio)) * graphW;
        }

        function hzToY(hz) {
            const ratio = (hz - minHz) / (maxHz - minHz);
            return paddingTop + (1.0 - Math.max(0, Math.min(1, ratio))) * graphH;
        }

        function xToT(x) {
            const ratio = (x - paddingLeft) / graphW;
            return Math.max(0, Math.min(durationSeconds, ratio * durationSeconds));
        }

        function yToHz(y) {
            const ratio = 1.0 - (y - paddingTop) / graphH;
            return Math.max(0.1, Math.min(maxHz, minHz + ratio * (maxHz - minHz)));
        }

        // Grid background
        ctx.strokeStyle = "#1a2336";
        ctx.lineWidth = 1;

        // Horizontal grid lines (Hz)
        const hzStep = maxHz > 30 ? 10 : 4;
        ctx.fillStyle = "#6b7280";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        for (let h = 0; h <= maxHz; h += hzStep) {
            const y = hzToY(h);
            ctx.beginPath();
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(width - paddingRight, y);
            ctx.stroke();

            ctx.fillText(`${h.toFixed(1)}Hz`, paddingLeft - 4, y);
        }

        // Vertical grid lines (Time) - Dynamic step based on canvas pixel width
        const targetCount = Math.max(3, Math.floor(graphW / 75));
        const rawStep = durationSeconds / targetCount;
        const niceSteps = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 43200, 86400];
        let timeStep = niceSteps[niceSteps.length - 1];
        for (const step of niceSteps) {
            if (step >= rawStep) {
                timeStep = step;
                break;
            }
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        for (let t = 0; t <= durationSeconds; t += timeStep) {
            const x = tToX(t);
            ctx.beginPath();
            ctx.moveTo(x, paddingTop);
            ctx.lineTo(x, height - paddingBottom);
            ctx.stroke();

            ctx.fillText(formatTime(t), x, height - paddingBottom + 4);
        }

        // Draw curve
        if (points.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2;

            points.sort((a, b) => a.time - b.time);

            points.forEach((p, idx) => {
                const x = tToX(p.time);
                const y = hzToY(p.hz);
                if (idx === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Fill gradient under curve
            const gradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
            gradient.addColorStop(0, "rgba(56, 189, 248, 0.25)");
            gradient.addColorStop(1, "rgba(56, 189, 248, 0.0)");

            ctx.lineTo(tToX(points[points.length - 1].time), height - paddingBottom);
            ctx.lineTo(tToX(points[0].time), height - paddingBottom);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            // Draw control points
            points.forEach((p, idx) => {
                const x = tToX(p.time);
                const y = hzToY(p.hz);
                const isSel = idx === selectedPointIdx;

                ctx.beginPath();
                ctx.arc(x, y, isSel ? 6 : 4, 0, 2 * Math.PI);
                ctx.fillStyle = isSel ? "#f43f5e" : "#0284c7";
                ctx.fill();
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Label above point
                ctx.fillStyle = isSel ? "#fb7185" : "#e0f2fe";
                ctx.font = isSel ? "bold 10px sans-serif" : "9px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                ctx.fillText(`${p.hz.toFixed(1)}Hz`, x, y - 6);
            });
        }

        // If playing, draw playhead line
        if (isPlaying && audioCtx) {
            const elapsed = audioCtx.currentTime - playStartTime;
            if (elapsed <= durationSeconds) {
                const px = tToX(elapsed);
                ctx.beginPath();
                ctx.strokeStyle = "#10b981";
                ctx.lineWidth = 2;
                ctx.moveTo(px, paddingTop);
                ctx.lineTo(px, height - paddingBottom);
                ctx.stroke();
            } else {
                stopAudioPreview();
            }
        }

        // Expose transformation helpers for mouse events
        canvas._xToT = xToT;
        canvas._yToHz = yToHz;
        canvas._tToX = tToX;
        canvas._hzToY = hzToY;
    }

    // Canvas Interaction Handlers
    canvas.addEventListener("mousedown", (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Check hit on existing points
        let foundIdx = -1;
        points.forEach((p, idx) => {
            const px = canvas._tToX(p.time);
            const py = canvas._hzToY(p.hz);
            const dist = Math.hypot(mx - px, my - py);
            if (dist < 10) foundIdx = idx;
        });

        if (e.button === 2 || e.shiftKey && e.button === 0) {
            // Right click or Shift+click
            if (foundIdx > 0 && foundIdx < points.length - 1) {
                // Delete middle point
                points.splice(foundIdx, 1);
                selectedPointIdx = -1;
                syncWidgetValues();
                drawGraph();
            }
            e.preventDefault();
            return;
        }

        if (foundIdx !== -1) {
            selectedPointIdx = foundIdx;
            isDragging = true;
            drawGraph();
        } else if (e.button === 0) {
            // Click empty area -> Add new point
            let clickT = canvas._xToT(mx);
            let clickHz = canvas._yToHz(my);

            if (timeSnapSec > 0) clickT = Math.round(clickT / timeSnapSec) * timeSnapSec;
            if (hzSnapVal > 0) clickHz = Math.round(clickHz / hzSnapVal) * hzSnapVal;

            points.push({ time: clickT, hz: clickHz });
            points.sort((a, b) => a.time - b.time);
            selectedPointIdx = points.findIndex(p => p.time === clickT && p.hz === clickHz);
            isDragging = true;
            syncWidgetValues();
            drawGraph();
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDragging || selectedPointIdx === -1) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        let newT = canvas._xToT(mx);
        let newHz = canvas._yToHz(my);

        if (timeSnapSec > 0) newT = Math.round(newT / timeSnapSec) * timeSnapSec;
        if (hzSnapVal > 0) newHz = Math.round(newHz / hzSnapVal) * hzSnapVal;

        // Clamp first point time to 0, last point time to total duration
        if (selectedPointIdx === 0) {
            newT = 0;
        } else if (selectedPointIdx === points.length - 1) {
            newT = durationSeconds;
        } else {
            const minT = points[selectedPointIdx - 1].time + 1;
            const maxT = points[selectedPointIdx + 1].time - 1;
            newT = Math.max(minT, Math.min(maxT, newT));
        }

        points[selectedPointIdx].time = newT;
        points[selectedPointIdx].hz = newHz;

        syncWidgetValues();
        drawGraph();
    });

    window.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            syncWidgetValues();
            drawGraph();
        }
    });

    canvas.addEventListener("contextmenu", e => e.preventDefault());

    // 3. Compact Control Toolbar Container
    const controlsWrapper = document.createElement("div");
    controlsWrapper.style.cssText = `
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
    `;

    function createInputStyle(el) {
        el.style.cssText = `
            background: #1e293b;
            color: #f1f5f9;
            border: 1px solid #334155;
            border-radius: 4px;
            padding: 2px 4px;
            font-size: 11px;
            outline: none;
        `;
    }

    function createBtnStyle(btn, bg = "#3b82f6") {
        btn.style.cssText = `
            background: ${bg};
            color: #ffffff;
            border: none;
            border-radius: 4px;
            padding: 2px 7px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.15s;
        `;
        btn.onmouseenter = () => btn.style.opacity = "0.85";
        btn.onmouseleave = () => btn.style.opacity = "1.0";
    }

    // Row 1: Snap Dropdowns | Play & Mute Controls | Hours & Minutes Duration
    const row1 = document.createElement("div");
    row1.style.cssText = "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;";

    // Snap Box
    const snapBox = document.createElement("div");
    snapBox.style.cssText = "display: flex; align-items: center; gap: 3px;";
    snapBox.innerHTML = `<span style="color:#94a3b8; font-size:10px;">Snap:</span>`;

    const timeSnapSelect = document.createElement("select");
    createInputStyle(timeSnapSelect);
    timeSnapSelect.innerHTML = `
        <option value="0">Off</option>
        <option value="10">10s</option>
        <option value="30">30s</option>
        <option value="60" selected>1m</option>
        <option value="300">5m</option>
    `;
    timeSnapSelect.onchange = () => timeSnapSec = parseFloat(timeSnapSelect.value);
    snapBox.appendChild(timeSnapSelect);

    const hzSnapSelect = document.createElement("select");
    createInputStyle(hzSnapSelect);
    hzSnapSelect.innerHTML = `
        <option value="0">Hz: Off</option>
        <option value="0.1">0.1</option>
        <option value="0.5" selected>0.5</option>
        <option value="1.0">1.0</option>
    `;
    hzSnapSelect.onchange = () => hzSnapVal = parseFloat(hzSnapSelect.value);
    snapBox.appendChild(hzSnapSelect);
    row1.appendChild(snapBox);

    // Play & Mute Box
    const audioBox = document.createElement("div");
    audioBox.style.cssText = "display: flex; align-items: center; gap: 3px;";

    const btnPlay = document.createElement("button");
    btnPlay.textContent = "▶ Play";
    createBtnStyle(btnPlay, "#10b981");

    const muteBtn = document.createElement("button");
    muteBtn.textContent = "🔊";
    createBtnStyle(muteBtn, "#475569");

    function getBeatAtTime(t) {
        if (points.length === 0) return 4.0;
        if (t <= 0) return points[0].hz;
        if (t >= points[points.length - 1].time) return points[points.length - 1].hz;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (t >= p1.time && t <= p2.time) {
                const dt = p2.time - p1.time;
                if (dt <= 0) return p1.hz;
                const k = (t - p1.time) / dt;
                return p1.hz + (p2.hz - p1.hz) * k;
            }
        }
        return points[points.length - 1].hz;
    }

    function startAudioPreview() {
        if (isPlaying) stopAudioPreview();

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        playStartTime = audioCtx.currentTime;
        isPlaying = true;
        btnPlay.textContent = "⏹ Stop";
        btnPlay.style.background = "#ef4444";

        const carrierHz = getCarrierHz();
        const beatMode = getBeatMode();
        const vol = getVolume();
        const targetGain = isMuted ? 0.0001 : Math.max(0.0001, vol);

        audioGainNode = audioCtx.createGain();
        audioGainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        audioGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);
        audioGainNode.connect(audioCtx.destination);

        if (beatMode === "Isochronic") {
            oscLeft = audioCtx.createOscillator();
            oscLeft.type = "sine";
            oscLeft.frequency.setValueAtTime(carrierHz, audioCtx.currentTime);

            pulseGainNode = audioCtx.createGain();
            pulseGainNode.gain.setValueAtTime(0, audioCtx.currentTime);

            oscLeft.connect(pulseGainNode);
            pulseGainNode.connect(audioGainNode);
            oscLeft.start();

            const scheduleAheadTime = 0.2;
            let nextPulseTime = audioCtx.currentTime;

            function schedulePulses() {
                if (!isPlaying || !audioCtx) return;
                const now = audioCtx.currentTime;
                const t0 = playStartTime;

                while (nextPulseTime < now + scheduleAheadTime) {
                    const currentElapsed = nextPulseTime - t0;
                    if (currentElapsed > durationSeconds) {
                        stopAudioPreview();
                        return;
                    }

                    const beatHz = getBeatAtTime(currentElapsed);
                    if (beatHz <= 0) {
                        nextPulseTime += 0.5;
                        continue;
                    }

                    const period = 1.0 / beatHz;
                    const pulseDuration = period / 2.0;
                    const peakTime = nextPulseTime + pulseDuration / 2.0;
                    const endTime = nextPulseTime + pulseDuration;

                    const gain = pulseGainNode.gain;
                    gain.setValueAtTime(0, nextPulseTime);
                    gain.linearRampToValueAtTime(1, peakTime);
                    gain.linearRampToValueAtTime(0, endTime);

                    nextPulseTime += period;
                }

                isochronicTimer = setTimeout(schedulePulses, 50);
            }
            schedulePulses();

        } else { // Binaural mode
            oscLeft = audioCtx.createOscillator();
            oscRight = audioCtx.createOscillator();

            oscLeft.type = "sine";
            oscRight.type = "sine";

            const startBeat = getBeatAtTime(0);
            oscLeft.frequency.setValueAtTime(carrierHz, audioCtx.currentTime);
            oscRight.frequency.setValueAtTime(carrierHz + startBeat, audioCtx.currentTime);

            if (audioCtx.createStereoPanner) {
                pannerL = audioCtx.createStereoPanner();
                pannerR = audioCtx.createStereoPanner();
                pannerL.pan.value = -1;
                pannerR.pan.value = 1;

                oscLeft.connect(pannerL).connect(audioGainNode);
                oscRight.connect(pannerR).connect(audioGainNode);
            } else {
                const merger = audioCtx.createChannelMerger(2);
                oscLeft.connect(merger, 0, 0);
                oscRight.connect(merger, 0, 1);
                merger.connect(audioGainNode);
            }

            oscLeft.start();
            oscRight.start();

            function scheduleBinauralUpdates() {
                if (!isPlaying || !audioCtx) return;
                const elapsed = audioCtx.currentTime - playStartTime;
                if (elapsed > durationSeconds) {
                    stopAudioPreview();
                    return;
                }

                const beatHz = getBeatAtTime(elapsed);
                const cHz = getCarrierHz();
                const newFreq = cHz + beatHz;

                if (oscRight) {
                    oscRight.frequency.linearRampToValueAtTime(newFreq, audioCtx.currentTime + 0.1);
                }

                isochronicTimer = setTimeout(scheduleBinauralUpdates, 50);
            }
            scheduleBinauralUpdates();
        }

        function renderLoop() {
            if (isPlaying) {
                drawGraph();
                animFrameId = requestAnimationFrame(renderLoop);
            }
        }
        renderLoop();
    }

    function stopAudioPreview() {
        if (!isPlaying) return;
        isPlaying = false;
        btnPlay.textContent = "▶ Play";
        btnPlay.style.background = "#10b981";

        if (isochronicTimer) clearTimeout(isochronicTimer);
        if (animFrameId) cancelAnimationFrame(animFrameId);

        if (audioGainNode && audioCtx) {
            const now = audioCtx.currentTime;
            try {
                if (pulseGainNode) pulseGainNode.gain.cancelScheduledValues(now);
                audioGainNode.gain.setTargetAtTime(0.0001, now, 0.05);
            } catch (e) { }
        }

        const activeCtx = audioCtx;
        const activeNodes = [oscLeft, oscRight, pannerL, pannerR, pulseGainNode, audioGainNode];

        oscLeft = null;
        oscRight = null;
        pannerL = null;
        pannerR = null;
        pulseGainNode = null;
        audioGainNode = null;
        audioCtx = null;

        setTimeout(() => {
            activeNodes.forEach(n => { try { n?.stop?.(); n?.disconnect?.(); } catch (e) { } });
            try { activeCtx?.close?.(); } catch (e) { }
        }, 200);

        drawGraph();
    }

    btnPlay.onclick = () => {
        if (isPlaying) stopAudioPreview();
        else startAudioPreview();
    };

    muteBtn.onclick = () => {
        isMuted = !isMuted;
        muteBtn.textContent = isMuted ? "🔇" : "🔊";
        if (audioGainNode && audioCtx) {
            const targetGain = isMuted ? 0.0001 : Math.max(0.0001, getVolume());
            audioGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);
        }
    };

    audioBox.appendChild(btnPlay);
    audioBox.appendChild(muteBtn);
    row1.appendChild(audioBox);

    // Duration Box (hh:mm inputs)
    const durBox = document.createElement("div");
    durBox.style.cssText = "display: flex; align-items: center; gap: 2px;";
    durBox.innerHTML = `<span style="color:#94a3b8; font-size:10px;">Dur:</span>`;

    const durHoursInput = document.createElement("input");
    durHoursInput.type = "number";
    durHoursInput.min = "0";
    durHoursInput.max = "99";
    durHoursInput.style.cssText = "width: 24px; text-align: center;";
    createInputStyle(durHoursInput);

    const durMinsInput = document.createElement("input");
    durMinsInput.type = "number";
    durMinsInput.min = "0";
    durMinsInput.max = "59";
    durMinsInput.style.cssText = "width: 24px; text-align: center;";
    createInputStyle(durMinsInput);

    function updateDurationFromInputs() {
        const h = Math.max(0, parseInt(durHoursInput.value) || 0);
        const m = Math.max(0, parseInt(durMinsInput.value) || 0);
        const newTotalSec = Math.max(10, (h * 3600) + (m * 60));

        if (points.length > 0) {
            const oldTotalSec = durationSeconds || newTotalSec;
            const ratio = newTotalSec / oldTotalSec;
            points.forEach((p, idx) => {
                if (idx === 0) p.time = 0;
                else p.time = Math.round(p.time * ratio);
            });
            points[points.length - 1].time = newTotalSec;
        }

        durationSeconds = newTotalSec;
        syncWidgetValues();
        drawGraph();
    }

    function setDurationInputsFromSec(sec) {
        const totalMins = Math.floor(sec / 60);
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        durHoursInput.value = h.toString();
        durMinsInput.value = m.toString();
    }

    setDurationInputsFromSec(durationSeconds);

    durHoursInput.onchange = updateDurationFromInputs;
    durMinsInput.onchange = updateDurationFromInputs;

    durBox.appendChild(durHoursInput);
    durBox.insertAdjacentHTML("beforeend", `<span style="color:#94a3b8; font-size:10px;">h</span>`);
    durBox.appendChild(durMinsInput);
    durBox.insertAdjacentHTML("beforeend", `<span style="color:#94a3b8; font-size:10px;">m</span>`);
    row1.appendChild(durBox);

    controlsWrapper.appendChild(row1);

    // Row 2: Preset Manager
    const row2 = document.createElement("div");
    row2.style.cssText = "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;";

    const presetSelect = document.createElement("select");
    createInputStyle(presetSelect);
    presetSelect.style.flex = "1 1 120px";

    async function loadPresetList() {
        try {
            const resp = await fetch("/dehypnotic/user_text/list?type=brainwave_sync");
            if (!resp.ok) return;
            const files = await resp.json();
            presetSelect.innerHTML = `<option value="">-- Load Preset --</option>`;
            files.forEach(f => {
                const opt = document.createElement("option");
                opt.value = f.name;
                opt.textContent = f.name;
                if (f.name === currentPresetName) opt.selected = true;
                presetSelect.appendChild(opt);
            });
        } catch (e) { }
    }

    presetSelect.onchange = async () => {
        const selected = presetSelect.value;
        if (!selected) return;
        try {
            const resp = await fetch(`/dehypnotic/user_text/load?type=brainwave_sync&filename=${encodeURIComponent(selected)}`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (data) {
                currentPresetName = selected;
                if (data.durationSeconds) {
                    durationSeconds = data.durationSeconds;
                    setDurationInputsFromSec(durationSeconds);
                }
                if (Array.isArray(data.points) && data.points.length > 0) {
                    points = data.points;
                    durationSeconds = points[points.length - 1].time;
                    setDurationInputsFromSec(durationSeconds);
                }
                syncWidgetValues();
                drawGraph();
            }
        } catch (e) { }
    };

    const presetBtnBox = document.createElement("div");
    presetBtnBox.style.cssText = "display: flex; align-items: center; gap: 3px;";

    const btnSave = document.createElement("button");
    btnSave.textContent = "Save";
    createBtnStyle(btnSave, "#059669");
    btnSave.onclick = async () => {
        const name = prompt("Enter preset name:", currentPresetName) || "";
        if (!name.trim()) return;
        currentPresetName = name.trim();
        const presetObj = {
            name: currentPresetName,
            durationSeconds,
            points
        };
        try {
            await fetch("/dehypnotic/user_text/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "brainwave_sync", filename: currentPresetName, content: presetObj })
            });
            loadPresetList();
            syncWidgetValues();
        } catch (e) { }
    };

    const btnDelete = document.createElement("button");
    btnDelete.textContent = "Delete";
    createBtnStyle(btnDelete, "#dc2626");
    btnDelete.onclick = async () => {
        if (!currentPresetName || !confirm(`Delete preset "${currentPresetName}"?`)) return;
        try {
            await fetch("/dehypnotic/user_text/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "brainwave_sync", filename: currentPresetName })
            });
            currentPresetName = "Custom session";
            loadPresetList();
            syncWidgetValues();
        } catch (e) { }
    };

    presetBtnBox.appendChild(btnSave);
    presetBtnBox.appendChild(btnDelete);

    row2.appendChild(presetSelect);
    row2.appendChild(presetBtnBox);
    controlsWrapper.appendChild(row2);

    container.appendChild(controlsWrapper);

    const MIN_W = 400;
    const MIN_H = 360;
    const DEFAULT_W = 440;
    const DEFAULT_H = 390;
    const DOM_MIN_H = 215;

    // Dynamically update container height based on node size
    function updateDOMHeight() {
        let topWidgetsH = 0;
        for (const w of (node.widgets || [])) {
            if (w && w.name !== "brainwave_sync_ui" && w.type !== "hidden" && !w.hidden) {
                topWidgetsH += LiteGraph.NODE_WIDGET_HEIGHT || 24;
            }
        }
        const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
        const currentH = node.size ? node.size[1] : DEFAULT_H;
        const targetDOMH = Math.max(DOM_MIN_H, currentH - topWidgetsH - titleH - 24);

        container.style.height = targetDOMH + "px";
        if (widget && widget.element) {
            widget.element.style.height = targetDOMH + "px";
        }
    }

    // Mount DOM widget using Pixaroma pattern
    const widget = node.addDOMWidget("brainwave_sync_ui", "custom", container, {
        getMinHeight: () => DOM_MIN_H,
        margin: 6,
        serialize: false
    });

    widget.computeSize = (width) => [width || MIN_W, DOM_MIN_H];

    applyAdaptiveCanvasOnly(widget);
    installCanvasZoomPassthrough(container);
    installResizeFloor(container, () => DOM_MIN_H);

    // Initial node sizing
    if (!node.size || node.size[0] < MIN_W || node.size[1] < MIN_H) {
        node.size = [DEFAULT_W, DEFAULT_H];
    }
    if (node.setSize) {
        node.setSize(node.size);
    }
    updateDOMHeight();

    // Auto-redraw canvas whenever canvasWrapper size changes
    const resizeObserver = new ResizeObserver(() => {
        drawGraph();
    });
    resizeObserver.observe(canvasWrapper);

    // Size clamping for classic LiteGraph
    const origOnResize = node.onResize;
    node.onResize = function (size) {
        if (origOnResize) origOnResize.apply(this, arguments);
        if (size[0] < MIN_W) size[0] = MIN_W;
        if (size[1] < MIN_H) size[1] = MIN_H;
        updateDOMHeight();
        drawGraph();
    };

    const origOnDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function () {
        if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
        if (node.size[0] < MIN_W) node.size[0] = MIN_W;
        if (node.size[1] < MIN_H) node.size[1] = MIN_H;
    };

    const origOnConfigure = node.onConfigure;
    node.onConfigure = function () {
        if (origOnConfigure) origOnConfigure.apply(this, arguments);
        if (pointsWidget) {
            pointsWidget.type = "hidden";
            pointsWidget.computeSize = () => [0, -4];
            if (pointsWidget.element) pointsWidget.element.style.display = "none";
        }
        updateDOMHeight();
        drawGraph();
    };

    loadPresetList();
    setTimeout(() => {
        updateDOMHeight();
        drawGraph();
    }, 50);
}

app.registerExtension({
    name: "Dehypnotic.BrainwaveSync",
    nodeCreated(node) {
        if (node.comfyClass === "BrainwaveSync" || node.type === "BrainwaveSync") {
            setupBrainwaveSyncNode(node);
        }
    }
});
