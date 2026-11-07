// Deep-sea benthos: sea cucumbers, brittle stars, sea pens, glass sponges, manganese nodules,
// hydrothermal chimneys and tube worms. kinds: 13 cucumber, 14 brittle star, 15 sea pen, 16 glass sponge,
// 17 nodule, 18 chimney, 19 tube worm, 22 crinoid
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, mulberry32, makeNoise3 } from './geom.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

export function seaCucumber(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 4), b = new Builder();
  const L = o.L ?? 0.32, R = o.R ?? 0.03;
  const pts = [];
  const bend = (rnd() - 0.5) * 0.5;
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(V((t - 0.5) * L, 0.0, Math.sin(t * 3.14) * bend * L * 0.4 + (n3(t * 3, 0, 1) - 0.0) * 0.01)); }
  b.tube(pts, (t) => R * (0.55 + 0.6 * Math.sin(Math.PI * (0.12 + 0.76 * t))) * (0.9 + 0.1 * n3(t * 9, 1, 2)), 10, [0, rnd(), 0, 13], true);
  // papillae along the back
  for (let i = 0; i < 46; i++) {
    const t = 0.08 + 0.84 * rnd(), a = (0.15 + 0.7 * rnd()) * Math.PI, idx = Math.round(t * 14), p = pts[idx];
    const r = R * (0.55 + 0.6 * Math.sin(Math.PI * (0.12 + 0.76 * t)));
    const dir = V(0, Math.sin(a), Math.cos(a) * (rnd() < 0.5 ? 1 : -1)).normalize();
    const base = p.clone().addScaledVector(dir, r * 0.9);
    b.tube([base, base.clone().addScaledVector(dir, R * 0.9)], (tt) => 0.0055 * (1 - 0.7 * tt), 4, [0, rnd(), 1, 13]);
  }
  return b.toGeometry();
}

export function brittleStar(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const D = o.D ?? 0.035, A = o.A ?? 0.16;
  b.lathe([[0.001, D * 0.55], [D * 0.5, D * 0.5], [D, D * 0.25], [D * 1.05, 0.0], [D * 0.6, -0.002]], 10, [0, rnd(), 0, 14]);
  const arms = 5, rot = rnd() * TAU;
  for (let k = 0; k < arms; k++) {
    const a = rot + k * TAU / arms, pts = [];
    const curl = (rnd() - 0.5) * 1.6, L = A * (0.75 + 0.5 * rnd());
    for (let i = 0; i <= 9; i++) {
      const t = i / 9, aa = a + curl * t * t, r = D * 0.9 + L * t;
      pts.push(V(Math.cos(aa) * r, 0.006 + 0.008 * Math.sin(t * 6 + k) * t, Math.sin(aa) * r));
    }
    b.tube(pts, (t) => D * 0.30 * (1 - 0.85 * t) + 0.0016 * (1 + Math.sin(t * 60) * 0.35), 5, [0, rnd(), 0, 14]);
  }
  return b.toGeometry();
}

export function seaPen(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const H = o.H ?? 0.45, feather = o.feather ?? 22;
  const stalk = [];
  const lean = V((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12);
  for (let i = 0; i <= 10; i++) { const t = i / 10; stalk.push(V(lean.x * t * t * H, t * H, lean.z * t * t * H)); }
  b.tube(stalk, (t) => 0.011 * (1 - 0.55 * t) + 0.003, 6, [0, rnd(), 0, 15]);
  // pinnate leaves: pairs of curved blades along the upper 65%
  for (let i = 0; i < feather; i++) {
    const t = 0.34 + 0.64 * i / feather, p = stalk[Math.min(10, Math.round(t * 10))].clone();
    const len = 0.085 * (1 - 0.6 * Math.abs(t - 0.62) * 1.4) + 0.02;
    for (const side of [-1, 1]) {
      const ang = 0.6 + rnd() * 0.15;
      const dir = V(Math.cos(ang) * side, Math.sin(ang), 0.12 * (rnd() - 0.5)).normalize();
      const n = 4, pts = [];
      for (let k = 0; k <= n; k++) { const s = k / n; pts.push(p.clone().addScaledVector(dir, len * s).add(V(0, -len * 0.25 * s * s + len * 0.15 * s, 0))); }
      b.tube(pts, (s) => 0.0075 * (1 - 0.55 * s) + 0.0012, 4, [0, rnd(), 1, 15]);
    }
  }
  return b.toGeometry();
}

export function glassSponge(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 6), b = new Builder();
  const h = o.h ?? 0.55, r = o.r ?? 0.10;
  const wob = (r0, y, a) => r0 * (1 + 0.07 * n3(Math.cos(a) * 1.5 + 2, y * 5, Math.sin(a) * 1.5));
  const outer = [[r * 0.3, -0.02], [r * 0.7, h * 0.05], [r * 0.95, h * 0.3], [r * 1.0, h * 0.6], [r * 0.9, h * 0.92], [r * 0.85, h]];
  b.lathe(outer, 20, [0, rnd(), 0, 16], V(), V(1, 1, 1), wob);
  const inner = [[r * 0.85, h], [r * 0.80, h * 0.98], [r * 0.72, h * 0.85], [r * 0.6, h * 0.55], [r * 0.4, h * 0.3], [0.001, h * 0.22]];
  b.lathe(inner, 20, [0, rnd(), 0, 16], V(), V(1, 1, 1), wob);
  // basal root tuft (glass spicules)
  for (let i = 0; i < 24; i++) { const a = rnd() * TAU, pts = [V(Math.cos(a) * r * 0.25, 0.0, Math.sin(a) * r * 0.25), V(Math.cos(a) * r * 0.5, -0.03, Math.sin(a) * r * 0.5), V(Math.cos(a) * r * 0.9, -0.05, Math.sin(a) * r * 0.9)]; b.tube(pts, (t) => 0.0018 * (1 - 0.7 * t), 3, [0, rnd(), 0, 16], false); }
  return b.toGeometry();
}

