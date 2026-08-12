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
   color.js - colour conversions and metrics.
   Works in browser and Node (module.exports guard for tests).
   ============================================================ */
(function (global) {
  'use strict';

  const clamp255 = v => Math.max(0, Math.min(255, Math.round(v)));
  const clamp01 = v => Math.max(0, Math.min(1, v));

  const Color = {};

  Color.hexToRgb = function (hex) {
    let h = String(hex).trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 0, g: 0, b: 0 };
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  Color.rgbToHex = function (r, g, b) {
    const to2 = v => ('0' + clamp255(v).toString(16)).slice(-2);
    return '#' + to2(r) + to2(g) + to2(b);
  };

  Color.rgbToHsl = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  Color.rgbToCmyk = function (r, g, b) {
    const c = 1 - r / 255, m = 1 - g / 255, y = 1 - b / 255;
    const k = Math.min(c, m, y);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
    const denom = 1 - k;
    return {
      c: Math.round((c - k) / denom * 100),
      m: Math.round((m - k) / denom * 100),
      y: Math.round((y - k) / denom * 100),
      k: Math.round(k * 100),
    };
  };

  /* linear / gamma */
  const SRGB_2_LINEAR = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const LINEAR_2_SRGB = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

  Color.rgbToLinear = function (r, g, b) {
    return {
      r: SRGB_2_LINEAR(r / 255),
      g: SRGB_2_LINEAR(g / 255),
      b: SRGB_2_LINEAR(b / 255),
    };
  };

  Color.linearToRgb = function (r, g, b) {
    return { r: clamp255(LINEAR_2_SRGB(clamp01(r)) * 255), g: clamp255(LINEAR_2_SRGB(clamp01(g)) * 255), b: clamp255(LINEAR_2_SRGB(clamp01(b)) * 255) };
  };

  /* XYZ (D65) */
  Color.linearToXyz = function (r, g, b) {
    return {
      x: 0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
      y: 0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
      z: 0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
    };
  };

  Color.xyzToLinear = function (x, y, z) {
    return {
      r: 3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
      g: -0.9692660 * x + 1.8760108 * y + 0.0415560 * z,
      b: 0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    };
  };

  Color.rgbToLab = function (r, g, b) {
    const lin = Color.rgbToLinear(r, g, b);
    const { x, y, z } = Color.linearToXyz(lin.r, lin.g, lin.b);
    const fx = x / 0.95047, fy = y / 1.0, fz = z / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
    const L = 116 * f(fy) - 16;
    const a = 500 * (f(fx) - f(fy));
    const b_ = 200 * (f(fy) - f(fz));
    return { L, a, b: b_ };
  };

  /* CIE76 colour difference */
  Color.deltaE = function (rgb1, rgb2) {
    const l1 = Color.rgbToLab(rgb1.r, rgb1.g, rgb1.b);
    const l2 = Color.rgbToLab(rgb2.r, rgb2.g, rgb2.b);
    return Math.sqrt((l1.L - l2.L) ** 2 + (l1.a - l2.a) ** 2 + (l1.b - l2.b) ** 2);
  };

  /* perceptually even hue steps for demo image */
  Color.rainbow = function (i, n) {
    const hue = i / n;
    const { r, g, b } = Color.hslToRgb(hue * 360, 1, 0.5);
    return { r, g, b };
  };

  Color.hslToRgb = function (h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = s / 100; l = l / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs(hp % 2 - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = l - c / 2;
    return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Color;
  else global.Color = Color;
})(typeof window !== 'undefined' ? window : globalThis);
