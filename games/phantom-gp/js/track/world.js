// world.js — loads the survey-derived assets and exposes height / track queries.
import * as THREE from 'three';

// lo: half-size ground photos from assets/lo. Every device starts with them (they are a quarter of the download);
// desktops then fetch the full-size ones in the background and swap them in (upgradeGround).
export const LOAD = { lo: false };
// The near terrain mesh uses every MESH.step-th survey point: 1 = 2 m (desktops), 2 = 4 m (phones, a quarter of the
// memory). meshAt() follows the same grid, so everything fitted to "the terrain as drawn" still fits.
export const MESH = { step: 1, farStep: 1 };          // farStep: the far grid's block size away from the circuit (terrain.js)
export const W = {};        // filled by loadWorld()

async function bin(url, Type) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return new Type(await r.arrayBuffer());
}

function loadTex(url, srgb) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;                 // row 0 of every survey raster is the north edge (v = 0), like the height grids
    t.anisotropy = LOAD.lo ? 4 : 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    res(t);
  }, undefined, rej));
}

// gate: a promise to wait for before the CPU work on the downloaded data (the game shows its title first)
export async function loadWorld(progress = () => {}, gate = null) {
  let done = 0; const total = 15;
  const tick = (p) => p.then((v) => { progress(++done / total); return v; });
  const [meta, track, hNear, hFar, trees0, buildings, barriers, tNear, tFar, tMask, trackside, tPaint, tTone, ground, treesX] = await Promise.all([
    tick(fetch('assets/meta.json').then((r) => r.json())),
    tick(bin('assets/track.bin', Float32Array)),
    tick(bin('assets/h_near.bin', Uint16Array)),
    tick(bin('assets/h_far.bin', Uint16Array)),
    tick(bin('assets/trees.bin', Float32Array)),
    tick(fetch('assets/buildings.json').then((r) => r.json())),
    tick(fetch('assets/barriers.json').then((r) => r.json())),
    // phones (LOAD.lo): the photos and the surface mask at half the size again (assets/tiny)
    tick(loadTex(LOAD.lo ? 'assets/tiny/near_ortho.jpg' : 'assets/lo/near_ortho.jpg', true)),
    tick(loadTex(LOAD.lo ? 'assets/tiny/far_ortho.jpg' : 'assets/lo/far_ortho.jpg', true)),
    tick(loadTex(LOAD.lo ? 'assets/tiny/near_mask.webp' : 'assets/near_mask.webp', false)),
    tick(fetch('assets/trackside.json').then((r) => r.json()).catch(() => ({ tyres: [] }))),
    tick(loadTex((LOAD.lo ? 'assets/tiny/' : 'assets/') + 'near_paint.png', true)),
    tick(loadTex('assets/near_tone.webp', false)),
    tick(fetch('assets/ground.json').then((r) => r.json())),
    tick(bin('assets/trees_extra.bin', Float32Array)),
  ]);
  if (gate) await gate;
  // surveyed trees + the young trees and narrow strips found by the ground model
  const trees = new Float32Array(trees0.length + treesX.length);
  trees.set(trees0); trees.set(treesX, trees0.length);
  Object.assign(W, { meta, hNear, hFar, trees, buildings, barriers, tNear, tFar, tMask, tPaint, tTone, ground, trackside });
  const N = meta.n, S = 12;
  W.N = N; W.L = meta.length; W.ds = meta.length / N;
  const col = (k) => { const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = track[i * S + k]; return a; };
  W.tx = col(0); W.tz = col(1); W.ty = col(2); W.dx = col(3); W.dz = col(4); W.hw = col(5); W.bank = col(6); W.kappa = col(7);
  W.kerbL = col(8); W.kerbR = col(9); W.line = col(10); W.tone = col(11);
  W.hScale = meta.hq.range / 65535; W.hMin = meta.hq.min;
  // buildings the map does not list (traced by hand in tools/build_ground.py); no tree may stand inside one
  if (ground.buildings && ground.buildings.length) {
    const inside = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
    const T = W.trees, keep = [];
    for (let t = 0; t < T.length; t += 6) if (!ground.buildings.some((b) => inside(T[t], T[t + 1], b.pts))) keep.push(t);
    if (keep.length * 6 < T.length) { const out = new Float32Array(keep.length * 6); keep.forEach((t, k) => out.set(T.subarray(t, t + 6), k * 6)); W.trees = out; }
    for (const b of ground.buildings) W.buildings.push(b);
  }
  // scaffold stands that show in the photo but are not in the map: built like the mapped open stands
  for (const st of ground.stands || []) W.buildings.push({ name: 'Temporary stand', kind: 'grandstand', temp: true, seat: st.seat, area: st.area, h: 8, y0: 0, y1: 0, pts: st.pts });
  buildNearest();
  shapeStandGround();
  buildVerge();
  return W;
}