// feather star (crinoid, kind 22): small calyx, ~10 curling arms fringed with pinnules. aInfo = (t along arm, rand, 1 on pinnules, 22)
export function crinoid(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const arms = o.arms ?? 10, A = o.A ?? 0.16, pin = o.pinnules ?? 13, Rc = o.Rc ?? 0.012, radial = o.radial ?? 4;
  b.lathe([[0.001, 0.010], [Rc * 0.8, 0.008], [Rc, 0.0], [Rc * 0.6, -0.006], [0.001, -0.008]], 8, [0, rnd(), 0, 22]);
  // short cirri (legs) gripping the substrate
  for (let i = 0; i < 6; i++) { const a = rnd() * TAU; b.tube([V(Math.cos(a) * Rc * 0.5, -0.004, Math.sin(a) * Rc * 0.5), V(Math.cos(a) * Rc * 1.6, -0.012, Math.sin(a) * Rc * 1.6), V(Math.cos(a) * Rc * 2.6, -0.014, Math.sin(a) * Rc * 2.6)], (t) => 0.0014 * (1 - 0.6 * t), 3, [0, rnd(), 0, 22], false); }
  const rot = rnd() * TAU;
  for (let k = 0; k < arms; k++) {
    const a = rot + k * TAU / arms + (rnd() - 0.5) * 0.25, L = A * (0.8 + 0.4 * rnd());
    const up = 0.55 + 0.5 * rnd(), curl = 0.9 + 0.8 * rnd();
    const n = 9, pts = [], tan = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const r = Rc * 0.8 + L * (t - 0.35 * t * t * curl * 0.6);                       // the tip curls back toward the centre
      const y = 0.006 + L * up * (Math.sin(t * 1.35) * 0.9 - 0.30 * t * t * curl);
      pts.push(V(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    for (let i = 0; i <= n; i++) tan.push((pts[Math.min(i + 1, n)].clone().sub(pts[Math.max(i - 1, 0)])).normalize());
    b.tube(pts, (t) => 0.0024 * (1 - 0.78 * t) + 0.0004, radial, [0, rnd(), 0, 22], true);
    const side = V(-Math.sin(a), 0, Math.cos(a));
    for (let j = 0; j < pin; j++) {
      const t = 0.12 + 0.86 * j / Math.max(pin - 1, 1), i = Math.min(n - 1, Math.round(t * n)), p = pts[i].clone().lerp(pts[Math.min(i + 1, n)], 0.5);
      const lp = 0.030 * (1 - 0.65 * t) + 0.005;
      for (const sd of [-1, 1]) {
        const d = tan[i].clone().multiplyScalar(0.55).addScaledVector(side, sd * 0.85).add(V(0, 0.25, 0)).normalize();
        const p2 = p.clone().addScaledVector(d, lp * 0.5).add(V(0, -lp * 0.08, 0)), p3 = p.clone().addScaledVector(d, lp).add(V(0, -lp * 0.22, 0));
        b.tube([p, p2, p3], (u) => 0.0007 * (1 - 0.6 * u) + 0.0002, 3, [t, rnd(), 1, 22], false);
      }
    }
  }
  return b.toGeometry();
}

// manganese nodule: knobbly dark sphere
export function nodule(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 8);
  let g = new THREE.IcosahedronGeometry(1, o.detail ?? 2);
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const pos = g.attributes.position, v = new THREE.Vector3();
  // (non-indexed polyhedron: displace by position hash so shared vertices stay together)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const d = 1 + 0.22 * (n3(v.x * 2.2, v.y * 2.2, v.z * 2.2)) + 0.10 * n3(v.x * 6 + 5, v.y * 6, v.z * 6);
    v.multiplyScalar(d); v.y *= 0.72;
    pos.setXYZ(i, v.x, v.y * 1.0 + 0.2, v.z);
  }
  g.computeVertexNormals();
  const info = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) { info[i * 4 + 1] = rnd(); info[i * 4 + 3] = 17; }
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  return g;
}

