import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

function injectCSS() {
  if (document.getElementById("ara-v2-css")) return;
  const css = `
    .ara-v2-root {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: 10px;
      background: #1c1c1c;
      border-radius: 6px;
      color: #e0e0e0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    /* 2x2 Grid of tabs */
    .ara-v2-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 4px;
    }
    
    .ara-v2-tab-btn {
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 4px;
      padding: 5px;
      color: #a1a1aa;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
    }
    
    .ara-v2-tab-btn:hover {
      border-color: #52525b;
      color: #f4f4f5;
    }
    
    .ara-v2-tab-btn.active {
      background: #059669;
      color: #ffffff;
      border-color: #059669;
      box-shadow: 0 0 10px rgba(5, 150, 105, 0.35);
    }
    
    /* Content wrapper */
    .ara-v2-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
    }
    
    /* Grid for presets: 6-col lets us mix span 2 (1/3 width) and span 3 (1/2 width) */
    .ara-v2-presets-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 5px;
    }
    
    .ara-v2-preset-chip {
      grid-column: span 2;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 4px;
      padding: 4px 2px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s, border-color 0.1s, color 0.1s;
    }
    
    .ara-v2-preset-chip:hover {
      border-color: #52525b;
    }
    
    .ara-v2-preset-chip.active {
      background: rgba(16, 185, 129, 0.12);
      border-color: #10b981;
      color: #10b981;
    }
    
    .ara-v2-preset-chip.span-half {
      grid-column: span 3;
    }
    
    .ara-v2-chip-ratio {
      font-size: 10px;
      font-weight: 700;
      color: #e4e4e7;
      line-height: 1.2;
    }
    
    .ara-v2-preset-chip.active .ara-v2-chip-ratio {
      color: #34d399;
    }
    
    .ara-v2-chip-desc {
      font-size: 8px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      margin-top: 1px;
    }
    
    .ara-v2-preset-chip.active .ara-v2-chip-desc {
      color: #059669;
    }
    
    /* Rows & Grid layouts */
    .ara-v2-calc-modes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
    }
    
    .ara-v2-mode-btn {
      background: #2d2d31;
      border: 1px solid #444449;
      border-radius: 4px;
      padding: 4px;
      font-size: 9px;
      font-weight: 600;
      color: #a1a1aa;
      text-align: center;
      cursor: pointer;
      text-transform: uppercase;
      transition: background 0.1s, border-color 0.1s;
    }
    
    .ara-v2-mode-btn:hover {
      border-color: #52525b;
      color: #f4f4f5;
    }
    
    .ara-v2-mode-btn.active {
      background: rgba(16, 185, 129, 0.12);
      border-color: #10b981;
      color: #34d399;
    }

    .ara-v2-custom-preset-btn {
      background: #1f1f22;
      border: 1px solid #333337;
      border-radius: 4px;
      padding: 4px;
      font-size: 9px;
      font-weight: 600;
      color: #a1a1aa;
      text-align: center;
      cursor: pointer;
      text-transform: uppercase;
      transition: background 0.1s, border-color 0.1s;
    }

    .ara-v2-custom-preset-btn:hover {
      border-color: #444449;
      color: #f4f4f5;
    }

    .ara-v2-custom-preset-btn.active {
      background: rgba(16, 185, 129, 0.12);
      border-color: #10b981;
      color: #34d399;
      box-shadow: 0 0 4px rgba(16, 185, 129, 0.2);
    }
    
    /* Flex inputs */
    .ara-v2-field {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1;
    }
    
    .ara-v2-label {
      font-size: 8px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .ara-v2-input {
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 4px;
      padding: 3px 6px;
      color: #10b981;
      font-size: 11px;
      font-weight: 600;
      text-align: center;
      box-sizing: border-box;
      width: 100%;
    }
    
    .ara-v2-input:focus {
      outline: none;
      border-color: #10b981;
    }
    
    .ara-v2-input:disabled {
      background: #18181b;
      color: #52525b;
      border-color: #27272a;
      cursor: not-allowed;
    }
    
    .ara-v2-spinner-wrapper {
      display: flex;
      align-items: center;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 4px;
      width: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }
    
    .ara-v2-spinner-wrapper:focus-within {
      border-color: #10b981;
    }
    
    .ara-v2-spinner-wrapper.disabled {
      background: #18181b;
      border-color: #27272a;
      cursor: not-allowed;
    }
    
    .ara-v2-spinner-btn {
      background: transparent;
      border: none;
      color: #a1a1aa;
      font-size: 13px;
      font-weight: bold;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s, color 0.1s;
      padding: 0;
    }
    
    .ara-v2-spinner-btn:hover {
      background: #3f3f46;
      color: #f4f4f5;
    }
    
    .ara-v2-spinner-btn:active {
      background: #52525b;
    }
    
    .ara-v2-spinner-wrapper.disabled .ara-v2-spinner-btn {
      color: #52525b;
      cursor: not-allowed;
      background: transparent;
    }
    
    .ara-v2-spinner-input {
      border: none !important;
      background: transparent !important;
      padding: 3px 0 !important;
      flex: 1;
      min-width: 0;
    }
    
    .ara-v2-snap-info-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      width: 100%;
      margin-bottom: 2px;
    }
    
    .ara-v2-inline-info {
      font-size: 14px;
      color: #a1a1aa;
      font-weight: 600;
      margin-bottom: 2px;
      text-align: right;
      align-self: flex-end;
      flex: 1;
    }
    
    .ara-v2-inline-info .accent {
      color: #34d399;
      font-weight: 600;
    }
    
    .ara-v2-width-height-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
    }

    .ara-v2-select {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 3px;
      color: #a1a1aa;
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 1px 4px;
      cursor: pointer;
      outline: none;
      width: fit-content;
      align-self: center;
      margin-bottom: 2px;
    }
    .ara-v2-select:hover {
      border-color: #3f3f46;
      color: #f4f4f5;
    }

    /* Snap & Value Row */
    .ara-v2-val-snap-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }
    
    .ara-v2-snap-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    
    .ara-v2-snap-btns {
      display: flex;
      gap: 2px;
    }
    
    .ara-v2-snap-btn {
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 3px;
      color: #a1a1aa;
      font-size: 9px;
      font-weight: 600;
      padding: 3px 5px;
      min-width: 18px;
      cursor: pointer;
      text-align: center;
    }
    
    .ara-v2-snap-btn:hover {
      border-color: #52525b;
      color: #f4f4f5;
    }
    
    .ara-v2-snap-btn.active {
      background: #10b981;
      color: #ffffff;
      border-color: #10b981;
    }
    
    /* Preview box */
    .ara-v2-preview {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-height: 0;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 4px;
      padding: 6px;
    }
    
    .ara-v2-preview-rect {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid #10b981;
      border-radius: 2px;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.15);
      transition: width 0.18s cubic-bezier(0.4, 0, 0.2, 1), height 0.18s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .ara-v2-preview-label {
      font-size: 10px;
      color: #a1a1aa;
    }
    
    .ara-v2-preview-label .accent {
      color: #34d399;
      font-weight: 600;
    }
    
    .ara-v2-preview-info {
      font-size: 8px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    
    .ara-v2-preview-info .accent {
      color: #10b981;
    }
    
    /* Custom Ratio / Dimensions elements */
    .ara-v2-ratio-header-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .ara-v2-ratio-inputs {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
    }
    
    .ara-v2-ratio-input {
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 4px;
      padding: 3px;
      color: #10b981;
      font-size: 11px;
      font-weight: 600;
      text-align: center;
      width: 32px;
    }
    
    .ara-v2-ratio-input:focus {
      outline: none;
      border-color: #10b981;
    }
    
    .ara-v2-ratio-input:disabled {
      background: #18181b;
      color: #52525b;
      border-color: #27272a;
    }
    
    /* Swap button */
    .ara-v2-swap-btn {
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 4px;
      color: #a1a1aa;
      cursor: pointer;
      font-size: 12px;
      padding: 2px 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.1s, border-color 0.1s, color 0.1s;
    }
    
    .ara-v2-swap-btn:hover {
      border-color: #52525b;
      color: #f4f4f5;
    }
    
    /* Custom iOS style toggle switch */
    .ara-v2-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 2px 0;
    }
    
    .ara-v2-toggle-container {
      display: flex;
      align-items: center;
      cursor: pointer;
      font-size: 10px;
      color: #a1a1aa;
      user-select: none;
      gap: 6px;
    }
    
    .ara-v2-toggle-switch {
      position: relative;
      width: 28px;
      height: 16px;
      background-color: #3f3f46;
      border-radius: 8px;
      transition: background-color 0.2s;
    }
    
    .ara-v2-toggle-switch::after {
      content: "";
      position: absolute;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: #ffffff;
      top: 2px;
      left: 2px;
      transition: transform 0.2s;
    }
    
    .ara-v2-toggle-input {
      display: none;
    }
    
    .ara-v2-toggle-input:checked + .ara-v2-toggle-switch {
      background-color: #10b981;
    }
    
    .ara-v2-toggle-input:checked + .ara-v2-toggle-switch::after {
      transform: translateX(12px);
    }
    
    /* Quick picks for width */
    .ara-v2-quickpicks {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
    }
    
    .ara-v2-quickpick-btn {
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 3px;
      color: #a1a1aa;
      padding: 4px 0;
      font-size: 9px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      transition: background 0.1s, border-color 0.1s, color 0.1s;
    }
    
    .ara-v2-quickpick-btn:hover {
      border-color: #52525b;
      color: #f4f4f5;
    }
    
    .ara-v2-quickpick-btn.active {
      background: #10b981;
      color: #ffffff;
      border-color: #10b981;
    }
    
    .ara-v2-dimensions-inputs {
      display: flex;
      align-items: flex-end;
      gap: 6px;
    }
    
    /* Custom Dimensions layout */
    .ara-v2-custom-dims-row {
      display: flex;
      align-items: flex-end;
      gap: 6px;
    }
    
    /* Scale Image tab layout */
    .ara-v2-scale-panel {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 6px 0;
    }
    
    .ara-v2-scale-algorithms {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
    }
    
    .ara-v2-scale-alg-btn {
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 4px;
      padding: 6px;
      text-align: center;
      font-size: 10px;
      font-weight: 600;
      color: #a1a1aa;
      cursor: pointer;
      text-transform: uppercase;
      transition: background 0.1s, border-color 0.1s, color 0.1s;
    }
    
    .ara-v2-scale-alg-btn:hover {
      border-color: #52525b;
      color: #f4f4f5;
    }
    
    .ara-v2-scale-alg-btn.active {
      background: rgba(16, 185, 129, 0.12);
      border-color: #10b981;
      color: #34d399;
      box-shadow: 0 0 4px rgba(16, 185, 129, 0.2);
    }
    
    .ara-v2-scale-alg-btn.span-full {
      grid-column: span 2;
    }
    
    .ara-v2-info-banner {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 4px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    
    .ara-v2-info-title {
      font-size: 7.5px;
      color: #a1a1aa;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: center;
    }
    
    .ara-v2-info-value {
      font-size: 12px;
      color: #e4e4e7;
      font-weight: 700;
      text-align: center;
    }
    
    .ara-v2-info-value .accent {
      color: #34d399;
    }
  `;

  const style = document.createElement("style");
  style.id = "ara-v2-css";
  style.textContent = css;
  document.head.appendChild(style);
}
injectCSS();

