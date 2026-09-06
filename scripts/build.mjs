/*
   Pixel Palette - build script
   Copyright (C) 2026 Awltux Limited

   Licensed under the GNU Affero General Public License, version 3.

   Bundles the sources in src/ into a single, self-contained index.html
   written to dist/. Zero runtime/build dependencies (Node only).

   What it does:
   - inlines css/app.css into a <style> tag
   - inlines assets/favicon.svg as a base64 data URI
   - concatenates every js/*.js in the same order the source HTML loads
     them and inlines the result into a single <script> tag
   - copies any other top-level static files from src/ (robots.txt,
     sitemap.xml, etc.) into dist/ so they ship with the deliverable

   The JS sources are ordered plain-script IIFEs that attach themselves to
   window (CP / I18N / Color / Mixing / Gamut), so concatenating them in
   DOM order preserves the app's runtime behaviour exactly.
*/

import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');
const DIST = resolve(ROOT, 'dist');

// Exact strings used by the source HTML for each asset/script.
const STYLE_TAG = '<link rel="stylesheet" href="css/app.css">';
const FAVICON_ATTR = 'href="assets/favicon.svg"';
const SCRIPT_RE = /<script src="js\/([^"]+)"><\/script>/g;

function build() {
  const html = readFileSync(resolve(SRC, 'index.html'), 'utf8');

  // --- inline CSS ---
  const css = readFileSync(resolve(SRC, 'css/app.css'), 'utf8');
  if (!html.includes(STYLE_TAG)) throw new Error('Could not find the CSS link tag to inline.');
  let out = html.replace(STYLE_TAG, `<style>\n${css}\n</style>`);

  // --- inline favicon ---
  const favicon = readFileSync(resolve(SRC, 'assets/favicon.svg'), 'utf8');
  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(favicon).toString('base64');
  if (!out.includes(FAVICON_ATTR)) throw new Error('Could not find the favicon link tag to inline.');
  out = out.replace(FAVICON_ATTR, `href="${dataUri}"`);

  // --- concatenate + inline JS in the source script order ---
  const scriptFiles = [];
  for (const m of out.matchAll(SCRIPT_RE)) scriptFiles.push(m[1]);
  if (!scriptFiles.length) throw new Error('No script tags found to bundle.');
  const js = scriptFiles
    .map((f) => readFileSync(resolve(SRC, 'js', f), 'utf8'))
    .join('\n');

  // drop every individual <script src="js/..."> tag, then insert one inline script before </body>
  out = out.replace(/\s*<script src="js\/[^"]+"><\/script>/g, '');
  const bodyClose = out.lastIndexOf('</body>');
  if (bodyClose === -1) throw new Error('Could not find </body> to insert the bundle.');
  out = out.slice(0, bodyClose) + `\n<script>\n${js}\n</script>\n` + out.slice(bodyClose);

  // --- write the single-file build to dist/ ---
  mkdirSync(DIST, { recursive: true });
  const dest = resolve(DIST, 'index.html');
  writeFileSync(dest, out, 'utf8');
  const sizeKb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);

  // --- copy top-level static files (SEO: robots.txt, sitemap.xml, ...) ---
  let copied = 0;
  for (const name of readdirSync(SRC)) {
    const from = resolve(SRC, name);
    if (!statSync(from).isFile()) continue; // dirs (css/, js/, assets/) are handled above
    if (name === 'index.html') continue;    // the bundle itself was written already
    copyFileSync(from, resolve(DIST, name));
    copied++;
  }

  const extra = copied ? ` + ${copied} static file(s)` : '';
  console.log(`Built ${dest} (${sizeKb} KB, ${scriptFiles.length} JS files inlined${extra}).`);
}

export { build, DIST };

// Run the build only when executed directly (`node scripts/build.mjs`),
// not when imported by the test suite.
const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    build();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
