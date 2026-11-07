// Collision for the big solid things the scatter system plants (coral heads, boulders, barrel sponges, table-coral plates), so the fish and the camera
// cannot pass through them. Every variant gets a small signed distance field built ONCE from its real mesh (rasterised into a column heightfield, filled
// between the lowest and the highest surface of every column - a table coral therefore stays hollow under its plate - then an exact Euclidean distance
// transform in both directions). A query is one trilinear lookup in the instance's local frame, so a body of any radius is "outside" exactly when the
// distance is larger than that radius, and the field's gradient is the way out. Branching corals and seagrass are deliberately NOT solid: the fish hides in
// them and the camera dissolves what comes too close to the lens (uNearFade / uOccl in flora/materials.js).
// The first version used ellipsoids fitted to the bounding boxes: the real meshes stuck out of them by up to 40 % and the camera ended up inside rocks.
import * as THREE from 'three';

// species id -> minimum height (metres, world) for an instance to count as an obstacle
const SPEC = { massive: 0.06, stones: 0.07, barrel: 0.10, table: 0.10, pocillo: 0.12 };
const TARGET = 44;                                                     // voxels along the longest side of a shape (5-7 cm voxels on the biggest boulders)
const PAD = 3;

// ---- exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher) over a 3-D grid -------------------------------------------------------------
function edt1(f, n, v, z, out) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; out[q] = (q - p) * (q - p) + f[p]; }
}
function edt3(feature, nx, ny, nz) {                                   // feature: Uint8Array, 1 = source. returns the squared distance (voxels^2) to the nearest source
  const N = nx * ny * nz, g = new Float64Array(N), INF = 1e10;
  for (let i = 0; i < N; i++) g[i] = feature[i] ? 0 : INF;
  const m = Math.max(nx, ny, nz), f = new Float64Array(m), o = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const b = (k * ny + j) * nx; for (let i = 0; i < nx; i++) f[i] = g[b + i]; edt1(f, nx, v, z, o); for (let i = 0; i < nx; i++) g[b + i] = o[i]; }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) f[j] = g[(k * ny + j) * nx + i]; edt1(f, ny, v, z, o); for (let j = 0; j < ny; j++) g[(k * ny + j) * nx + i] = o[j]; }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { for (let k = 0; k < nz; k++) f[k] = g[(k * ny + j) * nx + i]; edt1(f, nz, v, z, o); for (let k = 0; k < nz; k++) g[(k * ny + j) * nx + i] = o[k]; }
  return g;
}

