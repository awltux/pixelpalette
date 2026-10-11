#!/usr/bin/env node
/*
   Pixel Palette - publish the built app to S3 (and invalidate CloudFront)

   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Ported from the Dancing Squared book deployer (scripts/deploy-book.mjs in
   dancingsquared), which is the same approach proven on this host: one bucket
   serves the whole of util.awltux.trade and each project owns a prefix.

   Wraps the AWS CLI rather than reimplementing SigV4, so `aws` must be on PATH
   and authenticated (`aws configure`, SSO, or the usual AWS_* environment
   variables).

   What it does, in order:
     1. checks the built site exists (run `npm run build` first)
     2. checks the AWS CLI is installed and the caller is authenticated
     3. bulk-syncs every asset with a one-hour cache header
     4. re-syncs the volatile files (*.html, sw.js) with `no-cache`, so a new
        build is actually seen - a long-cached sw.js or page would pin readers
        to the old one
     5. re-uploads manifest.webmanifest with the correct Content-Type, because
        the CLI's extension map does not always know `.webmanifest` and a
        manifest served as application/octet-stream can stop the PWA installing
     6. uploads version.json LAST, with `no-cache`
     7. invalidates the CloudFront distribution

   Two deviations from the book's script, both deliberate:

     - version.json is uploaded last, after the shell. It is the "this build is
       live" marker: the running app compares its own stamped hash against it,
       and that check is a bare inequality with no ordering. Uploaded before the
       shell, it tells every open client that an update exists while the update
       is not there yet, and the reload it offers cannot clear the banner.

     - the manifest is EXCLUDED from the bulk pass rather than uploaded wrong and
       corrected afterwards, so no request can ever catch it as
       application/octet-stream.

   The two sync passes are unavoidable: `aws s3 sync` applies a single
   --cache-control to the whole invocation, and mixing `no-cache` with a long
   max-age in one pass is not possible. Excludes are ordered so the second pass
   cannot delete the first pass's objects (`--delete` honours --include/--exclude).

   Usage:
     npm run deploy                                  # settings from .env / deploy.txt
     npm run deploy -- --dryrun                      # nothing is written
     npm run deploy -- --bucket other --prefix other_thing
     npm run deploy -- --no-delete                   # keep orphans in S3
     npm run deploy -- --allow-foreign-prefix        # opt out of the prefix guard

   Settings come from (highest first):
     1. --bucket / --prefix / --distribution / --config on the command line
     2. PIXELPALETTE_S3_BUCKET / PIXELPALETTE_S3_PREFIX /
        PIXELPALETTE_CLOUDFRONT_DISTRIBUTION_ID in the environment
     3. .env, then deploy.txt - `KEY=value` or `key = value` lines, `#` comments
        and blanks ignored. `.env` wins over deploy.txt, and both are optional.
        `.env` is gitignored, so this repo keeps the bucket and distribution id
        out of the public history; a committed deploy.txt works too, exactly as
        it does in the sibling projects.

   The banner prints where each value came from, so "why is it deploying there?"
   is answerable without reading this file.
*/

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');
export const SITE = resolve(ROOT, 'dist');

export const PREFIX_DEFAULT = 'pixelpalette';

// Files that must never be served from a long-lived cache.
//
// version.json belongs here and is the reason this script is not a plain
// `aws s3 sync`: it is the update probe. An hour-old copy is not merely stale
// news - the banner would either miss a real update or, worse, announce one that
// a reload cannot deliver, because the page the reader is looking at is the old
// build and the probe says otherwise. It costs one small file being revalidated.
export const VOLATILE = ['*.html', 'sw.js'];
export const VERSION_FILE = 'version.json';
export const MANIFEST = 'manifest.webmanifest';
export const MANIFEST_TYPE = 'application/manifest+json';

// Everything not volatile. Kept modest (1 hour) rather than `immutable`, because
// nothing here is content-hashed: index.html is one unhashed file and the icons
// reuse their names across releases, so a forever-cache would strand readers.
export const ASSET_CACHE = 'public, max-age=3600';
export const VOLATILE_CACHE = 'no-cache';

const SETTINGS = ['bucket', 'prefix', 'distribution'];

