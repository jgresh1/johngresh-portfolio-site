// Jellyfish: pulsing translucent bell, gonads, oral arms, trailing tentacles. Blooms drift analytically
// (like the fish schools). Variants: moon jelly (surface waters), glowing deep jelly (bioluminescent).
import * as THREE from 'three';
import { GLSL_NOISE } from '../glsl.js';
import { uw, SWAY_GLSL } from '../optics.js';
import { Builder, mulberry32, makeNoise3, hashStr } from '../flora/geom.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// unit-diameter jelly. aInfo = (param, part, radial angle 0..1, extra)
// part: 0 bell outer, 1 bell inner, 2 gonad ring, 3 oral arm, 4 tentacle, 5 canal ornament
export function jellyGeometry(seed = 1, o = {}) {
  const { bellH = 0.30, tentacles = 64, tentLen = 0.34, arms = 4, gonads = true, tentR = 0.0035, armLen = 0.42, kind = 0 } = o;
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 2), b = new Builder();
  const rimR = 0.5;
  const bell = (u, v, inner) => {
    const a = u * TAU, ph = v * 1.52;                       // polar angle from apex to the curled margin
    const r = rimR * Math.sin(ph) * (1 + (inner ? -0.05 : 0)) * (1 + 0.025 * n3(Math.cos(a) * 2, v * 3, Math.sin(a) * 2));
    const y = bellH * Math.cos(ph) * (inner ? 0.9 : 1.0) - (inner ? 0.035 : 0) + (v > 0.85 ? 0.06 * (v - 0.85) * (1 + Math.sin(a * 8) * 0.4) : 0);
    return V(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  b.grid(48, 22, (u, v) => bell(u, v, false), [0, 0, 0, 0], false);
  b.grid(48, 22, (u, v) => bell(u, v, true), [0, 1, 0, 0], true);
  if (gonads) {
    for (let k = 0; k < 4; k++) {
      const ca = k * TAU / 4 + 0.3, r0 = 0.15;
      b.grid(20, 4, (u, v) => {
        const a = ca + (u - 0.5) * 1.15, rr = r0 + (v - 0.5) * 0.055;
        return V(Math.cos(a) * rr + Math.cos(ca) * 0.0, 0.09 + 0.01 * Math.sin(u * 3.14) + (v - 0.5) * 0.01, Math.sin(a) * rr);
      }, [0, 2, k / 4, 0], false);
    }
  }
  // oral arms: frilled ribbons hanging from the centre
  for (let k = 0; k < arms; k++) {
    const a = k * TAU / arms + 0.4;
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(Math.cos(a) * (0.03 + 0.05 * t) + 0.03 * Math.sin(t * 6 + k), 0.05 - armLen * t, Math.sin(a) * (0.03 + 0.05 * t) + 0.03 * Math.cos(t * 5 + k))); }
    b.tube(pts, (t) => 0.026 * (1 - 0.6 * t) + 0.004, 6, [0, rnd(), 0, 3]);
    // ruffles
    for (let j = 0; j < 5; j++) {
      const t = 0.15 + j * 0.16, p = pts[Math.round(t * 8)];
      const side = V(-Math.sin(a), 0, Math.cos(a));
      b.tube([p.clone(), p.clone().addScaledVector(side, 0.05).add(V(0, -0.04, 0)), p.clone().addScaledVector(side, 0.08).add(V(0, -0.10, 0))], (tt) => 0.008 * (1 - 0.6 * tt), 4, [0, rnd(), 0, 3]);
      b.tube([p.clone(), p.clone().addScaledVector(side, -0.05).add(V(0, -0.04, 0)), p.clone().addScaledVector(side, -0.08).add(V(0, -0.10, 0))], (tt) => 0.008 * (1 - 0.6 * tt), 4, [0, rnd(), 0, 3]);
    }
  }
  // marginal tentacles
  for (let i = 0; i < tentacles; i++) {
    const a = (i + rnd() * 0.5) / tentacles * TAU;
    const m = bell(a / TAU, 1.0, false);
    const L = tentLen * (0.6 + 0.8 * rnd());
    const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(V(m.x * (1 - 0.06 * t) + 0.02 * Math.sin(t * 5 + i), m.y - L * t, m.z * (1 - 0.06 * t) + 0.02 * Math.cos(t * 4 + i))); }
    b.tube(pts, (t) => tentR * (1 - 0.7 * t) + 0.0008, 3, [0, rnd(), 0, 4], false);
  }
  return b.toGeometry();
}

