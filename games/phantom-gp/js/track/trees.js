// trees.js — the Ardennes forest. Every tree position / height / species comes from the LiDAR canopy model.
// Three levels of detail, picked per tree in the vertex shader from its distance to the camera:
//   hero  (closest)  branching models: spruce with brushes and hanging combs on every branch, broadleaf grown
//                    recursively with a leaf cluster card at every twig. Instanced per 32 m cell.
//   mid              lighter card models, instanced per 64 m cell.
//   far              one instanced cross-card impostor mesh per species, baked from the mid models at load.
import * as THREE from 'three';
import { W } from './world.js';
import { rng32, leafTex } from './tex.js';
import { spruceAtlas, leafAtlas, barkMaps, meanOpaque } from './treetex.js';

const U = { uCamPos: { value: new THREE.Vector3() }, uNear: { value: 150 }, uHero: { value: 55 }, uTime: { value: 0 } };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/* ------------------------------------------------------------------ geometry helpers (unit-height models) */
const buf = () => ({ pos: [], uv: [], nor: [], col: [], flex: [], idx: [] });

// P: 4 points, T: 4 uvs, N: one normal or 4, C: 4 shades (number or [r,g,b]), F: 4 wind-flex weights (1 = free edge)
function quad(g, P, T, N, C, F) {
  const base = g.pos.length / 3;
  for (let k = 0; k < 4; k++) {
    const p = P[k], n = Array.isArray(N) ? N[k] : N, c = C[k];
    g.pos.push(p.x, p.y, p.z); g.uv.push(T[k][0], T[k][1]); g.nor.push(n.x, n.y, n.z);
    if (typeof c === 'number') g.col.push(c, c, c); else g.col.push(c[0], c[1], c[2]);
    g.flex.push(F ? F[k] : 0);
  }
  g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// tapered tube through pts [{p, r}], any direction
function tube(g, pts, sides, vScale = 9, shade = 0.82) {
  const base0 = g.pos.length / 3; let run = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)].p, b = pts[Math.min(pts.length - 1, k + 1)].p, t = V().subVectors(b, a).normalize();
    const ref = Math.abs(t.y) > 0.92 ? V(1, 0, 0) : UP, u = V().crossVectors(t, ref).normalize(), w = V().crossVectors(t, u);
    if (k) run += pts[k].p.distanceTo(pts[k - 1].p);
    for (let s = 0; s <= sides; s++) {
      const th = s / sides * Math.PI * 2, n = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th)), p = pts[k].p.clone().addScaledVector(n, pts[k].r);
      g.pos.push(p.x, p.y, p.z); g.nor.push(n.x, n.y, n.z); g.uv.push(s / sides * 2, run * vScale); g.col.push(shade, shade, shade); g.flex.push(0);
    }
  }
  for (let k = 0; k < pts.length - 1; k++) for (let s = 0; s < sides; s++) {
    const a = base0 + k * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
    g.idx.push(a, c, b, b, c, d);
  }
}

function toGeo(g, scale = 1) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(g.pos);
  if (scale !== 1) for (let i = 0; i < pos.length; i++) pos[i] *= scale;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  geo.setAttribute('flex', new THREE.Float32BufferAttribute(g.flex, 1));
  geo.setIndex(g.idx);
  return geo;
}

/* ------------------------------------------------------------------ mid-range models */
function spruceMid(seed) {
  const r = rng32(seed), fol = buf(), trk = buf();
  tube(trk, [{ p: V(0, 0, 0), r: 0.014 }, { p: V(0, 0.3, 0), r: 0.0105 }, { p: V(0, 0.7, 0), r: 0.005 }, { p: V(0, 0.985, 0), r: 0.0012 }], 6, 7);
  const y0 = 0.2, whorls = 28, Rmax = 0.168;
  for (let wI = 0; wI < whorls; wI++) {
    const t = wI / (whorls - 1), y = y0 + (0.985 - y0) * Math.pow(t, 0.96);
    const R = Rmax * Math.pow(1 - t, 0.8) * (0.8 + r() * 0.28) + 0.012;
    const nb = t > 0.9 ? 4 : (t > 0.6 ? 6 : 8), a0 = r() * 6.283;
    for (let b = 0; b < nb; b++) {
      const a = a0 + (b + r() * 0.7) / nb * 6.283, len = R * (0.9 + r() * 0.3), droop = (0.18 + r() * 0.24) * (1 - t * 0.7) - t * 0.35;
      const dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x);
      const base = V(0, y + len * 0.1, 0), tip = V(dir.x * len, y - len * droop, dir.z * len);
      const K = Math.max(1, Math.min(4, Math.round(len / 0.042)));
      for (let k = 0; k < K; k++) {
        const pa = base.clone().lerp(tip, k / K - 0.08), pb = base.clone().lerp(tip, (k + 1) / K + 0.1);
        const hang = (0.028 + r() * 0.022) * (1 - t * 0.5) * (0.75 + 0.5 * (1 - k / K)), roll = (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.6);
        const dn = V(0, -Math.cos(roll), 0).addScaledVector(side, Math.sin(roll)).multiplyScalar(hang);
        let fn = V().crossVectors(V().subVectors(pb, pa), dn).normalize(); if (fn.dot(dir) + fn.y * 0.3 < 0) fn.negate();
        const nrm = V(dir.x * 0.55, 0.42, dir.z * 0.55).addScaledVector(fn, 0.55).normalize();
        const rf = (k + 0.5) / K, j = 0.82 + r() * 0.36, aoIn = (0.26 + 0.5 * rf + 0.22 * t) * j, aoTip = Math.min(1.15, (0.42 + 0.62 * rf + 0.22 * t) * j);
        const u0 = r() * 0.3, u1 = u0 + 0.55 + r() * 0.15;
        quad(fol, [pa.clone().add(dn), pb.clone().add(dn), pb, pa], [[u0, 0.5], [u1, 0.5], [u1, 0.995], [u0, 0.995]], nrm, [aoTip * 0.92, aoTip, aoIn, aoIn], [1, 1, 0, 0]);
      }
    }
  }
  return { fol: toGeo(fol), trk: toGeo(trk), halfW: 0.215, capY: 0.5, capR: 0.2 };
}

