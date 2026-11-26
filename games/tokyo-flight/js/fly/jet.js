// jet.js — the aircraft: Payen Pa 49 Katy, from the Blender model in Desktop/katy_studio (tools/export_jet.py).
// The file keeps Blender's axes (X aft of the nose tip, Y starboard, Z up). `root` is the body frame the rest of
// the page uses: -Z forward, +Y up, +X starboard, origin at the centre of gravity.
import * as THREE from 'three';
import { patch } from '../atmo.js';
import { buildPilot, loadHands } from './pilot.js';
import { buildExhaust, ZC as PIPE_Z, BORE } from './engine.js';
import { shadowProxies } from './merge.js';

export const CG = new THREE.Vector3(2.74, 0, 1.16);      // Blender coordinates; the main wheels are at x = 2.97
export const GEAR_H = 1.16;                              // centre of gravity above the ground when standing on its wheels
export const EYE = new THREE.Vector3(1.99, 0, 1.815);    // pilot's eye point, high enough to see over the compass
const D2R = Math.PI / 180;
const LIMIT = { ail: 17, elev: 19, rud: 22 };           // degrees

const MODEL_V = 3;            // 2: the jet pipe's old internals left out (engine.js builds them). 3: rudder markings ride on the rudder; pilot name
async function fetchBin(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('jet model: http ' + r.status);
  let buf = await r.arrayBuffer();
  const u = new Uint8Array(buf, 0, 2);
  // a server may or may not have unpacked the gzip on the way: look at the bytes rather than trust headers
  if (u[0] === 0x1f && u[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return buf;
}

/* ------------------------------------------------------------------ paint, rebuilt from the Blender rules */
const f = (v) => Number(v).toFixed(5);
const v3 = (c) => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
const NOISE = /* glsl */`
float kh3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float kvn(vec3 x){ vec3 i = floor(x), u = fract(x); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(mix(kh3(i), kh3(i + vec3(1,0,0)), u.x), mix(kh3(i + vec3(0,1,0)), kh3(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(kh3(i + vec3(0,0,1)), kh3(i + vec3(1,0,1)), u.x), mix(kh3(i + vec3(0,1,1)), kh3(i + vec3(1,1,1)), u.x), u.y), u.z); }
float kfbm(vec3 p){ return 0.5 * kvn(p) + 0.3 * kvn(p * 2.1 + 7.0) + 0.2 * kvn(p * 4.3 + 3.0); }
float kaa(float e, float x){ float w = fwidth(x) * 0.75 + 1e-6; return smoothstep(e - w, e + w, x); }
float kmapr(float x, float a, float b){ return clamp((x - a) / (b - a), 0.0, 1.0); }
// the skin's structure. What is finer than a pixel is faded out, not left to shimmer: rivets within a few metres, joints further.
float kpx(vec3 p){ return length(fwidth(p)); }
float knear(vec3 p){ return 1.0 - smoothstep(0.0020, 0.0070, kpx(p)); }
float kmid(vec3 p){ return 1.0 - smoothstep(0.012, 0.06, kpx(p)); }
// a row of rivets (u along the row, v across it, metres): where each one and its shadow are; and a sheet joint
float krow(float u, float v, float pitch){ return 1.0 - smoothstep(0.0021, 0.0031, length(vec2((fract(u / pitch) - 0.5) * pitch, v))); }
float kline(float v, float w){ return 1.0 - smoothstep(0.5 * w, w, abs(v)); }
// the head of the nearest rivet in that row as a low dome: 1 at its centre, 0 from its rim (2.6 mm out) onwards
float kdom(float u, float v, float pitch){ vec2 q = vec2((fract(u / pitch) - 0.5) * pitch, v); return clamp(1.0 - dot(q, q) / 6.76e-6, 0.0, 1.0); }
`;
// The airframe is sheet riveted to ribs, spars and frames. Each kind of surface lays its own rows out (kRv), its
// joints (kSm) and the height of its skin in metres (kH: each rivet head is a low dome under half a millimetre proud, kDm; joints
// sit a third of a millimetre low; and each bay between its supports is dished by about half a millimetre, which is
// what makes real metal skin catch the light). Seen from a hand's breadth the heads are what the eye checks first.
// The dish is nil along every support and deepest mid-bay, and how deep differs bay to bay; it must be nil exactly
// where the bay changes, or the step between two bays shows as a broken hairline down the joint.
const SKIN = {
  wing: /* glsl */`
      float sAy = abs(vKp.y), sN = knear(vKp), sM = kmid(vKp);
      float sRib = (fract(sAy / 0.27 + 0.5) - 0.5) * 0.27, sSpar = (fract(vKp.x / 0.46 + 0.5) - 0.5) * 0.46;
      float sJr = step(0.5, mod(floor(sAy / 0.27 + 0.5), 2.0)), sRr = sRib - 0.009 * sJr;       // where two sheets meet, the rivets stand beside the joint, not on it
      float kRv = max(krow(vKp.x, sRr, 0.030), max(krow(sAy, sSpar - 0.010, 0.030), krow(sAy + 0.015, sSpar + 0.010, 0.030))) * sN;
      float kDm = max(kdom(vKp.x, sRr, 0.030), max(kdom(sAy, sSpar - 0.010, 0.030), kdom(sAy + 0.015, sSpar + 0.010, 0.030))) * sN;
      float kSm = max(kline(sRib, 0.0014) * sJr, kline(sSpar, 0.0014)) * sM;
      float kH = 0.00042 * kDm - 0.00045 * kSm - 0.00055 * sM * (0.3 + 0.7 * kh3(vec3(floor(sAy / 0.27), floor(vKp.x / 0.46), 3.0))) * (0.5 - 0.5 * cos(6.2832 * sAy / 0.27)) * (0.5 - 0.5 * cos(6.2832 * vKp.x / 0.46));
      // dirt drawn back from each joint by the air
      diffuseColor.rgb *= 1.0 - 0.07 * sM * kvn(vec3(vKp.x * 2.2, sAy * 55.0, 2.0)) * smoothstep(0.0, 0.20, sSpar + 0.23);`,
  fuselage: /* glsl */`
      vec2 sC = vec2(vKp.y, vKp.z - 1.20); float sRad = max(length(sC), 0.04), sTh = atan(sC.x, sC.y);
      float sN = knear(vKp), sM = kmid(vKp), sBody = 1.0 - kCone;
      float sFr = (fract(vKp.x / 0.31 + 0.5) - 0.5) * 0.31, sSt = (fract(sTh / 0.2618 + 0.5) - 0.5) * 0.2618 * sRad;
      float sJf = step(0.5, mod(floor(vKp.x / 0.31 + 0.5), 2.0)), sJs = step(mod(floor(sTh / 0.2618 + 0.5) + 12.0, 4.0), 0.5);
      float sFv = sFr - 0.009 * sJf, sSv = sSt - 0.009 * sJs;
      float kRv = max(krow(sTh * sRad, sFv, 0.028), krow(vKp.x, sSv, 0.034)) * sN * sBody;
      float kDm = max(kdom(sTh * sRad, sFv, 0.028), kdom(vKp.x, sSv, 0.034)) * sN * sBody;
      float kSm = max(kline(sFr, 0.0014) * sJf, kline(sSt, 0.0014) * sJs) * sM * sBody;
      float kH = 0.00042 * kDm - 0.00045 * kSm - 0.00030 * sM * sBody * (0.3 + 0.7 * kh3(vec3(floor(vKp.x / 0.31 + 0.5), floor(sTh / 0.2618), 5.0))) * (0.5 + 0.5 * cos(6.2832 * vKp.x / 0.31)) * (0.5 - 0.5 * cos(6.2832 * sTh / 0.2618));
      diffuseColor.rgb *= 1.0 - 0.06 * sM * sBody * kvn(vec3(vKp.x * 2.0, sTh * 30.0, 4.0)) * smoothstep(0.0, 0.14, sFr + 0.155);`,
  fin: /* glsl */`
      float sN = knear(vKp), sM = kmid(vKp);
      float sRib = (fract(vKp.z / 0.24 + 0.5) - 0.5) * 0.24, sSpar = (fract(vKp.x / 0.38 + 0.5) - 0.5) * 0.38;
      float sJr = step(0.5, mod(floor(vKp.z / 0.24 + 0.5), 2.0)), sJp = step(0.5, mod(floor(vKp.x / 0.38 + 0.5), 2.0));
      float sRr = sRib - 0.009 * sJr, sPr = sSpar - 0.009 * sJp;
      float kRv = max(krow(vKp.x, sRr, 0.030), krow(vKp.z, sPr, 0.030)) * sN;
      float kDm = max(kdom(vKp.x, sRr, 0.030), kdom(vKp.z, sPr, 0.030)) * sN;
      float kSm = max(kline(sRib, 0.0014) * sJr, kline(sSpar, 0.0014) * sJp) * sM;
      float kH = 0.00042 * kDm - 0.00045 * kSm - 0.00045 * sM * (0.5 - 0.5 * cos(6.2832 * vKp.z / 0.24)) * (0.5 - 0.5 * cos(6.2832 * vKp.x / 0.38));`,
};
const SKIN_TONE = `
      diffuseColor.rgb *= 1.0 - 0.22 * kRv * (1.0 - smoothstep(0.0, 0.10, kDm)) - 0.30 * kSm;`;      // the thin shadow round each head, and the joints
const SKIN_ROUGH = ' roughnessFactor = clamp(roughnessFactor + 0.10 * kRv + 0.15 * kSm, 0.05, 1.0);';
// the skin's height bends the light (Mikkelsen's surface gradient: no texture coordinates needed)
const SKIN_BUMP = /* glsl */`{
      vec3 sPx = dFdx( - vViewPosition ), sPy = dFdy( - vViewPosition ); float sHx = dFdx( kH ), sHy = dFdy( kH );
      vec3 sR1 = cross( sPy, normal ), sR2 = cross( normal, sPx ); float sDet = dot( sPx, sR1 );
      normal = normalize( abs( sDet ) * normal - sign( sDet ) * ( sHx * sR1 + sHy * sR2 ) ); }`;
const lipFn = (C) => /* glsl */`
float klip(vec3 p){
  float X = p.x, ay = abs(p.y), Z = p.z;
  float t1 = kmapr(X, ${f(C.IN_S0)}, ${f(C.IN_S1)}); t1 = t1 * t1 * (3.0 - 2.0 * t1);
  float a = max(t1 * ${f(C.IN_A)}, 0.0012), b = max(t1 * ${f(C.IN_B)}, 0.0012);
  float t = X - 0.978;
  float skin = 0.283 + t * (0.1103 - t * 0.0303);
  float yc = skin + (0.20 + t1 * 0.55) * a;
  float zc = mix(1.205, 1.135, kmapr(X, 0.62, 1.47));
  float dy = abs(ay - yc) / a, dz = abs(Z - zc) / b;
  float e = pow(pow(dy, ${f(C.IN_N)}) + pow(dz, ${f(C.IN_N)}), 1.0 / ${f(C.IN_N)});
  float dist = (e - 1.0) * a;
  float w = 0.005 + t1 * 0.022;
  return kaa(-0.006, dist) * (1.0 - kaa(w, dist)) * step(${f(C.LIP0)}, X) * step(X, ${f(C.IN_S1 + 0.035)});
}`;

// Lettering and markings are paint on that same skin, so they rise over the rivets and dip at the joints under them
// and take the same dishing: worked out from the same rules, by where on the aircraft the paint is (fin and rudder,
// wing, or fuselage; the tail pod, the cone and anything inside the cockpit have no such skin). The enamel itself
// is not perfectly even: a little variation in its gloss and its tone.
function decalParts(C) {
  const part = (w, code) => `{${code}
      dRv += ${w} * kRv; dSm += ${w} * kSm; dH += ${w} * kH; dDm += ${w} * kDm; }`;
  return { vertPars: 'varying vec3 vKp;', vert: 'vKp = position;', fragPars: 'varying vec3 vKp;' + NOISE,
    color: /* glsl */`
      float kCone = 1.0 - kaa(${f(C.CONE_S)}, vKp.x);
      float dIn = step(1.2, vKp.x) * step(vKp.x, 2.4) * step(abs(vKp.y), 0.28) * step(0.9, vKp.z) * step(vKp.z, 1.66);
      float wFin = step(2.6, vKp.x) * step(1.5, vKp.z), wWing = (1.0 - wFin) * step(0.5, abs(vKp.y)) * step(vKp.z, 1.25);
      float wFus = (1.0 - wFin) * (1.0 - wWing) * step(vKp.x, 4.15) * (1.0 - dIn);
      float dRv = 0.0, dSm = 0.0, dH = 0.0, dDm = 0.0;` + part('wFin', SKIN.fin) + part('wWing', SKIN.wing) + part('wFus', SKIN.fuselage) + /* glsl */`
      float kRv = dRv, kSm = dSm, kH = dH, kDm = dDm;
      diffuseColor.rgb *= ( 0.95 + 0.10 * kfbm( vKp * 22.0 ) ) * ( 1.0 - 0.10 * kRv * ( 1.0 - smoothstep( 0.0, 0.10, kDm ) ) - 0.12 * kSm );`,
    rough: 'roughnessFactor = clamp( roughnessFactor + 0.16 * ( kfbm( vKp * 34.0 ) - 0.5 ) + 0.06 * kSm, 0.08, 1.0 );', normal: SKIN_BUMP };
}

function paintParts(kind, C) {
  const RED = v3(C.RED), BLUE = v3(C.BLUE), BLACK = v3(C.BLACK);
  const p = { vertPars: 'varying vec3 vKp;', vert: 'vKp = position;', fragPars: 'varying vec3 vKp;' + NOISE };
  // nothing painted may show inside the jet pipe: the fuselage's end cap and the fin's base both run through its bore
  const CUT = `if ( vKp.x > 4.296 && length( vec2( vKp.y, vKp.z - ${f(PIPE_Z)} ) ) < ${f(BORE)} ) discard;
`;
  if (kind === 'fuselage') {
    // red cone and intake lip; matt black anti-glare panel; nose cone and engine cowl are sheet metal
    p.fragPars += lipFn(C);
    p.color = CUT + /* glsl */`
      float kCone = 1.0 - kaa(${f(C.CONE_S)}, vKp.x);
      float kRed = max(kCone, klip(vKp));
      float kZe = mix(1.375, 1.436, kmapr(vKp.x, 0.33, 0.93)) + 0.031 * kmapr(vKp.x, 0.93, 1.62);
      float kGlare = (1.0 - kCone) * (1.0 - kaa(1.62, vKp.x)) * kaa(kZe, vKp.z);
      float kSheet = max(kCone, kaa(${f(C.COWL_S)}, vKp.x));
      diffuseColor.rgb *= 0.93 + 0.10 * kfbm(vKp * 2.6);
      diffuseColor.rgb = mix(mix(diffuseColor.rgb, ${RED}, kRed), ${BLACK}, kGlare);` + SKIN.fuselage + SKIN_TONE;
    p.rough = /* glsl */`roughnessFactor = mix(roughnessFactor, ${f(C.SHEET_ROUGH)}, kSheet);
      roughnessFactor = mix(mix(clamp(roughnessFactor + 0.10 * (kfbm(vKp * 6.0) - 0.5), 0.05, 1.0), 0.26, kRed), 0.76, kGlare);`;
    p.metal = `metalnessFactor = mix(metalnessFactor, ${f(C.SHEET_METAL)}, kSheet) * (1.0 - max(kRed, kGlare));`;
    p.rough += SKIN_ROUGH; p.normal = SKIN_BUMP;
  } else if (kind === 'wing') {
    p.vertPars += 'attribute float le_dist; varying float vLe;'; p.vert += 'vLe = le_dist;';
    p.fragPars += lipFn(C) + 'varying float vLe;';
    p.color = /* glsl */`
      float kInb = 1.0 - kaa(2.445, abs(vKp.y));
      float kRed = max(kaa(-0.004, vLe) * (1.0 - kaa(0.020, vLe)) * kInb, klip(vKp));
      float kBlue = kaa(-0.070, vLe) * (1.0 - kaa(-0.004, vLe)) * kInb * (1.0 - kRed);
      diffuseColor.rgb *= 0.92 + 0.11 * kfbm(vKp * 2.6);
      diffuseColor.rgb = mix(mix(diffuseColor.rgb, ${RED} * 0.8, kRed), ${BLUE}, kBlue);` + SKIN.wing + SKIN_TONE;
    p.rough = 'roughnessFactor = mix(clamp(roughnessFactor + 0.10 * (kfbm(vKp * 6.0) - 0.5), 0.05, 1.0), 0.62, max(kRed, kBlue));';
    p.metal = 'metalnessFactor *= 1.0 - max(kRed, kBlue);';
    p.rough += SKIN_ROUGH; p.normal = SKIN_BUMP;
  } else if (kind === 'bare') {                       // hand-beaten aluminium: dull oxidised blotches
    p.color = 'float kOx = smoothstep(0.42, 0.66, kfbm(vKp * 5.0)); diffuseColor.rgb *= mix(1.0, 0.70, kOx * 0.8);';
    p.rough = 'roughnessFactor = clamp(roughnessFactor + 0.22 * kOx + 0.10 * (kfbm(vKp * 14.0) - 0.5), 0.05, 1.0);';
  } else {
    p.color = CUT + 'diffuseColor.rgb *= 0.93 + 0.10 * kfbm(vKp * 2.6);';
    p.rough = 'roughnessFactor = clamp(roughnessFactor + 0.12 * (kfbm(vKp * 6.0) - 0.5), 0.05, 1.0);';
    if (kind === 'fin') { p.color += SKIN.fin + SKIN_TONE; p.rough += SKIN_ROUGH; p.normal = SKIN_BUMP; }       // the fin and rudder: ribs across, spars up
  }
  return p;
}

// Glass adds its reflection to what is behind it and takes a little of that away: more at a glancing angle.
const GLASS = {
  color: /* glsl */`
    float kFr = pow( 1.0 - abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ), 3.0 );
    diffuseColor.a = mix( uGlass.x, uGlass.y, kFr );`,
  fragPars: 'uniform vec2 uGlass;',
};

// one level of detail of the aircraft: its meshes, its moving parts, its pilot
class JetModel {
  constructor(man, buf, lod, jet) {
    this.lod = lod;
    this.model = new THREE.Group(); this.model.name = 'jet-' + lod;
    this.model.matrix.copy(jet.toBody); this.model.matrixAutoUpdate = false;
    this.materials = []; this.glass = [];
    this.uHeat = jet.uHeat; this.uLamp = jet.uLamp;
    this.parts = {};
    for (const [name, p] of Object.entries(man.parts)) {
      const pivot = new THREE.Group(); pivot.position.fromArray(p.p);
      this.parts[name] = { pivot, axis: new THREE.Vector3().fromArray(p.a), sign: p.sign || 1, rest: (p.rest || 0) * D2R, radius: p.radius || 0, angle: 0 };
      this.model.add(pivot);
    }
    const [b0, b1] = man.bbox, sx = (b1[0] - b0[0]) / 65535, sy = (b1[1] - b0[1]) / 65535, sz = (b1[2] - b0[2]) / 65535;
    const mats = man.materials.map((m) => this.material(m, man.consts));
    for (const g of man.groups) {
      const q = new Uint16Array(buf, g.pos, g.verts * 3), pos = new Float32Array(g.verts * 3);
      for (let i = 0; i < g.verts; i++) { pos[i * 3] = b0[0] + q[i * 3] * sx; pos[i * 3 + 1] = b0[1] + q[i * 3 + 1] * sy; pos[i * 3 + 2] = b0[2] + q[i * 3 + 2] * sz; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(buf, g.nor, g.verts * 3), 3, true));
      if (g.led !== undefined) geo.setAttribute('le_dist', new THREE.BufferAttribute(new Float32Array(buf, g.led, g.verts), 1));
      geo.setIndex(new THREE.BufferAttribute(g.i32 ? new Uint32Array(buf, g.idx, g.tris * 3) : new Uint16Array(buf, g.idx, g.tris * 3), 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const info = man.materials[g.m], mesh = new THREE.Mesh(geo, mats[g.m]);
      mesh.name = info.name + (g.part ? ':' + g.part : '');
      const clear = info.kind === 'glass' || info.kind === 'thin';
      mesh.castShadow = !clear && !info.decal; mesh.receiveShadow = !clear;
      if (clear) { mesh.renderOrder = 20; this.glass.push(mesh); }
      if (g.part) { const p = this.parts[g.part]; mesh.position.copy(p.pivot.position).negate(); p.pivot.add(mesh); }
      else this.model.add(mesh);
    }
    this.pilot = jet.newPilot(); this.head = this.pilot.userData.head; this.model.add(this.pilot);
    this.materials.push(...this.pilot.userData.materials);
    const ex = buildExhaust(jet.uHeat); this.model.add(ex); this.materials.push(...ex.userData.materials);
    this.tris = man.groups.reduce((s, g) => s + g.tris, 0);
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._ax = new THREE.Vector3(1, 0, 0);
    // The aircraft has a pass of its own (layer 1) and is drawn only there. Its shadow is cast by stand-ins, one for
    // each group of parts that moves together, which are on the world's layer (merge.js says why).
    shadowProxies(this.model, Object.values(this.parts).map((p) => p.pivot));
    this.model.traverse((o) => { if (!o.isShadowProxy) o.layers.set(1); });
  }

  material(m, C) {
    let mat;
    if (m.kind === 'glass' || m.kind === 'thin') {
      // acrylic 3 mm thick: clear straight through, more and more mirror towards its edges, with the faint film every canopy carries
      mat = new THREE.MeshPhysicalMaterial({ color: 0x0b0e10, metalness: 0, roughness: 0.035, ior: 1.49, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
      patch(mat, 'jet-' + m.kind, GLASS, { uGlass: { value: m.kind === 'glass' ? new THREE.Vector2(0.13, 0.86) : new THREE.Vector2(0.03, 0.4) } });
    } else {
      const p = { color: new THREE.Color().setRGB(m.color[0], m.color[1], m.color[2]), metalness: m.metal, roughness: m.rough, side: THREE.DoubleSide };
      mat = m.coat > 0 ? new THREE.MeshPhysicalMaterial({ ...p, clearcoat: m.coat, clearcoatRoughness: 0.05 }) : new THREE.MeshStandardMaterial(p);
      if (m.decal) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; }
      if (m.name === 'Katy_seam') { mat.polygonOffsetFactor = -5; mat.polygonOffsetUnits = -24; }       // hair-thin strips on a curved skin: from close they broke into dashes
      const paint = m.decal && /Katy_(black|navy|white|red_mark|white_mark|blue_ins|blue_rnd|red_rnd|white_rnd|yellow_mark)$/.test(m.name);
      const kind = /PaintFin|Rudder/.test(m.name) ? 'fin' : m.kind;
      if (['fuselage', 'wing', 'silver', 'bare'].includes(m.kind)) patch(mat, 'jet-' + kind, paintParts(kind, C));
      else if (paint) patch(mat, 'jet-decal', decalParts(C));
      else if (m.name === 'Katy_hotsteel') {
        // the jet pipe's outer skin: stainless, straw then purple then blue towards the lip where it runs hottest
        patch(mat, 'jet-pipe', { vertPars: 'varying vec3 vKp;', vert: 'vKp = position;', fragPars: 'varying vec3 vKp;',
          color: `float pT = smoothstep( 4.30, 4.60, vKp.x ), pN = apNoise( vec2( atan( vKp.z - 1.198, vKp.y ) * 6.0, vKp.x * 70.0 ) );
            vec3 pC = mix( vec3( 0.46, 0.45, 0.44 ), vec3( 0.50, 0.40, 0.24 ), smoothstep( 0.25, 0.55, pT + 0.12 * pN ) );
            pC = mix( pC, vec3( 0.34, 0.22, 0.30 ), smoothstep( 0.55, 0.78, pT + 0.10 * pN ) );
            pC = mix( pC, vec3( 0.17, 0.21, 0.31 ), smoothstep( 0.78, 0.97, pT + 0.08 * pN ) );
            diffuseColor.rgb = pC * ( 0.85 + 0.3 * pN );`,
          rough: 'roughnessFactor = 0.30 + 0.25 * pN;', metal: 'metalnessFactor = 0.92;' });
      } else if (m.name === 'KatyBareRamp' || m.name === 'Katy_dark') {
        // the intake: a dished ramp of beaten sheet that deepens into a duct. Past the lip the duct is riveted up in
        // three rings and less and less light reaches it; the duct turns inboard to the engine, so its far end is dark.
        const ramp = m.name === 'KatyBareRamp';
        patch(mat, 'jet-' + (ramp ? 'ramp' : 'dark'), { vertPars: 'varying vec3 vKp;', vert: 'vKp = position;', fragPars: 'varying vec3 vKp;' + NOISE,
          color: ramp ? /* glsl */`
            float kOx = smoothstep( 0.42, 0.66, kfbm( vKp * 5.0 ) ); diffuseColor.rgb *= mix( 1.0, 0.72, kOx * 0.8 );
            float dA = atan( vKp.z - 1.135, abs( vKp.y ) - 0.444 ), dSeam = 0.0, dRiv = 0.0;
            for ( int i = 0; i < 3; i ++ ) {
              float dx = vKp.x - ( 1.585 + 0.150 * float( i ) );
              dSeam = max( dSeam, 1.0 - smoothstep( 0.0005, 0.0014, abs( dx ) ) );
              float u = ( fract( dA * 4.4563 ) - 0.5 ) * 0.0168;
              dRiv = max( dRiv, 1.0 - smoothstep( 0.0021, 0.0030, length( vec2( dx - 0.009, u ) ) ) );
            }
            float kIn = step( 1.50, vKp.x );
            diffuseColor.rgb *= 1.0 - 0.5 * dSeam * kIn; diffuseColor.rgb *= 1.0 + 0.22 * dRiv * kIn;
            // streaks drawn back along the duct by the air
            diffuseColor.rgb *= 1.0 - 0.16 * kIn * kvn( vec3( dA * 9.0, vKp.x * 3.0, 1.0 ) );` : '',
          rough: ramp ? 'roughnessFactor = clamp( roughnessFactor + 0.22 * kOx + 0.10 * ( kfbm( vKp * 14.0 ) - 0.5 ) - 0.12 * dRiv * kIn, 0.05, 1.0 );' : '',
          final: 'gl_FragColor.rgb *= mix( 1.0, 0.015, smoothstep( 1.49, 1.93, vKp.x ) * step( 0.30, abs( vKp.y ) ) * step( vKp.x, 2.06 ) * step( vKp.z, 1.30 ) );' });
      } else if (m.name === 'Katy_rubber') {
        // the tyres: tread ribs with grooves between them, a moulded ring and lettering on the sidewall, dust where they run.
        // (other rubber parts are nowhere near a wheel centre and are left as they are)
        patch(mat, 'jet-tyre', { vertPars: 'varying vec3 vKp;', vert: 'vKp = position;', fragPars: 'varying vec3 vKp;' + NOISE,
          color: /* glsl */`
            vec3 tD = vec3( vKp.x - 0.47, vKp.y, vKp.z - 0.13 ); float tR = 0.13;
            if ( vKp.x > 1.7 ) { tD = vec3( vKp.x - 2.97, abs( vKp.y ) - 1.005, vKp.z - 0.20 ); tR = 0.20; }
            float tr = length( tD.xz ) / tR, tOn = step( 0.5, tr ) * step( tr, 1.1 ) * step( abs( tD.y ), tR * 0.6 ), tM = kmid( vKp );
            float tTread = smoothstep( 0.88, 0.94, tr ) * tOn, tSide = ( 1.0 - smoothstep( 0.88, 0.94, tr ) ) * tOn;
            float tl = abs( tD.y ) / ( tR * 0.34 ), tAng = atan( tD.z, tD.x );
            float tGroove = max( kline( tl - 0.26, 0.09 ), kline( tl - 0.74, 0.09 ) ) * tTread;
            float tRing = kline( tr - 0.82, 0.012 ) * tSide;
            float tLetter = step( 0.35, fract( tAng * 5.41 ) ) * step( fract( tAng * 5.41 ), 0.9 ) * step( 0.3, kh3( vec3( floor( tAng * 5.41 ), 1.0, 2.0 ) ) ) * kline( tr - 0.72, 0.035 ) * tSide;
            float kH = ( - 0.0030 * tGroove + 0.0008 * tRing + 0.0006 * tLetter ) * tM;
            diffuseColor.rgb *= 1.0 - 0.45 * tGroove * tM;
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.20, 0.19, 0.18 ), tTread * ( 1.0 - tGroove ) * ( 0.25 + 0.35 * kvn( vec3( tAng * 9.0, tD.y * 90.0, 3.0 ) ) ) );`,
          rough: 'roughnessFactor = clamp( roughnessFactor + 0.08 * tTread - 0.10 * tLetter, 0.2, 1.0 );', normal: SKIN_BUMP });
      } else if (/Lamp|RedGlass|GreenGlass|AmberGlass/.test(m.name)) {
        // a moulded lens: fine ribs round it (they run across the aircraft's length), which break the light up close
        patch(mat, 'jet-lamp', { vertPars: 'varying vec3 vKp;', vert: 'vKp = position;', fragPars: 'uniform float uLamp; varying vec3 vKp;' + NOISE,
          color: 'float kLn = 1.0 - smoothstep( 0.0007, 0.0030, kpx( vKp ) ); float kH = 0.00022 * kLn * cos( vKp.x * 1745.0 ); diffuseColor.rgb *= 1.0 - 0.10 * kLn * ( 0.5 + 0.5 * cos( vKp.x * 1745.0 + 3.1416 ) );',
          emissive: 'totalEmissiveRadiance += diffuseColor.rgb * uLamp;', normal: SKIN_BUMP }, { uLamp: this.uLamp });
      } else patch(mat, 'jet-std', {});
    }
    mat.envMapIntensity = 1.0;
    this.materials.push(mat);
    return mat;
  }

  turn(name, deg) {
    const p = this.parts[name]; if (!p) return;
    p.pivot.quaternion.setFromAxisAngle(p.axis, deg * D2R * p.sign);
  }

  // put the control surfaces, stick, throttle and the pilot's head where the smoothed commands `c` say
  apply(c) {
    this.turn('ail_R', -c.ail * LIMIT.ail); this.turn('ail_L', c.ail * LIMIT.ail);
    const e = -c.elev * LIMIT.elev - (1 - c.parked) * 7;                          // 7 degrees of droop built into the parked model
    this.turn('elev_R', e); this.turn('elev_L', e);
    this.turn('rudder', c.rud * LIMIT.rud);
    this.turn('throttle', c.thr * 38);
    const st = this.parts.stick;
    if (st) {
      this._q.setFromAxisAngle(st.axis, c.elev * 9 * D2R);
      this._q2.setFromAxisAngle(this._ax, -c.ail * 9 * D2R);
      st.pivot.quaternion.copy(this._q).multiply(this._q2);
    }
    for (const n of ['wheel_N', 'wheel_L', 'wheel_R']) {
      const p = this.parts[n]; if (!p) continue;
      p.pivot.quaternion.setFromAxisAngle(p.axis, ((c.rolled / p.radius) * p.sign) % (Math.PI * 2));
    }
    this.head.rotation.y = -c.look * 0.55;                                        // the pilot looks into the turn
  }
}

// The aircraft as the page uses it. It can hold more than one level of detail (phones fly the light one but show
// the full one in the hangar close-ups); `use` picks which is drawn.
export class Jet {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'jet';
    // Blender (aft, starboard, up) -> body (starboard, up, aft)
    const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
    this.toBody = M.clone().multiply(new THREE.Matrix4().makeTranslation(-CG.x, -CG.y, -CG.z));
    this.uHeat = { value: 0 }; this.uLamp = { value: 0 };
    this.models = {}; this.active = null; this.lod = null; this.env = null; this.envK = 1; this.inside = false;
    this.ctl = { ail: 0, elev: 0, rud: 0, thr: 0, parked: 1, look: 0, rolled: 0 };
    this.hands = null; this._pilot = null;
  }
  // one pilot is built; each level of detail gets its own copy of him (same meshes)
  newPilot() {
    if (!this._pilot) { this._pilot = buildPilot(this.hands); return this._pilot; }
    // (a copy is made by writing the original's userData out as text and reading it back; with the head and the
    // materials in there that means writing out every mesh and texture of the pilot, so they are taken out first)
    const ud = this._pilot.userData; this._pilot.userData = {};
    const c = this._pilot.clone(true); this._pilot.userData = ud;
    c.userData.head = c.getObjectByName('head'); c.userData.materials = ud.materials; return c;
  }
  add(lod, man, buf) {
    const m = new JetModel(man, buf, lod, this);
    m.model.visible = false; this.root.add(m.model); this.models[lod] = m;
    if (this.env) for (const mat of m.materials) { mat.envMap = this.env; mat.envMapIntensity = this.envK; }
    m.pilot.visible = !this.inside;
    if (!this.active) this.use(lod);
    return m;
  }
  has(lod) { return !!this.models[lod]; }
  use(lod) {
    const m = this.models[lod]; if (!m) return false;
    if (this.active !== m) { for (const k in this.models) this.models[k].model.visible = this.models[k] === m; this.active = m; this.lod = lod; m.apply(this.ctl); }
    return true;
  }
  get tris() { return this.active ? this.active.tris : 0; }

  // reflections: the page's sky map, at its real strength (the city is drawn with it turned well down)
  setEnv(tex, intensity = 1) {
    if (tex === this.env && intensity === this.envK) return;
    this.env = tex; this.envK = intensity;
    for (const k in this.models) for (const m of this.models[k].materials) { m.envMap = tex; m.envMapIntensity = intensity; }
  }

  // roll, pitch, yaw commands -1..1 (right, nose up, nose right), throttle 0..1, parked 0..1 (elevators hang as built),
  // wheel = metres rolled since the last call
  pose(dt, { roll = 0, pitch = 0, yaw = 0, throttle = 0, parked = 0, wheel = 0, look = 0 } = {}) {
    const c = this.ctl, k = dt > 0 ? 1 - Math.exp(-dt * 14) : 1;
    c.ail += (roll - c.ail) * k; c.elev += (pitch - c.elev) * k; c.rud += (yaw - c.rud) * k;
    c.thr += (throttle - c.thr) * k; c.parked += (parked - c.parked) * k; c.look += (look - c.look) * (dt > 0 ? 1 - Math.exp(-dt * 3) : 1);
    c.rolled += wheel;
    this.active?.apply(c);
  }

  // a point given in Blender coordinates, in the body frame
  body(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.toBody); }

  // seen from the pilot's seat the pilot is in the way
  cockpit(on) { this.inside = on; for (const k in this.models) this.models[k].pilot.visible = !on; }
}

async function fetchLod(lod, base) {
  // browsers keep the model for a day: the number on the end changes when the export does, so nobody flies an old one
  return Promise.all([fetch(base + 'jet-' + lod + '.json?v=' + MODEL_V).then((r) => { if (!r.ok) throw new Error('jet model: http ' + r.status); return r.json(); }), fetchBin(base + 'jet-' + lod + '.bin.gz?v=' + MODEL_V)]);
}
export async function loadJet(lod = 'hi', base = './assets/jet/') {
  const jet = new Jet(), [[man, buf], hands] = await Promise.all([fetchLod(lod, base), loadHands()]);
  jet.hands = hands;
  jet.add(lod, man, buf);
  return jet;
}
// bring in another level of detail later, without holding anything up
export async function addLod(jet, lod, base = './assets/jet/') {
  if (jet.has(lod)) return jet;
  const [man, buf] = await fetchLod(lod, base);
  jet.add(lod, man, buf);
  return jet;
}
