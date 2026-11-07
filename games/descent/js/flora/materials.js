// Material factory for instanced life (corals, sponges, plants). One patched
// MeshStandardMaterial; the surface look is chosen by aInfo.w ("kind") in the shader.
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_MOSAIC } from '../glsl.js';
import { uw, SWAY_GLSL } from '../optics.js';

// kind codes: 0 branching, 1 table, 2 massive, 3 brain, 4 rock, 5 sponge, 6 fan, 7 anemone, 8 algae, 9 seagrass
const VERT_DECL = /* glsl */`
attribute vec4 aInfo;
varying vec4 vInfo;
varying vec3 vObjP;
varying vec3 vObjN;
varying float vInst;
uniform float uSwayAmt;
uniform float uSwayH;
${SWAY_GLSL}
`;

const FRAG_DECL = /* glsl */`
${GLSL_NOISE}
${GLSL_MOSAIC}
varying vec4 vInfo;
varying vec3 vObjP;
varying vec3 vObjN;
varying float vInst;
uniform float uBumpScale;
uniform float uFrameJ;
uniform vec2 uNearFade;
uniform vec4 uOccl;
uniform vec2 uOcclP;
uniform float uTransl;
uniform vec3 uTipCol;
float fH; float fAO; float fRough; float fTransl; vec3 fEmis;

vec3 uwBumpNormal(vec3 surfPos, vec3 surfNorm, float h, float faceDir) {
  vec2 dH = vec2(dFdx(h), dFdy(h));
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 R1 = cross(sy, surfNorm), R2 = cross(surfNorm, sx);
  float det = dot(sx, R1);
  vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
  vec3 v = abs(det) * surfNorm - grad;
  float l2 = dot(v, v);
  // bump is meaningless where the pixel footprint degenerates (thin silhouettes): keep the geometric normal
  if (!(l2 > 1e-30) || abs(det) < 1e-9) return surfNorm;
  return v * inversesqrt(l2);
}

// Returns albedo; sets fH (relief in metres of object space), fAO, fRough
vec3 floraSurface(vec3 tint, vec3 p, vec3 n, vec4 info, float inst, float dist) {
  float kind = info.w;
  vec3 q = p + inst * 31.7;
  float lodA = 1.0 - smoothstep(4.0, 22.0, dist);      // fine detail fades with distance
  float pxm = max(length(dFdx(q)), length(dFdy(q)));  // object-space metres per pixel
  float rnd = info.y;
  vec3 col = tint;
  fH = 0.0; fAO = 1.0; fRough = 0.85; fTransl = 0.0; fEmis = vec3(0.0);

#if defined(K_0)
  if (kind >= -1.0 && kind < 0.5) {
    float term = step(9.5, info.z), lvl = info.z - 10.0 * term;
    float tip = smoothstep(0.62, 1.0, info.x) * term;
    float baseDark = 1.0 - (1.0 - smoothstep(0.0, 0.22, info.x)) * step(lvl, 0.5) * 0.35;
    vec4 w = worley3d(q * 420.0);
    float pit = smoothstep(0.58, 0.16, w.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 420.0));
    vec4 w2 = worley3d(q * 70.0 + 9.0);
    float bump2 = smoothstep(0.55, 0.15, w2.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 70.0));
    col *= 0.86 + 0.28 * rnd;
    col *= 0.94 + 0.12 * bump2;
    col = mix(col, mix(col, vec3(0.92, 0.9, 0.82), 0.6), tip);
    col *= baseDark;
    col *= 1.0 - 0.17 * pit * lodA;
    // slow colour drift along the colony
    col *= 0.9 + 0.2 * vn3(q * 5.0);
    fH = -0.0010 * pit * lodA + 0.0016 * bump2 * lodA;
    fAO = (1.0 - 0.20 * pit * lodA) * mix(0.62, 1.0, smoothstep(0.05, 0.55, p.y * 1.1 + length(p.xz) * 0.5));
    fTransl = 0.32 * tip;
    fRough = 0.88;  }
#endif

#if defined(K_1)
  if (kind >= 0.5 && kind < 1.5) {
                                  // ---- table coral: radially ribbed plate, pale growing margin, dark ribbed underside
    float up = smoothstep(0.1, 0.5, n.y);
    float rad = length(p.xz);
    float ang = atan(p.z, p.x);
    float warp = fbm3(q * 1.6, 3);
    float wv2 = fbm3(q * 4.5 + 13.0, 3);
    float fine = mix(0.5 + 0.5 * cos(ang * 30.0 + warp * 9.0 + wv2 * 5.0), 0.5 + 0.5 * cos(ang * 72.0 + warp * 13.0 + wv2 * 7.0 + rad * 6.0), smoothstep(0.22, 0.65, rad));
    fine = mix(0.5, fine, smoothstep(0.05, 0.30, rad));
    fine = mix(fine, 0.5, smoothstep(0.10, 0.28, pxm * 24.0));
    vec4 w = worley3d(vec3(p.x * 62.0, p.y * 14.0, p.z * 62.0) + inst * 11.0);
    float dome = smoothstep(0.62, 0.05, w.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 62.0));
    float mott = fbm3(q * 2.2, 3);
    float band = 0.5 + 0.5 * sin(rad * 22.0 + warp * 6.0);
    col *= 0.90 + 0.35 * mott;
    col *= 0.62 + 0.62 * fine + 0.10 * band;
    col *= mix(1.0, 0.70 + 0.55 * dome, up * lodA);
    float under = 1.0 - smoothstep(-0.45, 0.0, n.y);                                    // faces that point down
    col = mix(col, col * vec3(0.66, 0.62, 0.58) * (0.78 + 0.45 * fine), under);          // underside: darker, ribbed, not black
    // growing margin: pale on both faces, with bright radial branchlet tips
    float marg = smoothstep(0.55, 1.0, rad);
    col = mix(col, mix(col, uTipCol, 0.75), marg * 0.85);
    col += uTipCol * 0.30 * marg * pow(fine, 3.0);
    float rimf = (1.0 - smoothstep(0.0, 0.45, abs(n.y))) * smoothstep(0.74, 0.92, rad);  // the thin growing edge
    col = mix(col, uTipCol * 0.85, rimf * 0.80);
    fH = 0.0032 * dome * up * lodA + 0.006 * (fine - 0.5) * up + 0.004 * (fine - 0.5) * under;
    fAO = mix(1.0, 0.78, under * (1.0 - 0.6 * marg)) * mix(1.0, 0.65 + 0.35 * dome, up * lodA);
    fRough = 0.9;  }
#endif

#if defined(K_2)
  if (kind >= 1.5 && kind < 2.5) {
                                  // ---- massive / boulder coral: fine corallite texture, colour patches, bio-film, scattered encrusters
    vec4 w = worley3d(q * 70.0);
    float pit = smoothstep(0.52, 0.12, w.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 70.0));
    vec4 wp2 = worley3d(q * 230.0 + 5.0);
    float mouth = smoothstep(0.36, 0.08, wp2.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 230.0));
    vec4 wm3 = worley3d(q * 28.0 + 2.0);                                         // 3.5 cm pits / tubercles
    float tub = smoothstep(0.55, 0.12, wm3.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 28.0));
    float mott = fbm3(q * 2.6 + 4.0, 4);
    float mott2 = fbm3(q * 6.5, 3);
    float mott3 = fbm3(q * 1.3 + 17.0, 3);
    vec3 alt = mix(tint * vec3(0.86, 0.90, 0.74), tint * vec3(1.20, 1.06, 0.82), smoothstep(0.35, 0.65, mott3));
    col = mix(col, alt, smoothstep(0.38, 0.64, mott));
    col *= 0.76 + 0.50 * mott2;
    float mott4 = fbm3(q * 14.0 + 7.0, 3);
    col *= 0.80 + 0.40 * smoothstep(0.30, 0.70, mott4);                                                  // 5-15 cm patchiness
    vec3 pwc = uwWorldFromView( - vViewPosition ); float pxS = dist * 0.0016;
    col = coralPatchLayer(col, pwc, 1.3, 0.85, 1.0, pxS);
    col = coralPatchLayer(col, pwc, 4.2, 0.75, 2.0, pxS);
    col = coralPatchLayer(col, pwc, 13.0, 0.65, 3.0, pxS);
    // fine turf / bio-film on the flanks and base, pale living tissue on the upper lobes
    float flank = 1.0 - smoothstep(0.15, 0.7, n.y);
    float turf = fbm3(q * 4.0 + 33.0, 3);
    col = mix(col, vec3(0.22, 0.21, 0.11) * (0.7 + 0.6 * mott2), flank * 0.55 * smoothstep(0.35, 0.7, turf));
    col = mix(col, col * vec3(0.55, 0.58, 0.42), (1.0 - smoothstep(0.0, 0.24, info.x)) * 0.60);
    col = mix(col, col * vec3(1.14, 1.10, 0.96), smoothstep(0.5, 0.9, n.y) * smoothstep(0.50, 0.75, fbm3(q * 9.0 + 5.0, 2)) * 0.5);
    // scattered encrusting sponges / tunicates on the less healthy parts (same community as the seabed)
    { float dpt = max( uOptA.y - pwc.y, 0.0 ); vec3 mc; vec3 mg; float mao;
      float cov = 0.18 * smoothstep(90.0, 3.0, dpt) * (0.4 + 0.6 * smoothstep(0.4, 0.7, turf));
      reefMosaic( pwc * vec3( 1.0, 1.15, 1.0 ), col, dpt, cov, dist, mc, mg, mao );
      col = mc; fAO *= mao; }
    col *= 1.0 - 0.30 * pit * lodA - 0.26 * mouth - 0.16 * tub;
    vec4 wn = worley3d(q * 8.5 + 3.0);
    float nod = (1.0 - smoothstep(0.0, 0.62, wn.x)) * info.z * (1.0 - smoothstep(0.10, 0.28, pxm * 8.5));
    col *= 1.0 + 0.10 * nod - 0.05 * info.z;
    fH = -0.0012 * pit * lodA - 0.0008 * mouth + 0.0014 * (1.0 - tub) * lodA + 0.0040 * mott2 + 0.012 * nod;
    fAO = fAO * (1.0 - 0.20 * pit * lodA) * mix(0.55, 1.0, smoothstep(0.02, 0.45, info.x)) * (0.90 + 0.10 * nod);
    fRough = 0.84;  }
#endif

#if defined(K_3)
  if (kind >= 2.5 && kind < 3.5) {
                                  // ---- brain coral (meandroid grooves)
    vec4 f = fbm3d(q * 7.5, 3);
    float ph = f.x * 9.0;
    float ridge = 0.5 + 0.5 * cos(6.2831853 * ph);
    float wv = 0.42 + 0.2 * vn3(q * 9.0);
    float aaB = 1.0 - smoothstep(0.05, 0.16, abs(dFdx(ph)) + abs(dFdy(ph)));      // cycles per pixel
    ridge = mix(0.5, ridge, aaB);
    float valley = smoothstep(wv, wv + 0.42, 1.0 - ridge) * 0.85 * aaB + 0.30 * (1.0 - aaB);
    float mott = fbm3(q * 2.0 + 9.0, 3), mott2 = fbm3(q * 5.5, 3);
    vec3 alt = tint * vec3(0.78, 0.98, 0.7);
    col = mix(col, alt, smoothstep(0.42, 0.68, mott));
    col *= 0.80 + 0.36 * mott2;
    col = mix(col, tint * vec3(0.66, 0.60, 0.46) * 0.9, valley * 0.42);
    col *= 1.0 + 0.10 * smoothstep(0.7, 1.0, ridge) * lodA;
    { vec3 pwc = uwWorldFromView( - vViewPosition ); float pxS = dist * 0.0016;
      col = coralPatchLayer(col, pwc, 1.6, 0.75, 4.0, pxS);
      col = coralPatchLayer(col, pwc, 5.5, 0.60, 5.0, pxS); }
    col = mix(col, col * vec3(0.7, 0.75, 0.55), (1.0 - smoothstep(0.0, 0.25, info.x)) * 0.6);
    fH = -0.0022 * valley * aaB + 0.0018 * (fbm3(q * 22.0, 2) - 0.5) * lodA * (1.0 - smoothstep(0.10, 0.28, pxm * 22.0));
    fAO = 1.0 - 0.18 * valley;
    fRough = 0.72;  }
#endif

#if defined(K_4)
  if (kind >= 3.5 && kind < 4.5) {                                  // ---- rock / rubble / boulder
    float n1 = fbm3(q * 2.3, 4), n2 = fbm3(q * 9.0 + 3.0, 3);
    // pitting clusters in patches and comes in two sizes (a uniform field of dark dots reads as a dalmatian)
    float pitMask = smoothstep(0.35, 0.68, fbm3(q * 2.7 + 11.0, 3));
    vec4 w = worley3d(q * 16.0), w2p = worley3d(q * 6.5 + 5.0);
    float pit = max(smoothstep(0.30, 0.08, w.x), 0.8 * smoothstep(0.26, 0.06, w2p.x)) * pitMask * (1.0 - smoothstep(0.10, 0.28, pxm * 16.0));
    col *= 0.62 + 0.62 * n1;
    // encrusting community in WORLD units so boulders match the surrounding seabed
    {
      vec3 pw = uwWorldFromView( - vViewPosition );
      float dpt = max( uOptA.y - pw.y, 0.0 );
      vec3 mc; vec3 mg; float mao;
      float coverR = 0.92 * smoothstep( 90.0, 3.0, dpt );
      reefMosaic( pw * vec3( 1.0, 1.15, 1.0 ), col, dpt, coverR, dist, mc, mg, mao );
      col = mc; fAO *= mao;
    }
    // darker algal turf on the upper faces, pale sediment dusting
    col = mix(col, col * vec3(0.72, 0.78, 0.55), smoothstep(0.4, 0.9, n.y) * 0.35);
    col *= 1.0 - 0.26 * pit * lodA;
    fH = 0.012 * (n1 - 0.5) + 0.004 * (n2 - 0.5) - 0.0025 * pit * lodA;
    fAO = fAO * (0.75 + 0.25 * n1 - 0.25 * pit * lodA);
    fRough = 0.92;
  }
#endif

#if defined(K_5)
  if (kind >= 4.5 && kind < 5.5) {                                  // ---- sponge (tube / barrel / whip)
    // irregular, elongated pores + coarse longitudinal ribbing + fine roughness
    vec3 qs = vec3(q.x * 78.0, q.y * 26.0, q.z * 78.0) + 3.0 * vec3(vn3(q * 18.0), vn3(q * 18.0 + 7.0), vn3(q * 18.0 + 13.0));
    vec4 w = worley3d(qs);
    float pore = smoothstep(0.50, 0.14, w.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 78.0));
    float ribs = fbm3(vec3(q.x * 14.0, q.y * 3.0, q.z * 14.0), 3);
    float mott = fbm3(q * 3.0, 3), fine = fbm3(q * 60.0, 2);
    col *= 0.78 + 0.34 * mott;
    col *= 0.86 + 0.28 * ribs;
    col = mix(col, col * vec3(1.18, 1.12, 1.0), smoothstep(0.55, 0.9, info.x) * 0.5);          // paler rim
    col *= 1.0 - 0.14 * pore * lodA;
    float lump = fbm3(q * 9.0 + 5.0, 3);
    vec4 w3 = worley3d(q * 26.0 + 11.0);
    float wart = smoothstep(0.60, 0.12, w3.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 26.0));
    col = mix(col, col * vec3(1.22, 0.86, 0.92), smoothstep(0.50, 0.75, fbm3(q * 2.0 + 21.0, 3)) * 0.45);
    col *= 1.0 + 0.10 * wart;
    fH = -0.0030 * pore * lodA + 0.0040 * (ribs - 0.5) + 0.0011 * (fine - 0.5) * lodA + 0.014 * (lump - 0.5) + 0.0045 * wart;
    fAO = (1.0 - 0.16 * pore * lodA) * (0.80 + 0.35 * lump);
    fRough = 0.92; fTransl = 0.28;
  }
#endif

#if defined(K_6) || defined(K_7) || defined(K_8)
  if (kind >= 5.5 && kind < 8.5) {
                                  // ---- fan / anemone / algae
    float mott = fbm3(q * 6.0, 3);
    col *= 0.85 + 0.3 * mott;
    if (kind > 6.5 && kind < 7.5) {                          // anemone: tentacle tips glow
      col = mix(col, uTipCol, smoothstep(0.55, 1.0, info.x) * 0.8);
      col *= 0.8 + 0.4 * rnd;
      fTransl = 0.40;
    } else if (kind > 7.5) {                                 // algae blade: pale margins, translucent
      col = mix(col * vec3(1.05, 0.95, 0.6), col, smoothstep(0.0, 0.5, info.x));
      col *= 0.8 + 0.4 * rnd;
      fTransl = 0.5;
    }
    if (kind < 6.5) { fTransl = uTransl; col *= 0.9 + 0.3 * rnd; }
    fRough = 0.7;  }
#endif

#if defined(K_9)
  if (kind >= 8.5 && kind < 9.5) {
                                  // ---- seagrass blade (across = info.z, along = info.x)
    float along = info.x;
    float vein = abs(fract(vInfo.z * 6.0) - 0.5);
    col *= 0.85 + 0.3 * rnd;
    col = mix(col, col * vec3(1.15, 1.1, 0.55), smoothstep(0.7, 1.0, along) * 0.6);
    col = mix(col, vec3(0.35, 0.28, 0.14), smoothstep(0.86, 1.0, along + 0.3 * (rnd - 0.5)) * 0.7);
    col *= 1.0 - 0.18 * smoothstep(0.35, 0.5, vein);
    col = mix(col, vec3(0.5, 0.5, 0.42), (1.0 - smoothstep(0.0, 0.25, along)) * 0.35 * rnd);
    float ep = step(0.93, vn3(vec3(vInfo.z * 40.0, along * 60.0, rnd * 20.0)));
    col = mix(col, vec3(0.75, 0.72, 0.6), ep * 0.6);
    fRough = 0.55; fTransl = uTransl;  }
#endif

#if defined(K_10)
  if (kind >= 9.5 && kind < 10.5) {
                                 // ---- giant clam mantle: iridescent mosaic
    vec4 w = worley3d(q * 26.0);
    float m1 = fbm3(q * 8.0, 3), m2 = fbm3(q * 4.5 + 7.0, 3);
    vec3 blue = vec3(0.03, 0.22, 0.62), green = vec3(0.04, 0.50, 0.24), viol = vec3(0.34, 0.10, 0.55), teal = vec3(0.02, 0.45, 0.50);
    col = mix(mix(blue, teal, smoothstep(0.35, 0.65, m1)), mix(green, viol, smoothstep(0.4, 0.7, m2)), smoothstep(0.45, 0.6, m2));
    col *= 0.55 + 0.9 * smoothstep(0.05, 0.6, w.x);
    col += vec3(0.02, 0.05, 0.08) * (1.0 - smoothstep(0.0, 0.2, w.x));
    fH = 0.0025 * (1.0 - smoothstep(0.1, 0.6, w.x)) * lodA;
    fRough = 0.32; fTransl = 0.35;  }
#endif

#if defined(K_11)
  if (kind >= 10.5 && kind < 11.5) {
                                 // ---- starfish
    vec4 w = worley3d(q * 46.0);
    float m = fbm3(q * 5.0, 3);
    col *= 0.8 + 0.4 * m;
    col = mix(col, col * vec3(1.25, 0.9, 0.7), smoothstep(0.4, 0.8, fbm3(q * 11.0 + 2.0, 2)));
    float bump = smoothstep(0.45, 0.1, w.x);
    col *= 0.75 + 0.5 * bump;
    fH = 0.0025 * bump * lodA;
    fRough = 0.8;  }
#endif

#if defined(K_12)
  if (kind >= 11.5 && kind < 12.5) {
                                 // ---- urchin
    float m = fbm3(q * 9.0, 2);
    col *= 0.7 + 0.5 * m;
    col = mix(col, vec3(0.5, 0.5, 0.55), smoothstep(0.55, 0.9, info.x) * 0.25);
    fRough = 0.6;  }
#endif

#if defined(K_13)
  if (kind >= 12.5 && kind < 13.5) {
                                 // ---- sea cucumber
    float m = fbm3(q * 7.0, 3);
    vec4 w = worley3d(q * 70.0);
    col *= 0.78 + 0.44 * m;
    col = mix(col, col * 1.35 + 0.05, info.z * 0.8);        // papillae are paler
    col *= 1.0 - 0.18 * smoothstep(0.5, 0.15, w.x) * lodA;
    fH = -0.0012 * smoothstep(0.5, 0.15, w.x) * lodA;
    fRough = 0.42; fTransl = 0.25;  }
#endif

#if defined(K_14)
  if (kind >= 13.5 && kind < 14.5) {
                                 // ---- brittle star (banded arms)
    float band = 0.82 + 0.18 * sin(info.x * 90.0 + rnd * 20.0);
    col *= band * (0.85 + 0.3 * fbm3(q * 30.0, 2));
    col = mix(col, col * vec3(1.2, 1.1, 0.9), 0.3);
    fRough = 0.7;  }
#endif

#if defined(K_15)
  if (kind >= 14.5 && kind < 15.5) {
                                 // ---- sea pen
    col *= 0.85 + 0.3 * fbm3(q * 14.0, 2);
    fRough = 0.55; fTransl = 0.6;  }
#endif

#if defined(K_16)
  if (kind >= 15.5 && kind < 16.5) {
                                 // ---- glass sponge: pale lattice
    vec4 w = worley3d(vec3(q.x * 90.0, q.y * 36.0, q.z * 90.0));
    float lat = smoothstep(0.30, 0.60, w.x);
    col = mix(vec3(0.62, 0.66, 0.70), vec3(0.92, 0.94, 0.95), lat) * (0.85 + 0.3 * tint.g);
    fH = 0.0016 * lat * lodA;
    fAO = 1.0 - 0.3 * (1.0 - lat) * lodA;
    fRough = 0.45; fTransl = 0.75;  }
#endif

#if defined(K_17)
  if (kind >= 16.5 && kind < 17.5) {
                                 // ---- manganese nodule: botryoidal, dark, slightly glossy
    vec4 w = worley3d(q * 34.0);
    float dome = smoothstep(0.6, 0.05, w.x);
    col = tint * (0.55 + 0.7 * dome) * (0.8 + 0.4 * fbm3(q * 6.0, 2));
    // settled sediment dusts the upper faces (nodules are never pure black), ferromanganese crust stays on the flanks
    float dust = smoothstep(0.15, 0.85, n.y) * (0.45 + 0.55 * fbm3(q * 11.0 + 4.0, 2));
    col = mix(col, vec3(0.20, 0.175, 0.14) * (0.8 + 0.4 * fbm3(q * 25.0, 2)), dust * 0.8);
    fH = 0.0035 * dome * lodA;
    fRough = mix(0.34, 0.85, dust);  }
#endif

#if defined(K_18)
  if (kind >= 17.5 && kind < 18.5) {                                 // ---- hydrothermal chimney (black smoker)
    float n1 = fbm3(q * 1.3, 4), n2 = fbm3(q * 5.5 + 3.0, 3), n4 = fbm3(q * 22.0, 3);
    vec4 w = worley3d(q * 7.0);
    float h = clamp(p.y / 7.0, 0.0, 1.0);
    // charcoal sulfide with fine grain
    vec3 dark = vec3(0.105, 0.092, 0.082) * (0.65 + 0.7 * n2) * (0.75 + 0.5 * n4);
    col = dark;
    // rust / iron-oxide staining: dominant low down and on the flanks, patchy higher up
    float rust = smoothstep(0.40, 0.62, n1 + 0.10 * (1.0 - h)) * mix(0.95, 0.55, h);
    col = mix(col, vec3(0.40, 0.17, 0.065) * (0.7 + 0.6 * n2), rust * 0.85);
    // sparse sulfur / anhydrite crust in a few patches, mostly toward the top; flanges carry pale mineral deposits
    float crust = smoothstep(0.66, 0.78, fbm3(q * 2.2 + 41.0, 3)) * (0.35 + 0.65 * h);
    col = mix(col, vec3(0.62, 0.50, 0.14), crust * 0.50);
    float ledge = smoothstep(0.35, 0.8, n.y);
    col = mix(col, vec3(0.66, 0.64, 0.58) * (0.8 + 0.4 * n4), smoothstep(0.64, 0.78, fbm3(q * 1.9 + 20.0, 3)) * (0.30 + 0.70 * ledge) * 0.65);
    col *= 0.7 + 0.5 * smoothstep(0.05, 0.5, w.x);
    fH = 0.040 * (n1 - 0.5) + 0.016 * (n2 - 0.5) + 0.004 * (n4 - 0.5) * lodA - 0.012 * smoothstep(0.35, 0.05, w.x);
    fAO = 0.50 + 0.50 * smoothstep(0.1, 0.9, n1);
    fRough = 0.84;
  }
#endif

#if defined(K_20)
  if (kind >= 19.5 && kind < 20.5) {
                                 // ---- foliose (lettuce) coral: frilled plates, pale growing margin, polyp pits
    float rimv = info.x;
    vec4 w = worley3d(q * 95.0);
    float pit = smoothstep(0.50, 0.14, w.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 95.0));
    float mott = fbm3(q * 3.2, 3);
    float band = 0.5 + 0.5 * sin(rimv * 40.0 + mott * 6.0);
    col *= 0.80 + 0.40 * mott;
    col *= 0.90 + 0.14 * band;
    col = mix(col, mix(col, uTipCol, 0.8), smoothstep(0.78, 1.0, rimv) * 0.8);
    col *= 1.0 - 0.16 * pit * lodA;
    fH = -0.0010 * pit * lodA + 0.0015 * band;
    fAO = mix(0.55, 1.0, smoothstep(0.0, 0.5, rimv)) * (1.0 - 0.12 * pit * lodA);
    fRough = 0.8; fTransl = 0.22;  }
#endif

#if defined(K_21)
  if (kind >= 20.5 && kind < 21.5) {
                                 // ---- soft coral (leather / mushroom): lobed cap studded with polyps, translucent
    float rad = info.x, isCap = info.z;
    vec4 w = worley3d(q * 110.0);
    float poly = smoothstep(0.46, 0.10, w.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 110.0));
    vec4 w2 = worley3d(q * 34.0 + 7.0);
    float lobe = smoothstep(0.55, 0.05, w2.x) * (1.0 - smoothstep(0.10, 0.28, pxm * 34.0));
    float mott = fbm3(q * 4.0, 3);
    col *= 0.78 + 0.44 * mott;
    col *= mix(1.0, 0.72 + 0.40 * lobe, isCap);
    col = mix(col, col * vec3(0.55, 0.50, 0.42), poly * 0.55 * isCap);
    col = mix(col, col * 1.25 + 0.03, smoothstep(0.75, 1.0, rad) * isCap * 0.6);
    fH = (0.004 * lobe + 0.0022 * poly) * isCap;
    fAO = mix(1.0, 0.70 + 0.30 * lobe, isCap);
    fRough = 0.7; fTransl = 0.32;  }
#endif

#if defined(K_22)
  if (kind >= 21.5 && kind < 22.5) {
                                 // ---- feather star: banded arms, pale translucent pinnules
    float seg = 0.5 + 0.5 * sin(info.x * 70.0 + rnd * 12.0);
    col *= 0.80 + 0.30 * seg;
    col = mix(col, col * vec3(1.18, 1.12, 1.0) + 0.02, info.z * 0.8);
    fRough = 0.6; fTransl = 0.40;  }
#endif

#if defined(K_19)
  if (kind >= 18.5 && kind < 19.5) {
                                                  // ---- tube worm: pale tube, red plume
    float plume = info.x;
    col = mix(vec3(0.78, 0.74, 0.66), vec3(0.75, 0.025, 0.04), smoothstep(0.5, 1.0, plume));
    col *= 0.85 + 0.3 * fbm3(q * 20.0, 2);
    col = mix(col, col * vec3(1.0, 0.85, 0.7), (1.0 - plume) * smoothstep(0.0, 1.0, p.y) * 0.4);
    fRough = mix(0.5, 0.35, plume); fTransl = 0.5 * plume;
  }
#endif
  return col;
}
`;

