/*
   Pixel Palette - build test
   Copyright (C) 2026 Awltux Limited

   Licensed under the GNU Affero General Public License, version 3.

   Rebuilds the single-file bundle and verifies that:
   - the build runs without error and writes root index.html
   - the CSS is inlined into a single <style>
   - the favicon is inlined as a data URI
   - no external js/ css/ assets/ references remain
   - the app shell/DOM is present
   - the inlined JS bundle is syntactically valid

   Run with: npm test
*/

import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'index.html');

let failures = 0;
function check(name, condition) {
  if (condition) {
    console.log(`  \u2713 ${name}`);
  } else {
    console.error(`  \u2717 ${name}`);
    failures += 1;
  }
}
function count(html, needle) {
  return html.split(needle).length - 1;
}

console.log('Rebuilding index.html...');
build();
console.log('Verifying the single-file bundle:\n');

const html = readFileSync(OUT, 'utf8');

// 1. build produced a non-empty index.html at the project root
check('root index.html exists and is non-empty', statSync(OUT).size > 0);

// 2. CSS inlined into exactly one <style> block, no external stylesheet link
check('CSS inlined as one <style>', count(html, '<style>') === 1);
check('no external stylesheet link (css/app.css)', !html.includes('href="css/app.css"'));

// 3. favicon inlined as a data URI, no assets/ reference
check('favicon inlined as data URI', html.includes('data:image/svg+xml;base64,'));
check('no external asset references (assets/)', !html.includes('href="assets/'));

// 4. JS bundled inline, no external script tags
check('no external script tags (js/*.js)', !html.includes('<script src="js/'));
check('single inline <script> present', html.includes('\n<script>\n') && html.includes('</script>'));

// 5. app shell / DOM still intact
check('app shell present (#app-main)', html.includes('id="app-main"'));
check('canvas present (#canvas)', html.includes('<canvas id="canvas"'));

// 6. all expected source JS files were inlined (by unique header markers)
const srcJs = resolve(ROOT, 'src', 'js');
const markers = [
  ['i18n', 'i18n - simple string table'],
  ['color', 'color.js - colour conversions'],
  ['mixing', 'mixing.js - Kubelka-Munk'],
  ['palettes', 'palettes.js - default palettes'],
  ['app', 'app.js - bootstrap'],
];
for (const [name, marker] of markers) {
  check(`bundle includes ${name}.js`, html.includes(marker));
}

// 7. the inlined JS bundle is syntactically valid
const bundleStart = html.lastIndexOf('\n<script>\n') + '\n<script>\n'.length;
const bundleEnd = html.lastIndexOf('</script>');
const bundleJs = html.slice(bundleStart, bundleEnd);
let syntaxOk = true;
try {
  // compile without executing (IIFE bundle is a valid function body)
  new Function(bundleJs); // eslint-disable-line no-new-func
} catch (err) {
  syntaxOk = false;
  console.error(`    (syntax error: ${err.message})`);
}
check('inlined JS bundle is syntactically valid', syntaxOk);

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed.');
