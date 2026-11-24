// roads.js — free roam: the paved roads round the circuit, rebuilt from their OpenStreetMap centrelines the way the
// circuit's own ribbon is. Each road is resampled to 2.5 m stations, fitted in height and cross-slope to the surveyed
// ground, the terrain mesh is held down underneath it, a shoulder strip carries each edge back to the ground, and the
// trees standing in it are dropped. The game then asks this file what is under a tyre and which way the road runs.
import * as THREE from 'three';
import { W, EXTRA, MESH, naturalAt, meshAt, nearestStation } from './world.js';
import { groundUniforms } from './terrain.js';
import { due, dueN, breathe } from './slice.js';

const DS = 2.5;                 // station spacing (m)
const SKIRT = 2.4;              // shoulder width beyond the road edge (m)
const LOWER = 3.0;              // the terrain mesh is held down this far beyond the edge (a survey cell's diagonal, so no triangle that reaches the road keeps a high corner)
const CLEAR = 10;               // roads stop this far short of the circuit's edge (its own verge is fitted there)
const CELL = 20;
const RANK = { service: 0, residential: 1, unclassified: 1, tertiary: 2, secondary: 3, primary_link: 2, primary: 3 };

export const ROADS = { raw: null, pieces: [], length: 0 };
let grid = null;

export async function loadRoads() {
  try { ROADS.raw = (await (await fetch('assets/roads.json')).json()).roads; } catch (e) { console.warn('roads not loaded', e); ROADS.raw = []; }
}

// Moving average. Past either end the profile is continued along its own slope (a point reflection), so a road on a
// gradient keeps its height at its ends; averaging only the points that exist left each end up to a metre off.
const smooth = (a, r, passes = 2) => {
  const n = a.length; let cur = a;
  const at = (c, j) => (j < 0 ? 2 * c[0] - c[Math.min(n - 1, -j)] : j > n - 1 ? 2 * c[n - 1] - c[Math.max(0, 2 * (n - 1) - j)] : c[j]);
  for (let p = 0; p < passes; p++) { const o = new Float32Array(n); for (let i = 0; i < n; i++) { let t = 0; for (let j = i - r; j <= i + r; j++) t += at(cur, j); o[i] = t / (2 * r + 1); } cur = o; }
  return cur;
};

/* Fit every road to the ground. Call after loadWorld() and before the terrain and the trees are built: it edits
   W.hMesh (the terrain as drawn) and W.trees. */
