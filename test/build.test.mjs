/*
   Pixel Palette - build verification test
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Rebuilds the single-file bundle into dist/ and verifies it is a valid,
   self-contained index.html: CSS and favicon inlined, JS bundled in one
   script, no external references, and the bundle is syntactically valid.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const OUT = resolve(DIST, 'index.html');

const count = (s, needle) => s.split(needle).length - 1;

test('build produces a non-empty index.html in dist/', () => {
  build();
  assert.ok(statSync(OUT).size > 0);
});

test('SEO files (robots.txt, sitemap.xml) are copied into dist/', () => {
  for (const f of ['robots.txt', 'sitemap.xml']) {
    const p = resolve(DIST, f);
    assert.ok(statSync(p).isFile(), `${f} present in dist/`);
    assert.ok(readFileSync(p, 'utf8').length > 0, `${f} non-empty`);
  }
});

const html = readFileSync(OUT, 'utf8');

test('CSS is inlined into one <style>, no external stylesheet', () => {
  assert.equal(count(html, '<style>'), 1);
  assert.ok(!html.includes('href="css/app.css"'));
});

test('favicon is inlined as a data URI, no external assets', () => {
  assert.ok(html.includes('data:image/svg+xml;base64,'));
  assert.ok(!html.includes('href="assets/'));
});

test('JS is bundled inline with no external script tags', () => {
  assert.ok(!html.includes('<script src="js/'));
  assert.ok(html.includes('\n<script>\n'));
});

test('app shell/DOM is intact', () => {
  assert.ok(html.includes('id="app-main"'));
  assert.ok(html.includes('<canvas id="canvas"'));
});

test('the inlined JS bundle is syntactically valid', () => {
  const start = html.lastIndexOf('\n<script>\n') + '\n<script>\n'.length;
  const end = html.lastIndexOf('</script>');
  const js = html.slice(start, end);
  assert.ok(js.length > 0);
  // compile without executing (the IIFE bundle is a valid function body)
  assert.doesNotThrow(() => new Function(js));
});
