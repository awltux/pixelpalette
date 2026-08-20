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
   mixing.js - Kubelka-Munk paint mixing.
   - Reflectance spectra are synthesised from each paint's hex.
   - Opaque media: KM (K/S ratio) solved with NNLS.
   - Glazing media (watercolour): exponential absorption model.
   Exposed on window.Mixing (and module.exports for Node tests).
   ============================================================ */
(function (global) {
  'use strict';

  const Color = global.Color || require('./color.js');

  /* ---------- wavelength grid & CIE 1931 2° CMFs ---------- */
  const STEP = 10;
  const WLS = [];
  for (let l = 380; l <= 730; l += STEP) WLS.push(l);   // 36 samples

  /* x_bar, y_bar, z_bar at 10nm (CIE 1931 2° observer) */
  const CMF = [
    [0.001368, 0.000039, 0.006450], [0.004243, 0.000120, 0.020050],
    [0.014310, 0.000396, 0.067850], [0.043510, 0.001210, 0.207400],
    [0.134380, 0.004000, 0.645600], [0.283900, 0.011600, 1.385600],
    [0.348280, 0.023000, 1.747060], [0.336200, 0.038000, 1.772110],
    [0.290800, 0.060000, 1.669200], [0.195360, 0.090980, 1.287640],
    [0.095640, 0.139020, 0.812950], [0.032010, 0.208020, 0.465180],
    [0.004900, 0.323000, 0.272000], [0.009300, 0.503000, 0.158200],
    [0.063270, 0.710000, 0.078250], [0.165500, 0.862000, 0.042160],
    [0.290400, 0.954000, 0.020300], [0.433450, 0.994950, 0.008750],
    [0.594500, 0.995000, 0.003900], [0.762100, 0.952000, 0.002100],
    [0.916300, 0.870000, 0.001650], [1.026300, 0.757000, 0.001100],
    [1.062200, 0.631000, 0.000800], [1.002600, 0.503000, 0.000340],
    [0.854450, 0.381000, 0.000190], [0.642400, 0.265000, 0.000050],
    [0.447900, 0.175000, 0.000020], [0.283500, 0.107000, 0.000000],
    [0.164900, 0.061000, 0.000000], [0.087400, 0.032000, 0.000000],
    [0.046770, 0.017000, 0.000000], [0.022700, 0.008210, 0.000000],
    [0.011359, 0.004102, 0.000000], [0.005790, 0.002091, 0.000000],
    [0.002899, 0.001047, 0.000000], [0.001440, 0.000520, 0.000000],
  ];

  /* normalised integration weights so a flat R=1 maps to D65 white */
  function integrateWeights() {
    const sumX = CMF.reduce((a, r) => a + r[0], 0) * STEP;
    const sumY = CMF.reduce((a, r) => a + r[1], 0) * STEP;
    const sumZ = CMF.reduce((a, r) => a + r[2], 0) * STEP;
    return CMF.map(r => [
      r[0] * STEP * 0.95047 / sumX,
      r[1] * STEP * 1.0 / sumY,
      r[2] * STEP * 1.08883 / sumZ,
    ]);
  }
  const W = integrateWeights();
  const N = WLS.length;

  function spectrumToRgb(R) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < N; i++) {
      x += R[i] * W[i][0];
      y += R[i] * W[i][1];
      z += R[i] * W[i][2];
    }
    const lin = Color.xyzToLinear(x, y, z);
    return Color.linearToRgb(lin.r, lin.g, lin.b);
  }

  /* ---------- reflectance synthesis from hex ---------- */
  const R_CACHE = new Map();

  /* Gaussian basis functions over wavelength grid */
  const BASIS = (() => {
    const centres = [];
    for (let c = 380; c <= 730; c += 15) centres.push(c);
    const SIG = 46;
    return centres.map(c => WLS.map(l => Math.exp(-0.5 * Math.pow((l - c) / SIG, 2))));
  })();

  function synthesizeReflectance(hex) {
    if (R_CACHE.has(hex)) return R_CACHE.get(hex);
    const rgb = Color.hexToRgb(hex);
    const lin = Color.rgbToLinear(rgb.r, rgb.g, rgb.b);
    const xyz = Color.linearToXyz(lin.r, lin.g, lin.b);

    // bases = gaussians + a constant (white/scattering) column
    const J = BASIS.length;
    const M = [[], [], []];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j <= J; j++) {
        let s = 0;
        const basis = j < J ? BASIS[j] : WLS.map(() => 1);
        for (let l = 0; l < N; l++) s += W[l][i] * basis[l];
        M[i].push(s);
      }
    }
    // non-negative weights: NNLS on M^T w = xyz
    const AT = [M[0], M[1], M[2]];
    const w = nnls(AT, [xyz.x, xyz.y, xyz.z]);

    const R = new Array(N).fill(0);
    for (let l = 0; l < N; l++) {
      let s = 0;
      for (let j = 0; j < J; j++) s += BASIS[j][l] * w[j];
      s += w[J]; // constant basis
      R[l] = Math.max(0.015, Math.min(0.985, s));
    }
    R_CACHE.set(hex, R);
    return R;
  }

  /* ---------- linear algebra ---------- */
  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      [M[col], M[piv]] = [M[piv], M[col]];
      const pv = M[col][col];
      if (Math.abs(pv) < 1e-12) continue;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col] / pv;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = 0; i < n; i++) x[i] = M[i][n] / (M[i][i] || 1e-12);
    return x;
  }

  /* ---------- non-negative least squares (Lawson-Hanson) ---------- */
  function nnls(A, b) {
    const m = A.length, n = A[0].length;
    const x = new Array(n).fill(0);
    const active = new Array(n).fill(false);
    const w = new Array(n).fill(0);
    let iter = 0;
    const maxIter = Math.max(40, n * 30);

    while (iter++ < maxIter) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let i = 0; i < m; i++) s += A[i][j] * (b[i] - dotRow(A, x, i));
        w[j] = s;
      }
      let jStar = -1, maxW = 1e-12;
      for (let j = 0; j < n; j++) if (!active[j] && w[j] > maxW) { maxW = w[j]; jStar = j; }
      if (jStar === -1) break;

      active[jStar] = true;
      let z = solveActive(A, b, active);
      while (z.some((v, j) => active[j] && v <= 0)) {
        let alpha = Infinity, remove = -1;
        for (let j = 0; j < n; j++) {
          if (active[j] && z[j] <= 0 && (x[j] - z[j]) > 1e-12) {
            const a = x[j] / (x[j] - z[j]);
            if (a < alpha) { alpha = a; remove = j; }
          }
        }
        if (remove === -1) break;
        for (let j = 0; j < n; j++) if (active[j]) x[j] += alpha * (z[j] - x[j]);
        active[remove] = false;
        z = solveActive(A, b, active);
      }
      for (let j = 0; j < n; j++) if (active[j]) x[j] = z[j];
    }
    return x;
  }

  function dotRow(A, x, i) {
    let s = 0;
    for (let j = 0; j < x.length; j++) s += A[i][j] * x[j];
    return s;
  }

  function solveActive(A, b, active) {
    const n = A[0].length;
    const idx = [];
    for (let j = 0; j < n; j++) if (active[j]) idx.push(j);
    const out = new Array(n).fill(0);
    const k = idx.length;
    if (k === 0) return out;
    const G = Array.from({ length: k }, () => new Array(k).fill(0));
    const d = new Array(k).fill(0);
    for (let i = 0; i < k; i++) {
      for (let j = i; j < k; j++) {
        let s = 0;
        for (let r = 0; r < A.length; r++) s += A[r][idx[i]] * A[r][idx[j]];
        G[i][j] = G[j][i] = s;
      }
      let s = 0;
      for (let r = 0; r < A.length; r++) s += A[r][idx[i]] * b[r];
      d[i] = s;
    }
    const z = solveLinear(G, d);
    for (let i = 0; i < k; i++) out[idx[i]] = z[i];
    return out;
  }

  /* ---------- Kubelka-Munk physics ---------- */
  const KM_K = (R) => 0.5 * (1 - R) * (1 - R) / R;

  function scatterOf(hex) {
    const rgb = Color.hexToRgb(hex);
    const lin = Color.rgbToLinear(rgb.r, rgb.g, rgb.b);
    const L = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
    return Math.max(0.2, Math.min(2, 0.25 + 1.7 * L));
  }

  /* the colour a paint mixes with: glazing uses the undertone (what shows
     through a thin wash); opaque matching uses the masstone (surface colour) */
  function spectrumHex(p, glaze) {
    if (glaze && p && p.undertone && /^#[0-9a-fA-F]{6}$/.test(p.undertone)) return p.undertone;
    return (p && p.hex) || '#000000';
  }

  /* tinting strength scales a paint's pigment loading (K and S) */
  function paintStrength(p) {
    return (p && typeof p.strength === 'number' && isFinite(p.strength) && p.strength > 0) ? p.strength : 1;
  }

  /* covering power of a paint: 0-1 (0-100 stored in the palette, medium default fallback) */
  function paintOpacity(p, medium) {
    if (p && typeof p.opacity === 'number' && isFinite(p.opacity)) {
      return Math.max(0, Math.min(1, p.opacity / 100));
    }
    return (medium && medium.opacity != null) ? medium.opacity : 0.95;
  }

  function kmReflectance(K, S) {
    const ks = K / S;
    return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
  }

  /* Build solver rows: returns { A, b } given per-paint coefficients. */
  function buildProblem(paints, medium, targetRgb) {
    const paperHex = medium.paper || '#FFFFFF';
    const R_paper = synthesizeReflectance(paperHex);
    const R_target = synthesizeReflectance(Color.rgbToHex(targetRgb.r, targetRgb.g, targetRgb.b));

    const cols = paints.length;
    const A = [], b = [];

    if (medium.type === 'glaze') {
      // A_i(l) = -0.5 ln(R_i / R_paper); b(l) = 0.5 ln(R_paper / R_target)
      // strong pigments need a smaller loading, so absorb more per unit
      const coefs = paints.map(p => {
        const Rp = synthesizeReflectance(spectrumHex(p, true));
        const s = paintStrength(p);
        return WLS.map((_, l) => s * -0.5 * Math.log(Math.max(0.02, Rp[l]) / Math.max(0.02, R_paper[l])));
      });
      for (let l = 0; l < N; l++) {
        const wt = W[l][1]; // luminance weight
        const row = coefs.map(c => c[l] * wt);
        A.push(row);
        b.push(0.5 * Math.log(Math.max(0.02, R_paper[l]) / Math.max(0.02, R_target[l])) * wt);
      }
    } else {
      // opaque KM: minimise sum f_i (K_i - t S_i) where t = target K/S.
      // The mix is applied thickly (coverage ~ medium.opacity), so solve
      // against the masstone target directly; per-paint covering power only
      // affects the final composite.
      const t = WLS.map((_, l) => KM_K(Math.max(0.02, R_target[l])));
      const K = paints.map(p => {
        const Rp = synthesizeReflectance(spectrumHex(p, false));
        const S = scatterOf(p.hex) * paintStrength(p);
        return WLS.map((_, l) => KM_K(Math.max(0.02, Rp[l])) * S);
      });
      const S = paints.map(p => scatterOf(p.hex) * paintStrength(p));
      for (let l = 0; l < N; l++) {
        const wt = W[l][1];
        A.push(K.map((row, i) => (row[l] - t[l] * S[i]) * wt));
        b.push(0);
      }
    }

    // sum-to-1 constraint (heavily weighted) - applies to opaque media only.
    // For glazing, total pigment concentration is a free dilution variable.
    if (medium.type !== 'glaze') {
      const WS = 8;
      A.push(new Array(cols).fill(WS));
      b.push(WS);
    }

    return { A, b };
  }

  function mixOpacity(paints, ratios, medium) {
    let opSum = 0, wtSum = 0;
    for (let i = 0; i < paints.length; i++) {
      opSum += ratios[i] * paintOpacity(paints[i], medium);
      wtSum += ratios[i];
    }
    const weighted = wtSum > 0 ? opSum / wtSum : paintOpacity(null, medium);
    if (medium.type === 'glaze') return 1;
    // a mix is applied thickly enough to at least hit the medium's coverage;
    // more-opaque pigments (e.g. white) raise it beyond that.
    const floor = (medium && medium.opacity != null) ? medium.opacity : 0.95;
    return Math.max(weighted, floor);
  }

  function mixReflectance(paints, ratios, medium) {
    const R_paper = synthesizeReflectance(medium.paper || '#FFFFFF');
    const n = paints.length;
    const R = new Array(N).fill(0);

    if (medium.type === 'glaze') {
      // R = R_paper * exp(-2 * sum f_i A_i)
      for (let l = 0; l < N; l++) {
        let sum = 0;
        for (let i = 0; i < n; i++) {
          const Rp = synthesizeReflectance(spectrumHex(paints[i], true));
          sum += ratios[i] * paintStrength(paints[i]) * (-0.5 * Math.log(Math.max(0.02, Rp[l]) / Math.max(0.02, R_paper[l])));
        }
        R[l] = R_paper[l] * Math.exp(-2 * sum);
      }
    } else {
      let K = new Array(N).fill(0);
      let S = 0;
      for (let i = 0; i < n; i++) {
        const Rp = synthesizeReflectance(spectrumHex(paints[i], false));
        const Si = scatterOf(paints[i].hex) * paintStrength(paints[i]);
        S += ratios[i] * Si;
        for (let l = 0; l < N; l++) K[l] += ratios[i] * KM_K(Math.max(0.02, Rp[l])) * Si;
      }
      for (let l = 0; l < N; l++) R[l] = kmReflectance(Math.max(1e-6, K[l]), Math.max(1e-6, S));
      // composite with ground using fraction-weighted per-paint opacity
      const op = mixOpacity(paints, ratios, medium);
      for (let l = 0; l < N; l++) R[l] = op * R[l] + (1 - op) * R_paper[l];
    }
    return R;
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  const rgbLab = (rgb) => {
    const L = Color.rgbToLab(rgb.r, rgb.g, rgb.b);
    return [L.L, L.a, L.b];
  };
  const labDist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

  /* ---------- perceptual refinement ---------- */

  /* unconstrained linear least-squares solve; returns ratios aligned to paints */
  function linearSolve(paints, targetRgb, medium) {
    const { A, b } = buildProblem(paints, medium, targetRgb);
    let f = nnls(A, b);
    // opaque media are used at full strength (sum = 1).
    // glazing keeps raw pigment loadings (dilution is free).
    if (medium.type !== 'glaze') {
      const total = f.reduce((a, v) => a + v, 0);
      if (total > 1e-9) f = f.map(v => v / total); else f = f.map(() => 0);
    }
    return f;
  }

  function mixDeltaE(paints, ratios, targetRgb, medium) {
    const rgb = spectrumToRgb(mixReflectance(paints, ratios, medium));
    return Color.deltaE(targetRgb, rgb);
  }

  /* fast perceptual scorer for coordinate descent: precomputes the per-paint
     absorption/scatter coefficients once, so each trial only does O(N·n)
     multiplies instead of re-deriving the coefficients (Map lookups, logs)
     every evaluation. */
  function makeScorer(paints, targetRgb, medium) {
    const R_paper = synthesizeReflectance(medium.paper || '#FFFFFF');
    if (medium.type === 'glaze') {
      const A = paints.map(p => {
        const Rp = synthesizeReflectance(spectrumHex(p, true));
        const s = paintStrength(p);
        return WLS.map((_, l) => s * -0.5 * Math.log(Math.max(0.02, Rp[l]) / Math.max(0.02, R_paper[l])));
      });
      return function (f) {
        const R = new Array(N);
        for (let l = 0; l < N; l++) {
          let s = 0;
          for (let i = 0; i < f.length; i++) s += f[i] * A[i][l];
          R[l] = R_paper[l] * Math.exp(-2 * s);
        }
        return Color.deltaE(targetRgb, spectrumToRgb(R));
      };
    }
    const Kc = paints.map(p => {
      const Rp = synthesizeReflectance(spectrumHex(p, false));
      const S = scatterOf(p.hex) * paintStrength(p);
      return WLS.map((_, l) => KM_K(Math.max(0.02, Rp[l])) * S);
    });
    const Sc = paints.map(p => scatterOf(p.hex) * paintStrength(p));
    const O = paints.map(p => paintOpacity(p, medium));
    const floor = (medium && medium.opacity != null) ? medium.opacity : 0.95;
    return function (f) {
      const K = new Array(N).fill(0);
      let S = 0;
      for (let i = 0; i < f.length; i++) {
        const fi = f[i];
        if (fi <= 0) continue;
        S += fi * Sc[i];
        for (let l = 0; l < N; l++) K[l] += fi * Kc[i][l];
      }
      const R = new Array(N);
      const SS = Math.max(1e-6, S);
      for (let l = 0; l < N; l++) {
        const ks = Math.max(1e-6, K[l]) / SS;
        R[l] = 1 + ks - Math.sqrt(ks * ks + 2 * ks);
      }
      let opSum = 0;
      for (let i = 0; i < f.length; i++) opSum += f[i] * O[i];
      const o = Math.max(opSum, floor);
      for (let l = 0; l < N; l++) R[l] = o * R[l] + (1 - o) * R_paper[l];
      return Color.deltaE(targetRgb, spectrumToRgb(R));
    };
  }

  /* deterministic coordinate descent that minimises perceptual deltaE
     directly (the NNLS optimum is in linearised KM space, so it is usually
     not perceptually optimal). Only strictly-better moves are accepted, so
     it never degrades a mix. Opaque ratios are kept at sum 1; glaze amounts
     are free dilution. Step sizes halve when a level finds no improvement,
     and the move budget caps the worst case, keeping solves interactive. */
  function refinePerceptual(paints, ratios, targetRgb, medium, maxEvals) {
    const out = ratios.slice();
    const glaze = medium.type === 'glaze';
    const support = out.map((v, i) => (v > 1e-4 ? i : -1)).filter(i => i >= 0)
      .sort((a, b) => out[b] - out[a])
      .slice(0, 12);
    const budget = maxEvals || 500;
    const score = makeScorer(paints, targetRgb, medium);
    let best = score(out);
    if (best < 0.05) return toResult(paints, out, medium, best);
    let step = 0.06;
    let evals = 1;
    let pass = 0;
    while (step >= 0.0006 && pass++ < 10 && evals < budget) {
      let moved = false;
      for (let a = 0; a < support.length; a++) {
        const i = support[a];
        for (const sign of [-1, 1]) {
          if (evals >= budget) break;
          const trial = out.slice();
          if (glaze) {
            trial[i] = clamp01(trial[i] + sign * step);
          } else {
            trial[i] = Math.max(0, trial[i] + sign * step);
            const tot = trial.reduce((x, v) => x + v, 0);
            if (tot > 1e-9) for (let k = 0; k < trial.length; k++) trial[k] /= tot;
          }
          let changed = false;
          for (let k = 0; k < trial.length; k++) {
            if (Math.abs(trial[k] - out[k]) > 1e-12) { changed = true; break; }
          }
          if (!changed) continue;
          evals++;
          const s2 = score(trial);
          if (s2 < best - 1e-6) {
            best = s2;
            for (let k = 0; k < out.length; k++) out[k] = trial[k];
            moved = true;
          }
        }
      }
      if (!moved) step *= 0.5;
    }
    return toResult(paints, out, medium, best);
  }

  function toResult(paints, ratios, medium, deltaE) {
    const mixRgb = spectrumToRgb(mixReflectance(paints, ratios, medium));
    return { ratios, mixRgb, mixHex: Color.rgbToHex(mixRgb.r, mixRgb.g, mixRgb.b), deltaE };
  }

  /* 'try harder' search: explore alternative paint subsets around the linear
     pick. Candidates are the top non-support paints by linear weight; for
     each we try adding it (when under the maxPaints cap) and replacing the
     smallest current contributor, then re-solve + refine and keep the best.
     Bounded so an opted-in user pays ~20 extra solves. */
  function exploreSubsets(paints, baseWeights, ratios, targetRgb, medium, maxPaints) {
    const n = paints.length;
    const support = ratios.map((v, i) => (v > 1e-4 ? i : -1)).filter(i => i >= 0);
    if (!support.length) return null;
    const capped = maxPaints && maxPaints >= 1 && maxPaints < n;
    const maxSupport = capped ? Math.min(maxPaints, n) : n;

    const MAX_CAND = 6;
    const MAX_TRIALS = 12;
    let best = {
      ratios: ratios.slice(),
      deltaE: mixDeltaE(paints, ratios, targetRgb, medium),
    };

    const cand = baseWeights.map((w, i) => ({ w, i }))
      .filter(x => !support.includes(x.i) && x.w > 1e-6)
      .sort((a, b) => b.w - a.w)
      .slice(0, MAX_CAND);

    let trials = 0;
    for (const c of cand) {
      if (trials >= MAX_TRIALS) break;
      const opts = [];
      if (support.length < maxSupport) opts.push(support.concat([c.i]));
      if (support.length) {
        const small = support.slice().sort((a, b) => ratios[a] - ratios[b])[0];
        opts.push(support.map(i => (i === small ? c.i : i)));
      }
      for (const idx of opts) {
        if (trials >= MAX_TRIALS) break;
        trials++;
        const uniq = Array.from(new Set(idx)).slice(0, maxSupport);
        const active = uniq.map(i => paints[i]);
        const refined = refinePerceptual(active, linearSolve(active, targetRgb, medium), targetRgb, medium);
        if (refined.deltaE < best.deltaE - 1e-6) {
          const full = paints.map(() => 0);
          uniq.forEach((orig, j) => { full[orig] = refined.ratios[j]; });
          best = { ratios: full, deltaE: refined.deltaE, mixRgb: refined.mixRgb, mixHex: refined.mixHex };
        }
      }
    }
    return (best.deltaE < mixDeltaE(paints, ratios, targetRgb, medium) - 1e-6) ? best : null;
  }

  /* rescue for collapsed solves: the linear pick can land on a single,
     perceptually unrelated pigment (e.g. a brown "solved" for a dark blue)
     when the paints closest to the target do much better. The perceptual
     refinement can only adjust already-chosen paints, never add or replace
     them, so we try small subsets here: keep the support and add the top
     nearest paints, AND solve from scratch on the nearest paints alone
     (dropping the bad linear pick). Bounded, only invoked for poor results,
     and only ever accepted when it lowers the error. */
  function rescuePoorSolve(paints, ratios, targetRgb, medium) {
    const support = ratios.map((v, i) => (v > 1e-4 ? i : -1)).filter(i => i >= 0);
    if (!support.length) return null;
    const tLab = rgbLab(targetRgb);
    const paintLabs = paints.map(p => rgbLab(Color.hexToRgb(p.hex)));
    const ranked = paints.map((p, i) => ({ i, d: labDist(tLab, paintLabs[i]) }))
      .filter(x => !support.includes(x.i))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    if (!ranked.length) return null;

    let best = {
      ratios: ratios.slice(),
      deltaE: mixDeltaE(paints, ratios, targetRgb, medium),
    };

    const subsets = [];
    // A) keep the current support and add one / two nearest paints
    for (const c of ranked) subsets.push(support.concat([c.i]));
    if (ranked.length >= 2) subsets.push(support.concat([ranked[0].i, ranked[1].i]));
    // B) replace the (possibly wrong) support with the nearest paints alone
    subsets.push([ranked[0].i]);
    if (ranked.length >= 2) subsets.push([ranked[0].i, ranked[1].i]);
    if (ranked.length >= 3) subsets.push([ranked[0].i, ranked[1].i, ranked[2].i]);

    const seen = new Set();
    for (const idx of subsets) {
      const uniq = Array.from(new Set(idx)).sort((a, b) => a - b);
      const key = uniq.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const active = uniq.map(i => paints[i]);
      const refined = refinePerceptual(active, linearSolve(active, targetRgb, medium), targetRgb, medium);
      if (refined.deltaE < best.deltaE - 1e-6) {
        const full = paints.map(() => 0);
        uniq.forEach((orig, j) => { full[orig] = refined.ratios[j]; });
        best = { ratios: full, deltaE: refined.deltaE, mixRgb: refined.mixRgb, mixHex: refined.mixHex };
      }
    }
    return (best.deltaE < mixDeltaE(paints, ratios, targetRgb, medium) - 1e-6) ? best : null;
  }

  /* ---------- public API ---------- */
  const Mixing = {
    spectrumToRgb,
    synthesizeReflectance,
    mixReflectance,

    /* unconstrained linear least-squares solve, returns ratios aligned to paints */
    _solveInternal(paints, targetRgb, medium) {
      return linearSolve(paints, targetRgb, medium);
    },

    /* solve, optionally restricted to at most maxPaints paints (0 = unlimited).
       uses greedy support selection: pick the top contributors, re-solve on
       just those, and drop any that go to zero - repeat until stable.
       Then always refines the result perceptually (coordinate descent on
       deltaE). With opts.tryHarder it also explores alternative paint subsets. */
    solve(paints, targetRgb, medium, maxPaints, opts) {
      let f = linearSolve(paints, targetRgb, medium);
      const baseWeights = f.slice();
      const n = paints.length;
      if (maxPaints && maxPaints >= 1 && maxPaints < n) {
        let support = f.map((v, i) => ({ v, i }))
          .filter(x => x.v > 1e-9)
          .sort((a, b) => b.v - a.v)
          .slice(0, maxPaints)
          .map(x => x.i);
        for (let pass = 0; pass < 5 && support.length; pass++) {
          const active = support.map(i => paints[i]);
          const fr = linearSolve(active, targetRgb, medium);
          const full = paints.map(() => 0);
          support.forEach((orig, j) => { full[orig] = fr[j]; });
          f = full;
          const next = full.map((v, i) => ({ v, i }))
            .filter(x => x.v > 1e-9)
            .sort((a, b) => b.v - a.v)
            .map(x => x.i);
          if (next.join(',') === support.join(',')) break;
          support = next;
        }
      }
      let result = refinePerceptual(paints, f, targetRgb, medium);
      if (opts && opts.tryHarder && result.deltaE > 0.1) {
        const explored = exploreSubsets(paints, baseWeights, result.ratios, targetRgb, medium, maxPaints);
        if (explored && explored.deltaE < result.deltaE - 1e-6) result = explored;
      }
      // rescue a collapsed solve: when the mix is still poor with a single
      // paint, the linear pick may have chosen a perceptually-unrelated
      // pigment while the nearest paints do much better. Gated to the true
      // degenerate case so normal (and merely out-of-range) solves stay cheap.
      {
        const used = result.ratios.filter(v => v > 0.005).length;
        if (result.deltaE > 12 && used <= 1) {
          const rescued = rescuePoorSolve(paints, result.ratios, targetRgb, medium);
          if (rescued && rescued.deltaE < result.deltaE - 1e-6) result = rescued;
        }
      }
      const conc = result.ratios.reduce((a, v) => a + v, 0);
      const sum = conc || 1;
      return {
        ratios: result.ratios,
        conc,
        normalized: result.ratios.map(v => v / sum),
        mixRgb: result.mixRgb,
        mixHex: result.mixHex,
        deltaE: result.deltaE,
      };
    },

    /* recompute mix colour from recipe amounts - for slider editing.
       amounts are in "fraction of full strength" units (0..1).
       opaque media are renormalised to sum 1; glaze keeps raw amounts. */
    mixColour(paints, amounts, medium) {
      const f = amounts.map(v => Math.max(0, Math.min(1, v)));
      let used = f;
      if (medium.type !== 'glaze') {
        const tot = f.reduce((a, v) => a + v, 0) || 1;
        used = f.map(v => v / tot);
      }
      const mixRgb = spectrumToRgb(mixReflectance(paints, used, medium));
      return { mixRgb, mixHex: Color.rgbToHex(mixRgb.r, mixRgb.g, mixRgb.b) };
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Mixing;
    module.exports.__internal = { synthesizeReflectance, spectrumToRgb, nnls, buildProblem, linearSolve, refinePerceptual, exploreSubsets, rescuePoorSolve };
  } else {
    global.Mixing = Mixing;
  }
})(typeof window !== 'undefined' ? window : globalThis);