const VERT = /* glsl */`
attribute vec4 aInfo;
attribute vec4 aSeed;
varying vec4 vInfo; varying vec3 vObjP; varying vec4 vSeed;
uniform vec3 uAnchor, uRange, uSpread;
uniform float uSpeed, uSize, uPulse, uSchoolT;
${SWAY_GLSL}
vec3 jCenter(vec4 sd, float t) {
  float w = uSpeed / max(uRange.x, 1.0);
  vec3 c = uAnchor + vec3(uRange.x * sin(w * t + 1.0), uRange.y * sin(0.7 * w * t + 2.0), uRange.z * cos(0.83 * w * t));
  vec3 base = sd.xyz * 2.0 - 1.0;
  vec3 off = base * uSpread + vec3(sin(t * 0.13 + sd.x * 50.0), sin(t * 0.11 + sd.y * 50.0) * 0.6, sin(t * 0.17 + sd.z * 50.0)) * 0.6;
  // drift with the current
  off.xz += uCurrent.xy * 0.25 * sin(t * 0.05 + sd.w * 20.0);
  return c + off;
}
`;

export const JELLY_FRAG = /* glsl */`
${GLSL_NOISE}
varying vec4 vInfo; varying vec3 vObjP; varying vec4 vSeed;
uniform vec3 uTint, uTint2, uGlowCol;
uniform float uGlow, uKindJ;
float fA; vec3 fEm;
vec3 jellySurface(vec4 info, vec3 op, vec4 sd, vec3 vn, vec3 vv) {
  float part = info.y;
  float fres = pow(1.0 - clamp(abs(dot(vn, vv)), 0.0, 1.0), 2.0);
  vec3 col = uTint; fA = 0.3; fEm = vec3(0.0);
  float ang = atan(op.z, op.x);
  if (part < 0.5) {                                        // bell outer
    float radial = length(op.xz) / 0.5;
    float canals = smoothstep(0.25, 0.9, abs(sin(ang * 4.0 + 0.4))) ;
    col = mix(uTint, uTint2, 0.25 * smoothstep(0.7, 1.0, radial));
    fA = mix(0.16, 0.55, fres) + 0.10 * smoothstep(0.85, 1.0, radial);
    // fine warts / texture
    fA *= 0.85 + 0.3 * vn3(op * 60.0);
  } else if (part < 1.5) {                                 // bell inner (subumbrella): slightly denser
    col = uTint * 0.9; fA = mix(0.12, 0.45, fres);
  } else if (part < 2.5) {                                 // gonads: opaque pink/violet
    col = uTint2; fA = 0.85; fEm = uTint2 * 0.25;
  } else if (part < 3.5) {                                 // oral arms
    col = mix(uTint, uTint2, 0.5); fA = 0.6 + 0.2 * fres;
  } else {                                                 // tentacles
    col = mix(uTint, vec3(1.0), 0.5); fA = 0.55;
  }
  if (uGlow > 0.0) {                                       // bioluminescence: sparkling nodes + pulsing rim
    float pulse = 0.5 + 0.5 * sin(uOptA.x * 1.6 + sd.x * 30.0 + op.y * 8.0);
    float nodes = smoothstep(0.86, 1.0, vn3(op * 26.0 + sd.y * 9.0));
    fEm = uGlowCol * uGlow * (0.25 * fres + 0.6 * nodes * (0.4 + 0.6 * pulse) + (part > 3.5 ? 0.6 * pulse : 0.0) + (part > 1.5 && part < 3.5 ? 0.4 : 0.0));
    fA = clamp(fA + 0.25 * nodes, 0.0, 0.95);
  }
  return col;
}
`;

export function jellyMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.0, side: THREE.DoubleSide, transparent: true, depthWrite: false });
  uw(mat, 'jelly', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT)
      .replace('#include <begin_vertex>', `
        vInfo = aInfo; vObjP = position; vSeed = aSeed;
        float tj = uOptA.x + uSchoolT * 3.1;
        float php = tj * uPulse * 6.2831853 + aSeed.w * 6.2831853;
        float contr = 0.5 + 0.5 * sin(php);                   // 0 relaxed .. 1 contracted
        contr = pow(contr, 1.4);
        vec3 transformed = position;
        // bell contracts inward and shortens, then relaxes
        float isBell = (aInfo.y < 2.5 ? 1.0 : 0.0);
        float radial = length(position.xz);
        transformed.xz *= 1.0 - 0.16 * contr * (isBell > 0.5 ? smoothstep(0.02, 0.5, radial) : 1.0);
        transformed.y += (isBell > 0.5 ? -0.07 * contr * (1.0 - smoothstep(0.0, 0.3, position.y)) : 0.0);
        // trailing parts lag and swing
        if (aInfo.y > 2.5) {
          float depthBelow = clamp(-position.y * 2.2, 0.0, 1.2);
          transformed.x += 0.06 * depthBelow * sin(php - depthBelow * 3.0 + aSeed.x * 6.0);
          transformed.z += 0.05 * depthBelow * cos(php * 0.7 - depthBelow * 2.4 + aSeed.y * 6.0);
          transformed.y += 0.05 * contr * depthBelow;
        }
        float szj = uSize * (0.7 + 0.6 * fract(aSeed.w * 9.13));
        vec3 lp = transformed * szj;`)
      .replace('#include <project_vertex>', `
        vec3 P0 = jCenter(aSeed, tj);
        // slow pulsing thrust upward
        P0.y += 0.06 * szj * sin(php - 0.6);
        vec3 wpos = P0 + lp;
        vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_pars_begin>', JELLY_FRAG + '\n#include <lights_pars_begin>')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = jellySurface( vInfo, vObjP, vSeed, normalize( normal_jelly ), normalize( vViewPosition ) );
        diffuseColor.a = fA;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += fEm + diffuseColor.rgb * uwSunAt( uwWorldFromView( - vViewPosition ) ) * 0.42 * fA;`);
    // the view-space normal is needed before lighting; expose the interpolated one
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'void main() {\n  vec3 normal_jelly = normalize( vNormal );');
  });
  return mat;
}

