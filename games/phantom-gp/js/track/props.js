// props.js — trackside structures from the map survey: Armco, catch fences, buildings, grandstands, start gantry.
import * as THREE from 'three';
import { W, groundAt, naturalAt, nearestStation, frameAt, isStand } from './world.js';
import { groundUniforms } from './terrain.js';
import { steelTex, fenceTex, curtainWallMaps, shutterMaps, panelMaps, concreteMaps, rng32 } from './tex.js';
import { makeArch } from './arch.js';
import { SIGNS } from './signs.js';

export class Buf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  quad(a, b, c, d, n, uv) {            // a,b,c,d: [x,y,z] counter-clockwise seen from the normal side
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) this.nor.push(...n);
    this.uv.push(...uv[0], ...uv[1], ...uv[2], ...uv[3]);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  box(cx, cy, cz, sx, sy, sz, ang = 0) {
    const c = Math.cos(ang), s = Math.sin(ang), P = (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c], N = (x, y, z) => [x * c - z * s, y, x * s + z * c];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, U = [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), N(0, 0, 1), U);
    this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), N(0, 0, -1), U);
    this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), N(1, 0, 0), U);
    this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), N(-1, 0, 0), U);
    this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), N(0, 1, 0), U);
  }
  mesh(mat, { cast = true, recv = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.idx);
    const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = recv; m.matrixAutoUpdate = false;
    return m;
  }
}

// split meshes spatially so culling / shadow cascades only touch what is near
export class Tiles {
  constructor(size = 400, Cls = Buf) { this.size = size; this.Cls = Cls; this.map = new Map(); }
  at(x, z) { const k = Math.floor(x / this.size) + ',' + Math.floor(z / this.size); let b = this.map.get(k); if (!b) this.map.set(k, b = new this.Cls()); return b; }
  add(group, mat, opts) { for (const b of this.map.values()) if (b.idx.length) group.add(b.mesh(mat, opts)); }
}

