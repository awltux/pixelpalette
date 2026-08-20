/*
   Pixel Palette - palettes.js tests
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox, loadCore, makeLocalStorage } from './helpers/env.mjs';

const sandbox = createSandbox();
loadCore(sandbox);
const Palettes = sandbox.Palettes;

/* a palettes module sharing a given localStorage (for persistence tests) */
function coreOver(shared) {
  const s = createSandbox(shared);
  loadCore(s);
  return s.Palettes;
}

const MEDIA_IDS = ['oil', 'acrylic', 'gouache', 'pencil', 'watercolour'];

test('all five built-in media palettes are listed', () => {
  const list = Palettes.list();
  const builtIn = list.filter((p) => !p.custom).map((p) => p.id);
  for (const id of MEDIA_IDS) assert.ok(builtIn.includes(id), id);
});

test('default selected palette is oil', () => {
  assert.equal(Palettes.getSelected(), 'oil');
});

test('get returns paints, medium, label and custom=false for built-ins', () => {
  const info = Palettes.get('oil');
  assert.equal(info.custom, false);
  assert.equal(info.label, 'Oil');
  assert.equal(info.medium.type, 'opaque');
  assert.ok(Array.isArray(info.paints) && info.paints.length > 0);
  assert.equal(info.paints[0].name, 'Titanium White');
});

test('watercolour is a glazing medium', () => {
  assert.equal(Palettes.get('watercolour').medium.type, 'glaze');
  assert.equal(Palettes.get('pencil').medium.diluent, 'dry');
});

test('every built-in paint has the full paint model', () => {
  for (const id of MEDIA_IDS) {
    for (const p of Palettes.get(id).paints) {
      assert.match(p.hex, /^#[0-9a-fA-F]{6}$/, `${id}:${p.name}`);
      assert.ok(p.name, 'has name');
      assert.ok(p.strength > 0, `${p.name} strength`);
      assert.ok(p.opacity >= 0 && p.opacity <= 100);
      assert.ok(['I', 'II', 'III', 'IV'].includes(p.lightfast), p.lightfast);
      assert.equal(typeof p.enabled, 'boolean', `${p.name} enabled`);
      assert.equal(typeof p.toxic, 'boolean');
    }
  }
});

test('setPaints persists an override and survives reload', () => {
  const shared = makeLocalStorage();
  const P = coreOver(shared);
  const modified = P.get('oil').paints.slice(0, 3).map((p) => ({ ...p, name: p.name + ' X' }));
  P.setPaints('oil', modified);
  // a fresh module over the same storage proves persistence
  const got = coreOver(shared).get('oil').paints;
  assert.equal(got.length, modified.length);
  assert.equal(got[0].name, 'Titanium White X');
  assert.equal(shared.getItem('pp.palettes') !== null, true);
});

test('resetDefaults restores a built-in palette', () => {
  Palettes.setPaints('oil', Palettes.get('oil').paints.slice(0, 2));
  assert.equal(Palettes.get('oil').paints.length, 2);
  Palettes.resetDefaults('oil');
  assert.equal(Palettes.get('oil').paints.length, Palettes.defaults.oil.length);
});

test('duplicate creates an editable custom palette', () => {
  const cid = Palettes.duplicate('watercolour');
  assert.equal(cid, 'custom_1');
  assert.equal(Palettes.isCustom(cid), true);
  const info = Palettes.get(cid);
  assert.equal(info.custom, true);
  assert.equal(info.medium.type, 'glaze');
  assert.equal(info.paints.length, Palettes.get('watercolour').paints.length);
  assert.ok(Palettes.list().some((p) => p.id === cid && p.custom));
});

test('custom palettes persist across reloads', () => {
  const shared = makeLocalStorage();
  const P = coreOver(shared);
  P.duplicate('oil');
  assert.equal(coreOver(shared).isCustom('custom_1'), true);
});

test('createCustom and removeCustom round-trip', () => {
  const id = Palettes.createCustom('My Palette', Palettes.media.oil, [{ name: 'A', hex: '#123456', brand: '', strength: 1, opacity: 80, ci: '', lightfast: 'II', undertone: '#123456', granulating: false, staining: 'None', toxic: false, enabled: true }], 'oil');
  assert.equal(Palettes.isCustom(id), true);
  assert.equal(Palettes.get(id).label, 'My Palette');
  Palettes.removeCustom(id);
  assert.equal(Palettes.isCustom(id), false);
});

test('setLabel renames a custom palette', () => {
  const id = Palettes.createCustom('Original', Palettes.media.gouache, [], 'gouache');
  Palettes.setLabel(id, '  Renamed  ');
  assert.equal(Palettes.get(id).label, 'Renamed');
});

test('setSelected persists the choice', () => {
  const shared = makeLocalStorage();
  const P = coreOver(shared);
  P.setSelected('watercolour');
  assert.equal(coreOver(shared).getSelected(), 'watercolour');
});

test('get on an unknown id falls back to oil defaults', () => {
  const info = Palettes.get('nope');
  assert.equal(info.label, 'Oil');
  assert.equal(info.paints[0].name, 'Titanium White');
});

test('backfill fills missing fields from defaults', () => {
  const defs = Palettes.defaults.oil;
  const raw = [{ name: 'Titanium White', hex: '#ffffff' }];
  const filled = Palettes.defaultPaints ? null : null; // no-op guard
  // setPaints -> get runs backfill
  Palettes.setPaints('oil', raw);
  const p = Palettes.get('oil').paints[0];
  assert.equal(p.brand, 'W&N');
  assert.equal(p.strength, 1);
  assert.equal(p.lightfast, 'I');
  assert.equal(p.enabled, true);
  assert.equal(typeof p.toxic, 'boolean');
});
