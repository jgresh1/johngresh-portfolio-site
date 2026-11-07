// Hero animals: reef shark, manta ray, green sea turtle. Each is a single mesh moved along an analytic
// path in the vertex shader, with kind-specific body animation (undulation, wing beat, flipper stroke).
import * as THREE from 'three';
import { GLSL_NOISE } from '../glsl.js';
import { uw, SWAY_GLSL } from '../optics.js';
import { fishGeometry } from './fishgen.js';
import { squidGeometry, anglerGeometry } from './deepfauna.js';
import { Builder, mulberry32, makeNoise3, hashStr } from '../flora/geom.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
export function mantaGeometry(seed = 3) {
  const b = new Builder(), n3 = makeNoise3(seed);
  const S = 2.1, C = 1.5;                                      // half span, root chord (metres)
  const le = (z) => 0.50 * C - 0.62 * C * Math.pow(Math.abs(z), 1.3);               // leading edge x (falcate, swept-back wing)
  const chordAt = (z) => 0.95 * C * (1 - Math.pow(Math.abs(z), 1.6)) + 0.02 * C;
  const te = (z) => le(z) - chordAt(z) - 0.04 * C * Math.exp(-Math.pow(z / 0.1, 2));
  const th = (z, v) => 0.24 * Math.pow(Math.max(1 - z * z, 0), 0.7) * Math.pow(Math.sin(Math.PI * Math.min(Math.max(v, 0), 1)), 0.55);
  const surf = (top) => (u, v) => {
    const z = (u * 2 - 1);
    const x = le(z) + (te(z) - le(z)) * v;
    const dome = th(z, v) * (top ? 0.62 : -0.38) + 0.03 * n3(x * 2, z * 3, top ? 1 : 5) * (1 - Math.abs(z));
    return V(x, dome, z * S);
  };
  b.grid(56, 24, surf(true), [0, 0, 0, 0], true);
  b.grid(56, 24, surf(false), [0, 1, 0, 0], false);
  // cephalic lobes (two horn-like scoops at the front)
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push(V(le(0.09 * side) + 0.02 + 0.30 * t, -0.03 - 0.05 * t * t, side * ((0.16 + 0.05 * t) * S * 0.5 - 0.10 * t * t + 0.02))); }
    b.tube(pts, (t) => 0.06 * (1 - 0.7 * t) + 0.012, 6, [0, 2, 0, 0]);
  }
  // tail
  const tp = []; for (let i = 0; i <= 12; i++) { const t = i / 12; tp.push(V(te(0) - 0.05 - t * 1.6, -0.02 * t, 0)); }
  b.tube(tp, (t) => 0.035 * (1 - 0.85 * t) + 0.004, 6, [0, 2, 0, 0]);
  // eyes at the sides of the head
  return b.toGeometry();
}