function resample(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function buildProps(scene, qual) {
  const group = new THREE.Group(); group.name = 'props';
  const steel = steelTex(), ns = {};

  /* ---------------- Armco + catch fences ---------------- */
  const armco = new Tiles(), posts = new Tiles(), mesh = new Tiles(), fencePosts = new Tiles(), meshFar = new Tiles();
  // W-beam profile: [height above ground, outward offset toward the track]
  const PROF = [];
  for (let b = 0; b < 3; b++) { const y = 0.14 + b * 0.31; PROF.push([y, 0], [y + 0.07, 0.04], [y + 0.15, 0.012], [y + 0.23, 0.04], [y + 0.30, 0]); }
  for (const bar of W.barriers) {
    const pts = resample(bar.pts, 4);
    if (pts.length < 2) continue;
    const isFence = bar.kind === 'fence';
    const trackside = bar.dmean < 75;
    if (!isFence) {
      if (bar.dmean > 140) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) continue;
        let nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
        const n = nearestStation((x0 + x1) / 2, (z0 + z1) / 2, ns);
        if (n) { const fr = frameAt(n.s, {}); if ((fr.x - x0) * nx + (fr.z - z0) * nz < 0) { nx = -nx; nz = -nz; } }
        const y0 = groundAt(x0, z0) - 0.03, y1 = groundAt(x1, z1) - 0.03, B = armco.at(x0, z0);
        for (let k = 0; k < PROF.length - 1; k++) {
          if (k % 5 === 4) continue;
          const [h0, o0] = PROF[k], [h1, o1] = PROF[k + 1];
          const sl = Math.atan2(o1 - o0, h1 - h0), fn = [nx * Math.cos(sl), -Math.sin(sl), nz * Math.cos(sl)];
          const a = [x0 + nx * o0, y0 + h0, z0 + nz * o0], b = [x1 + nx * o0, y1 + h0, z1 + nz * o0], c = [x1 + nx * o1, y1 + h1, z1 + nz * o1], d = [x0 + nx * o1, y0 + h1, z0 + nz * o1];
          B.quad(a, b, c, d, fn, [[0, h0], [L / 2, h0], [L / 2, h1], [0, h1]]);
        }
        posts.at(x0, z0).box(x0 - nx * 0.07, y0 + 0.55, z0 - nz * 0.07, 0.09, 1.1, 0.12, Math.atan2(nz, nx));
      }
    } else {
      const H = trackside ? 3.3 : 2.0, T = trackside ? mesh : meshFar;
      if (!trackside && bar.dmean > 420) continue;
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) continue;
        const nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
        const y0 = groundAt(x0, z0) - 0.05, y1 = groundAt(x1, z1) - 0.05;
        T.at(x0, z0).quad([x0, y0, z0], [x1, y1, z1], [x1, y1 + H, z1], [x0, y0 + H, z0], [nx, 0, nz], [[acc, 0], [acc + L, 0], [acc + L, H], [acc, H]]);
        acc += L;
        fencePosts.at(x0, z0).box(x0, y0 + H / 2, z0, trackside ? 0.09 : 0.06, H, trackside ? 0.09 : 0.06, Math.atan2(nz, nx));
      }
    }
  }
  const armcoMat = new THREE.MeshStandardMaterial({ map: steel, color: 0x9aa0a6, metalness: 0.3, roughness: 0.62, side: THREE.DoubleSide, envMapIntensity: 0.7 });
  const postMat = new THREE.MeshStandardMaterial({ map: steel, color: 0x8d9196, metalness: 0.7, roughness: 0.55 });
  const fT = fenceTex();
  const meshMat = new THREE.MeshStandardMaterial({ map: fT, color: 0xd0d4d8, metalness: 0.55, roughness: 0.5, side: THREE.DoubleSide, transparent: false });
  // wire mesh relies on alpha-to-coverage; without multisampling fall back to a plain cut-out
  if (qual.msaa > 0) meshMat.alphaToCoverage = true; else meshMat.alphaTest = 0.4;
  const meshFarMat = meshMat.clone(); meshFarMat.color.set(0x6f8a70); meshFarMat.alphaToCoverage = meshMat.alphaToCoverage;
  armco.add(group, armcoMat, { cast: true }); posts.add(group, postMat, { cast: false });
  mesh.add(group, meshMat, { cast: false }); meshFar.add(group, meshFarMat, { cast: false }); fencePosts.add(group, postMat, { cast: false });

  /* ---------------- buildings ---------------- */
  /* Every surface is a drawn material with its own relief and gloss map: glass is smooth and partly mirror, so it
     shows the sky; walls, panels and concrete are not. (The relief maps are drawn with y downward: normalScale.y = -1.) */
  const TS = qual.lo ? 256 : 512, NS = new THREE.Vector2(1, -1);
  const pbr = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: NS, roughnessMap: t.orm, metalnessMap: t.orm, roughness: 1, metalness: 1, envMapIntensity: 1.15, ...o });
  const roofMat = makeFlatRoofMaterial();
  const concMat = pbr(concreteMaps(TS), { color: 0xe2e0da, envMapIntensity: 0.8 });
  const seatMat = makeSeatMaterial(qual);
  const roofs = new Tiles(400, TBuf), conc = new Tiles(), seats = new Tiles(400, TBuf), seatRoof = new Tiles(), standRoof = new Tiles(400, TBuf), tarp = new Tiles(), rails = new Tiles();
  const pit = { panel: new Tiles(), glass: new Tiles(), door: new Tiles(), red: new Tiles(), trim: new Tiles() };
  // which way the circuit lies from a point, and how far off it is
  const trackDir = (x, z) => { const nn = nearestStation(x, z, ns); if (!nn) return null; const fr = frameAt(nn.s, {}), dx = fr.x - x, dz = fr.z - z, d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d, d]; };
  // the ordinary buildings are modelled wall by wall in arch.js; the two pit buildings and the stands are built below
  const arch = makeArch({ Buf, Tiles, face, beam, groundAt, qual, conc, rails, shedRoof: standRoof, trackDir, signs: SIGNS });
  let bi = -1, standNo = 0, garage = 0, flagNo = 0;
  for (const b of W.buildings) {
    bi++;
    const name = b.name || '';
    if (b.area < 14 || b.pts.length < 3) continue;
    let pts = b.pts.map(([x, z]) => new THREE.Vector2(x, z));
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cz = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    if (isStand(b) && grandstand(b)) continue;
    const yt = b.y0 + Math.min(Math.max(b.h, 3), 30);
    // one colour per roof, taken from the aerial photo (the photo itself is not drawn on the roof)
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    for (const p of pts) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); bz0 = Math.min(bz0, p.y); bz1 = Math.max(bz1, p.y); }
    const rc = photoSampler(pts)([[bx0, bz0], [bx1, bz0], [bx1, bz1], [bx0, bz1]]);
    let roofY = null, flatY = yt;
    if (/Stand F1|Stand Endurance/i.test(name)) roofY = pitBuilding(b, pts);
    else { const td = trackDir(cx, cz), res = arch.building(b, pts, { idx: bi, dist: td ? td[2] : 1e9, roofTint: rc }); if (!res) continue; flatY = res.flatY; }
    if (flatY === null) continue;                                    // a pitched roof: arch.js has built it
    const tri = THREE.ShapeUtils.triangulateShape(pts, []), R = roofs.at(cx, cz), base = R.pos.length / 3;
    pts.forEach((p, i) => { R.pos.push(p.x, roofY ? roofY[i] : flatY, p.y); R.nor.push(0, 1, 0); R.uv.push(p.x, p.y); R.tint.push(rc[0], rc[1], rc[2], 1); });
    for (const t of tri) R.idx.push(base + t[0], base + t[2], base + t[1]);
  }

  /* A flag on a pole standing on a roof at p ([x, z]), its foot at height y0. The cloth is a strip of six panels
     caught in mid-ripple and hanging a little at the fly (it does not move). */
  function flag(p, y0, rnd) {
    const hgt = 5.2, wx = 0.83, wz = 0.56, nth = flagNo++, cols = nth % 4 === 1 ? BELGIUM : FLAGS[(nth - (nth >> 2)) % FLAGS.length], ph = rnd() * 6.3, len = 1.7, hh = 1.05, N = 6;
    rails.at(p[0], p[1]).box(p[0], y0 + hgt / 2, p[1], 0.07, hgt, 0.07, 0); rails.at(p[0], p[1]).box(p[0], y0 + hgt + 0.05, p[1], 0.12, 0.1, 0.12, 0);
    const at2 = (u, v) => { const t = u / N, rip = 0.09 * Math.sin(t * 5.2 + ph) * t; return [p[0] + wx * len * t - wz * rip, y0 + hgt - 0.08 - hh * v - 0.16 * t * t, p[1] + wz * len * t + wx * rip]; };
    for (let u = 0; u < N; u++) for (let v = 0; v < 2; v++) {
      const a = at2(u, (v + 1) / 2), c = at2(u + 1, (v + 1) / 2), d = at2(u + 1, v / 2), e = at2(u, v / 2), col = cols.length === 3 ? cols[Math.min(2, Math.floor(u / 2))] : cols[u === 0 ? 1 : 0];
      face(arch.paint(p[0], p[1], col), a, c, d, e, [-wz, 0, wx], Q1); face(arch.paint(p[0], p[1], col), a, c, d, e, [wz, 0, -wx], Q1);
    }
  }

  /* A pit building, built bay by bay from its surveyed outline. Every wall of 5 m or more is a run of 6 m bays in
     groups of four. A group stands level on the ground under it: the pit lane slopes, so the building steps down the
     hill group by group, as the real ones do. Bottom to top: roller doors set back between piers, a red fascia with a
     number board over each door, glazed floors each behind a balcony slab and rail, fins on the bay lines, a deep
     cornice. Shorter walls are plain cladding. Returns the roof height at each corner of the outline.
     The doors are slatted curtains (each slat two faces), and along the main frontages some stand part or fully
     raised on a garage: floor, walls, ceiling with its light, a bench, a tool cabinet, a stack of tyres. The glazed
     floors are curtain walling: a spandrel panel, then separate panes (no two quite flat, so each reflects its own
     sky) between aluminium mullions and transoms, some with a blind down. (The phone tier keeps the drawn door and
     glass: one quad each.) */
  function pitBuilding(b, pts) {
    const n = pts.length, h = Math.min(Math.max(b.h, 9), 30), nF = Math.max(1, Math.round((h - 5.9) / 3.1)), fh = (h - 5.9) / nF, GB = 4;
    const dir = pts.map((p, i) => { const q = pts[(i + 1) % n], L = p.distanceTo(q); return L > 0.05 ? [(q.x - p.x) / L, (q.y - p.y) / L, L] : null; });
    const prev = (j) => { let k = (j - 1 + n) % n; for (let c = 0; c < n && !dir[k]; c++) k = (k - 1 + n) % n; return dir[k]; };
    const next = (j) => { let k = (j + 1) % n; for (let c = 0; c < n && !dir[k]; c++) k = (k + 1) % n; return dir[k]; };
    const turn = (a, c) => Math.atan2(a[0] * c[1] - a[1] * c[0], a[0] * c[0] + a[1] * c[1]);            // > 0: an outside corner
    const ext = (th, o) => (th > 0.15 ? Math.min(o * 1.6, o * Math.tan(th / 2)) : 0);                // how far a part that projects o m must run on to close an outside corner
    const topA = new Array(n).fill(null), topB = new Array(n).fill(null), Q4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
    garage = 0;                                              // each building numbers its own garages from 1
    // the circuit's name goes on the cornice of the longest wall that looks at the circuit
    let nameWall = -1, nameL = 20;
    pts.forEach((p, i) => { const d = dir[i]; if (!d || d[2] <= nameL) return; const mx = p.x + d[0] * d[2] / 2, mz = p.y + d[1] * d[2] / 2, td = trackDir(mx, mz); if (td && d[1] * td[0] - d[0] * td[1] > 0.3) { nameWall = i; nameL = d[2]; } });
    const prnd = rng32(4100 + Math.round(b.area)), inPoly = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const a = pts[i], d = pts[j]; if ((a.y > z) !== (d.y > z) && x < (d.x - a.x) * (z - a.y) / (d.y - a.y) + a.x) c = !c; } return c; };
    for (let i = 0; i < n; i++) {
      if (!dir[i]) continue;
      const p = pts[i], [tx, tz, L] = dir[i], nx = tz, nz = -tx, ang = Math.atan2(tz, tx), out = [nx, 0, nz], fw = [tx, 0, tz], bk = [-tx, 0, -tz];
      const pt = (sd, o) => [p.x + tx * sd + nx * o, p.y + tz * sd + nz * o], V3 = (sd, o, y) => { const a = pt(sd, o); return [a[0], y, a[1]]; };
      const thA = turn(prev(i), dir[i]), thB = turn(dir[i], next(i));
      // upright quad on the wall line, o m out from it, between s0 and s1 along the wall
      const wq = (buf, s0, s1, o, y0, y1, u0, u1, v0, v1) => buf.quad(V3(s1, o, y0), V3(s0, o, y0), V3(s0, o, y1), V3(s1, o, y1), out, [[u1, v0], [u0, v0], [u0, v1], [u1, v1]]);
      const bx = (buf, s0, s1, o0, o1, y0, y1, full) => { const c = pt((s0 + s1) / 2, (o0 + o1) / 2); if (full) boxFull(buf, c[0], (y0 + y1) / 2, c[1], s1 - s0, y1 - y0, o1 - o0, ang); else buf.box(c[0], (y0 + y1) / 2, c[1], s1 - s0, y1 - y0, o1 - o0, ang); };
      if (L < 5) {
        const c = pt(L / 2, 1.0), g = groundAt(c[0], c[1]), top = g + h, m0 = pt(L / 2, 0);
        wq(pit.panel.at(m0[0], m0[1]), 0, L, 0, g - 3, top, 0, L / 3, (g - 3) / 1.5, top / 1.5);
        bx(pit.trim.at(m0[0], m0[1]), -ext(thA, 1.1), L + ext(thB, 1.1), -0.3, 1.1, top - 0.9, top, true);
        topA[i] = topB[i] = top;
        continue;
      }
      const nB = Math.max(1, Math.round(L / 6)), w = L / nB, gk = [];
      for (let k = 0; k < nB; k++) { const c = pt((k + 0.5) * w, 1.2); gk.push(groundAt(c[0], c[1])); }
      for (let k0 = 0; k0 < nB; k0 += GB) {
        const k1 = Math.min(nB, k0 + GB), sA = k0 * w, sB = k1 * w, mid = pt((sA + sB) / 2, 0), at = (T) => T.at(mid[0], mid[1]);
        let base = 0; for (let k = k0; k < k1; k++) base += gk[k]; base /= k1 - k0;
        const yG = base + 4.2, yF = yG + 0.8, top = base + h, yC = top - 0.9;
        if (k0 === 0) topA[i] = top; if (k1 === nB) topB[i] = top;
        const eA = k0 === 0 ? 1 : 0, eB = k1 === nB ? 1 : 0;
        const PN = at(pit.panel), GL = at(pit.glass), DR = at(pit.door), RD = at(pit.red), TR = at(pit.trim), RL = at(rails);
        // garages: a roller door set back half a metre in each bay, a number board over it
        for (let k = k0; k < k1; k++) {
          const s0 = k * w + 0.3, s1 = (k + 1) * w - 0.3, yb = gk[k] - 0.5, rv = [[0, yb / 1.5], [0.17, yb / 1.5], [0.17, yG / 1.5], [0, yG / 1.5]];
          if (qual.lo) wq(DR, s0, s1, -0.5, yb, yG, s0 / 0.8, s1 / 0.8, yb / 0.8, yG / 0.8);
          else {
            const g0 = gk[k], PA = (c) => arch.paint(mid[0], mid[1], c), bA = pt(s0 + 0.2, -8), bB = pt(s1 - 0.2, -8);
            const open = L >= 40 && prnd() < 0.3 && inPoly(bA[0], bA[1]) && inPoly(bB[0], bB[1]) ? 0.45 + prnd() * 0.55 : 0;
            const yd = open ? g0 + (yG - g0) * open : yb, ns = Math.max(1, Math.round((yG - yd) / 0.2)), sl = (yG - yd) / ns;
            for (let q = 0; q < ns; q++) {          // slats: the lower half of each leans out, the upper half back
              const a = yd + q * sl, m2 = a + sl / 2, c = a + sl;
              face(PA(DOOR_COL), V3(s0, -0.5, a), V3(s1, -0.5, a), V3(s1, -0.472, m2), V3(s0, -0.472, m2), out, Q4);
              face(PA(DOOR_COL), V3(s0, -0.472, m2), V3(s1, -0.472, m2), V3(s1, -0.5, c), V3(s0, -0.5, c), out, Q4);
            }
            if (open) {
              const dp = -6.6, yf = g0 + 0.02, yc = yG - 0.03;
              bx(PA(I_DARK), s0, s1, -0.53, -0.45, yd - 0.07, yd, true);                                                 // the curtain's bottom rail
              face(PA(I_FLOOR), V3(s0, dp, yf), V3(s1, dp, yf), V3(s1, -0.5, yf), V3(s0, -0.5, yf), [0, 1, 0], Q4);
              face(PA(I_WALL), V3(s0, dp, yf), V3(s1, dp, yf), V3(s1, dp, yc), V3(s0, dp, yc), out, Q4);
              face(PA(I_SIDE), V3(s0, -0.5, yf), V3(s0, dp, yf), V3(s0, dp, yc), V3(s0, -0.5, yc), fw, Q4);
              face(PA(I_SIDE), V3(s1, -0.5, yf), V3(s1, dp, yf), V3(s1, dp, yc), V3(s1, -0.5, yc), bk, Q4);
              face(PA(I_CEIL), V3(s0, dp, yc), V3(s1, dp, yc), V3(s1, -0.5, yc), V3(s0, -0.5, yc), [0, -1, 0], Q4);
              for (const o of [-2.2, -4.4]) bx(PA(I_LIGHT), s0 + 0.7, s1 - 0.7, o - 0.09, o + 0.09, yc - 0.07, yc - 0.01, true);     // strip lights
              bx(PA(I_SIDE), s0 + 0.5, s1 - 0.5, dp, dp + 0.7, yf, yf + 0.9, false); bx(PA(I_DARK), s0 + 0.45, s1 - 0.45, dp, dp + 0.75, yf + 0.9, yf + 0.94, false);   // bench
              bx(PA(prnd() < 0.5 ? I_RED : I_BLUE), s0 + 0.25, s0 + 1.35, -4.6, -4.0, yf, yf + 1.0, false);               // tool cabinet
              for (let q = 0; q < 4; q++) bx(PA(I_TYRE), s1 - 1.0, s1 - 0.28, -3.6, -2.88, yf + q * 0.33, yf + q * 0.33 + 0.31, false);   // tyres, stacked
            }
          }
          face(PN, V3(s0, -0.5, yb), V3(s0, 0, yb), V3(s0, 0, yG), V3(s0, -0.5, yG), fw, rv);
          face(PN, V3(s1, -0.5, yb), V3(s1, 0, yb), V3(s1, 0, yG), V3(s1, -0.5, yG), bk, rv);
          face(PN, V3(s0, -0.5, yG), V3(s1, -0.5, yG), V3(s1, 0, yG), V3(s0, 0, yG), [0, -1, 0], [[0, 0], [(s1 - s0) / 3, 0], [(s1 - s0) / 3, 0.33], [0, 0.33]]);
          const sc = (k + 0.5) * w; SIGNS.board(pt(sc - 0.9, 0), pt(sc + 0.9, 0), yG + 0.14, yG + 0.66, out, 0.18, SIGNS.cell(String(++garage), GARAGE_NO));
        }
        for (let k = k0; k <= k1; k++) { const a = Math.max(sA, k * w - 0.3), c = Math.min(sB, k * w + 0.3); wq(PN, a, c, 0, base - 3, yG, a / 3, c / 3, (base - 3) / 1.5, yG / 1.5); }      // piers
        // fascia
        wq(RD, sA, sB, 0.12, yG, yF, 0, 1, 0, 1);
        face(RD, V3(sA, 0, yG), V3(sB, 0, yG), V3(sB, 0.12, yG), V3(sA, 0.12, yG), [0, -1, 0], Q4);
        face(RD, V3(sA, 0, yG), V3(sA, 0.12, yG), V3(sA, 0.12, yF), V3(sA, 0, yF), bk, Q4); face(RD, V3(sB, 0, yG), V3(sB, 0.12, yG), V3(sB, 0.12, yF), V3(sB, 0, yF), fw, Q4);
        // glazed floors, each behind a balcony slab with a steel rail
        for (let f = 0; f < nF; f++) {
          const y0 = yF + f * fh, y1 = f === nF - 1 ? yC : y0 + fh, r0 = sA + 0.05, r1 = sB - 0.05;
          if (qual.lo) wq(GL, sA, sB, -0.08, y0, y1, sA / w, sB / w, 0, 1);
          else {
            const ySp = y0 + 0.78, yHd = y1 - 0.22, np = Math.max(1, Math.round((sB - sA) / 1.5)), pw = (sB - sA) / np, kit = { nx, nz, tx, tz };
            wq(PN, sA, sB, -0.05, y0, ySp, sA / 3, sB / 3, y0 / 1.5, ySp / 1.5); face(PN, V3(sA, -0.08, ySp), V3(sB, -0.08, ySp), V3(sB, -0.05, ySp), V3(sA, -0.05, ySp), [0, 1, 0], Q4);
            wq(PN, sA, sB, -0.05, yHd, y1, sA / 3, sB / 3, yHd / 1.5, y1 / 1.5); face(PN, V3(sA, -0.08, yHd), V3(sB, -0.08, yHd), V3(sB, -0.05, yHd), V3(sA, -0.05, yHd), [0, -1, 0], Q4);
            for (let q = 0; q < np; q++) {
              const a = sA + q * pw, c = a + pw, gb = arch.glass(mid[0], mid[1], prnd);
              wq(gb, a, c, -0.08, ySp, yHd, 0, 1, 0, 1); arch.tilt(gb, kit, (prnd() - 0.5) * 0.034, (prnd() - 0.5) * 0.034);
              if (prnd() < 0.09) { const bh = (yHd - ySp) * (0.15 + prnd() * 0.3); wq(arch.paint(mid[0], mid[1], BLIND_COL), a + 0.04, c - 0.04, -0.045, yHd - bh, yHd, 0, 1, 0, 1); }
            }
            for (let q = 0; q <= np; q++) { const sd = Math.min(sB - 0.03, Math.max(sA + 0.03, sA + q * pw)); bx(RL, sd - 0.03, sd + 0.03, -0.08, 0.0, ySp, yHd, false); }
            bx(RL, sA, sB, -0.08, -0.01, ySp - 0.03, ySp + 0.03, true); bx(RL, sA, sB, -0.08, -0.01, yHd - 0.03, yHd + 0.03, true);
          }
          bx(TR, sA - eA * ext(thA, 0.95), sB + eB * ext(thB, 0.95), -0.08, 0.95, y0 - 0.2, y0 + 0.02, true);
          bx(RL, r0, r1, 0.86, 0.91, y0 + 1.02, y0 + 1.07, true); bx(RL, r0, r1, 0.87, 0.90, y0 + 0.5, y0 + 0.53, true);
          if (!qual.lo) { const np = Math.max(2, Math.round((r1 - r0) / 2)); for (let q = 0; q <= np; q++) { const sd = r0 + (r1 - r0) * q / np; bx(RL, sd - 0.02, sd + 0.02, 0.865, 0.905, y0 + 0.02, y0 + 1.02, false); } }
        }
        for (let k = k0; k <= k1; k++) { const sd = Math.min(sB - 0.11, Math.max(sA + 0.11, k * w)); bx(TR, sd - 0.11, sd + 0.11, -0.08, 0.45, yF, yC, false); }      // fins on the bay lines
        bx(TR, sA - eA * ext(thA, 1.1), sB + eB * ext(thB, 1.1), -0.3, 1.1, yC, top, true);
        if (i === nameWall && sA <= L / 2 && L / 2 < sB) { const cl = SIGNS.cell('SPA-FRANCORCHAMPS', CORNICE_NAME), hh = 0.62, ww = hh * cl.aspect, sc = (sA + sB) / 2; SIGNS.board(pt(sc - ww / 2, 0), pt(sc + ww / 2, 0), yC + 0.14, yC + 0.14 + hh, out, 1.112, cl); }
        if (L >= 40 && !qual.lo) {
          // floodlights on arms under the cornice, one over every bay line; a flagpole on the roof over the middle of the group
          for (let k = k0; k <= k1; k++) { const sd = Math.min(sB - 0.3, Math.max(sA + 0.3, k * w)); bx(RL, sd - 0.03, sd + 0.03, 1.1, 1.52, yC - 0.2, yC - 0.14, true); bx(arch.paint(mid[0], mid[1], I_DARK), sd - 0.24, sd + 0.24, 1.42, 1.74, yC - 0.4, yC - 0.2, true); bx(arch.paint(mid[0], mid[1], I_LIGHT), sd - 0.2, sd + 0.2, 1.46, 1.7, yC - 0.415, yC - 0.4, true); }
          flag(pt((sA + sB) / 2, -0.9), top, prnd);
        }                                                                  // cornice
      }
    }
    // the roof sits just under the lowest wall top that meets each corner
    return pts.map((p, i) => { const a = topA[i], c = topB[(i - 1 + n) % n], t = a === null ? c : c === null ? a : Math.min(a, c); return (t === null ? groundAt(p.x, p.y) + h : t) - 0.55; });
  }

  /* A stand is built from its surveyed outline. Every long edge that faces the circuit becomes a run of bays about
     11 m wide (the roof bays in the aerial photo). Each bay starts just above the ground at its own front edge and
     rises at one rake for the whole stand, steep enough to clear the hillside underneath, so a stand on a slope
     steps down the hill bay by bay like the real ones. */
  function grandstand(b) {
    if (!b.stand) return false;
    const open = b.temp || /Silver|RX/i.test(b.name || ''), { P, mods } = b.stand, photo = photoSampler(P);
    const letter = String.fromCharCode(65 + (standNo++ % 26)); let blockNo = 0;      // every stand has a letter, every bay of it a number
    // seat colour: under a roof, blue; open stands, from the photo; a scaffold stand, the colour its seats have in the photo
    const lin = (v) => Math.pow(v, 2.2) * 0.62;
    const seatTint = b.temp ? [lin(b.seat[0]), lin(b.seat[1]), lin(b.seat[2]), 1] : (open ? [0, 0, 0, 0] : SEAT_BLUE);
    const at = (m, f, c) => [m.p.x + m.ex * f - m.ox * c, m.p.y + m.ez * f - m.oz * c];     // f m along the front edge, c m back from it
    const lerp = (a, c, t) => a + (c - a) * t;
    const seatD = (d) => (d - SEAT_DEPTH > 2.5 ? SEAT_DEPTH : d);
    // ground at each bay front, and the rake that clears the slope behind it
    let rake = 0.42;
    for (const m of mods) {
      m.gF = [];
      for (let k = 0; k < m.nb; k++) {
        let g = -1e9;
        for (let u = 0; u <= 1.001; u += 0.25) for (const c of [0, 1]) { const [x, z] = at(m, (k + u) * m.bw, c); g = Math.max(g, naturalAt(x, z)); }
        m.gF.push(g);
      }
      const lo = Math.min(...m.gF), hi = Math.max(...m.gF);
      if (hi - lo < 0.8) m.gF.fill(hi);                                                     // level site: one level stand
      for (let k = 0; k < m.nb; k++) for (let u = 0; u <= 1.001; u += 0.25) {
        const ds = seatD(lerp(m.dk[k], m.dk[k + 1], u));
        for (let c = 5; c <= ds; c += 2.5) { const [x, z] = at(m, (k + u) * m.bw, c); rake = Math.max(rake, (naturalAt(x, z) + 0.4 - m.gF[k] - 0.9) / c); }
      }
    }
    rake = Math.min(rake, 0.6);
    for (const m of mods) {
      const cx = m.p.x + m.ex * m.L / 2, cz = m.p.y + m.ez * m.L / 2;
      const S = seats.at(cx, cz), C = (b.temp ? tarp : conc).at(cx, cz), R = standRoof.at(cx, cz), U = seatRoof.at(cx, cz);      // a scaffold stand is wrapped in dark sheeting, not built of concrete
      const ST = conc.at(cx, cz), RLs = rails.at(cx, cz), angE = Math.atan2(m.ez, m.ex);
      const out = [m.ox, 0, m.oz], inw = [-m.ox, 0, -m.oz], fwd = [m.ex, 0, m.ez], bck = [-m.ex, 0, -m.ez];
      const V = (p, y) => [p[0], y, p[1]];
      const F = [], top = [];
      for (let k = 0; k < m.nb; k++) {
        const f0 = k * m.bw, f1 = (k + 1) * m.bw, d0 = m.dk[k], d1 = m.dk[k + 1], s0 = seatD(d0), s1 = seatD(d1);
        // lift the bay until seats and rear deck clear the ground everywhere
        let Fk = m.gF[k] + 0.9, lift = 0, gMin = 1e9, gBack = 1e9;
        for (let u = 0; u <= 1.001; u += 0.2) {
          const d = lerp(d0, d1, u), s = seatD(d);
          for (let c = 0; c <= d + 0.01; c += Math.max(0.5, d / 12)) {
            const [x, z] = at(m, lerp(f0, f1, u), c), g = naturalAt(x, z);
            lift = Math.max(lift, g + 0.4 - (Fk + rake * Math.min(c, s))); gMin = Math.min(gMin, g);
            if (c > d - 1.5) gBack = Math.min(gBack, g);
          }
        }
        Fk += lift; F.push(Fk);
        const B0 = Fk + rake * s0, B1 = Fk + rake * s1, Bm = Math.max(B0, B1), yb = gMin - 0.8;
        const A0 = at(m, f0, 0), A1 = at(m, f1, 0), C0 = at(m, f0, s0), C1 = at(m, f1, s1), D0 = at(m, f0, d0), D1 = at(m, f1, d1);
        /* Tiers: real steps, 0.8 m deep, with a row of seats on each (a pan and a back; the seat material cuts the
           gaps between the shells) and a stair aisle left clear at both edges of the bay. */
        // (an open stand's seats take one colour per bay from the survey photo: sampled seat by seat, the photo's shadows and people came out as blotches)
        const tintB = seatTint[3] ? seatTint : [...photo([A0, A1, C1, C0]).map((v) => Math.min(0.8, v * 1.7)), 1];
        const nR = Math.max(2, Math.round(Math.max(s0, s1) / 0.8)), ua = Math.min(0.7, m.bw * 0.07) / m.bw, ub = 1 - ua, sw = (ub - ua) * m.bw;
        const rp = (u, c, dc) => { const sd = lerp(s0, s1, u); return [at(m, lerp(f0, f1, u), sd * c + dc), Fk + rake * sd * c]; };      // [point, tread height]: u across the bay, row fraction c, dc m further back
        for (let j = 0; j < nR; j++) {
          const c0 = j / nR, c1 = (j + 1) / nR;
          const [T0, ya0] = rp(0, c0, 0), [T1, ya1] = rp(1, c0, 0), [U0, yb0] = rp(0, c1, 0), [U1, yb1] = rp(1, c1, 0);
          face(ST, V(T0, ya0), V(T1, ya1), V(U1, ya1), V(U0, ya0), [0, 1, 0], [[f0 / 4, j * 0.2], [f1 / 4, j * 0.2], [f1 / 4, j * 0.2 + 0.2], [f0 / 4, j * 0.2 + 0.2]]);
          face(ST, V(U0, ya0), V(U1, ya1), V(U1, yb1), V(U0, yb0), out, [[f0 / 4, j * 0.2 + 0.2], [f1 / 4, j * 0.2 + 0.2], [f1 / 4, j * 0.2 + 0.3], [f0 / 4, j * 0.2 + 0.3]]);
          const [a0, h0] = rp(ua, c0, 0.30), [a1, h1] = rp(ub, c0, 0.30), [b0] = rp(ua, c0, 0.68), [b1] = rp(ub, c0, 0.68);
          face(S, V(a0, h0 + 0.43), V(a1, h1 + 0.43), V(b1, h1 + 0.43), V(b0, h0 + 0.43), [0, 1, 0], [[0, 0], [sw, 0], [sw, 0.5], [0, 0.5]], tintB);
          face(S, V(b0, h0 + 0.40), V(b1, h1 + 0.40), V(b1, h1 + 0.84), V(b0, h0 + 0.84), out, [[0, 0.5], [sw, 0.5], [sw, 1], [0, 1]], tintB);
        }
        // front wall, with a parapet standing a little above the first row
        if (!b.temp) SIGNS.board(at(m, (f0 + f1) / 2 - 0.75, 0), at(m, (f0 + f1) / 2 + 0.75, 0), Fk - 0.02, Fk + 0.46, out, 0.04, SIGNS.cell(letter + String(++blockNo).padStart(2, '0'), BLOCK_NO));
        wall(C, A0, A1, yb, Fk + 0.55, yb, Fk + 0.55, out); wall(C, A0, A1, Fk, Fk + 0.55, Fk, Fk + 0.55, inw);
        { // steel handrail on the parapet
          const rc = at(m, (f0 + f1) / 2, 0.08); RLs.box(rc[0], Fk + 1.1, rc[1], m.bw - 0.1, 0.05, 0.05, angE);
          for (let q = 0; q <= 6; q++) { const c = at(m, f0 + 0.08 + (m.bw - 0.16) * q / 6, 0.08); RLs.box(c[0], Fk + 0.81, c[1], 0.04, 0.55, 0.04, angE); }
        }
        const deck = Math.max(d0 - s0, d1 - s1) > 0.5, block = open && deck;
        const yTop = block ? Bm + 3.2 : Bm;                               // an open stand deeper than its seating has a building behind
        if (deck) {
          if (block) {
            wall(C, C0, C1, B0, yTop, B1, yTop, out);
            face(R, V(C0, yTop), V(C1, yTop), V(D1, yTop), V(D0, yTop), [0, 1, 0], [[0, 0], [m.bw, 0], [m.bw, d1 - s1], [0, d0 - s0]], [...photo([C0, C1, D1, D0]), m.bw]);
          } else face(C, V(C0, B0), V(C1, B1), V(D1, B1), V(D0, B0), [0, 1, 0], [[0, 0], [m.bw / 4, 0], [m.bw / 4, 2], [0, 2]]);
        }
        let yBackTop = block ? yTop : Bm + 1.1;
        if (!open) {
          // roof: one sheet per bay, a little higher at the front, beams along the bay edges
          const yF = Bm + 3.9, yB = Bm + 3.1, T = 0.3;
          const r0 = at(m, f0, -1.8), r1 = at(m, f1, -1.8), r2 = at(m, f1, d1 + 0.5), r3 = at(m, f0, d0 + 0.5), dep = (d0 + d1) / 2 + 2.3;
          face(R, V(r0, yF), V(r1, yF), V(r2, yB), V(r3, yB), [0, 1, 0], [[0, 0], [m.bw, 0], [m.bw, dep], [0, dep]], [...photo([A0, A1, D1, D0]), m.bw]);
          const Q = [[0, 0], [1, 0], [1, 1], [0, 1]];
          face(U, V(r0, yF - T), V(r1, yF - T), V(r2, yB - T), V(r3, yB - T), [0, -1, 0], Q);
          face(U, V(r0, yF - T), V(r1, yF - T), V(r1, yF), V(r0, yF), out, Q); face(U, V(r3, yB - T), V(r2, yB - T), V(r2, yB), V(r3, yB), inw, Q);
          face(U, V(r0, yF - T), V(r3, yB - T), V(r3, yB), V(r0, yF), bck, Q); face(U, V(r1, yF - T), V(r2, yB - T), V(r2, yB), V(r1, yF), fwd, Q);
          yBackTop = yB - T;
          for (const [f, d] of [[f0 + 0.3, d0], [f1 - 0.3, d1]]) {       // columns at the back corners
            const c = at(m, f, d - 0.3), g = naturalAt(c[0], c[1]) - 0.5;
            C.box(c[0], (g + yBackTop) / 2, c[1], 0.45, yBackTop - g, 0.45, Math.atan2(m.ez, m.ex));
          }
          /* The roof's frame, so the sheet is carried by something: over each column a rafter, deep at the column
             and tapering to the front edge it cantilevers to; a raking strut from the column up to the rafter; and
             purlins across the bay under the sheet. */
          const ry = (c, d) => lerp(yF, yB, (c + 1.8) / (d + 2.3)) - T, rd = (c, d) => lerp(0.3, 1.25, (c + 1.8) / (d + 1.5));
          for (const [f, d] of [[f0 + 0.3, d0], [f1 - 0.3, d1]]) {
            const cb = d - 0.3, yk = ry(cb, d), yn = ry(-1.8, d);
            for (const sg of [-1, 1]) { const pb = at(m, f + sg * 0.14, cb), pf = at(m, f + sg * 0.14, -1.8); face(U, V(pb, yk - 1.25), V(pf, yn - 0.3), V(pf, yn), V(pb, yk), sg > 0 ? fwd : bck, Q); }
            face(U, V(at(m, f - 0.14, cb), yk - 1.25), V(at(m, f + 0.14, cb), yk - 1.25), V(at(m, f + 0.14, -1.8), yn - 0.3), V(at(m, f - 0.14, -1.8), yn - 0.3), [0, -1, 0], Q);
            const cs = cb - Math.min(9, (d + 1.5) * 0.36), ps = at(m, f, cs), pc = at(m, f, cb);
            beam(U, [pc[0], Bm + 0.6, pc[1]], [ps[0], ry(cs, d) - rd(cs, d) + 0.05, ps[1]], 0.22, 0.3);
          }
          { const dm = (d0 + d1) / 2;
            for (let q = 1; q <= 5; q++) { const c = lerp(-1.8, dm + 0.5, q / 6), pc = at(m, (f0 + f1) / 2, c); U.box(pc[0], ry(c, dm) - 0.11, pc[1], m.bw - 0.6, 0.2, 0.12, angE); } }
        }
        // back wall, both faces
        wall(C, D0, D1, Math.min(yb, gBack - 0.8), yBackTop, Math.min(yb, gBack - 0.8), yBackTop, inw);
        wall(C, D0, D1, B0, yBackTop, B1, yBackTop, out);
        top.push({ B0, B1, yTop, yb, s0, s1, d0, d1 });
      }
      // walls between bays and at both ends, tall enough to close the step from one bay to the next
      for (let k = 0; k <= m.nb; k++) {
        const l = top[k - 1], r = top[k], f = k * m.bw, d = m.dk[k], s = seatD(d);
        const Fm = Math.max(l ? F[k - 1] : -1e9, r ? F[k] : -1e9), Bm = Math.max(l ? l.B1 : -1e9, r ? r.B0 : -1e9);
        const Tm = Math.max(l ? l.yTop : -1e9, r ? r.yTop : -1e9), yb = Math.min(l ? l.yb : 1e9, r ? r.yb : 1e9);
        const A = at(m, f, 0), Cc = at(m, f, s), D = at(m, f, d);
        for (const w of [fwd, bck]) {
          wall(C, A, Cc, yb, Fm + 0.25, yb, Bm + 0.25, w);
          if (d - s > 0.5) wall(C, Cc, D, yb, Math.max(Bm + 0.25, Tm), yb, Math.max(Bm + 0.25, Tm), w);
        }
      }
    }
    return true;
  }
  const archStats = arch.addTo(group, NS);
  roofs.add(group, roofMat); seats.add(group, seatMat);
  pit.panel.add(group, pbr(panelMaps(256)));
  if (qual.lo) { pit.glass.add(group, pbr(curtainWallMaps(TS), { envMapIntensity: 1.3 })); pit.door.add(group, pbr(shutterMaps(256))); }
  pit.red.add(group, new THREE.MeshStandardMaterial({ color: 0xa3151b, roughness: 0.45, metalness: 0.05 }));
  pit.trim.add(group, new THREE.MeshStandardMaterial({ color: 0xe9eae6, roughness: 0.55, metalness: 0.05 }));
  const steelRoof = new THREE.MeshStandardMaterial({ map: steel, color: 0xaeb3b8, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide });
  seatRoof.add(group, steelRoof); standRoof.add(group, makeStandRoofMaterial());
  tarp.add(group, new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));

  /* ---------------- start-light gantry ----------------
     Ahead of the grid (it used to stand 25 m behind the cars, where no driver could see it). Two lattice towers on
     concrete footings carry a box truss with a railed walkway; under it hang five lamp housings facing the grid,
     each with two red lamps under hoods and two unlit ones below. The red lamps light column by column with the
     start sequence (setLights). */
  const lampMats = [];
  {
    const fr = frameAt(16, {}), G = new Buf(), ang = Math.atan2(fr.rz, fr.rx), span = fr.hw + 3.4, top = fr.y + 7.7, yb = top - 1.15, D = 0.45;
    const Pg = (a, y, d) => [fr.x + fr.rx * a + fr.dx * d, y, fr.z + fr.rz * a + fr.dz * d], toGrid = [-fr.dx, 0, -fr.dz], Q4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const RLg = rails.at(fr.x, fr.z);
    for (const sd of [-1, 1]) {
      const a = span * sd, c = Pg(a, 0, 0), g = groundAt(c[0], c[2]);
      conc.at(c[0], c[2]).box(c[0], g + 0.25, c[2], 1.0, 1.1, 1.7, ang);
      for (const d of [-D, D]) { const q = Pg(a, 0, d); G.box(q[0], (g + 0.8 + top) / 2, q[2], 0.24, top - g - 0.8, 0.24, ang); }
      const nb = Math.round((top - g - 1.2) / 1.25), dy = (top - g - 1.2) / nb;
      for (let i = 0; i < nb; i++) { const y0 = g + 1.0 + i * dy, y1 = y0 + dy, e = i % 2 ? 1 : -1; beam(G, Pg(a, y0, -D * e), Pg(a, y1, D * e), 0.07, 0.07); beam(G, Pg(a, y1, -D), Pg(a, y1, D), 0.07, 0.07); }
    }
    for (const y of [top, yb]) for (const d of [-D, D]) { const c = Pg(0, y, d); boxFull(G, c[0], y, c[2], span * 2 + 0.3, 0.16, 0.16, ang); }
    const np = Math.round(span * 2 / 1.6), pw = span * 2 / np;
    for (let i = 0; i <= np; i++) {
      const a = -span + i * pw;
      for (const d of [-D, D]) { beam(G, Pg(a, yb, d), Pg(a, top, d), 0.07, 0.07); if (i < np) beam(G, Pg(a, i % 2 ? top : yb, d), Pg(a + pw, i % 2 ? yb : top, d), 0.07, 0.07); }
      for (const y of [top, yb]) beam(G, Pg(a, y, -D), Pg(a, y, D), 0.07, 0.07);
      if (i < np) beam(G, Pg(a, yb, i % 2 ? D : -D), Pg(a + pw, yb, i % 2 ? -D : D), 0.05, 0.05);
      for (const d of [-D, D]) { const c = Pg(a, top + 0.6, d); RLg.box(c[0], top + 0.6, c[2], 0.04, 1.05, 0.04, ang); }
    }
    { const c0 = Pg(0, top + 0.09, 0); G.box(c0[0], top + 0.09, c0[2], span * 2, 0.03, D * 2 - 0.1, ang); }                           // walkway deck
    for (const d of [-D, D]) for (const y of [top + 1.1, top + 0.62]) { const c = Pg(0, y, d); RLg.box(c[0], y, c[2], span * 2, 0.045, 0.045, ang); }
    // lamp housings
    const lamps = [0, 1, 2, 3, 4].map(() => new Buf()), dead = new Buf(), d0 = -0.3, fd = d0 - 0.135;
    const disc = (buf, a, y, r) => { const v = []; for (let q = 0; q < 12; q++) { const t = q / 12 * Math.PI * 2; v.push(Pg(a + Math.cos(t) * r, y + Math.sin(t) * r, fd - 0.012)); } const c = Pg(a, y, fd - 0.012); for (let q = 0; q < 12; q += 2) face(buf, c, v[q], v[q + 1], v[(q + 2) % 12], toGrid, Q4); };
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 1.5, yc = yb - 1.03, c = Pg(a, yc, d0);
      boxFull(G, c[0], yc, c[2], 0.78, 1.62, 0.27, ang);
      for (const da of [-0.25, 0.25]) beam(G, Pg(a + da, yc + 0.81, d0), Pg(a + da, yb, -D * 0.6), 0.05, 0.05);
      [0.57, 0.19, -0.19, -0.57].forEach((dy, j) => {
        disc(j < 2 ? lamps[k] : dead, a, yc + dy, 0.155);
        const h = Pg(a, yc + dy + 0.18, fd - 0.07); boxFull(G, h[0], yc + dy + 0.18, h[2], 0.38, 0.018, 0.14, ang);
      });
    }
    group.add(G.mesh(new THREE.MeshStandardMaterial({ color: 0x1f2226, metalness: 0.55, roughness: 0.5 })));
    group.add(dead.mesh(new THREE.MeshStandardMaterial({ color: 0x0c160e, roughness: 0.25, metalness: 0.1 }), { cast: false }));
    for (const L of lamps) { const m = new THREE.MeshStandardMaterial({ color: 0x2a0505, emissive: 0xff0000, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 }); lampMats.push(m); group.add(L.mesh(m, { cast: false })); }
  }
  // n red columns alight (0..5; anything below 1 is all out)
  const setLights = (n) => { lampMats.forEach((m, i) => { const on = i < n; m.emissiveIntensity = on ? 0.95 : 0; m.color.setHex(on ? 0x8c0000 : 0x2a0505); }); };

  SIGNS.flush(group);
  conc.add(group, concMat);
  rails.add(group, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.38 }), { cast: false });
  scene.add(group);
  return { group, archStats, setLights };
}

