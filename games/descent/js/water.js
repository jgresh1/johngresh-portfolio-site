// Ocean surface, sky dome and tileable caustic maps.
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_SKY, makeWaveSet, waveGLSL } from './glsl.js';
import { U, OPTICS_PARS } from './optics.js';

export const WAVES = makeWaveSet({ tile: 24, count: 72, windDeg: 25, seed: 23, slope: 0.042 });
const WAVE_GLSL = waveGLSL(WAVES);

// ---------------------------------------------------------------------------
// Caustics: refract the sun through the wave field onto a flat plane at a few
// reference depths and accumulate (flat-area / focused-area) per texel.
// ---------------------------------------------------------------------------
export class Caustics {
  constructor(renderer, { size = 1024, grid = 384, depths = [2.0, 7.0, 22.0] } = {}) {
    this.renderer = renderer;
    this.depths = depths;
    const T = WAVES.tile;
    this.tile = T;
    this.targets = depths.map(() => {
      const rt = new THREE.WebGLRenderTarget(size, size, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
        generateMipmaps: true, depthBuffer: false, anisotropy: 8,
      });
      return rt;
    });

    // grid of surface points covering one tile; 9 instances = wrapped copies
    const n = grid, pos = new Float32Array((n + 1) * (n + 1) * 3), idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const o = (j * (n + 1) + i) * 3;
      pos[o] = i / n * T; pos[o + 1] = 0; pos[o + 2] = j / n * T;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const offs = [];
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) offs.push(ox * T, oz * T);
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(offs), 2));
    g.instanceCount = 9;

    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uTime: { value: 0 }, uDepth: { value: 2 }, uTile: { value: T }, uSunDirA: U.uSunDirA },
      vertexShader: /* glsl */`
        uniform float uTime, uDepth, uTile; uniform vec3 uSunDirA;
        in vec2 aOff;
        out vec2 vOld; out vec2 vNew;
        ${WAVE_GLSL}
        void main() {
          vec2 s = position.xz + aOff;
          vec2 g; float h = waveHG(s, uTime, 1e9, g);
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 I = -uSunDirA;
          vec3 rF = refract(I, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
          vec3 r  = refract(I, n, 1.0 / 1.333);
          vOld = s + rF.xz * (uDepth / -rF.y);
          vNew = s + r.xz  * ((h + uDepth) / -r.y);
          gl_Position = vec4(vNew / uTile * 2.0 - 1.0, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        in vec2 vOld; in vec2 vNew; out vec4 outColor;
        void main() {
          float oa = abs(dFdx(vOld.x) * dFdy(vOld.y) - dFdx(vOld.y) * dFdy(vOld.x));
          float na = abs(dFdx(vNew.x) * dFdy(vNew.y) - dFdx(vNew.y) * dFdy(vNew.x));
          float I = min(oa / max(na, 1e-10), 40.0);
          outColor = vec4(I, I, I, 1.0);
        }`,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide, transparent: true,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    U.uCausMap0.value = this.targets[0].texture;
    U.uCausMap1.value = this.targets[1].texture;
    U.uCausMap2.value = this.targets[2].texture;
    U.uCausD.value.set(...depths);
    U.uCausP.value.x = T;
  }

  update(time) {
    const r = this.renderer;
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear;
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0); r.autoClear = true;
    this.mat.uniforms.uTime.value = time;
    for (let i = 0; i < this.targets.length; i++) {
      this.mat.uniforms.uDepth.value = this.depths[i];
      r.setRenderTarget(this.targets[i]);
      r.clear();
      r.render(this.scene, this.cam);
    }
    r.setRenderTarget(prevRT); r.autoClear = prevAuto; r.setClearColor(prevClear, prevAlpha);
  }
}

