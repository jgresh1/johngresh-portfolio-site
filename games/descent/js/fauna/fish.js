// Schools of fish. Positions, headings and body undulation are computed analytically in the
// vertex shader from per-fish seeds + time, so thousands of fish cost almost nothing on the CPU
// and any time value renders deterministically.
// Each school = an opaque body mesh + a translucent fin mesh (fin rays, membrane) sharing the same seeds.
import * as THREE from 'three';
import { GLSL_NOISE } from '../glsl.js';
import { uw, SWAY_GLSL } from '../optics.js';
import { fishGeometry } from './fishgen.js';
import { mulberry32, hashStr } from '../flora/geom.js';

// ---------------------------------------------------------------------------
// Species. pattern: 0 countershaded silver, 1 bars, 2 gradient (anthias), 3 tang, 4 butterfly, 5 stripe,
// 6 parrot, 7 lanternfish, 8 clownfish. colours are linear albedo. sheen = environment-reflection strength.
// ---------------------------------------------------------------------------
export const SPECIES = {
  jack: {
    finSolid: 0.0,
    len: 0.52, count: 420, pelagic: true, cell: 60, R: 160, mode: 0, speed: 1.5, freq: 2.2, bend: 0.10, spread: [5.5, 4.0, 5.5], range: [22, 5, 22], hover: [4, 14], depth: [6, 60], prob: 0.12, slots: 4,
    geo: { depth: 0.34, width: 0.36, body: 'jack', snout: 0.30, hump: 0.10, tail: { span: 0.25, length: 0.21, fork: 0.60, taper: 0.46, lobe: 0.95 }, dorsal: { a: 0.27, b: 0.43, h: 0.065, sweep: 0.03 }, dorsal2: { a: 0.47, b: 0.85, h: 0.085, skew: 0.30 }, anal: { a: 0.52, b: 0.85, h: 0.06 }, pect: { size: 0.24, y: -0.12, shape: 'sickle', aspect: 0.30, t: 0.25 }, eye: 0.014, eyeT: 0.085 },
    pattern: 0, colA: [0.030, 0.075, 0.095], colB: [0.62, 0.68, 0.70], colC: [0.80, 0.80, 0.76], colD: [0.75, 0.62, 0.15], finCol: [0.24, 0.24, 0.17], irid: 0.8, sheen: 0.9, pat2: [1, 0.85, 0, 0.30],
  },
  anthias: {
    finSolid: 0.55,
    len: 0.105, count: 80, cell: 13, R: 55, mode: 1, speed: 0.15, freq: 5.5, bend: 0.12, spread: [2.4, 1.3, 2.4], range: [0.4, 0.2, 0.4], hover: [1.2, 3.5], depth: [3, 40], prob: 0.50, slots: 14,
    geo: { depth: 0.30, width: 0.40, body: 'deep', tail: { span: 0.25, length: 0.24, fork: 0.85, taper: 0.3 }, dorsal: { a: 0.28, b: 0.72, h: 0.14, skew: 0.5 }, anal: { a: 0.64, b: 0.85, h: 0.08 }, pect: { size: 0.16, y: -0.08 }, eye: 0.030 },
    pattern: 2, colA: [0.62, 0.16, 0.24], colB: [0.85, 0.42, 0.22], colC: [0.70, 0.18, 0.34], colD: [0.9, 0.7, 0.2], finCol: [0.72, 0.18, 0.36], sheen: 0.30,
  },
  chromis: {
    finSolid: 0.45,
    len: 0.085, count: 110, cell: 13, R: 55, mode: 1, speed: 0.12, freq: 6.5, bend: 0.12, spread: [2.2, 1.0, 2.2], range: [0.3, 0.2, 0.3], hover: [0.8, 2.2], depth: [1.5, 20], prob: 0.55, slots: 14,
    geo: { depth: 0.36, width: 0.38, body: 'deep', tail: { span: 0.28, length: 0.24, fork: 0.85, taper: 0.3 }, dorsal: { a: 0.30, b: 0.70, h: 0.13 }, anal: { a: 0.62, b: 0.84, h: 0.09 }, pect: { size: 0.14, y: -0.08 }, eye: 0.034 },
    pattern: 0, colA: [0.03, 0.20, 0.36], colB: [0.15, 0.52, 0.64], colC: [0.50, 0.70, 0.72], colD: [0.04, 0.14, 0.22], finCol: [0.10, 0.40, 0.48], irid: 1, sheen: 0.6,
  },
  sergeant: {
    finSolid: 0.7,
    len: 0.14, count: 26, cell: 14, R: 55, mode: 1, speed: 0.2, freq: 4.5, bend: 0.11, spread: [3.5, 1.4, 3.5], range: [0.8, 0.3, 0.8], hover: [0.8, 2.6], depth: [1.2, 15], prob: 0.55, slots: 8,
    geo: { depth: 0.46, width: 0.34, body: 'deep', tail: { span: 0.27, length: 0.20, fork: 0.5, taper: 0.35 }, dorsal: { a: 0.26, b: 0.78, h: 0.16 }, anal: { a: 0.58, b: 0.84, h: 0.11 }, pect: { size: 0.17, y: -0.1 }, eye: 0.030 },
    pattern: 1, colA: [0.72, 0.68, 0.16], colB: [0.60, 0.62, 0.50], colC: [0.70, 0.66, 0.2], colD: [0.02, 0.02, 0.03], finCol: [0.55, 0.55, 0.22], sheen: 0.22,
  },
  tang: {
    finSolid: 0.85,
    len: 0.26, count: 9, cell: 20, R: 80, mode: 0, speed: 0.6, freq: 2.8, bend: 0.08, spread: [3, 1.2, 3], range: [9, 1.2, 9], hover: [0.7, 3], depth: [1.5, 25], prob: 0.30, slots: 5,
    geo: { depth: 0.52, width: 0.30, body: 'deep', tail: { span: 0.20, length: 0.20, fork: 0.35, taper: 0.4 }, dorsal: { a: 0.20, b: 0.80, h: 0.16 }, anal: { a: 0.50, b: 0.82, h: 0.14 }, pect: { size: 0.20, y: -0.1 }, eye: 0.026, snout: 0.25 },
    pattern: 3, colA: [0.02, 0.12, 0.62], colB: [0.05, 0.24, 0.76], colC: [0.62, 0.50, 0.04], colD: [0.012, 0.014, 0.04], finCol: [0.04, 0.16, 0.60], irid: 0.5, sheen: 0.45,
  },
  butterfly: {
    finSolid: 0.9,
    len: 0.16, count: 4, cell: 18, R: 70, mode: 0, speed: 0.4, freq: 3.2, bend: 0.06, spread: [1.2, 0.8, 1.2], range: [7, 0.8, 7], hover: [0.6, 2.2], depth: [2, 25], prob: 0.28, slots: 5,
    geo: { depth: 0.66, width: 0.26, body: 'deep', superN: 2.2, tail: { span: 0.2, length: 0.15, fork: 0.0, taper: 0.5 }, dorsal: { a: 0.22, b: 0.78, h: 0.17 }, anal: { a: 0.52, b: 0.80, h: 0.15 }, pect: { size: 0.17, y: -0.05 }, eye: 0.03, snout: 0.5 },
    pattern: 4, colA: [0.72, 0.56, 0.03], colB: [0.88, 0.82, 0.66], colC: [0.72, 0.58, 0.04], colD: [0.01, 0.01, 0.02], finCol: [0.66, 0.50, 0.04], sheen: 0.15,
  },
  parrot: {
    finSolid: 0.65,
    len: 0.42, count: 6, cell: 22, R: 90, mode: 0, speed: 0.7, freq: 2.2, bend: 0.07, spread: [3.5, 1.4, 3.5], range: [12, 1.2, 12], hover: [0.8, 3], depth: [1.5, 30], prob: 0.24, slots: 4,
    geo: { depth: 0.34, width: 0.46, body: 'parrot', tail: { span: 0.22, length: 0.18, fork: 0.2, taper: 0.4 }, dorsal: { a: 0.26, b: 0.82, h: 0.09 }, anal: { a: 0.56, b: 0.84, h: 0.08 }, pect: { size: 0.19, y: -0.1 }, eye: 0.020, snout: 0.1, hump: 0.1 },
    pattern: 6, colA: [0.03, 0.34, 0.30], colB: [0.60, 0.20, 0.42], colC: [0.08, 0.40, 0.42], colD: [0.5, 0.2, 0.3], finCol: [0.10, 0.40, 0.42], sheen: 0.28,
  },
  snapper: {
    finSolid: 0.15,
    len: 0.36, count: 46, pelagic: true, mode: 0, speed: 0.55, freq: 2.4, bend: 0.09, spread: [4, 2.4, 4], range: [8, 2, 8], hover: [1.5, 8], depth: [4, 50], prob: 0.16, slots: 3,
    geo: { depth: 0.31, width: 0.40, body: 'fusiform', snout: 0.1, tail: { span: 0.22, length: 0.19, fork: 0.5, taper: 0.4 }, dorsal: { a: 0.30, b: 0.72, h: 0.10 }, anal: { a: 0.62, b: 0.84, h: 0.08 }, pect: { size: 0.17, y: -0.1 }, eye: 0.022 },
    pattern: 5, colA: [0.50, 0.46, 0.22], colB: [0.72, 0.70, 0.48], colC: [0.78, 0.72, 0.60], colD: [0.72, 0.58, 0.06], finCol: [0.60, 0.50, 0.12], sheen: 0.4,
  },
  barracuda: {
    finSolid: 0.2,
    len: 0.95, count: 16, pelagic: true, cell: 90, R: 200, mode: 0, speed: 0.9, freq: 1.6, bend: 0.06, spread: [4, 1.6, 4], range: [16, 2, 16], hover: [3, 12], depth: [5, 60], prob: 0.07, slots: 2,
    geo: { depth: 0.13, width: 0.6, body: 'torpedo', stations: 36, tail: { span: 0.14, length: 0.13, fork: 0.55, taper: 0.4 }, dorsal: { a: 0.62, b: 0.72, h: 0.05 }, dorsal2: { a: 0.80, b: 0.88, h: 0.05 }, anal: { a: 0.78, b: 0.86, h: 0.05 }, pect: { size: 0.09, y: -0.15 }, pelv: { size: 0.05, a: 0.55 }, eye: 0.014, snout: 0.35 },
    pattern: 0, colA: [0.05, 0.075, 0.07], colB: [0.52, 0.55, 0.54], colC: [0.72, 0.72, 0.66], colD: [0.08, 0.08, 0.07], finCol: [0.25, 0.26, 0.22], sheen: 0.7,
  },
  fusilier: {
    finSolid: 0.1,
    len: 0.22, count: 300, pelagic: true, cell: 60, R: 150, mode: 0, speed: 2.0, freq: 3.4, bend: 0.11, spread: [6, 2.6, 6], range: [22, 3, 22], hover: [3, 12], depth: [5, 45], prob: 0.12, slots: 4,
    geo: { depth: 0.22, width: 0.42, body: 'fusiform', tail: { span: 0.28, length: 0.24, fork: 0.85, taper: 0.3 }, dorsal: { a: 0.36, b: 0.72, h: 0.07 }, anal: { a: 0.64, b: 0.84, h: 0.06 }, pect: { size: 0.16, y: -0.1 }, eye: 0.026 },
    pattern: 5, colA: [0.06, 0.24, 0.60], colB: [0.60, 0.66, 0.70], colC: [0.80, 0.80, 0.78], colD: [0.75, 0.62, 0.06], finCol: [0.55, 0.50, 0.15], irid: 1, sheen: 0.6,
  },
  // clownfish live on anemones (placed from the anemone instances, see Schools.update)
  clown: {
    finSolid: 1.0,
    len: 0.085, count: 3, symbiont: 'anemone', avoid: 0.7, R: 42, mode: 1, speed: 0.02, freq: 6.5, bend: 0.13, spread: [0.16, 0.07, 0.16], range: [0.05, 0.02, 0.05], hover: [0, 0], depth: [1, 20], prob: 0, slots: 6,
    geo: { depth: 0.46, width: 0.42, body: 'deep', snout: 0.2, tail: { span: 0.22, length: 0.20, fork: 0.0, taper: 0.5 }, dorsal: { a: 0.22, b: 0.80, h: 0.14, skew: 0.7 }, anal: { a: 0.56, b: 0.80, h: 0.10 }, pect: { size: 0.17, y: -0.1 }, eye: 0.032 },
    pattern: 8, colA: [0.86, 0.27, 0.03], colB: [0.86, 0.34, 0.05], colC: [0.92, 0.91, 0.86], colD: [0.02, 0.015, 0.012], finCol: [0.86, 0.29, 0.04], sheen: 0.12,
  },
};