// lettering: the number over a pit garage, the block code on a stand, the circuit's name on the pit cornice
const GARAGE_NO = { bg: '#f1f1ee', fg: '#15171a', h: 64, minW: 3.46, size: 0.78, weight: 800 }, BLOCK_NO = { bg: '#12305a', fg: '#ffffff', border: '#ffffff', h: 64, minW: 3.1, size: 0.6 };
const CORNICE_NAME = { bg: '#e9eae6', fg: '#1a1d21', h: 96, pad: 0.3, size: 0.7, weight: 800 };
/* Flags (linear RGB). The circuit's own are a plain field with a narrow band at the hoist: [field, band]. They are
   made up, and laid out so that none can be read as a country's. Every fourth pole flies the host country's:
   three upright bands, black, yellow, red. */
const FLAGS = [[[0.85, 0.85, 0.82], [0.55, 0.02, 0.03]], [[0.8, 0.6, 0.04], [0.02, 0.02, 0.02]], [[0.03, 0.08, 0.3], [0.85, 0.85, 0.82]], [[0.03, 0.25, 0.1], [0.8, 0.6, 0.04]], [[0.55, 0.02, 0.03], [0.02, 0.02, 0.02]], [[0.85, 0.85, 0.82], [0.03, 0.08, 0.3]]];
const BELGIUM = [[0.02, 0.02, 0.02], [0.82, 0.62, 0.03], [0.6, 0.03, 0.04]];
const Q1 = [[0, 0], [1, 0], [1, 1], [0, 1]];
// pit garages: the door curtain, a blind, and the dim colours of a garage seen through a raised door (linear RGB)
const DOOR_COL = [0.58, 0.6, 0.61], BLIND_COL = [0.78, 0.76, 0.7], I_FLOOR = [0.07, 0.07, 0.075], I_WALL = [0.2, 0.2, 0.2], I_SIDE = [0.15, 0.15, 0.155], I_CEIL = [0.09, 0.09, 0.09];
const I_LIGHT = [1.6, 1.6, 1.5], I_DARK = [0.02, 0.02, 0.022], I_RED = [0.3, 0.03, 0.03], I_BLUE = [0.04, 0.09, 0.26], I_TYRE = [0.012, 0.012, 0.013];