export async function prepRoads() {
  const n = W.meta.near, X0 = n.x0 + 12, X1 = n.x0 + n.w - 12, Z0 = n.z0 + 12, Z1 = n.z0 + n.h - 12, ns = {};
  const pieces = [];
  for (const [ri, r] of (ROADS.raw || []).entries()) {
    if (due()) await breathe();
    const pts = []; for (let i = 0; i < r.p.length; i += 2) { const v = new THREE.Vector3(r.p[i], 0, r.p[i + 1]); if (!pts.length || pts[pts.length - 1].distanceTo(v) > 0.5) pts.push(v); }
    if (pts.length < 2) continue;
    const curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : new THREE.LineCurve3(pts[0], pts[1]);
    let rough = 0; for (let i = 1; i < pts.length; i++) rough += pts[i].distanceTo(pts[i - 1]);
    curve.arcLengthDivisions = Math.max(200, Math.ceil(rough / 0.6));          // the default 200 is far too coarse for a 3 km road
    const len = curve.getLength(), cnt = Math.max(2, Math.round(len / DS)), sp = curve.getSpacedPoints(cnt);
    const hw = r.w / 2, rank = RANK[r.c] ?? 0;
    // keep the stations inside the surveyed area and clear of the circuit; each unbroken run is one piece
    let run = [];
    const flush = () => { if (run.length >= 12) pieces.push(makePiece(run, hw, rank, r.n, ri)); run = []; };
    for (const p of sp) {
      const st = nearestStation(p.x, p.z, ns);
      const ok = p.x > X0 && p.x < X1 && p.z > Z0 && p.z < Z1 && !(st && Math.abs(st.d) < st.hw + st.kerb + CLEAR + hw);
      if (ok) run.push(p); else flush();
    }
    flush();
  }
  // spatial index of the station segments
  grid = new Map(); ROADS.pieces = pieces;
  pieces.forEach((P, pi) => { for (let i = 0; i < P.n - 1; i++) { const k = Math.floor((P.x[i] + P.x[i + 1]) / 2 / CELL) * 8192 + Math.floor((P.z[i] + P.z[i + 1]) / 2 / CELL); (grid.get(k) || grid.set(k, []).get(k)).push(pi * 65536 + i); } });
  // Junctions: every road was fitted on its own, so where a smaller road runs onto a bigger one the two surfaces
  // differ by a few centimetres to a few decimetres. Bigger roads first; each later road is brought flush with
  // whatever is already there, and the correction fades out over 20 m along it.
  const order = pieces.map((P, i) => i).sort((a, b) => pieces[b].rank - pieces[a].rank || a - b), done = new Set();
  for (const qi of order) {
    if (due()) await breathe();
    const Q = pieces[qi], delta = new Float32Array(Q.n), has = new Uint8Array(Q.n);
    // (only where the two are within 0.35 m of each other: further apart they are on different levels, as the lanes of
    // a terraced car park are, and neither is pulled to the other)
    for (let i = 0; i < Q.n; i++) { const t = topAmong(Q.x[i], Q.z[i], done, 0.6); if (t !== undefined && Math.abs(t - 0.03 - Q.y[i]) < 0.35) { delta[i] = t - 0.03 - Q.y[i]; has[i] = 1; } }
    // Each stretch that lies on another road takes that road's height point by point (lightly smoothed), and the
    // correction at each end of the stretch eases out over 25 m.
    const R = 10, keep = new Float32Array(Q.n).fill(1), raw = Float32Array.from(delta);
    for (let i = 0; i < Q.n; i++) {
      if (!has[i]) continue;
      let j = i; while (j + 1 < Q.n && has[j + 1]) j++;
      for (let k = i; k <= j; k++) { let t = 0, c = 0; for (let m = Math.max(i, k - 1); m <= Math.min(j, k + 1); m++) { t += raw[m]; c++; } delta[k] = t / c; keep[k] = 0; }
      for (const [edge, dir] of [[i, -1], [j, 1]]) for (let o = 1; o <= R; o++) {
        const k = edge + dir * o; if (k < 0 || k >= Q.n || has[k]) break;
        const u = 1 - o / (R + 1), w = u * u * (3 - 2 * u);
        if (w > 1 - keep[k]) { delta[k] = delta[edge] * w; keep[k] = 1 - w; }
      }
      i = j;
    }
    for (let i = 0; i < Q.n; i++) { Q.y[i] += delta[i]; Q.bank[i] *= keep[i]; }
    // A free end (the road stops there: cut short of the circuit, or at the edge of the surveyed area) comes down
    // onto the ground it stops on over its last 35 m. Left at its fitted height it ended as a ledge in mid-air.
    for (const [e, dir] of [[0, 1], [Q.n - 1, -1]]) {
      if (has[e]) continue;
      const T = Math.min(14, Q.n >> 1);
      // (by at most 0.4 m: where the survey shows a bank or a wall across the end, the road must not climb it)
      for (let k = 0; k < T; k++) { const i = e + dir * k, w = (1 - k / T) ** 2; Q.y[i] += Math.max(-0.4, Math.min(0.4, naturalAt(Q.x[i], Q.z[i]) + 0.03 - Q.y[i])) * w; Q.bank[i] *= 1 - w; }
    }
    done.add(qi);
  }
  // hold the terrain mesh down under every road (and one survey cell beyond its edges)
  const nx = n.nx, ny = n.ny, hm = W.hMesh;
  for (const P of pieces) {
    if (due()) await breathe();
    const reach = P.hw + LOWER * MESH.step;
    for (let i = 0; i < P.n; i++) {
      const x = P.x[i], z = P.z[i], tx = P.tx[i], tz = P.tz[i];
      const i0 = Math.max(0, Math.floor((x - reach - 2 - n.x0) / 2)), i1 = Math.min(nx - 1, Math.ceil((x + reach + 2 - n.x0) / 2));
      const j0 = Math.max(0, Math.floor((z - reach - 2 - n.z0) / 2)), j1 = Math.min(ny - 1, Math.ceil((z + reach + 2 - n.z0) / 2));
      for (let gj = j0; gj <= j1; gj++) for (let gi = i0; gi <= i1; gi++) {
        const dx = n.x0 + gi * 2 - x, dz = n.z0 + gj * 2 - z, lon = dx * tx + dz * tz, lat = -dx * tz + dz * tx;
        if (Math.abs(lon) > DS * 0.8 || Math.abs(lat) > reach) continue;
        const top = P.y[i] + P.bank[i] * Math.max(-P.hw, Math.min(P.hw, lat)) - 0.14, k = gj * nx + gi;
        if (hm[k] > top) hm[k] = top;
      }
    }
  }
  for (const P of pieces) finishPiece(P);          // after the terrain is lowered: each shoulder ends on the ground as it will be drawn
  ROADS.length = pieces.reduce((s, P) => s + (P.n - 1) * DS, 0);
  // no tree may stand in a road
  const T = W.trees, keep = [], hit = {};
  for (let t = 0; t < T.length; t += 6) { const h = nearestRoad(T[t], T[t + 1], hit); if (!(h && Math.abs(h.d) < h.hw + 0.9)) keep.push(t); }
  if (keep.length * 6 < T.length) { const out = new Float32Array(keep.length * 6); keep.forEach((t, k) => out.set(T.subarray(t, t + 6), k * 6)); W.trees = out; }
  EXTRA.top = roadTop;
  return ROADS;
}

