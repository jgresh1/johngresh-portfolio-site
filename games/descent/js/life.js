// Species definitions: geometry variants, materials and placement rules.
import * as THREE from 'three';
import { branchingCoral, fingerCoral, tableCoral, domeCoral, stone, foliose, softCoral } from './flora/corals.js';
import { seagrassTuft } from './flora/seagrass.js';
import { makeFanTexture, fanGeometry, tubeSpongeCluster, barrelSponge, seaWhip, anemone, starfish, urchin, giantClam, algaeBunch } from './flora/reeflife.js';
import { floraMaterial } from './flora/materials.js';
import { smooth, fbm2, vnoise2, CELL } from './scatter.js';

const pick = (rnd, table) => { let t = rnd() * table.reduce((a, b) => a + b[0], 0); for (const [w, c] of table) { if ((t -= w) <= 0) return c; } return table[0][1]; };
const jit = (c, rnd, a = 0.12) => [c[0] * (1 + (rnd() - 0.5) * a * 2), c[1] * (1 + (rnd() - 0.5) * a * 2), c[2] * (1 + (rnd() - 0.5) * a * 2)];

// linear-light albedo palettes
const PAL = {
  staghorn: [[5, [0.60, 0.46, 0.26]], [3.5, [0.74, 0.64, 0.44]], [0.5, [0.44, 0.34, 0.56]], [0.5, [0.66, 0.38, 0.42]], [2.2, [0.46, 0.52, 0.22]], [0.4, [0.34, 0.42, 0.62]], [1.8, [0.66, 0.56, 0.32]]],
  table:    [[5, [0.36, 0.30, 0.16]], [2, [0.48, 0.42, 0.22]], [1, [0.26, 0.30, 0.22]], [1, [0.42, 0.28, 0.30]]],
  massive:  [[4, [0.48, 0.37, 0.23]], [3, [0.37, 0.27, 0.17]], [1.5, [0.36, 0.33, 0.20]], [1.8, [0.62, 0.56, 0.42]], [1.0, [0.50, 0.33, 0.29]], [0.7, [0.38, 0.33, 0.39]]],
  brain:    [[4, [0.40, 0.34, 0.16]], [2, [0.26, 0.34, 0.16]], [1.5, [0.44, 0.24, 0.16]], [1, [0.40, 0.40, 0.30]]],
  stone:    [[5, [0.44, 0.40, 0.33]], [3, [0.35, 0.32, 0.27]], [1.5, [0.27, 0.25, 0.21]], [1, [0.54, 0.50, 0.43]]],
  fan:      [[3.4, [0.80, 0.09, 0.14]], [2.6, [0.46, 0.14, 0.66]], [2.2, [0.92, 0.42, 0.09]], [0.6, [0.86, 0.72, 0.14]], [1.0, [0.80, 0.72, 0.74]], [1.4, [0.70, 0.12, 0.46]]],
  fanDeep:  [[3.2, [0.82, 0.76, 0.78]], [2.4, [0.88, 0.76, 0.18]], [1.6, [0.74, 0.34, 0.58]], [1.0, [0.86, 0.52, 0.16]]],       // pale / yellow / pink fans: red ones turn black in deep blue light
  sponge:   [[2.5, [0.48, 0.20, 0.44]], [3, [0.78, 0.36, 0.09]], [2.2, [0.72, 0.60, 0.16]], [2.2, [0.72, 0.30, 0.36]], [1.4, [0.50, 0.30, 0.20]], [1.4, [0.60, 0.50, 0.70]], [1.6, [0.62, 0.62, 0.50]]],
  barrel:   [[4, [0.40, 0.19, 0.13]], [2, [0.44, 0.34, 0.26]], [2, [0.34, 0.20, 0.30]], [1, [0.50, 0.30, 0.18]]],
  whip:     [[3, [0.36, 0.13, 0.46]], [2, [0.64, 0.50, 0.06]], [1.5, [0.66, 0.24, 0.05]], [1, [0.09, 0.09, 0.11]]],
  anemone:  [[4, [0.32, 0.27, 0.16]], [2, [0.20, 0.32, 0.14]], [1.5, [0.45, 0.28, 0.28]], [1, [0.36, 0.20, 0.34]]],
  star:     [[3, [0.72, 0.26, 0.07]], [2, [0.55, 0.09, 0.07]], [1.5, [0.13, 0.24, 0.56]], [2, [0.55, 0.42, 0.28]]],
  urchin:   [[4, [0.035, 0.03, 0.04]], [1, [0.20, 0.07, 0.24]], [1, [0.30, 0.10, 0.08]]],
  algae:    [[3, [0.24, 0.30, 0.09]], [3, [0.36, 0.26, 0.09]], [1.5, [0.46, 0.13, 0.16]], [1, [0.18, 0.33, 0.20]]],
  clam:     [[1, [0.5, 0.45, 0.35]]],
  foliose:  [[3, [0.42, 0.36, 0.20]], [2, [0.34, 0.38, 0.24]], [1.4, [0.52, 0.40, 0.42]], [0.8, [0.34, 0.30, 0.46]], [1.2, [0.55, 0.47, 0.30]]],
  soft:     [[3, [0.60, 0.52, 0.38]], [2.6, [0.46, 0.34, 0.22]], [1.0, [0.40, 0.44, 0.28]], [1.0, [0.50, 0.42, 0.52]], [1.4, [0.66, 0.52, 0.38]]],
  pocillo:  [[3, [0.62, 0.36, 0.38]], [3, [0.66, 0.58, 0.42]], [2, [0.44, 0.32, 0.20]], [1, [0.55, 0.42, 0.56]]],
  grass:    [[5, [0.16, 0.34, 0.09]], [3, [0.20, 0.38, 0.10]], [2.4, [0.13, 0.27, 0.08]], [1.2, [0.24, 0.36, 0.13]], [0.7, [0.30, 0.30, 0.10]], [0.4, [0.36, 0.28, 0.12]]],
};