function broadleafMid(seed) {
  const r = rng32(seed), fol = buf(), trk = buf();
  tube(trk, [{ p: V(0, 0, 0), r: 0.02 }, { p: V(0.004, 0.25, 0.002), r: 0.015 }, { p: V(-0.003, 0.5, 0.004), r: 0.011 }, { p: V(0.004, 0.74, -0.003), r: 0.004 }], 6, 6);
  const C = V(0, 0.62, 0), R = V(0.27, 0.34, 0.27);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * 6.283 + r(), y1 = 0.32 + r() * 0.2, len = 0.17 + r() * 0.09;
    tube(trk, [{ p: V(0, y1, 0), r: 0.009 }, { p: V(Math.cos(a) * len * 0.6, y1 + len * 0.7, Math.sin(a) * len * 0.6), r: 0.005 }, { p: V(Math.cos(a) * len, y1 + len * 1.25, Math.sin(a) * len), r: 0.0015 }], 4, 9);
  }
  const lumps = [{ c: C.clone(), s: 0.82 }, { c: V(0, C.y + R.y * 0.5, 0), s: 0.55 }];
  for (let k = 0; k < 8; k++) { const a = r() * 6.283, e = r() * 1.7 - 0.8; lumps.push({ c: V(C.x + Math.cos(a) * R.x * 0.6, C.y + e * R.y * 0.5, C.z + Math.sin(a) * R.z * 0.6), s: 0.36 + r() * 0.2 }); }
  for (let k = 0; k < 340; k++) {
    const core = k < 50, lp = lumps[(r() * lumps.length) | 0];
    const u = r() * 2 - 1, th = r() * 6.283, sq = Math.sqrt(1 - u * u), dir = V(sq * Math.cos(th), u, sq * Math.sin(th));
    const rad = core ? 0.25 + 0.5 * r() : 0.72 + 0.3 * Math.pow(r(), 0.6);
    const anchor = V(lp.c.x + dir.x * R.x * lp.s * rad, lp.c.y + dir.y * R.y * lp.s * rad, lp.c.z + dir.z * R.z * lp.s * rad);
    const out = anchor.clone().sub(C); out.x /= R.x; out.y /= R.y; out.z /= R.z; const q = out.length(); out.normalize();
    const grow = out.clone().add(V(r() - 0.5, r() - 0.65, r() - 0.5).multiplyScalar(0.7)).normalize();
    const t1 = V().crossVectors(grow, Math.abs(grow.y) > 0.9 ? V(1, 0, 0) : UP).normalize(), t2 = V().crossVectors(grow, t1), ang = r() * 6.283;
    const wide = t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
    const len = (core ? 0.075 : 0.05) + r() * 0.045, hw = len * (0.5 + r() * 0.12);
    const A = anchor.clone().addScaledVector(wide, -hw), B = anchor.clone().addScaledVector(wide, hw);
    let fn = V().crossVectors(wide, grow).normalize(); if (fn.dot(out) + fn.y * 0.35 < 0) fn.negate();
    const nrm = out.clone().multiplyScalar(0.75).addScaledVector(fn, 0.5).add(V(0, 0.2, 0)).normalize();
    const j = 0.8 + r() * 0.4, ao = Math.min(1.15, Math.max(0.16, (0.1 + 0.8 * q + 0.35 * (anchor.y - 0.5)) * j)), aoT = Math.min(1.2, ao * 1.15);
    quad(fol, [A, B, B.clone().addScaledVector(grow, len), A.clone().addScaledVector(grow, len)], [[0, 0], [1, 0], [1, 1], [0, 1]], nrm, [ao, ao, aoT, aoT], [0, 0, 1, 1]);
  }
  return { fol: toGeo(fol), trk: toGeo(trk), halfW: 0.38, capY: 0.68, capR: 0.35 };
}

