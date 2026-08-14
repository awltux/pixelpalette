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
   disclaimer.js - blocking legal / safety notice.

   The app identifies paints as toxic or non-toxic, so the first
   visit is gated behind an explicit acceptance of a legal notice.
   Acceptance is persisted in localStorage and versioned, so the
   gate re-appears whenever the notice text is updated. The notice
   can also be reopened from the footer (non-blocking there).
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;
  const STORAGE_KEY = 'pp.disclaimer';
  const VERSION = 2;

  let root = null;
  let accepted = false;
  let gate = false;
  let pending = null;

  /* ---------- state ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        accepted = s.v === VERSION && s.accepted === true;
      }
    } catch (e) { /* ignore */ }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, accepted: true, at: Date.now() }));
    } catch (e) { /* ignore */ }
  }

  /* ---------- api ---------- */
  function required() {
    return !accepted;
  }

  /* Run fn once the notice has been accepted. Accepted already ->
     run now; gated -> queue until accept(). */
  function onAccept(fn) {
    if (accepted) {
      fn();
      return;
    }
    pending = fn;
  }

  function accept() {
    accepted = true;
    save();
    close();
    if (pending) {
      const fn = pending;
      pending = null;
      fn();
    }
  }

  function close() {
    if (!root) return;
    root.hidden = true;
  }

  /* gate=true  -> first-visit block, no close affordance
     gate=false -> reopened from footer, closable */
  function show(opts) {
    if (!root) return;
    gate = !!(opts && opts.gate);
    root.hidden = false;
    const closeBtn = document.getElementById('disclaimer-close');
    if (closeBtn) closeBtn.hidden = gate;
    const acceptBtn = document.getElementById('disclaimer-accept');
    if (acceptBtn) acceptBtn.focus();
  }

  function open() {
    show({ gate: false });
  }

  function init() {
    root = document.getElementById('disclaimer-overlay');
    if (!root) return;
    load();
    document.getElementById('disclaimer-accept').addEventListener('click', accept);
    document.getElementById('disclaimer-close').addEventListener('click', close);
    root.addEventListener('click', (e) => { if (e.target === root && !gate) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || root.hidden) return;
      if (!gate) close();
    });
    if (required()) show({ gate: true });
  }

  global.CP = global.CP || {};
  global.CP.Disclaimer = { init, open, close, accept, required, onAccept };
})(window);
