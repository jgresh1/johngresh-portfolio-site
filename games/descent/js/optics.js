// Underwater optics: shared uniforms + global patches of three's shader chunks so
// every lit material gets depth-dependent sun/ambient light, caustics, per-channel
// absorption and analytic in-scattering ("veil light") with no per-material work.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared uniform objects (same object instances go into every material).
// ---------------------------------------------------------------------------
export const U = {
  uSunDirA: { value: new THREE.Vector3(0.3, 0.9, 0.2).normalize() },   // toward sun (air)
  uSunDirW: { value: new THREE.Vector3(0.2, 0.95, 0.1).normalize() },  // toward sun (refracted, underwater)
  uSunCol:  { value: new THREE.Vector3(1, 1, 1) },
  uAmbCol:  { value: new THREE.Vector3(1, 1, 1) },
  uKd:      { value: new THREE.Vector3(0.235, 0.052, 0.030) },
  uKb:      { value: new THREE.Vector3(0.255, 0.056, 0.036) },
  uExt:     { value: new THREE.Vector3(0.27, 0.070, 0.045) },
  uVeil0:   { value: new THREE.Vector3(0.009, 0.056, 0.135) },
  uOptA:    { value: new THREE.Vector4(0, 0, 1, 1) },   // time, waterLevel, ambient gain, veil gain
  uWB:      { value: new THREE.Vector2(0.55, 0) },   // colour restoration strength: x daylight (sun + view path), y artificial light (out + back)
  uCurrent: { value: new THREE.Vector3(0.82, 0.57, 1.0) },   // sway direction (x,z) and strength
  uCausMap0: { value: null },
  uCausMap1: { value: null },
  uCausMap2: { value: null },
  uCausD:   { value: new THREE.Vector3(2.0, 7.0, 22.0) },
  uCausP:   { value: new THREE.Vector4(24, 1.0, 30.0, 0) },  // tile size, gain, fade length
  uOccl:    { value: new THREE.Vector4(0, 0, 0, 0) },        // game: player's fish on screen (ndc x, ndc y, hole radius in ndc-y units, view depth): thin flora in front of it dissolves around it
  uOcclP:   { value: new THREE.Vector2(1, 1) },              // projection matrix [0][0], [1][1] (fragment shaders have no projectionMatrix)
  uNearFade: { value: new THREE.Vector2(0, 0) },             // flora within y metres of the camera dissolves (screen-door), fully gone inside x: the game keeps the lens clear of blades and branches
  uFrameJ:  { value: 0 },                                    // per-render counter: decorrelates screen-door dithering between accumulated sub-frames
};

export const WATER_PRESETS = {
  // extinction c, diffuse Kd, beam Kb, veil radiance at the surface
  tropical: { ext: [0.27, 0.070, 0.045], kd: [0.235, 0.052, 0.030], kb: [0.255, 0.056, 0.036], veil: [0.009, 0.056, 0.135] },
  lagoon:   { ext: [0.42, 0.110, 0.085], kd: [0.38, 0.090, 0.060], kb: [0.40, 0.100, 0.070], veil: [0.012, 0.100, 0.140] },
  oceanic:  { ext: [0.34, 0.062, 0.036], kd: [0.30, 0.048, 0.022], kb: [0.32, 0.052, 0.028], veil: [0.008, 0.055, 0.150] },
};

export function setWater(name) {
  const p = typeof name === 'string' ? WATER_PRESETS[name] : name;
  U.uExt.value.set(...p.ext); U.uKd.value.set(...p.kd); U.uKb.value.set(...p.kb); U.uVeil0.value.set(...p.veil);
}

// elevation/azimuth in degrees. Also computes the refracted (underwater) direction.
export function setSun(elevDeg, azimDeg = 40, sunIrr = [1.0, 0.955, 0.88], skyIrr = [0.42, 0.58, 0.92]) {
  const el = THREE.MathUtils.degToRad(elevDeg), az = THREE.MathUtils.degToRad(azimDeg);
  const za = Math.PI / 2 - el;
  U.uSunDirA.value.set(Math.sin(za) * Math.cos(az), Math.cos(za), Math.sin(za) * Math.sin(az)).normalize();
  const zw = Math.asin(Math.sin(za) / 1.333);
  U.uSunDirW.value.set(Math.sin(zw) * Math.cos(az), Math.cos(zw), Math.sin(zw) * Math.sin(az)).normalize();
  U.uSunCol.value.set(...sunIrr);
  U.uAmbCol.value.set(...skyIrr);
}

