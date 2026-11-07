// Suspended particles: marine snow, plankton, silt. A fixed cloud that wraps around the camera,
// lit by the same caustic sunlight as everything else (they glitter in the shafts) and by the lamp.
import * as THREE from 'three';
import { U, OPTICS_VERT } from './optics.js';
import { mulberry32 } from './flora/geom.js';

export class Particles {
  constructor(count = 260000, box = 30) {
    const g = new THREE.BufferGeometry();
    const rnd = mulberry32(4242), seeds = new Float32Array(count * 4), pos = new Float32Array(count * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.uniforms = Object.assign({}, U, {
      uBox: { value: box }, uPx: { value: 900 }, uDensity: { value: 1.0 }, uBoost: { value: 0.3 }, uSize: { value: 1.0 },
      uLampOn: { value: 0 }, uLampPos: { value: new THREE.Vector3() }, uLampDir: { value: new THREE.Vector3(0, 0, -1) }, uLampCone: { value: 0.9 },
      uStrobe: { value: 0 },
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform float uBox, uPx, uDensity, uBoost, uSize, uLampOn, uLampCone, uStrobe;
        uniform vec3 uLampPos, uLampDir;
        varying vec4 vCol;
        ${OPTICS_VERT}
        float hgp(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566371 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
        void main() {
          float t = uOptA.x;
          vec3 base = aSeed.xyz * uBox;
          // snow sinks slowly; plankton swims about; all get carried by the current
          float sink = -0.012 - 0.03 * aSeed.w;
          vec3 drift = vec3(uCurrent.x * 0.07, sink, uCurrent.y * 0.07) * t
                     + vec3(sin(t * 0.31 + aSeed.x * 60.0), sin(t * 0.27 + aSeed.y * 60.0) * 0.6, sin(t * 0.37 + aSeed.z * 60.0)) * (0.05 + 0.25 * aSeed.w * aSeed.w);
          vec3 rel = mod(base + drift - cameraPosition + 0.5 * uBox, uBox) - 0.5 * uBox;
          vec3 P = cameraPosition + rel;
          float dist = length(rel);
          float depth = uOptA.y - P.y;
          float vis = step(0.15, depth) * step(aSeed.w, uDensity * uBoost);
          // size classes: mostly tiny, few larger flakes
          float sz = (0.0022 + 0.0075 * pow(aSeed.w, 6.0)) * uSize;
          float px = uPx * sz / max(dist, 0.3);
          gl_PointSize = clamp(px, 1.0, 9.0);
          vec3 dir = rel / max(dist, 1e-3);
          // sunlight with caustics (particles are tiny, so use a soft lod), forward-scattered toward the camera
          vec3 sun = uwSunAtV(P, 1.5) * uSunCol;
          float ph = 0.25 + 4.0 * hgp(dot(dir, uSunDirW), 0.72);
          vec3 lit = sun * ph * 0.55 + uwAmbAtV(P) * uAmbCol * 0.22;
          if (uLampOn > 0.0) {
            vec3 lv = P - uLampPos; float lr = length(lv);
            float cs = dot(lv / max(lr, 0.1), uLampDir);
            float cone = smoothstep(uLampCone, mix(uLampCone, 1.0, 0.5), cs);
            // particles near the lens are lit from behind the camera: strong backscatter
            lit += vec3(0.85, 0.95, 1.0) * exp(-vec3(uExt.z) * lr) * uLampOn * cone / (lr * lr + 0.8) * (0.5 + 1.2 * hgp(dot(lv / max(lr, 0.1), -dir), 0.6)) * 0.22;
          }
          vec3 T, L; uwPathV(cameraPosition, P, T, L);
          float a = vis * (0.35 + 0.65 * smoothstep(0.0, 0.25, aSeed.w)) * min(1.0, px * px);
          vCol = vec4(lit * T * 0.9, a);
          gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec4 vCol;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r = dot(q, q);
          if (r > 1.0) discard;
          float a = smoothstep(1.0, 0.25, r);
          gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false; this.points.renderOrder = 10;
  }
  update(camera, height) {
    this.uniforms.uPx.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
}
