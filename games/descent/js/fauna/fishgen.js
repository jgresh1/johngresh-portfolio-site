// Parametric fish geometry. Unit length along +X (nose at +0.5, tail base at -0.5),
// y up, z lateral. aInfo = (t along body 0..1 [>1 in the tail fin], part, across, ray)
// part: 0 body, 1 dorsal, 2 anal, 3 pectoral, 4 pelvic, 5 caudal, 6 eye, 7 jaw/lip
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, mulberry32, makeNoise3 } from '../flora/geom.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Catmull-Rom through control points [[t, v], ...] (clamped)
function spline(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  let i = 0; while (i < pts.length - 2 && pts[i + 1][0] < t) i++;
  const p0 = pts[Math.max(i - 1, 0)][1], p1 = pts[i][1], p2 = pts[i + 1][1], p3 = pts[Math.min(i + 2, pts.length - 1)][1];
  const u = (t - pts[i][0]) / (pts[i + 1][0] - pts[i][0]), u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

export const BODY = {
  fusiform: [[0, 0.02], [0.04, 0.34], [0.12, 0.68], [0.28, 0.95], [0.42, 1.0], [0.6, 0.9], [0.78, 0.55], [0.9, 0.30], [1.0, 0.24]],
  deep:     [[0, 0.03], [0.05, 0.42], [0.14, 0.80], [0.30, 1.0], [0.48, 0.98], [0.68, 0.72], [0.85, 0.38], [1.0, 0.27]],
  slender:  [[0, 0.02], [0.05, 0.35], [0.14, 0.62], [0.3, 0.85], [0.5, 1.0], [0.72, 0.85], [0.88, 0.45], [1.0, 0.22]],
  torpedo:  [[0, 0.02], [0.03, 0.30], [0.10, 0.62], [0.25, 0.92], [0.40, 1.0], [0.62, 0.86], [0.82, 0.42], [1.0, 0.14]],
  parrot:   [[0, 0.06], [0.05, 0.55], [0.13, 0.86], [0.28, 1.0], [0.5, 0.95], [0.72, 0.68], [0.88, 0.40], [1.0, 0.30]],
  jack:     [[0, 0.03], [0.04, 0.36], [0.10, 0.70], [0.22, 0.96], [0.36, 1.0], [0.52, 0.88], [0.70, 0.58], [0.86, 0.30], [0.96, 0.17], [1.0, 0.14]],
  rattail:  [[0, 0.02], [0.04, 0.50], [0.10, 0.92], [0.20, 1.0], [0.34, 0.74], [0.52, 0.40], [0.75, 0.18], [1.0, 0.07]],
};

export function fishGeometry(spec, split = false) {
  const {
    depth = 0.24, width = 0.5, body = 'fusiform', superN = 2.4, stations = 30, radial = 16,
    snout = 0.0, hump = 0.0, belly = 0.0, chin = 0.0,
    tail = { span: 0.26, length: 0.20, fork: 0.5, taper: 0.4 },
    dorsal = { a: 0.30, b: 0.72, h: 0.10, notch: 0 },
    dorsal2 = null,
    anal = { a: 0.62, b: 0.86, h: 0.06 },
    pect = { size: 0.16, y: -0.12 }, pelv = { size: 0.08, a: 0.36 },
    eye = 0.018, eyeT = 0.11, seed = 1, finDetail = 1,
  } = spec;
  const b = new Builder(), fb = new Builder(), rnd = mulberry32(seed), n3 = makeNoise3(seed + 1);
  const prof = BODY[body] || BODY.fusiform;
  const xAt = (t) => 0.5 - t;
  const halfH = (t) => {
    let h = spline(prof, t) * depth * 0.5;
    if (t < 0.16) h *= 1 - snout * (1 - t / 0.16);
    return h;
  };
  const halfW = (t) => halfH(t) * width * (t < 0.06 ? 0.7 + 4 * t : 1) * (0.8 + 0.2 * Math.sin(Math.min(t * 3.14, 3.14)));
  const cy = (t) => hump * halfH(t) * Math.sin(Math.min(t * 3.4, 3.14)) - belly * halfH(t) * 0.5 * Math.sin(Math.min(t * 3.14, 3.14)) - chin * (1 - t / 0.2) * (t < 0.2 ? 1 : 0) * 0.02;

  // ---- body: loft of superellipse rings ----
  const rings = [];
  for (let i = 0; i <= stations; i++) {
    const tt = i / stations;
    const t = Math.pow(tt, 0.9);            // slightly denser near the head
    rings.push({ t, x: xAt(t), h: Math.max(halfH(t), 0.0008), w: Math.max(halfW(t), 0.0007), y: cy(t) });
  }
  const bodyStart = b.count;
  for (let i = 0; i <= stations; i++) {
    const r = rings[i];
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const sN = 2 + (superN - 2) * Math.min(Math.max((r.t - 0.04) / 0.14, 0), 1) * (1 - Math.min(Math.max((r.t - 0.62) / 0.26, 0), 1));   // round at the snout and the peduncle
      const e = 2 / sN;
      const px = Math.sign(c) * Math.pow(Math.abs(c), e), py = Math.sign(s) * Math.pow(Math.abs(s), e);
      const pos = V(r.x, r.y + py * r.h, px * r.w);
      // analytic-ish normal of the ellipse (good enough; smooth shading)
      const nn = V(0, py / Math.max(r.h, 1e-4), px / Math.max(r.w, 1e-4)).normalize();
      // tilt with the taper along x
      const dh = (i < stations ? rings[i + 1].h - r.h : r.h - rings[i - 1].h) / Math.max(Math.abs(rings[Math.min(i + 1, stations)].x - rings[Math.max(i - 1, 0)].x), 1e-4);
      nn.x = dh * 0.5 * (py > 0 ? 1 : (py < 0 ? 1 : 0)) * Math.abs(py) ;
      nn.normalize();
      b.vertex(pos, nn, r.t, j / radial, [r.t, 0, j / radial, 0]);
    }
  }
  for (let i = 0; i < stations; i++) for (let j = 0; j < radial; j++) {
    const a = bodyStart + i * (radial + 1) + j, bb = a + 1, c = a + radial + 1, d = c + 1;
    b.tri(a, bb, c); b.tri(bb, d, c);
  }
  // close nose and tail-base openings with small fans
  {
    const noseC = b.vertex(V(rings[0].x + 0.002, rings[0].y, 0), V(1, 0, 0), 0, 0.5, [0, 0, 0.5, 0]);
    for (let j = 0; j < radial; j++) b.tri(bodyStart + j + 1, bodyStart + j, noseC);
    const base = bodyStart + stations * (radial + 1);
    const tailC = b.vertex(V(rings[stations].x - 0.002, rings[stations].y, 0), V(-1, 0, 0), 1, 0.5, [1, 0, 0.5, 0]);
    for (let j = 0; j < radial; j++) b.tri(base + j, base + j + 1, tailC);
  }

  // ---- flat fin helper: grid over (u, v). aInfo = (t, part, v, u). Fins go to their own (translucent) mesh ----
  const fin = (nu, nv, fn, part, flip = false) => {
    nu = Math.max(2, Math.round(nu * finDetail)); nv = Math.max(2, Math.round(nv * finDetail));
    const base = fb.count;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const { p, t } = fn(u, v);
      const bow = part === 5 ? 0.010 * (1 - Math.abs(2 * v - 1)) * u * u : (part === 1 || part === 2 ? 0.006 * Math.sin(Math.PI * u) * v : 0);   // cupped tail, rippled dorsal/anal
      p.z += bow * (flip ? -1 : 1);
      fb.vertex(p, V(0, 0, flip ? -1 : 1), u, v, [t, part, v, u]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, bb = a + 1, c = a + nu + 1, d = c + 1;
      fb.tri(a, bb, c); fb.tri(bb, d, c);
    }
  };
  const ringAtT = (t) => ({ h: halfH(t), y: cy(t), x: xAt(t) });

  // dorsal fin (may be split into spiny + soft portions via notch)
  const dorsalFin = (d) => {
    fin(24, 6, (u, v) => {
      const t = d.a + (d.b - d.a) * u, r = ringAtT(t);
      const front = Math.pow(Math.min(u * 3.2, 1), 0.7);                     // leading spines rise quickly
      const back = 1 - 0.55 * Math.pow(u, 1.6);                              // soft rays taper toward the tail
      const ht = d.h * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(Math.pow(u, d.skew ?? 0.8) * 0.92 + 0.04, 1))) * front * back * 1.25
               * (1 - (d.notch || 0) * Math.exp(-Math.pow((u - 0.5) / 0.15, 2)));
      return { p: V(r.x - v * (d.sweep ?? 0.02) * (0.4 + u), r.y + r.h * 0.94 + v * ht, 0), t };
    }, 1);
  };
  if (dorsal) dorsalFin(dorsal);
  if (dorsal2) dorsalFin(dorsal2);
  if (anal) fin(16, 5, (u, v) => {
    const t = anal.a + (anal.b - anal.a) * u, r = ringAtT(t);
    const ht = anal.h * (Math.sin(Math.PI * Math.pow(u, 0.8)) * 0.6 + 0.4 * (1 - u * 0.6));
    return { p: V(r.x - v * 0.015, r.y - r.h * 0.94 - v * ht, 0), t };
  }, 2);

  // caudal fin: fans out from the peduncle; forked/lunate/rounded via `fork`
  {
    const T = tail, r0 = rings[stations];
    fin(10, 24, (u, vv) => {
      const v = vv * 2 - 1, av = Math.abs(v);
      const edge = 1 - T.fork * (1 - Math.pow(av, T.lobe ?? 1.6));      // trailing edge position (lobe < 1.6 -> straighter, broader lobes)
      const asym = T.asym ? (v > 0 ? 1.0 : 1 - T.asym) : 1;             // heterocercal (shark): weak lower lobe
      const x = r0.x - 0.004 - u * T.length * edge * (v > 0 ? 1 + (T.asym || 0) * 0.5 : asym);
      const y = r0.y + v * T.span * asym * (v > 0 ? 1.0 : 1.0) * (T.taper + (1 - T.taper) * Math.pow(u, 0.8)) + (T.asym ? 0.5 * T.asym * T.span * u * (v > 0 ? 1 : 0.3) : 0);
      return { p: V(x, y, 0), t: 1 + u * 0.3 };
    }, 5);
  }

  // pectoral fins, both sides (paddle swept backwards; `shape: 'sickle'` = long, pointed, curved like a jack's)
  for (const side of [-1, 1]) {
    const t0 = pect.t ?? 0.27, r = ringAtT(t0), w0 = halfW(t0);
    if (pect.shape === 'sickle') {
      fin(8, 8, (u, v) => {
        const len = pect.size, wid = pect.size * (pect.aspect ?? 0.30);
        const chord = wid * Math.pow(Math.max(1 - u, 0), 0.75) * (1.0 - 0.15 * u) + 0.002;
        const x = r.x - len * (0.50 * u + 0.50 * u * u) - v * chord * 0.55;
        const y = r.y + pect.y * halfH(t0) * 2 - u * len * 0.22 + (v - 0.15) * chord * 0.6;
        const z = side * (w0 * 0.92 + u * len * 0.26);
        return { p: V(x, y, z), t: t0 };
      }, 3, side > 0);
      continue;
    }
    fin(6, 6, (u, v) => {
      const len = pect.size, wid = pect.size * 0.55;
      const x = r.x - u * len * 0.8 - v * wid * 0.12;
      const y = r.y + pect.y * halfH(t0) * 2 - u * len * 0.35 + (v - 0.5) * wid * (1 - u * 0.5);
      const z = side * (w0 * 0.92 + u * len * 0.32);
      return { p: V(x, y, z), t: t0 };
    }, 3, side > 0);
  }
  // pelvic fins
  if (pelv) for (const side of [-1, 1]) {
    const t0 = pelv.a, r = ringAtT(t0), w0 = halfW(t0);
    fin(4, 4, (u, v) => {
      const len = pelv.size;
      return { p: V(r.x - u * len * 0.7 - v * len * 0.1, r.y - r.h * 0.88 - u * len * 0.5, side * (w0 * 0.5 + u * len * 0.18)), t: t0 };
    }, 4, side > 0);
  }

  // eyes
  const ico = new THREE.IcosahedronGeometry(1, finDetail < 0.5 ? 0 : (finDetail < 0.8 ? 1 : 2));
  for (const side of [-1, 1]) {
    const r = ringAtT(eyeT), w0 = halfW(eyeT);
    const m = new THREE.Matrix4().compose(V(r.x, r.y + r.h * 0.22, side * w0 * 0.66), new THREE.Quaternion(), V(eye * 1.16, eye * 1.16, eye * 0.86));      // set into the head: only the lens bulges
    const g = ico.clone(); g.deleteAttribute('uv');
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', g.attributes.position); gg.setAttribute('normal', g.attributes.normal);
    b.addGeometry(gg, m, [eyeT, 6, side > 0 ? 1 : 0, 0]);
  }
  const bodyG = b.toGeometry(), finG = fb.toGeometry();
  if (split) return { body: bodyG, fins: finG };
  return mergeGeometries([bodyG, finG], false);
}
