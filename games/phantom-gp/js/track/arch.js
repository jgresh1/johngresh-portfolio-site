// arch.js — the ordinary buildings round the circuit, modelled. Nothing here is a box with windows painted on it:
// every wall is laid out bay by bay and built with real openings (reveals, glass set back in them, frames, mullions,
// sills), doors with steps and canopies, a plinth, a parapet with its coping or a pitched roof with eaves, verges,
// gutters, downpipes and a chimney, and plant on the flat roofs. What a building is (house, office, shed, glazed
// pavilion, cabin, tower) is read from its surveyed outline, height and name.
import * as THREE from 'three';
import { rng32 } from './tex.js';
import { renderMaps, brickMaps, claddingMaps, slateMaps, panelMaps } from './texq.js';

const UP = [0, 1, 0], DN = [0, -1, 0], U1 = [[0, 0], [1, 0], [1, 1], [0, 1]];
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const PAL = {
  render: [0xdedbd2, 0xd6cfbe, 0xc9c4b7, 0xbfc4c6, 0xd9c8a4, 0xcdb890, 0xb8b1a3, 0xd3cec4, 0xc2a98a, 0xa9b0a6].map(lin),
  brick: [[1, 1, 1], [0.84, 0.8, 0.8], [1.1, 1.02, 0.94], [0.95, 0.9, 0.86]],
  clad: [0xdadddf, 0xb7bdc2, 0x8c949a, 0x69747b, 0xc6cbb8, 0x3a434b, 0xe7e5de, 0x7f8a7a].map(lin),
  panel: [0xf0f0ee, 0xd9dcde, 0x3b4046, 0xc9c4b8, 0xe4e0d6].map(lin),
  frame: [0xeeeeea, 0x2b2f34, 0x2b2f34, 0x5a4636, 0xdcdad2].map(lin),
  shut: [0x33483a, 0x5b6f7c, 0x6b2f2a, 0x4a3a2c, 0x2f4257].map(lin),
  door: [0x2f3a44, 0x6d2a24, 0x2e4a38, 0x3a3d42, 0x7a5a3a, 0x1f4f73].map(lin),
  big: [0xd5d8d9, 0x9aa3a9, 0x2f5d8a, 0x3f6b4c, 0xb4b9bc].map(lin),
  blind: [0xe9e6dc, 0xd8d4c6, 0xc9ced2].map(lin),
  stone: lin(0xb4b0a5), dark: lin(0x25282c), white: lin(0xf0f0ec), ac: lin(0xcfd2d3), zinc: lin(0x7f878d), yellow: lin(0xe2b21c), pot: lin(0x9a4f37),
};
// what is written on a named building (plain words; the survey's own names stay out of it), and how
const LABELS = [
  [/Karting (annex|terrace)/i, null],
  [/Karting/i, 'KARTING', { bg: '#111317', fg: '#ffd21f' }], [/Hotel|H.tel/i, 'HOTEL', { bg: '#12233f', fg: '#ffffff' }],
  [/Salons/i, 'HOSPITALITY', { bg: '#23262b', fg: '#f1efe8' }], [/Fan Shop/i, 'FAN SHOP', { bg: '#b3121a', fg: '#ffffff' }],
  [/Paddock/i, 'PADDOCK', { bg: '#f1f1ee', fg: '#15171a' }], [/Virtex/i, 'SIMULATOR', { bg: '#15171a', fg: '#8fe3ff' }],
  [/Campus/i, 'CAMPUS', { bg: '#0d5c63', fg: '#ffffff' }], [/Conciergerie/i, 'RECEPTION', { bg: '#f1f1ee', fg: '#12233f' }],
];
// tile size in metres of each wall material (u, v)
const SC = { render: [3, 3], brick: [1.32, 1.2], clad: [1.6, 3], panel: [3, 1.5] };

