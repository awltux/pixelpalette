/*
   Pixel Palette - gamut-filter.js tests
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshCore, createSandbox, runSource, host } from './helpers/env.mjs';

const paints = [
  { hex: '#e32600', name: 'red', strength: 1.2, opacity: 90, undertone: '#e32600' },
  { hex: '#0b5e97', name: 'blue', strength: 1.3, opacity: 70, undertone: '#0b5e97' },
  { hex: '#f6c900', name: 'yellow', strength: 1.0, opacity: 90, undertone: '#f6c900' },
  { hex: '#ffffff', name: 'white', strength: 1.0, opacity: 100, undertone: '#ffffff' },
];
const medium = { type: 'opaque', paper: '#f7f3e9', opacity: 0.95 };

/* Load gamut-filter into a module-enabled sandbox seeded with the core
   globals; returns the sandbox so both the public API (CP.GamutFilter) and
   the internals (module.exports.__internal) plus CP.Gamut/Color are usable. */
function loadGamutFilter() {
  const core = freshCore();
  // fresh sandbox with `module` present from creation and the core globals
  // seeded, so gamut-filter's module.exports guard fires (exposes __internal)
  // while CP.Gamut / Color are still available via the window-global path.
  const sandbox = createSandbox(null, {
    globals: { Color: core.Color, Mixing: core.Mixing, Palettes: core.Palettes, I18N: core.I18N, CP: core.CP },
    module: { exports: {} },
  });
  runSource(sandbox, 'gamut-filter.js');
  sandbox.__internal = sandbox.module.exports.__internal;
  return sandbox;
}

function boundary(sandbox) {
  return sandbox.CP.Gamut.compute(paints, medium).pals;
}

test('exposes internals and the public API', () => {
  const sandbox = loadGamutFilter();
  for (const fn of ['clipPixel', 'paletteSig', 'hueAnchors']) {
    assert.equal(typeof sandbox.__internal[fn], 'function', fn);
  }
  assert.equal(typeof sandbox.CP.GamutFilter.isOn, 'function');
});

test('paletteSig is deterministic and distinguishes palettes', () => {
  const sandbox = loadGamutFilter();
  const { paletteSig } = sandbox.__internal;
  assert.equal(paletteSig(paints, medium), paletteSig(paints, medium));
  assert.notEqual(paletteSig(paints, medium), paletteSig(paints.slice(0, 3), medium));
  assert.ok(paletteSig(paints, medium).includes('opaque'));
});

test('clipPixel returns valid bytes and leaves in-range colours unchanged', () => {
  const sandbox = loadGamutFilter();
  const { clipPixel } = sandbox.__internal;
  const pals = boundary(sandbox);
  const grey = clipPixel(128, 128, 128, pals, null);
  assert.deepEqual(host(grey), { r: 128, g: 128, b: 128 }); // neutral is inside
  for (const p of [grey]) for (const v of [p.r, p.g, p.b]) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
});

test('clipPixel converges (is idempotent)', () => {
  const sandbox = loadGamutFilter();
  const { clipPixel } = sandbox.__internal;
  const pals = boundary(sandbox);
  const once = clipPixel(0, 255, 0, pals, null);
  const twice = clipPixel(once.r, once.g, once.b, pals, null);
  assert.deepEqual(host(once), host(twice));
});

test('clipPixel pulls an out-of-range colour inside the palette', () => {
  const sandbox = loadGamutFilter();
  const { clipPixel } = sandbox.__internal;
  const pals = boundary(sandbox);
  const Gamut = sandbox.CP.Gamut;
  const green = { r: 0, g: 255, b: 0 };
  assert.equal(Gamut.pointInside(paints, medium, green), false, 'precondition: green out of range');
  const clipped = clipPixel(green.r, green.g, green.b, pals, null);
  assert.notDeepEqual(host(clipped), green, 'colour should change');
  assert.equal(Gamut.pointInside(paints, medium, clipped), true, 'clipped colour should be inside');
});
