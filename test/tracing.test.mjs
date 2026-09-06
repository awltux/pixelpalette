/*
   Pixel Palette - tracing (projection mode) unit test
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Exercises the pure image-space helpers in src/js/tracing.js that power the
   projection overlay (fit-to-screen, image-locked grid line positions, scale
   clamping). The DOM/camera/media parts of tracing.js are not reachable here.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox, runSource, host } from './helpers/env.mjs';

function loadTracing() {
  const s = createSandbox();
  runSource(s, 'i18n.js');
  runSource(s, 'tracing.js');
  return s.CP.Tracing.__internal;
}

test('computeFit contains the whole image within the viewport', () => {
  const { computeFit } = loadTracing();
  // landscape image in a portrait-ish viewport
  const f = computeFit(1600, 1000, 800, 600, 24);
  assert.ok(f.scale > 0);
  assert.ok(1600 * f.scale <= 800 - 48 + 1e-9);
  assert.ok(1000 * f.scale <= 600 - 48 + 1e-9);
  assert.equal(f.cx, 800);
  assert.equal(f.cy, 500);
});

test('computeFit respects padding and clamps tiny images', () => {
  const { computeFit } = loadTracing();
  const f = computeFit(10, 10, 400, 300, 20);
  assert.ok(f.scale > 0);
  assert.equal(f.cx, 5);
  assert.equal(f.cy, 5);
  // a wider pad leaves more margin
  const small = computeFit(100, 100, 500, 500, 100);
  const large = computeFit(100, 100, 500, 500, 10);
  assert.ok(small.scale < large.scale);
});

test('gridLines always start at 0, end at size, and step by the cell size', () => {
  const { gridLines } = loadTracing();
  const lines = host(gridLines(200, 50));
  assert.equal(lines[0], 0);
  assert.equal(lines[lines.length - 1], 200);
  assert.deepEqual(lines, [0, 50, 100, 150, 200]);

  const offGrid = host(gridLines(100, 64));
  assert.equal(offGrid[0], 0);
  assert.equal(offGrid[offGrid.length - 1], 100);
  assert.deepEqual(offGrid, [0, 64, 100]);
});

test('gridLines handles a cell larger than the span (single + boundary)', () => {
  const { gridLines } = loadTracing();
  const lines = host(gridLines(30, 200));
  assert.deepEqual(lines, [0, 30]);
});

test('gridLines clamps non-positive cell sizes', () => {
  const { gridLines } = loadTracing();
  const zero = host(gridLines(50, 0));
  assert.equal(zero[0], 0);
  assert.equal(zero[zero.length - 1], 50);
  // every consecutive pair is a positive step
  for (let i = 1; i < zero.length; i++) assert.ok(zero[i] > zero[i - 1]);
});

test('clampScale bounds the projection zoom factor', () => {
  const { clampScale } = loadTracing();
  assert.equal(clampScale(0.01), 0.02);
  assert.equal(clampScale(1000), 64);
  assert.equal(clampScale(1), 1);
});

/* ---- third-line grid markers ---- */

test('snapToGrid snaps to the nearest grid multiple', () => {
  const { snapToGrid } = loadTracing();
  assert.equal(snapToGrid(30, 10), 30);
  assert.equal(snapToGrid(34, 10), 30); // 34 closer to 30 than 40
  assert.equal(snapToGrid(46, 10), 50);
  assert.equal(snapToGrid(5, 20), 0);
});

test('thirdLineMarkers returns four grid-snapped points near 1/3 & 2/3', () => {
  const { thirdLineMarkers } = loadTracing();
  const pts = host(thirdLineMarkers(300, 240, 10));
  assert.equal(pts.length, 4);
  // markers snap to multiples of the cell (10)
  for (const p of pts) {
    assert.equal(p.x % 10, 0);
    assert.equal(p.y % 10, 0);
    assert.ok(p.x >= 0 && p.x <= 300, 'x in range');
    assert.ok(p.y >= 0 && p.y <= 240, 'y in range');
  }
  // distinct combinations of ~1/3 and ~2/3 on each axis
  const xs = pts.map((p) => p.x).sort((a, b) => a - b);
  assert.equal(xs[0], xs[1]);
  assert.equal(xs[2], xs[3]);
  assert.ok(xs[2] > xs[0]);
});

