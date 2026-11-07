// Small bottom-dwellers (shrimp, crabs, hermit crab, urchin, feather worm, nudibranch) and the moon jelly, as instanced game creatures.
// Geometry is built from tubes / lathes (flora/geom.js Builder). aInfo = (along 0..1, part, aux, model). part: 0 body, 1 legs, 2 antennae,
// 3 eyes, 4 tail fan, 5 claws / spines, 6 radioles / gills, 7 shell, 8 soft foot.
import * as THREE from 'three';
import { uw } from '../optics.js';
import { GLSL_NOISE } from '../glsl.js';
import { Builder, mulberry32 } from '../flora/geom.js';
import { jellyGeometry, JELLY_FRAG } from '../fauna/jelly.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const icoG = (detail = 2) => { const g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv'); const o = new THREE.BufferGeometry(); o.setAttribute('position', g.attributes.position); o.setAttribute('normal', g.attributes.normal); o.setIndex(g.index); return o; };
const ICO = icoG(2), ICO1 = icoG(1);
const M4 = (p, s, r = null) => new THREE.Matrix4().compose(p, r || new THREE.Quaternion(), s);

export const MODEL_ID = { shrimp: 0, crab: 1, hermit: 2, urchin: 3, worm: 4, nudi: 5 };

// legs: 2-3 segment tubes
function leg(b, root, dir, len, segs, part, model, r0 = 0.012, wob = 0.0) {
  const pts = [root.clone()];
  let p = root.clone(), d = dir.clone().normalize();
  for (let i = 0; i < segs; i++) {
    p = p.clone().addScaledVector(d, len / segs);
    if (i === 0) d.y -= 0.9; else d.y -= 0.5;
    d.normalize();
    pts.push(p.clone());
  }
  b.tube(pts, (t) => r0 * (1 - 0.7 * t) + 0.002, 5, [0, part, wob, model, 1], true);
}

