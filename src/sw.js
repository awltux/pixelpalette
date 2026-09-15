/*
   Pixel Palette - service worker
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Offline support for the single-file app. The build stamps this file with the
   current git commit hash (__GIT_SHA__) so every release gets its own cache and
   re-installs the worker, which prunes caches from older builds.

   Strategy: stale-while-revalidate for same-origin requests under the app
   path. The cached shell is served immediately (fast, works offline) while the
   network response is fetched in the background and stored, so the cache keeps
   tracking the newest build. version.json is deliberately NOT intercepted so
   the page can always fetch it live for its update check.
*/

const BUILD = '__GIT_SHA__';
const CACHE = 'pixelpalette-' + BUILD;
const SCOPE = self.registration.scope; // e.g. https://host/pixelpalette/
const SCOPE_PATH = new URL(SCOPE).pathname;

self.addEventListener('install', (event) => {
  // Precache the app shell so the very next visit can open offline. The fetch
  // deliberately bypasses the HTTP cache: a heuristically-cached copy would
  // otherwise be precached as "the new build", and the app could then never move
  // off the build the browser already had (see HANDOVER §7).
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => fetch(SCOPE, { cache: 'no-store' })
        .then((res) => (res && res.ok ? c.put(SCOPE, res) : null)))
      .catch(() => { /* caching the directory may fail on some servers */ })
      .then(() => self.skipWaiting())
  );
});

// The page posts this just before reloading after an update, so a worker that is
// waiting behind the current one can take over immediately instead of on the
// next cold start.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // same-origin only
  if (url.pathname.endsWith('/version.json')) return; // never cache the version probe

  // Only handle same-origin requests that live under this app's path.
  if (req.mode === 'navigate' || url.pathname.startsWith(SCOPE_PATH)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  // Revalidate straight from the network, bypassing the HTTP cache. Without
  // `no-store` this fetch can be answered by a heuristically-cached copy (which
  // then just re-stores the same stale body) or by a 304, which fails the
  // `res.ok` test below - either way the cache never moves off the build it
  // holds and "reload" appears to do nothing.
  const network = fetch(req, { cache: 'no-store' })
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response('offline', { status: 503 });
}