export function turtleGeometry(seed = 5) {
  const b = new Builder(), n3 = makeNoise3(seed);
  const rim = (a) => { const c = Math.cos(a), s = Math.sin(a); return V(-0.03 + 0.41 * c * (c < 0 ? 0.92 : 1.0), 0, 0.345 * s * (0.86 + 0.14 * c) * (1 + 0.04 * n3(a * 2, 0, 1))); };
  // carapace (top dome)
  b.grid(64, 14, (u, v) => {
    const a = u * TAU, r = rim(a), w = 1 - v;
    const h = 0.18 * Math.pow(Math.max(1 - w * w, 0), 0.62) * (1 + 0.06 * n3(r.x * 4, w * 2, r.z * 4)) + (v < 0.06 ? -0.02 * (1 - v / 0.06) : 0);
    return V(r.x * w, 0.02 + h, r.z * w);
  }, [0.3, 0, 0, 0], false, V(0, 1, 0));
  // plastron
  b.grid(48, 8, (u, v) => {
    const a = u * TAU, r = rim(a), w = 1 - v;
    return V(r.x * w * 0.96, 0.0 + 0.03 * Math.pow(1 - w * w, 0.5) * 0.4, r.z * w * 0.96);
  }, [0.5, 1, 0, 0], false, V(0, -1, 0));
  // head + neck: lofted superellipse rings (neck root -> beak)
  const HX0 = 0.30, HX1 = 0.625;
  const hr = (t) => {                                       // half-width profile
    const neck = 0.052, head = 0.068;
    if (t < 0.30) return neck + (head - neck) * Math.pow(t / 0.30, 1.5) * 0.6;
    if (t < 0.62) return neck + (head - neck) * (0.6 + 0.4 * Math.sin((t - 0.30) / 0.32 * Math.PI / 2));
    const u = (t - 0.62) / 0.38;
    return head * (1 - 0.72 * Math.pow(u, 1.6));
  };
  const hh = (t) => hr(t) * (t < 0.62 ? 0.82 : 0.82 - 0.3 * Math.pow((t - 0.62) / 0.38, 1.4));
  const head = (u, v) => {
    const a = u * TAU, t = v;
    const x = HX0 + (HX1 - HX0) * t;
    const cy = 0.055 - 0.02 * Math.sin(Math.min(t, 1) * 3.0) - (t > 0.7 ? 0.015 * (t - 0.7) / 0.3 : 0);
    const c = Math.cos(a), sn = Math.sin(a);
    const px = Math.sign(c) * Math.pow(Math.abs(c), 0.8), py = Math.sign(sn) * Math.pow(Math.abs(sn), 0.8);
    return V(x, cy + py * hh(t), px * hr(t));
  };
  b.grid(24, 16, head, [0.05, 2, 0, 0], false);
  // beak tip cap
  const tipP = head(0, 1);
  // eyes sit on the sides of the head, just in front of the widest point
  const et = 0.55, ex = HX0 + (HX1 - HX0) * et;
  const ecy = 0.055 - 0.02 * Math.sin(et * 3.0) + 0.012;
  const ico = new THREE.IcosahedronGeometry(1, 2); ico.deleteAttribute('uv');
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', ico.attributes.position); eg.setAttribute('normal', ico.attributes.normal);
  for (const s of [-1, 1]) b.addGeometry(eg, new THREE.Matrix4().compose(V(ex, ecy, s * (hr(et) - 0.004)), new THREE.Quaternion(), V(0.016, 0.016, 0.012)), [0.05, 5, s > 0 ? 1 : 0, 0]);
  // flippers: thick leading edge, two skins
  const flipper = (root, len, wid, side, part) => {
    const surf = (top) => (u, v) => {
      const s = u, c = (v - 0.5);
      const bend = 0.10 * len * s * s;
      const chord = wid * (1 - 0.55 * s) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(s * 1.05, 1)) + 0.2);
      const x = root.x - len * 0.50 * s * s - c * chord * 1.0 - 0.05 * len * s;
      const th = 0.020 * Math.pow(Math.max(1 - Math.abs(c * 2), 0), 0.8) * (1 - 0.7 * s) + 0.002;
      const y = root.y - bend * 0.55 + (top ? th : -th) - Math.abs(c) * chord * 0.10;
      const z = side * (root.z + len * s * (1 - 0.12 * s));
      return V(x, y, z);
    };
    b.grid(12, 9, surf(true), [0.5, part, 0, 0], false, V(0, 1, 0));
    b.grid(12, 9, surf(false), [0.5, part, 0, 0], false, V(0, -1, 0));
  };
  for (const side of [-1, 1]) { flipper(V(0.18, 0.045, 0.235), 0.52, 0.28, side, 3); flipper(V(-0.30, 0.04, 0.18), 0.22, 0.17, side, 4); }
  return b.toGeometry();
}

