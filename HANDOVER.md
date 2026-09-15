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
npm test             # full suite: node --test --test-isolation=none  (currently 125 pass)
npm run host         # serve dist/ (defaults 8080 if run directly)
npm run build:watch  # rebuild on src/ changes
npm run dev          # build:watch + host together (hosts 8081; PORT= to change)
```

There is **no dev server and no bundler** to run — the sources are plain-script
IIFEs, so `npm run dev` is just the watch build plus the static host. There is no
browser auto-reload either, and the service worker serves the cached shell, so
while developing keep "Update on reload" (or bypass for network) enabled in
DevTools or you will keep seeing the old bundle (§6).

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
- **The same trap applies to the literal `<style>` in `src/js/`** — even inside
  a JS comment. It is inlined into the bundle and `test/build.test.mjs` counts
  `<style>` occurrences (exactly 2 expected), so a comment that merely mentions
  one fails the whole suite. Write "style element" instead. (Bit us in the
  Phase 0 gesture probe; §11.)
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
npm test          # expect 125 pass, 0 fail
```

Then spot-check `dist/` contains `index.html`, `sw.js`, `version.json`,
`robots.txt`, `sitemap.xml`, and grep that no `__GIT_SHA__` remains:

```sh
Select-String -Path dist/index.html,dist/sw.js -Pattern '__GIT_SHA__'   # expect no matches
```

## 9. Suggested next steps

- **Gesture mode dial** — Phase 0 probe + Phase 1 dial are built; the AR
  ("map to surface") stop list is not. Read §11 before touching the locked-gesture
  code.
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
                          (also the Phase 0 gesture probe + gesture dial — §11)
src/js/mix-ui.js          Mix panel + mobile "Show mix" result bar toggle
src/js/i18n.js            English string table (single locale)
src/index.html            App shell, all modals, update banner, tracing HUD
scripts/build.mjs         Bundler; hash stamping; emits sw.js + version.json
scripts/host.mjs          Static host for dist/ (correct MIME types)
test/build.test.mjs       Bundle + SW/version assertions
```

## 11. Gesture mode dial (Phase 0 + Phase 1 built; AR stop list NOT built)

**Why:** the gooseneck mount lets the camera droop slowly towards the paper, so
the feed effectively zooms in and the overlay drifts out of alignment. Touching
the screen to correct it wobbles the mount and makes it worse — so the
correction has to come from the Bluetooth "remote". That remote physically
taps/swipes the screen, so its gestures arrive as ordinary pointer events on the
existing `hideTap` path, **not** as keyboard input.

**Agreed shape:** a two-stop mode dial over the projection surface, active while
`locked && arMode === 'off'` (the same gate today's gestures use).

| Stop | swipe up / down | press |
| --- | --- | --- |
| `OPACITY` (home) | overlay ±10% | peek / restore *(unchanged)* |
| `ZOOM` | fine image scale, ±0.5% | reset to fit |

- **Double-press swaps which stop the remote drives** — a role swap, not a long
  carousel walk. The on-screen chip prints both roles and highlights the active
  one, so what the remote will do is never guessed.
- Press is *not* mode-specific everywhere: peek keeps press on `OPACITY`, the
  adjust stop gets reset. (Decided with the user.)
- A double press defers the single-press action by `DOUBLE_PRESS_MS` (~300) so a
  deliberate double press can't fire two peeks. A *stray* double press is
  self-cancelling, because `peekHide()` is a toggle; two deliberate peeks are
  normally further apart than the window.
- One completed swipe = one step; consecutive same-direction swipes within
  `SWIPE_REPEAT_MS` (600 ms) climb the `ZOOM_STEPS` rung ladder — **0.1%, 0.5%,
  1%, 2%**, finest first, so an isolated swipe is the finest correction and a
  rapid run travels. Only ZOOM climbs it; OPACITY keeps its fixed ±10%. The
  remote's swipe *length* is fixed by the hardware, so length-based coarse/fine
  is unusable; repeat does the job, and the short window means the ladder only
  engages on a deliberate rapid run.
- **Auto-home** to `OPACITY` after ~20 s idle, so a stray swipe does the
  harmless thing. Every gesture persists to prefs, which is why this matters.
- Tight zoom range (~0.85–1.30) so a stray gesture cannot lose the image.
- Use **image** zoom, not feed zoom: `feedZoomAt` clamps `feedS >= 1`, so the
  camera layer can only scale *up* and can never undo a droop.
- No SHIFT/offset stops: the paper is moved by hand. That leaves only *scale*
  for the app to fix, because a hand cannot shrink the paper.

### Built (Phase 1)

The dial is live in `src/js/tracing.js`:

- `gestureStep(state, event)` / `gestureInit()` — the **pure** state machine,
  exported via `__internal` and covered by 7 tests in `test/tracing.test.mjs`
  (deferral, double-press swap, wrap, repeat acceleration, swipe-cancels-press,
  auto-home).
- `gestureContext()` returns `'flat'` when `active && locked && arMode === 'off'`
  and `null` otherwise; when it is null the chip is hidden and gestures are
  dropped. It is the single place that decides which stop list is live.
- Hooks: `onLockedEnd` now feeds `gestureApply({type:'press'|'swipe'})` instead
  of calling `peekHide()` / `setAlpha()` directly. Ticks come from
  `gestureSchedule()`, armed **only** while a deferred press or an auto-home is
  outstanding — there is no polling loop.
- `alignScale` (persisted as `align` in `PREF_KEY`) is the fine alignment zoom.
  `applyAlign()` recomputes the fit base from the current viewport every time, so
  a rotation cannot leave a stale base; at the default `alignScale = 1` it is
  byte-identical to the old `fit()`. `fitReset()` (align 1 + refit) is what the
  **Fit image** button and ZOOM's press action both call.
- Chip: `#project-dial` in `src/index.html`, `.project-dial` in `app.css`,
  strings in `i18n.js`. It is `pointer-events: none`, so it can never steal a
  gesture and needed **no** `overHud` change. It expands for `DIAL_HOLD_MS` after
  a gesture, then falls back to the compact `OPACITY / ZOOM 108.4%` form.