// Desktops: fetch the full-size ground photos and decode them off the main thread. Resolves to a swap function the
// game calls at a calm moment (a texture this size takes a frame or two to upload), or null on phones / failure.
export async function upgradeGround() {
  if (LOAD.lo) return null;
  try {
    const bmp = async (url) => createImageBitmap(await (await fetch(url)).blob(), { imageOrientation: 'none', premultiplyAlpha: 'none' });
    const [near, far] = await Promise.all([bmp('assets/near_ortho.jpg'), bmp('assets/far_ortho.jpg')]);
    return (uniforms) => {
      for (const [key, img] of [['tNear', near], ['tFar', far]]) {
        const old = uniforms[key].value, t = new THREE.Texture(img);
        t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
        uniforms[key].value = t; W[key] = t; old.dispose();
      }
    };
  } catch (e) { console.warn('full-size ground photos not loaded', e); return null; }
}

/* ---- verge: the strip of ground between the road edge and the surveyed terrain ----
   The road is a fitted surface, the terrain a 2 m survey grid; the two never meet exactly. A fine strip (road.js)
   carries the ground from the road edge out to the survey, and the terrain mesh is pushed down underneath it so
   its coarse triangles cannot poke through. Both are built from the numbers below. */
export const VERGE = {
  blend: 3.2,                                   // m from the road edge to where the strip has reached surveyed ground
  cols: [-0.04, 0.8, 1.9, 3.2, 4.6, 6.1, 7.0],  // strip columns (m beyond the edge); the last one dips under the terrain
  lift: 0.035,                                  // strip height above the terrain where both follow the survey
  under: 0.30,                                  // how far the terrain mesh is held below the strip
};

// height of the 2 m grid, split into triangles exactly as the terrain mesh splits each cell
function triAt(a, scale, off, x, z) {
  const n = W.meta.near;
  const fx = Math.min(Math.max((x - n.x0) / n.step, 0), n.nx - 1.001), fy = Math.min(Math.max((z - n.z0) / n.step, 0), n.ny - 1.001);
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * n.nx + i;
  const p = a[k], q = a[k + 1], r = a[k + n.nx], s = a[k + n.nx + 1];
  return (u + v <= 1 ? p + (q - p) * u + (r - p) * v : s + (r - s) * (1 - u) + (q - s) * (1 - v)) * scale + off;
}
export const naturalAt = (x, z) => triAt(W.hNear, W.hScale, W.hMin, x, z);   // surveyed ground
// the terrain mesh as drawn (on phones a coarser grid, split into triangles the same way)
export function meshAt(x, z) {
  const s = MESH.step; if (s === 1) return triAt(W.hMesh, 1, 0, x, z);
  const n = W.meta.near, a = W.hMesh;
  const fx = Math.min(Math.max((x - n.x0) / n.step, 0), n.nx - 1.001), fy = Math.min(Math.max((z - n.z0) / n.step, 0), n.ny - 1.001);
  // chunks are 64 cells wide, so their vertex lines fall on multiples of s; the last line of the grid is its edge
  const i0 = Math.floor(fx / s) * s, j0 = Math.floor(fy / s) * s, i1 = Math.min(i0 + s, n.nx - 1), j1 = Math.min(j0 + s, n.ny - 1);
  const u = (fx - i0) / (i1 - i0), v = (fy - j0) / (j1 - j0);
  const p = a[j0 * n.nx + i0], q = a[j0 * n.nx + i1], r = a[j1 * n.nx + i0], t = a[j1 * n.nx + i1];
  return u + v <= 1 ? p + (q - p) * u + (r - p) * v : t + (r - t) * (1 - u) + (q - t) * (1 - v);
}

