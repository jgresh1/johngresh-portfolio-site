// ad1.js — the second aircraft: NASA's AD-1 oblique-wing research jet (N805NA, flown 1979 to 1982), from the
// Blender model in Desktop/ad1_studio (tools/export_ad1.py). It is not part of the first load: the menu asks for it.
//
// It goes into the same holder as the Katy (jet.js `Jet.addModel`), so everything that moves, lights and films "the
// aircraft" works on it unchanged. What is its own: the whole wing turns on a pivot (`sweep`, up to 60 degrees, right
// tip forward) with the ailerons riding on it; the white paint with the blue band and gold lines, laid out by
// numbers stored at each point of the body; and its pilot, who is part of the model.
// The file keeps Blender's axes (X aft of the nose cone's tip, Y starboard, Z up from the ground).
import * as THREE from 'three';
import { patch } from '../atmo.js';
import { grab, fetchBin, clearMaterial, NOISE } from './jet.js';
import { shadowProxies } from './merge.js';

const MODEL_V = 1;            // change when tools/export_ad1.py's output does: browsers keep the model for a day
const D2R = Math.PI / 180;
const LIMIT = { ail: 20, elev: 20, rud: 22, sweep: 60 };      // degrees
export const AD1_VIEW = { dist: 19, height: 3.3, min: 10.5, size: 1.9 };      // the chase camera's arm for an aircraft 11.8 m long
export const AD1_BYTES = { hi: 3.97e6, lo: 1.61e6 };          // for the progress read-out where the server gives no length