// small silvery shoals hovering over the lagoon sand, seagrass and reef flat
SPECIES.silverside = {
  finSolid: 0.25,
  len: 0.075, count: 110, cell: 14, R: 40, mode: 1, speed: 0.10, freq: 7.0, bend: 0.12, spread: [2.4, 0.9, 2.4], range: [0.6, 0.2, 0.6], hover: [0.7, 2.0], depth: [1.5, 12], prob: 0.30, slots: 8,
  geo: { depth: 0.20, width: 0.30, body: 'fusiform', snout: 0.08, tail: { span: 0.24, length: 0.22, fork: 0.75, taper: 0.3 }, dorsal: { a: 0.42, b: 0.52, h: 0.06 }, anal: { a: 0.60, b: 0.78, h: 0.05 }, pect: { size: 0.11, y: -0.06 }, eye: 0.040 },
  pattern: 0, colA: [0.10, 0.15, 0.12], colB: [0.70, 0.76, 0.74], colC: [0.88, 0.88, 0.84], colD: [0.60, 0.50, 0.15], finCol: [0.50, 0.50, 0.40], irid: 0.8, sheen: 0.7,
};
// grenadier / rattail: big head, body tapering into a long whip tail, cruising just above the sediment
SPECIES.rattail = {
  finSolid: 0.0,
  len: 0.62, count: 2, mode: 1, speed: 0.10, freq: 1.4, bend: 0.06, spread: [3.5, 0.4, 3.5], range: [2.5, 0.4, 2.5], hover: [0.5, 1.6], depth: [450, 4200], prob: 0.22, slots: 3, cell: 34, R: 90, avoid: 1.2,
  geo: { depth: 0.12, width: 0.85, body: 'rattail', snout: 0.35, superN: 2.2, tail: { span: 0.012, length: 0.03, fork: 0.0, taper: 0.4 }, dorsal: { a: 0.10, b: 0.22, h: 0.05 }, dorsal2: { a: 0.30, b: 0.97, h: 0.010 }, anal: { a: 0.30, b: 0.97, h: 0.012 }, pect: { size: 0.07, y: -0.1 }, pelv: { size: 0.04, a: 0.22 }, eye: 0.022, eyeT: 0.075 },
  pattern: 0, colA: [0.06, 0.055, 0.05], colB: [0.20, 0.175, 0.15], colC: [0.46, 0.42, 0.38], colD: [0.4, 0.3, 0.1], finCol: [0.12, 0.10, 0.09], irid: 0.0, sheen: 0.35,
};
SPECIES.lantern = {
    finSolid: 0.3,
  len: 0.085, count: 200, mode: 0, speed: 0.45, freq: 5.5, bend: 0.12, spread: [3.2, 2.6, 3.2], range: [12, 3, 12], column: [220, 1000], hover: [0, 0], depth: [260, 6000], prob: 0.10, slots: 3,
  geo: { depth: 0.24, width: 0.42, body: 'fusiform', tail: { span: 0.24, length: 0.22, fork: 0.7, taper: 0.35 }, dorsal: { a: 0.36, b: 0.62, h: 0.09 }, anal: { a: 0.64, b: 0.84, h: 0.06 }, pect: { size: 0.13, y: -0.1 }, eye: 0.036, eyeT: 0.10 },
  pattern: 7, colA: [0.015, 0.02, 0.04], colB: [0.30, 0.36, 0.42], colC: [0.5, 0.55, 0.6], colD: [0.1, 0.6, 1.0], finCol: [0.08, 0.1, 0.16], sheen: 0.5,
};
SPECIES.hatchet = {
    finSolid: 0.3,
  len: 0.07, count: 120, mode: 0, speed: 0.3, freq: 6.0, bend: 0.1, spread: [2.4, 2.0, 2.4], range: [7, 2, 7], column: [300, 1100], hover: [0, 0], depth: [340, 6000], prob: 0.08, slots: 2,
  geo: { depth: 0.62, width: 0.30, body: 'deep', tail: { span: 0.16, length: 0.16, fork: 0.5, taper: 0.4 }, dorsal: { a: 0.40, b: 0.55, h: 0.06 }, anal: { a: 0.5, b: 0.8, h: 0.10 }, pect: { size: 0.10, y: -0.2 }, eye: 0.05, eyeT: 0.10, belly: 0.5 },
  pattern: 7, colA: [0.04, 0.05, 0.08], colB: [0.7, 0.74, 0.78], colC: [0.8, 0.82, 0.85], colD: [0.1, 0.6, 1.0], finCol: [0.2, 0.22, 0.26], sheen: 0.8,
};

