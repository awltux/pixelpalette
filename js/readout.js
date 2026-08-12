/* ============================================================
   readout.js - HEX / RGB / HSL / CMYK display + copy buttons.
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;
  const Color = global.Color;

  const els = {};

  function update(rgb) {
    const hex = Color.rgbToHex(rgb.r, rgb.g, rgb.b);
    const hsl = Color.rgbToHsl(rgb.r, rgb.g, rgb.b);
    const cmyk = Color.rgbToCmyk(rgb.r, rgb.g, rgb.b);
    els.swatch.style.background = hex;
    els.hex.textContent = hex.toUpperCase();
    els.rgb.textContent = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    els.hsl.textContent = `${hsl.h}°, ${hsl.s}%, ${hsl.l}%`;
    els.cmyk.textContent = `${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`;
    els.swatch.setAttribute('data-hex', hex);
  }

  function copy(text, btn) {
    const done = () => {
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = I18N.t('copied');
      setTimeout(() => { btn.textContent = prev; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    done();
  }

  function init() {
    els.swatch = document.getElementById('colour-swatch');
    els.hex = document.getElementById('hex-val');
    els.rgb = document.getElementById('rgb-val');
    els.hsl = document.getElementById('hsl-val');
    els.cmyk = document.getElementById('cmyk-val');

    document.querySelectorAll('.copy[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-copy');
        const text = {
          hex: els.hex.textContent,
          rgb: 'rgb(' + els.rgb.textContent + ')',
          hsl: 'hsl(' + els.hsl.textContent + ')',
          cmyk: 'cmyk(' + els.cmyk.textContent + ')',
        }[key];
        copy(text, btn);
      });
    });
  }

  global.CP = global.CP || {};
  global.CP.Readout = { init, update };
})(window);
