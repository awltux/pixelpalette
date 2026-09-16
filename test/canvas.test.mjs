/*
   Pixel Palette - main canvas gesture maths
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Exercises the pure two-finger pinch maths in src/js/canvas.js. The DOM and
   pointer plumbing around it is not reachable here, but the coordinate-space
   invariant that a pinch depends on is - and that is where the bug was: the
   pan delta combined a client-space midpoint with a canvas-relative one, so
   every pinch event panned by the canvas's left offset and the image walked
   off-screen to the right.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox, runSource, host } from './helpers/env.mjs';

function loadCanvas() {
  const s = createSandbox();
  runSource(s, 'i18n.js');
  runSource(s, 'canvas.js');
  return s.CP.Canvas.__internal;
}

// a canvas offset like the real page: sidebar plus header
const RECT = { left: 312, top: 84 };
const FLAT = { left: 0, top: 0 };
const PTS = (ax, ay, bx, by) => [{ x: ax, y: ay }, { x: bx, y: by }];

test('the first pinch move establishes an anchor and moves nothing', () => {
  const { pinchStep } = loadCanvas();
  const first = host(pinchStep(PTS(400, 300, 600, 500), RECT, null));
  assert.equal(first.factor, 1);
  assert.equal(first.dx, 0);
  assert.equal(first.dy, 0);
  assert.equal(first.mid.x, 500 - RECT.left, 'the anchor is canvas-relative');
  assert.equal(first.mid.y, 400 - RECT.top);
});

test('a symmetric pinch scales without panning, whatever the canvas offset', () => {
  const { pinchStep } = loadCanvas();
  const first = host(pinchStep(PTS(400, 300, 600, 500), RECT, null));
  // fingers move apart about the same midpoint: a pure scale gesture
  const next = host(pinchStep(PTS(380, 280, 620, 520), RECT, first));
  assert.equal(next.dx, 0, 'a symmetric pinch must not pan horizontally');
  assert.equal(next.dy, 0, 'a symmetric pinch must not pan vertically');
  assert.ok(next.factor > 1, 'and it must scale up');
  assert.ok(Math.abs(next.factor - (Math.hypot(240, 240) / Math.hypot(200, 200))) < 1e-9);
});

test('the pan delta is the midpoint movement, independent of the offset', () => {
  const { pinchStep } = loadCanvas();
  // both fingers move 30px right and 12px down: the midpoint moves exactly that
  const start = host(pinchStep(PTS(400, 300, 600, 500), RECT, null));
  const moved = host(pinchStep(PTS(430, 312, 630, 512), RECT, start));
  assert.ok(Math.abs(moved.dx - 30) < 1e-9, `expected 30, got ${moved.dx}`);
  assert.ok(Math.abs(moved.dy - 12) < 1e-9, `expected 12, got ${moved.dy}`);
  assert.ok(Math.abs(moved.factor - 1) < 1e-9, 'a pure drag does not scale');
  // the same gesture with no canvas offset must report identical movement
  const startFlat = host(pinchStep(PTS(400, 300, 600, 500), FLAT, null));
  const movedFlat = host(pinchStep(PTS(430, 312, 630, 512), FLAT, startFlat));
  assert.equal(moved.dx, movedFlat.dx, 'the pan delta must not depend on rect.left');
  assert.equal(moved.dy, movedFlat.dy, 'the pan delta must not depend on rect.top');
  assert.equal(moved.factor, movedFlat.factor, 'nor must the scale factor');
});

test('degenerate input is inert rather than NaN', () => {
  const { pinchStep } = loadCanvas();
  // both fingers at the same point: no distance to divide by
  const zero = host(pinchStep(PTS(500, 400, 500, 400), RECT, null));
  assert.equal(zero.dist, 0);
  const next = host(pinchStep(PTS(500, 400, 500, 400), RECT, zero));
  assert.equal(next.factor, 1, 'a zero previous distance must not produce Infinity');
  assert.equal(next.dx, 0);
  assert.equal(next.dy, 0);
});
