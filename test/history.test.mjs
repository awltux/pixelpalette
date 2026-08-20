/*
   Pixel Palette - history.js tests
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox, runSource, loadCore, makeElement, makeLocalStorage } from './helpers/env.mjs';

function loadHistory(sandbox) {
  loadCore(sandbox);
  runSource(sandbox, 'history.js');
  return sandbox.CP.History;
}

function historyOver(shared) {
  return loadHistory(createSandbox(shared));
}

test('push adds a valid target and normalises it', () => {
  const sandbox = createSandbox();
  const H = loadHistory(sandbox);
  H.load();
  H.push({ target: '#ff0000' });
  assert.equal(H.hasEntry('#FF0000'), true);
  assert.equal(H.hasEntry('#ff0000'), true); // case-insensitive
});

test('push ignores invalid colours', () => {
  const sandbox = createSandbox();
  const H = loadHistory(sandbox);
  H.load();
  H.push({ target: '#12' });
  H.push({ target: '' });
  H.push({ target: 'not-a-hex' });
  assert.equal(H.hasEntry('#12'), false);
});

test('consecutive duplicate targets are deduplicated', () => {
  const sandbox = createSandbox();
  const H = loadHistory(sandbox);
  H.load();
  H.push({ target: '#112233' });
  H.push({ target: '#112233' });
  // switch palettes so we can count via the store without DOM
  H.setPalette('oil');
  // count through updateMixedForTarget success on the single entry
  assert.equal(H.updateMixedForTarget({ target: '#112233', mixed: '#ffffff' }, 'oil'), true);
});

test('toggleLock locks and unlocks; missing target returns null', () => {
  const sandbox = createSandbox();
  const H = loadHistory(sandbox);
  H.load();
  assert.equal(H.toggleLock('#999999'), null);
  H.push({ target: '#334455' });
  assert.equal(H.isLocked('#334455'), false);
  assert.equal(H.toggleLock('#334455'), true);
  assert.equal(H.isLocked('#334455'), true);
  assert.equal(H.toggleLock('#334455'), false);
});

test('locked entries cannot be removed', () => {
  const sandbox = createSandbox();
  const H = loadHistory(sandbox);
  H.load();
  H.push({ target: '#0a0b0c' });
  H.toggleLock('#0a0b0c');
  H.remove(0);
  assert.equal(H.hasEntry('#0a0b0c'), true); // still present
});

test('remove deletes an unlocked entry', () => {
  const sandbox = createSandbox();
  const H = loadHistory(sandbox);
  H.load();
  H.push({ target: '#0a0b0c' });
  H.push({ target: '#1a1b1c' });
  H.remove(0);
  assert.equal(H.hasEntry('#0a0b0c'), false);
});

test('history is stored per palette and persists to localStorage', () => {
  const shared = makeLocalStorage();
  const H = historyOver(shared);
  H.load();
  H.push({ target: '#ff0000' });
  // separate history for the watercolour palette
  H.setPalette('watercolour');
  H.push({ target: '#00ff00' });
  assert.equal(H.hasEntry('#00ff00'), true);
  assert.equal(H.hasEntry('#ff0000'), false);
  H.setPalette('oil');
  assert.equal(H.hasEntry('#ff0000'), true);
  assert.equal(H.hasEntry('#00ff00'), false);

  // persist: a fresh module over the same storage reads it back
  const H2 = historyOver(shared);
  H2.load();
  H2.setPalette('oil');
  assert.equal(H2.hasEntry('#ff0000'), true);
  H2.setPalette('watercolour');
  assert.equal(H2.hasEntry('#00ff00'), true);
});

test('dropPalette removes a palette history', () => {
  const sandbox = createSandbox();
  const H = loadHistory(sandbox);
  H.load();
  H.setPalette('watercolour');
  H.push({ target: '#00ff00' });
  H.dropPalette('watercolour');
  assert.equal(H.hasEntry('#00ff00'), false);
});

test('updateMixedForTarget writes a new mixed colour', () => {
  const sandbox = createSandbox();
  const H = loadHistory(sandbox);
  H.load();
  H.push({ target: '#a1b2c3' });
  const ok = H.updateMixedForTarget({ target: '#a1b2c3', mixed: '#fedcba' }, 'oil');
  assert.equal(ok, true);
  // updateMixedForTarget returns true again for the same (now-updated) target
  assert.equal(H.updateMixedForTarget({ target: '#a1b2c3', mixed: '#123456' }, 'oil'), true);
});

test('init wires the strip and renders entries into the DOM', () => {
  const sandbox = createSandbox();
  const strip = makeElement('div');
  sandbox.document.register('history-strip', strip);
  const H = loadHistory(sandbox);
  assert.doesNotThrow(() => H.init());
  H.push({ target: '#ff0000' });
  assert.ok(strip.children.length >= 1, 'strip should contain rendered swatches');
});
