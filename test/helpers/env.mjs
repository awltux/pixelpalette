/*
   Pixel Palette - test harness
   Copyright (C) 2026 Awltux Limited. AGPL-3.0-or-later.

   Loads the real browser source files (src/js/*.js) into a Node `vm`
   sandbox that mimics the browser globals (window, document, localStorage,
   canvas, requestAnimationFrame, ...). Because the sources are ordered
   plain-script IIFEs that attach to `window`, running them in dependency
   order reproduces the exact runtime environment so the real code (not a
   copy) is exercised by the tests.
*/

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const JS_DIR = resolve(__dirname, '..', '..', 'src', 'js');

/* ---------- browser mocks ---------- */

function makeGradient() {
  return { addColorStop() {} };
}

function makeContext2d() {
  const gradient = makeGradient();
  const ctx = {
    canvas: null,
    globalAlpha: 1,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    font: '', textAlign: '', textBaseline: '', filter: 'none',
    shadowBlur: 0, shadowColor: '', shadowOffsetX: 0, shadowOffsetY: 0,
    _w: 0, _h: 0,
    setTransform() {}, transform() {}, translate() {}, rotate() {}, scale() {},
    save() {}, restore() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    fill() {}, stroke() {}, clip() {}, clearRect() {}, fillRect() {}, strokeRect() {},
    fillText() {}, strokeText() {}, measureText() { return { width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }; },
    setLineDash() {}, getLineDash() { return []; },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    createPattern() { return {}; },
    drawImage() {},
    putImageData() {},
    getImageData(x, y, w, h) {
      const width = w || ctx._w, height = h || ctx._h;
      return { data: new Uint8ClampedArray(width * height * 4), width, height, colorSpace: 'srgb' };
    },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    isPointInPath() { return false; },
    getImageDataUnchecked() { return this.getImageData(0, 0, this._w, this._h); },
  };
  return ctx;
}

export function makeElement(tag) {
  const listeners = {};
  const el = {
    nodeType: 1,
    tagName: (tag || 'div').toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    childNodes: [],
    hidden: false,
    disabled: false,
    value: '',
    checked: false,
    selected: false,
    textContent: '',
    innerHTML: '',
    title: '',
    width: 0,
    height: 0,
    clientWidth: 0,
    clientHeight: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    setAttribute(k, v) { el[k] = String(v); },
    getAttribute(k) {
      if (k === 'data-i18n' || k === 'data-i18n-attr' || k === 'data-nav') return null;
      return el[k] !== undefined ? String(el[k]) : null;
    },
    removeAttribute(k) { delete el[k]; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { if (listeners[t]) listeners[t] = listeners[t].filter((f) => f !== fn); },
    dispatchEvent(ev) {
      const name = ev && ev.type;
      if (listeners[name]) for (const fn of listeners[name].slice()) fn(ev);
      return true;
    },
    appendChild(c) { el.children.push(c); el.childNodes.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) { el.children.splice(i, 1); el.childNodes.splice(i, 1); } return c; },
    replaceChildren(...cs) { el.children.length = 0; el.childNodes.length = 0; el.children.push(...cs); },
    insertBefore(c) { el.children.push(c); return c; },
    contains() { return false; },
    closest() { return null; },
    focus() {}, blur() {}, click() {},
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false; },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 0, bottom: 0, width: el.width || 0, height: el.height || 0, x: 0, y: 0, toJSON() {} };
    },
    getContext() { if (!el._ctx) { el._ctx = makeContext2d(); el._ctx.canvas = el; } return el._ctx; },
    toDataURL() { return 'data:,'; },
    getImageData() { return el._ctx ? el._ctx.getImageData(0, 0, el.width, el.height) : { data: new Uint8ClampedArray(0), width: 0, height: 0 }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    __listeners: listeners,
  };
  return el;
}

export function makeDocument() {
  const doc = {
    readyState: 'loading', // boot/deferred-init modules wait for DOMContentLoaded
    documentElement: makeElement('html'),
    body: makeElement('body'),
    head: makeElement('head'),
    _els: {},
    register(id, el) { doc._els[id] = el; return el; },
    getElementById(id) { return doc._els[id] || makeElement('div'); },
    createElement(tag) { return tag === 'canvas' ? makeElement('canvas') : makeElement(tag); },
    querySelectorAll() { return []; },
    querySelector(sel) { if (sel && sel.includes('meta')) return makeElement('meta'); return null; },
    addEventListener() {}, removeEventListener() {},
    createEvent() { return { initEvent() {}, addEventListener() {} }; },
  };
  return doc;
}

export function makeLocalStorage() {
  const map = new Map();
  const ls = {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    get length() { return map.size; },
    __map: map,
  };
  return ls;
}

/* ---------- sandbox / loading ---------- */

/* Convert an object produced inside the vm sandbox into a plain host-realm
   object so node:assert deep-equality works (vm objects have cross-realm
   prototypes that fail deepStrictEqual against host literals). */
export function host(o) {
  if (Array.isArray(o)) return Array.from(o, host);
  if (o && typeof o === 'object') {
    const out = {};
    for (const k of Object.keys(o)) out[k] = host(o[k]);
    return out;
  }
  return o;
}

/* Build a sandbox. `sharedLocalStorage` lets several sandboxes share one
   storage mock (for persistence tests). `extra` may carry:
     - globals: object of values to expose as globals before the first source
       runs (must be provided at creation: vm does not see properties added
       to an already-contextified sandbox from outside).
     - module: an object to expose as `module` (with `.exports`) so source
       files that guard on `module.exports` can be exercised. */
export function createSandbox(sharedLocalStorage, extra) {
  const document = makeDocument();
  const localStorage = sharedLocalStorage || makeLocalStorage();
  const sandbox = {
    window: null, // set after construction
    document,
    localStorage,
    navigator: { language: 'en', userAgent: 'node-test' },
    devicePixelRatio: 1,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    performance: { now: () => 0 },
    Math, JSON, Array, Object, Map, Set, WeakMap, WeakSet,
    Float64Array, Float32Array, Uint8ClampedArray, Uint8Array, Uint32Array,
    Number, String, Boolean, parseInt, parseFloat, isFinite, isNaN,
    Date, Promise, Error, TypeError, RangeError, RegExp, Symbol, ArrayBuffer,
  };
  if (extra) {
    if (extra.globals) Object.assign(sandbox, extra.globals);
    if (extra.module) sandbox.module = extra.module;
  }
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

export function runSource(sandbox, rel) {
  const file = resolve(JS_DIR, rel);
  const code = readFileSync(file, 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return sandbox;
}

/* Run a source file in a fresh sandbox that exposes a CommonJS `module`
   object (so files that guard on `module.exports` set it and expose their
   __internal), seeding the sandbox with globals taken from a core sandbox.
   `module` must be present from creation (vm does not see properties added
   to an already-contextified sandbox from outside). Returns module.exports.
   The same globals used to seed are also set as window globals, so a file
   can be driven through either path. */
export function loadModuleExports(core, rel, globals) {
  const s = createSandbox(null, { globals, module: { exports: {} } });
  runSource(s, rel);
  return s.module.exports;
}

/* Load the pure-logic modules in dependency order (browser load order). */
export function loadCore(sandbox) {
  runSource(sandbox, 'color.js');
  runSource(sandbox, 'i18n.js');
  runSource(sandbox, 'palettes.js');
  runSource(sandbox, 'mixing.js');
  runSource(sandbox, 'gamut.js');
  return sandbox;
}

export function freshCore() {
  return loadCore(createSandbox());
}