/* ------------------------------------------------------------------ hero models */
// Norway spruce: every branch carries a flat brush of needles along its top and combs of twiglets hanging beneath
function spruceHero(seed) {
  const r = rng32(seed), fol = buf(), trk = buf();
  const lean = (y) => V(Math.sin(y * 5.1 + seed) * 0.006 * y, y, Math.cos(y * 4.3 + seed * 1.7) * 0.006 * y);
  const tp = [];
  for (let k = 0; k <= 14; k++) { const y = Math.pow(k / 14, 1.25) * 0.992; tp.push({ p: lean(y), r: 0.0118 * Math.pow(1 - y, 0.8) + 0.0007 + 0.011 * Math.exp(-y / 0.016) }); }
  tube(trk, tp, 8, 7, 0.85);
  for (let k = 0; k < 8; k++) {                      // dead snags on the bare lower trunk
    const y = 0.06 + r() * 0.14, a = r() * 6.283, L = 0.03 + r() * 0.05, d = V(Math.cos(a), -0.15, Math.sin(a)), p0 = lean(y);
    tube(trk, [{ p: p0, r: 0.0022 }, { p: p0.clone().addScaledVector(d, L * 0.6), r: 0.0014 }, { p: p0.clone().addScaledVector(d, L).add(V(0, -L * 0.2, 0)), r: 0.0005 }], 3, 20, 0.55);
  }
  const y0 = 0.2, whorls = 27, Rmax = 0.166;
  for (let wI = 0; wI < whorls; wI++) {
    const t = wI / (whorls - 1), y = y0 + (0.975 - y0) * Math.pow(t, 0.97) + (r() - 0.5) * 0.008;
    const R = (Rmax * Math.pow(1 - t, 0.82) + 0.012) * (0.78 + r() * 0.34);
    const nb = t > 0.9 ? 4 : (t > 0.55 ? 5 : 6), a0 = r() * 6.283, c0 = lean(y);
    for (let b = 0; b < nb; b++) {
      const a = a0 + (b + (r() - 0.5) * 0.7) / nb * 6.283, L = R * (0.8 + r() * 0.4);
      const out = V(Math.cos(a), 0, Math.sin(a)), side = V(-out.z, 0, out.x);
      const rise = -0.3 + 0.72 * t + (r() - 0.5) * 0.12, sag = (0.2 - 0.17 * t) * (0.7 + r() * 0.6), lift = 0.12 * (1 - t);
      // branch line: leaves the trunk, sags under its own weight, tip turns up
      const at = (f) => V(c0.x + out.x * L * f, c0.y + L * (rise * f - sag * Math.sin(Math.PI * Math.min(f, 1) * 0.85) + lift * f * f * f), c0.z + out.z * L * f);
      if (t < 0.45) tube(trk, [0, 0.33, 0.66, 1].map((f) => ({ p: at(f), r: 0.0034 * (1 - f) + 0.0006 })), 3, 20, 0.6);
      const K = Math.max(2, Math.min(5, Math.round(L / 0.03)));
      for (let k = 0; k < K; k++) {
        const f0 = 0.14 + (k / K) * 0.86, f1 = Math.min(1.04, 0.14 + ((k + 1) / K) * 0.86 + 0.05), fm = (f0 + f1) / 2, pa = at(f0), pb = at(f1);
        const j = 0.78 + r() * 0.44, ao = Math.min(1.1, (0.28 + 0.66 * fm + 0.2 * t) * j);
        const tint = [ao * (1 + 0.1 * fm), ao * (1 + 0.1 * fm), ao * (0.94 - 0.12 * fm)];           // new growth at the tips is lighter, yellower
        const hw = ((0.017 + r() * 0.009) * (1 - 0.35 * fm) + 0.004) * (1 - 0.3 * t);
        const ua = 0.04 + fm * 0.4 + r() * 0.08, ub = Math.min(0.99, ua + 0.42);
        quad(fol, [pa.clone().addScaledVector(side, -hw), pa.clone().addScaledVector(side, hw), pb.clone().addScaledVector(side, hw * 0.8), pb.clone().addScaledVector(side, -hw * 0.8)],
          [[ua, 0.02], [ua, 0.48], [ub, 0.48], [ub, 0.02]], V(out.x * 0.35, 0.94, out.z * 0.35).normalize(), [tint, tint, tint, tint], [0.5, 0.5, 0.8, 0.8]);
        for (const sg of [-1, 1]) {
          const tilt = 0.18 + r() * 0.45, hg = (0.024 + r() * 0.02) * (1 - 0.45 * t) * (1 - 0.25 * fm);
          const dn = V(0, -Math.cos(tilt), 0).addScaledVector(side, sg * Math.sin(tilt)).multiplyScalar(hg);
          const qa = pa.clone().addScaledVector(side, sg * hw * 0.45), qb = pb.clone().addScaledVector(side, sg * hw * 0.4);
          const u0 = r() * 0.42, u1 = u0 + 0.36 + r() * 0.2, sh = ao * (0.66 + r() * 0.2), tipC = [sh * 1.04, sh * 1.06, sh * 0.9];
          quad(fol, [qa.clone().add(dn), qb.clone().add(dn), qb, qa], [[u0, 0.5], [u1, 0.5], [u1, 0.995], [u0, 0.995]],
            V(side.x * sg * 0.55 + out.x * 0.35, 0.35, side.z * sg * 0.55 + out.z * 0.35).normalize(), [tipC, tipC, sh, sh], [1, 1, 0.1, 0.1]);
        }
      }
    }
  }
  return { fol: toGeo(fol), trk: toGeo(trk) };
}