/* ---------------- grandstand helpers ---------------- */
const SEAT_BLUE = [0.045, 0.10, 0.27, 1];     // seat colour under a roof (the photo only shows the roof there)
const SEAT_DEPTH = 24;                        // m of seating; a deeper outline has a deck or a building behind
// Buf with a per-vertex tint (seat colour, roof sheet colour)
class TBuf extends Buf {
  constructor() { super(); this.tint = []; }
  mesh(mat, o) { const m = super.mesh(mat, o); m.geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 4)); return m; }
}

// a box with all six faces (Buf.box leaves the underside off), for parts seen from below
function boxFull(buf, cx, cy, cz, sx, sy, sz, ang = 0) {
  buf.box(cx, cy, cz, sx, sy, sz, ang);
  const c = Math.cos(ang), s = Math.sin(ang), hx = sx / 2, hz = sz / 2, P = (x, z) => [cx + x * c - z * s, cy - sy / 2, cz + x * s + z * c];
  buf.quad(P(-hx, -hz), P(hx, -hz), P(hx, hz), P(-hx, hz), [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

// a straight beam from a to b ([x, y, z]) with a w x h section: four sides, open ends
function beam(buf, a, b, w, h) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1, t = [dx / L, dy / L, dz / L];
  let sx = -t[2], sz = t[0]; const sl = Math.hypot(sx, sz); if (sl < 1e-4) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
  const u = [-sz * t[1], sz * t[0] - sx * t[2], sx * t[1]];                         // side x along = up
  const at = (p, i, j) => [p[0] + sx * i * w / 2 + u[0] * j * h / 2, p[1] + u[1] * j * h / 2, p[2] + sz * i * w / 2 + u[2] * j * h / 2];
  const uv = [[0, 0], [L / 2, 0], [L / 2, 1], [0, 1]];
  face(buf, at(a, 1, -1), at(b, 1, -1), at(b, 1, 1), at(a, 1, 1), [sx, 0, sz], uv); face(buf, at(a, -1, -1), at(b, -1, -1), at(b, -1, 1), at(a, -1, 1), [-sx, 0, -sz], uv);
  face(buf, at(a, -1, 1), at(b, -1, 1), at(b, 1, 1), at(a, 1, 1), u, uv); face(buf, at(a, -1, -1), at(b, -1, -1), at(b, 1, -1), at(a, 1, -1), [-u[0], -u[1], -u[2]], uv);
}

// quad a-b-c-d, wound so that it faces `want`
function face(buf, a, b, c, d, want, uv, tint) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  if (nx * want[0] + ny * want[1] + nz * want[2] < 0) { [a, b, c, d] = [b, a, d, c]; uv = [uv[1], uv[0], uv[3], uv[2]]; nx = -nx; ny = -ny; nz = -nz; }
  buf.quad(a, b, c, d, [nx, ny, nz], uv);
  if (buf.tint) for (let k = 0; k < 4; k++) buf.tint.push(...(tint || [0, 0, 0, 0]));
}

// upright wall from p0 to p1 ([x, z]), bottom / top heights at each end, facing `want`
function wall(buf, p0, p1, yb0, yt0, yb1, yt1, want) {
  if (yt0 - yb0 < 0.01 && yt1 - yb1 < 0.01) return;
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 4;
  face(buf, [p0[0], yb0, p0[1]], [p1[0], yb1, p1[1]], [p1[0], yt1, p1[1]], [p0[0], yt0, p0[1]], want, [[0, 0], [L, 0], [L, (yt1 - yb1) / 4], [0, (yt0 - yb0) / 4]]);
}

// mean colour of the aerial photo inside a quad ([x, z] corners), as a linear albedo
function photoSampler(P) {
  const img = W.tNear.image, n = W.meta.near;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y); }
  x0 -= 3; z0 -= 3; x1 += 3; z1 += 3;
  const sx = (x0 - n.x0) / n.w * img.width, sy = (z0 - n.z0) / n.h * img.height, sw = (x1 - x0) / n.w * img.width, sh = (z1 - z0) / n.h * img.height;
  const cw = Math.max(2, Math.min(512, Math.round(sw))), ch = Math.max(2, Math.min(512, Math.round(sh)));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  const px = cx.getImageData(0, 0, cw, ch).data;
  return (quad) => {
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let u = 0.15; u < 0.86; u += 0.1) for (let v = 0.15; v < 0.86; v += 0.1) {
      const x = (quad[0][0] * (1 - u) + quad[1][0] * u) * (1 - v) + (quad[3][0] * (1 - u) + quad[2][0] * u) * v;
      const z = (quad[0][1] * (1 - u) + quad[1][1] * u) * (1 - v) + (quad[3][1] * (1 - u) + quad[2][1] * u) * v;
      const i = Math.min(cw - 1, Math.max(0, Math.round((x - x0) / (x1 - x0) * cw))), j = Math.min(ch - 1, Math.max(0, Math.round((z - z0) / (z1 - z0) * ch))), k = (j * cw + i) * 4;
      r += Math.pow(px[k] / 255, 2.2); g += Math.pow(px[k + 1] / 255, 2.2); b += Math.pow(px[k + 2] / 255, 2.2); cnt++;
    }
    if (!cnt) return [0.2, 0.2, 0.2];
    // a sunlit roof renders paler than it looks in the photo: darken a little and keep the hue strong
    r /= cnt; g /= cnt; b /= cnt; const m = (r + g + b) / 3, c = (v) => Math.max(0, m + (v - m) * 1.25) * 0.45;
    return [c(r), c(g), c(b)];
  };
}

