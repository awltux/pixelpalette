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
   gamut.js - achievable colour gamut of a paint set, compared
   against the sRGB and CMYK gamuts.

   For each paint set we sample thousands of ratio combinations
   through the real mixing model, convert each mixed spectrum to
   Lab and keep the maximum chroma reached at each hue. The sRGB
   and CMYK boundaries are computed the same way from the RGB
   cube / CMY inks. A polar "gamut wheel" is drawn on a canvas:
   the hue wheel shows the RGB gamut, with the CMYK outline and
   the palette's achieved region overlaid.
   ============================================================ */
(function (global) {
  'use strict';

  const Color = global.Color || require('./color.js');
  const Mixing = global.Mixing || require('./mixing.js');

  const HUE_STEPS = 72;              // 5° buckets
  const STEP_DEG = 360 / HUE_STEPS;

  /* The palette's achievable gamut depends on lightness as well as hue: for
     glazing media high chroma is only reachable at dark lightness (full
     strength pigment), so a single chroma-vs-hue envelope over-measures the
     gamut and flags light saturated colours as "in range" when the mixer
     cannot reproduce them. Record the boundary per lightness band instead
     and interpolate at the colour's own L*. */
  const L_BANDS = [20, 35, 50, 65, 80];
  const NBANDS = L_BANDS.length;

  function labOf(rgb) {
    const l = Color.rgbToLab(rgb.r, rgb.g, rgb.b);
    return { L: l.L, chroma: Math.hypot(l.a, l.b), hue: (Math.atan2(l.b, l.a) * 180 / Math.PI + 360) % 360 };
  }

  function hueIndex(hue) {
    return Math.floor((hue % 360) / STEP_DEG) % HUE_STEPS;
  }

  /* maximum chroma reached per hue bucket */
  function newBuckets() { return new Float64Array(HUE_STEPS); }

  function record(hexOrRgb, buckets) {
    const rgb = typeof hexOrRgb === 'string' ? Color.hexToRgb(hexOrRgb) : hexOrRgb;
    const lab = labOf(rgb);
    const i = hueIndex(lab.hue);
    if (lab.chroma > buckets[i]) buckets[i] = lab.chroma;
  }

  /* banded palette boundary: index = band * HUE_STEPS + hue */
  function bandIndex(L) {
    if (L <= L_BANDS[0]) return 0;
    if (L >= L_BANDS[NBANDS - 1]) return NBANDS - 1;
    return Math.floor((L - L_BANDS[0]) / (L_BANDS[1] - L_BANDS[0]));
  }

  /* record a mixed colour's chroma into the band for its own lightness */
  function recordBanded(rgb, buckets) {
    const lab = labOf(rgb);
    const i = bandIndex(lab.L) * HUE_STEPS + hueIndex(lab.hue);
    if (lab.chroma > buckets[i]) buckets[i] = lab.chroma;
  }

  /* like recordBanded but at an explicit hue index (the solver target's
     bucket, whose hue can drift from where the mix actually lands) */
  function recordBandedAt(rgb, buckets, hue) {
    const lab = labOf(rgb);
    const i = bandIndex(lab.L) * HUE_STEPS + hue;
    if (lab.chroma > buckets[i]) buckets[i] = lab.chroma;
  }

  /* interpolate the banded boundary at a lightness between band centres */
  function boundaryAt(pals, L, hue) {
    if (L <= L_BANDS[0]) return pals[hue];
    if (L >= L_BANDS[NBANDS - 1]) return pals[(NBANDS - 1) * HUE_STEPS + hue];
    for (let b = 0; b < NBANDS - 1; b++) {
      if (L >= L_BANDS[b] && L <= L_BANDS[b + 1]) {
        const t = (L - L_BANDS[b]) / (L_BANDS[b + 1] - L_BANDS[b]);
        return pals[b * HUE_STEPS + hue]
          + (pals[(b + 1) * HUE_STEPS + hue] - pals[b * HUE_STEPS + hue]) * t;
      }
    }
    return pals[(NBANDS - 1) * HUE_STEPS + hue];
  }

  /* --- sRGB gamut: max chroma per hue from pure hues --- */
  function srgbBoundary() {
    const b = newBuckets();
    for (let h = 0; h < 360; h += 2) {
      for (const l of [25, 40, 50, 62, 75]) {
        record(Color.hslToRgb(h, 100, l), b);
      }
    }
    return b;
  }

  /* --- CMYK gamut: sample CMY+K ink combinations --- */
  function cmykBoundary() {
    const b = newBuckets();
    const inks = [0, 0.2, 0.4, 0.6, 0.8, 1];
    for (const c of inks) {
      for (const m of inks) {
        for (const y of inks) {
          for (const k of [0, 0.3, 0.6]) {
            // naive subtractive ink model
            const r = (1 - c) * (1 - k) * 255;
            const g = (1 - m) * (1 - k) * 255;
            const bb = (1 - y) * (1 - k) * 255;
            record({ r: Math.round(r), g: Math.round(g), b: Math.round(bb) }, b);
          }
        }
      }
    }
    return b;
  }

  /* --- palette gamut: mix ratio samples through the real model --- */
  function paletteBoundary(paints, medium) {
    const buckets = new Float64Array(NBANDS * HUE_STEPS);
    const n = paints.length;
    const glaze = medium.type === 'glaze';

    // singles (pair loops below include the 0/1 endpoints, so this is only
    // needed for the glaze "clear wash" point)
    if (glaze) recordBanded(Mixing.synthesizeReflectance(medium.paper || '#FFFFFF'), buckets);

    // pairs at fine ratio steps (plus dilution for glazing media)
    const concs = glaze ? [0.3, 0.6, 1] : [1];
    for (let r = 0; r <= 1; r += 0.2) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          for (const c of concs) {
            const R = Mixing.mixReflectance([paints[i], paints[j]], [r * c, (1 - r) * c], medium);
            recordBanded(Mixing.spectrumToRgb(R), buckets);
          }
        }
      }
    }

    // Solve the palette against saturated targets on a hue × lightness grid.
    // The pair sampling alone under-measures the achievable gamut because the
    // solver can combine 3-4 paints at ratios the coarse grid never visits,
    // so a valid mix can sit outside the drawn region. Recording the solver's
    // own best mixes into the boundary keeps it honest with what the app
    // shows. Each solve lands in the band of the mix's own lightness.
    for (let h = 0; h < 360; h += 30) {
      for (const l of L_BANDS) {
        const res = Mixing.solve(paints, Color.hslToRgb(h, 100, l), medium);
        const lab = labOf(res.mixRgb);
        const targetIdx = Math.floor((h % 360) / STEP_DEG) % HUE_STEPS;
        const mixIdx = Math.floor((lab.hue % 360) / STEP_DEG) % HUE_STEPS;
        // The solver always returns its best mix; when the palette can't
        // reach the target hue (e.g. a single paint) the result is some
        // unrelated colour, so only attribute it to the target's bucket if
        // the mix actually lands within a few degrees of that hue. Without
        // this a degenerate palette's one colour would be stamped into every
        // hue bucket, grossly inflating its gamut.
        const dHue = Math.abs(h - lab.hue);
        if (Math.min(dHue, 360 - dHue) <= 20) recordBandedAt(res.mixRgb, buckets, targetIdx);
        recordBandedAt(res.mixRgb, buckets, mixIdx);
      }
    }

    // widen each recorded hue into its neighbours: the target hue of a solver
    // run and the hue the mix actually lands on can drift by a few degrees,
    // so fill a small window to avoid a mix poking just outside the region.
    // Filled per band, so lightness slices stay independent. Tiny palettes
    // have no mixing drift, so keep their region tight.
    const out = new Float64Array(NBANDS * HUE_STEPS);
    const FILL = n <= 2 ? 1 : 4; // ±5° for 1-2 paints, ±20° otherwise
    for (let b = 0; b < NBANDS; b++) {
      const base = b * HUE_STEPS;
      for (let i = 0; i < HUE_STEPS; i++) {
        for (let d = -FILL; d <= FILL; d++) {
          const j = ((i + d) % HUE_STEPS + HUE_STEPS) % HUE_STEPS;
          if (buckets[base + i] > out[base + j]) out[base + j] = buckets[base + i];
        }
      }
    }
    return out;
  }

  /* percentage of the sRGB hue-chroma area the palette covers */
  function coverage(pal, ref) {
    let sum = 0;
    for (let i = 0; i < HUE_STEPS; i++) {
      if (ref[i] > 0) sum += Math.min(1, pal[i] / ref[i]);
    }
    return sum / HUE_STEPS;
  }

  /* compute gamut data for a palette; returns boundaries + coverage */
  const CACHE = new Map();
  function compute(paints, medium) {
    const sig = (medium.type || 'opaque') + '|' + (paints || [])
      .map(p => `${p.hex}:${p.strength}:${p.opacity}:${p.undertone || ''}`)
      .join(',');
    const cached = CACHE.get(sig);
    if (cached) return cached;
    const srgb = srgbBoundary();
    const cmyk = cmykBoundary();
    const pals = paletteBoundary(paints || [], medium || { type: 'opaque', paper: '#FFFFFF' });
    // aggregate envelope (per-hue max across all lightness bands) is the
    // overall coverage metric; the per-pixel / per-target tests use `pals`
    const pal = newBuckets();
    for (let b = 0; b < NBANDS; b++) {
      const base = b * HUE_STEPS;
      for (let i = 0; i < HUE_STEPS; i++) if (pals[base + i] > pal[i]) pal[i] = pals[base + i];
    }
    const data = {
      srgb,
      cmyk,
      pal,
      pals,
      srgbMax: Math.max(...srgb),
      coverageRGB: coverage(pal, srgb),
      coverageCMYK: coverage(pal, cmyk),
    };
    if (CACHE.size > 32) CACHE.clear();
    CACHE.set(sig, data);
    return data;
  }

  /* true/false whether an RGB colour falls inside the palette's achieved
     region at its own lightness: its Lab chroma at its hue must not exceed
     the banded boundary interpolated to the colour's L* (with a small
     tolerance so a mix that lands right on the edge isn't flagged). */
  function pointInside(paints, medium, rgb) {
    const data = compute(paints, medium);
    const lab = labOf(typeof rgb === 'string' ? Color.hexToRgb(rgb) : rgb);
    return lab.chroma <= boundaryAt(data.pals, lab.L, hueIndex(lab.hue)) + 2;
  }

  /* ---- canvas rendering ---- */
  function polar(cx, cy, radius, hueDeg, dpr) {
    const rad = ((hueDeg - 90) * Math.PI) / 180; // 0° = top (matches hue wheel)
    return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
  }

  /* map an RGB colour to a pixel position on the wheel, using the same
     hue -> angle and (chroma vs sRGB boundary) -> radius scaling as the
     traces, so markers line up exactly with the drawn boundaries. */
  function positionOf(side, R, data, rgb) {
    const lab = labOf(typeof rgb === 'string' ? Color.hexToRgb(rgb) : rgb);
    const idx = hueIndex(lab.hue);
    const ratio = data.srgb[idx] > 0 ? Math.min(1, lab.chroma / data.srgb[idx]) : 0;
    return polar(side / 2, side / 2, R * ratio, lab.hue, 1);
  }

  function drawMarker(ctx, rgb, ring) {
    const fill = typeof rgb === 'string' ? rgb : Color.rgbToHex(rgb.r, rgb.g, rgb.b);
    const r = ring ? 7 : 5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#1a2333';
    ctx.stroke();
  }

  function render(canvas, data, opts) {
    // canvas must have a real laid-out size before we draw, otherwise the
    // backing store gets stretched (an oval) once layout settles
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (!cssW || !cssH) return false;

    const dpr = global.devicePixelRatio || 1;
    // force a square backing store so the wheel is always a circle
    const side = Math.min(cssW, cssH);
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = side / 2, cy = side / 2;
    const R = side / 2 - 12;

    ctx.clearRect(0, 0, side, side);

    // 1. hue wheel = the RGB gamut reference
    for (let i = 0; i < HUE_STEPS; i++) {
      const h = i * STEP_DEG;
      const a0 = polar(cx, cy, R, h, dpr);
      const a1 = polar(cx, cy, R, h + STEP_DEG, dpr);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(a0.x, a0.y);
      ctx.arc(cx, cy, R, ((h - 90) * Math.PI) / 180, ((h + STEP_DEG - 90) * Math.PI) / 180);
      ctx.closePath();
      ctx.fillStyle = `hsl(${h.toFixed(1)} 100% 55%)`;
      ctx.fill();
    }
    // centre dot for neutral
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fill();

    // 2. CMYK outline
    traceBoundary(ctx, cx, cy, R, data.cmyk, data.srgb, 'rgba(255,255,255,.85)', true);

    // 3. palette region (overall envelope)
    traceBoundary(ctx, cx, cy, R, data.pal, data.srgb, 'rgba(80,160,255,.28)', false);

    // 4. the palette's reach at the target's lightness: a bright outline
    //    interpolated from the banded boundary, so a target marker that sits
    //    outside it is genuinely unreachable at that brightness
    const markers = (opts && opts.markers) || [];
    const target = markers.find((m) => m.ring);
    if (target) {
      const tLab = labOf(target.rgb);
      const band = new Float64Array(HUE_STEPS);
      for (let i = 0; i < HUE_STEPS; i++) band[i] = boundaryAt(data.pals, tLab.L, i);
      traceOutline(ctx, cx, cy, R, band, data.srgb, '#4d8dff');
    }

    // 5. target + mixed markers on top
    for (const m of markers) {
      const p = positionOf(side, R, data, m.rgb);
      if (p.x < 0 || p.y < 0 || p.x > side || p.y > side) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      drawMarker(ctx, m.rgb, m.ring);
      ctx.restore();
    }

    return { cx, cy, R };
  }

  function traceBoundary(ctx, cx, cy, R, buckets, ref, stroke, dashed) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= HUE_STEPS; i++) {
      const idx = i % HUE_STEPS;
      const ratio = ref[idx] > 0 ? Math.min(1, buckets[idx] / ref[idx]) : 0;
      const p = polar(cx, cy, R * ratio, idx * STEP_DEG, 1);
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    if (dashed) {
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#1a2333';
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    ctx.fillStyle = stroke;
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,160,255,.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* dashed outline (no fill) for the palette's reach at one lightness */
  function traceOutline(ctx, cx, cy, R, buckets, ref, color) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= HUE_STEPS; i++) {
      const idx = i % HUE_STEPS;
      const ratio = ref[idx] > 0 ? Math.min(1, buckets[idx] / ref[idx]) : 0;
      const p = polar(cx, cy, R * ratio, idx * STEP_DEG, 1);
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.setLineDash([]);
  }

    const Gamut = {
    compute,
    render,
    positionOf,
    pointInside,
    boundaryAt,
    hueIndex,
    L_BANDS,
    HUE_STEPS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Gamut;
  } else {
    global.CP = global.CP || {};
    global.CP.Gamut = Gamut;
  }
})(typeof window !== 'undefined' ? window : globalThis);
