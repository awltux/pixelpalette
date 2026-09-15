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
   levels.js - "Levels": a tonal-zone view of the loaded image.

   The artist switches the view on and steps a 5-position slider
   through the image's luminance range, so they can see where the
   dark, mid and light masses actually sit.

   Every pixel is posterised to the flat tone of its zone, so all
   the value masses are visible at once, and the zone currently
   selected on the slider is painted in one saturated highlight
   colour - a neutral backdrop cannot contrast with all five zones,
   whereas a colour cue reads against every grey in the ramp.

   Display-only: the view is produced for the main canvas at draw
   time, so the reticle, the magnifier, colour picking, the history
   and the projected/line-art views all keep using the untouched
   source image (the same rule the soften blur follows).
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;

  const LS_KEY = 'pp.levels';
  const ZONES = 5;
  // flat tone per zone, dark -> light: the posterised base
  const ZONE_GREY = [26, 78, 130, 182, 234];
  // the selected zone's highlight - deliberately saturated, so it is legible
  // whichever end of the ramp the zone sits at
  const HILITE = [255, 106, 0];
  const ZONE_KEYS = ['levelZone1', 'levelZone2', 'levelZone3', 'levelZone4', 'levelZone5'];

  let on = false;
  let band = 2;        // middle window by default
  let els = null;
  let cache = null;    // { src, band, canvas }
  let unreadable = false; // source pixels could not be read (tainted canvas)

  /* ---------- pure zone maths (unit-tested) ---------- */

  /* Which zone a 0..1 luminance falls in: five even windows. Non-finite or
     negative input lands in the darkest zone rather than producing NaN. */
  function zoneOf(lum) {
    if (!(lum > 0)) return 0;
    if (lum >= 1) return ZONES - 1;
    return Math.min(ZONES - 1, Math.floor(lum * ZONES));
  }

  /* Rec.601 luminance of one RGBA pixel, 0..1 (the same weighting the tracing
     line-drawing engine uses). */
  function luminance(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  /* Recolours an RGBA buffer into the tonal-zone view: each pixel becomes the
     flat tone of its zone, except the selected zone, which becomes the
     highlight. Alpha is preserved, and the input is never modified. */
  function zoneView(rgba, sel) {
    const b = Math.max(0, Math.min(ZONES - 1, Math.round(sel) || 0));
    const out = new Uint8ClampedArray(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      const z = zoneOf(luminance(rgba[i], rgba[i + 1], rgba[i + 2]));
      if (z === b) {
        out[i] = HILITE[0]; out[i + 1] = HILITE[1]; out[i + 2] = HILITE[2];
      } else {
        const g = ZONE_GREY[z];
        out[i] = g; out[i + 1] = g; out[i + 2] = g;
      }
      out[i + 3] = rgba[i + 3];
    }
    return out;
  }

  /* ---------- the cached display canvas ---------- */

  function invalidate() { cache = null; }

  /* The processed view of `img` for the current band, or null when the view is
     off / unavailable - the caller then draws the untouched source. Recomputed
     only when the band or the source image changes. */
  function view(img) {
    if (!on || unreadable || !img || !img.canvas) return null;
    const w = img.width, h = img.height;
    if (!(w > 0) || !(h > 0)) return null;
    if (cache && cache.src === img.canvas && cache.band === band) return cache.canvas;
    let data;
    try {
      data = img.canvas.getContext('2d').getImageData(0, 0, w, h);
    } catch (e) {
      // e.g. an image loaded cross-origin without CORS: give up on the view
      // rather than throwing inside the render loop every frame
      unreadable = true;
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(w, h);
    out.data.set(zoneView(data.data, band));
    ctx.putImageData(out, 0, 0);
    cache = { src: img.canvas, band: band, canvas: canvas };
    return canvas;
  }

  /* ---------- state ---------- */

  function loadPrefs() {
    on = false;
    band = 2;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.on === 'boolean') on = p.on;
        if (typeof p.band === 'number') band = Math.max(0, Math.min(ZONES - 1, Math.round(p.band)));
      }
    } catch (e) { /* ignore */ }
  }

  function savePrefs() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ on: on, band: band })); } catch (e) { /* ignore */ }
  }

  function zoneName(i) {
    return I18N ? I18N.t(ZONE_KEYS[Math.max(0, Math.min(ZONES - 1, i))]) : String(i + 1);
  }

  function syncUi() {
    if (!els) return;
    if (els.check) els.check.checked = on;
    if (els.slider) {
      els.slider.value = String(band + 1);
      els.slider.disabled = !on;
      els.slider.setAttribute('aria-valuetext', zoneName(band));
    }
    if (els.name) els.name.textContent = zoneName(band);
    if (els.wrap) els.wrap.classList.toggle('is-off', !on);
  }

  function redraw() {
    if (global.CP.Canvas) global.CP.Canvas.requestRender();
  }

  function setOn(v) {
    on = !!v;
    invalidate();     // the whole-image pass is only worth doing when on
    savePrefs();
    syncUi();
    redraw();
  }

  function setBand(i) {
    const b = Math.max(0, Math.min(ZONES - 1, Math.round(i) || 0));
    if (b === band) return;
    band = b;
    savePrefs();
    syncUi();
    redraw();
  }

  /* ---------- public ---------- */
  const Levels = {
    init() {
      loadPrefs();
      els = {
        wrap: document.getElementById('levels-controls'),
        check: document.getElementById('levels-on'),
        slider: document.getElementById('levels-band'),
        name: document.getElementById('levels-band-name'),
      };
      if (els.check) els.check.addEventListener('change', () => setOn(els.check.checked));
      if (els.slider) els.slider.addEventListener('input', () => setBand(parseInt(els.slider.value, 10) - 1));
      syncUi();
    },
    isOn: () => on,
    band: () => band,
    ZONES: ZONES,
    setOn,
    setBand,
    view,
    invalidate,
    /* testable internals */
    __internal: { zoneOf, zoneView, luminance, ZONE_GREY, HILITE, ZONES },
  };

  global.CP = global.CP || {};
  global.CP.Levels = Levels;
})(window);
