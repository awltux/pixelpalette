# Pixel Palette

Pick exact colours from any image and mix them from real paint palettes with
Kubelka–Munk physics. Oil, acrylic, watercolour, gouache and pencils.

Pixel Palette is a fully client-side colour picker and paint mixer for
artists. Open an image, sample the exact pixel colour you want, and get a
real paint-mix recipe — which paints and in what proportions — to recreate
it. Mixing is solved with Kubelka–Munk physics, the same model used in paint
chemistry, so recipes account for each pigment's strength, opacity and
undertone rather than just matching on screen.

No image is ever uploaded: everything runs in your browser.

## Features

- **Pixel-perfect sampling** — magnified loupe, fine-control nudge, and a
  reticle with adjustable size and zoom.
- **Colour readout** — HEX, RGB, HSL and CMYK with one-click copy, plus a
  sample history.
- **Paint-mix solver** — finds the smallest combination of palette paints that
  matches your sampled colour, using Kubelka–Munk physics for opaque media and
  an exponential absorption model for glazing (watercolour) media.
- **Real palettes** — oil, acrylic, gouache, watercolour and pencil palettes
  with per-paint properties: strength, opacity, colour index, lightfastness,
  undertone, granulation, staining and toxicity.
- **Paint filters** — granulating, staining, lightfastness, toxicity and
  maximum paint count per mix.
- **Editable palettes** — add, remove, rename or recolour paints, and
  duplicate any palette. Custom palettes are stored in your browser.
- **Soften radius** — sample an averaged area instead of a single pixel.
- **Dark / light theme**, a guided tour for first-time visitors, and a
  blocking legal / safety notice about toxic paints before first use.

## Getting started

Pixel Palette is a static site with no runtime dependencies. The editable
sources live in `src/` and are bundled by `npm run build` into a single,
self-contained `index.html` at the project root (CSS, favicon and all JS are
inlined).

```sh
git clone <your-repo-url>
cd colour_picker
```

Build the single-file app, then open/serve the generated `index.html`:

```sh
npm run build        # writes index.html (zero build dependencies, Node only)
npm test             # runs the full unit + build test suite (85+ tests)
npm run host         # serves the app locally at http://localhost:8080 (or npm run host -- 9000)
npm run build:watch  # rebuild index.html whenever src/ changes
```

On Windows there are matching convenience scripts (`build.cmd`, `test.cmd`,
`host.cmd`) that wrap the npm commands above.

Any static file server works — the app never makes network requests for its
own operation.

## Tests

The test suite uses Node's built-in test runner (no dependencies). It loads
the real browser sources (`src/js/*.js`) into a `vm` sandbox with mocked
`window`/`document`/`localStorage`/canvas, so the actual code is exercised:

- **color** — hex/rgb/hsl/cmyk conversions, linear/XYZ/Lab round-trips, ΔE.
- **mixing** — Kubelka–Munk solver invariants, opaque vs glazing media, paint
  caps, single-paint reproduction.
- **gamut** — boundary computation, coverage, `pointInside`, `boundaryAt`.
- **palettes** — built-in media, custom palettes, persistence, backfill.
- **i18n** — string table lookups and variable interpolation.
- **history** — per-palette history, locking, dedupe, persistence.
- **fit-palette** — greedy palette fitting and coverage.
- **gamut-filter** — `clipPixel` gamut clipping and palette signatures.
- **smoke** — every source file loads in the documented order and registers
  its globals.
- **build** — rebuilds and verifies the single-file `index.html` output.

Run any single file with e.g. `node --test --test-isolation=none test/mixing.test.mjs`.

## Project layout

```
index.html           Build output: the single-file bundle (do not edit by hand)
src/index.html       App shell, SEO meta/JSON-LD, modals (info, privacy, disclaimer)
src/css/app.css      All styles (dark/light theme via data-theme on <html>)
src/js/app.js        Bootstrap: shared state, theme, toolbar, keyboard, pane divider
src/js/i18n.js       String table (English default; locale-aware lookup)
src/js/consent.js    Cookie / storage consent banner
src/js/disclaimer.js Blocking legal / safety notice gate
src/js/color.js      Colour space conversion (HEX/RGB/HSL/CMYK)
src/js/palettes.js   Paint palettes, media definitions, persistence/backfill
src/js/mixing.js     Kubelka–Munk and glazing mix solvers
src/js/mix-ui.js     Mix panel UI: filters, palette select, recipe list
src/js/canvas.js     Canvas rendering, pan/zoom/fit
src/js/reticle.js    Reticle sampling and magnifier
src/js/readout.js    Colour readout panel
src/js/history.js    Sample history strip
src/js/palette-editor.js Edit-palette modal
src/js/tutorial.js   Guided tour overlay
src/js/image-loader.js   Local image loading (FileReader, drag & drop)
src/js/demo-image.js     Built-in demo image
src/assets/          favicon and Open Graph image
scripts/build.mjs    Bundles src/ into the single root index.html
scripts/host.mjs     Zero-dependency local static server for previewing the app
scripts/watch.mjs    Rebuilds index.html on src/ changes
test/                Unit + build test suite (node --test, zero dependencies)
build.cmd test.cmd host.cmd   Windows wrappers for the npm scripts above
```

The build concatenates the JS sources in the order the shell loads them and
inlines everything into one file, so the app's behaviour is identical to the
multi-file version. Edit files under `src/`, then re-run `npm run build`
(or `npm test`, which also validates the result).

## Legal notices

The app identifies some paints as **toxic** (for example cadmium, cobalt,
lead or chromium pigments). This information is provided for convenience only
and is not a substitute for the manufacturer's Safety Data Sheet (SDS), the
product label, or professional advice. A legal notice is shown before first
use and must be accepted to continue. See the in-app notices for full wording.

## License

AGPL-3.0. See [LICENCE.md](LICENCE.md).
