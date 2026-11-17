// studio.js — the car's "blank" environment for the opening film: softbox reflections, shadowed softbox lights,
// a baked floor shadow and a glossy floor that can turn into wet asphalt. Real time only (no accumulation).
import * as THREE from 'three';
import * as TX from '../car/tex.js';
import { halton } from '../car/geo.js';

// In the studio (the only scene without fog) image-based light gives reflections but little diffuse fill, and the
// sampled softbox lights add diffuse light only: their mirror images are already in the environment map.
// On the circuit (fog on) both chunks behave as stock three.js.
{ const C = THREE.ShaderChunk;
  C.envmap_physical_pars_fragment = C.envmap_physical_pars_fragment.replace('return PI * envMapColor.rgb * envMapIntensity;',
    '#ifdef USE_FOG\n\t\t\treturn PI * envMapColor.rgb * envMapIntensity;\n\t\t#else\n\t\t\treturn PI * envMapColor.rgb * envMapIntensity * 0.22;\n\t\t#endif');
  const k = 'lights_physical_pars_fragment', a = 'clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat(', b = 'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;';
  if (C[k].includes(a) && C[k].includes(b)) C[k] = '#ifdef USE_FOG\n#define DIRECT_SPEC 1.0\n#else\n#define DIRECT_SPEC 0.0\n#endif\n' + C[k].replace(a, 'clearcoatSpecularDirect += DIRECT_SPEC * ccIrradiance * BRDF_GGX_Clearcoat(').replace(b, 'reflectedLight.directSpecular += DIRECT_SPEC * irradiance * specularBRDF * material.multiScatteringCompensation;');
  else console.warn('studio: direct specular patch not applied'); }

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const AIM = new THREE.Vector3(0.1, 0.4, 0);
const CAR_BOX = new THREE.Box3(new THREE.Vector3(-2.8, 0, -1.03), new THREE.Vector3(3.1, 1.02, 1.03));
const BOXES = [
  { name: 'top', c: [0.1, 4.1, 0], u: [3.7, 0, 0], v: [0, 0, 1.55], emit: 2.7, I: 3.1, tint: [1, 1, 1.02], up: [1, 0, 0], map: 2048 },
  { name: 'left', c: [0.0, 1.75, 4.7], u: [3.4, 0, 0], v: [0, 0.6, 0.14], emit: 4.4, I: 1.15, tint: [1.0, 0.985, 0.955], up: [0, 1, 0], map: 2048 },
  { name: 'right', c: [0.0, 1.75, -4.7], u: [3.4, 0, 0], v: [0, 0.6, -0.14], emit: 4.4, I: 1.15, tint: [0.955, 0.985, 1.0], up: [0, 1, 0], map: 2048 },
  { name: 'front', c: [7.4, 1.9, 0], u: [0, 0, 1.6], v: [0, 0.85, 0], emit: 4.5, I: 0.55, tint: [1, 1, 1], up: [0, 1, 0], map: 1024 },
];
const KICKERS = [
  { c: [-6.6, 1.5, 3.0], w: 0.55, h: 2.4, emit: 7 }, { c: [-6.6, 1.5, -3.0], w: 0.55, h: 2.4, emit: 7 },
  { c: [-7.8, 2.6, 0], w: 3.2, h: 0.5, emit: 3 },
];

function makeEnvironment(renderer, size) {
  const s = new THREE.Scene(), sb = TX.softbox();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.012, 0.014), side: THREE.BackSide })));
  const panel = (w, h, c, emit, tint = [1, 1, 1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: sb, color: new THREE.Color(tint[0] * emit, tint[1] * emit, tint[2] * emit), side: THREE.DoubleSide }));
    m.position.set(c[0], c[1], c[2]); s.add(m); return m;
  };
  for (const b of BOXES) {
    const w = 2 * V(b.u).length(), h = 2 * V(b.v).length(), m = panel(w, h, b.c, b.emit, b.tint);
    if (b.name === 'top') m.rotation.x = Math.PI / 2; else m.lookAt(0, 0.5, 0);
  }
  for (const k of KICKERS) panel(k.w, k.h, k.c, k.emit).lookAt(0, 0.6, 0);
  const fl = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ map: TX.radialGlow('#fff', '#000', 1.6), color: new THREE.Color(0.2, 0.2, 0.21) }));
  fl.rotation.x = -Math.PI / 2; s.add(fl);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 80, { size, position: new THREE.Vector3(0, 0.55, 0) });
  pm.dispose();
  return rt.texture;
}