// quick cell pre-filter: does any of 5 sample points reach `thr` on mask channel ch (or is the depth band possible)?
function cellHas(ctx, ch, thr, dmin, dmax) {
  const S = ctx.S, pts = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]];
  let ok = false;
  for (const [a, b] of pts) {
    const s = ctx.sample(ctx.x0 + a * S, ctx.z0 + b * S);
    if (s.depth > dmin - 2 && s.depth < dmax + 2 && (ch < 0 || s.m[ch] > thr)) { ok = true; break; }
  }
  return ok;
}

export function buildLife(scatter) {
  const out = {};

  // ---------------- seagrass ----------------
  // six tuft sizes (sprouts -> big clumps), two seeds each; the placement picks the size from the local density so the meadow has
  // dense clumps, thin edges and bare patches instead of evenly planted tufts
  const GSZ = [
    { blades: 4, lenLo: 0.10, lenHi: 0.26, radius: 0.025 }, { blades: 7, lenLo: 0.14, lenHi: 0.34, radius: 0.035 }, { blades: 10, lenLo: 0.18, lenHi: 0.42, radius: 0.045 },
    { blades: 14, lenLo: 0.20, lenHi: 0.50, radius: 0.055 }, { blades: 19, lenLo: 0.22, lenHi: 0.58, radius: 0.065 }, { blades: 26, lenLo: 0.24, lenHi: 0.68, radius: 0.080 },
  ];
  const grassVar = [];
  GSZ.forEach((g, si) => [0, 1].forEach((k) => grassVar.push([
    seagrassTuft(10 + si * 7 + k, { ...g, rows: 6 }),
    seagrassTuft(20 + si * 7 + k, { ...g, blades: Math.max(3, Math.round(g.blades * 0.55)), rows: 3, width: 0.021 }),
  ])));
  scatter.add({
    id: 'seagrass', variants: grassVar, radius: 36, lodDist: [14], capacity: 30000, castShadow: false,
    material: floraMaterial({ kinds: [9], key: 'grass', roughness: 0.6, sway: 0.16, swayMode: 1, side: THREE.DoubleSide, transl: 0.9 }),
    gen(ctx) {
      if (!cellHas(ctx, 3, 0.08, 0.8, 16)) return;
      const n = Math.round(9 * ctx.S * ctx.S * 0.6);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 0.9 || s.depth > 15) continue;
        const g = s.m[3] * smooth(0.25, 0.6, fbm2(x / 5.5 + 30, z / 5.5, 3) + 0.25);
        const cl = smooth(0.26, 0.62, fbm2(x / 1.7 + 11, z / 1.7, 2));                      // 0 gap .. 1 dense clump
        const clump = 0.22 + 0.78 * cl;
        if (ctx.rnd() > smooth(0.10, 0.5, g) * clump * 1.9) continue;
        const size = Math.max(0, Math.min(5, Math.floor(cl * 4.0 + g * 1.6 + (ctx.rnd() - 0.5) * 2.4)));     // dense + healthy -> big tufts
        const sc = 0.70 + Math.pow(ctx.rnd(), 1.5) * 0.65;
        ctx.push(size * 2 + (ctx.rnd() < 0.5 ? 0 : 1), x, s.h - 0.02, z, sc, sc * (0.75 + ctx.rnd() * 0.6), sc, ctx.rnd() * 6.283, 0, null, jit(pick(ctx.rnd, PAL.grass), ctx.rnd, 0.12));
      }
    },
  });

  // ---------------- staghorn / branching ----------------
  const stagV = [0, 1, 2, 3, 4].map((i) => [
    branchingCoral(100 + i, i < 3 ? { trunks: 9, depth: 3, len: 0.22, r0: 0.022, kids: [2, 3], childLo: 0.60, childHi: 0.85, spreadMin: 26, spreadMax: 50, segLen: 0.05, radial: 8, taper: 0.35, lean: 1.7, baseR: 0.20, upBias: 1.3, wobble: 0.30 }
                                 : { trunks: 5, depth: 3, len: 0.34, r0: 0.026, kids: [2, 2], childLo: 0.62, childHi: 0.80, spreadMin: 30, spreadMax: 48, segLen: 0.055, radial: 8, taper: 0.30, lean: 1.0, baseR: 0.10, upBias: 1.4, wobble: 0.22 }),
    branchingCoral(100 + i, { trunks: 7, depth: 2, radial: 5, segLen: 0.07, kids: [2, 3], len: 0.26, r0: 0.028, lean: 1.6, baseR: 0.19, upBias: 1.25, taper: 0.35 }),
    branchingCoral(100 + i, { trunks: 5, depth: 1, radial: 4, segLen: 0.13, kids: [2, 3], len: 0.30, r0: 0.034, lean: 1.4, baseR: 0.17, upBias: 1.2 }),
    branchingCoral(100 + i, { trunks: 3, depth: 1, radial: 3, segLen: 0.22, kids: [2, 2], len: 0.30, r0: 0.040, lean: 1.3, baseR: 0.15, upBias: 1.2 }),
  ]);
  scatter.add({
    id: 'staghorn', shadow: { r: 0.42, k: 0.9, range: 30 }, variants: stagV, radius: 85, lodDist: [5, 13, 34], capacity: 18000,
    material: floraMaterial({ kinds: [0], key: 'coral', roughness: 0.88, bump: 1.0 }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.1, 1, 30)) return;
      const n = Math.round(0.80 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 1.0 || s.depth > 28 || s.slope > 0.95) continue;
        const patch = smooth(0.40, 0.66, fbm2(x / 8.5, z / 8.5, 3));
        const p = s.m[1] * (0.35 + 0.65 * patch) * (1 - smooth(14, 30, s.depth) * 0.7);
        if (ctx.rnd() > p * 1.1) continue;
        const sc = 0.55 + ctx.rnd() * 0.95;
        ctx.push(Math.floor(ctx.rnd() * 5), x, s.h - 0.04, z, sc, sc * (0.85 + ctx.rnd() * 0.4), sc, ctx.rnd() * 6.283, 0.35, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.staghorn), ctx.rnd));
      }
    },
  });

  // ---------------- finger coral (shallow flat) ----------------
  const fingV = [0, 1].map((i) => [fingerCoral(200 + i), branchingCoral(200 + i, { trunks: 3, depth: 1, len: 0.15, r0: 0.026, radial: 4, segLen: 0.08, taper: 0.28 })]);
  scatter.add({
    id: 'finger', shadow: { r: 0.32, k: 0.8, range: 24 }, variants: fingV, radius: 50, lodDist: [20], capacity: 9000,
    material: floraMaterial({ kinds: [0], key: 'coral', roughness: 0.88 }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.1, 0.8, 9)) return;
      const n = Math.round(0.8 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 0.8 || s.depth > 9 || s.slope > 0.7) continue;
        const patch = smooth(0.45, 0.7, fbm2(x / 6.5 + 50, z / 6.5, 3));
        if (ctx.rnd() > s.m[1] * patch * 0.9) continue;
        const sc = 0.6 + ctx.rnd() * 0.8;
        ctx.push(Math.floor(ctx.rnd() * 2), x, s.h - 0.03, z, sc, sc, sc, ctx.rnd() * 6.283, 0.3, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.massive), ctx.rnd));
      }
    },
  });

  // ---------------- table corals ----------------
  const tableV = [0, 1, 2, 3].map((i) => [tableCoral(300 + i, { branchlets: 0, ring: 12, seg: 56 }), tableCoral(300 + i, { branchlets: 0, ring: 5, seg: 24 })]);
  scatter.add({
    id: 'table', shadow: { r: 0.95, k: 0.9, range: 40 }, variants: tableV, radius: 90, lodDist: [32], capacity: 3000,
    material: floraMaterial({ kinds: [1], key: 'coral', roughness: 0.9, tipCol: [0.62, 0.58, 0.42] }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.25, 2, 26)) return;
      const n = Math.round(0.03 * ctx.S * ctx.S);
      for (let i = 0; i < n * 7; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 2 || s.depth > 26 || s.slope > 0.6) continue;
        const patch = smooth(0.4, 0.7, fbm2(x / 14 + 90, z / 14, 3));
        if (ctx.rnd() > s.m[1] * patch * 0.9 * 0.34) continue;
        const sc = 0.6 + ctx.rnd() * 1.1;
        ctx.push(Math.floor(ctx.rnd() * 4), x, s.h - 0.05, z, sc, sc * (0.8 + ctx.rnd() * 0.3), sc, ctx.rnd() * 6.283, 0.2, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.table), ctx.rnd));
      }
    },
  });

  // ---------------- foliose (lettuce) corals ----------------
  const folV = [0, 1, 2, 3].map((i) => [foliose(2000 + i, { plates: 10 + (i % 2) * 2, R: 0.36 + 0.05 * i, seg: 32, ring: 8 }), foliose(2000 + i, { plates: 6, R: 0.36 + 0.05 * i, ring: 4, seg: 16 })]);
  scatter.add({
    id: 'foliose', shadow: { r: 0.5, k: 0.85, range: 30 }, variants: folV, radius: 70, lodDist: [22], capacity: 3000,
    material: floraMaterial({ kinds: [20], key: 'foliose', roughness: 0.8, side: THREE.DoubleSide, tipCol: [0.85, 0.80, 0.62] }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.10, 4, 45)) return;
      const n = Math.round(0.14 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 4 || s.depth > 45) continue;
        const patch = smooth(0.42, 0.68, fbm2(x / 9 + 1900, z / 9, 3));
        const slope = 0.4 + 0.6 * smooth(0.10, 0.9, s.slope);
        if (ctx.rnd() > s.m[1] * patch * slope * 0.9) continue;
        const sc = 0.55 + ctx.rnd() * 1.1;
        ctx.push(Math.floor(ctx.rnd() * 4), x, s.h - 0.04, z, sc, sc * (0.85 + ctx.rnd() * 0.3), sc, ctx.rnd() * 6.283, 0.55, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.foliose), ctx.rnd));
      }
    },
  });

  // ---------------- soft corals (leather / mushroom) ----------------
  const softV = [0, 1, 2].map((i) => [softCoral(2100 + i, { R: 0.20 + 0.05 * i, H: 0.12 + 0.03 * i }), softCoral(2100 + i, { R: 0.20 + 0.05 * i, H: 0.12 + 0.03 * i, seg: 20, ring: 4 })]);
  scatter.add({
    id: 'softcoral', shadow: { r: 0.34, k: 0.8, range: 26 }, variants: softV, radius: 60, lodDist: [20], capacity: 4000,
    material: floraMaterial({ kinds: [21], key: 'softcoral', roughness: 0.7, sway: 0.05, swayMode: 2, swayHeight: 0.3, side: THREE.DoubleSide }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.08, 1.5, 30)) return;
      const n = Math.round(0.16 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 1.5 || s.depth > 30 || s.slope > 0.9) continue;
        const patch = smooth(0.48, 0.70, fbm2(x / 6 + 2100, z / 6, 3));
        if (ctx.rnd() > s.m[1] * patch * 0.85) continue;
        const sc = 0.6 + ctx.rnd() * 0.9;
        ctx.push(Math.floor(ctx.rnd() * 3), x, s.h - 0.03, z, sc, sc * (0.85 + ctx.rnd() * 0.3), sc, ctx.rnd() * 6.283, 0.4, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.soft), ctx.rnd));
      }
    },
  });

  // ---------------- compact bushy heads (Pocillopora-like) ----------------
  const pocV = [0, 1, 2, 3].map((i) => [
    domeCoral(2200 + i, { detail: 14, kind: 2, height: 0.80, lobes: 0.22, nodules: 1.0, nodScale: 4 + 0.5 * i, nodAmp: 0.26 }),
    domeCoral(2200 + i, { detail: 6, kind: 2, height: 0.80, lobes: 0.22 }),
  ]);
  scatter.add({
    id: 'pocillo', shadow: { r: 0.32, k: 0.8, range: 24 }, variants: pocV, radius: 50, lodDist: [16], capacity: 4000,
    material: floraMaterial({ kinds: [2], key: 'coral', roughness: 0.86 }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.15, 1, 16)) return;
      const n = Math.round(0.14 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 1 || s.depth > 16 || s.slope > 0.8) continue;
        const patch = smooth(0.45, 0.70, fbm2(x / 8 + 1700, z / 8, 3));
        if (ctx.rnd() > s.m[1] * patch * 0.9) continue;
        const sc = 0.22 + Math.pow(ctx.rnd(), 1.4) * 0.34;
        ctx.push(Math.floor(ctx.rnd() * 4), x, s.h - 0.03 * sc, z, sc, sc * (0.85 + ctx.rnd() * 0.3), sc, ctx.rnd() * 6.283, 0.3, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.pocillo), ctx.rnd));
      }
    },
  });

  // ---------------- massive + brain corals ----------------
  const massH = [0.62, 0.46, 0.32, 0.78], massL = [0.36, 0.52, 0.44, 0.30];        // dome / lumpy mound / low plate-like / tall column-ish
  const massV = [
    ...[0, 1, 2, 3].map((i) => [domeCoral(400 + i, { detail: 14, kind: 2, height: massH[i], lobes: massL[i], nodules: i === 0 || i === 3 ? 0.55 : 0.0, nodScale: 4.5 + i }), domeCoral(400 + i, { detail: 6, kind: 2, height: massH[i], lobes: massL[i], nodules: i === 0 || i === 3 ? 0.55 : 0.0, nodScale: 4.5 + i }), domeCoral(400 + i, { detail: 3, kind: 2, height: massH[i], lobes: massL[i] })]),
    ...[0, 1].map((i) => [domeCoral(440 + i, { detail: 14, kind: 3, height: 0.55, lobes: 0.20 }), domeCoral(440 + i, { detail: 6, kind: 3, height: 0.55, lobes: 0.20 }), domeCoral(440 + i, { detail: 3, kind: 3, height: 0.55, lobes: 0.20 })]),
  ];
  scatter.add({
    id: 'massive', shadow: { r: 0.72, k: 1.0, range: 34 }, variants: massV, radius: 75, lodDist: [7, 20], capacity: 6000,
    material: floraMaterial({ kinds: [2,3], key: 'coral', roughness: 0.86 }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.08, 1, 70)) return;
      const n = Math.round(0.30 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 1 || s.depth > 70 || s.slope > 1.1) continue;
        const patch = 0.3 + 0.7 * smooth(0.35, 0.65, fbm2(x / 11 + 200, z / 11, 3));
        if (ctx.rnd() > Math.min(1, s.m[1] * 1.6) * patch * 0.8) continue;
        const v = Math.floor(ctx.rnd() * 6), brain = v >= 4;
        const sc = 0.30 + Math.pow(ctx.rnd(), 2.3) * 1.25;
        ctx.push(v, x, s.h - 0.06 * sc, z, sc, sc * (0.9 + ctx.rnd() * 0.3), sc, ctx.rnd() * 6.283, 0.5, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, brain ? PAL.brain : PAL.massive), ctx.rnd));
      }
    },
  });

  // ---------------- stones, rubble and boulders ----------------
  const stoneV = [
    ...[0, 1, 2, 3, 4].map((i) => [stone(500 + i, { detail: 2 }), stone(500 + i, { detail: 1 })]),
    ...[0, 1, 2, 3].map((i) => [stone(520 + i, { detail: 5, rough: 0.34 }), stone(520 + i, { detail: 3, rough: 0.34 })]),     // big boulders: smooth silhouettes
  ];
  scatter.add({
    id: 'stones', shadow: { r: 0.70, k: 0.9, range: 26 }, variants: stoneV, radius: 55, lodDist: [20], capacity: 14000,
    material: floraMaterial({ kinds: [4], key: 'coral', roughness: 0.92 }),
    gen(ctx) {
      const n = Math.round(0.5 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 0.8 || s.depth > 120) continue;
        const rubble = 0.10 + 0.9 * s.m[1] * smooth(60, 120, x + 150);   // more rubble around the reef
        if (ctx.rnd() > rubble * 0.6) continue;
        const big = ctx.rnd() < 0.06;
        const sc = big ? 0.5 + ctx.rnd() * 1.1 : 0.05 + Math.pow(ctx.rnd(), 2.2) * 0.35;
        ctx.push(big ? 5 + Math.floor(ctx.rnd() * 4) : Math.floor(ctx.rnd() * 5), x, s.h - 0.03 * sc, z, sc, sc * (0.8 + ctx.rnd() * 0.4), sc, ctx.rnd() * 6.283, 0.7, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.stone), ctx.rnd, 0.1));
      }
    },
  });

  // ---------------- sea fans (three lattice textures) ----------------
  for (let ti = 0; ti < 3; ti++) {
    const tex = makeFanTexture(900 + ti * 7, 1024, { gap: 10 - ti, half: 0.92 + 0.04 * ti, tipR: 0.89 + 0.02 * ti, cross: 1.0 });
    const geo = [0, 1, 2].map((i) => [fanGeometry(910 + ti * 10 + i, { W: 1.6, H: 1.0, nu: 10, nv: 8 }), fanGeometry(910 + ti * 10 + i, { W: 1.6, H: 1.0, nu: 4, nv: 3 })]);
    scatter.add({
      id: 'fan' + ti, variants: geo, radius: 60, lodDist: [24], capacity: 4200,
      material: floraMaterial({ kinds: [6], key: 'fan', roughness: 0.75, sway: 0.18, swayMode: 2, swayHeight: 1.0, side: THREE.DoubleSide, alphaTest: 0.4, map: tex, transl: 0.5 }),
      gen(ctx) {
        if (!cellHas(ctx, 1, 0.12, 6, 95)) return;
        const n = Math.round(0.42 * ctx.S * ctx.S);
        for (let i = 0; i < n; i++) {
          const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
          const s = ctx.sample(x, z);
          if (s.depth < 6 || s.depth > 95) continue;
          const steep = smooth(0.25, 1.2, s.slope);
          const patch = smooth(0.30, 0.6, fbm2(x / 7 + 400 + ti * 50, z / 7, 3));
          const deepF = smooth(20, 38, s.depth);
          if (ctx.rnd() > s.m[1] * (0.35 + 0.65 * steep) * (0.25 + 0.75 * patch) * 0.55 * (1 - 0.45 * deepF)) continue;
          const sc = 0.40 + Math.pow(ctx.rnd(), 1.6) * 0.95;
          const yaw = 0.96 + (ctx.rnd() - 0.5) * 0.9 + (ctx.rnd() < 0.5 ? 0 : 3.14159);
          ctx.push(Math.floor(ctx.rnd() * 3), x, s.h - 0.03, z, sc, sc * (0.8 + ctx.rnd() * 0.4), sc, yaw, 0.15 + 0.6 * steep, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, ctx.rnd() < deepF ? PAL.fanDeep : PAL.fan), ctx.rnd, 0.08));
        }
      },
    });
  }

  // ---------------- sponges ----------------
  scatter.add({
    id: 'tubesponge', shadow: { r: 0.30, k: 0.8, range: 26 }, variants: [0, 1, 2, 3, 4, 5].map((i) => [tubeSpongeCluster(700 + i)]), radius: 46, capacity: 2500,
    material: floraMaterial({ kinds: [5], key: 'sponge', roughness: 0.9, side: THREE.DoubleSide }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.12, 9, 90)) return;
      const n = Math.round(0.20 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 9 || s.depth > 90) continue;
        // clustered: sponges grow in loose colonies, not evenly spread
        const patch = smooth(0.50, 0.72, fbm2(x / 9 + 600, z / 9, 3));
        if (ctx.rnd() > s.m[1] * patch * 0.5) continue;
        const sc = 0.6 + ctx.rnd() * 1.4;
        ctx.push(Math.floor(ctx.rnd() * 6), x, s.h - 0.03, z, sc, sc * (0.8 + ctx.rnd() * 0.5), sc, ctx.rnd() * 6.28, 0.6, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.sponge), ctx.rnd, 0.1));
      }
    },
  });
  scatter.add({
    id: 'barrel', shadow: { r: 0.62, k: 0.9, range: 36 }, variants: [0, 1, 2].map((i) => [barrelSponge(800 + i, { h: 0.55 + 0.15 * i, r: 0.36 + 0.06 * i })]), radius: 70, capacity: 600,
    material: floraMaterial({ kinds: [5], key: 'sponge', roughness: 0.92, side: THREE.DoubleSide }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.15, 8, 75)) return;
      const n = Math.round(0.040 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 8 || s.depth > 75 || s.slope > 2.2) continue;
        if (ctx.rnd() > s.m[1] * 0.5) continue;
        const sc = 0.55 + Math.pow(ctx.rnd(), 1.4) * 1.3;
        ctx.push(Math.floor(ctx.rnd() * 3), x, s.h - 0.06 * sc, z, sc, sc, sc, ctx.rnd() * 6.28, 0.7, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.barrel), ctx.rnd, 0.08));
      }
    },
  });

  // ---------------- sea whips ----------------
  scatter.add({
    id: 'whip', variants: [0, 1, 2, 3].map((i) => [seaWhip(1000 + i, { L: 0.8 + 0.3 * i, kids: i % 3 })]), radius: 50, capacity: 4000,
    material: floraMaterial({ kinds: [5], key: 'whip', roughness: 0.7, sway: 0.24, swayMode: 2, swayHeight: 1.0 }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.12, 6, 80)) return;
      const n = Math.round(0.12 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 6 || s.depth > 80) continue;
        const patch = smooth(0.35, 0.65, fbm2(x / 5 + 800, z / 5, 3));
        if (ctx.rnd() > s.m[1] * patch * 0.9) continue;
        const sc = 0.6 + ctx.rnd() * 0.9;
        ctx.push(Math.floor(ctx.rnd() * 4), x, s.h - 0.02, z, sc, sc, sc, ctx.rnd() * 6.28, 0.8, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.whip), ctx.rnd, 0.1));
      }
    },
  });

  // ---------------- anemones ----------------
  scatter.add({
    id: 'anemone', variants: [0, 1, 2].map((i) => [anemone(1100 + i, { tent: 320, R: 0.20, H: 0.09, tl: 0.078, radial: 4, seg: 6, thick: 1.5 }), anemone(1100 + i, { tent: 110, R: 0.20, H: 0.09, tl: 0.078, radial: 3, seg: 3, thick: 1.5 })]), radius: 32, lodDist: [9], capacity: 1200, castShadow: false,
    material: floraMaterial({ kinds: [7], key: 'anemone', roughness: 0.6, sway: 0.05, swayMode: 2, swayHeight: 0.3, side: THREE.DoubleSide, tipCol: [0.58, 0.40, 0.52] }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.1, 1.5, 16)) return;
      const n = Math.round(0.02 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 1.5 || s.depth > 16 || s.slope > 0.8) continue;
        if (ctx.rnd() > s.m[1] * 0.9) continue;
        const sc = 0.7 + ctx.rnd() * 1.2;
        ctx.push(Math.floor(ctx.rnd() * 3), x, s.h - 0.02, z, sc, sc, sc, ctx.rnd() * 6.28, 0.4, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.anemone), ctx.rnd, 0.1));
      }
    },
  });

  // ---------------- starfish, urchins, clams, algae ----------------
  scatter.add({
    id: 'starfish', variants: [0, 1, 2].map((i) => [starfish(1200 + i, { R: 0.12 + 0.05 * i })]), radius: 22, capacity: 1500, castShadow: false,
    material: floraMaterial({ kinds: [11], key: 'star', roughness: 0.8, side: THREE.DoubleSide }),
    gen(ctx) {
      const n = Math.round(0.012 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 1 || s.depth > 25 || s.slope > 0.5) continue;
        if (ctx.rnd() > 0.15 + 0.85 * s.m[0]) continue;
        const sc = 0.7 + ctx.rnd() * 0.9;
        ctx.push(Math.floor(ctx.rnd() * 3), x, s.h + 0.004, z, sc, sc, sc, ctx.rnd() * 6.28, 0.9, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.star), ctx.rnd, 0.1));
      }
    },
  });
  scatter.add({
    id: 'urchin', variants: [0, 1].map((i) => [urchin(1300 + i, { R: 0.04 + 0.01 * i, spines: 200 })]), radius: 24, capacity: 1500, castShadow: false,
    material: floraMaterial({ kinds: [12], key: 'urchin', roughness: 0.6 }),
    gen(ctx) {
      if (!cellHas(ctx, 2, 0.15, 1, 20)) return;
      const n = Math.round(0.02 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 1 || s.depth > 20) continue;
        const patch = smooth(0.45, 0.7, fbm2(x / 4 + 1300, z / 4, 3));
        if (ctx.rnd() > (0.2 + s.m[1] * 0.8) * (0.3 + s.m[2]) * patch) continue;
        const sc = 0.7 + ctx.rnd() * 0.9;
        ctx.push(Math.floor(ctx.rnd() * 2), x, s.h - 0.005, z, sc, sc, sc, ctx.rnd() * 6.28, 0.5, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.urchin), ctx.rnd, 0.1));
      }
    },
  });
  scatter.add({
    id: 'clam', shadow: { r: 0.62, k: 0.9, range: 24 }, variants: [0, 1, 2].map((i) => [giantClam(1400 + i, { R: 0.38 + 0.05 * i })]), radius: 45, capacity: 400,
    material: floraMaterial({ kinds: [10], key: 'clam', roughness: 0.45, side: THREE.DoubleSide }),
    gen(ctx) {
      if (!cellHas(ctx, 1, 0.1, 2, 18)) return;
      const n = Math.round(0.012 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 2 || s.depth > 18 || s.slope > 0.5) continue;
        if (ctx.rnd() > s.m[1] * 0.8) continue;
        const sc = 0.6 + ctx.rnd() * 1.0;
        ctx.push(Math.floor(ctx.rnd() * 3), x, s.h - 0.03 * sc, z, sc, sc, sc, ctx.rnd() * 6.28, 0.5, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.clam), ctx.rnd, 0.1));
      }
    },
  });
  scatter.add({
    id: 'algae', variants: [0, 1, 2].map((i) => [algaeBunch(1500 + i, { blades: 8 + i * 2 })]), radius: 30, capacity: 6000, castShadow: false,
    material: floraMaterial({ kinds: [8], key: 'algae', roughness: 0.6, sway: 0.10, swayMode: 1, side: THREE.DoubleSide, transl: 0.5 }),
    gen(ctx) {
      if (!cellHas(ctx, 2, 0.15, 1, 16)) return;
      const n = Math.round(0.4 * ctx.S * ctx.S);
      for (let i = 0; i < n; i++) {
        const x = ctx.x0 + ctx.rnd() * ctx.S, z = ctx.z0 + ctx.rnd() * ctx.S;
        const s = ctx.sample(x, z);
        if (s.depth < 1 || s.depth > 16) continue;
        const patch = smooth(0.4, 0.68, fbm2(x / 5 + 1500, z / 5, 3));
        if (ctx.rnd() > s.m[2] * (0.2 + s.m[1] * 0.8) * patch) continue;
        const sc = 0.7 + ctx.rnd() * 0.8;
        ctx.push(Math.floor(ctx.rnd() * 3), x, s.h - 0.01, z, sc, sc, sc, ctx.rnd() * 6.28, 0.5, [s.nx, s.ny, s.nz], jit(pick(ctx.rnd, PAL.algae), ctx.rnd, 0.12));
      }
    },
  });
  return out;
}
