# HANDOVER

Working notes for an agent (or human) continuing work on **Pixel Palette**.
Read this first; it records architecture, conventions, the current state and
the traps that have already bitten us.

---

## 1. What this project is

A zero-runtime-dependency, fully client-side colour picker and paint mixer
(Kubelka–Munk physics). The editable sources live in `src/`; `npm run build`
bundles everything into a **single self-contained `dist/index.html`** (all CSS,
favicon and JS inlined). It also has a "Projection / Tracing" mode: the loaded
image is superimposed over a live camera feed with an image-locked grid, line
art, greyscale and surface pinning (simplified AR).

- **Repo root:** `F:\git-clones\util.awltux.trade\pixelpalette`
- **Node:** v24.21.0 (works on modern Node; no `node_modules` are needed)
- **Licence:** AGPL-3.0-or-later (Awltux Limited)
- **Git:** branch `master`, **14 commits ahead of `origin/master` and NOT pushed**

## 2. Commands

```sh
npm run build        # build dist/ (Node only, zero deps)
npm test             # full suite: node --test --test-isolation=none  (currently 118 pass)
npm run host         # serve dist/ (defaults 8080 if run directly)
npm run build:watch  # rebuild on src/ changes
```

Windows wrappers exist: `build.cmd`, `test.cmd`, `host.cmd`. **`host.cmd`
defaults to port 8081** (to avoid clashing with other local servers on 8080),
whereas `node scripts/host.mjs` defaults to 8080 — see the README drift note in
§9.

Run one test file: `node --test --test-isolation=none test/tracing.test.mjs`

### Build output (`dist/`, gitignored)

`npm run build` writes:

- `dist/index.html` — the bundle (do not edit by hand)
- `dist/sw.js` — service worker, **stamped with the current commit hash**
- `dist/version.json` — `{ "build": "<7-hex-hash>", "builtAt": "<ISO>" }`
- `dist/robots.txt`, `dist/sitemap.xml` — copied from `src/`

`dist/` is in `.gitignore`; it is a regenerable artifact. **Deploy the whole
`dist/` folder**, not just `index.html` (the latter breaks offline + update
checks).

## 3. Architecture & conventions (important)

- Each file in `src/js/` is a **plain-script IIFE** that attaches to `window`
  (`window.CP.*`, `window.I18N`, etc.). There are **no ES modules** at runtime.
- `src/index.html` loads them in dependency order via
  `<script src="js/...">` tags. `scripts/build.mjs` parses those tags, reads the
  files **in that order**, concatenates them and inlines one `<script>` before
  `</body>`. Editing the order in `src/index.html` changes the bundle order.
- CSS is a single `src/css/app.css`, inlined as the only `<style>` (plus a tiny
  `<noscript>` guard — the build test asserts exactly **2** `<style>` tags).
- **i18n:** `src/js/i18n.js` has a `TABLE` whose only locale is `en`. Add new
  user-facing strings there and reference them via `data-i18n="key"` in HTML or
  `I18N.t('key')` in JS. `I18N.apply()` walks `[data-i18n]` at boot.
- Since the sources are inlined, avoid literal build tokens in JS (see §7).
- Tests run the **real browser sources** in a `vm` sandbox with mocked
  `window`/`document`/`localStorage`/canvas (`test/helpers/env.mjs`). Pure logic
  is reached via each module's `__internal` export; DOM-heavy code generally
  isn't unit-tested (notably most of `app.js`, `tracing.js` interactions and the
  new offline code).

## 4. Build-time stamping (git hash) — how it works

`scripts/build.mjs` reads the short HEAD hash **directly from `.git`** (HEAD →
ref → object id, with `packed-refs`/detached fallbacks) and substitutes the
token `__GIT_SHA__` in `src/index.html` and `src/sw.js`. It also writes
`dist/version.json`.

- The Info dialog shows it at `#info-build-hash` (`build=<hash>`).
- The app reads that span back at runtime and compares against
  `version.json` (see §6).
- **Why read `.git` directly instead of `git rev-parse`?** In the agent
  sandbox, `child_process` stdout capture fails with EPERM; also it removes the
  need for a `git` binary entirely. Don't "simplify" this to `execSync('git…')`.