const VERT = /* glsl */`
attribute vec4 aInfo;
attribute vec4 aSeed;
varying vec4 vInfo;
varying vec3 vObjP;
varying vec3 vObjN;
varying vec4 vSeed;
uniform vec3 uAnchor, uRange, uSpread;
uniform float uSpeed, uLen, uMode, uFreq, uBend, uAvoid, uSchoolT;
uniform vec4 uPat2;
${SWAY_GLSL}

vec3 schoolCenter(float t) {
  float w = uSpeed / max(uRange.x, 1.0);
  return uAnchor + vec3(uRange.x * (sin(w * t + 1.0) + 0.4 * sin(2.3 * w * t + 0.5)),
                        uRange.y * sin(0.7 * w * t + 2.0),
                        uRange.z * (cos(0.83 * w * t) + 0.4 * sin(1.9 * w * t + 2.2)));
}
vec3 fishPos(vec4 sd, float t) {
  vec3 base = sd.xyz * 2.0 - 1.0;
  float r = length(base); base = r > 1.0 ? base / r * (0.6 + 0.4 * fract(sd.w * 7.31)) : base;
  vec3 wob = vec3(sin(t * 0.9 + sd.x * 40.0), sin(t * 1.1 + sd.y * 40.0), sin(t * 0.7 + sd.z * 40.0)) * (uMode > 0.5 ? 0.22 : 0.09);   // travelling schools hold station
  float breathe = 1.0 + 0.25 * sin(t * 0.33 + uSchoolT);
  vec3 p = schoolCenter(t) + (base * breathe + wob) * uSpread;
  // fish keep away from the diver
  vec3 d = p - cameraPosition; float dist = length(d);
  if (dist < uAvoid) p += d / max(dist, 0.05) * pow(1.0 - dist / uAvoid, 2.0) * uAvoid * 0.9;
  return p;
}
`;