// ---------------------------------------------------------------------------
// GLSL: declarations + helper functions (replaces fog_pars_fragment)
// ---------------------------------------------------------------------------
export const OPTICS_PARS = /* glsl */`
uniform vec3 uSunDirA;
uniform vec3 uSunDirW;
uniform vec3 uSunCol;
uniform vec3 uAmbCol;
uniform vec3 uKd;
uniform vec3 uKb;
uniform vec3 uExt;
uniform vec3 uVeil0;
uniform vec2 uWB;         // colour restoration strengths (daylight, artificial light)
uniform vec3 uCurrent;
uniform vec4 uOptA;       // x time, y water level, z ambient gain, w veil gain
uniform sampler2D uCausMap0;
uniform sampler2D uCausMap1;
uniform sampler2D uCausMap2;
uniform vec3 uCausD;
uniform vec4 uCausP;      // x tile size, y gain, z fade length
varying vec3 vUwView;

vec3 uwWorldFromView(vec3 vp) { return ( ( vec4( vp, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz; }

// Caustic irradiance factor (mean ~1) of the sunlight at world point P.
float uwCaustic(vec3 P) {
  float d = max(uOptA.y - P.y, 0.0);
  if (d < 0.02 || uCausP.y <= 0.0) return 1.0;
  vec2 uv = P.xz / uCausP.x;
  // deeper caustics are softer: widen the filter footprint with depth
  float blur = 1.0 + max(d - 1.5, 0.0) * 0.28;
  vec2 gx = dFdx(uv) * blur, gy = dFdy(uv) * blur;
  vec3 D = uCausD;
  float c;
  if (d <= D.x) {
    c = mix(1.0, textureGrad(uCausMap0, uv, gx, gy).r, smoothstep(0.0, D.x * 0.8, d));
  } else if (d <= D.y) {
    c = mix(textureGrad(uCausMap0, uv, gx, gy).r, textureGrad(uCausMap1, uv, gx, gy).r, (d - D.x) / (D.y - D.x));
  } else if (d <= D.z) {
    c = mix(textureGrad(uCausMap1, uv, gx, gy).r, textureGrad(uCausMap2, uv, gx, gy).r, (d - D.y) / (D.z - D.y));
  } else {
    c = mix(textureGrad(uCausMap2, uv, gx, gy).r, 1.0, 1.0 - exp(-(d - D.z) / uCausP.z));
  }
  return mix(1.0, c, uCausP.y);
}

// direct sunlight reaching P (relative to surface irradiance): beam absorption * caustics
vec3 uwSunAt(vec3 P) {
  float d = max(uOptA.y - P.y, 0.0);
  vec3 att = exp(-uKb * d / max(uSunDirW.y, 0.25));
  return att * uwCaustic(P);
}
// diffuse skylight at P
vec3 uwAmbAt(vec3 P) {
  return exp(-uKd * max(uOptA.y - P.y, 0.0)) * uOptA.z;
}

// Transmittance T and in-scattered veil radiance L along the segment C->P (world space).
void uwPath(vec3 C, vec3 P, out vec3 T, out vec3 L) {
  float wl = uOptA.y;
  vec3 d = P - C; float dist = length(d);
  vec3 dir = d / max(dist, 1e-4);
  float cy = C.y - wl, py = P.y - wl;
  if (cy > 0.0 && py > 0.0) { T = vec3(1.0); L = vec3(0.0); return; }
  float t0 = 0.0, t1 = dist;
  if (cy > 0.0)      t0 = cy / (cy - py) * dist;
  else if (py > 0.0) t1 = cy / (cy - py) * dist;
  float len = max(t1 - t0, 0.0);
  float z0 = max(wl - (C.y + dir.y * t0), 0.0);
  vec3 a = max(uExt - uKd * dir.y, vec3(1e-4));
  T = exp(-uExt * len);
  L = uVeil0 * uOptA.w * uExt * exp(-uKd * z0) * (1.0 - exp(-a * len)) / a;
}

// apply water extinction + veil to a colour seen at world position Pw from the camera, plus per-fragment
// colour restoration (like an underwater white balance): the water's colour cast is undone in proportion to this
// fragment's OWN light path, so near subjects stay natural and far ones are only partly restored.
vec3 uwFog(vec3 col, vec3 Pw) {
  vec3 T, L;
  uwPath(cameraPosition, Pw, T, L);
  vec3 tint = vec3(1.0);
  if ((uWB.x > 0.0 || uWB.y > 0.0) && !(cameraPosition.y > uOptA.y && Pw.y > uOptA.y)) {
    float dist = distance(cameraPosition, Pw);
    // the wet part of the path only
    float cy = cameraPosition.y - uOptA.y, py = Pw.y - uOptA.y;
    float wetFrac = (cy > 0.0) ? clamp(-py / max(cy - py, 1e-4), 0.0, 1.0) : ((py > 0.0) ? clamp(cy / min(cy - py, -1e-4), 0.0, 1.0) : 1.0);
    float wdist = dist * wetFrac;
    float depthP = max(uOptA.y - Pw.y, 0.0);
    vec3 dw = (uKd - vec3(uKd.z)) * depthP + (uExt - vec3(uExt.z)) * wdist;
    vec3 lw = (uExt - vec3(uExt.z)) * (2.0 * wdist);
    tint = exp(min(uWB.x * dw + uWB.y * lw, vec3(2.2)));
  }
  return col * T * tint + L;
}
`;