function buildVerge() {
  const N = W.N, n = W.meta.near, nx = n.nx, ny = n.ny, B = VERGE.blend;
  // signed curvature (+ = bending toward the right-hand side), from tangents a few stations apart
  const kS = new Float32Array(N), w = 3;
  for (let i = 0; i < N; i++) {
    const a = (i - w + N) % N, b = (i + w) % N;
    kS[i] = (W.dx[a] * W.dz[b] - W.dz[a] * W.dx[b]) / (2 * w * W.ds);
  }
  W.vergeY = [new Float32Array(N), new Float32Array(N)];     // strip height at the road / kerb edge   [left, right]
  W.vergeG = [new Float32Array(N), new Float32Array(N)];     // strip height where it reaches surveyed ground
  W.vergeB = [new Float32Array(N), new Float32Array(N)];     // blend distance (shorter inside a very tight bend)
  W.vergeMax = [new Float32Array(N), new Float32Array(N)];   // furthest the strip may reach before it would fold over itself
  for (let sd = 0; sd < 2; sd++) {
    const side = sd ? 1 : -1, kw = sd ? W.kerbR : W.kerbL;
    for (let i = 0; i < N; i++) {
      const e = W.hw[i] + kw[i], k = kS[i] * side;
      const amax = k > 1e-4 ? Math.max(0.6, 1 / k - e - 0.05) : 1e9, ab = Math.min(B, amax);
      const rx = -W.dz[i] * side, rz = W.dx[i] * side;
      W.vergeY[sd][i] = W.ty[i] + W.bank[i] * e * side + (kw[i] > 0 ? 0.03 : -0.012);
      W.vergeG[sd][i] = naturalAt(W.tx[i] + rx * (e + ab), W.tz[i] + rz * (e + ab)) + VERGE.lift;
      W.vergeB[sd][i] = ab; W.vergeMax[sd][i] = amax;
    }
  }
  // terrain mesh heights: the survey, held below the road and the first few metres of verge
  const hm = new Float32Array(nx * ny);
  for (let k = 0; k < hm.length; k++) hm[k] = W.hNear[k] * W.hScale + W.hMin;
  const best = new Float32Array(nx * ny).fill(1e9), st = new Int32Array(nx * ny), touched = [];
  for (let i = 0; i < N; i++) {
    const R = W.hw[i] + Math.max(W.kerbL[i], W.kerbR[i]) + B + 1.5;
    const i0 = Math.max(0, Math.ceil((W.tx[i] - R - n.x0) / n.step)), i1 = Math.min(nx - 1, Math.floor((W.tx[i] + R - n.x0) / n.step));
    const j0 = Math.max(0, Math.ceil((W.tz[i] - R - n.z0) / n.step)), j1 = Math.min(ny - 1, Math.floor((W.tz[i] + R - n.z0) / n.step));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const k = j * nx + ii, d2 = (n.x0 + ii * n.step - W.tx[i]) ** 2 + (n.z0 + j * n.step - W.tz[i]) ** 2;
      if (d2 < best[k]) { if (best[k] === 1e9) touched.push(k); best[k] = d2; st[k] = i; }
    }
  }
  let lowered = 0;
  for (const k of touched) {
    const i = st[k], x = n.x0 + (k % nx) * n.step, z = n.z0 + ((k / nx) | 0) * n.step;
    const d = (x - W.tx[i]) * -W.dz[i] + (z - W.tz[i]) * W.dx[i], sd = d < 0 ? 0 : 1;
    const a = Math.abs(d) - W.hw[i] - (sd ? W.kerbR[i] : W.kerbL[i]), ab = W.vergeB[sd][i];
    if (a >= ab) continue;
    const top = a <= 0 ? W.ty[i] + W.bank[i] * d : W.vergeY[sd][i] + (W.vergeG[sd][i] - W.vergeY[sd][i]) * (a / ab);
    if (top - VERGE.under < hm[k]) { hm[k] = top - VERGE.under; lowered++; }
  }
  W.hMesh = hm; W.vergeLowered = lowered;
}

/* ---- grandstands: layout from the surveyed outline, and the ground underneath ----
   The elevation survey is meant to be bare ground, but under and in front of the stands it still holds pieces of
   the structures (a ribbed mound where a stand should be). Each stand's ground is replaced by a smooth surface
   stretched between the real ground around it; props.js then builds the stand on that slope. */
