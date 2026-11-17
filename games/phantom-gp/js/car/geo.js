// Geometry kernel: lofts, sections, airfoils, struts, plates, decals.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------- interpolation
// Monotone cubic (PCHIP): smooth, never overshoots the keys.
export function pchip(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i];
      const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (t) => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i]
      + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}
export const curve = (pairs) => pchip(pairs.map((p) => p[0]), pairs.map((p) => p[1]));

// rows: [key, v1, v2, ...] -> fn(key) -> {name: value}
export function table(names, rows) {
  const xs = rows.map((r) => r[0]);
  const fns = names.map((_, k) => pchip(xs, rows.map((r) => r[k + 1])));
  const f = (s) => { const o = {}; for (let k = 0; k < names.length; k++) o[names[k]] = fns[k](s); return o; };
  f.min = xs[0]; f.max = xs[xs.length - 1];
  return f;
}

export function range(a, b, step) {
  const n = Math.max(1, Math.round((b - a) / step)), out = [];
  for (let i = 0; i <= n; i++) out.push(a + (b - a) * i / n);
  return out;
}
export function uniqSorted(arr, eps = 1e-5) {
  const s = [...arr].sort((a, b) => a - b), out = [];
  for (const x of s) if (!out.length || x - out[out.length - 1] > eps) out.push(x);
  return out;
}

// ---------------------------------------------------------------- 2D sections
// Half super-ellipse from top centre (z=0) down the +z side to bottom centre.
// p: {w, yt, yb, ym, nt, nb}
export function halfSection(p, n = 140) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * i / n, c = Math.cos(a), s = Math.sin(a);
    if (c >= 0) { const e = 2 / p.nt; pts.push([p.w * Math.pow(s, e), p.ym + (p.yt - p.ym) * Math.pow(c, e)]); }
    else { const e = 2 / p.nb; pts.push([p.w * Math.pow(s, e), p.ym - (p.ym - p.yb) * Math.pow(-c, e)]); }
  }
  pts[0][0] = 0; pts[n][0] = 0;
  return pts;
}
// Full closed super-ellipse with a different exponent per quadrant.
// p: {zc, yc, hw, hh, n: [topOut, botOut, botIn, topIn]} ; starts top centre, runs towards +z.
export function fullSection(p, n = 240) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = 2 * Math.PI * i / n, c = Math.cos(a), s = Math.sin(a);
    const q = s >= 0 ? (c >= 0 ? 0 : 1) : (c < 0 ? 2 : 3), e = 2 / p.n[q];
    pts.push([p.zc + p.hw * Math.sign(s) * Math.pow(Math.abs(s), e), p.yc + p.hh * Math.sign(c) * Math.pow(Math.abs(c), e)]);
  }
  pts[n] = [pts[0][0], pts[0][1]];
  return pts;
}
// Start the polyline where z first reaches zc (cockpit edge).
export function cutAtZ(pts, zc) {
  if (zc <= 1e-6) return pts;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= zc) {
      const a = pts[i - 1], b = pts[i], t = (zc - a[0]) / (b[0] - a[0] || 1);
      return [[zc, a[1] + (b[1] - a[1]) * t], ...pts.slice(i)];
    }
  }
  return pts;
}
// Resample a 2D polyline to `count` points equally spaced by arc length.
export function resample(pts, count) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[L.length - 1], out = [];
  let k = 0;
  for (let i = 0; i < count; i++) {
    const d = tot * i / (count - 1);
    while (k < pts.length - 2 && L[k + 1] < d) k++;
    const seg = L[k + 1] - L[k], t = seg > 1e-12 ? (d - L[k]) / seg : 0;
    out.push([lerp(pts[k][0], pts[k + 1][0], t), lerp(pts[k][1], pts[k + 1][1], t)]);
  }
  out[0] = [pts[0][0], pts[0][1]];
  out[count - 1] = [pts[pts.length - 1][0], pts[pts.length - 1][1]];
  return out;
}
// Mirror a half section ([z,y], top -> bottom) into a full ring at world x.
export function symRing(x, half) {
  const r = [];
  for (const [z, y] of half) r.push(v3(x, y, z));
  for (let i = half.length - 2; i >= 0; i--) r.push(v3(x, half[i][1], -half[i][0]));
  return r;
}
export const ringYZ = (x, pts) => pts.map(([z, y]) => v3(x, y, z));

