/* ============================================================
   image-loader.js - file picker + drag-drop + demo image.
   ============================================================ */
(function (global) {
  'use strict';

  function onImageLoaded(imgEl) {
    const w = imgEl.naturalWidth;
    const h = imgEl.naturalHeight;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    global.CP.state.image = { canvas: off, width: w, height: h };
    global.CP.Canvas.setImage(off, w, h);
    global.CP.Reticle.sample();
  }

  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onImageLoaded(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function loadDemo() {
    const canvas = global.DemoImage.generate(1600, 1000);
    global.CP.state.image = { canvas, width: 1600, height: 1000 };
    global.CP.Canvas.setImage(canvas, 1600, 1000);
    global.CP.Reticle.sample();
  }

  function init() {
    const btnOpen = document.getElementById('btn-open');
    const fileInput = document.getElementById('file-input');
    const wrap = document.getElementById('canvas-wrap');

    btnOpen.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      loadFile(fileInput.files[0]);
      fileInput.value = '';
    });

    wrap.addEventListener('dragover', (e) => e.preventDefault());
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadFile(file);
    });
  }

  global.CP = global.CP || {};
  global.CP.ImageLoader = { init, loadFile, loadDemo };
})(window);