// Reef shark (blacktip-like), unit length along +X (nose +0.5 -> caudal tip -0.5).
// aInfo: x = along-body 0..1 (nose->tail) on the body, root->tip 0..1 on fins; y = part id (0 body, 1 dorsal, 2 dorsal2,
// 3 pectoral, 4 pelvic/anal, 5 caudal, 6 eye); z = around-body 0..1 (top = 0.25) on the body, across-chord 0..1 on fins.
export function sharkGeometry(opts = {}) {
  const b = new Builder(), n3 = makeNoise3(41);
  const X0 = 0.5, LEN = 0.86, SMAX = 0.38;
  const g = (s) => s < SMAX ? Math.pow(Math.max(s, 0) / SMAX, 0.68) : 0.24 + 0.76 * Math.pow(1 - (s - SMAX) / (1 - SMAX), 1.15);
  const wB = (s) => 0.094 * g(s) * (1 + 0.12 * Math.exp(-Math.pow((s - 0.16) / 0.10, 2)));
  const hT = (s) => 0.086 * g(s), hB = (s) => 0.068 * g(s);
  const sOf = (x) => Math.min(Math.max((X0 - x) / LEN, 0), 1);
  const topY = (x) => hT(sOf(x));
  const pw = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  // helper: parametric grid with per-vertex aInfo and normals from finite differences
  const xgrid = (nu, nv, fn, infoFn, flip = false) => {
    const base = b.count, e = 1e-3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = fn(u, v);
      const du = fn(Math.min(u + e, 1), v).sub(fn(Math.max(u - e, 0), v)), dv = fn(u, Math.min(v + e, 1)).sub(fn(u, Math.max(v - e, 0)));
      const n = new THREE.Vector3().crossVectors(du, dv);
      if (n.lengthSq() < 1e-14) n.set(0, 1, 0); else n.normalize();
      if (flip) n.negate();
      b.vertex(p, n, u, v, infoFn(u, v));
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, bb = a + 1, c = a + nu + 1, d = c + 1;
      if (flip) { b.tri(a, c, bb); b.tri(bb, c, d); } else { b.tri(a, bb, c); b.tri(bb, d, c); }
    }
  };
  // ---- body: elliptic rings along the length; u = around (top at 0.25), v = nose -> peduncle
  const SEND = 0.99;
  const body = (u, v) => {
    const s = v * SEND, a = u * 6.283185, ca = Math.cos(a), sa = Math.sin(a), x = X0 - LEN * s;
    const w = wB(s), h = sa >= 0 ? hT(s) : hB(s);
    const bump = 1 + 0.02 * n3(x * 6, ca * 2, sa * 2);
    return V(x, 0.004 * Math.sin(Math.PI * Math.min(s * 1.2, 1)) + h * pw(sa, 0.87) * bump, w * pw(ca, 0.87) * bump);
  };
  xgrid(48, 64, body, (u, v) => [v * SEND * LEN, 0, u, 0], false);
  // ---- fins
  const dorsal = (xa, xb, H, sw, part, down) => {
    const xl = (v) => xa - sw * Math.pow(v, 1.15);
    const xt = (v) => xb + (xl(1) - 0.008 - xb) * Math.pow(v, 1.7);
    xgrid(10, 9, (u, v) => { const x = xl(v) + (xt(v) - xl(v)) * u; return V(x, (down ? -1 : 1) * (topOrBot(x, down) + H * v - 0.004), 0); }, (u, v) => [v, part, u, 0], !!down);
  };
  const topOrBot = (x, down) => down ? hB(sOf(x)) : hT(sOf(x));
  dorsal(0.14, -0.02, 0.135, 0.075, 1, false);
  dorsal(-0.255, -0.31, 0.030, 0.02, 2, false);
  dorsal(-0.255, -0.305, 0.028, 0.02, 4, true);
  // pectoral: swept, sickle-shaped, drooping
  for (const side of [-1, 1]) {
    const xa = 0.235, xb0 = 0.09;
    xgrid(10, 12, (u, v) => {
      const xl = xa - 0.13 * Math.pow(v, 1.5);
      const ch = xb0 * (1 - 0.86 * Math.pow(v, 0.9)) + 0.006;
      const x = xl - ch * Math.pow(u, 0.95);
      const y = -0.034 - 0.062 * Math.pow(v, 1.25) - 0.006 * u;
      const z = side * (wB(sOf(xa)) * 0.86 + 0.19 * v);
      return V(x, y, z);
    }, (u, v) => [v, 3, u, 0], side > 0);
    // pelvic: small
    xgrid(6, 5, (u, v) => {
      const xl = -0.03 - 0.03 * v, ch = 0.05 * (1 - 0.7 * v);
      return V(xl - ch * u, -hB(sOf(-0.03)) * 0.9 - 0.03 * v, side * (0.03 + 0.03 * v));
    }, (u, v) => [v, 4, u, 0], side > 0);
  }
  // caudal: unequal lunate lobes meeting at a notch
  const lobe = (base0, base1, tip, notch, part, flip) => {
    xgrid(10, 8, (u, v) => {
      const L = base0.clone().lerp(tip, u), T = base1.clone().lerp(notch, u);
      const p = L.lerp(T, v);
      p.x -= 0.012 * Math.sin(Math.PI * u) * (1 - v);
      return p;
    }, (u, v) => [u, part, v, 0], flip);
  };
  lobe(V(-0.352, 0.022, 0), V(-0.378, 0.002, 0), V(-0.508, 0.165, 0), V(-0.445, 0.026, 0), 5, false);
  lobe(V(-0.358, -0.020, 0), V(-0.378, 0.002, 0), V(-0.488, -0.095, 0), V(-0.445, 0.026, 0), 5, true);
  // eyes
  const es = 0.105, ex = X0 - LEN * es, ey = 0.011, ez = wB(es) * 0.96;
  const ico = new THREE.IcosahedronGeometry(1, 2); ico.deleteAttribute('uv');
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', ico.attributes.position); eg.setAttribute('normal', ico.attributes.normal);
  for (const sd of [-1, 1]) b.addGeometry(eg, new THREE.Matrix4().compose(V(ex, ey, sd * ez), new THREE.Quaternion(), V(0.0085, 0.0085, 0.0065)), [0.1, 6, sd > 0 ? 1 : 0, 0]);
  if (opts.hammer) {                                       // hammerhead: a wide, flat cephalofoil with the eyes at its tips
    const W = 0.20;
    const plate = (top) => (u, v) => {
      const z = (u * 2 - 1) * W, zz = Math.abs(z) / W, xle = 0.548 - 0.095 * zz * zz, xte = 0.402 - 0.02 * zz * zz, x = xle + (xte - xle) * v;
      const th = 0.05 * Math.sqrt(Math.max(1 - zz * zz, 0)) * Math.pow(Math.sin(Math.PI * Math.min(Math.max(v, 0.001), 0.999)), 0.7) + 0.004;
      return V(x, 0.010 + (top ? th : -th * 0.8), z);
    };
    xgrid(30, 10, plate(true), (u, v) => [0.05 + 0.07 * v, 0, 0.25, 0], true);
    xgrid(30, 10, plate(false), (u, v) => [0.05 + 0.07 * v, 0, 0.75, 0], false);
    for (const sd of [-1, 1]) b.addGeometry(eg, new THREE.Matrix4().compose(V(0.462, 0.016, sd * 0.19), new THREE.Quaternion(), V(0.0105, 0.0105, 0.0085)), [0.1, 6, sd > 0 ? 1 : 0, 0]);
  }
  return b.toGeometry();
}