test('thirdLineMarkers are independent of grid cell size (snap changes, count fixed)', () => {
  const { thirdLineMarkers } = loadTracing();
  const coarse = host(thirdLineMarkers(1000, 500, 64));
  const fine = host(thirdLineMarkers(1000, 500, 8));
  assert.equal(coarse.length, 4);
  assert.equal(fine.length, 4);
  // fine markers are near one of the true thirds (333 or 667 of 1000)
  for (const p of fine) {
    const near = Math.min(Math.abs(p.x - 333), Math.abs(p.x - 667));
    assert.ok(near <= 8, `fine x near a third: ${p.x}`);
  }
});


/* ---- line-drawing engine ---- */

function solidRgba(w, h, r, g, b) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  return d;
}

function pixelAt(rgba, x, y, w) {
  const i = (y * w + x) * 4;
  return rgba[i]; // grayscale output -> r==g==b
}

test('a uniform image produces pure white (flat regions vanish)', () => {
  const { makeLineDrawing } = loadTracing();
  const w = 40, h = 30;
  const out = makeLineDrawing(solidRgba(w, h, 200, 200, 200), w, h, 4, 0.6);
  for (let i = 0; i < w * h; i++) {
    assert.equal(out[i * 4], 255);
    assert.equal(out[i * 4 + 3], 255);
  }
});

test('a sharp edge produces a dark stroke near the transition', () => {
  const { makeLineDrawing } = loadTracing();
  const w = 64, h = 16;
  // left half white, right half black -> one vertical edge at x=32
  const src = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < 32 ? 255 : 0;
      const i = (y * w + x) * 4;
      src[i] = v; src[i + 1] = v; src[i + 2] = v; src[i + 3] = 255;
    }
  }
  const out = makeLineDrawing(src, w, h, 3, 0.7);
  // white interior far from the edge
  assert.equal(pixelAt(out, 8, 8, w), 255, 'far-left stays white');
  // some column at/next to the edge must be darker than white
  let darkest = 255;
  for (let x = 28; x <= 36; x++) darkest = Math.min(darkest, pixelAt(out, x, 8, w));
  assert.ok(darkest < 255, 'edge yields a dark stroke');
});

test('higher strength keeps more edges (darker/more below threshold)', () => {
  const { makeLineDrawing } = loadTracing();
  const w = 64, h = 16;
  // low-contrast step: a weak edge that low strength thresholds away
  // but high strength keeps
  const src = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < 32 ? 255 : 200;
      const i = (y * w + x) * 4;
      src[i] = v; src[i + 1] = v; src[i + 2] = v; src[i + 3] = 255;
    }
  }
  const dark = (str) => {
    const o = makeLineDrawing(src, w, h, 3, str);
    let s = 0;
    for (let i = 0; i < w * h; i++) s += 255 - o[i * 4];
    return s;
  };
  assert.ok(dark(0.9) > dark(0.2), 'stronger line effect draws more dark pixels');
});

test('blur radius widens the detected edge band', () => {
  const { makeLineDrawing } = loadTracing();
  const w = 128, h = 24;
  const src = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < 64 ? 255 : 0;
      const i = (y * w + x) * 4;
      src[i] = v; src[i + 1] = v; src[i + 2] = v; src[i + 3] = 255;
    }
  }
  const countDark = (rad) => {
    const o = makeLineDrawing(src, w, h, rad, 0.7);
    let c = 0;
    for (let x = 0; x < w; x++) if (pixelAt(o, x, 12, w) < 250) c++;
    return c;
  };
  assert.ok(countDark(10) > countDark(2), 'a larger blur detects a wider edge band');
});

/* ---- homography (surface pinning) ---- */
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

test('homography maps image points to surface points (affine case)', () => {
  const { computeHomography, applyHomography } = loadTracing();
  // pure translation + scale: rectangle -> shifted scaled quad
  const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
  const dst = [{ x: 50, y: 40 }, { x: 250, y: 40 }, { x: 250, y: 200 }, { x: 50, y: 200 }];
  const h = computeHomography(src, dst);
  assert.ok(h, 'homography computed');
  for (let i = 0; i < 4; i++) {
    const p = applyHomography(h, src[i].x, src[i].y);
    assert.ok(dist(p, dst[i]) < 1e-6, `correspondence ${i} maps correctly`);
  }
});

