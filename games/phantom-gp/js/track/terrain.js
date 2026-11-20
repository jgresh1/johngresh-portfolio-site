// terrain.js — LiDAR terrain: 2 m near grid in LOD chunks + 20 m far grid. Near the circuit the ground is drawn from
// surface classes (grass, tarmac, gravel, earth, run-off paint) with procedural materials; far from it, from the orthophoto.
import * as THREE from 'three';
import { W, MESH } from './world.js';
import { asphaltMaps, grassMaps, gravelMaps, noiseTex } from './tex.js';

function meanLinear(tex) {
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const x = c.getContext('2d'); x.drawImage(tex.image, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
  const lin = (v) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < 64; i++) { r += lin(d[i * 4]); g += lin(d[i * 4 + 1]); b += lin(d[i * 4 + 2]); }
  return new THREE.Vector3(r / 64, g / 64, b / 64);
}

// several same-sized canvas textures as the layers of one array texture
function layers(texs, srgb) {
  const w = texs[0].image.width, h = texs[0].image.height, data = new Uint8Array(w * h * 4 * texs.length);
  texs.forEach((t, k) => {
    const d = t.image.getContext('2d').getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) data.set(d.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), (k * h + y) * w * 4);     // rows flipped, as canvas textures are
  });
  const a = new THREE.DataArrayTexture(data, w, h, texs.length);
  a.format = THREE.RGBAFormat; a.type = THREE.UnsignedByteType;
  if (srgb) a.colorSpace = THREE.SRGBColorSpace;
  a.wrapS = a.wrapT = THREE.RepeatWrapping; a.generateMipmaps = true;
  a.minFilter = THREE.LinearMipmapLinearFilter; a.magFilter = THREE.LinearFilter; a.anisotropy = 16;
  a.needsUpdate = true;
  return a;
}

export const groundUniforms = {};

/* How far every point near the circuit is from its centre line (metres, to 90), on a 2 m grid over the near
   rectangle. The mowing stripes and the raked lines in the gravel run along its contours, so they follow the track
   the way a mower and a rake do. Each station first marks the cells across from it, then every marked cell takes
   its exact distance to the centre line close to that station. */
