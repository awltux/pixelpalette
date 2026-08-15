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
   palette-editor.js - modal to add / remove / recolour paints.
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;
  const Palettes = global.Palettes;

  let overlay, listEl, doneBtn, addBtn, resetBtn, deleteBtn, nameInput;
  let addpaintOverlay, addpaintList, addpaintNew, addpaintClose;
  let currentId = 'oil';

  function open() {
    currentId = Palettes.getSelected();
    render();
    overlay.hidden = false;
    if (!nameInput.disabled) nameInput.focus();
  }

  function close() {
    overlay.hidden = true;
  }

  function render() {
    const info = Palettes.get(currentId);
    listEl.innerHTML = '';
    info.paints.forEach((p, i) => listEl.appendChild(makeRow(p, i)));
    const isCustom = Palettes.isCustom(currentId);
    nameInput.value = info.label || '';
    nameInput.disabled = !isCustom;
    deleteBtn.hidden = !isCustom;
  }

  const paintKey = (p) => (p.name || '') + '|' + (p.brand || '') + '|' + (p.hex || '').toUpperCase();

  function makeRow(p, i) {
    const row = document.createElement('div');
    row.className = 'paint-edit';
    const isWC = Palettes.get(currentId).medium.type === 'glaze';
    /* only user-added paints may be deleted; the palette's core paints
       (from its defaults / source medium) are protected */
    const isDefault = Palettes.defaultPaints(currentId)
      .some(d => paintKey(d) === paintKey(p));

    /* line 1: identity */
    const main = document.createElement('div');
    main.className = 'pe-main';

    const colour = document.createElement('input');
    colour.type = 'color';
    colour.className = 'pe-colour';
    colour.value = /^#[0-9a-fA-F]{6}$/.test(p.hex) ? p.hex : '#000000';
    colour.setAttribute('aria-label', I18N.t('paintName') + ' ' + (i + 1));

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'pe-name';
    name.placeholder = I18N.t('paintName');
    name.value = p.name;

    const brand = document.createElement('input');
    brand.type = 'text';
    brand.className = 'pe-brand';
    brand.placeholder = I18N.t('paintBrand');
    brand.value = p.brand || '';

    const hex = document.createElement('span');
    hex.className = 'pe-hex';
    hex.textContent = colour.value;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'pe-del';
    del.textContent = '✕';
    del.disabled = isDefault;
    del.title = isDefault ? I18N.t('paintCore') : '';
    del.setAttribute('aria-label', I18N.t('paletteRemove'));
    del.addEventListener('click', () => row.remove());

    colour.addEventListener('input', () => { hex.textContent = colour.value; });

    main.appendChild(colour);
    main.appendChild(name);
    main.appendChild(brand);
    main.appendChild(hex);
    main.appendChild(del);
    row.appendChild(main);

    /* line 2: artist properties */
    const extra = document.createElement('div');
    extra.className = 'pe-extra';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'pe-enabled';
    enabled.checked = p.enabled !== false;
    enabled.setAttribute('aria-label', I18N.t('propEnabled'));
    const enabledWrap = document.createElement('label');
    enabledWrap.className = 'pe-field pe-check';
    const el = document.createElement('span');
    el.textContent = I18N.t('propEnabled');
    enabledWrap.appendChild(enabled);
    enabledWrap.appendChild(el);
    const applyEnabled = () => {
      row.classList.toggle('paint-disabled', !enabled.checked);
    };
    applyEnabled();
    enabled.addEventListener('change', applyEnabled);
    extra.appendChild(enabledWrap);

    extra.appendChild(field(I18N.t('propStrength'), numberInput('pe-strength', p.strength, 0.1, 5, 0.1)));
    extra.appendChild(field(I18N.t('propOpacity'), numberInput('pe-opacity', p.opacity, 0, 100, 1)));
    extra.appendChild(field(I18N.t('propCi'), textInput('pe-ci', p.ci || '')));
    extra.appendChild(field(I18N.t('propLightfast'), selectInput('pe-lf', ['I', 'II', 'III', 'IV'], p.lightfast || 'II')));
    extra.appendChild(field(I18N.t('propUndertone'), colourInput('pe-undertone', p.undertone || p.hex)));
    const toxic = document.createElement('input');
    toxic.type = 'checkbox';
    toxic.className = 'pe-toxic';
    toxic.checked = !!p.toxic;
    const toxicWrap = document.createElement('label');
    toxicWrap.className = 'pe-field pe-check';
    const tl = document.createElement('span');
    tl.textContent = I18N.t('propToxic');
    toxicWrap.appendChild(tl);
    toxicWrap.appendChild(toxic);
    extra.appendChild(toxicWrap);
    if (isWC) {
      const gran = document.createElement('input');
      gran.type = 'checkbox';
      gran.className = 'pe-gran';
      gran.checked = !!p.granulating;
      const granWrap = document.createElement('label');
      granWrap.className = 'pe-field pe-check';
      const gl = document.createElement('span');
      gl.textContent = I18N.t('propGranulating');
      granWrap.appendChild(gl);
      granWrap.appendChild(gran);
      extra.appendChild(granWrap);
      extra.appendChild(field(I18N.t('propStaining'), selectInput('pe-stain', ['None', 'Low', 'Medium', 'High'], p.staining || 'None')));
    }

    row.appendChild(extra);
    return row;
  }

  function field(label, input) {
    const wrap = document.createElement('label');
    wrap.className = 'pe-field';
    const l = document.createElement('span');
    l.textContent = label;
    wrap.appendChild(l);
    wrap.appendChild(input);
    return wrap;
  }

  function numberInput(cls, value, min, max, step) {
    const el = document.createElement('input');
    el.type = 'number';
    el.className = cls;
    el.min = min;
    el.max = max;
    el.step = step;
    if (typeof value === 'number' && isFinite(value)) el.value = value;
    return el;
  }

  function textInput(cls, value) {
    const el = document.createElement('input');
    el.type = 'text';
    el.className = cls;
    el.value = value;
    return el;
  }

  function colourInput(cls, value) {
    const el = document.createElement('input');
    el.type = 'color';
    el.className = cls;
    el.value = /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#000000';
    return el;
  }

  function selectInput(cls, options, value) {
    const el = document.createElement('select');
    el.className = cls;
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o === 'None' ? I18N.t('stainNone') : o;
      el.appendChild(opt);
    }
    el.value = options.includes(value) ? value : options[0];
    return el;
  }

  function collect() {
    const paints = [];
    listEl.querySelectorAll('.paint-edit').forEach(row => {
      const nameEl = row.querySelector('.pe-name');
      const brandEl = row.querySelector('.pe-brand');
      const colourEl = row.querySelector('.pe-colour');
      const n = nameEl.value.trim();
      const c = colourEl.value;
      if (!n && !c) return;
      const readNum = (el, d) => {
        const v = parseFloat(el.value);
        return isFinite(v) ? v : d;
      };
      const gran = row.querySelector('.pe-gran');
      const stain = row.querySelector('.pe-stain');
      const undertone = row.querySelector('.pe-undertone');
      const toxic = row.querySelector('.pe-toxic');
      const enabled = row.querySelector('.pe-enabled');
      paints.push({
        name: n || c,
        brand: brandEl.value.trim(),
        hex: c,
        strength: readNum(row.querySelector('.pe-strength'), 1),
        opacity: readNum(row.querySelector('.pe-opacity'), 100),
        ci: row.querySelector('.pe-ci').value.trim(),
        lightfast: row.querySelector('.pe-lf').value,
        undertone: undertone ? undertone.value : (c || ''),
        granulating: gran ? gran.checked : false,
        staining: stain ? stain.value : 'None',
        toxic: toxic ? toxic.checked : false,
        enabled: enabled ? enabled.checked : true,
      });
    });
    return paints;
  }

  function save() {
    const paints = collect();
    if (paints.length) Palettes.setPaints(currentId, paints);
    if (Palettes.isCustom(currentId)) Palettes.setLabel(currentId, nameInput.value);
    close();
    global.CP.MixUI.refresh();
  }

  function del() {
    Palettes.removeCustom(currentId);
    if (global.CP.History && global.CP.History.dropPalette) global.CP.History.dropPalette(currentId);
    close();
    global.CP.MixUI.refresh();
  }

  /* paints from the built-in parent palette that are not already in the
     current palette (matched by name | brand | hex) */
  function missingParentPaints() {
    const have = new Set(Palettes.get(currentId).paints.map(paintKey));
    return Palettes.defaultPaints(currentId).filter(p => !have.has(paintKey(p)));
  }

  /* "Add paint" chooser: pick an existing paint from the built-in parent
     palette, or create a brand-new previously undefined one */
  function openAddPaint() {
    addpaintList.innerHTML = '';
    const missing = missingParentPaints();
    if (!missing.length) {
      const none = document.createElement('div');
      none.className = 'addpaint-none';
      none.textContent = I18N.t('addPaintNone');
      addpaintList.appendChild(none);
    }
    missing.forEach(p => {
      const row = document.createElement('div');
      row.className = 'ap-row';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', p.name || p.hex);

      const chip = document.createElement('span');
      chip.className = 'ap-chip';
      chip.style.background = p.hex;

      const info = document.createElement('div');
      info.className = 'ap-info';
      const name = document.createElement('div');
      name.className = 'ap-name';
      name.textContent = p.name;
      const meta = document.createElement('div');
      meta.className = 'ap-meta';
      meta.textContent = [p.brand, p.ci, p.lightfast ? 'LF ' + p.lightfast : '',
        typeof p.opacity === 'number' ? p.opacity + '%' : ''].filter(Boolean).join(' \u00b7 ');
      info.appendChild(name);
      info.appendChild(meta);

      row.appendChild(chip);
      row.appendChild(info);

      const addIt = () => {
        // explicitly added paints are enabled (usable) straight away
        listEl.appendChild(makeRow(Object.assign({}, p, { enabled: true }), listEl.children.length));
        closeAddPaint();
      };
      row.addEventListener('click', addIt);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addIt(); }
      });
      addpaintList.appendChild(row);
    });
    addpaintOverlay.hidden = false;
  }

  function closeAddPaint() {
    addpaintOverlay.hidden = true;
  }

  function init() {
    overlay = document.getElementById('palette-overlay');
    listEl = document.getElementById('palette-edit');
    doneBtn = document.getElementById('palette-close');
    addBtn = document.getElementById('palette-add');
    resetBtn = document.getElementById('palette-reset');
    deleteBtn = document.getElementById('palette-delete');
    nameInput = document.getElementById('palette-name-input');
    addpaintOverlay = document.getElementById('addpaint-overlay');
    addpaintList = document.getElementById('addpaint-list');
    addpaintNew = document.getElementById('addpaint-new');
    addpaintClose = document.getElementById('addpaint-close');

    doneBtn.addEventListener('click', save);
    addBtn.addEventListener('click', openAddPaint);
    if (addpaintNew) {
      addpaintNew.addEventListener('click', () => {
        listEl.appendChild(makeRow({ name: '', brand: '', hex: '#808080' }, listEl.children.length));
        closeAddPaint();
      });
    }
    if (addpaintClose) addpaintClose.addEventListener('click', closeAddPaint);
    if (addpaintOverlay) {
      addpaintOverlay.addEventListener('click', (e) => { if (e.target === addpaintOverlay) closeAddPaint(); });
    }
    resetBtn.addEventListener('click', () => {
      Palettes.resetDefaults(currentId);
      render();
    });
    deleteBtn.addEventListener('click', del);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) close();
      if (e.key === 'Escape' && addpaintOverlay && !addpaintOverlay.hidden) closeAddPaint();
    });
  }

  global.CP = global.CP || {};
  global.CP.PaletteEditor = { init, open, close };
})(window);