**Workflow consequence:** the displayed hash is whatever `HEAD` is when you
build. So: make changes → **commit** → `npm run build` once. The generated
`dist/` then shows the latest commit hash. Do **not** try to commit a "hash
update" — `dist/` isn't committed, so there's no loop.

## 5. Current feature state (all committed on `master`)

Recent, newest-first:

| Commit | What |
| --- | --- |
| `f5a7551` | Offline service worker + startup update check (see §6) |
| `5993fec` | Tracing HUD: more gap before, and wider, Hide/Show toggle |
| `5367920` | Minimised tracing HUD → single floating reveal chip, no full-width bar |
| `0b6a87b` | Confirm dialog on "Exit projection" |
| `d23d9a3` | Locked opacity swipe = one discrete ±10% step per gesture |
| `148cdf1` | Locked gesture tracks the whole window (minus HUD) |
| `6d4dcd6` | Locked opacity swipe changed horizontal → vertical |
| `d297e2c` | Git build hash at the bottom of the Info dialog |
| `ecca205` | Mobile "Show mix" bar toggles colour-gamut ↔ Open Image |
| `30ca1a0` | Grid-spacing truly disabled while image is locked |
| `a3c3777` | Locked peek/hide via opacity, not a boolean flag |

### Tracing mode (`src/js/tracing.js`) — current gesture model

- Global state: `alpha` (overlay opacity 0..1), `locked`, `restoreAlpha`,
  `hideTap` tracker, `greyOn`, `gridOn`/`gridCell`, `lineOn`, AR state.
- `setAlpha(v, persist)` — `persist:false` skips saving to prefs.
- `peekHide()` — tap-to-peek: if `alpha>0`, remember it in `restoreAlpha` and
  set `alpha=0`; else restore. Grid remains drawn.
- **Locked gestures** are started by `startLockedGesture(e)` (only when
  `locked && arMode==='off'` and **not `overHud(e)`**), then tracked by
  **window-level** listeners `onLockedMove` / `onLockedEnd`
  (attached in `init` to `global`). The canvas `onPointerMove`/`onPointerEnd`
  deliberately do **not** handle the locked gesture (a locked pointer is never
  added to `pointers`).
- A **completed vertical swipe** (net `|dy| ≥ SWIPE_PX/2`, recognised when
  `|dy| > 1.5·|dx|` and `|dy| ≥ SWIPE_PX`) applies **one** `SWIPE_ALPHA_STEP`
  (0.1): up = +, down = −. It does **not** scrub proportionally.
- Constants near the top: `HIDE_TAP_SLOP=12`, `HIDE_TAP_MS=400`, `SWIPE_PX=40`,
  `SWIPE_ALPHA_STEP=0.1`.
- Grid spacing while locked: `setGridCell` early-returns if `locked`, and the
  row gets `.is-locked` with `pointer-events:none`.
- Exit button now opens `#project-exit-confirm` (`openExitConfirm` /
  `closeExitConfirm` / `confirmExitProject`). **Programmatic** exits (e.g.
  camera start failure) call `exit()` directly and must stay un-prompted.
- Minimised HUD (`.project-hud.hud-min`) collapses to a floating reveal chip
  bottom-right (no full-width bar).

### Mobile "Show mix" bar (`src/js/mix-ui.js`)

`#result-bar` (mobile-only sticky footer) is a stateful toggle: first tap scrolls
`#panel-mix .gamut-block` into view; second tap scrolls back to `#btn-open`.

## 6. Offline + update check (just added — new, least tested)

- `src/sw.js` (service worker, path-relative, hash-stamped). Strategy is
  **stale-while-revalidate** for same-origin requests under the app scope:
  cached shell served immediately; network copy fetched and stored in the
  background. Navigation requests are handled; `version.json` is **never**
  intercepted/cached. Cache name is `pixelpalette-<hash>`; old caches are pruned
  on activate.
