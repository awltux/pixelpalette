/*
   Pixel Palette - fit-palette.js tests
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox, runSource, loadCore, host } from './helpers/env.mjs';

function loadFit(sandbox) {
  loadCore(sandbox);
  runSource(sandbox, 'fit-palette.js');
  return sandbox.CP.FitPalette;
}

/* a deterministic, colour-rich pixel sample */
const PIXELS = [
  { r: 205, g: 45, b: 30 }, { r: 215, g: 55, b: 45 }, { r: 195, g: 40, b: 25 },
  { r: 30, g: 60, b: 205 }, { r: 35, g: 65, b: 190 }, { r: 25, g: 55, b: 215 },
  { r: 250, g: 250, b: 240 }, { r: 240, g: 245, b: 250 }, { r: 245, g: 240, b: 235 },
];

test('fitPaints returns the requested number of distinct paints and a coverage', () => {
  const sandbox = createSandbox();
  const Fit = loadFit(sandbox);
  const candidates = sandbox.Palettes.get('oil').paints;
  const { paints, coverage } = Fit.fitPaints(candidates, PIXELS, 5);
  assert.ok(paints.length >= 1 && paints.length <= 5);
  assert.equal(new Set(paints.map((p) => p.hex.toUpperCase())).size, paints.length, 'no duplicate hexes');
  assert.ok(coverage >= 0 && coverage <= 100, `coverage ${coverage}`);
});

test('fitPaints is deterministic', () => {
  const sandbox = createSandbox();
  const Fit = loadFit(sandbox);
  const candidates = sandbox.Palettes.get('oil').paints;
  const a = Fit.fitPaints(candidates, PIXELS, 6);
  const b = Fit.fitPaints(candidates, PIXELS, 6);
  assert.deepEqual(a.paints.map((p) => p.name), b.paints.map((p) => p.name));
  assert.equal(a.coverage, b.coverage);
});

test('fitPaints caps at the candidate count', () => {
  const sandbox = createSandbox();
  const Fit = loadFit(sandbox);
  const candidates = sandbox.Palettes.get('pencil').paints.slice(0, 4);
  const { paints } = Fit.fitPaints(candidates, PIXELS, 10);
  assert.ok(paints.length <= 4);
});

test('fitPaints with no paints returns empty', () => {
  const sandbox = createSandbox();
  const Fit = loadFit(sandbox);
  assert.deepEqual(host(Fit.fitPaints([], PIXELS, 4)), { paints: [], coverage: 0 });
});

test('fitPaints with no pixels returns empty', () => {
  const sandbox = createSandbox();
  const Fit = loadFit(sandbox);
  const candidates = sandbox.Palettes.get('oil').paints;
  assert.deepEqual(host(Fit.fitPaints(candidates, [], 4)), { paints: [], coverage: 0 });
});

test('a larger fit does not reduce coverage', () => {
  const sandbox = createSandbox();
  const Fit = loadFit(sandbox);
  const candidates = sandbox.Palettes.get('oil').paints;
  const single = Fit.fitPaints(candidates, PIXELS, 1).coverage;
  const large = Fit.fitPaints(candidates, PIXELS, 8).coverage;
  assert.ok(large >= single - 0.5, `coverage should not shrink: ${large} < ${single}`);
});

test('chosen paints are a subset of the candidates', () => {
  const sandbox = createSandbox();
  const Fit = loadFit(sandbox);
  const candidates = sandbox.Palettes.get('oil').paints;
  const hexes = new Set(candidates.map((p) => p.hex.toUpperCase()));
  const { paints } = Fit.fitPaints(candidates, PIXELS, 4);
  for (const p of paints) assert.ok(hexes.has(p.hex.toUpperCase()), p.name);
});