const f = (v) => Number(v).toFixed(5);
const v3 = (c) => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
const PARS = NOISE + /* glsl */`
// a joint: a line w metres wide where d is zero. Finer than a pixel it is thinned to the share of the pixel it covers.
float aline(float d, float w){ float px = max(fwidth(d), 1e-6), a = abs(d); return clamp((min(a + 0.5 * px, 0.5 * w) - max(a - 0.5 * px, -0.5 * w)) / px, 0.0, 1.0); }
// distance to the edge of a rectangle with rounded corners (negative inside)
float arrect(vec2 p, vec2 c, vec2 h, float r){ vec2 q = abs(p - c) - (h - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;
const BASE = { vertPars: 'varying vec3 vKp;', vert: 'vKp = position;', fragPars: 'varying vec3 vKp;' + PARS };
// a glass-fibre skin under gloss paint: clean, with a slow unevenness in its sheen; joints are dark, dull lines
const SHEEN = (seam) => `roughnessFactor = clamp( roughnessFactor + 0.06 * ( kfbm( vKp * 1.4 ) - 0.5 )${seam ? ' + 0.4 * ' + seam : ''}, 0.05, 1.0 );`;

// The canopy is long and lies nearly flat, so most of it is seen at a glancing angle, from outside and from the
// seat alike. Glass hides and mirrors most at such angles; left at that, the pilot's own view ahead was a white veil.
// The inner face (what the pilot looks through, and the far side seen through the near one) takes a quarter of it.
// And the page's sky is several times brighter against sunlit paint than a real one, which is right for the picture
// as a whole but turned everything under the canopy blue: the mirror image is shown at a third of its strength.
const CANOPY = {
  fragPars: 'uniform vec2 uGlass;',
  color: /* glsl */`
    float kFr = pow( 1.0 - abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ), 5.0 );
    diffuseColor.a = mix( uGlass.x, uGlass.y, kFr ) * ( gl_FrontFacing ? 1.0 : 0.22 );`,
  final: 'gl_FragColor.rgb *= gl_FrontFacing ? 0.30 : 0.08;',
};
// The glass over each dial faces the pilot and would mirror the open sky behind him; there is a seat and a
// bulkhead there in truth, so it shows a faint sheen and no more. The visor is a dark mirror under the canopy.
const LENS = {
  fragPars: 'uniform vec2 uGlass;',
  color: /* glsl */`
    float kFr = pow( 1.0 - abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ), 3.0 );
    diffuseColor.a = mix( uGlass.x, uGlass.y, kFr );`,
  final: 'gl_FragColor.rgb *= 0.25;',
};
// what sits under the canopy or down in the tub is lit by the sun and by a part of the sky, not all of it
const INSIDE = /Cockpit|Panel|Shroud|Dial|Ink|Seat|Leather|Grip|Lens|Wire|Alu|[Ss]uit|Knit|Webbing|Strap|Glove|Shirt|Liner|Skin|Mask|Hose|Boot|EdgeRoll|Brass|Yellow/;
// gloss so dark it is all reflection: under the canopy it mirrors a dim cockpit and a strip of sky, not the whole sky
const DARK_GLOSS = /Helmet|Visor/;

function paintParts(kind, C) {
  const JOINT = v3(C.JOINT), p = { ...BASE };
  const joint = (s) => `diffuseColor.rgb = mix( diffuseColor.rgb, ${JOINT}, ${s} * ${f(C.SEAM_DARK)} );`;
  if (kind === 'body') {
    // the blue band and its two gold lines: each point knows how far it is from the band's upper and lower edge.
    // Past the band's tip the two edges cross over, which leaves the gold lines running together to a point.
    const S = C.SEAMS, P = C.PANEL;
    p.vertPars += 'attribute float band_hi; attribute float band_lo; attribute float dorsal; varying float vBh; varying float vBl; varying float vDo;';
    p.vert += 'vBh = band_hi; vBl = band_lo; vDo = dorsal;';
    p.fragPars += 'varying float vBh; varying float vBl; varying float vDo;';
    p.color = /* glsl */`
      float bBlue = ( 1.0 - kaa( 0.0, vBh ) ) * kaa( 0.0, vBl );
      float bGold = ( 1.0 - kaa( ${f(C.STRIPE)}, vBh ) ) * kaa( ${f(-C.STRIPE)}, vBl ) * ( 1.0 - bBlue );
      diffuseColor.rgb = mix( mix( diffuseColor.rgb, ${v3(C.BLUE)}, bBlue ), ${v3(C.GOLD)}, bGold );
      float bD = min( min( abs( vKp.x - ${f(S[0])} ), abs( vKp.x - ${f(S[1])} ) ), min( abs( vKp.x - ${f(S[2])} ), abs( vKp.x - ${f(S[3])} ) ) );
      float bSeam = aline( bD, ${f(C.SEAM)} );
      bSeam = max( bSeam, aline( vDo, ${f(C.SEAM)} ) * step( ${f(C.DORSAL_X[0])}, vKp.x ) * step( vKp.x, ${f(C.DORSAL_X[1])} ) );
      bSeam = max( bSeam, aline( arrect( vKp.xz, vec2( ${f((P.x0 + P.x1) / 2)}, ${f((P.z0 + P.z1) / 2)} ), vec2( ${f((P.x1 - P.x0) / 2)}, ${f((P.z1 - P.z0) / 2)} ), ${f(P.r)} ), ${f(C.SEAM)} ) * step( 0.15, abs( vKp.y ) ) );
      ${joint('bSeam')}`;
    p.rough = SHEEN('bSeam');
  } else if (kind === 'wing') {
    // the panel over the pivot, drawn on the wing's top
    const P = C.WING_PANEL;
    p.vertPars += 'varying vec3 vKn;'; p.vert += 'vKn = normal;'; p.fragPars += 'varying vec3 vKn;';
    p.color = /* glsl */`
      float wSeam = aline( arrect( vKp.xy, vec2( ${f(P.x)}, 0.0 ), vec2( ${f(P.hx)}, ${f(P.hy)} ), ${f(P.r)} ), ${f(C.SEAM)} ) * step( 0.2, vKn.z );
      ${joint('wSeam')}`;
    p.rough = SHEEN('wSeam');
  } else if (kind === 'pod') {
    // two joints round each engine drum and the small plate low on its outer side
    const P = C.POD;
    p.color = /* glsl */`
      float pAng = atan( vKp.z - ${f(P.z)}, abs( vKp.y ) - ${f(P.y)} );
      float pSeam = max( aline( min( abs( vKp.x - ${f(P.seams[0])} ), abs( vKp.x - ${f(P.seams[1])} ) ), ${f(C.SEAM)} ),
        aline( arrect( vec2( vKp.x, pAng * ${f(P.r)} ), vec2( ${f(P.door_x)}, ${f(P.door_a * P.r)} ), vec2( ${f(P.door_hx)}, ${f(P.door_ha * P.r)} ), 0.006 ), ${f(C.SEAM * 0.8)} ) );
      ${joint('pSeam')}`;
    p.rough = SHEEN('pSeam');
  } else p.rough = SHEEN('');
  return p;
}

// one level of detail of the AD-1: its meshes, its moving parts, its pilot
class AD1Model {
  constructor(man, buf, lod, jet) {
    this.lod = lod; this.frame = man.frame;
    this.model = new THREE.Group(); this.model.name = 'ad1-' + lod;
    // Blender (aft, starboard, up) -> body (starboard, up, aft), about its own balance point
    const cg = man.frame.cg;
    this.toBody = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)).multiply(new THREE.Matrix4().makeTranslation(-cg[0], -cg[1], -cg[2]));
    this.model.matrix.copy(this.toBody); this.model.matrixAutoUpdate = false;
    this.eye = new THREE.Vector3().fromArray(man.frame.eye).applyMatrix4(this.toBody);
    this.materials = []; this.glass = [];
    this.uHeat = jet.uHeat; this.uLamp = jet.uLamp;
    // a part hangs from the model, or from another part (the ailerons from the wing)
    this.parts = {};
    for (const [name, p] of Object.entries(man.parts)) {
      this.parts[name] = { pivot: new THREE.Group(), at: new THREE.Vector3().fromArray(p.p), axis: new THREE.Vector3().fromArray(p.a).normalize(), sign: p.sign || 1, radius: p.radius || 0, parent: p.parent || null };
    }
    for (const p of Object.values(this.parts)) {
      const up = p.parent ? this.parts[p.parent] : null;
      p.pivot.position.copy(p.at); if (up) p.pivot.position.sub(up.at);
      (up ? up.pivot : this.model).add(p.pivot);
    }
    this.pilot = new THREE.Group(); this.pilot.name = 'pilot'; this.model.add(this.pilot);
    const [b0, b1] = man.bbox, sx = (b1[0] - b0[0]) / 65535, sy = (b1[1] - b0[1]) / 65535, sz = (b1[2] - b0[2]) / 65535;
    const mats = man.materials.map((m) => this.material(m, man.consts));
    for (const g of man.groups) {
      const q = new Uint16Array(buf, g.pos, g.verts * 3), pos = new Float32Array(g.verts * 3);
      for (let i = 0; i < g.verts; i++) { pos[i * 3] = b0[0] + q[i * 3] * sx; pos[i * 3 + 1] = b0[1] + q[i * 3 + 1] * sy; pos[i * 3 + 2] = b0[2] + q[i * 3 + 2] * sz; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(buf, g.nor, g.verts * 3), 3, true));
      for (const [an, off] of Object.entries(g.att || {})) geo.setAttribute(an, new THREE.BufferAttribute(new Float32Array(buf, off, g.verts), 1));
      geo.setIndex(new THREE.BufferAttribute(g.i32 ? new Uint32Array(buf, g.idx, g.tris * 3) : new Uint16Array(buf, g.idx, g.tris * 3), 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const info = man.materials[g.m], mesh = new THREE.Mesh(geo, mats[g.m]);
      mesh.name = info.name + (g.part ? ':' + g.part : '');
      const clear = ['glass', 'thin', 'visor'].includes(info.kind);
      mesh.castShadow = !clear && !info.decal; mesh.receiveShadow = !clear;
      if (clear) { mesh.renderOrder = info.kind === 'glass' ? 20 : 19; this.glass.push(mesh); }       // what is under the canopy is drawn before the canopy
      if (g.part) { const p = this.parts[g.part]; mesh.position.copy(p.at).negate(); p.pivot.add(mesh); }
      else (g.pilot ? this.pilot : this.model).add(mesh);
    }
    this.tris = man.groups.reduce((s, g) => s + g.tris, 0);
    // drawn in the aircraft's own pass (layer 1) only; its shadow is cast by stand-ins, one for each group of parts
    // that moves together (merge.js says why)
    shadowProxies(this.model, Object.values(this.parts).map((p) => p.pivot));
    this.model.traverse((o) => { if (!o.isShadowProxy) o.layers.set(1); });
  }

  material(m, C) {
    let mat;
    const key = 'jet-ad1-' + m.kind, col = new THREE.Color().setRGB(m.color[0], m.color[1], m.color[2]);
    if (m.kind === 'glass') { mat = clearMaterial(key, new THREE.Vector2(0.05, 0.60), 0x0b0e10, CANOPY); mat.clearcoat = 0; }      // one skin of acrylic, not two
    else if (m.kind === 'thin') mat = clearMaterial(key, new THREE.Vector2(0.03, 0.4), 0x0b0e10, LENS);
    else if (m.kind === 'visor') { mat = clearMaterial(key, new THREE.Vector2(0.90, 0.985), 0x050506); mat.roughness = 0.24; mat.clearcoat = 0.25; mat.clearcoatRoughness = 0.18; }      // smoke polycarbonate: a dark mirror
    else {
      const p = { color: col, metalness: m.metal, roughness: m.rough, side: THREE.DoubleSide };
      mat = m.coat > 0 ? new THREE.MeshPhysicalMaterial({ ...p, clearcoat: m.coat, clearcoatRoughness: m.kind === 'helmet' ? 0.03 : 0.05 }) : new THREE.MeshStandardMaterial(p);
      if (m.decal) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; }
      if (['body', 'wing', 'pod', 'white'].includes(m.kind)) patch(mat, key, paintParts(m.kind, C));
      else if (m.kind === 'cloth') patch(mat, key, { ...BASE, color: 'diffuseColor.rgb *= 0.84 + 0.30 * kfbm( vKp * 26.0 );' });       // woven cloth is never one even tone
      else if (m.kind === 'tyre') {
        // rubber with dust settled on it unevenly
        patch(mat, key, { ...BASE, color: 'float tD = pow( kfbm( vKp * 34.0 ), 2.8 ) * 0.8; diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.070, 0.062, 0.052 ), tD );',
          rough: 'roughnessFactor = clamp( roughnessFactor + 0.5 * tD, 0.2, 1.0 );' });
      } else if (m.kind === 'pipe') {
        // the jet pipes: steel that has run hot, straw to bronze with a little purple
        patch(mat, key, { ...BASE, color: /* glsl */`float pN = kfbm( vKp * 9.0 );
          vec3 pC = mix( vec3( 0.30, 0.17, 0.085 ), vec3( 0.46, 0.30, 0.14 ), smoothstep( 0.30, 0.50, pN ) );
          pC = mix( pC, vec3( 0.34, 0.20, 0.11 ), smoothstep( 0.50, 0.62, pN ) );
          diffuseColor.rgb = mix( pC, vec3( 0.20, 0.13, 0.17 ), smoothstep( 0.62, 0.74, pN ) );`,
        rough: 'roughnessFactor = clamp( roughnessFactor + 0.14 * ( kfbm( vKp * 45.0 ) - 0.5 ), 0.1, 1.0 );' });
      } else if (m.kind === 'soot') {
        // inside each pipe: it glows a little with the engines running, more the further in
        const P = C.POD;
        patch(mat, key, { ...BASE, fragPars: BASE.fragPars + 'uniform float uHeat;',
          emissive: `totalEmissiveRadiance += vec3( 1.0, 0.34, 0.08 ) * uHeat * 0.9 * ( 1.0 - smoothstep( ${f(P.x1 - 0.30)}, ${f(P.x1 + 0.02)}, vKp.x ) );` }, { uHeat: this.uHeat });
      } else patch(mat, key, {});
    }
    mat.name = m.name; mat.envMapIntensity = 1.0;
    if (INSIDE.test(m.name)) mat.userData.envK = 0.45;
    if (DARK_GLOSS.test(m.name)) mat.userData.envK = 0.22;
    this.materials.push(mat);
    return mat;
  }

  turn(name, deg) {
    const p = this.parts[name]; if (!p) return;
    p.pivot.quaternion.setFromAxisAngle(p.axis, deg * D2R * p.sign);
  }

  // put the wing, the control surfaces and the wheels where the smoothed commands `c` say
  apply(c) {
    this.turn('wing', (c.sweep || 0) * LIMIT.sweep);
    this.turn('ail_R', -c.ail * LIMIT.ail); this.turn('ail_L', c.ail * LIMIT.ail);
    const e = -c.elev * LIMIT.elev;
    this.turn('elev_R', e); this.turn('elev_L', e);
    this.turn('rudder', c.rud * LIMIT.rud);
    for (const n of ['wheel_N', 'wheel_L', 'wheel_R']) {
      const p = this.parts[n]; if (!p) continue;
      p.pivot.quaternion.setFromAxisAngle(p.axis, ((c.rolled / p.radius) * p.sign) % (Math.PI * 2));
    }
  }
}

// Fetch the AD-1 at one level of detail and add it to the aircraft holder under the name returned. It is not shown
// until `jet.use(name)`. Downloads cannot hang (jet.js `grab`); `onProgress(bytes so far, bytes in all or 0)`.
export async function loadAD1(jet, lod = 'hi', onProgress, base = './assets/ad1/') {
  const key = 'ad1-' + lod;
  if (jet.has(key)) return key;
  const [man, buf] = await Promise.all([grab(base + 'ad1-' + lod + '.json?v=' + MODEL_V).then((b) => JSON.parse(new TextDecoder().decode(b))), fetchBin(base + 'ad1-' + lod + '.bin.gz?v=' + MODEL_V, onProgress)]);
  jet.addModel(key, new AD1Model(man, buf, lod, jet));
  return key;
}