export function makeArch(env) {
  const { Buf, Tiles, face, groundAt, qual, conc, rails, shedRoof, trackDir, signs } = env;
  const lo = !!qual.lo;
  // a buffer whose quads each carry a colour (set `c` before adding to it)
  class CBuf extends Buf {
    constructor() { super(); this.col = []; this.c = [1, 1, 1]; }
    quad(a, b, c, d, n, uv) { super.quad(a, b, c, d, n, uv); for (let k = 0; k < 4; k++) this.col.push(this.c[0], this.c[1], this.c[2]); }
    tri(a, b, c, want, uv) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (nx * want[0] + ny * want[1] + nz * want[2] < 0) { [b, c] = [c, b]; uv = [uv[0], uv[2], uv[1]]; nx = -nx; ny = -ny; nz = -nz; }
      const i = this.pos.length / 3; this.pos.push(...a, ...b, ...c);
      for (let k = 0; k < 3; k++) { this.nor.push(nx, ny, nz); this.col.push(this.c[0], this.c[1], this.c[2]); }
      this.uv.push(...uv[0], ...uv[1], ...uv[2]); this.idx.push(i, i + 1, i + 2);
    }
    mesh(mat, o) { const m = super.mesh(mat, o); m.geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); return m; }
  }
  const T = {}; for (const k of ['render', 'brick', 'clad', 'panel', 'glass', 'paint', 'slate']) T[k] = new Tiles(400, CBuf);
  const stats = { buildings: 0, windows: 0, doors: 0, types: {} };

  // a wall seen from outside: s runs along it from p to q, o is metres out from its face, y is height
  const mk = (p, q) => {
    const L = p.distanceTo(q), tx = (q.x - p.x) / L, tz = (q.y - p.y) / L, nx = tz, nz = -tx;
    return { p, q, L, tx, tz, nx, nz, out: [nx, 0, nz], inw: [-nx, 0, -nz], fw: [tx, 0, tz], bk: [-tx, 0, -tz], ops: [], bays: [],
      P: (s, o, y) => [p.x + tx * s + nx * o, y, p.y + tz * s + nz * o], XZ: (s, o) => [p.x + tx * s + nx * o, p.y + tz * s + nz * o] };
  };
  /* A box in a wall's own frame. Faces: f front, l / r ends, t top, b bottom; `skip` lists the ones to leave out,
     and a K in it adds the back face. m: metres per texture tile (0 = each face takes the whole tile). */
  function wbox(buf, k, s0, s1, y0, y1, o0, o1, skip = '', m = 0) {
    const P = k.P, uv = (a0, a1, b0, b1) => (m ? [[a0 / m, b0 / m], [a1 / m, b0 / m], [a1 / m, b1 / m], [a0 / m, b1 / m]] : U1);
    if (!skip.includes('f')) face(buf, P(s0, o1, y0), P(s1, o1, y0), P(s1, o1, y1), P(s0, o1, y1), k.out, uv(s0, s1, y0, y1));
    if (!skip.includes('l')) face(buf, P(s0, o0, y0), P(s0, o1, y0), P(s0, o1, y1), P(s0, o0, y1), k.bk, uv(o0, o1, y0, y1));
    if (!skip.includes('r')) face(buf, P(s1, o0, y0), P(s1, o1, y0), P(s1, o1, y1), P(s1, o0, y1), k.fw, uv(o0, o1, y0, y1));
    if (!skip.includes('t')) face(buf, P(s0, o0, y1), P(s1, o0, y1), P(s1, o1, y1), P(s0, o1, y1), UP, uv(s0, s1, o0, o1));
    if (!skip.includes('b')) face(buf, P(s0, o0, y0), P(s1, o0, y0), P(s1, o1, y0), P(s0, o1, y0), DN, uv(s0, s1, o0, o1));
    if (skip.includes('K')) face(buf, P(s0, o0, y0), P(s1, o0, y0), P(s1, o0, y1), P(s0, o0, y1), k.inw, uv(s0, s1, y0, y1));
  }
  // tilt the normals of the quad just added (glass: no two panes lie quite flat, so each reflects its own bit of sky)
  function tilt(buf, k, a, b) {
    let x = k.nx + k.tx * a, y = b, z = k.nz + k.tz * a; const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
    const N = buf.nor, i = N.length - 12; for (let q = 0; q < 4; q++) { N[i + q * 3] = x; N[i + q * 3 + 1] = y; N[i + q * 3 + 2] = z; }
  }

  function building(b, pts, info) {
    const n = pts.length, name = b.name || '', rnd = rng32(9000 + info.idx * 7), pick = (a) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
    const cx = pts.reduce((s, p) => s + p.x, 0) / n, cz = pts.reduce((s, p) => s + p.y, 0) / n;
    const lite = lo || info.dist > 170;
    const E = []; let acc = 0;
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; if (p.distanceTo(q) < 0.05) continue; const k = mk(p, q); k.u0 = acc; acc += k.L; E.push(k); }
    const m = E.length; if (m < 3) return null;
    const turn = (a, c) => Math.atan2(a.tx * c.tz - a.tz * c.tx, a.tx * c.tx + a.tz * c.tz);             // > 0: an outside corner
    const ext = (th, o) => (th > 0.15 ? Math.min(o * 1.6, o * Math.tan(th / 2)) : 0);                       // how far a part standing o m proud runs on to close an outside corner
    E.forEach((k, i) => { k.thA = turn(E[(i - 1 + m) % m], k); k.thB = turn(k, E[(i + 1) % m]); const c = k.XZ(k.L / 2, 0), td = trackDir(c[0], c[1]); k.facing = td ? k.nx * td[0] + k.nz * td[1] : 0; });
    const quad = m === 4 && E.every((k) => k.thA > 1.2 && k.thA < 1.95) && Math.min(...E.map((k) => k.L)) > 2.6;

    /* ---- what kind of building ---- */
    let type;
    if (/Salons|Hotel|H.tel|Campus|RSR|Conciergerie|Karting|Virtex|Fan Shop|Paddock/i.test(name)) type = 'modern';
    else if (b.area < 45 && b.h >= 6) type = 'tower';
    else if (b.area < 70 && b.h < 4) type = 'cabin';
    else if ((b.area > 600 && b.h < 10.5) || (b.area > 330 && m <= 6 && b.h >= 5 && b.h <= 9)) type = 'shed';
    else if (m <= 6 && b.area <= 330 && b.h <= 9.5) type = 'house';
    else type = 'office';
    stats.buildings++; stats.types[type] = (stats.types[type] || 0) + 1;
    const pitched = quad && (type === 'house' || type === 'shed'), hotel = /Hotel|H.tel/i.test(name);

    /* ---- levels ---- */
    const yb = b.y0 - 0.6, FL = b.y1 - b.y0 < 1.3 ? b.y1 + 0.12 : b.y0 + 0.3;      // ground-floor level: just above the highest ground, or let into the slope
    let yt = b.y0 + Math.min(Math.max(b.h, 2.6), 30), nS, sh;
    if (type === 'shed') { nS = 1; if (yt - FL < 4.8) yt = FL + 4.8; if (pitched) yt -= Math.min(1.2, (yt - FL) * 0.14); sh = yt - FL; }
    else if (type === 'house' && pitched) { nS = yt - FL > 6.8 ? 2 : 1; sh = 2.75; yt = FL + nS * sh; }
    else if (type === 'tower') { if (yt - FL < 6) yt = FL + 6; nS = Math.max(2, Math.round((yt - FL) / 2.9)); sh = (yt - FL) / nS; }
    else { if (yt - FL < 2.75) yt = FL + 2.75; nS = Math.max(1, Math.round((yt - FL) / 3.1)); sh = (yt - FL) / nS; }

    /* ---- materials ---- */
    const wallKind = { shed: 'clad', modern: rnd() < 0.6 ? 'panel' : 'render', cabin: rnd() < 0.5 ? 'clad' : 'panel', tower: rnd() < 0.5 ? 'clad' : 'render', house: rnd() < 0.3 ? 'brick' : 'render', office: rnd() < 0.35 ? 'brick' : 'render' }[type];
    const wallCol = pick(PAL[wallKind]), [us, vs] = SC[wallKind];
    const WB = () => { const bf = T[wallKind].at(cx, cz); bf.c = wallCol; return bf; };
    const PT = (col) => { const bf = T.paint.at(cx, cz); bf.c = col; return bf; };
    const GL = () => { const bf = T.glass.at(cx, cz), v = 0.8 + rnd() * 0.32; bf.c = [v * 0.92, v * 0.98, v]; return bf; };
    const CC = conc.at(cx, cz), RL = rails.at(cx, cz);
    const frameCol = type === 'modern' || type === 'shed' || type === 'tower' ? PAL.frame[1] : pick(PAL.frame);
    const trimCol = wallKind === 'brick' ? PAL.stone : (rnd() < 0.5 ? PAL.stone : PAL.white);
    const doorCol = pick(PAL.door), shutCol = type === 'house' && !lite && rnd() < 0.45 ? pick(PAL.shut) : null, surround = type === 'house' && rnd() < 0.55;
    const roofEdge = type === 'modern' ? pick([PAL.dark, PAL.white, PAL.zinc]) : pick([PAL.zinc, PAL.dark, PAL.white]);

    /* ---- one window: the hole's reveals, the pane set back in it, a frame with mullions, a sill ---- */
    function win(k, s0, s1, y0, y1, c) {
      const P = k.P, d = c.d, ft = c.ft || 0.055, og = -d, of = -d + 0.045, rv = (a, b2) => [[0, a / vs], [d / us, a / vs], [d / us, b2 / vs], [0, b2 / vs]];
      stats.windows++;
      face(WB(), P(s0, 0, y0), P(s0, og, y0), P(s0, og, y1), P(s0, 0, y1), k.fw, rv(y0, y1));
      face(WB(), P(s1, 0, y0), P(s1, og, y0), P(s1, og, y1), P(s1, 0, y1), k.bk, rv(y0, y1));
      face(WB(), P(s0, 0, y1), P(s1, 0, y1), P(s1, og, y1), P(s0, og, y1), DN, [[s0 / us, 0], [s1 / us, 0], [s1 / us, d / vs], [s0 / us, d / vs]]);
      const gb = GL(); face(gb, P(s0, og, y0), P(s1, og, y0), P(s1, og, y1), P(s0, og, y1), k.out, U1); tilt(gb, k, (rnd() - 0.5) * 0.036, (rnd() - 0.5) * 0.036);
      // frame: two jambs, head and bottom rail, each with its inner return, then the bars
      const fb = () => PT(c.fc || frameCol);
      face(fb(), P(s0, of, y0), P(s0 + ft, of, y0), P(s0 + ft, of, y1), P(s0, of, y1), k.out, U1);
      face(fb(), P(s1 - ft, of, y0), P(s1, of, y0), P(s1, of, y1), P(s1 - ft, of, y1), k.out, U1);
      face(fb(), P(s0 + ft, of, y1 - ft), P(s1 - ft, of, y1 - ft), P(s1 - ft, of, y1), P(s0 + ft, of, y1), k.out, U1);
      face(fb(), P(s0 + ft, of, y0), P(s1 - ft, of, y0), P(s1 - ft, of, y0 + ft), P(s0 + ft, of, y0 + ft), k.out, U1);
      if (!lite) {
        face(fb(), P(s0 + ft, og, y0 + ft), P(s0 + ft, of, y0 + ft), P(s0 + ft, of, y1 - ft), P(s0 + ft, og, y1 - ft), k.fw, U1);
        face(fb(), P(s1 - ft, og, y0 + ft), P(s1 - ft, of, y0 + ft), P(s1 - ft, of, y1 - ft), P(s1 - ft, og, y1 - ft), k.bk, U1);
        face(fb(), P(s0 + ft, og, y1 - ft), P(s1 - ft, og, y1 - ft), P(s1 - ft, of, y1 - ft), P(s0 + ft, of, y1 - ft), DN, U1);
        face(fb(), P(s0 + ft, og, y0 + ft), P(s1 - ft, og, y0 + ft), P(s1 - ft, of, y0 + ft), P(s0 + ft, of, y0 + ft), UP, U1);
      }
      const nm = c.mull || 1;
      for (let q = 1; q < nm; q++) { const sm = s0 + (s1 - s0) * q / nm; wbox(fb(), k, sm - ft * 0.45, sm + ft * 0.45, y0 + ft, y1 - ft, og, of, lite ? 'lrtb' : 'tb'); }
      if (c.trans) { const ty = c.trans > 0 && c.trans < 1 ? y0 + (y1 - y0) * c.trans : c.trans; if (ty > y0 + 0.3 && ty < y1 - 0.2) wbox(fb(), k, s0 + ft, s1 - ft, ty - ft * 0.45, ty + ft * 0.45, og, of, lite ? 'lrtb' : 'lr'); }
      if (c.sill) {
        face(PT(trimCol), P(s0, of, y0), P(s1, of, y0), P(s1, 0, y0), P(s0, 0, y0), UP, U1);
        wbox(PT(trimCol), k, s0 - 0.06, s1 + 0.06, y0 - 0.055, y0, 0, 0.055, lite ? 'b' : '');
      } else face(WB(), P(s0, of, y0), P(s1, of, y0), P(s1, 0, y0), P(s0, 0, y0), UP, [[s0 / us, 0], [s1 / us, 0], [s1 / us, d / vs], [s0 / us, d / vs]]);
      if (!lite && c.blindP && rnd() < c.blindP) { const bh = (y1 - y0 - 2 * ft) * (0.2 + rnd() * 0.6), o2 = og + 0.034; face(PT(pick(PAL.blind)), P(s0 + ft, o2, y1 - ft - bh), P(s1 - ft, o2, y1 - ft - bh), P(s1 - ft, o2, y1 - ft), P(s0 + ft, o2, y1 - ft), k.out, U1); }
      if (c.sur) {          // a stone surround standing a little proud of the wall
        wbox(PT(trimCol), k, s0 - 0.13, s1 + 0.13, y1, y1 + 0.15, 0, 0.025, '');
        wbox(PT(trimCol), k, s0 - 0.13, s0, y0, y1, 0, 0.025, 'tb'); wbox(PT(trimCol), k, s1, s1 + 0.13, y0, y1, 0, 0.025, 'tb');
      }
      if (c.shut) { const w2 = (s1 - s0) / 2; wbox(PT(c.shut), k, s0 - w2 - 0.02, s0 - 0.02, y0, y1, 0.008, 0.045, ''); wbox(PT(c.shut), k, s1 + 0.02, s1 + w2 + 0.02, y0, y1, 0.008, 0.045, ''); }
    }

    /* ---- a door: reveals, frame, a leaf (solid, or rails round a glass panel), a handle, steps up to it, a canopy ---- */
    function door(k, s0, s1, y0, y1, c) {
      const P = k.P, d = c.d, ft = 0.07, og = -d, of = -d + 0.05, lf = og + 0.012, rv = (a, b2) => [[0, a / vs], [d / us, a / vs], [d / us, b2 / vs], [0, b2 / vs]];
      stats.doors++;
      face(WB(), P(s0, 0, y0), P(s0, og, y0), P(s0, og, y1), P(s0, 0, y1), k.fw, rv(y0, y1));
      face(WB(), P(s1, 0, y0), P(s1, og, y0), P(s1, og, y1), P(s1, 0, y1), k.bk, rv(y0, y1));
      face(WB(), P(s0, 0, y1), P(s1, 0, y1), P(s1, og, y1), P(s0, og, y1), DN, [[s0 / us, 0], [s1 / us, 0], [s1 / us, d / vs], [s0 / us, d / vs]]);
      face(CC, P(s0, og, y0), P(s1, og, y0), P(s1, 0, y0), P(s0, 0, y0), UP, [[0, 0], [(s1 - s0) / 4, 0], [(s1 - s0) / 4, d / 4], [0, d / 4]]);
      const fb = () => PT(c.fc || frameCol), lb = () => PT(c.col);
      wbox(fb(), k, s0, s0 + ft, y0, y1, og, of, 'lbt'); wbox(fb(), k, s1 - ft, s1, y0, y1, og, of, 'rbt'); wbox(fb(), k, s0 + ft, s1 - ft, y1 - ft, y1, og, of, 'lrt');
      const a0 = s0 + ft, a1 = s1 - ft, top = y1 - ft, leaves = c.double ? [[a0, (a0 + a1) / 2 - 0.012], [(a0 + a1) / 2 + 0.012, a1]] : [[a0, a1]];
      if (c.double) wbox(PT(PAL.dark), k, (a0 + a1) / 2 - 0.012, (a0 + a1) / 2 + 0.012, y0, top, og, og + 0.004, 'lrtb');
      for (const [l0, l1] of leaves) {
        const Q = (u0, u1, v0, v1, buf) => face(buf, P(u0, lf, v0), P(u1, lf, v0), P(u1, lf, v1), P(u0, lf, v1), k.out, U1);
        if (c.glazed) {
          const st = 0.1, g0 = y0 + (c.kick ?? 0.28), g1 = top - 0.1;
          Q(l0, l1, y0, g0, lb()); Q(l0, l1, g1, top, lb()); Q(l0, l0 + st, g0, g1, lb()); Q(l1 - st, l1, g0, g1, lb());
          const gb = GL(); Q(l0 + st, l1 - st, g0, g1, gb); tilt(gb, k, (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.03);
        } else {
          Q(l0, l1, y0, top, lb());
          if (!lite) for (const [v0, v1] of [[y0 + 0.18, y0 + 0.92], [y0 + 1.06, top - 0.16]]) wbox(lb(), k, l0 + 0.13, l1 - 0.13, v0, v1, lf, lf + 0.012, '');      // two raised panels
        }
        if (!lite) { const hs = c.double ? (l0 === a0 ? l1 - 0.1 : l0 + 0.06) : l1 - 0.12; wbox(RL, k, hs, hs + 0.04, y0 + 0.95, y0 + 1.2, lf, lf + 0.055, ''); }
      }
      // steps: from the threshold down to the ground outside
      const gx = k.XZ((s0 + s1) / 2, 0.9), g = groundAt(gx[0], gx[1]), dh = y0 - g;
      if (dh > 0.05 && !c.nosteps) {
        const ns = Math.min(5, Math.ceil(dh / 0.18)), r = dh / ns;
        for (let i = 0; i < ns; i++) wbox(CC, k, s0 - 0.35, s1 + 0.35, g - 0.4, y0 - i * r, 0, 0.9 + i * 0.3, '', 4);
      }
      if (c.canopy) {
        const yc = y1 + 0.22, w0 = s0 - 0.45, w1 = s1 + 0.45, pr = c.canopy;
        wbox(PT(roofEdge), k, w0, w1, yc, yc + 0.11, 0, pr, '');
        if (!lite) for (const sx of [w0 + 0.12, w1 - 0.12]) { const a = P(sx, pr - 0.15, yc + 0.11), e = P(sx, 0.02, yc + 0.75); env.beam(RL, a, e, 0.03, 0.03); }       // tie rods back to the wall
        if (!lite) wbox(PT(PAL.white), k, (s0 + s1) / 2 - 0.25, (s0 + s1) / 2 + 0.25, yc - 0.035, yc, 0.25, 0.45, 't');                                                // a light under it
      }
    }

    /* ---- a sectional goods door: ribbed panels in guides, a row of small lights, bollards at the jambs ---- */
    function bigDoor(k, s0, s1, y0, y1) {
      const P = k.P, d = 0.16, og = -d, col = pick(PAL.big), np = Math.max(4, Math.round((y1 - y0) / 0.62)), ph = (y1 - y0) / np;
      stats.doors++;
      face(WB(), P(s0, 0, y0), P(s0, og, y0), P(s0, og, y1), P(s0, 0, y1), k.fw, U1); face(WB(), P(s1, 0, y0), P(s1, og, y0), P(s1, og, y1), P(s1, 0, y1), k.bk, U1);
      face(WB(), P(s0, 0, y1), P(s1, 0, y1), P(s1, og, y1), P(s0, og, y1), DN, U1);
      face(CC, P(s0, og, y0), P(s1, og, y0), P(s1, 0.5, y0), P(s0, 0.5, y0), UP, [[0, 0], [(s1 - s0) / 4, 0], [(s1 - s0) / 4, 0.2], [0, 0.2]]);
      face(PT(PAL.dark), P(s0, og - 0.03, y0), P(s1, og - 0.03, y0), P(s1, og - 0.03, y1), P(s0, og - 0.03, y1), k.out, U1);
      for (let i = 0; i < np; i++) {
        const v0 = y0 + i * ph + 0.012, v1 = y0 + (i + 1) * ph - 0.012;
        if (i === np - 2 && !lite) {      // the panel with the lights in it
          const nw = Math.max(2, Math.round((s1 - s0) / 1.1)), cw = (s1 - s0 - 0.16) / nw;
          for (let j = 0; j <= nw; j++) { const a = j === 0 ? s0 + 0.03 : s0 + 0.08 + j * cw - 0.09, e = j === nw ? s1 - 0.03 : s0 + 0.08 + j * cw + 0.09; wbox(PT(col), k, a, e, v0, v1, og - 0.03, og, 'lr'); }
          for (let j = 0; j < nw; j++) { const gb = GL(); face(gb, P(s0 + 0.08 + j * cw + 0.09, og - 0.012, v0 + 0.07), P(s0 + 0.08 + (j + 1) * cw - 0.09, og - 0.012, v0 + 0.07), P(s0 + 0.08 + (j + 1) * cw - 0.09, og - 0.012, v1 - 0.07), P(s0 + 0.08 + j * cw + 0.09, og - 0.012, v1 - 0.07), k.out, U1); }
          wbox(PT(col), k, s0 + 0.03, s1 - 0.03, v0, v0 + 0.07, og - 0.03, og, 'lrb'); wbox(PT(col), k, s0 + 0.03, s1 - 0.03, v1 - 0.07, v1, og - 0.03, og, 'lrt');
        } else wbox(PT(col), k, s0 + 0.03, s1 - 0.03, v0, v1, og - 0.03, og, 'lr');
      }
      wbox(PT(PAL.zinc), k, s0, s0 + 0.07, y0, y1, og, og + 0.05, 'lb'); wbox(PT(PAL.zinc), k, s1 - 0.07, s1, y0, y1, og, og + 0.05, 'rb');       // guides
      if (!lite) for (const sx of [s0 - 0.28, s1 + 0.28]) { wbox(PT(PAL.yellow), k, sx - 0.07, sx + 0.07, y0 - 0.3, y0 + 1.0, 0.45, 0.59, 'bK'); wbox(PT(PAL.dark), k, sx - 0.072, sx + 0.072, y0 + 0.62, y0 + 0.78, 0.448, 0.592, 'tbK'); }
      if (!lite) wbox(PT(PAL.white), k, (s0 + s1) / 2 - 0.3, (s0 + s1) / 2 + 0.3, y1 + 0.35, y1 + 0.47, 0, 0.16, '');      // a floodlight over the door
    }

    /* ---- lay out every wall: bays, then what stands in each bay on each floor ---- */
    const tp = {
      office: { bw: 2.9, ww: 1.55, sill: 0.95, wh: 1.5, d: 0.16, mull: 2, trans: 0.72, blindP: 0.3 },
      house: { bw: 3.3, ww: 1.1, sill: 0.9, wh: 1.32, d: 0.2, mull: 2, blindP: 0.15 },
      modern: { bw: 3.0, sill: 0.22, wh: sh - 0.77, d: 0.12, mull: 2, blindP: 0.2 },
      cabin: { bw: 3.0, ww: 1.2, sill: 1.0, wh: 1.05, d: 0.08, mull: 2, blindP: 0.2 },
      shed: { bw: 6, ww: 3.4, sill: sh - 1.75, wh: 0.95, d: 0.1, mull: 3 },
      tower: { bw: 3.2, ww: 0.75, sill: 1.0, wh: 1.0, d: 0.14, mull: 1 },
    }[type];
    tp.wh = Math.min(tp.wh, sh - tp.sill - 0.32);
    const mg = type === 'modern' ? 0.12 : 0.55, glazedAll = type === 'modern';
    for (const k of E) {
      if (glazedAll) { if (k.L >= 1.1) { const nB = Math.max(1, Math.round(k.L / tp.bw)), w = k.L / nB; for (let j = 0; j < nB; j++) k.bays.push([j * w + 0.12, (j + 1) * w - 0.12]); } }
      else { const Lu = k.L - 2 * mg; if (Lu >= Math.min(tp.ww, 1.0) + 0.3) { const nB = Math.max(1, Math.floor(Lu / tp.bw)), w = Lu / nB, ww = Math.min(tp.ww, w - 0.45); for (let j = 0; j < nB; j++) { const c = mg + (j + 0.5) * w; k.bays.push([c - ww / 2, c + ww / 2]); } } }
      k.g = k.bays.map(([a, e]) => { const c = k.XZ((a + e) / 2, 0.5); return groundAt(c[0], c[1]); });
    }
    const order = E.filter((k) => k.bays.length).sort((a, c) => c.L * (0.3 + Math.max(0, c.facing)) - a.L * (0.3 + Math.max(0, a.facing)));
    const doorH = 2.15, doorOK = (k, j) => Math.abs(k.g[j] - FL) <= 0.6;
    const cabTop = type === 'tower' ? FL + (nS - 1) * sh : 0;
    // entrance: the middle bay of the wall that faces the circuit, or the nearest bay to it that meets the ground
    let entry = null;
    for (const k of order) { const nb = k.bays.length, mid = Math.floor(nb / 2); for (let dj = 0; dj < nb && !entry; dj++) for (const j of [mid + dj, mid - dj]) if (j >= 0 && j < nb && doorOK(k, j)) { entry = [k, j]; break; } if (entry) break; }
    // a block of three floors or more has a fire escape on the wall that faces away from the circuit: a door on
    // every upper floor at its last bay
    let esc = null;
    if (type === 'office' && nS >= 3 && !lite) {
      const cand = E.filter((k) => k.bays.length >= 2 && k.L >= 8).sort((a, c) => a.facing - c.facing)[0];
      if (cand) { const j = cand.bays.length - 1; if (Math.abs(cand.g[j] - FL) < 0.9 && !(entry && entry[0] === cand && entry[1] === j)) esc = [cand, j]; }
    }
    for (const k of E) {
      const nb = k.bays.length;
      for (let j = 0; j < nb; j++) {
        const [a, e] = k.bays[j], c = (a + e) / 2, g = k.g[j], isEntry = entry && entry[0] === k && entry[1] === j;
        for (let f = 0; f < nS; f++) {
          const F = FL + f * sh; let y0 = F + tp.sill, y1 = y0 + tp.wh;
          if (type === 'shed') {
            const front = k === order[0], big = front && (nb < 3 ? j === Math.floor(nb / 2) : j % 2 === 1) && doorOK(k, j), dh = Math.min(4.1, sh - 1.0);
            if (big) k.ops.push({ kind: 'big', s0: c - 2.1, s1: c + 2.1, y0: FL, y1: FL + dh });
            else if (isEntry || (front && j === 0 && doorOK(k, j))) k.ops.push({ kind: 'door', s0: c - 0.52, s1: c + 0.52, y0: FL, y1: FL + doorH, cfg: { d: 0.12, col: doorCol, canopy: 0.8 } });
            if (j % 3 !== 2 && y0 > FL + (big ? dh : doorH) + 0.5) k.ops.push({ kind: 'win', s0: a, s1: e, y0, y1, cfg: { d: tp.d, mull: 3 } });
            continue;
          }
          if (type === 'tower') {
            if (f === nS - 1) continue;                                   // the cabin's glazing is added whole, below
            if (f === 0 && isEntry) { k.ops.push({ kind: 'door', s0: c - 0.48, s1: c + 0.48, y0: FL, y1: FL + doorH, cfg: { d: 0.12, col: doorCol } }); continue; }
            if (k === order[0] && (f > 0 || g < y0 - 0.2)) k.ops.push({ kind: 'win', s0: a, s1: e, y0, y1, cfg: { d: tp.d, mull: 1, sill: true } });
            continue;
          }
          if (esc && esc[0] === k && esc[1] === j && f >= 1) { k.ops.push({ kind: 'door', s0: c - 0.46, s1: c + 0.46, y0: F, y1: F + 2.08, cfg: { d: tp.d + 0.02, col: doorCol, nosteps: true } }); continue; }
          if (f === 0 && isEntry) {
            if (glazedAll) k.ops.push({ kind: 'win', s0: a, s1: e, y0: FL + 0.02, y1, cfg: { d: tp.d, mull: 2, trans: FL + doorH, entrance: true } });
            else { const dw = type === 'office' ? 0.9 : 0.5, hw = Math.min(dw, (k.bays[j][1] - k.bays[j][0]) / 2 + 0.2); k.ops.push({ kind: 'door', s0: c - hw, s1: c + hw, y0: FL, y1: FL + doorH, cfg: { d: tp.d + 0.04, col: doorCol, double: hw > 0.7, glazed: type === 'office' || rnd() < 0.3, canopy: type === 'cabin' ? 0 : (type === 'office' ? 1.3 : 0.7) } }); }
            continue;
          }
          if (f === 0 && g > y0 - 0.2) {                                  // the ground stands above this sill: a shallow high window, or nothing
            if (g < F + sh - 1.1 && sh > 2.6) k.ops.push({ kind: 'win', s0: a, s1: e, y0: Math.max(y0, y1 - 0.75, g + 0.25), y1, cfg: { d: tp.d, mull: glazedAll ? 2 : tp.mull, sill: !glazedAll } });
            continue;
          }
          k.ops.push({ kind: 'win', s0: a, s1: e, y0, y1, cfg: { d: tp.d, mull: glazedAll ? Math.max(1, Math.round((e - a) / 1.45)) : (e - a > 1.25 ? tp.mull : 1), trans: tp.trans, sill: !glazedAll, blindP: tp.blindP, shut: f < 2 && e - a < 1.3 && Math.min(a, k.L - e, nb > 1 ? (k.bays[1][0] - k.bays[0][1]) / 2 : 1e9) > (e - a) / 2 + 0.08 ? shutCol : null, sur: surround } });
        }
      }
      if (type === 'tower' && k.L > 1.3) k.ops.push({ kind: 'win', s0: 0.16, s1: k.L - 0.16, y0: cabTop + 0.95, y1: yt - 0.3, cfg: { d: 0.07, mull: Math.max(1, Math.round(k.L / 1.25)) } });
    }

    /* ---- the walls themselves: a grid of quads with the openings left out (every wall of the building shares
       the same level lines, and each wall the same uprights, so no vertex ever lands in the middle of an edge) ---- */
    const par = type === 'office' ? 0.5 : 0, yTop = yt + par, plinth = type === 'shed' ? FL + 0.9 : (type === 'house' || type === 'office' ? FL + 0.32 : 0);
    const ys = [yb, yTop, FL]; for (let f = 1; f < nS; f++) ys.push(FL + f * sh);
    if (plinth) ys.push(plinth); if (par) ys.push(yt); if (type === 'tower') ys.push(cabTop);
    for (const k of E) for (const o of k.ops) ys.push(o.y0, o.y1);
    ys.sort((a, c) => a - c); const Y = ys.filter((v, i) => i === 0 || v - ys[i - 1] > 1e-3);
    for (const k of E) {
      const ss = [0, k.L]; for (const o of k.ops) ss.push(o.s0, o.s1);
      ss.sort((a, c) => a - c); const S = ss.filter((v, i) => i === 0 || v - ss[i - 1] > 1e-3);
      for (let j = 0; j < Y.length - 1; j++) {
        const y0 = Y[j], y1 = Y[j + 1], ym = (y0 + y1) / 2; if (plinth && ym < plinth) continue;
        let run = null;
        const damp = y1 <= FL + 0.45 ? 0.9 : 1;
        const flush = () => { if (run) { const wb = WB(); if (damp < 1) wb.c = [wallCol[0] * damp, wallCol[1] * damp * 0.99, wallCol[2] * damp * 0.97]; face(wb, k.P(run[0], 0, y0), k.P(run[1], 0, y0), k.P(run[1], 0, y1), k.P(run[0], 0, y1), k.out, [[(k.u0 + run[0]) / us, y0 / vs], [(k.u0 + run[1]) / us, y0 / vs], [(k.u0 + run[1]) / us, y1 / vs], [(k.u0 + run[0]) / us, y1 / vs]]); run = null; } };
        for (let i = 0; i < S.length - 1; i++) {
          const s0 = S[i], s1 = S[i + 1], sm = (s0 + s1) / 2;
          if (k.ops.some((o) => sm > o.s0 && sm < o.s1 && ym > o.y0 && ym < o.y1)) { flush(); continue; }
          if (run && lite) run[1] = s1; else { flush(); run = [s0, s1]; }
        }
        flush();
      }
      for (const o of k.ops) {
        if (o.kind === 'win') {
          win(k, o.s0, o.s1, o.y0, o.y1, o.cfg);
          if (o.cfg.entrance) {          // a glazed entrance: pull bars on the two leaves, a canopy over them
            const c = (o.s0 + o.s1) / 2; if (!lite) for (const sx of [c - 0.2, c + 0.16]) wbox(RL, k, sx, sx + 0.04, FL + 0.8, FL + 1.5, -o.cfg.d + 0.045, -o.cfg.d + 0.1, '');
            wbox(PT(roofEdge), k, o.s0 - 0.3, o.s1 + 0.3, FL + doorH + 0.25, FL + doorH + 0.37, 0, 1.5, '');
          }
        } else if (o.kind === 'door') door(k, o.s0, o.s1, o.y0, o.y1, o.cfg);
        else bigDoor(k, o.s0, o.s1, o.y0, o.y1);
      }
      // offices: a string course at every floor line and under the parapet
      if (type === 'office' && !lite) for (let f = 1; f <= nS; f++) { const y = FL + f * sh; wbox(PT(trimCol), k, -ext(k.thA, 0.045), k.L + ext(k.thB, 0.045), y - 0.06, y + 0.06, 0, 0.045, ''); }
      // a hotel: every upper-floor bay opens on to a balcony (a slab, a glass balustrade under a steel rail)
      if (hotel && !lite && k.facing > -0.2) for (let f = 1; f < nS; f++) for (const [a, e] of k.bays) {
        const F = FL + f * sh, b0 = a - 0.1, b1 = e + 0.1, dp = 1.25;
        wbox(PT(PAL.stone), k, b0, b1, F - 0.15, F + 0.02, 0, dp, '');
        const gb = GL(); face(gb, k.P(b0 + 0.04, dp - 0.04, F + 0.1), k.P(b1 - 0.04, dp - 0.04, F + 0.1), k.P(b1 - 0.04, dp - 0.04, F + 1.02), k.P(b0 + 0.04, dp - 0.04, F + 1.02), k.out, U1);
        wbox(RL, k, b0, b1, F + 1.02, F + 1.07, dp - 0.07, dp - 0.01, '');
        for (const sx of [b0, b1 - 0.04]) { wbox(RL, k, sx, sx + 0.04, F + 0.02, F + 1.02, dp - 0.06, dp - 0.02, 'tb'); wbox(RL, k, sx, sx + 0.04, F + 1.02, F + 1.07, 0, dp - 0.07, 'f'); }
      }
      // plinth: concrete, standing 35 mm proud, broken where a door comes down through it
      if (plinth) {
        const cuts = k.ops.filter((o) => o.y0 < plinth - 0.01).sort((a, c) => a.s0 - c.s0); let s = -0.035;
        for (const o of [...cuts, { s0: k.L + 0.035 }]) { if (o.s0 - s > 0.05) wbox(CC, k, s, o.s0, yb, plinth, 0, 0.035, 'b', 4); s = o.s1; }
      }
      // what finishes the top of the wall
      if (par) {
        face(WB(), k.P(0, -0.3, yt), k.P(k.L, -0.3, yt), k.P(k.L, -0.3, yTop), k.P(0, -0.3, yTop), k.inw, [[0, 0], [k.L / us, 0], [k.L / us, par / vs], [0, par / vs]]);
        wbox(PT(roofEdge), k, -0.045, k.L + 0.045, yTop, yTop + 0.05, -0.345, 0.045, 'lrK');
      } else if (type === 'modern') {
        wbox(PT(roofEdge), k, -ext(k.thA, 0.6), k.L + ext(k.thB, 0.6), yt - 0.12, yt + 0.42, -0.06, 0.6, 'K');
      } else if (!pitched) {
        const o1 = type === 'tower' ? 0.55 : 0.32; wbox(PT(roofEdge), k, -ext(k.thA, o1), k.L + ext(k.thB, o1), yt - 0.02, yt + 0.15, -0.06, o1, 'K');
        if (type !== 'tower' && type !== 'cabin' && !lite) wbox(PT(PAL.zinc), k, -ext(k.thA, o1 + 0.1), k.L + ext(k.thB, o1 + 0.1), yt - 0.1, yt - 0.01, o1, o1 + 0.1, '');       // gutter on the eaves
      }
      // downpipes: one near the start of every wall long enough to want one, with a hopper at its head
      if (!lite && type !== 'modern' && type !== 'cabin' && type !== 'tower' && !pitched && k.L > 5.5) {
        const sx = 0.22, gp = k.XZ(sx, 0.2), g = groundAt(gp[0], gp[1]), col = rnd() < 0.5 ? PAL.zinc : PAL.dark, yh = par ? yt - 0.1 : yt - 0.12;
        wbox(PT(col), k, sx - 0.045, sx + 0.045, g - 0.2, yh, 0.02, 0.11, 'bt'); wbox(PT(col), k, sx - 0.1, sx + 0.1, yh, yh + 0.22, 0, 0.16, 'b');
      }
    }

    /* ---- the fire escape: a steel landing at every upper floor, a straight flight outboard of it down to the
       landing below (the last one to the ground), stringers, treads, handrails, four posts ---- */
    if (esc) {
      const [k, j] = esc, [a, e] = k.bays[j], c = (a + e) / 2, s0 = Math.max(0.15, c - 2.0), s1 = Math.min(k.L - 0.05, c + 1.3), W1 = 1.05, W2 = 1.95, pl = 0.5;
      const gp = k.XZ(s0 + 0.2, W2 - 0.4), g = groundAt(gp[0], gp[1]), run = s1 - s0 - 2 * pl, top = FL + (nS - 1) * sh;
      for (let f = 1; f < nS; f++) {
        const F = FL + f * sh, lowY = f === 1 ? g : F - sh, nt = Math.max(8, Math.round((F - lowY) / 0.185));
        wbox(RL, k, s0, s1, F - 0.05, F, 0.02, W1, '');                                                       // landing
        wbox(RL, k, s1 - pl, s1, F - 0.05, F, W1, W2, 'l'); if (f > 1) wbox(RL, k, s0, s0 + pl, F - sh - 0.05, F - sh, W1, W2, 'r');      // the head and foot of the flight
        for (let t = 0; t < nt; t++) { const y = F - (F - lowY) * (t + 1) / nt, sx = s1 - pl - run * (t + 0.5) / nt, hw = run / nt / 2 + 0.015; wbox(RL, k, sx - hw, sx + hw, y - 0.03, y, W1 + 0.04, W2 - 0.04, ''); }
        for (const o of [W1 + 0.02, W2 - 0.02]) env.beam(RL, k.P(s1 - pl, o, F - 0.13), k.P(s0 + pl, o, lowY - 0.13), 0.04, 0.2);
        for (const o of [W1 + 0.02, W2 - 0.02]) env.beam(RL, k.P(s1 - pl, o, F + 0.95), k.P(s0 + pl, o, lowY + 0.95), 0.04, 0.04);
        for (const sx of [s0 + 0.02, s1 - 0.02]) for (const y of [F + 1.0, F + 0.5]) env.beam(RL, k.P(sx, 0.04, y), k.P(sx, W2 - 0.02, y), 0.035, 0.035);     // guard rails across the landing's ends
        wbox(RL, k, s1 - pl, s1, F + 0.98, F + 1.02, W2 - 0.04, W2, ''); wbox(RL, k, s0 + pl + 0.3, s1 - pl - 0.9, F + 0.98, F + 1.02, W1 - 0.04, W1, '');
      }
      for (const sx of [s0 + 0.03, s1 - 0.03]) wbox(RL, k, sx - 0.035, sx + 0.035, g - 0.3, top + 1.02, W2 - 0.07, W2, 'b');
      for (const sx of [s0 + 0.03, s1 - 0.03]) wbox(RL, k, sx - 0.035, sx + 0.035, g - 0.3, top + 1.02, W1 - 0.07, W1, 'b');
    }

    /* ---- the name of a named building, on the fascia of a single-storey one or in the band over the ground
       floor's glazing, above the entrance ---- */
    const lab = signs ? LABELS.find((l) => l[0].test(name)) : null;
    if (lab && lab[1]) {
      const k = entry ? entry[0] : order[0];
      if (k && k.L > 2.2) {
        const cl = signs.cell(lab[1], { h: 96, pad: 0.55, ...lab[2] }), onF = nS === 1 && type === 'modern';
        let hS = onF ? 0.44 : 0.4, w = hS * cl.aspect; if (w > k.L - 0.8) { w = k.L - 0.8; hS = w / cl.aspect; }
        const bc = entry ? (k.bays[entry[1]][0] + k.bays[entry[1]][1]) / 2 : k.L / 2, sc = Math.min(k.L - 0.4 - w / 2, Math.max(0.4 + w / 2, bc));
        const yc = onF ? yt + 0.15 : FL + sh - 0.32, off = onF ? 0.612 : 0.05;
        if (!onF) wbox(PT(PAL.dark), k, sc - w / 2 - 0.03, sc + w / 2 + 0.03, yc - hS / 2 - 0.03, yc + hS / 2 + 0.03, 0, 0.045, '');      // its casing
        signs.board(k.XZ(sc - w / 2, 0), k.XZ(sc + w / 2, 0), yc - hS / 2, yc + hS / 2, k.out, off, cl);
      }
    }

    /* ---- a tower's cabin stands on a slab with a railed walkway round it, and carries a mast ---- */
    if (type === 'tower') {
      for (const k of E) {
        const eA = ext(k.thA, 0.75), eB = ext(k.thB, 0.75), rA = ext(k.thA, 0.68), rB = ext(k.thB, 0.68);
        wbox(PT(PAL.stone), k, -eA, k.L + eB, cabTop - 0.16, cabTop, 0, 0.75, '');
        wbox(RL, k, -rA, k.L + rB, cabTop + 1.02, cabTop + 1.07, 0.66, 0.70, ''); wbox(RL, k, -rA, k.L + rB, cabTop + 0.52, cabTop + 0.55, 0.67, 0.69, '');
        const np = Math.max(2, Math.round((k.L + rA + rB) / 1.3)); for (let q = 0; q <= np; q++) { const sx = -rA + (k.L + rA + rB) * q / np; wbox(RL, k, sx - 0.02, sx + 0.02, cabTop, cabTop + 1.02, 0.66, 0.70, 'tb'); }
      }
      if (!lite) { RL.box(cx, yt + 2.0, cz, 0.07, 3.7, 0.07, 0); RL.box(cx, yt + 3.2, cz, 0.9, 0.04, 0.04, E[0] ? Math.atan2(E[0].tz, E[0].tx) : 0); RL.box(cx, yt + 2.6, cz, 0.6, 0.04, 0.04, E[0] ? Math.atan2(E[0].tz, E[0].tx) + 1.57 : 0); }
    }

    /* ---- pitched roof on a four-sided building: two planes with eaves and verges, gables, gutters, a chimney ---- */
    if (pitched) {
      const r = E[0].L + E[2].L >= E[1].L + E[3].L ? 0 : 1, eA = E[r], gB = E[r + 1], eC = E[r + 2], gD = E[(r + 3) % 4];      // eaves walls eA, eC; gable walls gB, gD
      const wid = (gB.L + gD.L) / 2, shed = type === 'shed', rise = shed ? Math.min(2.4, wid / 2 * 0.16) : Math.min(4.4, wid / 2 * Math.tan((36 + rnd() * 9) * Math.PI / 180));
      const yr = yt + rise, oh = shed ? 0.3 : 0.42, ov = shed ? 0.2 : 0.28, tk = shed ? 0.1 : 0.14, sl = rise / (wid / 2), slopeLen = Math.hypot(wid / 2, rise);
      const R0 = [(gD.p.x + gD.q.x) / 2, (gD.p.y + gD.q.y) / 2], R1 = [(gB.p.x + gB.q.x) / 2, (gB.p.y + gB.q.y) / 2];             // ridge ends, over the gables
      const ul = Math.hypot(R1[0] - R0[0], R1[1] - R0[1]) || 1, ux = (R1[0] - R0[0]) / ul, uz = (R1[1] - R0[1]) / ul;
      const r0 = [R0[0] - ux * ov, yr, R0[1] - uz * ov], r1 = [R1[0] + ux * ov, yr, R1[1] + uz * ov], vg0 = [-ux, 0, -uz], vg1 = [ux, 0, uz];
      const slate = () => { const bf = T.slate.at(cx, cz); bf.c = shed ? [1, 1, 1] : pick([[1, 1, 1], [0.86, 0.87, 0.9], [1.25, 1.02, 0.86], [1.1, 1.1, 1.1]]); return bf; };
      const sCol = shed ? null : slate().c, tint = info.roofTint ? [...info.roofTint, 1e4] : [0.3, 0.32, 0.34, 1e4];
      for (const k of [eA, eC]) {
        // this wall runs from the ridge's start end to its far end, or the other way
        const fwd = k.tx * ux + k.tz * uz > 0, ye = yt - oh * sl, dy = [0, -tk, 0];
        const a = k.P(fwd ? -ov : k.L + ov, oh, ye), e = k.P(fwd ? k.L + ov : -ov, oh, ye), len = ul + 2 * ov, sub = (p) => [p[0], p[1] - tk, p[2]];
        const nrm = [k.nx * sl, 1, k.nz * sl];
        if (shed) face(shedRoof.at(cx, cz), a, e, r1, r0, nrm, [[5, 0], [5 + len, 0], [5 + len, slopeLen + oh], [5, slopeLen + oh]], tint);
        else { const bf = slate(); bf.c = sCol; face(bf, a, e, r1, r0, nrm, [[0, 0], [len / 1.2, 0], [len / 1.2, (slopeLen + oh) / 1.2], [0, (slopeLen + oh) / 1.2]]); }
        face(PT(PAL.white), sub(a), sub(e), sub(r1), sub(r0), [-nrm[0], -1, -nrm[2]], U1);                              // soffit
        face(PT(roofEdge), sub(a), sub(e), e, a, k.out, U1);                                                            // fascia
        face(PT(roofEdge), sub(a), sub(r0), r0, a, vg0, U1); face(PT(roofEdge), sub(e), sub(r1), r1, e, vg1, U1);       // bargeboards
        if (!lite) {
          wbox(PT(PAL.zinc), k, -ov, k.L + ov, ye - tk - 0.07, ye - tk + 0.03, oh, oh + 0.11, '');                      // gutter
          const sx = fwd ? 0.25 : k.L - 0.25, gp = k.XZ(sx, 0.2), g = groundAt(gp[0], gp[1]);
          wbox(PT(PAL.zinc), k, sx - 0.04, sx + 0.04, g - 0.2, ye - tk - 0.07, 0.02, 0.1, 'bt'); wbox(PT(PAL.zinc), k, sx - 0.04, sx + 0.04, ye - tk - 0.15, ye - tk - 0.07, 0.1, oh + 0.06, 'b');
        }
      }
      for (const [k, Rr] of [[gB, R1], [gD, R0]]) {          // gables
        const sm = (Rr[0] - k.p.x) * k.tx + (Rr[1] - k.p.y) * k.tz;
        T[wallKind].at(cx, cz).c = wallCol;
        T[wallKind].at(cx, cz).tri(k.P(0, 0, yt), k.P(k.L, 0, yt), [Rr[0], yr, Rr[1]], k.out, [[k.u0 / us, yt / vs], [(k.u0 + k.L) / us, yt / vs], [(k.u0 + sm) / us, yr / vs]]);
      }
      if (!shed) {
        // ridge tiles, and a chimney through the ridge near one end
        const rb = PT(PAL.dark); face(rb, [r0[0] - uz * 0.11, yr - 0.03, r0[2] + ux * 0.11], [r1[0] - uz * 0.11, yr - 0.03, r1[2] + ux * 0.11], [r1[0], yr + 0.06, r1[2]], [r0[0], yr + 0.06, r0[2]], [-uz, 1, ux], U1);
        face(PT(PAL.dark), [r0[0] + uz * 0.11, yr - 0.03, r0[2] - ux * 0.11], [r1[0] + uz * 0.11, yr - 0.03, r1[2] - ux * 0.11], [r1[0], yr + 0.06, r1[2]], [r0[0], yr + 0.06, r0[2]], [uz, 1, -ux], U1);
        if (rnd() < 0.8) {
          const t = 0.18 + rnd() * 0.12, px = R0[0] + (R1[0] - R0[0]) * t, pz = R0[1] + (R1[1] - R0[1]) * t, ang = Math.atan2(uz, ux), ch = T[wallKind === 'brick' ? 'brick' : 'render'].at(cx, cz);
          ch.c = wallKind === 'brick' ? wallCol : PAL.render[2]; ch.box(px, yr + 0.15, pz, 0.85, 1.9, 0.5, ang);
          PT(PAL.stone).box(px, yr + 1.14, pz, 0.97, 0.08, 0.62, ang);
          if (!lite) for (const dd of [-0.2, 0.2]) PT(PAL.pot).box(px + ux * dd, yr + 1.33, pz + uz * dd, 0.2, 0.3, 0.2, ang);
          if (!lite && rnd() < 0.6) {          // a television aerial strapped to it
            const ax = px - ux * 0.36, az = pz - uz * 0.36, a2 = ang + 0.5 + rnd();
            RL.box(ax, yr + 1.9, az, 0.03, 2.0, 0.03, ang);
            for (const [yy, ln] of [[2.85, 0.9], [2.65, 0.7], [2.45, 0.7], [2.25, 0.55]]) RL.box(ax, yr + yy, az, ln, 0.02, 0.02, a2);
            RL.box(ax, yr + 2.55, az, 0.02, 0.02, 0.75, a2);
          }
        }
      }
      return { flatY: null, type };
    }

    /* ---- flat roof: its level, and the plant standing on it ---- */
    const flatY = type === 'modern' ? yt + 0.05 : (par ? yt : yt + 0.13);
    if (!lite && b.area >= 90) {
      const inside = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const a = pts[i], d = pts[j]; if ((a.y > z) !== (d.y > z) && x < (d.x - a.x) * (z - a.y) / (d.y - a.y) + a.x) c = !c; } return c; };
      const edgeD = (x, z) => { let d = 1e9; for (const k of E) { const s = Math.max(0, Math.min(k.L, (x - k.p.x) * k.tx + (z - k.p.y) * k.tz)); d = Math.min(d, Math.hypot(x - k.p.x - k.tx * s, z - k.p.y - k.tz * s)); } return d; };
      let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9; for (const p of pts) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); bz0 = Math.min(bz0, p.y); bz1 = Math.max(bz1, p.y); }
      const spot = (clear) => { for (let t = 0; t < 30; t++) { const x = bx0 + rnd() * (bx1 - bx0), z = bz0 + rnd() * (bz1 - bz0); if (inside(x, z) && edgeD(x, z) > clear && !placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < clear + 1.2)) { placed.push([x, z]); return [x, z]; } } return null; };
      const placed = [], ang = Math.atan2(order[0] ? order[0].tz : 0, order[0] ? order[0].tx : 1);
      if (b.area >= 420) {                                                   // the head of the stairs: a small housing with a door
        const s = spot(3.2);
        if (s) { const bf = T[wallKind].at(cx, cz); bf.c = wallCol; bf.box(s[0], flatY + 1.2, s[1], 3.4, 2.4, 2.6, ang); PT(roofEdge).box(s[0], flatY + 2.46, s[1], 3.8, 0.12, 3.0, ang);
          const c = Math.cos(ang), sn = Math.sin(ang); PT(doorCol).box(s[0] + sn * -1.31, flatY + 1.02, s[1] + c * 1.31, 0.9, 2.0, 0.04, ang); }
      }
      const nAC = Math.min(7, Math.round(b.area / 170));
      for (let i = 0; i < nAC; i++) {                                         // condensers on skids, a fan shroud on top, a grille on one side
        const s = spot(1.7); if (!s) break; const a2 = ang + (rnd() < 0.5 ? 0 : 1.5708), c = Math.cos(a2), sn = Math.sin(a2), big = rnd() < 0.35 ? 1.5 : 1;
        for (const dd of [-0.38, 0.38]) PT(PAL.dark).box(s[0] + c * dd * big, flatY + 0.07, s[1] + sn * dd * big, 0.1, 0.14, 0.86, a2);
        PT(PAL.ac).box(s[0], flatY + 0.14 + 0.38 * big, s[1], 1.15 * big, 0.76 * big, 0.82, a2);
        PT(PAL.dark).box(s[0], flatY + 0.14 + 0.76 * big + 0.03, s[1], 0.62 * big, 0.06, 0.62, a2);
        PT(PAL.dark).box(s[0] - sn * 0.42, flatY + 0.14 + 0.38 * big, s[1] + c * 0.42, 0.95 * big, 0.56 * big, 0.03, a2);
      }
      for (let i = 0; i < Math.min(5, Math.round(b.area / 260) + 1); i++) {      // vents: a stub with a cowl
        const s = spot(1.2); if (!s) break; PT(PAL.zinc).box(s[0], flatY + 0.3, s[1], 0.22, 0.6, 0.22, ang); PT(PAL.zinc).box(s[0], flatY + 0.66, s[1], 0.4, 0.07, 0.4, ang);
      }
      if (type === 'shed' || b.area > 900) for (let i = 0; i < Math.min(8, Math.round(b.area / 220)); i++) {      // rooflights: an upstand with a glazed lid
        const s = spot(2.0); if (!s) break; PT(PAL.white).box(s[0], flatY + 0.15, s[1], 1.5, 0.3, 1.5, ang);
        const gb = GL(), c = Math.cos(ang), sn = Math.sin(ang), h = 0.68, Pq = (x, z) => [s[0] + x * c - z * sn, flatY + 0.31, s[1] + x * sn + z * c];
        face(gb, Pq(-h, -h), Pq(h, -h), Pq(h, h), Pq(-h, h), UP, U1);
      }
    }
    return { flatY, type };
  }

  function addTo(group, NS) {
    const TS = lo ? 256 : 512;
    const pbr = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: NS, roughnessMap: t.orm, metalnessMap: t.orm, roughness: 1, metalness: 1, envMapIntensity: 1.0, vertexColors: true, ...o });
    T.render.add(group, pbr(renderMaps(TS), { envMapIntensity: 0.85 }));
    T.brick.add(group, pbr(brickMaps(TS), { envMapIntensity: 0.8 }));
    T.clad.add(group, pbr(claddingMaps(TS)));
    T.panel.add(group, pbr(panelMaps(256)));
    T.slate.add(group, pbr(slateMaps(TS)));
    // glass: smooth and mostly mirror, so each pane shows the sky it faces; frames, doors, trim and plant: paint
    T.glass.add(group, new THREE.MeshStandardMaterial({ color: 0x86949b, metalness: 0.66, roughness: 0.07, envMapIntensity: 1.1, vertexColors: true }), { cast: false });
    T.paint.add(group, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.04, vertexColors: true }));
    return stats;
  }
  // for the pit buildings (props.js): a pane's buffer with its own shade, and a paint buffer in a colour
  const glass = (x, z, rnd) => { const bf = T.glass.at(x, z), v = 0.8 + rnd() * 0.32; bf.c = [v * 0.92, v * 0.98, v]; return bf; };
  const paint = (x, z, col) => { const bf = T.paint.at(x, z); bf.c = col; return bf; };
  return { building, addTo, stats, T, glass, paint, tilt };
}