// flat roof: one colour with weathering (uv = metres, aTint = colour)
function makeFlatRoofMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aTint; varying vec4 vTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tNoise; varying vec4 vTint;')
      .replace('#include <map_fragment>', 'vec3 rn = texture2D( tNoise, vUv / 29.0 ).rgb, rf = texture2D( tNoise, vUv / 2.7 ).rgb;\ndiffuseColor.rgb = vTint.rgb * ( 0.84 + 0.22 * rn.r ) * ( 0.93 + 0.14 * rf.g );');
  };
  m.customProgramCacheKey = () => 'flatroof';
  return m;
}

// profiled metal roof sheet: ribs run front to back, a pale beam along each bay edge (uv = metres; aTint = colour + bay width)
function makeStandRoofMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aTint; varying vec4 vTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tNoise; varying vec4 vTint;')
      .replace('#include <map_fragment>', /* glsl */`
        float ru = vUv.x, bw = vTint.a;
        float rib = smoothstep( 0.40, 0.5, abs( fract( ru / 0.9 ) - 0.5 ) );
        float beam = 1.0 - smoothstep( 0.20, 0.30, min( ru, bw - ru ) );
        vec3 rn = texture2D( tNoise, vUv / 37.0 ).rgb;
        vec3 rc = vTint.rgb * ( 0.86 + 0.28 * rn.r ) * ( 1.0 - 0.20 * rib );
        diffuseColor.rgb = mix( rc, vec3( 0.60, 0.60, 0.58 ), beam * 0.85 );
      `);
  };
  m.customProgramCacheKey = () => 'standroof';
  return m;
}

