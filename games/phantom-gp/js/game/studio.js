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
  uniform float uE0, uReflK, uRough, uFpx, uWet, uTime, uRun;
  uniform vec3 uCenter; uniform vec2 uSeed, uReflTexel;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.07 + 13.7) + 0.0625 * vnoise(p * 8.1 + 3.3); }
  varying vec3 vWorld; varying vec4 vRefl; varying vec4 vBake;
  void main() {
    vec2 wp = vWorld.xz + vec2(uRun, 0.0);                 // uRun slides the surface under the car (the launch)
    float r = length(vWorld.xz * vec2(0.72, 1.0));
    float pool = pow(smoothstep(7.6, 0.4, r), 1.7);
    float mott = fbm(wp * 1.15 + 3.7);
    vec3 base = uCenter * (0.05 + 0.95 * pool) * (0.86 + 0.28 * mott);
    // wet asphalt: dark aggregate, standing water in the low spots
    float agg = vnoise(wp * 90.0) * 0.6 + vnoise(wp * 31.0) * 0.4;
    float pud = smoothstep(0.40, 0.58, fbm(wp * 0.62 + 21.0) + 0.10 * pool);
    vec3 wetBase = vec3(0.020, 0.021, 0.024) * (0.55 + 0.9 * agg) * (1.0 - 0.75 * pud) * (0.25 + 0.75 * pool);
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
    vec2 wob = (vec2(vnoise(wp * 23.0 + uTime * 0.7), vnoise(wp * 23.0 + 9.0 - uTime * 0.6)) - 0.5) * 0.010 * uWet * mix(1.0, 0.25, pud);
    vec4 rc = vec4(0.0);
    for (int i = 0; i < 7; i++) {
      float fi = float(i), rr = sqrt((fi + 0.5) / 7.0) * rad, th = ang + fi * 2.39996;
      rc += textureLod(tRefl, ruv + wob + vec2(cos(th), sin(th)) * rr * str, lod);
    }
    rc /= 7.0;
    float fres = 0.05 + 0.95 * pow(1.0 - cosT, 5.0);
    float reflK = mix(uReflK, 0.16 + 0.62 * pud, uWet);
    col += rc.rgb * reflK * (0.55 + 1.7 * fres) * mix(0.3 + 0.7 * pool, 1.0, uWet);
    float a = smoothstep(14.0, 5.0, r) * smoothstep(0.012, 0.10, cosT);
    gl_FragColor = vec4(col, a);
  }`;

const SPRAY_VERT = /* glsl */`
  attribute vec4 aData;                 // size (m), alpha, kind (0 mist, 1 drop), unused
  uniform float uPx; varying float vA; varying float vKind;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aData.x * uPx / max(-mv.z, 0.05), 1.0, 220.0);
    vA = aData.y; vKind = aData.z;
  }`;
const SPRAY_FRAG = /* glsl */`
  varying float vA; varying float vKind;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p);
    if (d > 1.0) discard;
    float soft = mix(pow(1.0 - d, 1.6), smoothstep(1.0, 0.2, d), vKind);
    vec3 c = mix(vec3(0.30, 0.33, 0.38), vec3(1.5, 1.65, 1.9), vKind);
    gl_FragColor = vec4(c, soft * vA);
  }`;

export class Studio {
  constructor(renderer, q = {}) {
    const r = this.renderer = renderer;
    this.q = q;
    this.scene = new THREE.Scene();
    this.scene.background = TX.backdrop();
    this.scene.environment = makeEnvironment(r, q.env || 512);
    this.camera = new THREE.PerspectiveCamera(26, 1.6, 0.05, 90);
    this.target = new THREE.Vector3(0.2, 0.42, 0);
    this.mirrorCam = new THREE.PerspectiveCamera();
    const k = q.shadowScale || 1;
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
    };
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.floorU, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false }));
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

    // tyre spray
    const NP = this.NP = q.spray || 900;
    const sg = new THREE.BufferGeometry();
    this.sp = { pos: new Float32Array(NP * 3), data: new Float32Array(NP * 4), vel: new Float32Array(NP * 3), life: new Float32Array(NP), age: new Float32Array(NP).fill(1e9), next: 0 };
    sg.setAttribute('position', new THREE.BufferAttribute(this.sp.pos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aData', new THREE.BufferAttribute(this.sp.data, 4).setUsage(THREE.DynamicDrawUsage));
    this.sprayU = { uPx: { value: 1000 } };
    this.spray = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: this.sprayU, vertexShader: SPRAY_VERT, fragmentShader: SPRAY_FRAG, transparent: true, depthWrite: false }));
    this.spray.frustumCulled = false; this.spray.renderOrder = 5; this.spray.visible = false;
    this.scene.add(this.spray);
    // light bars that streak past when the car launches (the last beats of the film)
    this.tunnel = new THREE.Group(); this.tunnel.visible = false; this.scene.add(this.tunnel);
    this.tunnelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.2, 6), transparent: true, opacity: 0, depthWrite: false });
    { const g = new THREE.BoxGeometry(7, 0.05, 0.05); let k = 0;
      for (const [y, z] of [[0.5, 3.4], [1.5, 3.9], [2.8, 3.6], [0.5, -3.4], [1.5, -3.9], [2.8, -3.6], [4.2, 1.3], [4.2, -1.3]]) for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(g, this.tunnelMat); m.position.set(-50 + i * 26 + ((k * 7) % 13), y, z); m.userData.x0 = m.position.x; m.frustumCulled = false; this.tunnel.add(m); k++;
      } }
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
    sc.environmentIntensity = 0; sc.background = null; this.floor.visible = false; this.bakePlane.visible = true; this.spray.visible = false;
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
    const sv = this.spray.visible; this.spray.visible = false;
    sc.overrideMaterial = this.heightMat; r.setRenderTarget(this.rtMirrorH); r.clear(); r.render(sc, this.mirrorCam); sc.overrideMaterial = null;
    this.spray.visible = sv;
    sc.background = bg; this.floor.visible = true;
    r.setRenderTarget(target); r.setClearColor(0x000000, 1); r.clear(); r.render(sc, cam);
  }

  /* ---- spray: water thrown up by a spinning tyre ---- */
  // p: contact point, dir: unit direction the tread leaves the ground (backwards and up), speed m/s, n particles
  emit(p, dir, speed, n, spread = 0.35) {
    const S = this.sp;
    for (let i = 0; i < n; i++) {
      const k = S.next; S.next = (S.next + 1) % this.NP;
      const drop = Math.random() < 0.45 ? 1 : 0, sp = speed * (0.25 + 0.75 * Math.random()) * (drop ? 1 : 0.55);
      S.pos[k * 3] = p.x + (Math.random() - 0.5) * 0.08; S.pos[k * 3 + 1] = p.y + Math.random() * 0.03; S.pos[k * 3 + 2] = p.z + (Math.random() - 0.5) * 0.30;
      S.vel[k * 3] = (dir.x + (Math.random() - 0.5) * spread) * sp; S.vel[k * 3 + 1] = (dir.y + (Math.random() - 0.3) * spread) * sp; S.vel[k * 3 + 2] = (dir.z + (Math.random() - 0.5) * spread * 1.3) * sp;
      S.age[k] = 0; S.life[k] = drop ? 0.5 + Math.random() * 0.6 : 0.9 + Math.random() * 1.3;
      S.data[k * 4] = drop ? 0.006 + Math.random() * 0.011 : 0.08 + Math.random() * 0.14; S.data[k * 4 + 1] = 0; S.data[k * 4 + 2] = drop; S.data[k * 4 + 3] = drop ? 0.85 : 0.05 + Math.random() * 0.06;
    }
    this.spray.visible = true;
  }
  updateSpray(dt) {
    const S = this.sp; let live = 0;
    for (let k = 0; k < this.NP; k++) {
      if (S.age[k] >= S.life[k]) { S.data[k * 4 + 1] = 0; continue; }
      live++;
      S.age[k] += dt;
      const drop = S.data[k * 4 + 2], drag = drop ? 0.6 : 2.6;
      S.vel[k * 3] *= Math.exp(-drag * dt); S.vel[k * 3 + 2] *= Math.exp(-drag * dt);
      S.vel[k * 3 + 1] = S.vel[k * 3 + 1] * Math.exp(-drag * dt) - (drop ? 9.8 : 1.4) * dt;
      S.pos[k * 3] += S.vel[k * 3] * dt; S.pos[k * 3 + 1] += S.vel[k * 3 + 1] * dt; S.pos[k * 3 + 2] += S.vel[k * 3 + 2] * dt;
      if (S.pos[k * 3 + 1] < 0.004) { if (drop) { S.age[k] = S.life[k]; S.data[k * 4 + 1] = 0; continue; } S.pos[k * 3 + 1] = 0.004; S.vel[k * 3 + 1] = Math.abs(S.vel[k * 3 + 1]) * 0.2; }
      const f = S.age[k] / S.life[k];
      S.data[k * 4 + 1] = S.data[k * 4 + 3] * Math.min(1, f * 8) * (1 - f) * (1 - f);
      if (!drop) S.data[k * 4] += dt * 0.42;
    }
    const g = this.spray.geometry; g.attributes.position.needsUpdate = true; g.attributes.aData.needsUpdate = true;
    if (!live) this.spray.visible = false;
  }
  clearSpray() { this.sp.age.fill(1e9); this.spray.visible = false; }
  // run = metres the floor has moved under the car, k = 0..1 brightness
  setTunnel(run, k) {
    this.tunnel.visible = k > 0.001; this.tunnelMat.opacity = k;
    if (k > 0.001) for (const m of this.tunnel.children) m.position.x = ((m.userData.x0 - run + 50) % 130 + 130) % 130 - 50;
  }
}
