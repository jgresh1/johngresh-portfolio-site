// Procedural coral + rock geometry. Units are metres; every shape sits with its base at y=0.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, mulberry32, makeNoise3 } from './geom.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// kind codes stored in aInfo.w: 0 branching, 1 table, 2 massive, 3 brain, 4 rock, 5 sponge, 6 fan, 7 anemone, 8 algae
export function branchingCoral(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const { trunks = 3, depth = 3, len = 0.34, r0 = 0.021, spreadMin = 26, spreadMax = 54, upBias = 0.55, wobble = 0.42,
          radial = 6, segLen = 0.06, childLo = 0.62, childHi = 0.84, kids = [1, 3], lean = 0.35, kind = 0, taper = 0.5, baseR = 0.05 } = o;
  const grow = (pos, dir, L, r, level) => {
    const n = Math.max(3, Math.round(L / segLen));
    const pts = [pos.clone()];
    const d = dir.clone(), p = pos.clone();
    for (let i = 0; i < n; i++) {
      d.lerp(UP, upBias * 0.10).add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(wobble * 0.22)).normalize();
      if (d.y < -0.1) d.y = -0.1 + Math.abs(d.y) * 0.2;
      d.normalize();
      p.addScaledVector(d, L / n); pts.push(p.clone());
    }
    const tp = level >= depth ? Math.max(taper, 0.78) : taper;                        // terminal branches taper to a point
    const rf = (t) => r * (1 - tp * t);
    b.tube(pts, rf, radial, [0, rnd(), level + (level >= depth ? 10 : 0), kind]);     // info.z >= 10 marks terminal branches (pale growing tips only there)
    if (level < depth) {
      const nk = kids[0] + Math.floor(rnd() * (kids[1] - kids[0] + 1));
      for (let k = 0; k < nk; k++) {
        const t = 0.30 + 0.62 * rnd(), i = Math.min(n - 1, Math.floor(t * n));
        const tan = pts[i + 1].clone().sub(pts[i]).normalize();
        const ax = new THREE.Vector3().crossVectors(tan, V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)).normalize();
        ax.applyAxisAngle(tan, rnd() * 6.283);
        const ang = (spreadMin + rnd() * (spreadMax - spreadMin)) * Math.PI / 180;
        const cd = tan.clone().applyAxisAngle(ax, ang);
        grow(pts[i].clone(), cd, L * (childLo + rnd() * (childHi - childLo)), rf(t) * 0.76, level + 1);
      }
    }
  };
  for (let k = 0; k < trunks; k++) {
    const a = k * 2.399963 + rnd() * 0.5, rr = k === 0 ? 0 : (0.35 + 0.65 * rnd()) * baseR + 0.02;
    const dir = V(Math.cos(a) * lean * (0.4 + rnd()), 1, Math.sin(a) * lean * (0.4 + rnd())).normalize();
    grow(V(Math.cos(a) * rr, -0.02, Math.sin(a) * rr), dir, len * (0.8 + rnd() * 0.4), r0, 0);
  }
  return b.toGeometry();
}

// stubby finger coral (Porites-like): thick, blunt, short
export function fingerCoral(seed) {
  return branchingCoral(seed, { trunks: 5, depth: 2, len: 0.16, r0: 0.026, spreadMin: 22, spreadMax: 40, upBias: 0.9, wobble: 0.2, radial: 7, segLen: 0.05, childLo: 0.7, childHi: 0.95, kids: [1, 2], lean: 0.5, taper: 0.28, kind: 0 });
}