// hydrothermal chimney: tall, tapering, leaning, jagged column with a few irregular flanges and a ragged crown
export function chimney(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 12), b = new Builder();
  const H = o.H ?? 6, R = o.R ?? 0.9;
  const nFl = 2 + Math.floor(rnd() * 2), fl = [];
  for (let i = 0; i < nFl; i++) fl.push({ t: 0.18 + 0.62 * rnd(), w: 0.035 + 0.04 * rnd(), k: 0.30 + 0.35 * rnd() });
  const prof = [];
  const n = 44;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r = R * (1.25 - 0.80 * Math.pow(t, 0.72)) * (1 + 0.10 * n3(t * 4, 1, 2));
    for (const f of fl) r *= 1 + f.k * Math.exp(-Math.pow((t - f.t) / f.w, 2)) * (t > f.t ? 0.35 : 1.0);   // shelf: sharp underside, sloping top
    if (t > 0.94) r *= 1 - 3.0 * (t - 0.94);
    prof.push([Math.max(r, 0.04), t * H]);
  }
  prof.push([R * 0.16, H * 1.012]);
  const s0 = b.count;
  b.lathe(prof, 36, [0, rnd(), 0, 18], V(), V(1, 1, 1), (r0, y, a) => {
    const t = y / H;
    const jag = 1 + 0.34 * (1 - Math.abs(n3(Math.cos(a) * 2.2 + 10, y * 0.9, Math.sin(a) * 2.2))) * 0.9 - 0.12 + 0.13 * n3(Math.cos(a) * 6 + 3, y * 3.4, Math.sin(a) * 6)
              + 0.06 * n3(Math.cos(a) * 15, y * 9, Math.sin(a) * 15);
    const crown = t > 0.9 ? 1 + 0.30 * n3(Math.cos(a) * 5 + 7, 0, Math.sin(a) * 5) : 1;
    return r0 * jag * crown;
  });
  const lean = V((rnd() - 0.5) * 0.18 * H, 0, (rnd() - 0.5) * 0.18 * H);
  for (let i = s0; i < b.count; i++) {
    const yy = Math.max(b.pos[i * 3 + 1], 0) / H, k = yy * yy;
    b.pos[i * 3] += lean.x * k; b.pos[i * 3 + 2] += lean.z * k;
  }
  return b.toGeometry();
}

// bunch of giant tube worms: white tubes with red plumes
export function tubeWorms(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const N = o.n ?? 26, L = o.L ?? 0.8;
  for (let i = 0; i < N; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.28, h = L * (0.35 + 0.65 * rnd()), bend = (rnd() - 0.5) * 0.6;
    const base = V(Math.cos(a) * d, 0, Math.sin(a) * d), pts = [];
    const out = V(Math.cos(a), 0, Math.sin(a));
    for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(base.clone().addScaledVector(out, 0.25 * h * t * t * (0.6 + bend)).add(V(0.04 * Math.sin(t * 5 + i), h * t, 0.04 * Math.cos(t * 4 + i)))); }
    const r = 0.014 + 0.014 * rnd();
    b.tube(pts, (t) => r * (1 - 0.15 * t), 7, [0, rnd(), 0, 19], false);
    // red plume: cone of frilly filaments at the tip
    const tip = pts[8], dir = pts[8].clone().sub(pts[7]).normalize();
    for (let f = 0; f < 7; f++) {
      const aa = f / 7 * TAU, side = V(Math.cos(aa), 0.0, Math.sin(aa));
      const p2 = tip.clone().addScaledVector(dir, 0.07).addScaledVector(side, 0.045);
      b.tube([tip.clone(), tip.clone().addScaledVector(dir, 0.04).addScaledVector(side, 0.02), p2], (t) => 0.0065 * (1 - 0.6 * t), 4, [1.0, rnd(), 1, 19], false);
    }
  }
  return b.toGeometry();
}