// NACA-style section. Returns an open loop: upper TE -> LE -> lower TE, x in 0..1.
export function airfoil(n = 26, thick = 0.09, camber = -0.07, cpos = 0.42, te = 0.004) {
  const up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const x = 0.5 * (1 - Math.cos(Math.PI * i / n));
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x) + te * x * 0.5;
    const yc = x < cpos ? camber / (cpos * cpos) * (2 * cpos * x - x * x)
      : camber / ((1 - cpos) * (1 - cpos)) * ((1 - 2 * cpos) + 2 * cpos * x - x * x);
    up.push([x, yc + yt]); lo.push([x, yc - yt]);
  }
  return [...up.reverse(), ...lo.slice(1)];
}
export function ellipseLoop(a, b, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = 2 * Math.PI * i / n; pts.push([a * Math.cos(t), b * Math.sin(t)]); }
  pts[n] = [pts[0][0], pts[0][1]];
  return pts;
}
// Rounded-rectangle loop (super-ellipse), closed.
export function squircleLoop(a, b, e = 4, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = 2 * Math.PI * i / n, c = Math.cos(t), s = Math.sin(t);
    pts.push([a * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / e)]);
  }
  pts[n] = [pts[0][0], pts[0][1]];
  return pts;
}

// ---------------------------------------------------------------- loft
// rings: Vector3[N][M]. Options:
//   groups: [{from, to, mat}] (quad rows by ring index), capStart/capEnd: true | 'strip',
//   capMatStart/capMatEnd, facing: Vector3 (orientation for open sheets), flip, uvFn(i, j, p, frac)
// Level of detail for every lofted part (set before buildCar). tol = 0 builds the part as authored; otherwise rings
// and columns are dropped while the surface stays within `tol` metres of the full one (and within a tenth of the
// part's own radius, so thin tubes stay round). hand = Loop subdivision levels of the hand mesh, tex = mask scale.
export const DETAIL = { tol: 0, hand: 2, tex: 1 };
// The button above the right grip that the film's driver presses, in the steering wheel's own frame (x right, y up
// the wheel, z towards the driver): its axis, the height of its cap when up, the cap's radius and how far it travels.
export const DRIVE_BTN = { x: 0.1, y: 0.058, top: 0.0215, r: 0.0068, travel: 0.0026 };
function segDist2(p, a, b) {
  const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, l2 = ex * ex + ey * ey + ez * ez;
  let t = l2 > 0 ? ((p.x - a.x) * ex + (p.y - a.y) * ey + (p.z - a.z) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + ex * t - p.x, dy = a.y + ey * t - p.y, dz = a.z + ez * t - p.z;
  return dx * dx + dy * dy + dz * dz;
}
function thinLoft(rings, o) {
  const N = rings.length, M = rings[0].length;
  let size = 0;
  for (let i = 0; i < N; i += Math.max(1, N >> 4)) { const r = rings[i], c = v3(); for (const p of r) c.add(p); c.multiplyScalar(1 / M); let d = 0; for (const p of r) d += p.distanceTo(c); size = Math.max(size, d / M); }
  const tol = Math.min(DETAIL.tol, 0.1 * size), tol2 = tol * tol;
  const lock = new Uint8Array(N); lock[0] = lock[N - 1] = 1;
  for (const g of o.groups || []) { lock[Math.min(N - 1, Math.max(0, g.from))] = 1; lock[Math.min(N - 1, Math.max(0, g.to))] = 1; }
  const ri = [0], cs = Math.max(1, Math.floor(M / 40));
  for (let i = 1, last = 0; i < N; i++) {
    if (lock[i]) { ri.push(i); last = i; continue; }
    let ok = i - last < 12; const e = i + 1;
    for (let k = last + 1; k < e && ok; k++) for (let j = 0; j < M; j += cs) if (segDist2(rings[k][j], rings[last][j], rings[e][j]) > tol2) { ok = false; break; }
    if (!ok) { ri.push(i); last = i; }
  }
  const cj = [0];
  for (let j = 1, last = 0; j < M; j++) {
    if (j === M - 1) { cj.push(j); break; }
    let ok = j - last < Math.max(2, M / 5); const e = j + 1;
    for (let k = last + 1; k < e && ok; k++) for (const i of ri) { const r = rings[i]; if (segDist2(r[k], r[last], r[e]) > tol2) { ok = false; break; } }
    if (!ok) { cj.push(j); last = j; }
  }
  const o2 = { ...o, _ri: ri, _cj: cj, _N0: N, _M0: M };
  if (o.uvFn) o2.uvFn = (i, j, p, f, uv) => o.uvFn(ri[i], cj[j], p, f, uv);
  if (o.normalFn) o2.normalFn = (i, j, p) => o.normalFn(ri[i], cj[j], p);
  if (o.groups) { const inv = new Map(ri.map((v, k) => [v, k])), cl = (v) => inv.get(Math.min(N - 1, Math.max(0, v))); o2.groups = o.groups.map((g) => ({ ...g, from: cl(g.from), to: cl(g.to) })); }
  return { rings: ri.map((i) => cj.map((j) => rings[i][j])), o: o2 };
}

export function loft(rings, o = {}) {
  const full = rings;
  if (DETAIL.tol > 0 && !o.exact && rings.length * rings[0].length > 24) { const t = thinLoft(rings, o); rings = t.rings; o = t.o; }
  const N = rings.length, M = rings[0].length;
  const N0 = o._N0 ?? N, M0 = o._M0 ?? M, RI = o._ri, CJ = o._cj;
  const P = [], Nn = [], UV = [], UV1 = [];
  const closed = rings.map((r) => r[0].distanceToSquared(r[M - 1]) < 1e-12);
  const cen = rings.map((r) => { const c = v3(); for (const p of r) c.add(p); return c.multiplyScalar(1 / M); });
  const U = [0];
  for (let i = 1; i < N; i++) { let d = 0; for (let j = 0; j < M; j++) d += rings[i][j].distanceTo(rings[i - 1][j]); U.push(U[i - 1] + d / M); }
  const a = v3(), b = v3(), n = v3();
  const fallback = new Uint8Array(N * M);
  let refI = 0, refPer = -1;
  for (let i = 0; i < N; i++) {
    const r = rings[i], L = [0];
    for (let j = 1; j < M; j++) L.push(L[j - 1] + r[j].distanceTo(r[j - 1]));
    const tot = L[M - 1];
    if (tot > refPer) { refPer = tot; refI = i; }
    for (let j = 0; j < M; j++) {
      const p = r[j];
      P.push(p.x, p.y, p.z);
      let i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, N - 1);
      a.subVectors(rings[i1][j], rings[i0][j]);
      if (a.lengthSq() < 1e-16) { i0 = Math.max(i - 2, 0); i1 = Math.min(i + 2, N - 1); a.subVectors(rings[i1][j], rings[i0][j]); }
      let j0 = j - 1, j1 = j + 1;
      if (closed[i]) { if (j0 < 0) j0 = M - 2; if (j1 > M - 1) j1 = 1; } else { j0 = Math.max(j0, 0); j1 = Math.min(j1, M - 1); }
      b.subVectors(r[j1], r[j0]);
      n.crossVectors(a, b);
      if (n.lengthSq() < 1e-22) {
        // collapsed ring (tip): point along the loft axis, away from the neighbour ring
        const k = i === 0 ? 1 : i === N - 1 ? N - 2 : (tot < 1e-9 ? (i + 1) : i);
        n.subVectors(cen[i], cen[Math.min(Math.max(k, 0), N - 1)]);
        if (n.lengthSq() < 1e-22) n.set(0, 1, 0);
        fallback[i * M + j] = 1;
      }
      n.normalize();
      if (o.normalFn) { const an = o.normalFn(i, j, p); if (an) { n.copy(an); fallback[i * M + j] = 1; } }
      Nn.push(n.x, n.y, n.z);
      let uv = [U[i], L[j] - tot / 2];
      if (o.uvFn) uv = o.uvFn(i, j, p, tot > 0 ? L[j] / tot : 0, uv);
      UV.push(uv[0], uv[1]);
      UV1.push((RI ? RI[i] : i) / (N0 - 1), (CJ ? CJ[j] : j) / (M0 - 1));
    }
  }
  // orientation
  let flip = !!o.flip;
  if (o.flip === undefined) {
    let s = 0;
    if (o.facing) { for (let k = 0; k < N * M; k++) if (!fallback[k]) s += Nn[k * 3] * o.facing.x + Nn[k * 3 + 1] * o.facing.y + Nn[k * 3 + 2] * o.facing.z; }
    else { const c = cen[refI]; for (let j = 0; j < M; j++) { const k = refI * M + j; s += Nn[k * 3] * (P[k * 3] - c.x) + Nn[k * 3 + 1] * (P[k * 3 + 1] - c.y) + Nn[k * 3 + 2] * (P[k * 3 + 2] - c.z); } }
    flip = s < 0;
  }
  if (flip) for (let k = 0; k < N * M; k++) if (!fallback[k]) { Nn[k * 3] *= -1; Nn[k * 3 + 1] *= -1; Nn[k * 3 + 2] *= -1; }

  const groups = o.groups || [{ from: 0, to: N - 1, mat: 0 }];
  const idx = [], gOut = [];
  const same = (p, q) => { const dx = P[p * 3] - P[q * 3], dy = P[p * 3 + 1] - P[q * 3 + 1], dz = P[p * 3 + 2] - P[q * 3 + 2]; return dx * dx + dy * dy + dz * dz < 1e-16; };
  const tri = (p, q, r) => { if (same(p, q) || same(q, r) || same(p, r)) return; if (flip) idx.push(p, r, q); else idx.push(p, q, r); };
  for (const g of groups) {
    const start = idx.length;
    for (let i = g.from; i < Math.min(g.to, N - 1); i++) for (let j = 0; j < M - 1; j++) {
      const p00 = i * M + j, p10 = (i + 1) * M + j, p01 = i * M + j + 1, p11 = (i + 1) * M + j + 1;
      tri(p00, p10, p01); tri(p10, p11, p01);
    }
    gOut.push([start, idx.length - start, g.mat]);
  }
  // caps
  const cap = (i, mode, mat) => {
    const start = idx.length, r = rings[i], base = P.length / 3;
    const d = v3().subVectors(cen[i], cen[i === 0 ? 1 : N - 2]).normalize();
    for (let j = 0; j < M; j++) { P.push(r[j].x, r[j].y, r[j].z); Nn.push(d.x, d.y, d.z); UV.push(r[j].z, r[j].y); UV1.push((RI ? RI[i] : i) / (N0 - 1), (CJ ? CJ[j] : j) / (M0 - 1)); }
    const face = (p, q, s) => {
      a.set(P[q * 3] - P[p * 3], P[q * 3 + 1] - P[p * 3 + 1], P[q * 3 + 2] - P[p * 3 + 2]);
      b.set(P[s * 3] - P[p * 3], P[s * 3 + 1] - P[p * 3 + 1], P[s * 3 + 2] - P[p * 3 + 2]);
      n.crossVectors(a, b); if (n.lengthSq() < 1e-20) return;
      if (n.dot(d) > 0) idx.push(p, q, s); else idx.push(p, s, q);
    };
    if (mode === 'strip') {
      const last = closed[i] ? M - 2 : M - 1, half = Math.floor(last / 2);
      for (let j = 0; j < half; j++) { const p = base + j, q = base + j + 1, s = base + last - j, t = base + last - j - 1; face(p, q, s); face(q, t, s); }
    } else {
      const c = P.length / 3; P.push(cen[i].x, cen[i].y, cen[i].z); Nn.push(d.x, d.y, d.z); UV.push(cen[i].z, cen[i].y); UV1.push((RI ? RI[i] : i) / (N0 - 1), 0.5);
      for (let j = 0; j < M - 1; j++) face(c, base + j, base + j + 1);
      if (!closed[i]) face(c, base + M - 1, base);
    }
    gOut.push([start, idx.length - start, mat]);
  };
  if (o.capStart) cap(0, o.capStart, o.capMatStart ?? groups[0].mat);
  if (o.capEnd) cap(N - 1, o.capEnd, o.capMatEnd ?? groups[groups.length - 1].mat);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(UV1, 2));
  g.setIndex(idx);
  if (gOut.length > 1 || gOut[0][2] !== 0) for (const [s, c, m] of gOut) g.addGroup(s, c, m);
  g.userData.rings = full;
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// Mirror a geometry across z=0 (keeps outward winding).
export function mirrorZ(g) {
  const m = g.clone();
  const p = m.attributes.position, n = m.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setZ(i, -p.getZ(i)); if (n) n.setZ(i, -n.getZ(i)); }
  if (m.index) { const a = m.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  else { for (const name of Object.keys(m.attributes)) { const at = m.attributes[name], s = at.itemSize, arr = at.array; for (let i = 0; i < at.count; i += 3) for (let k = 0; k < s; k++) { const t = arr[(i + 1) * s + k]; arr[(i + 1) * s + k] = arr[(i + 2) * s + k]; arr[(i + 2) * s + k] = t; } } }
  m.userData.rings = g.userData.rings ? g.userData.rings.map((r) => r.map((q) => v3(q.x, q.y, -q.z))) : undefined;
  m.computeBoundingSphere(); m.computeBoundingBox();
  return m;
}

