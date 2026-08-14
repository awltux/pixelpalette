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
   mix-ui.js - paint mixing panel: palette select, solved ratios,
   editable ratio sliders, mixed vs target swatches, ΔE.
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;
  const Color = global.Color;
  const Palettes = global.Palettes;
  const Mixing = global.Mixing;

  const els = {};
  const FILTER_KEY = 'pp.filters';
  let gamutRAF = 0;
  let gamutResize = null;
  const ui = {
    paints: [],
    medium: null,
    recipe: [],
    target: null,
    result: null,
    filter: loadFilters(),
  };

  /* which swatch the colour readouts currently show: 'target' or 'mixed' */
  let activeSwatch = 'target';
  /* hex currently displayed in the Mixed swatch (may be a recorded mix from
     history rather than the live ui.result solve) */
  let mixedHex = null;
  /* debounced write-back of a manual mix tweak to the matching history entry */
  let historyTweakTimer = null;

  function loadFilters() {
    const def = { lightfast: 'all', granulating: 'any', staining: 'any', maxPaints: 'all', toxic: 'any' };
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) return Object.assign({}, def, JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return def;
  }

  function saveFilters() {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(ui.filter)); } catch (e) { /* ignore */ }
  }

  function init() {
    els.select = document.getElementById('palette-select');
    els.list = document.getElementById('mix-list');
    els.mixSwatch = document.getElementById('mixed-swatch');
    els.mixedCol = document.getElementById('mixed-swatch-col');
    els.targetSwatch = document.getElementById('colour-swatch');
    els.delta = document.getElementById('mix-delta');
    els.restore = document.getElementById('mix-restore');
    els.resolve = document.getElementById('btn-resolve');
    els.lockMix = document.getElementById('btn-lock-mix');
    els.edit = document.getElementById('btn-edit-palette');
    els.dup = document.getElementById('btn-dup-palette');
    els.readout = document.getElementById('medium-readout');
    els.gamutCanvas = document.getElementById('gamut-canvas');
    els.bar = document.getElementById('result-bar');
    els.barTarget = document.getElementById('rb-target');
    els.barMix = document.getElementById('rb-mix');
    els.barInfo = document.getElementById('rb-info');
    els.barDot = document.getElementById('rb-dot');
    if (els.bar) {
      const scrollToMix = () => {
        const panel = document.getElementById('panel-mix');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      els.bar.addEventListener('click', scrollToMix);
      els.bar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          scrollToMix();
        }
      });
    }
    if (els.gamutCanvas && global.ResizeObserver) {
      gamutResize = new ResizeObserver(() => renderGamut());
      gamutResize.observe(els.gamutCanvas);
    }
    els.filters = {
      lightfast: document.getElementById('filter-lightfast'),
      granulating: document.getElementById('filter-granulating'),
      staining: document.getElementById('filter-staining'),
      maxPaints: document.getElementById('filter-maxpaints'),
      toxic: document.getElementById('filter-toxic'),
    };

    populateSelect();
    loadPalette(Palettes.getSelected());

    for (const key of Object.keys(els.filters)) {
      els.filters[key].value = ui.filter[key] || 'all';
      els.filters[key].addEventListener('change', () => {
        ui.filter[key] = els.filters[key].value;
        saveFilters();
        if (ui.target) update(ui.target);
      });
    }

    els.select.addEventListener('change', () => {
      Palettes.setSelected(els.select.value);
      loadPalette(els.select.value);
      if (ui.target) update(ui.target);
    });

    if (els.lockMix) {
      els.lockMix.addEventListener('click', toggleLockMix);
    }

    els.resolve.addEventListener('click', () => {
      if (!ui.target || !ui.paints.length) return;
      const avail = filterPaints();
      if (!avail.paints.length) return;
      const { res, pool } = pickSolve(avail, ui.target);
      if (!res) return;
      const current = ui.result ? ui.result.deltaE : Infinity;
      if (effectiveDeltaE(res) < current) {
        applyResult(res, pool);
        scheduleHistoryMixUpdate();
      }
    });

    els.edit.addEventListener('click', () => {
      global.CP.PaletteEditor.open();
    });

    els.dup.addEventListener('click', () => {
      const newId = Palettes.duplicate(els.select.value);
      Palettes.setSelected(newId);
      refresh();
      global.CP.PaletteEditor.open();
    });

    if (els.targetSwatch) {
      els.targetSwatch.classList.add('active');
      els.targetSwatch.addEventListener('click', () => setActiveSwatch('target'));
      els.targetSwatch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveSwatch('target'); }
      });
    }
    if (els.mixSwatch) {
      els.mixSwatch.addEventListener('click', () => setActiveSwatch('mixed'));
      els.mixSwatch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveSwatch('mixed'); }
      });
    }
  }

  function populateSelect() {
    els.select.innerHTML = '';
    for (const item of Palettes.list()) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.custom ? item.label : (I18N.t('palette') + ' · ' + item.label);
      els.select.appendChild(opt);
    }
    els.select.value = Palettes.getSelected();
  }

  function loadPalette(id, opts) {
    const { paints, medium } = Palettes.get(id);
    ui.paints = paints || [];
    ui.medium = medium;
    updateMediumReadout();
    updateFilterVisibility();
    renderGamut();
    const gf = global.CP.GamutFilter;
    if (gf) {
      if (opts && opts.suppressFilter) gf.invalidate();
      else gf.onPaletteChange();
    }
  }

  function renderGamut() {
    if (!els.gamutCanvas || !global.CP.Gamut || !ui.medium) return;
    // defer until layout has settled so the canvas has its real size;
    // skips harmlessly if called before the element is laid out
    cancelAnimationFrame(gamutRAF);
    gamutRAF = requestAnimationFrame(() => {
      const data = global.CP.Gamut.compute(ui.paints, ui.medium);
      const markers = [];
      if (ui.target) markers.push({ rgb: ui.target, ring: true });
      if (ui.result && ui.result.mixRgb) markers.push({ rgb: ui.result.mixRgb, ring: false });
      const ok = global.CP.Gamut.render(els.gamutCanvas, data, { markers });
      if (!ok) return;
      const cov = document.getElementById('gamut-coverage');
      if (cov) {
        cov.textContent = `${I18N.t('gamutCoversRGB')} ${(data.coverageRGB * 100).toFixed(0)}% · ${I18N.t('gamutCoversCMYK')} ${(data.coverageCMYK * 100).toFixed(0)}%`;
      }
    });
  }

  /* granulation & staining only apply to glazing media (watercolour);
     lightfast and max-paints apply to every medium */
  function updateFilterVisibility() {
    const glaze = ui.medium && ui.medium.type === 'glaze';
    const isWcOnly = key => key === 'granulating' || key === 'staining';
    document.querySelectorAll('.mix-filters .ff').forEach(el => {
      const key = el.getAttribute('data-filter');
      const show = glaze || !isWcOnly(key);
      el.hidden = !show;
      if (!show) {
        ui.filter[key] = 'any';
        if (els.filters[key]) els.filters[key].value = 'any';
        saveFilters();
      }
    });
  }

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const camel = s => s.split('-').map(cap).join('');

  function updateMediumReadout() {
    if (!els.readout || !ui.medium) return;
    const t = k => I18N.t(k);
    const parts = [];
    const m = ui.medium;
    if (m.sheen) parts.push(`${t('propSheen')} ${t('sheen' + cap(m.sheen))}`);
    if (m.dryingTime) parts.push(`${t('propDrying')} ${t('drying' + cap(m.dryingTime))}`);
    if (m.diluent) parts.push(`${t('propDiluent')} ${t('diluent' + cap(m.diluent))}`);
    if (m.wetWork) parts.push(`${t('propWet')} ${t('wet' + camel(m.wetWork))}`);
    els.readout.textContent = parts.join(' · ');
  }

  function paintTooltip(p) {
    const t = k => I18N.t(k);
    const bits = [];
    if (p.ci) bits.push(p.ci);
    if (p.lightfast) bits.push(`${t('propLightfast')} ${p.lightfast}`);
    if (typeof p.opacity === 'number') bits.push(`${t('propOpacity')} ${Math.round(p.opacity)}%`);
    if (typeof p.strength === 'number' && p.strength !== 1) bits.push(`${t('propStrength')} ×${p.strength}`);
    if (p.granulating) bits.push(t('propGranulating'));
    if (p.staining && p.staining !== 'None') bits.push(`${t('propStaining')}: ${t('stain' + p.staining)}`);
    if (p.toxic) bits.push(t('propToxic'));
    return bits.join(' · ');
  }

  function reloadPaints() {
    const id = els.select.value;
    const { paints, medium } = Palettes.get(id);
    ui.paints = paints;
    ui.medium = medium;
    updateFilterVisibility();
    renderGamut();
    if (global.CP.GamutFilter) global.CP.GamutFilter.onPaletteChange();
  }

  function refresh() {
    populateSelect();
    loadPalette(Palettes.getSelected());
    if (ui.target) update(ui.target);
  }

  const LIGHTFAST_RANK = { I: 1, II: 2, III: 3, IV: 4 };
  const STAIN_RANK = { None: 0, Low: 1, Medium: 2, High: 3 };
  /* a mix's granulating character is set by its main colours: the granulating
     filter applies to the dominant paints, not every paint. If granulating
     pigments make up at least half the used mix (or, for non-granulating, less
     than half), the filter is satisfied regardless of the minor tints. */
  const GRAN_MAIN_SHARE = 0.5;

  /* paints that pass the active filters, with their indices in ui.paints */
  function filterPaints() {
    const f = ui.filter;
    const indices = [];
    ui.paints.forEach((p, i) => {
      if (f.lightfast !== 'all') {
        const rank = LIGHTFAST_RANK[p.lightfast] || 4;
        const min = LIGHTFAST_RANK[f.lightfast] || 1;
        if (rank < min) return;
      }
      if (f.staining === 'no-high' && (STAIN_RANK[p.staining] || 0) >= 3) return;
      if (f.staining === 'no-med-high' && (STAIN_RANK[p.staining] || 0) >= 2) return;
      if (f.toxic === 'no' && p.toxic) return;
      if (f.toxic === 'yes' && !p.toxic) return;
      indices.push(i);
    });
    return { indices, paints: indices.map(i => ui.paints[i]) };
  }

  /* fraction of the used (non-trace) mix amount that is granulating */
  function granulatingShare(ratios, paints) {
    let gran = 0, used = 0;
    for (let i = 0; i < ratios.length; i++) {
      if (ratios[i] <= 0.005) continue;
      used += ratios[i];
      if (paints[i].granulating) gran += ratios[i];
    }
    return used > 0 ? gran / used : 0;
  }

  /* does this recipe satisfy the granulating filter, judged by the main
     colours only (trace tints of the other kind are fine)? */
  function granulatingMatches(ratios, paints) {
    const f = ui.filter.granulating;
    if (f !== 'yes' && f !== 'no') return true;
    const share = granulatingShare(ratios, paints);
    return f === 'yes' ? share >= GRAN_MAIN_SHARE : share < GRAN_MAIN_SHARE;
  }

  /* solve, honouring the granulating filter as a "main colours" constraint:
     first try the full pool - if the natural mix already has the right
     dominant character, keep it (minor tints stay free); otherwise fall
     back to a pool restricted to the requested kind, so the filter is
     never silently ignored. */
  function pickSolve(avail, targetRgb) {
    const f = ui.filter.granulating;
    const res = Mixing.solve(avail.paints, targetRgb, ui.medium, maxPaints());
    if (f !== 'yes' && f !== 'no') return { res, pool: avail };
    if (granulatingMatches(res.ratios, avail.paints)) return { res, pool: avail };
    const wantGran = f === 'yes';
    const idxs = avail.indices.filter(idx => !!ui.paints[idx].granulating === wantGran);
    if (!idxs.length) return { res: null, pool: avail };
    const pool = { indices: idxs, paints: idxs.map(i => ui.paints[i]) };
    return { res: Mixing.solve(pool.paints, targetRgb, ui.medium, maxPaints()), pool };
  }

  function applyResult(res, pool) {
    pool.indices.forEach((idx, j) => { ui.recipe[idx] = res.ratios[j]; });
    ui.result = res;
    // Degenerate-recipe guard: when a target is far outside the palette's
    // achievable range the solver can collapse to a single unrelated pigment
    // (e.g. a purple "solved" with 100% Burnt Umber). Treat that as a hard
    // miss so the UI warns instead of presenting a confident recipe.
    if (res.deltaE > 12) {
      const used = res.ratios.filter((v) => v > 0.005).length;
      if (used <= 1) ui.result = Object.assign({}, res, { deltaE: 999 });
    }
    render();
    renderGamut();
  }

  /* effective ΔE for a solve result, after the degenerate-recipe guard */
  function effectiveDeltaE(res) {
    if (res.deltaE > 12) {
      const used = res.ratios.filter((v) => v > 0.005).length;
      if (used <= 1) return 999;
    }
    return res.deltaE;
  }

  function update(targetRgb) {
    ui.target = targetRgb;
    if (!ui.paints.length) return;
    const avail = filterPaints();
    ui.recipe = ui.paints.map(() => 0);
    if (!avail.paints.length) {
      ui.result = null;
      render();
      renderGamut();
      return;
    }
    const { res, pool } = pickSolve(avail, targetRgb);
    if (!res) {
      ui.result = null;
      render();
      renderGamut();
      return;
    }
    applyResult(res, pool);
  }

  function maxPaints() {
    const v = ui.filter.maxPaints;
    const n = parseInt(v, 10);
    return isFinite(n) && n > 0 ? n : 0;
  }

  /* mix quality bands (CIE76 ΔE): <=6 good, <=12 fair, >12 hard */
  function difficulty(deltaE) {
    if (deltaE <= 6) return 'good';
    if (deltaE <= 12) return 'fair';
    return 'hard';
  }

  /* sync the mobile sticky result bar with the current sample/recipe */
  function updateStickyBar() {
    if (!els.bar) return;
    if (!ui.target || !ui.result || !ui.result.mixRgb) {
      els.bar.hidden = true;
      return;
    }
    els.bar.hidden = false;
    els.barTarget.style.background = Color.rgbToHex(ui.target.r, ui.target.g, ui.target.b);
    els.barMix.style.background = ui.result.mixHex || '#333';
    els.barInfo.textContent = deltaText();
    const inRange = global.CP.Gamut
      && global.CP.Gamut.pointInside(ui.paints, ui.medium, ui.result.mixRgb);
    els.barDot.classList.toggle('in', inRange);
    els.barDot.classList.toggle('out', !inRange);
    els.barDot.title = inRange ? I18N.t('gamutInRange') : I18N.t('gamutOutOfRange');
  }

  function updateDifficulty() {
    updateStickyBar();
    if (!ui.result) {
      els.delta.classList.remove('delta-good', 'delta-fair', 'delta-hard');
      els.delta.dataset.difficulty = '';
      const w = document.getElementById('mix-warning');
      if (w) w.hidden = true;
      return;
    }
    const d = difficulty(ui.result.deltaE);
    els.delta.classList.remove('delta-good', 'delta-fair', 'delta-hard');
    els.delta.classList.add('delta-' + d);
    els.delta.dataset.difficulty = d;
    const warning = document.getElementById('mix-warning');
    if (warning) {
      warning.hidden = d !== 'hard';
      if (d === 'hard') warning.textContent = I18N.t('mixOutOfRange');
    }
  }

  function deltaText() {
    if (!ui.result) return I18N.t('noPaintsMatch');
    let s = `${I18N.t('deltaE')}: ${ui.result.deltaE.toFixed(1)}`;
    if (ui.medium.type === 'glaze') {
      s += `  ·  ${I18N.t('wash')}: ${Math.round(Math.min(100, ui.result.conc * 100))}%`;
    }
    return s;
  }

  function render() {
    els.targetSwatch.style.background = Color.rgbToHex(ui.target.r, ui.target.g, ui.target.b);
    const hasMix = !!(ui.result && ui.result.mixHex);
    if (els.mixedCol) els.mixedCol.hidden = !hasMix;
    if (hasMix) {
      els.mixSwatch.style.background = ui.result.mixHex;
      mixedHex = ui.result.mixHex;
    } else {
      mixedHex = null;
    }
    els.delta.textContent = deltaText();

    // difficulty indicator: colour-code the readout and warn when a target
    // cannot be mixed well with this palette
    updateDifficulty();

    // top paints by amount
    const entries = ui.recipe
      .map((amt, i) => ({ amt, paint: ui.paints[i] }))
      .filter(e => e.amt > 0.005)
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 8);

    els.list.innerHTML = '';
    const max = ui.medium.type === 'glaze' ? 200 : 100;
    entries.forEach((e, idx) => {
      const row = document.createElement('div');
      row.className = 'mix-item';
      const tip = paintTooltip(e.paint);
      row.title = tip || e.paint.hex;

      const chip = document.createElement('div');
      chip.className = 'mix-chip';
      chip.style.background = e.paint.hex;
      chip.title = e.paint.hex;

      const info = document.createElement('div');
      info.className = 'mix-item-info';
      const name = document.createElement('div');
      name.className = 'mix-item-name';
      name.textContent = e.paint.name;
      if (e.paint.toxic) {
        const badge = document.createElement('span');
        badge.className = 'mix-toxic';
        badge.textContent = I18N.t('propToxic');
        badge.title = I18N.t('propToxic');
        name.appendChild(badge);
      }
      const brand = document.createElement('div');
      brand.className = 'mix-item-brand';
      brand.textContent = e.paint.brand || '';
      info.appendChild(name);
      info.appendChild(brand);

      const pct = document.createElement('span');
      pct.className = 'mix-item-pct';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = 0;
      slider.max = max;
      slider.step = 1;
      slider.setAttribute('aria-label', e.paint.name);
      slider.value = Math.round(e.amt * 100);
      slider.disabled = currentMixLocked();

      const updateLabels = () => {
        pct.textContent = (Math.round(e.amt * 1000) / 10) + '%';
      };
      updateLabels();

      slider.addEventListener('input', () => {
        const idxGlobal = ui.paints.indexOf(e.paint);
        const v = parseFloat(slider.value) / 100;
        if (ui.medium.type === 'glaze') {
          ui.recipe[idxGlobal] = v;
        } else {
          ui.recipe[idxGlobal] = v;
          const total = ui.recipe.reduce((a, b) => a + b, 0);
          if (total > 0) {
            const ratio = total / 1;
            ui.recipe = ui.recipe.map(a => a / ratio);
          }
        }
        e.amt = ui.recipe[idxGlobal];
        const mix = Mixing.mixColour(ui.paints, ui.recipe, ui.medium);
        ui.result.mixHex = mix.mixHex;
        ui.result.mixRgb = mix.mixRgb;
        ui.result.deltaE = Color.deltaE(ui.target, mix.mixRgb);
        if (ui.medium.type === 'glaze') ui.result.conc = ui.recipe.reduce((a, b) => a + b, 0);
        els.mixSwatch.style.background = mix.mixHex;
        mixedHex = mix.mixHex;
        els.delta.textContent = deltaText();
        updateDifficulty();
        syncReadout();
        scheduleHistoryMixUpdate();
        renderGamut();
        updateLabels();
        // sync sibling slider values (keep fractional values when a slider is
        // in Ctrl fine-drag mode, i.e. its step has been relaxed to "any")
        const siblingInputs = els.list.querySelectorAll('input[type="range"]');
        const shown = entries.map(en => ui.paints.indexOf(en.paint));
        ui.recipe.forEach((amt, i) => {
          const idx = shown.indexOf(i);
          if (idx < 0) return;
          const inp = siblingInputs[idx];
          const pct = amt * 100;
          inp.value = String(inp.step === 'any' ? pct : Math.round(pct));
        });
      });

      row.appendChild(chip);
      row.appendChild(info);
      row.appendChild(pct);
      row.appendChild(slider);
      els.list.appendChild(row);
    });

    if (!entries.length) {
      const note = document.createElement('div');
      note.className = 'hist-empty';
      note.textContent = ui.result ? '—' : I18N.t('noPaintsMatch');
      els.list.appendChild(note);
    }
    updateLockMixBtn();
    syncReadout();
  }

  function getResult() { return ui.result; }

  /* the history entry that the current mix writes back to: the most recent
     entry for the current target colour */
  function activeTargetHex() {
    return ui.target ? Color.rgbToHex(ui.target.r, ui.target.g, ui.target.b) : null;
  }

  function toggleLockMix() {
    const hex = activeTargetHex();
    if (!hex || !global.CP.History.toggleLock) return;
    global.CP.History.toggleLock(hex);
    render();
  }

  /* is the currently active history mix (for the current target) locked? */
  function currentMixLocked() {
    const hex = activeTargetHex();
    return !!hex && !!(global.CP.History && global.CP.History.isLocked && global.CP.History.isLocked(hex));
  }

  function updateLockMixBtn() {
    if (!els.lockMix) return;
    const hex = activeTargetHex();
    const has = hex && global.CP.History.hasEntry && global.CP.History.hasEntry(hex);
    const locked = currentMixLocked();
    const label = els.lockMix.querySelector('[data-i18n]') || els.lockMix;
    label.textContent = I18N.t(locked ? 'btnUnlockMix' : 'btnLockMix');
    els.lockMix.classList.toggle('is-on', locked);
    els.lockMix.setAttribute('aria-pressed', locked ? 'true' : 'false');
    els.lockMix.disabled = !has;
  }

  /* show a recorded mix colour in the colour pane's Mixed swatch */
  function setMixedSwatch(hex) {
    mixedHex = hex || null;
    if (els.mixedCol) els.mixedCol.hidden = !hex;
    if (hex && els.mixSwatch) els.mixSwatch.style.background = hex;
    syncReadout();
  }

  /* mark a swatch as active (Target or Mixed): its colour drives the
     HEX/RGB/HSL/CMYK readouts and it gets the heavy outline */
  function setActiveSwatch(kind) {
    activeSwatch = kind === 'mixed' ? 'mixed' : 'target';
    if (els.targetSwatch) {
      els.targetSwatch.classList.toggle('active', activeSwatch === 'target');
      els.targetSwatch.setAttribute('aria-pressed', String(activeSwatch === 'target'));
    }
    if (els.mixSwatch) {
      els.mixSwatch.classList.toggle('active', activeSwatch === 'mixed');
      els.mixSwatch.setAttribute('aria-pressed', String(activeSwatch === 'mixed'));
    }
    syncReadout();
  }

  /* show the active swatch's current colour in the readouts */
  function syncReadout() {
    if (!global.CP.Readout) return;
    if (activeSwatch === 'mixed' && mixedHex) {
      global.CP.Readout.update(Color.hexToRgb(mixedHex), els.mixSwatch);
    } else if (ui.target) {
      global.CP.Readout.update(ui.target, els.targetSwatch);
    }
  }

  /* a target colour changed from outside (loupe sample, history pick);
     shown in the readouts only while the Target swatch is active */
  function publishTarget(rgb) {
    if (activeSwatch === 'target' && global.CP.Readout) global.CP.Readout.update(rgb, els.targetSwatch);
  }

  /* persist a manual mix change onto the most recent history entry for the
     current target colour. Debounced so a slider drag writes once, and the
     entry snapshot is captured at change time (a loupe move before the write
     must not rebind the tweak to a different target). */
  function scheduleHistoryMixUpdate() {
    if (!ui.target || !ui.result || !ui.result.mixHex) return;
    const ctx = getContext();
    const entry = {
      target: Color.rgbToHex(ui.target.r, ui.target.g, ui.target.b),
      mixed: ui.result.mixHex,
      palette: ctx.palette,
      recipe: ctx.recipe,
    };
    if (historyTweakTimer) clearTimeout(historyTweakTimer);
    historyTweakTimer = setTimeout(() => {
      historyTweakTimer = null;
      if (global.CP.History && global.CP.History.updateMixedForTarget) {
        global.CP.History.updateMixedForTarget(entry);
      }
    }, 500);
  }

  /* ---------- history restore ---------- */
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const paintKey = (p) => (p.name || '') + '|' + (p.brand || '') + '|' + (p.hex || '').toUpperCase();

  /* snapshot of the current palette + recipe, so history can reproduce a
     recorded mix regardless of later palette edits */
  function getContext() {
    const id = Palettes.getSelected();
    const { paints, medium, label } = Palettes.get(id);
    const recipe = ui.recipe
      .map((amt, i) => ({ paint: ui.paints[i], ratio: amt }))
      .filter(e => e.ratio > 0.005)
      .map(e => ({ paint: deep(e.paint), ratio: e.ratio }));
    return {
      palette: { id, label, medium: deep(medium), paints: deep(paints) },
      recipe,
    };
  }

  /* recipe paints whose name/brand/hex no longer exist in the palette */
  function recipeMissing(recipe, paints) {
    const have = new Set((paints || []).map(paintKey));
    return (recipe || []).filter(r => !have.has(paintKey(r.paint)));
  }

  /* reasons a recipe cannot be reproduced against the current palette+filters */
  function restoreBlocked(recipe) {
    const reasons = [];
    if (!recipe || !recipe.length) return reasons;
    const missing = recipeMissing(recipe, ui.paints);
    if (missing.length) {
      reasons.push(I18N.t('mixRestoreMissing', { list: missing.map(r => r.paint.name).join(', ') }));
    }
    const present = new Set(ui.paints.map(paintKey));
    const passable = new Set(filterPaints().indices.map(i => paintKey(ui.paints[i])));
    const filterBlocked = recipe.some(r => {
      const k = paintKey(r.paint);
      return present.has(k) && !passable.has(k);
    });
    if (filterBlocked) reasons.push(I18N.t('mixRestoreFilters'));
    const mp = maxPaints();
    if (mp > 0 && recipe.length > mp) reasons.push(I18N.t('mixRestoreMaxPaints'));
    return reasons;
  }

  let pendingRestore = null;

  function showRestoreNotice(reasons, entry) {
    if (!els.restore) return;
    els.restore.innerHTML = '';
    const txt = document.createElement('div');
    txt.textContent = I18N.t('mixRestoreLead') + ' ' + reasons.join(' ');
    els.restore.appendChild(txt);
    if (entry && entry.palette) {
      pendingRestore = entry;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm mix-restore-btn';
      btn.textContent = I18N.t('mixRestoreBtn');
      btn.addEventListener('click', doRestore);
      els.restore.appendChild(btn);
    }
    els.restore.hidden = false;
  }

  function hideRestoreNotice() {
    pendingRestore = null;
    if (els.restore) {
      els.restore.innerHTML = '';
      els.restore.hidden = true;
    }
  }

  /* set the ratio sliders from a recorded recipe (paints matched to the
     current palette by name/brand/hex) and recompute the mix from it, so
     restoring a history colour reproduces its saved mix instead of a fresh
     solve. Returns true when at least one paint was matched. */
  function applyRecipe(recipe) {
    if (!Array.isArray(recipe) || !recipe.length) return false;
    const next = ui.paints.map(() => 0);
    let matched = false;
    for (const r of recipe) {
      const idx = ui.paints.findIndex(p => paintKey(p) === paintKey(r.paint));
      if (idx >= 0) { next[idx] = r.ratio; matched = true; }
    }
    if (!matched) return false;
    ui.recipe = next;
    const mix = Mixing.mixColour(ui.paints, ui.recipe, ui.medium);
    if (ui.result) {
      ui.result.mixHex = mix.mixHex;
      ui.result.mixRgb = mix.mixRgb;
      ui.result.deltaE = Color.deltaE(ui.target, mix.mixRgb);
      if (ui.medium.type === 'glaze') ui.result.conc = ui.recipe.reduce((a, b) => a + b, 0);
    }
    render();
    renderGamut();
    return true;
  }

  /* restore a history entry: select the recorded palette, reset the mix to
     the recorded recipe when possible, and surface what cannot be reproduced */
  function restoreFromHistory(entry) {
    if (!entry || !entry.target) return;
    const rgb = Color.hexToRgb(entry.target);
    ui.target = rgb;
    setActiveSwatch('target');
    publishTarget(rgb);

    const snap = entry.palette || null;
    const gone = snap && !Palettes.list().some(p => p.id === snap.id);

    if (snap && !gone) {
      Palettes.setSelected(snap.id);
      populateSelect();
      // don't re-run the "limit to palette" filter here: it redraws the image
      // and re-samples the pixel under the loupe, overwriting the restored
      // colour in a feedback loop. The filter re-applies on the next genuine
      // palette change or loupe move.
      loadPalette(snap.id, { suppressFilter: true });
    }

    update(rgb);
    applyRecipe(entry.recipe);
    if (entry.mixed) setMixedSwatch(entry.mixed);

    const reasons = [];
    if (gone) reasons.push(I18N.t('mixRestoreGone', { label: snap.label }));
    if (!snap) reasons.push(I18N.t('mixRestoreUnknownPalette'));
    if (entry.recipe && entry.recipe.length) reasons.push(...restoreBlocked(entry.recipe));

    if (reasons.length) showRestoreNotice(reasons, snap ? entry : null);
    else hideRestoreNotice();
  }

  /* "Restore paints" action: bring the recorded paints back into the palette
     (recreating a deleted custom palette), relax blocking filters, re-solve */
  function doRestore() {
    const entry = pendingRestore;
    if (!entry || !entry.palette) return;
    const snap = entry.palette;
    let id = snap.id;

    if (!Palettes.list().some(p => p.id === id)) {
      const suffix = I18N.t('restoredSuffix') || '(restored)';
      id = Palettes.createCustom(snap.label + ' ' + suffix, snap.medium, snap.paints, snap.source || snap.id);
    }

    const current = Palettes.get(id).paints;
    const have = new Set(current.map(paintKey));
    const missing = (entry.recipe || [])
      .map(r => r.paint)
      .filter(p => !have.has(paintKey(p)));
    if (missing.length) Palettes.setPaints(id, current.concat(missing));

    if ((entry.recipe || []).length && restoreBlocked(entry.recipe).length) {
      ui.filter.lightfast = 'all';
      ui.filter.granulating = 'any';
      ui.filter.staining = 'any';
      ui.filter.toxic = 'any';
      ui.filter.maxPaints = 'all';
      saveFilters();
      updateFilterVisibility();
      for (const key of Object.keys(els.filters || {})) els.filters[key].value = ui.filter[key] || 'all';
    }

    Palettes.setSelected(id);
    populateSelect();
    loadPalette(id);
    update(ui.target);
    applyRecipe(entry.recipe);
    if (entry.mixed) setMixedSwatch(entry.mixed);
    hideRestoreNotice();
  }

  global.CP = global.CP || {};
  global.CP.MixUI = {
    init, update, render, reloadPaints, refresh,
    getResult, setMixedSwatch, setActiveSwatch, syncReadout, publishTarget,
    getContext, restoreFromHistory,
    updateLockMixBtn: () => updateLockMixBtn(),
    refreshLockBtn: () => updateLockMixBtn(),
  };
})(window);
