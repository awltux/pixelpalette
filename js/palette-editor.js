/* ============================================================
   palette-editor.js - modal to add / remove / recolour paints.
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;
  const Palettes = global.Palettes;

  let overlay, listEl, doneBtn, addBtn, resetBtn, deleteBtn, nameInput;
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

  function makeRow(p, i) {
    const row = document.createElement('div');
    row.className = 'paint-edit';

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
    del.setAttribute('aria-label', I18N.t('paletteRemove'));
    del.addEventListener('click', () => row.remove());

    colour.addEventListener('input', () => { hex.textContent = colour.value; });

    row.appendChild(colour);
    row.appendChild(name);
    row.appendChild(brand);
    row.appendChild(hex);
    row.appendChild(del);
    return row;
  }

  function collect() {
    const paints = [];
    listEl.querySelectorAll('.paint-edit').forEach(row => {
      const nameEl = row.querySelector('.pe-name');
      const brandEl = row.querySelector('.pe-brand');
      const colourEl = row.querySelector('.pe-colour');
      const n = nameEl.value.trim();
      const c = colourEl.value;
      if (n || c) paints.push({ name: n || c, brand: brandEl.value.trim(), hex: c });
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
    close();
    global.CP.MixUI.refresh();
  }

  function init() {
    overlay = document.getElementById('palette-overlay');
    listEl = document.getElementById('palette-edit');
    doneBtn = document.getElementById('palette-close');
    addBtn = document.getElementById('palette-add');
    resetBtn = document.getElementById('palette-reset');
    deleteBtn = document.getElementById('palette-delete');
    nameInput = document.getElementById('palette-name-input');

    doneBtn.addEventListener('click', save);
    addBtn.addEventListener('click', () => {
      listEl.appendChild(makeRow({ name: '', brand: '', hex: '#808080' }, listEl.children.length));
    });
    resetBtn.addEventListener('click', () => {
      Palettes.resetDefaults(currentId);
      render();
    });
    deleteBtn.addEventListener('click', del);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
  }

  global.CP = global.CP || {};
  global.CP.PaletteEditor = { init, open, close };
})(window);
