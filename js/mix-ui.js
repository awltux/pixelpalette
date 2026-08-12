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
  const ui = {
    paints: [],
    medium: null,
    recipe: [],
    target: null,
    result: null,
  };

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

    populateSelect();
    loadPalette(Palettes.getSelected());

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
    return bits.join(' · ');
  }

  function reloadPaints() {
    const id = els.select.value;
    const { paints, medium } = Palettes.get(id);
    ui.paints = paints;
    ui.medium = medium;
  }

  function refresh() {
    populateSelect();
    loadPalette(Palettes.getSelected());
    if (ui.target) update(ui.target);
  }

  function update(targetRgb) {
    ui.target = targetRgb;
    if (!ui.paints.length) return;
    const res = Mixing.solve(ui.paints, targetRgb, ui.medium);
    ui.result = res;
    ui.recipe = res.ratios.slice();
    render();
  }

  function deltaText() {
    let s = `${I18N.t('deltaE')}: ${ui.result.deltaE.toFixed(1)}`;
    if (ui.medium.type === 'glaze') {
      s += `  ·  ${I18N.t('wash')}: ${Math.round(Math.min(100, ui.result.conc * 100))}%`;
    }
    return s;
  }

  function render() {
    els.targetSwatch.style.background = Color.rgbToHex(ui.target.r, ui.target.g, ui.target.b);
    els.mixSwatch.style.background = ui.result.mixHex;
    els.delta.textContent = deltaText();

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
      note.textContent = '—';
      els.list.appendChild(note);
    }
  }

  global.CP = global.CP || {};
  global.CP.MixUI = { init, update, render, reloadPaints, refresh };
})(window);