// ---------------------------------------------------------------------------
// Shading + animation
// ---------------------------------------------------------------------------
export const HERO_VERT = /* glsl */`
attribute vec4 aInfo;
varying vec4 vInfo; varying vec3 vObjP; varying vec3 vObjN;
uniform vec3 uAnchor, uRange;
uniform float uSpeed, uLen, uAvoid, uSchoolT, uKind, uFreq, uAmp;
${SWAY_GLSL}
vec3 heroCenter(float t) {
  float w = uSpeed / max(uRange.x, 1.0);
  return uAnchor + vec3(uRange.x * (sin(w * t + 1.0) + 0.25 * sin(2.1 * w * t + 0.5)),
                        uRange.y * sin(0.61 * w * t + 2.0),
                        uRange.z * (cos(0.83 * w * t) + 0.25 * sin(1.7 * w * t + 2.2)));
}
vec3 heroPos(float t) {
  vec3 p = heroCenter(t);
  vec3 d = p - cameraPosition; float dist = length(d);
  if (dist < uAvoid) p += d / max(dist, 0.05) * pow(1.0 - dist / uAvoid, 2.0) * uAvoid * 0.5;
  return p;
}
`;

export const HERO_FRAG = /* glsl */`
${GLSL_NOISE}
varying vec4 vInfo; varying vec3 vObjP; varying vec3 vObjN;
uniform float uKind;
uniform float uVar;
float fRough; float fAlpha; float fSpec; vec3 fEm;
vec3 heroSurface(vec4 info, vec3 op, vec3 on, float dist) {
  fAlpha = 1.0; fRough = 0.5; fSpec = 0.6; fEm = vec3(0.0);
  vec3 col = vec3(0.3);
  float part = info.y;
  if (uKind < 0.5) {                                      // ---- shark (blacktip reef shark)
    float t = info.x, v = info.z;
    float top = sin(6.2831853 * v);
    if (part > 5.5 && part < 6.5) { fRough = 0.08; return vec3(0.004); }
    if (part < 0.5) {
      float belly = smoothstep(0.02, -0.50, top);
      float flank = smoothstep(0.62, 0.05, top);
      col = mix(vec3(0.045, 0.047, 0.048), vec3(0.16, 0.16, 0.155), flank);
      col = mix(col, vec3(0.80, 0.79, 0.75), belly);
      col = mix(col, col * 1.18, smoothstep(0.22, 0.0, abs(top + 0.15 - 0.05 * sin(t * 14.0))) * smoothstep(0.30, 0.45, t) * 0.4);
      if (uVar > 0.5) {                                    // other sharks: 1 great white, 2 hammerhead, 3 tiger
        vec3 backC = uVar < 1.5 ? vec3(0.085, 0.100, 0.115) : (uVar < 2.5 ? vec3(0.130, 0.115, 0.090) : vec3(0.100, 0.120, 0.125));
        vec3 flankC = uVar < 1.5 ? vec3(0.250, 0.275, 0.300) : (uVar < 2.5 ? vec3(0.220, 0.200, 0.160) : vec3(0.220, 0.250, 0.250));
        vec3 bellyC = uVar < 1.5 ? vec3(0.880, 0.890, 0.880) : (uVar < 2.5 ? vec3(0.720, 0.700, 0.640) : vec3(0.800, 0.820, 0.780));
        col = mix(backC, flankC, flank);
        col = mix(col, bellyC, smoothstep(0.02, -0.50, top - 0.05 * sin(t * 11.0 + 1.0)));
        if (uVar > 2.5) {                                  // tiger: dark bars on the flanks that fade toward the tail
          float bars = smoothstep(0.50, 0.85, vn2(vec2(t * 16.0, top * 2.2 + 3.0))) * smoothstep(0.12, 0.45, t) * smoothstep(-0.35, 0.3, top);
          col = mix(col, col * 0.40, bars * 0.75);
        }
      }
      col *= 0.88 + 0.24 * fbm3(op * 8.0, 3);
      // five gill slits behind the head, and the mouth crescent under the snout
      for (int i = 0; i < 5; i++) {
        float c = 0.205 + float(i) * 0.022;
        col *= 1.0 - 0.6 * smoothstep(0.0035, 0.0, abs(t - c - 0.006 * top) - 0.0012) * smoothstep(-0.65, -0.05, top) * smoothstep(0.80, 0.30, top);
      }
      float mouth = smoothstep(0.02, 0.0, abs(t - (0.115 + 0.03 * (1.0 - abs(top + 1.0)))) - 0.002) * smoothstep(-0.7, -0.98, top);
      col *= 1.0 - 0.7 * mouth;
      float sc = 1.0 - smoothstep(4.0, 18.0, dist);
      col *= 1.0 - 0.06 * sc * vn3(op * 240.0);
      fRough = 0.46;
    } else {                                              // fins (info.x = root -> tip; caudal: base -> tip)
      float tip = info.x;
      col = vec3(0.13, 0.13, 0.125);
      if (part < 1.5) {                                    // first dorsal: black tip over a white band
        col = mix(col, vec3(0.85, 0.84, 0.80), smoothstep(0.52, 0.60, tip) * (1.0 - smoothstep(0.66, 0.74, tip)));
        col = mix(col, vec3(0.02), smoothstep(0.72, 0.82, tip));
      } else if (part < 2.5) col = mix(col, vec3(0.04), smoothstep(0.55, 0.85, tip) * 0.6);
      else if (part < 3.5) col = mix(col, vec3(0.03), smoothstep(0.78, 0.95, tip));
      else if (part < 4.5) col = vec3(0.16, 0.16, 0.155) * (1.0 - 0.6 * smoothstep(0.6, 1.0, tip));
      else col = mix(col, vec3(0.03), smoothstep(0.55, 0.95, tip));
      if (uVar > 0.5) {
        col = uVar < 1.5 ? vec3(0.125, 0.135, 0.145) : (uVar < 2.5 ? vec3(0.115, 0.105, 0.085) : vec3(0.115, 0.125, 0.125));
        if (part > 4.5 || (part > 2.5 && part < 3.5)) col = mix(col, vec3(0.03), smoothstep(0.72, 0.98, tip) * 0.7);
      }
      col *= 0.9 + 0.2 * fbm3(op * 10.0, 2);
      fRough = 0.5;
    }
    return col;
  } else if (uKind < 1.5) {                               // ---- manta
    float upper = 1.0 - step(0.5, part);
    if (part > 1.5) { col = vec3(0.04, 0.04, 0.05); fRough = 0.6; return col; }        // tail / horns dark
    float z = op.z / 2.1;
    if (upper > 0.5) {
      col = vec3(0.012, 0.018, 0.03);
      // white shoulder patches ("epaulettes") and pale chevron on the head
      float sh = smoothstep(0.02, 0.0, abs(abs(z) - 0.20 - 0.05 * sin(op.x * 3.0)) - 0.035) * smoothstep(0.5, 0.0, abs(op.x - 0.15));
      float chev = smoothstep(0.06, 0.0, abs(op.x - 0.40 + 0.9 * abs(z)) - 0.02) * smoothstep(0.42, 0.0, abs(z));
      col = mix(col, vec3(0.55, 0.57, 0.6), clamp(sh + chev, 0.0, 1.0) * 0.85);
      col *= 0.9 + 0.2 * fbm3(op * 5.0, 3);
    } else {
      col = mix(vec3(0.7, 0.72, 0.72), vec3(0.15, 0.17, 0.19), smoothstep(0.75, 1.0, abs(z)) * 0.7);
      // dark spots on the belly, gill slits
      vec4 w = worley2(op.xz * 4.5);
      col *= 1.0 - 0.75 * smoothstep(0.18, 0.06, w.x) * step(0.72, w.z) * smoothstep(0.95, 0.4, abs(z));
      col *= 1.0 - 0.6 * smoothstep(0.02, 0.0, abs(fract(op.x * 7.0 - 0.3) - 0.5) - 0.42) * smoothstep(0.5, 0.05, abs(z)) * step(-0.05, op.x) * step(op.x, 0.35);
    }
    fRough = 0.55;
  } else if (uKind < 2.5) {                               // ---- turtle
    float scale = 1.0 - smoothstep(3.0, 16.0, dist);
    if (part > 4.5) { fRough = 0.05; return vec3(0.004); }
    if (part < 0.5) {                                      // carapace scutes
      vec4 w = worley2(op.xz * 4.6 + vec2(op.y * 2.0, 0.0));
      float edge = smoothstep(0.04, 0.14, w.y - w.x);
      float streak = 0.5 + 0.5 * sin(atan(op.z, op.x) * 30.0 + w.z * 40.0);
      vec3 base = mix(vec3(0.075, 0.048, 0.02), vec3(0.19, 0.13, 0.05), w.z);
      col = base * (0.7 + 0.5 * streak * (1.0 - edge * 0.0));
      col *= 0.35 + 0.65 * edge;
      col = mix(col, vec3(0.12, 0.13, 0.05), smoothstep(0.5, 0.75, fbm3(op * 14.0, 3)) * 0.5);      // algae film
      vec4 wb = worley2(op.xz * 30.0 + 7.0);
      col = mix(col, vec3(0.5, 0.47, 0.4), smoothstep(0.20, 0.05, wb.x) * step(0.93, wb.z) * 0.5 * scale);    // barnacle specks
      fRough = 0.32; fSpec = 0.9;
    } else if (part < 1.5) {                               // plastron
      col = vec3(0.42, 0.36, 0.2) * (0.85 + 0.3 * fbm3(op * 8.0, 2));
      fRough = 0.55;
    } else {                                               // skin: head, flippers
      vec4 w = worley2(op.xz * 26.0 + op.y * 20.0);
      float edge = smoothstep(0.04, 0.22, w.y - w.x);
      vec3 base = mix(vec3(0.16, 0.11, 0.055), vec3(0.32, 0.24, 0.11), w.z);
      col = base * (0.5 + 0.5 * edge) * (0.8 + 0.4 * fbm3(op * 9.0, 2));
      if (part > 2.5) col = mix(col, vec3(0.62, 0.55, 0.38), smoothstep(0.32, 0.6, abs(info.z - 0.0)) * 0.0 + 0.0);
      // pale flipper margins
      col = mix(col, vec3(0.55, 0.5, 0.3), smoothstep(0.85, 1.0, op.x * 0.0 + info.x) * 0.0);
      fRough = 0.62;
    }
  } else if (uKind < 3.5) {                               // ---- deep squid: red-brown, chromatophores, photophores
    if (part > 4.5 && part < 5.5) {
      float rim = pow(1.0 - clamp(abs(normalize(on).z), 0.0, 1.0), 1.5);
      fRough = 0.06; return mix(vec3(0.012), vec3(0.35, 0.42, 0.5), rim * 0.7);
    }
    vec4 w = worley3(op * 34.0);
    float spots = smoothstep(0.42, 0.10, w.x);
    col = mix(vec3(0.20, 0.035, 0.028), vec3(0.42, 0.10, 0.07), fbm3(op * 9.0, 2));
    col = mix(col, vec3(0.10, 0.015, 0.02), spots * 0.75);
    if (part > 0.5 && part < 1.5) { fAlpha = 0.55; col *= 0.8; }                  // fins
    if (part > 2.5) col *= 0.85;                                                    // arms
    float lat = step(op.y, -0.04) * smoothstep(0.0, 0.3, op.x + 0.4);
    fEm = vec3(0.25, 0.65, 1.0) * smoothstep(0.88, 1.0, vn3(op * 55.0)) * 1.4 * lat * (part < 0.5 ? 1.0 : 0.0);
    fRough = 0.62;
  } else {                                                // ---- anglerfish
    if (part > 5.5 && part < 6.5) { fRough = 0.06; return vec3(0.01); }
    float t = info.x;
    if (part > 7.5) {                                     // lure (esca) glows
      float pulse = 0.65 + 0.35 * sin(uOptA.x * 2.2);
      float bulb = step(0.99, t) ;
      fEm = vec3(0.30, 0.85, 1.0) * (info.x > 0.99 || part > 7.5 ? 5.0 : 0.0) * pulse * (t > 0.85 ? 1.0 : 0.05);
      return vec3(0.15, 0.2, 0.22);
    }
    if (part > 6.5) { fRough = 0.3; return vec3(0.75, 0.72, 0.65); }                // teeth
    vec4 w = worley3(op * 28.0);
    col = vec3(0.016, 0.012, 0.010) * (0.6 + 0.9 * smoothstep(0.1, 0.5, w.x)) * (0.8 + 0.4 * fbm3(op * 7.0, 3));
    if (part > 0.5 && part < 5.5) { fAlpha = 0.6; col = vec3(0.09, 0.06, 0.05); }
    // mouth cavity
    float low = smoothstep(0.02, 0.0, t) ;
    fRough = 0.55;
  }
  return col;
}
`;