// vertex-side water motion (needs uOptA + uCurrent declared)
export const SWAY_GLSL = /* glsl */`
uniform vec4 uOptA;
uniform vec3 uCurrent;
// water motion: surge (orbital, strong in the shallows) + slow current gusts. returns a world-space offset.
vec3 uwSway(vec3 wp, float amount) {
  float t = uOptA.x;
  float depth = max(uOptA.y - wp.y, 0.0);
  float surge = 0.25 + 1.6 * exp(-depth / 7.0);
  float ph = dot(wp.xz, vec2(0.61, 0.79)) * 0.42;
  float s = sin(t * 0.95 + ph) + 0.45 * sin(t * 2.3 + ph * 2.1 + 1.3) + 0.25 * sin(t * 4.1 + wp.x * 1.7 + wp.z * 1.3);
  float gust = 0.6 + 0.4 * sin(t * 0.21 + wp.x * 0.05);
  vec2 dir = uCurrent.xy;
  return vec3(dir.x, 0.0, dir.y) * s * amount * surge * gust * uCurrent.z;
}

`;

// vertex-stage version (no derivatives): use in vertex shaders of custom materials (particles, etc.)
export const OPTICS_VERT = /* glsl */`
uniform vec3 uSunDirA; uniform vec3 uSunDirW; uniform vec3 uSunCol; uniform vec3 uAmbCol;
uniform vec3 uKd; uniform vec3 uKb; uniform vec3 uExt; uniform vec3 uVeil0; uniform vec3 uCurrent;
uniform vec4 uOptA;
uniform sampler2D uCausMap0; uniform sampler2D uCausMap1; uniform sampler2D uCausMap2;
uniform vec3 uCausD; uniform vec4 uCausP;
float uwCausticV(vec3 P, float lod) {
  float d = max(uOptA.y - P.y, 0.0);
  if (d < 0.02 || uCausP.y <= 0.0) return 1.0;
  vec2 uv = P.xz / uCausP.x; vec3 D = uCausD; float c;
  if (d <= D.x) c = mix(1.0, textureLod(uCausMap0, uv, lod).r, smoothstep(0.0, D.x * 0.8, d));
  else if (d <= D.y) c = mix(textureLod(uCausMap0, uv, lod).r, textureLod(uCausMap1, uv, lod).r, (d - D.x) / (D.y - D.x));
  else if (d <= D.z) c = mix(textureLod(uCausMap1, uv, lod).r, textureLod(uCausMap2, uv, lod).r, (d - D.y) / (D.z - D.y));
  else c = mix(textureLod(uCausMap2, uv, lod).r, 1.0, 1.0 - exp(-(d - D.z) / uCausP.z));
  return mix(1.0, c, uCausP.y);
}
vec3 uwSunAtV(vec3 P, float lod) {
  float d = max(uOptA.y - P.y, 0.0);
  return exp(-uKb * d / max(uSunDirW.y, 0.25)) * uwCausticV(P, lod);
}
vec3 uwAmbAtV(vec3 P) { return exp(-uKd * max(uOptA.y - P.y, 0.0)) * uOptA.z; }
void uwPathV(vec3 C, vec3 P, out vec3 T, out vec3 L) {
  float wl = uOptA.y; vec3 d = P - C; float dist = length(d); vec3 dir = d / max(dist, 1e-4);
  float cy = C.y - wl, py = P.y - wl;
  if (cy > 0.0 && py > 0.0) { T = vec3(1.0); L = vec3(0.0); return; }
  float t0 = 0.0, t1 = dist;
  if (cy > 0.0) t0 = cy / (cy - py) * dist; else if (py > 0.0) t1 = cy / (cy - py) * dist;
  float len = max(t1 - t0, 0.0);
  float z0 = max(wl - (C.y + dir.y * t0), 0.0);
  vec3 a = max(uExt - uKd * dir.y, vec3(1e-4));
  T = exp(-uExt * len);
  L = uVeil0 * uOptA.w * uExt * exp(-uKd * z0) * (1.0 - exp(-a * len)) / a;
}
`;

