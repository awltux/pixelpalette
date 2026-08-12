/* ============================================================
   palettes.js - default palettes per medium + persistence.
   Paint model: { name, hex, brand, strength, opacity, ci,
                  lightfast, undertone, granulating, staining,
                  toxic }.
   Medium adds type/opacity/paper + artist readouts (drying,
   sheen, diluent, wet-workability).
   ============================================================ */
(function (global) {
  'use strict';

  const P = (name, hex, brand, o) => Object.assign({
    name, hex, brand,
    strength: 1, opacity: 100, ci: '', lightfast: 'II', undertone: hex,
    granulating: false, staining: 'None', toxic: false,
  }, o || {});

  const MEDIA = {
    oil: { id: 'oil', type: 'opaque', opacity: 0.96, paper: '#F7F3E9', label: 'Oil', dryingTime: 'slow', sheen: 'glossy', diluent: 'oil', wetWork: 'wet-in-wet' },
    acrylic: { id: 'acrylic', type: 'opaque', opacity: 0.97, paper: '#FCFCFC', label: 'Acrylic', dryingTime: 'fast', sheen: 'satin', diluent: 'water', wetWork: 'wet-in-wet' },
    gouache: { id: 'gouache', type: 'opaque', opacity: 0.9, paper: '#FFFFFF', label: 'Gouache', dryingTime: 'fast', sheen: 'matte', diluent: 'water', wetWork: 'wet-on-dry' },
    pencil: { id: 'pencil', type: 'opaque', opacity: 0.82, paper: '#FFFFFF', label: 'Pencils', dryingTime: 'instant', sheen: 'matte', diluent: 'dry', wetWork: 'wet-on-dry' },
    watercolour: { id: 'watercolour', type: 'glaze', opacity: 1, paper: '#FDFDFD', label: 'Watercolour', dryingTime: 'fast', sheen: 'matte', diluent: 'water', wetWork: 'wet-in-wet' },
  };

  const DEFAULTS = {
    oil: [
      P('Titanium White', '#FBFBFB', 'W&N', { opacity: 100, ci: 'PW6', lightfast: 'I' }),
      P('Cadmium Yellow Light', '#F6C900', 'W&N', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', toxic: true }),
      P('Cadmium Orange', '#F97306', 'W&N', { strength: 1.2, opacity: 90, ci: 'PO20', lightfast: 'I', toxic: true }),
      P('Cadmium Red', '#E62300', 'W&N', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#E8620B', toxic: true }),
      P('Alizarin Crimson', '#A4203A', 'W&N', { strength: 1.6, opacity: 40, ci: 'PR83', lightfast: 'III', undertone: '#B0224E' }),
      P('Quinacridone Rose', '#D63C9B', 'W&N', { strength: 2.0, opacity: 45, ci: 'PV19', lightfast: 'I' }),
      P('Ultramarine Blue', '#2641A4', 'W&N', { strength: 1.3, opacity: 65, ci: 'PB29', lightfast: 'I', undertone: '#2F50B8' }),
      P('Cerulean Blue', '#007BB8', 'W&N', { strength: 0.8, opacity: 90, ci: 'PB35', lightfast: 'I', toxic: true }),
      P('Phthalo Blue', '#0B5E97', 'W&N', { strength: 2.5, opacity: 40, ci: 'PB15', lightfast: 'I', undertone: '#0A7A90' }),
      P('Viridian', '#007C61', 'W&N', { strength: 1.5, opacity: 45, ci: 'PG18', lightfast: 'I' }),
      P('Sap Green', '#7A9B31', 'W&N', { strength: 0.9, opacity: 55, ci: 'PY129', lightfast: 'III' }),
      P('Yellow Ochre', '#B7791F', 'W&N', { strength: 0.6, opacity: 85, ci: 'PY43', lightfast: 'I' }),
      P('Burnt Sienna', '#98552F', 'W&N', { strength: 0.8, opacity: 75, ci: 'PBr7', lightfast: 'II', undertone: '#C67A3D' }),
      P('Burnt Umber', '#43322B', 'W&N', { strength: 0.9, opacity: 80, ci: 'PBr7', lightfast: 'II' }),
      P('Ivory Black', '#2C2C2C', 'W&N', { strength: 2.0, opacity: 90, ci: 'PBk9', lightfast: 'I' }),
    ],
    acrylic: [
      P('Titanium White', '#FFFFFF', 'Golden', { opacity: 100, ci: 'PW6', lightfast: 'I' }),
      P('Cadmium Yellow Medium', '#F4C423', 'Golden', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', toxic: true }),
      P('Cadmium Orange', '#F97F0B', 'Golden', { strength: 1.2, opacity: 90, ci: 'PO20', lightfast: 'I', toxic: true }),
      P('Cadmium Red Medium', '#E32712', 'Golden', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#E8640E', toxic: true }),
      P('Quinacridone Crimson', '#8E1B3F', 'Golden', { strength: 1.9, opacity: 40, ci: 'PR206', lightfast: 'I' }),
      P('Dioxazine Purple', '#5B2A86', 'Golden', { strength: 2.2, opacity: 55, ci: 'PV23', lightfast: 'II' }),
      P('Ultramarine Blue', '#1F3A93', 'Golden', { strength: 1.3, opacity: 65, ci: 'PB29', lightfast: 'I', undertone: '#2741A6' }),
      P('Cobalt Blue', '#0F5B9C', 'Golden', { strength: 0.9, opacity: 75, ci: 'PB28', lightfast: 'I', toxic: true }),
      P('Phthalo Blue (GS)', '#093B6D', 'Golden', { strength: 2.6, opacity: 40, ci: 'PB15', lightfast: 'I', undertone: '#0A4E7E' }),
      P('Phthalo Green (YS)', '#0E7B4E', 'Golden', { strength: 2.5, opacity: 40, ci: 'PG7', lightfast: 'I', undertone: '#1E8A4F' }),
      P('Sap Green', '#6E8B2C', 'Golden', { strength: 0.9, opacity: 55, ci: 'PY129', lightfast: 'III' }),
      P('Yellow Oxide', '#C58A2E', 'Golden', { strength: 0.6, opacity: 85, ci: 'PY42', lightfast: 'I' }),
      P('Naphthol Red', '#D02418', 'Golden', { strength: 1.4, opacity: 85, ci: 'PR112', lightfast: 'II' }),
      P('Burnt Sienna', '#9A4E2A', 'Golden', { strength: 0.8, opacity: 75, ci: 'PBr7', lightfast: 'II', undertone: '#C77A3C' }),
      P('Carbon Black', '#1C1C1C', 'Golden', { strength: 2.0, opacity: 92, ci: 'PBk7', lightfast: 'I' }),
    ],
    gouache: [
      P('Titanium White', '#FFFFFF', 'Schmincke', { opacity: 100, ci: 'PW6', lightfast: 'I' }),
      P('Lemon Yellow', '#F5DE0A', 'Schmincke', { strength: 1.0, opacity: 85, ci: 'PY3', lightfast: 'I' }),
      P('Cadmium Yellow', '#F9B900', 'Schmincke', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', toxic: true }),
      P('Cadmium Orange', '#F97A00', 'Schmincke', { strength: 1.2, opacity: 90, ci: 'PO20', lightfast: 'I', toxic: true }),
      P('Cadmium Red', '#E32900', 'Schmincke', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#E7620B', toxic: true }),
      P('Permanent Carmine', '#B01B45', 'Schmincke', { strength: 1.7, opacity: 75, ci: 'PR177', lightfast: 'II' }),
      P('Ultramarine Blue', '#2A3F9E', 'Schmincke', { strength: 1.3, opacity: 70, ci: 'PB29', lightfast: 'I', undertone: '#2F4AB0' }),
      P('Cerulean Blue', '#0087BD', 'Schmincke', { strength: 0.8, opacity: 90, ci: 'PB35', lightfast: 'I', toxic: true }),
      P('Cobalt Blue', '#0D4E92', 'Schmincke', { strength: 0.9, opacity: 80, ci: 'PB28', lightfast: 'I', toxic: true }),
      P('Phthalo Green', '#007D5C', 'Schmincke', { strength: 2.5, opacity: 45, ci: 'PG7', lightfast: 'I', undertone: '#0E8A5E' }),
      P('Sap Green', '#6E9B2B', 'Schmincke', { strength: 0.9, opacity: 60, ci: 'PY129', lightfast: 'III' }),
      P('Yellow Ochre', '#C88A2D', 'Schmincke', { strength: 0.6, opacity: 85, ci: 'PY43', lightfast: 'I' }),
      P('Burnt Sienna', '#A04E24', 'Schmincke', { strength: 0.8, opacity: 80, ci: 'PBr7', lightfast: 'II', undertone: '#C87B3C' }),
      P('Ivory Black', '#262626', 'Schmincke', { strength: 2.0, opacity: 92, ci: 'PBk9', lightfast: 'I' }),
    ],
    pencil: [
      P('White', '#F8F8F8', 'Faber-Castell', { strength: 0.5, opacity: 80 }),
      P('Lemon Yellow', '#F6E40B', 'Faber-Castell', { strength: 1.0, opacity: 70 }),
      P('Orange', '#F78B1E', 'Faber-Castell', { strength: 1.2, opacity: 75 }),
      P('Red', '#E32918', 'Faber-Castell', { strength: 1.2, opacity: 80, undertone: '#E8620B' }),
      P('Crimson', '#B2124A', 'Faber-Castell', { strength: 1.5, opacity: 70, undertone: '#C02456' }),
      P('Magenta', '#D3238B', 'Faber-Castell', { strength: 1.8, opacity: 70 }),
      P('Violet', '#6C2E99', 'Faber-Castell', { strength: 1.6, opacity: 75 }),
      P('Ultramarine', '#2744A8', 'Faber-Castell', { strength: 1.3, opacity: 75, undertone: '#2B49B4' }),
      P('Phthalo Blue', '#0E4E9C', 'Faber-Castell', { strength: 2.2, opacity: 60, undertone: '#0E5E8C' }),
      P('Turquoise', '#12A2B0', 'Faber-Castell', { strength: 1.4, opacity: 65 }),
      P('Yellow Green', '#9ACD32', 'Faber-Castell', { strength: 1.0, opacity: 70 }),
      P('Grass Green', '#3C9B33', 'Faber-Castell', { strength: 1.4, opacity: 70 }),
      P('Dark Green', '#1E6B46', 'Faber-Castell', { strength: 1.6, opacity: 75 }),
      P('Burnt Ochre', '#B56A28', 'Faber-Castell', { strength: 0.7, opacity: 80 }),
      P('Sepia', '#5B3A22', 'Faber-Castell', { strength: 0.9, opacity: 80 }),
      P('Black', '#1A1A1A', 'Faber-Castell', { strength: 2.0, opacity: 90 }),
    ],
    watercolour: [
      P('Lemon Yellow', '#F7E42A', 'W&N', { strength: 1.0, opacity: 15, ci: 'PY3', lightfast: 'I', staining: 'Low' }),
      P('Cadmium Yellow', '#F6BE00', 'W&N', { strength: 1.0, opacity: 25, ci: 'PY35', lightfast: 'I', staining: 'Low', toxic: true }),
      P('Cadmium Red', '#E53A1F', 'W&N', { strength: 1.1, opacity: 25, ci: 'PR108', lightfast: 'I', undertone: '#E8620B', staining: 'Medium', toxic: true }),
      P('Permanent Rose', '#E33E7E', 'W&N', { strength: 2.0, opacity: 15, ci: 'PV19', lightfast: 'I', staining: 'High' }),
      P('Alizarin Crimson', '#A8233F', 'W&N', { strength: 1.7, opacity: 15, ci: 'PR83', lightfast: 'III', undertone: '#B0224E', staining: 'High' }),
      P('French Ultramarine', '#2F3E9E', 'W&N', { strength: 1.3, opacity: 15, ci: 'PB29', lightfast: 'I', granulating: true, staining: 'Low' }),
      P('Cerulean Blue', '#1E8DC7', 'W&N', { strength: 0.8, opacity: 35, ci: 'PB35', lightfast: 'I', granulating: true, staining: 'Low', toxic: true }),
      P('Cobalt Blue', '#2358A6', 'W&N', { strength: 0.9, opacity: 20, ci: 'PB28', lightfast: 'I', granulating: true, staining: 'Low', toxic: true }),
      P('Winsor Blue (GS)', '#0E2E5E', 'W&N', { strength: 2.5, opacity: 15, ci: 'PB15', lightfast: 'I', undertone: '#0E4E7E', staining: 'High' }),
      P('Phthalo Green', '#0E7E59', 'W&N', { strength: 2.5, opacity: 15, ci: 'PG7', lightfast: 'I', undertone: '#1E8A5E', staining: 'High' }),
      P('Viridian', '#0A6E5F', 'W&N', { strength: 1.6, opacity: 15, ci: 'PG18', lightfast: 'I', granulating: true, staining: 'Low' }),
      P('Sap Green', '#6C8F2A', 'W&N', { strength: 0.9, opacity: 20, ci: 'PY129', lightfast: 'III', staining: 'Medium' }),
      P('Yellow Ochre', '#C58B2F', 'W&N', { strength: 0.6, opacity: 25, ci: 'PY43', lightfast: 'I', granulating: true, staining: 'Low' }),
      P('Raw Sienna', '#B0713A', 'W&N', { strength: 0.7, opacity: 25, ci: 'PY43', lightfast: 'I', staining: 'Medium' }),
      P('Burnt Sienna', '#95421F', 'W&N', { strength: 0.9, opacity: 20, ci: 'PBr7', lightfast: 'II', undertone: '#C0673A', staining: 'Medium' }),
      P('Payne\'s Grey', '#3A4464', 'W&N', { strength: 1.4, opacity: 25, ci: 'PBk6', lightfast: 'II', staining: 'Medium' }),
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
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

  /* fill any fields missing on old saved paints (best effort from defaults) */
  function backfill(paints, defs) {
    const byName = (defs || []).reduce((m, p) => { m[p.name] = p; return m; }, {});
    return paints.map(p => {
      const d = byName[p.name] || {};
      return {
        name: p.name,
        hex: p.hex,
        brand: p.brand || d.brand || '',
        strength: num(p.strength, num(d.strength, 1)),
        opacity: num(p.opacity, num(d.opacity, 100)),
        ci: p.ci || d.ci || '',
        lightfast: p.lightfast || d.lightfast || 'II',
        undertone: p.undertone || p.hex || d.undertone || '',
        granulating: p.granulating != null ? !!p.granulating : !!(d.granulating),
        staining: p.staining || d.staining || 'None',
        toxic: p.toxic != null ? !!p.toxic : !!(d.toxic),
      };
    });
  }

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

    /* returns { paints, medium, custom, label } for a palette id */
    get(id) {
      if (isCustomId(id)) {
        const c = customs()[id];
        return {
          paints: backfill(c.paints, c.source && DEFAULTS[c.source]),
          medium: clone(c.medium),
          custom: true,
          label: c.label,
        };
      }
      if (MEDIA[id]) {
        const saved = overrides()[id];
        const paints = backfill(
          (Array.isArray(saved) && saved.length) ? saved : DEFAULTS[id],
          DEFAULTS[id]
        );
        return { paints, medium: clone(MEDIA[id]), custom: false, label: MEDIA[id].label };
      }
      return { paints: clone(DEFAULTS.oil), medium: clone(MEDIA.oil), custom: false, label: MEDIA.oil.label };
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