const NODE_W = 260;
const NODE_H = 480;
const STATE_PROP = "resolutionState";
const HIDDEN_INPUT_NAME = "ResolutionState";

const DEFAULT_STATE = {
  mode: "preset",
  ratio: "1:1 square",
  preset_calc_mode: "min",
  preset_value: 1024,
  snap: 16,

  preset_value_min: 1024,
  preset_value_max: 1024,
  preset_value_megapixels: 1.0,

  custom_preset_1: "16:9",
  custom_preset_2: "3:2",
  custom_preset_3: "1:1",

  custom_ratio_w: 4,
  custom_ratio_h: 3,
  custom_ratio_input_image: false,
  custom_ratio_master: "width",
  custom_ratio_width: 1024,
  custom_ratio_height: 768,
  custom_ratio_calc_mode: "min",
  custom_ratio_value: 1024,
  custom_ratio_value_min: 1024,
  custom_ratio_value_max: 1024,
  custom_ratio_value_megapixels: 1.0,

  custom_dimensions_width: 1024,
  custom_dimensions_height: 1024,

  scale_image_enabled: false,
  scale_image_method: "auto",
  vae_encode_enabled: false,

  width: 1024,
  height: 1024
};

const PRESET_RATIOS = [
  { id: "1:1 square", ratio: "1:1", desc: "square" },
  { id: "4:3 standard", ratio: "4:3", desc: "standard" },
  { id: "3:2 classic", ratio: "3:2", desc: "classic" },
  { id: "16:9 widescreen", ratio: "16:9", desc: "widescreen" },
  { id: "21:9 ultrawide", ratio: "21:9", desc: "ultrawide" },
  { id: "3:4 portrait", ratio: "3:4", desc: "portrait" },
  { id: "2:3 photo", ratio: "2:3", desc: "photo" },
  { id: "9:16 mobile", ratio: "9:16", desc: "mobile" },
  { id: "9:21 vertical", ratio: "9:21", desc: "vertical" }
];

const SNAP_OPTIONS = [8, 16, 32, 64];
const QUICK_PICK_WIDTHS = [512, 768, 1024, 1536, 2048];
const SCALE_ALGORITHMS = ["auto", "nearest exact", "bilinear", "area", "bicubic", "lanczos"];

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}

function ratioLabel(w, h) {
  const g = gcd(w, h);
  const rw = w / g, rh = h / g;
  const known = ["1:1", "16:9", "9:16", "2:1", "1:2", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "21:9", "9:21", "5:7", "7:5"];
  const simple = `${rw}:${rh}`;
  if (known.includes(simple)) return simple;
  const r = w / h;
  return r >= 1 ? `~${r.toFixed(2)}:1` : `~1:${(1 / r).toFixed(2)}`;
}

function megapixels(w, h) {
  return ((w * h) / 1000000).toFixed(1);
}

function getRatioName(w, h) {
  if (!w || !h) return "unknown";
  const r = w / h;
  
  const knownRatios = [
    { name: "square", r: 1.0 },
    { name: "standard", r: 4/3 },
    { name: "portrait", r: 3/4 },
    { name: "classic", r: 3/2 },
    { name: "photo", r: 2/3 },
    { name: "widescreen", r: 16/9 },
    { name: "mobile", r: 9/16 },
    { name: "ultrawide", r: 21/9 },
    { name: "vertical", r: 9/21 },
    { name: "widescreen", r: 16/10 },
    { name: "portrait", r: 10/16 },
    { name: "art", r: 5/4 },
    { name: "art portrait", r: 4/5 },
    { name: "photo portrait", r: 5/7 },
    { name: "photo landscape", r: 7/5 },
    { name: "panoramic", r: 2.0 },
    { name: "long portrait", r: 0.5 },
    { name: "cinema", r: 1.85 },
    { name: "cinemascope", r: 2.39 },
    { name: "vertical cinema", r: 1/1.85 },
    { name: "cinemascope", r: 1/2.39 },
    { name: "facebook cover", r: 16/6 },
    { name: "imax", r: 1.43 },                
    { name: "univisium", r: 2.0 },           
    { name: "polyvision", r: 3.0 }, 
    { name: "silent film", r: 1.375 },
    { name: "golden ratio", r: 1.618 }, 
    { name: "golden ratio", r: 1/1.618 }, 
    { name: "medium format", r: 7/6 },               
    { name: "iso paper", r: Math.sqrt(2) }, 
    { name: "iso paper", r: 1/Math.sqrt(2) }
  ];
  
  let bestMatch = null;
  let minDiff = 0.02;
  
  for (const kr of knownRatios) {
    const diff = Math.abs(r - kr.r);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = kr;
    }
  }
  
  return bestMatch ? bestMatch.name : "unknown";
}

