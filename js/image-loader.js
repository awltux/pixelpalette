/*
   Pixel Palette - colour picker & paint mixer
   Copyright (C) 2026 Awltux Limited

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU Affero General Public License as published
   by the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Affero General Public License for more details.

   You should have received a copy of the GNU Affero General Public License
   along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
    global.CP.state.imageOriginal = { canvas: off, width: w, height: h };
    global.CP.Canvas.setImage(off, w, h);
    global.CP.Reticle.sample();
    if (global.CP.GamutFilter) global.CP.GamutFilter.onImageLoaded();
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
    global.CP.state.imageOriginal = { canvas, width: 1600, height: 1000 };
    global.CP.Canvas.setImage(canvas, 1600, 1000);
    global.CP.Reticle.sample();
    if (global.CP.GamutFilter) global.CP.GamutFilter.onImageLoaded();
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