export const isStand = (b) => (b.kind === 'grandstand' || /Tribune|Grandstand/i.test(b.name || '')) && b.area >= 14 && b.pts.length >= 3;

// drop outline points that deviate less than tol from their neighbours' line
function simplifyRing(pts, tol) {
  const P = pts.filter((p, i) => p.distanceTo(pts[(i + 1) % pts.length]) > 0.3);
  while (P.length > 4) {
    let bi = -1, bd = tol;
    for (let i = 0; i < P.length; i++) {
      const a = P[(i - 1 + P.length) % P.length], b = P[i], c = P[(i + 1) % P.length];
      const d = Math.abs((c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y)) / (a.distanceTo(c) || 1e-6);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) break;
    P.splice(bi, 1);
  }
  return P;
}

function nearTrack(x, z) {
  let bd = 1e18, bi = 0;
  for (let i = 0; i < W.N; i += 2) { const d = (W.tx[i] - x) ** 2 + (W.tz[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}

// distance from (ox, oz) along (nx, nz) to the outline, ignoring edge `skip`
function rayDepth(P, ox, oz, nx, nz, skip) {
  let best = Infinity;
  for (let i = 0; i < P.length; i++) {
    if (i === skip) continue;
    const a = P[i], b = P[(i + 1) % P.length], ex = b.x - a.x, ez = b.y - a.y, den = nx * ez - nz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - ox) * ez - (a.y - oz) * ex) / den, s = ((a.x - ox) * nz - (a.y - oz) * nx) / den;
    if (t > 1 && s >= -0.01 && s <= 1.01 && t < best) best = t;
  }
  return best;
}

// -> { P: outline, mods: [{ p, L, ex, ez, ox, oz, dm, nb, dk, bw }] }: one module per front edge, split into bays
function standLayout(b) {
  let pts = b.pts.map(([x, z]) => new THREE.Vector2(x, z));
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const P = simplifyRing(pts, 0.8), n = P.length;
  // which long edges are fronts: seats look down the slope they sit on, and on level ground toward the circuit
  const cand = [];
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n], L = p.distanceTo(q); if (L < 9) continue;
    const ex = (q.x - p.x) / L, ez = (q.y - p.y) / L, ox = ez, oz = -ex;                 // along the edge; outward
    const mx = (p.x + q.x) / 2, mz = (p.y + q.y) / 2;
    const dm = rayDepth(P, mx - ox * 0.05, mz - oz * 0.05, -ox, -oz, i);
    if (!(dm > 4) || dm > 45 || dm > 2.2 * L + 6) continue;                              // an end of the stand, not a side
    let gOut = 0, gOpp = 0, cnt = 0;
    for (let u = 0.1; u < 0.95; u += 0.2) {
      const x = p.x + ex * L * u, z = p.y + ez * L * u;
      gOut += naturalAt(x + ox * 2, z + oz * 2); gOpp += naturalAt(x - ox * (dm + 2), z - oz * (dm + 2)); cnt++;
    }
    const t = nearTrack(mx, mz), tx = W.tx[t] - mx, tz = W.tz[t] - mz, tl = Math.hypot(tx, tz) || 1;
    const score = (ox * tx + oz * tz) / tl + 8 * (gOpp - gOut) / cnt / dm;
    if (score > 0.2) cand.push({ i, p, L, ex, ez, ox, oz, dm, score });
  }
  cand.sort((u, v) => v.score - u.score);
  const mods = [];
  const inside = (m, x, z) => { const rx = x - m.p.x, rz = z - m.p.y, f = rx * m.ex + rz * m.ez, c = -(rx * m.ox + rz * m.oz); return f > -0.5 && f < m.L + 0.5 && c > -0.5 && c < m.dm + 0.5; };
  const centre = (m) => [m.p.x + m.ex * m.L / 2 - m.ox * m.dm / 2, m.p.y + m.ez * m.L / 2 - m.oz * m.dm / 2];
  for (const m of cand) {
    if (mods.some((o) => inside(o, ...centre(m)) || inside(m, ...centre(o)))) continue;    // same seats seen from another edge
    const nb = Math.max(1, Math.round(m.L / 11)), dk = [];
    for (let k = 0; k <= nb; k++) {
      const f = Math.min(Math.max(k / nb * m.L, 0.3), m.L - 0.3);
      const d = rayDepth(P, m.p.x + m.ex * f - m.ox * 0.05, m.p.y + m.ez * f - m.oz * 0.05, -m.ox, -m.oz, m.i);
      dk.push(Number.isFinite(d) ? Math.min(d, 40) : m.dm);
    }
    const med = [...dk].sort((u, v) => u - v)[dk.length >> 1];
    for (let k = 0; k <= nb; k++) if (dk[k] < 0.6 * med || dk[k] > 1.6 * med) dk[k] = med;       // a ray that caught a notch in the outline
    mods.push({ ...m, nb, dk, bw: m.L / nb });
  }
  return mods.length ? { P, mods } : null;
}

