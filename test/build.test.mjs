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

test('CSS is inlined (no external stylesheet) with only the app + no-JS guard <style>', () => {
  // the app stylesheet is inlined, plus a tiny <noscript><style> guard that
  // hides the boot splash when JavaScript is disabled
  assert.ok(!html.includes('href="css/app.css"'));
  assert.equal(count(html, '<style>'), 2);
  assert.ok(html.includes('.boot-overlay'));
  assert.ok(html.includes('<noscript><style>#boot-overlay'));
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

test('Info dialog shows the git build hash, not the placeholder', () => {
  const m = html.match(/<p class="info-build">build=<span id="info-build-hash">([^<]+)<\/span><\/p>/);
  assert.ok(m, 'Info build line is present in the built HTML');
  assert.ok(m[1] && /^[0-9a-f]{7}$/i.test(m[1]), `hash stamped (got "${m[1]}")`);
  assert.ok(!html.includes('__GIT_SHA__'), 'no placeholder remains in the bundle');
});

test('the inlined JS bundle is syntactically valid', () => {
  const start = html.lastIndexOf('\n<script>\n') + '\n<script>\n'.length;
  const end = html.lastIndexOf('</script>');
  const js = html.slice(start, end);
  assert.ok(js.length > 0);
  // compile without executing (the IIFE bundle is a valid function body)
  assert.doesNotThrow(() => new Function(js));
});
