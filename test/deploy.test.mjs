/*
   Pixel Palette - deploy script unit test
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Exercises the pure parts of scripts/deploy.mjs: settings parsing and
   provenance, the shared-bucket prefix guard, and the exact aws argument lists.

   The argument lists matter most. A wrong --include/--exclude set does not fail:
   every sync runs with --delete, so getting them wrong deletes objects - our own
   assets, or a sibling project's site, since the bucket is shared.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normaliseKey, readSettings, readSettingsFiles, parseArgs, guardPrefix,
  planCommands, invalidationArgs, pickSetting, PREFIX_DEFAULT, VERSION_FILE, MANIFEST,
  MANIFEST_TYPE, ASSET_CACHE, VOLATILE_CACHE,
} from '../scripts/deploy.mjs';

function withTmp(files) {
  const dir = mkdtempSync(join(tmpdir(), 'pp-deploy-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

test('normaliseKey accepts both spellings, case-insensitively', () => {
  for (const k of ['bucket', 'BUCKET', 'PixelPalette_S3_Bucket', 'export PIXELPALETTE_S3_BUCKET']) {
    assert.equal(normaliseKey(k), 'bucket', k);
  }
  assert.equal(normaliseKey(' prefix '), 'prefix');
  assert.equal(normaliseKey('PIXELPALETTE_S3_PREFIX'), 'prefix');
  assert.equal(normaliseKey('PIXELPALETTE_CLOUDFRONT_DISTRIBUTION_ID'), 'distribution');
  assert.equal(normaliseKey('something_else'), null);
});

test('readSettings parses both file styles, comments, blanks and quotes', () => {
  const dir = withTmp({
    'f.txt': '# a comment\n\nbucket = util.awltux.trade\nPIXELPALETTE_S3_PREFIX = "pixelpalette/child"\n',
  });
  try {
    const r = readSettings(join(dir, 'f.txt'));
    assert.equal(r.settings.bucket, 'util.awltux.trade');
    assert.equal(r.settings.prefix, 'pixelpalette/child', 'spaces and quotes tolerated');
    assert.deepEqual(r.warnings, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unknown key warns (a .env holds other things) but a malformed line fails', () => {
  const dir = withTmp({ 'ok.txt': 'SOME_OTHER_TOOL=x\n', 'bad.txt': 'bucket util.awltux.trade\n' });
  try {
    const ok = readSettings(join(dir, 'ok.txt'));
    assert.deepEqual(ok.settings, {});
    assert.equal(ok.warnings.length, 1);
    assert.match(ok.warnings[0], /unrecognised/);
    assert.throws(() => readSettings(join(dir, 'bad.txt')), /bad\.txt:1: expected/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a missing settings file is not an error', () => {
  const r = readSettings(join(tmpdir(), 'pp-does-not-exist-12345.txt'));
  assert.deepEqual(r.settings, {});
  assert.deepEqual(r.warnings, []);
});

test('later settings files win, and each value keeps its provenance', () => {
  const dir = withTmp({
    'deploy.txt': 'bucket=from-deploy\nprefix=pixelpalette\n',
    '.env': 'PIXELPALETTE_S3_BUCKET=from-env\n',
  });
  try {
    const r = readSettingsFiles([join(dir, 'deploy.txt'), join(dir, '.env')]);
    assert.equal(r.settings.bucket, 'from-env', '.env overrides deploy.txt');
    assert.equal(r.settings.prefix, 'pixelpalette', 'deploy.txt still contributes');
    assert.equal(r.source.bucket, join(dir, '.env'));
    assert.equal(r.source.prefix, join(dir, 'deploy.txt'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an empty value counts as unset, so it cannot shadow a real one', () => {
  const dir = withTmp({ 'deploy.txt': 'bucket=real-bucket\n', '.env': 'PIXELPALETTE_S3_BUCKET=\n' });
  try {
    const r = readSettingsFiles([join(dir, 'deploy.txt'), join(dir, '.env')]);
    assert.equal(r.settings.bucket, 'real-bucket');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('parseArgs reads flags and both key forms', () => {
  const { flags, opts } = parseArgs(['--dryrun', '--bucket', 'b', '--prefix=p', '--no-delete']);
  assert.ok(flags.has('dryrun'));
  assert.ok(flags.has('no-delete'));
  assert.equal(opts.bucket, 'b');
  assert.equal(opts.prefix, 'p');
});

test('the prefix guard refuses anything that could delete a sibling site', () => {
  assert.equal(guardPrefix(PREFIX_DEFAULT), null);
  assert.equal(guardPrefix('pixelpalette/staging'), null);
  // the bucket root holds the util.awltux.trade site itself: never allowed
  assert.match(guardPrefix(''), /empty/);
  assert.match(guardPrefix('', { allowForeign: true }), /empty/, 'not even with the escape hatch');
  // siblings sharing this bucket
  for (const sibling of ['dancingsquared_book', 'boardscore', 'ultimatelists', 'PREProtocolCompanion']) {
    assert.match(guardPrefix(sibling), /not under/, sibling);
  }
  // a near-miss must not slip through
  assert.match(guardPrefix('pixelpalette2'), /not under/);
  // the escape hatch exists, and is explicit
  assert.equal(guardPrefix('boardscore', { allowForeign: true }), null);
});

test('the cached pass excludes every file that must revalidate', () => {
  const [assets] = planCommands({ site: 'dist', dest: 's3://b/pixelpalette/', del: true });
  const excludes = assets.args.filter((a, i) => assets.args[i - 1] === '--exclude');
  assert.deepEqual(excludes, ['*.html', 'sw.js', VERSION_FILE, MANIFEST]);
  assert.ok(assets.args.includes(ASSET_CACHE));
  assert.ok(!assets.args.includes('--include'), 'the asset pass narrows nothing');
});

test('the volatile pass is scoped so --delete cannot reach the assets', () => {
  const [, volatile] = planCommands({ site: 'dist', dest: 's3://b/pixelpalette/', del: true });
  assert.equal(volatile.args[volatile.args.indexOf('--exclude') + 1], '*', 'exclude all first');
  const includes = volatile.args.filter((a, i) => volatile.args[i - 1] === '--include');
  assert.deepEqual(includes, ['*.html', 'sw.js']);
  assert.ok(!includes.includes(VERSION_FILE), 'the probe is uploaded separately, last');
  assert.ok(volatile.args.includes(VOLATILE_CACHE));
});

test('the manifest gets its real Content-Type and the probe goes last', () => {
  const cmds = planCommands({ site: 'dist', dest: 's3://b/pixelpalette/', del: true });
  assert.equal(cmds.length, 4);
  const [assets, volatile, manifest, version] = cmds;
  assert.ok(manifest.args.includes(MANIFEST_TYPE), 'manifest content type');
  assert.ok(manifest.args.some((a) => a.endsWith('/' + MANIFEST)), 'destination key');
  assert.ok(manifest.args.some((a) => a.endsWith(MANIFEST) && !a.startsWith('s3:')), 'source path');
  assert.ok(version.args.some((a) => a.endsWith('/' + VERSION_FILE)), 'destination key');
  assert.equal(version.args[version.args.length - 1], VOLATILE_CACHE);
  // the probe must be the final write, so it is the last thing to go live
  assert.equal(cmds[cmds.length - 1], version);
  assert.ok(assets.args.includes('--delete'));
  assert.ok(volatile.args.includes('--delete'));
  assert.ok(!version.args.includes('--delete'), 's3 cp never deletes');
});

test('--no-delete removes --delete from the syncs only', () => {
  const on = planCommands({ site: 'dist', dest: 's3://b/p/', del: true });
  assert.ok(on[0].args.includes('--delete'));
  assert.ok(on[1].args.includes('--delete'));
  const off = planCommands({ site: 'dist', dest: 's3://b/p/', del: false });
  assert.ok(!off[0].args.includes('--delete'));
  assert.ok(!off[1].args.includes('--delete'));
});

test('pickSetting follows flag -> environment -> file, reporting provenance', () => {
  const settings = { bucket: 'from-file', prefix: 'pixelpalette' };
  const source = { bucket: '/repo/.env', prefix: '/repo/deploy.txt' };
  const base = { opts: {}, env: {}, settings, source };
  // from a settings file: the provenance must be that file's PATH, not the map
  // (returning the map printed "[object Object]" in the banner)
  let r = pickSetting('bucket', 'PIXELPALETTE_S3_BUCKET', '', base);
  assert.equal(r.value, 'from-file');
  assert.equal(r.source, '/repo/.env');
  // the real environment wins over the file
  r = pickSetting('bucket', 'PIXELPALETTE_S3_BUCKET', '', { ...base, env: { PIXELPALETTE_S3_BUCKET: 'from-env' } });
  assert.equal(r.value, 'from-env');
  assert.equal(r.source, 'PIXELPALETTE_S3_BUCKET');
  // a flag wins over both
  r = pickSetting('bucket', 'PIXELPALETTE_S3_BUCKET', '', {
    ...base, env: { PIXELPALETTE_S3_BUCKET: 'from-env' }, opts: { bucket: 'from-flag' },
  });
  assert.equal(r.value, 'from-flag');
  assert.equal(r.source, '--bucket');
  // an empty flag falls through rather than blanking the file's value
  r = pickSetting('bucket', 'PIXELPALETTE_S3_BUCKET', '', { ...base, opts: { bucket: '' } });
  assert.equal(r.value, 'from-file');
  // nothing anywhere -> the fallback, with no provenance to print
  r = pickSetting('bucket', 'PIXELPALETTE_S3_BUCKET', 'fallback', {});
  assert.equal(r.value, 'fallback');
  assert.equal(r.source, null);
});

test('the invalidation covers the whole project prefix', () => {
  assert.deepEqual(
    invalidationArgs('E1A3YTJ09ZE0BD', 'pixelpalette'),
    ['cloudfront', 'create-invalidation', '--distribution-id', 'E1A3YTJ09ZE0BD',
      '--paths', '/pixelpalette/*'],
  );
});
