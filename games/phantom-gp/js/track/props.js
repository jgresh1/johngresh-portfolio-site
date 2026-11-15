// props.js — trackside structures from the map survey: Armco, catch fences, buildings, grandstands, start gantry.
import * as THREE from 'three';
import { W, groundAt, naturalAt, nearestStation, frameAt, isStand } from './world.js';
import { groundUniforms } from './terrain.js';
import { steelTex, fenceTex, facadeTex, pitFacadeTex, concreteTex, rng32 } from './tex.js';

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
  const roofMat = makeFlatRoofMaterial();
  const wallMats = [0, 1, 2, 3].map((i) => new THREE.MeshStandardMaterial({ map: facadeTex(512, i), roughness: i === 1 ? 0.35 : 0.8, metalness: i === 1 ? 0.25 : 0.0 }));
  wallMats.push(new THREE.MeshStandardMaterial({ map: pitFacadeTex(), roughness: 0.55, metalness: 0.1 }));     // 4: pit buildings (garages below, glass above)
  const concMat = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9, color: 0xb0b0ac });
  const seatMat = makeSeatMaterial();
  const roofs = new Tiles(400, TBuf), walls = [new Tiles(), new Tiles(), new Tiles(), new Tiles(), new Tiles()], conc = new Tiles(), seats = new Tiles(400, TBuf), seatRoof = new Tiles(), standRoof = new Tiles(400, TBuf), tarp = new Tiles();
  const rnd = rng32(77);
  for (const b of W.buildings) {
    const name = b.name || '';
    if (b.area < 14 || b.pts.length < 3) continue;
    let pts = b.pts.map(([x, z]) => new THREE.Vector2(x, z));
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cz = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    if (isStand(b) && grandstand(b)) continue;
    const h = Math.min(Math.max(b.h, 3), 30), yb = b.y0 - 0.6, yt = b.y0 + h;
    const style = /Stand F1|Stand Endurance/i.test(name) ? 4 : (/Salons|Campus|RSR|Hotel|H.tel/i.test(name) ? 1 : (b.area > 600 ? 3 : (rnd() < 0.5 ? 0 : 2)));
    const us = style === 4 ? 24 : 12, vt = style === 4 ? 1 : (yt - yb) / 3.3;
    const Wt = walls[style].at(cx, cz); let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      // footprint is counter-clockwise in (x, z) with z = south, i.e. clockwise seen from above: outward normal = (dz, -dx)
      const p = pts[i], q = pts[(i + 1) % pts.length], L = p.distanceTo(q); if (L < 0.05) continue;
      const nx = (q.y - p.y) / L, nz = -(q.x - p.x) / L;
      Wt.quad([q.x, yb, q.y], [p.x, yb, p.y], [p.x, yt, p.y], [q.x, yt, q.y], [nx, 0, nz], [[(acc + L) / us, 0], [acc / us, 0], [acc / us, vt], [(acc + L) / us, vt]]);
      acc += L;
    }
    const tri = THREE.ShapeUtils.triangulateShape(pts, []), R = roofs.at(cx, cz), base = R.pos.length / 3;
    // one colour per roof, taken from the aerial photo (the photo itself is not drawn on the roof)
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    for (const p of pts) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); bz0 = Math.min(bz0, p.y); bz1 = Math.max(bz1, p.y); }
    const rc = photoSampler(pts)([[bx0, bz0], [bx1, bz0], [bx1, bz1], [bx0, bz1]]);
    for (const p of pts) { R.pos.push(p.x, yt, p.y); R.nor.push(0, 1, 0); R.uv.push(p.x, p.y); R.tint.push(rc[0], rc[1], rc[2], 1); }
    for (const t of tri) R.idx.push(base + t[0], base + t[2], base + t[1]);
  }

  /* A stand is built from its surveyed outline. Every long edge that faces the circuit becomes a run of bays about
     11 m wide (the roof bays in the aerial photo). Each bay starts just above the ground at its own front edge and
     rises at one rake for the whole stand, steep enough to clear the hillside underneath, so a stand on a slope
     steps down the hill bay by bay like the real ones. */
  function grandstand(b) {
    if (!b.stand) return false;
    const open = b.temp || /Silver|RX/i.test(b.name || ''), { P, mods } = b.stand, photo = photoSampler(P);
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
        // seats
        face(S, V(A0, Fk), V(A1, Fk), V(C1, B1), V(C0, B0), [0, 1, 0], [[f0, 0], [f1, 0], [f1, (B1 - Fk) / 0.42], [f0, (B0 - Fk) / 0.42]], seatTint);
        // front wall, with a parapet standing a little above the first row
        wall(C, A0, A1, yb, Fk + 0.55, yb, Fk + 0.55, out); wall(C, A0, A1, Fk, Fk + 0.55, Fk, Fk + 0.55, inw);
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
  roofs.add(group, roofMat); walls.forEach((t, i) => t.add(group, wallMats[i])); conc.add(group, concMat); seats.add(group, seatMat);
  const steelRoof = new THREE.MeshStandardMaterial({ map: steel, color: 0xaeb3b8, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide });
  seatRoof.add(group, steelRoof); standRoof.add(group, makeStandRoofMaterial());
  tarp.add(group, new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));

  /* ---------------- start-light gantry ---------------- */
  {
    const s = W.L - 42, fr = frameAt(s, {}), G = new Buf(), ang = Math.atan2(fr.rz, fr.rx), span = fr.hw + 3.2, top = fr.y + 7.2;
    for (const sd of [-1, 1]) {
      const x = fr.x + fr.rx * span * sd, z = fr.z + fr.rz * span * sd, g = groundAt(x, z);
      G.box(x, (g + top) / 2, z, 0.45, top - g, 0.45, ang);
    }
    G.box(fr.x, top, fr.z, span * 2 + 0.5, 0.7, 0.7, ang);
    G.box(fr.x, top - 1.0, fr.z, span * 2 - 2, 0.12, 0.5, ang);
    for (let k = -2; k <= 2; k++) G.box(fr.x + fr.rx * k * 1.5, top - 0.75, fr.z + fr.rz * k * 1.5, 0.95, 0.55, 0.3, ang);
    group.add(G.mesh(new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.6, roughness: 0.5 })));
  }

  scene.add(group);
  return { group };
}