const FLOOR_VERT = /* glsl */`
  uniform mat4 uReflMat; uniform mat4 uBakeMat;
  varying vec3 vWorld; varying vec4 vRefl; varying vec4 vBake;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz; vRefl = uReflMat * w; vBake = uBakeMat * w;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FLOOR_FRAG = /* glsl */`
  uniform sampler2D tBake, tRefl, tReflH;
  uniform float uE0, uReflK, uRough, uFpx, uWet, uTime, uRun, uBlur, uPools, uReach;
  uniform vec3 uCenter; uniform vec2 uSeed, uReflTexel;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.07 + 13.7) + 0.0625 * vnoise(p * 8.1 + 3.3); }
  varying vec3 vWorld; varying vec4 vRefl; varying vec4 vBake;
  void main() {
    vec2 wp = vWorld.xz + vec2(uRun, 0.0);                 // uRun slides the surface under the car (the launch)
    float r = length(vWorld.xz * vec2(mix(0.72, 0.085, uReach), 1.0));   // for the launch the road runs on to the door
    float pool = pow(smoothstep(7.6, 0.4, length(vWorld.xz * vec2(0.72, 1.0))), 1.7);
    float mott = fbm(wp * 1.15 + 3.7);
    vec3 base = uCenter * (0.05 + 0.95 * pool) * (0.86 + 0.28 * mott);
    // wet asphalt: dark aggregate, standing water in the low spots
    float agg, pud;
    if (uBlur > 0.02) {
      // the road is moving: what the camera records is the surface averaged over the distance it travels in one exposure
      agg = 0.0; pud = 0.0; float jit = hash12(gl_FragCoord.xy + uSeed);
      for (int i = 0; i < FLOOR_TAPS; i++) {
        vec2 q = wp + vec2((float(i) + jit) / float(FLOOR_TAPS) * uBlur, 0.0);
        agg += vnoise(q * 90.0) * 0.6 + vnoise(q * 31.0) * 0.4;
        pud += smoothstep(0.40, 0.58, fbm(q * 0.62 + 21.0) + 0.10 * pool);
      }
      agg /= float(FLOOR_TAPS); pud /= float(FLOOR_TAPS);
    } else {
      agg = vnoise(wp * 90.0) * 0.6 + vnoise(wp * 31.0) * 0.4;
      pud = smoothstep(0.40, 0.58, fbm(wp * 0.62 + 21.0) + 0.10 * pool);
    }
    vec3 wetBase = vec3(0.020, 0.021, 0.024) * (0.55 + 0.9 * agg) * (1.0 - 0.75 * pud) * (0.25 + 0.75 * pool);
    if (uPools > 0.0) {
      // the launch hall: each gantry lights the road under it (12 m apart), smeared along the road by the same exposure
      float kx = 6.2831853 / 12.0, L = max(uBlur, 0.001);
      float pl = 0.5 + 0.5 * (sin(kx * (wp.x + L)) - sin(kx * wp.x)) / (kx * L);
      wetBase += vec3(0.034, 0.035, 0.038) * (0.55 + 0.9 * agg) * (1.0 - 0.6 * pud) * pl * uPools * smoothstep(8.5, 2.5, abs(vWorld.z));
    }
    base = mix(base, wetBase, uWet);
    vec2 buv = vBake.xy / vBake.w * 0.5 + 0.5;
    float vis = 1.0;
    if (uE0 > 0.0 && buv.x > 0.0 && buv.x < 1.0 && buv.y > 0.0 && buv.y < 1.0) {
      vis = clamp(texture2D(tBake, buv).r / uE0, 0.0, 1.0);
      vec2 e = min(buv, 1.0 - buv); vis = mix(1.0, vis, smoothstep(0.0, 0.06, min(e.x, e.y)));
    }
    vec3 col = base * (0.03 + 0.97 * vis);
    vec2 ruv = vRefl.xy / vRefl.w;
    vec3 toCam = cameraPosition - vWorld; float dist = length(toCam);
    float cosT = clamp(toCam.y / dist, 0.0, 1.0);
    vec4 hh = textureLod(tReflH, ruv, 3.4);
    float h = hh.r / max(hh.a, 0.03);
    float path = h / max(cosT, 0.06);
    float rough = uRough * mix(1.0, mix(2.6, 0.22, pud), uWet);
    float rad = rough * (0.55 + 0.95 * fbm(wp * 2.7 + 11.0)) * uFpx * path / (dist + path);
    float lod = clamp(log2(1.0 + rad * 0.45), 0.0, 3.2);
    float ang = hash12(gl_FragCoord.xy + uSeed) * 6.2831853;
    vec2 str = uReflTexel * vec2(1.0, 1.0 + 1.6 * (1.0 - cosT));
    // ripples and the grain of the damp surface bend the mirror image a little
    vec2 wob = (vec2(vnoise(wp * 23.0 + uTime * 0.7), vnoise(wp * 23.0 + 9.0 - uTime * 0.6)) - 0.5) * 0.010 * uWet * mix(1.0, 0.25, pud) * (1.0 - min(1.0, uBlur * 2.0));
    vec4 rc = vec4(0.0);
    for (int i = 0; i < 7; i++) {
      float fi = float(i), rr = sqrt((fi + 0.5) / 7.0) * rad, th = ang + fi * 2.39996;
      rc += textureLod(tRefl, ruv + wob + vec2(cos(th), sin(th)) * rr * str, lod);
    }
    rc /= 7.0;
    float fres = 0.05 + 0.95 * pow(1.0 - cosT, 5.0);
    float reflK = mix(uReflK, 0.16 + 0.62 * pud, uWet);
    col += rc.rgb * reflK * (0.55 + 1.7 * fres) * mix(0.3 + 0.7 * pool, 1.0, uWet);
    float a = smoothstep(14.0, 5.0, r) * smoothstep(mix(0.012, 0.003, uReach), mix(0.10, 0.03, uReach), cosT);
    gl_FragColor = vec4(col, a);
  }`;

/* Water off a spinning tyre, as a camera sees it. Each drop is a quad stretched along the distance it travels while the
   shutter is open: at speed a short bright streak, in slow motion a sharp bead with a rim and one highlight. A drop
   smaller than a pixel keeps its light but not its size. The mist is a handful of large, faint sprites. */
const DROP_VERT = /* glsl */`
  attribute vec3 aVel; attribute vec4 aData;      // aData: radius (m), alpha, corner along (-1 | 1), corner across (-1 | 1)
  uniform float uShutter, uPx;
  varying vec2 vUv; varying float vHalf; varying float vA; varying float vBig;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec2 trav = (modelViewMatrix * vec4(aVel, 0.0)).xy * uShutter;
    float len = length(trav); vec2 d = len > 1e-6 ? trav / len : vec2(1.0, 0.0), n = vec2(-d.y, d.x);
    float dist = max(-mv.z, 0.05), r = max(aData.x, 0.55 * dist / uPx);
    mv.xy += d * (aData.z * (0.5 * len + r) - 0.5 * len) + n * (aData.w * r);
    gl_Position = projectionMatrix * mv;
    vHalf = 0.5 * len / r; vUv = vec2(aData.z * (vHalf + 1.0), aData.w);
    float thin = aData.x / r;
    vA = aData.y * thin * thin / (1.0 + 0.3 * vHalf);
    vBig = clamp((aData.x * uPx / dist - 2.5) / 4.0, 0.0, 1.0) * (1.0 - clamp(vHalf, 0.0, 1.0));
  }`;
const DROP_FRAG = /* glsl */`
  varying vec2 vUv; varying float vHalf; varying float vA; varying float vBig;
  void main() {
    float x = max(abs(vUv.x) - vHalf, 0.0), d2 = x * x + vUv.y * vUv.y;
    if (d2 > 1.0) discard;
    float core = pow(1.0 - d2, 1.4);
    vec3 nrm = vec3(x * sign(vUv.x), vUv.y, sqrt(max(0.0, 1.0 - d2)));
    float hl = pow(max(dot(nrm, normalize(vec3(-0.45, 0.62, 0.64))), 0.0), 48.0);
    float rim = smoothstep(0.55, 1.0, d2) * 0.55 + 0.10;
    vec3 bead = vec3(0.55, 0.62, 0.72) * rim + vec3(3.2, 3.4, 3.8) * hl;
    vec3 c = mix(vec3(3.4, 3.7, 4.2) * core, bead, vBig);
    float a = mix(core, 0.30 + 0.45 * rim, vBig);
    gl_FragColor = vec4(c * vA, a * vA);            // premultiplied
  }`;
const MIST_VERT = /* glsl */`
  attribute vec2 aData;                 // size (m), alpha
  uniform float uPx; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aData.x * uPx / max(-mv.z, 0.05), 1.0, 260.0);
    vA = aData.y;
  }`;
const MIST_FRAG = /* glsl */`
  varying float vA;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p);
    if (d > 1.0) discard;
    gl_FragColor = vec4(vec3(0.34, 0.37, 0.42), pow(1.0 - d, 1.8) * vA);
  }`;

// what the car's paint reflects during the launch: softbox ribs across the road, ring-shaped so that turning the whole
// environment about the car's cross axis makes them sweep over the bodywork, the way gantry lights do at speed
function makeLaunchEnv(renderer, size) {
  const s = new THREE.Scene(), sb = TX.softbox();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.010, 0.010, 0.012), side: THREE.BackSide })));
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6 + 0.2, m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 11).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: sb, color: new THREE.Color(5.2, 5.3, 5.6), side: THREE.DoubleSide }));
    m.position.set(Math.cos(a) * 7, 0.55 + Math.sin(a) * 7, 0); m.rotation.z = a - Math.PI / 2; s.add(m);
  }
  for (const z of [5.4, -5.4]) {            // soft walls of light either side: unchanged by that turn
    const m = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ map: TX.radialGlow('#fff', '#000', 1.3), color: new THREE.Color(1.5, 1.5, 1.55), side: THREE.DoubleSide }));
    m.position.set(0, 0.55, z); m.lookAt(0, 0.55, 0); s.add(m);
  }
  const fl = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ map: TX.radialGlow('#fff', '#000', 1.6), color: new THREE.Color(0.16, 0.16, 0.17) }));
  fl.rotation.x = -Math.PI / 2; s.add(fl);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 80, { size, position: new THREE.Vector3(0, 0.55, 0) });
  pm.dispose();
  return rt.texture;
}

export class Studio {
  constructor(renderer, q = {}) {
    const r = this.renderer = renderer;
    this.q = q;
    this.scene = new THREE.Scene();
    this.scene.background = TX.backdrop();
    this.envStudio = this.scene.environment = makeEnvironment(r, q.env || 512);
    this.envLaunch = makeLaunchEnv(r, q.env || 512);
    this.camera = new THREE.PerspectiveCamera(26, 1.6, 0.05, 90);
    this.target = new THREE.Vector3(0.2, 0.42, 0);
    this.mirrorCam = new THREE.PerspectiveCamera();
    const k = q.shadowScale || 1;
    /* A small lamp for close work in the cockpit (the film's button press and gear changes): the softboxes are out
       beyond the halo and leave the wheel in its shadow. It is in the scene from the start, at zero, so that
       switching it on changes no shader. */
    this.fill = new THREE.PointLight(0xfff1e2, 0, 2.2, 2); this.scene.add(this.fill);
    this.lights = BOXES.map((b) => {
      const l = new THREE.DirectionalLight(new THREE.Color(b.tint[0], b.tint[1], b.tint[2]), b.I);
      l.castShadow = true; l.shadow.mapSize.set(b.map * k, b.map * k); l.shadow.bias = -0.0006; l.shadow.normalBias = 0.007;
      l.shadow.camera.up.set(b.up[0], b.up[1], b.up[2]); l.shadow.autoUpdate = false; l.shadow.needsUpdate = true;
      this.scene.add(l); this.scene.add(l.target);
      return l;
    });
    this.floorU = {
      tBake: { value: null }, tRefl: { value: null }, tReflH: { value: null }, uE0: { value: 0 }, uRough: { value: 0.021 }, uFpx: { value: 1000 },
      uReflK: { value: 0.12 }, uCenter: { value: new THREE.Color(0.1, 0.103, 0.11) }, uSeed: { value: new THREE.Vector2() }, uReflTexel: { value: new THREE.Vector2(1, 1) },
      uReflMat: { value: new THREE.Matrix4() }, uBakeMat: { value: new THREE.Matrix4() }, uWet: { value: 0 }, uTime: { value: 0 }, uRun: { value: 0 },
      uBlur: { value: 0 }, uPools: { value: 0 }, uReach: { value: 0 },
    };
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.floorU, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false,
      defines: { FLOOR_TAPS: (q.spray || 900) >= 1000 ? 6 : (q.spray || 900) >= 700 ? 4 : 3 } }));
    this.floor.renderOrder = -1; this.floor.frustumCulled = false;
    this.scene.add(this.floor);

    const bw = 11, bh = 9;
    this.bakeCam = new THREE.OrthographicCamera(-bw / 2, bw / 2, bh / 2, -bh / 2, 0.1, 1.0012);
    this.bakeCam.position.set(0.15, -1, 0); this.bakeCam.up.set(1, 0, 0); this.bakeCam.lookAt(0.15, 0, 0); this.bakeCam.updateMatrixWorld();
    const bg = new THREE.PlaneGeometry(bw + 2, bh + 2).rotateX(Math.PI / 2); bg.translate(0.15, 0.0006, 0);
    const bn = bg.attributes.normal; for (let i = 0; i < bn.count; i++) bn.setXYZ(i, 0, 1, 0);
    this.bakePlane = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ color: 0xffffff }));
    this.bakePlane.receiveShadow = true; this.bakePlane.visible = false; this.scene.add(this.bakePlane);
    const fl = r.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
    const bs = q.bakeScale || 1, bakeRes = [Math.round(1792 * bs), Math.round(1472 * bs)];
    this.rtBakeS = new THREE.WebGLRenderTarget(bakeRes[0], bakeRes[1], { type: THREE.HalfFloatType });
    this.rtBake = [0, 1].map(() => new THREE.WebGLRenderTarget(bakeRes[0], bakeRes[1], { type: fl, depthBuffer: false }));
    this.bakeN = 0; this.bakeE = 0;
    this.floorU.uBakeMat.value.multiplyMatrices(this.bakeCam.projectionMatrix, this.bakeCam.matrixWorldInverse);
    this.matAccum = new THREE.ShaderMaterial({ uniforms: { tPrev: { value: null }, tCur: { value: null }, uW: { value: 1 } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tPrev, tCur; uniform float uW; varying vec2 vUv; void main() { vec4 c = min(texture2D(tCur, vUv), vec4(48.0)); gl_FragColor = mix(texture2D(tPrev, vUv), c, uW); }' });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matAccum); this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad); this.quadCam = new THREE.Camera();

    const mo = { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter };
    this.rtMirror = new THREE.WebGLRenderTarget(4, 4, mo);
    this.rtMirrorH = new THREE.WebGLRenderTarget(4, 4, mo);
    this.heightMat = new THREE.ShaderMaterial({
      vertexShader: 'varying float vY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'varying float vY; void main() { gl_FragColor = vec4(vY, vY, vY, 1.0); }' });
    this.floorU.tRefl.value = this.rtMirror.texture; this.floorU.tReflH.value = this.rtMirrorH.texture;

    // tyre spray: drops (stretched quads) and a little mist (points)
    const ND = this.ND = Math.round((q.spray || 900) * 0.36), NM = this.NM = Math.round((q.spray || 900) * 0.08) + 10;
    this.dr = { pos: new Float32Array(ND * 3), vel: new Float32Array(ND * 3), rad: new Float32Array(ND), a0: new Float32Array(ND), life: new Float32Array(ND), age: new Float32Array(ND).fill(1e9), next: 0,
      gp: new Float32Array(ND * 12), gv: new Float32Array(ND * 12), gd: new Float32Array(ND * 16) };
    { const dg = new THREE.BufferGeometry(), idx = new Uint16Array(ND * 6), D = this.dr.gd;
      for (let k = 0; k < ND; k++) {
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, c], j) => { D[(k * 4 + j) * 4 + 2] = a; D[(k * 4 + j) * 4 + 3] = c; });
        idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
      }
      dg.setAttribute('position', new THREE.BufferAttribute(this.dr.gp, 3).setUsage(THREE.DynamicDrawUsage));
      dg.setAttribute('aVel', new THREE.BufferAttribute(this.dr.gv, 3).setUsage(THREE.DynamicDrawUsage));
      dg.setAttribute('aData', new THREE.BufferAttribute(this.dr.gd, 4).setUsage(THREE.DynamicDrawUsage));
      dg.setIndex(new THREE.BufferAttribute(idx, 1));
      this.sprayU = { uPx: { value: 1000 }, uShutter: { value: 0.02 } };
      this.drops = new THREE.Mesh(dg, new THREE.ShaderMaterial({ uniforms: this.sprayU, vertexShader: DROP_VERT, fragmentShader: DROP_FRAG, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide }));
      this.drops.frustumCulled = false; this.drops.renderOrder = 6; this.drops.visible = false; this.scene.add(this.drops); }
    this.sp = { pos: new Float32Array(NM * 3), data: new Float32Array(NM * 2), vel: new Float32Array(NM * 3), a0: new Float32Array(NM), life: new Float32Array(NM), age: new Float32Array(NM).fill(1e9), next: 0 };
    { const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(this.sp.pos, 3).setUsage(THREE.DynamicDrawUsage));
      sg.setAttribute('aData', new THREE.BufferAttribute(this.sp.data, 2).setUsage(THREE.DynamicDrawUsage));
      this.spray = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: this.sprayU, vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false }));
      this.spray.frustumCulled = false; this.spray.renderOrder = 5; this.spray.visible = false; this.scene.add(this.spray); }

    /* The launch hall (the last beats of the film). The studio turns out to be one end of a long dark hall: softbox
       gantries over the road every 12 m, strip lights down both sides, and at the far end a door rising on daylight.
       The car runs down it and out; the white-out at the cut is that door reaching the lens. */
    this.gantry = new THREE.Group(); this.gantry.visible = false; this.scene.add(this.gantry);
    const sbx = TX.softbox(), glow = (c) => new THREE.MeshBasicMaterial({ map: c, color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.gantryMat = glow(sbx); this.stripMat = glow(sbx);
    { const top = new THREE.PlaneGeometry(0.7, 6.6).rotateX(Math.PI / 2), side = new THREE.PlaneGeometry(0.3, 2.0);
      for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(top, this.gantryMat); m.position.set(i * 12 - 36, 4.6, 0); m.userData.x0 = m.position.x; m.frustumCulled = false; this.gantry.add(m);
        for (const z of [5.0, -5.0]) { const t = new THREE.Mesh(side, this.stripMat); t.position.set(i * 12 - 30, 1.25, z); t.userData.x0 = t.position.x; t.frustumCulled = false; this.gantry.add(t); }
      } }
    { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128); g.filter = 'blur(5px)'; g.fillStyle = '#fff'; g.fillRect(12, 10, 232, 118); g.filter = 'none';
      const dt = new THREE.CanvasTexture(c); dt.colorSpace = THREE.SRGBColorSpace;
      this.doorMat = glow(dt); this.veilMat = glow(TX.radialGlow('#fff', '#000', 2.2));
      this.door = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.4).rotateY(-Math.PI / 2), this.doorMat); this.door.frustumCulled = false; this.door.visible = false; this.scene.add(this.door);
      this.veil = new THREE.Mesh(new THREE.PlaneGeometry(44, 26).rotateY(-Math.PI / 2), this.veilMat); this.veil.frustumCulled = false; this.veil.visible = false; this.scene.add(this.veil); }
    this._v = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
    this.w = 4; this.h = 4;
    this._setLights(-1);
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    const ms = this.q.mirrorScale || 0.5;
    this.rtMirror.setSize(Math.max(2, Math.round(w * ms)), Math.max(2, Math.round(h * ms)));
    this.rtMirrorH.setSize(Math.max(2, Math.round(w * ms * 0.5)), Math.max(2, Math.round(h * ms * 0.5)));
    this.floorU.uReflTexel.value.set(1 / this.rtMirror.width, 1 / this.rtMirror.height);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  _setLights(k) {
    const [p, d, ax, ay, az, t] = this._v;
    let e0 = 0;
    this.lights.forEach((l, i) => {
      const b = BOXES[i];
      let a = 0.5, c = 0.5;
      if (k >= 0) { a = (halton(k + 1, 2) + i * 0.37) % 1; c = (halton(k + 1, 3) + i * 0.61) % 1; }
      p.set(b.c[0] + b.u[0] * (2 * a - 1) + b.v[0] * (2 * c - 1), b.c[1] + b.u[1] * (2 * a - 1) + b.v[1] * (2 * c - 1), b.c[2] + b.u[2] * (2 * a - 1) + b.v[2] * (2 * c - 1));
      d.subVectors(p, AIM).normalize();
      l.position.copy(AIM).addScaledVector(d, 14); l.target.position.copy(AIM);
      l.updateMatrixWorld(); l.target.updateMatrixWorld();
      e0 += b.I * b.tint[0] * Math.max(0, d.y);
      az.copy(d); ax.crossVectors(l.shadow.camera.up, az).normalize(); ay.crossVectors(az, ax);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n0 = 1e9, n1 = -1e9;
      for (let c8 = 0; c8 < 8; c8++) {
        t.set(c8 & 1 ? CAR_BOX.max.x : CAR_BOX.min.x, c8 & 2 ? CAR_BOX.max.y : CAR_BOX.min.y, c8 & 4 ? CAR_BOX.max.z : CAR_BOX.min.z).sub(l.position);
        const x = t.dot(ax), y = t.dot(ay), z = -t.dot(az);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); n0 = Math.min(n0, z); n1 = Math.max(n1, z);
      }
      const sc = l.shadow.camera; sc.left = x0 - 0.05; sc.right = x1 + 0.05; sc.bottom = y0 - 0.05; sc.top = y1 + 0.05; sc.near = Math.max(0.1, n0 - 0.5); sc.far = n1 + 0.5; sc.updateProjectionMatrix();
      l.shadow.needsUpdate = true;
    });
    return e0;
  }

  // Accumulate floor irradiance (with the car's shadow) from sampled light positions.
  bakeStep(count = 8) {
    const r = this.renderer, sc = this.scene;
    const envI = sc.environmentIntensity, bg = sc.background;
    sc.environmentIntensity = 0; sc.background = null; this.floor.visible = false; this.bakePlane.visible = true; this.spray.visible = false; this.drops.visible = false;
    r.setClearColor(0x000000, 1);
    for (let i = 0; i < count; i++) {
      const e = this._setLights(this.bakeN + 7);
      r.setRenderTarget(this.rtBakeS); r.clear(); r.render(sc, this.bakeCam);
      const a = this.rtBake[this.bakeN & 1], b = this.rtBake[(this.bakeN + 1) & 1];
      this.matAccum.uniforms.tPrev.value = a.texture; this.matAccum.uniforms.tCur.value = this.rtBakeS.texture; this.matAccum.uniforms.uW.value = 1 / (this.bakeN + 1);
      r.setRenderTarget(b); r.render(this.quadScene, this.quadCam);
      this.bakeE += (e - this.bakeE) / (this.bakeN + 1);
      this.bakeN++;
      this.floorU.tBake.value = b.texture; this.floorU.uE0.value = this.bakeE / Math.PI;
    }
    r.setRenderTarget(null);
    sc.environmentIntensity = envI; sc.background = bg; this.floor.visible = true; this.bakePlane.visible = false;
    this._setLights(-1);
  }

  _updateMirror(cam) {
    const m = this.mirrorCam, [p, f, u, tg] = this._v;
    cam.updateMatrixWorld();
    p.setFromMatrixPosition(cam.matrixWorld);
    f.set(0, 0, -1).transformDirection(cam.matrixWorld); u.set(0, 1, 0).transformDirection(cam.matrixWorld);
    tg.copy(p).add(f); tg.y = -tg.y;
    m.position.set(p.x, -p.y, p.z); m.up.set(u.x, -u.y, u.z); m.lookAt(tg);
    m.near = cam.near; m.far = cam.far; m.updateMatrixWorld();
    m.projectionMatrix.copy(cam.projectionMatrix); m.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    this.floorU.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
    this.floorU.uFpx.value = (this.rtMirror.height / 2) / Math.tan(cam.fov * Math.PI / 360);
  }

  // draw the studio into `target` from `cam` (mirror image first, then the view)
  render(target, cam = this.camera) {
    const r = this.renderer, sc = this.scene;
    this._updateMirror(cam);
    this.sprayU.uPx.value = (target ? target.height : this.h) / (2 * Math.tan(cam.fov * Math.PI / 360));
    const bg = sc.background; sc.background = null; this.floor.visible = false;
    r.setRenderTarget(this.rtMirror); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, this.mirrorCam);
    const sv = this.spray.visible, dv = this.drops.visible; this.spray.visible = false; this.drops.visible = false;
    sc.overrideMaterial = this.heightMat; r.setRenderTarget(this.rtMirrorH); r.clear(); r.render(sc, this.mirrorCam); sc.overrideMaterial = null;
    this.spray.visible = sv; this.drops.visible = dv;
    sc.background = bg; this.floor.visible = true;
    r.setRenderTarget(target); r.setClearColor(0x000000, 1); r.clear(); r.render(sc, cam);
  }

  /* ---- spray: water thrown off a spinning rear tyre ----
     (cx, cy, cz): wheel centre, R: tyre radius, hw: half the tread width, tread: speed of the tread surface (m/s),
     n drops and nMist mist puffs. The tread lifts water off the road and lets go of it over the first 70 degrees up
     the back of the tyre, so every drop leaves along the tangent there: backwards, and the higher the steeper. */
  emitTyre(cx, cy, cz, R, hw, tread, n, nMist = 0, wake = 0) {
    const D = this.dr, S = this.sp;
    for (let i = 0; i < n; i++) {
      const k = D.next; D.next = (D.next + 1) % this.ND;
      // a third of the drops are the sheet of water right behind the contact patch: low, slow, small and gone in a moment
      const sheet = Math.random() < 0.36;
      const th = sheet ? 0.12 + Math.random() * 0.25 : 0.15 + Math.pow(Math.random(), 2.2) * 1.0, sn = Math.sin(th), cs = Math.cos(th), lat = (Math.random() * 2 - 1) * hw;
      const sp = sheet ? 1.5 + Math.random() * 2.8 : Math.min(tread, 63) * (0.03 + 0.11 * Math.random() * Math.random());     // most of the water leaves far slower than the tread
      D.pos[k * 3] = cx - sn * (R + 0.004); D.pos[k * 3 + 1] = cy - cs * (R + 0.004) + 0.006; D.pos[k * 3 + 2] = cz + lat;
      D.vel[k * 3] = -cs * sp + (Math.random() - 0.5) * 0.4; D.vel[k * 3 + 1] = sn * sp + (Math.random() - 0.3) * 0.4; D.vel[k * 3 + 2] = lat * 1.2 + (Math.random() - 0.5) * 0.6;
      D.rad[k] = sheet ? 0.0008 + 0.0009 * Math.random() : 0.0010 + 0.0026 * Math.random() * Math.random(); D.a0[k] = 0.6 + 0.4 * Math.random();
      D.age[k] = 0; D.life[k] = sheet ? 0.12 + Math.random() * 0.2 : 0.3 + Math.random() * 0.55;
    }
    for (let i = 0; i < nMist; i++) {
      const k = S.next; S.next = (S.next + 1) % this.NM;
      S.pos[k * 3] = cx - 0.25 - Math.random() * 0.3; S.pos[k * 3 + 1] = 0.04 + Math.random() * 0.10; S.pos[k * 3 + 2] = cz + (Math.random() * 2 - 1) * hw;
      S.vel[k * 3] = -1.0 - Math.random() * 1.8; S.vel[k * 3 + 1] = 0.25 + Math.random() * 0.5; S.vel[k * 3 + 2] = (Math.random() - 0.5) * 0.4;
      // wake: the fine spray a tyre drags behind it at speed is denser and shorter-lived than the haze of a standing burn-out
      S.data[k * 2] = 0.12 + Math.random() * 0.14; S.a0[k] = (0.05 + Math.random() * 0.04) * (1 + 0.9 * wake); S.age[k] = 0; S.life[k] = (0.8 + Math.random() * 0.8) * (1 - 0.55 * wake);
    }
    if (n) this.drops.visible = true; if (nMist) this.spray.visible = true;
  }
  // dt: time step for the water (slow motion passes a small one); shutter: exposure in the same time; wind: air speed past the car (m/s)
  updateSpray(dt, shutter = 0.02, wind = 0) {
    const D = this.dr, S = this.sp, gp = D.gp, gv = D.gv, gd = D.gd; let live = 0;
    const kw = 1 - Math.exp(-1.6 * dt);                  // air drag: a 2 mm drop loses most of its speed in half a second
    for (let k = 0; k < this.ND; k++) {
      let a = 0;
      if (D.age[k] < D.life[k]) {
        D.age[k] += dt;
        D.vel[k * 3] += (-wind * 0.5 - D.vel[k * 3]) * kw; D.vel[k * 3 + 1] = D.vel[k * 3 + 1] * (1 - kw) - 9.81 * dt; D.vel[k * 3 + 2] *= 1 - kw;
        D.pos[k * 3] += D.vel[k * 3] * dt; D.pos[k * 3 + 1] += D.vel[k * 3 + 1] * dt; D.pos[k * 3 + 2] += D.vel[k * 3 + 2] * dt;
        if (D.pos[k * 3 + 1] < 0.002) D.age[k] = D.life[k];          // back on the road
        else { live++; const f = D.age[k] / D.life[k]; a = D.a0[k] * Math.min(1, f * 14) * (1 - f * f); }
      }
      for (let j = 0; j < 4; j++) {
        const o = (k * 4 + j) * 3, q = (k * 4 + j) * 4;
        gp[o] = D.pos[k * 3]; gp[o + 1] = D.pos[k * 3 + 1]; gp[o + 2] = D.pos[k * 3 + 2];
        gv[o] = D.vel[k * 3]; gv[o + 1] = D.vel[k * 3 + 1]; gv[o + 2] = D.vel[k * 3 + 2];
        gd[q] = D.rad[k]; gd[q + 1] = a;
      }
    }
    const g = this.drops.geometry; g.attributes.position.needsUpdate = true; g.attributes.aVel.needsUpdate = true; g.attributes.aData.needsUpdate = true;
    if (!live) this.drops.visible = false;
    this.sprayU.uShutter.value = shutter;
    let mist = 0; const km = 1 - Math.exp(-2.6 * dt);
    for (let k = 0; k < this.NM; k++) {
      if (S.age[k] >= S.life[k]) { S.data[k * 2 + 1] = 0; continue; }
      mist++; S.age[k] += dt;
      S.vel[k * 3] += (-wind * 0.25 - S.vel[k * 3]) * km; S.vel[k * 3 + 1] += (0.15 - S.vel[k * 3 + 1]) * km; S.vel[k * 3 + 2] *= 1 - km;
      S.pos[k * 3] += S.vel[k * 3] * dt; S.pos[k * 3 + 1] += S.vel[k * 3 + 1] * dt; S.pos[k * 3 + 2] += S.vel[k * 3 + 2] * dt;
      const f = S.age[k] / S.life[k];
      S.data[k * 2] += dt * (0.5 + wind * 0.06); S.data[k * 2 + 1] = S.a0[k] * Math.min(1, f * 6) * (1 - f) * (1 - f);
    }
    const sg = this.spray.geometry; sg.attributes.position.needsUpdate = true; sg.attributes.aData.needsUpdate = true;
    if (!mist) this.spray.visible = false;
  }
  clearSpray() { this.dr.age.fill(1e9); this.sp.age.fill(1e9); this.drops.visible = false; this.spray.visible = false; }

  /* The launch. k: 0..1 how far the hall's lights have come up; run: metres the road has moved under the car;
     v: its speed (m/s); doorX: where the door stands ahead of the car now; open: 0..1 how far it has risen. */
  setLaunch(k, run = 0, v = 0, doorX = 60, open = 0) {
    const on = k > 0.001, U = this.floorU, blur = v / 48;                  // 1/48 s exposure
    this.gantry.visible = on; this.door.visible = this.veil.visible = on && open > 0.002;
    U.uRun.value = run % 4096; U.uBlur.value = on ? blur : 0; U.uPools.value = on ? k : 0; U.uReach.value = on ? 1 : 0;
    this.floor.scale.x = on ? 5 : 1;
    const env = on ? this.envLaunch : this.envStudio;
    if (this.scene.environment !== env) this.scene.environment = env;
    this.scene.environmentRotation.set(0, 0, on ? -(run / 12) * (Math.PI / 6) : 0);     // one rib per gantry
    const far = on ? 420 : 90; if (this.camera.far !== far) { this.camera.far = far; this.camera.updateProjectionMatrix(); }
    if (!on) return;
    for (const m of this.gantry.children) {
      m.position.x = ((m.userData.x0 - run + 36) % 144 + 144) % 144 - 36;
      const w = m.material === this.gantryMat ? 0.7 : 0.3; m.scale.x = 1 + blur / w;        // smeared along the road by the exposure
    }
    const dim = (w) => 1 / Math.pow(1 + blur / w, 0.75);
    this.gantryMat.color.setRGB(5.0, 5.15, 5.5).multiplyScalar(k * dim(0.7));
    this.stripMat.color.setRGB(2.3, 2.4, 2.6).multiplyScalar(k / (1 + blur / 0.3));
    // the door: a roller door rising on daylight
    const h = 6.4 * Math.max(0.002, open);
    this.door.scale.y = Math.max(0.002, open); this.door.position.set(doorX, h / 2, 0);
    this.doorMat.color.setRGB(7.5, 8.2, 9.6);
    this.veil.position.set(doorX - 0.3, h / 2, 0); this.veilMat.color.setRGB(0.5, 0.55, 0.66).multiplyScalar(open);
  }
}