function makePiece(run, hw, rank, name, road) {
  const n = run.length, x = new Float32Array(n), z = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = run[i].x; z[i] = run[i].z; }
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
  // height along the centre and cross-slope from the surveyed ground, both smoothed over ~30 m
  let y = new Float32Array(n), bank = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    y[i] = naturalAt(x[i], z[i]);
    bank[i] = (naturalAt(x[i] - tz[i] * hw, z[i] + tx[i] * hw) - naturalAt(x[i] + tz[i] * hw, z[i] - tx[i] * hw)) / (2 * hw);      // right minus left
  }
  // (the survey along a road still holds banks, ditches and tree stumps; fitted over 15 m they came through as bumps
  // worth 2 g at speed, so the fit runs over about 60 m in height and 75 m in cross-slope)
  y = smooth(y, 12, 3); bank = smooth(bank, 15, 2); for (let i = 0; i < n; i++) bank[i] = Math.max(-0.04, Math.min(0.04, bank[i]));
  // curvature (> 0 turns right, as in sim.js)
  const kap = new Float32Array(n), outL = new Float32Array(n), outR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3), ax = x[i] - x[a], az = z[i] - z[a], bx = x[b] - x[i], bz = z[b] - z[i];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(x[b] - x[a], z[b] - z[a]);
    kap[i] = la > 0.1 && lb > 0.1 ? 2 * (ax * bz - az * bx) / Math.max(1e-6, la * lb * lc) : 0;
  }
  const lift = 0.02 + 0.03 * rank;       // the bigger road lies on top where two meet
  for (let i = 0; i < n; i++) y[i] += lift;
  return { n, x, z, y, bank, tx, tz, kap: smooth(kap, 2, 1), outL, outR, hw, rank, name, road };
}

// Where each shoulder ends: on the terrain as drawn a shoulder's width out (which may have been lowered for the next
// road along, as between the terraces of a car park), or level with the edge if the ground is higher.
function finishPiece(P) {
  const e = P.hw + SKIRT;
  for (let i = 0; i < P.n; i++) {
    P.outR[i] = Math.min(meshAt(P.x[i] - P.tz[i] * e, P.z[i] + P.tx[i] * e), P.y[i] + P.bank[i] * P.hw) - 0.2;
    P.outL[i] = Math.min(meshAt(P.x[i] + P.tz[i] * e, P.z[i] - P.tx[i] * e), P.y[i] - P.bank[i] * P.hw) - 0.2;
  }
}

