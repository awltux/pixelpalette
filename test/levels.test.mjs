/*
   Pixel Palette - levels (tonal-zone view) unit test
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Exercises the pure zone maths in src/js/levels.js: the five even luminance
   windows and the recolouring pass that builds the display view. The canvas
   plumbing around it is not reachable here.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox, runSource, host } from './helpers/env.mjs';

function loadLevels() {
  const s = createSandbox();
  runSource(s, 'i18n.js');
  runSource(s, 'levels.js');
  return s.CP.Levels.__internal;
}

test('zoneOf splits the luminance range into five even windows', () => {
  const { zoneOf } = loadLevels();
  assert.equal(zoneOf(0), 0);
  assert.equal(zoneOf(0.19), 0);
  assert.equal(zoneOf(0.2), 1);
  assert.equal(zoneOf(0.39), 1);
  assert.equal(zoneOf(0.4), 2);
  assert.equal(zoneOf(0.59), 2);
  assert.equal(zoneOf(0.6), 3);
  assert.equal(zoneOf(0.79), 3);
  assert.equal(zoneOf(0.8), 4);
  assert.equal(zoneOf(1), 4);
  // defensive: bad input lands in the darkest window instead of returning NaN,
  // which would index the tone ramp out of range
  assert.equal(zoneOf(-1), 0);
  assert.equal(zoneOf(NaN), 0);
  assert.equal(zoneOf(undefined), 0);
});

test('the zone tone ramp runs dark to light and has one tone per zone', () => {
  const { ZONE_GREY, ZONES } = loadLevels();
  const greys = host(ZONE_GREY);
  assert.equal(greys.length, ZONES);
  for (let i = 1; i < greys.length; i++) {
    assert.ok(greys[i] > greys[i - 1], `zone ${i} must be lighter than zone ${i - 1}`);
  }
});

test('zoneView posterises each zone and highlights the selected window', () => {
  const { zoneView, ZONE_GREY, HILITE } = loadLevels();
  const greys = host(ZONE_GREY);
  const hi = host(HILITE);
  // one opaque pixel per zone, chosen to land in zones 0..4
  const src = new Uint8ClampedArray([
    20, 20, 20, 255,
    77, 77, 77, 255,
    128, 128, 128, 255,
    179, 179, 179, 255,
    240, 240, 240, 255,
  ]);
  const before = Array.from(src);
  const out = zoneView(src, 2);
  assert.equal(out.length, src.length, 'same shape as the source');
  for (let p = 0; p < 5; p++) {
    const o = p * 4;
    const px = [out[o], out[o + 1], out[o + 2]];
    if (p === 2) assert.deepEqual(px, hi, 'the selected window is highlighted');
    else assert.deepEqual(px, [greys[p], greys[p], greys[p]], `zone ${p} uses its flat tone`);
    assert.equal(out[o + 3], 255, 'alpha is preserved');
  }
  assert.deepEqual(Array.from(src), before, 'the source buffer is not modified');
  // stepping the window highlights a different zone
  const other = zoneView(src, 4);
  assert.deepEqual([other[16], other[17], other[18]], hi, 'the top window highlights the lightest pixel');
  assert.deepEqual([other[8], other[9], other[10]], [greys[2], greys[2], greys[2]]);
});

test('zoneView decides by luminance, and out-of-window pixels go flat grey', () => {
  const { zoneView, ZONE_GREY, HILITE } = loadLevels();
  const greys = host(ZONE_GREY);
  const hi = host(HILITE);
  // two very different colours whose luminance lands in the same window
  const src = new Uint8ClampedArray([0, 180, 0, 255, 255, 60, 0, 255]);
  const out = zoneView(src, 2);
  assert.deepEqual([out[0], out[1], out[2]], hi, 'the green lands in the mid window');
  assert.deepEqual([out[4], out[5], out[6]], hi, 'so does the red');
  // with another window selected, colour never leaks through: both collapse to
  // the flat tone of the zone their luminance falls in
  const other = zoneView(src, 0);
  for (const o of [0, 4]) {
    assert.equal(other[o], other[o + 1], 'a zone tone is flat grey');
    assert.equal(other[o + 1], other[o + 2], 'a zone tone is flat grey');
    assert.notDeepEqual([other[o], other[o + 1], other[o + 2]], hi, 'not highlighted');
  }
  assert.equal(other[0], greys[2], 'both use the mid zone tone');
});
