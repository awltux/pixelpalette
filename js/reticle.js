/* ============================================================
   reticle.js - the sampling reticle, loupe overlay, magnifier
   panel, fine navigation and pixel sampling.
   ============================================================ */
(function (global) {
  'use strict';

  const MIN_SIZE = 24, MAX_SIZE = 200;
  let sizeSlider, sizeOut, zoomSlider, zoomOut, magnifierCanvas, magnifierCtx;

  let resizeState = null;
  let sampleCanvas = null;
  let fxQueued = false;
  let lastFxRgb = null;

  const HANDLE = 12; // hit radius for corner handles (px)

  function getState() { return global.CP.state; }

  /* expensive side-effects (mix solve, history) run at most once per frame */
  function queueSideFx(rgb) {
    lastFxRgb = rgb;
    if (fxQueued) return;
    fxQueued = true;
    requestAnimationFrame(() => {
      fxQueued = false;
      const c = lastFxRgb;
      lastFxRgb = null;
      if (c) {
        if (global.CP.MixUI) global.CP.MixUI.update(c);
        if (global.CP.History) global.CP.History.onSample(c);
      }
    });
  }

  function setSize(px, fromUI) {
    const st = getState();
    st.reticlePx = Math.max(MIN_SIZE, Math.min(MAX_SIZE, px));
    if (sizeSlider) sizeSlider.value = st.reticlePx;
    if (sizeOut) sizeOut.textContent = Math.round(st.reticlePx) + ' px';
    global.CP.Canvas.render();
    drawMagnifier();
    if (!fromUI) sample();
  }

  function setZoom(z, fromUI) {
    const st = getState();
    st.zoom = Math.max(2, Math.min(64, z));
    if (zoomSlider) zoomSlider.value = st.zoom;
    if (zoomOut) zoomOut.textContent = st.zoom + '×';
    global.CP.Canvas.render();
    drawMagnifier();
    if (!fromUI) sample();
  }

  function getCorners() {
    const st = getState();
    const { w, h } = global.CP.Canvas.getSize();
    const hw = st.reticlePx / 2;
    return [
      { x: w / 2 - hw, y: h / 2 - hw, sx: -1, sy: -1 },
      { x: w / 2 + hw, y: h / 2 - hw, sx: 1, sy: -1 },
      { x: w / 2 + hw, y: h / 2 + hw, sx: 1, sy: 1 },
      { x: w / 2 - hw, y: h / 2 + hw, sx: -1, sy: 1 },
    ];
  }

  function hitHandle(px, py) {
    return getCorners().some(c => Math.abs(c.x - px) <= HANDLE && Math.abs(c.y - py) <= HANDLE);
  }

  function beginResize(px, py) {
    const st = getState();
    const corner = getCorners().find(c => Math.abs(c.x - px) <= HANDLE && Math.abs(c.y - py) <= HANDLE);
    if (corner) {
      resizeState = { start: st.reticlePx, sx: corner.sx, sy: corner.sy, total: 0 };
    } else {
      resizeState = null;
    }
  }

  function resizeBy(dx, dy) {
    if (!resizeState) return;
    resizeState.total += resizeState.sx * dx + resizeState.sy * dy;
    setSize(resizeState.start + resizeState.total);
  }

  function endResize() { resizeState = null; }

  /* ---------- sampling ---------- */
  function sample() {
    const st = getState();
    if (!st.image) return;
    const px = Math.max(0, Math.min(st.image.width - 1, Math.round(st.view.cx)));
    const py = Math.max(0, Math.min(st.image.height - 1, Math.round(st.view.cy)));
    if (!sampleCanvas) sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1;
    sampleCanvas.height = 1;
    const sctx = sampleCanvas.getContext('2d');
    sctx.drawImage(st.image.canvas, px, py, 1, 1, 0, 0, 1, 1);
    let data;
    try {
      data = sctx.getImageData(0, 0, 1, 1).data;
    } catch (e) { return; }
    const rgb = { r: data[0], g: data[1], b: data[2] };
    st.color = rgb;
    global.CP.Readout.update(rgb);
    drawMagnifier();
    queueSideFx(rgb);
  }

  function setColorFromHistory(rgb) {
    const st = getState();
    st.color = rgb;
    global.CP.Readout.update(rgb);
    if (global.CP.MixUI) global.CP.MixUI.update(rgb);
    drawMagnifier();
  }

  /* ---------- fine navigation ---------- */
  function nudge(dx, dy, coarse) {
    const st = getState();
    if (!st.image) return;
    const step = (1 / st.view.scale) * (coarse ? 10 : 1);
    st.view.cx += dx * step;
    st.view.cy += dy * step;
    global.CP.Canvas.render();
    sample();
  }

  /* ---------- drawing ---------- */
  function draw(ctx, cssW, cssH) {
    const st = getState();
    const cx = cssW / 2, cy = cssH / 2;
    const r = st.reticlePx / 2;
    const Rl = st.reticlePx * 0.85;

    if (st.image) drawLoupe(ctx, cx, cy, Rl, st);

    // reticle square (semi-transparent fill + border)
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);

    // centre crosshair
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
    ctx.stroke();

    // corner handles
    for (const c of getCorners()) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.fillRect(c.x - 4, c.y - 4, 8, 8);
      ctx.strokeRect(c.x - 4, c.y - 4, 8, 8);
    }
  }

  function drawLoupe(ctx, cx, cy, Rl, st) {
    const img = st.image.canvas;
    const wr = st.reticlePx / st.view.scale; // world window (image px)
    const renderW = wr * st.zoom;            // magnified display size
    let sr = wr, dest = renderW;
    if (renderW > Rl * 2) {
      sr = Rl * 2 / st.zoom;
      dest = Rl * 2;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Rl, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#14161c';
    ctx.fillRect(cx - Rl, cy - Rl, Rl * 2, Rl * 2);
    ctx.drawImage(img, st.view.cx - sr / 2, st.view.cy - sr / 2, sr, sr, cx - dest / 2, cy - dest / 2, dest, dest);
    ctx.restore();
    // ring border
    ctx.beginPath();
    ctx.arc(cx, cy, Rl - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /* ---------- magnifier panel ---------- */
  function drawMagnifier() {
    if (!magnifierCtx) return;
    const P = 220;
    magnifierCtx.clearRect(0, 0, P, P);
    const st = getState();
    if (!st.image) {
      magnifierCtx.fillStyle = 'rgba(255,255,255,0.35)';
      magnifierCtx.font = '13px system-ui, sans-serif';
      magnifierCtx.textAlign = 'center';
      magnifierCtx.fillText('No image', P / 2, P / 2);
      return;
    }
    const wr = st.reticlePx / st.view.scale;
    const renderW = wr * st.zoom;
    let sr = wr, dest = renderW;
    if (renderW > P) {
      sr = P / st.zoom;
      dest = P;
    }
    magnifierCtx.drawImage(st.image.canvas, st.view.cx - sr / 2, st.view.cy - sr / 2, sr, sr, (P - dest) / 2, (P - dest) / 2, dest, dest);

    // pixel grid when fully magnified
    if (renderW >= P) {
      magnifierCtx.strokeStyle = 'rgba(0,0,0,0.35)';
      magnifierCtx.lineWidth = 1;
      for (let off = st.zoom / 2; off <= P / 2; off += st.zoom) {
        magnifierCtx.beginPath();
        magnifierCtx.moveTo(P / 2 - off, 0); magnifierCtx.lineTo(P / 2 - off, P);
        magnifierCtx.moveTo(P / 2 + off, 0); magnifierCtx.lineTo(P / 2 + off, P);
        magnifierCtx.moveTo(0, P / 2 - off); magnifierCtx.lineTo(P, P / 2 - off);
        magnifierCtx.moveTo(0, P / 2 + off); magnifierCtx.lineTo(P, P / 2 + off);
        magnifierCtx.stroke();
      }
    }
    // crosshair
    magnifierCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    magnifierCtx.lineWidth = 1;
    magnifierCtx.beginPath();
    magnifierCtx.moveTo(0, P / 2); magnifierCtx.lineTo(P, P / 2);
    magnifierCtx.moveTo(P / 2, 0); magnifierCtx.lineTo(P / 2, P);
    magnifierCtx.stroke();
    // centre sample pixel highlight
    magnifierCtx.fillStyle = 'rgba(0,0,0,0.45)';
    magnifierCtx.strokeStyle = '#ffffff';
    magnifierCtx.lineWidth = 1;
    magnifierCtx.fillRect(P / 2 - st.zoom / 2, P / 2 - st.zoom / 2, st.zoom, st.zoom);
    magnifierCtx.strokeRect(P / 2 - st.zoom / 2, P / 2 - st.zoom / 2, st.zoom, st.zoom);
  }

  function init() {
    sizeSlider = document.getElementById('reticle-size');
    sizeOut = document.getElementById('reticle-size-val');
    zoomSlider = document.getElementById('magnifier-zoom');
    zoomOut = document.getElementById('magnifier-zoom-val');
    magnifierCanvas = document.getElementById('magnifier-canvas');
    magnifierCtx = magnifierCanvas.getContext('2d');

    sizeSlider.addEventListener('input', () => setSize(parseFloat(sizeSlider.value), true));
    zoomSlider.addEventListener('input', () => setZoom(parseFloat(zoomSlider.value), true));
  }

  const Reticle = {
    init,
    setSize,
    setZoom,
    hitHandle,
    beginResize,
    resizeBy,
    endResize,
    sample,
    setColorFromHistory,
    nudge,
    draw,
    drawMagnifier,
  };

  global.CP = global.CP || {};
  global.CP.Reticle = Reticle;
})(window);