/* Seats. Each row is a pan and a back (uv.x = metres along the row, uv.y < 0.5 the pan, > 0.5 the back). The gap
   between one shell and the next is cut out, so a row is separate seats with the step showing between them. */
function makeSeatMaterial(qual) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide });
  if (qual && qual.msaa > 0) m.alphaToCoverage = true; else m.alphaTest = 0.5;
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aTint; varying vec4 vTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tNear, tNoise; uniform vec4 uNearRect; varying vec4 vTint;')
      .replace('#include <map_fragment>', /* glsl */`
        // open stands take their seat colour from the survey photo (the real colours); under a roof the photo shows
        // the roof, so those stands carry their own
        vec3 ph = texture2D( tNear, ( vFogWorld.xz - uNearRect.xy ) * uNearRect.zw ).rgb;
        float seat = fract( vUv.x / 0.5 ), id = floor( vUv.x / 0.5 );
        float shell = smoothstep( 0.04, 0.09, seat ) * ( 1.0 - smoothstep( 0.91, 0.96, seat ) );
        vec3 sc = mix( ph * 0.9, vec3( dot( ph, vec3( 0.33 ) ) ), 0.15 );
        vec3 sv = texture2D( tNoise, vec2( id, floor( vFogWorld.y * 2.6 ) ) / 64.0 + 0.37 ).rgb;
        sc = mix( sc, vTint.rgb, vTint.a ) * ( 0.84 + 0.32 * sv.r );
        float back = step( 0.5, vUv.y ), v = fract( vUv.y * 2.0 );
        diffuseColor.rgb = sc * mix( 1.0 - 0.3 * v, 0.78 + 0.26 * v, back );
        diffuseColor.a = shell;
      `);
  };
  m.customProgramCacheKey = () => 'seats2';
  return m;
}
