// gfx.js — one renderer for the studio and the circuit: HDR scene target, bloom, and a final pass that does the
// tone mapping, the grade and the cinematic effects (flash, fade, speed blur, tile collage).
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const QUAD_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// looks: tm 0 = ACES (circuit), 1 = neutral (studio)
export const LOOKS = {
  track: { tm: 0, exposure: 1.02, bloom: [0.16, 0.7, 3.2], vig: 0.34, grade: 1 },
  studio: { tm: 1, exposure: 1.12, bloom: [0.07, 0.45, 1.35], vig: 0.42, grade: 0 },
};

export class Gfx {
  constructor(canvas, q) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;                 // the final pass tone-maps
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;
    this.q = q; this.canvas = canvas;
    this.cssW = 2; this.cssH = 2; this.dprCap = q.dpr; this.scale = 1; this.w = 2; this.h = 2;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.msaa });
    this.rtCollage = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.bloom = q.bloom ? new UnrealBloomPass(new THREE.Vector2(4, 4), 0.16, 0.7, 3.2) : null;
    this.quad = new FullScreenQuad(null);
    this.look = { ...LOOKS.track };
    this.fx = { flash: 0, fade: 0, blur: 0, chroma: 0, punch: 0, bars: 0 };
    const TAPS = q.blurTaps | 0;
    this.matOut = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        tDiffuse: { value: null }, uTM: { value: 0 }, uExposure: { value: 1 }, uVig: { value: 0.34 }, uGrade: { value: 1 }, uFlash: { value: 0 }, uFade: { value: 0 },
        uBlur: { value: 0 }, uChroma: { value: 0 }, uPunch: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uTime: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float uTM, uExposure, uVig, uGrade, uFlash, uFade, uBlur, uChroma, uPunch, uTime; uniform vec2 uCenter; uniform vec3 uTint;
        varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 color) {
          const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
          const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
          color *= uExposure / 0.6; color = I * color; color = RRTAndODTFit(color); color = O * color; return clamp(color, 0.0, 1.0);
        }
        vec3 neutral(vec3 color) {
          const float StartCompression = 0.8 - 0.04; const float Desaturation = 0.15;
          color *= uExposure;
          float x = min(color.r, min(color.g, color.b)); float offset = x < 0.08 ? x - 6.25 * x * x : 0.04; color -= offset;
          float peak = max(color.r, max(color.g, color.b)); if (peak < StartCompression) return color;
          float d = 1.0 - StartCompression; float newPeak = 1.0 - d * d / (peak + d - StartCompression); color *= newPeak / peak;
          float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0); return mix(color, vec3(newPeak), g);
        }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666)) - 0.055, step(0.0031308, c)); }
        vec3 grab(vec2 uv) {
          #if ${TAPS} > 0
            vec2 d = (uv - uCenter); float n = h(gl_FragCoord.xy + uTime);
            vec3 s = vec3(0.0);
            for (int i = 0; i < ${TAPS}; i++) { float t = (float(i) + n) / float(${TAPS}); s += texture2D(tDiffuse, uv - d * uBlur * t * dot(d, d) * 4.0).rgb; }
            return s / float(${TAPS});
          #else
            return texture2D(tDiffuse, uv).rgb;
          #endif
        }
        void main() {
          vec2 uv = (vUv - 0.5) * (1.0 - uPunch) + 0.5;
          vec3 c;
          if (uChroma > 0.0) { vec2 o = (uv - 0.5) * uChroma; c = vec3(grab(uv + o).r, grab(uv).g, grab(uv - o).b); } else c = grab(uv);
          c = min(c, vec3(60.0)) * uTint;
          c = mix(aces(c), neutral(c), uTM);
          c = toSRGB(c);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          // circuit grade: gentle S-curve, a little saturation, cool shadows / warm highlights. Studio: light film contrast.
          vec3 g1 = mix(c, c * c * (3.0 - 2.0 * c), 0.28); g1 = mix(vec3(l), g1, 1.12); g1 += vec3(-0.006, 0.0, 0.010) * (1.0 - l) + vec3(0.010, 0.004, -0.008) * l;
          vec3 g0 = mix(c, c * c * (3.0 - 2.0 * c), 0.13);
          c = mix(g0, g1, uGrade);
          vec2 q = vUv - 0.5;
          c *= 1.0 - uVig * smoothstep(0.25, 0.95, dot(q, q) * 2.0);
          c += uFlash;
          c *= 1.0 - uFade;
          c += (h(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * 0.012;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    // collage: a grid of stills, each flashing in when it was shot and pushing in slowly afterwards
    this.matCollage = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { tCollage: { value: this.rtCollage.texture }, uN: { value: 3 }, uTime: { value: 0 }, uBirth: { value: new Float32Array(16).fill(1e9) }, uPx: { value: new THREE.Vector2(1, 1) }, uZoom: { value: 1 }, uStrobe: { value: 0 } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tCollage; uniform float uN, uTime, uBirth[16], uZoom, uStrobe; uniform vec2 uPx; varying vec2 vUv;
        void main() {
          vec2 uv = (vUv - 0.5) * uZoom + 0.5;
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
          vec2 g = uv * uN, cell = floor(g), f = fract(g);
          int idx = int(cell.y * uN + cell.x);
          float birth = 1e9;
          for (int i = 0; i < 16; i++) if (i == idx) birth = uBirth[i];
          float age = uTime - birth;
          if (age < 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
          float z = 1.0 / (1.0 + 0.05 * min(age, 6.0));
          vec2 lf = clamp((f - 0.5) * z + 0.5, uPx * uN * 1.5, 1.0 - uPx * uN * 1.5);
          vec3 c = texture2D(tCollage, (cell + lf) / uN).rgb;
          c += vec3(2.4) * exp(-age * 11.0) + uStrobe;
          vec2 e = min(f, 1.0 - f) / (uPx * uN);            // distance to the cell edge in pixels
          c *= smoothstep(1.0, 2.5, min(e.x, e.y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.matCopy = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, toneMapped: false, uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } }, vertexShader: QUAD_VERT,
      fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv; void main() { vec3 c = vec3(0.0); for (int i = 0; i < 4; i++) { vec2 o = vec2(float(i & 1) - 0.5, float(i >> 1) - 0.5) * uTexel; c += texture2D(tDiffuse, vUv + o).rgb; } gl_FragColor = vec4(c * 0.25, 1.0); }' });
    this.time = 0;
  }

  // CSS size of the canvas, and the resolution scale chosen by the performance governor
  setSize(cssW, cssH, scale = this.scale) {
    this.cssW = Math.max(2, cssW); this.cssH = Math.max(2, cssH); this.scale = scale;
    let pr = Math.min(window.devicePixelRatio || 1, this.dprCap) * scale;
    const px = this.cssW * this.cssH * pr * pr, cap = this.q.maxPixels || 1e9;
    if (px > cap) pr *= Math.sqrt(cap / px);
    this.pr = pr;
    this.renderer.setPixelRatio(pr); this.renderer.setSize(this.cssW, this.cssH, false);
    const w = Math.max(2, Math.round(this.cssW * pr)), h = Math.max(2, Math.round(this.cssH * pr));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.rt.setSize(w, h); this.rtCollage.setSize(w, h);
    if (this.bloom) this.bloom.setSize(Math.round(w * (this.q.bloomScale || 1)), Math.round(h * (this.q.bloomScale || 1)));
    this.matCollage.uniforms.uPx.value.set(1 / w, 1 / h);
  }
  setLook(l) { Object.assign(this.look, l); }

  // draw `scene` into the HDR target (the caller may have set a custom render function for the studio)
  renderScene(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 1); r.clear();
    r.render(scene, camera);
  }

  // copy what is in the scene target into one cell of the collage
  stampTile(idx, n, t) {
    const r = this.renderer, u = this.matCollage.uniforms;
    if (u.uN.value !== n) { u.uN.value = n; u.uBirth.value.fill(1e9); }
    const cw = this.w / n, ch = this.h / n, cx = idx % n, cy = Math.floor(idx / n);
    this.matCopy.uniforms.tDiffuse.value = this.rt.texture; this.matCopy.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    this.quad.material = this.matCopy;
    const rc = this.rtCollage; rc.viewport.set(Math.round(cx * cw), Math.round(cy * ch), Math.round(cw), Math.round(ch)); rc.scissor.copy(rc.viewport); rc.scissorTest = true;
    r.setRenderTarget(rc); this.quad.render(r);
    rc.scissorTest = false; rc.viewport.set(0, 0, this.w, this.h);
    u.uBirth.value[idx] = t;
  }
  clearCollage() { this.matCollage.uniforms.uBirth.value.fill(1e9); }
  drawCollage(t, zoom = 1, strobe = 0) {
    const r = this.renderer, u = this.matCollage.uniforms;
    u.uTime.value = t; u.uZoom.value = zoom; u.uStrobe.value = strobe;
    this.quad.material = this.matCollage; r.setRenderTarget(this.rt); this.quad.render(r);
  }

  // bloom + final pass to the screen
  present(dt) {
    const r = this.renderer, L = this.look, u = this.matOut.uniforms, fx = this.fx;
    this.time += dt;
    if (this.bloom && L.bloom[0] > 0) {
      this.bloom.strength = L.bloom[0]; this.bloom.radius = L.bloom[1]; this.bloom.threshold = L.bloom[2];
      this.bloom.render(r, null, this.rt, dt, false);
    }
    u.tDiffuse.value = this.rt.texture; u.uTM.value = L.tm; u.uExposure.value = L.exposure; u.uVig.value = L.vig; u.uGrade.value = L.grade;
    u.uFlash.value = fx.flash; u.uFade.value = fx.fade; u.uBlur.value = fx.blur; u.uChroma.value = fx.chroma; u.uPunch.value = fx.punch; u.uTime.value = this.time;
    this.quad.material = this.matOut; r.setRenderTarget(null); this.quad.render(r);
  }
}
