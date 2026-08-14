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
   gamut-filter.js - "Limit to palette" image filter. When
   enabled, every pixel of the image is pulled into the palette's
   achievable gamut (as recorded by Gamut.compute): pixels whose
   Lab chroma exceeds the palette boundary at their hue are scaled
   towards neutral along that hue, keeping their lightness. The
   original image is kept so toggling the filter (or changing the
   palette) restores or re-filters from it. Processing runs in
   requestAnimationFrame chunks so large photos don't block the UI;
   a stale-token guard aborts runs superseded by a newer image or
   palette.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'pp.gamutFilter';
  const ROWS_PER_STEP = 40;

  const Gamut = (global.CP && global.CP.Gamut) || require('./gamut.js');

  const HUE_STEPS = Gamut.HUE_STEPS;
  const STEP_DEG = 360 / HUE_STEPS;

  /* sRGB -> linear LUT: the dominant cost in per-pixel gamut checks is
     Math.pow in the sRGB transfer curve, so precompute all 256 levels */
  const LIN_LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    LIN_LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  const LINEAR_2_SRGB = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  const F_FWD = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const F_INV = t => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };

  function hueIndex(hue) {
    return Math.floor((hue % 360) / STEP_DEG) % HUE_STEPS;
  }

  let enabled = false;
  let token = 0;
  let filtered = null; // { canvas, width, height, sig }
  let pendingApplyRAF = 0;

  function isOn() { return enabled; }

  /* signature that identifies which palette+medium a filtered canvas
     was computed from (mirrors Gamut.compute's cache signature) */
  function paletteSig(paints, medium) {
    return (medium.type || 'opaque') + '|' + (paints || [])
      .map(p => `${p.hex}:${p.strength}:${p.opacity}:${p.undertone || ''}`)
      .join(',');
  }

  function currentPalette() {
    const P = global.Palettes;
    return P.get(P.getSelected());
  }

  function original() {
    const st = global.CP.state;
    return st.imageOriginal || st.image;
  }

  /* clip one RGB pixel into the palette boundary, if needed. The
     single-pass version leaves residual out-of-range pixels because
     8-bit rounding can push a colour clipped to one hue bucket's
     boundary across into a neighbour bucket with a lower boundary;
     iterating re-checks until the pixel is inside (chroma can only
     shrink, so it converges). The boundary is interpolated to the
     pixel's own lightness, so light saturated pixels are clipped like
     the mixer would judge them. Clipping to the strict boundary
     always satisfies Gamut.pointInside, which allows its own +2.
     Hot path is allocation-light and uses the linear LUT above. */
  function clipPixel(r, g, b, pals) {
    let cr = r, cg = g, cb = b;
    for (let iter = 0; iter < 8; iter++) {
      const lr = LIN_LUT[cr], lg = LIN_LUT[cg], lb = LIN_LUT[cb];
      const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
      const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
      const z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;
      const fx = F_FWD(x / 0.95047);
      const fy = F_FWD(y);
      const fz = F_FWD(z / 1.08883);
      const L = 116 * fy - 16;
      const av = 500 * (fx - fy);
      const bv = 200 * (fy - fz);
      const chroma = Math.sqrt(av * av + bv * bv);
      if (chroma < 1e-9) break;
      const hue = Math.atan2(bv, av) * 180 / Math.PI + 360;
      const maxChroma = Gamut.boundaryAt(pals, L, hueIndex(hue));
      if (chroma <= maxChroma + 1e-6) break;
      const s = maxChroma / chroma;
      const na = av * s, nb = bv * s;
      // Lab -> RGB, keeping lightness
      const fy2 = (L + 16) / 116;
      const x2 = F_INV(fy2 + na / 500) * 0.95047;
      const y2 = F_INV(fy2) * 1.0;
      const z2 = F_INV(fy2 - nb / 200) * 1.08883;
      const rl = 3.2404542 * x2 - 1.5371385 * y2 - 0.4985314 * z2;
      const gl = -0.9692660 * x2 + 1.8760108 * y2 + 0.0415560 * z2;
      const bl = 0.0556434 * x2 - 0.2040259 * y2 + 1.0572252 * z2;
      cr = Math.max(0, Math.min(255, Math.round(LINEAR_2_SRGB(Math.max(0, Math.min(1, rl))) * 255)));
      cg = Math.max(0, Math.min(255, Math.round(LINEAR_2_SRGB(Math.max(0, Math.min(1, gl))) * 255)));
      cb = Math.max(0, Math.min(255, Math.round(LINEAR_2_SRGB(Math.max(0, Math.min(1, bl))) * 255)));
    }
    return { r: cr, g: cg, b: cb };
  }

  /* process the full image; resolves to the filtered canvas (or null
     if this run was superseded). Runs in rAF chunks of ROWS_PER_STEP
     and paints each finished chunk back onto the output canvas, which
     is published to the canvas up front so the filter appears
     progressively rather than in one late jump. */
  function filterCanvas(src, w, h, paints, medium, sig, t) {
    return new Promise((resolve) => {
      const pals = Gamut.compute(paints, medium).pals;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const octx = out.getContext('2d');
      octx.drawImage(src, 0, 0);
      const img = octx.getImageData(0, 0, w, h);
      const d = img.data;
      // show the output canvas now (still the original pixels) so
      // finished chunks are visible as they are painted back
      filtered = { canvas: out, src, width: w, height: h, sig, done: false };
      swapImage(out, w, h);
      // per-chunk ImageData so putImageData writes only the finished rows
      const chunkH = Math.min(h, ROWS_PER_STEP);
      const chunkImg = octx.createImageData(w, chunkH);
      const chunk = chunkImg.data;
      let y = 0;
      const step = () => {
        if (t !== token) return resolve(null);
        const end = Math.min(h, y + ROWS_PER_STEP);
        let si = 0;
        for (let row = y; row < end; row++) {
          let i = row * w * 4;
          for (let x = 0; x < w; x++, i += 4, si += 4) {
            const p = clipPixel(d[i], d[i + 1], d[i + 2], pals);
            chunk[si] = p.r;
            chunk[si + 1] = p.g;
            chunk[si + 2] = p.b;
            chunk[si + 3] = 255;
          }
        }
        octx.putImageData(chunkImg, 0, y);
        y = end;
        if (y < h) {
          global.CP.Canvas.requestRender();
          requestAnimationFrame(step);
        } else {
          filtered.done = true;
          global.CP.Canvas.requestRender();
          resolve(out);
        }
      };
      requestAnimationFrame(step);
    });
  }

  /* swap the image shown on canvas without disturbing the current
     view, then re-sample the pixel under the reticle */
  function swapImage(canvas, w, h) {
    const st = global.CP.state;
    st.image = { canvas, width: w, height: h };
    global.CP.Canvas.requestRender();
    global.CP.Reticle.sample();
  }

  function apply() {
    if (!enabled || !Gamut) return;
    const orig = original();
    if (!orig) return;
    const { paints, medium } = currentPalette();
    const sig = paletteSig(paints, medium);
    if (filtered && filtered.done && filtered.sig === sig && filtered.src === orig.canvas) {
      swapImage(filtered.canvas, filtered.width, filtered.height);
      return;
    }
    const t = ++token;
    filterCanvas(orig.canvas, orig.width, orig.height, paints, medium, sig, t);
  }

  /* run apply() on the next frame, coalescing pending runs */
  function scheduleApply() {
    cancelAnimationFrame(pendingApplyRAF);
    pendingApplyRAF = requestAnimationFrame(() => {
      pendingApplyRAF = 0;
      apply();
    });
  }

  function restore() {
    token++;
    const orig = original();
    if (!orig) return;
    if (global.CP.state.image && global.CP.state.image.canvas === orig.canvas) return;
    swapImage(orig.canvas, orig.width, orig.height);
  }

  /* called when a new image is loaded (keeps any stale filtered
     canvas out of the way so apply() re-filters from the new source).
     Deferred a frame so the gamut render (which computes & caches the
     boundary) has a chance to run first. */
  function onImageLoaded() {
    filtered = null;
    scheduleApply();
  }

  /* called after the palette (or medium) changes; if the filter is on,
     re-run it against the new boundary */
  function onPaletteChange() {
    if (!enabled) return;
    filtered = null;
    scheduleApply();
  }

  /* abort any in-flight filter run and any pending re-run WITHOUT
     recalculating. Used when the palette is switched for a colour restore,
     where re-filtering would redraw the image and re-sample the pixel under
     the loupe, overwriting the restored colour in a feedback loop. The
     filter stays as-is until the next genuine palette change or re-enable. */
  function invalidate() {
    token++;
    filtered = null;
    cancelAnimationFrame(pendingApplyRAF);
    pendingApplyRAF = 0;
  }

  function init() {
    try { enabled = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* ignore */ }
    const chk = document.getElementById('chk-gamut');
    if (!chk) return;
    chk.checked = enabled;
    chk.addEventListener('change', () => {
      enabled = chk.checked;
      try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
      if (enabled) apply();
      else restore();
    });
  }

  global.CP = global.CP || {};
  global.CP.GamutFilter = { init, apply, restore, onImageLoaded, onPaletteChange, invalidate, isOn };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.CP.GamutFilter;
    module.exports.__internal = { clipPixel, paletteSig };
  }
})(typeof window !== 'undefined' ? window : globalThis);