function shapeStandGround() {
  const n = W.meta.near, nx = n.nx, ny = n.ny, hs = W.hScale, h0 = W.hMin, FRONT = 7, SIDE = 3, BACK = 2;
  const boxes = [];
  for (const b of W.buildings) {
    if (!isStand(b)) continue;
    const st = standLayout(b); if (!st) continue;
    b.stand = st;
    const P = st.P;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y); }
    const i0 = Math.max(1, Math.floor((x0 - 12 - n.x0) / n.step)), i1 = Math.min(nx - 2, Math.ceil((x1 + 12 - n.x0) / n.step));
    const j0 = Math.max(1, Math.floor((z0 - 12 - n.z0) / n.step)), j1 = Math.min(ny - 2, Math.ceil((z1 + 12 - n.z0) / n.step));
    const w = i1 - i0 + 1, h = j1 - j0 + 1; if (w < 3 || h < 3) continue;
    const inPoly = (x, z) => { let c = false; for (let a = 0, e = P.length - 1; a < P.length; e = a++) { const p = P[a], q = P[e]; if ((p.y > z) !== (q.y > z) && x < (q.x - p.x) * (z - p.y) / (q.y - p.y) + p.x) c = !c; } return c; };
    const H = new Float32Array(w * h), mask = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, x = n.x0 + (i0 + i) * n.step, z = n.z0 + (j0 + j) * n.step;
      H[k] = W.hNear[(j0 + j) * nx + i0 + i] * hs + h0;
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1) continue;              // the rim keeps the surveyed ground
      let on = inPoly(x, z);
      for (const m of st.mods) {
        if (on) break;
        const rx = x - m.p.x, rz = z - m.p.y, f = rx * m.ex + rz * m.ez, c = -(rx * m.ox + rz * m.oz);
        on = f > -SIDE && f < m.L + SIDE && c > -FRONT && c < Math.max(...m.dk) + BACK;
      }
      mask[k] = on ? 1 : 0;
    }
    // stretch a smooth surface across the masked cells (over-relaxed Gauss-Seidel on Laplace's equation)
    for (let it = 0; it < 500; it++) {
      let ch = 0;
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = j * w + i; if (!mask[k]) continue;
        const d = ((H[k - 1] + H[k + 1] + H[k - w] + H[k + w]) / 4 - H[k]) * 1.8;
        H[k] += d; if (Math.abs(d) > ch) ch = Math.abs(d);
      }
      if (ch < 0.002) break;
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (mask[j * w + i]) W.hNear[(j0 + j) * nx + i0 + i] = Math.min(65535, Math.max(0, Math.round((H[j * w + i] - h0) / hs)));
    boxes.push([n.x0 + i0 * n.step, n.z0 + j0 * n.step, n.x0 + i1 * n.step, n.z0 + j1 * n.step]);
  }
  // trees carry their own base height: re-seat any that stand on reshaped ground, and drop the few the survey
  // placed inside a stand (they would grow through its roof)
  const T = W.trees, keep = [];
  const inStand = (x, z) => W.buildings.some((b) => b.stand && b.stand.mods.some((m) => {
    const rx = x - m.p.x, rz = z - m.p.y, f = rx * m.ex + rz * m.ez, c = -(rx * m.ox + rz * m.oz);
    return f > -2 && f < m.L + 2 && c > -3 && c < Math.max(...m.dk) + 2;
  }));
  for (let t = 0; t < T.length; t += 6) {
    const x = T[t], z = T[t + 1];
    const bx = boxes.find((q) => x > q[0] && x < q[2] && z > q[1] && z < q[3]);
    if (bx) {
      if (inStand(x, z)) continue;
      const g = groundAt(x, z); if (Math.abs(g - T[t + 2]) > 0.15) T[t + 2] = g;
    }
    keep.push(t);
  }
  if (keep.length * 6 < T.length) {
    const out = new Float32Array(keep.length * 6);
    keep.forEach((t, k) => out.set(T.subarray(t, t + 6), k * 6));
    W.trees = out;
  }
}

