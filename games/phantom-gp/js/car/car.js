// The car. Units: metres. x forward, y up, z to the car's right.
// "s" = distance behind the front axle; X(s) converts to world x.
import * as THREE from 'three';
import {
  v3, clamp, lerp, smooth, DEG, curve, table, range, uniqSorted, halfSection, fullSection, cutAtZ, resample, symRing, ringYZ,
  airfoil, ellipseLoop, squircleLoop, loft, mirrorZ, sweepRings, tube, strut, rod, roundedShape, plate, projectDecal,
} from './geo.js';
import * as TX from './tex.js';
import { buildDriver } from './driver.js';

export const XF = 1.8, WHEELBASE = 3.6;
export const X = (s) => XF - s;
const R_TYRE = 0.3605, HW_F = 0.1625, HW_R = 0.2125;
export const ZF = 1.0 - HW_F, ZR = 1.0 - HW_R;

const supY = (p, z) => p.ym + (p.yt - p.ym) * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(z) / p.w), p.nt)), 1 / p.nt);
const supZ = (p, y) => (y >= p.ym
  ? p.w * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, (y - p.ym) / (p.yt - p.ym)), p.nt)), 1 / p.nt)
  : p.w * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, (p.ym - y) / (p.ym - p.yb)), p.nb)), 1 / p.nb));
const inset = (p, d) => ({ ...p, w: p.w - d, yt: p.yt - d, yb: p.yb + d });
// Exact surface normals from the implicit super-ellipse family (mesh-independent, so reflections stay clean).
const gradHalf = (pf, s, z, y) => {
  const F = (ss) => { const p = pf(ss), top = y >= p.ym, h = top ? p.yt - p.ym : p.ym - p.yb, n = top ? p.nt : p.nb; return Math.pow(Math.abs(z) / p.w, n) + Math.pow(Math.abs(y - p.ym) / h, n); };
  const p = pf(s), top = y >= p.ym, h = top ? p.yt - p.ym : p.ym - p.yb, n = top ? p.nt : p.nb, d = 0.004;
  const g = v3(-(F(s + d) - F(s - d)) / (2 * d), n / h * Math.pow(Math.abs(y - p.ym) / h, n - 1) * (top ? 1 : -1), n / p.w * Math.pow(Math.abs(z) / p.w, n - 1) * Math.sign(z));
  return g.lengthSq() > 1e-12 ? g.normalize() : null;
};
const gradFull = (pf, s, z, y) => {
  const quad = (p) => { const dz = z - p.zc, dy = y - p.yc; return p.n[dz >= 0 ? (dy >= 0 ? 0 : 1) : (dy < 0 ? 2 : 3)]; };
  const F = (ss) => { const p = pf(ss), n = quad(p); return Math.pow(Math.abs(z - p.zc) / p.hw, n) + Math.pow(Math.abs(y - p.yc) / p.hh, n); };
  const p = pf(s), n = quad(p), dz = z - p.zc, dy = y - p.yc, d = 0.004;
  const g = v3(-(F(s + d) - F(s - d)) / (2 * d), n / p.hh * Math.pow(Math.abs(dy) / p.hh, n - 1) * Math.sign(dy), n / p.hw * Math.pow(Math.abs(dz) / p.hw, n - 1) * Math.sign(dz));
  return g.lengthSq() > 1e-12 ? g.normalize() : null;
};

// ---------------------------------------------------------------- section tables
const secA = table(['yt', 'yb', 'w', 'k', 'nt', 'nb'], [
  [-1.085, 0.214, 0.153, 0.058, 0.50, 2.2, 2.2],
  [-1.00, 0.238, 0.150, 0.080, 0.50, 2.3, 2.3],
  [-0.80, 0.290, 0.158, 0.100, 0.50, 2.4, 2.4],
  [-0.50, 0.372, 0.198, 0.128, 0.50, 2.6, 2.5],
  [-0.20, 0.452, 0.238, 0.160, 0.50, 2.8, 2.6],
  [0.00, 0.502, 0.258, 0.184, 0.50, 3.0, 2.8],
  [0.30, 0.570, 0.245, 0.218, 0.48, 3.2, 3.0],
  [0.60, 0.624, 0.185, 0.252, 0.46, 3.3, 3.2],
  [0.90, 0.662, 0.105, 0.286, 0.45, 3.4, 3.4],
  [1.20, 0.676, 0.058, 0.316, 0.45, 3.6, 3.6],
  [1.50, 0.688, 0.050, 0.336, 0.45, 4.0, 3.8],
  [1.80, 0.744, 0.050, 0.342, 0.45, 5.0, 3.8],
  [2.10, 0.752, 0.050, 0.335, 0.45, 5.0, 3.8],
  [2.25, 0.735, 0.050, 0.300, 0.45, 4.4, 3.8],      // from here the shoulder fairs into the engine cover and is inside it by s = 2.55
  [2.40, 0.690, 0.050, 0.235, 0.45, 3.6, 3.8],
  [2.55, 0.615, 0.050, 0.172, 0.45, 3.0, 3.8],
  [2.70, 0.545, 0.050, 0.140, 0.45, 2.6, 3.8],
  [3.05, 0.440, 0.050, 0.110, 0.45, 2.6, 3.8],
]);
const pA = (s) => { const p = secA(s); p.ym = p.yb + p.k * (p.yt - p.yb); return p; };

const secB = table(['yt', 'yb', 'w', 'ym', 'nt', 'nb'], [
  [1.90, 1.000, 0.850, 0.100, 0.925, 2.6, 2.6],
  [1.96, 1.008, 0.805, 0.112, 0.910, 2.6, 2.6],
  [2.06, 1.008, 0.700, 0.128, 0.860, 2.3, 2.6],
  [2.20, 0.998, 0.520, 0.165, 0.690, 1.9, 2.6],
  [2.40, 0.956, 0.300, 0.195, 0.480, 1.6, 2.6],
  [2.70, 0.872, 0.200, 0.212, 0.370, 1.45, 2.6],
  [3.00, 0.778, 0.150, 0.196, 0.330, 1.45, 2.6],
  [3.30, 0.672, 0.140, 0.162, 0.310, 1.5, 2.6],
  [3.60, 0.568, 0.150, 0.126, 0.310, 1.6, 2.6],
  [3.85, 0.515, 0.196, 0.130, 0.345, 2.4, 2.7],
  [3.93, 0.510, 0.200, 0.134, 0.350, 2.8, 2.8],
]);
const pB = (s) => secB(s);

const secC = table(['zo', 'zi', 'yt', 'yb', 'n0', 'n1'], [
  [1.42, 0.735, 0.325, 0.545, 0.395, 2.8, 3.0],
  [1.55, 0.765, 0.325, 0.560, 0.372, 2.6, 3.0],
  [1.75, 0.785, 0.320, 0.568, 0.330, 2.4, 3.0],
  [2.00, 0.790, 0.27, 0.560, 0.270, 2.3, 3.0],
  [2.30, 0.775, 0.20, 0.530, 0.190, 2.3, 3.0],
  [2.60, 0.725, 0.13, 0.465, 0.110, 2.4, 3.2],
  [2.90, 0.640, 0.12, 0.365, 0.065, 2.5, 3.4],
  [3.15, 0.545, 0.10, 0.270, 0.046, 2.5, 3.6],
  [3.35, 0.450, 0.08, 0.158, 0.044, 2.6, 3.6],
  [3.50, 0.370, 0.06, 0.092, 0.042, 2.8, 3.6],
  [3.64, 0.300, 0.05, 0.057, 0.040, 2.8, 3.6],
]);
const pC = (s) => { const q = secC(s); return { zc: (q.zo + q.zi) / 2, hw: (q.zo - q.zi) / 2, yc: (q.yt + q.yb) / 2, hh: (q.yt - q.yb) / 2, n: [q.n0, q.n1, 4, 3] }; };

// cockpit opening (plan view half width)
const CK0 = 0.93, CK1 = 1.80, RF = 0.15, RR = 0.20;
function cockpitW(s) {
  if (s <= CK0 || s >= CK1) return 0;
  const W = lerp(0.178, 0.262, smooth(0.95, 1.50, s));
  let f = 1;
  if (s < CK0 + RF) { const u = 1 - (s - CK0) / RF; f = Math.sqrt(Math.max(0, 1 - u * u)); }
  if (s > CK1 - RR) { const u = 1 - (CK1 - s) / RR; f = Math.min(f, Math.sqrt(Math.max(0, 1 - u * u))); }
  return W * f;
}
const endDense = (s0, r, dir) => { const o = []; for (let k = 0; k <= 14; k++) o.push(s0 + dir * r * (1 - Math.cos(k / 14 * Math.PI / 2))); return o; };

// floor
const zE = curve([[0.70, 0.50], [0.85, 0.64], [1.10, 0.74], [1.40, 0.79], [1.80, 0.80], [2.80, 0.80], [3.00, 0.78], [3.12, 0.72], [3.20, 0.62], [3.26, 0.555], [3.40, 0.53], [3.95, 0.53]]);
const yF = (s, z) => {
  const az = Math.abs(z);
  let y = 0.052;
  y += smooth(1.30, 0.72, s) * (0.045 + 0.20 * smooth(0.62, 0.22, az));
  y += 0.24 * Math.pow(smooth(3.10, 3.95, s), 1.4) * smooth(0.53, 0.46, az);
  return y;
};