// ---- one signed distance field per variant ---------------------------------------------------------------------------------------------------------------
function buildShape(geo) {
  const pos = geo.attributes.position, idx = geo.index;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, ex = bb.max.x - bb.min.x, ey = bb.max.y - bb.min.y, ez = bb.max.z - bb.min.z;
  const h = Math.max(ex, ey, ez) / TARGET;
  const nx = Math.ceil(ex / h) + 2 * PAD, ny = Math.ceil(ey / h) + 2 * PAD, nz = Math.ceil(ez / h) + 2 * PAD;
  const ox = bb.min.x - PAD * h, oy = bb.min.y - PAD * h, oz = bb.min.z - PAD * h;
  const top = new Float32Array(nx * nz).fill(-1e9), bot = new Float32Array(nx * nz).fill(1e9);
  const tri = idx ? idx.count / 3 : pos.count / 3;
  for (let t = 0; t < tri; t++) {
    const ia = idx ? idx.getX(t * 3) : t * 3, ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    const ax = pos.getX(ia), ay = pos.getY(ia), az = pos.getZ(ia), bx = pos.getX(ib), by = pos.getY(ib), bz = pos.getZ(ib), cx = pos.getX(ic), cy = pos.getY(ic), cz = pos.getZ(ic);
    const lab = Math.hypot(bx - ax, by - ay, bz - az), lac = Math.hypot(cx - ax, cy - ay, cz - az), lbc = Math.hypot(cx - bx, cy - by, cz - bz);
    const steps = Math.max(1, Math.ceil(Math.max(lab, lac, lbc) / (h * 0.5)));
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
      const u = i / steps, w = j / steps, a = 1 - u - w;
      const x = a * ax + u * bx + w * cx, y = a * ay + u * by + w * cy, z = a * az + u * bz + w * cz;
      const c = Math.floor((z - oz) / h) * nx + Math.floor((x - ox) / h);
      if (y > top[c]) top[c] = y; if (y < bot[c]) bot[c] = y;
    }
  }
  const solid = new Uint8Array(nx * ny * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const c = iz * nx + ix; if (top[c] < bot[c]) continue;
    const y0 = Math.max(0, Math.floor((bot[c] - oy) / h)), y1 = Math.min(ny - 1, Math.floor((top[c] - oy) / h));
    for (let iy = y0; iy <= y1; iy++) solid[(iz * ny + iy) * nx + ix] = 1;
  }
  const free = new Uint8Array(solid.length); for (let i = 0; i < free.length; i++) free[i] = solid[i] ? 0 : 1;
  const dOut = edt3(solid, nx, ny, nz), dIn = edt3(free, nx, ny, nz);       // free voxels: distance to the nearest solid one; solid voxels: distance to the nearest free one
  const sdf = new Float32Array(solid.length);
  for (let i = 0; i < sdf.length; i++) sdf[i] = (solid[i] ? -(Math.sqrt(dIn[i]) - 0.5) : (Math.sqrt(dOut[i]) - 0.5)) * h;
  return { sdf, nx, ny, nz, ox, oy, oz, h, cx: (bb.min.x + bb.max.x) / 2, cy: (bb.min.y + bb.max.y) / 2, cz: (bb.min.z + bb.max.z) / 2, rad: Math.hypot(ex, ey, ez) / 2 + 2 * h, top: bb.max.y };
}

function sample(S, lx, ly, lz) {                                        // trilinear signed distance (local units); outside the grid: distance to the grid box + the padding
  const gx = (lx - S.ox) / S.h - 0.5, gy = (ly - S.oy) / S.h - 0.5, gz = (lz - S.oz) / S.h - 0.5, nx = S.nx, ny = S.ny, nz = S.nz;
  if (gx < 0 || gy < 0 || gz < 0 || gx > nx - 1 || gy > ny - 1 || gz > nz - 1) {
    const dx = Math.max(-gx, gx - (nx - 1), 0), dy = Math.max(-gy, gy - (ny - 1), 0), dz = Math.max(-gz, gz - (nz - 1), 0);
    return (Math.hypot(dx, dy, dz) + PAD) * S.h;
  }
  const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz), fx = gx - i0, fy = gy - j0, fz = gz - k0;
  const i1 = Math.min(i0 + 1, nx - 1), j1 = Math.min(j0 + 1, ny - 1), k1 = Math.min(k0 + 1, nz - 1), f = S.sdf;
  const a = (k, j, i) => f[(k * ny + j) * nx + i];
  const c00 = a(k0, j0, i0) * (1 - fx) + a(k0, j0, i1) * fx, c10 = a(k0, j1, i0) * (1 - fx) + a(k0, j1, i1) * fx;
  const c01 = a(k1, j0, i0) * (1 - fx) + a(k1, j0, i1) * fx, c11 = a(k1, j1, i0) * (1 - fx) + a(k1, j1, i1) * fx;
  return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
}

export class Solids {
  constructor(scatter) {
    this.scatter = scatter; this.list = []; this.n = 0;
    this.cx = 1e9; this.cz = 1e9; this.age = 99;
    this.shapes = new Map();
    this._o = { x: 0, y: 0, z: 0 }; this._m = new THREE.Matrix4();
  }

  shapeOf(sp, v) {
    const key = sp.id + ':' + v;
    let s = this.shapes.get(key);
    if (!s) { s = buildShape(sp.variants[v][0]); this.shapes.set(key, s); }
    return s;
  }

