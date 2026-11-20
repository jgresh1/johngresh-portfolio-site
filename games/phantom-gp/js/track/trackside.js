// trackside.js — furniture along the circuit: tyre barriers (located from the survey photo), brake-distance boards,
// marshal posts with light panels, sponsor banners (all names invented) and TV camera towers.
import * as THREE from 'three';
import { W, groundAt, nearestStation, frameAt, hardAt } from './world.js';
import { Buf, Tiles } from './props.js';
import { SIGNS } from './signs.js';
import { speedProfile } from './rig.js';
import { canvas, toTex, rng32, periodicNoise, steelTex } from './tex.js';

/* ---------------- textures ---------------- */
function beltTex() {
  // 6 m of conveyor belt hung over tyre stacks: a red and a yellow 3 m panel, seams, bolts, scuffs
  const [c, x] = canvas(1024, 256), r = rng32(7), n = periodicNoise(256, 6, 4, 8);
  for (const [i, col] of [[0, '#b3221b'], [1, '#d9a514']]) { x.fillStyle = col; x.fillRect(i * 512, 0, 512, 256); }
  const img = x.getImageData(0, 0, 1024, 256), d = img.data;
  for (let p = 0; p < 1024 * 256; p++) { const k = 0.72 + 0.5 * n[((p / 1024 | 0) % 256) * 256 + (p % 256)]; d[p * 4] *= k; d[p * 4 + 1] *= k; d[p * 4 + 2] *= k; }
  x.putImageData(img, 0, 0);
  for (let s = 0; s < 4; s++) {                     // tyre columns pressing through the belt
    const g = x.createLinearGradient(s * 256, 0, s * 256 + 256, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.30)'); g.addColorStop(0.18, 'rgba(255,255,255,0.05)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(0.82, 'rgba(0,0,0,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.30)');
    x.fillStyle = g; x.fillRect(s * 256, 0, 256, 256);
  }
  x.fillStyle = 'rgba(20,20,20,0.75)';
  for (let s = 0; s <= 4; s++) x.fillRect(s * 256 - 2, 0, 4, 256);
  for (let s = 0; s < 4; s++) for (const y of [26, 128, 230]) for (const o of [22, 234]) { x.beginPath(); x.arc(s * 256 + o, y, 5, 0, 6.283); x.fillStyle = 'rgba(40,40,42,0.9)'; x.fill(); }
  for (let i = 0; i < 260; i++) {                   // rubber scuffs and dirt
    x.strokeStyle = `rgba(15,15,15,${0.05 + r() * 0.2})`; x.lineWidth = 1 + r() * 4;
    const px = r() * 1024, py = 60 + r() * 190; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 120, py + (r() - 0.5) * 16); x.stroke();
  }
  const g2 = x.createLinearGradient(0, 150, 0, 256); g2.addColorStop(0, 'rgba(60,50,40,0)'); g2.addColorStop(1, 'rgba(60,50,40,0.45)');
  x.fillStyle = g2; x.fillRect(0, 150, 1024, 106);
  return toTex(c, { srgb: true });
}

function tyreTopTex() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#0c0c0d'; x.fillRect(0, 0, 256, 256);
  for (const [cx, cy] of [[64, 64], [192, 64], [64, 192], [192, 192]]) {
    x.beginPath(); x.arc(cx, cy, 60, 0, 6.283); x.fillStyle = '#242425'; x.fill();
    x.beginPath(); x.arc(cx, cy, 46, 0, 6.283); x.strokeStyle = '#3a3a3c'; x.lineWidth = 3; x.stroke();
    x.beginPath(); x.arc(cx, cy, 30, 0, 6.283); x.fillStyle = '#050505'; x.fill();
  }
  return toTex(c, { srgb: true });
}

