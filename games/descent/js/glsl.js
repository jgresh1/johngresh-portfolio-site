// Shared GLSL snippets (strings) used across materials and passes.

// ---------------------------------------------------------------------------
// Hashing + noise. Integer (PCG) hashes: stable at world coordinates in the
// thousands of metres, no sin() hash banding.
// ---------------------------------------------------------------------------
export const GLSL_NOISE = /* glsl */`
uint pcg1(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
uvec2 pcg2(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
const float U2F = 2.3283064365386963e-10;
float h11(float p)  { return float(pcg1(uint(int(floor(p))))) * U2F; }
float h21(vec2 p)   { return float(pcg2(uvec2(ivec2(floor(p)))).x) * U2F; }
float h31(vec3 p)   { return float(pcg3(uvec3(ivec3(floor(p)))).x) * U2F; }
vec2  h22(vec2 p)   { return vec2(pcg2(uvec2(ivec2(floor(p))))) * U2F; }
vec3  h23(vec2 p)   { uvec2 q = uvec2(ivec2(floor(p))); return vec3(pcg3(uvec3(q, 7u))) * U2F; }
vec3  h33(vec3 p)   { return vec3(pcg3(uvec3(ivec3(floor(p))))) * U2F; }

// value noise, quintic fade. returns [0,1]
float vn2(vec2 x) {
  vec2 p = floor(x), w = fract(x);
  vec2 u = w*w*w*(w*(w*6.0-15.0)+10.0);
  float a = h21(p), b = h21(p+vec2(1.0,0.0)), c = h21(p+vec2(0.0,1.0)), d = h21(p+vec2(1.0,1.0));
  return a + (b-a)*u.x + (c-a)*u.y + (a-b-c+d)*u.x*u.y;
}
// value + analytic derivative (x = value, yz = d/dx, d/dy)
vec3 vn2d(vec2 x) {
  vec2 p = floor(x), w = fract(x);
  vec2 u = w*w*w*(w*(w*6.0-15.0)+10.0);
  vec2 du = 30.0*w*w*(w*(w-2.0)+1.0);
  float a = h21(p), b = h21(p+vec2(1.0,0.0)), c = h21(p+vec2(0.0,1.0)), d = h21(p+vec2(1.0,1.0));
  float k = a-b-c+d;
  return vec3(a + (b-a)*u.x + (c-a)*u.y + k*u.x*u.y,
              du * (vec2(b-a, c-a) + k*u.yx));
}
float vn3(vec3 x) {
  vec3 p = floor(x), w = fract(x);
  vec3 u = w*w*w*(w*(w*6.0-15.0)+10.0);
  float a = h31(p+vec3(0,0,0)), b = h31(p+vec3(1,0,0)), c = h31(p+vec3(0,1,0)), d = h31(p+vec3(1,1,0));
  float e = h31(p+vec3(0,0,1)), f = h31(p+vec3(1,0,1)), g = h31(p+vec3(0,1,1)), h = h31(p+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,f,u.x), mix(g,h,u.x), u.y), u.z);
}
// value + analytic gradient (x = value, yzw = gradient)
vec4 vn3d(vec3 x) {
  vec3 p = floor(x), w = fract(x);
  vec3 u = w*w*w*(w*(w*6.0-15.0)+10.0);
  vec3 du = 30.0*w*w*(w*(w-2.0)+1.0);
  float a = h31(p+vec3(0,0,0)), b = h31(p+vec3(1,0,0)), c = h31(p+vec3(0,1,0)), d = h31(p+vec3(1,1,0));
  float e = h31(p+vec3(0,0,1)), f = h31(p+vec3(1,0,1)), g = h31(p+vec3(0,1,1)), h = h31(p+vec3(1,1,1));
  float k0 = a, k1 = b-a, k2 = c-a, k3 = e-a, k4 = a-b-c+d, k5 = a-c-e+g, k6 = a-b-e+f, k7 = -a+b+c-d+e-f-g+h;
  return vec4(k0 + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z,
              du * vec3(k1 + k4*u.y + k6*u.z + k7*u.y*u.z,
                        k2 + k4*u.x + k5*u.z + k7*u.z*u.x,
                        k3 + k5*u.y + k6*u.x + k7*u.x*u.y));
}

const mat2 ROT2 = mat2(0.8, -0.6, 0.6, 0.8);
const mat3 ROT3 = mat3( 0.00,  0.80,  0.60,
                       -0.80,  0.36, -0.48,
                       -0.60, -0.48,  0.64);

float fbm2(vec2 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= oct) break;
    s += a * vn2(p); n += a;
    p = ROT2 * p * 2.02 + 17.3; a *= 0.5;
  }
  return s / n;
}
// fbm with analytic derivative of the (sum) value, in the un-rotated frame
vec3 fbm2d(vec2 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0; vec2 d = vec2(0.0);
  mat2 m = mat2(1.0, 0.0, 0.0, 1.0); float f = 1.0;
  for (int i = 0; i < 12; i++) {
    if (i >= oct) break;
    vec3 v = vn2d(p);
    s += a * v.x; d += a * f * (transpose(m) * v.yz); n += a;
    p = ROT2 * p * 2.02 + 17.3; m = ROT2 * m; f *= 2.02; a *= 0.5;
  }
  return vec3(s / n, d / n);
}
float fbm3(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= oct) break;
    s += a * vn3(p); n += a;
    p = ROT3 * p * 2.01 + 11.7; a *= 0.5;
  }
  return s / n;
}
// fbm3 value+gradient in the un-rotated frame
vec4 fbm3d(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0; vec3 d = vec3(0.0);
  mat3 m = mat3(1.0); float f = 1.0;
  for (int i = 0; i < 12; i++) {
    if (i >= oct) break;
    vec4 v = vn3d(p);
    s += a * v.x; d += a * f * (transpose(m) * v.yzw); n += a;
    p = ROT3 * p * 2.01 + 11.7; m = ROT3 * m; f *= 2.01; a *= 0.5;
  }
  return vec4(s / n, d / n);
}
// cellular noise: x = F1, y = F2 (distances), zw = cell id hash of F1 cell
vec4 worley2(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = h22(ip + g);
    vec2 r = g + o - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = ip + g; }
    else if (d < f2) { f2 = d; }
  }
  return vec4(sqrt(f1), sqrt(f2), h21(id), h21(id + 31.7));
}
vec4 worley3(vec3 p) {
  vec3 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0; vec3 id = vec3(0.0);
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 o = h33(ip + g);
    vec3 r = g + o - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = ip + g; }
    else if (d < f2) { f2 = d; }
  }
  return vec4(sqrt(f1), sqrt(f2), h31(id), h31(id + 31.7));
}
// cellular F1 with the (unit) gradient of F1 (points away from the nearest feature point)
vec4 worley3d(vec3 p) {
  vec3 ip = floor(p), fp = fract(p);
  float f1 = 8.0; vec3 best = vec3(0.0);
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 r = g + h33(ip + g) - fp;
    float d = dot(r, r);
    if (d < f1) { f1 = d; best = r; }
  }
  float F = sqrt(f1);
  return vec4(F, -best / max(F, 1e-4));
}
// cellular noise 3D with everything a mosaic needs: F1, F2, gradient of F1 (points away from the nearest feature
// point) and two hashes of the nearest cell (colony id)
void worley3g(vec3 p, out float f1o, out float f2o, out vec3 gradF1, out float ha, out float hb) {
  vec3 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0; vec3 best = vec3(0.0), id = vec3(0.0);
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 r = g + h33(ip + g) - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; best = r; id = ip + g; }
    else if (d < f2) { f2 = d; }
  }
  f1o = sqrt(f1); f2o = sqrt(f2); gradF1 = -best / max(f1o, 1e-4);
  ha = h31(id); hb = h31(id + 31.7);
}
float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3  sat3(vec3 x) { return clamp(x, 0.0, 1.0); }
float remap(float v, float a, float b, float c, float d) { return c + (v - a) * (d - c) / (b - a); }
float sstep(float a, float b, float x) { return smoothstep(a, b, x); }
`;