function bil(a, nx, ny, fx, fy) {
  fx = Math.min(Math.max(fx, 0), nx - 1.001); fy = Math.min(Math.max(fy, 0), ny - 1.001);
  const x0 = fx | 0, y0 = fy | 0, u = fx - x0, v = fy - y0, i = y0 * nx + x0;
  return (a[i] * (1 - u) + a[i + 1] * u) * (1 - v) + (a[i + nx] * (1 - u) + a[i + nx + 1] * u) * v;
}

// terrain height (bare ground; lowered under the racing surface)
export function groundAt(x, z) {
  const n = W.meta.near, fx = (x - n.x0) / n.step, fy = (z - n.z0) / n.step;
  if (fx >= 0 && fy >= 0 && fx <= n.nx - 1 && fy <= n.ny - 1) return bil(W.hNear, n.nx, n.ny, fx, fy) * W.hScale + W.hMin;
  const q = W.meta.far;
  return bil(W.hFar, q.nx, q.ny, (x - q.x0) / q.step, (z - q.z0) / q.step) * W.hScale + W.hMin;
}

// track frame at lap distance s (metres, wraps)
export function frameAt(s, out = {}) {
  const N = W.N; let f = ((s / W.ds) % N + N) % N; const i = f | 0, j = (i + 1) % N, t = f - i;
  const l = (a) => a[i] + (a[j] - a[i]) * t;
  out.x = l(W.tx); out.y = l(W.ty); out.z = l(W.tz);
  let dx = l(W.dx), dz = l(W.dz); const m = Math.hypot(dx, dz) || 1; out.dx = dx / m; out.dz = dz / m;
  out.rx = -out.dz; out.rz = out.dx;        // right of travel (x east, z south)
  out.hw = l(W.hw); out.bank = l(W.bank); out.kappa = l(W.kappa); out.line = l(W.line); out.i = i;
  return out;
}

// point on the racing surface at lap distance s, lateral offset d (+ right)
export function roadPoint(s, d, out = new THREE.Vector3()) {
  const fr = frameAt(s, _fr);
  return out.set(fr.x + fr.rx * d, fr.y + fr.bank * d, fr.z + fr.rz * d);
}
const _fr = {};

/* nearest-station lookup on a coarse grid */
let cell, cellN, gx0, gz0, gw, gh; const CS = 24;
function buildNearest() {
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < W.N; i++) { minx = Math.min(minx, W.tx[i]); maxx = Math.max(maxx, W.tx[i]); minz = Math.min(minz, W.tz[i]); maxz = Math.max(maxz, W.tz[i]); }
  gx0 = minx - 120; gz0 = minz - 120; gw = Math.ceil((maxx - minx + 240) / CS); gh = Math.ceil((maxz - minz + 240) / CS);
  cell = new Array(gw * gh);
  for (let i = 0; i < W.N; i += 2) {
    const k = ((W.tz[i] - gz0) / CS | 0) * gw + ((W.tx[i] - gx0) / CS | 0);
    (cell[k] || (cell[k] = [])).push(i);
  }
}

