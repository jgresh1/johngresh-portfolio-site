// Hydrothermal vent field on the abyssal plain: chimneys, tube-worm thickets, black-smoker plumes.
import * as THREE from 'three';
import { U, OPTICS_VERT } from './optics.js';
import { floraMaterial } from './flora/materials.js';
import { chimney, tubeWorms } from './flora/deeplife.js';
import { mulberry32 } from './flora/geom.js';

export const VENT = { x: 6180, z: 240, R: 70 };

export class VentField {
  constructor(scene, world) {
    this.world = world; this.group = new THREE.Group(); scene.add(this.group);
    const rnd = mulberry32(777);
    const cx = VENT.x, cz = VENT.z;

    // ---- chimneys ----
    const chimGeos = [0, 1, 2].map((i) => chimney(3000 + i, { H: 5.5 + 2 * i, R: 0.85 + 0.1 * i }));
    const matC = floraMaterial({ key: 'vent', kinds: [18], roughness: 0.9 });
    this.tops = [];
    const chimMeshes = chimGeos.map((g) => { const m = new THREE.InstancedMesh(g, matC, 12); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(12 * 3), 3); this.group.add(m); return m; });
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, r = (i === 0 ? 0 : 6 + rnd() * 34);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = world.height(x, z);
      const v = i % 3, s = 0.7 + rnd() * 0.7;
      q.setFromAxisAngle(ax, rnd() * 6.28); p.set(x, y - 0.4, z); sc.set(s, s * (0.8 + rnd() * 0.5), s);
      M.compose(p, q, sc);
      const mesh = chimMeshes[v]; const idx = mesh.count++;
      mesh.setMatrixAt(idx, M); mesh.instanceColor.setXYZ(idx, 1, 1, 1);
      const H = chimGeos[v].boundingBox.max.y * sc.y;
      this.tops.push(new THREE.Vector3(x, y - 0.4 + H, z));
    }
    chimMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });

    // ---- tube worm thickets around the chimneys ----
    const wormGeos = [0, 1, 2].map((i) => tubeWorms(3100 + i, { n: 24 + 4 * i, L: 0.7 + 0.15 * i }));
    const matW = floraMaterial({ key: 'worm', kinds: [19], roughness: 0.5, sway: 0.09, swayMode: 2, swayHeight: 1.0, side: THREE.DoubleSide, transl: 0.6 });
    const wormMeshes = wormGeos.map((g) => { const m = new THREE.InstancedMesh(g, matW, 90); m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(90 * 3), 3); this.group.add(m); return m; });
    for (let i = 0; i < 150; i++) {
      const t = this.tops[Math.floor(rnd() * this.tops.length)];
      const a = rnd() * 6.28, r = 0.6 + Math.pow(rnd(), 0.7) * 9;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r, y = world.height(x, z);
      const v = Math.floor(rnd() * 3), s = 0.6 + rnd() * 1.1;
      const mesh = wormMeshes[v]; if (mesh.count >= 90) continue;
      q.setFromAxisAngle(ax, rnd() * 6.28); p.set(x, y - 0.03, z); sc.set(s, s * (0.8 + rnd() * 0.5), s);
      M.compose(p, q, sc); const idx = mesh.count++;
      mesh.setMatrixAt(idx, M); mesh.instanceColor.setXYZ(idx, 0.9 + 0.1 * rnd(), 0.9 + 0.1 * rnd(), 0.9 + 0.1 * rnd());
    }
    wormMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });

    // ---- black smoke ----
    const count = 1500;
    const seeds = new Float32Array(count * 4); for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    this.smoke = [];
    for (let k = 0; k < this.tops.length; k++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
      const uniforms = Object.assign({}, U, { uTop: { value: this.tops[k].clone() }, uPx: { value: 900 }, uT0: { value: rnd() * 40 },
        uLampOn: { value: 0 }, uLampPos: { value: new THREE.Vector3() }, uLampDir: { value: new THREE.Vector3(0, 0, -1) }, uLampCone: { value: 0.8 } });
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */`
          attribute vec4 aSeed; uniform vec3 uTop; uniform float uPx, uT0, uLampOn, uLampCone; uniform vec3 uLampPos, uLampDir;
          varying vec4 vCol; varying float vSd;
          ${OPTICS_VERT}
          void main() {
            float t = uOptA.x * 0.06 + uT0;
            float age = fract(t + aSeed.x);                          // 0 at the orifice -> 1 at the top of the plume
            float ang = aSeed.y * 6.2831853 + age * 2.0;
            float rad = (0.10 + 2.6 * pow(age, 1.5)) * (0.35 + aSeed.z);
            vec3 P = uTop + vec3(cos(ang) * rad, age * 24.0 * (0.7 + 0.5 * aSeed.w), sin(ang) * rad);
            P.xz += 0.25 * age * vec2(sin(t * 6.0 + aSeed.y * 30.0 + age * 9.0), cos(t * 5.0 + aSeed.x * 30.0 + age * 8.0)) * 3.0;
            P.xz += uCurrent.xy * age * age * 6.0;
            float dist = length(P - cameraPosition);
            float size = 0.55 + 4.6 * pow(age, 0.85);
            float px = uPx * size / max(dist, 0.5);
            gl_PointSize = clamp(px, 2.0, 220.0);
            // dark smoke: mostly absorbs; lit faintly by the lamp
            vec3 lit = vec3(0.004, 0.004, 0.0045);
            if (uLampOn > 0.0) { vec3 lv = P - uLampPos; float lr = length(lv); float cs = dot(lv / max(lr, 0.1), uLampDir); float cone = smoothstep(uLampCone, mix(uLampCone, 1.0, 0.5), cs); lit += vec3(0.40, 0.38, 0.36) * uLampOn * cone / (lr * lr + 1.5) * 1.3 * (1.0 - 0.55 * exp(-age * 2.5)); }
            lit = mix(lit, vec3(dot(lit, vec3(0.333))), 0.8) * 0.7;                     // mineral smoke scatters grey, not the lamp's water-tinted colour
            vec3 T, L; uwPathV(cameraPosition, P, T, L);
            T = mix(T, vec3(dot(T, vec3(0.333))), 0.6);
            float a = pow(1.0 - age, 0.8) * smoothstep(0.0, 0.03, age) * 0.50;
            vCol = vec4(lit * T + L * (1.0 - a * 0.0), a);
            vSd = aSeed.z * 31.0 + aSeed.w * 17.0;
            gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
          }`,
        fragmentShader: /* glsl */`
          precision highp float; varying vec4 vCol; varying float vSd;
          float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
          void main() {
            vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard;
            float n = 0.55 * vn(q * 2.6 + vSd) + 0.30 * vn(q * 5.5 + vSd * 1.7) + 0.15 * vn(q * 11.0 + vSd * 2.3);          // billowy, ragged puff
            float a = smoothstep(1.0, 0.1, r + (0.5 - n) * 0.9) * vCol.a;
            gl_FragColor = vec4(vCol.rgb, clamp(a, 0.0, 1.0));
          }`,
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      });
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 8;
      this.group.add(pts); this.smoke.push({ pts, mat });
    }
  }
  update(camera, height, lamp) {
    const px = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const s of this.smoke) {
      const u = s.mat.uniforms; u.uPx.value = px;
      u.uLampOn.value = lamp.on; u.uLampPos.value.copy(lamp.pos); u.uLampDir.value.copy(lamp.dir); u.uLampCone.value = lamp.cone;
    }
  }
}
