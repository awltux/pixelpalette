/*
   Pixel Palette - i18n.js tests
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createSandbox, runSource, host, JS_DIR } from './helpers/env.mjs';

const SRC = resolve(JS_DIR, '..');

/* Every key the shell or a script actually asks for: data-i18n / data-i18n-attr
   in index.html, plus the first string literal of each I18N.t(...) call (which
   also covers ternaries like I18N.t(a ? 'x' : 'y')). */
function usedKeys() {
  const keys = new Set();
  const html = readFileSync(resolve(SRC, 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(',')) {
      const i = pair.indexOf(':');
      if (i >= 0) keys.add(pair.slice(i + 1).trim());
    }
  }
  for (const f of readdirSync(JS_DIR)) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(join(JS_DIR, f), 'utf8');
    for (const call of src.matchAll(/I18N\.t\(([^)]*)/g)) {
      for (const k of call[1].matchAll(/'([A-Za-z][A-Za-z0-9_.]*)'/g)) keys.add(k[1]);
    }
  }
  return keys;
}

function loadI18n(sandbox) {
  runSource(sandbox, 'i18n.js');
  return sandbox.I18N;
}

test('registers English as the only locale and resolves it', () => {
  const sandbox = createSandbox();
  const I18N = loadI18n(sandbox);
  assert.deepEqual(host(I18N.codes), ['en']);
  assert.equal(I18N.lang(), 'en');
});

test('t returns known strings', () => {
  const sandbox = createSandbox();
  const I18N = loadI18n(sandbox);
  assert.equal(I18N.t('appName'), 'Pixel Palette');
  assert.equal(I18N.t('btnTheme'), 'Theme');
  assert.equal(I18N.t('deltaE'), 'ΔE');
});

test('t falls back to the key for unknown strings', () => {
  const sandbox = createSandbox();
  const I18N = loadI18n(sandbox);
  assert.equal(I18N.t('no.such.key'), 'no.such.key');
});

test('t interpolates {vars}', () => {
  const sandbox = createSandbox();
  const I18N = loadI18n(sandbox);
  assert.equal(I18N.t('mixWarningTip', { band: 'difficult' }), 'Mix difficulty: difficult');
  assert.equal(I18N.t('fitCoverage', { count: 8, pct: 42 }), '8 paints · covers 42% of image colours within ΔE 12');
});

test('every key the shell or the scripts ask for exists in the table', () => {
  const sandbox = createSandbox();
  const I18N = loadI18n(sandbox);
  // t() returns the key itself when it is unknown
  const missing = [...usedKeys()].filter((k) => I18N.t(k) === k).sort();
  assert.deepEqual(missing, [], 'keys used but not defined in TABLE.en');
});

test('t replaces every occurrence of a var', () => {
  const sandbox = createSandbox();
  const I18N = loadI18n(sandbox);
  assert.equal(I18N.t('mixRestoreMissing', { list: 'X, Y' }), 'Paints no longer in this palette: X, Y.');
});

test('apply() runs against the DOM without throwing', () => {
  const sandbox = createSandbox();
  const I18N = loadI18n(sandbox);
  assert.doesNotThrow(() => I18N.apply());
});

test('detect honours a saved language key', () => {
  const sandbox = createSandbox();
  sandbox.localStorage.setItem('pp.lang', 'en');
  const I18N = loadI18n(sandbox);
  assert.equal(I18N.lang(), 'en');
});
