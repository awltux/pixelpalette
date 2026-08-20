/*
   Pixel Palette - gamut.js tests
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshCore } from './helpers/env.mjs';

const sandbox = freshCore();
const Gamut = sandbox.CP.Gamut;
const Color = sandbox.Color;

/* a small, fast-to-compute palette */
const paints = [
  { hex: '#e32600', name: 'red', strength: 1.2, opacity: 90, undertone: '#e32600' },
  { hex: '#0b5e97', name: 'blue', strength: 1.3, opacity: 70, undertone: '#0b5e97' },
  { hex: '#f6c900', name: 'yellow', strength: 1.0, opacity: 90, undertone: '#f6c900' },
  { hex: '#ffffff', name: 'white', strength: 1.0, opacity: 100, undertone: '#ffffff' },
];
const medium = { type: 'opaque', paper: '#f7f3e9', opacity: 0.95 };

test('exposes expected constants and helpers', () => {
  assert.equal(Gamut.HUE_STEPS, 72);
  assert.equal(Gamut.L_BANDS.length, 5);
  for (const fn of ['compute', 'pointInside', 'boundaryAt', 'hueIndex', 'render', 'positionOf']) {
    assert.equal(typeof Gamut[fn], 'function', fn);
  }
});

test('compute returns all boundary fields with sane ranges', () => {
  const data = Gamut.compute(paints, medium);
  assert.equal(data.srgb.length, 72);
  assert.equal(data.cmyk.length, 72);
  assert.equal(data.pal.length, 72);
  assert.equal(data.pals.length, 5 * 72);
  assert.ok(data.srgbMax > 0);
  for (const v of [data.coverageRGB, data.coverageCMYK]) {
    assert.ok(v >= 0 && v <= 1, `coverage ${v} in [0,1]`);
  }
});

test('compute is deterministic and cached', () => {
  const a = Gamut.compute(paints, medium);
  const b = Gamut.compute(paints, medium);
  assert.deepEqual(Array.from(a.pal), Array.from(b.pal));
});

test('hueIndex maps 0..360 onto 0..71', () => {
  for (let h = 0; h < 360; h += 17) {
    const i = Gamut.hueIndex(h);
    assert.ok(i >= 0 && i < 72);
  }
});

test('boundaryAt returns a finite boundary', () => {
  const data = Gamut.compute(paints, medium);
  for (const L of [20, 40, 60, 80, 100]) {
    for (let h = 0; h < 360; h += 45) {
      const v = Gamut.boundaryAt(data.pals, L, Gamut.hueIndex(h));
      assert.ok(Number.isFinite(v) && v >= 0, `boundary at L=${L} h=${h} = ${v}`);
    }
  }
});

test('neutral colours are inside the palette boundary', () => {
  assert.equal(Gamut.pointInside(paints, medium, { r: 128, g: 128, b: 128 }), true);
  assert.equal(Gamut.pointInside(paints, medium, { r: 255, g: 255, b: 255 }), true);
  assert.equal(Gamut.pointInside(paints, medium, { r: 0, g: 0, b: 0 }), true);
});

test('pointInside accepts hex strings and returns a boolean', () => {
  const r = Gamut.pointInside(paints, medium, '#888888');
  assert.equal(typeof r, 'boolean');
  // a saturated colour far from this small palette is out of range
  assert.equal(Gamut.pointInside(paints, medium, { r: 0, g: 255, b: 0 }), false);
});