/** The settings a repo can keep: `KEY=value` or `key = value`, case-insensitive. */
export function normaliseKey(raw) {
  const k = String(raw).trim().replace(/^export\s+/i, '').toLowerCase();
  if (k === 'bucket' || k === 'pixelpalette_s3_bucket') return 'bucket';
  if (k === 'prefix' || k === 'pixelpalette_s3_prefix') return 'prefix';
  if (k === 'distribution' || k === 'pixelpalette_cloudfront_distribution_id') return 'distribution';
  return null;
}

/**
 * Read one settings file. Malformed lines fail with the file and line (a typo
 * should not be silently ignored); unknown keys only warn, because `.env` is a
 * general-purpose file that may legitimately hold unrelated variables.
 * Returns { settings, warnings }.
 */
export function readSettings(path) {
  const settings = {};
  const warnings = [];
  if (!existsSync(path)) return { settings, warnings };
  readFileSync(path, 'utf8').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 1) {
      throw new Error(`${path}:${i + 1}: expected "KEY=value" or "key = value", got "${line}"`);
    }
    const key = normaliseKey(line.slice(0, eq));
    let value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!key) {
      warnings.push(`${path}:${i + 1}: ignoring unrecognised setting "${line.slice(0, eq).trim()}"`);
      return;
    }
    settings[key] = value;
  });
  return { settings, warnings };
}

/** Merge settings files in order, later files winning, keeping provenance. */
export function readSettingsFiles(paths) {
  const settings = {};
  const source = {};
  const warnings = [];
  for (const p of paths) {
    const r = readSettings(p);
    warnings.push(...r.warnings);
    for (const k of Object.keys(r.settings)) {
      if (r.settings[k] === '') continue;
      settings[k] = r.settings[k];
      source[k] = p;
    }
  }
  return { settings, source, warnings };
}

/**
 * Resolve one setting: flag, then real environment, then the settings files.
 * `source` must be the provenance MAP (key -> file path), not a path itself -
 * returning the map instead is a bug this function exists to prevent, since the
 * banner then prints "[object Object]" and the value's origin is lost.
 * An empty flag or an empty file value counts as unset, so it falls through
 * rather than blanking a value that another source does provide.
 */
export function pickSetting(name, envName, fallback, { opts = {}, env = {}, settings = {}, source = {} } = {}) {
  if (opts[name] !== undefined && opts[name] !== '') return { value: opts[name], source: '--' + name };
  const fromEnv = env[envName];
  if (fromEnv !== undefined && String(fromEnv).trim()) {
    return { value: String(fromEnv).trim(), source: envName };
  }
  if (settings[name]) return { value: settings[name], source: source[name] || null };
  return { value: fallback, source: null };
}

export function parseArgs(argv) {
  const flags = new Set();
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      opts[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        opts[name] = next;
        i++;
      } else {
        flags.add(name);
      }
    }
  }
  return { flags, opts };
}

/**
 * The prefix guard. The bucket is SHARED with the site root and the other
 * projects in this workspace (boardscore, dancingsquared_book, ultimatelists,
 * PREProtocolCompanion), and every sync runs with `--delete`, so a mistyped or
 * empty prefix does not fail - it deletes someone else's site. An allow-list
 * rooted at our own prefix is used rather than a deny-list of siblings, because
 * a deny-list goes stale the moment a project is added.
 *
 * Returns an error string, or null when the prefix is acceptable.
 */
export function guardPrefix(prefix, { allowForeign = false } = {}) {
  if (!prefix) {
    return 'the prefix is empty, which would sync over the whole bucket root and delete the site that lives there. This cannot be overridden.';
  }
  if (prefix === PREFIX_DEFAULT || prefix.startsWith(PREFIX_DEFAULT + '/')) return null;
  if (allowForeign) return null;
  return `the prefix "${prefix}" is not under "${PREFIX_DEFAULT}/", but this bucket is shared with the ` +
    'other sites on this host. Pass --allow-foreign-prefix if you really mean it.';
}

/**
 * The exact `aws` invocations, in order. Pure so the test suite can pin the
 * --include/--exclude sets: a wrong set here is what would silently delete
 * assets or a sibling project's objects instead of failing loudly.
 */