// ---------------------------------------------------------------- sweeps
// Sweep a 2D loop along a path. secFn(i, frac) -> [[a,b],...] ; a along `side`, b along local up.
export function sweepRings(path, upHint, secFn, closedPath = false) {
  const rings = [], n = path.length;
  const T = v3(), S = v3(), Up = v3();
  for (let i = 0; i < n; i++) {
    const p0 = path[closedPath ? (i - 1 + n) % n : Math.max(i - 1, 0)], p1 = path[closedPath ? (i + 1) % n : Math.min(i + 1, n - 1)];
    T.subVectors(p1, p0).normalize();
    const h = typeof upHint === 'function' ? upHint(i, T) : upHint;
    S.crossVectors(T, h).normalize(); Up.crossVectors(S, T).normalize();
    const sec = secFn(i, n > 1 ? i / (n - 1) : 0);
    rings.push(sec.map(([sa, sb]) => v3().copy(path[i]).addScaledVector(S, sa).addScaledVector(Up, sb)));
  }
  if (closedPath) rings.push(rings[0].map((p) => p.clone()));
  return rings;
}
export function tube(path, upHint, secFn, o = {}) {
  return loft(sweepRings(path, upHint, secFn, o.closedPath), { capStart: o.caps !== false && !o.closedPath, capEnd: o.caps !== false && !o.closedPath, ...o });
}
// Aero strut between two points. chord lies along `hint` (projected), thickness across.
export function strut(pa, pb, chord, thick, hint = v3(1, 0, 0), seg = 18, taper = 1) {
  const dir = v3().subVectors(pb, pa), len = dir.length(); dir.normalize();
  const C = v3().copy(hint).addScaledVector(dir, -hint.dot(dir));
  if (C.lengthSq() < 1e-8) C.set(0, 1, 0).addScaledVector(dir, -dir.y);
  C.normalize();
  const Nn = v3().crossVectors(dir, C).normalize();
  const st = [0, 0.5, 1].map((t) => t), rings = [];
  for (const t of st) {
    const k = lerp(1, taper, t), c = v3().copy(pa).addScaledVector(dir, len * t), r = [];
    for (let i = 0; i <= seg; i++) {
      const a = 2 * Math.PI * i / seg, ca = Math.cos(a), sa = Math.sin(a);
      // lens-ish section: ellipse with sharpened ends
      const ex = Math.sign(ca) * Math.pow(Math.abs(ca), 0.85);
      r.push(v3().copy(c).addScaledVector(C, 0.5 * chord * k * ex).addScaledVector(Nn, 0.5 * thick * k * sa));
    }
    r[seg] = r[0].clone();
    rings.push(r);
  }
  return loft(rings, { capStart: true, capEnd: true });
}
export function rod(pa, pb, r, seg = 12) { return strut(pa, pb, 2 * r, 2 * r, Math.abs(pb.y - pa.y) > 0.9 * pa.distanceTo(pb) ? v3(1, 0, 0) : v3(0, 1, 0), seg); }