export function floraMaterial({ key, roughness = 0.85, sway = 0, swayHeight = 0, swayMode = 0, side = THREE.FrontSide, transl = 0, bump = 1.0,
                                tipCol = [0.85, 0.75, 0.55], alphaTest = 0, map = null, castShadow = true, kinds = null } = {}) {
  const KS = kinds || Array.from({ length: 20 }, (_, i) => i);
  const kdefs = KS.map((k) => '#define K_' + k).join('\n') + '\n';
  // alpha-tested lattices (sea fans) are screen-door dithered: a hard test turns a sub-pixel lace into a solid slab at distance,
  // dithering keeps the coverage fraction right (and averages out in the accumulated stills)
  const dither = alphaTest > 0;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0.0, side, alphaTest: 0, map });
  const u = { uSwayAmt: { value: sway }, uSwayH: { value: swayHeight || 1 }, uBumpScale: { value: bump }, uTransl: { value: transl }, uTipCol: { value: new THREE.Vector3(...tipCol) } };
  uw(mat, 'flora_' + key + '_k' + KS.join('-') + (sway ? 's' : '') + (swayMode ? 'm' + swayMode : '') + (alphaTest ? 'a' : '') + (map ? 'M' : ''), (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vInfo = aInfo; vObjP = position; vObjN = normal;
        #ifdef USE_INSTANCING
          vInst = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        #else
          vInst = 0.0;
        #endif`)
      .replace('#include <project_vertex>', `
        vec4 uwPos = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          uwPos = instanceMatrix * uwPos;
        #endif
        uwPos = modelMatrix * uwPos;
        ${swayMode === 1 ? 'float swW = aInfo.x * aInfo.x;' : swayMode === 2 ? 'float swW = clamp(position.y / uSwayH, 0.0, 1.0); swW *= swW;' : 'float swW = 0.0;'}
        uwPos.xyz += uwSway( uwPos.xyz, uSwayAmt ) * swW;
        vec4 mvPosition = viewMatrix * uwPos;
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_pars_begin>', kdefs + FRAG_DECL + '\n#include <lights_pars_begin>')
      .replace('#include <alphatest_fragment>', `{ float nd = length( vViewPosition );                    // camera-proximity dissolve: a blade or a branch never fills the lens
          if ( nd < uNearFade.y ) { float aj2 = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(uFrameJ * 5.588238, uFrameJ * 3.117), vec2(0.06711056, 0.00583715))));
            if ( smoothstep( uNearFade.x, uNearFade.y, nd ) < aj2 * 0.96 + 0.02 ) discard; } }
        { float kd = vInfo.w;                                                                    // thin foliage between the lens and the player's fish dissolves in a soft hole around the fish
          if ( uOccl.z > 0.0 && vViewPosition.z < uOccl.w - 0.05 && ( kd < 0.5 || ( kd > 5.5 && kd < 9.5 ) || kd > 19.5 ) ) {
            vec2 ndc = vec2( - vViewPosition.x * uOcclP.x, - vViewPosition.y * uOcclP.y ) / max( vViewPosition.z, 1e-4 );
            float dd = length( ( ndc - uOccl.xy ) * vec2( uOcclP.y / uOcclP.x, 1.0 ) );
            float kk = smoothstep( uOccl.z * 0.55, uOccl.z, dd );
            float aj3 = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(uFrameJ * 3.7, uFrameJ * 5.1), vec2(0.06711056, 0.00583715))));
            if ( kk < aj3 * 0.96 + 0.02 ) discard; } }
