/*
   Pixel Palette - tutorial (tour) unit test
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Exercises the pure geometry in src/js/tutorial.js:
   - the bubble-placement helper keeps the callout fully inside the viewport,
     including the case that used to push it off the bottom/right edge
   - the step list includes a Tracing-feature step with a real DOM target
   The DOM-heavy run()/start() paths are not reachable here (the sandbox
   document has no layout), so only the pure internals are asserted.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSandbox, runSource, host } from './helpers/env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTutorial() {
  const s = createSandbox();
  runSource(s, 'i18n.js');
  runSource(s, 'tutorial.js');
  return s.CP.Tutorial.__internal;
}

/* a placement is "safe" if the whole bubble sits inside the viewport,
   leaving `pad` breathing room on every side */
function isSafe(p, br, vw, vh, pad) {
  return p.left >= pad - 1e-9 &&
    p.top >= pad - 1e-9 &&
    p.left + br.width + pad <= vw + 1e-9 &&
    p.top + br.height + pad <= vh + 1e-9;
}

test('bubble below the target stays in view', () => {
  const { computePlacement } = loadTutorial();
  const rect = { left: 60, top: 80, width: 120, height: 40, right: 180, bottom: 120 };
  const br = { width: 340, height: 160 };
  const p = host(computePlacement(rect, br, 1200, 800, 16, 14));
  assert.ok(isSafe(p, br, 1200, 800, 16), 'bubble fully inside viewport');
  // enough room below, so prefer placing it under the spot
  assert.ok(p.top >= rect.bottom + 14 - 1e-9);
});

test('target near the bottom puts the bubble above, not off-screen', () => {
  // regression: a target low in the right-hand panel had room to the left,
  // so the old code placed the bubble there with top = target top and its
  // bottom dropped below the viewport
  const { computePlacement } = loadTutorial();
  const rect = { left: 820, top: 720, width: 200, height: 44, right: 1020, bottom: 764 };
  const br = { width: 340, height: 160 };
  const p = host(computePlacement(rect, br, 1200, 800, 16, 14));
  assert.ok(isSafe(p, br, 1200, 800, 16), 'bubble fully inside viewport');
  assert.ok(p.top + br.height + 16 <= 800 + 1e-9, 'bubble bottom above the viewport edge');
  // with no room below it must end up above the target
  assert.ok(p.top + br.height + 14 <= rect.top + 1e-9);
});

test('target near the right edge never overflows horizontally', () => {
  const { computePlacement } = loadTutorial();
  const rect = { left: 1040, top: 100, width: 140, height: 40, right: 1180, bottom: 140 };
  const br = { width: 340, height: 160 };
  const p = host(computePlacement(rect, br, 1200, 800, 16, 14));
  assert.ok(isSafe(p, br, 1200, 800, 16), 'bubble fully inside viewport');
  assert.ok(p.left + br.width + 16 <= 1200 + 1e-9, 'bubble right edge inside the viewport');
});

test('even a very long bubble on a short viewport is kept on-screen', () => {
  const { computePlacement } = loadTutorial();
  const rect = { left: 40, top: 40, width: 100, height: 20, right: 140, bottom: 60 };
  const br = { width: 340, height: 260 }; // taller than a 320px viewport can fit with pad
  const vw = 700, vh = 320, pad = 16;
  const p = host(computePlacement(rect, br, vw, vh, pad, 14));
  // it cannot fit vertically with pad, but must still be clamped to the top
  // edge and never pushed entirely off-screen
  assert.ok(p.left >= pad - 1e-9 && p.top >= pad - 1e-9);
  assert.ok(p.top <= vh - br.height - 1e-9 || p.top <= pad + 1e-9);
});

test('step list includes a Tracing-feature step targeting the header button', () => {
  const { STEPS } = loadTutorial();
  const steps = host(STEPS);
  const trace = steps.find((s) => /trace/i.test(s.title) || s.target === '#btn-project');
  assert.ok(trace, 'a tracing step is present');
  assert.equal(trace.target, '#btn-project');
  assert.ok(/trace/i.test(trace.title));
});

test('every step targets a selector that exists in the app shell', () => {
  const { STEPS } = loadTutorial();
  const html = readFileSync(resolve(__dirname, '..', 'src', 'index.html'), 'utf8');
  const steps = host(STEPS);
  for (const s of steps) {
    const sel = s.target;
    // strip a leading combinator/class to a usable fragment check for shell-only
    const frag = sel.replace(/^[.#]/, '');
    assert.ok(sel && sel.length > 1, 'step has a target');
    // simple check: the id/class fragment (or the whole static selector) is
    // present somewhere in the shell markup
    const probe = sel.includes(' ') ? sel.split(' ').pop() : sel;
    const token = probe.replace(/^[.#]/, '');
    assert.ok(
      html.includes(`id="${token}"`) || html.includes(`class="${token}"`) || html.includes(token),
      `target "${sel}" present in index.html`
    );
  }
});