// livery: soft masks in metres -> [accent, carbon, white]
const yCarbon = curve([[-1.14, 0.10], [-0.6, 0.20], [0.0, 0.335], [0.6, 0.33], [1.2, 0.30], [1.45, 0.33], [2.0, 0.30], [2.8, 0.26], [3.4, 0.30], [4.0, 0.36]]);
// Cooling louvres: real slots cut through the sidepod top (mask alpha), nine per side.
const LV = { s0: 2.13, pitch: 0.045, n: 9, len: 0.021, z0: 0.385, z1: 0.555 };
function louvreAlpha(s, y, az) {
  if (y < 0.44 || s < LV.s0 - 0.03 || s > LV.s0 + LV.pitch * (LV.n - 1) + 0.03 || az < LV.z0 - 0.02 || az > LV.z1 + 0.02) return 1;
  const sc = LV.s0 + clamp(Math.round((s - LV.s0) / LV.pitch), 0, LV.n - 1) * LV.pitch;
  const zc = (LV.z0 + LV.z1) / 2, hz = (LV.z1 - LV.z0) / 2 - LV.len / 2;
  return clamp(0.5 + (Math.hypot(Math.max(Math.abs(az - zc) - hz, 0), s - sc) - LV.len / 2) / 0.003, 0, 1);
}
function livery(x, y, z, out) {
  const s = XF - x, E = 0.0035, band = 0.034;
  const dK = Math.max(yCarbon(s) - y, (s - (2.96 + (y - 0.3) * 1.15 + 2.3 * Math.max(0, Math.abs(z) - 0.17))) * 0.55);
  out[1] = clamp(0.5 + dK / (2 * E), 0, 1);
  out[0] = clamp(0.5 + (dK + band) / (2 * E), 0, 1);
  out[2] = clamp(0.5 + (0.0045 - Math.abs(dK + band + 0.02)) / (2 * E), 0, 1);
  out[3] = louvreAlpha(s, y, Math.abs(z));
}

// ---------------------------------------------------------------- helpers
function wingStation(le, chord, pitch, loop, up) {
  const c = Math.cos(pitch), s = Math.sin(pitch), U = up || v3(0, 1, 0);
  const L = v3(-c, 0, 0).addScaledVector(U, s), Nn = v3(s, 0, 0).addScaledVector(U, c);
  return loop.map(([xa, ya]) => v3().copy(le).addScaledVector(L, xa * chord).addScaledVector(Nn, ya * chord));
}
function lathe(segs, S = 96, o = {}) {
  const rings = [], groups = [], meta = [];
  for (const sg of segs) {
    const from = rings.length;
    sg.pts.forEach(([z, r], k) => {
      const ring = [];
      for (let j = 0; j <= S; j++) { const a = 2 * Math.PI * j / S; ring.push(v3(r * Math.cos(a), r * Math.sin(a), z)); }
      ring[S] = ring[0].clone(); rings.push(ring); meta.push({ sg, k, n: sg.pts.length });
    });
    groups.push({ from, to: rings.length - 1, mat: sg.mat || 0 });
  }
  return loft(rings, { groups, uvFn: (i, j, p, frac, uv) => { const m = meta[i]; return m.sg.uv ? m.sg.uv(p, j / S, m.k / (m.n - 1)) : uv; }, ...o });
}
// Shape in plan view (x, z) extruded along y.
function plateXZ(pts, radius, thick, y, bevel = 0.002) {
  const g = plate(roundedShape(pts, radius), thick, bevel);
  g.rotateX(Math.PI / 2); g.translate(0, y, 0);
  return g;
}

// ---------------------------------------------------------------- wheel
function buildWheel(hw, M, front) {
  const spin = new THREE.Group(), S = 144;
  const ctrl = [[hw - 0.050, 0.2300], [hw - 0.030, 0.2400], [hw - 0.010, 0.2620], [hw - 0.0005, 0.2950], [hw - 0.006, 0.3250], [hw - 0.022, 0.3460], [hw - 0.050, 0.3560], [hw - 0.095, 0.3597]];
  const full = [...ctrl.map(([z, r]) => [-z, r]), [0, R_TYRE], ...ctrl.slice().reverse()];
  const dense = new THREE.CatmullRomCurve3(full.map(([z, r]) => v3(z, r, 0)), false, 'centripetal').getPoints(700).map((p) => [p.x, p.y]);
  let i1 = dense.findIndex((p) => p[1] >= 0.3478), i2 = dense.length - 1 - [...dense].reverse().findIndex((p) => p[1] >= 0.3478);
  const tyre = lathe([
    { pts: resample(dense.slice(0, i1 + 1), 22), mat: 0, uv: (p, a, k) => [a, k] },
    { pts: resample(dense.slice(i1, i2 + 1), 36), mat: 1 },
    { pts: resample(dense.slice(i2), 22), mat: 0, uv: (p, a, k) => [1 - a, 1 - k] },
  ], S);
  const tm = new THREE.Mesh(tyre, [front ? M.sidewallF : M.sidewall, M.tread]); tm.castShadow = tm.receiveShadow = true; spin.add(tm);

  const zo = hw - 0.036, rc = 0.2215;
  const rim = lathe([
    { pts: [[-(hw - 0.036), 0.2440], [-(hw - 0.046), 0.2300], [hw - 0.046, 0.2300], [zo - 0.004, 0.2380], [zo, 0.2445], [zo + 0.0025, 0.2400], [zo + 0.001, 0.2330], [zo - 0.008, 0.2270], [zo - 0.016, 0.2240], [zo - 0.017, rc]], mat: 0 },
    { pts: [[zo - 0.017, rc], [zo - 0.021, 0.19], [zo - 0.028, 0.12], [zo - 0.034, 0.068]], mat: 1, uv: (p) => [0.5 + p.x / (2 * rc), 0.5 + p.y / (2 * rc)] },
    { pts: [[zo - 0.034, 0.068], [zo - 0.035, 0.062], [zo - 0.048, 0.058], [zo - 0.078, 0.056], [zo - 0.079, 0.002]], mat: 0 },
  ], 96);
  const rm = new THREE.Mesh(rim, [M.rim, front ? M.coverF : M.cover]); rm.castShadow = rm.receiveShadow = true; spin.add(rm);
  /* The inside of the wheel. The rim, cover and hub are one skin seen from outside; from behind (between the brake
     drum and the rim) and through any hairline between parts you looked straight through the wheel at the road
     beyond. A dark wall behind the cover and a liner inside the barrel close it: no line of sight passes through. */
  const zd = zo - 0.060, liner = lathe([{ pts: [[zd, 0.050], [zd, 0.2288], [-(hw - 0.046), 0.2288], [-(hw - 0.037), 0.2425]] }], 72);
  const lm = new THREE.Mesh(liner, M.duct); lm.receiveShadow = true; spin.add(lm);

  // wheel nut + axle stub
  const nut = lathe([{ pts: [[zo - 0.079, 0.040], [zo - 0.050, 0.040], [zo - 0.044, 0.036], [zo - 0.044, 0.022], [zo - 0.062, 0.020], [zo - 0.062, 0.002]] }], 24);
  const nm = new THREE.Mesh(nut, M.nut); nm.castShadow = nm.receiveShadow = true; spin.add(nm);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, g = new THREE.BoxGeometry(0.008, 0.012, 0.03);
    const t = new THREE.Mesh(g, M.nut); t.position.set(Math.cos(a) * 0.042, Math.sin(a) * 0.042, zo - 0.064); t.rotation.z = a; t.castShadow = true; spin.add(t);
  }
  // static brake drum, built for a wheel whose outboard side is +z
  const drum = lathe([{ pts: [[-hw + 0.040, 0.2180], [-hw - 0.014, 0.2180], [-hw - 0.021, 0.2110], [-hw - 0.022, 0.002]] }], 72);
  return { spin, drum, hw };
}

// Tyre under load: flat contact patch and a slight sidewall bulge above it.
function loadTyre(mesh, hw) {
  mesh.updateWorldMatrix(true, false);
  const m = mesh.matrixWorld, inv = m.clone().invert(), p = mesh.geometry.attributes.position, t = v3(), zd = v3(0, 0, 1).transformDirection(m);
  for (let i = 0; i < p.count; i++) {
    t.fromBufferAttribute(p, i); const lz = t.z; t.applyMatrix4(m);
    if (t.y < 0.1) {
      const k = 1 - smooth(0, 0.1, t.y);
      t.addScaledVector(zd, Math.sign(lz) * 0.0075 * k * k * smooth(0.45, 0.95, Math.abs(lz) / hw));
      t.y = 0.5 * (t.y + Math.sqrt(t.y * t.y + 0.0035 * 0.0035));
      t.applyMatrix4(inv); p.setXYZ(i, t.x, t.y, t.z);
    }
  }
  p.needsUpdate = true; mesh.geometry.computeBoundingSphere(); mesh.geometry.computeBoundingBox();
}