// table coral: stem + large tilted plate with lobed outline, drooping rim and upright branchlets
export function tableCoral(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 5), b = new Builder();
  const { stemH = 0.42, R = 1.0, ring = 12, seg = 64 } = o;
  const lean = V((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12);
  const stem = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; stem.push(V(lean.x * t * 0.6, t * stemH, lean.z * t * 0.6)); }
  b.tube(stem, (t) => 0.075 - 0.03 * t, 8, [0, 0.5, 0, 1], false);
  const ph1 = rnd() * 6.283, ph2 = rnd() * 6.283, ph3 = rnd() * 6.283;
  const outline = (a) => R * (1 + 0.20 * n3(Math.cos(a) * 1.3 + 3, Math.sin(a) * 1.3 + 3, 1.7) + 0.09 * Math.sin(a * 3 + ph1) + 0.05 * Math.sin(a * 5 + ph2) + 0.025 * Math.sin(a * 9 + ph3));
  const tilt = V((rnd() - 0.5) * 0.10, 0, (rnd() - 0.5) * 0.10);
  const plate = (u, a, side) => {
    const r = outline(a) * u;
    const droop = -0.14 * Math.pow(u, 3.2), wave = 0.03 * n3(Math.cos(a) * 2.2 * u + 7, Math.sin(a) * 2.2 * u + 7, 4.1);
    const y = stemH + 0.03 + droop + wave + tilt.x * Math.cos(a) * r + tilt.z * Math.sin(a) * r + side * (0.045 - 0.028 * u);
    return V(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  const info = (kindV) => [0, rnd(), 0, kindV];
  // top and bottom faces
  b.grid(seg, ring, (au, v) => plate(v, au * Math.PI * 2, 0.5), [0, 0.5, 0, 1], false);
  b.grid(seg, ring, (au, v) => plate(v, au * Math.PI * 2, -0.5), [0, 0.5, 0, 1], true);
  // rim band
  b.grid(seg, 2, (au, v) => { const a = au * Math.PI * 2; const p = plate(1, a, 0.5 - v); return p; }, [0, 0.5, 0, 1], false);
  // short upright branchlets on the top surface, denser toward the rim; same surface kind as the plate so they share its colouring
  const nb = o.branchlets ?? 260;
  for (let i = 0; i < nb; i++) {
    const a = rnd() * 6.283, u = Math.sqrt(0.25 + 0.75 * rnd()) * 0.97;
    const p = plate(u, a, 0.5);
    const h = 0.016 + 0.030 * rnd() * (0.3 + u);
    const dirv = V(Math.cos(a) * 0.25 * u, 1, Math.sin(a) * 0.25 * u).normalize();
    const pts = [p.clone().addScaledVector(dirv, -0.008), p.clone().addScaledVector(dirv, h * 0.5), p.clone().addScaledVector(dirv, h)];
    b.tube(pts, (t) => 0.0085 * (1 - 0.30 * t), 5, [0, rnd(), 0, 1]);
  }
  return b.toGeometry();
}

// foliose ("lettuce") coral: stacked, frilled, funnel-shaped plates rising from a short stalk (kind 20)
export function foliose(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 31), b = new Builder();
  const { plates = 7, R = 0.42, ring = 10, seg = 44 } = o;
  const stemH = 0.06;
  b.tube([V(0, -0.02, 0), V(0, stemH * 0.5, 0), V(0, stemH * 1.4, 0)], (t) => 0.05 - 0.012 * t, 8, [0, 0.5, 0, 20], false);
  for (let p = 0; p < plates; p++) {
    const t = plates > 1 ? p / (plates - 1) : 0;
    const a0 = rnd() * 6.283, span = 1.5 + 2.2 * rnd();
    const r0 = R * (0.06 + 0.10 * rnd()), r1 = R * (0.55 + 0.40 * rnd()) * (1 - 0.30 * t);
    const h0 = stemH * 1.2 + t * R * 0.34 + rnd() * 0.025;
    const flare = 0.30 + 0.55 * rnd();
    const ruf = 0.12 + 0.13 * rnd(), rufF = 4.5 + rnd() * 6, ph = rnd() * 6.283;
    b.grid(seg, ring, (u, v) => {
      const a = a0 + (u - 0.5) * span, ca = Math.cos(a), sa = Math.sin(a);
      const edge = Math.sin(Math.PI * u);                                   // plate ends are rounded lobes
      const rr = r0 + (r1 * (0.55 + 0.45 * Math.pow(edge, 0.6)) - r0) * v;
      const y = h0 + flare * (rr - r0) * 0.55 + ruf * v * v * rr * Math.sin(a * rufF + ph + 2.4 * n3(ca * 1.7 + p, rr * 4, sa * 1.7)) + 0.05 * R * n3(ca * 2 + 9, rr * 3 + p, sa * 2);
      return V(ca * rr, y, sa * rr);
    }, [0, rnd(), t, 20], false);
  }
  return b.toGeometry();
}