function safeMathEval(str) {
  if (typeof str !== "string") return NaN;
  const s = str.trim();
  if (!s) return NaN;
  if (!/^[0-9+\-*/().\s]+$/.test(s)) return NaN;
  if (s.length > 256) return NaN;

  let pos = 0;
  const MAX_DEPTH = 64;
  let depth = 0;
  const skipWs = () => { while (pos < s.length && s[pos] === " ") pos++; };
  const eat = (ch) => { skipWs(); if (s[pos] === ch) { pos++; return true; } return false; };

  function parseExpr() {
    let v = parseTerm();
    for (; ;) {
      skipWs();
      if (eat("+")) v += parseTerm();
      else if (eat("-")) v -= parseTerm();
      else break;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    for (; ;) {
      skipWs();
      if (eat("*")) v *= parseFactor();
      else if (eat("/")) {
        const d = parseFactor();
        if (d === 0) return NaN;
        v /= d;
      } else break;
    }
    return v;
  }
  function parseFactor() {
    if (++depth > MAX_DEPTH) return NaN;
    skipWs();
    if (eat("+")) { const r = parseFactor(); depth--; return r; }
    if (eat("-")) { const r = -parseFactor(); depth--; return r; }
    if (eat("(")) {
      const v = parseExpr();
      if (!eat(")")) { depth--; return NaN; }
      depth--;
      return v;
    }
    let num = "";
    while (pos < s.length && /[0-9.]/.test(s[pos])) num += s[pos++];
    depth--;
    if (!num) return NaN;
    if ((num.match(/\./g) || []).length > 1) return NaN;
    return parseFloat(num);
  }

  const v = parseExpr();
  skipWs();
  if (pos !== s.length) return NaN;
  return v;
}

function createSpinnerInput(initialValue, onUpdate, onBlur, options = {}) {
  const {
    min = 64,
    max = 8192,
    getStep = () => 16,
    isMegapixels = false,
    disabled = false,
    onFocus = null
  } = options;

  const wrapper = document.createElement("div");
  wrapper.className = "ara-v2-spinner-wrapper";
  if (disabled) {
    wrapper.classList.add("disabled");
  }

  const decBtn = document.createElement("button");
  decBtn.type = "button";
  decBtn.className = "ara-v2-spinner-btn dec";
  decBtn.textContent = "−";

  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "ara-v2-input ara-v2-spinner-input";
  inp.value = initialValue;
  if (disabled) {
    inp.disabled = true;
    decBtn.disabled = true;
  }

  const incBtn = document.createElement("button");
  incBtn.type = "button";
  incBtn.className = "ara-v2-spinner-btn inc";
  incBtn.textContent = "+";
  if (disabled) {
    incBtn.disabled = true;
  }

  wrapper.append(decBtn, inp, incBtn);

  const stepValue = (direction) => {
    if (disabled) return;
    const currentVal = parseFloat(safeMathEval(inp.value)) || initialValue;
    const step = getStep();
    let newVal = currentVal + direction * step;

    if (isMegapixels) {
      newVal = Math.max(min, Math.min(newVal, max));
      newVal = parseFloat(newVal.toFixed(1));
    } else {
      newVal = Math.round(newVal / step) * step;
      newVal = Math.max(min, Math.min(newVal, max));
    }

    inp.value = newVal;
    if (onFocus) onFocus();
    onUpdate(newVal);
    onBlur(newVal);
  };

  decBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    stepValue(-1);
  });

  incBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    stepValue(1);
  });

  if (onFocus) {
    inp.addEventListener("focus", onFocus);
  }

  inp.addEventListener("input", (e) => {
    const val = safeMathEval(inp.value);
    if (Number.isFinite(val) && val > 0) {
      onUpdate(val);
    }
  });

  inp.addEventListener("blur", () => {
    let val = parseFloat(safeMathEval(inp.value)) || initialValue;
    if (isMegapixels) {
      val = Math.max(min, Math.min(val, max));
      val = parseFloat(val.toFixed(1));
    } else {
      const step = getStep();
      val = Math.round(val / step) * step;
      val = Math.max(min, Math.min(val, max));
    }
    inp.value = val;
    onBlur(val);
  });

  inp.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      inp.blur();
    }
  });

  return { wrapper, input: inp };
}

