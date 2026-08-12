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
   demo-image.js - generates a copyright-free, colour-rich demo
   image on an offscreen canvas (colour wheel, ramps, textures).
   ============================================================ */
(function (global) {
  'use strict';

  function generate(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const rgbStr = c => `rgb(${c.r},${c.g},${c.b})`;
    const rgbaStr = (c, a) => `rgba(${c.r},${c.g},${c.b},${a})`;

    // soft base
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#f4ecd8');
    base.addColorStop(1, '#dfe8ee');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // top-left: hue ring colour wheel (sampling favourite)
    const wheelCx = w * 0.24, wheelCy = h * 0.34, wheelR = Math.min(w, h) * 0.26;
    const steps = 360;
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(wheelCx, wheelCy);
      ctx.arc(wheelCx, wheelCy, wheelR, a0, a1);
      ctx.closePath();
      ctx.fillStyle = rgbStr(Color.hslToRgb(i, 90, 55));
      ctx.fill();
    }
    // wheel centre: value / saturation
    const innerR = wheelR * 0.55;
    for (let y = -innerR; y <= innerR; y++) {
      for (let x = -innerR; x <= innerR; x++) {
        const dist = Math.sqrt(x * x + y * y);
        if (dist > innerR) continue;
        const sat = 1 - dist / innerR;
        const val = dist < innerR * 0.25 ? 0.12 : 1;
        const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        ctx.fillStyle = rgbStr(Color.hslToRgb(hue, sat * 100, val * 50));
        ctx.fillRect(wheelCx + x, wheelCy + y, 1, 1);
      }
    }

    // top-right: paint-like blotches (mixed colours) for realism
    const blotchColours = ['#C0392B', '#E67E22', '#F1C40F', '#27AE60', '#2980B9', '#8E44AD', '#34495E', '#16A085'];
    for (let i = 0; i < 9; i++) {
      const bx = w * 0.72 + (Math.random() - 0.5) * w * 0.22;
      const by = h * 0.24 + (Math.random() - 0.5) * h * 0.3;
      const br = (Math.random() * 0.5 + 0.35) * Math.min(w, h) * 0.09;
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      const col = blotchColours[i % blotchColours.length];
      grad.addColorStop(0, col);
      grad.addColorStop(1, rgbaStr(Color.hexToRgb(col), 0.05));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    // bottom band: rainbow gradient strip
    const stripY = h * 0.72, stripH = h * 0.1;
    const grad2 = ctx.createLinearGradient(0, 0, w, 0);
    const stops = [[0, '#e6194B'], [0.17, '#f58231'], [0.33, '#ffe119'], [0.5, '#bfef45'],
                   [0.66, '#3cb44b'], [0.83, '#4363d8'], [1, '#911eb4']];
    for (const [pos, col] of stops) grad2.addColorStop(pos, col);
    ctx.fillStyle = grad2;
    ctx.fillRect(w * 0.06, stripY, w * 0.88, stripH);

    // grey scale ramp under the strip
    for (let i = 0; i < 100; i++) {
      const v = Math.round((i / 99) * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(w * 0.06 + (w * 0.88 / 100) * i, stripY + stripH + h * 0.02, Math.ceil(w * 0.88 / 100) + 1, h * 0.06);
    }

    // speckle noise texture across the middle for sampling detail
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.globalAlpha = 1;

    return canvas;
  }

  global.DemoImage = {
    generate,
  };
})(window);