/* ---------------- grandstand helpers ---------------- */
const SEAT_BLUE = [0.045, 0.10, 0.27, 1];     // seat colour under a roof (the photo only shows the roof there)
const SEAT_DEPTH = 24;                        // m of seating; a deeper outline has a deck or a building behind
// Buf with a per-vertex tint (seat colour, roof sheet colour)
class TBuf extends Buf {
  constructor() { super(); this.tint = []; }
  mesh(mat, o) { const m = super.mesh(mat, o); m.geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 4)); return m; }
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

function makeSeatMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aTint; varying vec4 vTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tNear, tNoise; uniform vec4 uNearRect; varying vec4 vTint;')
      .replace('#include <map_fragment>', /* glsl */`
        // tiers: riser shadow line + individual seat shells; hue follows the survey photo (real seat colours)
        vec3 ph = texture2D( tNear, ( vFogWorld.xz - uNearRect.xy ) * uNearRect.zw ).rgb;
        float row = fract( vUv.y ), seat = fract( vUv.x / 0.52 );
        float shell = smoothstep( 0.06, 0.12, seat ) * ( 1.0 - smoothstep( 0.88, 0.94, seat ) ) * smoothstep( 0.18, 0.26, row ) * ( 1.0 - smoothstep( 0.80, 0.86, row ) );
        float aisle = step( 0.94, fract( vUv.x / 14.0 ) );
        vec3 conc = vec3( 0.30, 0.30, 0.29 );
        vec3 sc = mix( ph * 0.9, vec3( dot( ph, vec3( 0.33 ) ) ), 0.15 );
        // under a roof the photo shows the roof, not the seats: those stands carry their own seat colour
        vec3 sv = texture2D( tNoise, floor( vec2( vUv.x / 0.52, vUv.y ) ) / 64.0 ).rgb;
        sc = mix( sc, vTint.rgb * ( 0.8 + 0.4 * sv.r ), vTint.a );
        diffuseColor.rgb = mix( conc, sc, shell * ( 1.0 - aisle ) ) * ( 0.55 + 0.45 * smoothstep( 0.0, 0.3, row ) );
      `);
  };
  m.customProgramCacheKey = () => 'seats';
  return m;
}