function getGraphAncestors(graph) {
  if (!graph) return [];
  const chain = [graph];
  let current = graph;
  const root = graph.rootGraph || graph;
  if (graph === root) return [root];

  const visited = new Set([graph]);
  while (current !== root) {
    let found = false;
    const rootNodes = root.nodes || root._nodes || [];
    for (const n of rootNodes) {
      if (n && n.subgraph === current) {
        chain.push(root);
        current = root;
        found = true;
        break;
      }
    }
    if (found) break;

    const subgraphs = root._subgraphs || root.subgraphs;
    if (subgraphs) {
      const sgValues = typeof subgraphs.values === "function" ? [...subgraphs.values()] : Object.values(subgraphs);
      for (const sg of sgValues) {
        if (sg === current || !sg) continue;
        const sgNodes = sg.nodes || sg._nodes || [];
        for (const n of sgNodes) {
          if (n && n.subgraph === current) {
            if (visited.has(sg)) { found = false; break; }
            visited.add(sg);
            chain.push(sg);
            current = sg;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    if (!found) {
      if (!chain.includes(root)) chain.push(root);
      break;
    }
  }
  return chain;
}

function findSetterByNameInGraph(graph, startGraph, name) {
  if (!name) return null;
  const ancestors = getGraphAncestors(startGraph || graph);
  for (const g of ancestors) {
    const nodes = g.nodes || g._nodes || [];
    for (const node of nodes) {
      if (node && (node.type === "SetNode" || node.comfyClass === "SetNode")) {
        const val = node.widgets?.[0]?.value;
        if (val === name) {
          return { node, graph: g };
        }
      }
    }
  }
  return null;
}

function resolveSourceNode(graph, node, slotIndex = 0) {
  if (!node || !node.inputs || !node.inputs[slotIndex]) return null;
  const linkId = node.inputs[slotIndex].link;
  if (!linkId) return null;
  const link = graph.links[linkId];
  if (!link) return null;
  const originNode = graph.getNodeById(link.origin_id);
  if (!originNode) return null;

  if (originNode.type === "GetNode" || originNode.comfyClass === "GetNode") {
    const tagName = originNode.widgets?.[0]?.value;
    if (tagName) {
      const setNodeEntry = findSetterByNameInGraph(graph, originNode.graph || graph, tagName);
      if (setNodeEntry && setNodeEntry.node) {
        return resolveSourceNode(setNodeEntry.graph || graph, setNodeEntry.node, 0);
      }
    }
  }

  return originNode;
}

function getConnectedImageSize(node) {
  if (!node.inputs || !node.inputs[0]) return null;
  const linkId = node.inputs[0].link;
  if (!linkId) return null;
  const graph = node.graph || app.graph;
  if (!graph) return null;
  const originNode = resolveSourceNode(graph, node, 0);
  if (!originNode) return null;

  // 1. Try standard node images preview (HTMLImageElement)
  if (originNode.imgs && originNode.imgs[0]) {
    const img = originNode.imgs[0];
    if (img.naturalWidth && img.naturalHeight) {
      return { w: img.naturalWidth, h: img.naturalHeight };
    } else {
      if (!img._araBoundLoad) {
        img._araBoundLoad = true;
        img.addEventListener("load", () => {
          renderUI(node);
        }, { once: true });
      }
    }
  }

  // 2. Try common internal metadata objects
  if (originNode.imageSize) {
    return { w: originNode.imageSize.width || originNode.imageSize.w, h: originNode.imageSize.height || originNode.imageSize.h };
  }

  return null;
}

function readState(node) {
  const v = node.properties?.[STATE_PROP];
  if (typeof v === "string" && v) {
    try { return { ...DEFAULT_STATE, ...JSON.parse(v) }; }
    catch { }
  }
  return { ...DEFAULT_STATE };
}

function writeState(node, state) {
  if (!node.properties) node.properties = {};
  node.properties[STATE_PROP] = JSON.stringify(state);
}

// Fit ratio to preview bounding box
function fitRectToBox(rw, rh, maxW, maxH) {
  const aspect = rw / rh;
  let w, h;
  if (aspect >= maxW / maxH) { w = maxW; h = maxW / aspect; }
  else { h = maxH; w = maxH * aspect; }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

// Live calculation matching the python side
function calculateDims(state, connectedImageSize = null) {
  const mode = state.mode;
  const snap = parseInt(state.snap) || 16;
  let w = 1024, h = 1024;

  const snapTo = (val, step) => Math.max(64, Math.round(val / step) * step);

  if (mode === "preset") {
    const ratioStr = state.ratio || "1:1 square";
    const ratioParts = ratioStr.split(" ")[0].split(":");
    let rw = 1.0, rh = 1.0;
    try {
      rw = parseFloat(ratioParts[0]) || 1.0;
      rh = parseFloat(ratioParts[1]) || 1.0;
    } catch (e) {
      rw = 1.0; rh = 1.0;
    }
    const r = rw / rh;
    const calcMode = state.preset_calc_mode || "min";
    const val = parseFloat(safeMathEval(String(state.preset_value))) || 1024;

    let wCalc, hCalc;
    if (calcMode === "min") {
      if (r >= 1.0) {
        hCalc = val;
        wCalc = val * r;
      } else {
        wCalc = val;
        hCalc = val / r;
      }
    } else if (calcMode === "max") {
      if (r >= 1.0) {
        wCalc = val;
        hCalc = val / r;
      } else {
        hCalc = val;
        wCalc = val * r;
      }
    } else if (calcMode === "megapixels") {
      const area = val * 1000000;
      wCalc = Math.sqrt(area * r);
      hCalc = wCalc / r;
    } else {
      wCalc = 1024; hCalc = 1024;
    }

    w = snapTo(wCalc, snap);
    h = snapTo(hCalc, snap);

  } else if (mode === "custom_ratio") {
    let r = 4 / 3;
    if (state.custom_ratio_input_image && connectedImageSize) {
      r = connectedImageSize.w / connectedImageSize.h;
    } else {
      try {
        const rw = parseFloat(state.custom_ratio_w) || 4.0;
        const rh = parseFloat(state.custom_ratio_h) || 3.0;
        r = rw / rh;
      } catch (e) {
        r = 4 / 3;
      }
    }

    const calcMode = state.custom_ratio_calc_mode || "min";
    const val = parseFloat(safeMathEval(String(state.custom_ratio_value))) || 1024;

    let wCalc, hCalc;
    if (calcMode === "min") {
      if (r >= 1.0) {
        hCalc = val;
        wCalc = val * r;
      } else {
        wCalc = val;
        hCalc = val / r;
      }
    } else if (calcMode === "max") {
      if (r >= 1.0) {
        wCalc = val;
        hCalc = val / r;
      } else {
        hCalc = val;
        wCalc = val * r;
      }
    } else if (calcMode === "megapixels") {
      const area = val * 1000000;
      wCalc = Math.sqrt(area * r);
      hCalc = wCalc / r;
    } else {
      wCalc = 1024; hCalc = 1024;
    }

    w = snapTo(wCalc, snap);
    h = snapTo(hCalc, snap);

  } else if (mode === "custom_dimensions") {
    if (state.custom_dimensions_input_image && connectedImageSize) {
      w = snapTo(connectedImageSize.w, snap);
      h = snapTo(connectedImageSize.h, snap);
    } else {
      const wVal = parseFloat(safeMathEval(String(state.custom_dimensions_width))) || 1024;
      const hVal = parseFloat(safeMathEval(String(state.custom_dimensions_height))) || 1024;
      w = snapTo(wVal, snap);
      h = snapTo(hVal, snap);
    }
  }

  w = Math.max(64, Math.min(w, 8192));
  h = Math.max(64, Math.min(h, 8192));
  return { w, h };
}

// Zoom passthrough for classic renderer
function scrollRegionWantsWheel(target, root, deltaX, deltaY) {
  const vertical = Math.abs(deltaY) >= Math.abs(deltaX);
  let el = target;
  while (el && el !== root.parentElement) {
    if (el.nodeType === 1) {
      const cs = getComputedStyle(el);
      if (vertical) {
        const oy = cs.overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
        }
      } else {
        const ox = cs.overflowX;
        if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) {
          const atLeft = el.scrollLeft <= 0;
          const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
          if ((deltaX < 0 && !atLeft) || (deltaX > 0 && !atRight)) return true;
        }
      }
    }
    el = el.parentElement;
  }
  return false;
}

function installCanvasZoomPassthrough(root) {
  if (!root || typeof root.addEventListener !== "function") return () => { };
  const onWheel = (e) => {
    if (!!window.LiteGraph?.vueNodesMode) return;
    if (scrollRegionWantsWheel(e.target, root, e.deltaX, e.deltaY)) return;
    const canvasEl = app?.canvas?.canvas;
    if (!canvasEl) return;
    e.preventDefault();
    e.stopPropagation();
    const { clientX, clientY, deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey } = e;
    canvasEl.dispatchEvent(new WheelEvent("wheel", {
      clientX, clientY, deltaX, deltaY, deltaMode,
      ctrlKey, metaKey, shiftKey, bubbles: true, cancelable: true,
    }));
  };
  root.addEventListener("wheel", onWheel, { passive: false });
  return () => root.removeEventListener("wheel", onWheel);
}

function applyAdaptiveCanvasOnly(widget) {
  if (!widget || !widget.options) return widget;
  try {
    Object.defineProperty(widget.options, "canvasOnly", {
      configurable: true,
      enumerable: true,
      get() {
        return !window.LiteGraph?.vueNodesMode;
      },
    });
  } catch (e) {
    widget.options.canvasOnly = !window.LiteGraph?.vueNodesMode;
  }
  return widget;
}

function renderUI(node) {
  const state = readState(node);
  let root = node._araRoot;

  if (!root || !root.isConnected) {
    const w = (node.widgets || []).find((x) => x.name === "aspect_ratio_ui");
    if (w?.element) {
      const found = (w.element.querySelector?.(".ara-v2-root")) || (w.element.classList?.contains("ara-v2-root") ? w.element : null);
      if (found && found.isConnected) {
        root = found;
        node._araRoot = found;
      }
    }
  }

  if (!root) {
    root = node._araRoot;
  }

  if (!root) return;

  const imageInput = node.inputs?.find((i) => i.name === "image");
  const vaeInput = node.inputs?.find((i) => i.name === "vae");
  const isImageConnected = !!(imageInput && imageInput.link);
  const isVaeConnected = !!(vaeInput && vaeInput.link);
  const bothConnected = isImageConnected && isVaeConnected;

  if (!bothConnected && state.vae_encode_enabled) {
    state.vae_encode_enabled = false;
    writeState(node, state);
  }

  // Calculate live values
  const uiImageSize = getConnectedImageSize(node);
  const pythonDims = node._pythonDims || null;
  const connectedImageSize = uiImageSize || pythonDims;
  const dims = calculateDims(state, connectedImageSize);
  let updatePreview = null;
  let updateInlineInfo = null;

  // Keep final w/h in state
  if (state.width !== dims.w || state.height !== dims.h) {
    state.width = dims.w;
    state.height = dims.h;
    writeState(node, state);
  }

  root.innerHTML = "";

  // Render 4 tab buttons
  const tabsContainer = document.createElement("div");
  tabsContainer.className = "ara-v2-tabs";

  const tabConfigs = [
    { id: "preset", label: "Presets" },
    { id: "custom_ratio", label: "Custom Ratio" },
    { id: "custom_dimensions", label: "Custom Dims" },
    { id: "scaled_image", label: "Processing" }
  ];

  const activeTab = node._activeTab || state.mode;

  tabConfigs.forEach((tc) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ara-v2-tab-btn" + (activeTab === tc.id ? " active" : "");
    btn.textContent = tc.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      node._activeTab = tc.id;
      if (tc.id !== "scaled_image") {
        state.mode = tc.id;
        writeState(node, state);
      }
      renderUI(node);
    });
    tabsContainer.appendChild(btn);
  });

  root.appendChild(tabsContainer);

  // Content area
  const content = document.createElement("div");
  content.className = "ara-v2-content";

  // Render appropriate tab
  if (activeTab === "preset") {
    // Wrapper to hold all preset rows with a tight 5px gap
    const presetsWrapper = document.createElement("div");
    presetsWrapper.style.display = "flex";
    presetsWrapper.style.flexDirection = "column";
    presetsWrapper.style.gap = "5px";

    // 9 aspect ratio presets
    const grid = document.createElement("div");
    grid.className = "ara-v2-presets-grid";

    PRESET_RATIOS.forEach((pr, i) => {
      const chip = document.createElement("div");
      chip.className = "ara-v2-preset-chip";
      if (i >= 9) chip.classList.add("span-half");
      if (state.ratio === pr.id || state.ratio === pr.ratio) chip.classList.add("active");

      const rLabel = document.createElement("span");
      rLabel.className = "ara-v2-chip-ratio";
      rLabel.textContent = pr.ratio;

      const dLabel = document.createElement("span");
      dLabel.className = "ara-v2-chip-desc";
      dLabel.textContent = pr.desc;

      chip.append(rLabel, dLabel);

      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        state.ratio = pr.id;
        writeState(node, state);
        renderUI(node);
      });

      grid.appendChild(chip);
    });
    presetsWrapper.appendChild(grid);

    // Custom presets (double-click to edit)
    const customPresetsRow = document.createElement("div");
    customPresetsRow.className = "ara-v2-calc-modes";

    const cpKeys = ["custom_preset_1", "custom_preset_2", "custom_preset_3"];
    const cpDefaults = ["Custom 1", "Custom 2", "Custom 3"];

    cpKeys.forEach((key, index) => {
      const val = state[key] || cpDefaults[index];
      const cpBtn = document.createElement("button");
      cpBtn.type = "button";
      cpBtn.title = "Double-click to set your own custom aspect ratio";
      const isActive = (state.ratio === val);
      cpBtn.className = "ara-v2-custom-preset-btn" + (isActive ? " active" : "");
      cpBtn.textContent = val;
      
      cpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.ratio = val;
        writeState(node, state);
        renderUI(node);
      });

      cpBtn.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const newVal = prompt("Write new aspect ratio (e.g. 16:9, 3:2, 2.39:1):", val);
        if (newVal !== null && newVal.trim() !== "") {
          const cleaned = newVal.trim();
          state[key] = cleaned;
          state.ratio = cleaned;
          writeState(node, state);
          renderUI(node);
        }
      });
      
      customPresetsRow.appendChild(cpBtn);
    });
    presetsWrapper.appendChild(customPresetsRow);

    // Modes: Min, Max, Megapixels
    const modesRow = document.createElement("div");
    modesRow.className = "ara-v2-calc-modes";

    const calcModes = [
      { id: "min", label: "Min" },
      { id: "max", label: "Max" },
      { id: "megapixels", label: "Megapixels" }
    ];

    calcModes.forEach((cm) => {
      const modeBtn = document.createElement("button");
      modeBtn.type = "button";
      modeBtn.className = "ara-v2-mode-btn" + (state.preset_calc_mode === cm.id ? " active" : "");
      modeBtn.textContent = cm.label;
      modeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.preset_calc_mode = cm.id;

        // Restore persistent value for the selected mode
        if (cm.id === "megapixels") {
          state.preset_value = state.preset_value_megapixels !== undefined ? state.preset_value_megapixels : 1.0;
        } else if (cm.id === "max") {
          state.preset_value = state.preset_value_max !== undefined ? state.preset_value_max : 1024;
        } else {
          state.preset_value = state.preset_value_min !== undefined ? state.preset_value_min : 1024;
        }

        writeState(node, state);
        renderUI(node);
      });
      modesRow.appendChild(modeBtn);
    });
    presetsWrapper.appendChild(modesRow);

    content.appendChild(presetsWrapper);

    // Value input + Snap step row
    const valSnapRow = document.createElement("div");
    valSnapRow.className = "ara-v2-val-snap-row";

    const field = document.createElement("div");
    field.className = "ara-v2-field";
    const label = document.createElement("label");
    label.className = "ara-v2-label";
    label.textContent = state.preset_calc_mode === "megapixels" ? "Target Area (MP)" : "Side Length (px)";

    const isMegapixels = state.preset_calc_mode === "megapixels";
    const { wrapper: spinnerWrapper, input: inp } = createSpinnerInput(
      state.preset_value,
      (val) => {
        const tempState = { ...state, preset_value: val };
        if (state.preset_calc_mode === "megapixels") {
          tempState.preset_value_megapixels = val;
        } else if (state.preset_calc_mode === "max") {
          tempState.preset_value_max = val;
        } else {
          tempState.preset_value_min = val;
        }
        const tempDims = calculateDims(tempState, pythonDims);
        if (updatePreview) updatePreview(tempDims.w, tempDims.h);
      },
      (val) => {
        state.preset_value = val;
        if (state.preset_calc_mode === "megapixels") {
          state.preset_value_megapixels = val;
        } else if (state.preset_calc_mode === "max") {
          state.preset_value_max = val;
        } else {
          state.preset_value_min = val;
        }
        writeState(node, state);
        renderUI(node);
      },
      {
        min: isMegapixels ? 0.1 : 64,
        max: isMegapixels ? 67.1 : 8192,
        getStep: () => isMegapixels ? 0.1 : (parseInt(state.snap) || 16),
        isMegapixels: isMegapixels
      }
    );

    field.append(label, spinnerWrapper);

    const snapGroup = document.createElement("div");
    snapGroup.className = "ara-v2-snap-group";
    const snapLabel = document.createElement("label");
    snapLabel.className = "ara-v2-label";
    snapLabel.textContent = "Snap";

    const snapBtns = document.createElement("div");
    snapBtns.className = "ara-v2-snap-btns";
    SNAP_OPTIONS.forEach((so) => {
      const sbtn = document.createElement("button");
      sbtn.type = "button";
      sbtn.className = "ara-v2-snap-btn" + (state.snap === so ? " active" : "");
      sbtn.textContent = so;
      sbtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.snap = so;
        writeState(node, state);
        renderUI(node);
      });
      snapBtns.appendChild(sbtn);
    });

    snapGroup.append(snapLabel, snapBtns);
    valSnapRow.append(field, snapGroup);
    content.appendChild(valSnapRow);

  } else if (activeTab === "custom_ratio") {
    // Custom ratio header (Ratio W:H swap)
    const ratioHeaderRow = document.createElement("div");
    ratioHeaderRow.className = "ara-v2-ratio-header-row";

    const field = document.createElement("div");
    field.className = "ara-v2-field";

    const label = document.createElement("label");
    label.className = "ara-v2-label";
    label.textContent = "Ratio Aspect (W : H)";

    const inputsNameRow = document.createElement("div");
    inputsNameRow.style.display = "flex";
    inputsNameRow.style.alignItems = "center";
    inputsNameRow.style.justifyContent = "space-between";
    inputsNameRow.style.width = "100%";

    const ratioInputs = document.createElement("div");
    ratioInputs.className = "ara-v2-ratio-inputs";

    const rw = document.createElement("input");
    rw.type = "text";
    rw.className = "ara-v2-ratio-input";
    rw.value = state.custom_ratio_w;
    rw.disabled = state.custom_ratio_input_image;
    rw.addEventListener("blur", () => {
      const v = Math.round(parseFloat(rw.value)) || 4;
      state.custom_ratio_w = Math.max(1, v);
      writeState(node, state);
      renderUI(node);
    });

    const rh = document.createElement("input");
    rh.type = "text";
    rh.className = "ara-v2-ratio-input";
    rh.value = state.custom_ratio_h;
    rh.disabled = state.custom_ratio_input_image;
    rh.addEventListener("blur", () => {
      const v = Math.round(parseFloat(rh.value)) || 3;
      state.custom_ratio_h = Math.max(1, v);
      writeState(node, state);
      renderUI(node);
    });

    const swapBtn = document.createElement("button");
    swapBtn.type = "button";
    swapBtn.className = "ara-v2-swap-btn";
    swapBtn.textContent = "⇄";
    swapBtn.disabled = state.custom_ratio_input_image;
    swapBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tmp = state.custom_ratio_w;
      state.custom_ratio_w = state.custom_ratio_h;
      state.custom_ratio_h = tmp;
      writeState(node, state);
      renderUI(node);
    });

    for (const inpEl of [rw, rh]) {
      inpEl.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") inpEl.blur();
      });
    }

    ratioInputs.append(rw, swapBtn, rh);

    const nameLabel = document.createElement("div");
    nameLabel.className = "ara-v2-inline-info";
    nameLabel.style.marginBottom = "0px";

    let rwVal = parseFloat(state.custom_ratio_w) || 4;
    let rhVal = parseFloat(state.custom_ratio_h) || 3;
    if (state.custom_ratio_input_image && connectedImageSize) {
      rwVal = connectedImageSize.w;
      rhVal = connectedImageSize.h;
    }
    nameLabel.innerHTML = `<span class="accent">${getRatioName(rwVal, rhVal)}</span>`;

    inputsNameRow.append(ratioInputs, nameLabel);

    field.append(label, inputsNameRow);
    ratioHeaderRow.appendChild(field);
    content.appendChild(ratioHeaderRow);

    // iOS switch toggle for Input Image
    const toggleRow = document.createElement("div");
    toggleRow.className = "ara-v2-toggle-row";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "ara-v2-toggle-container";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ara-v2-toggle-input";
    checkbox.checked = state.custom_ratio_input_image;
    checkbox.addEventListener("change", () => {
      state.custom_ratio_input_image = checkbox.checked;
      writeState(node, state);
      renderUI(node);
    });

    const toggleSwitch = document.createElement("span");
    toggleSwitch.className = "ara-v2-toggle-switch";

    const labelText = document.createElement("span");
    labelText.textContent = "Calculate Ratio from Input Image";

    toggleLabel.append(checkbox, toggleSwitch, labelText);
    toggleRow.appendChild(toggleLabel);
    content.appendChild(toggleRow);

    // Modes: Min, Max, Megapixels for Custom Ratio
    const modesRow = document.createElement("div");
    modesRow.className = "ara-v2-calc-modes";

    const calcModes = [
      { id: "min", label: "Min" },
      { id: "max", label: "Max" },
      { id: "megapixels", label: "Megapixels" }
    ];

    calcModes.forEach((cm) => {
      const modeBtn = document.createElement("button");
      modeBtn.type = "button";
      modeBtn.className = "ara-v2-mode-btn" + (state.custom_ratio_calc_mode === cm.id ? " active" : "");
      modeBtn.textContent = cm.label;
      modeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.custom_ratio_calc_mode = cm.id;

        // Restore persistent value for the selected mode
        if (cm.id === "megapixels") {
          state.custom_ratio_value = state.custom_ratio_value_megapixels !== undefined ? state.custom_ratio_value_megapixels : 1.0;
        } else if (cm.id === "max") {
          state.custom_ratio_value = state.custom_ratio_value_max !== undefined ? state.custom_ratio_value_max : 1024;
        } else {
          state.custom_ratio_value = state.custom_ratio_value_min !== undefined ? state.custom_ratio_value_min : 1024;
        }

        writeState(node, state);
        renderUI(node);
      });
      modesRow.appendChild(modeBtn);
    });
    content.appendChild(modesRow);

    // Value input + Snap step row for Custom Ratio
    const valSnapRow = document.createElement("div");
    valSnapRow.className = "ara-v2-val-snap-row";

    const valField = document.createElement("div");
    valField.className = "ara-v2-field";
    const valLabel = document.createElement("label");
    valLabel.className = "ara-v2-label";
    valLabel.textContent = state.custom_ratio_calc_mode === "megapixels" ? "Target Area (MP)" : "Side Length (px)";

    const isMegapixels = state.custom_ratio_calc_mode === "megapixels";
    const { wrapper: spinnerWrapper, input: inp } = createSpinnerInput(
      state.custom_ratio_value,
      (val) => {
        const tempState = { ...state, custom_ratio_value: val };
        if (state.custom_ratio_calc_mode === "megapixels") {
          tempState.custom_ratio_value_megapixels = val;
        } else if (state.custom_ratio_calc_mode === "max") {
          tempState.custom_ratio_value_max = val;
        } else {
          tempState.custom_ratio_value_min = val;
        }
        const tempDims = calculateDims(tempState, pythonDims);
        if (updatePreview) updatePreview(tempDims.w, tempDims.h);
      },
      (val) => {
        state.custom_ratio_value = val;
        if (state.custom_ratio_calc_mode === "megapixels") {
          state.custom_ratio_value_megapixels = val;
        } else if (state.custom_ratio_calc_mode === "max") {
          state.custom_ratio_value_max = val;
        } else {
          state.custom_ratio_value_min = val;
        }
        writeState(node, state);
        renderUI(node);
      },
      {
        min: isMegapixels ? 0.1 : 64,
        max: isMegapixels ? 67.1 : 8192,
        getStep: () => isMegapixels ? 0.1 : (parseInt(state.snap) || 16),
        isMegapixels: isMegapixels
      }
    );
    valField.append(valLabel, spinnerWrapper);

    const snapGroup = document.createElement("div");
    snapGroup.className = "ara-v2-snap-group";
    const snapLabel = document.createElement("label");
    snapLabel.className = "ara-v2-label";
    snapLabel.textContent = "Snap";
    const snapBtns = document.createElement("div");
    snapBtns.className = "ara-v2-snap-btns";
    SNAP_OPTIONS.forEach((so) => {
      const sbtn = document.createElement("button");
      sbtn.type = "button";
      sbtn.className = "ara-v2-snap-btn" + (state.snap === so ? " active" : "");
      sbtn.textContent = so;
      sbtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.snap = so;
        writeState(node, state);
        renderUI(node);
      });
      snapBtns.appendChild(sbtn);
    });
    snapGroup.append(snapLabel, snapBtns);

    valSnapRow.append(valField, snapGroup);
    content.appendChild(valSnapRow);

  } else if (activeTab === "custom_dimensions") {
    // Snap and Info row
    const snapInfoRow = document.createElement("div");
    snapInfoRow.className = "ara-v2-snap-info-row";

    const snapGroup = document.createElement("div");
    snapGroup.className = "ara-v2-snap-group";
    const snapLabel = document.createElement("label");
    snapLabel.className = "ara-v2-label";
    snapLabel.textContent = "Snap";
    const snapBtns = document.createElement("div");
    snapBtns.className = "ara-v2-snap-btns";
    SNAP_OPTIONS.forEach((so) => {
      const sbtn = document.createElement("button");
      sbtn.type = "button";
      sbtn.className = "ara-v2-snap-btn" + (state.snap === so ? " active" : "");
      sbtn.textContent = so;
      sbtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.snap = so;
        writeState(node, state);
        renderUI(node);
      });
      snapBtns.appendChild(sbtn);
    });
    snapGroup.append(snapLabel, snapBtns);

    const infoLabel = document.createElement("div");
    infoLabel.className = "ara-v2-inline-info";
    
    updateInlineInfo = function(wVal, hVal) {
      infoLabel.innerHTML = `<span class="accent">${ratioLabel(wVal, hVal)}</span> · ${megapixels(wVal, hVal)} MP`;
    };
    updateInlineInfo(dims.w, dims.h);

    snapInfoRow.append(snapGroup, infoLabel);
    content.appendChild(snapInfoRow);

    // iOS switch toggle for Dimensions from Input Image
    const toggleRow = document.createElement("div");
    toggleRow.className = "ara-v2-toggle-row";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "ara-v2-toggle-container";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ara-v2-toggle-input";
    checkbox.checked = state.custom_dimensions_input_image;
    checkbox.addEventListener("change", () => {
      state.custom_dimensions_input_image = checkbox.checked;
      writeState(node, state);
      renderUI(node);
    });

    const toggleSwitch = document.createElement("span");
    toggleSwitch.className = "ara-v2-toggle-switch";

    const labelText = document.createElement("span");
    labelText.textContent = "Dimensions from Input Image";

    toggleLabel.append(checkbox, toggleSwitch, labelText);
    toggleRow.appendChild(toggleLabel);
    content.appendChild(toggleRow);

    // Width and Height row
    const widthHeightRow = document.createElement("div");
    widthHeightRow.className = "ara-v2-width-height-row";

    const wField = document.createElement("div");
    wField.className = "ara-v2-field";
    const wLabel = document.createElement("label");
    wLabel.className = "ara-v2-label";
    wLabel.textContent = "Width";

    const { wrapper: wSpinnerWrapper, input: winp } = createSpinnerInput(
      state.custom_dimensions_width,
      (val) => {
        const tempState = { ...state, custom_dimensions_width: val };
        const tempDims = calculateDims(tempState, pythonDims);
        if (updatePreview) updatePreview(tempDims.w, tempDims.h);
      },
      (val) => {
        state.custom_dimensions_width = val;
        writeState(node, state);
        renderUI(node);
      },
      {
        min: 64,
        max: 8192,
        getStep: () => parseInt(state.snap) || 16,
        isMegapixels: false,
        disabled: state.custom_dimensions_input_image
      }
    );
    wField.append(wLabel, wSpinnerWrapper);

    const swapBtn = document.createElement("button");
    swapBtn.type = "button";
    swapBtn.className = "ara-v2-swap-btn";
    swapBtn.textContent = "⇄";
    swapBtn.disabled = state.custom_dimensions_input_image;
    swapBtn.style.alignSelf = "flex-end";
    swapBtn.style.height = "24px";
    swapBtn.style.boxSizing = "border-box";
    swapBtn.style.marginBottom = "0px";
    swapBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tmp = state.custom_dimensions_width;
      state.custom_dimensions_width = state.custom_dimensions_height;
      state.custom_dimensions_height = tmp;
      writeState(node, state);
      renderUI(node);
    });

    const hField = document.createElement("div");
    hField.className = "ara-v2-field";
    const hLabel = document.createElement("label");
    hLabel.className = "ara-v2-label";
    hLabel.textContent = "Height";
    const { wrapper: hSpinnerWrapper, input: hinp } = createSpinnerInput(
      state.custom_dimensions_height,
      (val) => {
        const tempState = { ...state, custom_dimensions_height: val };
        const tempDims = calculateDims(tempState, pythonDims);
        if (updatePreview) updatePreview(tempDims.w, tempDims.h);
      },
      (val) => {
        state.custom_dimensions_height = val;
        writeState(node, state);
        renderUI(node);
      },
      {
        min: 64,
        max: 8192,
        getStep: () => parseInt(state.snap) || 16,
        isMegapixels: false,
        disabled: state.custom_dimensions_input_image
      }
    );
    hField.append(hLabel, hSpinnerWrapper);

    widthHeightRow.append(wField, swapBtn, hField);
    content.appendChild(widthHeightRow);

  } else if (activeTab === "scaled_image") {
    // Scaled Image config tab
    const scalePanel = document.createElement("div");
    scalePanel.className = "ara-v2-scale-panel";

    // Toggle for enable scaling
    const toggleRow = document.createElement("div");
    toggleRow.className = "ara-v2-toggle-row";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "ara-v2-toggle-container";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ara-v2-toggle-input";
    checkbox.checked = state.scale_image_enabled;
    checkbox.addEventListener("change", () => {
      state.scale_image_enabled = checkbox.checked;
      writeState(node, state);
      renderUI(node);
    });

    const toggleSwitch = document.createElement("span");
    toggleSwitch.className = "ara-v2-toggle-switch";

    const labelText = document.createElement("span");
    labelText.textContent = "Enable Image Scaling";

    toggleLabel.append(checkbox, toggleSwitch, labelText);
    toggleRow.appendChild(toggleLabel);
    scalePanel.appendChild(toggleRow);

    // Toggle for VAE Encode
    const vaeToggleRow = document.createElement("div");
    vaeToggleRow.className = "ara-v2-toggle-row";

    const vaeToggleLabel = document.createElement("label");
    vaeToggleLabel.className = "ara-v2-toggle-container";
    if (!bothConnected) {
      vaeToggleLabel.style.opacity = "0.5";
      vaeToggleLabel.style.cursor = "not-allowed";
    }

    const vaeCheckbox = document.createElement("input");
    vaeCheckbox.type = "checkbox";
    vaeCheckbox.className = "ara-v2-toggle-input";
    vaeCheckbox.checked = state.vae_encode_enabled && bothConnected;
    vaeCheckbox.disabled = !bothConnected;
    vaeCheckbox.addEventListener("change", () => {
      state.vae_encode_enabled = vaeCheckbox.checked;
      writeState(node, state);
      renderUI(node);
    });

    const vaeToggleSwitch = document.createElement("span");
    vaeToggleSwitch.className = "ara-v2-toggle-switch";

    const vaeLabelText = document.createElement("span");
    vaeLabelText.textContent = "VAE Encode";
    if (!bothConnected) {
      vaeLabelText.title = "Requires both image and VAE to be connected";
    }

    vaeToggleLabel.append(vaeCheckbox, vaeToggleSwitch, vaeLabelText);
    vaeToggleRow.appendChild(vaeToggleLabel);
    scalePanel.appendChild(vaeToggleRow);

    // Group for Scaling Algorithm Label & Grid to keep them closely bound
    const algGroup = document.createElement("div");
    algGroup.style.display = "flex";
    algGroup.style.flexDirection = "column";
    algGroup.style.gap = "4px";

    const methodLabel = document.createElement("span");
    methodLabel.className = "ara-v2-label";
    methodLabel.textContent = "Scaling Algorithm";
    algGroup.appendChild(methodLabel);

    const grid = document.createElement("div");
    grid.className = "ara-v2-scale-algorithms";

    SCALE_ALGORITHMS.forEach((sa, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ara-v2-scale-alg-btn" + (state.scale_image_method === sa ? " active" : "");
      if (sa === "auto") {
        btn.title = "Uses Lanczos for downscaling, and Bicubic for upscaling or same-size snaps";
      }
      btn.textContent = sa;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.scale_image_method = sa;
        writeState(node, state);
        renderUI(node);
      });
      grid.appendChild(btn);
    });
    algGroup.appendChild(grid);
    scalePanel.appendChild(algGroup);

    // Info banner showing active dimensions and what mode calculated it
    const infoBanner = document.createElement("div");
    infoBanner.className = "ara-v2-info-banner";

    const infoTitle = document.createElement("div");
    infoTitle.className = "ara-v2-info-title";

    let modeText = "presets";
    if (state.mode === "custom_ratio") modeText = "custom ratio";
    else if (state.mode === "custom_dimensions") modeText = "custom dims";

    infoTitle.textContent = `Active dimensions calculated by ${modeText}`;

    const infoValue = document.createElement("div");
    infoValue.className = "ara-v2-info-value";
    infoValue.innerHTML = `<span class="accent">${dims.w}</span> × <span class="accent">${dims.h}</span> (${megapixels(dims.w, dims.h)} MP)`;

    infoBanner.append(infoTitle, infoValue);
    scalePanel.appendChild(infoBanner);

    content.appendChild(scalePanel);
  }

  // Draw the preview box if we are not on the scale_image tab
  if (activeTab !== "scaled_image") {
    const preview = document.createElement("div");
    preview.className = "ara-v2-preview";

    const previewNameLabel = document.createElement("div");
    previewNameLabel.className = "ara-v2-inline-info";
    previewNameLabel.style.textAlign = "center";
    previewNameLabel.style.width = "100%";
    previewNameLabel.style.marginBottom = "4px";
    previewNameLabel.style.flex = "none";
    previewNameLabel.style.alignSelf = "center";

    const previewRect = document.createElement("div");
    previewRect.className = "ara-v2-preview-rect";

    const previewLabel = document.createElement("div");
    previewLabel.className = "ara-v2-preview-label";

    const previewInfo = document.createElement("div");
    previewInfo.className = "ara-v2-preview-info";

    preview.append(previewNameLabel, previewRect, previewLabel, previewInfo);

    const PREVIEW_MAX_W = 100;
    const PREVIEW_MAX_H = 65;


    if (activeTab === "custom_ratio" || activeTab === "custom_dimensions") {
      previewInfo.style.display = "none";
    } else {
      previewInfo.style.display = "";
    }

    // Helper function to update the rect size and labels
    updatePreview = function (width, height) {
      const { w: pw, h: ph } = fitRectToBox(width, height, PREVIEW_MAX_W, PREVIEW_MAX_H);
      previewRect.style.width = `${pw}px`;
      previewRect.style.height = `${ph}px`;

      previewLabel.innerHTML = `<span class="accent">${width}</span> × <span class="accent">${height}</span>`;
      previewInfo.innerHTML = `<span class="accent">${ratioLabel(width, height)}</span> · ${megapixels(width, height)} MP`;
      
      const ratioName = getRatioName(width, height);
      if (activeTab === "custom_dimensions" && ratioName !== "unknown") {
        previewNameLabel.style.display = "";
        previewNameLabel.innerHTML = `<span class="accent">${ratioName}</span>`;
      } else {
        previewNameLabel.style.display = "none";
      }

      if (updateInlineInfo) {
        updateInlineInfo(width, height);
      }
    };

    content.appendChild(preview);
    root.appendChild(content);

    // Populate initial preview values
    updatePreview(dims.w, dims.h);
  } else {
    root.appendChild(content);
  }
}

