/* ============================================================
   i18n - simple string table. English default; add locales by
   copying the 'en' object and registering under a new code.
   ============================================================ */
(function (global) {
  'use strict';

  const TABLE = {
    en: {
      appName: 'Pixel Palette',
      btnTheme: 'Theme',
      btnTour: 'Tour',
      btnOpen: 'Open image',
      btnReset: 'Reset',
      btnResolve: 'Re-solve mix',
      btnEditPalette: 'Edit',
      canvasHint: 'Drag to pan · scroll / pinch to zoom · arrow keys nudge',
      adTag: 'Advertisement',
      panelReticle: 'Sampler',
      reticleSize: 'Reticle size',
      magnifierZoom: 'Magnifier zoom',
      magnifierLabel: 'Magnified',
      navTitle: 'Fine control',
      panelReadout: 'Colour',
      copy: 'Copy',
      copied: 'Copied',
      history: 'History',
      historyEmpty: 'No colours yet',
      historyClear: 'Clear',
      historyDelete: 'Remove',
      panelMix: 'Paint mixing',
      palette: 'Palette',
      mixSwatch: 'Mixed',
      targetSwatch: 'Target',
      deltaE: 'ΔE',
      mixName: 'Paint',
      wash: 'Wash strength',
      paletteEditTitle: 'Edit palette',
      paletteName: 'Palette name',
      paletteAdd: 'Add paint',
      paletteReset: 'Reset to default',
      paletteDone: 'Done',
      paletteDelete: 'Delete palette',
      paletteCopy: 'Copy',
      btnDuplicatePalette: 'Duplicate',
      propStrength: 'Strength',
      propOpacity: 'Opacity',
      propCi: 'Pigment',
      propLightfast: 'Lightfast',
      propUndertone: 'Undertone',
      propGranulating: 'Granulating',
      propStaining: 'Staining',
      propSheen: 'Sheen',
      propDrying: 'Drying',
      propDiluent: 'Diluent',
      propWet: 'Workability',
      sheenGlossy: 'Glossy',
      sheenSatin: 'Satin',
      sheenMatte: 'Matte',
      dryingSlow: 'Slow',
      dryingFast: 'Fast',
      dryingInstant: 'Instant',
      diluentOil: 'Oil',
      diluentWater: 'Water',
      diluentDry: 'Dry',
      wetWetInWet: 'Wet-in-wet',
      wetWetOnDry: 'Wet-on-dry',
      stainNone: 'None',
      stainLow: 'Low',
      stainMedium: 'Medium',
      stainHigh: 'High',
      filtersTitle: 'Paint filters',
      filterLightfast: 'Lightfast',
      filterGranulating: 'Granulating',
      filterStaining: 'Staining',
      filterMaxPaints: 'Max paints',
      filterAll: 'All',
      filterAny: 'Any',
      filterGranYes: 'Granulating',
      filterGranNo: 'Non-granulating',
      filterStainNoHigh: 'Exclude High',
      filterStainNoMed: 'Exclude Medium+',
      noPaintsMatch: 'No paints match these filters',
      paintName: 'Name',
      paintBrand: 'Brand',
      paletteRemove: 'Remove paint',
      footer: 'Pick a colour. Mix a paint. Make art.',
      tourSkip: 'Skip',
      tourNext: 'Next',
      tourPrev: 'Back',
      tourDone: 'Done',
      stepLoadTitle: 'Open an image',
      stepLoadBody: 'Use "Open image" to load a photo from your device, or drag & drop an image anywhere on the canvas.',
      stepCanvasTitle: 'Explore the image',
      stepCanvasBody: 'Drag to pan around the image. Scroll (or pinch on touch screens) to zoom. Fit and Reset quickly set the view.',
      stepReticleTitle: 'The sampler',
      stepReticleBody: 'The square reticle in the middle is your sampling window. The centre pixel is the picked colour. Adjust its size with the slider or drag its corner handles.',
      stepMagnifierTitle: 'Magnified view',
      stepMagnifierBody: 'The magnified view shows the reticle region blown up. Use the zoom slider and the arrow buttons (or keyboard arrows) for fine movement of the sample point.',
      stepReadoutTitle: 'Colour readouts',
      stepReadoutBody: 'The picked colour is shown as HEX, RGB, HSL and CMYK. Click Copy to grab any format.',
      stepMixTitle: 'Paint mixing',
      stepMixBody: 'The mixer works out which paints from the selected palette come closest to the target colour. Fine-tune the ratios with the sliders.',
      stepHistoryTitle: 'History',
      stepHistoryBody: 'Your recent colours are kept here. Tap a swatch to restore that colour and its mix.',
    },
  };

  const STORAGE_KEY = 'pp.lang';
  const CODES = Object.keys(TABLE);
  let lang = CODES[0];

  function detect() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    if (saved && TABLE[saved]) return saved;
    const nav = (global.navigator && global.navigator.language || 'en').toLowerCase().slice(0, 2);
    return TABLE[nav] ? nav : CODES[0];
  }

  function t(key, vars) {
    let s = (TABLE[lang] && TABLE[lang][key]) || TABLE[CODES[0]][key] || key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      }
    }
    return s;
  }

  function apply() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.getAttribute('data-i18n-attr').split(',').forEach((pair) => {
        const [attr, key] = pair.split(':');
        el.setAttribute(attr, t(key));
      });
    });
    document.documentElement.lang = lang;
  }

  global.I18N = { t, apply, lang: () => lang, codes: CODES };
  lang = detect();
})(window);
