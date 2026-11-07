// Small procedural geometry toolkit: tubes with parallel-transport frames, lathes,
// parametric grids. Everything writes position/normal/uv + aInfo (vec4) so one
// shader can colour any part (x = along-part 0..1, y = per-part random, z = level, w = kind).
import * as THREE from 'three';

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Builder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.info = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vertex(p, n, u, v, info) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v); this.info.push(info[0], info[1], info[2], info[3]);
    return this.pos.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, b, d, c); }

  // generalized cylinder along `pts`; radius = fn(t) with t in 0..1; rounded end cap
  tube(pts, radiusFn, radial = 6, info = [0, 0, 0, 0], cap = true, capBase = false) {
    const n = pts.length; if (n < 2) return;
    const T = [], N = [], B = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      T.push(b.clone().sub(a).normalize());
    }
    let nrm = Math.abs(T[0].y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
    nrm = nrm.sub(T[0].clone().multiplyScalar(nrm.dot(T[0]))).normalize();
    for (let i = 0; i < n; i++) {
      if (i > 0) nrm = nrm.clone().sub(T[i].clone().multiplyScalar(nrm.dot(T[i]))).normalize();
      N.push(nrm.clone()); B.push(new THREE.Vector3().crossVectors(T[i], nrm));
    }
    const base = this.count;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), r = radiusFn(t);
      for (let j = 0; j <= radial; j++) {
        const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const nn = N[i].clone().multiplyScalar(c).add(B[i].clone().multiplyScalar(s));
        const p = pts[i].clone().addScaledVector(nn, r);
        this.vertex(p, nn, j / radial, t, [info[0] + t * (info[4] ?? 1), info[1], info[2], info[3]]);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
      const a = base + i * (radial + 1) + j, b = a + 1, c = a + radial + 1, d = c + 1;
      this.tri(a, b, c); this.tri(b, d, c);
    }
    if (cap) {
      const r = radiusFn(1), tip = pts[n - 1].clone().addScaledVector(T[n - 1], r * 0.85);
      const ti = this.vertex(tip, T[n - 1], 0.5, 1, [info[0] + (info[4] ?? 1), info[1], info[2], info[3]]);
      const last = base + (n - 1) * (radial + 1);
      for (let j = 0; j < radial; j++) this.tri(last + j, last + j + 1, ti);
    }
  }

  // surface of revolution around Y; profile = [[radius, y], ...]
  lathe(profile, segs = 16, info = [0, 0, 0, 0], offset = V(), scale = V(1, 1, 1), radialFn = null) {
    const base = this.count, m = profile.length;
    for (let i = 0; i < m; i++) {
      const [r0, y] = profile[i];
      const pr = profile[Math.min(i + 1, m - 1)], pl = profile[Math.max(i - 1, 0)];
      const dr = pr[0] - pl[0], dy = pr[1] - pl[1];
      const len = Math.hypot(dr, dy) || 1;
      for (let j = 0; j <= segs; j++) {
        const a = j / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const r = radialFn ? radialFn(r0, y, a, i / (m - 1)) : r0;
        const nn = V(dy / len * c, -dr / len, dy / len * s).normalize();
        const p = V(r * c * scale.x, y * scale.y, r * s * scale.z).add(offset);
        this.vertex(p, nn, j / segs, i / (m - 1), [i / (m - 1), info[1], info[2], info[3]]);
      }
    }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < segs; j++) {
      const a = base + i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
      this.tri(a, c, b); this.tri(b, c, d);
    }
  }

  // parametric grid: fn(u,v) -> Vector3 ; normals from finite differences
  grid(nu, nv, fn, info = [0, 0, 0, 0], flip = false, expect = null) {
    const base = this.count, e = 1e-3;
    if (expect) {                                    // auto-orient: make the centre normal agree with `expect`
      const c = 0.5, dU = fn(c + e, c).sub(fn(c - e, c)), dV = fn(c, c + e).sub(fn(c, c - e));
      flip = new THREE.Vector3().crossVectors(dU, dV).dot(expect) < 0;
    }
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const p = fn(u, v);
      const du = fn(Math.min(u + e, 1), v).sub(fn(Math.max(u - e, 0), v));
      const dv = fn(u, Math.min(v + e, 1)).sub(fn(u, Math.max(v - e, 0)));
      const nn = new THREE.Vector3().crossVectors(du, dv);
      if (nn.lengthSq() < 1e-16) nn.set(0, 1, 0); else nn.normalize();     // degenerate at poles/centres
      if (flip) nn.negate();
      this.vertex(p, nn, u, v, [v, info[1], info[2], info[3]]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (flip) { this.tri(a, c, b); this.tri(b, c, d); } else { this.tri(a, b, c); this.tri(b, d, c); }
    }
  }

  // append another geometry-like set of arrays transformed by matrix
  addGeometry(g, matrix = new THREE.Matrix4(), info = null) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix), base = this.count;
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      nn.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.vertex(v, nn, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, info ? info : [0, 0, 0, 0]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i += 3) this.tri(base + g.index.getX(i), base + g.index.getX(i + 1), base + g.index.getX(i + 2));
    else for (let i = 0; i < p.count; i += 3) this.tri(base + i, base + i + 1, base + i + 2);
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// smooth value noise on the CPU for shape displacement (not tied to GLSL noise)
export function makeNoise3(seed = 1) {
  const r = mulberry32(seed), perm = new Uint8Array(512), g = [];
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const vals = new Float32Array(256).map(() => r() * 2 - 1);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const h = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
             l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  };
}
export const rotateAbout = (v, axis, ang) => v.clone().applyAxisAngle(axis, ang);