function setupNode(node) {
  node.resizable = false;
  node.size = [NODE_W, NODE_H];

  const root = document.createElement("div");
  root.className = "ara-v2-root";

  const WIDGET_H = NODE_H - 54;
  installCanvasZoomPassthrough(root);
  const _widget = node.addDOMWidget("aspect_ratio_ui", "custom", root, {
    getValue: () => readState(node),
    setValue: () => { },
    getMinHeight: () => WIDGET_H,
    getMaxHeight: () => WIDGET_H,
    margin: 4,
    serialize: false,
  });
  applyAdaptiveCanvasOnly(_widget);

  node._araRoot = root;

  // Initialize connection state
  const imageInput = node.inputs?.find((i) => i.name === "image");
  const vaeInput = node.inputs?.find((i) => i.name === "vae");
  node._wasBothConnected = !!(imageInput && imageInput.link) && !!(vaeInput && vaeInput.link);

  queueMicrotask(() => {
    renderUI(node);
  });
}

// Global synchronization listener
api.addEventListener("aspect_ratio_advanced_v2.update_dims", (e) => {
  const { node_id, width, height, mode } = e.detail;
  // Deep search in graph for target node
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

  const node = visit(app.graph);
  if (node && (node.comfyClass === "dehypnotic_AspectRatio" || node.comfyClass === "AspectRatioAdvanced" || node.type === "dehypnotic_AspectRatio" || node.type === "AspectRatioAdvanced")) {
    node._pythonDims = { w: width, h: height };
    const state = readState(node);
    state.width = width;
    state.height = height;
    writeState(node, state);
    renderUI(node);
  }
});

