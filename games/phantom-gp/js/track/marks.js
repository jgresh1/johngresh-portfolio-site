// marks.js — what racing leaves on the road. lapLoads() works out, for every metre of the lap, how hard a car is
// braking, turning and putting its power down there (road.js lays the rubbered line with it). buildMarks() lays the
// tyre marks themselves: thin ribbons a few millimetres over the asphalt that darken whatever is under them, so
// they sit in the same light, shadow and haze as the road. Every one is placed where a car would leave it: lock-ups
// into the braking zones, scrubbing through the corners, wheelspin out of the slow ones, spins, and the starts
// away from each grid slot.
import * as THREE from 'three';
import { W, frameAt } from './world.js';
import { groundUniforms } from './terrain.js';
import { speedProfile } from './rig.js';
import { rng32 } from './tex.js';

let LOADS = null;
export function lapLoads() {
  if (LOADS) return LOADS;
  const N = W.N, ds = W.ds, v = speedProfile();
  const brake = new Float32Array(N), lat = new Float32Array(N), trac = new Float32Array(N), turn = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, acc = (v[j] * v[j] - v[i] * v[i]) / (2 * ds);          // + gaining speed, - braking (m/s2)
    let k = 0, ks = 0; for (let q = -6; q <= 6; q++) { const c = W.kappa[(i + q + N) % N]; k += Math.abs(c); ks += c; }
    lat[i] = Math.min(1, k / 13 * 0.72 * v[i] * v[i] / 50);
    brake[i] = Math.min(1, Math.max(0, -acc) / 40);
    trac[i] = Math.min(1, Math.max(0, acc) / 12 * Math.max(0, 1 - v[i] / 66));
    turn[i] = ks / 13;                                                             // + : the outside of the bend is on the right
  }
  const blur = (a, r) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let q = -r; q <= r; q++) s += a[(i + q + N) % N]; o[i] = s / (2 * r + 1); } return o; };
  const bS = blur(brake, 10), lS = blur(lat, 10), tS = blur(trac, 10), wear = new Float32Array(N);
  for (let i = 0; i < N; i++) wear[i] = Math.min(1, Math.max(lS[i], bS[i] * 0.95, tS[i] * 0.8));
  LOADS = { v, brake: bS, lat: lS, trac: tS, turn, wear: blur(wear, 14) };
  return LOADS;
}

const LIFT = 0.007;

