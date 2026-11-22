// jet.js — the aircraft: Payen Pa 49 Katy, from the Blender model in Desktop/katy_studio (tools/export_jet.py).
// The file keeps Blender's axes (X aft of the nose tip, Y starboard, Z up). `root` is the body frame the rest of
// the page uses: -Z forward, +Y up, +X starboard, origin at the centre of gravity.
import * as THREE from 'three';
import { patch } from '../atmo.js';

export const CG = new THREE.Vector3(2.74, 0, 1.16);      // Blender coordinates; the main wheels are at x = 2.97
export const GEAR_H = 1.16;                              // centre of gravity above the ground when standing on its wheels
export const EYE = new THREE.Vector3(1.99, 0, 1.815);    // pilot's eye point, high enough to see over the compass
const D2R = Math.PI / 180;
const LIMIT = { ail: 17, elev: 19, rud: 22 };           // degrees

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
`;
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

function paintParts(kind, C) {
  const RED = v3(C.RED), BLUE = v3(C.BLUE), BLACK = v3(C.BLACK);
  const p = { vertPars: 'varying vec3 vKp;', vert: 'vKp = position;', fragPars: 'varying vec3 vKp;' + NOISE };
  if (kind === 'fuselage') {
    // red cone and intake lip; matt black anti-glare panel; nose cone and engine cowl are sheet metal
    p.fragPars += lipFn(C);
    p.color = /* glsl */`
      float kCone = 1.0 - kaa(${f(C.CONE_S)}, vKp.x);
      float kRed = max(kCone, klip(vKp));
      float kZe = mix(1.375, 1.436, kmapr(vKp.x, 0.33, 0.93)) + 0.031 * kmapr(vKp.x, 0.93, 1.62);
      float kGlare = (1.0 - kCone) * (1.0 - kaa(1.62, vKp.x)) * kaa(kZe, vKp.z);
      float kSheet = max(kCone, kaa(${f(C.COWL_S)}, vKp.x));
      diffuseColor.rgb *= 0.93 + 0.10 * kfbm(vKp * 2.6);
      diffuseColor.rgb = mix(mix(diffuseColor.rgb, ${RED}, kRed), ${BLACK}, kGlare);`;
    p.rough = /* glsl */`roughnessFactor = mix(roughnessFactor, ${f(C.SHEET_ROUGH)}, kSheet);
      roughnessFactor = mix(mix(clamp(roughnessFactor + 0.10 * (kfbm(vKp * 6.0) - 0.5), 0.05, 1.0), 0.26, kRed), 0.76, kGlare);`;
    p.metal = `metalnessFactor = mix(metalnessFactor, ${f(C.SHEET_METAL)}, kSheet) * (1.0 - max(kRed, kGlare));`;
  } else if (kind === 'wing') {
    p.vertPars += 'attribute float le_dist; varying float vLe;'; p.vert += 'vLe = le_dist;';
    p.fragPars += lipFn(C) + 'varying float vLe;';
    p.color = /* glsl */`
      float kInb = 1.0 - kaa(2.445, abs(vKp.y));
      float kRed = max(kaa(-0.004, vLe) * (1.0 - kaa(0.020, vLe)) * kInb, klip(vKp));
      float kBlue = kaa(-0.070, vLe) * (1.0 - kaa(-0.004, vLe)) * kInb * (1.0 - kRed);
      diffuseColor.rgb *= 0.92 + 0.11 * kfbm(vKp * 2.6);
      diffuseColor.rgb = mix(mix(diffuseColor.rgb, ${RED} * 0.8, kRed), ${BLUE}, kBlue);`;
    p.rough = 'roughnessFactor = mix(clamp(roughnessFactor + 0.10 * (kfbm(vKp * 6.0) - 0.5), 0.05, 1.0), 0.62, max(kRed, kBlue));';
    p.metal = 'metalnessFactor *= 1.0 - max(kRed, kBlue);';
  } else if (kind === 'bare') {                       // hand-beaten aluminium: dull oxidised blotches
    p.color = 'float kOx = smoothstep(0.42, 0.66, kfbm(vKp * 5.0)); diffuseColor.rgb *= mix(1.0, 0.70, kOx * 0.8);';
    p.rough = 'roughnessFactor = clamp(roughnessFactor + 0.22 * kOx + 0.10 * (kfbm(vKp * 14.0) - 0.5), 0.05, 1.0);';
  } else {
    p.color = 'diffuseColor.rgb *= 0.93 + 0.10 * kfbm(vKp * 2.6);';
    p.rough = 'roughnessFactor = clamp(roughnessFactor + 0.12 * (kfbm(vKp * 6.0) - 0.5), 0.05, 1.0);';
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
    this.pilot = buildPilot(); this.model.add(this.pilot);
    this.tris = man.groups.reduce((s, g) => s + g.tris, 0);
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._ax = new THREE.Vector3(1, 0, 0);
    // the aircraft has a pass of its own (layer 1); the glass is drawn only there, so it is blended once
    this.model.traverse((o) => { o.layers.enable(1); });
    for (const g of this.glass) g.layers.set(1);
  }

  material(m, C) {
    let mat;
    if (m.kind === 'glass' || m.kind === 'thin') {
      mat = new THREE.MeshPhysicalMaterial({ color: 0x050607, metalness: 0, roughness: 0.03, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
      patch(mat, 'jet-' + m.kind, GLASS, { uGlass: { value: m.kind === 'glass' ? new THREE.Vector2(0.10, 0.62) : new THREE.Vector2(0.03, 0.4) } });
    } else {
      const p = { color: new THREE.Color().setRGB(m.color[0], m.color[1], m.color[2]), metalness: m.metal, roughness: m.rough, side: THREE.DoubleSide };
      mat = m.coat > 0 ? new THREE.MeshPhysicalMaterial({ ...p, clearcoat: m.coat, clearcoatRoughness: 0.05 }) : new THREE.MeshStandardMaterial(p);
      if (m.decal) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; }
      if (['fuselage', 'wing', 'silver', 'bare'].includes(m.kind)) patch(mat, 'jet-' + m.kind, paintParts(m.kind, C));
      else if (m.name === 'Katy_hotsteel' || m.name === 'Katy_dark') {
        // the jet pipe: the metal glows a dull orange as the engine runs up
        patch(mat, 'jet-hot', { fragPars: 'uniform float uHeat;', emissive: 'totalEmissiveRadiance += vec3( 1.0, 0.30, 0.06 ) * uHeat;' }, { uHeat: this.uHeat });
      } else if (/Lamp|RedGlass|GreenGlass|AmberGlass/.test(m.name)) {
        patch(mat, 'jet-lamp', { fragPars: 'uniform float uLamp;', emissive: 'totalEmissiveRadiance += diffuseColor.rgb * uLamp;' }, { uLamp: this.uLamp });
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
    this.pilot.userData.head.rotation.z = c.look * 0.6;                           // the pilot looks into the turn
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

/* ------------------------------------------------------------------ the pilot: enough to read as a person through the canopy */
function buildPilot() {
  const g = new THREE.Group(); g.name = 'pilot';
  const mat = (color, rough, metal = 0) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), 'jet-std', {});
  const suit = mat(0x3a4030, 0.85), vest = mat(0xb8791c, 0.8), white = mat(0xd9d6cc, 0.32), dark = mat(0x0b0c0d, 0.25), strap = mat(0x15140f, 0.7), skin = mat(0x9a6a50, 0.6), hose = mat(0x1b1c1c, 0.55);
  const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const sph = new THREE.SphereGeometry(1, 28, 20);
  // torso and shoulders (Blender axes: x aft, y starboard, z up); seat back is at about x = 2.13
  add(sph, suit, 2.06, 0, 1.36, 0.125, 0.175, 0.22);
  add(sph, vest, 2.035, 0, 1.40, 0.105, 0.150, 0.150);
  add(sph, suit, 2.06, 0.19, 1.50, 0.075, 0.07, 0.075); add(sph, suit, 2.06, -0.19, 1.50, 0.075, 0.07, 0.075);
  const arm = new THREE.CapsuleGeometry(0.048, 0.30, 6, 14); arm.rotateX(Math.PI / 2);
  // upper arms down and forward, forearms in to the stick and out to the throttle
  const limb = (x0, y0, z0, x1, y1, z1, r = 1) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), o = new THREE.Mesh(arm, suit);
    o.position.copy(a).add(b).multiplyScalar(0.5); o.scale.set(r, r, a.distanceTo(b) / 0.396); o.lookAt(b); o.castShadow = true; g.add(o);
  };
  limb(2.06, 0.20, 1.49, 1.93, 0.21, 1.27); limb(1.93, 0.21, 1.27, 1.80, 0.03, 1.37, 0.85);
  limb(2.06, -0.20, 1.49, 1.92, -0.24, 1.29); limb(1.92, -0.24, 1.29, 1.75, -0.24, 1.38, 0.85);
  add(sph, dark, 1.79, 0.012, 1.385, 0.05, 0.045, 0.055); add(sph, dark, 1.73, -0.24, 1.39, 0.05, 0.045, 0.05);      // gloves
  // straps over the vest
  const band = new THREE.BoxGeometry(0.012, 0.045, 0.30);
  for (const s of [-1, 1]) { const o = add(band, strap, 1.945, s * 0.075, 1.44); o.rotation.y = 0.32; }
  // head: hard helmet with ear cups, goggles, oxygen mask and its hose down to the chest
  const head = new THREE.Group(); head.position.set(2.035, 0, 1.745); g.add(head); g.userData.head = head;
  add(sph, white, 0.012, 0, 0.012, 0.118, 0.108, 0.112, head);
  add(sph, white, 0.02, 0.098, -0.03, 0.05, 0.026, 0.056, head); add(sph, white, 0.02, -0.098, -0.03, 0.05, 0.026, 0.056, head);
  add(sph, skin, -0.035, 0, -0.022, 0.085, 0.082, 0.092, head);
  add(sph, dark, -0.078, 0, 0.004, 0.045, 0.082, 0.034, head);
  add(sph, hose, -0.098, 0, -0.058, 0.042, 0.05, 0.048, head);
  add(sph, suit, 2.045, 0, 1.615, 0.06, 0.062, 0.07);                    // neck and collar
  const pipe = (x0, y0, z0, x1, y1, z1) => { const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), o = new THREE.Mesh(arm, hose); o.position.copy(a).add(b).multiplyScalar(0.5); o.scale.set(0.36, 0.36, a.distanceTo(b) / 0.396); o.lookAt(b); o.castShadow = true; g.add(o); };
  pipe(1.935, 0.01, 1.66, 1.925, 0.05, 1.55); pipe(1.925, 0.05, 1.55, 1.95, 0.085, 1.46);
  return g;
}

async function fetchLod(lod, base) {
  return Promise.all([fetch(base + 'jet-' + lod + '.json').then((r) => { if (!r.ok) throw new Error('jet model: http ' + r.status); return r.json(); }), fetchBin(base + 'jet-' + lod + '.bin.gz')]);
}
export async function loadJet(lod = 'hi', base = './assets/jet/') {
  const jet = new Jet(), [man, buf] = await fetchLod(lod, base);
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