// The highest road surface at (x, z) among the pieces in `only` (all pieces if null), or undefined; `slack` widens the
// roads. With `shoulders` it also leaves in _shoulder the highest shoulder strip there (two roads side by side each
// have one, and the one drawn on top is the higher).
let _shoulder;
function topAmong(x, z, only, slack = 0, shoulders = false) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); let top; _shoulder = undefined;
  for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const list = grid.get(i * 8192 + j); if (!list) continue;
    for (const code of list) {
      if (only && !only.has(code >> 16)) continue;
      const P = ROADS.pieces[code >> 16], k = code & 65535, ex = P.x[k + 1] - P.x[k], ez = P.z[k + 1] - P.z[k], l2 = ex * ex + ez * ez;
      // The point must lie beside this segment, not beyond one of its ends: otherwise a wheel reads the height of a
      // station metres up or down the hill. A quarter of a segment of overlap either way covers the wedge that opens
      // between two segments on the outside of a bend; there the height carries on along the segment's own slope.
      const t = ((x - P.x[k]) * ex + (z - P.z[k]) * ez) / l2, l = Math.sqrt(l2);
      if (t < -0.25 || t > 1.25) continue;
      const px = P.x[k] + ex * t, pz = P.z[k] + ez * t;
      const d = (-(x - px) * ez + (z - pz) * ex) / l, ad = Math.abs(d);
      if (ad > P.hw + slack) {
        if (shoulders && ad <= P.hw + SKIRT) {
          const tc = Math.max(0, Math.min(1, t)), edge = P.y[k] + (P.y[k + 1] - P.y[k]) * t + (P.bank[k] + (P.bank[k + 1] - P.bank[k]) * tc) * Math.sign(d) * P.hw;
          const o = d > 0 ? P.outR : P.outL, out = o[k] + (o[k + 1] - o[k]) * tc, ys = edge + (out - edge) * ((ad - P.hw) / SKIRT);
          if (_shoulder === undefined || ys > _shoulder) _shoulder = ys;
        }
        continue;
      }
      const y = P.y[k] + (P.y[k + 1] - P.y[k]) * t + (P.bank[k] + (P.bank[k + 1] - P.bank[k]) * t) * Math.max(-P.hw, Math.min(P.hw, d));
      if (top === undefined || y > top) top = y;
    }
  }
  return top;
}

/* nearest road to (x, z) within ~14 m: out = { p, i, t, d (+ right), dist, hw, y, bank, name, tx, tz }.
   psi (optional): prefer the road that runs the way the car wants to go; that is what picks a branch at a junction. */
export function nearestRoad(x, z, out = {}, psi = null) {
  if (!grid) return null;
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), c = psi === null ? 0 : Math.cos(psi), s = psi === null ? 0 : Math.sin(psi);
  let best = 1e9, found = false;
  for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const list = grid.get(i * 8192 + j); if (!list) continue;
    for (const code of list) {
      const P = ROADS.pieces[code >> 16], k = code & 65535, ex = P.x[k + 1] - P.x[k], ez = P.z[k + 1] - P.z[k], l2 = ex * ex + ez * ez;
      const t = Math.max(0, Math.min(1, ((x - P.x[k]) * ex + (z - P.z[k]) * ez) / l2)), px = P.x[k] + ex * t, pz = P.z[k] + ez * t;
      const dist = Math.hypot(x - px, z - pz); if (dist > 14) continue;
      const l = Math.sqrt(l2), tx = ex / l, tz = ez / l;
      // the nearest segment wins; between two roads at a junction, the one that runs the way the car wants to go
      let score = dist * 0.15 + Math.max(0, dist - P.hw);
      if (psi !== null) score += (1 - Math.abs(tx * c + tz * s)) * 9;
      if (score < best) { best = score; found = true; out.p = code >> 16; out.i = k; out.t = t; out.dist = dist; out.d = -(x - px) * tz + (z - pz) * tx; out.tx = tx; out.tz = tz; }
    }
  }
  if (!found) return null;
  const P = ROADS.pieces[out.p], k = out.i, t = out.t;
  out.hw = P.hw; out.name = P.name; out.bank = P.bank[k] + (P.bank[k + 1] - P.bank[k]) * t; out.y = P.y[k] + (P.y[k + 1] - P.y[k]) * t;
  out.outR = P.outR[k] + (P.outR[k + 1] - P.outR[k]) * t; out.outL = P.outL[k] + (P.outL[k + 1] - P.outL[k]) * t;
  return out;
}

