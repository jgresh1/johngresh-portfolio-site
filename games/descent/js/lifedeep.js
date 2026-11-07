// Deep-sea benthic species definitions (streamed like the reef life).
import * as THREE from 'three';
import { branchingCoral } from './flora/corals.js';
import { seaCucumber, brittleStar, seaPen, glassSponge, nodule, crinoid } from './flora/deeplife.js';
import { floraMaterial } from './flora/materials.js';
import { smooth, fbm2 } from './scatter.js';

const pick = (rnd, table) => { let t = rnd() * table.reduce((a, b) => a + b[0], 0); for (const [w, c] of table) { if ((t -= w) <= 0) return c; } return table[0][1]; };
const jit = (c, rnd, a = 0.12) => [c[0] * (1 + (rnd() - 0.5) * a * 2), c[1] * (1 + (rnd() - 0.5) * a * 2), c[2] * (1 + (rnd() - 0.5) * a * 2)];
const PAL = {
  cuke:   [[3, [0.70, 0.46, 0.46]], [3, [0.72, 0.68, 0.64]], [2, [0.32, 0.18, 0.36]], [2, [0.30, 0.22, 0.15]], [1, [0.75, 0.30, 0.10]]],
  brittle:[[3, [0.72, 0.30, 0.10]], [3, [0.74, 0.68, 0.60]], [2, [0.60, 0.10, 0.10]], [1, [0.45, 0.25, 0.5]]],
  pen:    [[3, [0.78, 0.74, 0.68]], [2, [0.70, 0.40, 0.42]], [2, [0.72, 0.42, 0.10]]],
  glass:  [[1, [0.9, 0.92, 0.95]]],
  nod:    [[1, [0.05, 0.045, 0.04]], [1, [0.08, 0.06, 0.045]]],
  black:  [[4, [0.035, 0.035, 0.04]], [2, [0.72, 0.72, 0.70]], [1, [0.55, 0.38, 0.06]]],
  crin:   [[3, [0.78, 0.60, 0.12]], [2.5, [0.70, 0.14, 0.10]], [2, [0.82, 0.80, 0.72]], [1.5, [0.88, 0.40, 0.06]], [1, [0.38, 0.18, 0.44]]],
};

function cellHasDeep(ctx, dmin, dmax) {
  const S = ctx.S, pts = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]];
  for (const [a, b] of pts) { const s = ctx.sample(ctx.x0 + a * S, ctx.z0 + b * S); if (s.depth > dmin - 4 && s.depth < dmax + 4) return true; }
  return false;
}