export const ANIM = [
  // 0 shark: body undulation (side to side), pectorals held out, tail beat
  /* glsl */`
    float tA = clamp(0.5 - position.x, 0.0, 1.4);
    float ph = tw * uFreq * 6.2831853 - tA * 4.2;
    transformed.z += uAmp * (0.03 + 0.85 * tA * tA) * sin(ph);`,
  // 1 manta: wing beat, amplitude grows to the wing tips; slow whole-body pitch undulation
  /* glsl */`
    float sp = abs(position.z) / 2.1;
    float ph = tw * uFreq * 6.2831853 - sp * 2.6;
    transformed.y += uAmp * (0.05 + 0.95 * pow(sp, 1.6)) * sin(ph) * 2.1 * 0.28 * (aInfo.y > 1.5 ? 0.5 : 1.0);
    transformed.y -= uAmp * 0.06 * pow(sp, 2.0) * 2.1 * 0.28 * (1.0 - cos(ph * 2.0));
    if (aInfo.y > 1.5) transformed.y += 0.08 * sin(ph - (0.5 - position.x) * 2.0) * (0.5 - position.x) * 0.6;`,
  // 2 turtle: front flippers flap (rotate about the shoulder), rear flippers paddle
  /* glsl */`
    float ph = tw * uFreq * 6.2831853;
    if (aInfo.y > 2.5 && aInfo.y < 3.5) {
      vec3 root = vec3(0.17, 0.045, sign(position.z) * 0.20);
      vec3 r = position - root;
      float s = clamp(abs(position.z - root.z) / 0.50, 0.0, 1.0);
      float ang = uAmp * sin(ph + s * 0.9) * (0.25 + 0.75 * s) * sign(position.z);
      float cs = cos(ang), sn = sin(ang);
      transformed = root + vec3(r.x, r.y * cs - r.z * sn, r.y * sn + r.z * cs);
      transformed.x += 0.03 * sin(ph + 1.7) * s;
    } else if (aInfo.y > 3.5 && aInfo.y < 4.5) {
      vec3 root = vec3(-0.28, 0.04, sign(position.z) * 0.15);
      vec3 r = position - root;
      float ang = 0.35 * sin(ph + 2.4) * sign(position.z);
      float cs = cos(ang), sn = sin(ang);
      transformed = root + vec3(r.x, r.y * cs - r.z * sn, r.y * sn + r.z * cs);
    } else if (aInfo.y > 1.5 && aInfo.y < 2.5) {
      transformed.y += 0.012 * sin(ph * 0.5) * (position.x - 0.3) * 3.0;
      transformed.z += 0.02 * sin(ph * 0.5 + 1.0) * (position.x - 0.3) * 2.0;
    }
    transformed.y += 0.012 * sin(ph);                       // body bob with each stroke`,
  // 3 squid: jet pulses (mantle contracts), fins ripple, arms trail
  /* glsl */`
    float ph = tw * uFreq * 6.2831853;
    float jet = 0.5 + 0.5 * sin(ph);
    if (aInfo.y < 0.5) { transformed.yz *= 1.0 - 0.10 * jet; transformed.x += 0.02 * jet; }
    if (aInfo.y > 0.5 && aInfo.y < 1.5) transformed.y += 0.05 * sin(ph * 0.6 - (position.x + 0.5) * 9.0) * abs(position.z) * 3.0;
    if (aInfo.y > 2.5) {
      float along = clamp((position.x - 0.55) / 0.8, 0.0, 1.0);
      transformed.y += 0.05 * along * sin(ph * 0.8 - along * 3.0 + aInfo.x * 6.0);
      transformed.z += 0.04 * along * cos(ph * 0.6 - along * 2.5);
      transformed.x -= 0.03 * along * jet;
    }`,
  // 4 angler: slow body undulation, lure bobs
  /* glsl */`
    float tA = clamp(0.5 - position.x, 0.0, 1.4);
    float ph = tw * uFreq * 6.2831853 - tA * 3.0;
    transformed.z += uAmp * (0.03 + 0.7 * tA * tA) * sin(ph);
    if (aInfo.y > 7.5) { transformed.y += 0.02 * sin(ph * 2.0 + 1.0) * (position.x - 0.3); transformed.z += 0.02 * cos(ph * 1.7) * (position.x - 0.3); }`,
];

