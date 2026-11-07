// Post-processing pipeline: scene -> HDR target (+depth) -> volumetrics -> bloom -> tonemap/grade.
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_SKY } from './glsl.js';
import { U, OPTICS_PARS } from './optics.js';

const FS_VERT = /* glsl */`
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

class FullscreenPass {
  constructor(fragment, uniforms, extra = {}) {
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms, vertexShader: FS_VERT, fragmentShader: fragment,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, ...extra,
    });
    this.mesh = new THREE.Mesh(fsTriangle(), this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }
}

// ---------------------------------------------------------------------------
// Volumetric composite: sun shafts (driven by the caustic maps), background
// fill for pixels with no geometry, lamp cone.
// ---------------------------------------------------------------------------
const VOLUME_FRAG = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform mat4 uProjInv; uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uFrame;
uniform vec4 uShaft;      // x strength, y steps, z max distance, w phase g
uniform vec4 uLamp;       // x on/intensity, y cone cos, z range, w unused
uniform vec4 uLens;       // x scatter-blur k, y focus distance (m), z aperture (px*m), w pixel scale
uniform vec4 uAO;         // x strength, y radius (m), z bias, w unused
uniform vec3 uLampPos, uLampDir;
${GLSL_NOISE}
${GLSL_SKY}
${OPTICS_PARS.replace('varying vec3 vUwView;', '')}

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec3 viewPosAt(vec2 uv, float dd) { vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, dd * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566371 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

void main() {
  float d = texture(tDepth, vUv).r;
  vec3 col = texture(tColor, vUv).rgb;
  vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 vp = uProjInv * ndc; vp.xyz /= vp.w;
  vec3 dirV = normalize(vp.xyz);
  vec3 dir = normalize((uCamWorld * vec4(dirV, 0.0)).xyz);
  vec3 C = uCamPos;
  float wl = uOptA.y;
  float dist;
  bool sky = d >= 0.99999;
  if (sky) dist = 4000.0;
  else {
    vec4 nd = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 vd = uProjInv * nd; vd.xyz /= vd.w;
    dist = length(vd.xyz);
  }
  // distance scattering softness + lens depth of field: spiral gather over the scene's mip chain
  if (!sky && (uLens.z > 0.0 || uLens.x > 0.0) && C.y <= wl + 50.0) {
    float blurS = 1.0 - exp(-dist * uLens.x);
    float coc = uLens.z > 0.0 ? min(abs(1.0 / max(uLens.y, 0.2) - 1.0 / max(dist, 0.1)) * uLens.z * uLens.w, 16.0) : 0.0;
    float r = max(coc, blurS * 3.2 * uLens.w);
    if (r > 0.55) {
      float lod = log2(max(r * 0.7, 1.0));
      vec2 px = 1.0 / vec2(textureSize(tColor, 0));
      vec3 acc = vec3(0.0); float wsum = 0.0;
      float rot = ign(gl_FragCoord.xy) * 6.2831853;
      for (int i = 0; i < 16; i++) {
        float a = float(i) * 2.399963 + rot, rr = r * sqrt((float(i) + 0.5) / 16.0);
        vec2 uv2 = vUv + vec2(cos(a), sin(a)) * rr * px;
        float d2 = texture(tDepth, uv2).r;
        // do not let much-nearer geometry bleed onto a farther pixel
        vec4 nd2 = vec4(uv2 * 2.0 - 1.0, d2 * 2.0 - 1.0, 1.0); vec4 v2 = uProjInv * nd2; float z2 = length(v2.xyz / v2.w);
        float w = (z2 < dist * 0.6 && d2 < 0.99999) ? 0.08 : 1.0;
        acc += textureLod(tColor, uv2, lod).rgb * w; wsum += w;
      }
      col = acc / wsum;
    }
  }
  // ---- screen-space ambient occlusion: crevices, undersides and contact lines go dark (normal-oriented, range-checked) ----
  if (!sky && uAO.x > 0.0 && C.y < wl) {
    float fadeD = 1.0 - smoothstep(9.0, 32.0, dist);
    vec3 Pw0 = C + dir * dist;
    if (fadeD > 0.01 && Pw0.y < wl - 0.05) {
      vec2 sz = vec2(textureSize(tDepth, 0)), texel = 1.0 / sz;
      vec3 Pv = viewPosAt(vUv, d);
      vec2 uL = vUv - vec2(texel.x, 0.0), uR = vUv + vec2(texel.x, 0.0), uD = vUv - vec2(0.0, texel.y), uU = vUv + vec2(0.0, texel.y);
      vec3 Pl = viewPosAt(uL, texture(tDepth, uL).r), Pr = viewPosAt(uR, texture(tDepth, uR).r), Pd = viewPosAt(uD, texture(tDepth, uD).r), Pu = viewPosAt(uU, texture(tDepth, uU).r);
      vec3 dx = abs(Pr.z - Pv.z) < abs(Pv.z - Pl.z) ? Pr - Pv : Pv - Pl;
      vec3 dy = abs(Pu.z - Pv.z) < abs(Pv.z - Pd.z) ? Pu - Pv : Pv - Pd;
      vec3 Nv = normalize(cross(dx, dy) + 1e-9);
      if (dot(Nv, Pv) > 0.0) Nv = -Nv;
      float rad = uAO.y;
      float ruvY = rad * 0.5 / (uProjInv[1][1] * max(-Pv.z, 0.2));
      vec2 ruv = vec2(ruvY * sz.y / sz.x, ruvY);
      ruv = min(ruv, vec2(0.12));
      float occ = 0.0;
      float rot = ign(gl_FragCoord.xy + uFrame * 3.17) * 6.2831853;
      for (int i = 0; i < 14; i++) {
        float fi = (float(i) + 0.5) / 14.0;
        float a = rot + float(i) * 2.399963;
        vec2 uv2 = vUv + vec2(cos(a), sin(a)) * sqrt(fi) * ruv;
        float d2 = texture(tDepth, uv2).r;
        if (d2 >= 0.99999) continue;
        vec3 v = viewPosAt(uv2, d2) - Pv;
        float vl = length(v) + 1e-5;
        float elev = dot(Nv, v) / vl;
        float rng = 1.0 - smoothstep(0.6 * rad, 1.5 * rad, vl);
        occ += max(elev - uAO.z, 0.0) * rng;
      }
      float ao = 1.0 - clamp(occ / 14.0 * uAO.x * 2.4, 0.0, 0.92);
      col *= mix(1.0, ao, fadeD);
    }
  }
  // ---- sun shafts + lamp cone through the water column ----
  vec3 scatter = vec3(0.0), scatterL = vec3(0.0);
  float tStart = 0.0, tEnd = min(dist, uShaft.z);
  bool inWater = true;
  if (C.y > wl) {
    if (dir.y >= 0.0) inWater = false;
    else tStart = (C.y - wl) / (-dir.y);
  } else if (dir.y > 0.0) {
    tEnd = min(tEnd, (wl - C.y) / dir.y);
  }
  if (inWater && tEnd > tStart) {
    int steps = int(uShaft.y);
    float j = ign(gl_FragCoord.xy + uFrame * 5.588238);
    float ds = (tEnd - tStart) / float(steps);
    float cosT = dot(dir, uSunDirW);
    float ph = 0.55 * hg(cosT, uShaft.w) + 0.45 * hg(cosT, uShaft.w * 0.55);
    for (int i = 0; i < 64; i++) {
      if (i >= steps) break;
      float s = tStart + (float(i) + j) * ds;
      vec3 p = C + dir * s;
      vec3 Tc = exp(-uExt * s);
      vec3 sunP = uwSunAt(p);
      scatter += Tc * sunP * ph * ds;
      if (uLamp.x > 0.0) {
        vec3 lv = p - uLampPos; float lr = length(lv);
        float cs = dot(lv / lr, uLampDir);
        float cone = smoothstep(uLamp.y, mix(uLamp.y, 1.0, 0.45), cs);
        float lph = 0.5 * hg(dot(lv / lr, -dir), 0.7) + 0.03;
        scatterL += Tc * exp(-uExt * lr) * uLamp.x * cone * lph * ds / (lr * lr + 0.6);
      }
    }
    scatter *= uShaft.x * uSunCol;
  }
  col = col + scatter + scatterL;
  // sanitize: a single NaN/Inf would poison the whole bloom chain
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  col = min(col, vec3(30000.0));
  outColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------------------
// Bloom (progressive downsample / upsample)
// ---------------------------------------------------------------------------
const DOWN_FRAG = /* glsl */`
precision highp float; in vec2 vUv; out vec4 outColor;
uniform sampler2D tSrc; uniform sampler2D tExpo; uniform vec2 uTexel; uniform float uFirst;
vec3 kar(vec3 c) { return c / (1.0 + max(max(c.r, c.g), c.b) * 0.25); }
void main() {
  vec2 t = uTexel;
  vec3 a = texture(tSrc, vUv + t * vec2(-2, 2)).rgb, b = texture(tSrc, vUv + t * vec2(0, 2)).rgb, c = texture(tSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 d = texture(tSrc, vUv + t * vec2(-2, 0)).rgb, e = texture(tSrc, vUv).rgb,               f = texture(tSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture(tSrc, vUv + t * vec2(-2, -2)).rgb, h = texture(tSrc, vUv + t * vec2(0, -2)).rgb, i = texture(tSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 j = texture(tSrc, vUv + t * vec2(-1, 1)).rgb, k = texture(tSrc, vUv + t * vec2(1, 1)).rgb;
  vec3 l = texture(tSrc, vUv + t * vec2(-1, -1)).rgb, m = texture(tSrc, vUv + t * vec2(1, -1)).rgb;
  vec3 r;
  if (uFirst > 0.5) {
    r = kar((a + b + d + e) * 0.03125) + kar((b + c + e + f) * 0.03125) + kar((d + e + g + h) * 0.03125) + kar((e + f + h + i) * 0.03125) + kar((j + k + l + m) * 0.125);
    // soft threshold: keep only energy above the paper-white level
    float ex = texture(tExpo, vec2(0.5)).r;
    float lum = max(max(r.r, r.g), r.b) * ex;
    r *= smoothstep(0.55, 2.2, lum);
  } else {
    r = (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + e * 0.125 + (j + k + l + m) * 0.125;
  }
  outColor = vec4(r, 1.0);
}`;
const UP_FRAG = /* glsl */`
precision highp float; in vec2 vUv; out vec4 outColor;
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uMix;
void main() {
  vec2 t = uTexel;
  vec3 s = texture(tSrc, vUv + t * vec2(-1, 1)).rgb + texture(tSrc, vUv + t * vec2(0, 1)).rgb * 2.0 + texture(tSrc, vUv + t * vec2(1, 1)).rgb
         + texture(tSrc, vUv + t * vec2(-1, 0)).rgb * 2.0 + texture(tSrc, vUv).rgb * 4.0 + texture(tSrc, vUv + t * vec2(1, 0)).rgb * 2.0
         + texture(tSrc, vUv + t * vec2(-1, -1)).rgb + texture(tSrc, vUv + t * vec2(0, -1)).rgb * 2.0 + texture(tSrc, vUv + t * vec2(1, -1)).rgb;
  outColor = vec4(texture(tPrev, vUv).rgb * uMix + s / 16.0, 1.0);
}`;

// ---------------------------------------------------------------------------
// Final: exposure, tonemap, grade, vignette, grain
// ---------------------------------------------------------------------------
const FINAL_FRAG = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D tHdr; uniform sampler2D tBloom; uniform sampler2D tExpo;
uniform float uExposure, uBloom, uVignette, uGrain, uFrame, uSat, uContrast, uCA;
uniform vec3 uTint;
uniform vec2 uRes;

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// keeps hue better in bright saturated blues than raw per-channel ACES
vec3 tonemap(vec3 c) {
  vec3 a = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 lum = vec3(aces(vec3(l)).g);
  vec3 b = c * (lum.x / max(l, 1e-5));                 // luminance-preserving version
  b = clamp(b, 0.0, 1.0);
  return mix(a, b, 0.35);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

uniform float uFxaa;
float uEx;
// exposure + bloom + tonemap + grade (everything before vignette / grain) for one texel
vec3 shade(vec2 uv, vec2 off) {
  vec3 hdr;
  if (dot(off, off) > 0.0) { hdr.r = texture(tHdr, uv + off).r; hdr.g = texture(tHdr, uv).g; hdr.b = texture(tHdr, uv - off).b; }
  else hdr = texture(tHdr, uv).rgb;
  vec3 c = (hdr + texture(tBloom, uv).rgb * uBloom) * uEx;
  c = tonemap(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  return clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
}
float lumaOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  uEx = uExposure > 0.0 ? uExposure : texture(tExpo, vec2(0.5)).r;
  // lateral chromatic aberration (subtle, lens-like)
  vec2 off = cc * uCA * dot(cc, cc);
  vec3 c = shade(uv, off);
  if (uFxaa > 0.5) {
    // cheap FXAA (Lottes' original edge-directed blur) on the tonemapped image; only engages where local contrast is high
    vec2 px = 1.0 / vec2(textureSize(tHdr, 0));
    vec3 cNW = shade(uv + vec2(-1.0, -1.0) * px, vec2(0.0)), cNE = shade(uv + vec2(1.0, -1.0) * px, vec2(0.0));
    vec3 cSW = shade(uv + vec2(-1.0, 1.0) * px, vec2(0.0)), cSE = shade(uv + vec2(1.0, 1.0) * px, vec2(0.0));
    float lNW = lumaOf(cNW), lNE = lumaOf(cNE), lSW = lumaOf(cSW), lSE = lumaOf(cSE), lM = lumaOf(c);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin > max(0.045, lMax * 0.12)) {
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * px;
      vec3 A = 0.5 * (shade(uv + dir * (1.0 / 3.0 - 0.5), vec2(0.0)) + shade(uv + dir * (2.0 / 3.0 - 0.5), vec2(0.0)));
      vec3 B = A * 0.5 + 0.25 * (shade(uv + dir * -0.5, vec2(0.0)) + shade(uv + dir * 0.5, vec2(0.0)));
      float lB = lumaOf(B);
      c = (lB < lMin || lB > lMax) ? A : B;
    }
  }
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // vignette
  float v = 1.0 - uVignette * smoothstep(0.35, 1.05, length(cc * vec2(1.0, 0.85)) * 1.6);
  c *= v;
  c = srgb(c);
  // film grain + dither
  float n = ign(gl_FragCoord.xy + uFrame * 7.13) - 0.5;
  float n2 = ign(gl_FragCoord.yx * 1.37 + uFrame * 3.71 + 11.0) - 0.5;
  c += (n + n2) * (uGrain * (1.0 - 0.6 * l) + 0.5 / 255.0);
  outColor = vec4(c, 1.0);
}`;

const LUM_FRAG = /* glsl */`
precision highp float; in vec2 vUv; out vec4 outColor;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFloor;
float lumOf(vec3 c) { return clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), uFloor, 12.0); }
void main() {
  // centre-weighted: down-weight the borders (vignette / edges of frame)
  vec3 a = texture(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb, b = texture(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb;
  vec3 c = texture(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb,  d = texture(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  float l = 0.25 * (lumOf(a) + lumOf(b) + lumOf(c) + lumOf(d));
  // brightest channel (a saturated red subject has tiny luminance but a clipping red channel)
  float mx = 0.25 * (min(max(max(a.r, a.g), a.b), 12.0) + min(max(max(b.r, b.g), b.b), 12.0) + min(max(max(c.r, c.g), c.b), 12.0) + min(max(max(d.r, d.g), d.b), 12.0));
  vec2 q = vUv - 0.5;
  float w = exp(-dot(q, q) * 3.0);
  float m2 = mx * mx;
  // third channel: weighted mean of (brightest channel)^4 -> peak-weighted metering, so a bright lit subject on a
  // dark background sets the exposure instead of the empty water around it
  outColor = vec4(w * log(l + 1e-5), w, w * m2 * m2, 1.0);
}`;
const EXPO_FRAG = /* glsl */`
precision highp float; in vec2 vUv; out vec4 outColor;
uniform sampler2D tLum; uniform sampler2D tPrev;
uniform float uKey, uAdapt, uMin, uMax, uComp, uFixed, uFixedVal;
void main() {
  // weighted mean of log-luminance from the mip chain (log*w and w averaged separately)
  vec4 m = textureLod(tLum, vec2(0.5), 20.0);
  float avgLog = m.x / max(m.y, 1e-4);
  float target = uKey / exp(avgLog);
  target = clamp(target * uComp, uMin, uMax);
  // lamp-lit deep scenes: start from the fixed ROV exposure, but let a bright close subject pull it down
  float lPk = pow(max(m.z / max(m.y, 1e-4), 1e-12), 0.25);          // 4th-power mean: dominated by the brightest content
  float tLit = clamp(uKey * 0.78 / lPk, 0.05, 4.0);
  float fixedE = exp(mix(log(uFixedVal), log(tLit), 0.9));
  target = exp(mix(log(target), log(fixedE), uFixed));
  float prev = texture(tPrev, vec2(0.5)).r;
  float e = (prev <= 0.0) ? target : exp(mix(log(prev), log(target), uAdapt));
  outColor = vec4(e, 0.0, 0.0, 1.0);
}`;

// ---------------------------------------------------------------------------
// Temporal anti-aliasing resolve (live view only; stills use jittered accumulation).
// The scene is rendered with a sub-pixel jitter; the history is reprojected with the camera motion, clipped to the colour range of the
// current 3x3 neighbourhood (rejects ghosts from moving fish / swaying plants), and blended in a tonemapped space so bright glints do not fire-fly.
// ---------------------------------------------------------------------------
const TAA_FRAG = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D tCur; uniform sampler2D tHist; uniform sampler2D tDepth;
uniform mat4 uReproj;          // previous view-projection * inverse(current view-projection), both un-jittered
uniform vec2 uJit;             // jitter of the current frame in NDC
uniform vec2 uTexel;
uniform float uValid;          // 0: no usable history
uniform float uAlpha;          // weight of the current frame
uniform float uSharp;
uniform vec4 uPlayer;          // x,y = screen position (uv) of a subject that moves with the camera, z = radius (uv-y units), w = enabled
uniform vec2 uPD;              // depth-buffer range of that subject
uniform float uAspect;
vec3 toL(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 fromL(vec3 c) { return c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-3); }
// Catmull-Rom history fetch (5 bilinear taps) keeps the resolved image from blurring under motion
vec3 histCR(vec2 uv) {
  vec2 sz = 1.0 / uTexel, pos = uv * sz, c = floor(pos - 0.5) + 0.5, f = pos - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, t12 = (c + w2 / w12) * uTexel, t0 = (c - 1.0) * uTexel, t3 = (c + 2.0) * uTexel;
  vec3 r = texture(tHist, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y) + texture(tHist, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
         + texture(tHist, t12).rgb * (w12.x * w12.y)
         + texture(tHist, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y) + texture(tHist, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
  return max(r, vec3(0.0));
}
void main() {
  vec3 c0 = texture(tCur, vUv).rgb;
  if (any(isnan(c0)) || any(isinf(c0))) c0 = vec3(0.0);
  if (uValid < 0.5) { outColor = vec4(c0, 1.0); return; }
  vec3 m1 = vec3(0.0), m2 = vec3(0.0), cmin = vec3(1e9), cmax = vec3(-1e9);
  float dNear = 2.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 uv = vUv + vec2(float(i), float(j)) * uTexel;
    vec3 c = toL(max(texture(tCur, uv).rgb, vec3(0.0)));
    m1 += c; m2 += c * c; cmin = min(cmin, c); cmax = max(cmax, c);
    dNear = min(dNear, texture(tDepth, uv).r);
  }
  m1 /= 9.0; m2 /= 9.0;
  vec3 sg = sqrt(max(m2 - m1 * m1, vec3(0.0)));
  vec3 lo = max(cmin, m1 - 1.6 * sg), hi = min(cmax, m1 + 1.6 * sg);
  vec2 ndc = vUv * 2.0 - 1.0 - uJit;                              // where the sample of this pixel really sits in the un-jittered image
  vec4 q = uReproj * vec4(ndc, dNear * 2.0 - 1.0, 1.0);
  vec2 hNdc = q.xy / q.w + uJit;                                  // + jitter: motion is applied to the pixel centre
  vec2 huv = hNdc * 0.5 + 0.5;
  if (uPlayer.w > 0.5 && dNear >= uPD.x && dNear <= uPD.y && length((vUv - uPlayer.xy) * vec2(uAspect, 1.0)) < uPlayer.z) huv = vUv;     // the player's fish swims with the camera: no reprojection
  float vel = length((huv - vUv) / uTexel);
  vec3 cur = toL(c0);
  if (q.w <= 0.0 || any(lessThan(huv, vec2(0.0))) || any(greaterThan(huv, vec2(1.0)))) { outColor = vec4(c0, 1.0); return; }
  vec3 h = toL(histCR(huv));
  vec3 hc = clamp(h, lo, hi);
  float clipped = length(h - hc) / (length(h) + 0.02);            // how much the clamp had to move the history (disocclusion / motion / lighting change)
  float a = mix(uAlpha, 0.40, clamp(vel / 10.0, 0.0, 1.0));
  a = mix(a, 0.60, clamp(clipped * 2.0, 0.0, 1.0));
  vec3 res = mix(hc, cur, a);
  res += (res - m1) * uSharp;                                     // mild re-sharpening of what temporal blending softens
  res = clamp(res, 0.0, 0.9995);
  outColor = vec4(fromL(res), 1.0);
}`;

const ACC_FRAG = /* glsl */`
precision highp float; in vec2 vUv; out vec4 outColor;
uniform sampler2D tSrc; uniform float uW;
void main() { outColor = vec4(texture(tSrc, vUv).rgb * uW, 1.0); }`;

const HALTON = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.frame = 0;
    this.msaa = 4;
    this.ss = 1.0;                  // supersampling factor for the scene target
    this.size = new THREE.Vector2(2, 2);
    this.params = { exposure: 0, key: 0.14, expComp: 1.0, adaptSpeed: 1.5, dt: 0.016, bloom: 0.5, vignette: 0.28, grain: 0.012, sat: 1.06, contrast: 1.10, ca: 0.008, tint: new THREE.Color(1, 1, 1), shaft: 0.22, shaftSteps: 40, shaftMax: 90, shaftG: 0.78, blurK: 0.010, focus: 5, aperture: 0, deepExposure: 0.46, ao: 1.1, aoRadius: 0.55, aoBias: 0.12 };

    this.volume = new FullscreenPass(VOLUME_FRAG, Object.assign({}, U, {
      tColor: { value: null }, tDepth: { value: null },
      uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uFrame: { value: 0 },
      uShaft: { value: new THREE.Vector4(1, 40, 90, 0.78) },
      uLamp: { value: new THREE.Vector4(0, 0.9, 40, 0) }, uLens: { value: new THREE.Vector4(0.010, 5, 0, 1) }, uAO: { value: new THREE.Vector4(1.1, 0.55, 0.12, 0) },  uLampPos: { value: new THREE.Vector3() }, uLampDir: { value: new THREE.Vector3(0, 0, -1) },
    }));
    this.down = new FullscreenPass(DOWN_FRAG, { tSrc: { value: null }, tExpo: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.up = new FullscreenPass(UP_FRAG, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
    this.final = new FullscreenPass(FINAL_FRAG, {
      tHdr: { value: null }, tBloom: { value: null }, tExpo: { value: null }, uExposure: { value: 0 }, uBloom: { value: 0.5 }, uVignette: { value: 0.3 },
      uFxaa: { value: 0 },
      uGrain: { value: 0.01 }, uFrame: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 }, uCA: { value: 0.3 },
      uTint: { value: new THREE.Color(1, 1, 1) }, uRes: { value: new THREE.Vector2(1, 1) },
    });
    this.lum = new FullscreenPass(LUM_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFloor: { value: 1e-4 } });
    this.expo = new FullscreenPass(EXPO_FRAG, { tLum: { value: null }, tPrev: { value: null }, uKey: { value: 0.16 }, uAdapt: { value: 1 }, uMin: { value: 0.02 }, uMax: { value: 5000 }, uComp: { value: 1 }, uFixed: { value: 0 }, uFixedVal: { value: 1.0 } });
    this.expoRT = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }));
    this.expoIdx = 0; this.expoInstant = true;
    this.taaPass = new FullscreenPass(TAA_FRAG, {
      tCur: { value: null }, tHist: { value: null }, tDepth: { value: null }, uReproj: { value: new THREE.Matrix4() }, uJit: { value: new THREE.Vector2() },
      uPlayer: { value: new THREE.Vector4(0, 0, 0, 0) }, uPD: { value: new THREE.Vector2(0, 1) }, uAspect: { value: 1 },
      uTexel: { value: new THREE.Vector2() }, uValid: { value: 0 }, uAlpha: { value: 0.10 }, uSharp: { value: 0.10 },
    });
    this.taa = true;                     // live view only (render() into the canvas); snapshots are rendered by renderAccum / into a target
    this._taaIdx = 0; this._taaValid = false; this._jit = new THREE.Vector2();
    this._vpPrev = new THREE.Matrix4(); this._vpCur = new THREE.Matrix4(); this._vpInv = new THREE.Matrix4(); this._proj0 = new THREE.Matrix4();
    this._prevPos = new THREE.Vector3(); this._prevQuat = new THREE.Quaternion(); this._havePrev = false;
    this.acc = new FullscreenPass(ACC_FRAG, { tSrc: { value: null }, uW: { value: 1 } }, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.targets = null;
  }

  _makeTargets(w, h) {
    this.dispose();
    const iw = Math.max(2, Math.round(w * this.ss)), ih = Math.max(2, Math.round(h * this.ss));
    const depth = new THREE.DepthTexture(iw, ih);
    depth.format = THREE.DepthStencilFormat; depth.type = THREE.UnsignedInt248Type;
    const scene = new THREE.WebGLRenderTarget(iw, ih, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true, depthTexture: depth,
      samples: this.msaa, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
    });
    const mk = (a, b) => new THREE.WebGLRenderTarget(a, b, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    const hdr = mk(iw, ih);
    const accum = mk(iw, ih);
    const lum = new THREE.WebGLRenderTarget(256, 144, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
    const bloom = [];
    let bw = iw, bh = ih;
    for (let i = 0; i < 6; i++) { bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); bloom.push(mk(bw, bh)); }
    const bloomUp = [];
    for (let i = 0; i < 5; i++) bloomUp.push(mk(bloom[i].width, bloom[i].height));
    const histA = mk(iw, ih), histB = mk(iw, ih);
    this.targets = { scene, hdr, accum, lum, bloom, bloomUp, iw, ih, depth, hist: [histA, histB], histIdx: 0 };
    this._taaValid = false;
  }

  setSize(w, h) {
    this.size.set(w, h);
    this._makeTargets(w, h);
  }

  dispose() {
    if (!this.targets) return;
    const t = this.targets;
    [t.scene, t.hdr, t.accum, t.lum, ...t.bloom, ...t.bloomUp, ...t.hist].forEach(r => r.dispose());
    t.depth.dispose();
    this.targets = null;
  }

  // scene + volumetrics into t.hdr
  _renderScene(scene, camera) {
    const r = this.renderer, t = this.targets, p = this.params;
    this.frame++;
    U.uFrameJ.value = this.frame;
    r.setRenderTarget(t.scene);
    r.clear();
    r.render(scene, camera);
    const vu = this.volume.material.uniforms;
    vu.tColor.value = t.scene.texture; vu.tDepth.value = t.depth;
    vu.uProjInv.value.copy(camera.projectionMatrixInverse);
    vu.uCamWorld.value.copy(camera.matrixWorld);
    vu.uCamPos.value.copy(camera.position);
    vu.uFrame.value = this.frame;
    vu.uShaft.value.set(p.shaft, p.shaftSteps, p.shaftMax, p.shaftG);
    vu.uLens.value.set(p.blurK ?? 0.010, p.focus ?? 5, p.aperture ?? 0, t.ih / 900);
    vu.uAO.value.set(p.ao ?? 0, p.aoRadius ?? 0.55, p.aoBias ?? 0.12, 0);
    this.volume.render(r, t.hdr);
  }

  // renders one frame; output goes to `outTarget` (null = the canvas)
  render(scene, camera, outTarget = null) {
    if (!(this.taa && outTarget === null && !camera.view)) {          // snapshots / disabled: plain render
      this._renderScene(scene, camera);
      this._finish(this.targets.hdr, outTarget);
      return;
    }
    const t = this.targets, r = this.renderer;
    // --- sub-pixel jitter (Halton 2,3), applied to the projection matrix directly so the sign convention is known
    this._proj0.copy(camera.projectionMatrix);
    const i = (this._taaIdx++ % 16) + 1;
    this._jit.set((HALTON(i, 2) - 0.5) * 2 / t.iw, (HALTON(i, 3) - 0.5) * 2 / t.ih);
    camera.projectionMatrix.elements[8] -= this._jit.x; camera.projectionMatrix.elements[9] -= this._jit.y;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    this._renderScene(scene, camera);
    // --- restore the un-jittered projection
    camera.projectionMatrix.copy(this._proj0); camera.projectionMatrixInverse.copy(this._proj0).invert();
    // --- camera cut detection: reset the history on teleports / big turns
    camera.updateMatrixWorld();
    if (this._havePrev && (camera.position.distanceTo(this._prevPos) > 4 || camera.quaternion.angleTo(this._prevQuat) > 0.45)) this._taaValid = false;
    this._prevPos.copy(camera.position); this._prevQuat.copy(camera.quaternion); this._havePrev = true;
    // --- resolve
    this._vpCur.multiplyMatrices(this._proj0, camera.matrixWorldInverse);
    this._vpInv.copy(this._vpCur).invert();
    const tu = this.taaPass.material.uniforms, read = t.hist[t.histIdx], write = t.hist[1 - t.histIdx];
    tu.tCur.value = t.hdr.texture; tu.tHist.value = read.texture; tu.tDepth.value = t.depth;
    tu.uReproj.value.multiplyMatrices(this._vpPrev, this._vpInv);
    tu.uJit.value.copy(this._jit); tu.uTexel.value.set(1 / t.iw, 1 / t.ih); tu.uAspect.value = t.iw / t.ih;
    { const sp = this.taaSubject; if (sp && sp.on) { tu.uPlayer.value.set(sp.u, sp.v, sp.r, 1); tu.uPD.value.set(sp.d0, sp.d1); } else tu.uPlayer.value.w = 0; }
    tu.uValid.value = this._taaValid ? 1 : 0;
    this.taaPass.render(r, write);
    t.histIdx = 1 - t.histIdx;
    this._vpPrev.copy(this._vpCur); this._taaValid = true;
    this._finish(write, outTarget);
  }

  resetHistory() { this._taaValid = false; this._havePrev = false; }

  // n jittered sub-frames averaged in HDR (AA + noise removal + optional motion blur)
  renderAccum(scene, camera, n, outTarget = null, beforeFrame = null) {
    const r = this.renderer, t = this.targets;
    r.setRenderTarget(t.accum); r.setClearColor(0x000000, 1); r.clear();
    this.acc.material.uniforms.uW.value = 1 / n;
    const size = t.iw, sizeH = t.ih;
    for (let k = 0; k < n; k++) {
      if (beforeFrame) beforeFrame(k, n);
      camera.setViewOffset(size, sizeH, HALTON(k + 1, 2) - 0.5, HALTON(k + 1, 3) - 0.5, size, sizeH);
      this._renderScene(scene, camera);
      this.acc.material.uniforms.tSrc.value = t.hdr.texture;
      this.acc.render(r, t.accum);
    }
    camera.clearViewOffset();
    this._finish(t.accum, outTarget);
  }

  _finish(hdrRT, outTarget) {
    const r = this.renderer, t = this.targets, p = this.params;
    // 2b. auto exposure
    this.lum.material.uniforms.tSrc.value = hdrRT.texture;
    this.lum.material.uniforms.uTexel.value.set(1 / hdrRT.width, 1 / hdrRT.height);
    this.lum.material.uniforms.uFloor.value = p.lumFloor ?? 1e-4;
    this.lum.render(r, t.lum);
    const eu = this.expo.material.uniforms;
    const expoCur = this.expoRT[this.expoIdx], nxt = this.expoRT[1 - this.expoIdx];
    eu.tLum.value = t.lum.texture; eu.tPrev.value = expoCur.texture;
    eu.uKey.value = p.key; eu.uComp.value = p.expComp; eu.uFixed.value = p.deepFixed || 0; eu.uFixedVal.value = p.deepExposure ?? 1.0;
    eu.uAdapt.value = this.expoInstant ? 1.0 : 1.0 - Math.exp(-p.dt * p.adaptSpeed);
    this.expo.render(r, nxt);
    this.expoIdx = 1 - this.expoIdx;
    const expoTex = nxt.texture;
    // 3. bloom
    let src = hdrRT;
    const du = this.down.material.uniforms;
    for (let i = 0; i < t.bloom.length; i++) {
      du.tSrc.value = src.texture; du.tExpo.value = expoTex; du.uTexel.value.set(1 / src.width, 1 / src.height); du.uFirst.value = i === 0 ? 1 : 0;
      this.down.render(r, t.bloom[i]);
      src = t.bloom[i];
    }
    const uu = this.up.material.uniforms;
    let cur = t.bloom[t.bloom.length - 1];
    for (let i = t.bloom.length - 2; i >= 0; i--) {
      uu.tSrc.value = cur.texture; uu.tPrev.value = t.bloom[i].texture;
      uu.uTexel.value.set(1 / cur.width, 1 / cur.height); uu.uMix.value = 1.0;
      this.up.render(r, t.bloomUp[i]);
      cur = t.bloomUp[i];
    }
    // 4. final
    const fu = this.final.material.uniforms;
    fu.tHdr.value = hdrRT.texture; fu.tBloom.value = cur.texture; fu.tExpo.value = expoTex;
    fu.uExposure.value = p.exposure; fu.uBloom.value = p.bloom; fu.uVignette.value = p.vignette;
    fu.uGrain.value = p.grain; fu.uFrame.value = this.frame; fu.uSat.value = p.sat; fu.uContrast.value = p.contrast; fu.uCA.value = p.ca;
    fu.uTint.value.copy(p.tint);
    fu.uRes.value.copy(this.size);
    fu.uFxaa.value = (this.msaa === 0 && this.fxaa !== false && hdrRT === t.hdr) ? 1 : 0;
    this.final.render(r, outTarget);
  }
}