// Broadleaf grown recursively; a pair of leaf-cluster cards at every twig node. o: { spread, droop, card, trunk }
function broadleafHero(seed, o = {}) {
  const r = rng32(seed), fol = buf(), trk = buf(), nodes = [], MAX = 4;
  const spread = o.spread ?? 1, droop = o.droop ?? 0.06, trunkLen = o.trunk ?? 0.4;
  const perp = (d) => V().crossVectors(d, Math.abs(d.y) > 0.9 ? V(1, 0, 0) : UP).normalize();
  const child = (p, d, len, rad, depth, sp) => {
    const q = perp(d), q2 = V().crossVectors(d, q), az = r() * 6.283, ang = sp * spread * (0.42 + r() * 0.5);
    branch(p, d.clone().multiplyScalar(Math.cos(ang)).addScaledVector(q, Math.sin(ang) * Math.cos(az)).addScaledVector(q2, Math.sin(ang) * Math.sin(az)).normalize(), len * (0.6 + r() * 0.2), rad * 0.6, depth + 1);
  };
  const branch = (p0, dir, len, rad, depth) => {
    const segs = 3, pts = [{ p: p0.clone(), r: rad }]; let p = p0.clone(), d = dir.clone(), rr = rad;
    for (let k = 1; k <= segs; k++) {
      // wander, reach for light; the thinnest twigs droop
      d.add(V(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.24)).add(V(0, depth >= 3 ? -droop : 0.13, 0)).normalize();
      p = p.clone().addScaledVector(d, len / segs); rr = rad * (1 - 0.42 * k / segs);
      pts.push({ p: p.clone(), r: rr });
      if (depth < MAX && k < segs && r() < 0.5) child(p, d, len * 0.8, rr, depth, 1.0);
      if (depth >= MAX - 2) nodes.push({ p: p.clone(), d: d.clone() });
    }
    if (depth <= 3) tube(trk, pts, depth === 1 ? 6 : depth === 2 ? 4 : 3, 9, 0.84);
    if (depth < MAX) { const n = 2 + ((r() * 1.7) | 0); for (let i = 0; i < n; i++) child(p, d, len, rr, depth, 0.95); }
  };
  // trunk with root flare, then the main limbs
  const tp = []; let tpos = V(0, 0, 0); const tdir = V(0, 1, 0);
  for (let k = 0; k <= 7; k++) {
    const y = k / 7; tp.push({ p: tpos.clone(), r: 0.0185 * (1 - 0.4 * y) + 0.016 * Math.exp(-y * trunkLen / 0.016) });
    tdir.add(V(r() - 0.5, 0, r() - 0.5).multiplyScalar(0.05)).normalize(); tpos = tpos.clone().addScaledVector(tdir, trunkLen / 7);
  }
  tube(trk, tp, 9, 6, 0.86);
  const top = tp[tp.length - 1].p, limbs = 4 + ((r() * 2) | 0);
  for (let i = 0; i < limbs; i++) child(top, tdir, 0.44, 0.0125, 0, 1.15);
  child(tp[5].p, tdir, 0.36, 0.009, 0, 1.3);                     // a lower limb
  // crown centre and size, for shading
  const C = V(); for (const n of nodes) C.add(n.p); C.multiplyScalar(1 / nodes.length);
  let Rc = 0, top2 = 0; for (const n of nodes) { Rc += n.p.distanceTo(C); top2 = Math.max(top2, n.p.y); } Rc /= nodes.length;
  const cardL = o.card ?? 0.056;
  for (const n of nodes) {
    const out = n.p.clone().sub(C); const q = out.length() / (Rc * 1.25); out.normalize();
    const g = n.d.clone().multiplyScalar(0.6).addScaledVector(out, 0.5).add(V((r() - 0.5) * 0.5, -droop * 2 - r() * 0.25, (r() - 0.5) * 0.5)).normalize();
    const w0 = perp(g), w1 = V().crossVectors(g, w0), base = r() * 6.283;
    for (let c = 0; c < 3; c++) {
      const ang = base + c * 1.05 + (r() - 0.5) * 0.7, wide = w0.clone().multiplyScalar(Math.cos(ang)).addScaledVector(w1, Math.sin(ang));
      const len = cardL * (0.85 + r() * 0.4), hw = len * 0.5;
      const A = n.p.clone().addScaledVector(wide, -hw), B = n.p.clone().addScaledVector(wide, hw);
      let fn = V().crossVectors(wide, g).normalize(); if (fn.dot(out) + fn.y * 0.4 < 0) fn.negate();
      const nrm = out.clone().multiplyScalar(0.62).addScaledVector(fn, 0.55).add(V(0, 0.25, 0)).normalize();
      const j = 0.76 + r() * 0.48, ao = Math.min(1.15, Math.max(0.15, (0.16 + 0.78 * q + 0.22 * (n.p.y - C.y) / Rc) * j)), sun = Math.min(1, q);
      const tint = [ao * (1 + 0.16 * sun), ao * (1 + 0.08 * sun), ao * (0.96 - 0.14 * sun)];       // sun leaves on the outside are yellower
      const cu = r() < 0.5 ? 0 : 0.5, cv = r() < 0.5 ? 0 : 0.5;
      quad(fol, [A, B, B.clone().addScaledVector(g, len), A.clone().addScaledVector(g, len)], [[cu + 0.004, cv + 0.004], [cu + 0.496, cv + 0.004], [cu + 0.496, cv + 0.496], [cu + 0.004, cv + 0.496]],
        nrm, [tint, tint, tint, tint], [0, 0, 1, 1]);
    }
  }
  const s = 1 / (top2 + cardL * 0.8);
  return { fol: toGeo(fol, s), trk: toGeo(trk, s), cards: nodes.length * 2 };
}

