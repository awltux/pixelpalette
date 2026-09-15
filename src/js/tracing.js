/*
   Pixel Palette - colour picker & paint mixer
   Copyright (C) 2026 Awltux Limited

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU Affero General Public License as published
   by the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Affero General Public License for more details.

   You should have received a copy of the GNU Affero General Public License
   along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/* ============================================================
   tracing.js - "Projection" mode. Puts the loaded image on a
   full-screen, live camera feed so you can trace it. The image
   and an optional proportion grid share one image-space view
   (pan / zoom), so the grid stays locked to the image during
   close-up work. Alpha (opacity) and grid cell spacing are
   adjustable; a Lock freezes the combined image + grid view.

   Privacy: the camera stream lives only on this device, is never
   recorded, and is stopped when the mode exits. getUserMedia is
   only called from an explicit user gesture (the Project button).
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;

  const CAM_KEY = 'pp.trace.cam';
  const PREF_KEY = 'pp.trace.prefs';
  const DEFAULT_FACING = 'user'; // front camera

  let active = false;
  let stream = null;
  let facing = DEFAULT_FACING;

  // image-space view (mirrors the main canvas convention)
  let view = { scale: 1, cx: 0, cy: 0 };

  // ---- live-feed zoom (magnifies the camera itself for closeup work) ----
  // The feed zoom is applied as a CSS transform on the <video> element, so it
  // affects only the camera (the drawn overlay intentionally does not zoom).
  // screen = t + s * p  where p is a video/content point, s the scale, t the pan.
  // When the camera exposes a real `zoom` track constraint (sensor/device zoom)
  // we use that first — it crops the sensor for genuine magnification — and only
  // fall back to the CSS upscale for the part the sensor cannot reach. `feedS`
  // stays the total magnification the user asks for (>=1); the CSS scale applied
  // to the element is `feedS / feedSensorZoom` (>=1). Without sensor zoom the
  // applied scale equals feedS, so behaviour is unchanged.
  let feedOn = false;        // feed-zoom engaged
  let feedS = 1;             // total requested magnification (>=1)
  let feedCss = 1;           // CSS scale actually applied to the <video>
  let feedTx = 0, feedTy = 0; // pan (css px)
  let feedSensorCap = null;  // {min,max,step} of the live track's zoom, or null
  let feedSensorZoom = 1;    // currently requested sensor-zoom value (>=1)
  let feedSensorQueued = 0;  // timeout id for coalesced applyConstraints
  let feedSensorPending = 0; // latest sensor value waiting to be applied
  let feedSensorImageCapture = null; // keep an ImageCapture alive for zoom caps
  const FEED_MAX = 10;
  // how coarse/fine each zoom step is. Multiplicative per click; 1.10 =
  // ~10% per click (finer than the previous 1.35). Wheel uses a weaker
  // exponential so a scroll notch moves less.
  const FEED_BTN_STEP = 1.10;
  const FEED_WHEEL_K = 0.0009; // scroll sensitivity (smaller = finer)
  // screen "tap"/swipe gestures on the projected image while Lock is on
  const HIDE_TAP_SLOP = 12;      // max css px of finger travel to count as a tap
  const HIDE_TAP_MS = 400;       // max tap duration (ms)
  const SWIPE_PX = 40;           // vertical travel that counts as an opacity swipe
  const SWIPE_ALPHA_STEP = 0.1;  // opacity change applied per completed swipe gesture
  // The gesture mode dial (see HANDOVER §11) defers the single-press action
  // inside this window so a deliberate double press cannot fire two peeks.
  // Phase 1 will consume it; the Phase 0 probe measures the remote's real
  // press-to-press gaps so it can be set from readings, not guesswork.
  const DOUBLE_PRESS_MS = 300;   // double-press recognition window (ms)

  /* ---- PHASE 0: temporary gesture probe (delete once constants are tuned) ----
     Enabled only with ?gdebug=1 in the page URL. It reports what the Bluetooth
     "remote" actually emits - event kind, press duration, travel and the
     press-to-press gap - so HIDE_TAP_MS / SWIPE_PX / DOUBLE_PRESS_MS come from
     measurement. It deliberately adds no style element (build.test counts
     those) and reads `global.location` defensively, because the test vm
     sandbox has no `location`. */
  const GESTURE_DEBUG = (function () {
    try {
      return /(^|[?&])gdebug=1(&|$)/.test(global.location ? global.location.search : '');
    } catch (e) { return false; }
  })();

  /* ---- gesture mode dial (see HANDOVER §11) ----
     While the image is locked the remote's press/swipe drive whichever stop is
     selected; a double press swaps the stop. Only the flat projection view has
     stops so far - the AR ("map to surface") stop list is a later step, and
     `gestureContext()` is the single place that decides which list is live. */
  const GESTURE_STOPS = ['opacity', 'zoom'];
  // What a single press does on each stop. ZOOM is deliberately inert: a press
  // is easy to fire by accident with the remote, and resetting the alignment
  // discards both the zoom and the pan. Reset therefore lives on the Fit image
  // button only (and unlocking still allows a free pinch-zoom).
  const STOP_PRESS = { opacity: 'peek', zoom: 'none' };
  const GESTURE_HOME_MS = 20000;   // idle before the dial returns to OPACITY
  // Same-direction swipes closer together than this climb the ladder. It has to
  // be LONG: the Bluetooth remote emits one up/down swipe per button gesture and
  // turns *short* intervals between button presses into left/right swipes, so a
  // rapid run of same-direction swipes is impossible by design. The window must
  // therefore span a deliberate, spaced-out pace (~1-3 s), not a key-repeat one.
  const SWIPE_REPEAT_MS = 3000;
  // ZOOM's per-swipe steps, finest first. The rung is chosen by how many
  // same-direction swipes just went by in a run: an isolated swipe is the
  // finest correction, and each rapid repeat moves up a rung. OPACITY ignores
  // the rung entirely (it keeps its fixed ±10%). The first rung is deliberately
  // very fine so the last tenth of a percent is reachable by hand.
  // ZOOM's per-swipe steps in SCREEN PIXELS of the rendered image width: a step
  // is an absolute 1 / 5 / 10 / 20 px of image size, not a percentage. The
  // finest correction is therefore exactly one screen pixel whatever the image
  // resolution is. A percentage step would be resolution-dependent, and at the
  // 1 px end it would not even move a percentage readout - which is why the chip
  // shows the rendered width instead.
  const ZOOM_STEPS_PX = [1, 5, 10, 20];
  const SWIPE_REPEAT_MAX = ZOOM_STEPS_PX.length - 1; // deepest rung a run can reach
  // Alignment band, RELATIVE to the zoom in effect when the dial took over
  // (`alignSeed`), so the guarantee "a stray gesture cannot lose the image"
  // holds whatever the unlocked pinch-zoom left behind. With the usual seed of 1
  // (locked at the plain fit) this is the familiar 0.85-1.30.
  const ALIGN_MIN = 0.85;
  const ALIGN_MAX = 1.30;
  const DIAL_HOLD_MS = 2000;       // chip stays expanded this long after a gesture
  const GESTURE_TIMING = {
    doublePressMs: DOUBLE_PRESS_MS,
    homeMs: GESTURE_HOME_MS,
    repeatMs: SWIPE_REPEAT_MS,
  };

  // adjustable state, persisted
  let alpha = 0.6;   // 0..1
  let gridOn = false;
  let gridCell = 64; // image px (world px) per grid cell
  let locked = false;
  // peek the projected reference while tracing: a quick screen tap in the image
  // area when Lock is on sets the overlay opacity to 0 (revealing the surface)
  // and remembers the current opacity, so the next tap restores it. The grid is
  // always drawn regardless of opacity. Only meaningful in the flat projection.
  let restoreAlpha = 0.6; // opacity to bring back after a hide-peek
  // a short screen tap in the image area while Lock is on peeks the reference
  // (see peekHide above); an up/down swipe steps image opacity by one fixed
  // increment per completed gesture (up = more opaque, down = more transparent).
  // Tracked separately from the pan/pinch state so a tap/swipe can't pan/zoom.
  // {id, x0, y0, t0, moved, mode: 'none'|'swipe'}
  let hideTap = null;
  // ---- PHASE 0 gesture probe state (temporary) ----
  let gdbgEl = null;         // the panel, built lazily on the first report
  let gdbgLines = [];        // the last few verdict lines
  let gdbgPress = null;      // {peak, gapStart, gapEnd} for the press in flight
  let gdbgLastStart = 0;     // press-start time of the previous accepted press
  let gdbgLastEnd = 0;       // release time of the previous accepted press
  const gdbgStat = {
    taps: 0, tapMin: Infinity, tapMax: 0, tapLast: 0,
    swipes: 0, swMin: Infinity, swMax: 0, swLast: 0,
    gaps: 0, gapMin: Infinity, gapLast: 0,
  };
  // ---- gesture mode dial state ----
  // `alignScale` is the fine alignment zoom: a multiplier applied on top of the
  // fit-to-screen scale, so a drooping mount (which scales the feed) can be
  // re-matched without touching the screen. Persisted; OPACITY keeps its fixed
  // ±10% swipe step (unchanged behaviour), so only ZOOM climbs the rung ladder.
  let alignScale = 1;
  // Band centre: the effective zoom over the fit at the moment the dial took
  // over. The view is free to pinch-zoom while unlocked, so this must be seeded
  // from what is on screen or the first ZOOM gesture snaps back to the fit.
  let alignSeed = 1;
  let gState = gestureInit();   // pure state machine state (see gestureStep)
  let gTimer = 0;               // pending tick: deferred press / auto-home
  let dialTimer = 0;            // chip collapse timer
  // display the projected photo (and the pinning reference photo) in
  // greyscale, so the traced tonal values are easier to read. Display-only:
  // the main colour canvas and the generated line/sketch drawing are
  // unaffected.
  let greyOn = false;
  // HUD minimise: hides the lower control bar so it doesn't obscure the feed.
  // While pinning the image on small screens it is auto-minimised.
  let hudMin = false;       // user asked to minimise
  let hudUserOpen = false;  // user re-opened while auto-min would apply
  let hudSmall = false;

  // line-drawing state (turns the projected image into a traced line art)
  let lineOn = false;
  let lineBlur = 6;      // edge blur radius (image px, box-approx)
  let lineStrength = 0.55; // 0..1 : higher => more/thicker edges kept
  let lineKey = 0;       // 0..1 : white background -> transparent (luminance key)
  let lineMagenta = false; // show a magenta backing so transparent paper is visible
  let lineCanvas = null;   // offscreen result (same px size as the reference)
  let lineWorkW = 0, lineWorkH = 0;
  let lineToken = 0;
  let lineScheduled = false;

  // ---- augmented-reality (surface pinning) state ----
  // mode: 'off' -> normal projection view; 'setup' -> picking pins;
  //       'on'   -> showing the warped image pinned to the surface.
  // During 'setup', `arPhase` is 'image' (tapping the fullscreen photo to
  // place the 4 source points) then 'surface' (tapping the live view for the
  // 4 matching destination points). All pinning happens on the single main
  // fullscreen canvas; the small preview panel is no longer used.
  let arMode = 'off';
  let arPhase = 'image';
  let arMagnet = true;   // snap source points to grid intersections when pinning
  let arSrc = [];    // 4 image-space {x,y} points
  let arDst = [];    // 4 overlay-space {x,y} points (matching order)
  let arH = null;    // cached homography (image -> overlay)
  let arWarpCanvas = null; // precomputed warped RGBA at device resolution
  let arMap = null;       // {sx,sy,dx,dy,scale} css<->image map while pinning image
  let arLastMapW = 0, arLastMapH = 0; // canvas dims the map was built for
  // magnifier loupe used while placing AR pins (like the colour sampler)
  let arLoupe = { active: false, x: 0, y: 0 };   // css coords of its centre
  let arDragPtr = null;     // pointer id currently dragging the loupe
  let arLoopId = 0;         // rAF id for live-surface loupe refresh
  // fine pin adjustment once a map is active ('on'): reveal the four surface
  // pins as draggable handles so the user can make tiny final corrections to
  // the alignment (the pins only resolve to ~1px during setup).
  let arEdit = false;        // pin-adjust mode active
  let arFine = true;         // scale pointer movement by 1/AR_FINE for sub-px
  let arDragIdx = -1;        // surface pin index being dragged
  let arEditPtr = null;      // pointer id dragging a pin in adjust mode
  let arDragBase = null;     // {px,py} pointer start css pos while dragging
  let arDragPin0 = null;     // {x,y} pin position at drag start

  let els = null;      // DOM element handles
  let canvasCtx = null;
  let dpr = 1;
  let cssW = 0, cssH = 0;

  const pointers = new Map();
  let panLast = null;
  let pinchLast = null;
  let dragLock = false; // true once an overlay canvas has a stream-ready video

  /* ---------- persistence ---------- */
  function loadPrefs() {
    // Every session starts from the plain fit. A persisted *fine* factor is
    // restored below, but an out-of-band one is rejected - so a large unlocked
    // zoom from a previous run cannot leak into this one through the variable.
    alignScale = 1;
    alignSeed = 1;
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.alpha === 'number') alpha = p.alpha;
        if (typeof p.grid === 'boolean') gridOn = p.grid;
        if (typeof p.gridCell === 'number') gridCell = p.gridCell;
        if (typeof p.grey === 'boolean') greyOn = p.grey;
        if (typeof p.line === 'boolean') lineOn = p.line;
        if (typeof p.lineBlur === 'number') lineBlur = p.lineBlur;
        if (typeof p.lineStrength === 'number') lineStrength = p.lineStrength;
        if (typeof p.lineKey === 'number') lineKey = p.lineKey;
        if (typeof p.lineMagenta === 'boolean') lineMagenta = p.lineMagenta;
        if (typeof p.feedOn === 'boolean') feedOn = p.feedOn;
        if (typeof p.feedS === 'number' && p.feedS >= 1) feedS = p.feedS;
        if (typeof p.feedTx === 'number') feedTx = p.feedTx;
        if (typeof p.feedTy === 'number') feedTy = p.feedTy;
        // until a live track's zoom capability is probed, all magnification is CSS
        feedCss = feedS;
        feedSensorZoom = 1;
        if (typeof p.arMagnet === 'boolean') arMagnet = p.arMagnet;
        if (typeof p.arFine === 'boolean') arFine = p.arFine;
        if (typeof p.align === 'number' && p.align >= ALIGN_MIN && p.align <= ALIGN_MAX) alignScale = p.align;
      }
    } catch (e) { /* ignore */ }
    try {
      const c = localStorage.getItem(CAM_KEY);
      if (c === 'user' || c === 'environment') facing = c;
    } catch (e) { /* ignore */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ alpha, grid: gridOn, gridCell, grey: greyOn, line: lineOn, lineBlur, lineStrength, lineKey, lineMagenta, feedOn, feedS, feedTx, feedTy, arMagnet, arFine, align: alignScale }));
      localStorage.setItem(CAM_KEY, facing);
    } catch (e) { /* ignore */ }
  }

  /* ---------- pure image-space helpers (unit-testable) ---------- */

  /* View that contains the whole image within cssW x cssH with `pad` margin.
     cx, cy is the image point shown at the canvas centre; scale is css px
     per image px. */
  function computeFit(imageW, imageH, cssW, cssH, pad) {
    pad = (pad === undefined ? 24 : pad);
    const w = Math.max(1, cssW - pad * 2);
    const h = Math.max(1, cssH - pad * 2);
    const scale = Math.min(w / imageW, h / imageH);
    return { scale, cx: imageW / 2, cy: imageH / 2 };
  }

  /* Grid line positions in image px for a cell size, from 0 up to size.
     Guarantees a line at 0 and one at size, plus each multiple of cell. */
  function gridLines(size, cell) {
    const out = [];
    cell = Math.max(1, cell);
    const n = Math.floor(size / cell);
    for (let i = 0; i <= n; i++) out.push(i * cell);
    if (out[out.length - 1] !== size) out.push(size);
    return out;
  }

  /* Snap a value (image px) to the nearest grid line (multiple of cell). */
  function snapToGrid(v, cell) {
    cell = Math.max(1, cell);
    return Math.round(v / cell) * cell;
  }

  /* Four alignment markers at the third-lines (1/3 and 2/3 of width/height),
     each snapped to the nearest grid intersection in image px. Order is
     (1/3,1/3), (2/3,1/3), (1/3,2/3), (2/3,2/3). They give the user a default
     image pinning / paper-marking set that lines up with the drawn grid. */
  function thirdLineMarkers(iw, ih, cell) {
    const xs = [snapToGrid(iw / 3, cell), snapToGrid((iw * 2) / 3, cell)];
    const ys = [snapToGrid(ih / 3, cell), snapToGrid((ih * 2) / 3, cell)];
    const out = [];
    for (const x of xs) for (const y of ys) out.push({ x, y });
    return out;
  }

  /* Clamp a desired centre so the image can't be panned completely off the
     viewport (leaves at least a margin proportional to the viewport). */
  function clampCentre() {
    const st = imageInfo();
    if (!st) return;
    const halfW = cssW / 2 / view.scale;
    const halfH = cssH / 2 / view.scale;
    const margin = 0.25; // fraction of the viewport the image must still overlap
    view.cx = Math.max(-halfW * margin, Math.min(st.width + halfW * margin, view.cx));
    view.cy = Math.max(-halfH * margin, Math.min(st.height + halfH * margin, view.cy));
  }

  function clampScale(sc) {
    return Math.max(0.02, Math.min(64, sc));
  }

  /* ---------- line-drawing engine (pure, testable) ----------

     Turns an image into a dark-on-white line drawing (tracing reference).
     The algorithm follows the classic "photo to sketch/line-art" method:
       1. BT.601 luminance ("grayscale").
       2. Blur that luminance (a blurred second copy).
       3. Take the difference |original - blurred|: flat regions cancel to
          ~0 (white) and only strong local contrast (edges/lines) survives.
       4. Map edge strength through a threshold so weak noise vanishes and
          real edges become dark strokes; everything else stays white.
     `blur` widens each edge's blur radius (thicker vs. thinner detection),
     `strength` (0..1) lowers the threshold so more edges are kept and drawn
     more heavily.  Returns a new RGBA Uint8ClampedArray (w*h*4). */

  function luminanceOf(rgba, w) {
    const n = rgba.length / 4;
    const g = new Float32Array(n);
    for (let i = 0, o = 0; i < rgba.length; i += 4, o++) {
      g[o] = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255;
    }
    return g;
  }

  /* ---- separable box blur (gaussian approximation) ----
     gray is row-major 1-channel Float32Array of length w*h.
     Each pass is O(w*h), independent of radius, via prefix sums with
     clamped edges. BoxBlurH then BoxBlurV approximates a gaussian. */
  function boxBlurH(gray, w, h, radius) {
    const r = Math.max(1, Math.floor(radius));
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const prefix = new Float32Array(w + 1);
      for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + gray[row + x];
      for (let x = 0; x < w; x++) {
        const lo = Math.max(0, x - r);
        const hi = Math.min(w - 1, x + r);
        out[row + x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
      }
    }
    return out;
  }

  function boxBlurV(gray, w, h, radius) {
    const r = Math.max(1, Math.floor(radius));
    const out = new Float32Array(gray.length);
    for (let x = 0; x < w; x++) {
      const prefix = new Float32Array(h + 1);
      for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + gray[y * w + x];
      for (let y = 0; y < h; y++) {
        const lo = Math.max(0, y - r);
        const hi = Math.min(h - 1, y + r);
        out[y * w + x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
      }
    }
    return out;
  }

  function boxBlur(gray, w, h, radius) {
    return boxBlurV(boxBlurH(gray, w, h, radius), w, h, radius);
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* smoothstep edge gate in [0,1] */
  function edgeGate(d, threshold) {
    const soft = 0.18;
    let x = clamp01((d - threshold) / soft);
    return x * x * (3 - 2 * x);
  }

  function lineDrawingFromGray(gray, w, h, blur, strength) {
    const blurred = boxBlur(gray, w, h, blur);
    const threshold = Math.max(0, Math.min(1, 0.5 * (1 - strength)));
    const out = new Uint8ClampedArray(gray.length * 4);
    for (let i = 0; i < gray.length; i++) {
      const d = Math.abs(gray[i] - blurred[i]); // edge magnitude 0..1
      const gate = edgeGate(d, threshold);
      const line = 1 - gate; // 1 = white paper, 0 = black stroke
      const v = Math.round(255 * line);
      const o = i * 4;
      out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255;
    }
    return out;
  }

  /* end-to-end on RGBA: public entry point used by the module + tests */
  function makeLineDrawing(rgba, w, h, blur, strength) {
    return lineDrawingFromGray(luminanceOf(rgba, w), w, h, blur, strength);
  }

  /* ---- white-background -> alpha (luminance key) ----
     The line drawing is rendered as dark strokes on white paper. This keys
     the paper to transparency so the strokes can be overlaid/masked onto a
     surface (and verified against a magenta backing).

     The input is greyscale RGBA where v = 255*line (v=255 paper, v=0 stroke).
     Ink darkness d = 1 - v/255 (0 paper, 1 stroke).
       alpha = lerp(255, 255*d, amount)   // amount 0 => opaque (original);
                                          // amount 1 => white->0, black->255
       rgb   = lerp(v, 0, amount)         // strokes turn black as keying rises
     amount 0..1. Smooth and off at 0, clean black strokes at 1. */
  function keyWhiteToAlpha(rgba, w, h, amount) {
    const a = Math.max(0, Math.min(1, amount));
    const out = new Uint8ClampedArray(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      const v = rgba[i]; // greyscale
      const ink = 1 - v / 255;
      const alpha = Math.round(255 * (1 - a) + 255 * ink * a);
      const rgb = Math.round(v * (1 - a));
      out[i] = rgb; out[i + 1] = rgb; out[i + 2] = rgb; out[i + 3] = alpha;
    }
    return out;
  }

  /* ---------- homography engine (pure, testable) ----------

     A planar homography is a 3x3 projective matrix H (row-major, 9 entries)
     mapping image points p=(x,y,1) to surface points q ~ H p, where
       qx = (h0 x + h1 y + h2) / (h6 x + h7 y + h8)
       qy = (h3 x + h4 y + h5) / (h6 x + h7 y + h8)
     Four point correspondences (src[i] <-> dst[i], no 3 collinear) give 8
     constraints -> solve up to scale. We fix h8 = 1 (valid when the mapping
     is finite/non-degenerate in practice) and solve an 8x8 linear system. */

  function invert3(a) {
    const [a0,a1,a2,a3,a4,a5,a6,a7,a8] = a;
    const d = a0*(a4*a8 - a5*a7) - a1*(a3*a8 - a5*a6) + a2*(a3*a7 - a4*a6);
    if (Math.abs(d) < 1e-12) return null;
    const inv = 1 / d;
    return [
      (a4*a8 - a5*a7)*inv, (a2*a7 - a1*a8)*inv, (a1*a5 - a2*a4)*inv,
      (a5*a6 - a3*a8)*inv, (a0*a8 - a2*a6)*inv, (a2*a3 - a0*a5)*inv,
      (a3*a7 - a4*a6)*inv, (a1*a6 - a0*a7)*inv, (a0*a4 - a1*a3)*inv,
    ];
  }

  /* apply homography h (row-major 3x3) to point p -> {x,y} */
  function applyHomography(h, x, y) {
    const w = h[6]*x + h[7]*y + h[8];
    if (Math.abs(w) < 1e-12) return { x: x, y: y };
    return { x: (h[0]*x + h[1]*y + h[2]) / w, y: (h[3]*x + h[4]*y + h[5]) / w };
  }

  /* solve 8x8 A x = b via Gaussian elimination with partial pivoting.
     Returns x (length 8) or null when singular. */
  function solve8(A, b) {
    const m = A.map((row) => row.slice());
    const r = b.slice();
    const n = 8;
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(m[row][col]) > Math.abs(m[piv][col])) piv = row;
      }
      if (Math.abs(m[piv][col]) < 1e-10) return null;
      if (piv !== col) {
        const tmp = m[col]; m[col] = m[piv]; m[piv] = tmp;
        const tb = r[col]; r[col] = r[piv]; r[piv] = tb;
      }
      const d = m[col][col];
      for (let c = 0; c < n; c++) m[col][c] /= d;
      r[col] /= d;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const f = m[row][col];
        if (Math.abs(f) < 1e-12) continue;
        for (let c = 0; c < n; c++) m[row][c] -= f * m[col][c];
        r[row] -= f * r[col];
      }
    }
    return r;
  }

  /* Build homography from 4 correspondences (each {x,y} in its own space).
     src: image points; dst: surface/video points. Returns row-major 3x3 or
     null if degenerate (e.g. 3 collinear). */
  function computeHomography(src, dst) {
    if (!src || !dst || src.length !== 4 || dst.length !== 4) return null;
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const x = src[i].x, y = src[i].y;
      const u = dst[i].x, v = dst[i].y;
      // u row: h0 x + h1 y + h2            - h6 u x - h7 u y = u
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      // v row:            h3 x + h4 y + h5 - h6 v x - h7 v y = v
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const sol = solve8(A, b);
    if (!sol) return null;
    const [h0,h1,h2,h3,h4,h5,h6,h7] = sol;
    return [h0,h1,h2,h3,h4,h5,h6,h7,1];
  }

  /* Forward map an image-space coordinate (used to draw grid lines and
     pin markers that ride on the warped image). */
  function forward(src, dst, sx, sy) {
    const h = computeHomography(src, dst);
    if (!h) return null;
    return applyHomography(h, sx, sy);
  }

  /* ---------- current image ---------- */
  function imageInfo() {
    if (!global.CP || !global.CP.state) return null;
    const orig = global.CP.state.imageOriginal;
    const cur = global.CP.state.image;
    const src = orig || cur;
    if (!src) return null;
    return { canvas: src.canvas, width: src.width, height: src.height };
  }

  /* The reference actually being projected/traced. When line mode is active
     this is the generated line-drawing canvas (same pixel size as the image);
     otherwise it is the original photo. AR pinning, the loupe and the warp
     must all use this same source so the points you pin match what you trace. */
  function arActiveSource() {
    const base = imageInfo();
    if (!base) return null;
    if (lineOn && lineCanvas) {
      return { canvas: lineCanvas, width: base.width, height: base.height };
    }
    return base;
  }

  /* ---------- view math (screen px <-> image px) ---------- */
  function worldFromScreen(sx, sy) {
    return {
      x: (sx - cssW / 2) / view.scale + view.cx,
      y: (sy - cssH / 2) / view.scale + view.cy,
    };
  }
  function screenFromWorld(wx, wy) {
    return {
      x: (wx - view.cx) * view.scale + cssW / 2,
      y: (wy - view.cy) * view.scale + cssH / 2,
    };
  }

  /* ---------- rendering ---------- */
  function render() {
    const ctx = canvasCtx;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const img = imageInfo();
    if (!img) return;

    // In AR mode we draw the precomputed perspective warp instead of the
    // flat pan/zoom reference.
    if (arMode === 'on' && arWarpCanvas) {
      drawArWarp();
      if (arEdit) {
        drawArEditHandles();
        drawArAdjustLoupe();
      } else {
        drawArDstMarkers();
      }
      return;
    }
    if (arMode === 'setup') {
      // Fullscreen pinning on this one big canvas:
      //  - image phase: the photo fills the canvas so the 4 source points can
      //    be aimed precisely (no tiny side panel).
      //  - surface phase: the photo hides, the live feed shows through, and
      //    the green destination markers are drawn over it.
      if (arPhase === 'image') {
        drawArImagePhase();
      } else {
        drawArDstMarkers();
      }
      arDrawLoupe(); // magnifier while a pin is being aimed
      return;
    }

    // line mode swaps the projected reference for a generated line drawing.
    // When the overlay opacity is 0 the reference (and any magenta backing) is
    // skipped entirely so the surface shows through; the grid is drawn after.
    const src = (lineOn && lineCanvas) ? lineCanvas : img.canvas;
    const useLine = lineOn && lineCanvas;

    if (alpha > 0) {
      ctx.save();
      // When the magenta backing is on, hide the camera behind the line art so
      // the keyed-to-transparent paper reads magenta and the black strokes are
      // easy to judge against it. Drawn at full opacity as a diagnostic.
      const alphaToUse = (useLine && lineMagenta) ? 1 : alpha;
      if (useLine && lineMagenta) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, cssW, cssH);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      // greyscale the projected photo (never the line/sketch drawing) so tonal
      // values are easier to judge; display-only, the main canvas is untouched.
      if (!useLine && greyOn) ctx.filter = 'grayscale(1)';
      ctx.globalAlpha = alphaToUse;
      ctx.translate(cssW / 2, cssH / 2);
      ctx.scale(view.scale, view.scale);
      ctx.translate(-view.cx, -view.cy);
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    }

    if (gridOn) drawGrid(img.width, img.height);
  }

  function drawGrid(iw, ih) {
    const ctx = canvasCtx;
    if (!ctx) return;
    const vs = gridLines(iw, gridCell);
    const hs = gridLines(ih, gridCell);

    ctx.save();
    // 1 css-px crisp lines regardless of zoom
    ctx.translate(cssW / 2, cssH / 2);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-view.cx, -view.cy);
    ctx.lineWidth = 1 / view.scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (const x of vs) { ctx.moveTo(x, 0); ctx.lineTo(x, ih); }
    for (const y of hs) { ctx.moveTo(0, y); ctx.lineTo(iw, y); }
    ctx.stroke();
    // emphasise the image border
    ctx.lineWidth = 2 / view.scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeRect(0, 0, iw, ih);
    // third-line guide markers (snapped to the grid)
    drawThirdMarkers(ctx, iw, ih, view.scale);
    ctx.restore();
  }

  /* Small cross markers at the third-lines of the image, snapped to the grid.
     Drawn in image-space coordinates; `ctx` must already have the image-space
     transform applied. `scale` = image px per css px so strokes stay crisp. */
  function drawThirdMarkers(ctx, iw, ih, scale) {
    const markers = thirdLineMarkers(iw, ih, gridCell);
    const half = 9 / scale; // css-ish half-size converted to image units
    ctx.strokeStyle = 'rgba(255,120,40,0.95)';
    ctx.lineWidth = 2 / scale;
    ctx.globalAlpha = 1;
    for (const m of markers) {
      if (m.x < 0 || m.y < 0 || m.x > iw || m.y > ih) continue;
      ctx.beginPath();
      ctx.moveTo(m.x - half, m.y); ctx.lineTo(m.x + half, m.y);
      ctx.moveTo(m.x, m.y - half); ctx.lineTo(m.x, m.y + half);
      ctx.stroke();
    }
  }

  /* ---------- view actions ---------- */
  /* The view an alignment change should produce. Only the scale changes: `cx`/
     `cy` name the image point shown at the screen centre, so leaving them alone
     keeps that point exactly where it is and a fine-zoom step cannot move the
     image. `recentre` (a plain fit) puts it back at the image centre, which is
     the only thing that is allowed to discard a pan. */
  function alignView(v, scale, recentre, imgW, imgH) {
    return {
      scale: scale,
      cx: recentre ? imgW / 2 : v.cx,
      cy: recentre ? imgH / 2 : v.cy,
    };
  }

  /* Fit the image to the screen and apply the fine alignment zoom on top. The
     base fit is recomputed from the current viewport every time (never cached),
     so a rotation cannot leave a stale base behind. Only a plain fit
     (`recentre`) moves the image; alignment steps keep whatever pan the user
     set before locking. */
  function applyAlign(recentre) {
    const img = imageInfo();
    if (!img) { requestRender(); return; }
    const next = alignView(view, clampScale(alignBaseScale() * alignScale), recentre, img.width, img.height);
    view.scale = next.scale;
    view.cx = next.cx;
    view.cy = next.cy;
    clampCentre();
    requestRender();
  }

  /* A plain fit: recentre on the image and drop any pan (session start and the
     Fit image button land here). */
  function fit() { applyAlign(true); }

  /* The alignment band, centred on the zoom that was in effect when the dial
     took over. `alignScale` is anchored to the fit-to-screen scale, so seeding
     the band from the live view is what stops the first ZOOM gesture from
     snapping away an unlocked pinch-zoom. */
  function alignBand(seed) {
    const s = (isFinite(seed) && seed > 0) ? seed : 1;
    return { lo: s * ALIGN_MIN, hi: s * ALIGN_MAX };
  }

  /* Clamp an alignment factor into its band. A non-finite value must never reach
     clampScale - it would propagate into the canvas transform and blank the
     image - so it falls back to the plain fit. */
  function clampAlign(v, seed) {
    if (!isFinite(v)) return 1;
    const b = alignBand(seed);
    return Math.max(b.lo, Math.min(b.hi, v));
  }

  /* Set the alignment zoom (clamped to the active band) and re-apply it. The
     pan is deliberately left alone, so a ZOOM gesture can never move the image. */
  function setAlignScale(v, persist) {
    alignScale = clampAlign(v, alignSeed);
    applyAlign(false);
    if (persist !== false) savePrefs();
    gestureChipSync();
  }

  /* Adopt the zoom actually on screen as the band centre. Called when the dial
     takes over (Lock): until then the view was free to pan/zoom via zoomAt and
     `alignScale` no longer described what was displayed. */
  function seedAlignFromView() {
    const img = imageInfo();
    if (!img) return;
    const f = computeFit(img.width, img.height, cssW, cssH, 24);
    const base = Math.max(0.05, Math.min(4, f.scale));
    const cur = base > 0 ? clampScale(view.scale / base) : 1;
    alignScale = cur;
    alignSeed = cur;
  }

  /* The scale a plain fit would use right now (css px per image px). */
  function alignBaseScale() {
    const img = imageInfo();
    if (!img) return 1;
    const f = computeFit(img.width, img.height, cssW, cssH, 24);
    return Math.max(0.05, Math.min(4, f.scale));
  }

  /* The `alignScale` delta that changes the rendered image WIDTH by `px` screen
     px: rendered width = imgW * base * alignScale, so the same pixel step means
     the same on-screen nudge at any zoom. Degenerate input is inert, never NaN. */
  function alignStepDelta(px, dir, imgW, base) {
    if (!(imgW > 0) || !(base > 0) || !isFinite(px)) return 0;
    return (dir * px / imgW) / base;
  }

  /* ZOOM's rung for the current repeat depth: the step is a pixel count, and
     each rapid repeat climbs one rung (see ZOOM_STEPS_PX). `dir` is +1 for up/
     right (bigger) and -1 for down/left (smaller); being additive, a step and
     its inverse cancel exactly. */
  function alignZoomStep(dir, rung) {
    const img = imageInfo();
    if (!img) return;
    const i = Math.max(0, Math.min(ZOOM_STEPS_PX.length - 1, Math.round(rung) || 0));
    setAlignScale(alignScale + alignStepDelta(ZOOM_STEPS_PX[i], dir, img.width, alignBaseScale()));
  }

  /* The image's rendered width in css px - the unit the ZOOM stop works in. */
  function renderedWidth() {
    const img = imageInfo();
    if (!img) return 0;
    return Math.round(img.width * view.scale);
  }

  /* Reset the alignment (and the pan) to a plain fit. Deliberately reachable
     only from the Fit image button - never from a gesture (see STOP_PRESS). */
  function fitReset() {
    alignScale = 1;
    alignSeed = 1;
    applyAlign(true);
    savePrefs();
    gestureChipSync();
  }

  function pan(dxScreen, dyScreen) {
    view.cx -= dxScreen / view.scale;
    view.cy -= dyScreen / view.scale;
    clampCentre();
    requestRender();
  }

  /* ---------- live feed zoom (video element transform) ----------
     The feed is magnified by a CSS transform on the <video>: screen = t + s*p.
     transform-origin 0 0 keeps the math linear. Only the camera moves; the
     drawn overlay does not (accepted drift). Feed gestures are frozen by the
     Lock button along with the overlay.

     When the active camera track reports a real `zoom` capability we drive that
     (sensor / device zoom) as far as it can go and only CSS-upscale the
     remainder, so close-up detail comes from the sensor rather than pure
     re-sampling. `feedS` is the total requested magnification (>=1). The split
     is pure/testable and degrades to CSS-only when the track has no zoom. */

  // ---- split the total magnification into sensor zoom + CSS scale ----
  // cap = track capability {min,max,step} or null. sensor carries as much of the
  // magnification as the device allows (>=1), the rest is CSS upscale (>=1) so
  // total == sensor * css. If no usable zoom the sensor part stays 1.
  function splitFeedZoom(total, cap) {
    const t = Math.max(1, total);
    if (!cap || !(cap.max > 1)) return { sensor: 1, css: t };
    const smax = Math.max(1, cap.max);
    const smin = Math.max(1, cap.min || 1);
    const sensor = Math.max(smin, Math.min(smax, t));
    const css = Math.max(1, t / sensor);
    return { sensor, css };
  }

  // recompute the CSS scale actually applied to the <video> and (re)issue the
  // sensor zoom constraint, coalesced so rapid zoom gestures don't spam it.
  // Callers must call applyFeedTransform() after layout is ready.
  function syncFeedZoom() {
    const split = splitFeedZoom(feedS, feedSensorCap);
    feedCss = split.css;
    feedSensorZoom = split.sensor;
    if (feedSensorCap) queueSensorZoom(feedSensorZoom);
  }

  function queueSensorZoom(value) {
    if (!stream) return;
    const track = stream.getVideoTracks && stream.getVideoTracks()[0];
    if (!track || !track.applyConstraints) return;
    // round to the track's step when given, staying within min/max
    let v = value;
    if (feedSensorCap) {
      const min = Math.max(1, feedSensorCap.min || 1);
      const max = Math.max(min, feedSensorCap.max || min);
      const step = feedSensorCap.step && feedSensorCap.step > 0 ? feedSensorCap.step : 0;
      if (step) v = min + Math.round((v - min) / step) * step;
      v = Math.max(min, Math.min(max, v));
    }
    feedSensorPending = v;
    if (feedSensorQueued) return;
    feedSensorQueued = setTimeout(() => {
      feedSensorQueued = 0;
      const vv = feedSensorPending;
      if (!stream) return;
      const tr = stream.getVideoTracks && stream.getVideoTracks()[0];
      if (!tr || !tr.applyConstraints) return;
      try {
        tr.applyConstraints({ advanced: [{ zoom: vv }] }).catch(() => {});
      } catch (e) { /* unsupported at apply time */ }
    }, 40);
  }

  /* probe the live camera for a real zoom constraint. Some browsers only expose
     `zoom` after an ImageCapture is constructed on the track, so we try that. */
  function detectSensorZoom() {
    feedSensorCap = null;
    feedSensorZoom = 1;
    feedCss = feedS;
    if (!stream) return;
    const track = stream.getVideoTracks && stream.getVideoTracks()[0];
    if (!track) return;
    // keep a reference alive; required by some engines before zoom appears
    try {
      if (global.ImageCapture && !feedSensorImageCapture) {
        feedSensorImageCapture = new global.ImageCapture(track);
      }
    } catch (e) { /* no ImageCapture */ }
    let caps = null;
    try { caps = track.getCapabilities && track.getCapabilities(); } catch (e) { /* ignore */ }
    const z = caps && caps.zoom;
    if (z && typeof z.max === 'number' && z.max > 1) {
      feedSensorCap = {
        min: typeof z.min === 'number' ? z.min : 1,
        max: z.max,
        step: typeof z.step === 'number' ? z.step : 0,
      };
    }
    syncFeedZoom();
  }

  function applyFeedTransform() {
    if (!els || !els.video) return;
    // The feed zoom/pan is a persistent state and is applied whether or not the
    // "Zoom feed" button is on. That button only chooses which layer (feed or
    // image) the pan/zoom gestures control; it does not reset the feed view.
    feedS = Math.max(1, Math.min(FEED_MAX, feedS));
    feedCss = Math.max(1, feedCss || feedS);
    clampFeedPan();
    els.video.style.transformOrigin = '0 0';
    els.video.style.transform = `translate(${feedTx}px, ${feedTy}px) scale(${feedCss})`;
  }

  /* keep the pan from flinging the feed so far that it leaves the viewport */
  function clampFeedPan() {
    const margin = 0.85; // fraction of viewport the feed may slide
    const limX = cssW * (feedCss - 1) * 0.5 + cssW * margin;
    const limY = cssH * (feedCss - 1) * 0.5 + cssH * margin;
    feedTx = Math.max(-limX, Math.min(limX, feedTx));
    feedTy = Math.max(-limY, Math.min(limY, feedTy));
  }

  function feedZoomAt(sx, sy, factor) {
    const ns = Math.max(1, Math.min(FEED_MAX, feedS * factor));
    // keep the content point under (sx,sy) stationary while scaling the CSS
    // layer (sensor zoom re-centres on its own and has no pan)
    const px = (sx - feedTx) / feedCss;
    const py = (sy - feedTy) / feedCss;
    feedS = ns;
    syncFeedZoom();               // splits the new total into sensor + css
    feedTx = sx - px * feedCss;
    feedTy = sy - py * feedCss;
    clampFeedPan();
    applyFeedTransform();
  }

  function feedZoomBy(factor) {
    feedZoomAt(cssW / 2, cssH / 2, factor);
  }

  function feedPan(dxScreen, dyScreen) {
    feedTx += dxScreen;
    feedTy += dyScreen;
    clampFeedPan();
    applyFeedTransform();
  }

  function feedReset() {
    feedS = 1; feedTx = 0; feedTy = 0;
    syncFeedZoom();
    applyFeedTransform();
    savePrefs();
  }

  function setFeedOn(v) {
    feedOn = !!v;
    if (els) {
      els.feedToggle.setAttribute('aria-pressed', feedOn ? 'true' : 'false');
      els.feedToggle.classList.toggle('is-on', feedOn);
      const label = els.feedToggle.querySelector('[data-i18n]') || els.feedToggle;
      label.textContent = I18N.t(feedOn ? 'traceFeedOn' : 'traceFeedZoom');
    }
    // note: feedS/feedTx/feedTy are intentionally left unchanged when turning
    // off, so re-enabling feed zoom restores the last zoom & pan (persistent)
    applyFeedTransform();
    savePrefs();
    requestRender();
  }

  /* Feed zoom is only meaningful in the plain projection view (no AR pinning
     in progress). While AR points are being placed or mapped the pointer
     gestures belong to the loupe/pins, so feed zoom is disabled then. */
  function isFeedActive() {
    return active && feedOn && arMode === 'off' && !locked;
  }

  function zoomAt(sx, sy, factor) {
    const before = worldFromScreen(sx, sy);
    view.scale = clampScale(view.scale * factor);
    view.cx = before.x - (sx - cssW / 2) / view.scale;
    view.cy = before.y - (sy - cssH / 2) / view.scale;
    clampCentre();
    requestRender();
  }

  let rafPending = false;
  function requestRender() {
    if (!active) return;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; render(); });
  }

  /* ---------- line-drawing pipeline (runs against the live source) ---------- */

  function scheduleLineRecompute() {
    if (lineScheduled) return;
    lineScheduled = true;
    // coalesce to the last frame so fast slider drags don't spam work
    requestAnimationFrame(() => {
      lineScheduled = false;
      recomputeLine();
    });
  }

  function recomputeLine() {
    const img = imageInfo();
    if (!img) return;
    const token = ++lineToken;
    // work at a bounded resolution; box blur is O(w*h) so this stays cheap
    const MAX = 1400;
    const k = Math.min(1, MAX / Math.max(img.width, img.height));
    lineWorkW = Math.max(4, Math.round(img.width * k));
    lineWorkH = Math.max(4, Math.round(img.height * k));
    const work = document.createElement('canvas');
    work.width = lineWorkW;
    work.height = lineWorkH;
    const wctx = work.getContext('2d');
    wctx.drawImage(img.canvas, 0, 0, img.width, img.height, 0, 0, lineWorkW, lineWorkH);
    let data;
    try { data = wctx.getImageData(0, 0, lineWorkW, lineWorkH).data; }
    catch (e) { return; }
    // scale the blur radius to the working resolution too
    let out = makeLineDrawing(data, lineWorkW, lineWorkH, lineBlur * k, lineStrength);
    // optionally key the white paper to transparency (baked into real output)
    if (lineKey > 0) out = keyWhiteToAlpha(out, lineWorkW, lineWorkH, lineKey);
    const id = wctx.createImageData(lineWorkW, lineWorkH);
    id.data.set(out);
    wctx.putImageData(id, 0, 0);

    // ensure lineCanvas matches source pixel size so the grid stays aligned
    if (!lineCanvas || lineCanvas.width !== img.width || lineCanvas.height !== img.height) {
      lineCanvas = document.createElement('canvas');
      lineCanvas.width = img.width;
      lineCanvas.height = img.height;
    }
    const lctx = lineCanvas.getContext('2d');
    lctx.imageSmoothingEnabled = true;
    lctx.clearRect(0, 0, img.width, img.height);
    lctx.drawImage(work, 0, 0, lineWorkW, lineWorkH, 0, 0, img.width, img.height);
    if (token === lineToken && lineOn) {
      // a fresh line drawing was produced; refresh any active AR surface map
      arRebuildWarpIfActive();
      requestRender();
    }
  }

  /* ---------- HUD updates ---------- */
  function setAlpha(v, persist) {
    alpha = Math.max(0, Math.min(1, v));
    if (els) {
      els.alpha.value = String(Math.round(alpha * 100));
      if (els.alphaVal) els.alphaVal.textContent = Math.round(alpha * 100) + '%';
    }
    if (persist !== false) savePrefs();
    gestureChipSync();   // keep the dial's readout truthful (HUD slider too)
    requestRender();
  }

  function setGrid(v) {
    gridOn = !!v;
    if (els) els.grid.checked = gridOn;
    savePrefs();
    requestRender();
  }

  function setGridCell(px) {
    if (locked) return; // the frozen reference must not be re-gridded
    gridCell = Math.max(1, Math.round(px));
    if (els) {
      els.gridCell.value = String(gridCell);
      if (els.gridCellVal) els.gridCellVal.textContent = I18N.t('traceGridPx', { n: gridCell });
    }
    savePrefs();
    requestRender();
  }

  /* display-only greyscale of the projected / pinning reference photo */
  function setGrey(v) {
    greyOn = !!v;
    if (els && els.grey) els.grey.checked = greyOn;
    savePrefs();
    requestRender();
  }

  function setLocked(v) {
    locked = !!v;
    if (els) {
      els.lock.setAttribute('aria-pressed', locked ? 'true' : 'false');
      els.lock.classList.toggle('is-on', locked);
      const label = els.lock.querySelector('[data-i18n]') || els.lock;
      label.textContent = I18N.t(locked ? 'traceUnlockImage' : 'traceLockImage');
      // locking freezes the whole reference (image + grid), so the grid
      // spacing slider is disabled while locked
      if (els.gridCell) els.gridCell.disabled = locked;
      if (els.gridCellCtrl) els.gridCellCtrl.classList.toggle('is-locked', locked);
    }
    if (els && els.canvas) els.canvas.classList.toggle('locked', locked);
    // the gesture dial exists only while locked: start it fresh on lock, and
    // drop it (plus any deferred press) on unlock
    if (locked) { gState = gestureInit(); seedAlignFromView(); gestureChipOpen(); }
    else gestureReset();
  }

  /* Peek/hide the projected reference via opacity while tracing. A quick screen
     tap inside the image area when Lock is on hides the reference by setting its
     opacity to 0 (so the surface shows through); the grid stays on. Remember the
     current opacity so the same tap can restore it. The user can also adjust the
     opacity slider / swipe to restore gradually. */
  function peekHide() {
    if (alpha > 0) {
      restoreAlpha = alpha;      // remember what was showing
      setAlpha(0);               // hide (persists to prefs)
    } else {
      // already fully transparent: restore the last shown opacity (or default)
      setAlpha(restoreAlpha > 0 ? restoreAlpha : 0.6);
    }
  }

  /* ---------- line-drawing controls ---------- */
  let linePanelHidden = false;

  function syncLineHud() {
    if (!els) return;
    els.lineBtn.setAttribute('aria-pressed', lineOn ? 'true' : 'false');
    els.lineBtn.classList.toggle('is-on', lineOn);
    const label = els.lineBtn.querySelector('[data-i18n]') || els.lineBtn;
    label.textContent = I18N.t(lineOn ? 'traceLineOn' : 'traceLine');
    if (els.linePanel) {
      els.linePanel.hidden = !lineOn || linePanelHidden;
    }
  }

  function setLinePanel(show) {
    linePanelHidden = !show;
    if (els) els.linePanel.hidden = !lineOn || linePanelHidden;
  }

  function setLineOn(v) {
    lineOn = !!v;
    if (lineOn) {
      // always start with the white tuning panel visible
      linePanelHidden = false;
      scheduleLineRecompute();
      renderLinePreview();
    } else {
      // switching back to the photo: refresh any active AR surface map
      arRebuildWarpIfActive();
    }
    syncLineHud();
    savePrefs();
    requestRender();
  }

  function toggleLine() {
    if (!lineOn) { setLineOn(true); return; }
    // already on: reopen the collapsed tuning panel if it was hidden,
    // otherwise switch back to the normal photo
    if (linePanelHidden) setLinePanel(true);
    else setLineOn(false);
  }

  function setLineBlur(px) {
    lineBlur = Math.max(1, Math.round(px));
    if (els) {
      els.lineBlur.value = String(lineBlur);
      if (els.lineBlurVal) els.lineBlurVal.textContent = String(lineBlur);
    }
    savePrefs();
    if (lineOn) { scheduleLineRecompute(); renderLinePreview(); }
  }

  function setLineStrength(v) {
    lineStrength = Math.max(0, Math.min(1, v));
    if (els) {
      els.lineStrength.value = String(Math.round(lineStrength * 100));
      if (els.lineStrengthVal) els.lineStrengthVal.textContent = String(Math.round(lineStrength * 100));
    }
    savePrefs();
    if (lineOn) { scheduleLineRecompute(); renderLinePreview(); }
  }

  function setLineKey(v) {
    lineKey = Math.max(0, Math.min(1, v));
    if (els) {
      els.lineKey.value = String(Math.round(lineKey * 100));
      if (els.lineKeyVal) els.lineKeyVal.textContent = String(Math.round(lineKey * 100));
    }
    savePrefs();
    if (lineOn) { scheduleLineRecompute(); renderLinePreview(); requestRender(); }
  }

  function setLineMagenta(v) {
    lineMagenta = !!v;
    if (els) {
      els.lineMagenta.checked = lineMagenta;
      if (els.lineMagentaRow) els.lineMagentaRow.classList.toggle('is-on', lineMagenta);
    }
    savePrefs();
    if (lineOn) { renderLinePreview(); requestRender(); }
  }

  /* render the line result into the tuning-panel preview canvas, letterboxing
     the source so its aspect ratio is preserved. The backing is magenta when
     the magenta toggle is on (so keyed-to-transparent paper is clearly visible)
     or white otherwise. */
  function renderLinePreview() {
    if (!els || !els.lineCanvas) return;
    const img = imageInfo();
    if (!img) return;
    const p = els.lineCanvas;
    const w = p.width, h = p.height;
    const pctx = p.getContext('2d');
    // backing: magenta reveals where the white paper has been keyed transparent
    pctx.save();
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, w, h);
    pctx.fillStyle = lineMagenta ? '#ff00ff' : '#ffffff';
    pctx.fillRect(0, 0, w, h);

    // fit the source into the preview keeping its aspect ratio
    const scale = Math.min(w / img.width, h / img.height);
    const dw = Math.max(1, Math.round(img.width * scale));
    const dh = Math.max(1, Math.round(img.height * scale));
    const ox = Math.round((w - dw) / 2);
    const oy = Math.round((h - dh) / 2);

    // run the engine at the fitted size for an immediate, cheap view
    const wr = document.createElement('canvas');
    wr.width = dw; wr.height = dh;
    const wctx = wr.getContext('2d');
    wctx.drawImage(img.canvas, 0, 0, img.width, img.height, 0, 0, dw, dh);
    let data;
    try { data = wctx.getImageData(0, 0, dw, dh).data; }
    catch (e) { return; }
    let out = makeLineDrawing(data, dw, dh, Math.max(1, lineBlur * (Math.max(dw, dh) / Math.max(img.width, img.height))), lineStrength);
    if (lineKey > 0) out = keyWhiteToAlpha(out, dw, dh, lineKey);
    const id = wctx.createImageData(dw, dh);
    id.data.set(out);
    wctx.putImageData(id, 0, 0);
    pctx.drawImage(wr, ox, oy);
    pctx.restore();
  }

  /* ============================================================
     Augmented reality: pin 4 image points onto 4 points on the
     live surface, solve the homography, and render the image
     perspective-warped onto the surface in the camera view.
     ============================================================ */

  function arStart() {
    if (!imageInfo()) { toast(I18N.t('arNeedImage')); return; }
    // pinning owns the gestures, so feed zoom is disabled while points are active
    if (feedOn) setFeedOn(false);
    gestureReset();  // pinning owns the pointer: the dial's context goes null
    arMode = 'setup';
    arPhase = 'image';
    arSrc = [];
    arDst = [];
    arH = null;
    arWarpCanvas = null;
    // If line mode is on, pinning must target the generated line drawing, so
    // make sure it is computed before the image-source phase is shown.
    if (lineOn && !lineCanvas) scheduleLineRecompute();
    setArEdit(false);
    syncArHud();
    showArPinPanel();
    syncArStatus();
    syncArNextBtn();
    requestRender();
  }

  /* Recompute the full-canvas mapping used to draw + hit-test the photo while
     its 4 source points are being placed. The image is shown as large as it
     can be while still fully visible (contained) on the single big canvas. */
  function arUpdateMap() {
    const img = imageInfo();
    if (!img) return null;
    const pad = 8;
    const scale = Math.min((cssW - pad * 2) / img.width, (cssH - pad * 2) / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    arMap = {
      scale, ox: (cssW - dw) / 2, oy: (cssH - dh) / 2,
      iw: img.width, ih: img.height,
      // canvas dims this map was built for
      cw: cssW, ch: cssH,
    };
    return arMap;
  }
  function arMapStale() {
    return !arMap || arMap.cw !== cssW || arMap.ch !== cssH;
  }

  /* Draw the active reference (photo, or line drawing if line mode is on)
     for the image-source pinning phase, honouring the image's current zoom
     and pan (view). Called from render() only while arPhase==='image'.
     ctx is in css space; a solid backing is painted first. */
  function drawArImagePhase() {
    const ctx = canvasCtx;
    if (!ctx) return;
    const ref = arActiveSource();
    const img = imageInfo();
    if (!ref || !img) return;
    const usingLine = lineOn && lineCanvas && ref.canvas === lineCanvas;
    const iw = img.width, ih = img.height;

    // backing so lines/markers stay legible (white for line art, dark photo)
    ctx.save();
    ctx.fillStyle = usingLine ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, cssW, cssH);

    // draw the reference under the current image pan/zoom (same as flat view).
    // Greyscale the photo reference (not a line/sketch source) so the tonal
    // values read clearly while the source pins are chosen. Filter is reset
    // immediately so the grid / markers below stay in their own colours.
    const greyPhoto = !usingLine && greyOn;
    if (greyPhoto) ctx.filter = 'grayscale(1)';
    ctx.translate(cssW / 2, cssH / 2);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-view.cx, -view.cy);
    ctx.drawImage(ref.canvas, 0, 0);
    if (greyPhoto) ctx.filter = 'none';
    if (gridOn) drawArViewGrid(ctx, iw, ih, usingLine);
    ctx.restore();

    // source markers (blue) numbered 1..4, placed in css space from image px
    ctx.save();
    for (let i = 0; i < arSrc.length; i++) {
      const sp = screenFromWorld(arSrc[i].x, arSrc[i].y);
      drawPinMarker(ctx, sp.x, sp.y, i + 1, usingLine ? '#0000ff' : '#4f8cff');
    }
    ctx.restore();
  }

  /* grid lines + border + third-line markers drawn in image space, under an
     active view transform (ctx already translated/scaled into image px).
     `light` picks stroke colours that show on white vs dark backing. */
  function drawArViewGrid(ctx, iw, ih, light) {
    const vs = gridLines(iw, gridCell);
    const hs = gridLines(ih, gridCell);
    ctx.save();
    ctx.lineWidth = 1 / view.scale;
    ctx.strokeStyle = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    for (const x of vs) { ctx.moveTo(x, 0); ctx.lineTo(x, ih); }
    for (const y of hs) { ctx.moveTo(0, y); ctx.lineTo(iw, y); }
    ctx.stroke();
    ctx.lineWidth = 2 / view.scale;
    ctx.strokeStyle = light ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)';
    ctx.strokeRect(0, 0, iw, ih);
    drawThirdMarkers(ctx, iw, ih, view.scale);
    ctx.restore();
  }

  function arUseCorners() {
    const img = imageInfo();
    if (!img) return;
    // Default source points = the four 1/3 & 2/3 cross markers (snapped to the
    // grid), which the user can align to the same marks placed on the surface.
    arSrc = thirdLineMarkers(img.width, img.height, gridCell);
    // Stay on the image phase showing the placed markers; the user reviews them
    // and presses Next to continue to the surface phase.
    arPhase = 'image';
    arLoupeStop();
    syncArStatus();
    syncArNextBtn();
    requestRender();
  }

  /* proceed to the surface pinning phase (used by the Next button) */
  function arNext() {
    if (arMode !== 'setup') return;
    arPhase = 'surface';
    hudUserOpen = false;
    arLoupeStop();
    syncArStatus();
    syncArNextBtn();
    applyHud();
    requestRender();
  }

  /* advance after each added source point; image done -> surface phase */
  function arAfterSource() {
    if (arSrc.length >= 4) arPhase = 'surface';
    hudUserOpen = false;
    syncArStatus();
    syncArNextBtn();
    applyHud();
    requestRender();
  }

  /* Next is offered when the 4 image points have been placed but the user has
     not yet moved to the surface phase. */
  function syncArNextBtn() {
    if (!els || !els.arNext) return;
    const show = arMode === 'setup' && arPhase === 'image' && arSrc.length >= 4;
    els.arNext.hidden = !show;
  }

  /* a tap on the big canvas: adds an image-space source point in the image
     phase, or a surface point in the surface phase. Image taps are mapped
     through the current image view (zoom/pan). */
  function arAddTap(sx, sy) {
    if (arMode !== 'setup') return;
    const rect = els.canvas.getBoundingClientRect();
    const x = sx - rect.left, y = sy - rect.top;
    if (arPhase === 'image') {
      if (arSrc.length >= 4) return;
      const img = imageInfo();
      if (!img) return;
      // map the tap through the image pan/zoom to image px
      let ix = worldFromScreen(x, y).x;
      let iy = worldFromScreen(x, y).y;
      // magnetise to the nearest grid intersection when enabled
      if (arMagnet) {
        ix = snapToGrid(ix, gridCell);
        iy = snapToGrid(iy, gridCell);
      }
      if (ix < 0 || iy < 0 || ix > img.width || iy > img.height) return;
      arSrc.push({ x: ix, y: iy });
      arAfterSource();
    } else {
      if (arDst.length >= 4) return;
      arDst.push({ x, y });
      syncArStatus();
      arTrySolve();
      requestRender();
    }
  }

  function arTrySolve() {
    if (arMode !== 'setup') return;
    if (arSrc.length === 4 && arDst.length === 4) {
      const h = computeHomography(arSrc, arDst);
      if (h) {
        arH = h;
        arMode = 'on';
        arBuildWarp();
        syncArHud();
        syncArStatus();
        requestRender();
      } else {
        toast(I18N.t('arDegenerate'));
        arDst = [];
        syncArStatus();
      }
    }
  }

  /* ---- surface pin markers ----
     During the surface phase the photo is hidden so the live feed shows
     through; the numbered green destination markers are the only overlay. */
  function drawArDstMarkers() {
    if (!els) return;
    if (arMode !== 'setup') return;
    if (canvasCtx && arDst.length) {
      const ctx = canvasCtx;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < arDst.length; i++) {
        drawPinMarker(ctx, arDst[i].x, arDst[i].y, i + 1, '#3df2a0');
      }
      ctx.restore();
    }
  }

  /* Numbered draggable handles at the surface (destination) pins, shown while
     fine-adjusting a solved map. Colours the one under the pointer / being
     dragged so the user knows which handle they have grabbed. */
  function drawArEditHandles() {
    if (!canvasCtx || !arDst.length) return;
    const ctx = canvasCtx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < arDst.length; i++) {
      const active = i === arDragIdx;
      const x = arDst[i].x, y = arDst[i].y;
      drawPinMarker(ctx, x, y, i + 1, active ? '#ffd23f' : '#3df2a0');
      if (active) {
        // highlight ring so the active handle is obvious
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,210,63,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPinMarker(ctx, x, y, n, color) {
    // solid disc with a light halo so the marker reads over any backing
    // (white sketch, photo, grid lines, live feed)
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // legible number on any fill: white with a dark outline
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(String(n), x, y + 0.5);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(n), x, y + 0.5);
  }

  /* ---------- magnifier loupe (accurate pin aiming) ----------
     While placing AR pins the user drags a magnified loupe across the big
     canvas. It samples the true source pixels (the photo during the image
     phase; the live video frame during the surface phase) under the finger,
     magnified into a disc that is drawn OFFSET from the finger so a touch
     doesn't hide the pixel being aimed at. The disc flips to whichever side
     has the most room (and can reach corners). The pin is placed at the
     actual finger point (arLoupe.x/y) when the pointer is lifted. */
  const LOUPE_R = 92;      // css radius of the loupe
  const LOUPE_MAG = 6;     // css px shown per source pixel
  // how much pointer movement is scaled down when "fine" pin-adjust is on
  // (1 css px of pointer drag moves the pin 1/AR_FINE px -> sub-pixel control)
  const AR_FINE = 8;
  const AR_GRAB = 22;      // css px radius within which a pin handle can be grabbed
  const LOUPE_GAP = 18;    // min gap between finger and the loupe disc

  /* Source-pixel rectangle the loupe magnifies around a centre point. */
  function arSourceRect(sx, sy, srcW, srcH) {
    const span = (LOUPE_R * 2) / LOUPE_MAG; // source px across the loupe
    const left = Math.max(0, Math.min(srcW - span, sx - span / 2));
    const top = Math.max(0, Math.min(srcH - span, sy - span / 2));
    return { left, top, span: Math.min(span, srcW, srcH) };
  }

  /* Draw the image-locked grid lines that fall inside the magnified loupe
     patch. rect = {left,top,span} in image px being magnified; the patch maps
     that rect onto the disc (css px). We draw vertical lines at multiples of
     gridCell in image px and horizontals likewise, so the loupe grid aligns
     with the grid overlay on the photo. `light` picks a stroke colour that
     shows on a white vs dark backing. */
  function drawArLoupeGrid(ctx, cx, cy, rect, light) {
    const cell = Math.max(1, gridCell);
    const pxPerCss = (LOUPE_R * 2) / rect.span; // image px per css px
    const cssPerPx = 1 / pxPerCss;              // css px per image px
    ctx.save();
    ctx.strokeStyle = light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // verticals: x = k*cell within the visible rect
    const x0 = Math.max(0, rect.left);
    const x1 = rect.left + rect.span;
    const kStart = Math.ceil(x0 / cell);
    const kEnd = Math.floor(x1 / cell);
    for (let k = kStart; k <= kEnd; k++) {
      const imgX = k * cell;
      const cssX = cx - LOUPE_R + (imgX - rect.left) * cssPerPx;
      ctx.moveTo(cssX, cy - LOUPE_R);
      ctx.lineTo(cssX, cy + LOUPE_R);
    }
    // horizontals: y = k*cell
    const y0 = Math.max(0, rect.top);
    const y1 = rect.top + rect.span;
    const kStartY = Math.ceil(y0 / cell);
    const kEndY = Math.floor(y1 / cell);
    for (let k = kStartY; k <= kEndY; k++) {
      const imgY = k * cell;
      const cssY = cy - LOUPE_R + (imgY - rect.top) * cssPerPx;
      ctx.moveTo(cx - LOUPE_R, cssY);
      ctx.lineTo(cx + LOUPE_R, cssY);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* map a css point on the video's displayed (cover) rect to a video pixel */
  /* map a css point on the overlay to a raw video pixel, accounting for the
     live-feed zoom/pan transform on the <video> element. screen = feedT +
     feedCss * box, so first invert that to get the point in the element's box,
     then apply the object-fit:cover mapping from the box to raw video px. */
  function arCssToVideo(cssX, cssY) {
    const v = els.video;
    const vw = v.videoWidth || 0, vh = v.videoHeight || 0;
    if (!vw || !vh) return null;
    // element-box point (the <video> covers the whole overlay)
    const s = Math.max(1, feedCss);
    const bx = (cssX - feedTx) / s;
    const by = (cssY - feedTy) / s;
    // object-fit cover within the box
    const scale = Math.max(cssW / vw, cssH / vh);
    const offX = (cssW - vw * scale) / 2;
    const offY = (cssH - vh * scale) / 2;
    return {
      x: (bx - offX) / scale,
      y: (by - offY) / scale,
      vw, vh,
    };
  }

  /* Pick where to draw the loupe disc given the finger point (selX, selY).
     The disc is pushed toward the side with the most free space and clamped
     so it stays fully on-screen; near an edge it flips to the other side so
     it never hides the finger yet can still reach the corners. */
  function arLoupeDisplay(selX, selY) {
    const wantX = selX + ((cssW - selX) > selX ? 1 : -1) * (LOUPE_R + LOUPE_GAP);
    const wantY = selY + ((cssH - selY) > selY ? 1 : -1) * (LOUPE_R + LOUPE_GAP);
    return {
      x: Math.max(LOUPE_R, Math.min(cssW - LOUPE_R, wantX)),
      y: Math.max(LOUPE_R, Math.min(cssH - LOUPE_R, wantY)),
    };
  }

  function arDrawLoupe() {
    if (!canvasCtx || !arLoupe.active) return;
    const ctx = canvasCtx;
    // sel = the pixel being selected (under the finger)
    const sx = arLoupe.x, sy = arLoupe.y;
    // d = where the magnified disc is drawn (offset from the finger)
    const d = arLoupeDisplay(sx, sy);
    const cx = d.x, cy = d.y;

    if (arPhase === 'image') {
      // Magnify the on-screen composite: the photo/line-art plus any grid has
      // already been painted onto the main canvas, so sample a small css region
      // of that canvas around the finger and blow it up. This guarantees the
      // grid the user enabled is visible inside the loupe too.
      arDrawCompositeLoupe(cx, cy, sx, sy);
    } else {
      arDrawVideoLoupe(cx, cy, sx, sy);
    }

    // reticle-style centre marker over the magnified pixel
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // outer ring + crosshair guides
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, LOUPE_R - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - LOUPE_R, cy); ctx.lineTo(cx + LOUPE_R, cy);
    ctx.moveTo(cx, cy - LOUPE_R); ctx.lineTo(cx, cy + LOUPE_R);
    ctx.stroke();
    ctx.restore();
  }

  /* Magnified disc showing the already-composited main canvas around the
     finger (image/line-art + any grid overlay). Sampled at device resolution
     into a scratch canvas first (self-draw is safer via a copy). */
  const LOUPE_SCREEN_MAG = 3; // magnification of the on-screen content in the loupe
  function arDrawCompositeLoupe(cx, cy, sx, sy) {
    if (!canvasCtx) return;
    const ctx = canvasCtx;
    const main = els.canvas;
    if (!main) return;
    const sampleCss = (LOUPE_R * 2) / LOUPE_SCREEN_MAG; // css width of region shown
    const half = sampleCss / 2;
    const sw = Math.max(1, Math.round(sampleCss * dpr));
    const sh = sw;
    const scratch = document.createElement('canvas');
    scratch.width = sw; scratch.height = sh;
    const sctx = scratch.getContext('2d');
    const srcX = (sx - half) * dpr;
    const srcY = (sy - half) * dpr;
    // read from the composited main canvas (device pixels)
    sctx.drawImage(main, srcX, srcY, sw, sh, 0, 0, sw, sh);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(scratch, 0, 0, sw, sh, cx - LOUPE_R, cy - LOUPE_R, LOUPE_R * 2, LOUPE_R * 2);
    ctx.restore();
  }

  /* Magnified disc showing the live video frame under the finger (surface
     phase). drawImage on the <video> reads the current frame directly. */
  function arDrawVideoLoupe(cx, cy, sx, sy) {
    if (!canvasCtx) return;
    const ctx = canvasCtx;
    const p = arCssToVideo(sx, sy);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#111';
    ctx.fillRect(cx - LOUPE_R, cy - LOUPE_R, LOUPE_R * 2, LOUPE_R * 2);
    if (p && p.vw > 0 && p.vh > 0) {
      const rect = arSourceRect(p.x, p.y, p.vw, p.vh);
      if (rect.span > 0) {
        ctx.drawImage(els.video, rect.left, rect.top, rect.span, rect.span,
          cx - LOUPE_R, cy - LOUPE_R, LOUPE_R * 2, LOUPE_R * 2);
      }
    }
    ctx.restore();
  }

  /* rAF loop that keeps the live-surface loupe fresh while a finger drags */
  function arLoupeLoop() {
    if (arLoopId) { cancelAnimationFrame(arLoopId); arLoopId = 0; }
    if (!arLoupe.active) return;
    const tick = () => {
      if (!arLoupe.active) { arLoopId = 0; return; }
      if (arPhase === 'surface') requestRender(); // live video loupe
      arLoopId = requestAnimationFrame(tick);
    };
    arLoopId = requestAnimationFrame(tick);
  }

  function arLoupeStart(ptrId, cssX, cssY) {
    arDragPtr = ptrId;
    arLoupe = { active: true, x: cssX, y: cssY };
    arLoupeLoop();
    requestRender();
  }

  function arLoupeMove(cssX, cssY) {
    arLoupe.x = cssX;
    arLoupe.y = cssY;
    requestRender();
  }

  function arLoupeStop() {
    arDragPtr = null;
    arLoupe.active = false;
    if (arLoopId) { cancelAnimationFrame(arLoopId); arLoopId = 0; }
  }

  /* ---- build the warped overlay ---- */
  function arBuildWarp() {
    const img = imageInfo();
    const ref = arActiveSource();
    if (!img || !ref || !arH) return;
    if (!canvasCtx) return;
    // Precompute a device-resolution RGBA warp of the whole canvas each time
    // the pins change. One-off cost; recompute on resize handled in resize().
    const W = els.canvas.width, H = els.canvas.height;
    if (!arWarpCanvas || arWarpCanvas.width !== W || arWarpCanvas.height !== H) {
      arWarpCanvas = document.createElement('canvas');
      arWarpCanvas.width = W;
      arWarpCanvas.height = H;
    }
    const wctx = arWarpCanvas.getContext('2d');
    const inv = invert3(arH);
    if (!inv) return;
    const imgW = img.width, imgH = img.height;
    // source pixels come from the active reference (photo or line drawing)
    const src = document.createElement('canvas');
    src.width = imgW; src.height = imgH;
    const sctx = src.getContext('2d');
    sctx.drawImage(ref.canvas, 0, 0);
    let sdata;
    try { sdata = sctx.getImageData(0, 0, imgW, imgH).data; }
    catch (e) { return; }

    const id = wctx.createImageData(W, H);
    const d = id.data;
    // iterate destination pixels: for each, map back to source via H^-1
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const sp = applyHomography(inv, x / dpr, y / dpr); // css coords
        let r = 0, g = 0, b = 0, a = 0;
        if (sp.x >= -1 && sp.y >= -1 && sp.x <= imgW && sp.y <= imgH) {
          const sxo = Math.max(0, Math.min(imgW - 1, sp.x));
          const syo = Math.max(0, Math.min(imgH - 1, sp.y));
          // nearest-neighbour sample for speed (adequate for tracing)
          const si = (Math.floor(syo) * imgW + Math.floor(sxo)) * 4;
          r = sdata[si]; g = sdata[si + 1]; b = sdata[si + 2]; a = sdata[si + 3];
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
      }
    }
    wctx.putImageData(id, 0, 0);
  }

  /* draw the cached warp + warped grid into the main render ctx.
     arWarpCanvas is device-resolution (cssW*dpr x cssH*dpr), so blit it at
     identity; grid/markers are drawn back in dpr-scaled (css) space. */
  function drawArWarp() {
    if (!canvasCtx || !arWarpCanvas) return;
    const ctx = canvasCtx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // greyscale the pinned/warped photo (not a line/sketch source) so tonal
    // values read the same way they do in the flat projection view. The warp
    // is a precomputed canvas, so the filter is applied at blit time.
    if (!lineOn && greyOn) ctx.filter = 'grayscale(1)';
    ctx.drawImage(arWarpCanvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (gridOn) drawArGrid();
    ctx.restore();
  }

  /* When a surface map is active, rebuild the projected warp from the current
     active source (line drawing vs photo). Used when the user toggles line
     mode (or tweaks line settings) while the image is pinned, so the pinned
     image follows the selection. Opacity (alpha) still applies on top via
     drawArWarp/globalAlpha. */
  function arRebuildWarpIfActive() {
    if (arMode !== 'on' || !arH) return;
    arWarpCanvas = null;
    arBuildWarp();
    requestRender();
  }

  /* draw grid lines forward-projected through the homography so the grid
     stays locked to the warped image plane */
  function drawArGrid() {
    const img = imageInfo();
    if (!img || !arH) return;
    const ctx = canvasCtx;
    const iw = img.width, ih = img.height;
    const vs = gridLines(iw, gridCell);
    const hs = gridLines(ih, gridCell);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = 'rgba(0,255,140,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const x of vs) {
      const a = applyHomography(arH, x, 0);
      const b = applyHomography(arH, x, ih);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (const y of hs) {
      const a = applyHomography(arH, 0, y);
      const b = applyHomography(arH, iw, y);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function arStop() {
    arMode = 'off';
    arSrc = [];
    arDst = [];
    arH = null;
    arWarpCanvas = null;
    arMap = null;
    arLoupeStop();
    setArEdit(false);
    syncArHud();
    if (els.arPanel) els.arPanel.hidden = true;
    gestureChipSync();   // back in the flat view the dial may apply again
    requestRender();
  }

  /* ---------- fine pin adjust ('on' mode) ----------
     Once a surface map is solved, the user can enter an adjust state that
     reveals the four surface (destination) pins as draggable handles. Dragging
     one re-positions that pin and re-solves the homography, giving minute
     control over the final image-to-surface alignment that pinning alone (at
     ~1px resolution) cannot reach. A "fine" gain scales pointer movement down
     by 1/AR_FINE so sub-pixel adjustments are possible. */

  function setArEdit(v) {
    v = !!v;
    if (v && arMode !== 'on') v = false; // only valid while a map is active
    arEdit = v;
    if (!v) { arDragIdx = -1; arEditPtr = null; arAdjustLoupeStop(); }
    syncArAdjustHud();
    requestRender();
  }

  function setArFine(v) {
    arFine = !!v;
    if (els && els.arFine) els.arFine.checked = arFine;
    savePrefs();
  }

  /* show/hide + state of the adjust HUD controls and Fine checkbox */
  function syncArAdjustHud() {
    if (!els) return;
    const activeMap = arMode === 'on';
    if (els.areditGroup) els.areditGroup.hidden = !activeMap;
    if (els.areditSep) els.areditSep.hidden = !activeMap;
    if (els.arFineRow) els.arFineRow.hidden = !arEdit;
    if (els.arFine) els.arFine.checked = !!arFine;
    if (els.arAdjust) {
      els.arAdjust.setAttribute('aria-pressed', arEdit ? 'true' : 'false');
      els.arAdjust.classList.toggle('is-on', arEdit);
      const label = els.arAdjust.querySelector('[data-i18n]') || els.arAdjust;
      label.textContent = I18N.t(arEdit ? 'arAdjustStop' : 'arAdjust');
    }
  }

  /* rebuild the cached warp at most once per animation frame (during a drag
     the pointer fires faster than frames; coalescing keeps it smooth) */
  let arWarpQueued = false;
  function arQueueWarp() {
    if (arWarpQueued) return;
    arWarpQueued = true;
    requestAnimationFrame(() => {
      arWarpQueued = false;
      if (arMode !== 'on') return;
      arWarpCanvas = null;
      arBuildWarp();
      requestRender();
    });
  }

  /* nearest destination pin within grab range, or -1 */
  function arHitDst(cssX, cssY) {
    let best = -1, bestD = AR_GRAB;
    for (let i = 0; i < arDst.length; i++) {
      const d = Math.hypot(cssX - arDst[i].x, cssY - arDst[i].y);
      if (d <= bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function arAdjustDown(e) {
    const rect = els.canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left, cssY = e.clientY - rect.top;
    const i = arHitDst(cssX, cssY);
    if (i < 0) return;                    // not on a handle: no-op
    e.preventDefault();
    els.canvas.setPointerCapture(e.pointerId);
    arEditPtr = e.pointerId;
    arDragIdx = i;
    arDragBase = { px: cssX, py: cssY };
    arDragPin0 = { x: arDst[i].x, y: arDst[i].y };
    arAdjustLoupeOnStart();
    requestRender();
  }

  function arAdjustMove(e) {
    if (arDragIdx < 0 || e.pointerId !== arEditPtr) return;
    const rect = els.canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left, cssY = e.clientY - rect.top;
    const gain = arFine ? 1 / AR_FINE : 1;
    const nx = arDragPin0.x + (cssX - arDragBase.px) * gain;
    const ny = arDragPin0.y + (cssY - arDragBase.py) * gain;
    // candidate position, clamped so the pin stays on the canvas
    const cand = arDst.slice();
    cand[arDragIdx] = {
      x: Math.max(0, Math.min(cssW, nx)),
      y: Math.max(0, Math.min(cssH, ny)),
    };
    const h = computeHomography(arSrc, cand);
    if (!h) return; // degenerate; keep previous placement
    arDst[arDragIdx] = cand[arDragIdx];
    arH = h;
    e.preventDefault();
    requestRender();      // markers move now
    arQueueWarp();        // warp refresh coalesced
  }

  function arAdjustUp(e) {
    if (arDragIdx < 0 || e.pointerId !== arEditPtr) return;
    arDragIdx = -1;
    arEditPtr = null;
    arAdjustLoupeStop();
    arQueueWarp();
    requestRender();
  }

  /* ---------- fine-adjust split loupe ----------
     While a pin is dragged, show a magnified split view near the handle like
     the loupe of the other pin phases. The TOP pane holds a fixed sample of the
     reference image about the pin's source (image-space) point — it stays put
     while you drag. The BOTTOM pane shows the live feed (surface) about the
     pin's current overlay location, so it follows the drag. Both panes magnify
     the same on-screen scale (derived from the local homography / feed scale)
     so a feature lines up across the two halves when the pin is aligned. */

  let arAdjLoopId = 0;
  let arAdjustLoupeOn = false;

  function arAdjustLoupeOnStart() {
    if (arAdjustLoupeOn) return;
    arAdjustLoupeOn = true;
    if (arAdjLoopId) { cancelAnimationFrame(arAdjLoopId); arAdjLoopId = 0; }
    const tick = () => {
      arAdjLoopId = 0;
      if (!arAdjustLoupeOn || !active || arMode !== 'on' || arDragIdx < 0) return;
      requestRender(); // keep the live feed pane fresh
      arAdjLoopId = requestAnimationFrame(tick);
    };
    arAdjLoopId = requestAnimationFrame(tick);
  }

  function arAdjustLoupeStop() {
    arAdjustLoupeOn = false;
    if (arAdjLoopId) { cancelAnimationFrame(arAdjLoopId); arAdjLoopId = 0; }
  }

  /* local scale: how many source(image) px are spanned by 1 css px at the given
     css point, using the inverse homography derivative. Guards against a
     degenerate / extreme zoom. */
  function arLocalImageScale(cssX, cssY) {
    if (!arH) return 1;
    const inv = invert3(arH);
    if (!inv) return 1;
    const a = applyHomography(inv, cssX, cssY);
    const b = applyHomography(inv, cssX + 1, cssY);
    const s = Math.hypot(b.x - a.x, b.y - a.y);
    return Number.isFinite(s) && s > 1e-6 ? s : 1;
  }

  /* how many raw video px are spanned by 1 css px at the given css point */
  function arLocalVideoScale(cssX, cssY) {
    const a = arCssToVideo(cssX, cssY);
    const b = arCssToVideo(cssX + 1, cssY);
    if (!a || !b) return 1;
    const s = Math.hypot(b.x - a.x, b.y - a.y);
    return Number.isFinite(s) && s > 1e-6 ? s : 1;
  }

  const ADJ_LOUPE_R = 78;     // css radius of each split pane (disc)
  const ADJ_LOUPE_GAP = 8;    // vertical gap between the two panes

  function arAdjustLoupePos(x, y) {
    // stack both panes vertically (2R + gap tall, 2R wide), offset to the side
    // with the most room, then clamp fully on-screen
    const w = ADJ_LOUPE_R * 2;
    const h = ADJ_LOUPE_R * 2 * 2 + ADJ_LOUPE_GAP;
    const toRight = (cssW - x) >= x; // more room on the right?
    let px = toRight ? x + w / 2 + LOUPE_GAP : x - w / 2 - LOUPE_GAP;
    px = Math.max(ADJ_LOUPE_R, Math.min(cssW - ADJ_LOUPE_R, px));
    let py = y;
    py = Math.max(ADJ_LOUPE_R + ADJ_LOUPE_GAP / 2, Math.min(cssH - (ADJ_LOUPE_R * 2 + ADJ_LOUPE_GAP / 2), py));
    return { x: px, y: py };
  }

  /* sample a disc of `span` source px centred on (sx, sy) from a canvas/image
     source `src` (canvas or video element) with intrinsic size sw/s h */
  function arDrawAdjustDisc(ctx, cx, cy, R, src, sx, sy, span, sw, sh) {
    const rect = {
      left: Math.max(0, Math.min(sw - span, sx - span / 2)),
      top: Math.max(0, Math.min(sh - span, sy - span / 2)),
      span: Math.max(1, Math.min(span, sw, sh)),
    };
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.drawImage(src, rect.left, rect.top, rect.span, rect.span,
      cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
  }

  function drawArAdjustLoupe() {
    if (!canvasCtx || !arEdit || arDragIdx < 0) return;
    const idx = arDragIdx;
    if (idx >= arDst.length || idx >= arSrc.length) return;
    const ref = arActiveSource();
    if (!ref) return;
    const ctx = canvasCtx;

    const pos = arAdjustLoupePos(arDst[idx].x, arDst[idx].y);
    const topCy = pos.y - (ADJ_LOUPE_R + ADJ_LOUPE_GAP / 2);
    const botCy = pos.y + (ADJ_LOUPE_R + ADJ_LOUPE_GAP / 2);

    // each pane shows the same css width (2R css) on screen, so magnify each
    // source to match: image span = css px * image px per css, feed likewise
    const imgSpan = (ADJ_LOUPE_R * 2) * arLocalImageScale(arDst[idx].x, arDst[idx].y);
    const feedSpan = (ADJ_LOUPE_R * 2) * arLocalVideoScale(arDst[idx].x, arDst[idx].y);

    // TOP: fixed sample of the reference image about the pin's source point.
    arDrawAdjustDisc(ctx, pos.x, topCy, ADJ_LOUPE_R, ref.canvas,
      arSrc[idx].x, arSrc[idx].y, imgSpan, ref.width, ref.height);

    // BOTTOM: live feed about the pin's current overlay position (follows drag)
    const f = arCssToVideo(arDst[idx].x, arDst[idx].y);
    if (f) {
      arDrawAdjustDisc(ctx, pos.x, botCy, ADJ_LOUPE_R, els.video,
        f.x, f.y, feedSpan, f.vw, f.vh);
    }

    // centre crosshair + pane rings so alignment reads clearly
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const [c, isSrc] of [[topCy, true], [botCy, false]]) {
      ctx.beginPath();
      ctx.arc(pos.x, c, ADJ_LOUPE_R - 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // centre marker (white on image, dark on feed so it shows either way)
      ctx.beginPath();
      ctx.arc(pos.x, c, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isSrc ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.7)';
      ctx.fill();
      ctx.strokeStyle = isSrc ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // small labels: which pane is the fixed image sample vs the live surface
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const tag = (txt, x, y) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3;
      ctx.strokeText(txt, x, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(txt, x, y);
    };
    tag(I18N.t('arAdjustLoupeSrc'), pos.x - ADJ_LOUPE_R + 5, topCy - ADJ_LOUPE_R + 5);
    tag(I18N.t('arAdjustLoupeTgt'), pos.x - ADJ_LOUPE_R + 5, botCy + ADJ_LOUPE_R - 15);
    ctx.restore();
  }

  /* Store the last-seen overlay geometry so an orientation change can be
     detected. Surface pins are stored in CSS px of the *current* viewport;
     when the device rotates the viewport dimensions swap, so those screen
     coordinates no longer name the same physical surface points. Keeping
     them would draw a wrong/stretched warp, so on a real rotation we keep
     the photo-side (image-space) pins and ask the user to re-tap the 4
     surface points. */
  let arLastW = 0, arLastH = 0;

  function arOnViewportChanged(w, h) {
    if (!active) return;
    const wasSet = arLastW > 0 && arLastH > 0;
    const oldLandscape = arLastW >= arLastH;
    const newLandscape = w >= h;
    const ratioChange = (oldLandscape !== newLandscape) ||
      Math.max(w / (arLastW || 1), (arLastW || 1) / w) > 1.4 ||
      Math.max(h / (arLastH || 1), (arLastH || 1) / h) > 1.4;
    arLastW = w; arLastH = h;
    if (!wasSet) return;

    if (!ratioChange) return;
    // Only a genuine orientation/geometry change should reset surface pins.
    if (arMode === 'off') return;
    const hadSurface = arDst.length > 0 || arMode === 'on';
    // Photo pins live in image space and survive; surface pins are in CSS px
    // of the old viewport and must be re-tapped after the rotation.
    arMode = 'setup';
    arPhase = (arSrc.length >= 4) ? 'surface' : 'image';
    arDst = [];                // surface points no longer valid
    arH = null;
    arWarpCanvas = null;
    arMap = null;              // recompute for the new geometry
    setArEdit(false);
    arLoupeStop();
    syncArHud();
    showArPinPanel();
    syncArStatus();
    requestRender();
    if (hadSurface) toast(I18N.t('arRotated'));
  }

  function setArMagnet(v) {
    arMagnet = !!v;
    if (els && els.arMagnet) els.arMagnet.checked = arMagnet;
    savePrefs();
  }

  function onArBtnClick() {
    if (arMode === 'off') arStart();
    else arStop();
  }

  function showArPinPanel() {
    if (!els || !els.arPanel) return;
    els.arPanel.hidden = false;
    // stop flat-pan interactions while pinning (taps place pins instead)
    requestRender();
  }

  /* ---------- HUD minimise ----------
     The lower control bar is hidden (a) automatically while pinning the image
     on small screens, where it can cover the photo, and (b) whenever the user
     manually minimises it so it stays out of the way while tracing. A user who
     re-opens the bar during an auto-minimised step is respected (hudUserOpen)
     so the bar doesn't fight them until the pinning step changes. */
  function setHudSmall(v) {
    hudSmall = !!v;
    applyHud();
  }

  function setHudMin(v) {
    hudMin = !!v;
    if (v) hudUserOpen = false;
    applyHud();
  }

  function toggleHudMin() {
    if (hudShouldMin()) {
      // currently hidden: open it (manual open overrides any auto-minimise)
      hudMin = false;
      hudUserOpen = true;
    } else {
      // currently open: minimise it
      hudMin = true;
      hudUserOpen = false;
    }
    applyHud();
  }

  /* auto-minimise only applies during image-source pinning on a small screen,
     and only while the user has not explicitly re-opened the bar */
  function hudShouldMin() {
    return hudMin ||
      (hudSmall && arMode === 'setup' && arPhase === 'image' && !hudUserOpen);
  }

  function applyHud() {
    if (!els || !els.hud) return;
    const on = hudShouldMin();
    els.hud.classList.toggle('hud-min', on);
    if (els.hudToggle) {
      // collapsed: chevron points up (re-open); expanded: points down (collapse)
      els.hudToggle.classList.toggle('is-up', on);
      els.hudToggle.setAttribute('aria-pressed', on ? 'false' : 'true');
      els.hudToggle.setAttribute('title', I18N.t(on ? 'hudShow' : 'hudHide'));
    }
  }

  function syncArHud() {
    if (!els) return;
    const on = arMode === 'on';
    const setup = arMode === 'setup';
    els.arBtn.setAttribute('aria-pressed', on || setup ? 'true' : 'false');
    els.arBtn.classList.toggle('is-on', on || setup);
    const label = els.arBtn.querySelector('[data-i18n]') || els.arBtn;
    label.textContent = I18N.t(on ? 'arActive' : setup ? 'arPin' : 'arOn');
    if (els.arPanel) els.arPanel.hidden = !(setup);
    syncArAdjustHud(); // reveal/adjust the fine-adjust controls when a map is on
    applyHud(); // lower bar may auto-minimise while pinning on small screens
  }

  function syncArStatus() {
    if (!els || !els.arStatus) return;
    const img = imageInfo();
    if (!img) return;
    let msg;
    if (arSrc.length < 4) {
      msg = I18N.t('arStepImage') + ' ' + (arSrc.length + 1) + '/4';
    } else if (arDst.length < 4) {
      msg = I18N.t('arStepSurface') + ' ' + (arDst.length + 1) + '/4';
    } else {
      msg = I18N.t('arPinned');
    }
    els.arStatus.textContent = msg;
  }

  /* ---------- camera ---------- */
  function mediaAvailable() {
    return !!(global.navigator && global.navigator.mediaDevices &&
      global.navigator.mediaDevices.getUserMedia);
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    // cancel any pending sensor-zoom apply and drop the capability probe
    if (feedSensorQueued) { clearTimeout(feedSensorQueued); feedSensorQueued = 0; }
    feedSensorCap = null;
    feedSensorZoom = 1;
    feedSensorImageCapture = null;
    if (els && els.video) {
      els.video.pause();
      els.video.removeAttribute('src');
      els.video.load();
    }
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) { return; }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.hidden = true; }, 5000);
  }

  function cameraErrorMessage(err) {
    const name = err && err.name;
    if (!mediaAvailable()) return I18N.t(global.isSecureContext === false ? 'traceNoCameraSecure' : 'traceNoCameraApi');
    if (name === 'NotAllowedError' || name === 'SecurityError') return I18N.t('traceCameraDenied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return I18N.t('traceCameraNotFound');
    return I18N.t('traceCameraStartFail');
  }

  let starting = false;
  async function startCamera() {
    if (!mediaAvailable()) return { ok: false, err: I18N.t('traceNoCameraApi') };
    if (stream) return { ok: true };            // already live
    if (starting) return { ok: true };          // a request is already in flight
    starting = true;
    try {
      const media = await global.navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing === 'environment' ? 'environment' : 'user' },
        audio: false,
      });
      starting = false;
      stream = media;
      els.video.srcObject = media;
      await els.video.play();
      return { ok: true };
    } catch (err) {
      starting = false;
      return { ok: false, err: cameraErrorMessage(err) };
    }
  }

  /* ---------- enter / exit ---------- */
  async function enter() {
    if (active) return;
    if (!imageInfo()) { toast(I18N.t('projectNoImage')); return; }

    loadPrefs();
    els.overlay.hidden = false;
    els.overlay.style.background = '#000';
    active = true;
    dragLock = false;
    applyPrefsToHud();
    syncCamButton();

    // request fullscreen synchronously so it counts as a user gesture
    // (an awaited getUserMedia prompt would clear the activation window)
    requestFullscreen();

    const res = await startCamera();
    if (!res.ok) {
      exit();
      toast(res.err);
      return;
    }

    // wait for real video dimensions before fitting (may be 0 initially)
    if (els.video.readyState < 1) {
      await new Promise((r) => { els.video.addEventListener('loadedmetadata', r, { once: true }); });
    }
    detectSensorZoom(); // expose real camera zoom if the track reports it
    resize();
    fit();
    applyFeedTransform();
    els.exit.focus();
  }

  function exit() {
    if (!active && els.overlay.hidden) return;
    active = false;
    arStop();
    stopStream();
    if (document.exitFullscreen && document.fullscreenElement === els.overlay) {
      try { document.exitFullscreen(); } catch (e) { /* ignore */ }
    }
    els.overlay.hidden = true;
    gestureReset();
  }

  /* Exit-projection confirmation: the Exit button asks before leaving, since
     it stops the camera and fullscreen. Programmatic exits (e.g. a camera
     start failure) call exit() directly and skip this dialog. */
  function openExitConfirm() {
    if (!active) return;
    if (!els.exitConfirm) { exit(); return; }
    els.exitConfirm.hidden = false;
    if (els.exitYes) els.exitYes.focus();
  }
  function closeExitConfirm() {
    if (els.exitConfirm) els.exitConfirm.hidden = true;
    if (els.exit) els.exit.focus();
  }
  function confirmExitProject() {
    closeExitConfirm();
    exit();
  }

  function requestFullscreen() {
    if (els.overlay.requestFullscreen) {
      try { els.overlay.requestFullscreen(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------- resize ---------- */
  function resize() {
    if (!els.overlay) return;
    const rect = els.overlay.getBoundingClientRect();
    cssW = Math.max(10, rect.width);
    cssH = Math.max(10, rect.height);
    dpr = global.devicePixelRatio || 1;
    els.canvas.width = Math.round(cssW * dpr);
    els.canvas.height = Math.round(cssH * dpr);
    // A device rotation swaps the viewport dimensions, which invalidates any
    // surface pins that live in CSS px of the previous orientation. Detect it
    // first so a stale warp is not rebuilt/rendered against the old points.
    arOnViewportChanged(cssW, cssH);
    // rebuild the AR warp at the new resolution when it is still active
    if (arMode === 'on' && arH) {
      arWarpCanvas = null;
      arBuildWarp();
    }
    requestRender();
  }

  /* ---------- pointer handling ---------- */
  function rectLeft() { return els.canvas.getBoundingClientRect().left; }
  function rectTop() { return els.canvas.getBoundingClientRect().top; }

  /* Is the pointer over the projection HUD? Its controls take their own taps,
     so the locked peek/swipe gesture must not start (or count) there. */
  function overHud(e) {
    const hud = els && els.hud;
    if (!hud) return false;
    const r = hud.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top && e.clientY <= r.bottom;
  }

  /* ---------- PHASE 0 gesture probe (temporary; see GESTURE_DEBUG) ----------
     Reports what the remote actually emits so HIDE_TAP_MS / SWIPE_PX /
     DOUBLE_PRESS_MS can be set from readings. Delete this block plus every
     gdbg*() hook call once the constants are tuned. */
  function gdbgPad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
  }

  function gdbgRender() {
    if (!GESTURE_DEBUG) return;
    if (!gdbgEl) {
      if (!els || !els.overlay || !document.createElement) return;
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:8px;top:8px;z-index:60;pointer-events:none;' +
        'white-space:pre;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;' +
        'color:#eaffef;background:rgba(0,0,0,.62);border-radius:6px;padding:6px 8px;' +
        'border:1px solid rgba(120,255,180,.45);max-width:86vw;overflow:hidden;';
      els.overlay.appendChild(d);
      gdbgEl = d;
    }
    const s = gdbgStat;
    const rng = (lo, hi, u) => (isFinite(lo) ? Math.round(lo) + '-' + Math.round(hi) + u : '-');
    const lines = ['GESTURE PROBE  ?gdebug=1'];
    for (let i = 0; i < gdbgLines.length; i++) lines.push(gdbgLines[i]);
    lines.push(
      'tap  n=' + s.taps + '  last ' + Math.round(s.tapLast) + ' ms  range ' + rng(s.tapMin, s.tapMax, ' ms') +
        '  cap ' + HIDE_TAP_MS + (s.taps && s.tapMax > HIDE_TAP_MS ? '  <- TAPS TOO SLOW' : ''),
      'swip n=' + s.swipes + '  last ' + Math.round(s.swLast) + ' px  range ' + rng(s.swMin, s.swMax, ' px') +
        '  min ' + SWIPE_PX + (s.swipes && s.swMin < SWIPE_PX ? '  <- SWIPES TOO SHORT' : ''),
      'dbl  n=' + s.gaps + '  last ' + Math.round(s.gapLast) + ' ms  min ' +
        (isFinite(s.gapMin) ? Math.round(s.gapMin) : '-') + ' ms  window ' + DOUBLE_PRESS_MS,
    );
    gdbgEl.textContent = lines.join('\n');
  }

  function gdbgNote(line) {
    if (!GESTURE_DEBUG) return;
    gdbgLines.push(line);
    while (gdbgLines.length > 3) gdbgLines.shift();
    gdbgRender();
  }

  /* a pointer-down the locked gesture deliberately drops - the most common
     reason "the remote does nothing at all" */
  function gdbgSkip(why) { gdbgNote('IGNORED  ' + why); }

  function gdbgPressStart() {
    if (!GESTURE_DEBUG) return;
    const now = Date.now();
    gdbgPress = {
      peak: 0,
      gapStart: gdbgLastStart ? now - gdbgLastStart : 0,
      gapEnd: gdbgLastEnd ? now - gdbgLastEnd : 0,
    };
    gdbgLastStart = now;
  }

  function gdbgFinish(tap, e, outcome) {
    if (!GESTURE_DEBUG) return;
    const now = Date.now();
    const ex = e.clientX || 0, ey = e.clientY || 0;
    const dur = now - tap.t0;
    const dx = ex - tap.x0, dy = ey - tap.y0;
    const travel = Math.hypot(dx, dy);
    const peak = gdbgPress ? gdbgPress.peak : travel;
    const gapStart = gdbgPress ? gdbgPress.gapStart : 0;
    const gapEnd = gdbgPress ? gdbgPress.gapEnd : 0;
    const kind = tap.mode === 'swipe' ? 'SWIPE' : (tap.moved ? 'DRAG' : 'TAP');
    const s = gdbgStat;
    if (kind === 'TAP') {
      s.taps++; s.tapLast = dur;
      s.tapMin = Math.min(s.tapMin, dur);
      s.tapMax = Math.max(s.tapMax, dur);
    } else if (kind === 'SWIPE') {
      s.swipes++; s.swLast = peak;
      s.swMin = Math.min(s.swMin, peak);
      s.swMax = Math.max(s.swMax, peak);
    }
    if (gapStart > 0) {
      s.gaps++; s.gapLast = gapStart;
      s.gapMin = Math.min(s.gapMin, gapStart);
    }
    // say why nothing happened when the thresholds rejected the press
    let why = '';
    if (!outcome && kind === 'TAP' && dur > HIDE_TAP_MS) {
      why = '  <- dur ' + Math.round(dur) + '>' + HIDE_TAP_MS + ' (raise HIDE_TAP_MS)';
    }
    gdbgNote(gdbgPad(kind + (outcome ? ' -> ' + outcome : ''), 20) +
      'dur ' + Math.round(dur) + 'ms  tr ' + Math.round(travel) +
      '  peak ' + Math.round(peak) + '  dxy ' + Math.round(dx) + ',' + Math.round(dy) +
      (gapStart ? '  dStart ' + Math.round(gapStart) + 'ms' : '') +
      (gapEnd ? '  dRel ' + Math.round(gapEnd) + 'ms' : '') + why);
    gdbgPress = null;
    gdbgLastEnd = now;
  }

  /* ---------- gesture mode dial: decision logic (pure, unit-tested) ----------
     The locked surface has no buttons: the remote's press/swipe are the only
     controls, so a small always-visible chip says which role they drive. Keeping
     the decision logic pure means it is testable without a DOM, and a second
     input source (keyboard, if the remote ever presents as HID) could feed the
     same machine. */
  function gestureInit() {
    return { stop: 0, pending: null, dir: 0, n: 0, lastSwipeAt: 0, lastUserAt: 0 };
  }

  /* Pure: (state, event) -> { state, effects }.
     Events: { type:'press' | 'swipe' | 'tick', dir?, now? }.
     Effects: { kind:'press'|'stop', stop } and { kind:'step', stop, dir, rung }:
       - 'press' is the deferred single press (peek on OPACITY, reset on ZOOM);
       - 'stop' means the dial moved (double press, or the idle auto-home);
       - 'step' is one completed swipe, `rung` = its depth in the repeat run.
     A press is held for DOUBLE_PRESS_MS before its action fires, so a deliberate
     double press cannot fire two peeks. A *stray* double press is
     self-cancelling because peekHide() is a toggle. */
  function gestureStep(st, evt) {
    const s = {
      stop: st.stop, pending: st.pending, dir: st.dir, n: st.n,
      lastSwipeAt: st.lastSwipeAt, lastUserAt: st.lastUserAt,
    };
    const now = typeof evt.now === 'number' ? evt.now : s.lastUserAt;
    const out = [];
    const stopId = () => GESTURE_STOPS[s.stop];

    if (evt.type === 'press') {
      if (s.pending && now - s.pending.at <= DOUBLE_PRESS_MS) {
        // second press inside the window: swap which stop the remote drives and
        // swallow the first press's action entirely
        s.pending = null;
        s.stop = (s.stop + 1) % GESTURE_STOPS.length;
        out.push({ kind: 'stop', stop: stopId() });
      } else {
        s.pending = { at: now };
      }
      s.lastUserAt = now;
    } else if (evt.type === 'swipe') {
      s.pending = null;   // a swipe is a drag, so it was never a tap
      const dir = evt.dir > 0 ? 1 : -1;
      if (s.dir === dir && now - s.lastSwipeAt <= SWIPE_REPEAT_MS) s.n = Math.min(s.n + 1, SWIPE_REPEAT_MAX);
      else { s.dir = dir; s.n = 0; }
      s.lastSwipeAt = now;
      s.lastUserAt = now;
      out.push({ kind: 'step', stop: stopId(), dir: dir, rung: s.n });
    } else if (evt.type === 'tick') {
      if (s.pending && now - s.pending.at > DOUBLE_PRESS_MS) {
        s.pending = null;
        out.push({ kind: 'press', stop: stopId() });
      }
      if (s.stop !== 0 && now - s.lastUserAt > GESTURE_HOME_MS) {
        s.stop = 0;
        out.push({ kind: 'stop', stop: stopId() });
      }
    }
    return { state: s, effects: out };
  }

  /* Which stop list is live. Only the flat projection view has stops today; the
     AR "map to surface" list ('map') is the planned second context, and keeping
     this decision in one place is what preserves the invariant that makes the
     surface wobble-proof: exactly one handler owns the pointer. */
  function gestureContext() {
    if (!active || !locked) return null;
    if (arMode !== 'off') return null;
    return 'flat';
  }

  function runGestureEffect(ef) {
    if (ef.kind === 'stop') { gestureChipOpen(); return; }
    if (ef.kind === 'press') {
      // only OPACITY acts on a press; ZOOM is inert (see STOP_PRESS), so this is
      // a true no-op - not even the chip expands
      if (STOP_PRESS[ef.stop] === 'peek') { peekHide(); gestureChipOpen(); }
      return;
    }
    if (ef.kind === 'step') {
      if (ef.stop === 'zoom') alignZoomStep(ef.dir, ef.rung);
      // OPACITY keeps its fixed step (one swipe = ±10%), exactly as before
      else setAlpha(alpha + ef.dir * SWIPE_ALPHA_STEP);
      gestureChipOpen();
    }
  }

  function gestureApply(evt) {
    if (!gestureContext()) return;
    const r = gestureStep(gState, evt);
    gState = r.state;
    for (let i = 0; i < r.effects.length; i++) runGestureEffect(r.effects[i]);
    gestureChipSync();
    gestureSchedule();
  }

  /* Ticks resolve two deadlines: the deferred single press and the idle
     auto-home. Both are one-shot, so the timer is armed only while one of them
     is outstanding - and auto-home only matters away from the home stop. */
  function gestureSchedule() {
    if (gTimer) { clearTimeout(gTimer); gTimer = 0; }
    if (!active) return;
    const now = Date.now();
    let wait;
    if (gState.pending) wait = DOUBLE_PRESS_MS - (now - gState.pending.at) + 30;
    else if (gState.stop !== 0) wait = GESTURE_HOME_MS - (now - gState.lastUserAt) + 30;
    else return;
    gTimer = setTimeout(() => {
      gTimer = 0;
      gestureApply({ type: 'tick', now: Date.now() });
    }, Math.max(30, wait));
  }

  function gestureReset() {
    gState = gestureInit();
    // the dial is no longer driving the zoom, so its band goes back to the fit;
    // `alignScale` itself is left alone so unlocking cannot move the image
    alignSeed = 1;
    if (gTimer) { clearTimeout(gTimer); gTimer = 0; }
    if (dialTimer) { clearTimeout(dialTimer); dialTimer = 0; }
    if (els && els.dial) {
      els.dial.classList.remove('is-open');
      els.dial.hidden = true;
    }
  }

  /* Expand the chip for DIAL_HOLD_MS after a gesture, then let it fall back to
     the compact form: the surface has to stay readable while tracing. */
  function gestureChipOpen() {
    if (!els || !els.dial) return;
    gestureChipSync();
    els.dial.classList.add('is-open');
    if (dialTimer) clearTimeout(dialTimer);
    dialTimer = setTimeout(() => {
      dialTimer = 0;
      if (els && els.dial) els.dial.classList.remove('is-open');
    }, DIAL_HOLD_MS);
  }

  function gestureChipSync() {
    if (!els || !els.dial) return;
    if (!gestureContext()) { els.dial.hidden = true; return; }
    const zoom = GESTURE_STOPS[gState.stop] === 'zoom';
    els.dial.hidden = false;
    if (els.dialStopO) els.dialStopO.classList.toggle('is-on', !zoom);
    if (els.dialStopZ) els.dialStopZ.classList.toggle('is-on', zoom);
    if (els.dialValue) {
      els.dialValue.textContent = zoom
        ? I18N.t('dialZoomWidth', { n: renderedWidth() })
        : Math.round(alpha * 100) + '%';
    }
    if (els.dialHint) {
      // ZOOM has no press action, so its hint omits that segment entirely
      const hint = [I18N.t(zoom ? 'dialSwipeZoom' : 'dialSwipeOpacity')];
      if (!zoom) hint.push(I18N.t('dialPressOpacity'));
      hint.push(I18N.t('dialSwap'));
      els.dialHint.textContent = hint.join('  \u00b7  ');
    }
  }

  /* Classify a locked press by its net travel. Either axis counts, because the
     Bluetooth remote's buttons encode direction by press count - a single press
     emits a swipe up, a double press a swipe left - so "less" may arrive on the
     horizontal axis. One axis must clearly dominate (1.5x) and travel at least
     SWIPE_PX, so a diagonal wobble is still neither a tap nor a swipe. Returns
     'y', 'x' or '' . */
  function swipeAxis(dx, dy) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ay > ax * 1.5 && ay >= SWIPE_PX) return 'y';
    if (ax > ay * 1.5 && ax >= SWIPE_PX) return 'x';
    return '';
  }

  /* The step sign a completed swipe applies, or 0 if it came back: toward
     up/right = +1, toward down/left = -1. Measured from the net travel at
     release, so a swipe that returns to the origin applies nothing. */
  function swipeStep(axis, dx, dy) {
    if (!axis) return 0;
    const along = axis === 'x' ? dx : dy;
    if (Math.abs(along) < SWIPE_PX / 2) return 0;
    if (axis === 'x') return along > 0 ? 1 : -1;
    return along < 0 ? 1 : -1;
  }

  /* While locked, a press on the projection surface (anywhere off the HUD)
     starts a peek/swipe: a quick tap peeks the reference away, a vertical
     swipe applies ONE discrete opacity step (up = more opaque, down = more
     transparent). The drag itself does not continuously scrub opacity; each
     completed press-drag-release is a single +/-, regardless of how far you
     drag. The gesture tracks across the whole window (see onLockedMove /
     onLockedEnd) so a swipe runs on past the image edge. */
  function startLockedGesture(e) {
    if (!locked || arMode !== 'off') { gdbgSkip('lock off / AR pinning active'); return false; }
    if (overHud(e)) { gdbgSkip('over the HUD'); return false; }
    e.preventDefault();
    els.canvas.setPointerCapture(e.pointerId);
    hideTap = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: Date.now(), moved: false, mode: 'none', axis: '' };
    gdbgPressStart();
    return true;
  }

  function onLockedMove(e) {
    if (!hideTap || e.pointerId !== hideTap.id) return;
    const dx = e.clientX - hideTap.x0;
    const dy = e.clientY - hideTap.y0;
    const dist = Math.hypot(dx, dy);
    if (gdbgPress) gdbgPress.peak = Math.max(gdbgPress.peak, dist);
    // recognise a swipe once one axis clearly dominates and travel is far enough
    // (either axis - see swipeAxis). We don't scrub the value live here - the
    // step is applied once, on release.
    if (hideTap.mode === 'none' && dist > HIDE_TAP_SLOP) {
      const axis = swipeAxis(dx, dy);
      if (axis) { hideTap.mode = 'swipe'; hideTap.axis = axis; }
      else hideTap.moved = true;   // neither a tap nor a swipe
    }
    e.preventDefault(); // keep a vertical drag from scrolling/zooming the page
  }

  function onLockedEnd(e) {
    if (!hideTap || e.pointerId !== hideTap.id) return;
    const cancelled = e.type === 'pointercancel';
    const tap = hideTap;
    hideTap = null;
    if (cancelled) { gdbgFinish(tap, e, 'cancel'); return; }
    const dx = e.clientX - tap.x0, dy = e.clientY - tap.y0;
    // a quick, nearly motionless press peeks the reference away / restores it
    if (tap.mode !== 'swipe' && !tap.moved && Date.now() - tap.t0 <= HIDE_TAP_MS &&
      Math.hypot(dx, dy) <= HIDE_TAP_SLOP) {
      gdbgFinish(tap, e, 'press');
      // the single press is deferred by the dial, so a double press can swap the
      // stop without also firing two peeks
      gestureApply({ type: 'press', now: Date.now() });
      return;
    }
    // one completed swipe = one step of whichever stop is selected
    if (tap.mode === 'swipe') {
      const dir = swipeStep(tap.axis, dx, dy);
      if (dir) {
        gdbgFinish(tap, e, 'swipe ' + tap.axis + (dir > 0 ? '+' : '-'));
        gestureApply({ type: 'swipe', dir: dir, now: Date.now() });
      } else {
        gdbgFinish(tap, e, 'no step (returned)');
      }
      return;
    }
    gdbgFinish(tap, e, '');
  }

  function onPointerDown(e) {
    if (!active) return;
    if (arMode === 'on' && arEdit) { arAdjustDown(e); return; }
    if (arMode === 'setup') {
      // drag the loupe around; the pin drops where you lift
      e.preventDefault();
      els.canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = els.canvas.getBoundingClientRect();
      arLoupeStart(e.pointerId, e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    if (locked && arMode === 'off') {
      // While locked, pan/zoom is frozen; the whole projection surface (minus
      // the HUD) is a gesture area. See startLockedGesture for the rest.
      startLockedGesture(e);
      return;
    }
    if (locked) { gdbgSkip('locked but AR pinning is active'); return; }
    gdbgSkip('not locked (pan/zoom)');
    els.canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      panLast = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchLast = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        mid: { x: (pts[0].x + pts[1].x) / 2 - rectLeft(), y: (pts[0].y + pts[1].y) / 2 - rectTop() },
      };
      panLast = null;
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!active) return;
    if (arMode === 'on' && arEdit) { arAdjustMove(e); return; }
    if (arMode === 'setup' && pointers.has(e.pointerId)) {
      const rect = els.canvas.getBoundingClientRect();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      arLoupeMove(e.clientX - rect.left, e.clientY - rect.top);
      e.preventDefault();
      return;
    }
    // The locked peek/swipe gesture is driven by the window listeners
    // (onLockedMove / onLockedEnd) so it tracks across the whole window, not
    // just the canvas/image. A locked pointer is never added to `pointers`.
    if (locked || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1 && panLast) {
      const dx = e.clientX - panLast.x;
      const dy = e.clientY - panLast.y;
      panLast = { x: e.clientX, y: e.clientY };
      if (isFeedActive()) {
        feedPan(dx, dy);
      } else {
        pan(dx, dy);
      }
    } else if (pointers.size === 2 && pinchLast) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2 - rectLeft(), y: (pts[0].y + pts[1].y) / 2 - rectTop() };
      if (pinchLast.dist > 0) {
        if (isFeedActive()) feedZoomAt(mid.x, mid.y, dist / pinchLast.dist);
        else zoomAt(mid.x, mid.y, dist / pinchLast.dist);
      }
      if (isFeedActive()) {
        feedPan(mid.x - pinchLast.mid.x, mid.y - pinchLast.mid.y);
      } else {
        pan(mid.x - pinchLast.mid.x, mid.y - pinchLast.mid.y);
      }
      pinchLast = { dist, mid };
    }
    e.preventDefault();
  }

  function onPointerEnd(e) {
    const cancelled = e.type === 'pointercancel';
    // locked peek/swipe completion is handled by the window listener
    if (arMode === 'on' && arEdit) { arAdjustUp(e); return; }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchLast = null;
    if (pointers.size === 0) panLast = null;
    if (arMode === 'setup' && pointers.size === 0 && !cancelled) {
      // place the pin at the loupe centre on lift
      const rect = els.canvas.getBoundingClientRect();
      const px = arLoupe.x + rect.left, py = arLoupe.y + rect.top;
      arLoupeStop();
      arAddTap(px, py);
      requestRender();
    } else if (cancelled) {
      arLoupeStop();
      requestRender();
    }
  }

  function onWheel(e) {
    if (!active || locked) return;
    if (arMode === 'setup' || arEdit) return; // loupe drag / pin adjust, not pan zoom
    e.preventDefault();
    const rect = els.canvas.getBoundingClientRect();
    // feed zoom uses a finer exponential than the normal image zoom
    const k = isFeedActive() ? FEED_WHEEL_K : 0.0016;
    const factor = Math.exp(-e.deltaY * k);
    if (isFeedActive()) feedZoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    else zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  }

  /* ---------- HUD population ---------- */
  function applyPrefsToHud() {
    els.alpha.value = String(Math.round(alpha * 100));
    if (els.alphaVal) els.alphaVal.textContent = Math.round(alpha * 100) + '%';
    els.grid.checked = gridOn;
    if (els.grey) els.grey.checked = greyOn;
    els.gridCell.value = String(gridCell);
    if (els.gridCellVal) els.gridCellVal.textContent = I18N.t('traceGridPx', { n: gridCell });
    els.lineBlur.value = String(lineBlur);
    if (els.lineBlurVal) els.lineBlurVal.textContent = String(lineBlur);
    els.lineStrength.value = String(Math.round(lineStrength * 100));
    if (els.lineStrengthVal) els.lineStrengthVal.textContent = String(Math.round(lineStrength * 100));
    if (els.lineKey) {
      els.lineKey.value = String(Math.round(lineKey * 100));
      if (els.lineKeyVal) els.lineKeyVal.textContent = String(Math.round(lineKey * 100));
    }
    if (els.lineMagenta) els.lineMagenta.checked = lineMagenta;
    setLocked(false);
    hideTap = null;
    // start each session with the reference shown: if the last session ended
    // with a hide-peek (opacity 0), bring back the opacity we remembered
    if (alpha <= 0) setAlpha(restoreAlpha > 0 ? restoreAlpha : 0.6, false);
    // start each session on the normal photo; line art & AR are opt-in
    lineOn = false;
    linePanelHidden = false;
    syncLineHud();
    // restore the persisted feed zoom and sync its HUD button
    if (els.feedToggle) {
      els.feedToggle.setAttribute('aria-pressed', feedOn ? 'true' : 'false');
      els.feedToggle.classList.toggle('is-on', feedOn);
      const fl = els.feedToggle.querySelector('[data-i18n]') || els.feedToggle;
      fl.textContent = I18N.t(feedOn ? 'traceFeedOn' : 'traceFeedZoom');
    }
    arMode = 'off';
    arSrc = []; arDst = []; arH = null; arWarpCanvas = null; arMap = null;
    arPhase = 'image';
    if (els.arMagnet) els.arMagnet.checked = arMagnet;
    arLoupeStop();
    if (els.arBtn) {
      els.arBtn.setAttribute('aria-pressed', 'false');
      els.arBtn.classList.remove('is-on');
      const al = els.arBtn.querySelector('[data-i18n]') || els.arBtn;
      al.textContent = I18N.t('arOn');
    }
    if (els.arPanel) els.arPanel.hidden = true;
    if (els.arNext) els.arNext.hidden = true;
    hudMin = false; // manual minimise resets each session; hudSmall tracks viewport
    hudUserOpen = false;
    applyHud();
  }

  function syncCamButton() {
    const front = facing !== 'environment';
    els.cam.textContent = I18N.t(front ? 'traceCameraFront' : 'traceCameraRear');
    els.cam.setAttribute('aria-pressed', front ? 'true' : 'false');
  }

  function switchCamera() {
    if (!active) return;
    facing = facing === 'environment' ? 'user' : 'environment';
    savePrefs();
    syncCamButton();
    stopStream();
    startCamera().then((res) => {
      if (!res.ok) toast(res.err);
      else { detectSensorZoom(); applyFeedTransform(); }
    });
  }

  /* ---------- init ---------- */
  function grab(id) { return document.getElementById(id); }

  function init() {
    els = {
      overlay: grab('project-overlay'),
      video: grab('project-video'),
      canvas: grab('project-canvas'),
      hud: grab('project-hud'),
      dial: grab('project-dial'),
      dialStopO: grab('dial-stop-opacity'),
      dialStopZ: grab('dial-stop-zoom'),
      dialValue: grab('dial-value'),
      dialHint: grab('dial-hint'),
      hudToggle: grab('project-hud-toggle'),
      alpha: grab('project-alpha'),
      alphaVal: grab('project-alpha-val'),
      grid: grab('project-grid'),
      grey: grab('project-grey'),
      gridCell: grab('project-gridcell'),
      gridCellVal: grab('project-gridcell-val'),
      gridCellCtrl: grab('project-gridcell-ctrl'),
      lock: grab('project-lock'),
      cam: grab('project-cam'),
      fit: grab('project-fit'),
      exit: grab('project-exit'),
      exitConfirm: grab('project-exit-confirm'),
      exitYes: grab('project-exit-yes'),
      exitCancel: grab('project-exit-cancel'),
      feedToggle: grab('project-feedzoom'),
      feedIn: grab('project-feed-in'),
      feedOut: grab('project-feed-out'),
      feedReset: grab('project-feed-reset'),
      lineBtn: grab('project-line'),
      linePanel: grab('project-lines'),
      lineCanvas: grab('project-lines-canvas'),
      lineBlur: grab('project-line-blur'),
      lineBlurVal: grab('project-line-blur-val'),
      lineStrength: grab('project-line-strength'),
      lineStrengthVal: grab('project-line-strength-val'),
      lineKey: grab('project-line-key'),
      lineKeyVal: grab('project-line-key-val'),
      lineMagenta: grab('project-line-magenta'),
      lineMagentaRow: grab('project-line-magenta-row'),
      lineClose: grab('project-lines-close'),
      arBtn: grab('project-ar'),
      arPanel: grab('project-ar-panel'),
      arStatus: grab('project-ar-status'),
      arMagnet: grab('project-ar-magnet'),
      arCorners: grab('project-ar-corners'),
      arNext: grab('project-ar-next'),
      arClear: grab('project-ar-clear'),
      arClose: grab('project-ar-close'),
      areditGroup: grab('project-aredit-group'),
      areditSep: grab('project-aredit-sep'),
      arAdjust: grab('project-ar-adjust'),
      arFineRow: grab('project-ar-fine-row'),
      arFine: grab('project-ar-fine'),
    };
    canvasCtx = els.canvas.getContext('2d');
    loadPrefs();

    grab('btn-project').addEventListener('click', () => { enter(); });

    els.alpha.addEventListener('input', () => setAlpha(parseFloat(els.alpha.value) / 100));
    els.grid.addEventListener('change', () => setGrid(els.grid.checked));
    if (els.grey) els.grey.addEventListener('change', () => setGrey(els.grey.checked));
    els.gridCell.addEventListener('input', () => setGridCell(parseFloat(els.gridCell.value)));
    els.lock.addEventListener('click', () => setLocked(!locked));
    els.cam.addEventListener('click', switchCamera);
    els.fit.addEventListener('click', () => fitReset());
    els.exit.addEventListener('click', openExitConfirm);
    if (els.exitYes) els.exitYes.addEventListener('click', confirmExitProject);
    if (els.exitCancel) els.exitCancel.addEventListener('click', closeExitConfirm);
    if (els.exitConfirm) {
      // clicking the dark backdrop dismisses without exiting
      els.exitConfirm.addEventListener('click', (e) => {
        if (e.target === els.exitConfirm) closeExitConfirm();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.exitConfirm && !els.exitConfirm.hidden) {
        closeExitConfirm();
      }
    });
    if (els.feedToggle) els.feedToggle.addEventListener('click', () => { if (!locked) setFeedOn(!feedOn); });
    if (els.feedIn) els.feedIn.addEventListener('click', () => { if (locked) return; setFeedOn(true); feedZoomBy(FEED_BTN_STEP); });
    if (els.feedOut) els.feedOut.addEventListener('click', () => { if (locked) return; setFeedOn(true); feedZoomBy(1 / FEED_BTN_STEP); });
    if (els.feedReset) els.feedReset.addEventListener('click', () => { if (locked) return; feedReset(); });
    els.lineBtn.addEventListener('click', toggleLine);
    els.lineBlur.addEventListener('input', () => setLineBlur(parseFloat(els.lineBlur.value)));
    els.lineStrength.addEventListener('input', () => setLineStrength(parseFloat(els.lineStrength.value) / 100));
    if (els.lineKey) els.lineKey.addEventListener('input', () => setLineKey(parseFloat(els.lineKey.value) / 100));
    if (els.lineMagenta) els.lineMagenta.addEventListener('change', () => setLineMagenta(els.lineMagenta.checked));
    if (els.lineClose) {
      els.lineClose.addEventListener('click', () => setLinePanel(false));
    }
    if (els.arBtn) els.arBtn.addEventListener('click', onArBtnClick);
    if (els.arMagnet) els.arMagnet.addEventListener('change', () => setArMagnet(els.arMagnet.checked));
    if (els.arCorners) els.arCorners.addEventListener('click', arUseCorners);
    if (els.arNext) els.arNext.addEventListener('click', arNext);
    if (els.arClear) els.arClear.addEventListener('click', arStop);
    if (els.arClose) els.arClose.addEventListener('click', arStop);
    if (els.arAdjust) els.arAdjust.addEventListener('click', () => setArEdit(!arEdit));
    if (els.arFine) els.arFine.addEventListener('change', () => setArFine(els.arFine.checked));
    if (els.hudToggle) els.hudToggle.addEventListener('click', toggleHudMin);

    // detect narrow screens so the HUD can auto-minimise during pinning
    const narrowMq = global.matchMedia ? global.matchMedia('(max-width: 640px)') : null;
    const applyNarrow = () => setHudSmall(narrowMq ? narrowMq.matches : false);
    applyNarrow();
    if (narrowMq && typeof narrowMq.addEventListener === 'function') {
      narrowMq.addEventListener('change', applyNarrow);
    } else if (narrowMq && typeof narrowMq.addListener === 'function') {
      narrowMq.addListener(applyNarrow);
    }

    els.canvas.addEventListener('pointerdown', onPointerDown);
    els.canvas.addEventListener('pointermove', onPointerMove);
    els.canvas.addEventListener('pointerup', onPointerEnd);
    els.canvas.addEventListener('pointercancel', onPointerEnd);
    // The locked peek/swipe gesture tracks across the whole window (not just
    // the canvas/image), so pointermove/up for it are caught here. They no-op
    // unless a hideTap gesture is in progress.
    global.addEventListener('pointermove', onLockedMove);
    global.addEventListener('pointerup', onLockedEnd);
    global.addEventListener('pointercancel', onLockedEnd);
    els.canvas.addEventListener('wheel', onWheel, { passive: false });
    els.canvas.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    // a long press (mouse down held / touch hold) must not open the OS context
    // menu, especially while pinning
    els.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    els.overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    els.video.addEventListener('contextmenu', (e) => e.preventDefault());

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => { if (active) resize(); }).observe(els.overlay);
    }
    global.addEventListener('fullscreenchange', () => {
      if (active && document.fullscreenElement !== els.overlay) resize();
    });
    // Pause the camera while the document is hidden (the browser may stop
    // feeding frames anyway) and re-engage it as soon as the app regains
    // focus, so switching to another app and back resumes the live view.
    document.addEventListener('visibilitychange', () => {
      if (!active) return;
      if (document.hidden) {
        stopStream();
      } else if (!stream) {
        startCamera().then((res) => {
          if (!res.ok) toast(res.err);
          else { detectSensorZoom(); applyFeedTransform(); }
        });
      }
    });
    // Also handle the case where the OS returns focus without a visibility
    // change firing (e.g. some Android WebView flows still emit 'focus').
    global.addEventListener('focus', () => {
      if (active && !document.hidden && !stream) {
        startCamera().then((res) => {
          if (!res.ok) toast(res.err);
          else { detectSensorZoom(); applyFeedTransform(); }
        });
      }
    });
  }

  const Tracing = {
    init,
    enter,
    exit,
    isActive: () => active,
    isLineOn: () => lineOn,
    setLineOn,
    arStart,
    arStop,
    isArOn: () => arMode === 'on',
    /* testable internals */
    __internal: {
      computeFit, gridLines, snapToGrid, thirdLineMarkers, clampScale,
      luminanceOf, boxBlur, makeLineDrawing, lineDrawingFromGray, keyWhiteToAlpha,
      computeHomography, invert3, applyHomography,
      splitFeedZoom,
      gestureInit, gestureStep, GESTURE_STOPS, GESTURE_TIMING, ZOOM_STEPS_PX,
      STOP_PRESS, alignBand, clampAlign, alignView, alignStepDelta,
      swipeAxis, swipeStep,
    },
  };

  global.CP = global.CP || {};
  global.CP.Tracing = Tracing;
})(window);
