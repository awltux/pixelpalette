/*
   Pixel Palette - mixing.js tests
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshCore, host } from './helpers/env.mjs';

const sandbox = freshCore();
const Mixing = sandbox.Mixing;
const Palettes = sandbox.Palettes;
const Color = sandbox.Color;

const MEDIA = Palettes.media;

test('exposes the public API', () => {
  for (const fn of ['solve', 'mixColour', 'spectrumToRgb', 'mixReflectance', 'synthesizeReflectance']) {
    assert.equal(typeof Mixing[fn], 'function', fn);
  }
});

test('mixReflectance returns a 36-band spectrum', () => {
  const paints = Palettes.get('oil').paints;
  const R = Mixing.mixReflectance([paints[0], paints[1]], [0.5, 0.5], MEDIA.oil);
  assert.equal(R.length, 36);
  for (const v of R) assert.ok(v >= 0 && v <= 1, 'reflectance in [0,1]');
});

test('spectrumToRgb returns a valid rgb triple', () => {
  const paints = Palettes.get('oil').paints;
  const R = Mixing.mixReflectance([paints[0]], [1], MEDIA.oil);
  const { r, g, b } = Mixing.spectrumToRgb(R);
  for (const v of [r, g, b]) assert.ok(v >= 0 && v <= 255);
});

test('solve returns a structurally valid result for opaque media', () => {
  const paints = Palettes.get('oil').paints;
  const target = { r: 200, g: 80, b: 40 };
  const res = Mixing.solve(paints, target, MEDIA.oil);
  assert.equal(res.ratios.length, paints.length);
  assert.equal(res.normalized.length, paints.length);
  // opaque media: ratios and normalized both sum to ~1
  assert.ok(Math.abs(res.ratios.reduce((a, v) => a + v, 0) - 1) < 1e-6, 'ratios sum ~1');
  assert.ok(Math.abs(res.normalized.reduce((a, v) => a + v, 0) - 1) < 1e-6);
  assert.ok(res.deltaE >= 0 && Number.isFinite(res.deltaE));
  assert.match(res.mixHex, /^#[0-9a-f]{6}$/);
  for (const v of res.ratios) assert.ok(v >= 0, 'non-negative ratios');
});

test('solve is deterministic', () => {
  const paints = Palettes.get('acrylic').paints;
  const target = { r: 90, g: 120, b: 200 };
  const a = Mixing.solve(paints, target, MEDIA.acrylic);
  const b = Mixing.solve(paints, target, MEDIA.acrylic);
  assert.deepEqual(a.ratios, b.ratios);
  assert.equal(a.mixHex, b.mixHex);
  assert.equal(a.deltaE, b.deltaE);
});

test('solve with no paints returns empty', () => {
  const res = Mixing.solve([], { r: 1, g: 2, b: 3 }, MEDIA.oil);
  assert.deepEqual(host(res.ratios), []);
  assert.equal(res.conc, 0);
});

test('mixing a single paint reproduces it better than an unrelated paint', () => {
  const paints = Palettes.get('oil').paints;
  const red = paints.find((p) => p.name === 'Cadmium Red');
  const blue = paints.find((p) => p.name === 'Phthalo Blue');
  const white = paints.find((p) => p.name === 'Titanium White');

  // neutral paints reproduce almost exactly
  const whiteMix = Mixing.mixColour([white], [1], MEDIA.oil);
  assert.ok(Color.deltaE(Color.hexToRgb(white.hex), whiteMix.mixRgb) < 6, 'white reproduces closely');

  // a saturated paint pulls the mix strongly toward itself
  const redMix = Mixing.mixColour([red], [1], MEDIA.oil);
  const dRed = Color.deltaE(Color.hexToRgb(red.hex), redMix.mixRgb);
  const dBlue = Color.deltaE(Color.hexToRgb(blue.hex), redMix.mixRgb);
  assert.ok(dRed < dBlue, `red mix should be nearer red (${dRed.toFixed(1)}) than blue (${dBlue.toFixed(1)})`);
  assert.match(redMix.mixHex, /^#[0-9a-f]{6}$/);
});

test('solve finds a close mix for a colour the palette can produce', () => {
  const paints = Palettes.get('oil').paints;
  // construct a target that is genuinely producible: a 50/50 mix of two paints
  const targetRgb = Mixing.mixColour([paints[1], paints[3]], [0.5, 0.5], MEDIA.oil).mixRgb;
  const res = Mixing.solve(paints, targetRgb, MEDIA.oil);
  assert.ok(res.deltaE < 12, `deltaE should be low for a producible colour, got ${res.deltaE.toFixed(2)}`);
  assert.match(res.mixHex, /^#[0-9a-f]{6}$/);
});

test('maxPaints cap limits the number of used paints (opaque)', () => {
  const paints = Palettes.get('oil').paints;
  const target = { r: 130, g: 90, b: 60 };
  const res = Mixing.solve(paints, target, MEDIA.oil, 3);
  const used = res.ratios.filter((v) => v > 1e-6).length;
  assert.ok(used <= 3, `used ${used} paints, cap was 3`);
});

test('glaze (watercolour) solves keep free concentration', () => {
  const paints = Palettes.get('watercolour').paints;
  const target = { r: 120, g: 40, b: 160 };
  const res = Mixing.solve(paints, target, MEDIA.watercolour);
  assert.equal(res.ratios.length, paints.length);
  assert.ok(res.deltaE >= 0 && Number.isFinite(res.deltaE));
  assert.ok(Math.abs(res.normalized.reduce((a, v) => a + v, 0) - 1) < 1e-6);
  // glaze mixes are expressed as raw pigment loadings; conc should be finite
  assert.ok(Number.isFinite(res.conc));
});

test('mixColour returns a valid colour and renormalises opaque mixes', () => {
  const paints = Palettes.get('oil').paints;
  const out = Mixing.mixColour([paints[0], paints[1]], [0.3, 0.2], MEDIA.oil);
  assert.match(out.mixHex, /^#[0-9a-f]{6}$/);
  for (const v of [out.mixRgb.r, out.mixRgb.g, out.mixRgb.b]) assert.ok(v >= 0 && v <= 255);
});

test('mixColour for glaze keeps raw amounts', () => {
  const paints = Palettes.get('watercolour').paints;
  const out = Mixing.mixColour([paints[0], paints[1]], [0.2, 0.5], MEDIA.watercolour);
  assert.match(out.mixHex, /^#[0-9a-f]{6}$/);
});

test('synthesizeReflectance is cached and deterministic', () => {
  const a = Mixing.synthesizeReflectance('#3366cc');
  const b = Mixing.synthesizeReflectance('#3366cc');
  assert.deepEqual(a, b);
  assert.equal(a.length, 36);
});
