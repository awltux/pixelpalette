/*
   Pixel Palette - color.js tests
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshCore, host } from './helpers/env.mjs';

const sandbox = freshCore();
const Color = sandbox.Color;

/* tolerances for float round-trips */
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ~ ${b}`);
const nearObj = (got, want, eps = 1e-6) => {
  for (const k of Object.keys(want)) near(got[k], want[k], eps);
};
const closeRgb = (got, want, tol = 2) => nearObj(got, want, tol);

test('hexToRgb parses 6-digit, shorthand and leading-# forms', () => {
  assert.deepEqual(host(Color.hexToRgb('#FF0000')), { r: 255, g: 0, b: 0 });
  assert.deepEqual(host(Color.hexToRgb('00ff00')), { r: 0, g: 255, b: 0 });
  assert.deepEqual(host(Color.hexToRgb('#0f0')), { r: 0, g: 255, b: 0 });
  assert.deepEqual(host(Color.hexToRgb('#0000FF')), { r: 0, g: 0, b: 255 });
});

test('hexToRgb rejects invalid input with {0,0,0}', () => {
  assert.deepEqual(host(Color.hexToRgb('#zzz')), { r: 0, g: 0, b: 0 });
  assert.deepEqual(host(Color.hexToRgb('#12345')), { r: 0, g: 0, b: 0 });
  assert.deepEqual(host(Color.hexToRgb('')), { r: 0, g: 0, b: 0 });
  assert.deepEqual(host(Color.hexToRgb(null)), { r: 0, g: 0, b: 0 });
});

test('rgbToHex lowercases, pads and clamps to 0..255', () => {
  assert.equal(Color.rgbToHex(255, 0, 0), '#ff0000');
  assert.equal(Color.rgbToHex(0, 0, 255), '#0000ff');
  assert.equal(Color.rgbToHex(300, -5, 0), '#ff0000');
  assert.equal(Color.rgbToHex(0, 128, 255), '#0080ff');
});

test('rgb<->hex round trip', () => {
  const samples = [
    [255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 0, 0], [255, 255, 255],
    [128, 64, 32], [17, 34, 51], [200, 150, 100],
  ];
  for (const [r, g, b] of samples) {
    const hex = Color.rgbToHex(r, g, b);
    assert.deepEqual(host(Color.hexToRgb(hex)), { r, g, b }, hex);
  }
});

test('rgbToHsl known values', () => {
  assert.deepEqual(host(Color.rgbToHsl(255, 0, 0)), { h: 0, s: 100, l: 50 });
  assert.deepEqual(host(Color.rgbToHsl(0, 255, 0)), { h: 120, s: 100, l: 50 });
  assert.deepEqual(host(Color.rgbToHsl(0, 0, 255)), { h: 240, s: 100, l: 50 });
  assert.deepEqual(host(Color.rgbToHsl(255, 255, 255)), { h: 0, s: 0, l: 100 });
  assert.deepEqual(host(Color.rgbToHsl(0, 0, 0)), { h: 0, s: 0, l: 0 });
  assert.deepEqual(host(Color.rgbToHsl(128, 128, 128)), { h: 0, s: 0, l: 50 });
});

test('hsl<->rgb round trip', () => {
  for (let h = 0; h < 360; h += 30) {
    for (const [s, l] of [[100, 50], [50, 40], [0, 50], [80, 70]]) {
      const { r, g, b } = Color.hslToRgb(h, s, l);
      const back = Color.rgbToHsl(r, g, b);
      if (s > 0) {
        const dh = Math.min(Math.abs(back.h - h), 360 - Math.abs(back.h - h));
        assert.ok(dh <= 1, `h ${h} -> ${back.h}`);
      }
      assert.ok(Math.abs(back.s - s) <= 1, `s ${s} -> ${back.s}`);
      assert.ok(Math.abs(back.l - l) <= 1, `l ${l} -> ${back.l}`);
    }
  }
});

test('hslToRgb primary hues', () => {
  assert.deepEqual(host(Color.hslToRgb(0, 100, 50)), { r: 255, g: 0, b: 0 });
  assert.deepEqual(host(Color.hslToRgb(120, 100, 50)), { r: 0, g: 255, b: 0 });
  assert.deepEqual(host(Color.hslToRgb(240, 100, 50)), { r: 0, g: 0, b: 255 });
  assert.deepEqual(host(Color.hslToRgb(0, 0, 100)), { r: 255, g: 255, b: 255 });
});

test('rgbToCmyk known values', () => {
  assert.deepEqual(host(Color.rgbToCmyk(255, 0, 0)), { c: 0, m: 100, y: 100, k: 0 });
  assert.deepEqual(host(Color.rgbToCmyk(0, 0, 0)), { c: 0, m: 0, y: 0, k: 100 });
  assert.deepEqual(host(Color.rgbToCmyk(255, 255, 255)), { c: 0, m: 0, y: 0, k: 0 });
  assert.deepEqual(host(Color.rgbToCmyk(0, 255, 0)), { c: 100, m: 0, y: 100, k: 0 });
});

test('linear/rgb round trip and sRGB gamma', () => {
  const samples = [[0, 0, 0], [255, 255, 255], [128, 64, 32], [17, 34, 51], [240, 10, 10]];
  for (const [r, g, b] of samples) {
    const lin = Color.rgbToLinear(r, g, b);
    closeRgb(Color.linearToRgb(lin.r, lin.g, lin.b), { r, g, b }, 1);
  }
  // black / white map exactly
  assert.deepEqual(host(Color.rgbToLinear(0, 0, 0)), { r: 0, g: 0, b: 0 });
  near(Color.rgbToLinear(255, 255, 255).r, 1);
});

test('Lab <-> RGB round trip', () => {
  const samples = [[255, 0, 0], [0, 0, 255], [128, 64, 32], [200, 150, 100], [0, 0, 0], [255, 255, 255]];
  for (const [r, g, b] of samples) {
    const lab = Color.rgbToLab(r, g, b);
    closeRgb(Color.labToRgb(lab.L, lab.a, lab.b), { r, g, b }, 2);
  }
});

test('deltaE: identical colours are 0, different colours positive', () => {
  assert.equal(Color.deltaE({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 }), 0);
  assert.ok(Color.deltaE({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) > 0);
  assert.ok(Color.deltaE({ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }) > Color.deltaE({ r: 255, g: 0, b: 0 }, { r: 250, g: 5, b: 5 }));
  // symmetric
  assert.equal(
    Color.deltaE({ r: 1, g: 2, b: 3 }, { r: 4, g: 5, b: 6 }),
    Color.deltaE({ r: 4, g: 5, b: 6 }, { r: 1, g: 2, b: 3 })
  );
});

test('rainbow is deterministic and returns valid colours', () => {
  assert.deepEqual(host(Color.rainbow(2, 10)), host(Color.rainbow(2, 10)));
  const { r, g, b } = Color.rainbow(0, 8);
  for (const v of [r, g, b]) assert.ok(v >= 0 && v <= 255);
});