export function crawlGeometry(model, seed = 7) {
  const b = new Builder(), rnd = mulberry32(seed + 31 * (MODEL_ID[model] || 0)), id = MODEL_ID[model] || 0;
  if (model === 'shrimp') {
    const N = 22, pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = 0.5 - t;
      let y = 0.03 * Math.sin(t * 3.2);
      if (t > 0.36) { const u = (t - 0.36) / 0.64; y = 0.03 - 0.20 * u * u + 0.035 * Math.sin(u * 3.14); }
      pts.push(V(x, y, 0));
    }
    const R = (t) => { let r = t < 0.07 ? 0.012 + (t / 0.07) * 0.04 : (t < 0.36 ? 0.052 + 0.024 * Math.sin((t - 0.07) / 0.29 * 2.4) : 0.068 - 0.036 * ((t - 0.36) / 0.54)); if (t > 0.36 && t < 0.92) r *= 1 + 0.08 * Math.sin(t * 95); return Math.max(r, 0.01) * (t > 0.9 ? 1 - (t - 0.9) * 8 : 1); };
    b.tube(pts, R, 10, [0, 0, 0, id, 1], true);
    for (let k = 0; k < 5; k++) { const t = 0.12 + k * 0.05, p = pts[Math.round(t * N)]; for (const s of [-1, 1]) leg(b, V(p.x, p.y - 0.04, s * 0.03), V(-0.15, -0.2, s * 0.9), 0.17, 2, 1, id, 0.009, k); }
    for (const s of [-1, 1]) {                                            // long antennae + short antennules
      const a = [V(0.5, 0.045, s * 0.012), V(0.7, 0.07, s * 0.07), V(0.95, 0.04, s * 0.17), V(1.3, -0.02, s * 0.22)];
      b.tube(a, (t) => 0.005 * (1 - 0.7 * t) + 0.0015, 4, [0, 2, 0, id, 1], false);
      const c = [V(0.5, 0.04, s * 0.008), V(0.62, 0.075, s * 0.03), V(0.78, 0.07, s * 0.06)];
      b.tube(c, (t) => 0.0035 * (1 - 0.6 * t) + 0.001, 4, [0, 2, 0, id, 1], false);
      b.addGeometry(ICO1, M4(V(0.45, 0.06, s * 0.04), V(0.018, 0.018, 0.018)), [0, 3, 0, id]);
    }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {                // tail fan
      const a = s * (0.25 + 0.5 * k / 2) * 0.5, base = pts[N - 1];
      b.grid(4, 4, (u, v) => V(base.x - 0.02 - u * 0.12, base.y - 0.01 - u * 0.04, s * (0.015 + u * Math.sin(a) * 0.2 + (v - 0.5) * 0.035)), [0, 4, 0, id], false);
    }
  } else if (model === 'crab') {
    const body = M4(V(0, 0.05, 0), V(0.34, 0.14, 0.46));
    b.addGeometry(ICO, body, [0, 0, 0, id]);
    b.addGeometry(ICO1, M4(V(0.03, 0.0, 0), V(0.34, 0.10, 0.40)), [0.5, 0, 0.5, id]);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) { const x = 0.16 - k * 0.11; leg(b, V(x, 0.04, s * 0.30), V(-0.1 + k * 0.05, 0.4, s * 1.0), 0.5, 3, 1, id, 0.018, k + (s > 0 ? 0.5 : 0)); }
      // claws: arm + two pincers
      const arm = [V(0.30, 0.06, s * 0.25), V(0.52, 0.10, s * 0.32), V(0.66, 0.06, s * 0.28)];
      b.tube(arm, (t) => 0.034 * (1 - 0.3 * t) + 0.01, 6, [0, 5, 0, id, 1], false);
      b.tube([V(0.64, 0.07, s * 0.26), V(0.80, 0.07, s * 0.20), V(0.90, 0.06, s * 0.14)], (t) => 0.05 * (1 - 0.88 * t) + 0.005, 6, [0, 5, 0, id, 1], true);
      b.tube([V(0.64, 0.045, s * 0.30), V(0.80, 0.03, s * 0.28), V(0.88, 0.04, s * 0.22)], (t) => 0.042 * (1 - 0.88 * t) + 0.004, 6, [0, 5, 0, id, 1], true);
      b.tube([V(0.28, 0.16, s * 0.07), V(0.30, 0.22, s * 0.075)], (t) => 0.008, 4, [0, 2, 0, id, 1], false);
      b.addGeometry(ICO1, M4(V(0.30, 0.235, s * 0.075), V(0.022, 0.022, 0.022)), [0, 3, 0, id]);
    }
  } else if (model === 'hermit') {
    // turbinate shell tilted backwards, with the animal's claws, legs and eyes out of the opening
    const prof = []; for (let i = 0; i <= 26; i++) { const t = i / 26; prof.push([0.30 * Math.pow(Math.sin(Math.min(t * 1.05, 1) * Math.PI * 0.62), 1.1) * (1 + 0.1 * Math.sin(t * 40)) + 0.004, 0.62 - 0.6 * t]); }
    const st = b.count;
    b.lathe(prof, 22, [0, 7, 0, id], V(0, 0, 0), V(1, 1, 1));
    const m = new THREE.Matrix4().compose(V(-0.12, 0.1, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.95), V(1, 1, 1));
    for (let i = st; i < b.count; i++) { const p = V(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]).applyMatrix4(m), n = V(b.nor[i * 3], b.nor[i * 3 + 1], b.nor[i * 3 + 2]).transformDirection(m); b.pos[i * 3] = p.x; b.pos[i * 3 + 1] = p.y; b.pos[i * 3 + 2] = p.z; b.nor[i * 3] = n.x; b.nor[i * 3 + 1] = n.y; b.nor[i * 3 + 2] = n.z; }
    for (const s of [-1, 1]) {
      leg(b, V(0.18, 0.06, s * 0.08), V(0.9, 0.2, s * 0.5), 0.34, 3, 1, id, 0.022, s);
      leg(b, V(0.12, 0.05, s * 0.09), V(0.5, 0.2, s * 0.9), 0.30, 3, 1, id, 0.02, s + 1);
      b.tube([V(0.22, 0.10, s * 0.08), V(0.42, 0.12, s * 0.16), V(0.55, 0.08, s * 0.14)], (t) => 0.04 * (1 - 0.5 * t) + 0.01, 6, [0, 5, 0, id, 1], true);
      b.tube([V(0.26, 0.15, s * 0.04), V(0.30, 0.24, s * 0.05)], () => 0.008, 4, [0, 2, 0, id, 1], false);
      b.addGeometry(ICO1, M4(V(0.30, 0.255, s * 0.05), V(0.024, 0.024, 0.024)), [0, 3, 0, id]);
    }
  } else if (model === 'urchin') {
    b.addGeometry(ICO, M4(V(0, 0.2, 0), V(0.20, 0.17, 0.20)), [0, 0, 0, id]);
    for (let i = 0; i < 110; i++) {
      const a = rnd() * TAU, c = Math.acos(Math.min(1, rnd() * 1.7 - 0.55)), d = V(Math.sin(c) * Math.cos(a), Math.cos(c), Math.sin(c) * Math.sin(a)), L = 0.38 + 0.4 * rnd() * (i % 9 === 0 ? 1.5 : 1);
      const base = V(0, 0.2, 0).addScaledVector(d, 0.19);
      b.tube([base, base.clone().addScaledVector(d, L * 0.5), base.clone().addScaledVector(d, L)], (t) => 0.014 * (1 - 0.92 * t) + 0.0012, 4, [0, 5, rnd(), id, 1], false);
    }
  } else if (model === 'worm') {
    const stalk = []; for (let i = 0; i <= 6; i++) stalk.push(V(0.02 * Math.sin(i), i / 6 * 0.26, 0.02 * Math.cos(i * 1.3)));
    b.tube(stalk, (t) => 0.05 * (1 - 0.15 * t), 8, [0, 0, 0, id, 1], true);
    for (let crown = 0; crown < 2; crown++) for (let k = 0; k < 20; k++) {
      const a = k * 2.399 + crown * 3.1, y = 0.24 + (k / 20) * 0.34 + crown * 0.02, r0 = 0.045 - 0.02 * (k / 20), d = V(Math.cos(a), 0, Math.sin(a)), L = 0.16 - 0.08 * (k / 20);
      const base = V(0, y, 0).addScaledVector(d, r0);
      b.tube([base, base.clone().addScaledVector(d, L * 0.5).add(V(0, 0.07, 0)), base.clone().addScaledVector(d, L * 0.8).add(V(0, 0.15 + 0.05 * (k / 20), 0))], (t) => 0.014 * (1 - 0.8 * t) + 0.002, 4, [crown, 6, k / 20, id, 1], true);
    }
  } else if (model === 'nudi') {
    b.addGeometry(ICO, M4(V(0, 0.07, 0), V(0.5, 0.10, 0.17)), [0, 0, 0, id]);
    b.grid(24, 4, (u, v) => { const a = u * TAU, r = 1 + 0.12 * Math.sin(a * 12) * v; return V(0.5 * Math.cos(a) * r, 0.02 + 0.01 * v, 0.2 * Math.sin(a) * r); }, [0, 8, 0, id], false);
    for (const s of [-1, 1]) {
      b.tube([V(0.38, 0.14, s * 0.05), V(0.45, 0.24, s * 0.07), V(0.47, 0.32, s * 0.08)], (t) => 0.014 + 0.014 * t * t, 6, [0, 6, 1, id, 1], true);
    }
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, p = V(-0.12 + 0.07 * Math.cos(a), 0.15, 0.07 * Math.sin(a)); b.tube([p, p.clone().add(V(0.02 * Math.cos(a), 0.12, 0.02 * Math.sin(a))), p.clone().add(V(0.05 * Math.cos(a), 0.22, 0.05 * Math.sin(a)))], (t) => 0.02 * (1 - 0.7 * t) + 0.003, 5, [0, 6, 0, id, 1], true); }
    for (let k = 0; k < 16; k++) { const u = (k + 0.5) / 16, a = (u < 0.5 ? 1 : -1) * 0.5 * Math.PI * (0.2 + 0.8 * Math.abs(Math.sin(u * 6))), x = -0.4 + 0.8 * ((k % 8) / 7), z = (k < 8 ? 1 : -1) * 0.12; b.tube([V(x, 0.08, z), V(x, 0.14, z * 1.3), V(x - 0.02, 0.2, z * 1.4)], (t) => 0.014 * (1 - 0.8 * t) + 0.002, 4, [0, 6, 0, id, 1], true); }
  }
  return b.toGeometry();
}