export function heroMaterial(kind, uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
  mat.alphaToCoverage = true;
  uw(mat, 'hero' + kind, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + HERO_VERT)
      .replace('#include <beginnormal_vertex>', `
        float tw = uOptA.x + uSchoolT * 5.3;
        vec3 P0 = heroPos(tw);
        vec3 vel = (heroPos(tw + 0.5) - P0) / 0.5;
        float spd = length(vel);
        vec3 fwd = spd > 1e-3 ? vel / spd : vec3(1.0, 0.0, 0.0);
        vec3 sideV = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)) + 1e-5);
        vec3 upV = cross(sideV, fwd);
        // bank into turns
        vec3 accel = (heroPos(tw + 1.2) - 2.0 * P0 + heroPos(tw - 1.2)) / 1.44;
        float bank = clamp(dot(accel, sideV) * 0.35, -0.5, 0.5);
        float cb = cos(bank), sb = sin(bank);
        vec3 upB = upV * cb + sideV * sb; vec3 sideB = sideV * cb - upV * sb;
        vec3 objectNormal = normal.x * fwd + normal.y * upB + normal.z * sideB;`)
      .replace('#include <begin_vertex>', `
        vInfo = aInfo; vObjP = position; vObjN = normal;
        vec3 transformed = position;
        ${ANIM[kind]}
        vec3 lp = transformed * uLen;`)
      .replace('#include <project_vertex>', `
        vec3 wpos = P0 + fwd * lp.x + upB * lp.y + sideB * lp.z;
        vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_pars_begin>', HERO_FRAG + '\n#include <lights_pars_begin>')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = heroSurface( vInfo, vObjP, normalize( vObjN ), length( vViewPosition ) );
        diffuseColor.a = fAlpha;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = fRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += fEm;')
      .replace('#include <alphatest_fragment>', '');
  });
  return mat;
}

// ---------------------------------------------------------------------------
// Manager: a few slots per kind streamed from a coarse grid
// ---------------------------------------------------------------------------
const CELL = 90;
const KINDS = {
  shark:  { kind: 0, len: 2.0,  speed: 1.1, freq: 0.75, amp: 0.10, range: [34, 2.5, 34], hover: [3, 14],  depth: [8, 400],  prob: 0.16, slots: 3, geo: sharkGeometry },
  manta:  { kind: 1, len: 1.0,  speed: 0.9, freq: 0.32, amp: 0.55, range: [38, 3.0, 38], hover: [3, 20],  depth: [8, 400],  prob: 0.07, slots: 2, geo: () => mantaGeometry() },
  squid:  { kind: 3, len: 0.85, speed: 0.55, freq: 0.7, amp: 0.1, range: [26, 6, 26], column: [160, 1600], depth: [200, 5000], prob: 0.10, slots: 2, geo: () => squidGeometry() },
  angler: { kind: 4, len: 0.5, speed: 0.10, freq: 0.45, amp: 0.10, range: [5, 1.5, 5], column: [450, 2500], depth: [500, 5000], prob: 0.10, slots: 2, geo: () => anglerGeometry() },
  turtle: { kind: 2, len: 1.25, speed: 0.4, freq: 0.24, amp: 0.55, range: [16, 1.5, 16], hover: [0.8, 3], depth: [1.5, 22], prob: 0.22, slots: 3, geo: () => turtleGeometry() },
};

export class Heroes {
  constructor(scene, world) {
    this.world = world; this.group = new THREE.Group(); scene.add(this.group);
    this.entries = [];
    for (const [name, k] of Object.entries(KINDS)) {
      const geo = k.geo();
      const slots = [];
      for (let s = 0; s < k.slots; s++) {
        const uniforms = {
          uAnchor: { value: new THREE.Vector3() }, uRange: { value: new THREE.Vector3(...k.range) }, uSpeed: { value: k.speed }, uLen: { value: k.len },
          uAvoid: { value: 3.0 }, uSchoolT: { value: 0 }, uKind: { value: k.kind }, uFreq: { value: k.freq }, uAmp: { value: k.amp },
        };
        const mesh = new THREE.Mesh(geo, heroMaterial(k.kind, uniforms));
        mesh.frustumCulled = false; mesh.visible = false;
        this.group.add(mesh);
        slots.push({ mesh, uniforms, key: null });
      }
      this.entries.push({ name, k, slots });
    }
    this.lcx = 1e9; this.lcz = 1e9;
  }

  update(cam, force = false) {
    const ccx = Math.floor(cam.x / (CELL / 2)), ccz = Math.floor(cam.z / (CELL / 2));
    if (!force && ccx === this.lcx && ccz === this.lcz) return;
    this.lcx = ccx; this.lcz = ccz;
    for (const e of this.entries) {
      const R = 220, rc = Math.ceil(R / CELL), cands = [];
      const ccx0 = Math.floor(cam.x / CELL), ccz0 = Math.floor(cam.z / CELL);
      for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
        const cx = ccx0 + dx, cz = ccz0 + dz, rnd = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ hashStr(e.name)) >>> 0);
        if (rnd() > e.k.prob) continue;
        const x = (cx + 0.15 + 0.7 * rnd()) * CELL, z = (cz + 0.15 + 0.7 * rnd()) * CELL;
        const h = this.world.height(x, z), depth = -h;
        if (depth < e.k.depth[0] || depth > e.k.depth[1]) continue;
        let y;
        if (e.k.column) { const d0 = e.k.column[0], d1 = Math.min(e.k.column[1], depth - 12); if (d1 <= d0) continue; y = -(d0 + rnd() * (d1 - d0)); }
        else { const hover = e.k.hover[0] + rnd() * (e.k.hover[1] - e.k.hover[0]); y = Math.min(h + hover, -(2 + e.k.range[1])); }
        if (y - h < e.k.range[1] + 1.2) continue;
        cands.push({ key: e.name + ':' + cx + ',' + cz, x, y, z, d: Math.hypot(x - cam.x, z - cam.z), seed: rnd() * 50 });
      }
      cands.sort((a, b) => a.d - b.d);
      const want = new Set(cands.slice(0, e.slots.length + 1).map((c) => c.key));
      for (const s of e.slots) if (s.key && !want.has(s.key)) { s.key = null; s.mesh.visible = false; }
      for (const c of cands) {
        if (e.slots.some((s) => s.key === c.key)) continue;
        const free = e.slots.find((s) => !s.key); if (!free) break;
        free.key = c.key; free.mesh.visible = true;
        free.uniforms.uAnchor.value.set(c.x, c.y, c.z); free.uniforms.uSchoolT.value = c.seed;
      }
    }
  }
}