// ---------------------------------------------------------------- plates
// Polygon [[x,y],...] with rounded corners -> THREE.Shape. radius may be a number or per-vertex array.
export function roundedShape(pts, radius = 0.01) {
  const sh = new THREE.Shape(), n = pts.length;
  const P = (i) => pts[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const p = P(i), a = P(i - 1), b = P(i + 1);
    const r0 = Array.isArray(radius) ? radius[i] : radius;
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const r = Math.min(r0, da * 0.45, db * 0.45);
    const p0 = [p[0] + (a[0] - p[0]) / da * r, p[1] + (a[1] - p[1]) / da * r];
    const p1 = [p[0] + (b[0] - p[0]) / db * r, p[1] + (b[1] - p[1]) / db * r];
    if (i === 0) sh.moveTo(p0[0], p0[1]); else sh.lineTo(p0[0], p0[1]);
    if (r > 1e-6) sh.quadraticCurveTo(p[0], p[1], p1[0], p1[1]);
  }
  sh.closePath();
  return sh;
}
// Extruded plate in the shape's XY plane, thickness centred on z=0.
export function plate(shape, thick, bevel = 0.0015, curveSegments = 14, crease = 38) {
  const b = Math.min(bevel, thick * 0.45);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thick - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments,
  });
  g.translate(0, 0, -(thick - 2 * b) / 2);
  const out = toCreasedNormals(g, crease * DEG);
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
// Deform positions in place and rebuild creased normals.
export function deform(g, fn, crease = 38) {
  const p = g.attributes.position, t = v3();
  for (let i = 0; i < p.count; i++) { t.fromBufferAttribute(p, i); fn(t); p.setXYZ(i, t.x, t.y, t.z); }
  g.deleteAttribute('normal');
  const out = toCreasedNormals(g, crease * DEG);
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

// ---------------------------------------------------------------- decals
// Project a rectangle onto world-space geometries. W = outward (towards the viewer), V = text up.
export function projectDecal(geos, origin, W, V, width, height, depth = 0.25, lift = 0.0009, minFacing = 0.12) {
  W = W.clone().normalize();
  const U = v3().crossVectors(V, W).normalize(), Vv = v3().crossVectors(W, U).normalize();
  const P = [], Nn = [], UV = [];
  const clipAxis = (poly, ax, lo, hi) => {
    for (const [bound, sign] of [[lo, 1], [hi, -1]]) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const A = poly[i], B = poly[(i + 1) % poly.length];
        const da = (A.c[ax] - bound) * sign, db = (B.c[ax] - bound) * sign;
        if (da >= 0) out.push(A);
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db);
          out.push({ p: A.p.clone().lerp(B.p, t), n: A.n.clone().lerp(B.n, t), c: [lerp(A.c[0], B.c[0], t), lerp(A.c[1], B.c[1], t), lerp(A.c[2], B.c[2], t)] });
        }
      }
      poly = out; if (poly.length < 3) return poly;
    }
    return poly;
  };
  for (const g of geos) {
    const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
    const tc = idx ? idx.count / 3 : pos.count / 3;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    for (let t = 0; t < tc; t++) {
      const ii = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
      const cs = [];
      let f = 0, lo0 = 0, hi0 = 0, lo1 = 0, hi1 = 0, lo2 = 0, hi2 = 0;
      for (const i of ii) {
        const dx = pos.getX(i) - ox, dy = pos.getY(i) - oy, dz = pos.getZ(i) - oz;
        const c = [(dx * U.x + dy * U.y + dz * U.z) / width + 0.5, (dx * Vv.x + dy * Vv.y + dz * Vv.z) / height + 0.5, (dx * W.x + dy * W.y + dz * W.z) / depth];
        cs.push(c);
        f += nor.getX(i) * W.x + nor.getY(i) * W.y + nor.getZ(i) * W.z;
        if (c[0] < 0) lo0++; if (c[0] > 1) hi0++; if (c[1] < 0) lo1++; if (c[1] > 1) hi1++; if (c[2] < -0.5) lo2++; if (c[2] > 0.5) hi2++;
      }
      if (f < 3 * minFacing || lo0 === 3 || hi0 === 3 || lo1 === 3 || hi1 === 3 || lo2 === 3 || hi2 === 3) continue;
      let poly = ii.map((i, k) => ({ p: v3().fromBufferAttribute(pos, i), n: v3().fromBufferAttribute(nor, i), c: cs[k] }));
      poly = clipAxis(poly, 0, 0, 1); if (poly.length < 3) continue;
      poly = clipAxis(poly, 1, 0, 1); if (poly.length < 3) continue;
      poly = clipAxis(poly, 2, -0.5, 0.5); if (poly.length < 3) continue;
      for (let k = 1; k < poly.length - 1; k++) for (const q of [poly[0], poly[k], poly[k + 1]]) {
        const nn = q.n.clone().normalize();
        P.push(q.p.x + nn.x * lift, q.p.y + nn.y * lift, q.p.z + nn.z * lift); Nn.push(nn.x, nn.y, nn.z); UV.push(q.c[0], q.c[1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}

// Low-discrepancy sequence
export function halton(i, base) { let f = 1, r = 0; while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); } return r; }
