/* ============================================================
   history.js - swatch strip of picked colours (localStorage).
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;
  const Color = global.Color;
  const KEY = 'pp.history';
  const MAX = 24;

  let strip;
  let items = [];
  let sampleTimer = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      items = raw ? JSON.parse(raw).filter(h => /^#[0-9a-fA-F]{6}$/.test(h)) : [];
    } catch (e) { items = []; }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* ignore */ }
  }

  function render() {
    if (!strip) return;
    strip.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('span');
      empty.className = 'hist-empty';
      empty.textContent = I18N.t('historyEmpty');
      strip.appendChild(empty);
      return;
    }
    items.forEach((hex, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hist-swatch';
      b.style.background = hex;
      b.title = hex;
      b.setAttribute('aria-label', hex);
      b.tabIndex = i === 0 ? 0 : -1;
      b.addEventListener('click', () => {
        const rgb = Color.hexToRgb(hex);
        global.CP.Reticle.setColorFromHistory(rgb);
      });
      strip.appendChild(b);
    });
  }

  function push(hex) {
    const upper = hex.toUpperCase();
    if (items[items.length - 1] === upper) return;
    items.push(upper);
    if (items.length > MAX) items = items.slice(-MAX);
    save();
    render();
  }

  function onSample(rgb) {
    const hex = Color.rgbToHex(rgb.r, rgb.g, rgb.b);
    if (sampleTimer) clearTimeout(sampleTimer);
    sampleTimer = setTimeout(() => {
      sampleTimer = null;
      push(hex);
    }, 700);
  }

  function init() {
    strip = document.getElementById('history-strip');
    load();
    render();
  }

  global.CP = global.CP || {};
  global.CP.History = { init, push, onSample, load, render };
})(window);
