/*
   Pixel Palette - development loop
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Runs the two halves of the local dev loop in one process: the watch build
   (scripts/watch.mjs) and the static host (scripts/host.mjs). There is no dev
   server and no bundler to run - the sources are plain-script IIFEs that only
   need rebuilding - so this stays zero-dependency (no `concurrently`), matching
   the rest of the project.

   Usage:
     npm run dev
     PORT=8080 npm run dev

   The host defaults to 8081 here (the same port host.cmd uses) so the dev loop
   does not clash with other local servers already on 8080. There is no browser
   auto-reload: refresh the page after a rebuild - and remember the service
   worker serves the cached shell, so use "Update on reload" / bypass for
   network while developing (see HANDOVER §6).
*/
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// the watch build runs an initial build immediately, so dist/ exists by the
// time the host answers its first request
const children = [
  spawn(process.execPath, [resolve(__dirname, 'watch.mjs')], { stdio: 'inherit' }),
  spawn(process.execPath, [resolve(__dirname, 'host.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PORT || '8081' },
  }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) { if (!c.killed) c.kill(); }
  process.exit(code);
}

// if either half dies, take the other one down with it rather than leaving a
// half-working dev loop behind
for (const c of children) c.on('exit', (code) => stop(code === 0 ? 0 : 1));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log('dev: watch build + static host (Ctrl+C to stop)');
