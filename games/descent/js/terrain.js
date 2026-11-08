// Seabed: GPU-baked world data, CPU sampler, geometry clipmap and surface shading.
import * as THREE from 'three';
import { WORLD, WORLDGEN_GLSL } from './worldgen.js';
import { GLSL_NOISE, GLSL_MOSAIC } from './glsl.js';
import { uw } from './optics.js';

const yieldNow = () => new Promise((res) => { const c = new MessageChannel(); c.port1.onmessage = () => res(); c.port2.postMessage(0); });

// ---------------------------------------------------------------------------
// CPU twin of the terrain shader's noise (integer PCG hash, exactly the GLSL one) so the CPU can evaluate the SAME roughness
// displacement the GPU draws. Without it the fish, the camera and the creatures walk on the smooth base heightfield while the
// screen shows up to half a metre of extra rock relief on top of it: everything near rock sinks into the ground.
// ---------------------------------------------------------------------------
const U2F = 2.3283064365386963e-10;
function pcgH21(ix, iz) {                                     // = h21() in glsl.js for an integer lattice point
  let x = (Math.imul(ix, 1664525) + 1013904223) >>> 0, y = (Math.imul(iz, 1664525) + 1013904223) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0; y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0; y = (y ^ (y >>> 16)) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x * U2F;
}
function vn2(px, pz) {                                        // = vn2() in glsl.js
  const fx = Math.floor(px), fz = Math.floor(pz), wx = px - fx, wz = pz - fz;
  const ux = wx * wx * wx * (wx * (wx * 6 - 15) + 10), uz = wz * wz * wz * (wz * (wz * 6 - 15) + 10);
  const a = pcgH21(fx, fz), b = pcgH21(fx + 1, fz), c = pcgH21(fx, fz + 1), d = pcgH21(fx + 1, fz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const sstep = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

export class WorldData {
  constructor(heights, masks) {
    this.h = heights; this.m = masks;
    this.cx = WORLD.sx / WORLD.nx; this.cz = WORLD.sz / WORLD.nz;
  }
  _h(i, j) {
    i = i < 0 ? 0 : i >= WORLD.nx ? WORLD.nx - 1 : i;
    j = j < 0 ? 0 : j >= WORLD.nz ? WORLD.nz - 1 : j;
    return this.h[j * WORLD.nx + i];
  }
  // base seabed elevation (same Catmull-Rom filter as the GPU; allocation-free, it is called thousands of times a frame in the game)
  height(x, z) {
    const tx = (x - WORLD.x0) / this.cx - 0.5, tz = (z - WORLD.z0) / this.cz - 0.5;
    const i0 = Math.floor(tx), j0 = Math.floor(tz), fx = tx - i0, fz = tz - j0;
    const fx2 = fx * fx, fx3 = fx2 * fx, fz2 = fz * fz, fz3 = fz2 * fz;
    const x0 = -0.5 * fx3 + fx2 - 0.5 * fx, x1 = 1.5 * fx3 - 2.5 * fx2 + 1, x2 = -1.5 * fx3 + 2 * fx2 + 0.5 * fx, x3 = 0.5 * fx3 - 0.5 * fx2;
    const z0 = -0.5 * fz3 + fz2 - 0.5 * fz, z1 = 1.5 * fz3 - 2.5 * fz2 + 1, z2 = -1.5 * fz3 + 2 * fz2 + 0.5 * fz, z3 = 0.5 * fz3 - 0.5 * fz2;
    const h = this.h, nx = WORLD.nx, nz = WORLD.nz;
    const ia = i0 - 1 < 0 ? 0 : i0 - 1 >= nx ? nx - 1 : i0 - 1, ib = i0 < 0 ? 0 : i0 >= nx ? nx - 1 : i0;
    const ic = i0 + 1 < 0 ? 0 : i0 + 1 >= nx ? nx - 1 : i0 + 1, id = i0 + 2 < 0 ? 0 : i0 + 2 >= nx ? nx - 1 : i0 + 2;
    let r = 0;
    for (let k = 0; k < 4; k++) {
      let j = j0 + k - 1; j = j < 0 ? 0 : j >= nz ? nz - 1 : j;
      const o = j * nx;
      r += (k === 0 ? z0 : k === 1 ? z1 : k === 2 ? z2 : z3) * (x0 * h[o + ia] + x1 * h[o + ib] + x2 * h[o + ic] + x3 * h[o + id]);
    }
    return r;
  }
  // rock fraction (the 'rock' mask the shader displaces by), bilinear like the GPU's filtered texture read
  rock(x, z) {
    const tx = (x - WORLD.x0) / this.cx - 0.5, tz = (z - WORLD.z0) / this.cz - 0.5;
    let i0 = Math.floor(tx), j0 = Math.floor(tz);
    const fx = tx - i0, fz = tz - j0, nx = WORLD.nx, nz = WORLD.nz;
    const i1 = i0 + 1 < 0 ? 0 : i0 + 1 >= nx ? nx - 1 : i0 + 1, j1 = j0 + 1 < 0 ? 0 : j0 + 1 >= nz ? nz - 1 : j0 + 1;
    i0 = i0 < 0 ? 0 : i0 >= nx ? nx - 1 : i0; j0 = j0 < 0 ? 0 : j0 >= nz ? nz - 1 : j0;
    const m = this.m, a = m[(j0 * nx + i0) * 4 + 2], b = m[(j0 * nx + i1) * 4 + 2], d = m[(j1 * nx + i0) * 4 + 2], e = m[(j1 * nx + i1) * 4 + 2];
    return ((a + (b - a) * fx) * (1 - fz) + (d + (e - d) * fx) * fz) / 255;
  }
  // the rock-roughness displacement terrain.js adds on top of the base heights (octave o: wavelength 3.2 / 2^o, fades out with the
  // clipmap level 'lod'; lod 0 = everything near the camera). Exactly detailH() in TERRAIN_HEIGHT_GLSL.
  detail(x, z, lod = 0) {
    const rock = this.rock(x, z);
    if (rock < 0.02) return 0;
    const ridge = sstep(0.35, 0.80, rock);
    let h = 0, amp = 0.55 * rock * (0.4 + 0.6 * ridge), px = x / 3.2, pz = z / 3.2;
    for (let o = 0; o < 4; o++) {
      const w = 1 - sstep(3 - o, 4 - o, lod);
      const nn = vn2(px, pz);
      h += amp * w * ((o < 2 ? nn + (1 - Math.abs(2 * nn - 1) - nn) * ridge : nn) - 0.5);
      const qx = 0.8 * px + 0.6 * pz, qz = -0.6 * px + 0.8 * pz;           // ROT2 * p * 2 + 13.1
      px = qx * 2 + 13.1; pz = qz * 2 + 13.1; amp *= 0.5;
    }
    return h;
  }
  // what is actually drawn at (x,z) close to the camera: base heights + rock relief. Use this for anything that touches the ground.
  surface(x, z) { return this.height(x, z) + this.detail(x, z, 0); }
  // [sand, reef, rock, seagrass] in 0..1 (bilinear)
  masks(x, z, out = [0, 0, 0, 0]) {
    const tx = (x - WORLD.x0) / this.cx - 0.5, tz = (z - WORLD.z0) / this.cz - 0.5;
    let i0 = Math.floor(tx), j0 = Math.floor(tz);
    const fx = tx - i0, fz = tz - j0;
    const cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
    const i1 = cl(i0 + 1, WORLD.nx), j1 = cl(j0 + 1, WORLD.nz); i0 = cl(i0, WORLD.nx); j0 = cl(j0, WORLD.nz);
    const m = this.m, nx = WORLD.nx;
    for (let c = 0; c < 4; c++) {
      const a = m[(j0 * nx + i0) * 4 + c], b = m[(j0 * nx + i1) * 4 + c], d = m[(j1 * nx + i0) * 4 + c], e = m[(j1 * nx + i1) * 4 + c];
      out[c] = ((a + (b - a) * fx) * (1 - fz) + (d + (e - d) * fx) * fz) / 255;
    }
    return out;
  }
  // gradient (dh/dx, dh/dz) by central differences
  grad(x, z, e = 2.0) {
    return [(this.height(x + e, z) - this.height(x - e, z)) / (2 * e), (this.height(x, z + e) - this.height(x, z - e)) / (2 * e)];
  }
  normal(x, z, e = 2.0) {
    const g = this.grad(x, z, e);
    const n = new THREE.Vector3(-g[0], 1, -g[1]);
    return n.normalize();
  }
}

// ---------------------------------------------------------------------------
// Bake on the GPU in tiles and read back.
// ---------------------------------------------------------------------------
export async function bakeWorld(renderer, onProgress = () => {}) {
  const TILE = 512;
  const rt = new THREE.WebGLRenderTarget(TILE, TILE, {
    type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTile: { value: new THREE.Vector2() }, uMode: { value: 0 },
      uWorld: { value: new THREE.Vector4(WORLD.x0, WORLD.z0, WORLD.sx, WORLD.sz) },
      uTex: { value: new THREE.Vector2(WORLD.nx, WORLD.nz) },
    },
    vertexShader: `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec2 uTile, uTex; uniform vec4 uWorld; uniform int uMode;
      out vec4 outColor;
      ${WORLDGEN_GLSL}
      void main() {
        vec2 texel = uTile + floor(gl_FragCoord.xy);
        vec2 p = uWorld.xy + (texel + 0.5) / uTex * uWorld.zw;
        if (uMode == 0) outColor = vec4(worldHeight(p), 0.0, 0.0, 1.0);
        else outColor = worldMasks(p);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const heights = new Float32Array(WORLD.nx * WORLD.nz);
  const masks = new Uint8Array(WORLD.nx * WORLD.nz * 4);
  const buf = new Float32Array(TILE * TILE * 4);
  const tx = WORLD.nx / TILE, tz = WORLD.nz / TILE, total = tx * tz * 2;
  let done = 0;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  await renderer.compileAsync(scene, cam);                        // a big shader: compile it without blocking the page
  for (let mode = 0; mode < 2; mode++) {
    for (let jz = 0; jz < tz; jz++) for (let ix = 0; ix < tx; ix++) {
      mat.uniforms.uMode.value = mode;
      mat.uniforms.uTile.value.set(ix * TILE, jz * TILE);
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, TILE, TILE, buf);
      for (let y = 0; y < TILE; y++) {
        const row = (jz * TILE + y) * WORLD.nx + ix * TILE;
        for (let x = 0; x < TILE; x++) {
          const s = (y * TILE + x) * 4;
          if (mode === 0) heights[row + x] = buf[s];
          else {
            const d = (row + x) * 4;
            masks[d] = Math.round(Math.min(Math.max(buf[s], 0), 1) * 255);
            masks[d + 1] = Math.round(Math.min(Math.max(buf[s + 1], 0), 1) * 255);
            masks[d + 2] = Math.round(Math.min(Math.max(buf[s + 2], 0), 1) * 255);
            masks[d + 3] = Math.round(Math.min(Math.max(buf[s + 3], 0), 1) * 255);
          }
        }
      }
      done++;
      onProgress(done / total);
      await yieldNow();
    }
  }
  renderer.setRenderTarget(prev);
  rt.dispose(); mat.dispose(); quad.geometry.dispose();
  return new WorldData(heights, masks);
}

// ---------------------------------------------------------------------------
// Clipmap terrain
// ---------------------------------------------------------------------------
const CLIP_N = 256, CLIP_LEVELS = 9, CLIP_CELL0 = 0.0625;

// the seabed height function (base heightfield + rock relief); exported so tests can run the very same code in a fragment shader
export const TERRAIN_HEIGHT_GLSL = /* glsl */`
${GLSL_NOISE}
uniform sampler2D uHeightTex;
uniform sampler2D uMaskTex;
uniform vec4 uWorld;
uniform vec2 uTexSize;

vec4 crw(float t) { float t2 = t * t, t3 = t2 * t; return vec4(-0.5*t3 + t2 - 0.5*t, 1.5*t3 - 2.5*t2 + 1.0, -1.5*t3 + 2.0*t2 + 0.5*t, 0.5*t3 - 0.5*t2); }
float texH(ivec2 ij) { ij = clamp(ij, ivec2(0), ivec2(uTexSize) - 1); return texelFetch(uHeightTex, ij, 0).r; }
float baseH(vec2 xz) {
  vec2 t = (xz - uWorld.xy) / uWorld.zw * uTexSize - 0.5;
  ivec2 i0 = ivec2(floor(t)); vec2 f = t - vec2(i0);
  vec4 wx = crw(f.x), wy = crw(f.y);
  float r = 0.0;
  for (int j = 0; j < LOOPN(4); j++) {
    float row = 0.0;
    for (int i = 0; i < 4; i++) row += wx[i] * texH(i0 + ivec2(i - 1, j - 1));
    r += wy[j] * row;
  }
  return r;
}
// rock roughness displacement; octave o has wavelength 3.2 / 2^o and fades out
// as the continuous LOD (level + morph) makes it unresolvable.
// (sandy ground with a little rock in the mask gets soft undulation only: creased ridges and full height are for real rock, otherwise a
// small fish sees folded sheets of sand with sharp edges)
float detailH(vec2 xz, float lod) {
  float rock = texture(uMaskTex, (xz - uWorld.xy) / uWorld.zw).z;
  if (rock < 0.02) return 0.0;
  float ridge = smoothstep(0.35, 0.80, rock);
  float h = 0.0, amp = 0.55 * rock * mix(0.4, 1.0, ridge);
  vec2 p = xz / 3.2;
  for (int o = 0; o < LOOPN(4); o++) {
    float w = 1.0 - smoothstep(3.0 - float(o), 4.0 - float(o), lod);
    float nn = vn2(p);
    h += amp * w * ((o < 2 ? mix(nn, 1.0 - abs(2.0 * nn - 1.0), ridge) : nn) - 0.5);
    p = ROT2 * p * 2.0 + 13.1; amp *= 0.5;
  }
  return h;
}
float heightAt(vec2 xz, float lod) { return baseH(xz) + detailH(xz, lod); }
`;

const TERRAIN_DECL_VERT = /* glsl */`
${TERRAIN_HEIGHT_GLSL}
uniform float uCell, uLevel, uN;
uniform vec2 uCenter;
varying vec3 vTW;
varying vec3 vTN;
varying float vTL;

void terrainVertex(out vec3 pos, out vec3 nrm, out float lod) {
  vec2 g = position.xy;
  float half_ = uN * 0.5;
  vec2 gc = g - half_;
  float m = max(abs(gc.x), abs(gc.y)) / half_;
  float alpha = smoothstep(0.62, 0.95, m);
  vec2 xz = uCenter + gc * uCell;
  float hF = heightAt(xz, uLevel);
  float h = hF;
  if (alpha > 0.0) {
    vec2 fr = mod(g, 2.0);
    vec2 g0 = g - fr;
    vec2 x00 = uCenter + (g0 - half_) * uCell;
    float s2 = 2.0 * uCell;
    float lc = uLevel + 1.0;
    float h00 = heightAt(x00, lc), h10 = heightAt(x00 + vec2(s2, 0.0), lc);
    float h01 = heightAt(x00 + vec2(0.0, s2), lc), h11 = heightAt(x00 + vec2(s2, s2), lc);
    float hc = mix(mix(h00, h10, 0.5 * fr.x), mix(h01, h11, 0.5 * fr.x), 0.5 * fr.y);
    h = mix(hF, hc, alpha);
  }
  lod = uLevel + alpha;
  float e = uCell;
  vec2 dx = vec2(e, 0.0), dz = vec2(0.0, e);
  vec3 nF = normalize(vec3(heightAt(xz - dx, lod) - heightAt(xz + dx, lod), 2.0 * e, heightAt(xz - dz, lod) - heightAt(xz + dz, lod)));
  if (alpha > 0.001) {
    float e2 = 2.0 * uCell; float lc = uLevel + 1.0;
    vec2 dx2 = vec2(e2, 0.0), dz2 = vec2(0.0, e2);
    vec3 nC = normalize(vec3(heightAt(xz - dx2, lc) - heightAt(xz + dx2, lc), 2.0 * e2, heightAt(xz - dz2, lc) - heightAt(xz + dz2, lc)));
    nF = normalize(mix(nF, nC, alpha));
  }
  pos = vec3(xz.x, h, xz.y);
  nrm = nF;
}
`;

const TERRAIN_DECL_FRAG = /* glsl */`
${GLSL_NOISE}
${GLSL_MOSAIC}
uniform sampler2D uMaskTex;
uniform vec4 uWorld;
varying vec3 vTW;
varying vec3 vTN;
varying float vTL;
float tRough; vec3 tGrad; float tAO;

// asymmetric wave-formed sand ripples (crests roughly along z), two interfering sets + strong warping
// so they never read as a regular corrugation. returns height, dh/dx, dh/dz
vec3 sandRipples(vec2 p, float lam, float amp) {
  vec3 w = fbm2d(p / 3.4, 3);
  vec3 w2 = fbm2d(p / 1.3 + 9.0, 2);
  float warp = 2.4 * (w.x - 0.5) * 6.0 + 0.7 * (w2.x - 0.5) * 3.0;
  float ph = p.x / lam + warp + 0.16 * p.y / lam;
  float dpx = 1.0 / lam + 2.4 * w.y * (6.0 / 3.4) + 0.7 * w2.y * (3.0 / 1.3);
  float dpz = 0.16 / lam + 2.4 * w.z * (6.0 / 3.4) + 0.7 * w2.z * (3.0 / 1.3);
  float a = 6.2831853 * ph;
  // crest strength varies along the crest so ripples fade in and out and bifurcate
  float env = smoothstep(0.25, 0.75, vn2(p * vec2(0.9, 0.55) + 4.0));
  float h = amp * env * (cos(a) + 0.22 * cos(2.0 * a + 0.9));
  float dh = amp * env * 6.2831853 * (-sin(a) - 0.44 * sin(2.0 * a + 0.9));
  return vec3(h, dh * dpx, dh * dpz);
}


// ---- deep-sea sediment micro-relief (all in metres; evaluated only close to the camera) ----
// sinuous feeding trails: a shallow furrow with low levees either side (~10 cm wide)
float trailH(vec2 p) {
  vec2 q0 = p * 0.55 + 31.0;
  vec2 wq = 0.6 * vec2(vn2(p * 0.9), vn2(p * 0.9 + 9.0));
  float tr = abs(fbm2(q0 + wq, 3) - 0.5);
  return -0.020 * smoothstep(0.050, 0.006, tr) + 0.007 * smoothstep(0.050, 0.068, tr) * smoothstep(0.100, 0.068, tr);
}
// burrow openings (round holes with a raised rim) and faecal mounds
vec3 burrowH(vec2 p, out float hole) {
  vec4 w = worley2(p * 2.4 + 17.0);
  float occ = step(0.86, w.z);                                    // ~14 % of cells carry one
  float r = w.x * 0.42;                                           // metres from the nearest feature point (cell ~42 cm)
  float rad = mix(0.025, 0.055, w.w);
  hole = occ * smoothstep(rad, rad * 0.35, r);
  float rim = occ * smoothstep(rad * 0.9, rad * 1.5, r) * smoothstep(rad * 2.6, rad * 1.5, r);
  return vec3(-0.018 * hole + 0.010 * rim, 0.0, 0.0);
}

// scattered pebbles / shell bits: one low oval dome per occupied cell (feature point kept inside the cell so the dome is never cut by a
// neighbour's cell boundary). returns the coverage; g = height gradient of the dome (world units, already masked), c = its colour,
// edge = contact-shadow ring around it.
float pebbles(vec2 P, float scale, float occThr, out vec2 g, out vec3 c, out float edge) {
  vec2 p = P * scale, ip = floor(p), fp = fract(p);
  float f1 = 8.0; vec2 bestR = vec2(0.0), id = vec2(0.0);
  for (int j = -1; j <= LOOPN(1); j++) for (int i = -1; i <= 1; i++) {
    vec2 gg = vec2(float(i), float(j));
    vec2 r = gg + 0.28 + 0.44 * h22(ip + gg) - fp;                // fragment -> feature point
    float d = dot(r, r);
    if (d < f1) { f1 = d; bestR = r; id = ip + gg; }
  }
  float occ = step(occThr, h21(id + 5.7)), rad = mix(0.10, 0.25, h21(id + 31.7)), tint = h21(id + 77.1);
  float ang = 6.2831853 * h21(id + 9.1), e = 1.0 + 0.4 * h21(id + 53.3), ca = cos(ang), sa = sin(ang);
  vec2 q = -bestR, qr = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y);          // oval: stretched along a random axis
  float s = length(vec2(qr.x / e, qr.y)) / rad;
  float cov = occ * (1.0 - smoothstep(0.80, 1.0, s));
  float k = clamp(1.0 - s * s, 0.0, 1.0);
  vec2 gl = -4.0 * (0.5 * rad) * k / (rad * rad) * vec2(qr.x / (e * e), qr.y);    // dome h = hp (1 - s^2)^2, hp = rad / 2
  g = occ * vec2(ca * gl.x - sa * gl.y, sa * gl.x + ca * gl.y);
  vec3 pale = vec3(0.88, 0.85, 0.77), stone = vec3(0.32, 0.29, 0.25);
  c = tint < 0.42 ? mix(pale, vec3(0.95, 0.92, 0.84), fract(tint * 23.0)) : (tint < 0.96 ? mix(stone, vec3(0.50, 0.46, 0.38), fract(tint * 17.0)) : vec3(0.70, 0.52, 0.46));
  c *= 0.88 + 0.24 * h21(id * 3.1 + 11.3);                                        // each pebble its own tone
  edge = occ * smoothstep(0.72, 1.02, s) * (1.0 - smoothstep(1.02, 1.55, s));
  return cov;
}

void terrainSurface(vec3 P, vec3 N, out vec3 albedo, out float rough, out vec3 grad, out float ao) {
  float dist = length(P - cameraPosition);
  vec4 mk = texture(uMaskTex, (P.xz - uWorld.xy) / uWorld.zw);
  float depth = max(-P.y, 0.0);
  float steepR = smoothstep(0.42, 0.78, 1.0 - N.y);
  float drape = smoothstep(70.0, 320.0, depth);                                  // deep water: sediment drapes everything but scarps
  float steep = mix(steepR, steepR * 0.35, drape);
  float sandW = mix(clamp(mk.x, 0.0, 1.0), 1.0, drape * 0.85 * (0.55 + 0.45 * vn2(P.xz / 37.0 + 8.0))) * (1.0 - steep);
  float near = 1.0 - smoothstep(1.5, 16.0, dist);
  float mid  = 1.0 - smoothstep(10.0, 90.0, dist);
  grad = vec3(0.0);
  ao = 1.0;

  // ================= sand =================
  vec3 sandC1 = vec3(0.70, 0.64, 0.50), sandC2 = vec3(0.56, 0.50, 0.37), sandC3 = vec3(0.50, 0.53, 0.38);
  float big = fbm2(P.xz / 5.5, 4);
  float patch_ = fbm2(P.xz / 0.9 + 7.0, 3);
  vec3 sand = mix(sandC1, sandC2, smoothstep(0.35, 0.72, big));
  sand = mix(sand, sandC3, smoothstep(0.55, 0.85, fbm2(P.xz / 13.0 + 3.0, 3)) * 0.5);
  sand *= 0.90 + 0.20 * patch_;
  float lam = mix(0.15, 0.42, vn2(P.xz * 0.045));
  float rAmp = lam * 0.046 * smoothstep(0.8, 3.0, depth) * (1.0 - smoothstep(10.0, 30.0, depth)) * mix(0.5, 1.0, vn2(P.xz * 0.09 + 4.0));
  vec3 rp = sandRipples(P.xz, lam, rAmp);
  vec3 sGrad = vec3(rp.y, 0.0, rp.z);
  float trough = clamp(0.5 - rp.x / max(rAmp * 2.4, 1e-4) * 0.5, 0.0, 1.0);
  sand *= 1.0 - 0.22 * trough * step(0.001, rAmp);
  ao *= 1.0 - 0.18 * trough * step(0.001, rAmp) * (1.0 - smoothstep(2.0, 8.0, dist));
  // sand grains and shell debris. Every layer fades out as its features approach the pixel footprint (nothing shimmers far away) and every
  // pattern is smooth or round: a fry sees the grains 10 pixels wide, so hash-per-cell patterns turn into visible squares.
  float px = max(dist * 0.0016, 1e-4);
  float gF = 1.0 - smoothstep(0.3, 1.1, px / 0.0030);                     // ~3 mm grain
  float gM = 1.0 - smoothstep(0.3, 1.1, px / 0.0150);                     // ~1.5 cm clumps and flecks
  if (near > 0.0) {
    vec2 la = ROT2 * P.xz, lb = ROT2 * la, lc = ROT2 * lb;                  // every layer on its own rotated lattice: no axis-aligned weave
    float g1 = vn2(la * 330.0), g2 = vn2(lb * 120.0 + 3.3), g3 = vn2(lc * 45.0 + 8.1);
    sand *= 1.0 + gF * 0.14 * (g1 - 0.5) + gM * 0.20 * (g2 - 0.5) + near * 0.16 * (g3 - 0.5);
    vec2 bump = gF * 0.02 * vn3d(vec3(lc * 210.0, 1.0)).yw + gM * 0.07 * vn3d(vec3(la * 64.0, 5.0)).yw;
    sGrad.xz += vec2(dot(bump, vec2(0.8, -0.6)), dot(bump, vec2(0.6, 0.8)));  // back to world axes (approx.: the layers are rotated copies)
    // sparse pale shell flecks and dark mineral grains: round specks
    vec4 wf = worley2(P.xz * 70.0);
    sand = mix(sand, vec3(0.88, 0.84, 0.74), smoothstep(0.34, 0.10, wf.x) * step(0.84, wf.z) * gM * 0.55);
    sand *= 1.0 - 0.38 * smoothstep(0.30, 0.08, wf.x) * step(wf.z, 0.06) * gM;
    // pebbles and shell pieces: little domes with their own colour, shading and a dark contact rim
    vec2 pg; vec3 pc; float pe, cv;
    cv = pebbles(P.xz, 9.0, 0.88, pg, pc, pe);
    sand = mix(sand, pc, cv * 0.92) * (1.0 - 0.40 * pe);
    sGrad.xz += pg * near;
    cv = pebbles(P.xz + 3.7, 29.0, 0.80, pg, pc, pe);
    sand = mix(sand, pc, cv * 0.85 * gM) * (1.0 - 0.30 * pe * gM);
    sGrad.xz += pg * gM;
    // feeding pits & burrow mounds in the mid-depth sand
    vec4 wp = worley2(P.xz * 1.9 + 40.0 + 0.35 * vec2(vn2(P.xz * 3.1), vn2(P.xz * 3.1 + 5.0)));
    float pit = smoothstep(0.10, 0.015, wp.x) * step(0.90, wp.z);
    float mound = smoothstep(0.24, 0.10, wp.x) * (1.0 - smoothstep(0.10, 0.05, wp.x)) * step(0.90, wp.z);
    sand *= 1.0 - 0.20 * pit * near + 0.10 * mound * near;
    ao *= 1.0 - 0.35 * pit * near;
  }
  float sandRough = 0.93;

  // ================= rock =================
  vec3 rk = P * vec3(1.0, 1.15, 1.0);
  float r1 = fbm3(rk * 0.9, 4);
  float r2 = fbm3(rk * 3.7 + 9.0, 3);
  vec3 rockBase = mix(vec3(0.24, 0.22, 0.19), vec3(0.42, 0.39, 0.33), smoothstep(0.30, 0.72, r1));
  vec3 turf = mix(vec3(0.20, 0.22, 0.10), vec3(0.32, 0.27, 0.13), vn3(rk * 1.6));
  float turfMask = smoothstep(0.35, 0.65, fbm3(rk * 0.55 + 3.0, 3)) * smoothstep(60.0, 8.0, depth);
  vec3 coral = vec3(0.62, 0.34, 0.40);
  float corMask = smoothstep(0.68, 0.80, fbm3(rk * 1.1 + 21.0, 3)) * smoothstep(90.0, 10.0, depth);
  vec3 rockC = mix(rockBase, turf, turfMask * 0.75);
  rockC = mix(rockC, coral, corMask * 0.6);
  // encrusting community on hard ground
  vec3 mosG = vec3(0.0);
  {
    float cover = clamp(mk.y * 1.6 + 0.30, 0.0, 1.0) * smoothstep(120.0, 6.0, depth) * (1.0 - steep * 0.10);
    vec3 mc; float mao; vec3 mg;
    reefMosaic(rk, rockC, depth, cover, dist, mc, mg, mao);
    rockC = mc; mosG = mg; ao *= mao;
  }
  vec3 rGrad = mosG;
  vec4 f3 = fbm3d(rk * 2.2, 4);
  rGrad += f3.yzw * 0.55;
  float pits = 0.0;
  if (near > 0.0) {
    vec4 w3 = worley3(rk * 11.0);
    pits = smoothstep(0.30, 0.05, w3.x) * smoothstep(0.30, 0.65, fbm3(rk * 1.9 + 41.0, 3));        // clustered, not a uniform dot field
    rockC *= 1.0 - 0.34 * pits * near;
    rGrad += near * 0.4 * f3.yzw + near * 0.18 * fbm3d(rk * 24.0, 3).yzw;
    ao *= 1.0 - 0.35 * pits * near;
    // mm-cm scale detail that only exists when you are close: grain, hairline cracks, turf fuzz
    float nf = 1.0 - smoothstep(0.8, 6.0, dist);
    vec3 q1 = ROT3 * rk, q2 = ROT3 * q1;                                                                 // rotated lattices: no axis-aligned weave when seen up close
    float grain = 0.55 * vn3(q1 * 160.0) + 0.45 * vn3(q2 * 61.0 + 7.0);
    rockC *= 1.0 + nf * 0.30 * (grain - 0.5);
    float cn = abs(fbm3(rk * 2.1 + 5.0 + 0.5 * vec3(vn3(rk * 5.0), vn3(rk * 5.0 + 3.0), vn3(rk * 5.0 + 7.0)), 4) - 0.5);      // contour lines of a warped noise field: winding fissures, not tiles
    float crack = smoothstep(0.016, 0.0, cn) * smoothstep(0.42, 0.68, fbm3(rk * 0.9 + 12.0, 2));
    rockC *= 1.0 - 0.28 * crack * nf;
    ao *= 1.0 - 0.25 * crack * nf;
    rGrad += nf * 0.22 * ((vn3d(q2 * 90.0).yzw * ROT3) * ROT3);
    rockC = mix(rockC, rockC * vec3(1.10, 1.14, 0.90), nf * 0.40 * fbm3(rk * 38.0, 2));
  }
  rockC *= 0.70 + 0.55 * r2;
  ao *= mix(0.42, 1.0, smoothstep(0.15, 0.6, r1 + 0.25 * (r2 - 0.5)));
  float rockRough = 0.86;

  // ================= deep sediment =================
  vec3 mud = mix(vec3(0.150, 0.142, 0.125), vec3(0.250, 0.236, 0.205), fbm2(P.xz / 7.0, 3));
  mud *= 0.78 + 0.44 * fbm2(P.xz / 1.9 + 17.0, 3);                                        // 1-3 m tonal patches: olive silt vs pale foram ooze
  mud = mix(mud, mud * vec3(1.10, 1.14, 1.0), smoothstep(0.55, 0.85, fbm2(P.xz / 4.2 + 88.0, 3)) * 0.6);
  float deepW = smoothstep(110.0, 500.0, depth);
  sand = mix(sand, mud, deepW);
  // sediment burrows and tracks: soft dark pits and pale mounds
  float burrow = smoothstep(0.55, 0.9, vn2(P.xz * 0.9 + 60.0)) * deepW;
  sand *= 1.0 - 0.22 * burrow;
  {                                                                           // bioturbation: trails, burrows, mounds + large tonal patches
    vec3 mb = fbm2d(P.xz / 3.0 + 40.0, 3);                                   // soft mounds and hollows under the lamp
    sGrad.xz += deepW * mid * 0.10 * mb.yz;
    sand *= mix(1.0, 0.80 + 0.40 * vn2(P.xz * 0.35 + 5.0), deepW * mid);
    float dn = deepW * (1.0 - smoothstep(1.0, 9.0, dist));                  // detail weight: strongest near the lamp pool
    if (dn > 0.01) {
      float h0 = trailH(P.xz), e = 0.02;
      vec2 gT = vec2(trailH(P.xz + vec2(e, 0.0)) - h0, trailH(P.xz + vec2(0.0, e)) - h0) / e;
      float hole; vec3 b0 = burrowH(P.xz, hole);
      float hole2; vec2 gB = vec2(burrowH(P.xz + vec2(e, 0.0), hole2).x - b0.x, burrowH(P.xz + vec2(0.0, e), hole2).x - b0.x) / e;
      sGrad.xz += dn * 1.25 * (gT + gB);
      sand *= 1.0 - dn * (0.55 * hole + 3.0 * max(-h0, 0.0));               // holes and furrow floors are darker
      ao *= 1.0 - 0.5 * dn * hole;
      // fine grain + scattered pale tests (foraminifera) and dark pits
      float gr = vn2(P.xz * 380.0);
      sand *= 1.0 + dn * 0.16 * (gr - 0.5);
      float fl = h21(floor(P.xz * 95.0));
      sand = mix(sand, vec3(0.60, 0.58, 0.53), dn * step(0.9925, fl) * 0.55);
      sGrad.xz += dn * 0.07 * vn3d(vec3(P.xz * 120.0, 3.0)).yw;
    }
  }

  // blend: sand over rock
  float wS = smoothstep(0.30, 0.70, sandW);
  albedo = mix(rockC, sand, wS);
  rough = mix(rockRough, sandRough, wS);
  grad = mix(rGrad, sGrad, wS);
  grad *= 1.0 - 0.75 * deepW * wS;
  // sediment dusting the rock in slightly-sandy zones
  albedo = mix(albedo, sand * 0.85, (1.0 - wS) * sandW * 0.35);
}
`;

export class Terrain {
  constructor(renderer, world) {
    this.world = world;
    this.group = new THREE.Group();
    this.levels = [];

    const hTex = new THREE.DataTexture(world.h, WORLD.nx, WORLD.nz, THREE.RedFormat, THREE.FloatType);
    hTex.minFilter = hTex.magFilter = THREE.NearestFilter; hTex.generateMipmaps = false; hTex.needsUpdate = true;
    const mTex = new THREE.DataTexture(world.m, WORLD.nx, WORLD.nz, THREE.RGBAFormat, THREE.UnsignedByteType);
    mTex.minFilter = mTex.magFilter = THREE.LinearFilter; mTex.generateMipmaps = false;
    mTex.wrapS = mTex.wrapT = THREE.ClampToEdgeWrapping; mTex.needsUpdate = true;
    this.heightTex = hTex; this.maskTex = mTex;

    const N = CLIP_N;
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const o = (j * (N + 1) + i) * 3; pos[o] = i; pos[o + 1] = j; pos[o + 2] = 0; }
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.geo = geo;

    const shared = {
      uHeightTex: { value: hTex }, uMaskTex: { value: mTex },
      uWorld: { value: new THREE.Vector4(WORLD.x0, WORLD.z0, WORLD.sx, WORLD.sz) },
      uTexSize: { value: new THREE.Vector2(WORLD.nx, WORLD.nz) },
    };

    for (let L = 0; L < CLIP_LEVELS; L++) {
      const cell = CLIP_CELL0 * Math.pow(2, L);
      const lu = { uCell: { value: cell }, uLevel: { value: L }, uN: { value: N }, uCenter: { value: new THREE.Vector2() } };
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });   // two-sided: a camera that ever ends up under the seabed sees a closed ground, not through it
      uw(mat, 'terrain', (shader) => {
        Object.assign(shader.uniforms, shared, lu);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + TERRAIN_DECL_VERT)
          .replace('#include <beginnormal_vertex>', 'vec3 tPos, tNor; float tLod;\nterrainVertex(tPos, tNor, tLod);\nvec3 objectNormal = tNor;')
          .replace('#include <begin_vertex>', 'vec3 transformed = tPos;\nvTW = tPos; vTN = tNor; vTL = tLod;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\n' + TERRAIN_DECL_FRAG)
          .replace('#include <color_fragment>', '#include <color_fragment>\nterrainSurface(vTW, normalize(vTN), diffuseColor.rgb, tRough, tGrad, tAO);')
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { vec3 Nw = normalize(vTN); vec3 g = tGrad - Nw * dot(tGrad, Nw); normal = normalize(mat3(viewMatrix) * normalize(Nw - g)); }`)
          .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= tAO;');
      });
      // finer levels are drawn first; coarser levels only where nothing has been drawn yet
      mat.stencilWrite = true;
      mat.stencilFunc = THREE.EqualStencilFunc; mat.stencilRef = 0;
      mat.stencilFail = THREE.KeepStencilOp; mat.stencilZFail = THREE.KeepStencilOp; mat.stencilZPass = THREE.IncrementStencilOp;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = -100 + L;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.levels.push({ mesh, uniforms: lu, cell });
    }
  }

  update(camera) {
    const c = camera.position;
    for (const lv of this.levels) {
      const s = lv.cell * 2;
      lv.uniforms.uCenter.value.set(Math.round(c.x / s) * s, Math.round(c.z / s) * s);
    }
  }
}