// ---------------------------------------------------------------------------------------------------------------------------------
// crawler material
// ---------------------------------------------------------------------------------------------------------------------------------
const CRAWL_DECL = /* glsl */`
attribute vec4 aInfo; attribute vec4 aAnim; attribute vec4 aHint;
varying vec4 vInfo; varying vec3 vObjP; varying vec3 vObjN; varying vec4 vHint; varying float vFlash;
uniform float uModel;
`;
const CRAWL_BEGIN = /* glsl */`
vInfo = aInfo; vObjP = position; vObjN = normal; vHint = aHint; vFlash = aAnim.w;
vec3 transformed = position;
float cph = aAnim.x;
if (aInfo.y > 0.5 && aInfo.y < 1.5) {                                   // walking legs
  float side = sign(position.z + 1e-4);
  transformed.x += 0.045 * sin(cph * 3.0 + aInfo.z * 1.7 + (side > 0.0 ? 0.0 : 3.1416)) * aInfo.x;
  transformed.y += 0.035 * max(0.0, sin(cph * 3.0 + aInfo.z * 1.7 + (side > 0.0 ? 0.0 : 3.1416))) * aInfo.x;
}
if (aInfo.y > 1.5 && aInfo.y < 2.5) { transformed.z += 0.05 * sin(cph * 0.8 + position.x * 4.0) * aInfo.x; transformed.y += 0.02 * sin(cph * 0.6 + position.x * 5.0) * aInfo.x; }
if (uModel > 2.5 && uModel < 3.5 && aInfo.y > 4.5 && aInfo.y < 5.5) { vec3 d = normalize(position - vec3(0.0, 0.2, 0.0)); transformed += d * 0.012 * sin(cph * 0.7 + aInfo.z * 40.0) * aInfo.x * 2.0; }
if (uModel > 3.5 && uModel < 4.5 && aInfo.y > 5.5 && aInfo.y < 6.5) {      // feather worm: radioles sway, and the whole crown pulls into the tube when startled (aAnim.y = 1 out .. 0 in)
  float out_ = clamp(aAnim.y, 0.0, 1.0);
  transformed.x += 0.012 * sin(cph * 0.9 + aInfo.z * 9.0) * aInfo.x; transformed.z += 0.012 * cos(cph * 0.7 + aInfo.z * 7.0) * aInfo.x;
  transformed.y = 0.2 + (transformed.y - 0.2) * mix(0.12, 1.0, out_); transformed.xz *= mix(0.15, 1.0, out_);
}
if (uModel > 4.5 && aInfo.y > 5.5 && aInfo.y < 6.5) { transformed.x += 0.015 * sin(cph * 0.8 + position.x * 12.0) * aInfo.x; transformed.z += 0.012 * cos(cph * 0.9 + position.x * 9.0) * aInfo.x; }
`;
const CRAWL_FRAG = /* glsl */`
${GLSL_NOISE}
varying vec4 vInfo; varying vec3 vObjP; varying vec3 vObjN;
uniform vec3 uColA, uColB, uColC; uniform float uModel;
float cRough; vec3 cEm; float cAlpha;
vec3 crawlSurface(vec4 info, vec3 op, vec3 on, float dist) {
  float part = info.y; cRough = 0.55; cEm = vec3(0.0); cAlpha = 1.0;
  float n1 = fbm3(op * 14.0, 3), n2 = vn3(op * 60.0);
  vec3 col = uColA;
  if (uModel < 0.5) {                                                // banded coral shrimp: translucent red / white bands
    if (part > 0.5 && part < 4.5) { col = mix(uColC, uColB, 0.5); if (part > 1.5 && part < 2.5) col = uColC; if (part > 2.5 && part < 3.5) { cRough = 0.1; return vec3(0.01); } }
    else { float band = step(0.5, fract(op.x * 5.2 + 0.1)); col = mix(uColA, uColC, band * 0.9); col *= 0.85 + 0.3 * n1; }
    cRough = 0.35; cEm = col * 0.14;                                   // translucent: the bands stay readable even in the shade
  } else if (uModel < 1.5) {                                          // crab: mottled brown-red carapace, paler legs
    col = mix(uColA, uColB, smoothstep(0.35, 0.7, n1));
    if (part > 0.5 && part < 1.5) col = mix(uColA, uColC, 0.45 + 0.4 * step(0.5, fract(info.x * 3.0)));
    if (part > 4.5 && part < 5.5) col = mix(uColA, uColC, 0.7 * smoothstep(0.55, 0.9, op.x));
    if (part > 2.5 && part < 3.5) { cRough = 0.1; return vec3(0.01); }
    col *= 0.85 + 0.3 * n2; cRough = 0.45;
  } else if (uModel < 2.5) {                                          // hermit crab: striped shell, orange-red animal
    if (part > 6.5) { float h = op.y * 6.0 + atan(op.z, op.x) * 0.9; float st = smoothstep(0.35, 0.55, abs(fract(h) - 0.5)); col = mix(uColB, uColC, st); col *= 0.8 + 0.4 * n1; cRough = 0.4; }
    else { col = mix(uColA, vec3(0.9, 0.55, 0.3), 0.35); if (part > 2.5 && part < 3.5) { cRough = 0.1; return vec3(0.01); } }
  } else if (uModel < 3.5) {                                          // urchin: dark, banded spines
    if (part > 4.5) { float band = step(0.5, fract(info.x * 5.0 + info.z * 3.0)); col = mix(uColA, uColB, band * 0.8); cRough = 0.5; } else { col = uColA * (0.7 + 0.6 * n1); cRough = 0.7; }
  } else if (uModel < 4.5) {                                          // feather worm: parchment tube, brightly coloured crowns
    if (part > 5.5) { col = mix(info.x < 0.5 ? uColB : uColC, vec3(1.0, 0.97, 0.9), smoothstep(0.6, 1.0, fract(info.z * 7.0 + info.x))); cRough = 0.4; cEm = col * 0.12; }
    else col = uColA * (0.8 + 0.4 * n1);
  } else {                                                            // nudibranch: vivid blue body, orange gills, white edge
    if (part > 5.5) { col = uColC; cEm = uColC * 0.35; }
    else if (part > 7.5) col = vec3(0.95);
    else { col = mix(uColA, uColB, smoothstep(0.4, 0.7, n1)); cEm = uColA * 0.15; }
    cRough = 0.32;
  }
  return col;
}`;
const FRAG_DECL = 'varying vec4 vHint; varying float vFlash;';
const HINT_GLSL = /* glsl */`
{
  float nvH = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
  float rimH = pow( 1.0 - nvH, 2.4 );
  totalEmissiveRadiance += vHint.rgb * vHint.a * ( 0.05 + 1.15 * rimH );
  totalEmissiveRadiance += vec3( 1.0, 0.30, 0.22 ) * clamp( vFlash, 0.0, 1.0 ) * ( 0.35 + 0.9 * rimH );
}`;

