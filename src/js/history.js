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
  const Palettes = global.Palettes;
  const KEY = 'pp.history';
  const MAX = 24;

  let strip, clearBtn;
  /* per-palette history: store[paletteId] = entries[]. items is a live
     reference to the currently selected palette's array. */
  let store = {};
  let activeId = 'oil';
  let items = [];
  let sampleTimer = null;

  function normalize(h) {
    if (typeof h === 'string') return { target: h, mixed: null };
    if (h && /^#[0-9a-fA-F]{6}$/.test(h.target)) {
      return {
        target: h.target,
        mixed: h.mixed && /^#[0-9a-fA-F]{6}$/.test(h.mixed) ? h.mixed : null,
        palette: h.palette || null,
        recipe: Array.isArray(h.recipe) ? h.recipe : null,
        locked: !!h.locked,
      };
    }
    return null;
  }

  function load() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { parsed = null; }
    if (Array.isArray(parsed)) {
      // migrate the old global list into the currently selected palette
      store = { [Palettes.getSelected()]: parsed.map(normalize).filter(Boolean) };
      save();
    } else if (parsed && typeof parsed === 'object') {
      store = parsed;
      for (const id of Object.keys(store)) {
        store[id] = (Array.isArray(store[id]) ? store[id] : []).map(normalize).filter(Boolean);
      }
    } else {
      store = {};
    }
    activeId = Palettes.getSelected();
    if (!store[activeId]) store[activeId] = [];
    items = store[activeId];
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  /* switch the visible strip to another palette's history */
  function setPalette(id) {
    const pid = id || Palettes.getSelected();
    activeId = pid;
    if (!store[pid]) store[pid] = [];
    items = store[pid];
    render();
  }

  /* a palette has been deleted: drop its history (project data goes with it) */
  function dropPalette(id) {
    if (!store[id]) return;
    delete store[id];
    save();
    if (id === activeId) {
      activeId = Palettes.getSelected();
      items = store[activeId] || (store[activeId] = []);
    }
    render();
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
    items.forEach((entry, i) => {
      const hex = entry.target;
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
        global.CP.Reticle.setColorFromHistory(entry);
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
      if (entry.locked) {
        item.classList.add('hist-locked');
        const lock = document.createElement('span');
        lock.className = 'hist-lock';
        lock.title = I18N.t('histLocked');
        lock.setAttribute('aria-label', I18N.t('histLocked'));
        lock.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5">'
          + '<rect x="5" y="10.5" width="14" height="9.5" rx="2" fill="currentColor" stroke="none"/>'
          + '<path d="M8 10V7.5a4 4 0 0 1 8 0V10"/></svg>';
        item.appendChild(lock);
      } else {
        item.appendChild(del);
      }
      strip.appendChild(item);
    });
    // keep the mix-panel lock button in sync with the entry just added/removed
    if (global.CP.MixUI && global.CP.MixUI.refreshLockBtn) global.CP.MixUI.refreshLockBtn();
  }

  function remove(i) {
    if (items[i] && items[i].locked) return;
    items.splice(i, 1);
    save();
    render();
  }

  function clearAll() {
    // mutate the shared array in place so store[activeId] stays in sync
    // with items (reassigning items would orphan the stored list)
    const kept = items.filter(e => e.locked);
    items.length = 0;
    for (const e of kept) items.push(e);
    // repopulate with the current image colour - unless that colour is
    // already pinned as a locked swatch, which survives the clear
    const st = global.CP.state;
    if (st && st.image && st.color) {
      const target = Color.rgbToHex(st.color.r, st.color.g, st.color.b);
      if (/^#[0-9a-fA-F]{6}$/.test(target) && !isLocked(target)) {
        const mix = global.CP.MixUI && global.CP.MixUI.getResult && global.CP.MixUI.getResult();
        const mixed = mix && mix.mixHex ? mix.mixHex : null;
        const ctx = global.CP.MixUI && global.CP.MixUI.getContext
          ? global.CP.MixUI.getContext()
          : null;
        items.push({
          target: target.toUpperCase(),
          mixed,
          palette: ctx && ctx.palette ? ctx.palette : null,
          recipe: ctx && ctx.recipe ? ctx.recipe : null,
        });
        if (items.length > MAX) items.splice(0, items.length - MAX);
      }
    }
    save();
    render();
  }

  /* index of the most recent entry for a target hex (matches the entry that
     manual mix tweaks write back to) */
  function indexForTarget(target) {
    const t = (target || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(t)) return -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].target === t) return i;
    }
    return -1;
  }

  function hasEntry(target) { return indexForTarget(target) >= 0; }

  function isLocked(target) {
    const i = indexForTarget(target);
    return i >= 0 ? !!items[i].locked : false;
  }

  /* lock / unlock the active entry for a target; returns the new state,
     or null when there is no entry for that target */
  function toggleLock(target) {
    const i = indexForTarget(target);
    if (i < 0) return null;
    items[i].locked = !items[i].locked;
    save();
    render();
    return items[i].locked;
  }

  function push(entry, paletteId) {
    const target = (entry.target || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(target)) return;
    const pid = paletteId || activeId;
    const arr = store[pid] || (store[pid] = []);
    const mixed = entry.mixed ? entry.mixed.toUpperCase() : null;
    const last = arr[arr.length - 1];
    if (last && last.target === target) {
      const a = entry.palette && entry.palette.id;
      const b = last.palette && last.palette.id;
      if ((a && a === b) || (!a && !b)) return;
    }
    arr.push({ target, mixed, palette: entry.palette || null, recipe: entry.recipe || null });
    if (arr.length > MAX) arr.splice(0, arr.length - MAX);
    save();
    if (pid === activeId) render();
  }

  function onSample(rgb) {
    const target = Color.rgbToHex(rgb.r, rgb.g, rgb.b);
    const mix = global.CP.MixUI && global.CP.MixUI.getResult && global.CP.MixUI.getResult();
    const mixed = mix && mix.mixHex ? mix.mixHex : null;
    const ctx = global.CP.MixUI && global.CP.MixUI.getContext
      ? global.CP.MixUI.getContext()
      : null;
    const palette = ctx && ctx.palette ? ctx.palette : null;
    const recipe = ctx && ctx.recipe ? ctx.recipe : null;
    const paletteId = palette ? palette.id : activeId;
    if (sampleTimer) clearTimeout(sampleTimer);
    sampleTimer = setTimeout(() => {
      sampleTimer = null;
      push({ target, mixed, palette, recipe }, paletteId);
    }, 700);
  }

  /* after a manual mix tweak, persist the new mixed colour (and its recipe
     snapshot) onto the most recent history entry for the same target colour
     in the given palette (defaults to the active one). Captured at schedule
     time so a palette switch mid-debounce can't rebind the write. Returns
     true when an entry was updated. */
  function updateMixedForTarget(entry, paletteId) {
    const target = (entry.target || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(target)) return false;
    const pid = paletteId || activeId;
    const arr = store[pid] || (store[pid] = []);
    const mixed = entry.mixed ? entry.mixed.toUpperCase() : null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].target === target && !arr[i].locked) {
        arr[i].mixed = mixed;
        arr[i].palette = entry.palette || null;
        arr[i].recipe = Array.isArray(entry.recipe) ? entry.recipe : null;
        save();
        if (pid === activeId) render();
        return true;
      }
    }
    return false;
  }

  function init() {
    strip = document.getElementById('history-strip');
    clearBtn = document.getElementById('history-clear');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);
    load();
    render();
  }

  global.CP = global.CP || {};
  global.CP.History = { init, push, onSample, updateMixedForTarget, load, render, remove, clearAll, hasEntry, isLocked, toggleLock, setPalette, dropPalette };
})(window);
