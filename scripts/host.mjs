/*
   Pixel Palette - local static host
   Copyright (C) 2026 Awltux Limited

   Licensed under the GNU Affero General Public License, version 3.

   Serves the project directory as a static site (the built index.html and
   any other files) so you can preview the app locally. Zero dependencies.

   Usage:
     node scripts/host.mjs [port]
     PORT=8080 node scripts/host.mjs
     npm run host
     host.cmd            # Windows wrapper

   Defaults to http://localhost:8080
*/

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  try {
    const url = (req.url || '/').split('?')[0];
    const pathname = decodeURIComponent(url);
    let file = resolve(ROOT, '.' + normalize(pathname).replace(/\\/g, '/'));

    // guard against path traversal outside the project root
    if (!file.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }

    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
    });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String((err && err.message) || err));
  }
});

server.listen(PORT, () => {
  console.log(`Pixel Palette hosted at http://localhost:${PORT}/`);
  console.log(`Serving ${ROOT}  (press Ctrl+C to stop)`);
});