// ---------------------------------------------------------------------------
// Ocean surface wave field. Built from an integer-lattice wave set so the
// height field tiles exactly every `tile` metres (needed by the caustic maps).
// ---------------------------------------------------------------------------
export function makeWaveSet({ tile = 24, count = 72, windDeg = 25, seed = 7, slope = 0.045 } = {}) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const gauss = () => { let a = 0; for (let i = 0; i < 6; i++) a += rnd(); return (a - 3) * 1.4; };
  const k0 = 2 * Math.PI / tile;
  const wind = windDeg * Math.PI / 180;
  const used = new Set();
  const waves = [];
  let guard = 0;
  // three systems: wind sea (directional), a cross swell, and broadband omnidirectional chop
  const systems = [
    { w: 0.50, spread: 0.55, dir: wind,               nMin: 2.0, nMax: 40 },
    { w: 0.18, spread: 0.30, dir: wind + 1.15,        nMin: 1.7, nMax: 9 },
    { w: 0.32, spread: 3.0,  dir: wind,               nMin: 6.0, nMax: 110 },
  ];
  for (const sys of systems) {
    const cnt = Math.round(count * sys.w);
    let added = 0;
    while (added < cnt && guard++ < 20000) {
      const u = (added + rnd()) / cnt;
      const n = Math.exp(Math.log(sys.nMin) + u * (Math.log(sys.nMax) - Math.log(sys.nMin)));
      const ang = sys.dir + (sys.spread > 2 ? (rnd() - 0.5) * Math.PI * 2 : gauss() * sys.spread);
      const i = Math.round(n * Math.cos(ang)), j = Math.round(n * Math.sin(ang));
      if ((i === 0 && j === 0) || used.has(i + ',' + j)) continue;
      used.add(i + ',' + j); added++;
      const kx = k0 * i, kz = k0 * j, k = Math.hypot(kx, kz);
      const nn = Math.hypot(i, j);
      const sl = slope * Math.pow(nn / 8, -0.28) * (0.55 + 0.9 * rnd());   // random per-wave slope
      const amp = sl / k;
      const omega = Math.sqrt(9.81 * k + 7.4e-5 * k * k * k);
      waves.push({ kx, kz, amp, omega, phase: rnd() * Math.PI * 2 });
    }
  }
  return { tile, waves };
}

