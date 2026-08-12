/* ============================================================
   palettes.js - default palettes per medium + persistence.
   Paint model: { name, brand, hex }. Medium adds type/opacity/paper.
   ============================================================ */
(function (global) {
  'use strict';

  const P = (name, hex, brand) => ({ name, hex, brand });

  const MEDIA = {
    oil: { id: 'oil', type: 'opaque', opacity: 0.96, paper: '#F7F3E9', label: 'Oil' },
    acrylic: { id: 'acrylic', type: 'opaque', opacity: 0.97, paper: '#FCFCFC', label: 'Acrylic' },
    gouache: { id: 'gouache', type: 'opaque', opacity: 0.9, paper: '#FFFFFF', label: 'Gouache' },
    pencil: { id: 'pencil', type: 'opaque', opacity: 0.82, paper: '#FFFFFF', label: 'Pencils' },
    watercolour: { id: 'watercolour', type: 'glaze', opacity: 1, paper: '#FDFDFD', label: 'Watercolour' },
  };

  const DEFAULTS = {
    oil: [
      P('Titanium White', '#FBFBFB', 'W&N'), P('Cadmium Yellow Light', '#F6C900', 'W&N'),
      P('Cadmium Orange', '#F97306', 'W&N'), P('Cadmium Red', '#E62300', 'W&N'),
      P('Alizarin Crimson', '#A4203A', 'W&N'), P('Quinacridone Rose', '#D63C9B', 'W&N'),
      P('Ultramarine Blue', '#2641A4', 'W&N'), P('Cerulean Blue', '#007BB8', 'W&N'),
      P('Phthalo Blue', '#0B5E97', 'W&N'), P('Viridian', '#007C61', 'W&N'),
      P('Sap Green', '#7A9B31', 'W&N'), P('Yellow Ochre', '#B7791F', 'W&N'),
      P('Burnt Sienna', '#98552F', 'W&N'), P('Burnt Umber', '#43322B', 'W&N'),
      P('Ivory Black', '#2C2C2C', 'W&N'),
    ],
    acrylic: [
      P('Titanium White', '#FFFFFF', 'Golden'), P('Cadmium Yellow Medium', '#F4C423', 'Golden'),
      P('Cadmium Orange', '#F97F0B', 'Golden'), P('Cadmium Red Medium', '#E32712', 'Golden'),
      P('Quinacridone Crimson', '#8E1B3F', 'Golden'), P('Dioxazine Purple', '#5B2A86', 'Golden'),
      P('Ultramarine Blue', '#1F3A93', 'Golden'), P('Cobalt Blue', '#0F5B9C', 'Golden'),
      P('Phthalo Blue (GS)', '#093B6D', 'Golden'), P('Phthalo Green (YS)', '#0E7B4E', 'Golden'),
      P('Sap Green', '#6E8B2C', 'Golden'), P('Yellow Oxide', '#C58A2E', 'Golden'),
      P('Naphthol Red', '#D02418', 'Golden'), P('Burnt Sienna', '#9A4E2A', 'Golden'),
      P('Carbon Black', '#1C1C1C', 'Golden'),
    ],
    gouache: [
      P('Titanium White', '#FFFFFF', 'Schmincke'), P('Lemon Yellow', '#F5DE0A', 'Schmincke'),
      P('Cadmium Yellow', '#F9B900', 'Schmincke'), P('Cadmium Orange', '#F97A00', 'Schmincke'),
      P('Cadmium Red', '#E32900', 'Schmincke'), P('Permanent Carmine', '#B01B45', 'Schmincke'),
      P('Ultramarine Blue', '#2A3F9E', 'Schmincke'), P('Cerulean Blue', '#0087BD', 'Schmincke'),
      P('Cobalt Blue', '#0D4E92', 'Schmincke'), P('Phthalo Green', '#007D5C', 'Schmincke'),
      P('Sap Green', '#6E9B2B', 'Schmincke'), P('Yellow Ochre', '#C88A2D', 'Schmincke'),
      P('Burnt Sienna', '#A04E24', 'Schmincke'), P('Ivory Black', '#262626', 'Schmincke'),
    ],
    pencil: [
      P('White', '#F8F8F8', 'Faber-Castell'), P('Lemon Yellow', '#F6E40B', 'Faber-Castell'),
      P('Orange', '#F78B1E', 'Faber-Castell'), P('Red', '#E32918', 'Faber-Castell'),
      P('Crimson', '#B2124A', 'Faber-Castell'), P('Magenta', '#D3238B', 'Faber-Castell'),
      P('Violet', '#6C2E99', 'Faber-Castell'), P('Ultramarine', '#2744A8', 'Faber-Castell'),
      P('Phthalo Blue', '#0E4E9C', 'Faber-Castell'), P('Turquoise', '#12A2B0', 'Faber-Castell'),
      P('Yellow Green', '#9ACD32', 'Faber-Castell'), P('Grass Green', '#3C9B33', 'Faber-Castell'),
      P('Dark Green', '#1E6B46', 'Faber-Castell'), P('Burnt Ochre', '#B56A28', 'Faber-Castell'),
      P('Sepia', '#5B3A22', 'Faber-Castell'), P('Black', '#1A1A1A', 'Faber-Castell'),
    ],
    watercolour: [
      P('Lemon Yellow', '#F7E42A', 'W&N'), P('Cadmium Yellow', '#F6BE00', 'W&N'),
      P('Cadmium Red', '#E53A1F', 'W&N'), P('Permanent Rose', '#E33E7E', 'W&N'),
      P('Alizarin Crimson', '#A8233F', 'W&N'), P('French Ultramarine', '#2F3E9E', 'W&N'),
      P('Cerulean Blue', '#1E8DC7', 'W&N'), P('Cobalt Blue', '#2358A6', 'W&N'),
      P('Winsor Blue (GS)', '#0E2E5E', 'W&N'), P('Phthalo Green', '#0E7E59', 'W&N'),
      P('Viridian', '#0A6E5F', 'W&N'), P('Sap Green', '#6C8F2A', 'W&N'),
      P('Yellow Ochre', '#C58B2F', 'W&N'), P('Raw Sienna', '#B0713A', 'W&N'),
      P('Burnt Sienna', '#95421F', 'W&N'), P('Payne\'s Grey', '#3A4464', 'W&N'),
    ],
  };

  const STORAGE_KEY = 'pp.palettes';
  const CUSTOMS_KEY = 'pp.custom_palettes';
  const SELECTED_KEY = 'pp.palette';

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupt storage */ }
    return fallback;
  }

  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function overrides() { return readJSON(STORAGE_KEY, {}); }

  function customs() { return readJSON(CUSTOMS_KEY, {}); }

  function isCustomId(id) { return Object.prototype.hasOwnProperty.call(customs(), id); }

  const Palettes = {
    media: MEDIA,
    defaults: DEFAULTS,

    /* all selectable palettes: built-in media first, then customs */
    list() {
      const items = [];
      for (const id of Object.keys(MEDIA)) items.push({ id, label: MEDIA[id].label, custom: false });
      for (const id of Object.keys(customs())) items.push({ id, label: customs()[id].label, custom: true });
      return items;
    },

    getSelected() {
      const s = readJSON(SELECTED_KEY, 'oil');
      return this.list().some(p => p.id === s) ? s : 'oil';
    },

    setSelected(id) { writeJSON(SELECTED_KEY, id); },

    isCustom(id) { return isCustomId(id); },

    /* returns { paints, medium, custom } for a palette id */
    get(id) {
      if (isCustomId(id)) {
        const c = customs()[id];
        return { paints: clone(c.paints), medium: clone(c.medium), custom: true, label: c.label };
      }
      if (MEDIA[id]) {
        const saved = overrides()[id];
        const paints = (Array.isArray(saved) && saved.length) ? clone(saved) : clone(DEFAULTS[id]);
        return { paints, medium: clone(MEDIA[id]), custom: false, label: MEDIA[id].label };
      }
      return { paints: clone(DEFAULTS.oil), medium: clone(MEDIA.oil), custom: false };
    },

    /* store paints for a built-in (override) or custom palette */
    setPaints(id, paints) {
      if (isCustomId(id)) {
        const c = customs();
        if (c[id]) { c[id].paints = clone(paints); writeJSON(CUSTOMS_KEY, c); }
        return;
      }
      if (MEDIA[id]) {
        const o = overrides();
        o[id] = clone(paints);
        writeJSON(STORAGE_KEY, o);
      }
    },

    /* rename a custom palette (built-in names are fixed) */
    setLabel(id, label) {
      const c = customs();
      if (c[id]) {
        const trimmed = String(label || '').trim();
        if (trimmed) c[id].label = trimmed;
        writeJSON(CUSTOMS_KEY, c);
      }
    },

    /* create an editable copy of a palette; returns the new custom id */
    duplicate(id) {
      const src = this.get(id);
      const c = customs();
      let n = 1;
      while (c['custom_' + n]) n++;
      const cid = 'custom_' + n;
      const copyLabel = (global.I18N && global.I18N.t) ? global.I18N.t('paletteCopy') : 'Copy';
      c[cid] = {
        label: src.medium.label + ' ' + copyLabel,
        source: id,
        medium: src.medium,
        paints: src.paints,
      };
      writeJSON(CUSTOMS_KEY, c);
      return cid;
    },

    removeCustom(id) {
      const c = customs();
      if (!c[id]) return;
      delete c[id];
      writeJSON(CUSTOMS_KEY, c);
      if (readJSON(SELECTED_KEY, '') === id) writeJSON(SELECTED_KEY, Object.keys(MEDIA)[0]);
    },

    /* revert paints: built-in -> defaults; custom -> its source medium's defaults */
    resetDefaults(id) {
      if (isCustomId(id)) {
        const c = customs();
        const src = c[id] && c[id].source;
        if (c[id] && src && MEDIA[src]) c[id].paints = clone(DEFAULTS[src]);
        writeJSON(CUSTOMS_KEY, c);
        return;
      }
      if (MEDIA[id]) {
        const o = overrides();
        delete o[id];
        writeJSON(STORAGE_KEY, o);
      }
    },
  };

  global.Palettes = Palettes;
})(window);
