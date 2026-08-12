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
    els.mixSwatch = document.getElementById('mix-swatch');
    els.targetSwatch = document.getElementById('target-swatch');
    els.delta = document.getElementById('mix-delta');
    els.resolve = document.getElementById('btn-resolve');
    els.edit = document.getElementById('btn-edit-palette');
    els.dup = document.getElementById('btn-dup-palette');
    els.readout = document.getElementById('medium-readout');
    els.gamutCanvas = document.getElementById('gamut-canvas');
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

    els.resolve.addEventListener('click', () => {
      if (ui.target) update(ui.target);
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

  function loadPalette(id) {
    const { paints, medium } = Palettes.get(id);
    ui.paints = paints || [];
    ui.medium = medium;
    updateMediumReadout();
    updateFilterVisibility();
    renderGamut();
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
  }

  function refresh() {
    populateSelect();
    loadPalette(Palettes.getSelected());
    if (ui.target) update(ui.target);
  }

  const LIGHTFAST_RANK = { I: 1, II: 2, III: 3, IV: 4 };
  const STAIN_RANK = { None: 0, Low: 1, Medium: 2, High: 3 };

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
      if (f.granulating === 'yes' && !p.granulating) return;
      if (f.granulating === 'no' && p.granulating) return;
      if (f.staining === 'no-high' && (STAIN_RANK[p.staining] || 0) >= 3) return;
      if (f.staining === 'no-med-high' && (STAIN_RANK[p.staining] || 0) >= 2) return;
      if (f.toxic === 'no' && p.toxic) return;
      if (f.toxic === 'yes' && !p.toxic) return;
      indices.push(i);
    });
    return { indices, paints: indices.map(i => ui.paints[i]) };
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
    const res = Mixing.solve(avail.paints, targetRgb, ui.medium, maxPaints());
    avail.indices.forEach((idx, j) => { ui.recipe[idx] = res.ratios[j]; });
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

  function updateDifficulty() {
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
    els.mixSwatch.style.background = ui.result ? ui.result.mixHex : '#333';
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

      const updateLabels = () => {
        pct.textContent = Math.round(e.amt * 100) + '%';
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
        els.delta.textContent = deltaText();
        updateDifficulty();
        renderGamut();
        updateLabels();
        // sync sibling slider values
        const siblingInputs = els.list.querySelectorAll('input[type="range"]');
        const shown = entries.map(en => ui.paints.indexOf(en.paint));
        ui.recipe.forEach((amt, i) => {
          const idx = shown.indexOf(i);
          if (idx >= 0) siblingInputs[idx].value = Math.round(amt * 100);
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
  }

  global.CP = global.CP || {};
  global.CP.MixUI = { init, update, render, reloadPaints, refresh };
})(window);
