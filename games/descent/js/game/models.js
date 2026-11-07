// Game creature models: fish + hero geometry sets and their INSTANCED materials. The skin shaders are the same ones the ambient
// schools / heroes use (fauna/fish.js, fauna/heroes.js); only the vertex side differs: position and heading come from the instance
// matrix (written by the game's CPU simulation) and the swimming animation from per-instance data.
//   aAnim = (tail phase [rad], swim amplitude, turn lean, flash)     aHint = (r, g, b, strength)  rim glow: green food / red danger
import * as THREE from 'three';
import { uw } from '../optics.js';
import { fishGeometry } from '../fauna/fishgen.js';
import { patchFishFragment } from '../fauna/fish.js';
import { sharkGeometry, mantaGeometry, turtleGeometry, HERO_FRAG, ANIM } from '../fauna/heroes.js';
import { squidGeometry } from '../fauna/deepfauna.js';
import { hashStr } from '../flora/geom.js';

// ---------------------------------------------------------------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------------------------------------------------------------
export function fishLODs(vis, seedKey) {
  const seed = hashStr(seedKey) % 1000, g = vis.geo, st = g.stations ?? 30, rad = g.radial ?? 16;
  return [
    fishGeometry({ ...g, seed }, true),
    fishGeometry({ ...g, seed, stations: Math.max(10, Math.round(st * 0.47)), radial: Math.max(8, Math.round(rad * 0.56)), finDetail: 0.5 }, true),
    fishGeometry({ ...g, seed, stations: Math.max(8, Math.round(st * 0.27)), radial: 6, finDetail: 0.25 }, true),
  ];
}

export function heroGeometry(vis) {
  switch (vis.kind) {
    case 0: return sharkGeometry({ hammer: vis.variant === 2 });
    case 1: return mantaGeometry();
    case 2: return turtleGeometry();
    case 3: return squidGeometry();
    default: return sharkGeometry();
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// shared GLSL
// ---------------------------------------------------------------------------------------------------------------------------------
const FRAG_DECL = 'varying vec4 vHint; varying float vFlash;';
const HINT_GLSL = /* glsl */`
{
  // edible / dangerous outline: a rim glow in the creature's hint colour, plus a red-white flash when hurt
  float nvH = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
  float rimH = pow( 1.0 - nvH, 2.4 );
  totalEmissiveRadiance += vHint.rgb * vHint.a * ( 0.05 + 1.15 * rimH );
  totalEmissiveRadiance += vec3( 1.0, 0.30, 0.22 ) * clamp( vFlash, 0.0, 1.0 ) * ( 0.35 + 0.9 * rimH );
}`;

const FISH_DECL = /* glsl */`
attribute vec4 aInfo;
attribute vec4 aAnim;
attribute vec4 aSeed;
attribute vec4 aHint;
varying vec4 vInfo; varying vec3 vObjP; varying vec3 vObjN; varying vec4 vSeed; varying vec4 vHint; varying float vFlash;
uniform float uBend;
`;
const FISH_BEGIN = /* glsl */`
vInfo = aInfo; vObjP = position; vObjN = normal; vSeed = aSeed; vHint = aHint; vFlash = aAnim.w;
float tA = clamp( 0.5 - position.x, 0.0, 1.35 );
float ph = aAnim.x - tA * 5.2;
float amp = uBend * aAnim.y * ( 0.06 + 0.9 * tA * tA );
vec3 transformed = position;
transformed.z += amp * sin( ph ) * ( aInfo.y > 5.5 && aInfo.y < 6.5 ? 0.4 : 1.0 );
transformed.z += aAnim.z * tA * tA * 0.34;
if ( aInfo.y > 2.5 && aInfo.y < 4.5 ) transformed.z += 0.014 * sin( ph * 1.3 + 3.0 ) * aInfo.w * sign( position.z );
if ( aInfo.y > 0.5 && aInfo.y < 2.5 ) transformed.z += 0.006 * sin( ph * 2.0 - aInfo.w * 6.0 ) * aInfo.z;
`;

export function fishUniforms(vis, len) {
  const V3 = (a) => new THREE.Vector3(...a);
  return {
    uLen: { value: len }, uBend: { value: vis.bend ?? 0.1 },
    uColA: { value: V3(vis.colA) }, uColB: { value: V3(vis.colB) }, uColC: { value: V3(vis.colC) }, uColD: { value: V3(vis.colD) }, uFinCol: { value: V3(vis.finCol) },
    uPat: { value: new THREE.Vector4(vis.pattern, vis.irid || 0, vis.sheen ?? 0.3, vis.finSolid ?? 0.3) },
    uPat2: { value: new THREE.Vector4(...(vis.pat2 ?? [0, 0.5, 0, 0.0])) },
  };
}

export function makeFishMaterial(kind, uniforms, glass = false) {
  const fins = kind === 'fins';
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.0, side: THREE.DoubleSide, transparent: fins || glass, depthWrite: true });
  uw(mat, 'gfish_' + kind + (glass ? 'G' : ''), (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + FISH_DECL)
      .replace('#include <begin_vertex>', FISH_BEGIN);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL);
    patchFishFragment(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + HINT_GLSL);
  });
  return mat;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// hero animals (sharks, ray, turtle, squid): the animation snippets are the ones from fauna/heroes.js, driven by aAnim.x as time
// ---------------------------------------------------------------------------------------------------------------------------------
const HERO_DECL = /* glsl */`
attribute vec4 aInfo;
attribute vec4 aAnim;
attribute vec4 aHint;
varying vec4 vInfo; varying vec3 vObjP; varying vec3 vObjN; varying vec4 vHint; varying float vFlash;
uniform float uFreq, uAmp;
`;

export function heroUniforms(vis) {
  return { uKind: { value: vis.kind }, uVar: { value: vis.variant || 0 }, uFreq: { value: vis.freq }, uAmp: { value: vis.amp } };
}

export function makeHeroMaterial(kind, uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
  mat.alphaToCoverage = true;
  uw(mat, 'ghero' + kind, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + HERO_DECL)
      .replace('#include <begin_vertex>', `
        vInfo = aInfo; vObjP = position; vObjN = normal; vHint = aHint; vFlash = aAnim.w;
        float tw = aAnim.x;
        vec3 transformed = position;
        ${ANIM[kind]}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <lights_pars_begin>', HERO_FRAG + '\n#include <lights_pars_begin>')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = heroSurface( vInfo, vObjP, normalize( vObjN ), length( vViewPosition ) );
        diffuseColor.a = fAlpha;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = fRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += fEm;\n' + HINT_GLSL)
      .replace('#include <alphatest_fragment>', '');
  });
  return mat;
}
