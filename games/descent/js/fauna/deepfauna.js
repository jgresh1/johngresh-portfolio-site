// Deep-sea animals: squid and anglerfish geometry (animation/shading live in heroes.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, mulberry32, makeNoise3 } from '../flora/geom.js';
import { fishGeometry } from './fishgen.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

const ico = () => { const g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute('uv'); const o = new THREE.BufferGeometry(); o.setAttribute('position', g.attributes.position); o.setAttribute('normal', g.attributes.normal); return o; };

// Squid, mantle length ~1 along +X (arms/head at +X, fins at -X). part: 0 mantle, 1 fin, 2 head, 3 arm, 4 tentacle, 5 eye, 6 club
export function squidGeometry(seed = 4) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 5), b = new Builder();
  // mantle: revolve around Y then lay along X
  const prof = [];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;                                    // 0 tail tip -> 1 opening
    const r = 0.135 * Math.pow(Math.sin(Math.PI * Math.min(t * 0.92 + 0.02, 1)), 0.5) * (t < 0.15 ? 0.55 + t * 3 : 1) * (1 - 0.35 * Math.pow(1 - t, 3));
    prof.push([Math.max(r, 0.004), -0.5 + t * 0.95]);
  }
  const start = b.count;
  b.lathe(prof, 20, [0, 0, 0, 0], V(), V(1, 1, 1));
  // rotate the lathe (built along Y) so it lies along X
  const rotate = (from, m) => { for (let i = from; i < b.count; i++) { const p = V(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]).applyMatrix4(m), n = V(b.nor[i * 3], b.nor[i * 3 + 1], b.nor[i * 3 + 2]).transformDirection(m); b.pos[i * 3] = p.x; b.pos[i * 3 + 1] = p.y; b.pos[i * 3 + 2] = p.z; b.nor[i * 3] = n.x; b.nor[i * 3 + 1] = n.y; b.nor[i * 3 + 2] = n.z; } };
  rotate(start, new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  // fain rhombic fins at the tail
  b.grid(10, 6, (u, v) => {
    const x = -0.52 + u * 0.36, span = 0.21 * Math.sin(Math.PI * Math.pow(u, 0.7)) * (0.35 + 0.65 * u * (1 - u) * 4);
    const z = (v * 2 - 1) * span * 1.0;
    return V(x, 0.004 * Math.sin(v * 9 + u * 6), z);
  }, [0, 1, 0, 0], false);
  // head
  const headStart = b.count;
  b.grid(18, 8, (u, v) => { const a = u * TAU, t = v; const x = 0.44 + 0.10 * t; const rr = 0.11 * Math.sin(Math.PI * (0.15 + 0.7 * t)) * (1 - 0.3 * t); return V(x, Math.sin(a) * rr, Math.cos(a) * rr * 1.05); }, [0.9, 2, 0, 0], false);
  // eyes
  for (const s of [-1, 1]) b.addGeometry(ico(), new THREE.Matrix4().compose(V(0.53, 0.02, s * 0.105), new THREE.Quaternion(), V(0.05, 0.05, 0.05)), [0.9, 5, s > 0 ? 1 : 0, 0]);
  // arms (8) and two long tentacles
  for (let k = 0; k < 8; k++) {
    const a = k * TAU / 8 + 0.2, pts = [];
    const L = 0.28 + 0.06 * rnd();
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(0.56 + L * t, Math.sin(a) * (0.06 + 0.05 * t) + 0.02 * Math.sin(t * 6 + k), Math.cos(a) * (0.06 + 0.05 * t) + 0.02 * Math.cos(t * 5 + k))); }
    b.tube(pts, (t) => 0.016 * (1 - 0.85 * t) + 0.002, 5, [0, 3, 0, 0]);
  }
  for (const s of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(V(0.58 + 0.75 * t, 0.02 * Math.sin(t * 7), s * (0.02 + 0.025 * t) + 0.03 * Math.sin(t * 5 + s))); }
    b.tube(pts, (t) => (t < 0.8 ? 0.008 : 0.012 + 0.01 * (t - 0.8) * 5) * 1, 5, [0, 4, 0, 0]);
  }
  return b.toGeometry();
}

// Anglerfish: globular body + lure; part 8 = lure (t along it), 7 = teeth
export function anglerGeometry(seed = 9) {
  const rnd = mulberry32(seed), b = new Builder();
  const body = fishGeometry({
    depth: 0.72, width: 0.95, body: 'deep', superN: 2.1, stations: 26, radial: 18, snout: 0.0, seed: 55,
    tail: { span: 0.15, length: 0.16, fork: 0.0, taper: 0.4 }, dorsal: { a: 0.62, b: 0.82, h: 0.10 }, anal: { a: 0.62, b: 0.82, h: 0.08 },
    pect: { size: 0.14, y: -0.10 }, pelv: null, eye: 0.018, eyeT: 0.12,
  });
  // needle teeth around the mouth slit (both jaws)
  const teeth = new Builder();
  for (let i = 0; i < 34; i++) {
    const ang = (i / 34) * Math.PI * 2, r = 0.135;
    // mouth ring centred on the snout: upper and lower jaw teeth pointing inwards/forward
    const side = Math.cos(ang), up = Math.sin(ang);
    if (Math.abs(up) < 0.1) continue;
    const base = V(0.5 - 0.02 - 0.02 * Math.abs(up), up * 0.19 + side * 0.0, side * 0.24 * (1 - 0.3 * Math.abs(up)));
    const dir = V(0.5, -Math.sign(up) * 0.9, -side * 0.25).normalize();
    teeth.tube([base, base.clone().addScaledVector(dir, 0.035 + 0.045 * rnd())], (t) => 0.0045 * (1 - 0.95 * t), 3, [0, 7, 0, 0], false);
  }
  // lure: illicium from the head, bulb (esca) with filaments
  const lure = new Builder();
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V(0.34 + 0.32 * t, 0.16 + 0.24 * Math.sin(t * 2.0) , 0.0 + 0.02 * Math.sin(t * 5))); }
  lure.tube(pts, (t) => 0.0055 * (1 - 0.5 * t), 4, [0, 8, 0, 0], false);
  const tip = pts[pts.length - 1];
  lure.addGeometry(ico(), new THREE.Matrix4().compose(tip.clone(), new THREE.Quaternion(), V(0.026, 0.026, 0.026)), [1.0, 8, 0, 0]);
  for (let f = 0; f < 6; f++) { const a = f * TAU / 6; lure.tube([tip.clone(), tip.clone().add(V(Math.cos(a) * 0.05, -0.03 - 0.03 * rnd(), Math.sin(a) * 0.05))], (t) => 0.0025 * (1 - 0.8 * t), 3, [1.0, 8, 0, 0], false); }
  const parts = [body, teeth.toGeometry(), lure.toGeometry()];
  return mergeGeometries(parts, false);
}