/* ------------------------------------------------------------------ materials */
const WIND = /* glsl */`
      {
        float wPh = tOrigin.x * 0.21 + tOrigin.z * 0.17;
        float wY = position.y * position.y;
        transformed.x += ( sin( uTime * 1.15 + wPh ) * 0.65 + sin( uTime * 2.4 + wPh * 1.7 ) * 0.35 ) * wY * 0.0085;
        transformed.z += cos( uTime * 0.93 + wPh * 1.3 ) * wY * 0.0055;
        float wF = uTime * 4.6 + position.x * 71.0 + position.z * 53.0 + position.y * 37.0 + wPh;
        transformed += vec3( sin( wF ), cos( wF * 1.31 ) * 0.7, sin( wF * 0.77 ) ) * ( flex * 0.0030 );
      }`;

function lodPatch(sh, mode, wind) {
  Object.assign(sh.uniforms, U);
  const hide = mode === 'far' ? 'tD < tNearT' : mode === 'mid' ? '( tD >= tNearT || tD < tHeroT )' : 'tD >= tHeroT';
  const sway = wind && mode !== 'far';
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uCamPos; uniform float uNear, uHero, uTime;' + (sway ? ' attribute float flex;' : ''))
    .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      vec3 tOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
      float tHash = fract( sin( dot( tOrigin.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5;
      float tD = distance( tOrigin, uCamPos ), tNearT = uNear + tHash * 36.0, tHeroT = uHero + tHash * 16.0;
      ${sway ? WIND : ''}
      if ( ${hide} ) transformed *= 0.0;`);
}

function foliageMaterial(map, mode, wind, opts = {}) {
  const far = mode === 'far';
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: far ? 0 : (mode === 'hero' ? 0.5 : 0.42), side: THREE.DoubleSide, roughness: 0.95, metalness: 0, vertexColors: !far, envMapIntensity: far ? 0.9 : 0.55, ...opts });
  m.alphaToCoverage = true;
  m.onBeforeCompile = (sh) => {
    lodPatch(sh, mode, wind);
    // shadow look-up pushed out of the crown so cards do not shadow each other as hard shards
    sh.vertexShader = sh.vertexShader.replace('#include <shadowmap_vertex>', THREE.ShaderChunk.shadowmap_vertex.replace('worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 )', 'worldPosition + vec4( shadowWorldNormal * ( directionalLightShadows[ i ].shadowNormalBias + 2.2 ), 0 )'));
    // foliage is shaded as a rounded volume: never flip the stored normal for back faces
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, ''))
      .replace('vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;', 'vec3 totalSpecular = ( reflectedLight.directSpecular + reflectedLight.indirectSpecular ) * 0.15;')
      .replace('#include <opaque_fragment>', /* glsl */`
        // sunlight passing through leaves: strongest on faces turned away from the sun, seen looking toward it
        #if NUM_DIR_LIGHTS > 0
          vec3 fL = directionalLights[ 0 ].direction;
          float fBack = pow( clamp( - dot( normalize( vViewPosition ), fL ), 0.0, 1.0 ), 2.0 );
          float fThru = clamp( 0.32 - dot( normal, fL ) * 0.68, 0.0, 1.0 ) * ( 0.28 + 0.72 * fBack );
          outgoingLight += diffuseColor.rgb * vec3( 1.25, 1.45, 0.5 ) * directionalLights[ 0 ].color * fThru * ${far ? '0.08' : '0.2'} * csmShadow;
        #endif
        #include <opaque_fragment>`);
    if (far) {
      // distant cards: fractional coverage (alpha-to-coverage) instead of a hard cut, a height gradient instead of shadow maps
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTreeY;').replace('#include <alphatest_fragment>', 'diffuseColor.a = clamp( diffuseColor.a * 3.4 - 0.2, 0.0, 1.0 ); if ( diffuseColor.a < 0.04 ) discard; diffuseColor.rgb *= mix( 0.3, 1.0, smoothstep( 0.1, 0.66, vTreeY ) );');
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vTreeY;').replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        vTreeY = max( position.y, normal.y * 0.85 );
        { vec3 tO = ( modelMatrix * instanceMatrix * vec4( 0.0, position.y, 0.0, 1.0 ) ).xyz; float tEl = ( uCamPos.y - tO.y ) / max( distance( uCamPos, tO ), 1.0 ); if ( normal.y > 0.5 ) transformed.xz *= smoothstep( 0.16, 0.34, tEl ); }`)
        .replace('#include <defaultnormal_vertex>', /* glsl */`#include <defaultnormal_vertex>
        {
          vec3 o = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          vec3 toCam = uCamPos - o; toCam.y = 0.0; toCam = normalize( toCam + 1e-4 );
          vec3 radial = ( modelMatrix * instanceMatrix * vec4( position.x, 0.0, position.z, 0.0 ) ).xyz;
          float rl = length( radial );
          vec3 nW = normalize( radial / max( rl, 1e-4 ) * min( rl / ${(opts.userData?.halfW || 0.3).toFixed(3)} / ( length( instanceMatrix[ 0 ].xyz ) ), 1.0 ) * 0.8 + toCam * 0.45 + vec3( 0.0, 0.35 + position.y * 0.95 + normal.y * 1.2, 0.0 ) );
          transformedNormal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
        }`);
    }
  };
  m.customProgramCacheKey = () => 'fol-' + mode + (wind ? 'w' : '') + (opts.userData?.halfW || 0);
  return m;
}

function trunkMaterial(bark, mode, wind, tone = 0xffffff) {
  const m = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, roughness: 0.92, vertexColors: true, color: tone });
  m.normalScale.set(1.2, 1.2);
  m.onBeforeCompile = (sh) => lodPatch(sh, mode, wind);
  m.customProgramCacheKey = () => 'trunk-' + mode + (wind ? 'w' : '');
  return m;
}

function depthMaterial(map, mode, alphaTest, wind) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => lodPatch(sh, mode, wind);
  m.customProgramCacheKey = () => 'tdepth-' + mode + (map ? 'm' : '') + (wind ? 'w' : '');
  return m;
}

/* ------------------------------------------------------------------ impostor baking (from the mid models) */
function bakeImpostors(renderer, species) {
  const CW = 320, CH = 640, n = species.length;
  const rt = new THREE.WebGLRenderTarget(CW * n, CH + CW, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.anisotropy = 4;
  const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera();
  const prev = { rt: renderer.getRenderTarget(), ca: renderer.getClearAlpha(), tm: renderer.toneMapping, sh: renderer.shadowMap.enabled };
  const pc = new THREE.Color(); renderer.getClearColor(pc);
  renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = false;
  renderer.autoClear = false; rt.scissorTest = true;
  species.forEach((sp, i) => {
    const fm = new THREE.MeshBasicMaterial({ map: sp.map, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true, fog: false, toneMapped: false });
    const tm = new THREE.MeshBasicMaterial({ map: sp.bark.map, fog: false, toneMapped: false, color: 0x8a8378 });
    sc.clear(); sc.add(new THREE.Mesh(sp.mid.fol, fm), new THREE.Mesh(sp.mid.trk, tm));
    for (const top of [false, true]) {
      const x = i * CW, y = top ? CH : 0, w = CW, h = top ? CW : CH;
      // render targets carry their own viewport / scissor (the renderer's are scaled by the pixel ratio)
      rt.viewport.set(x, y, w, h); rt.scissor.set(x, y, w, h); renderer.setRenderTarget(rt);
      renderer.setClearColor(sp.clear, 0); renderer.clear(true, true, false);
      if (top) { cam.left = -sp.mid.capR; cam.right = sp.mid.capR; cam.top = sp.mid.capR; cam.bottom = -sp.mid.capR; cam.near = 0.01; cam.far = 3; cam.position.set(0, 2, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); }
      else { cam.left = -sp.mid.halfW; cam.right = sp.mid.halfW; cam.top = 1.0; cam.bottom = 0; cam.near = 0.01; cam.far = 4; cam.up.set(0, 1, 0); cam.position.set(0, 0, 2); cam.rotation.set(0, 0, 0); }
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      renderer.render(sc, cam);
    }
    fm.dispose(); tm.dispose();
  });
  rt.scissorTest = false; rt.viewport.set(0, 0, CW * n, CH + CW); renderer.autoClear = true;
  renderer.setRenderTarget(prev.rt); renderer.setClearColor(pc, prev.ca); renderer.toneMapping = prev.tm; renderer.shadowMap.enabled = prev.sh;
  return { tex: rt.texture, CW, CH, W: CW * n, H: CH + CW };
}

function impostorGeo(m, i, atlas) {
  const u0 = i * atlas.CW / atlas.W, u1 = (i + 1) * atlas.CW / atlas.W, v1 = atlas.CH / atlas.H, hw = m.halfW, cr = m.capR, cy = m.capY;
  const pos = [], uv = [], nor = [], idx = [];
  const q4 = (pts, uvs) => { const b = pos.length / 3; pts.forEach((p, k) => { pos.push(...p); uv.push(...uvs[k]); nor.push(0, 0, 0); }); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  for (const a of [0, Math.PI / 3, 2 * Math.PI / 3]) {
    const c = Math.cos(a) * hw, s = Math.sin(a) * hw;
    q4([[-c, 0, -s], [c, 0, s], [c, 1, s], [-c, 1, -s]], [[u0, 0], [u1, 0], [u1, v1], [u0, v1]]);
  }
  q4([[-cr, cy, cr], [cr, cy, cr], [cr, cy, -cr], [-cr, cy, -cr]], [[u0, v1], [u1, v1], [u1, 1], [u0, 1]]);
  const b = pos.length / 3 - 4; for (let k = 0; k < 4; k++) nor[(b + k) * 3 + 1] = 1;      // marks the crown card (see vertex patch)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}

/* ------------------------------------------------------------------ build */
export function buildTrees(scene, renderer, qual) {
  U.uNear.value = qual.treeNear; U.uHero.value = qual.treeHero > 0 ? qual.treeHero : -1000;      // no hero level: nothing is ever 'closer than hero'
  const wind = qual.wind !== false, lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const needles = spruceAtlas(), sprays = leafTex(), clusters = leafAtlas(), birchLeaves = leafAtlas(1024, { seed: 431, leaf: 0.78, narrow: 1.15, hue: 0.5 });
  const barks = { spruce: barkMaps('spruce'), beech: barkMaps('beech'), birch: barkMaps('birch') };
  const midGain = [0.72, 0.27], mSpray = lum(meanOpaque(sprays));
  const leafGain = (tex, k) => midGain[1] * mSpray / lum(meanOpaque(tex)) * k;
  const species = [
    { mid: spruceMid(5), map: needles, bark: barks.spruce, gain: midGain[0], farGain: 1.15, clear: new THREE.Color(0.02, 0.06, 0.015), midBark: 'spruce',
      hero: [{ ...spruceHero(11), map: needles, bark: 'spruce', gain: midGain[0] * 1.05 }, { ...spruceHero(29), map: needles, bark: 'spruce', gain: midGain[0] * 1.05 }] },
    { mid: broadleafMid(9), map: sprays, bark: barks.beech, gain: midGain[1], farGain: 0.8, clear: new THREE.Color(0.07, 0.16, 0.03), midBark: 'beech',
      hero: [
        { ...broadleafHero(21), map: clusters, bark: 'beech', gain: leafGain(clusters, 1.25) },
        { ...broadleafHero(34, { spread: 1.12, droop: 0.1, trunk: 0.36 }), map: clusters, bark: 'beech', gain: leafGain(clusters, 1.25) },
        { ...broadleafHero(55, { spread: 0.8, droop: 0.2, card: 0.046, trunk: 0.44 }), map: birchLeaves, bark: 'birch', gain: leafGain(birchLeaves, 1.3) },
      ] },
  ];
  const atlas = bakeImpostors(renderer, species);
  const T = W.trees, n = T.length / 6;
  const group = new THREE.Group(); group.name = 'trees';
  const rand = rng32(4242);
  // per-tree instance transform + tint; buckets for the mid (64 m) and hero (32 m) cells
  const mats = new Float32Array(n * 16), cols = new Float32Array(n * 3), bySp = [[], []], midCells = new Map(), heroCells = new Map(), CS = 64, HS = 32;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const put = (map, key, i) => { const l = map.get(key); if (l) l.push(i); else map.set(key, [i]); };
  for (let i = 0; i < n; i++) {
    const x = T[i * 6], z = T[i * 6 + 1], y = T[i * 6 + 2], h = T[i * 6 + 3], sp = T[i * 6 + 4] > 0.5 ? 1 : 0;
    const wide = sp ? 0.85 + rand() * 0.5 : 0.9 + rand() * 0.35;
    q.setFromAxisAngle(UP, rand() * 6.283); s3.set(h * wide, h, h * wide); p3.set(x, y - 0.25, z);
    m4.compose(p3, q, s3).toArray(mats, i * 16);
    const b = 0.72 + rand() * 0.5, hue = rand();
    cols[i * 3] = b * (sp ? 0.92 + hue * 0.3 : 0.9 + hue * 0.2); cols[i * 3 + 1] = b; cols[i * 3 + 2] = b * (sp ? 0.8 + hue * 0.25 : 0.95 + hue * 0.15);
    bySp[sp].push(i);
    put(midCells, Math.floor(x / CS) + ',' + Math.floor(z / CS) + ',' + sp + ',0', i);
    put(heroCells, Math.floor(x / HS) + ',' + Math.floor(z / HS) + ',' + sp + ',' + ((Math.imul(i, 2654435761) >>> 8) % species[sp].hero.length), i);
  }
  const fill = (mesh, list, tint = true) => {
    const im = mesh.instanceMatrix.array, ic = new Float32Array(list.length * 3);
    list.forEach((t, k) => { im.set(mats.subarray(t * 16, t * 16 + 16), k * 16); if (tint) ic.set(cols.subarray(t * 3, t * 3 + 3), k * 3); else ic.fill(1, k * 3, k * 3 + 3); });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(ic, 3);
    mesh.instanceMatrix.needsUpdate = true;
  };
  const trunkMats = {};
  const trunkOf = (kind, mode) => trunkMats[kind + mode] || (trunkMats[kind + mode] = { mat: trunkMaterial(barks[kind], mode, wind, { spruce: 0xd8d2cc, beech: 0xa8a49c, birch: 0xdedcd4 }[kind]), dep: depthMaterial(null, mode, 0, wind) });

  species.forEach((sp, i) => {
    // far: one draw call per species
    const mat = foliageMaterial(atlas.tex, 'far', false, { userData: { halfW: sp.mid.halfW } }); mat.color.setScalar(sp.gain * sp.farGain);
    const mesh = new THREE.InstancedMesh(impostorGeo(sp.mid, i, atlas), mat, bySp[i].length);
    fill(mesh, bySp[i]);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = false;
    mesh.customDepthMaterial = depthMaterial(atlas.tex, 'far', 0.3, false);
    group.add(mesh);
    sp.midFol = foliageMaterial(sp.map, 'mid', wind); sp.midFol.color.setScalar(sp.gain); sp.midDep = depthMaterial(sp.map, 'mid', 0.42, wind);
    for (const hv of sp.hero) { hv.folMat = foliageMaterial(hv.map, 'hero', wind); hv.folMat.color.setScalar(hv.gain); hv.folDep = depthMaterial(hv.map, 'hero', 0.5, wind); }
  });
  scene.add(group);

  // cells around the camera
  const makeCell = (list, parts) => {
    const g = new THREE.Group(), bb = new THREE.Box3(), bs = new THREE.Sphere();
    for (const t of list) bb.expandByPoint(p3.set(T[t * 6], T[t * 6 + 2] + T[t * 6 + 3] * 0.5, T[t * 6 + 1]));
    bb.getBoundingSphere(bs); bs.radius += 24;
    for (const [geo, mat, dep, tint] of parts) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      fill(mesh, list, tint); mesh.castShadow = true; mesh.receiveShadow = true; mesh.customDepthMaterial = dep; mesh.boundingSphere = bs;
      g.add(mesh);
    }
    group.add(g); return g;
  };
  const manager = (cells, size, radius, variants, parts) => {
    const live = new Map(); let last = '';
    return (cam) => {
      const rad = radius(), cx = Math.floor(cam.position.x / size), cz = Math.floor(cam.position.z / size), k0 = cx + ',' + cz + ',' + rad;
      if (k0 === last) return; last = k0;
      const R = Math.ceil(rad / size) + 1, want = new Set();
      if (rad > 0) for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) for (const sp of [0, 1]) for (let v = 0; v < variants(sp); v++) {
        const key = (cx + i) + ',' + (cz + j) + ',' + sp + ',' + v;
        if (cells.has(key)) want.add(key);
      }
      for (const key of want) if (!live.has(key)) { const a = key.split(','); live.set(key, makeCell(cells.get(key), parts(+a[2], +a[3]))); }
      for (const [key, g] of live) if (!want.has(key)) { group.remove(g); g.children.forEach((m) => m.dispose()); live.delete(key); }
    };
  };
  const updMid = manager(midCells, CS, () => U.uNear.value + 30, () => 1, (sp) => {
    const s = species[sp], tk = trunkOf(s.midBark, 'mid');
    return [[s.mid.fol, s.midFol, s.midDep, true], [s.mid.trk, tk.mat, tk.dep, false]];
  });
  const updHero = manager(heroCells, HS, () => (U.uHero.value > 0 ? U.uHero.value + 12 : 0), (sp) => species[sp].hero.length, (sp, v) => {
    const hv = species[sp].hero[v], tk = trunkOf(hv.bark, 'hero');
    return [[hv.fol, hv.folMat, hv.folDep, true], [hv.trk, tk.mat, tk.dep, false]];
  });

  return {
    group, count: n, uniforms: U, atlas, wind,
    stats: species.map((s) => s.hero.map((h) => ({ foliageTris: h.fol.index.count / 3, woodTris: h.trk.index.count / 3 }))),
    update(cam, dt = 0) {
      U.uCamPos.value.copy(cam.position);
      if (wind) U.uTime.value += dt;
      updMid(cam); updHero(cam);
    },
  };
}
