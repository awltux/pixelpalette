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
    const isWC = Palettes.get(currentId).medium.type === 'glaze';

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