// Build standard index
function buildNodeIndex() {
  const index = new Map();
  const visit = (graph) => {
    if (!graph) return;
    const nodes = graph._nodes || graph.nodes || [];
    for (const n of nodes) {
      if (!n) continue;
      if (n.comfyClass === "dehypnotic_AspectRatio" || n.comfyClass === "AspectRatioAdvanced" || n.type === "dehypnotic_AspectRatio" || n.type === "AspectRatioAdvanced") {
        index.set(String(n.id), n);
      }
      const inner = n.subgraph || n.graph || n._graph;
      if (inner && inner !== graph) visit(inner);
    }
  };
  visit(app.graph);
  return index;
}

function findNode(index, promptId) {
  const sId = String(promptId);
  if (index.has(sId)) return index.get(sId);
  const tail = sId.includes(":") ? sId.slice(sId.lastIndexOf(":") + 1) : null;
  if (tail && index.has(tail)) return index.get(tail);
  return null;
}

// Override prompt serialization to inject state
const _origGraphToPrompt = app.graphToPrompt.bind(app);
app.graphToPrompt = async function (...args) {
  const result = await _origGraphToPrompt(...args);
  const out = result?.output;
  if (out) {
    let index = null;
    for (const id in out) {
      const entry = out[id];
      if (!entry || (entry.class_type !== "dehypnotic_AspectRatio" && entry.class_type !== "AspectRatioAdvanced")) continue;
      if (!index) index = buildNodeIndex();
      const node = findNode(index, id);
      const state = node ? JSON.stringify(readState(node)) : JSON.stringify(DEFAULT_STATE);
      entry.inputs = entry.inputs || {};
      entry.inputs[HIDDEN_INPUT_NAME] = state;
    }
  }
  return result;
};