function distanceTex() {
  const n = W.meta.near, w = Math.round(n.w / 2), h = Math.round(n.h / 2), FAR = 90, N = W.N;
  const near = new Int32Array(w * h).fill(-1), best = new Float32Array(w * h).fill(FAR);
  for (let i = 0; i < N; i++) {
    const rx = -W.dz[i], rz = W.dx[i];
    for (let d = -FAR; d <= FAR; d += 1) {
      const px = Math.floor((W.tx[i] + rx * d - n.x0) / 2), pz = Math.floor((W.tz[i] + rz * d - n.z0) / 2);
      if (px < 0 || pz < 0 || px >= w || pz >= h) continue;
      const q = pz * w + px, a = Math.abs(d); if (a < best[q]) { best[q] = a; near[q] = i; }
    }
  }
  for (let pass = 0; pass < 2; pass++) {                    // cells the fans of rays stepped over (outside of bends)
    const add = [];
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const q = j * w + i; if (near[q] >= 0) continue;
      const m = Math.max(near[q - 1], near[q + 1], near[q - w], near[q + w]); if (m >= 0) add.push(q, m);
    }
    for (let k = 0; k < add.length; k += 2) near[add[k]] = add[k + 1];
  }
  const out = new Uint16Array(w * h), far16 = THREE.DataUtils.toHalfFloat(FAR);
  for (let q = 0; q < w * h; q++) {
    const i0 = near[q]; if (i0 < 0) { out[q] = far16; continue; }
    const x = n.x0 + (q % w + 0.5) * 2, z = n.z0 + (Math.floor(q / w) + 0.5) * 2;
    let m = 1e9;
    for (let k = -5; k < 5; k++) {
      const a = (i0 + k + N) % N, b = (a + 1) % N, ex = W.tx[b] - W.tx[a], ez = W.tz[b] - W.tz[a];
      const t = Math.min(1, Math.max(0, ((x - W.tx[a]) * ex + (z - W.tz[a]) * ez) / (ex * ex + ez * ez || 1)));
      m = Math.min(m, Math.hypot(x - W.tx[a] - ex * t, z - W.tz[a] - ez * t));
    }
    out[q] = THREE.DataUtils.toHalfFloat(Math.min(m, FAR));
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
// farStep: far grid, 1 = every 20 m survey point, n = every n-th away from the circuit (phones).
// detail: size of the close-up grain maps (1, or 0.5 on phones). The near grid's spacing is MESH.step in world.js.
export const TERRAIN = { farStep: 1, detail: 1 };

export function makeGroundMaterial(near, shoulder = false) {
  const U = groundUniforms;
  if (!U.tNear) {
    const g = grassMaps(), a = asphaltMaps(), gr = gravelMaps();
    // phones take the grain maps at half size (a quarter of the memory): drawn at full size, then reduced, so the grain keeps its scale
    if (TERRAIN.detail !== 1) for (const m of [g, a, gr]) for (const key of ['map', 'normalMap']) {
      const t = m[key], c = document.createElement('canvas'); c.width = Math.round(t.image.width * TERRAIN.detail); c.height = Math.round(t.image.height * TERRAIN.detail);
      c.getContext('2d').drawImage(t.image, 0, 0, c.width, c.height); t.image = c; t.needsUpdate = true;
    }
    const n = W.meta.near, q = W.meta.far;
    // run-off paint colours found in the survey photo (linear); unused slots repeat the first
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const src = W.ground.palette.length ? W.ground.palette : [[0.5, 0.5, 0.5]];
    const pal = [0, 1, 2, 3].map((i) => new THREE.Vector3(...(src[i] || src[0]).map(lin)));
    Object.assign(U, {
      tNear: { value: W.tNear }, tFar: { value: W.tFar }, tMask: { value: W.tMask }, tPaint: { value: W.tPaint }, tTone: { value: W.tTone },
      uPal: { value: pal }, uPalDir: { value: pal.map((c) => c.clone().normalize()) },
      uMaskPx: { value: new THREE.Vector2(W.tMask.image.width, W.tMask.image.height) },
      uPaintPx: { value: new THREE.Vector2(W.tPaint.image.width, W.tPaint.image.height) },
      tGrass: { value: g.map }, tGrassN: { value: g.normalMap }, tAsph: { value: a.map }, tAsphN: { value: a.normalMap },
      tGravel: { value: gr.map }, tGravelN: { value: gr.normalMap }, tNoise: { value: noiseTex() },
      tDet: { value: layers([g.map, a.map, gr.map], true) }, tDetN: { value: layers([g.normalMap, a.normalMap, gr.normalMap], false) },
      uNearRect: { value: new THREE.Vector4(n.x0, n.z0, 1 / n.w, 1 / n.h) },
      uFarRect: { value: new THREE.Vector4(q.x0, q.z0, 1 / q.w, 1 / q.h) },
      uGrassMean: { value: meanLinear(g.map) }, uAsphMean: { value: meanLinear(a.map) }, uGravelMean: { value: meanLinear(gr.map) },
      tDist: { value: TERRAIN.detail === 1 ? distanceTex() : null },          // not on phones
    });
    W.detail = { grass: g, asphalt: a, gravel: gr };
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0, envMapIntensity: 1 });
  mat.polygonOffset = true; mat.polygonOffsetFactor = 1; mat.polygonOffsetUnits = 6;
  mat.defines = near ? { GROUND_NEAR: 1 } : {};
  if (shoulder) mat.defines.GROUND_SHOULDER = 1;
  if (near && U.tDist.value) mat.defines.GROUND_MOW = 1;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    // shoulder strips read the photo / masks a little further out, so the photo's own edge line and kerb never bleed onto the verge
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n#ifdef GROUND_SHOULDER\nattribute vec2 aShift; varying vec2 vShift;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef GROUND_SHOULDER\nvShift = aShift;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        uniform sampler2D tNear, tFar, tMask, tPaint, tTone, tNoise;
        #ifdef GROUND_MOW
        uniform sampler2D tDist;
        #endif
        uniform sampler2DArray tDet, tDetN;                // close-up grain: layer 0 grass, 1 tarmac, 2 gravel (one unit each; the fragment stage has 16)
        uniform vec4 uNearRect, uFarRect;
        uniform vec3 uGrassMean, uAsphMean, uGravelMean;
        uniform vec3 uPal[ 4 ], uPalDir[ 4 ];
        uniform vec2 uMaskPx, uPaintPx;
        #ifdef GROUND_SHOULDER
        varying vec2 vShift;
        #endif
        vec3 gDetailN; float gRough;
        // coverage -> crisp edge when the texture is magnified, plain coverage when it is minified
        float gEdge( float c, float k ) { return smoothstep( 0.5 - k, 0.5 + k, c ); }`)
      .replace('#include <map_fragment>', /* glsl */`
        vec3 gwp = vFogWorld;
        vec2 gxz = gwp.xz;
        #ifdef GROUND_SHOULDER
          gxz += vShift;
        #endif
        vec2 uvF = ( gxz - uFarRect.xy ) * uFarRect.zw;
        vec3 photo = texture2D( tFar, uvF ).rgb;
        vec4 msk = vec4( 0.0 );
        vec4 tone = vec4( 0.5, 0.0, 0.62, 0.0 );
        vec3 pnt = vec3( 0.0 );
        float zone = 0.0, kM = 0.1, kP = 0.1;                // zone: 1 = ground drawn from the surface classes, 0 = from the photo
        float mowD = 90.0, mowK = 1.0;                       // metres from the circuit's centre line, and how fast that changes across a pixel
        float gDist = length( gwp - cameraPosition );
        float gDet = 1.0 - smoothstep( 30.0, 240.0, gDist );
        float gDetFar = 1.0 - smoothstep( 300.0, 1400.0, gDist );
        vec3 nz = texture2D( tNoise, gwp.xz / 97.0 ).rgb;
        #ifdef GROUND_NEAR
          vec2 uvN = ( gxz - uNearRect.xy ) * uNearRect.zw;
          vec2 ge = min( uvN, 1.0 - uvN );
          float inNear = smoothstep( 0.0, 0.012, min( ge.x, ge.y ) );
          photo = mix( photo, texture2D( tNear, uvN ).rgb, inNear );
          msk = texture2D( tMask, uvN );
          msk.a = ( 1.0 - msk.a ) * 1.275;                   // bare earth is stored as 255 - 200 x coverage
          msk *= inNear;
          tone = texture2D( tTone, uvN );
          zone = clamp( ( tone.a - 0.157 ) / 0.843, 0.0, 1.0 ) * inNear;
          pnt = texture2D( tPaint, uvN ).rgb * inNear;
          vec2 fw = fwidth( uvN );
          kM = clamp( 0.5 * max( fw.x * uMaskPx.x, fw.y * uMaskPx.y ), 0.035, 0.5 );
          kP = clamp( 0.5 * max( fw.x * uPaintPx.x, fw.y * uPaintPx.y ), 0.035, 0.5 );
          #ifdef GROUND_MOW
            mowD = texture2D( tDist, uvN ).r; mowK = max( fwidth( mowD ), 1e-3 );
          #endif
        #endif
        float paved = gEdge( msk.r, kM );
        float gravel = gEdge( msk.g, kM ) * ( 1.0 - paved );
        float soil = gEdge( msk.a, kM ) * ( 1.0 - paved ) * ( 1.0 - gravel ) * zone;
        float sdT = ( msk.b - 0.5 ) * 24.0;                 // metres inside (+) the forest canopy edge
        float under = smoothstep( -0.6, 2.0, sdT );
        float deep = smoothstep( 4.0, 10.0, sdT );
        float openP = ( 1.0 - paved ) * ( 1.0 - gravel );
        float open = openP * ( 1.0 - soil );

        // ---- far from the circuit: the photo, calmed down
        vec3 alb = photo * 0.60;
        float pmx = max( photo.r, max( photo.g, photo.b ) ), pmn = min( photo.r, min( photo.g, photo.b ) );
        float painted = smoothstep( 0.09, 0.22, ( pmx - pmn ) / max( pmx, 1e-3 ) );
        float pavP = 0.082 + 0.15 * dot( alb, vec3( 0.30, 0.59, 0.11 ) );
        alb = mix( alb, vec3( pavP ) * vec3( 0.80, 0.795, 0.79 ), paved * ( 1.0 - painted ) * 0.88 );
        vec3 turf = vec3( 0.050, 0.082, 0.024 ) * ( 0.78 + 0.5 * nz.b );
        float pl = dot( photo, vec3( 0.3, 0.6, 0.1 ) );
        float green = smoothstep( 0.0, 0.035, photo.g - max( photo.r, photo.b ) );
        alb = mix( alb, turf * clamp( pl / 0.17, 0.75, 1.35 ), 0.28 * openP * green * gDetFar * ( 1.0 - under ) );
        alb = mix( alb, turf, under * openP );
        alb *= mix( vec3( 1.0 ), vec3( 0.70, 0.665, 0.59 ), gravel );

        // ---- near the circuit: every surface is a material, the photo is not used
        vec3 grassC = mix( vec3( 0.058, 0.096, 0.028 ), vec3( 0.110, 0.104, 0.046 ), tone.g * 0.85 ) * mix( 1.0, tone.r * 1.992, 0.75 ) * ( 0.86 + 0.28 * nz.b );
        // a lawn is not one colour: thick and thin growth, drier patches, darker clover
        vec3 nzm = texture2D( tNoise, gwp.xz / 27.0 + 0.19 ).rgb;
        grassC *= 0.86 + 0.28 * nzm.r;
        grassC = mix( grassC, grassC * vec3( 1.16, 1.06, 0.78 ), 0.4 * smoothstep( 0.55, 0.8, nzm.b ) );
        grassC = mix( grassC, grassC * vec3( 0.74, 0.93, 0.80 ), 0.6 * smoothstep( 0.58, 0.8, texture2D( tNoise, gwp.xz / 61.0 + 0.4 ).g ) );
        #ifdef GROUND_MOW
        {
          // mown in passes that follow the track; the grass lies the other way on every second pass
          float tri = abs( fract( mowD / 2.7 ) - 0.5 ) * 2.0;
          float stripe = smoothstep( 0.5 - mowK / 1.35, 0.5 + mowK / 1.35, tri ) - 0.5;
          grassC *= 1.0 + 0.15 * stripe * ( 1.0 - smoothstep( 34.0, 52.0, mowD ) );
        }
        #endif
        grassC = mix( grassC, turf * 0.9, under );
        float pavL = 0.082 + 0.09 * pow( tone.b, 2.2 );
        vec3 hardC = vec3( pavL ) * vec3( 0.80, 0.795, 0.79 );
        float pl2 = dot( pnt, pnt );
        if ( pl2 > 0.0004 ) {
          vec3 pd = pnt * inversesqrt( pl2 ), pc = uPal[ 0 ];
          float best = -1.0;
          for ( int i = 0; i < 4; i ++ ) { float d = dot( pd, uPalDir[ i ] ); if ( d > best ) { best = d; pc = uPal[ i ]; } }
          float pa = gEdge( clamp( dot( pnt, pc ) / dot( pc, pc ), 0.0, 1.0 ), kP );
          // run-off paint: worn thin in patches, so the tarmac greys it
          float pw = smoothstep( 0.42, 0.72, texture2D( tNoise, gwp.xz / 9.0 ).g * 0.55 + nz.r * 0.55 );
          hardC = mix( hardC, pc * 0.52 * ( 0.84 + 0.26 * nz.r ), pa * ( 1.0 - 0.5 * pw ) );
        }
        vec3 gravC = vec3( 0.275, 0.258, 0.225 ) * ( 0.9 + 0.2 * nz.g );
        #ifdef GROUND_MOW
          // a gravel bed is raked along the track: ridges every 40 cm, lit on one side
          gravC *= 1.0 + 0.16 * sin( mowD * 15.708 ) * gDet * ( 1.0 - smoothstep( 0.1, 0.25, mowK ) );
        #endif
        vec3 soilC = vec3( 0.128, 0.104, 0.074 ) * ( 0.78 + 0.44 * nz.g );
        vec3 made = grassC * open + hardC * paved + gravC * gravel + soilC * soil;
        alb = mix( alb, made, zone );

        // close-up detail adds grain
        vec3 dG = texture( tDet, vec3( gwp.xz / 3.1, 0.0 ) ).rgb / uGrassMean;
        vec3 dG2 = texture( tDet, vec3( gwp.xz / 23.0 + 0.37, 0.0 ) ).rgb / uGrassMean;
        vec3 dA = texture( tDet, vec3( gwp.xz / 2.0, 1.0 ) ).rgb / uAsphMean;
        vec3 dV = texture( tDet, vec3( gwp.xz / 1.6, 2.0 ) ).rgb / uGravelMean;
        vec3 dS = texture( tDet, vec3( gwp.xz / 4.3 + 0.21, 2.0 ) ).rgb / uGravelMean;
        vec3 det = mix( mix( vec3( 1.0 ), dG2, 0.45 * gDetFar ) * mix( vec3( 1.0 ), dG, 0.85 * gDet ), dA, paved );
        det = mix( det, dV, gravel );
        det = mix( det, mix( vec3( 1.0 ), dS, 0.7 ), soil );
        alb *= mix( vec3( 1.0 ), det, max( gDet, 0.5 * gDetFar ) );
        alb *= 0.9 + 0.2 * nz.r;
        vec3 floorC = vec3( 0.058, 0.052, 0.032 ) * ( 0.7 + 0.6 * nz.g );     // needle litter
        alb = mix( alb, floorC, deep * open );
        diffuseColor.rgb = alb;
        gRough = mix( mix( mix( 0.94, 0.84, paved ), 0.97, gravel ), 0.96, soil );
        vec3 nG = texture( tDetN, vec3( gwp.xz / 3.1, 0.0 ) ).xyz * 2.0 - 1.0;
        vec3 nA = texture( tDetN, vec3( gwp.xz / 2.0, 1.0 ) ).xyz * 2.0 - 1.0;
        vec3 nV = texture( tDetN, vec3( gwp.xz / 1.6, 2.0 ) ).xyz * 2.0 - 1.0;
        gDetailN = mix( mix( nG * vec3( 1.1, 1.1, 1.0 ), nA * vec3( 0.55, 0.55, 1.0 ), paved ), nV * vec3( 1.2, 1.2, 1.0 ), max( gravel, soil * 0.7 ) ) * gDet;
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        normal = normalize( normal + ( viewMatrix * vec4( gDetailN.x, 0.0, gDetailN.y, 0.0 ) ).xyz * 0.55 );`);
  };
  mat.customProgramCacheKey = () => 'ground' + (near ? 1 : 0) + (shoulder ? 's' : '');
  return mat;
}

const CH = 64;

export function buildTerrain(scene) {
  const n = W.meta.near, nx = n.nx, ny = n.ny, h = W.hNear, hs = W.hScale, h0 = W.hMin;
  const H = (i, j) => h[Math.min(Math.max(j, 0), ny - 1) * nx + Math.min(Math.max(i, 0), nx - 1)] * hs + h0;
  const matNear = makeGroundMaterial(true), matFar = makeGroundMaterial(false);
  const chunks = [];
  const group = new THREE.Group(); group.name = 'terrain';
  for (let cj = 0; cj * CH < ny - 1; cj++) for (let ci = 0; ci * CH < nx - 1; ci++) {
    const i0 = ci * CH, j0 = cj * CH, cw = Math.min(CH, nx - 1 - i0), chh = Math.min(CH, ny - 1 - j0);
    // the chunk's own vertex grid: every MESH.step-th survey point (2 m on desktops, 4 m on phones), and its far edge
    const gx = [], gz = []; for (let i = 0; i < cw; i += MESH.step) gx.push(i); gx.push(cw); for (let j = 0; j < chh; j += MESH.step) gz.push(j); gz.push(chh);
    const w = gx.length - 1, hh = gz.length - 1;
    const vw = w + 1, vh = hh + 1, nv = vw * vh, ns = 2 * (vw + vh);
    const pos = new Float32Array((nv + ns) * 3), nor = new Float32Array((nv + ns) * 3);
    let ymin = 1e9, ymax = -1e9;
    for (let j = 0; j < vh; j++) for (let i = 0; i < vw; i++) {
      // position from the mesh heights (held down under the road and verge); the normal stays the surveyed slope
      const gi = i0 + gx[i], gj = j0 + gz[j], k = (j * vw + i) * 3, y = W.hMesh[gj * nx + gi];
      pos[k] = n.x0 + gi * 2; pos[k + 1] = y; pos[k + 2] = n.z0 + gj * 2;
      const sx = (H(gi + 1, gj) - H(gi - 1, gj)) / 4, sz = (H(gi, gj + 1) - H(gi, gj - 1)) / 4, l = Math.hypot(sx, 1, sz);
      nor[k] = -sx / l; nor[k + 1] = 1 / l; nor[k + 2] = -sz / l;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
    // skirt ring: bottom (j=0), top (j=hh), left (i=0), right (i=w)
    const sk = { b: nv, t: nv + vw, l: nv + 2 * vw, r: nv + 2 * vw + vh };
    const put = (dst, src) => { for (let c = 0; c < 3; c++) { pos[dst * 3 + c] = pos[src * 3 + c]; nor[dst * 3 + c] = nor[src * 3 + c]; } pos[dst * 3 + 1] -= 9; };
    for (let i = 0; i < vw; i++) { put(sk.b + i, i); put(sk.t + i, hh * vw + i); }
    for (let j = 0; j < vh; j++) { put(sk.l + j, j * vw); put(sk.r + j, j * vw + w); }
    const mk = (step) => {
      const xs = [], zs = [];
      for (let i = 0; i < w; i += step) xs.push(i); xs.push(w);
      for (let j = 0; j < hh; j += step) zs.push(j); zs.push(hh);
      const idx = [];
      for (let b = 0; b < zs.length - 1; b++) for (let a = 0; a < xs.length - 1; a++) {
        const p = zs[b] * vw + xs[a], q = zs[b] * vw + xs[a + 1], r = zs[b + 1] * vw + xs[a], s = zs[b + 1] * vw + xs[a + 1];
        idx.push(p, r, q, q, r, s);
      }
      for (let a = 0; a < xs.length - 1; a++) {
        const p = xs[a], q = xs[a + 1];
        idx.push(p, q, sk.b + p, q, sk.b + q, sk.b + p);
        const tp = hh * vw + p, tq = hh * vw + q;
        idx.push(tp, sk.t + p, tq, tq, sk.t + p, sk.t + q);
      }
      for (let b = 0; b < zs.length - 1; b++) {
        const p = zs[b], q = zs[b + 1];
        idx.push(p * vw, sk.l + p, q * vw, q * vw, sk.l + p, sk.l + q);
        idx.push(p * vw + w, q * vw + w, sk.r + p, q * vw + w, sk.r + q, sk.r + p);
      }
      return nv + ns > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
    };
    const pa = new THREE.BufferAttribute(pos, 3), na = new THREE.BufferAttribute(nor, 3);
    const bs = new THREE.Sphere(new THREE.Vector3(n.x0 + (i0 + cw / 2) * 2, (ymin + ymax) / 2, n.z0 + (j0 + chh / 2) * 2), Math.hypot(cw, chh) + (ymax - ymin) / 2 + 10);
    const lods = [1, Math.max(2, Math.round(4 / MESH.step))].map((step) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', pa); g.setAttribute('normal', na); g.setIndex(new THREE.BufferAttribute(mk(step), 1));
      g.boundingSphere = bs;
      const m = new THREE.Mesh(g, matNear);
      m.receiveShadow = true; m.castShadow = true; m.matrixAutoUpdate = false;
      group.add(m); return m;
    });
    lods[1].visible = false;
    chunks.push({ c: bs.center, lods });
  }

  // far grid with a hole where the near grid sits
  const q = W.meta.far, fx = q.nx, fy = q.ny, fh = W.hFar, [c0, c1, r0, r1] = q.hole;
  const FH = (i, j) => fh[Math.min(Math.max(j, 0), fy - 1) * fx + Math.min(Math.max(i, 0), fx - 1)] * hs + h0;
  const fpos = new Float32Array(fx * fy * 3), fnor = new Float32Array(fx * fy * 3);
  for (let j = 0; j < fy; j++) for (let i = 0; i < fx; i++) {
    const k = (j * fx + i) * 3;
    fpos[k] = q.x0 + i * q.step; fpos[k + 1] = FH(i, j); fpos[k + 2] = q.z0 + j * q.step;
    const sx = (FH(i + 1, j) - FH(i - 1, j)) / 40, sz = (FH(i, j + 1) - FH(i, j - 1)) / 40, l = Math.hypot(sx, 1, sz);
    fnor[k] = -sx / l; fnor[k + 1] = 1 / l; fnor[k + 2] = -sz / l;
  }
  const fidx = [], st = Math.max(1, TERRAIN.farStep | 0);
  // full detail in a frame round the near grid, st x st blocks beyond it
  const C0 = Math.max(0, Math.floor(c0 / st) * st - st), C1 = Math.min(fx - 1, Math.ceil(c1 / st) * st + st), R0 = Math.max(0, Math.floor(r0 / st) * st - st), R1 = Math.min(fy - 1, Math.ceil(r1 / st) * st + st);
  if (st > 1) {
    // points on the frame that the coarse blocks skip are moved onto the coarse edge, so no gap can open there
    const fix = (i, j, ai, aj, bi, bj, t) => { fpos[(j * fx + i) * 3 + 1] = fpos[(aj * fx + ai) * 3 + 1] * (1 - t) + fpos[(bj * fx + bi) * 3 + 1] * t; };
    for (let i = C0; i <= C1; i++) { const a = Math.floor(i / st) * st, b = Math.min(fx - 1, a + st); if (i !== a) for (const j of [R0, R1]) fix(i, j, a, j, b, j, (i - a) / (b - a)); }
    for (let j = R0; j <= R1; j++) { const a = Math.floor(j / st) * st, b = Math.min(fy - 1, a + st); if (j !== a) for (const i of [C0, C1]) fix(i, j, i, a, i, b, (j - a) / (b - a)); }
  }
  for (let j = R0; j < R1; j++) for (let i = C0; i < C1; i++) {
    if (i >= c0 && i < c1 && j >= r0 && j < r1) continue;
    const p = j * fx + i;
    fidx.push(p, p + fx, p + 1, p + 1, p + fx, p + fx + 1);
  }
  for (let j = 0; j < fy - 1; j += st) for (let i = 0; i < fx - 1; i += st) {
    if (i >= C0 && i < C1 && j >= R0 && j < R1) continue;
    const i1 = Math.min(i + st, fx - 1), j1 = Math.min(j + st, fy - 1), p = j * fx + i, q1 = j * fx + i1, r = j1 * fx + i, t = j1 * fx + i1;
    fidx.push(p, r, q1, q1, r, t);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3)); fg.setAttribute('normal', new THREE.BufferAttribute(fnor, 3));
  fg.setIndex(new THREE.BufferAttribute(new Uint32Array(fidx), 1));
  fg.computeBoundingSphere();
  const far = new THREE.Mesh(fg, matFar);
  far.receiveShadow = true; far.castShadow = false; far.matrixAutoUpdate = false;
  group.add(far);
  scene.add(group);

  const tmp = new THREE.Vector3();
  return {
    group, matNear, matFar,
    update(cam, lodDist = 620) {
      for (const ch of chunks) {
        const farAway = tmp.copy(ch.c).sub(cam.position).length() > lodDist;
        ch.lods[0].visible = !farAway; ch.lods[1].visible = farAway;
      }
    },
  };
}