function boardTex() {
  // 150 / 100 / 50 brake-distance boards side by side
  const [c, x] = canvas(768, 256);
  ['150', '100', '50'].forEach((t, i) => {
    x.fillStyle = '#f2f2ee'; x.fillRect(i * 256, 0, 256, 256);
    x.strokeStyle = '#111'; x.lineWidth = 10; x.strokeRect(i * 256 + 9, 9, 238, 238);
    x.fillStyle = '#111'; x.font = '900 136px "Arial Black", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(i * 256 + 128, 134); x.scale(t.length > 2 ? 0.74 : 1, 1); x.fillText(t, 0, 0); x.restore();
  });
  return toTex(c, { srgb: true, repeat: false });
}

const BRANDS = [   // invented names; no real company is depicted
  ['ARDENNA', '#0f3d6b', '#ffffff'], ['VELORA', '#e9e6dd', '#b3121a'], ['TRIVANT', '#111111', '#ffd21f'], ['OXBEL', '#c8102e', '#ffffff'],
  ['QUARTZ & PINE', '#0b5d3b', '#f3efe2'], ['SEPTANTE-SEPT', '#f6c200', '#101010'], ['HALDEN', '#ffffff', '#12305a'], ['SPA-FRANCORCHAMPS', '#16181c', '#ffffff'],
];
function bannerTex() {
  const [c, x] = canvas(1024, 1024), rowH = 1024 / BRANDS.length, n = periodicNoise(256, 5, 4, 31);
  BRANDS.forEach(([name, bg, fg], i) => {
    x.fillStyle = bg; x.fillRect(0, i * rowH, 1024, rowH);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `800 ${Math.round(rowH * 0.56)}px Bahnschrift, "Arial Narrow", Arial, sans-serif`;
    try { x.letterSpacing = '6px'; } catch (e) { /* older canvas */ }
    const wd = x.measureText(name).width, sc = Math.min(1, 900 / wd);
    x.save(); x.translate(512, i * rowH + rowH / 2 + 3); x.scale(sc, 1); x.fillText(name, 0, 0); x.restore();
  });
  const img = x.getImageData(0, 0, 1024, 1024), d = img.data;      // fabric: faint weave and grime
  for (let p = 0; p < 1024 * 1024; p++) { const k = 0.84 + 0.26 * n[((p / 1024 | 0) % 256) * 256 + (p % 256)]; d[p * 4] *= k; d[p * 4 + 1] *= k; d[p * 4 + 2] *= k; }
  x.putImageData(img, 0, 0);
  return toTex(c, { srgb: true, repeat: false });
}

const POST_NO = { bg: '#f1f1ee', fg: '#15171a', h: 64, pad: 0.4, size: 0.62, weight: 800 };