app.registerExtension({
  name: "AspectRatioAdvancedV2.Extension",

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "dehypnotic_AspectRatio" && nodeData.name !== "AspectRatioAdvanced") return;

    // Aktiver manuell justering på selve node-prototypen
    nodeType.prototype.resizable = true;

    // Dynamisk størrelse som tillater alt som er STØRRE enn standarden din
    nodeType.prototype.computeSize = function (minHeight) {
      // Hvis LiteGraph/brukeren har satt en størrelse, hent ut de verdiene
      const currentW = this.size ? this.size[0] : NODE_W;
      const currentH = this.size ? this.size[1] : NODE_H;

      // Sørg for at den aldri blir mindre enn dine gitte minimumskonstanter
      return [Math.max(currentW, NODE_W), Math.max(currentH, NODE_H)];
    };

    const _origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      const r = _origConfigure?.apply(this, arguments);

      // Sørg for at størrelsen eksisterer som et array ved oppstart
      if (!this.size) {
        this.size = [NODE_W, NODE_H];
      }

      if (info?.size) {
        this.size[0] = info.size[0];
        this.size[1] = info.size[1];
      }

      // Initialize connection state on configure
      const imageInput = this.inputs?.find((i) => i.name === "image");
      const vaeInput = this.inputs?.find((i) => i.name === "vae");
      this._wasBothConnected = !!(imageInput && imageInput.link) && !!(vaeInput && vaeInput.link);

      if (this._araRoot) {
        renderUI(this);
      }
      return r;
    };

    // Hold onResize helt åpen slik at LiteGraph fritt kan oppdatere koordinatene mens du drar
    const _origResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (_origResize) return _origResize.call(this, size);
    };

    const _origConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function (type, slot, connected, link_info, input_info) {
      const r = _origConnectionsChange?.apply(this, arguments);

      const imageInput = this.inputs?.find((i) => i.name === "image");
      const vaeInput = this.inputs?.find((i) => i.name === "vae");
      const isImageConnected = !!(imageInput && imageInput.link);
      const isVaeConnected = !!(vaeInput && vaeInput.link);
      const bothConnected = isImageConnected && isVaeConnected;

      if (this._wasBothConnected === undefined) {
        this._wasBothConnected = bothConnected;
      } else {
        const state = readState(this);
        let changed = false;
        if (bothConnected && !this._wasBothConnected) {
          state.vae_encode_enabled = true;
          changed = true;
        } else if (!bothConnected && this._wasBothConnected) {
          state.vae_encode_enabled = false;
          changed = true;
        }

        if (changed) {
          writeState(this, state);
        }
        this._wasBothConnected = bothConnected;
      }

      renderUI(this);
      return r;
    };

    const _origDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx, canvas) {
      if (this._araRoot && this._araRoot.isConnected) {
        const size = getConnectedImageSize(this);
        const lastSize = this._lastConnectedImageSize || null;
        const sizeChanged = (!lastSize && size) || (lastSize && !size) || (lastSize && size && (lastSize.w !== size.w || lastSize.h !== size.h));
        if (sizeChanged) {
          this._lastConnectedImageSize = size;
          renderUI(this);
        }
      }
      return _origDrawForeground?.apply(this, arguments);
    };
  },


  nodeCreated(node) {
    if (node.comfyClass !== "dehypnotic_AspectRatio" && node.comfyClass !== "AspectRatioAdvanced") return
    setupNode(node);
  },
});