export function planCommands({ site = SITE, dest, del = true } = {}) {
  const sync = ['s3', 'sync', site, dest];
  if (del) sync.push('--delete');
  const excluded = [...VOLATILE, VERSION_FILE, MANIFEST];

  return [
    {
      label: 'assets (1 hour cache)',
      args: [...sync, '--cache-control', ASSET_CACHE,
        ...excluded.flatMap((g) => ['--exclude', g])],
    },
    {
      // `--exclude '*'` first, then the volatile set: only those are in scope,
      // so --delete cannot reach the assets uploaded above.
      label: 'pages and the service worker (no-cache)',
      args: [...sync, '--cache-control', VOLATILE_CACHE, '--exclude', '*',
        ...VOLATILE.flatMap((g) => ['--include', g])],
    },
    {
      label: `manifest (${MANIFEST_TYPE})`,
      args: ['s3', 'cp', resolve(site, MANIFEST), dest + MANIFEST,
        '--content-type', MANIFEST_TYPE, '--cache-control', VOLATILE_CACHE],
    },
    {
      // last on purpose: the update probe is the "this build is live" marker
      label: 'update probe (uploaded last)',
      args: ['s3', 'cp', resolve(site, VERSION_FILE), dest + VERSION_FILE,
        '--content-type', 'application/json; charset=utf-8', '--cache-control', VOLATILE_CACHE],
    },
  ];
}

/**
 * The CloudFront invalidation for a prefix. Pure and exported so the test suite
 * pins it: a purge that is too narrow leaves readers on a stale asset, which is
 * the failure this whole step exists to prevent.
 */
export function invalidationArgs(distribution, prefix) {
  return ['cloudfront', 'create-invalidation', '--distribution-id', distribution,
    '--paths', `/${prefix}/*`];
}

const USAGE = `
Publish the built app to S3.

  npm run deploy -- [options]

Options:
  --bucket <name>            target S3 bucket              (env PIXELPALETTE_S3_BUCKET)
  --prefix <key>             key prefix                    (env PIXELPALETTE_S3_PREFIX, default ${PREFIX_DEFAULT})
  --distribution <id>        CloudFront distribution       (env PIXELPALETTE_CLOUDFRONT_DISTRIBUTION_ID)
  --config <path>            extra settings file           (default: deploy.txt then .env)
  --no-delete                keep objects in S3 that no longer exist in the build
  --allow-foreign-prefix     permit a prefix outside ${PREFIX_DEFAULT}/
  --dryrun                   pass --dryrun to the aws calls (nothing is written)
  --help                     show this message
`;

function fail(message) {
  console.error(`\n  error: ${message}\n`);
  process.exit(1);
}