/* ---------------- build ---------------- */
export function buildTrackside(scene, qual) {
  const group = new THREE.Group(); group.name = 'trackside';
  const ns = {}, N = W.N;

  /* nearest solid barrier on each side of every station (for posts that stand behind it) */
  const wall = [new Float32Array(N).fill(1e3), new Float32Array(N).fill(1e3)], fence = [new Float32Array(N).fill(1e3), new Float32Array(N).fill(1e3)];
  for (const b of W.barriers) {
    if (b.dmin > 90) continue;
    const dst = b.kind === 'fence' ? fence : wall;
    for (let i = 0; i < b.pts.length - 1; i++) {
      const [x0, z0] = b.pts[i], [x1, z1] = b.pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.ceil(L / 2));
      for (let q = 0; q <= k; q++) {
        const n = nearestStation(x0 + (x1 - x0) * q / k, z0 + (z1 - z0) * q / k, ns); if (!n || n.dist > 90) continue;
        const si = Math.round(n.s / W.ds) % N, sd = n.d < 0 ? 0 : 1, ad = Math.abs(n.d);
        for (let o = -2; o <= 2; o++) { const j = (si + o + N) % N; if (ad < dst[sd][j]) dst[sd][j] = ad; }
      }
    }
  }

  /* ---------------- tyre barriers ---------------- */
  const belts = new Tiles(), tops = new Tiles();
  const PROF = [[0, 0.03], [0.34, 0.075], [0.72, 0.075], [1.04, 0.0]];
  for (const run of W.trackside.tyres) {
    const pts = run.pts; if (pts.length < 3) continue;
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.05) continue;
      let nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
      const n = nearestStation((x0 + x1) / 2, (z0 + z1) / 2, ns);
      if (n) { const fr = frameAt(n.s, {}); if ((fr.x - x0) * nx + (fr.z - z0) * nz < 0) { nx = -nx; nz = -nz; } }
      const y0 = groundAt(x0, z0) - 0.04, y1 = groundAt(x1, z1) - 0.04, B = belts.at(x0, z0);
      for (let k = 0; k < PROF.length - 1; k++) {
        const [h0, o0] = PROF[k], [h1, o1] = PROF[k + 1], sl = Math.atan2(o1 - o0, h1 - h0);
        B.quad([x0 + nx * o0, y0 + h0, z0 + nz * o0], [x1 + nx * o0, y1 + h0, z1 + nz * o0], [x1 + nx * o1, y1 + h1, z1 + nz * o1], [x0 + nx * o1, y0 + h1, z0 + nz * o1],
          [nx * Math.cos(sl), -Math.sin(sl), nz * Math.cos(sl)], [[acc / 6, h0 / 1.04], [(acc + L) / 6, h0 / 1.04], [(acc + L) / 6, h1 / 1.04], [acc / 6, h1 / 1.04]]);
      }
      const d = 1.3;                                 // two rows of tyres behind the belt
      tops.at(x0, z0).quad([x0, y0 + 1.04, z0], [x1, y1 + 1.04, z1], [x1 - nx * d, y1 + 1.0, z1 - nz * d], [x0 - nx * d, y0 + 1.0, z0 - nz * d], [0, 1, 0],
        [[acc / 1.3, 0], [(acc + L) / 1.3, 0], [(acc + L) / 1.3, 1], [acc / 1.3, 1]]);
      acc += L;
    }
  }
  const beltMat = new THREE.MeshStandardMaterial({ map: beltTex(), roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  const topMat = new THREE.MeshStandardMaterial({ map: tyreTopTex(), roughness: 0.9, side: THREE.DoubleSide });
  belts.add(group, beltMat); tops.add(group, topMat, { cast: false });

  /* ---------------- brake-distance boards ---------------- */
  const v = speedProfile(), boards = new Buf(), posts = new Buf(), zones = [];
  for (let i = 0; i < N; i++) {
    // end of a heavy braking zone: a local speed minimum well below the speed 250 m earlier
    const a = v[(i - 1 + N) % N], c = v[(i + 1) % N];
    if (!(v[i] <= a && v[i] < c)) continue;
    let top = 0; for (let k = 20; k < 320; k += 10) top = Math.max(top, v[(i - k + N) % N]);
    if (top - v[i] > 24 && !zones.some((z) => Math.min(Math.abs(z - i), N - Math.abs(z - i)) < 250)) zones.push(i);
  }
  const boardAt = (s, side, which) => {
    const fr = frameAt(s, {}), i = fr.i, kerb = side < 0 ? W.kerbL[i] : W.kerbR[i];
    const lim = Math.min(wall[side < 0 ? 0 : 1][i] - 0.7, fr.hw + kerb + 2.4), d = Math.max(fr.hw + kerb + 0.9, lim) * side;
    const x = fr.x + fr.rx * d, z = fr.z + fr.rz * d, y = groundAt(x, z), ang = Math.atan2(fr.rz, fr.rx);
    posts.box(x, y + 0.55, z, 0.06, 1.1, 0.06, ang);
    // faces oncoming cars (normal = -travel direction)
    const hw = 0.5, y0 = y + 0.75, y1 = y + 1.65, u0 = which / 3, u1 = (which + 1) / 3;
    const ax = x - fr.rx * hw, az = z - fr.rz * hw, bx = x + fr.rx * hw, bz = z + fr.rz * hw, ox = -fr.dx * 0.04, oz = -fr.dz * 0.04;
    boards.quad([ax + ox, y0, az + oz], [bx + ox, y0, bz + oz], [bx + ox, y1, bz + oz], [ax + ox, y1, az + oz], [-fr.dx, 0, -fr.dz], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  };
  for (const zi of zones) {
    // turn-in is a little before the speed minimum; boards stand on the outside of the coming corner
    let k = 0; for (let q = 0; q < 60; q += 5) k += W.kappa[(zi + q) % N];
    const side = k > 0 ? 1 : -1, turnIn = zi * W.ds - 25;
    [150, 100, 50].forEach((dist, w) => boardAt(turnIn - dist, side, w));
  }
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex(), roughness: 0.6, side: THREE.DoubleSide });
  const steelMat = new THREE.MeshStandardMaterial({ map: steelTex(), color: 0x8d9196, metalness: 0.6, roughness: 0.55 });
  if (boards.idx.length) { group.add(boards.mesh(boardMat)); group.add(posts.mesh(steelMat)); }

  /* ---------------- marshal posts + light panels ---------------- */
  const cab = new Tiles(), roof = new Tiles(), dark = new Tiles(), panel = new Tiles(), poles = new Tiles(), red = new Tiles();
  let post = 0;
  for (let s0 = 130; s0 < W.L - 60; s0 += 265) {
    // behind the barrier on the outside of the bend (or the left on straights), never on tarmac (a pit road, a service road):
    // try the other side, then a little further along
    let fr, i, side, wd, found = false;
    for (const ds of [0, 25, -25, 50, -50]) {
      fr = frameAt(s0 + ds, {}); i = fr.i;
      let k = 0; for (let q = -40; q <= 40; q += 8) k += W.kappa[(i + q + N) % N];
      const first = Math.abs(k) > 0.02 ? (k > 0 ? 1 : -1) : (post % 2 ? 1 : -1);
      for (const sd of [first, -first]) {
        wd = wall[sd < 0 ? 0 : 1][i]; if (wd > 80) continue;
        const cx = fr.x + fr.rx * (wd + 1.7) * sd, cz = fr.z + fr.rz * (wd + 1.7) * sd;
        if (hardAt(cx, cz) > 0.3 || hardAt(cx + fr.rx * sd * 1.2, cz + fr.rz * sd * 1.2) > 0.3) continue;
        side = sd; found = true; break;
      }
      if (found) break;
    }
    if (!found) continue;
    const d = (wd + 1.7) * side, x = fr.x + fr.rx * d, z = fr.z + fr.rz * d, y = groundAt(x, z), ang = Math.atan2(fr.dz, fr.dx);
    // cabin: open toward the track
    cab.at(x, z).box(x, y + 0.12, z, 2.6, 0.24, 1.7, ang);                                             // deck
    const bx = x + fr.rx * side * 0.78, bz = z + fr.rz * side * 0.78;
    cab.at(x, z).box(bx, y + 1.25, bz, 2.6, 2.1, 0.08, ang);                                           // back wall
    for (const e of [-1.26, 1.26]) cab.at(x, z).box(x + fr.dx * e, y + 1.25, z + fr.dz * e, 0.08, 2.1, 1.6, ang);
    dark.at(x, z).box(bx - fr.rx * side * 0.06, y + 1.2, bz - fr.rz * side * 0.06, 2.4, 1.9, 0.02, ang);  // shadowed interior
    roof.at(x, z).box(x, y + 2.36, z, 2.9, 0.1, 2.0, ang);
    {
      /* What a manned post has: its number on a board over the opening, a rail across the open front, a shelf
         along the back wall, two fire extinguishers standing at the front corners, flags in a holder. */
      const tw = [-fr.rx * side, 0, -fr.rz * side], fx = x - fr.rx * side * 0.82, fz = z - fr.rz * side * 0.82;          // tw: towards the track; (fx, fz): the open front
      const cl = SIGNS.cell('POST ' + (post + 1), POST_NO), hw = 0.26 * cl.aspect / 2;
      SIGNS.board([fx - fr.dx * hw, fz - fr.dz * hw], [fx + fr.dx * hw, fz + fr.dz * hw], y + 2.42, y + 2.68, tw, 0.16, cl);
      cab.at(x, z).box(fx + tw[0] * 0.14, y + 2.55, fz + tw[2] * 0.14, hw * 2 + 0.06, 0.3, 0.03, ang);
      poles.at(x, z).box(fx, y + 1.12, fz, 2.5, 0.05, 0.05, ang); for (const e of [-1.24, 1.24]) poles.at(x, z).box(fx + fr.dx * e, y + 0.68, fz + fr.dz * e, 0.05, 0.9, 0.05, ang);
      cab.at(x, z).box(bx - fr.rx * side * 0.22, y + 0.95, bz - fr.rz * side * 0.22, 2.3, 0.04, 0.36, ang);
      for (const e of [-1.02, 1.02]) { const ex = fx + fr.dx * e - tw[0] * 0.18, ez = fz + fr.dz * e - tw[2] * 0.18; red.at(x, z).box(ex, y + 0.5, ez, 0.15, 0.52, 0.15, ang); dark.at(x, z).box(ex, y + 0.8, ez, 0.07, 0.1, 0.07, ang); }
      for (const [e, col] of [[0.5, red], [0.62, roof], [0.74, cab]]) col.at(x, z).box(bx - fr.rx * side * 0.1 + fr.dx * e, y + 1.55, bz - fr.rz * side * 0.1 + fr.dz * e, 0.06, 0.9, 0.06, ang);
    }
    // light panel on a pole at the barrier, facing oncoming cars
    const px = fr.x + fr.rx * (wd + 0.5) * side - fr.dx * 2.2, pz = fr.z + fr.rz * (wd + 0.5) * side - fr.dz * 2.2, py = groundAt(px, pz);
    poles.at(px, pz).box(px, py + 1.5, pz, 0.08, 3.0, 0.08, ang);
    panel.at(px, pz).box(px - fr.dx * 0.06, py + 3.0, pz - fr.dz * 0.06, 0.12, 0.8, 0.8, ang);
    panel.at(px, pz).box(px - fr.dx * 0.2, py + 3.44, pz - fr.dz * 0.2, 0.3, 0.03, 0.9, ang);                      // a hood over the lamps
    poles.at(px, pz).box(px + fr.dx * 0.04, py + 3.0, pz + fr.dz * 0.04, 0.06, 0.9, 0.9, ang);                      // the panel's back frame
    post++;
  }
  cab.add(group, new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.7 }));
  roof.add(group, new THREE.MeshStandardMaterial({ color: 0xd9601a, roughness: 0.6 }));
  red.add(group, new THREE.MeshStandardMaterial({ color: 0xb3121a, roughness: 0.4 }), { cast: false });
  dark.add(group, new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 }), { cast: false });
  panel.add(group, new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.35, metalness: 0.2 }));
  poles.add(group, steelMat, { cast: false });

  /* ---------------- sponsor banners on the catch fence ---------------- */
  const banners = new Tiles(), backs = new Tiles(), rowsN = BRANDS.length;
  let brand = 0;
  for (const b of W.barriers) {
    if (b.dmin > 60) continue;
    const onFence = b.kind === 'fence';
    // resample to 8 m panels
    const pts = []; let carry = 0;
    for (let i = 0; i < b.pts.length - 1; i++) {
      const [x0, z0] = b.pts[i], [x1, z1] = b.pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      for (let t = carry; t < L; t += 8) pts.push([x0 + (x1 - x0) * t / L, z0 + (z1 - z0) * t / L]);
      carry = (carry - L) % 8; if (carry < 0) carry += 8;
    }
    let run = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 5 || L > 9) { run = 0; continue; }
      const n = nearestStation((x0 + x1) / 2, (z0 + z1) / 2, ns); if (!n || n.dist > 62) { run = 0; continue; }
      const si = Math.round(n.s / W.ds) % N, sd = n.d < 0 ? 0 : 1;
      // one row of boards per side: on the fence where it is the first thing behind the track, else above the Armco
      const first = onFence ? fence[sd][si] < wall[sd][si] + 1 && Math.abs(Math.abs(n.d) - fence[sd][si]) < 3 : Math.abs(Math.abs(n.d) - wall[sd][si]) < 3;
      // only where cameras look: the outside of corners, and the start / finish straight
      let k = 0; for (let q = -40; q <= 40; q += 10) k = Math.max(k, Math.abs(W.kappa[(si + q + N) % N]));
      const outside = W.kappa[si] * n.d > 0, onStraight = n.s > W.L - 420 || n.s < 60;
      if (!first || !((k > 0.0032 && outside) || onStraight)) { run = 0; continue; }
      run++;
      if (run % 9 > 5) continue;                      // six boards, then a gap
      if (run % 9 === 1) brand = (brand + 1 + ((si * 7) % 3)) % rowsN;
      let nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
      const fr = frameAt(n.s, {}); if ((fr.x - x0) * nx + (fr.z - z0) * nz < 0) { nx = -nx; nz = -nz; }
      const o = onFence ? 0.07 : -0.16, lift = onFence ? 0.25 : 1.14, y0 = groundAt(x0, z0) + lift, y1 = groundAt(x1, z1) + lift, hgt = 1.0, v0 = 1 - (brand + 1) / rowsN, v1 = 1 - brand / rowsN;
      // text must read left-to-right from the track side
      const flip = (x1 - x0) * nz - (z1 - z0) * nx < 0;
      const A = [x0 + nx * o, y0, z0 + nz * o], B = [x1 + nx * o, y1, z1 + nz * o], C = [x1 + nx * o, y1 + hgt, z1 + nz * o], D = [x0 + nx * o, y0 + hgt, z0 + nz * o];
      const U4 = [[0.02, v0], [0.98, v0], [0.98, v1], [0.02, v1]];
      if (flip) { banners.at(x0, z0).quad(B, A, D, C, [nx, 0, nz], U4); backs.at(x0, z0).quad(A, B, C, D, [-nx, 0, -nz], U4); }
      else { banners.at(x0, z0).quad(A, B, C, D, [nx, 0, nz], U4); backs.at(x0, z0).quad(B, A, D, C, [-nx, 0, -nz], U4); }
    }
  }
  banners.add(group, new THREE.MeshStandardMaterial({ map: bannerTex(), roughness: 0.75 }), { cast: false });
  backs.add(group, new THREE.MeshStandardMaterial({ color: 0xb9bbb8, roughness: 0.85 }), { cast: false });

  SIGNS.flush(group);
  scene.add(group);

  return {
    group, brakeZones: zones,
    // scaffold towers under the TV camera positions
    addTowers(cams) {
      const T = new Tiles(), deck = new Tiles();
      for (const c of cams) {
        const x = c.pos.x, z = c.pos.z, g = groundAt(x, z), top = c.pos.y - 2.3; if (top - g < 1.2) continue;
        for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) T.at(x, z).box(x + ox, (g + top) / 2, z + oz, 0.07, top - g, 0.07);
        for (let h = g + 1.6; h < top; h += 1.9) for (const [ox, oz, sx, sz] of [[0, -1, 2, 0.05], [0, 1, 2, 0.05], [-1, 0, 0.05, 2], [1, 0, 0.05, 2]]) T.at(x, z).box(x + ox, h, z + oz, sx, 0.05, sz);
        deck.at(x, z).box(x, top, z, 2.3, 0.08, 2.3);
        T.at(x, z).box(x, top + 0.95, z, 0.1, 1.9, 0.1);                       // camera mast
        T.at(x, z).box(x, top + 1.82, z, 0.34, 0.2, 0.5);
        for (const [ox, oz, sx, sz] of [[0, -1.1, 2.2, 0.04], [0, 1.1, 2.2, 0.04], [-1.1, 0, 0.04, 2.2], [1.1, 0, 0.04, 2.2]]) T.at(x, z).box(x + ox, top + 0.9, z + oz, sx, 0.04, sz);
        for (const [ox, oz] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) T.at(x, z).box(x + ox, top + 0.46, z + oz, 0.05, 0.92, 0.05);
      }
      T.add(group, steelMat); deck.add(group, new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.85 }));
    },
  };
}