export function waveGLSL(set) {
  const n = set.waves.length;
  const f = (x) => (Math.abs(x) < 1e-9 ? '0.0' : x.toPrecision(7));
  const wv = set.waves.map(w => `vec4(${f(w.kx)},${f(w.kz)},${f(w.amp)},${f(w.omega)})`).join(',\n  ');
  const wp = set.waves.map(w => f(w.phase)).join(',');
  return /* glsl */`
#define NW ${n}
const vec4 WV[NW] = vec4[NW](
  ${wv}
);
const float WP[NW] = float[NW](${wp});
// height only. kmax fades out waves finer than the viewer can resolve.
float waveH(vec2 p, float t, float kmax) {
  float h = 0.0;
  for (int i = 0; i < NW; i++) {
    vec4 w = WV[i];
    float k = length(w.xy);
    float fade = 1.0 - smoothstep(kmax * 0.5, kmax, k);
    h += fade * w.z * cos(dot(w.xy, p) - w.w * t + WP[i]);
  }
  return h;
}
// height + slope (dh/dx, dh/dz)
float waveHG(vec2 p, float t, float kmax, out vec2 g) {
  float h = 0.0; g = vec2(0.0);
  for (int i = 0; i < NW; i++) {
    vec4 w = WV[i];
    float k = length(w.xy);
    float fade = 1.0 - smoothstep(kmax * 0.5, kmax, k);
    float ph = dot(w.xy, p) - w.w * t + WP[i];
    float c = cos(ph), s = sin(ph);
    h += fade * w.z * c;
    g -= fade * w.z * s * w.xy;
  }
  return h;
}
`;
}

