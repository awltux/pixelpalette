/* ============================================================
   app.js - bootstrap: shared state, theme, toolbar, keyboard
   navigation, module init, demo + auto-tour on first visit.
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;

  /* ---------- shared state ---------- */
  global.CP = global.CP || {};
  global.CP.state = {
    image: null,
    view: { cx: 0, cy: 0, scale: 1 },
    reticlePx: 96,
    zoom: 10,
    color: { r: 0, g: 0, b: 0 },
  };

  /* ---------- theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f2f4f8' : '#111318');
    try { localStorage.setItem('pp.theme', theme); } catch (e) { /* ignore */ }
  }

  function initTheme() {
    let theme = null;
    try { theme = localStorage.getItem('pp.theme'); } catch (e) { /* ignore */ }
    if (!theme) {
      theme = (global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    applyTheme(theme);
    document.getElementById('btn-theme').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- toolbar ---------- */
  function initToolbar() {
    document.getElementById('btn-reset').addEventListener('click', () => global.CP.Canvas.reset());
    document.getElementById('btn-zoom-in').addEventListener('click', () => global.CP.Canvas.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => global.CP.Canvas.zoomOut());

    document.querySelectorAll('.nav-btn[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = btn.getAttribute('data-nav');
        const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
        if (step) global.CP.Reticle.nudge(step[0], step[1], false);
      });
    });
  }

  /* ---------- keyboard ---------- */
  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (global.CP.Tutorial.isVisible()) return;
      let dx = 0, dy = 0;
      switch (e.key) {
        case 'ArrowLeft': dx = -1; break;
        case 'ArrowRight': dx = 1; break;
        case 'ArrowUp': dy = -1; break;
        case 'ArrowDown': dy = 1; break;
        default: return;
      }
      e.preventDefault();
      global.CP.Reticle.nudge(dx, dy, e.shiftKey);
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    I18N.apply();

    global.CP.ImageLoader.init();
    global.CP.Canvas.init();
    global.CP.Reticle.init();
    global.CP.Readout.init();
    global.CP.History.init();
    global.CP.MixUI.init();
    global.CP.PaletteEditor.init();
    global.CP.Tutorial.init();

    initToolbar();
    initKeyboard();

    document.getElementById('btn-tour').hidden = false;

    // demo image always on start; tour auto-plays on very first visit
    global.CP.ImageLoader.loadDemo();
    let toured = false;
    try { toured = localStorage.getItem('pp.toured') === '1'; } catch (e) { /* ignore */ }
    if (!toured) {
      try { localStorage.setItem('pp.toured', '1'); } catch (e) { /* ignore */ }
      setTimeout(() => global.CP.Tutorial.start(), 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  initTheme();
})(window);