// -> { s, d, dist } of the nearest centreline station within ~100 m, or null
export function nearestStation(x, z, out = {}) {
  const cx = (x - gx0) / CS | 0, cz = (z - gz0) / CS | 0;
  let best = -1, bd = 1e18;
  for (let r = 0; r <= 4 && (best < 0 || r <= 1 + Math.ceil(Math.sqrt(bd) / CS)); r++) {
    for (let j = cz - r; j <= cz + r; j++) {
      if (j < 0 || j >= gh) continue;
      for (let i = cx - r; i <= cx + r; i++) {
        if (i < 0 || i >= gw || (Math.max(Math.abs(i - cx), Math.abs(j - cz)) !== r)) continue;
        const c = cell[j * gw + i]; if (!c) continue;
        for (const k of c) { const d2 = (W.tx[k] - x) ** 2 + (W.tz[k] - z) ** 2; if (d2 < bd) { bd = d2; best = k; } }
      }
    }
  }
  if (best < 0) return null;
  // refine against the two neighbouring segments
  const N = W.N; let bs = best, bt = 0, bdd = bd;
  for (const a of [(best - 1 + N) % N, best]) {
    const b = (a + 1) % N, ex = W.tx[b] - W.tx[a], ez = W.tz[b] - W.tz[a];
    const t = Math.min(1, Math.max(0, ((x - W.tx[a]) * ex + (z - W.tz[a]) * ez) / (ex * ex + ez * ez)));
    const px = W.tx[a] + ex * t, pz = W.tz[a] + ez * t, d2 = (px - x) ** 2 + (pz - z) ** 2;
    if (d2 <= bdd) { bdd = d2; bs = a; bt = t; }
  }
  const s = (bs + bt) * W.ds, fr = frameAt(s, _fr);
  out.s = s; out.dist = Math.sqrt(bdd); out.d = (x - fr.x) * fr.rx + (z - fr.z) * fr.rz; out.y = fr.y + fr.bank * out.d; out.hw = fr.hw;
  out.kerb = out.d < 0 ? W.kerbL[fr.i] : W.kerbR[fr.i];
  return out;
}

// kerb cross-section: (fraction across from the road edge, height above the road in m); road.js builds the kerbs from it
export const KERB_KP = [[0, 0.0], [0.12, 0.022], [0.5, 0.055], [0.86, 0.075], [1, 0.045]];
// each kerb run ramps up over its first and last 3 m; per station, 0..1, for both sides
let kerbRamp = null;
export function kerbRamps() {
  if (kerbRamp) return kerbRamp;
  const N = W.N; kerbRamp = [];
  for (const kw of [W.kerbL, W.kerbR]) {
    const endDist = new Float32Array(N);
    for (let pass = 0; pass < 2; pass++) {
      let run = 0;
      for (let t = 0; t < 2 * N; t++) {
        const i = pass ? (2 * N - 1 - t) % N : t % N;
        run = kw[i] > 0 ? run + 1 : 0;
        endDist[i] = pass ? Math.min(endDist[i], run) : run;
      }
    }
    const r = new Float32Array(N); for (let i = 0; i < N; i++) r[i] = Math.min(1, endDist[i] / 3);
    kerbRamp.push(r);
  }
  return kerbRamp;
}
function kerbLift(f) {
  for (let k = 1; k < KERB_KP.length; k++) if (f <= KERB_KP[k][0]) { const [a, ha] = KERB_KP[k - 1], [b, hb] = KERB_KP[k]; return ha + (hb - ha) * (f - a) / (b - a); }
  return KERB_KP[KERB_KP.length - 1][1];
}

// free roam's roads (roads.js) plug in here: top(x, z) -> surface height if a road or its shoulder is there
export const EXTRA = { top: null };

/* The ground as it is drawn, away from any road. Near the circuit that is the terrain mesh (lowered under roads and
   verges, and coarser on phones), not the raw survey; further out it is the far grid, split into the triangles the
   far mesh uses. Anything that stands on the ground must use this, or it floats and sinks by the difference. */
export function drawnGround(x, z) {
  const n = W.meta.near;
  if (x > n.x0 && z > n.z0 && x < n.x0 + n.w && z < n.z0 + n.h) return meshAt(x, z);
  const q = W.meta.far, a = W.hFar, fx = q.nx, fy = q.ny, st = Math.max(1, MESH.farStep | 0);
  const u0 = Math.min(Math.max((x - q.x0) / q.step, 0), fx - 1.001), v0 = Math.min(Math.max((z - q.z0) / q.step, 0), fy - 1.001);
  let i0 = u0 | 0, j0 = v0 | 0, i1 = i0 + 1, j1 = j0 + 1;
  if (st > 1) {
    // beyond a frame round the near grid the far mesh is built from st x st blocks (terrain.js)
    const [c0, c1, r0, r1] = q.hole;
    const C0 = Math.max(0, Math.floor(c0 / st) * st - st), C1 = Math.min(fx - 1, Math.ceil(c1 / st) * st + st), R0 = Math.max(0, Math.floor(r0 / st) * st - st), R1 = Math.min(fy - 1, Math.ceil(r1 / st) * st + st);
    if (!(i0 >= C0 && i0 < C1 && j0 >= R0 && j0 < R1)) { i0 = Math.floor(i0 / st) * st; j0 = Math.floor(j0 / st) * st; i1 = Math.min(i0 + st, fx - 1); j1 = Math.min(j0 + st, fy - 1); }
  }
  const u = (u0 - i0) / (i1 - i0), v = (v0 - j0) / (j1 - j0);
  const p = a[j0 * fx + i0], qq = a[j0 * fx + i1], r = a[j1 * fx + i0], t = a[j1 * fx + i1];
  return (u + v <= 1 ? p + (qq - p) * u + (r - p) * v : t + (r - t) * (1 - u) + (qq - t) * (1 - v)) * W.hScale + W.hMin;
}