  // collect the instances within R of (px, pz) from the instance buffers the scatter system currently has loaded
  rebuild(px, pz, R = 16) {
    this.cx = px; this.cz = pz; this.age = 0;
    const out = [], m = this._m;
    for (const id in SPEC) {
      const sp = this.scatter.species.find((q) => q.id === id); if (!sp) continue;
      const minH = SPEC[id];
      for (let v = 0; v < sp.meshes.length; v++) {
        let S = null;
        for (const mesh of sp.meshes[v]) {
          const a = mesh.instanceMatrix.array, n = mesh.count;
          for (let i = 0; i < n; i++) {
            const o = i * 16, dx = a[o + 12] - px, dz = a[o + 14] - pz;
            const sxw = Math.hypot(a[o], a[o + 1], a[o + 2]), syw = Math.hypot(a[o + 4], a[o + 5], a[o + 6]), szw = Math.hypot(a[o + 8], a[o + 9], a[o + 10]);
            const reach = R + 3 * Math.max(sxw, szw) + 2 * syw;
            if (dx * dx + dz * dz > reach * reach) continue;
            S = S || this.shapeOf(sp, v);
            if (S.top * syw < minH) continue;                                            // too low to matter
            const sc = Math.cbrt(sxw * syw * szw), rad = S.rad * Math.max(sxw, syw, szw);
            m.fromArray(a, o); m.invert();
            const wx = a[o] * S.cx + a[o + 4] * S.cy + a[o + 8] * S.cz + a[o + 12], wy = a[o + 1] * S.cx + a[o + 5] * S.cy + a[o + 9] * S.cz + a[o + 13], wz = a[o + 2] * S.cx + a[o + 6] * S.cy + a[o + 10] * S.cz + a[o + 14];
            out.push({ S, inv: Float32Array.from(m.elements), sc, wx, wy, wz, wr: rad });
          }
        }
      }
    }
    this.list = out; this.n = out.length;
    return out.length;
  }

  // build every variant's field up front (a few ms each): done while the world loads, so nothing hitches in play
  prewarm() { for (const id in SPEC) { const sp = this.scatter.species.find((q) => q.id === id); if (sp) for (let v = 0; v < sp.variants.length; v++) this.shapeOf(sp, v); } return this.shapes.size; }

  probe(S, lx, ly, lz) { return sample(S, lx, ly, lz); }                          // test hook: signed distance of a local point to the shape's surface

  update(dt, px, pz) {
    this.age += dt;
    if (this.age > 1.5 || Math.hypot(px - this.cx, pz - this.cz) > 5) this.rebuild(px, pz, 19);     // 14+ m around the fish stay covered; a rebuild costs a few ms in the reef
  }

  // The displacement that moves a body of radius r at (x,y,z) out of the nearest solid (a shared object), or null when it is clear.
  push(x, y, z, r) {
    let best = null, bd = 0;
    const o = this._o;
    for (const s of this.list) {
      const ddx = x - s.wx, ddy = y - s.wy, ddz = z - s.wz, lim = s.wr + r;
      if (ddx * ddx + ddy * ddy + ddz * ddz > lim * lim) continue;
      const iv = s.inv, lx = iv[0] * x + iv[4] * y + iv[8] * z + iv[12], ly = iv[1] * x + iv[5] * y + iv[9] * z + iv[13], lz = iv[2] * x + iv[6] * y + iv[10] * z + iv[14];
      const S = s.S, d = sample(S, lx, ly, lz) * s.sc;
      if (d >= r) continue;
      // gradient of the field in the local frame (central differences), brought to the world frame with the inverse transpose
      const e = S.h * 0.8;
      const gx = sample(S, lx + e, ly, lz) - sample(S, lx - e, ly, lz), gy = sample(S, lx, ly + e, lz) - sample(S, lx, ly - e, lz), gz = sample(S, lx, ly, lz + e) - sample(S, lx, ly, lz - e);
      let nx = iv[0] * gx + iv[1] * gy + iv[2] * gz, ny = iv[4] * gx + iv[5] * gy + iv[6] * gz, nz = iv[8] * gx + iv[9] * gy + iv[10] * gz;
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-9) { nx = 0; ny = 1; nz = 0; nl = 1; }
      const mag = r - d, k = mag / nl;
      if (mag > bd) { bd = mag; o.x = nx * k; o.y = ny * k; o.z = nz * k; best = o; }
    }
    return best;
  }
}
