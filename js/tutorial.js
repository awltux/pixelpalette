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
   tutorial.js - overlay app-driver: a coach-mark tour that walks
   through each feature with spotlight + callout, click-through.
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;

  let root, dim, spot, bubble;
  let current = -1;
  let visible = false;
  let savedOpen = null; // details panels' open state before the tour ran

  const STEPS = [
    { target: '#btn-open', title: 'stepLoadTitle', body: 'stepLoadBody' },
    { target: '#canvas-wrap', title: 'stepCanvasTitle', body: 'stepCanvasBody' },
    { target: '#panel-reticle', title: 'stepReticleTitle', body: 'stepReticleBody' },
    { target: '.magnifier', title: 'stepMagnifierTitle', body: 'stepMagnifierBody' },
    { target: '#readout-area', title: 'stepReadoutTitle', body: 'stepReadoutBody' },
    { target: '#panel-mix', title: 'stepMixTitle', body: 'stepMixBody' },
    { target: '#mix-delta', title: 'stepDeltaTitle', body: 'stepDeltaBody' },
    { target: '.mix-list', title: 'stepRecipeTitle', body: 'stepRecipeBody' },
    { target: '#btn-lock-mix', title: 'stepLockTitle', body: 'stepLockBody' },
    { target: '#btn-use-full', title: 'stepFullPaletteTitle', body: 'stepFullPaletteBody' },
    { target: '#btn-resolve', title: 'stepResolveTitle', body: 'stepResolveBody' },
    { target: '.mix-tryharder', title: 'stepTryHarderTitle', body: 'stepTryHarderBody' },
    { target: '#medium-readout', title: 'stepMediumTitle', body: 'stepMediumBody' },
    { target: '.gamut-block', title: 'stepGamutTitle', body: 'stepGamutBody' },
    { target: '.mix-filters', title: 'stepFiltersTitle', body: 'stepFiltersBody' },
    { target: '#btn-dup-palette', title: 'stepDuplicateTitle', body: 'stepDuplicateBody' },
    { target: '#btn-fit-palette', title: 'stepFitTitle', body: 'stepFitBody' },
    { target: '#palette-add', title: 'stepAddPaintTitle', body: 'stepAddPaintBody',
      enter() { global.CP.PaletteEditor.open(); },
      leave() { global.CP.PaletteEditor.close(); } },
    { target: '.toolbar-slider', title: 'stepSoftenTitle', body: 'stepSoftenBody' },
    { target: '#history', title: 'stepHistoryTitle', body: 'stepHistoryBody' },
  ];

  function build() {
    root = document.getElementById('tutorial-root');
    dim = document.createElement('div');
    dim.className = 'tutorial-dim';
    spot = document.createElement('div');
    spot.className = 'tutorial-spot';
    bubble = document.createElement('div');
    bubble.className = 'tutorial-bubble';

    const advance = () => {
      if (current < STEPS.length - 1) next(); else hide();
    };
    dim.addEventListener('click', advance);
    spot.addEventListener('click', advance);

    root.appendChild(dim);
    root.appendChild(spot);
    root.appendChild(bubble);
  }

  function ensureVisible(el) {
    const r = el.getBoundingClientRect();
    const fullyVisible = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
    if (!fullyVisible) {
      el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    }
  }

  /* the mobile layout collapses the Sampler / Colour panels into closed
     <details>; a step targeting content inside a collapsed panel would
     spotlight the wrong area, so open any closed ancestor first. The panels
     are restored to their original state when the tour ends. */
  function expandAncestors(el) {
    let node = el;
    while (node) {
      if (node.tagName === 'DETAILS' && !node.open) node.open = true;
      node = node.parentElement;
    }
  }

  function show(i) {
    /* leave any overlay/state the outgoing step opened before switching */
    if (current >= 0 && current !== i && STEPS[current].leave) STEPS[current].leave();
    current = i;
    visible = true;
    root.hidden = false;
    const step = STEPS[i];
    const el = document.querySelector(step.target);
    if (!el) { hide(); return; }
    if (step.enter) step.enter();
    // open collapsed ancestor panels so the spotlight points at real content
    expandAncestors(el);
    // scroll only if the target is actually off-screen, and only just enough
    ensureVisible(el);

    // render content immediately, then position once layout/scroll settles
    renderBubble(step, i);
    schedulePosition(step.target);
    for (let k = 0; k < 3; k++) requestAnimationFrame(() => position(step.target));
  }

  let posFrame = 0;
  function schedulePosition(selector) {
    if (posFrame) return;
    posFrame = requestAnimationFrame(() => { posFrame = 0; position(selector); });
  }

  function position(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    spot.style.width = r.width + 'px';
    spot.style.height = r.height + 'px';
    spot.style.left = r.left + 'px';
    spot.style.top = r.top + 'px';

    const br = bubble.getBoundingClientRect();
    const pad = 16;
    let left = r.left;
    let top = r.top + r.height + 14;

    // place right if enough space to the right
    if (r.right + br.width + pad <= innerWidth) {
      left = r.right + 14;
      top = r.top;
    } else if (r.left - br.width - pad >= 0) {
      left = r.left - br.width - 14;
      top = r.top;
    } else if (top + br.height > innerHeight - pad) {
      top = Math.max(pad, r.top - br.height - 14);
      left = Math.max(pad, Math.min(r.left, innerWidth - br.width - pad));
    } else {
      left = Math.max(pad, Math.min(left, innerWidth - br.width - pad));
    }
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }

  function renderBubble(step, i) {
    bubble.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = I18N.t(step.title);
    const p = document.createElement('p');
    p.textContent = I18N.t(step.body);
    const nav = document.createElement('div');
    nav.className = 'tutorial-nav';

    const progress = document.createElement('span');
    progress.className = 'tutorial-progress';
    progress.textContent = `${i + 1} / ${STEPS.length}`;

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'btn btn-ghost';
    skip.textContent = I18N.t('tourSkip');
    skip.addEventListener('click', hide);

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn';
    prev.textContent = I18N.t('tourPrev');
    prev.disabled = i === 0;
    prev.addEventListener('click', () => show(i - 1));

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-primary';
    const isLast = i === STEPS.length - 1;
    nextBtn.textContent = isLast ? I18N.t('tourDone') : I18N.t('tourNext');
    nextBtn.addEventListener('click', () => (isLast ? hide() : show(i + 1)));

    nav.appendChild(skip);
    nav.appendChild(prev);
    nav.appendChild(progress);
    nav.appendChild(nextBtn);

    bubble.appendChild(h);
    bubble.appendChild(p);
    bubble.appendChild(nav);
  }

  function next() { if (current < STEPS.length - 1) show(current + 1); }

  function hide() {
    visible = false;
    root.hidden = true;
    /* leave any overlay/state the current step opened */
    if (current >= 0 && STEPS[current].leave) STEPS[current].leave();
    // put any panels we expanded for the tour back to how we found them
    if (savedOpen) {
      savedOpen.forEach((open, el) => { el.open = open; });
      savedOpen = null;
    }
  }

  function start() {
    if (!root) build();
    savedOpen = new Map();
    document.querySelectorAll('details').forEach((d) => savedOpen.set(d, d.open));
    show(0);
  }

  function isVisible() { return visible; }

  function init() {
    build();
    const btn = document.getElementById('btn-tour');
    btn.addEventListener('click', start);
    window.addEventListener('resize', () => {
      if (visible && current >= 0) schedulePosition(STEPS[current].target);
    });
    window.addEventListener('scroll', () => {
      if (visible && current >= 0) schedulePosition(STEPS[current].target);
    }, { passive: true, capture: true });
    document.addEventListener('keydown', (e) => {
      if (!visible) return;
      if (e.key === 'Escape') hide();
      if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' && current > 0) { show(current - 1); e.preventDefault(); }
    });
  }

  global.CP = global.CP || {};
  global.CP.Tutorial = { init, start, isVisible };
})(window);
