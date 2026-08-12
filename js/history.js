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
   history.js - swatch strip of picked colours (localStorage).
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;
  const Color = global.Color;
  const KEY = 'pp.history';
  const MAX = 24;

  let strip, clearBtn;
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
    if (clearBtn) clearBtn.hidden = items.length === 0;
    if (!items.length) {
      const empty = document.createElement('span');
      empty.className = 'hist-empty';
      empty.textContent = I18N.t('historyEmpty');
      strip.appendChild(empty);
      return;
    }
    items.forEach((hex, i) => {
      const item = document.createElement('span');
      item.className = 'hist-item';

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

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'hist-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', I18N.t('historyDelete') + ' ' + hex);
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        remove(i);
      });

      item.appendChild(b);
      item.appendChild(del);
      strip.appendChild(item);
    });
  }

  function remove(i) {
    items.splice(i, 1);
    save();
    render();
  }

  function clearAll() {
    items = [];
    save();
    render();
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
    clearBtn = document.getElementById('history-clear');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);
    load();
    render();
  }

  global.CP = global.CP || {};
  global.CP.History = { init, push, onSample, load, render, remove, clearAll };
})(window);
