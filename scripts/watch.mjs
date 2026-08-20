/*
   Pixel Palette - watch build (rebuilds index.html on src changes).
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.
*/
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', 'src');

let building = false;
let pending = false;

function run() {
  if (building) { pending = true; return; }
  building = true;
  const child = spawn(process.execPath, [resolve(__dirname, 'build.mjs')], {
    stdio: 'inherit',
  });
  child.on('exit', () => {
    building = false;
    if (pending) { pending = false; run(); }
  });
}

run();
watch(SRC, { recursive: true }, () => run());
console.log(`Watching ${SRC} for changes...`);