- `src/js/app.js` → `initOffline()` (called at the top of `boot()`):
  - `initServiceWorker()` registers `'./sw.js'` on `window.load`
    (relative, so it works under a sub-path). Failures are swallowed (SW needs
    HTTPS or localhost).
  - `initUpdateCheck()` reads `#info-build-hash`, and — **only if online** —
    fetches `'./version.json?t=<now>'` with `cache:'no-store'`; if `build`
    differs, shows `#update-banner` with a Reload button.
- Banner markup/strings: `src/index.html` (`#update-banner`, `#update-reload`),
  `src/css/app.css` (`.update-banner`), `src/js/i18n.js`
  (`updateAvailable`, `updateReload`).
- The host in `scripts/host.mjs` already serves `.js`/`.json` with correct
  MIME types and maps directories to `index.html`, so this works locally at
  `http://localhost:8081/`.

**Expected UX:** the first online visit registers/installs the worker and
caches the app; from then on it opens offline, and when a newer build is on the
server the banner offers a manual reload. **Not covered by automated tests.**

## 7. Traps / gotchas (learned the hard way)

- **Never put the literal `__GIT_SHA__` in `src/js/`.** It gets inlined into
  `dist/index.html`, and `test/build.test.mjs` asserts no placeholder remains.
  `app.js` avoids this by validating the hash **shape**
  (`/^[0-9a-f]{7}$/i`) instead of comparing to the token.
- `test/build.test.mjs` reads a module-level `html` snapshot at import time.
  When adding tests that depend on freshly-built output, **re-read
  `dist/index.html` inside the test** (the new SW/version test does this).
- Sandbox/`child_process` output capture is blocked (EPERM); see §4.
- CRLF warnings from git on every `add` are benign (LF in working copy).
- The repo's `README.md` is slightly stale: it says `npm run host` serves 8080
  (true for direct `node scripts/host.mjs`), but `host.cmd` uses **8081**; it
  also predates `sw.js`/`version.json`/offline support and this file.
- The version check treats "different hash" as "update available" (no ordering
  comparison) — fine for exact-build matching, but a stale/incorrect
  `version.json` would prompt spuriously.

## 8. Verification checklist before saying "done"

```sh
npm run build     # must exit 0, "Built … (… KB, 20 JS files inlined …)"
npm test          # expect 118 pass, 0 fail
```

Then spot-check `dist/` contains `index.html`, `sw.js`, `version.json`,
`robots.txt`, `sitemap.xml`, and grep that no `__GIT_SHA__` remains:

```sh
Select-String -Path dist/index.html,dist/sw.js -Pattern '__GIT_SHA__'   # expect no matches
```

## 9. Suggested next steps

- **Update `README.md`** to mention `sw.js`/`version.json`/offline support, the
  8081 default for `host.cmd`, and this HANDOVER file.
- **Push `master`** (14 unpushed commits) — confirm with the human first; do not
  push unprompted.
- **Verify the offline/update flow on a real HTTPS host under the sub-path**
  (install worker, go offline, reopen, then deploy a new build and confirm the
  banner appears and Reload picks up the new version).
- Consider a small **DOM harness test** for `initUpdateCheck()` (banner shown
  when `version.json` differs; not shown when offline) if you extend
  `test/helpers/env.mjs` with `fetch`/`navigator.onLine`.
- Optional, previously declined: full **installable PWA** (web manifest +
  icons). The user chose service-worker offline only, no manifest.
- Watch the mobile vertical-swipe gesture: if a real device still steals the
  swipe as a page scroll (`pointercancel`), scope `touch-action: none` to the
  locked projection surface.

## 10. Quick file map (beyond README)

```
src/sw.js                 Offline service worker (hash-stamped by the build)
src/js/app.js             Boot; initOffline() (SW registration + update banner)
src/js/tracing.js         Projection/tracing: the most complex module
src/js/mix-ui.js          Mix panel + mobile "Show mix" result bar toggle
src/js/i18n.js            English string table (single locale)
src/index.html            App shell, all modals, update banner, tracing HUD
scripts/build.mjs         Bundler; hash stamping; emits sw.js + version.json
scripts/host.mjs          Static host for dist/ (correct MIME types)
test/build.test.mjs       Bundle + SW/version assertions
```