function aws(args, { dryrun, supportsDryrun = true }) {
  // NOT EVERY AWS COMMAND HAS `--dryrun`. `s3 sync` and `s3 cp` do, and theirs is
  // a REAL dry run - it lists and prints every object it would write. `cloudfront
  // create-invalidation` does not, and passing it made the whole dry run exit 1
  // with a usage error after a clean listing, which reads as "the deploy is
  // broken" at the worst moment. For those the command is PRINTED and not run.
  if (dryrun && !supportsDryrun) {
    console.log(`(dryrun) would run: aws ${args.join(' ')}`);
    return;
  }
  const full = dryrun ? [...args, '--dryrun'] : args;
  const r = spawnSync('aws', full, { stdio: 'inherit' });
  if (r.error) {
    if (r.error.code === 'ENOENT') {
      fail('the AWS CLI (`aws`) is not on PATH. Install AWS CLI v2, then run `aws configure`.');
    }
    fail(`could not run the AWS CLI: ${r.error.message}`);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const { flags, opts } = parseArgs(argv);
  if (flags.has('help')) {
    console.log(USAGE);
    return;
  }

  const defaultFiles = [resolve(ROOT, 'deploy.txt'), resolve(ROOT, '.env')];
  const files = opts.config ? [resolve(opts.config)] : defaultFiles;
  let loaded;
  try {
    loaded = readSettingsFiles(files);
  } catch (err) {
    fail(err.message);
  }
  for (const w of loaded.warnings) console.log(`  note: ${w}`);
  const { settings, source } = loaded;

  // flag, then environment, then the settings files - the same order the book
  // deployer uses, so "where does this value come from?" has one answer
  const pick = (name, envName, fallback) =>
    pickSetting(name, envName, fallback, { opts, env, settings, source });

  const bucketPick = pick('bucket', 'PIXELPALETTE_S3_BUCKET', '');
  const prefixPick = pick('prefix', 'PIXELPALETTE_S3_PREFIX', PREFIX_DEFAULT);
  const prefix = (prefixPick.value || '').replace(/^\/+|\/+$/g, '');
  const distPick = pick('distribution', 'PIXELPALETTE_CLOUDFRONT_DISTRIBUTION_ID', '');
  const distribution = distPick.value;
  const dryrun = flags.has('dryrun');
  const del = !flags.has('no-delete');

  const from = (p) => {
    if (!p) return '';
    const shown = p === resolve(ROOT, '.env') ? '.env'
      : p === resolve(ROOT, 'deploy.txt') ? 'deploy.txt' : p;
    return ` (from ${shown})`;
  };

  if (!bucketPick.value) {
    fail('no bucket given. Pass --bucket <name>, set PIXELPALETTE_S3_BUCKET, or put ' +
      `bucket = <name> in ${defaultFiles.map((p) => p.replace(ROOT + '\\', '')).join(' or ')}.`);
  }
  const guard = guardPrefix(prefix, { allowForeign: flags.has('allow-foreign-prefix') });
  if (guard) fail(guard);
  if (!distribution) {
    fail('no CloudFront distribution given. Invalidation is not optional here: assets carry a ' +
      'one-hour cache and their names are not content-hashed, so an un-invalidated deploy can serve ' +
      'a mixture of two builds. Pass --distribution <id>, set ' +
      'PIXELPALETTE_CLOUDFRONT_DISTRIBUTION_ID, or put `distribution = <id>` in the settings file.');
  }
  if (!existsSync(SITE) || !statSync(SITE).isDirectory()) {
    fail(`no built site at ${SITE}. Run \`npm run build\` first.`);
  }
  if (!existsSync(resolve(SITE, 'index.html'))) {
    fail(`${SITE} has no index.html - it does not look like a built site. Run \`npm run build\`.`);
  }
  if (!existsSync(resolve(SITE, VERSION_FILE))) {
    fail(`${SITE} has no ${VERSION_FILE}, so the update check would be broken for every reader. ` +
      'Run `npm run build` (the build writes it).');
  }

  const bucket = bucketPick.value;
  const dest = `s3://${bucket}/${prefix}/`;

  console.log('\n  Pixel Palette - publish to S3');
  console.log(`  from : ${SITE}`);
  console.log(`  to   : ${dest}${from(bucketPick.source)}`);
  console.log(`  probe: ${prefix}/${VERSION_FILE}${from(prefixPick.source)}`);
  console.log(`  cf   : ${distribution}${from(distPick.source)}`);
  console.log(`  mode : ${dryrun ? 'DRY RUN (nothing written)' : del ? 'sync with --delete' : 'sync (no delete)'}`);
  console.log('');

  // --- authenticated? --------------------------------------------------------
  aws(['sts', 'get-caller-identity', '--output', 'text'], { dryrun: false });

  const cmds = planCommands({ site: SITE, dest, del });
  cmds.forEach((c, i) => {
    console.log(`\n  [${i + 1}/${cmds.length + 1}] syncing ${c.label} ...`);
    aws(c.args, { dryrun });
  });

  console.log(`\n  [${cmds.length + 1}/${cmds.length + 1}] invalidating CloudFront ...`);
  // A PURGE OF THE WHOLE PREFIX IS LOAD-BEARING, not a nicety: assets carry a
  // one-hour cache and their names are not content-hashed, so an un-invalidated
  // deploy can hand a reader a mixture of two builds.
  aws(
    invalidationArgs(distribution, prefix),
    { dryrun, supportsDryrun: false }
  );

  console.log(dryrun ? '\n  Dry run finished. Nothing was written.\n' : '\n  Done.\n');
}

// not when imported by the test suite
const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    fail(err && err.message ? err.message : String(err));
  }
}
