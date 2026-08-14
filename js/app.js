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
   app.js - bootstrap: shared state, theme, toolbar, keyboard
   navigation, module init, demo + auto-tour on first visit.
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;

  /* ---------- shared state ---------- */
  const SOFTEN_KEY = 'pp.soften';
  let soften = { radius: 0 };
  try {
    const raw = localStorage.getItem(SOFTEN_KEY);
    if (raw) soften = Object.assign(soften, JSON.parse(raw));
  } catch (e) { /* ignore */ }

  global.CP = global.CP || {};
  global.CP.state = {
    image: null,
    view: { cx: 0, cy: 0, scale: 1 },
    reticlePx: 96,
    zoom: 10,
    color: { r: 0, g: 0, b: 0 },
    soften,
  };

  /* ---------- soften view ---------- */
  function blurFilter() {
    return soften.radius > 0 ? `blur(${soften.radius}px)` : 'none';
  }

  function setSoftenRadius(px) {
    soften.radius = Math.max(0, Math.min(24, Math.round(px)));
    try { localStorage.setItem(SOFTEN_KEY, JSON.stringify(soften)); } catch (e) { /* ignore */ }
    global.CP.Canvas.requestRender();
    global.CP.Reticle.drawMagnifier();
  }

  function initSoften() {
    const slider = document.getElementById('soften-radius');
    slider.value = soften.radius;
    slider.addEventListener('input', () => setSoftenRadius(parseFloat(slider.value)));
  }

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
    document.getElementById('btn-lock').addEventListener('click', () => global.CP.Canvas.toggleLock());

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

  /* ---------- info modal ---------- */
  function initInfo() {
    const overlay = document.getElementById('info-overlay');
    const btn = document.getElementById('btn-info');
    btn.addEventListener('click', () => { overlay.hidden = false; });
    document.getElementById('info-close').addEventListener('click', () => { overlay.hidden = true; });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) overlay.hidden = true;
    });
  }

  /* ---------- consent ---------- */
  function initConsent() {
    global.CP.Consent.init();
    document.getElementById('btn-privacy').addEventListener('click', () => {
      document.getElementById('privacy-overlay').hidden = false;
    });
    document.getElementById('privacy-close').addEventListener('click', () => {
      document.getElementById('privacy-overlay').hidden = true;
    });
    const overlay = document.getElementById('privacy-overlay');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) overlay.hidden = true;
    });
  }

  /* ---------- legal / safety notice ---------- */
  function initDisclaimer() {
    global.CP.Disclaimer.init();
    document.getElementById('btn-disclaimer').addEventListener('click', () => global.CP.Disclaimer.open());
  }

  /* ---------- pane divider / side-panel width ---------- */
  const SIDE_W_KEY = 'pp.sideW';
  let dragState = null;

  function applySideW(w) {
    const clamped = Math.max(300, Math.min(720, Math.round(w)));
    document.getElementById('app-main').style.setProperty('--side-w', clamped + 'px');
    try { localStorage.setItem(SIDE_W_KEY, String(clamped)); } catch (e) { /* ignore */ }
    if (global.CP.Canvas) global.CP.Canvas.fit();
  }

  function initPaneDivider() {
    const divider = document.getElementById('pane-divider');
    if (!divider) return;

    try {
      const saved = parseFloat(localStorage.getItem(SIDE_W_KEY));
      if (saved > 0) applySideW(saved);
    } catch (e) { /* ignore */ }

    divider.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      divider.setPointerCapture(e.pointerId);
      const startW = parseFloat(getComputedStyle(document.getElementById('app-main')).getPropertyValue('--side-w')) || 360;
      dragState = { startX: e.clientX, startW };
      divider.classList.add('dragging');
    });

    divider.addEventListener('pointermove', (e) => {
      if (!dragState) return;
      const w = dragState.startW - (e.clientX - dragState.startX);
      document.getElementById('app-main').style.setProperty('--side-w', Math.max(300, Math.min(720, Math.round(w))) + 'px');
    });

    const end = () => {
      if (!dragState) return;
      const w = parseFloat(getComputedStyle(document.getElementById('app-main')).getPropertyValue('--side-w')) || 360;
      dragState = null;
      divider.classList.remove('dragging');
      applySideW(w);
    };
    divider.addEventListener('pointerup', end);
    divider.addEventListener('pointercancel', end);
  }

  /* collapse the Sampler / Colour panels on small screens so the mix
     panel is reachable without long scrolling; always open on desktop */
  function initMobilePanels() {
    const mq = global.matchMedia ? global.matchMedia('(max-width: 900px)') : null;
    if (!mq) return;
    const reticle = document.getElementById('panel-reticle');
    const readout = document.getElementById('panel-readout');
    const apply = () => {
      if (reticle) reticle.open = !mq.matches;
      if (readout) readout.open = !mq.matches;
    };
    apply();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(apply);
    }
  }

  /* ---------- fine slider drag (hold Ctrl) ----------
     Ctrl+dragging any range slider reduces the pointer-to-value sensitivity
     by FINE_FACTOR, so tiny nudges produce very small value changes. The
     drag is driven entirely here (pointer capture) so the reduced sensitivity
     applies regardless of the slider's native drag behaviour. */
  const FINE_FACTOR = 10;
  const fineDrags = new Map();

  function initFineDrag() {
    document.addEventListener('pointerdown', (e) => {
      const t = e.target;
      if (!t || t.tagName !== 'INPUT' || t.type !== 'range') return;
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const rect = t.getBoundingClientRect();
      const origStep = t.getAttribute('step');
      const step = (origStep !== null && parseFloat(origStep) > 0) ? parseFloat(origStep) : 1;
      const min = t.min === '' ? 0 : parseFloat(t.min);
      const max = t.max === '' ? 100 : parseFloat(t.max);
      const range = max - min;
      if (!(range > 0) || !(rect.width > 0)) return;
      const cur = parseFloat(t.value);
      const clickVal = min + ((e.clientX - rect.left) / rect.width) * range;
      const thumbCx = ((cur - min) / range) * rect.width;
      // grab the thumb if pressed on it; otherwise jump to the clicked spot
      const onThumb = Math.abs((e.clientX - rect.left) - thumbCx) <= 14;
      const startValue = onThumb
        ? cur
        : min + Math.round((clickVal - min) / step) * step;
      fineDrags.set(e.pointerId, {
        input: t,
        origStep,
        startX: e.clientX,
        startValue,
        min, max, step, range,
        width: rect.width,
        fine: false,
      });
      try { t.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      t.focus();
      e.preventDefault();
    }, true);

    document.addEventListener('pointermove', (e) => {
      const st = fineDrags.get(e.pointerId);
      if (!st) return;
      e.preventDefault();
      const input = st.input;
      const fine = e.ctrlKey;
      if (fine !== st.fine) {
        // ctrl pressed/released mid-drag: re-baseline so there's no jump
        st.startX = e.clientX;
        st.startValue = parseFloat(input.value);
        st.fine = fine;
      }
      const raw = st.startValue + ((e.clientX - st.startX) / st.width) * st.range;
      const sens = fine ? 1 / FINE_FACTOR : 1;
      let v = Math.max(st.min, Math.min(st.max, st.startValue + (raw - st.startValue) * sens));
      if (fine) {
        input.step = 'any';
        v = Math.round(v * 1000) / 1000;
      } else {
        input.step = String(st.step);
        v = st.min + Math.round((v - st.min) / st.step) * st.step;
        v = Math.round(v * 1e6) / 1e6;
      }
      if (parseFloat(input.value) !== v) {
        input.value = String(v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, true);

    const endFineDrag = (e) => {
      const st = fineDrags.get(e.pointerId);
      if (!st) return;
      if (st.origStep === null) st.input.removeAttribute('step');
      else st.input.step = st.origStep;
      fineDrags.delete(e.pointerId);
    };
    document.addEventListener('pointerup', endFineDrag, true);
    document.addEventListener('pointercancel', endFineDrag, true);
  }

  /* ---------- boot ---------- */
  function boot() {
    I18N.apply();

    initConsent();
    initDisclaimer();
    global.CP.ImageLoader.init();
    global.CP.Canvas.init();
    global.CP.Reticle.init();
    global.CP.Readout.init();
    global.CP.History.init();
    global.CP.MixUI.init();
    global.CP.GamutFilter.init();
    global.CP.PaletteEditor.init();
    global.CP.Tutorial.init();

    initToolbar();
    initKeyboard();
    initSoften();
    initInfo();
    initPaneDivider();
    initMobilePanels();
    initFineDrag();

    global.CP.blurFilter = blurFilter;

    document.getElementById('btn-tour').hidden = false;

    // demo image always on start; tour auto-plays on very first visit
    // (after the legal notice is accepted)
    global.CP.ImageLoader.loadDemo();
    let toured = false;
    try { toured = localStorage.getItem('pp.toured') === '1'; } catch (e) { /* ignore */ }
    const startTour = () => {
      if (toured) return;
      try { localStorage.setItem('pp.toured', '1'); } catch (e) { /* ignore */ }
      setTimeout(() => global.CP.Tutorial.start(), 600);
    };
    if (global.CP.Disclaimer.required()) {
      global.CP.Disclaimer.onAccept(startTour);
    } else {
      startTour();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  initTheme();
})(window);
