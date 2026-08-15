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
   fit-palette.js - build a palette from the paints that best
   match the loaded image. Sampled pixels are matched against
   each paint's masstone in Lab space; paints are chosen greedily,
   one at a time, each picking the biggest remaining coverage win.
   Exposed on global.CP.FitPalette (browser).
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;
  const Color = global.Color;
  const Palettes = global.Palettes;

  const SAMPLE_MAX = 64;   // longest side of the pixel grid we sample
  const GOOD_DELTAE = 12;  // perceptual threshold for "close enough"
  const DEFAULT_COUNT = 8;
  // family extraction: merge nearby Lab colours into perceptual families so
  // a dominant colour mass counts as one weighted unit instead of drowning
  // every small accent region in the selection
  const FAMILY_MERGE_DE = 24;
  const FAMILY_CAP = 48;
  const SWAP_PASSES = 3;

  let overlay, enabledRadio, allRadio, countInput, summaryEl, chipsEl, cancelBtn, createBtn;
  let sourceId = null;
  let pixels = null;
  let lastResult = null;

  function getState() { return global.CP.state; }

  /* downscale the loaded image to a small grid and return its pixels as
     { r, g, b }; transparent pixels are skipped. Returns null when there
     is no image or pixels cannot be read. */
  function samplePixels() {
    const st = getState();
    if (!st || !st.image || !st.image.canvas) return null;
    const w = st.image.width || 0;
    const h = st.image.height || 0;
    if (!w || !h) return null;
    const scale = Math.min(1, SAMPLE_MAX / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const ctx = c.getContext('2d');
    try {
      ctx.drawImage(st.image.canvas, 0, 0, tw, th);
    } catch (e) { return null; }
    let data;
    try { data = ctx.getImageData(0, 0, tw, th).data; } catch (e) { return null; }
    const out = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 64) continue;
      out.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
    return out.length ? out : null;
  }

  const labOf = (rgb) => {
    const L = Color.rgbToLab(rgb.r, rgb.g, rgb.b);
    return [L.L, L.a, L.b];
  };

  const labDist = (a, b) => {
    const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  };

  /* collapse the sampled pixels into perceptual colour families. Pixels are
     quantised into coarse Lab bins (weighted centroids), then merged into
     families by proximity: the largest bins claim nearby bins until the
     whole dominant mass becomes a single weighted unit. Deterministic. */
  function families(pixelRgbs) {
    const bins = new Map();
    for (const c of pixelRgbs) {
      const L = labOf(c);
      const kb = Math.min(7, Math.max(0, (L[0] / 12) | 0));
      const ka = Math.min(7, Math.max(0, ((L[1] + 128) / 32) | 0));
      const kc = Math.min(7, Math.max(0, ((L[2] + 128) / 32) | 0));
      const key = (kb << 6) | (ka << 3) | kc;
      let b = bins.get(key);
      if (!b) { b = { L: [0, 0, 0], n: 0 }; bins.set(key, b); }
      b.L[0] += L[0]; b.L[1] += L[1]; b.L[2] += L[2]; b.n++;
    }
    const list = Array.from(bins.values())
      .map(b => ({ lab: [b.L[0] / b.n, b.L[1] / b.n, b.L[2] / b.n], n: b.n }))
      .sort((a, b) => b.n - a.n);
    const fams = [];
    for (const bin of list) {
      let best = -1, bestD = Infinity;
      for (let f = 0; f < fams.length; f++) {
        const dd = labDist(bin.lab, fams[f].lab);
        if (dd < bestD) { bestD = dd; best = f; }
      }
      if (best >= 0 && bestD <= FAMILY_MERGE_DE) {
        const f = fams[best];
        const tot = f.n + bin.n;
        f.lab = [
          (f.lab[0] * f.n + bin.lab[0] * bin.n) / tot,
          (f.lab[1] * f.n + bin.lab[1] * bin.n) / tot,
          (f.lab[2] * f.n + bin.lab[2] * bin.n) / tot,
        ];
        f.n = tot;
      } else if (fams.length < FAMILY_CAP) {
        fams.push({ lab: bin.lab.slice(), n: bin.n });
      }
    }
    return fams;
  }

  const familyWeight = f => Math.log(1 + f.n);

  /* balanced palette selection: choose `n` paints whose masstones cover the
     sampled pixels best, without letting one dominant colour mass hog the
     whole selection.
       - pixels are grouped into perceptual families (see families()),
       - each family is weighted by log(1 + count) so a huge mass no longer
         outweighs a small accent region by its raw pixel ratio,
       - a greedy pass picks the paints with the biggest weighted error
         reduction,
       - then up to SWAP_PASSES of 1:1 swaps refine the chosen set.
     Deterministic (ties break by paint order). Returns { paints, coverage }
     where coverage is the % of ORIGINAL sampled pixels within GOOD_DELTAE of
     the chosen set. Pure - no DOM, Node-testable. */
  function fitPaints(paints, pixelRgbs, n) {
    if (!Array.isArray(paints)) return { paints: [], coverage: 0 };
    const cand = [];
    const seen = new Set();
    for (const p of paints) {
      const hex = String(p && p.hex || '').toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(hex) || seen.has(hex)) continue;
      seen.add(hex);
      cand.push(p);
    }
    const count = Math.max(0, Math.min(n | 0, cand.length));
    if (!count || !pixelRgbs || !pixelRgbs.length) return { paints: [], coverage: 0 };

    const fams = families(pixelRgbs);
    const paintLab = cand.map(p => labOf(Color.hexToRgb(p.hex)));
    const nf = fams.length;
    const chosen = [];
    const minDist = new Array(nf).fill(Infinity);

    const addPaint = (ci) => {
      chosen.push(ci);
      const L = paintLab[ci];
      for (let i = 0; i < nf; i++) {
        const d = labDist(fams[i].lab, L);
        if (d < minDist[i]) minDist[i] = d;
      }
    };

    // round 1: the paint with the smallest weighted total error
    let best = 0, bestScore = Infinity;
    for (let ci = 0; ci < cand.length; ci++) {
      const L = paintLab[ci];
      let s = 0;
      for (let i = 0; i < nf; i++) s += familyWeight(fams[i]) * labDist(fams[i].lab, L);
      if (s < bestScore) { bestScore = s; best = ci; }
    }
    addPaint(best);

    // rounds 2..n: biggest weighted error reduction
    for (let r = 2; r <= count; r++) {
      let pick = -1, pickGain = 0;
      for (let ci = 0; ci < cand.length; ci++) {
        if (chosen.includes(ci)) continue;
        const L = paintLab[ci];
        let gain = 0;
        for (let i = 0; i < nf; i++) {
          const d = labDist(fams[i].lab, L);
          if (d < minDist[i]) gain += familyWeight(fams[i]) * (minDist[i] - d);
        }
        if (gain > pickGain) { pickGain = gain; pick = ci; }
      }
      if (pick === -1 || pickGain <= 1e-9) break;
      addPaint(pick);
    }

    // pad out a short palette with the paints closest to the image's colour
    // families ("nice-to-have" additions), so the requested count is reached
    // even when extra paints add little measurable coverage
    while (chosen.length < count) {
      let bestCi = -1, bestScore = Infinity;
      for (let ci = 0; ci < cand.length; ci++) {
        if (chosen.includes(ci)) continue;
        const L = paintLab[ci];
        let s = 0;
        for (let i = 0; i < nf; i++) s += familyWeight(fams[i]) * labDist(fams[i].lab, L);
        if (s < bestScore) { bestScore = s; bestCi = ci; }
      }
      if (bestCi === -1) break;
      addPaint(bestCi);
    }

    // local refinement: swap each chosen paint for an unselected one when it
    // improves the weighted objective (a greedy early pick can block a
    // better overall set)
    for (let pass = 0; pass < SWAP_PASSES; pass++) {
      let moved = false;
      for (let si = 0; si < chosen.length; si++) {
        const cur = chosen[si];
        const others = chosen.filter(x => x !== cur);
        const curMin = fams.map((_, i) => {
          let mn = Infinity;
          for (const ci of others) {
            const dd = labDist(fams[i].lab, paintLab[ci]);
            if (dd < mn) mn = dd;
          }
          return mn;
        });
        let sw = -1, swGain = 0, swMin = null;
        for (let ci = 0; ci < cand.length; ci++) {
          if (chosen.includes(ci)) continue;
          let gain = 0;
          const newMin = new Array(nf);
          for (let i = 0; i < nf; i++) {
            const dd = labDist(fams[i].lab, paintLab[ci]);
            // the family's error after the swap: min of the replacement paint
            // and the other chosen paints (cur removed). Compare against the
            // CURRENT error (minDist, which includes cur) - never Infinity,
            // so removing a sole cover can only count a real improvement.
            const m = Math.min(curMin[i], dd);
            newMin[i] = m;
            gain += (minDist[i] - m) * familyWeight(fams[i]);
          }
          if (gain > swGain) { swGain = gain; sw = ci; swMin = newMin; }
        }
        if (sw >= 0 && swGain > 1e-9) {
          chosen[si] = sw;
          for (let i = 0; i < nf; i++) minDist[i] = swMin[i];
          moved = true;
        }
      }
      if (!moved) break;
    }

    // coverage over the original sampled pixels
    const pixLab = pixelRgbs.map(labOf);
    let good = 0;
    for (const L of pixLab) {
      let mn = Infinity;
      for (const ci of chosen) {
        const dd = labDist(L, paintLab[ci]);
        if (dd < mn) mn = dd;
      }
      if (mn <= GOOD_DELTAE) good++;
    }
    return {
      paints: chosen.map(ci => cand[ci]),
      coverage: (good / pixLab.length) * 100,
    };
  }

  function buildLabel(id) {
    const info = Palettes.get(id);
    const base = (info && info.label) || (info && info.medium && info.medium.label) || 'Palette';
    return base + ' ' + (I18N && I18N.t ? I18N.t('fitSuffix') : '\u00b7 Fit');
  }

  /* create a fitted custom palette from palette `id`; opts: { enabledOnly,
     count, pixels }. Returns the new palette id, or null. */
  function create(id, opts) {
    const o = opts || {};
    const src = Palettes.get(id);
    if (!src || !Array.isArray(src.paints)) return null;
    const candidates = src.paints.filter(p => !o.enabledOnly || p.enabled !== false);
    const px = o.pixels || samplePixels();
    if (!candidates.length || !px || !px.length) return null;
    const n = Math.max(1, Math.min(o.count | 0, candidates.length));
    const { paints } = fitPaints(candidates, px, n);
    if (!paints.length) return null;
    const ready = paints.map(p => Object.assign({}, p, { enabled: true }));
    return Palettes.createCustom(buildLabel(id), src.medium, ready, id);
  }

  /* select a fitted palette and refresh the mixer/history */
  function applyAndSwitch(newId) {
    if (!newId) return;
    Palettes.setSelected(newId);
    if (global.CP.MixUI && global.CP.MixUI.refresh) global.CP.MixUI.refresh();
  }

  /* ---------- modal ---------- */

  function enabledOnly() { return enabledRadio ? enabledRadio.checked : true; }

  function recompute() {
    const candidates = Palettes.get(sourceId).paints.filter(p => !enabledOnly() || p.enabled !== false);
    if (countInput) countInput.max = String(Math.max(1, candidates.length));
    if (!candidates.length || !pixels || !pixels.length) {
      lastResult = null;
      if (summaryEl) summaryEl.textContent = '';
      if (chipsEl) chipsEl.innerHTML = '';
      return;
    }
    const value = parseInt(countInput.value, 10);
    const n = isFinite(value) ? value : DEFAULT_COUNT;
    lastResult = fitPaints(candidates, pixels, n);
    if (summaryEl) {
      summaryEl.textContent = I18N.t('fitCoverage', {
        count: lastResult.paints.length,
        pct: Math.round(lastResult.coverage),
      });
    }
    if (chipsEl) {
      chipsEl.innerHTML = '';
      for (const p of lastResult.paints) {
        const chip = document.createElement('span');
        chip.className = 'fit-chip';
        chip.style.background = p.hex;
        chip.title = p.name || p.hex;
        chipsEl.appendChild(chip);
      }
    }
  }

  function open() {
    sourceId = Palettes.getSelected();
    pixels = samplePixels();
    if (!pixels) return; // no image loaded yet
    if (enabledRadio) enabledRadio.checked = true;
    if (countInput) countInput.value = String(DEFAULT_COUNT);
    recompute();
    overlay.hidden = false;
  }

  function close() {
    overlay.hidden = true;
    lastResult = null;
  }

  function onCreate() {
    recompute();
    if (!lastResult || !lastResult.paints.length) return;
    const newId = create(sourceId, {
      enabledOnly: enabledOnly(),
      count: lastResult.paints.length,
      pixels,
    });
    close();
    applyAndSwitch(newId);
  }

  function init() {
    overlay = document.getElementById('fit-overlay');
    if (!overlay) return;
    enabledRadio = document.getElementById('fit-enabled');
    allRadio = document.getElementById('fit-all');
    countInput = document.getElementById('fit-count');
    summaryEl = document.getElementById('fit-summary');
    chipsEl = document.getElementById('fit-chips');
    cancelBtn = document.getElementById('fit-cancel');
    createBtn = document.getElementById('fit-create');
    const btn = document.getElementById('btn-fit-palette');

    if (btn) btn.addEventListener('click', open);
    if (enabledRadio) enabledRadio.addEventListener('change', recompute);
    if (allRadio) allRadio.addEventListener('change', recompute);
    if (countInput) {
      countInput.addEventListener('input', recompute);
      countInput.addEventListener('change', recompute);
    }
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (createBtn) createBtn.addEventListener('click', onCreate);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
  }

  global.CP = global.CP || {};
  global.CP.FitPalette = { init, open, close, samplePixels, fitPaints, create, applyAndSwitch };
})(window);
