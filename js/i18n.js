/*
   Pixel Palette - colour picker & paint mixer
   Copyright (C) 2026 Pixel Palette contributors

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
      btnInfo: 'Info',
      btnOpen: 'Open image',
      btnReset: 'Reset',
      btnSoften: 'Soften',
      softenRadius: 'Soften radius',
      btnResolve: 'Re-solve mix',
      btnEditPalette: 'Edit',
      canvasHint: 'Drag to pan · scroll / pinch to zoom · arrow keys nudge',
      adTag: 'Advertisement placeholder',
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
      propToxic: 'Toxic',
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
      filterToxic: 'Toxic',
      filterToxicNo: 'Non-toxic only',
      filterToxicYes: 'Toxic only',
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
      stepCanvasBody: 'Drag to pan around the image. Scroll (or pinch on touch screens) to zoom. Reset restores the fitted view.',
      stepReticleTitle: 'The sampler',
      stepReticleBody: 'The square reticle in the middle is your sampling window. The centre pixel is the picked colour. Adjust its size with the slider or drag its corner handles.',
      stepMagnifierTitle: 'Magnified view',
      stepMagnifierBody: 'The magnified view shows the reticle region blown up. Drag on it to move the sample point, or scroll over it to zoom. The arrow buttons (and keyboard arrows) give fine control too.',
      stepReadoutTitle: 'Colour readouts',
      stepReadoutBody: 'The picked colour is shown as HEX, RGB, HSL and CMYK. Click Copy to grab any format.',
      stepMixTitle: 'Paint mixing',
      stepMixBody: 'The mixer works out which paints from the selected palette come closest to the target colour. Fine-tune the ratios with the sliders.',
      stepMediumTitle: 'Medium properties',
      stepMediumBody: 'Each palette belongs to a paint medium with artist-relevant traits — sheen, drying time, diluent and workability — shown above the mixer.',
      stepFiltersTitle: 'Paint filters',
      stepFiltersBody: 'Restrict the mix by pigment behaviour: minimum lightfastness, granulation, staining, toxicity and a maximum number of paints.',
      stepDuplicateTitle: 'Duplicate a palette',
      stepDuplicateBody: 'Copy any palette to make your own — then rename it and edit the paints without touching the original.',
      stepSoftenTitle: 'Soften view',
      stepSoftenBody: 'Slide to blur the image so the dominant colour masses are easier to read. The picked pixel is still the exact raw colour.',
      stepHistoryTitle: 'History',
      stepHistoryBody: 'Your recent colours are kept here. Tap a swatch to restore it, use its badge to remove it, or clear the whole list.',
      infoTitle: 'About Pixel Palette',
      infoDone: 'Done',
      infoOverviewTitle: 'What is Pixel Palette?',
      infoOverview: 'Pixel Palette is a free colour picker and paint mixer for artists. Open any image, sample the exact pixel colour you want, and get a real paint-mix recipe to recreate it from actual paint palettes — oil, acrylic, watercolour, gouache or pencils. Mixing is solved with Kubelka–Munk physics, the same model used in paint chemistry, so the recipe accounts for each pigment\'s strength, opacity and undertone rather than just matching on screen.',
      infoHowTitle: 'How to use it',
      infoStep1: 'Open an image from your device, or start with the built-in demo image.',
      infoStep2: 'Drag to pan and scroll to zoom, then move the reticle over the colour you want.',
      infoStep3: 'Read the exact HEX, RGB, HSL and CMYK values, and copy any of them with one click.',
      infoStep4: 'Pick a medium and palette, then solve the mix — the solver lists the paints and proportions to blend.',
      infoStep5: 'Re-solve as you edit your palette, and use History to keep every colour you sample.',
      infoMediumsTitle: 'Paint mediums',
      infoMediumOil: 'Slow-drying, glossy and rich. Paints mix on the canvas while wet, so recipes blend seamlessly.',
      infoMediumAcrylic: 'Fast-drying and satin. Matches the surface colour closely and can be worked wet-in-wet for a short window.',
      infoMediumGouache: 'Opaque, matte and water-soluble. Lays down flat colour that dries quickly and stays removable with water.',
      infoMediumPencil: 'Dry pigment on paper. Recipes describe layering and hatching rather than wet blending.',
      infoMediumWatercolour: 'A glaze medium — the paper shows through the wash, so the solver matches paint at full strength and tells you the wash strength to apply.',
      infoFeaturesTitle: 'Features',
      infoFeature1: 'Magnified loupe and fine-control nudge for pixel-perfect sampling.',
      infoFeature2: 'Paint filters: granulating, staining, lightfastness, toxicity and maximum paint count per mix.',
      infoFeature3: 'Edit palettes — add, remove, rename or recolour paints, and duplicate any palette.',
      infoFeature4: 'Soften radius to sample an averaged area instead of a single pixel.',
      infoFeature5: 'Colour history with one-click copy, and a guided tour for first-time visitors.',
      infoFaqTitle: 'Frequently asked questions',
      faqQ1: 'Is Pixel Palette free to use?',
      faqA1: 'Yes. Pixel Palette is free with no sign-up required. All colour picking and paint mixing happens entirely in your browser — no image is ever uploaded to a server.',
      faqQ2: 'How does the paint mixer decide what paints to use?',
      faqA2: 'It solves a paint mix using Kubelka–Munk physics. Each real paint has a measured pigment profile (strength, opacity and undertone), and the solver finds the smallest combination of your chosen palette paints whose colour matches your sampled colour.',
      faqQ3: 'What is the difference between painting mediums?',
      faqA3: 'Opaque mediums (oil, acrylic, gouache and pencils) match the exact surface colour, while glaze mediums such as watercolour account for the paper showing through and match paint at full strength. The solver tells you the right wash strength.',
      faqQ4: 'Can I add my own paints?',
      faqA4: 'Yes. Use the Edit button on any palette to add, remove, rename or recolour paints. Custom palettes are stored in your browser and can be duplicated.',
      faqQ5: 'Where does my image data go?',
      faqA5: 'Nowhere. Pixel Palette is fully client-side: your images and paints never leave your device.',
      consentReopen: 'Privacy',
      privacyTitle: 'Privacy declaration',
      privacyDataTitle: 'What data we store',
      privacyData: 'Pixel Palette runs entirely in your browser. We do not operate any server-side accounts, do not require registration, and do not collect, transmit or store any personal data on remote systems. The only data ever written is saved locally on your own device using your browser\u2019s storage.',
      privacyImagesTitle: 'Your images stay on your device',
      privacyImages: 'When you open an image, it is processed locally and never uploaded. No image data leaves your device at any point.',
      privacyLocalTitle: 'Local storage on your device',
      privacyLocal: 'We use your browser\u2019s local storage to remember your preferences and saved work, including your theme choice, filter settings, the side-panel width, colour history, custom palettes, the legal-notice acknowledgement and the consent status below. This data stays on your device and can be removed by clearing your browser\u2019s site data.',
      privacyCookiesTitle: 'Cookies and tracking',
      privacyCookies: 'Pixel Palette itself sets no tracking cookies and uses no analytics or advertising networks. If non-essential services (such as advertising) are ever enabled in the future, you will be asked for consent first and can opt out at any time using the consent banner.',
      privacyContactTitle: 'Contact',
      privacyContact: 'If you have questions about this privacy declaration, you can reach us at awltux.games@gmail.com.',
      privacyDone: 'Done',
      consentNotice: 'Pixel Palette only stores your settings on your device — nothing is tracked or shared, and no images ever leave your browser.',
      consentGotIt: 'Got it',
      consentLearnMore: 'Learn more',
      consentPrompt: 'We use cookies to personalise ads and analyse traffic. Choose what you are comfortable with.',
      consentAcceptAll: 'Accept all',
      consentEssentialOnly: 'Essential only',
      disclaimerReopen: 'Legal notice',
      disclaimerTitle: 'Legal notice — paint safety',
      disclaimerLead: 'Pixel Palette identifies some paints as toxic, for example pigments based on cadmium, cobalt, lead or chromium compounds. Please read this notice before using the app.',
      disclaimerSds: 'The toxicity information is provided for convenience only. It is not a substitute for the manufacturer\u2019s Safety Data Sheet (SDS), the product label, or professional advice. Always follow the handling, ventilation and hygiene instructions for the specific paint brand and medium you use.',
      disclaimerPractice: 'Keep paints out of the reach of children and away from food and drink. Wash your hands after painting. Avoid breathing dry pigment dust, and minimise skin and eye contact.',
      disclaimerResponsibility: 'You are responsible for verifying the safety of the paints you buy. Pixel Palette flags paints as toxic in good faith, based on commonly reported pigment properties, and accepts no liability for any decisions you make using this information.',
      disclaimerAccept: 'I understand and accept',
      disclaimerClose: 'Close',
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
