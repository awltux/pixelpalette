/*
   Pixel Palette - load smoke test
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Loads every browser source file in the exact order the app shell loads
   them, in a sandbox with document.readyState = 'loading' (so deferred boot
   work is not run), and asserts each module registers its expected global.
   This proves the concatenation order is intact and no module throws at
   parse/load time under a browser-like environment.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSandbox, runSource } from './helpers/env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = () => resolve(__dirname, '..', 'src', 'index.html');
const readText = (p) => readFileSync(p, 'utf8');

// mirrors the <script src="js/..."> order in src/index.html
const ORDER = [
  'i18n.js',
  'consent.js',
  'disclaimer.js',
  'color.js',
  'palettes.js',
  'demo-image.js',
  'image-loader.js',
  'canvas.js',
  'reticle.js',
  'readout.js',
  'mixing.js',
  'gamut.js',
  'gamut-filter.js',
  'mix-ui.js',
  'history.js',
  'palette-editor.js',
  'fit-palette.js',
  'tutorial.js',
  'tracing.js',
  'app.js',
];

test('all source modules load in order without throwing', () => {
  const sandbox = createSandbox();
  assert.doesNotThrow(() => {
    for (const file of ORDER) runSource(sandbox, file);
  });
});

test('expected globals are registered after load', () => {
  const sandbox = createSandbox();
  for (const file of ORDER) runSource(sandbox, file);
  const w = sandbox;
  assert.equal(typeof w.I18N, 'object');
  assert.equal(typeof w.I18N.t, 'function');
  assert.equal(typeof w.Color, 'object');
  assert.equal(typeof w.Mixing, 'object');
  assert.equal(typeof w.Palettes, 'object');
  assert.equal(typeof w.DemoImage.generate, 'function');
  assert.equal(typeof w.CP, 'object');
  for (const mod of ['Canvas', 'Reticle', 'Readout', 'MixUI', 'Gamut', 'GamutFilter', 'History', 'PaletteEditor', 'FitPalette', 'Tutorial', 'Consent', 'Disclaimer', 'ImageLoader']) {
    assert.ok(w.CP[mod], `CP.${mod}`);
  }
  assert.equal(typeof w.CP.Tracing, 'object', 'CP.Tracing');
  assert.equal(typeof w.CP.Tracing.init, 'function');
  assert.equal(typeof w.CP.Tracing.__internal.computeFit, 'function');
  // app.js sets up shared state (blurFilter is attached in boot(), which is
  // deferred because readyState stays 'loading' in this sandbox)
  assert.ok(w.CP.state, 'CP.state');
});

test('the documented script order matches src/index.html', () => {
  const html = readText(htmlPath());
  const tags = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.equal(tags.length, ORDER.length);
  assert.deepEqual(tags, ORDER);
});