// what a tyre stands on at (x, z) if a road or its shoulder is there, else undefined (world.js asks through EXTRA.top)
const _top = {};
function roadTop(x, z) {
  const on = topAmong(x, z, null, 0, true); if (on !== undefined) return on;        // on tarmac: the top surface where two roads overlap
  // beside it: the shoulder strip while it lasts, or the terrain where that stands higher. Past the strip there is
  // only the ground (holding the strip's last height out there left a ledge a metre high).
  return _shoulder === undefined ? undefined : Math.max(_shoulder, meshAt(x, z));
}

/* The road `dist` metres on from a hit, in the direction the car faces (sign = +1 along the stations, -1 against).
   -> { psi, kappa (signed for that direction), end: true if the road stops before then } */
export function roadAhead(hit, dist, sign, out = {}) {
  const P = ROADS.pieces[hit.p], f = hit.i + hit.t + sign * dist / DS, k = Math.max(0, Math.min(P.n - 1, Math.round(f)));
  out.end = f < 0 || f > P.n - 1;
  out.psi = Math.atan2(P.tz[k] * sign, P.tx[k] * sign); out.kappa = P.kap[k] * sign;
  return out;
}
// the speed the road ahead allows: slow enough for the tightest bend within reach under `brake` m/s^2 (and for its end)
export function roadSpeed(hit, sign, v, latAcc = 16, brake = 13) {
  const P = ROADS.pieces[hit.p], reach = Math.max(30, v * 2.6), steps = Math.ceil(reach / DS);
  let lim = 1e9, f = hit.i + hit.t;
  for (let s = 0; s <= steps; s += 2) {
    const k = Math.round(f + sign * s);
    if (k < 0 || k > P.n - 1) { lim = Math.min(lim, Math.sqrt(14 * 14 + 2 * brake * s * DS)); break; }
    const kp = Math.abs(P.kap[k]); if (kp < 1e-4) continue;
    lim = Math.min(lim, Math.sqrt(latAcc / kp + 2 * brake * s * DS));
  }
  return lim;
}