// ---------------------------------------------------------------------------
// Background: sky (camera above water) or the water body's veil radiance (below), drawn FIRST in the
// scene pass so MSAA edges blend against the correct colour instead of black.
// ---------------------------------------------------------------------------
export function makeBackground() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: Object.assign({}, U, { uProjInv: { value: new THREE.Matrix4() } }),
    vertexShader: /* glsl */`
      out vec2 vNdc;
      void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      in vec2 vNdc; out vec4 outColor;
      uniform mat4 uProjInv;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${OPTICS_PARS.replace('varying vec3 vUwView;', '')}
      void main() {
        vec4 vp = uProjInv * vec4(vNdc, 1.0, 1.0); vp.xyz /= vp.w;
        vec3 dir = normalize(transpose(mat3(viewMatrix)) * normalize(vp.xyz));
        vec3 C = cameraPosition; float wl = uOptA.y;
        vec3 col;
        if (C.y > wl) {
          if (dir.y >= 0.0) col = skyRadiance(dir, uSunDirA, uOptA.x);
          else {
            float cosI = clamp(-dir.y, 0.0, 1.0);
            float F = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
            vec3 sk = skyRadiance(vec3(dir.x, -dir.y, dir.z), uSunDirA, uOptA.x);
            col = F * sk + uVeil0 * 1.4 * 0.35 * (1.0 - F);
          }
        } else {
          vec3 T, L; uwPath(C, C + dir * 3000.0, T, L);
          col = L;
        }
        outColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.renderOrder = -10000;
  m.onBeforeRender = (r, sc, cam) => { mat.uniforms.uProjInv.value.copy(cam.projectionMatrixInverse); };
  return m;
}

// ---------------------------------------------------------------------------
// Sky dome (used when the camera is above the water)
// ---------------------------------------------------------------------------
export function makeSkyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSunDirA: U.uSunDirA, uOptA: U.uOptA },
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDirA; uniform vec4 uOptA; varying vec3 vDir;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){ gl_FragColor = vec4(skyRadiance(normalize(vDir), uSunDirA, uOptA.x), 1.0); }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// ---------------------------------------------------------------------------
// Ocean surface: polar grid that follows the camera. Seen from below it is the
// mirror + Snell's window; seen from above it is the wavy sea (basic for now).
// ---------------------------------------------------------------------------
function polarGrid(rings = 170, segs = 256, r0 = 0.02, R = 40000) {
  const pos = new Float32Array((rings + 1) * segs * 3), idx = [];
  for (let i = 0; i <= rings; i++) {
    const r = r0 + (R - r0) * Math.pow(i / rings, 3.0);
    for (let j = 0; j < segs; j++) {
      const a = j / segs * Math.PI * 2, o = (i * segs + j) * 3;
      pos[o] = Math.cos(a) * r; pos[o + 1] = 0; pos[o + 2] = Math.sin(a) * r;
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const j1 = (j + 1) % segs;
    const a = i * segs + j, b = i * segs + j1, c = (i + 1) * segs + j, d = (i + 1) * segs + j1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------
// Planar reflection of the underwater world (used for the mirror seen from below)
// ---------------------------------------------------------------------------
export class PlanarReflection {
  constructor(renderer, scale = 0.5) {
    this.renderer = renderer; this.scale = scale;
    this.vcam = new THREE.PerspectiveCamera();
    this.matrix = new THREE.Matrix4();
    this.rt = null;
    this.size = new THREE.Vector2(0, 0);
  }
  resize(w, h) {
    const rw = Math.max(64, Math.round(w * this.scale)), rh = Math.max(64, Math.round(h * this.scale));
    if (this.rt && this.rt.width === rw && this.rt.height === rh) return;
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(rw, rh, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, samples: 0,
    });
  }
  render(scene, camera, waterLevel = 0) {
    const r = this.renderer, v = this.vcam;
    const C = camera.getWorldPosition(new THREE.Vector3());
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(C);
    // mirror position, look-at target and up vector about the plane y = waterLevel
    const mir = (p) => new THREE.Vector3(p.x, 2 * waterLevel - p.y, p.z);
    v.position.copy(mir(C));
    v.up.set(0, 1, 0).applyMatrix4(rot); v.up.y *= -1;
    v.lookAt(mir(look));
    v.fov = camera.fov; v.aspect = camera.aspect; v.near = camera.near; v.far = camera.far;
    v.updateProjectionMatrix(); v.updateMatrixWorld(true);
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);
    const prev = r.getRenderTarget(), prevClear = r.getClearColor(new THREE.Color()), prevA = r.getClearAlpha();
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear();
    r.render(scene, v);
    r.setRenderTarget(prev); r.setClearColor(prevClear, prevA);
  }
}

export class OceanSurface {
  constructor() {
    this.center = new THREE.Vector2();
    this.uniforms = Object.assign({}, U, { uCenter: { value: new THREE.Vector2() }, uSeaSteep: { value: 1.0 }, uCamH: { value: 0 }, uReflTex: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 }, uReflK: { value: new THREE.Vector3(0.07, 0.05, 0.015) } });      // wave distortion of the mirrored seabed seen from below (x, z slope gain, noise)
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        uniform vec2 uCenter; uniform vec4 uOptA;
        out vec3 vWorld; out vec3 vUwView;
        ${WAVE_GLSL}
        void main() {
          vec2 xz = position.xz + uCenter;
          float r = length(position.xz);
          float dr = max(r * 0.0245, 0.4);
          float kmax = 3.14159 / dr;
          float h = waveH(xz, uOptA.x, kmax);
          vec3 wp = vec3(xz.x, h, xz.y);
          vWorld = wp;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vUwView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        in vec3 vWorld; in vec3 vUwView; out vec4 outColor;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${WAVE_GLSL}
        ${OPTICS_PARS.replace('varying vec3 vUwView;', '')}
        uniform sampler2D uReflTex; uniform mat4 uReflMat; uniform float uReflOn; uniform float uCamH; uniform vec3 uReflK;

        float fresnelExact(float cosI, float n1, float n2, out float cosT2) {
          float sin2t = (n1 / n2) * (n1 / n2) * (1.0 - cosI * cosI);
          if (sin2t >= 1.0) { cosT2 = 0.0; return 1.0; }
          float cosT = sqrt(1.0 - sin2t); cosT2 = cosT;
          float rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
          float rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
          return 0.5 * (rs * rs + rp * rp);
        }

        void main() {
          vec3 P = vWorld;
          vec3 C = cameraPosition;
          vec3 Vd = normalize(P - C);
          float pix = length(fwidth(P.xz));
          float kf = 3.14159 / max(pix * 1.5, 1e-3);
          vec2 pw = P.xz + 3.0 * (vec2(vn2(P.xz * 0.019), vn2(P.xz * 0.019 + 9.3)) - 0.5);
          vec2 g; waveHG(pw, uOptA.x, kf, g);
          // tiny non-periodic capillary ripples
          vec3 rip = vn3d(vec3(P.xz * 9.0, uOptA.x * 0.7)).yzw;
          g += rip.xy * 0.010 * smoothstep(12.0, 2.0, length(P - C));
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

          vec3 col;
          // which side of the surface is the camera on? Decided by the wave height right at the camera (a heightfield is seen from
          // one side only), not per fragment: a crest taller than the eye would otherwise be shaded as an underside (black).
          bool fromBelow = C.y < uOptA.y;
          if (fromBelow) {
            // ---- seen from below ----
            vec3 Nb = -N;
            float cosI = clamp(dot(-Vd, Nb), 0.0, 1.0);
            float cT;
            float F = fresnelExact(cosI, 1.333, 1.0, cT);
            // dispersion: slightly different IOR per channel gives coloured window fringes
            vec3 skyT = vec3(0.0);
            vec3 Rg = refract(Vd, Nb, 1.333);
            if (dot(Rg, Rg) > 0.0) {
              vec3 Rr = refract(Vd, Nb, 1.3305), Rb = refract(Vd, Nb, 1.3385);
              if (dot(Rr, Rr) == 0.0) Rr = Rg;
              if (dot(Rb, Rb) == 0.0) Rb = Rg;
              skyT = vec3(skyRadiance(Rr, uSunDirA, uOptA.x).r, skyRadiance(Rg, uSunDirA, uOptA.x).g, skyRadiance(Rb, uSunDirA, uOptA.x).b);
            }
            // reflected side: the underwater world seen from just under the surface, looking down
            vec3 Rrefl = reflect(Vd, Nb);
            Rrefl.y = - abs( Rrefl.y );                        // steep wave faces seen at grazing angles can reflect 'upwards': keep the mirror image underwater
            vec3 Tt, Lt;
            uwPath(vec3(P.x, uOptA.y - 0.001, P.z), vec3(P.x, uOptA.y - 0.001, P.z) + Rrefl * 400.0, Tt, Lt);
            vec3 refl = Lt;
            if (uReflOn > 0.5) {
              vec4 rc = uReflMat * vec4(P, 1.0);
              vec2 ruv = rc.xy / rc.w + (Nb.xz * uReflK.xy + uReflK.z * (vec2(vn2(pw * 1.3), vn2(pw * 1.3 + 7.7)) - 0.5)) / max(rc.w, 1.0);
              vec4 rs = texture(uReflTex, clamp(ruv, 0.002, 0.998));
              // wave distortion can push the lookup off the mirrored image: clamping would smear its border rows into vertical streaks, so fade to the analytic water colour there
              float edgeF = smoothstep(0.0, 0.06, min(min(ruv.x, 1.0 - ruv.x), min(ruv.y, 1.0 - ruv.y)));
              refl = mix(Lt, rs.rgb, rs.a * edgeF);
            }
            col = mix(skyT, refl, F);
            col = uwFog(col, P);
          } else {
            // ---- seen from above: transparent Fresnel layer (premultiplied) over the absorption-correct seabed ----
            vec3 R = reflect(Vd, N);
            R.y = abs(R.y);
            float cosI = clamp(dot(-Vd, N), 0.0, 1.0);
            float cT2; float F = fresnelExact(cosI, 1.0, 1.333, cT2);
            vec3 sky = skyRadiance(R, uSunDirA, uOptA.x);
            // whitecaps / foam where wave slopes are steep and along crests
            float slope = length(g);
            float foam = smoothstep(0.34, 0.62, slope + 0.10 * (vn2(P.xz * 1.7 + uOptA.x * 0.2) - 0.5));
            vec3 foamCol = vec3(0.85, 0.9, 0.95) * (0.35 + 0.4 * uSunCol);
            // subtle body colour so deep water is not just clear glass
            vec3 body = uVeil0 * 1.4 * (1.0 - F);
            col = F * sky + foam * foamCol * 0.6 + body * 0.35;
            outColor = vec4(col, clamp(F + foam * 0.7 + 0.06, 0.0, 1.0));
            return;
          }
          outColor = vec4(col, 1.0);
        }`,
      side: THREE.DoubleSide, depthWrite: true, fog: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(polarGrid(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  update(camera) {
    // wave height right under the camera (same lowpass the vertex shader applies at r ~ 0)
    { const t = this.uniforms.uOptA.value.x, x = camera.position.x, z = camera.position.z, kmax = Math.PI / 0.4; let h = 0;
      for (const w of WAVES.waves) { const k = Math.hypot(w.kx, w.kz), u = Math.min(Math.max((k - kmax * 0.5) / (kmax * 0.5), 0), 1), fade = 1 - u * u * (3 - 2 * u); h += fade * w.amp * Math.cos(w.kx * x + w.kz * z - w.omega * t + w.phase); }
      this.uniforms.uCamH.value = h; }
    // follow the camera, snapped to a coarse grid to limit vertex swimming
    const s = 2.0;
    this.uniforms.uCenter.value.set(Math.round(camera.position.x / s) * s, Math.round(camera.position.z / s) * s);
  }
}