/* What is under a point, exactly as drawn: a free-roam road or its shoulder; the racing surface; a kerb; the verge
   strip that carries the road's edge out to the ground; or the ground itself. Tyres, cameras and shadows all ask
   this, so nothing steps or floats where one surface hands over to the next. */
const _nc = {};
export function contactAt(x, z) {
  if (EXTRA.top) { const e = EXTRA.top(x, z); if (e !== undefined) return e; }
  const n = nearestStation(x, z, _nc);
  if (!n) return drawnGround(x, z);
  const ad = Math.abs(n.d), sd = n.d < 0 ? 0 : 1, i = Math.round(n.s / W.ds) % W.N, a = ad - n.hw - n.kerb;
  if (a <= 0) {
    // the fitted road (the survey under it is rougher and sometimes higher: it must not lift the car)
    if (n.kerb > 0 && ad > n.hw) return n.y + kerbLift((ad - n.hw) / n.kerb) * kerbRamps()[sd][i] + 0.004;
    return n.y;
  }
  const ab = W.vergeB[sd][i];
  if (a < ab) { const ye = W.vergeY[sd][i]; return Math.max(ye + (W.vergeG[sd][i] - ye) * (a / ab), meshAt(x, z)); }
  if (a < Math.min(7.0, W.vergeMax[sd][i])) return Math.max(naturalAt(x, z) + VERGE.lift, meshAt(x, z));
  return drawnGround(x, z);
}
export const surfaceAt = contactAt;

/* how much of the ground at (x, z) is hard surface (tarmac or paint), 0..1, from the ground model */
let maskPx = null;
export function hardAt(x, z) {
  if (!maskPx) {
    const im = W.tMask.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
    maskPx = { d: cx.getImageData(0, 0, im.width, im.height).data, w: im.width, h: im.height };
  }
  const n = W.meta.near, i = Math.floor((x - n.x0) / n.w * maskPx.w), j = Math.floor((z - n.z0) / n.h * maskPx.h);
  if (i < 0 || j < 0 || i >= maskPx.w || j >= maskPx.h) return 0;
  return maskPx.d[(j * maskPx.w + i) * 4] / 255;
}

/* surface class at (x, z) from the ground model: 0 = grass or earth, 1 = tarmac or paint, 2 = gravel */
export function groundClass(x, z) {
  if (!maskPx) hardAt(x, z);
  const n = W.meta.near, i = Math.floor((x - n.x0) / n.w * maskPx.w), j = Math.floor((z - n.z0) / n.h * maskPx.h);
  if (i < 0 || j < 0 || i >= maskPx.w || j >= maskPx.h) return 0;
  const k = (j * maskPx.w + i) * 4;
  return maskPx.d[k] > 127 ? 1 : (maskPx.d[k + 1] > 127 ? 2 : 0);
}

/* is any tree trunk within r metres? (coarse grid over the surveyed trees) */
let tgrid = null; const TG = 16;
export function treeWithin(x, z, r) {
  if (!tgrid) {
    tgrid = new Map(); const T = W.trees;
    for (let i = 0; i < T.length; i += 6) { const k = Math.floor(T[i] / TG) + ',' + Math.floor(T[i + 1] / TG); (tgrid.get(k) || tgrid.set(k, []).get(k)).push(i); }
  }
  const T = W.trees, c = Math.ceil(r / TG);
  for (let j = -c; j <= c; j++) for (let i = -c; i <= c; i++) {
    const list = tgrid.get((Math.floor(x / TG) + i) + ',' + (Math.floor(z / TG) + j)); if (!list) continue;
    for (const t of list) if ((T[t] - x) ** 2 + (T[t + 1] - z) ** 2 < r * r) return true;
  }
  return false;
}