const KINDS = {
  moon: { size: 0.32, count: 34, spread: [7, 3.2, 7], range: [6, 1.2, 6], speed: 0.14, pulse: 0.42, depth: [3, 250], hoverAbove: [2.5, 9], prob: 0.14, slots: 3,
          tint: [0.62, 0.72, 0.80], tint2: [0.62, 0.22, 0.46], glow: 0, glowCol: [0, 0, 0], geo: { tentacles: 70, tentLen: 0.30 } },
  glow: { size: 0.30, count: 22, spread: [9, 6, 9], range: [7, 3, 7], speed: 0.12, pulse: 0.36, depth: [120, 3400], hoverAbove: [3, 40], prob: 0.18, slots: 3,
          tint: [0.40, 0.08, 0.10], tint2: [0.75, 0.15, 0.20], glow: 3.0, glowCol: [0.12, 0.55, 1.0], geo: { tentacles: 44, tentLen: 0.5, bellH: 0.36, armLen: 0.5, kind: 1 } },
  comb: { size: 0.10, count: 46, spread: [6, 4, 6], range: [5, 2, 5], speed: 0.10, pulse: 0.9, depth: [10, 600], hoverAbove: [3, 30], prob: 0.10, slots: 2,
          tint: [0.55, 0.75, 0.85], tint2: [0.4, 0.5, 0.9], glow: 0.7, glowCol: [0.4, 0.8, 1.0], geo: { tentacles: 18, tentLen: 0.6, bellH: 0.42, gonads: false, arms: 0, tentR: 0.0025 } },
};
const CELL = 70;

export class Jellies {
  constructor(scene, world) {
    this.world = world; this.group = new THREE.Group(); scene.add(this.group);
    this.entries = [];
    for (const [name, k] of Object.entries(KINDS)) {
      const geo = jellyGeometry(hashStr(name) % 100, k.geo);
      const slots = [];
      for (let s = 0; s < k.slots; s++) {
        const uniforms = {
          uAnchor: { value: new THREE.Vector3() }, uRange: { value: new THREE.Vector3(...k.range) }, uSpread: { value: new THREE.Vector3(...k.spread) },
          uSpeed: { value: k.speed }, uSize: { value: k.size }, uPulse: { value: k.pulse }, uSchoolT: { value: 0 },
          uTint: { value: new THREE.Vector3(...k.tint) }, uTint2: { value: new THREE.Vector3(...k.tint2) }, uGlowCol: { value: new THREE.Vector3(...k.glowCol) }, uGlow: { value: k.glow }, uKindJ: { value: 0 },
        };
        const mesh = new THREE.InstancedMesh(geo.clone(), jellyMaterial(uniforms), k.count);
        const rnd = mulberry32(hashStr(name) + s * 131), seeds = new Float32Array(k.count * 4);
        for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
        mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
        mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5;
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
      const R = 140, rc = Math.ceil(R / CELL), cands = [];
      const c0x = Math.floor(cam.x / CELL), c0z = Math.floor(cam.z / CELL);
      for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
        const cx = c0x + dx, cz = c0z + dz, rnd = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ hashStr(e.name)) >>> 0);
        if (rnd() > e.k.prob) continue;
        const x = (cx + 0.15 + 0.7 * rnd()) * CELL, z = (cz + 0.15 + 0.7 * rnd()) * CELL;
        const h = this.world.height(x, z), depth = -h;
        // jellies live in the water column: pick a depth band above the floor
        const d0 = e.k.depth[0], d1 = Math.min(e.k.depth[1], depth - 4);
        if (d1 <= d0) continue;
        const targetDepth = d0 + rnd() * (d1 - d0);
        const y = -targetDepth;
        cands.push({ key: e.name + ':' + cx + ',' + cz, x, y, z, d: Math.hypot(x - cam.x, z - cam.z, (y - cam.y) * 0.5), seed: rnd() * 60 });
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