/* ------------------------------------------------------------------ what is drawn */
export async function buildRoadMeshes(scene) {
  const group = new THREE.Group(); group.name = 'roads';
  const mat = makeMaterial();
  const COL = 5, CHUNK = 96;                       // stations per mesh (240 m), so culling stays tight
  for (const P of ROADS.pieces) {
    if (due()) await breathe();
    for (let a = 0; a < P.n - 1; a += CHUNK) {
      const b = Math.min(P.n - 1, a + CHUNK), rows = b - a + 1;
      const pos = new Float32Array(rows * COL * 3), nor = new Float32Array(rows * COL * 3), aux = new Float32Array(rows * COL * 4), idx = [];
      for (let r = 0; r < rows; r++) {
        const i = a + r, rx = -P.tz[i], rz = P.tx[i], e = P.hw + SKIRT;
        const ds = [-e, -P.hw, 0, P.hw, e], ys = [P.outL[i], P.y[i] - P.bank[i] * P.hw, P.y[i], P.y[i] + P.bank[i] * P.hw, P.outR[i]];
        for (let c = 0; c < COL; c++) {
          const k = (r * COL + c) * 3; pos[k] = P.x[i] + rx * ds[c]; pos[k + 1] = ys[c]; pos[k + 2] = P.z[i] + rz * ds[c];
          nor[k] = -rx * P.bank[i]; nor[k + 1] = 1; nor[k + 2] = -rz * P.bank[i];
          const q = (r * COL + c) * 4; aux[q] = ds[c]; aux[q + 1] = P.hw; aux[q + 2] = i * DS; aux[q + 3] = P.rank;
        }
        if (r < rows - 1) for (let c = 0; c < COL - 1; c++) { const p = r * COL + c, q = p + COL; idx.push(p, p + 1, q + 1, p, q + 1, q); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('aRd', new THREE.BufferAttribute(aux, 4));
      g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; m.renderOrder = P.rank;
      group.add(m);
    }
  }
  scene.add(group);
  return { group, mat };
}

function makeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRd; varying vec4 vRd;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRd = aRd;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        uniform sampler2D tAsph, tAsphN, tNoise; uniform vec3 uAsphMean;
        varying vec4 vRd;
        float pRough; vec3 pDetailN;
        vec4 noTileP( sampler2D smp, vec2 uv ) {
          float k = texture2D( tNoise, uv * 0.031 ).r * 8.0;
          float ia = floor( k ), f = fract( k );
          vec2 oa = sin( vec2( 3.0, 7.0 ) * ia ), ob = sin( vec2( 3.0, 7.0 ) * ( ia + 1.0 ) );
          vec2 dx = dFdx( uv ), dy = dFdy( uv );
          return mix( textureGrad( smp, uv + oa, dx, dy ), textureGrad( smp, uv + ob, dx, dy ), smoothstep( 0.2, 0.8, f ) );
        }`)
      .replace('#include <map_fragment>', /* glsl */`
        float d = vRd.x, hw = vRd.y, s = vRd.z, rank = vRd.w, ad = abs( d );
        vec2 wuv = vFogWorld.xz;
        float pDet = 1.0 - smoothstep( 25.0, 160.0, length( vFogWorld - cameraPosition ) );
        vec3 tA = noTileP( tAsph, wuv / 2.0 ).rgb / uAsphMean;
        vec3 n1 = texture2D( tNoise, wuv / 31.0 ).rgb, n2 = texture2D( tNoise, vec2( d / 3.1, s / 190.0 ) ).rgb;
        // public tarmac: older and greyer than the circuit, patched, darker in the wheel tracks
        vec3 base = mix( vec3( 0.150, 0.148, 0.146 ), vec3( 0.118, 0.118, 0.122 ), rank / 3.0 ) * mix( vec3( 1.0 ), tA, 0.35 + 0.65 * pDet );
        base *= 0.84 + 0.32 * n1.r;
        base *= 1.0 - 0.10 * smoothstep( 0.55, 0.75, n1.g ) * step( 0.5, fract( s / 37.0 + n1.b ) );
        float lane = hw * 0.5, trk = 1.0 - smoothstep( 0.2, 0.75, abs( abs( ad - lane ) - 0.78 ) );
        base *= 1.0 - 0.13 * trk * ( 0.4 + 0.6 * n2.g ) * step( 2.6, hw );
        pRough = 0.90 - 0.10 * trk;
        // paint: edge lines on the main roads, a broken centre line on anything two lanes wide
        float aa = max( fwidth( d ), 1e-4 ) * 0.75, as = max( fwidth( s ), 1e-4 ) * 0.75;
        float wear = 0.55 + 0.45 * smoothstep( 0.2, 0.6, texture2D( tNoise, vec2( d * 2.1, s / 3.3 ) ).g );
        float eLine = smoothstep( hw - 0.32 - aa, hw - 0.32 + aa, ad ) * ( 1.0 - smoothstep( hw - 0.17 - aa, hw - 0.17 + aa, ad ) ) * step( 1.5, rank );
        float dash = 1.0 - smoothstep( 1.5 - as, 1.5 + as, abs( mod( s, 12.5 ) - 1.5 ) );
        float cLine = ( 1.0 - smoothstep( 0.06 - aa, 0.06 + aa, ad ) ) * dash * step( 0.5, rank ) * step( 2.45, hw );
        float paint = max( eLine, cLine ) * wear;
        base = mix( base, vec3( 0.74, 0.74, 0.71 ), paint * 0.9 );
        pRough = mix( pRough, 0.6, paint );
        // shoulder: gravel and earth beyond the edge
        float sh = smoothstep( hw - 0.04, hw + 0.10 + 0.25 * n1.b, ad );
        vec3 grav = vec3( 0.205, 0.185, 0.155 ) * ( 0.7 + 0.6 * texture2D( tNoise, wuv / 2.3 ).g ) * ( 0.85 + 0.3 * n1.g );
        base = mix( base, grav, sh ); pRough = mix( pRough, 0.96, sh );
        diffuseColor.rgb = base;
        pDetailN = ( noTileP( tAsphN, wuv / 2.0 ).xyz * 2.0 - 1.0 ) * pDet * ( 1.0 - 0.6 * paint );
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = pRough;')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        normal = normalize( normal + ( viewMatrix * vec4( pDetailN.x, 0.0, pDetailN.y, 0.0 ) ).xyz * 0.42 );`);
  };
  mat.customProgramCacheKey = () => 'publicRoad';
  return mat;
}