// soft coral (leather / mushroom): short stalk, wide frilled polyp-covered cap (kind 21; aInfo.z = 1 on the cap)
export function softCoral(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 41), b = new Builder();
  const { R = 0.24, H = 0.14, seg = 56, ring = 10 } = o;
  const lean = V((rnd() - 0.5) * 0.06, 0, (rnd() - 0.5) * 0.06);
  b.tube([V(0, -0.02, 0), V(lean.x * 0.5, H * 0.5, lean.z * 0.5), V(lean.x, H, lean.z)], (t) => 0.055 - 0.018 * t + 0.02 * Math.pow(t, 3), 8, [0, 0.5, 0, 21], false);
  const nl = 5 + Math.floor(rnd() * 5), ph = rnd() * 6.283;
  const cap = (u, v, side) => {
    const a = u * 6.283, ca = Math.cos(a), sa = Math.sin(a);
    const lobes = 1 + 0.07 * Math.sin(a * nl + ph + 1.5 * n3(ca * 1.4 + 3, 1.3, sa * 1.4)) + 0.06 * n3(ca * 3.1, 2.2, sa * 3.1);
    const r = R * v * lobes;
    const y = H + 0.02 + 0.045 * (1 - v) * (1 - v) + 0.026 * v * v * v * Math.sin(a * (nl * 2 + 1) + ph * 2 + 3.0 * n3(ca * 2, r * 5, sa * 2)) + 0.02 * v * v * n3(ca * 4 + 5, 3.3, sa * 4) - 0.03 * v * v + side * (0.022 - 0.014 * v);
    return V(ca * r + lean.x, y, sa * r + lean.z);
  };
  b.grid(seg, ring, (u, v) => cap(u, v, 0.5), [0, rnd(), 1, 21], false);
  b.grid(seg, ring, (u, v) => cap(u, v, -0.5), [0, rnd(), 1, 21], true);
  b.grid(seg, 2, (u, v) => cap(u, 1, 0.5 - v), [0.9, rnd(), 1, 21], false);
  return b.toGeometry();
}

// lumpy dome: massive / brain coral / boulders
// cheap 3D cellular F1 (distance to nearest jittered feature point) for nodular surfaces
function cellF1(x, y, z, hash) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = 9;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, cz = iz + k;
    const h1 = hash(cx * 1.7 + 0.3, cy * 2.3 + 0.7, cz * 3.1 + 0.1), h2 = hash(cx * 2.9 + 5.1, cy * 1.3 + 2.2, cz * 3.7 + 8.3), h3 = hash(cx * 3.3 + 9.9, cy * 2.1 + 4.4, cz * 1.9 + 1.5);
    const dx = cx + 0.5 + 0.45 * h1 - x, dy = cy + 0.5 + 0.45 * h2 - y, dz = cz + 0.5 + 0.45 * h3 - z;
    const d = dx * dx + dy * dy + dz * dz; if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function domeCoral(seed, o = {}) {
  const { detail = 4, height = 0.62, lobes = 0.30, kind = 2, flatBottom = 0.12, squash = 0.0, nodules = 0, nodScale = 5.5, nodAmp = 0.10 } = o;
  const n3 = makeNoise3(seed * 3 + 1), rnd = mulberry32(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  const sx = 0.9 + rnd() * 0.3, sz = 0.9 + rnd() * 0.3;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let l = 1 + lobes * (0.6 * n3(v.x * 1.4, v.y * 1.4, v.z * 1.4) + 0.32 * n3(v.x * 3.1 + 9, v.y * 3.1, v.z * 3.1) + 0.20 * n3(v.x * 7 + 4, v.y * 7, v.z * 7) + 0.10 * n3(v.x * 15 + 2, v.y * 15, v.z * 15));
    if (nodules > 0) { const f = cellF1(v.x * nodScale, v.y * nodScale, v.z * nodScale, (a, b, c) => n3(a, b, c) * 0.5 + 0.5); const t = Math.min(f / 0.7, 1), bmp = 1 - t * t * (3 - 2 * t); l *= 1 + nodules * nodAmp * (bmp - 0.4); }
    v.multiplyScalar(l);
    v.x *= sx; v.z *= sz;
    if (v.y < 0) v.y *= flatBottom;
    v.y *= height;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, uv = new Float32Array(p.count * 2), info = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    uv[i * 2] = Math.atan2(v.z, v.x) / 6.283 + 0.5; uv[i * 2 + 1] = v.y;
    info[i * 4] = Math.min(Math.max(v.y / height, 0), 1); info[i * 4 + 1] = rnd(); info[i * 4 + 2] = nodules > 0 ? 1 : 0; info[i * 4 + 3] = kind;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// angular stone for rubble / boulders (kind 4)
export function stone(seed, o = {}) {
  const { detail = 2, stretch = 1.0, rough = 0.28 } = o;
  const n3 = makeNoise3(seed * 7 + 2), rnd = mulberry32(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  const sx = 0.8 + rnd() * 0.6, sy = 0.5 + rnd() * 0.35, sz = 0.8 + rnd() * 0.6;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const l = 1 + rough * (0.7 * n3(v.x * 1.6, v.y * 1.6, v.z * 1.6) + 0.35 * n3(v.x * 4 + 3, v.y * 4, v.z * 4));
    v.multiplyScalar(l); v.x *= sx * stretch; v.y *= sy; v.z *= sz;
    if (v.y < -0.2 * sy) v.y = -0.2 * sy + (v.y + 0.2 * sy) * 0.15;
    p.setXYZ(i, v.x, v.y + 0.12 * sy, v.z);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2), info = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) { info[i * 4 + 1] = rnd(); info[i * 4 + 3] = 4; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