// ---------------------------------------------------------------------------
// Sky radiance (linear HDR). Needs uSunDirA (toward the sun, in air) and uTime.
// Units: sunlit white diffuse surface ~= 1.0.
// ---------------------------------------------------------------------------
export const GLSL_SKY = /* glsl */`
vec3 skyRadiance(vec3 d, vec3 sunA, float t) {
  float mu = clamp(d.y, 0.0, 1.0);
  float sunEl = clamp(sunA.y, 0.0, 1.0);
  // deeper, more saturated zenith; warmer / paler horizon; both shift toward orange when the sun is low
  vec3 zen = mix(vec3(0.030, 0.062, 0.20), vec3(0.066, 0.150, 0.43), sunEl);
  vec3 hor = mix(vec3(0.42, 0.30, 0.26), vec3(0.44, 0.59, 0.82), smoothstep(0.05, 0.55, sunEl));
  vec3 sky = mix(hor, zen, pow(mu, 0.50));
  float cg = max(dot(d, sunA), 0.0);
  // aerosol glow around the sun (Mie-ish), tinted by the sun's colour
  vec3 sunTint = mix(vec3(1.0, 0.62, 0.34), vec3(1.0, 0.90, 0.72), smoothstep(0.05, 0.6, sunEl));
  sky += sunTint * (0.30 * pow(cg, 5.0) + 1.5 * pow(cg, 40.0) + 4.0 * pow(cg, 400.0));
  // haze near the horizon
  sky = mix(sky, vec3(0.56, 0.66, 0.80) * (0.6 + 0.6 * sunEl), pow(1.0 - mu, 7.0) * 0.55);
  // cumulus on a virtual layer: puffy, bright tops, shaded bases
  if (d.y > 0.008) {
    vec2 cp = d.xz / (d.y + 0.10) * 0.62 + vec2(t * 0.010, t * 0.004);
    float cov = fbm2(cp, 6);
    float dens = smoothstep(0.52, 0.66, cov);
    float lit = smoothstep(0.42, 0.90, fbm2(cp * 1.9 + 4.1, 4));
    float sunSide = pow(cg, 2.5);
    vec3 shade = vec3(0.42, 0.46, 0.57), bright = vec3(1.30, 1.22, 1.12) * (0.85 + 0.5 * sunEl);
    vec3 cc = mix(shade, bright, lit) * (0.55 + 0.75 * sunSide + 0.30 * mu);
    cc = mix(cc, cc * sunTint, 0.35);
    cc += sunTint * pow(cg, 20.0) * 0.9 * (1.0 - dens * 0.45);            // silver lining
    sky = mix(sky, cc, dens * smoothstep(0.0, 0.16, d.y));
  }
  // sun disc (real disc is ~4.6e4; compressed so bloom stays controllable)
  float disc = smoothstep(0.999935, 0.999985, cg);
  sky += sunTint * disc * 1200.0;
  return sky;
}
`;