test('homography handles a genuine perspective (keystone) mapping', () => {
  const { computeHomography, applyHomography } = loadTracing();
  // a keystone: destination is a trapezoid (perspective foreshortening)
  const src = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }];
  const dst = [{ x: 20, y: 10 }, { x: 180, y: 25 }, { x: 190, y: 90 }, { x: 10, y: 85 }];
  const h = computeHomography(src, dst);
  assert.ok(h, 'homography computed');
  for (let i = 0; i < 4; i++) {
    const p = applyHomography(h, src[i].x, src[i].y);
    assert.ok(dist(p, dst[i]) < 1e-4, `perspective correspondence ${i} maps correctly`);
  }
  // an interior point should also stay inside the convex-ish output region
  const mid = applyHomography(h, 100, 50);
  assert.ok(mid.x > 20 && mid.x < 190 && mid.y > 10 && mid.y < 90, 'interior maps inside');
});

test('computeHomography returns null for collinear source points', () => {
  const { computeHomography } = loadTracing();
  const src = [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }, { x: 20, y: 30 }];
  const dst = [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }, { x: 20, y: 30 }];
  // 3 of 4 source points collinear -> singular
  const h = computeHomography(src, dst);
  assert.equal(h, null);
});

test('invert3 inverts an identity and a known homography', () => {
  const { invert3, computeHomography, applyHomography } = loadTracing();
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  assert.deepEqual(host(invert3(I)), I, 'identity inverts to itself');

  const src = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 90 }, { x: 0, y: 90 }];
  const dst = [{ x: 30, y: 10 }, { x: 200, y: 40 }, { x: 210, y: 150 }, { x: 20, y: 120 }];
  const h = computeHomography(src, dst);
  const inv = invert3(h);
  assert.ok(inv, 'inverse computed');
  for (let i = 0; i < 4; i++) {
    // mapping dst back through the inverse returns the original src point
    const back = applyHomography(inv, dst[i].x, dst[i].y);
    assert.ok(dist(back, src[i]) < 1e-3, `inverse round-trips correspondence ${i}`);
  }
});

/* ---- white-background -> alpha keying ---- */

test('keyWhiteToAlpha at 0 leaves pixels opaque (off state)', () => {
  const { keyWhiteToAlpha } = loadTracing();
  const w = 2, h = 1;
  // white and black greyscale pixels
  const src = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const out = host(keyWhiteToAlpha(src, w, h, 0));
  // amount 0 -> alpha unchanged (255) for both, rgb unchanged
  assert.equal(out[3], 255);
  assert.equal(out[0], 255);
  assert.equal(out[7], 255);
  assert.equal(out[4], 0);
});

test('keyWhiteToAlpha makes pure white transparent and keeps black opaque at 1', () => {
  const { keyWhiteToAlpha } = loadTracing();
  const w = 2, h = 1;
  const src = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const out = host(keyWhiteToAlpha(src, w, h, 1));
  // white -> alpha 0
  assert.equal(out[3], 0);
  // black -> alpha 255, black rgb
  assert.equal(out[7], 255);
  assert.equal(out[4], 0);
});

test('keyWhiteToAlpha mid amount partially fades mid grey (soft anti-alias)', () => {
  const { keyWhiteToAlpha } = loadTracing();
  const w = 3, h = 1;
  // black, mid-grey(128), white
  const src = new Uint8ClampedArray([
    0, 0, 0, 255,
    128, 128, 128, 255,
    255, 255, 255, 255,
  ]);
  const out = host(keyWhiteToAlpha(src, w, h, 0.5));
  const alphaBlack = out[3];
  const alphaMid = out[7];
  const alphaWhite = out[11];
  // black stays most opaque, white least, mid in between
  assert.ok(alphaBlack >= alphaMid, 'black alpha >= mid alpha');
  assert.ok(alphaMid > alphaWhite, 'mid alpha > white alpha');
});

test('keyWhiteToAlpha output is monotonic in darkness per pixel', () => {
  const { keyWhiteToAlpha } = loadTracing();
  const w = 1, h = 1;
  const src = new Uint8ClampedArray([200, 200, 200, 255]);
  // stronger amount => more transparent (lower alpha)
  const a05 = host(keyWhiteToAlpha(src, w, h, 0.5))[3];
  const a09 = host(keyWhiteToAlpha(src, w, h, 0.9))[3];
  assert.ok(a09 < a05, 'higher key amount lowers the white pixel alpha');
});