- **OPACITY keeps its fixed ±10% step** (`mult` only accelerates ZOOM), so the
  pre-existing gesture behaviour is unchanged.

Constants (all in `tracing.js`, all still *guesses* except what the Phase 0 probe
validates): `DOUBLE_PRESS_MS 300`, `GESTURE_HOME_MS 20000`,
`SWIPE_REPEAT_MS 600`, `ZOOM_STEPS [0.001, 0.005, 0.01, 0.02]` (the rung ladder;
`SWIPE_REPEAT_MAX` is derived from its length), `ALIGN_MIN 0.85`,
`ALIGN_MAX 1.30`, `DIAL_HOLD_MS 2000`.

### Decisions already taken so a later "adjust the pins" stop fits

Requested by the user, **not built yet**: fine pin adjustment while in
"map to surface" (`arMode === 'on'`, `arEdit`).

1. **Stops are a registry (data)** — each `{ id, labelKey, group, available(),
   value(), format(), step(dir, mult), press(), pressLabelKey, min(), max() }`,
   with `activeStops()` filtering by context. New stops become new entries, not
   new gesture code.
2. **One predicate owns the pointer**: `gestureContext() → 'flat' | 'map' |
   null`, replacing the repeated `locked && arMode === 'off'` gates in
   `startLockedGesture` / `onPointerDown`. This preserves the invariant that
   makes the surface wobble-proof: exactly one handler owns the pointer.
3. **Selection lives above the pointer**: `gestureSel = { stopIndex,
   targetIndex }`, reset to that context's home stop whenever `arMode` changes.
   A stop may declare `targets()`.
4. **Create the pin-move seam `arMovePin(idx, dx, dy)`**, extracted from
   `arAdjustMove` (canvas clamp → `computeHomography(arSrc, cand)` → reject
   degenerate → write `arDst`/`arH` → `requestRender()` → `arQueueWarp()`). The
   existing drag path must call it too, or the two paths will diverge.
5. **Pin *selection*, not a live pointer, must drive the split loupe.**
   `arAdjustLoupeOnStart`'s tick bails on `arDragIdx < 0`, so a gesture-selected
   pin would lose its loupe between gestures. Also mark the selected pin in
   `drawPinMarker` (all four look identical today).
6. Press action stays per stop (`peek` | `reset` | `undo`); `undo` suits a
   hand-placed pin better than `reset`.
7. **Keep each context's flattened stop list at 2–4 entries.** The small-step
   property is *why* the dial feels intuitive, and per-pin adjustment is what
   threatens it.

**Open fork (decide when building it).** Per-pin × per-axis is 4 pins × 2 axes
= 8 cells → up to 8 double presses, which breaks (7). Either:

- **(A, recommended)** gesture-adjust the warp **globally**: scale all four
  `arDst` about their centroid. One parameter, so it fits the dial unmodified,
  and a droop *is* a global scale change; keystone/per-pin correction stays the
  existing deliberate touch-based adjust. Or
- **(B)** per-pin: then a target dimension is unavoidable — either 8 flattened
  cells, or a second selector gesture (press-and-hold to cycle pins) *if* the
  remote supports holding. The Phase 0 probe can answer that.

Also: `loadPrefs` never restores `arDst`, so pin edits are session-only today.
If pin adjustment becomes gesture-cheap, persist the map too.

### Phase 0 gesture probe (temporary — delete once the constants are tuned)

`src/js/tracing.js` has a `GESTURE_DEBUG` block enabled **only** by adding
`?gdebug=1` to the page URL. It draws a small panel at the top-left of the
projection surface reporting, for the gestures actually made:

- `tap` — count, last duration, min/max duration vs `HIDE_TAP_MS`
- `swip` — count, last/peak travel vs `SWIPE_PX`
- `dbl` — count, last and minimum press-to-press gap vs `DOUBLE_PRESS_MS`
- the last few gestures: kind, `dur`, `tr`, `peak`, `dxy`, `dStart`, plus why a
  press did nothing (e.g. `dur 520>400 (raise HIDE_TAP_MS)`)
- `IGNORED …` for pointer-downs the gesture layer deliberately drops (over the
  HUD, lock off, AR pinning active)

It exists because `HIDE_TAP_MS = 400` and `SWIPE_PX = 40` were tuned for a
*finger*; a mechanical tapper is slower and has a fixed throw, so today it may
silently do nothing at all. Set those constants (and the double-press window)
from the readings, then delete the probe: it is one contiguous function block
plus a handful of clearly-marked `gdbg*()` hook calls. It adds no `<style>` tag
(inline styles from JS — the build test asserts exactly two) and reads
`global.location` defensively, because the test vm sandbox has no `location`.