export function buildMarks(group) {
  const N = W.N, ds = W.ds, L = W.L, { brake, lat, trac, turn } = lapLoads(), rnd = rng32(90210);
  const tiles = new Map(), fr = {};
  const bufAt = (x, z) => { const k = Math.floor(x / 500) + ',' + Math.floor(z / 500); let b = tiles.get(k); if (!b) tiles.set(k, b = { pos: [], uv: [], mk: [], idx: [] }); return b; };
  const grade = (i) => (W.ty[(i + 1) % N] - W.ty[(i - 1 + N) % N]) / (2 * ds);
  const lineAt = (s) => frameAt(((s % L) + L) % L, fr).line;
  let count = 0;

  /* One mark. path(t) -> [s, d] for t from 0 to 1 (s: metres round the lap, d: metres right of the centre line);
     len: its length (m); w: its width (m); a: how dark; env(t): how the darkness comes and goes along it. */
  function ribbon(path, len, w, a, env) {
    const n = Math.max(2, Math.round(len / 0.9)), pts = [], seed = rnd();
    for (let k = 0; k <= n; k++) {
      const t = k / n, [s, d] = path(t); frameAt(((s % L) + L) % L, fr);
      pts.push({ x: fr.x + fr.rx * d, y: fr.y + fr.bank * d, z: fr.z + fr.rz * d, rx: fr.rx, rz: fr.rz, dx: fr.dx, dz: fr.dz, bank: fr.bank, g: grade(fr.i), ok: Math.abs(d) < fr.hw - 0.22 - w / 2, t });
    }
    let B = null, run = 0, along = 0;
    for (let k = 0; k <= n; k++) {
      const p = pts[k], q0 = pts[Math.max(0, k - 1)], q1 = pts[Math.min(n, k + 1)];
      if (k > 0) along += Math.hypot(p.x - q0.x, p.z - q0.z);
      if (!p.ok) { run = 0; continue; }                                             // a mark stops at the edge of the asphalt
      let tx = q1.x - q0.x, tz = q1.z - q0.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const px = -tz, pz = tx, h = w / 2;                                           // across the mark, level
      const dy = (p.bank * (px * p.rx + pz * p.rz) + p.g * (px * p.dx + pz * p.dz)) * h;   // the road's own tilt across it
      if (run === 0) B = bufAt(p.x, p.z);
      const i = B.pos.length / 3, al = a * env(p.t);
      B.pos.push(p.x - px * h, p.y - dy + LIFT, p.z - pz * h, p.x + px * h, p.y + dy + LIFT, p.z + pz * h);
      B.uv.push(0, along, 1, along); B.mk.push(al, seed, al, seed);
      if (run > 0) B.idx.push(i - 2, i - 1, i + 1, i - 2, i + 1, i);
      run++;
    }
    count++;
  }
  const fadeOut = (t) => Math.min(1, t / 0.06) * Math.min(1, (1 - t) / 0.45);         // bites at once, lets go slowly
  const bell = (t) => Math.sin(Math.PI * t) ** 0.7;
  const pair = (path, len, w, a, env, gap, second = 1) => {
    ribbon((t) => { const [s, d] = path(t); return [s, d - gap / 2]; }, len, w, a, env);
    if (second > 0) ribbon((t) => { const [s, d] = path(t); return [s, d + gap / 2]; }, len, w, a * second, env);
  };

  /* runs of the lap where a load stays above a level: [first station, last station, peak] */
  const runs = (a, level, minLen) => {
    const out = []; let i0 = -1, pk = 0;
    for (let i = 0; i < N; i++) {
      if (a[i] > level) { if (i0 < 0) { i0 = i; pk = 0; } pk = Math.max(pk, a[i]); }
      else if (i0 >= 0) { if (i - i0 >= minLen) out.push([i0, i - 1, pk]); i0 = -1; }
    }
    if (i0 >= 0 && N - i0 >= minLen) out.push([i0, N - 1, pk]);
    return out;
  };
  const outsideAfter = (i, span) => { let k = 0; for (let q = 0; q < span; q += 4) k += turn[(i + q) % N]; return k > 0 ? 1 : -1; };

  // braking zones: locked wheels. The car goes straight on while the line turns in, so the marks drift to the outside.
  for (const [a, b, pk] of runs(brake, 0.22, 25)) {
    const out = outsideAfter(b, 70), n = Math.round(5 + pk * 12);
    for (let m = 0; m < n; m++) {
      const s0 = (a + (b - a) * (0.05 + 0.8 * rnd())) * ds - 12 * rnd(), len = 10 + rnd() * rnd() * 70, d0 = lineAt(s0) + (rnd() - 0.5) * 4.4, drift = out * rnd() * rnd() * 3.2;
      const path = (t) => [s0 + len * t, d0 + drift * t * t], w = 0.24 + rnd() * 0.1, al = 0.22 + 0.6 * rnd() * (0.5 + 0.5 * pk);
      if (rnd() < 0.45) pair(path, len, w, al, fadeOut, 1.62, 0.35 + 0.65 * rnd()); else ribbon(path, len, w, al, fadeOut);
    }
  }
  // corners: tyres scrubbing at the limit, a little outside the line and running wide on the way out
  for (const [a, b, pk] of runs(lat, 0.45, 20)) {
    const out = outsideAfter(a, b - a + 1), n = Math.round((b - a) / 16 * (0.6 + pk));
    for (let m = 0; m < n; m++) {
      const s0 = (a + (b - a) * rnd()) * ds, len = 14 + rnd() * 34, off = out * (0.3 + rnd() * 2.2), drift = out * rnd() * 1.4, l0 = lineAt(s0), l1 = lineAt(s0 + len);
      pair((t) => [s0 + len * t, l0 + (l1 - l0) * t + off + drift * t * t], len, 0.3 + rnd() * 0.08, 0.1 + 0.28 * rnd(), bell, 1.58, 0.5 + 0.5 * rnd());
    }
  }
  // out of the slow corners: wheelspin from the rear tyres
  for (const [a, b, pk] of runs(trac, 0.3, 15)) {
    const n = Math.round(3 + pk * 6);
    for (let m = 0; m < n; m++) {
      const s0 = (a + (b - a) * rnd() * 0.7) * ds, len = 7 + rnd() * 20, d0 = lineAt(s0) + (rnd() - 0.5) * 2.6, sway = (rnd() - 0.5) * 1.2;
      pair((t) => [s0 + len * t, d0 + sway * Math.sin(t * 5.2)], len, 0.36 + rnd() * 0.06, 0.16 + 0.34 * rnd(), fadeOut, 1.56, 0.6 + 0.4 * rnd());
    }
  }
  // spins: the car comes round as it slides to the outside, and all four tyres draw their own crossing curve
  const corners = runs(lat, 0.5, 25);
  for (let m = 0; m < 16 && corners.length; m++) {
    const [a, b] = corners[(m * 5 + 2) % corners.length], out = outsideAfter(a, b - a + 1);
    const s0 = (a + (b - a) * (0.3 + 0.7 * rnd())) * ds, len = 26 + rnd() * 26, d0 = lineAt(s0), slide = out * (2 + rnd() * 5), turns = (rnd() < 0.5 ? 1 : -1) * (0.55 + rnd() * 0.9) * Math.PI, al = 0.3 + 0.35 * rnd();
    for (const [wx, wy] of [[-0.8, 1.8], [0.8, 1.8], [-0.8, -1.8], [0.8, -1.8]]) {
      ribbon((t) => { const th = turns * t * t * (3 - 2 * t), c = Math.cos(th), sn = Math.sin(th); return [s0 + len * t + wx * sn + wy * c, d0 + slide * t * t + wx * c - wy * sn]; }, len, 0.3, al * (wy < 0 ? 1 : 0.7), bell);
    }
  }
  // the grid: two black lines away from every slot (the boxes are drawn in road.js: 8 m apart, 9 m back from the line)
  for (let k = 0; k < 22; k++) {
    const sk = L - 9 - 8 * k, hw = frameAt(sk, fr).hw, dc = (k % 2 === 0 ? 1 : -1) * hw * 0.44, len = 7 + rnd() * 9, sway = (rnd() - 0.5) * 0.5;
    pair((t) => [sk - 4.0 + len * t, dc + sway * t * t], len, 0.4, 0.5 + 0.3 * rnd(), (t) => Math.min(1, t / 0.03) * (1 - t) ** 1.3, 1.56, 0.8 + 0.2 * rnd());
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: { tNoise: groundUniforms.tNoise },
    vertexShader: /* glsl */`
      attribute vec2 aMark; varying vec2 vUv, vMark; varying float vDist;
      void main() { vUv = uv; vMark = aMark; vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vDist = - mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tNoise; varying vec2 vUv, vMark; varying float vDist;
      void main() {
        float across = smoothstep( 0.0, 0.22, vUv.x ) * smoothstep( 1.0, 0.78, vUv.x );
        vec3 n = texture2D( tNoise, vec2( vUv.x * 0.21 + vMark.y * 7.0, vUv.y / 11.0 + vMark.y * 3.0 ) ).rgb;       // streaky along its length
        float a = vMark.x * across * ( 0.5 + 0.9 * n.g ) * smoothstep( 0.22, 0.5, n.r + 0.2 );
        a *= 1.0 - smoothstep( 190.0, 330.0, vDist );
        gl_FragColor = vec4( mix( vec3( 1.0 ), vec3( 0.27, 0.27, 0.29 ), clamp( a, 0.0, 1.0 ) ), 1.0 );
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
  });
  let tris = 0;
  for (const b of tiles.values()) {
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('aMark', new THREE.Float32BufferAttribute(b.mk, 2)); g.setIndex(b.idx);
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.renderOrder = 2; m.name = 'tyre marks';
    group.add(m); tris += b.idx.length / 3;
  }
  return { count, tris };
}