export function buildDeepLife(scatter) {
  scatter.add({
    id: 'nodules', variants: [0, 1, 2, 3].map((i) => [nodule(2000 + i, { detail: 2 }), nodule(2000 + i, { detail: 1 })]), radius: 28, lodDist: [12], capacity: 26000, castShadow: false,
    material: floraMaterial({ kinds: [17], key: 'deep', roughness: 0.4 }),
    gen(ctx) {
      if (!cellHasDeep(ctx, 1800, 5000)) return;
      const n = Math.round(1.6 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 1800 || s.slope > 0.35) continue;
        const patch = 0.25 + 0.75 * smooth(0.3, 0.6, fbm2(x / 18 + 3000, z / 18, 3));
        if (ctx.rnd() > patch) continue;
        const sc = 0.02 + Math.pow(ctx.rnd(), 2.0) * 0.10;
        ctx.push(Math.floor(ctx.rnd() * 4), x, s.h - 0.012, z, sc, sc * (0.8 + ctx.rnd() * 0.4), sc, ctx.rnd() * 6.28, 0.2, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.nod), ctx.rnd, 0.2));
      }
    },
  });
  scatter.add({
    id: 'cucumber', variants: [0, 1, 2, 3].map((i) => [seaCucumber(2100 + i, { L: 0.22 + 0.06 * i, R: 0.024 + 0.006 * i })]), radius: 32, capacity: 2500, castShadow: false,
    material: floraMaterial({ kinds: [13], key: 'cuke', roughness: 0.45, transl: 0.2 }),
    gen(ctx) {
      if (!cellHasDeep(ctx, 250, 5000)) return;
      const n = Math.round(0.035 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 250 || s.slope > 0.6) continue;
        const sc = 0.8 + ctx.rnd() * 1.1;
        ctx.push(Math.floor(ctx.rnd() * 4), x, s.h + 0.02 * sc, z, sc, sc, sc, ctx.rnd() * 6.28, 0.9, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.cuke), ctx.rnd, 0.1));
      }
    },
  });
  scatter.add({
    id: 'brittle', variants: [0, 1, 2].map((i) => [brittleStar(2200 + i, { D: 0.03 + 0.008 * i, A: 0.14 + 0.03 * i })]), radius: 24, capacity: 8000, castShadow: false,
    material: floraMaterial({ kinds: [14], key: 'brittle', roughness: 0.7 }),
    gen(ctx) {
      if (!cellHasDeep(ctx, 120, 5000)) return;
      const n = Math.round(0.14 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 120 || s.slope > 1.2) continue;
        const clump = smooth(0.4, 0.75, fbm2(x / 3.5 + 2200, z / 3.5, 3));
        if (ctx.rnd() > 0.1 + 0.9 * clump) continue;
        const sc = 0.7 + ctx.rnd() * 0.9;
        ctx.push(Math.floor(ctx.rnd() * 3), x, s.h + 0.004, z, sc, sc, sc, ctx.rnd() * 6.28, 0.9, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.brittle), ctx.rnd, 0.1));
      }
    },
  });
  scatter.add({
    id: 'seapen', variants: [0, 1, 2, 3].map((i) => [seaPen(2300 + i, { H: 0.32 + 0.1 * i, feather: 18 + 2 * i })]), radius: 34, capacity: 2500,
    material: floraMaterial({ kinds: [15], key: 'pen', roughness: 0.55, sway: 0.12, swayMode: 2, swayHeight: 0.6, transl: 0.5 }),
    gen(ctx) {
      if (!cellHasDeep(ctx, 200, 4500)) return;
      const n = Math.round(0.05 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 200 || s.slope > 0.5) continue;
        const patch = smooth(0.4, 0.7, fbm2(x / 9 + 2300, z / 9, 3));
        if (ctx.rnd() > patch * 0.9) continue;
        const sc = 0.7 + ctx.rnd() * 1.0;
        ctx.push(Math.floor(ctx.rnd() * 4), x, s.h - 0.03, z, sc, sc, sc, ctx.rnd() * 6.28, 0.3, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.pen), ctx.rnd, 0.1));
      }
    },
  });
  scatter.add({
    id: 'glasssponge', variants: [0, 1, 2].map((i) => [glassSponge(2400 + i, { h: 0.4 + 0.2 * i, r: 0.08 + 0.02 * i })]), radius: 42, capacity: 1500,
    material: floraMaterial({ kinds: [16], key: 'glass', roughness: 0.5, side: THREE.DoubleSide, transl: 0.7 }),
    gen(ctx) {
      if (!cellHasDeep(ctx, 220, 2600)) return;
      const n = Math.round(0.02 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 220 || s.depth > 2600) continue;
        const patch = smooth(0.42, 0.7, fbm2(x / 12 + 2400, z / 12, 3));
        if (ctx.rnd() > (0.2 + 0.8 * s.m[2]) * patch) continue;
        const sc = 0.7 + ctx.rnd() * 1.3;
        ctx.push(Math.floor(ctx.rnd() * 3), x, s.h - 0.02, z, sc, sc, sc, ctx.rnd() * 6.28, 0.5, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.glass), ctx.rnd, 0.03));
      }
    },
  });
  // feather stars perched on rock, wall faces and boulders
  scatter.add({
    id: 'crinoid', variants: [0, 1, 2, 3].map((i) => [crinoid(2600 + i, { arms: 10 + (i % 2) * 2, A: 0.13 + 0.03 * i, pinnules: 13 }), crinoid(2600 + i, { arms: 8, A: 0.13 + 0.03 * i, pinnules: 5, radial: 3 })]), radius: 46, lodDist: [14], capacity: 6000, castShadow: false,
    material: floraMaterial({ kinds: [22], key: 'crinoid', roughness: 0.6, sway: 0.06, swayMode: 2, swayHeight: 0.2, transl: 0.4, side: THREE.DoubleSide }),
    gen(ctx) {
      if (!cellHasDeep(ctx, 25, 900)) return;
      const n = Math.round(0.10 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 25 || s.depth > 900) continue;
        const rocky = Math.max(s.m[2], smooth(0.35, 1.0, s.slope));
        const clump = smooth(0.42, 0.72, fbm2(x / 5 + 2600, z / 5, 3));
        if (ctx.rnd() > rocky * (0.1 + 0.9 * clump) * 0.9) continue;
        const sc = 0.7 + ctx.rnd() * 1.0;
        ctx.push(Math.floor(ctx.rnd() * 4), x, s.h - 0.01, z, sc, sc, sc, ctx.rnd() * 6.28, 0.85, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.crin), ctx.rnd, 0.1));
      }
    },
  });
  // black / bamboo coral trees on the rocky upper slope
  const blackV = [0, 1, 2].map((i) => [
    branchingCoral(2500 + i, { trunks: 2, depth: 3, len: 0.42, r0: 0.014, radial: 5, upBias: 0.25, wobble: 0.6, kids: [2, 3], childLo: 0.55, childHi: 0.8, spreadMin: 30, spreadMax: 65, segLen: 0.07, taper: 0.7, kind: 15 }),
    branchingCoral(2500 + i, { trunks: 1, depth: 2, len: 0.42, r0: 0.016, radial: 3, kids: [2, 2], segLen: 0.14, taper: 0.7, kind: 15 }),
  ]);
  scatter.add({
    id: 'blackcoral', variants: blackV, radius: 60, lodDist: [24], capacity: 3000,
    material: floraMaterial({ kinds: [15], key: 'pen', roughness: 0.55, sway: 0.08, swayMode: 2, swayHeight: 1.2 }),
    gen(ctx) {
      if (!cellHasDeep(ctx, 120, 1200)) return;
      const n = Math.round(0.03 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 120 || s.depth > 1200) continue;
        const patch = smooth(0.42, 0.7, fbm2(x / 8 + 2500, z / 8, 3));
        if (ctx.rnd() > (0.1 + 0.9 * s.m[2]) * patch) continue;
        const sc = 1.0 + ctx.rnd() * 2.2;
        ctx.push(Math.floor(ctx.rnd() * 3), x, s.h - 0.03, z, sc, sc, sc, ctx.rnd() * 6.28, 0.6, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.black), ctx.rnd, 0.06));
      }
    },
  });
}
