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

Pixel Palette is a static site with no build step and no dependencies.

```sh
git clone <your-repo-url>
cd colour_picker
```

Open `index.html` in a browser, or serve the folder locally:

```sh
python3 -m http.server 8080
# then visit http://localhost:8080
```

Any static file server works — the app never makes network requests for its
own operation.

## Project layout

```
index.html           App shell, SEO meta/JSON-LD, modals (info, privacy, disclaimer)
css/app.css          All styles (dark/light theme via data-theme on <html>)
js/app.js            Bootstrap: shared state, theme, toolbar, keyboard, pane divider
js/i18n.js           String table (English default; locale-aware lookup)
js/consent.js        Cookie / storage consent banner
js/disclaimer.js     Blocking legal / safety notice gate
js/color.js          Colour space conversion (HEX/RGB/HSL/CMYK)
js/palettes.js       Paint palettes, media definitions, persistence/backfill
js/mixing.js         Kubelka–Munk and glazing mix solvers
js/mix-ui.js         Mix panel UI: filters, palette select, recipe list
js/canvas.js         Canvas rendering, pan/zoom/fit
js/reticle.js        Reticle sampling and magnifier
js/readout.js        Colour readout panel
js/history.js        Sample history strip
js/palette-editor.js Edit-palette modal
js/tutorial.js       Guided tour overlay
js/image-loader.js   Local image loading (FileReader, drag & drop)
js/demo-image.js     Built-in demo image
assets/              favicon and Open Graph image
```

## Legal notices

The app identifies some paints as **toxic** (for example cadmium, cobalt,
lead or chromium pigments). This information is provided for convenience only
and is not a substitute for the manufacturer's Safety Data Sheet (SDS), the
product label, or professional advice. A legal notice is shown before first
use and must be accepted to continue. See the in-app notices for full wording.

## License

AGPL-3.0. See [LICENCE.md](LICENCE.md).