// ================================================================= car
export function buildCar(M, opt = {}) {
  const car = new THREE.Group(); car.name = 'car';
  const add = (g, m, o = {}) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = o.cast !== false; mesh.receiveShadow = true; (o.parent || car).add(mesh); return mesh; };
  const pair = (g, m, o) => [add(g, m, o), add(mirrorZ(g), m, o)];

  // ---------------------------------------------------------- A: nose + survival cell
  const KA = 46;
  const ringsA = [];
  { const p0 = pA(-1.085);
    for (const u of [1, 0.985, 0.94, 0.86, 0.74, 0.58, 0.4, 0.2]) {
      const f = Math.sqrt(1 - u * u), p = { ...p0, w: p0.w * f, yt: p0.ym + (p0.yt - p0.ym) * f, yb: p0.ym - (p0.ym - p0.yb) * f };
      ringsA.push(symRing(X(-1.085 - 0.05 * u), resample(halfSection(p), KA)));
    } }
  const stA = uniqSorted([...range(-1.085, 3.05, 0.02), ...endDense(CK0, RF, 1), ...endDense(CK1, RR, -1)]);
  for (const s of stA) ringsA.push(symRing(X(s), resample(cutAtZ(halfSection(pA(s)), cockpitW(s)), KA)));
  const gA = loft(ringsA, { capEnd: true, normalFn: (i, j, p) => (i >= 8 ? gradHalf(pA, XF - p.x, p.z, p.y) : null) });
  add(gA, M.livery(TX.liveryMask(ringsA, livery, 2048, 1024)));

  const emptyG = new THREE.Group(); emptyG.name = 'emptySeat'; emptyG.visible = false; car.add(emptyG);
  let swRef = null;
  // cockpit rim, tub, headrest
  const stCk = uniqSorted([...range(CK0, CK1, 0.02), ...endDense(CK0, RF, 1), ...endDense(CK1, RR, -1)]);
  const rimPt = (s, side) => { const zc = cockpitW(s); return v3(X(s), supY(pA(s), zc), side * zc); };
  { const path = [];
    for (const s of stCk) path.push(rimPt(s, 1));
    for (let i = stCk.length - 2; i >= 1; i--) path.push(rimPt(stCk[i], -1));
    add(tube(path, v3(0, 1, 0), () => ellipseLoop(0.0125, 0.0105, 12), { closedPath: true }), M.black);
    const depth = curve([[0.93, 0.24], [1.05, 0.335], [1.30, 0.435], [1.50, 0.455], [1.65, 0.355], [1.75, 0.20], [1.80, 0.07]]);
    const tub = [];
    for (const s of stCk) { const zc = cockpitW(s) * 0.99, yr = supY(pA(s), zc) - 0.004, r = []; for (let j = 0; j <= 40; j++) { const t = Math.sin((2 * j / 40 - 1) * Math.PI / 2); r.push(v3(X(s), yr - depth(s) * (1 - Math.pow(Math.abs(t), 14)), t * zc)); } tub.push(r); }
    add(loft(tub, { facing: v3(0, 1, 0) }), M.carbonMatte, { cast: false });
    // headrest horseshoe
    const hp = [];
    const padY = (s) => supY(pA(s), 0.222) - 0.02;
    for (const s of range(1.42, 1.60, 0.03)) hp.push(v3(X(s), padY(s), 0.222));
    for (let k = 1; k < 24; k++) { const f = k / 24 * Math.PI; hp.push(v3(X(1.60 + 0.158 * Math.sin(f)), padY(1.60 + 0.158 * Math.sin(f)), 0.222 * Math.cos(f))); }
    for (const s of range(1.60, 1.42, 0.03)) hp.push(v3(X(s), padY(s), -0.222));
    add(tube(hp, v3(0, 1, 0), () => squircleLoop(0.03, 0.034, 3.2, 20)), M.foam);
    // seat shell + six-point harness
    const tubY = (s, z) => { const zc = Math.max(cockpitW(s) * 0.99, 1e-4); return supY(pA(s), zc) - 0.004 - depth(s) * (1 - Math.pow(Math.min(1, Math.abs(z) / zc), 14)); };
    const seat = [];
    for (const s of range(1.16, 1.775, 0.015)) { const zc = cockpitW(s) * 0.99 * 0.86, r = []; for (let j = 0; j <= 24; j++) { const t = 2 * j / 24 - 1, z = t * zc; r.push(v3(X(s), tubY(s, z) + 0.007 + 0.016 * smooth(0.55, 1, Math.abs(t)), z)); } seat.push(r); }
    add(loft(seat, { facing: v3(0, 1, 0) }), M.carbonGloss, { cast: false });
    const strap = (pts, w = 0.024) => add(tube(pts, v3(0, 1, 0), () => squircleLoop(w, 0.0022, 4, 12)), M.belt, { cast: false, parent: emptyG });
    for (const sz of [-1, 1]) {
      strap(range(1.755, 1.41, -0.02).map((s) => v3(X(s), tubY(s, 0.07) + 0.014, sz * lerp(0.03, 0.075, smooth(1.41, 1.6, s)))), 0.026);
      strap(range(0.2, 0.03, -0.017).map((z) => v3(X(1.415 + 0.03 * (z / 0.2)), tubY(1.42, z) + 0.014, sz * z)), 0.022);
      strap(range(1.2, 1.385, 0.02).map((s) => v3(X(s), tubY(s, 0.03) + 0.014, sz * 0.026)), 0.018);
    }
    const bk = new THREE.CylinderGeometry(0.033, 0.033, 0.012, 28); bk.rotateZ(-0.35); bk.translate(X(1.405), tubY(1.405, 0) + 0.024, 0); add(bk, M.alu, { cast: false, parent: emptyG });
    const bk2 = new THREE.CylinderGeometry(0.016, 0.016, 0.016, 20); bk2.rotateZ(-0.35); bk2.translate(X(1.405), tubY(1.405, 0) + 0.026, 0); add(bk2, M.accent, { cast: false, parent: emptyG });
  }
  // steering wheel: carbon plate, LCD faceplate, real buttons and rotaries, paddles, quick release
  { const sw = new THREE.Group();
    const outline = [[-0.142, -0.03], [-0.126, -0.076], [-0.092, -0.086], [-0.05, -0.062], [0.05, -0.062], [0.092, -0.086], [0.126, -0.076], [0.142, -0.03], [0.14, 0.036], [0.124, 0.07], [0.072, 0.079], [-0.072, 0.079], [-0.124, 0.07], [-0.14, 0.036]];
    const sh = roundedShape(outline, 0.016);
    for (const sx of [-1, 1]) {                                                         // finger slots, long enough for four gloved fingers
      const h = new THREE.Path(), x0 = sx * 0.1, r = 0.0165, y0 = -0.041, y1 = 0.024;
      h.moveTo(x0 + r, y1); h.lineTo(x0 + r, y0); h.absarc(x0, y0, r, 0, -Math.PI, true); h.lineTo(x0 - r, y1); h.absarc(x0, y1, r, Math.PI, 0, true); sh.holes.push(h);
    }
    add(plate(sh, 0.022, 0.004, 12), M.carbonGloss, { parent: sw });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.115), M.screen); face.position.set(0, 0.008, 0.0114); sw.add(face);
    const part = (geo, mat, x, y, z) => { geo.translate(x, y, z); return add(geo, mat, { parent: sw, cast: false }); };
    const cyl = (r0, r1, h, seg = 20) => new THREE.CylinderGeometry(r0, r1, h, seg).rotateX(Math.PI / 2);
    const bcol = [0xe02a2a, 0x22b455, 0x2f6fe8, 0xf2c21a, 0xf0f0f0, 0xf57a1a, 0x18c4d8, 0xb04ae6];
    [[-0.064, 0.0595], [-0.064, 0.0375], [-0.064, 0.0155], [-0.064, -0.0065], [0.064, 0.0595], [0.064, 0.0375], [0.064, 0.0155], [0.064, -0.0065]].forEach(([x, y], i) => {
      part(cyl(0.0088, 0.0092, 0.004), M.knob, x, y, 0.013); part(cyl(0.0066, 0.007, 0.0075, 18), M.button(bcol[i]), x, y, 0.0155);
    });
    for (const [x, y] of [[-0.036, -0.026], [0, -0.031], [0.036, -0.026]]) {
      part(cyl(0.0105, 0.0112, 0.011, 24), M.knob, x, y, 0.017); part(new THREE.BoxGeometry(0.0022, 0.0085, 0.0015), M.button(0xf0f0f0), x, y + 0.0045, 0.0232);
    }
    for (const sx of [-1, 1]) {
      part(cyl(0.0085, 0.0085, 0.009, 18), M.knob, sx * 0.1, 0.055, 0.0155);
      { const bt = part(cyl(0.0048, 0.0048, 0.0035, 12), M.button(sx > 0 ? 0xe02a2a : 0x22b455), sx * 0.1, 0.055, 0.0215); if (sx > 0) bt.name = 'btnDrive'; }      // the film's driver presses this one
      for (const pts of [[[0.046, 0.014], [0.15, 0.022], [0.156, 0.05], [0.06, 0.047]], [[0.04, -0.05], [0.136, -0.064], [0.142, -0.038], [0.05, -0.027]]]) part(plate(roundedShape(pts.map(([x, y]) => [sx * x, y]), 0.006), 0.006, 0.002), M.carbon, 0, 0, -0.03).name = 'paddle' + (pts[0][1] > 0 ? 'U' : 'L') + (sx > 0 ? 'R' : 'L');
      // each paddle hangs on a pivot block bolted to the rear housing
      for (const [py, ph] of [[0.031, 0.02], [-0.04, 0.018]]) { part(new THREE.BoxGeometry(0.016, ph, 0.012), M.alu, sx * 0.058, py, -0.0235); part(cyl(0.0026, 0.0026, 0.02, 10).rotateY(Math.PI / 2), M.fastener, sx * 0.058, py, -0.0235); }
      add(tube([v3(sx * 0.129, -0.074, 0.002), v3(sx * 0.1345, -0.034, 0.004), v3(sx * 0.1335, 0.008, 0.004), v3(sx * 0.127, 0.047, 0.001)], v3(0, 0, 1), (i, f) => ellipseLoop(0.0165 + 0.002 * Math.sin(Math.PI * f), 0.0195 + 0.0015 * Math.sin(Math.PI * f), 18)), M.grip, { parent: sw });
    }
    /* The back of the wheel (the side the film's gear-change shot looks at). A moulded housing for the electronics,
       the hub flange with its six bolts, the quick-release with its sliding collar and grooves, and the curly
       cable to the column. Without them the back was a bare plate with the paddles floating behind it. */
    part(plate(roundedShape([[-0.086, -0.046], [0.086, -0.046], [0.097, 0.002], [0.086, 0.052], [-0.086, 0.052], [-0.097, 0.002]], 0.02), 0.014, 0.0045, 10), M.carbonSatin, 0, 0, -0.0175);
    part(cyl(0.041, 0.041, 0.005, 36), M.black, 0, 0, -0.0265);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.26; part(cyl(0.0032, 0.0032, 0.004, 10), M.fastener, Math.cos(a) * 0.0345, Math.sin(a) * 0.0345, -0.0295); }
    part(cyl(0.029, 0.027, 0.022, 32), M.nut, 0, 0, -0.038);
    part(cyl(0.0345, 0.0345, 0.008, 36), M.nut, 0, 0, -0.047);                       // the collar you pull to release the wheel
    for (const z of [-0.0535, -0.0575, -0.0615]) part(cyl(0.0262, 0.0262, 0.0022, 28), M.alu, 0, 0, z);
    part(cyl(0.024, 0.024, 0.018, 24), M.alu, 0, 0, -0.058);
    add(rod(v3(0, 0, -0.06), v3(0, -0.012, -0.22), 0.017), M.black, { parent: sw });
    { const pts = [], A = v3(-0.052, -0.03, -0.024), B = v3(-0.02, -0.03, -0.15), T = 9;       // curly cable, housing to column
      for (let k = 0; k <= T * 14; k++) { const f = k / (T * 14), a = f * T * 2 * Math.PI, r = 0.0075 * Math.min(1, f * 12, (1 - f) * 12); pts.push(v3(lerp(A.x, B.x, f) + Math.cos(a) * r, lerp(A.y, B.y, f) + Math.sin(a) * r, lerp(A.z, B.z, f))); }
      add(tube(pts, v3(0, 1, 0), () => ellipseLoop(0.0024, 0.0024, 7)), M.grip, { parent: sw, cast: false }); }
    sw.position.set(X(1.075), 0.59, 0); sw.lookAt(X(1.075) - 1, 0.59 + 0.36, 0);
    sw.name = 'steeringWheel'; car.add(sw); swRef = sw;
  }

  // ---------------------------------------------------------- B: airbox + engine cover
  const KB = 40, LIPB = 0.007, B0 = 1.90;
  const ringB = (s, ins = 0, interior) => symRing(X(s), resample(halfSection(inset(pB(interior ? B0 + LIPB : s), ins)), KB));
  const ringsB = [];
  const deepB = [[0.035, 2 * LIPB + 0.0015]];                                           // the skin only turns in over the lip; the inside is modelled below
  for (const [ds, ins] of deepB) ringsB.push(ringB(B0 + ds, ins, true));
  for (let k = 0; k <= 8; k++) { const th = k / 8 * Math.PI; ringsB.push(ringB(B0 + LIPB * (1 - Math.sin(th)), LIPB * (1 + Math.cos(th)), k < 8)); }
  const nDuctB = deepB.length + 3;
  const iExtB = ringsB.length;
  const BE = 3.93, LIPE = 0.006;
  for (const s of range(B0 + LIPB + 0.012, BE - LIPE, 0.02)) ringsB.push(ringB(s));
  const iOutB = ringsB.length;
  // rear cooling exit: the skin turns in over a lip and runs forward as a dark duct around the exhaust
  for (let k = 1; k <= 8; k++) { const th = k / 8 * Math.PI; ringsB.push(ringB(BE - LIPE + LIPE * Math.sin(th), LIPE * (1 - Math.cos(th)))); }
  for (const [ds, ins] of [[0.03, 0.016], [0.07, 0.02], [0.125, 0.026]]) ringsB.push(ringB(BE - ds, ins));
  const gB = loft(ringsB, { normalFn: (i, j, p) => (i >= iExtB && i < iOutB ? gradHalf(pB, XF - p.x, p.z, p.y) : null), groups: [{ from: 0, to: nDuctB, mat: 1 }, { from: nDuctB, to: iOutB + 4, mat: 0 }, { from: iOutB + 4, to: ringsB.length - 1, mat: 1 }], capEnd: true, capMatEnd: 1 });
  add(gB, [M.livery(TX.liveryMask(ringsB, livery, 2048, 1024)), M.duct]);
  // airbox neck: a slim painted pylon from the chassis deck up to the underside of the intake. Its leading edge is swept back,
  // so the intake lip overhangs it and nothing stands in the mouth.
  { const N0 = 1.845, N1 = 1.93, rings = [];
    for (const s of range(N0, 2.09, 0.0075)) {
      const under = pB(Math.max(s, B0)).yb + 0.024, top = s < N1 ? lerp(0.748, pB(N1).yb + 0.024, Math.pow((s - N0) / (N1 - N0), 0.6)) : under;
      if (top < 0.735) break;
      const bot = 0.64, hw = 0.016 + 0.052 * Math.pow(smooth(N0, 2.0, s), 0.7);
      rings.push(ringYZ(X(s), resample(fullSection({ zc: 0, yc: (top + bot) / 2, hw, hh: (top - bot) / 2, n: [2.5, 2.5, 2.5, 2.5] }), 41)));
    }
    add(loft(rings, { capStart: true, capEnd: true }), M.paint);
  }
  // inside the airbox, all real geometry: a carbon duct that follows the skin, a shelf that splits it into a cooler feed (top) and the
  // engine feed (bottom), a finned cooler core at the end of the top channel and a pleated air filter at the end of the bottom one.
  { const I0 = B0 + 0.03, I1 = 2.36, WALL = 0.012;
    const roofY = (s) => lerp(0.992, 0.915, smooth(I0 + 0.05, I1, s)), floorY = (s) => lerp(0.856, 0.772, smooth(I0 + 0.02, I1, s)), shelfY = (s) => lerp(0.924, 0.866, smooth(I0, I1, s));
    const wide = (s) => lerp(0.089, 0.14, smooth(I0, I1, s));
    const skinZ = (s, y) => { const q = pB(Math.max(s, B0 + LIPB)); return Math.max(0.004, supZ(q, clamp(y, q.yb + 0.002, q.yt - WALL)) - WALL); };
    const ao = (s) => lerp(1, 0.16, Math.pow(smooth(I0, I1 - 0.04, s), 0.75));
    const shade = (geo, k = 1) => { const pos = geo.attributes.position, c = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { const a = ao(XF - pos.getX(i)) * k; c[i * 3] = a; c[i * 3 + 1] = a; c[i * 3 + 2] = a; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; };
    // duct shell, seen from inside
    const shell = [];
    for (const s of range(I0, I1, 0.0125)) {
      const top = Math.min(roofY(s), pB(Math.max(s, B0 + LIPB)).yt - WALL), bot = floorY(s), e = lerp(2.6, 3.6, smooth(I0, I1, s));
      shell.push(ringYZ(X(s), resample(fullSection({ zc: 0, yc: (top + bot) / 2, hw: wide(s), hh: (top - bot) / 2, n: [e, e, e, e] }), 73)).map((q) => { q.z = Math.sign(q.z) * Math.min(Math.abs(q.z), skinZ(s, q.y)); return q; }));
    }
    add(shade(loft(shell, { capEnd: true })), M.ductShell, { cast: false });
    // splitter shelf between the two channels, with a rounded leading edge
    const S0 = I0 + 0.055, shelf = [];
    for (const s of range(S0, I1, 0.01)) shelf.push(ringYZ(X(s), resample(fullSection({ zc: 0, yc: shelfY(s), hw: Math.min(wide(s), skinZ(s, shelfY(s))) + 0.006, hh: 0.0008 + 0.004 * Math.sqrt(Math.min(1, (s - S0) / 0.03)), n: [6, 6, 6, 6] }), 41)));
    add(shade(loft(shelf, { capStart: true })), M.ductPart, { cast: false });
    // roll-hoop spar: a thin carbon blade standing in the middle of the intake, set back from the lip
    add(shade(strut(v3(X(2.03), 0.866, 0), v3(X(2.03), 0.984, 0), 0.17, 0.011, v3(1, 0, 0), 20)), M.ductPart, { cast: false });
    // Both cores are cut to the duct's own outline row by row, so nothing reaches the outer skin.
    const lean = (sAt, y0, tilt) => {
      const g = new THREE.Group(); g.position.set(X(sAt), y0, 0); g.rotation.order = 'YXZ'; g.rotation.set(-tilt, Math.PI / 2, 0); car.add(g); g.updateMatrixWorld(true);
      const at = (y, z = 0) => { const q = g.localToWorld(v3(0, y, z)); return { s: XF - q.x, y: q.y }; };
      if (at(0.05).s < sAt) { g.rotation.x = tilt; g.updateMatrixWorld(true); }
      return { g, at };
    };
    // mounting frame in front of a core: a flat carbon surround that follows the duct outline, so the ribbed core never meets the wall bare
    const frame = (sAt, yLo, yHi) => {
      const f = (y) => Math.min(wide(sAt), skinZ(sAt, y)), outline = (dz, dy) => { const pts = []; for (let k = 0; k <= 16; k++) { const y = lerp(yLo, yHi, k / 16); pts.push(new THREE.Vector2(f(y) + dz, clamp(y, yLo + dy, yHi - dy))); } for (let k = 16; k >= 0; k--) { const y = lerp(yLo, yHi, k / 16); pts.push(new THREE.Vector2(-(f(y) + dz), clamp(y, yLo + dy, yHi - dy))); } return pts; };
      const sh = new THREE.Shape(outline(0.008, -0.006)); sh.holes.push(new THREE.Path(outline(-0.007, 0.006)));
      const geo = new THREE.ShapeGeometry(sh); geo.rotateY(Math.PI / 2); geo.translate(X(sAt), 0, 0);
      add(geo, M.ductFrame, { cast: false });
    };
    // cooler core: flat tubes with fins between them, at the end of the top channel
    { const D = 0.022, PITCH = 0.0115, sC = 2.255, { g, at } = lean(sC, shelfY(sC), 0), rows = [];
      frame(sC - 0.002, shelfY(sC) + 0.004, Math.min(roofY(sC), pB(sC).yt - WALL));
      for (let y = 0.003; y < 0.2; y += PITCH) { const w = at(y, -D / 2); if (w.y > roofY(w.s) + 0.003) break; rows.push([y, skinZ(w.s, w.y) + 0.007]); }
      const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; };      // no cast shadows this deep: the shadow maps are too coarse and draw a stepped edge
      for (const [y, hw] of rows) mesh(new THREE.BoxGeometry(2 * hw, 0.0026, D).translate(0, y, -D / 2), M.coreTube);
      const spots = [];
      // each fin is as tall as the duct allows at its own position, so the core meets the sloping walls without steps
      for (let i = 0; i + 1 < rows.length; i++) {
        const h0 = rows[i][1], h1 = rows[i + 1][1], hw = Math.max(h0, h1), n = Math.floor(2 * hw / 0.0028), FH = PITCH - 0.0026;
        for (let k = 0; k < n; k++) { const x = -hw + (k + 0.5) * 2 * hw / n, f = h0 > h1 ? clamp((h0 - Math.abs(x)) / (h0 - h1), 0, 1) : 1; if (f > 0.04) spots.push([x, rows[i][0] + 0.0013 + FH * f / 2, f]); }
      }
      const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.00045, PITCH - 0.0026, D * 0.9), M.coreFin, spots.length), mx = new THREE.Matrix4();
      spots.forEach(([x, y, f], k) => fins.setMatrixAt(k, mx.makeScale(1, f, 1).setPosition(x, y, -D / 2)));
      g.add(fins);
    }
    // air filter: a pleated panel across the bottom channel, each pleat cut to the duct
    { const P = 0.0065, DP = 0.015, sF = 2.30, { g, at } = lean(sF, floorY(sF) - 0.006, 0), pos = [];
      frame(sF - 0.002, floorY(sF), shelfY(sF) - 0.004);
      const topAt = (x) => { let y = 0; for (; y < 0.2; y += 0.001) { const w = at(y + 0.001, -DP / 2); if (w.y > shelfY(w.s) + 0.002 || skinZ(w.s, w.y) + 0.007 < Math.abs(x)) break; } return y; };
      for (let x0 = -0.16, i = 0; x0 < 0.16; x0 += P / 2, i++) {
        const x1 = x0 + P / 2, z0 = i % 2 ? 0 : -DP, z1 = i % 2 ? -DP : 0, h0 = topAt(x0), h1 = topAt(x1); if (h0 <= 0 || h1 <= 0) continue;
        pos.push(x0, 0, z0, x1, 0, z1, x1, h1, z1, x0, 0, z0, x1, h1, z1, x0, h0, z0);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, M.filter); g.add(m);
    }
  }

  // ---------------------------------------------------------- C: sidepods
  const C0 = 1.42, LIPC = 0.008;
  const ringC = (s, ins = 0, interior) => { const p = pC(interior ? C0 + LIPC : s); p.hw -= ins; p.hh -= ins; return ringYZ(X(s), resample(fullSection(p), 81)); };
  const ringsC = [];
  // the duct widens with the pod as it runs back to the radiator face
  const deepC = [[0.035, 2 * LIPC + 0.0015, true]];                                     // the skin only turns in over the lip; the inside is modelled below
  for (const [ds, ins, lipSec] of deepC) ringsC.push(ringC(C0 + ds, ins, lipSec));
  for (let k = 0; k <= 8; k++) { const th = k / 8 * Math.PI; ringsC.push(ringC(C0 + LIPC * (1 - Math.sin(th)), LIPC * (1 + Math.cos(th)), k < 8)); }
  const nDuctC = deepC.length + 3;
  const iExtC = ringsC.length;
  for (const s of range(C0 + LIPC + 0.012, 3.64, 0.02)) ringsC.push(ringC(s));
  const gC = loft(ringsC, { normalFn: (i, j, p) => (i >= iExtC ? gradFull(pC, XF - p.x, p.z, p.y) : null), groups: [{ from: 0, to: nDuctC, mat: 1 }, { from: nDuctC, to: ringsC.length - 1, mat: 0 }], capEnd: true });
  const gC2 = mirrorZ(gC);
  const matC = [M.livery(TX.liveryMask(ringsC, livery, 2048, 1024), true), M.duct, M.radiator];
  add(gC, matC); add(gC2, matC);
  // inside each sidepod inlet, all real geometry: a carbon duct that follows the pod skin and stays clear of the chassis side,
  // then a radiator core (flat tubes, fins between them) behind a carbon mounting frame.
  for (const sz of [1, -1]) {
    const J0 = C0 + 0.03, SR = 1.90, J1 = SR + 0.06, WALLC = 0.012, D = 0.03, PITCH = 0.0115;
    const sec = (s) => { const q = pC(s), ins = lerp(0.0165, WALLC, smooth(J0, J0 + 0.1, s)); q.hw -= ins; q.hh -= ins; return q; };
    const innerMin = (s, y) => supZ(pA(s), y) + 0.006;                                   // the chassis side must not show inside the duct
    const ao = (s) => lerp(1, 0.2, Math.pow(smooth(J0, SR, s), 0.75));
    const shade = (geo) => { const pos = geo.attributes.position, c = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { const a = ao(XF - pos.getX(i)); c[i * 3] = a; c[i * 3 + 1] = a; c[i * 3 + 2] = a; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; };
    const ring = (s) => ringYZ(X(s), resample(fullSection(sec(s)), 81)).map((q) => { q.z = sz * Math.max(q.z, innerMin(s, q.y)); return q; });
    add(shade(loft(range(J0, J1, 0.02).map(ring), { capEnd: true })), M.ductShell, { cast: false });
    // radiator core
    const q = sec(SR), half = (y, outer) => { const dy = y - q.yc, n = outer ? (dy >= 0 ? q.n[0] : q.n[1]) : (dy >= 0 ? q.n[3] : q.n[2]); return q.hw * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(dy) / q.hh, n)), 1 / n); };
    const rows = [];
    for (let y = q.yc - q.hh + 0.004; y < q.yc + q.hh - 0.002; y += PITCH) { const z0 = Math.max(q.zc - half(y, false), innerMin(SR, y)) - 0.006, z1 = q.zc + half(y, true) + 0.006; if (z1 - z0 > 0.02) rows.push([y, z0, z1]); }
    for (const [y, z0, z1] of rows) add(new THREE.BoxGeometry(D, 0.0026, z1 - z0).translate(X(SR + D / 2), y, sz * (z0 + z1) / 2), M.coreTube, { cast: false }).receiveShadow = false;
    const spots = [];
    for (let i = 0; i + 1 < rows.length; i++) { const z0 = Math.max(rows[i][1], rows[i + 1][1]), z1 = Math.min(rows[i][2], rows[i + 1][2]), n = Math.floor((z1 - z0) / 0.0028); for (let k = 0; k < n; k++) spots.push([rows[i][0] + PITCH / 2, z0 + (k + 0.5) * (z1 - z0) / n]); }
    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(D * 0.9, PITCH - 0.0026, 0.00045), M.coreFin, spots.length), mx = new THREE.Matrix4();
    spots.forEach(([y, z], k) => fins.setMatrixAt(k, mx.makeTranslation(X(SR + D / 2), y, sz * z)));
    car.add(fins);
    // mounting frame in front of the core
    { const pts = ring(SR - 0.002).slice(0, -1), cy = q.yc, cz = sz * q.zc;
      const off = (d) => pts.map((pt) => { const dy = pt.y - cy, dz = pt.z - cz, l = Math.hypot(dy, dz) || 1; return new THREE.Vector2(pt.z + dz / l * d, pt.y + dy / l * d); });
      const sh = new THREE.Shape(off(0.008)); sh.holes.push(new THREE.Path(off(-0.011)));
      const geo = new THREE.ShapeGeometry(sh); geo.rotateY(-Math.PI / 2); geo.translate(X(SR - 0.002), 0, 0);
      add(geo, M.ductFrame, { cast: false });
    }
  }
  { // what you see through the louvres: a dark inner shell, and the cut edge of the skin
    const liner = range(1.98, 2.68, 0.035).map((s) => { const p = pC(s); p.hw -= 0.022; p.hh -= 0.022; return ringYZ(X(s), resample(fullSection(p), 49)); });
    pair(loft(liner, { capStart: true, capEnd: true }), M.duct, { cast: false });
    const topC = (s, z) => { const p = pC(s), dz = z - p.zc, n = dz >= 0 ? p.n[0] : p.n[3]; return p.yc + p.hh * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(dz) / p.hw, n)), 1 / n); };
    const zc = (LV.z0 + LV.z1) / 2, hz = (LV.z1 - LV.z0) / 2 - LV.len / 2, r = LV.len / 2;
    for (let i = 0; i < LV.n; i++) {
      const sc = LV.s0 + i * LV.pitch, top = [], bot = [];
      for (let a = -90; a < 270; a += 15) { const end = a < 90 ? 1 : -1, s = sc + r * Math.sin(a * DEG), z = zc + end * hz + r * Math.cos(a * DEG), y = topC(s, z); top.push(v3(X(s), y + 0.0004, z)); bot.push(v3(X(s), y - 0.011, z)); }
      top.push(top[0].clone()); bot.push(bot[0].clone());
      pair(loft([top, bot]), M.paint2, { cast: false });
    }
  }

  // ---------------------------------------------------------- floor, diffuser, bib
  { const MF = 57, rings = [];
    for (const s of range(0.70, 3.95, 0.025)) {
      const r = [], e = zE(s);
      for (let j = 0; j < MF; j++) { const z = e * (2 * j / (MF - 1) - 1); r.push(v3(X(s), yF(s, z), z)); }
      for (let j = MF - 1; j >= 0; j--) { const z = e * (2 * j / (MF - 1) - 1); r.push(v3(X(s), yF(s, z) - 0.012, z)); }
      r.push(r[0].clone()); rings.push(r);
    }
    add(loft(rings, { capStart: 'strip', capEnd: 'strip' }), M.carbonMatte);
    add(plateXZ([[X(1.30), -0.20], [X(0.64), -0.175], [X(0.50), -0.09], [X(0.50), 0.09], [X(0.64), 0.175], [X(1.30), 0.20]], 0.06, 0.024, 0.047), M.carbon);
    add(rod(v3(X(0.56), 0.05, 0), v3(X(0.62), 0.20, 0), 0.006), M.steel);
    const box = new THREE.BoxGeometry(2.7, 0.03, 0.30); box.translate(X(2.25), 0.035, 0); add(box, M.carbonMatte);
    // tunnel fences
    const fence = (z0, c, sEnd, h, edge) => {
      const path = [], hh = [];
      for (const s of range(0.705, sEnd, 0.02)) {
        const t = (s - 0.705) / (sEnd - 0.705), z = edge ? zE(s) - 0.006 : z0 + c * Math.pow(s - 0.705, 1.7);
        const yb = yF(s, z) - 0.006, yt = yF(s, z) + h * (1 - t * t) * smooth(0, 0.06, t + 0.03) + 0.004;
        path.push(v3(X(s), (yb + yt) / 2, z)); hh.push((yt - yb) / 2);
      }
      return tube(path, v3(0, 1, 0), (i) => squircleLoop(0.003, hh[i], 6, 16));
    };
    for (const f of [[0.275, 0.9, 1.06, 0.115], [0.365, 1.3, 1.03, 0.125], [0.455, 1.8, 0.99, 0.135], [0, 0, 1.2, 0.16, true]]) pair(fence(...f), M.carbon);
    // floor edge wing
    const ew = [];
    for (const s of range(1.52, 2.96, 0.03)) ew.push(v3(X(s), 0.092 + 0.05 * smooth(1.78, 1.52, s), zE(s) + 0.014));
    pair(tube(ew, v3(0, 1, 0), () => squircleLoop(0.024, 0.0035, 4, 16)), M.carbonMatte);
    for (const s of [1.75, 2.05, 2.35, 2.65, 2.9]) pair(strut(v3(X(s), 0.05, zE(s) - 0.012), v3(X(s), 0.092, zE(s) + 0.006), 0.03, 0.004), M.carbon);
  }

  // ---------------------------------------------------------- diffuser: endplates, strakes, centre keel, trailing lip
  { const roof = (s, z) => yF(s, z) - 0.012;
    const strake = (zAt, s0, s1, yBot) => { const path = [], hh = []; for (const s of range(s0, s1, 0.03)) { const z = zAt(s), yt = roof(s, z) + 0.003, yb = Math.min(yBot, yt - 0.012); path.push(v3(X(s), (yt + yb) / 2, z)); hh.push((yt - yb) / 2); } return tube(path, v3(0, 1, 0), (i) => squircleLoop(0.0022, hh[i], 6, 14)); };
    pair(strake((s) => 0.19 + 0.05 * smooth(3.4, 3.97, s), 3.40, 3.962, 0.045), M.carbon);
    pair(strake((s) => 0.335 + 0.075 * smooth(3.45, 3.97, s), 3.46, 3.962, 0.05), M.carbon);
    const ep = plate(roundedShape([[X(3.30), 0.034], [X(3.978), 0.034], [X(3.978), 0.225], [X(3.82), 0.17], [X(3.56), 0.09], [X(3.30), 0.062]], [0.004, 0.006, 0.02, 0.05, 0.05, 0.01]), 0.004, 0.0012);
    ep.translate(0, 0, 0.537); pair(ep, M.carbon);
    const keel = range(3.22, 3.97, 0.03).map((s) => { const t = (s - 3.22) / 0.75, top = roof(s, 0) + 0.004, bot = 0.03; return ringYZ(X(s), resample(fullSection({ zc: 0, yc: (top + bot) / 2, hw: lerp(0.105, 0.046, t), hh: (top - bot) / 2, n: [5, 5, 5, 5] }), 41)); });
    add(loft(keel, { capStart: true, capEnd: true }), M.carbonMatte);
    const lip = new THREE.BoxGeometry(0.004, 0.02, 0.9); lip.translate(X(3.952), yF(3.95, 0) + 0.008, 0); add(lip, M.carbon);
  }

  // ---------------------------------------------------------- front wing
  const FWZ = 0.948;
  { const els = [
      { s0: -1.185, y0: 0.088, c: 0.215, pitch: 3, camber: -0.055, thick: 0.085, rise: 0.052 },
      { s0: -1.000, y0: 0.122, c: 0.150, pitch: 13, camber: -0.09, thick: 0.08, rise: 0.036 },
      { s0: -0.868, y0: 0.172, c: 0.135, pitch: 23, camber: -0.09, thick: 0.08, rise: 0.026 },
      { s0: -0.752, y0: 0.238, c: 0.125, pitch: 33, camber: -0.085, thick: 0.08, rise: 0.02 },
    ];
    els.forEach((e, k) => {
      const loop = airfoil(22, e.thick, e.camber), rings = [];
      for (let i = 0; i <= 72; i++) {
        const z = FWZ * (2 * i / 72 - 1), t = Math.abs(z) / FWZ;
        const cs = e.c * (1 + (k === 0 ? 0.14 : 0) * Math.pow(1 - t, 3)) * (1 - 0.10 * t * t * t);
        const pitch = e.pitch * DEG * (1 + 0.12 * (1 - t)) * (1 - 0.28 * smooth(0.72, 1, t));
        rings.push(wingStation(v3(X(e.s0 + 0.20 * t * t), e.y0 + e.rise * (1 - smooth(0.05, 0.42, t)), z), cs, pitch, loop));
      }
      add(loft(rings, { capStart: 'strip', capEnd: 'strip' }), k === 3 ? M.paint : M.carbon);
    });
    // slot-gap separators
    for (const t of [0.34, 0.62, 0.86]) pair(strut(v3(X(-0.93 + 0.2 * t * t), 0.115, FWZ * t), v3(X(-0.62 + 0.2 * t * t), 0.265, FWZ * t), 0.045, 0.003, v3(1, 0, 0)), M.steel);
    // endplates
    const ep = plate(roundedShape([[X(-1.03), 0.068], [X(-0.40), 0.054], [X(-0.385), 0.315], [X(-0.60), 0.30], [X(-0.93), 0.175], [X(-1.03), 0.12]], [0.02, 0.012, 0.03, 0.09, 0.05, 0.03]), 0.007, 0.002);
    ep.translate(0, 0, FWZ + 0.002);
    const epL = mirrorZ(ep);
    add(ep, M.paint); add(epL, M.paint);
    car.userData.fwEndplates = [ep, epL];
    // dive plane
    const dp = [];
    for (const s of range(-0.93, -0.50, 0.03)) { const t = (s + 0.93) / 0.43, wd = 0.012 + 0.04 * Math.sin(Math.PI * clamp(t * 0.85 + 0.1, 0, 1)); dp.push({ p: v3(X(s), 0.125 + 0.075 * t * t, FWZ + 0.004 + wd / 2), wd }); }
    pair(tube(dp.map((d) => d.p), v3(0, 1, 0), (i) => squircleLoop(dp[i].wd / 2, 0.003, 4, 14)), M.carbon);
  }

  // ---------------------------------------------------------- rear wing
  const RWZ = 0.49;
  { const Z1 = 0.385, RHO = 0.105, DOWN = 0.085, arc = RHO * Math.PI / 2;
    const ls = uniqSorted([...range(0, Z1, Z1 / 22), ...range(Z1, Z1 + arc, arc / 14), ...range(Z1 + arc, Z1 + arc + DOWN, DOWN / 3)]);
    const span = [...ls.slice(1).reverse().map((l) => -l), ...ls];
    const element = (les, ley, chord, pitch, camber, thick) => {
      const rings = [];
      for (const l of span) {
        const al = Math.abs(l), sg = Math.sign(l) || 1;
        let z, dy, phi;
        if (al <= Z1) { z = al; dy = 0; phi = 0; }
        else if (al <= Z1 + arc) { phi = (al - Z1) / RHO; z = Z1 + RHO * Math.sin(phi); dy = -RHO * (1 - Math.cos(phi)); }
        else { phi = Math.PI / 2; z = Z1 + RHO; dy = -RHO - (al - Z1 - arc); }
        const k = Math.cos(phi), tk = lerp(0.006 / chord, thick, k);
        rings.push(wingStation(v3(X(les), ley + dy, sg * z), chord, pitch * DEG * k, airfoil(20, tk, camber * k), v3(0, Math.cos(phi), sg * Math.sin(phi))));
      }
      return loft(rings, { capStart: 'strip', capEnd: 'strip' });
    };
    add(element(3.83, 0.725, 0.27, 9, -0.11, 0.10), M.paint);
    const flap = element(4.065, 0.785, 0.135, 38, -0.08, 0.09);
    add(flap, M.paint);
    const ep = plate(roundedShape([[X(3.60), 0.27], [X(4.215), 0.305], [X(4.215), 0.676], [X(4.078), 0.676], [X(4.05), 0.616], [X(3.85), 0.616], [X(3.72), 0.555], [X(3.63), 0.42]], [0.03, 0.03, 0.012, 0.012, 0.012, 0.04, 0.06, 0.04]), 0.010, 0.0025);
    ep.translate(0, 0, RWZ);
    const epL = mirrorZ(ep);
    add(ep, M.paint); add(epL, M.paint);
    car.userData.rwEndplates = [ep, epL];
    // endplate tail lights
    for (const sz of [-1, 1]) { const g = new THREE.BoxGeometry(0.006, 0.11, 0.012); g.translate(X(4.217), 0.5, sz * RWZ); add(g, M.ledSmall, { cast: false }); }
    // swan-neck pylon + DRS pod
    add(plate(roundedShape([[X(3.50), 0.50], [X(3.66), 0.40], [X(3.80), 0.40], [X(4.00), 0.712], [X(3.87), 0.712]], [0.02, 0.03, 0.03, 0.006, 0.006]), 0.014, 0.004), M.carbon);
    add(strut(v3(X(3.925), 0.798, 0), v3(X(4.12), 0.83, 0), 0.05, 0.036, v3(0, 1, 0), 16, 0.7), M.carbon);
    add(plate(roundedShape([[X(3.94), 0.742], [X(4.03), 0.756], [X(4.04), 0.80], [X(3.95), 0.79]], 0.004), 0.008, 0.002), M.carbon);
    add(rod(v3(X(4.10), 0.825, 0), v3(X(4.13), 0.853, 0), 0.004), M.steel);
    // beam wing
    for (const [les, ley, c, pt] of [[3.93, 0.335, 0.115, 12], [4.03, 0.372, 0.10, 26]]) {
      const loop = airfoil(18, 0.085, -0.08), rings = [];
      for (let i = 0; i <= 20; i++) rings.push(wingStation(v3(X(les), ley, (RWZ - 0.003) * (2 * i / 20 - 1)), c, pt * DEG, loop));
      add(loft(rings, { capStart: 'strip', capEnd: 'strip' }), M.carbon);
    }
  }

  // ---------------------------------------------------------- tail: crash structure, rain light, exhaust
  { const rings = range(3.78, 4.275, 0.025).map((s) => { const t = (s - 3.78) / 0.495; return ringYZ(X(s), resample(fullSection({ zc: 0, yc: lerp(0.298, 0.325, t), hw: lerp(0.078, 0.04, t), hh: lerp(0.062, 0.037, t), n: [4, 4, 4, 4] }), 41)); });
    add(loft(rings, { capStart: true, capEnd: true }), M.carbon);
    const rl = new THREE.PlaneGeometry(0.056, 0.058); rl.rotateY(-Math.PI / 2); rl.translate(X(4.2765), 0.325, 0); add(rl, M.led, { cast: false });
    const circ = (s, y, r) => { const ring = []; for (let j = 0; j <= 40; j++) { const a = j / 40 * Math.PI * 2; ring.push(v3(X(s), y + r * Math.cos(a), r * Math.sin(a))); } ring[40] = ring[0].clone(); return ring; };
    const ey = (s) => 0.405 + (s - 3.74) * 0.075;
    const er = [circ(3.74, ey(3.74), 0.058), circ(3.9, ey(3.9), 0.058), circ(4.062, ey(4.062), 0.058), circ(4.07, ey(4.07), 0.0565), circ(4.066, ey(4.066), 0.054), circ(3.95, ey(3.95), 0.054), circ(3.80, ey(3.80), 0.054)];
    add(loft(er, { groups: [{ from: 0, to: 3, mat: 0 }, { from: 3, to: 6, mat: 1 }], capEnd: true, capMatEnd: 1, uvFn: (i, j, p) => [clamp((XF - p.x - 3.86) / 0.21, 0, 1), 0.5] }), [M.exhaust, M.duct]);
  }

  // ---------------------------------------------------------- shark fin, T-cam, antennas, cameras, mirrors
  const gFin = plate(roundedShape([[X(2.28), 0.972], [X(2.28), 1.004], [X(3.44), 0.795], [X(3.52), 0.585], [X(3.30), 0.60], [X(2.9), 0.76]], [0.004, 0.012, 0.035, 0.02, 0.01, 0.01]), 0.008, 0.0025);
  add(gFin, M.paint);
  add(strut(v3(X(2.035), 0.997, 0), v3(X(2.02), 1.049, 0), 0.05, 0.012), M.black);
  add(strut(v3(X(2.02), 1.049, -0.062), v3(X(2.02), 1.049, 0.062), 0.05, 0.024, v3(1, 0, 0), 16), M.black);
  for (const sz of [-1, 1]) add(rod(v3(X(0.36), supY(pA(0.36), 0.05) - 0.01, sz * 0.05), v3(X(0.39), supY(pA(0.36), 0.05) + 0.075, sz * 0.05), 0.0028), M.black);
  add(rod(v3(X(0.16), supY(pA(0.16), 0) - 0.01, 0), v3(X(0.16), supY(pA(0.16), 0) + 0.055, 0), 0.0035), M.alu);
  add(rod(v3(X(0.165), supY(pA(0.16), 0) + 0.053, 0), v3(X(0.10), supY(pA(0.16), 0) + 0.055, 0), 0.003), M.alu);
  pair(strut(v3(X(-0.30), 0.405, 0.11), v3(X(-0.30), 0.405, 0.215), 0.10, 0.034, v3(1, 0, 0), 16, 0.75), M.black);
  { // mirrors
    const mx = X(1.14), my = 0.705, mz = 0.50, rings = [];
    for (const [dx, k] of [[0.034, 0.25], [0.028, 0.62], [0.016, 0.9], [0.0, 1.0], [-0.03, 1.0], [-0.036, 0.94]]) rings.push(squircleLoop(0.078 * k, 0.033 * k, 3.4, 28).map(([a, b]) => v3(mx + dx, my + b, mz + a)));
    pair(loft(rings, { capStart: true, capEnd: true, capMatEnd: 1 }), [M.carbon, M.chrome]);
    pair(strut(v3(mx, my - 0.012, mz - 0.05), v3(X(1.12), 0.635, 0.20), 0.045, 0.01), M.carbon);
    pair(strut(v3(mx - 0.01, my - 0.02, mz + 0.03), v3(X(1.46), 0.545, 0.57), 0.03, 0.008, v3(0, 0, 1)), M.carbon);
  }

  // ---------------------------------------------------------- halo
  // Positions from the 2025 F1 Technical Regulations (Issue 1):
  //   12.4.2  front fixing axis at XC=-975, Z=660; rear mounting faces on the plane Z=695
  //   13.3.2  load point on the hoop's outer surface at [XC=-590, Y=233.5, Z=810] and on the apex at [XC=-785, Z=830]
  //   3.12.3  bonded fairings within 20 mm of the structure; front-mount fairing inside [XC -1066..-835, Y +-25, Z 600..705]
  // The part's own drawing (FIA 8869-2018 Supplementary Technical Information) is not public: the 50 mm tube is the
  // widely reported figure, and the leg run to the rear mounts is my estimate.
  // Here plane C-C is 1.83 m behind the front axle and Z=0 is the underside of the floor.
  { const SC = 1.83, Z0 = 0.040, RH = 0.025, RC = 0.2335 - RH;
    const xc = (mm) => X(SC + mm / 1000), zz = (mm) => Z0 + mm / 1000, sOf = (mm) => SC + mm / 1000;
    const hoopY = zz(810), cx = xc(-590), faceY = zz(695);
    const leg = [[sOf(-480), hoopY - 0.001, 0.2100], [sOf(-360), hoopY - 0.006, 0.2160], [sOf(-250), hoopY - 0.022, 0.2260], [sOf(-165), hoopY - 0.052, 0.2350], [sOf(-100), faceY + 0.043, 0.2420], [sOf(-55), faceY + 0.012, 0.2455], [sOf(-18), faceY - 0.022, 0.2480], [sOf(18), faceY - 0.062, 0.2497]];
    const sidePts = (sz) => { const p = []; for (let a = 10; a <= 90; a += 10) p.push(v3(cx + RC * Math.cos(a * DEG), hoopY, sz * RC * Math.sin(a * DEG))); for (const [ss, y, z] of leg) p.push(v3(X(ss), y, sz * z)); return p; };
    const ctrl = [...sidePts(-1).reverse(), v3(cx + RC, hoopY, 0), ...sidePts(1)];
    const gHoop = tube(new THREE.CatmullRomCurve3(ctrl, false, 'centripetal').getPoints(220), v3(0, 1, 0), () => ellipseLoop(RH, RH, 28));
    add(gHoop, M.haloCarbon); car.userData.haloGeo = gHoop; car.userData.haloLeg = { s: sOf(-320), y: hoopY - 0.011, z: 0.2195 + RH };
    const lens = (c, t, n = 28) => { const l = []; for (let j = 0; j <= n; j++) { const a = 2 * Math.PI * j / n, ca = Math.cos(a); l.push([c * Math.sign(ca) * Math.pow(Math.abs(ca), 0.8), t * Math.sin(a)]); } l[n] = [l[0][0], l[0][1]]; return l; };
    // centre pylon from the apex down to the front fixing axis
    const fx = xc(-975), fy = zz(660), ax = cx + RC;
    const pp = new THREE.CatmullRomCurve3([v3(ax - 0.016, hoopY - 0.002, 0), v3(lerp(ax, fx, 0.3), lerp(hoopY, fy, 0.28), 0), v3(lerp(ax, fx, 0.66), lerp(hoopY, fy, 0.64), 0), v3(fx, fy, 0), v3(fx + 0.022, fy - 0.03, 0)], false, 'centripetal').getPoints(44);
    // V-transition: at the top the blade spreads sideways into the two halves of the hoop (it does not run up through it)
    const pc = curve([[0, 0.020], [0.12, 0.027], [0.3, 0.033], [0.6, 0.034], [0.85, 0.038], [1, 0.05]]), pt = curve([[0, 0.086], [0.05, 0.072], [0.13, 0.042], [0.22, 0.020], [0.32, 0.0108], [0.6, 0.0095], [0.85, 0.011], [1, 0.016]]);
    add(tube(pp, v3(0, 0, 1), (i, f) => lens(pc(f), pt(f), 40)), M.haloCarbon);
    // the fixing itself: a cross pin on the axis
    { const pin = new THREE.CylinderGeometry(0.0075, 0.0075, 0.046, 16); pin.rotateX(Math.PI / 2); pin.translate(fx, fy, 0); add(pin, M.fastener); }
    // body-colour fairings: front mount (max 50 mm wide) and the two rear legs
    const cy = supY(pA(sOf(-975)), 0);
    const fp = new THREE.CatmullRomCurve3([v3(fx - 0.03, fy + 0.03, 0), v3(fx - 0.004, fy - 0.006, 0), v3(fx + 0.02, cy - 0.004, 0), v3(fx + 0.034, cy - 0.04, 0)], false, 'centripetal').getPoints(14);
    add(tube(fp, v3(0, 0, 1), (i, f) => { const k = Math.pow(f, 1.5); return lens(lerp(0.040, 0.085, k), lerp(0.0135, 0.0245, k), 24); }, { caps: false }), M.paint);
    for (const sz of [-1, 1]) {
      const bp = new THREE.CatmullRomCurve3([[sOf(-90), faceY + 0.0365, 0.2430], [sOf(-55), faceY + 0.012, 0.2455], [sOf(-18), faceY - 0.022, 0.2480], [sOf(18), faceY - 0.062, 0.2497]].map(([ss, y, z]) => v3(X(ss), y, sz * z)), false, 'centripetal').getPoints(16);
      add(tube(bp, v3(0, 1, 0), (i, f) => { const r = lerp(RH + 0.003, RH + 0.012, Math.pow(f, 1.6)); return ellipseLoop(r, r, 28); }, { caps: false }), M.paint);
    }
    car.userData.halo = { SC, Z0, RH, RC };
  }

  // ---------------------------------------------------------- wheels + suspension
  const wheels = [];
  const corner = (front, side) => {
    const hw = front ? HW_F : HW_R, cx = X(front ? 0 : WHEELBASE), cz = side * (front ? ZF : ZR);
    const w = buildWheel(hw, M, front);
    const g = new THREE.Group(); g.position.set(cx, R_TYRE - 0.0045, cz);
    const camber = (front ? 3.0 : 1.2) * DEG;
    g.rotation.x = -side * camber;
    const st = new THREE.Group(); g.add(st);                    // steer pivot
    const sp = new THREE.Group(); st.add(sp); sp.add(w.spin);    // flips the left wheel
    if (side < 0) sp.rotation.y = Math.PI;
    // static upright parts (built for the right side, mirrored for the left)
    const stat = (geo, mat) => { const m = new THREE.Mesh(side > 0 ? geo : mirrorZ(geo), mat); m.castShadow = m.receiveShadow = true; st.add(m); return m; };
    stat(w.drum, M.carbonSatin);
    const zi = -hw - 0.022;
    if (front) {
      // brake duct scoop
      const sc = range(0.19, -0.02, -0.03).map((x) => { const t = (0.19 - x) / 0.21; return squircleLoop(0.03, lerp(0.085, 0.06, t), 4, 24).map(([a, b]) => v3(x, 0.03 + b, zi - 0.028 + a)); });
      stat(loft(sc, { capStart: true, capMatStart: 1, capEnd: true }), [M.carbonSatin, M.duct]);
      // wake deflector
      const df = plate(roundedShape([[-0.34, -0.27], [0.10, -0.29], [0.17, -0.20], [0.03, 0.06], [-0.20, 0.15], [-0.37, 0.03]], 0.05), 0.005, 0.0015); df.translate(0, 0, zi - 0.012);
      stat(df, M.carbon);
      // over-wheel winglet
      const wp = []; for (let a = 62; a <= 152; a += 5) wp.push({ a: a * DEG, p: v3(Math.cos(a * DEG) * 0.392, Math.sin(a * DEG) * 0.392, -hw - 0.006) });
      const wl = wp.map((q) => squircleLoop(0.042, 0.003, 4, 16).map(([sa, sb]) => v3(q.p.x + Math.cos(q.a) * sb, q.p.y + Math.sin(q.a) * sb, q.p.z + sa)));
      stat(loft(wl, { capStart: true, capEnd: true }), M.carbon);
      stat(strut(v3(Math.cos(138 * DEG) * 0.39, Math.sin(138 * DEG) * 0.39, -hw - 0.03), v3(Math.cos(138 * DEG) * 0.2, Math.sin(138 * DEG) * 0.2, zi - 0.005), 0.035, 0.005), M.carbon);
    } else {
      const df = plate(roundedShape([[-0.30, -0.26], [0.30, -0.26], [0.33, -0.08], [0.18, 0.14], [-0.16, 0.16], [-0.31, 0.0]], 0.05), 0.005, 0.0015); df.translate(0, 0, zi - 0.010);
      stat(df, M.carbon);
    }
    car.add(g);
    loadTyre(w.spin.children[0], hw);
    g.name = 'wheel'; g.userData.wheel = { front, side }; st.name = 'steer'; w.spin.name = 'spin';
    wheels.push({ group: g, steer: st, spin: w.spin, front, side });
  };
  for (const f of [true, false]) for (const sd of [1, -1]) corner(f, sd);

  { // front suspension (right side, mirrored)
    const arm = (a, b, c = 0.07, t = 0.016, hint) => pair(strut(a, b, c, t, hint || v3(1, 0, 0)), M.carbon);
    const Uo = v3(X(0.01), 0.505, 0.735), Lo = v3(X(0.0), 0.215, 0.735);
    arm(Uo, v3(X(-0.23), 0.40, 0.11)); arm(Uo, v3(X(0.43), 0.50, 0.18));
    arm(Lo, v3(X(-0.26), 0.275, 0.10)); arm(Lo, v3(X(0.40), 0.255, 0.14));
    arm(v3(X(0.0), 0.235, 0.70), v3(X(0.08), 0.49, 0.13), 0.045, 0.014);
    arm(v3(X(-0.11), 0.43, 0.725), v3(X(-0.16), 0.415, 0.11), 0.05, 0.012);
    // rear
    const Ru = v3(X(3.60), 0.50, 0.60), Rl = v3(X(3.60), 0.20, 0.60);
    arm(Ru, v3(X(3.22), 0.42, 0.11)); arm(Ru, v3(X(3.74), 0.40, 0.07));
    arm(Rl, v3(X(3.25), 0.19, 0.12)); arm(Rl, v3(X(3.78), 0.23, 0.06));
    arm(v3(X(3.60), 0.36, 0.60), v3(X(3.60), 0.345, 0.09), 0.085, 0.04);
    arm(v3(X(3.58), 0.47, 0.60), v3(X(3.42), 0.20, 0.13), 0.045, 0.014);
    arm(v3(X(3.72), 0.33, 0.60), v3(X(3.80), 0.30, 0.06), 0.05, 0.012);
  }

  // ---------------------------------------------------------- decals
  const decal = (geos, d, origin, W, V, width, tinted = true) => { const g = projectDecal(geos, origin, W, V, width, width / d.aspect); const m = new THREE.Mesh(g, M.decal(d.map, tinted)); m.receiveShadow = true; m.renderOrder = 2; car.add(m); return m; };
  const D = {
    num: TX.numberRoundel(27), word: TX.textDecal('PHANTOM', { px: 200, spacing: '6px' }), nw: TX.textDecal('NORTHWIND', { px: 160, font: 'Bahnschrift, "Segoe UI", Arial, sans-serif', italic: false, weight: 700, spacing: '14px' }),
    kite: TX.textDecal('KITE', { px: 140 }), ohm: TX.textDecal('OHM·LABS', { px: 120, italic: false, weight: 700, font: 'Bahnschrift, "Segoe UI", Arial, sans-serif' }), n27: TX.textDecal('27', { px: 220 }),
    velt: TX.textDecal('JOHN GRESH', { px: 120 }), louv: TX.louvres(9), markE: TX.markE(), markHV: TX.markHV(),
  };
  decal([gA], D.num, v3(X(-0.36), supY(pA(-0.36), 0), 0), v3(-0.25, 1, 0), v3(-1, 0, 0), 0.19, false);
  decal([gA], D.word, v3(X(-0.72), supY(pA(-0.72), 0), 0), v3(-0.25, 1, 0), v3(-1, 0, 0), 0.15);
  for (const sz of [1, -1]) {
    const up = v3(0, 1, 0);
    decal([gB], D.word, v3(X(2.82), 0.575, sz * supZ(pB(2.82), 0.575)), v3(0, 0.42, sz), up, 0.64);      // sits clear of where the chassis shoulder fairs in (s = 2.55)
    decal([sz > 0 ? gC : gC2], D.nw, v3(X(2.02), 0.43, sz * 0.79), v3(0, 0.1, sz), up, 0.60);
    decal([gFin], D.n27, v3(X(3.33), 0.745, sz * 0.004), v3(0, 0, sz), up, 0.13);                           // sized to the part of the fin that shows above the engine cover
    decal([gA], D.kite, v3(X(-0.12), 0.385, sz * supZ(pA(-0.12), 0.385)), v3(0, 0.25, sz), up, 0.24);
    decal([gA], D.ohm, v3(X(0.62), 0.47, sz * supZ(pA(0.62), 0.47)), v3(0, 0.2, sz), up, 0.30);
    decal([car.userData.rwEndplates[sz > 0 ? 0 : 1]], D.word, v3(X(3.925), 0.49, sz * (RWZ + 0.005)), v3(0, 0, sz), up, 0.40);
    decal([car.userData.fwEndplates[sz > 0 ? 0 : 1]], D.velt, v3(X(-0.555), 0.105, sz * (FWZ + 0.006)), v3(0, 0, sz), up, 0.22);
    { const h = car.userData.haloLeg; decal([car.userData.haloGeo], D.word, v3(X(h.s), h.y, sz * h.z), v3(0, 0.1, sz), up, 0.2, false); }
    decal([gA], D.markE, v3(X(0.80), 0.50, sz * supZ(pA(0.80), 0.50)), v3(0, 0.2, sz), up, 0.048, false);
    decal([gB], D.markHV, v3(X(2.50), 0.745, sz * supZ(pB(2.50), 0.745)), v3(0, 0.45, sz), up, 0.055, false);
  }
  // ---------------------------------------------------------- panel seams + fasteners
  { const fast = [], q = new THREE.Quaternion(), yUp = v3(0, 1, 0), DS = 0.013;
    const seamRing = (pts, pf, s) => {
      add(tube(pts, v3(1, 0, 0), () => ellipseLoop(0.0015, 0.0015, 6), { closedPath: true }), M.seam, { cast: false });
      if (!pf) return;
      for (let i = 2; i < pts.length; i += 5) {
        const p = pts[i], n0 = gradHalf(pf, s, p.z, p.y); if (!n0 || n0.y < -0.2) continue;
        const q2 = pf(s - DS), pos = Math.abs(n0.y) > Math.abs(n0.z) ? v3(X(s - DS), supY(q2, p.z), p.z) : v3(X(s - DS), p.y, Math.sign(p.z) * supZ(q2, p.y));
        const n = gradHalf(pf, s - DS, pos.z, pos.y); if (n) fast.push([pos, n]);
      }
    };
    for (const s of [-0.03, 0.56]) { const r = symRing(X(s), resample(halfSection(inset(pA(s), 0.0005)), 70)); r.pop(); seamRing(r, pA, s); }
    for (const s of [2.36, 3.06]) { const r = symRing(X(s), resample(halfSection(inset(pB(s), 0.0005)), 70)); r.pop(); seamRing(r, pB, s); }
    for (const s of [2.14, 2.78]) for (const sz of [1, -1]) { const p0 = pC(s); p0.hw -= 0.0005; p0.hh -= 0.0005; const r = ringYZ(X(s), resample(fullSection(p0), 90)).map((p) => v3(p.x, p.y, sz * p.z)); r.pop(); seamRing(r); }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.0016, 10), M.fastener, fast.length), mt = new THREE.Matrix4(), sc = v3(1, 1, 1);
    fast.forEach(([p, n], i) => { mt.compose(p, q.setFromUnitVectors(yUp, n), sc); im.setMatrixAt(i, mt); });
    im.receiveShadow = true; car.add(im);
  }

  // ---------------------------------------------------------- driver
  const driver = buildDriver(M, { X, sw: swRef, hands: opt.hands });
  car.add(driver);
  car.userData = {};                 // build-time references only; keeps Object3D.clone cheap
  return { car, wheels, driver, emptySeat: emptyG };
}