const FRAG = /* glsl */`
${GLSL_NOISE}
varying vec4 vInfo;
varying vec3 vObjP;
varying vec3 vObjN;
varying vec4 vSeed;
uniform vec3 uColA, uColB, uColC, uColD, uFinCol;
uniform vec4 uPat;      // x pattern id, y iridescence, z environment sheen, w fin opacity (0 glassy .. 1 solid)
uniform vec4 uPat2;     // x sickle pectorals (no leaf cut), y countershade extent 0..1, z unused, w individual roll amount (radians)
uniform float uLen;
float fRough; float fAlpha; float fSheen; float fH; vec3 fEmis; vec3 fEmisSun;

vec3 uwBumpNormal(vec3 surfPos, vec3 surfNorm, float h, float faceDir) {
  vec2 dH = vec2(dFdx(h), dFdy(h));
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 R1 = cross(sy, surfNorm), R2 = cross(surfNorm, sx);
  float det = dot(sx, R1);
  vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
  vec3 v = abs(det) * surfNorm - grad;
  float l2 = dot(v, v);
  if (!(l2 > 1e-30) || abs(det) < 1e-9) return surfNorm;
  return v * inversesqrt(l2);
}

float ridgeLine(float x, float c, float w) { return smoothstep(w, 0.0, abs(x - c)); }
float bandW(float t, float c, float w) { return smoothstep(w, w * 0.6, abs(t - c)); }

// shingled scales in (t, v) space: returns dome height 0..1, a per-scale id, and the dark rear rim.
// Irregular: rows are jittered, scales vary in size, and the lattice is warped so it never reads as a grid.
float fishScales(vec2 uv, float N, out float id, out float rim) {
  vec2 warp = vec2(vn2(uv * 9.0), vn2(uv * 9.0 + 5.3)) - 0.5;
  vec2 suv = vec2(uv.x * N, uv.y * N * 0.46) + warp * 0.9;
  float row = floor(suv.y);
  suv.x += 0.5 * mod(row, 2.0) + 0.35 * (h11(row + 3.0) - 0.5);
  vec2 cell = floor(suv), f = fract(suv) - 0.5;
  id = h21(cell + 17.0);
  float sz = 0.86 + 0.28 * fract(id * 7.7);
  float d = length(vec2(f.x * 0.9, f.y * 1.05)) / sz;
  rim = smoothstep(0.34, 0.52, d);
  return 1.0 - smoothstep(0.0, 0.70, d);
}

vec3 fishSurface(vec4 info, vec3 op, vec3 on, vec4 seed, float dist) {
  float t = info.x, part = info.y, v = info.z;
  float top = sin(6.2831853 * v);                        // +1 dorsal, -1 ventral
  fAlpha = 1.0; fRough = 0.40; fSheen = uPat.z; fH = 0.0; fEmis = vec3(0.0); fEmisSun = vec3(0.0);
  float pat = uPat.x;

  // ------------------------------------------------------------------ eye
  if (part > 5.5 && part < 6.5) {
    float side = info.z > 0.5 ? 1.0 : -1.0;
    vec3 nn = normalize(on);
    float c = nn.z * side;                                   // cosine of the angle from the eye axis (1 = looking straight out of the eye)
    float ang = acos(clamp(c, -1.0, 1.0));                   // 0 at the centre of the eye
    float az = atan(nn.y, nn.x * side + 1e-4);               // angle around the eye axis
    // wide silvery-gold iris with fine radial fibres, a small round pupil, a thin dark limbus, then the dark orbit
    float fib = 0.5 + 0.5 * sin(az * 34.0 + 5.0 * vn2(vec2(az * 2.5, ang * 7.0)));
    vec3 irisIn = vec3(0.50, 0.33, 0.09), irisOut = mix(vec3(0.95, 0.86, 0.58), uColC, 0.20);
    vec3 iris = mix(irisIn, irisOut, smoothstep(0.30, 1.00, ang)) * (0.80 + 0.32 * fib);
    iris = mix(iris, uColD * 0.9, 0.10);
    vec3 skin = mix(vec3(0.07, 0.065, 0.06), uColA * 0.55, 0.5);                                    // dark orbit
    const float EYE_R = 1.30;                                                                       // edge of the visible eye (rad)
    vec3 col = mix(iris, skin, smoothstep(EYE_R - 0.07, EYE_R + 0.02, ang));
    col *= 1.0 - 0.62 * smoothstep(0.10, 0.0, abs(ang - (EYE_R - 0.10)));                           // dark limbus
    col = mix(col, vec3(0.003), smoothstep(0.52, 0.46, ang));                                       // pupil
    fRough = 0.05; fSheen = 0.0;
    vec3 Ld = normalize(vec3(0.32, 0.58, 0.75));
    vec3 ns = nn * vec3(1.0, 1.0, side);
    float cat = smoothstep(0.988, 0.998, dot(ns, Ld)) + 0.35 * smoothstep(0.975, 0.995, dot(ns, normalize(vec3(-0.45, -0.25, 0.85))));
    fEmisSun = vec3(0.55) * cat;
    fEmis = vec3(0.04, 0.08, 0.12) * pow(1.0 - c, 3.0) * smoothstep(EYE_R + 0.05, EYE_R - 0.2, ang) + iris * 0.16 * smoothstep(0.50, 0.62, ang) * smoothstep(EYE_R, EYE_R - 0.25, ang);     // catch-lights + a bluish wet sheen near the rim + the iris glows a little (eyes always read)
    return col;
  }

  // ------------------------------------------------------------------ fins (translucent membrane + rays)
  if (part > 0.5 && part < 5.5) {
    float outward = (part < 2.5) ? info.z : info.w;      // 0 at the base -> 1 at the free edge
    float along   = (part < 2.5) ? info.w : info.z;      // position across the ray fan
    float nR = part < 1.5 ? 17.0 : (part < 2.5 ? 13.0 : (part < 3.5 ? 12.0 : (part < 4.5 ? 8.0 : 20.0)));
    float aj = along + 0.035 * (vn2(vec2(along * 9.0, seed.x * 7.0)) - 0.5);                         // rays are not perfectly evenly spaced
    float ph = abs(fract(aj * nR + seed.y * 0.5) - 0.5);
    float ray = smoothstep(0.34, 0.06, ph) * (0.55 + 0.45 * vn2(vec2(along * 40.0, 3.0 + seed.x * 9.0)));      // ray cores (irregular bright lines)
    vec3 col = uFinCol * mix(0.92, 1.10, ray) * (0.90 + 0.20 * vn2(vec2(along * 11.0, outward * 5.0) + seed.x * 9.0)) * mix(0.80, 1.05, smoothstep(0.0, 0.5, outward));
    float edge = smoothstep(0.84, 1.0, outward);
    col *= 1.0 - 0.25 * edge;
    if (pat > 7.5 && pat < 8.5) col = mix(col, vec3(0.02), edge * 0.85);                         // clownfish: black-edged fins
    if (pat > 11.5) col = mix(col, uColB * 0.9, smoothstep(0.30, 0.50, abs(fract(along * 9.0 + 0.3 * outward) - 0.5) * 2.0) * 0.75);   // lionfish: banded fan rays
    if (pat > 2.5 && pat < 3.5) col = mix(col, uColD, edge * 0.55);                              // tang: dark fin edge
    if (pat > 0.5 && pat < 1.5 && part > 4.5) col = mix(col, uColC, 0.7);                        // damsel tails
    float a = mix(0.62, 0.94, ray) * (1.0 - 0.30 * smoothstep(0.55, 1.0, outward));
    a = max(a, (1.0 - smoothstep(0.0, 0.16, outward)) * 0.95);                                  // scaly, opaque base
    if (part < 2.5) a *= 0.62 + 0.38 * smoothstep(0.42, 0.04, along);                            // spiny leading edge is denser
    a = mix(a, max(a, 0.94), uPat.w);                                     // solid-coloured species have opaque fins
    col = mix(col, uFinCol * (0.92 + 0.16 * ray), uPat.w * 0.6);
    if (part > 2.5 && part < 4.5 && !(part < 3.5 && uPat2.x > 0.5)) {        // pectoral / pelvic: rounded leaf outline (sickle pectorals are shaped by their geometry)
      float hw = 0.5 * pow(sin(3.14159 * clamp(outward * 0.9 + 0.06, 0.0, 1.0)), 0.55);
      a *= smoothstep(hw, hw * 0.80, abs(along - 0.5));
      a *= 0.45 + 0.55 * smoothstep(0.0, 0.25, outward);                     // soft, translucent margin
    }
    fAlpha = clamp(a, 0.0, 0.97);
    fRough = 0.5; fSheen = 0.0;
    return col;
  }

  // ------------------------------------------------------------------ body
  float belly = smoothstep(0.1, -0.85, top);            // 1 on the belly
  float back = smoothstep(0.05, 0.95, top);             // 1 on the back
  vec3 col;
  if (pat < 0.5) {                                       // countershaded silver
    float bk = mix(back, smoothstep(-0.30, 0.78, top), uPat2.y);                           // dark back reaches well down the flank on pelagic silver fish
    col = mix(uColB, uColA, bk);
    col = mix(col, uColC, belly);
    col *= 1.0 + 0.08 * uPat2.y * smoothstep(0.55, 0.10, abs(top - 0.02)) * (0.8 + 0.4 * vn2(vec2(t * 17.0, v * 6.0)));     // bright mirror band along the mid-flank
  } else if (pat < 1.5) {                                // vertical bars
    col = mix(uColA, uColB, belly * 0.6 + 0.2 * back);
    col = mix(col, uColA * 0.55, back * 0.55);
    float bars = 0.0;
    for (int i = 0; i < 5; i++) { float c = 0.26 + float(i) * 0.135; bars += smoothstep(0.02, 0.0, abs(t - c) - 0.042); }
    col = mix(col, uColD, clamp(bars, 0.0, 1.0) * 0.92);
  } else if (pat < 2.5) {                                // gradient (anthias)
    col = mix(uColB, uColA, smoothstep(-0.4, 0.9, top));
    col = mix(col, uColC, smoothstep(0.7, 1.0, t) * 0.7);
    col = mix(col, uColD, ridgeLine(top, 0.45, 0.08) * smoothstep(0.1, 0.25, t) * 0.5);
  } else if (pat < 3.5) {                                // tang: blue with the dark palette
    col = mix(uColA, uColB, smoothstep(-0.8, 0.5, top));
    float palette = smoothstep(0.34, 0.30, abs(top - 0.15 - 0.4 * sin(t * 5.5 - 0.6))) * smoothstep(0.24, 0.32, t) * smoothstep(0.95, 0.75, t);
    col = mix(col, uColD, palette * 0.95);
    col = mix(col, uColC * (0.72 + 0.28 * vn2(vec2(t * 40.0, v * 14.0))), smoothstep(0.84, 0.96, t) * 0.9);      // yellow caudal peduncle, mottled
  } else if (pat < 4.5) {                                // butterflyfish
    col = mix(uColA, uColB, belly * 0.7);
    col = mix(col, uColD, smoothstep(0.030, 0.0, abs(t - 0.10) - 0.028));              // through the eye
    col = mix(col, uColD, smoothstep(0.02, 0.0, abs(t - 0.82) - 0.05) * 0.9);
    col = mix(col, uColB, smoothstep(0.05, 0.0, abs(t - 0.17) - 0.02) * 0.8);
  } else if (pat < 5.5) {                                // horizontal stripe
    col = mix(uColB, uColA, back);
    col = mix(col, uColC, belly);
    col = mix(col, uColD, ridgeLine(top, 0.0, 0.16) * smoothstep(0.16, 0.3, t) * 0.9);
  } else if (pat < 6.5) {                                // parrotfish
    col = mix(uColA, uColC, smoothstep(0.05, 0.8, abs(top)));
    col = mix(col, uColB, smoothstep(0.32, 0.10, t) * 0.85);
  } else if (pat < 7.5) {                                // lanternfish: dark back, silvery flank, photophore rows
    col = mix(uColB, uColA, back);
    col = mix(col, uColC * 0.7, belly);
    float row1 = smoothstep(0.10, 0.0, abs(top + 0.62)), row2 = smoothstep(0.07, 0.0, abs(top + 0.18));
    float dt = abs(fract(t * 22.0) - 0.5);
    float dots = smoothstep(0.2, 0.06, dt) * smoothstep(0.14, 0.2, t) * smoothstep(0.98, 0.86, t);
    fEmis += uColD * 3.0 * (row1 * dots + 0.6 * row2 * smoothstep(0.2, 0.06, abs(fract(t * 15.0 + 0.3) - 0.5)) * smoothstep(0.2, 0.3, t));
  } else if (pat < 8.5) {                                // clownfish: orange with three white, black-edged bands
    col = mix(uColA, uColB, smoothstep(-0.2, 0.9, top) * 0.5);
    float b1 = bandW(t, 0.19, 0.035), b2 = bandW(t, 0.50 - 0.05 * (1.0 - abs(top)), 0.05), b3 = bandW(t, 0.87, 0.03);
    float bands = clamp(b1 + b2 + b3, 0.0, 1.0);
    float outline = clamp(bandW(t, 0.19, 0.055) + bandW(t, 0.50 - 0.05 * (1.0 - abs(top)), 0.075) + bandW(t, 0.87, 0.05), 0.0, 1.0) - bands;
    col = mix(col, uColD, clamp(outline, 0.0, 1.0) * 0.9);
    col = mix(col, uColC, bands);
    col = mix(col, uColB * 0.85, smoothstep(0.90, 0.99, t) * 0.5);
  } else if (pat < 9.5) {                                // bluehead wrasse: electric blue head, white + black band, green body
    float head = smoothstep(0.31, 0.25, t);
    col = mix(uColA, uColC, belly * 0.85);
    col *= 0.85 + 0.30 * smoothstep(-0.3, 0.9, top);
    col = mix(col, vec3(0.88, 0.90, 0.84), bandW(t, 0.325, 0.014));
    col = mix(col, uColD, bandW(t, 0.355, 0.022));
    col = mix(col, uColB, head);
    col = mix(col, uColB * 0.55, head * belly * 0.6);
  } else if (pat < 10.5) {                               // queen triggerfish: olive body, blue lines on the face, yellow belly
    col = mix(uColA, uColB, smoothstep(-0.7, 0.8, top));
    col = mix(col, uColC, belly * 0.55 * smoothstep(0.2, 0.5, t));
    float ln = smoothstep(0.13, 0.06, abs(fract(top * 2.0 + t * 7.0) - 0.5)) * smoothstep(0.34, 0.16, t);
    col = mix(col, uColD, ln * 0.92);
    col = mix(col, uColD * 0.8, smoothstep(0.05, 0.0, abs(t - 0.86) - 0.02) * 0.5);
  } else if (pat < 11.5) {                               // mottled / spotted camouflage: grouper, scorpionfish, lizardfish, moray
    float n1 = fbm3(vec3(t * 9.0, v * 6.0, seed.x * 3.0), 3);
    col = mix(uColA, uColB, smoothstep(0.30, 0.70, n1));
    col = mix(col, uColC, belly * 0.7);
    float spt = smoothstep(0.60, 0.72, vn3(vec3(t * 28.0, v * 14.0, seed.y * 7.0)));
    col = mix(col, uColD, spt * 0.85);
    float blot = smoothstep(0.55, 0.78, fbm3(vec3(t * 4.0 + 2.0, v * 3.0, seed.z * 5.0), 2));
    col = mix(col, uColD * 1.6, blot * 0.35);
  } else if (pat < 12.5) {                               // lionfish: vertical red-brown and cream bars
    float ph2 = fract(t * 9.0 + 0.18 * sin(v * 6.2831853));
    float bars = smoothstep(0.40, 0.56, abs(ph2 - 0.5) * 2.0);
    col = mix(uColA, uColB, bars);
    col = mix(col, uColC, belly * 0.5);
    col = mix(col, uColD, smoothstep(0.07, 0.0, abs(abs(ph2 - 0.5) * 2.0 - 0.5)) * 0.55);
  } else {                                               // glass fry: a see-through larva. Thin tissue, a pale segmented spine, a silver swim bladder, a silver flank band and rows of pigment dots
    float edgeK = pow(1.0 - abs(on.z), 2.2);                                                    // tissue is thicker seen edge-on: the outline stays readable
    col = mix(uColB, uColA, back * 0.7);
    float headK = smoothstep(0.30, 0.10, t);
    float spine = ridgeLine(top, 0.04, 0.060) * smoothstep(0.16, 0.24, t) * smoothstep(1.0, 0.90, t);
    float seg = 0.70 + 0.30 * step(0.5, fract(t * 30.0));
    float bladder = smoothstep(1.0, 0.45, length(vec2((t - 0.40) / 0.085, (top + 0.30) / 0.34)));
    float band = smoothstep(0.26, 0.04, abs(top + 0.20 + 0.06 * sin(t * 7.0))) * smoothstep(0.22, 0.38, t) * smoothstep(1.0, 0.90, t);
    vec4 wd = worley2(vec2(t * 52.0, top * 6.5 + 3.0));
    float dFade = 1.0 - smoothstep(0.7, 2.6, dist);
    float dots = dFade * (1.0 - smoothstep(0.10, 0.20, wd.x)) * step(0.50, wd.z) * (smoothstep(0.50, 0.75, top) + smoothstep(-0.55, -0.82, top)) * smoothstep(0.20, 0.32, t) * smoothstep(0.99, 0.88, t);
    float a = 0.22 + 0.10 * back + 0.30 * headK;
    a = max(a, 0.62 * edgeK);
    a = max(a, 0.92 * spine);
    a = max(a, 0.85 * bladder);
    a = max(a, 0.70 * band);
    a = max(a, 0.95 * dots);
    col = mix(col, vec3(0.84, 0.92, 0.95) * seg, spine);
    col = mix(col, vec3(0.88, 0.94, 1.0), max(bladder * 0.9, band * 0.8));
    col = mix(col, vec3(0.06, 0.045, 0.04), dots);
    col = mix(col, uColC, headK * 0.4);
    fAlpha = clamp(a, 0.0, 0.97);
  }
  if ((pat < 6.5 || pat > 7.5) && pat < 12.5) {          // lateral line (dashed) on most species
    float ll = ridgeLine(top, 0.10 + 0.05 * sin(t * 9.0), 0.045) * smoothstep(0.22, 0.30, t) * smoothstep(0.96, 0.80, t) * step(0.35, fract(t * 90.0));
    col *= 1.0 - 0.22 * ll;
  }
  // gill cover arc, mouth slit
  float gt = t - 0.21 - 0.05 * (1.0 - abs(top));
  float gill = smoothstep(0.022, 0.0, abs(gt) - 0.003);
  col *= 1.0 - 0.13 * gill;
  col *= 1.0 - 0.07 * smoothstep(0.10, 0.0, abs(gt + 0.03));                 // soft shadow where the gill cover overlaps the shoulder
  float mouth = ridgeLine(top, -0.20, 0.055) * smoothstep(0.075, 0.015, t);
  col *= 1.0 - 0.62 * mouth;
  col *= 1.0 - 0.5 * smoothstep(0.02, 0.0, t);
  // shingled scales: dark rear rims, per-scale tone, individually glittering
  float sid, srim;
  float dome = fishScales(vec2(t, v), 54.0, sid, srim);
  float scF = (1.0 - smoothstep(0.8, 4.0, dist)) * smoothstep(0.10, 0.90, uLen);         // juveniles and small fish show no scales at all
  { vec2 gc = vec2(t * 54.0, v * 24.84); float cells = max(length(dFdx(gc)), length(dFdy(gc))); scF *= 1.0 - smoothstep(0.20, 0.60, cells); }      // scales smaller than ~2 px would only shimmer: fade them out
  float scK = mix(1.0, 0.55, uPat.y);                                   // iridescent / silver species: finer, calmer scale pattern
  col *= 1.0 - scF * 0.05 * scK * srim;
  col *= 1.0 + scF * 0.06 * scK * (sid - 0.5);
  fH = uLen * 0.0006 * dome * scF;
  fRough = mix(0.38, 0.56, belly);
  fRough = clamp(fRough * mix(1.0, 0.78 + 0.5 * sid, scF * 0.8), 0.32, 0.7);           // glossy but never mirror-sharp: tiny sun glints would bloom into flares
  // iridescent sheen (thin-film like): shifts hue with viewing angle
  if (uPat.y > 0.5) {
    float fr = pow(1.0 - abs(on.z), 1.5);
    col += vec3(0.02, 0.10, 0.20) * fr * 1.6;
    col = mix(col, col.zxy * vec3(0.7, 1.1, 1.0), fr * 0.35);
  }
  return col;
}
`;