// ---------------------------------------------------------------------------
// Reef colony community (encrusting sponges, tunicates, coralline algae, turf). Needs GLSL_NOISE.
// ---------------------------------------------------------------------------
export const GLSL_MOSAIC = /* glsl */`
// ---- reef colony community: what a hard substrate really looks like up close ---------------------------------
// Layers of irregular, ragged-edged colonies at several sizes (big -> small, later layers overgrow earlier ones),
// muted on average with a few vivid accents. Each layer fades to its mean contribution before it gets sub-pixel.
const vec3 MC[9] = vec3[9](vec3(0.78, 0.30, 0.06), vec3(0.58, 0.09, 0.07), vec3(0.74, 0.60, 0.10), vec3(0.34, 0.11, 0.34),
                           vec3(0.66, 0.40, 0.48), vec3(0.72, 0.70, 0.64), vec3(0.32, 0.27, 0.13), vec3(0.20, 0.28, 0.10), vec3(0.42, 0.29, 0.17));
const float MWS[9] = float[9](0.02, 0.01, 0.03, 0.02, 0.07, 0.02, 0.38, 0.19, 0.26);     // shallow: turf / algae dominate, few pale spots
const float MWD[9] = float[9](0.09, 0.06, 0.06, 0.06, 0.09, 0.14, 0.16, 0.04, 0.22);     // deep reef / wall: sponges & tunicates (most colonies are muted)
vec3 mosaicMean(float vivid) { vec3 m = vec3(0.0); float w = 0.0; for (int i = 0; i < 9; i++) { float wi = mix(MWS[i], MWD[i], vivid); m += MC[i] * wi; w += wi; } return m / w; }
vec3 mosaicPick(float t, float vivid, out int kk) {
  float acc = 0.0; kk = 8;
  for (int i = 0; i < 9; i++) { acc += mix(MWS[i], MWD[i], vivid); if (t < acc) { kk = i; break; } }
  vec3 c = MC[kk];
  float luma = dot(c, vec3(0.30, 0.55, 0.15));
  return mix(vec3(luma) * vec3(1.0, 0.92, 0.80), c, mix(0.50, 0.78, vivid));
}
// one colony layer drawn over 'under'; returns the new colour; accumulates relief gradient / AO / pore darkness
vec3 colonyLayer(vec3 under, vec3 q, float scale, float occ, float rMin, float rMax, float vivid, float seed, float pxSize,
                 float dist, inout vec3 grad, inout float ao) {
  float cellPx = (1.0 / scale) / max(pxSize, 1e-4);
  float fade = smoothstep(2.0, 6.5, cellPx);
  vec3 meanC = mosaicMean(vivid);
  float meanCov = occ * 0.45;
  if (fade <= 0.001) return mix(under, meanC, meanCov);
  vec3 w = vec3(vn3(q * scale * 2.3 + seed), vn3(q * scale * 2.3 + seed + 7.1), vn3(q * scale * 2.3 + seed + 13.3)) - 0.5;
  vec3 p = q * scale + 0.46 * w + seed * 3.7;
  float f1, f2, ha, hb; vec3 g;
  worley3g(p, f1, f2, g, ha, hb);
  float rough = fbm3(q * scale * 6.0 + seed, 2) - 0.5;
  float r = mix(rMin, rMax, fract(ha * 17.3));
  float present = step(ha, occ);
  float d = f1 + 0.30 * rough;
  float cov = present * (1.0 - smoothstep(r * 0.72, r, d));
  int k; vec3 c = mosaicPick(hb, vivid, k);
  c *= 0.72 + 0.56 * fract(hb * 91.7);
  // colony interior: lighter growing centre, darker margin, per-type texture
  float u = clamp(d / max(r, 1e-3), 0.0, 1.0);
  c *= mix(1.10, 0.62, smoothstep(0.35, 1.0, u));
  float ptn = 1.0, poreK = 0.0;
  if (fade > 0.35) {
    if (k <= 2 || k == 5) {
      float a1, a2, ha2, hb2; vec3 g2; worley3g(q * scale * 7.0, a1, a2, g2, ha2, hb2);
      float pore = smoothstep(0.42, 0.12, a1); ptn = 1.0 - 0.50 * pore; poreK = pore;
    } else if (k == 3) {
      float a1, a2, ha2, hb2; vec3 g2; worley3g(q * scale * 5.0, a1, a2, g2, ha2, hb2);
      ptn = 1.0 - 0.55 * smoothstep(0.16, 0.05, a1) * step(0.6, ha2);
    } else if (k == 4) {
      ptn = 0.82 + 0.34 * vn3(q * scale * 14.0);
    } else {
      ptn = 0.60 + 0.80 * fbm3(q * scale * 10.0, 2);
    }
  }
  c *= mix(1.0, ptn, fade);
  // relief: colonies are low domes, their margins are crevices
  float t = clamp(d / max(r, 1e-3), 0.0, 1.0);
  float H = 0.55 / scale * 0.05;                                   // ~5 % of the colony size
  grad += -H * (6.0 * t * (1.0 - t) / max(r, 1e-3)) * g * scale * cov * fade;
  ao *= 1.0 - fade * cov * (0.40 * smoothstep(0.55, 1.0, u) + 0.30 * poreK);
  float covE = mix(meanCov, cov, fade);
  vec3 cE = mix(meanC, c, fade);
  return mix(under, cE, covE);
}
// ---- live coral skin: soft irregular patches of pigment / growth / turf (smooth warped noise: no cells, no seams) ----
// world units; each layer fades to nothing when its patches get sub-pixel. occ = how much of the surface carries this layer.
vec3 coralPatchLayer(vec3 col, vec3 q, float scale, float occ, float seed, float pxSize) {
  float cellPx = (1.0 / scale) / max(pxSize, 1e-4);
  float fade = smoothstep(1.5, 5.0, cellPx);
  if (fade <= 0.001) return col;
  vec3 w = vec3(vn3(q * scale * 0.8 + seed), vn3(q * scale * 0.8 + seed + 7.1), vn3(q * scale * 0.8 + seed + 13.3)) - 0.5;
  vec3 p = q * scale + 1.6 * w;
  float th = 1.0 - 0.36 * occ;                                              // threshold: higher occ -> larger patches
  float nPale  = smoothstep(th + 0.02, th + 0.16, vn3(p + seed * 5.3));
  float nTurf  = smoothstep(th + 0.04, th + 0.18, vn3(p * 1.15 + seed * 9.1 + 31.0));
  float nGreen = smoothstep(th + 0.06, th + 0.20, vn3(p * 0.9 + seed * 3.7 + 57.0));
  float nBrown = smoothstep(th + 0.06, th + 0.20, vn3(p * 1.05 + seed * 6.3 + 83.0));
  float nBleach = smoothstep(th + 0.14, th + 0.26, vn3(p * 1.3 + seed * 2.1 + 101.0));
  vec3 tone = vec3(1.0);
  tone = mix(tone, tone * vec3(1.26, 1.20, 1.06), nPale);
  tone = mix(tone, tone * vec3(0.62, 0.68, 0.50), nTurf);
  tone = mix(tone, tone * vec3(0.86, 1.03, 0.80), nGreen);
  tone = mix(tone, tone * vec3(1.06, 0.82, 0.62), nBrown);
  tone = mix(tone, tone * vec3(1.40, 1.36, 1.26), nBleach);
  return col * mix(vec3(1.0), tone, fade);
}
void reefMosaic(vec3 rk, vec3 under, float depth, float cover, float dist, out vec3 col, out vec3 grad, out float ao) {
  float vivid = smoothstep(8.0, 42.0, depth);
  float pxSize = dist * 0.0016;
  vec3 wq = vec3(vn3(rk * 1.7), vn3(rk * 1.7 + 7.3), vn3(rk * 1.7 + 13.1)) - 0.5;
  vec3 q = rk + 0.20 * wq;
  grad = vec3(0.0); ao = 1.0;
  vec3 c = under;
  c = colonyLayer(c, q, 1.9,  cover * 0.85, 0.40, 0.56, vivid, 1.0, pxSize, dist, grad, ao);      // big colonies (~40 cm)
  c = colonyLayer(c, q, 5.6,  cover * 0.90, 0.36, 0.54, vivid, 2.0, pxSize, dist, grad, ao);      // medium (~14 cm)
  c = colonyLayer(c, q, 17.0, cover * 0.95, 0.32, 0.52, vivid, 3.0, pxSize, dist, grad, ao);      // small (~5 cm)
  c = colonyLayer(c, q, 58.0, cover * 0.30 * (0.35 + 0.65 * vivid), 0.22, 0.38, vivid, 4.0, pxSize, dist, grad, ao);      // polyp groups (~1.5 cm)
  col = c;
}

`;