const FOG_PARS_VERTEX = /* glsl */`varying vec3 vUwView;`;
const FOG_VERTEX = /* glsl */`vUwView = mvPosition.xyz;`;
const FOG_FRAGMENT = /* glsl */`
#ifdef USE_FOG
  gl_FragColor.rgb = uwFog( gl_FragColor.rgb, uwWorldFromView( vUwView ) );
#endif
`;

let installed = false;
export function installOpticsChunks() {
  if (installed) return; installed = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = FOG_PARS_VERTEX;
  C.fog_vertex = FOG_VERTEX;
  C.fog_pars_fragment = OPTICS_PARS;
  C.fog_fragment = FOG_FRAGMENT;

  // world position of the shaded point + underwater attenuation of the sun and ambient light
  const need = (s, sub) => { if (!s.includes(sub)) throw new Error('optics patch anchor missing: ' + sub); };
  let lfb = C.lights_fragment_begin;
  need(lfb, 'vec3 geometryPosition = - vViewPosition;');
  lfb = lfb.replace('vec3 geometryPosition = - vViewPosition;',
    'vec3 geometryPosition = - vViewPosition;\nvec3 uwWP = uwWorldFromView( geometryPosition );');
  need(lfb, 'getDirectionalLightInfo( directionalLight, directLight );');
  lfb = lfb.replace('getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= uwSunAt( uwWP );');
  C.lights_fragment_begin = lfb;

  let lfe = C.lights_fragment_end;
  need(lfe, 'RE_IndirectDiffuse( irradiance,');
  lfe = lfe.replace('#if defined( RE_IndirectDiffuse )', '#if defined( RE_IndirectDiffuse )\n\tirradiance *= uwAmbAt( uwWP );');
  C.lights_fragment_end = lfe;

  // lamps (point / spot) lose light to the water as well as to distance
  let lpb = C.lights_pars_begin;
  const pa = 'light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );';
  const sa = 'light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );';
  need(lpb, pa); need(lpb, sa);
  lpb = lpb.replace(pa, pa + '\n\t\tlight.color *= exp( - uExt * lightDistance );');
  lpb = lpb.replace(sa, sa + '\n\t\t\tlight.color *= exp( - uExt * lightDistance );');
  C.lights_pars_begin = lpb;
}

// ---------------------------------------------------------------------------
// Material helper. Registers the shared uniforms on a built-in material (by
// reference, so per-frame updates reach every material) and lets the caller
// patch the shader. `key` MUST differ between different patch variants.
// ---------------------------------------------------------------------------
export function uw(material, key = 'uw', patch = null) {
  material.fog = true;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, U);
    if (patch) patch(shader, renderer);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

// For fully custom ShaderMaterials: uniforms to merge and GLSL to include.
export function uwUniforms(extra = {}) { return Object.assign({}, U, extra); }
