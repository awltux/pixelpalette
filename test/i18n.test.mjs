/*
   Pixel Palette - i18n.js tests
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox, runSource, host } from './helpers/env.mjs';

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