export function crawlUniforms(vis) {
  const V3 = (a) => new THREE.Vector3(...a);
  return { uModel: { value: MODEL_ID[vis.model] }, uColA: { value: V3(vis.colA) }, uColB: { value: V3(vis.colB) }, uColC: { value: V3(vis.colC) } };
}

export function makeCrawlMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide });
  uw(mat, 'gcrawl', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + CRAWL_DECL).replace('#include <begin_vertex>', CRAWL_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <lights_pars_begin>', CRAWL_FRAG + '\n#include <lights_pars_begin>')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = crawlSurface( vInfo, vObjP, normalize( vObjN ), length( vViewPosition ) );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = cRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += cEm;\n' + HINT_GLSL);
  });
  return mat;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// jelly (game version: bell pulse phase comes from aAnim.x; the skin shader is the explore-mode one)
// ---------------------------------------------------------------------------------------------------------------------------------
export function jellyGameGeometry() { return jellyGeometry(11, { tentacles: 46, tentLen: 0.32, bellH: 0.30 }); }
const JELLY_DECL = /* glsl */`
attribute vec4 aInfo; attribute vec4 aAnim; attribute vec4 aSeed; attribute vec4 aHint;
varying vec4 vInfo; varying vec3 vObjP; varying vec4 vSeed; varying vec4 vHint; varying float vFlash;
`;
export function jellyUniforms(vis) {
  return { uTint: { value: new THREE.Vector3(...vis.tint) }, uTint2: { value: new THREE.Vector3(...vis.tint2) }, uGlowCol: { value: new THREE.Vector3(0, 0, 0) }, uGlow: { value: 0 }, uKindJ: { value: 0 } };
}
export function makeJellyMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.0, side: THREE.DoubleSide, transparent: true, depthWrite: false });
  uw(mat, 'gjelly', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + JELLY_DECL).replace('#include <begin_vertex>', `
      vInfo = aInfo; vObjP = position; vSeed = aSeed; vHint = aHint; vFlash = aAnim.w;
      float php = aAnim.x;
      float contr = pow(0.5 + 0.5 * sin(php), 1.4);
      vec3 transformed = position;
      float isBell = (aInfo.y < 2.5 ? 1.0 : 0.0);
      float radial = length(position.xz);
      transformed.xz *= 1.0 - 0.16 * contr * (isBell > 0.5 ? smoothstep(0.02, 0.5, radial) : 1.0);
      transformed.y += (isBell > 0.5 ? -0.07 * contr * (1.0 - smoothstep(0.0, 0.3, position.y)) : 0.0);
      if (aInfo.y > 2.5) {
        float depthBelow = clamp(-position.y * 2.2, 0.0, 1.2);
        transformed.x += 0.06 * depthBelow * sin(php - depthBelow * 3.0 + aSeed.x * 6.0);
        transformed.z += 0.05 * depthBelow * cos(php * 0.7 - depthBelow * 2.4 + aSeed.y * 6.0);
        transformed.y += 0.05 * contr * depthBelow;
      }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <lights_pars_begin>', JELLY_FRAG + '\n#include <lights_pars_begin>')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = jellySurface( vInfo, vObjP, vSeed, normalize( normal_jelly ), normalize( vViewPosition ) );
        diffuseColor.a = fA;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += fEm + diffuseColor.rgb * uwSunAt( uwWorldFromView( - vViewPosition ) ) * 0.42 * fA;
        ` + HINT_GLSL);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'void main() {\n  vec3 normal_jelly = normalize( vNormal );');
  });
  return mat;
}