export const FISH_FRAG = FRAG;
// Fragment-side patch shared by the school material and the game's instanced material (needs vInfo, vObjP, vObjN, vSeed varyings + uLen, uPat, uPat2, colours)
export function patchFishFragment(shader) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_pars_begin>', FRAG + '\n#include <lights_pars_begin>')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = fishSurface( vInfo, vObjP, normalize( vObjN ), vSeed, length( vViewPosition ) ) * mix( vec3( 1.0 ), vColor.rgb, 0.5 );
        diffuseColor.a = fAlpha;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = fRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = uwBumpNormal( - vViewPosition, normal, fH, faceDirection );
        #if NUM_DIR_LIGHTS > 0
        if ( vInfo.y > 0.5 && vInfo.y < 5.5 && dot( normal, directionalLights[ 0 ].direction ) < 0.0 ) normal = - normal;     // translucent: lit from the sun side
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += fEmis + fEmisSun * uwSunAt( uwWorldFromView( - vViewPosition ) );
        {
          // wet / silvery skin mirrors the water around it. There is no environment map underwater, so use the same analytic radiance
          // distribution as the veil: bright looking up (Snell window), blue-grey sideways, dark looking down.
          vec3 pw = uwWorldFromView( - vViewPosition );
          vec3 Vv = normalize( vViewPosition );
          float nvv = saturate( dot( normal, Vv ) );
          vec3 Rw = normalize( ( vec4( reflect( - Vv, normal ), 0.0 ) * viewMatrix ).xyz );
          float dep = max( uOptA.y - pw.y, 0.0 );
          vec3 Lr = uVeil0 * exp( - uKd * dep ) * uExt / max( uExt - uKd * Rw.y, vec3( 1e-3 ) );
          float F0 = 0.04 + 0.34 * uPat.y;                                       // guanine-crystal flanks are strong mirrors
          float Fr = F0 + ( 1.0 - F0 ) * pow( 1.0 - nvv, 5.0 );
          totalEmissiveRadiance += fSheen * Fr * Lr * 2.4 * diffuseColor.a;
        }`)
      .replace('#include <alphatest_fragment>', '');
}

function makeFishMaterial(kind, uniforms) {
  const fins = kind === 'fins';
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.0, side: THREE.DoubleSide, transparent: fins, depthWrite: true });    // fins write depth so the post pass treats them as near
  uw(mat, 'fish_' + kind, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT)
      .replace('#include <beginnormal_vertex>', `
        vec3 fwd; vec3 P0;
        {
          float t = uOptA.x + uSchoolT * 3.7;
          P0 = fishPos(aSeed, t);
          vec3 P1 = fishPos(aSeed, t + 0.20);
          vec3 vel = (P1 - P0) / 0.20;
          float sp = length(vel);
          if (uMode > 0.5) {
            // hovering fish face the current, with slow individual sway
            float a = atan(uCurrent.y, uCurrent.x) + (aSeed.w - 0.5) * 1.3 + 0.35 * sin(t * 0.4 + aSeed.z * 20.0);
            fwd = normalize(vec3(cos(a), 0.06 * sin(t * 0.5 + aSeed.x * 30.0), sin(a)));
          } else {
            // polarised school: everyone heads roughly where the school is going, each with a little individual sway
            vec3 sv = (schoolCenter(t + 0.35) - schoolCenter(t)) / 0.35;
            float sl = length(sv);
            vec3 own = sp > 1e-3 ? vel / sp : vec3(1.0, 0.0, 0.0);
            fwd = sl > 1e-3 ? normalize(mix(own, sv / sl, 0.72)) : own;
          }
        }
        vec3 sideV0 = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)) + 1e-5);
        vec3 upV0 = cross(sideV0, fwd);
        // individual roll (banking, slight tilts): fish are never perfectly upright
        float rollA = uPat2.w * (sin((uOptA.x + uSchoolT * 3.7) * 0.8 + aSeed.z * 40.0) * 0.7 + (aSeed.w - 0.5) * 1.1);
        vec3 upV = upV0 * cos(rollA) + sideV0 * sin(rollA);
        vec3 sideV = sideV0 * cos(rollA) - upV0 * sin(rollA);
        vec3 objectNormal = normal.x * fwd + normal.y * upV + normal.z * sideV;`)
      .replace('#include <begin_vertex>', `
        vInfo = aInfo; vObjP = position; vObjN = normal; vSeed = aSeed;
        float tA = clamp(0.5 - position.x, 0.0, 1.35);
        float ph = (uOptA.x + uSchoolT * 3.7) * uFreq * 6.2831853 + aSeed.x * 6.2831853 - tA * 5.2;
        float amp = uBend * (0.06 + 0.9 * tA * tA);
        vec3 transformed = position;
        transformed.z += amp * sin(ph) * (aInfo.y > 5.5 && aInfo.y < 6.5 ? 0.4 : 1.0);
        // pectoral / pelvic fins flutter on their own; dorsal & anal ripple slightly
        if (aInfo.y > 2.5 && aInfo.y < 4.5) transformed.z += 0.014 * sin(ph * 1.3 + 3.0) * aInfo.w * sign(position.z);
        if (aInfo.y > 0.5 && aInfo.y < 2.5) transformed.z += 0.006 * sin(ph * 2.0 - aInfo.w * 6.0) * aInfo.z;
        float sz = uLen * (0.82 + 0.36 * fract(aSeed.w * 13.7));
        vec3 lp = transformed * sz;`)
      .replace('#include <project_vertex>', `
        vec3 wpos = P0 + fwd * lp.x + upV * lp.y + sideV * lp.z;
        vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
        gl_Position = projectionMatrix * mvPosition;`);
    patchFishFragment(shader);
  });
  return mat;
}
export const fishMaterial = (spec, uniforms) => makeFishMaterial('body', uniforms);

// ---------------------------------------------------------------------------
// Pool of school slots per species, streamed around the camera
// ---------------------------------------------------------------------------
const CELL = 26;
export class Schools {
  constructor(scene, world, scatter = null) {
    this.world = world; this.scatter = scatter; this.group = new THREE.Group(); scene.add(this.group);
    this.species = [];
    this.lcx = 1e9; this.lcz = 1e9;
    for (const [name, sp] of Object.entries(SPECIES)) {
      const seedG = hashStr(name) % 1000;
      const geos = [fishGeometry({ ...sp.geo, seed: seedG }, true),
                    fishGeometry({ ...sp.geo, seed: seedG, stations: 14, radial: 9, finDetail: 0.5 }, true),
                    fishGeometry({ ...sp.geo, seed: seedG, stations: 8, radial: 6, finDetail: 0.25 }, true)];
      const slots = [];
      for (let s = 0; s < sp.slots; s++) {
        const uniforms = {
          uAnchor: { value: new THREE.Vector3() }, uRange: { value: new THREE.Vector3(...sp.range) }, uSpread: { value: new THREE.Vector3(...sp.spread) },
          uSpeed: { value: sp.speed }, uLen: { value: sp.len }, uMode: { value: sp.mode }, uFreq: { value: sp.freq }, uBend: { value: sp.bend }, uAvoid: { value: sp.avoid ?? 3.2 },
          uSchoolT: { value: 0 },
          uColA: { value: new THREE.Vector3(...sp.colA) }, uColB: { value: new THREE.Vector3(...sp.colB) }, uColC: { value: new THREE.Vector3(...sp.colC) }, uColD: { value: new THREE.Vector3(...sp.colD) },
          uFinCol: { value: new THREE.Vector3(...sp.finCol) }, uPat: { value: new THREE.Vector4(sp.pattern, sp.irid || 0, sp.sheen ?? 0.3, sp.finSolid ?? 0.3) },
          uPat2: { value: new THREE.Vector4(...(sp.pat2 ?? [0, 0.5, 0, sp.mode === 1 ? 0.06 : 0.22])) },
        };
        const seeds = new Float32Array(sp.count * 4), rnd = mulberry32(hashStr(name) + s * 977);
        for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
        const seedAttr = new THREE.InstancedBufferAttribute(seeds, 4);
        const cols = new Float32Array(sp.count * 3); for (let i = 0; i < cols.length; i++) cols[i] = 0.85 + 0.3 * rnd();
        const colAttr = new THREE.InstancedBufferAttribute(cols, 3);
        const make = (g, kind) => {
          const gg = g.clone(); gg.setAttribute('aSeed', seedAttr);
          const m = new THREE.InstancedMesh(gg, makeFishMaterial(kind, uniforms), sp.count);
          m.instanceColor = colAttr; m.count = sp.count; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
          if (kind === 'fins') m.renderOrder = 2;
          return m;
        };
        const grp = new THREE.Group(); grp.visible = false;
        const lods = geos.map((g) => { const body = make(g.body, 'body'), finMesh = make(g.fins, 'fins'); grp.add(body, finMesh); return [body, finMesh]; });
        const setLod = (k) => { lods.forEach((pair, i) => pair.forEach((m) => { m.visible = i === k; })); grp.userData.lod = k; };
        setLod(0);
        Object.defineProperty(grp, 'count', { get() { return lods[0][0].count; }, set(v) { lods.forEach((pair) => pair.forEach((m) => { m.count = v; })); } });
        grp.userData.setLod = setLod;
        this.group.add(grp);
        slots.push({ mesh: grp, uniforms, key: null });
      }
      this.species.push({ name, sp, slots, geo: geos[0] });
    }
    this.stats = { schools: 0, fish: 0 };
  }

  _candidates(entry, cam) {
    const { name, sp } = entry;
    if (sp.symbiont) {
      // fish that live on another organism: anchor them on nearby instances of it
      const pos = this.scatter ? this.scatter.instancePositions(sp.symbiont, cam, sp.R ?? 40, entry.slots.length + 3) : [];
      return pos.map((p) => ({ key: name + ':' + Math.round(p.x * 10) + ',' + Math.round(p.z * 10), x: p.x, y: p.y + 0.115 * p.s + 0.04, z: p.z, d: p.d, seed: Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233)) * 90 }));
    }
    const CELL = sp.cell ?? 26, R = sp.R ?? 110, rc = Math.ceil(R / CELL);
    const ccx = Math.floor(cam.x / CELL), ccz = Math.floor(cam.z / CELL);
    const out = [];
    for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
      const cx = ccx + dx, cz = ccz + dz, rnd = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ hashStr(name)) >>> 0);
      if (rnd() > sp.prob) continue;
      const x = (cx + 0.15 + 0.7 * rnd()) * CELL, z = (cz + 0.15 + 0.7 * rnd()) * CELL;
      const h = this.world.height(x, z), depth = -h;
      const hover = sp.hover[0] + rnd() * (sp.hover[1] - sp.hover[0]);
      const m = this.world.masks(x, z);
      // habitat: reef species want coral cover below them
      const wantsReef = name === 'anthias' || name === 'chromis' || name === 'sergeant' || name === 'butterfly' || name === 'tang' || name === 'parrot';
      if (wantsReef && m[1] < 0.08) continue;
      if (depth < sp.depth[0] || depth > (sp.pelagic ? 2500 : sp.depth[1])) continue;
      let y = h + hover;
      const surfMargin = 1.2 + sp.spread[1] + sp.range[1];
      y = Math.min(y, -surfMargin);
      if (sp.pelagic && depth > 45) { const d1 = Math.min(50, depth - 25); y = -(7 + rnd() * (d1 - 7)); }
      if (sp.column) { const d0 = sp.column[0], d1 = Math.min(sp.column[1], depth - 15); if (d1 <= d0) continue; y = -(d0 + rnd() * (d1 - d0)); }
      const clearance = y - h;
      if (!sp.column && !(sp.pelagic && depth > 45) && clearance < sp.spread[1] + sp.range[1] + 0.4 && sp.mode === 0 && sp.range[0] > 3) continue;   // travelling schools need open water
      const d = Math.hypot(x - cam.x, z - cam.z);
      out.push({ key: name + ':' + cx + ',' + cz, x, y, z, d, seed: rnd() * 100 });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // per-frame level of detail: schools far away (relative to fish size) draw with much lighter meshes
  updateLOD(cam, t) {
    for (const e of this.species) {
      const len = e.sp.len, d0 = 70 * len, d1 = 220 * len;
      for (const sl of e.slots) {
        if (!sl.key) continue;
        const a = sl.uniforms.uAnchor.value, rx = e.sp.range[0], rz = e.sp.range[2];
        // school centre follows a slow Lissajous path around the anchor (same formula as the vertex shader)
        const c = this.centre(sl, e.sp, t);
        const d = Math.hypot(c[0] - cam.x, c[1] - cam.y, c[2] - cam.z) - 0.5 * Math.max(e.sp.spread[0], e.sp.spread[2]);
        const k = d < d0 ? 0 : (d < d1 ? 1 : 2);
        if (sl.mesh.userData.lod !== k) sl.mesh.userData.setLod(k);
      }
    }
  }

  // curated compositions: put a school of `name` at an exact anchor (kept until unpinAll)
  pin(name, x, y, z, seed = 1) {
    const entry = this.species.find((e) => e.name === name); if (!entry) return null;
    const slot = entry.slots.find((sl) => !sl.key) || entry.slots[entry.slots.length - 1];
    slot.key = 'pin:' + name + ':' + seed; slot.pinned = true; slot.mesh.visible = true;
    slot.uniforms.uAnchor.value.set(x, y, z); slot.uniforms.uSchoolT.value = seed;
    return slot;
  }
  // JS twin of schoolCenter() in the vertex shader (t = scene time)
  centre(slot, sp, t) {
    const tt = t + slot.uniforms.uSchoolT.value * 3.7, w = sp.speed / Math.max(sp.range[0], 1), a = slot.uniforms.uAnchor.value;
    return [a.x + sp.range[0] * (Math.sin(w * tt + 1.0) + 0.4 * Math.sin(2.3 * w * tt + 0.5)),
            a.y + sp.range[1] * Math.sin(0.7 * w * tt + 2.0),
            a.z + sp.range[2] * (Math.cos(0.83 * w * tt) + 0.4 * Math.sin(1.9 * w * tt + 2.2))];
  }
  unpinAll() {
    for (const e of this.species) for (const sl of e.slots) if (sl.pinned) { sl.pinned = false; sl.key = null; sl.mesh.visible = false; }
    this.lcx = 1e9;
  }

  update(cam, force = false) {
    const ccx = Math.floor(cam.x / (CELL / 2)), ccz = Math.floor(cam.z / (CELL / 2));
    if (!force && ccx === this.lcx && ccz === this.lcz) return;
    this.lcx = ccx; this.lcz = ccz;
    let schools = 0, fish = 0;
    for (const entry of this.species) {
      const cands = this.candidates = this._candidates(entry, cam);
      const want = new Map(cands.slice(0, entry.slots.length + 2).map((c) => [c.key, c]));
      // keep existing assignments that are still wanted; free the rest
      for (const s of entry.slots) if (s.key && !s.pinned && !want.has(s.key)) { s.key = null; s.mesh.visible = false; }
      for (const c of cands) {
        if (entry.slots.some((s) => s.key === c.key)) continue;
        const free = entry.slots.find((s) => !s.key);
        if (!free) break;
        free.key = c.key; free.mesh.visible = true;
        free.uniforms.uAnchor.value.set(c.x, c.y, c.z);
        free.uniforms.uSchoolT.value = c.seed;
      }
      for (const s of entry.slots) if (s.key) { schools++; fish += entry.sp.count; }
    }
    this.stats = { schools, fish };
  }
}
