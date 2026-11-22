// engine.js — what is inside the jet pipe, built so that a camera can look straight up it.
// The Katy's engine is a Turbomeca Palas, a very small turbojet: its tail pipe is 16 cm across. Looking in from
// behind you see, from the lip inwards: the pipe's liner, sooted and heat-stained; the exhaust cone on its four
// struts; and behind them the turbine wheel. Nothing glows at idle. With the engine run up, the deepest metal
// (the turbine and the root of the cone) shows a dull red, the way it does on a real engine at dusk.
// Geometry is in the aircraft's own axes (X aft, Y starboard, Z up); the pipe's centre line is y = 0, z = 1.195.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch } from '../atmo.js';

// The pipe modelled in Blender (JetPipe) has an inner wall 70 mm in radius at its root and 74 mm at the lip; the liner
// here sits just inside that. The fuselage's end cap and the fin's base pass through the bore: jet.js cuts them away.
export const ZC = 1.198, X0 = 4.306, X1 = 4.600, R0 = 0.0690, R1 = 0.0730;           // back wall, lip, liner radius at each
export const BORE = 0.0745;

// colour and glow by depth: `d` is 0 at the lip and 1 at the turbine
const HOT = (tint) => ({
  vertPars: 'varying vec3 vKp;', vert: 'vKp = position;',
  fragPars: `varying vec3 vKp; uniform float uHeat;
    float eh( vec3 p ) { p = fract( p * 0.3183 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }`,
  color: /* glsl */`
    float eD = clamp( ( ${X1.toFixed(3)} - vKp.x ) / ${(X1 - X0).toFixed(3)}, 0.0, 1.0 );
    float eA = atan( vKp.z - ${ZC.toFixed(3)}, vKp.y );
    float eN = apNoise( vec2( eA * 5.0, vKp.x * 60.0 ) ) * 0.6 + apNoise( vec2( eA * 23.0, vKp.x * 240.0 ) ) * 0.4;
    // stainless that has been hot: straw at the lip, then purple, then blue, then grey under soot
    vec3 eTint = mix( vec3( 0.50, 0.40, 0.24 ), vec3( 0.30, 0.20, 0.30 ), smoothstep( 0.02, 0.10, eD ) );
    eTint = mix( eTint, vec3( 0.16, 0.20, 0.30 ), smoothstep( 0.08, 0.20, eD ) );
    eTint = mix( eTint, vec3( 0.20, 0.19, 0.18 ), smoothstep( 0.18, 0.34, eD ) );
    vec3 eSoot = vec3( 0.035, 0.032, 0.03 );
    float eS = clamp( smoothstep( 0.22, 0.75, eD ) * ( 0.55 + 0.6 * eN ) + ${tint.toFixed(2)}, 0.0, 1.0 );
    diffuseColor.rgb = mix( eTint * ( 0.8 + 0.4 * eN ), eSoot, eS ) * ( 1.0 - 0.55 * eD );          // and it gets dark down there`,
  rough: 'roughnessFactor = mix( 0.34, 0.85, eS );',
  metal: 'metalnessFactor = mix( 0.9, 0.2, eS );',
  emissive: 'totalEmissiveRadiance += vec3( 1.0, 0.17, 0.022 ) * uHeat * pow( eD, 3.2 ) * ( 0.6 + 0.8 * eN ) * 1.15;',
});

export function buildExhaust(uHeat) {
  const g = new THREE.Group(); g.name = 'exhaust';
  const mat = (key, tint, side = THREE.FrontSide) => patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.8, side }), 'jet-' + key, HOT(tint), { uHeat });
  const mLiner = mat('liner', 0.0, THREE.BackSide), mMetal = mat('hotmetal', 0.05, THREE.DoubleSide), mTurb = mat('turbine', 0.2, THREE.DoubleSide);
  // everything is turned about the pipe's axis: build along +Y (lathe axis), then lay it along X
  const lay = (geo) => geo.rotateZ(-Math.PI / 2).translate(0, 0, ZC);            // lathe y -> aircraft x
  const lathe = (pts, seg = 72) => lay(new THREE.LatheGeometry(pts.map(([x, r]) => new THREE.Vector2(r, x)), seg));
  // liner, with the lip rolled over and the back wall
  const liner = lathe([[X0, 0.001], [X0, R0], [4.45, lerp(R0, R1, 0.49)], [X1 - 0.006, R1], [X1 + 0.002, R1 + 0.0012], [X1 + 0.0045, R1 + 0.004], [X1 + 0.004, R1 + 0.0068]]);
  const m1 = new THREE.Mesh(liner, mLiner); g.add(m1);
  // exhaust cone: an ogive from just behind the turbine to a rounded tip short of the lip
  const cone = []; for (let i = 0; i <= 26; i++) { const t = i / 26, x = lerp(4.352, 4.566, t); cone.push([x, 0.0395 * Math.pow(1 - Math.pow(t, 1.7), 0.62) + 0.0012]); }
  cone.push([4.5675, 0.0001]);
  const parts = [lathe(cone, 48)];
  // four struts carrying the cone: thin, with a rounded leading edge towards the turbine
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, s = new THREE.BoxGeometry(0.072, 0.0042, 0.040, 6, 1, 1);
    const p = s.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / 0.036; p.setY(i, p.getY(i) * Math.sqrt(Math.max(0.08, 1 - x * x * 0.85))); }
    s.translate(4.428, 0, 0.0515); s.rotateX(a); s.translate(0, 0, ZC); s.computeVertexNormals(); parts.push(s);
  }
  g.add(new THREE.Mesh(mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p), false), mMetal));
  // turbine wheel: hub, and 31 blades set at an angle, seen between the struts
  const tp = [lay(new THREE.CylinderGeometry(0.0405, 0.0405, 0.02, 40).translate(0, 4.330, 0))];
  for (let k = 0; k < 31; k++) {
    const a = (k / 31) * Math.PI * 2, b = new THREE.BoxGeometry(0.02, 0.0020, 0.0285, 1, 1, 3);
    const p = b.attributes.position; for (let i = 0; i < p.count; i++) { const r = p.getZ(i) / 0.01425, tw = 0.5 + 0.32 * r, x = p.getX(i), y = p.getY(i); p.setX(i, x * Math.cos(tw) - y * Math.sin(tw)); p.setY(i, x * Math.sin(tw) + y * Math.cos(tw)); }
    b.translate(4.336, 0, 0.0545); b.rotateX(a); b.translate(0, 0, ZC); b.computeVertexNormals(); tp.push(b);
  }
  g.add(new THREE.Mesh(mergeGeometries(tp.map((p) => p.index ? p.toNonIndexed() : p), false), mTurb));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  g.userData.materials = [mLiner, mMetal, mTurb];
  return g;
}
const lerp = (a, b, t) => a + (b - a) * t;