` + (dither ? `{ float aj = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(uFrameJ * 5.588238, uFrameJ * 3.117), vec2(0.06711056, 0.00583715))));
          if ( diffuseColor.a < aj * 0.96 + 0.02 ) discard; }` : '#include <alphatest_fragment>'))
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = floraSurface( diffuseColor.rgb, vObjP, normalize( vObjN ), vInfo, vInst, length( vViewPosition ) );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = fRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = uwBumpNormal( - vViewPosition, normal, fH * uBumpScale, faceDirection );`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= fAO;
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uwAmbAt( uwWP ) * uAmbCol * fTransl * ( 0.9 + 1.5 * step( 8.5, vInfo.w ) * step( vInfo.w, 9.5 ) ) * RECIPROCAL_PI;
        #if NUM_DIR_LIGHTS > 0
        if ( fTransl > 0.0 ) {
          vec3 Lt = directionalLights[ 0 ].direction;
          float back = saturate( dot( - normal, Lt ) );
          float thru = pow( saturate( dot( normalize( vViewPosition ), - Lt ) ), 3.0 );
          vec3 tcol = diffuseColor.rgb * directionalLights[ 0 ].color * uwSunAt( uwWP ) * ( 0.55 * back + 0.9 * thru ) * fTransl * RECIPROCAL_PI;
          reflectedLight.directDiffuse += tcol;
        }
        #endif`);
  });
  return mat;
}
