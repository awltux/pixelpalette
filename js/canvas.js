/* ============================================================
   canvas.js - main canvas: pan, pinch/wheel zoom, fit/reset.
   Uses window.CP.state set up by app.js.
   ============================================================ */
(function (global) {
  'use strict';

  const MAX_SCALE = 64;
  const MIN_SCALE = 0.01;

  let canvas, ctx, wrap;
  let dpr = 1;
  let cssW = 0, cssH = 0;

  function getState() { return global.CP.state; }

  const pointers = new Map();
  let panLast = null;
  let pinchLast = null;

  function worldFromScreen(sx, sy) {
    const s = getState().view;
    return {
      x: (sx - cssW / 2) / s.scale + s.cx,
      y: (sy - cssH / 2) / s.scale + s.cy,
    };
  }

  function screenFromWorld(wx, wy) {
    const s = getState().view;
    return {
      x: (wx - s.cx) * s.scale + cssW / 2,
      y: (wy - s.cy) * s.scale + cssH / 2,
    };
  }

  function clampScale(sc) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, sc));
  }

  function render() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const img = getState().image;
    if (img) {
      const s = getState().view;
      ctx.save();
      ctx.translate(cssW / 2, cssH / 2);
      ctx.scale(s.scale, s.scale);
      ctx.translate(-s.cx, -s.cy);
      ctx.drawImage(img.canvas, 0, 0);
      ctx.restore();
    }
    global.CP.Reticle.draw(ctx, cssW, cssH);
  }

  let rafPending = false;
  function requestRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; render(); });
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    cssW = Math.max(10, rect.width);
    cssH = Math.max(10, rect.height);
    dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    render();
  }

  function pan(dxScreen, dyScreen) {
    const s = getState().view;
    s.cx -= dxScreen / s.scale;
    s.cy -= dyScreen / s.scale;
    clampCentre();
    requestRender();
    afterViewChange();
  }

  function clampCentre() {
    const s = getState().view;
    const img = getState().image;
    if (!img) return;
    const halfW = cssW / 2 / s.scale;
    const halfH = cssH / 2 / s.scale;
    s.cx = Math.max(-halfW, Math.min(img.width + halfW, s.cx));
    s.cy = Math.max(-halfH, Math.min(img.height + halfH, s.cy));
  }

  function zoomAt(screenX, screenY, factor) {
    const before = worldFromScreen(screenX, screenY);
    const ns = clampScale(getState().view.scale * factor);
    const s = getState().view;
    s.scale = ns;
    s.cx = before.x - (screenX - cssW / 2) / ns;
    s.cy = before.y - (screenY - cssH / 2) / ns;
    clampCentre();
    requestRender();
    afterViewChange();
  }

  function zoomBy(factor) {
    zoomAt(cssW / 2, cssH / 2, factor);
  }

  function fit() {
    const img = getState().image;
    if (!img) { requestRender(); return; }
    const pad = 24;
    const scale = Math.min((cssW - pad) / img.width, (cssH - pad) / img.height);
    getState().view.scale = Math.max(0.05, Math.min(4, scale));
    getState().view.cx = img.width / 2;
    getState().view.cy = img.height / 2;
    requestRender();
    afterViewChange();
  }

  function reset() { fit(); }

  function afterViewChange() {
    global.CP.Reticle.sample();
  }

  /* ---------- pointer handling ---------- */
  function handlePointerDown(e) {
    if (!getState().image) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const r = global.CP.Reticle;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      panLast = { x: e.clientX, y: e.clientY, mode: r.hitHandle(px, py) ? 'resize' : 'pan' };
      r.beginResize(px, py);
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchLast = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        mid: { x: (pts[0].x + pts[1].x) / 2 - rectLeft(), y: (pts[0].y + pts[1].y) / 2 - rectTop() },
      };
      panLast = null;
    }
    e.preventDefault();
  }

  function rectLeft() { return canvas.getBoundingClientRect().left; }
  function rectTop() { return canvas.getBoundingClientRect().top; }

  function handlePointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && panLast) {
      const dx = e.clientX - panLast.x;
      const dy = e.clientY - panLast.y;
      panLast.x = e.clientX;
      panLast.y = e.clientY;
      if (panLast.mode === 'resize') {
        global.CP.Reticle.resizeBy(dx, dy);
      } else {
        pan(dx, dy);
      }
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (pinchLast && pinchLast.dist > 0) {
        const factor = dist / pinchLast.dist;
        zoomAt(mid.x - rectLeft(), mid.y - rectTop(), factor);
      }
      if (pinchLast && panLast === null) {
        const mx = mid.x - rectLeft(), my = mid.y - rectTop();
        pan(mid.x - pinchLast.mid.x, my - pinchLast.mid.y);
      }
      pinchLast = { dist, mid: { x: mid.x - rectLeft(), y: mid.y - rectTop() } };
    }
    e.preventDefault();
  }

  function handlePointerEnd(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchLast = null;
    if (pointers.size === 0) panLast = null;
    global.CP.Reticle.endResize();
  }

  function handleWheel(e) {
    if (!getState().image) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0016);
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  }

  /* ---------- public ---------- */
  const CanvasModule = {
    init() {
      canvas = document.getElementById('canvas');
      wrap = document.getElementById('canvas-wrap');
      ctx = canvas.getContext('2d');

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerup', handlePointerEnd);
      canvas.addEventListener('pointercancel', handlePointerEnd);
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      canvas.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

      new ResizeObserver(resize).observe(wrap);
      resize();
    },
    render,
    requestRender,
    resize,
    fit,
    reset,
    zoomBy,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(1 / 1.25),
    zoomAt,
    setImage(imgCanvas, w, h) {
      getState().image = { canvas: imgCanvas, width: w, height: h };
      fit();
    },
    getView: () => getState().view,
    setView(v) { getState().view = v; },
    getState,
    getSize: () => ({ w: cssW, h: cssH }),
    worldFromScreen,
    screenFromWorld,
  };

  global.CP = global.CP || {};
  global.CP.Canvas = CanvasModule;
})(window);
