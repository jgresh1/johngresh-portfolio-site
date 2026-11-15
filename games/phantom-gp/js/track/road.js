// road.js — racing surface ribbon (banked, 1 m stations), red/yellow kerbs, and the shoulder strips that
// stitch both into the LiDAR terrain.
import * as THREE from 'three';
import { W, VERGE, naturalAt, meshAt } from './world.js';
import { groundUniforms, makeGroundMaterial } from './terrain.js';

const COLS = 11;                       // vertices across the asphalt

export function buildRoad(scene) {
  const N = W.N, L = W.L;
  const group = new THREE.Group(); group.name = 'road';

  /* ---------------- asphalt ---------------- */
  const nv = (N + 1) * COLS;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), aux = new Float32Array(nv * 4), aux2 = new Float32Array(nv * 2);
  for (let r = 0; r <= N; r++) {
    const i = r % N, ip = (i + 1) % N, im = (i - 1 + N) % N;
    const grade = (W.ty[ip] - W.ty[im]) / (2 * W.ds);
    const dx = W.dx[i], dz = W.dz[i], rx = -dz, rz = dx, hw = W.hw[i], bank = W.bank[i];
    // normal = right x tangent
    const tX = dx, tY = grade, tZ = dz, rX = rx, rY = bank, rZ = rz;
    let nx = rY * tZ - rZ * tY, ny = rZ * tX - rX * tZ, nz = rX * tY - rY * tX; const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    for (let c = 0; c < COLS; c++) {
      const d = (c / (COLS - 1) * 2 - 1) * hw, k = r * COLS + c;
      pos[k * 3] = W.tx[i] + rx * d; pos[k * 3 + 1] = W.ty[i] + bank * d; pos[k * 3 + 2] = W.tz[i] + rz * d;
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      aux[k * 4] = d; aux[k * 4 + 1] = hw; aux[k * 4 + 2] = W.line[i]; aux[k * 4 + 3] = W.tone[i];
      aux2[k * 2] = r * W.ds; aux2[k * 2 + 1] = Math.min(1, Math.abs(W.kappa[i]) * 60);
    }
  }
  const idx = new Uint32Array(N * (COLS - 1) * 6); let q = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < COLS - 1; c++) {
    const a = r * COLS + c, b = a + 1, cc = a + COLS, d = cc + 1;
    idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = cc;
  }
  // split into ~250 m pieces so frustum culling and shadow cascades stay tight
  const mat = makeRoadMaterial(L);
  const PIECE = 250;
  for (let r0 = 0; r0 < N; r0 += PIECE) {
    const r1 = Math.min(N, r0 + PIECE);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aRoad', new THREE.BufferAttribute(aux, 4)); g.setAttribute('aRoad2', new THREE.BufferAttribute(aux2, 2));
    g.setIndex(new THREE.BufferAttribute(idx.subarray(r0 * (COLS - 1) * 6, r1 * (COLS - 1) * 6), 1));
    const bb = new THREE.Box3();
    for (let r = r0; r <= r1; r++) for (const c of [0, COLS - 1]) { const k = (r * COLS + c) * 3; bb.expandByPoint(new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2])); }
    g.boundingBox = bb; g.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false;
    group.add(m);
  }

  /* ---------------- kerbs ---------------- */
  const KP = [[0, 0.0], [0.12, 0.022], [0.5, 0.055], [0.86, 0.075], [1, 0.045]];     // (fraction across, height m)
  const kpos = [], knor = [], kuv = [], kidx = [];
  for (const side of [-1, 1]) {
    const kw = side < 0 ? W.kerbL : W.kerbR;
    // distance (stations) to the nearest end of the run, for the ramp-in / ramp-out
    const endDist = new Float32Array(N);
    for (let pass = 0; pass < 2; pass++) {
      let run = 0;
      for (let t = 0; t < 2 * N; t++) {
        const i = pass ? (2 * N - 1 - t) % N : t % N;
        run = kw[i] > 0 ? run + 1 : 0;
        endDist[i] = pass ? Math.min(endDist[i], run) : run;
      }
    }
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (!(kw[i] > 0 && kw[j] > 0)) continue;
      const base = kpos.length / 3;
      for (const st of [i, j]) {
        const dx = W.dx[st], dz = W.dz[st], rx = -dz * side, rz = dx * side, hw = W.hw[st], w = kw[st];
        const ramp = Math.min(1, endDist[st] / 3);
        const sAlong = (st === 0 && i === N - 1) ? L : st * W.ds;
        for (const [fr, hgt] of KP) {
          const d = hw + fr * w;
          kpos.push(W.tx[st] + rx * d, W.ty[st] + W.bank[st] * d * side + hgt * ramp + 0.004, W.tz[st] + rz * d);
          knor.push(0, 1, 0); kuv.push(fr * w, sAlong);
        }
      }
      const P = KP.length;
      for (let c = 0; c < P - 1; c++) {
        const a = base + c, b = a + 1, cc = base + P + c, d = cc + 1;
        if (side > 0) kidx.push(a, b, d, a, d, cc); else kidx.push(a, d, b, a, cc, d);
      }
    }
  }
  const kg = new THREE.BufferGeometry();
  kg.setAttribute('position', new THREE.Float32BufferAttribute(kpos, 3)); kg.setAttribute('normal', new THREE.Float32BufferAttribute(knor, 3));
  kg.setAttribute('uv', new THREE.Float32BufferAttribute(kuv, 2)); kg.setIndex(kidx);
  kg.computeVertexNormals();
  const kerbs = new THREE.Mesh(kg, makeKerbMaterial()); kerbs.receiveShadow = true; kerbs.castShadow = false; kerbs.matrixAutoUpdate = false;
  group.add(kerbs);

  /* ---------------- verge strips (terrain material) ----------------
     From the road / kerb edge the strip rises in a straight line to the surveyed ground VERGE.blend metres out,
     follows the survey a little further, then dips under the terrain. world.js holds the terrain mesh below it. */
  const A = VERGE.cols, NC = A.length, NR = N + 1, sv = 2 * NR * NC;
  const spos = new Float32Array(sv * 3), sshift = new Float32Array(sv * 2);
  const vi = (sd, r, c) => (sd * NR + r) * NC + c;
  for (let sd = 0; sd < 2; sd++) {
    const side = sd ? 1 : -1, kw = sd ? W.kerbR : W.kerbL;
    for (let r = 0; r <= N; r++) {
      const i = r % N, rx = -W.dz[i] * side, rz = W.dx[i] * side, e = W.hw[i] + kw[i];
      const ye = W.vergeY[sd][i], G = W.vergeG[sd][i], ab = W.vergeB[sd][i], amax = W.vergeMax[sd][i];
      for (let c = 0; c < NC; c++) {
        const a = Math.min(A[c], amax), k = vi(sd, r, c), x = W.tx[i] + rx * (e + a), z = W.tz[i] + rz * (e + a);
        const y = c === 0 ? ye : a < ab ? ye + (G - ye) * (a / ab) : naturalAt(x, z) + (c === NC - 1 ? -0.16 : VERGE.lift);
        spos[k * 3] = x; spos[k * 3 + 1] = y; spos[k * 3 + 2] = z;
        // read the photo / masks from where the strip meets the survey, so the photo's own edge line never shows here
        const sft = Math.max(0, ab - Math.max(a, 0));
        sshift[k * 2] = rx * sft; sshift[k * 2 + 1] = rz * sft;
      }
    }
  }
  // safety net: wherever the drawn terrain still comes within 2 cm of the strip, raise the strip over it
  const UV = [0.125, 0.375, 0.625, 0.875];
  let lifted = 0;
  for (let pass = 0; pass < 5; pass++) {
    let hits = 0;
    for (let sd = 0; sd < 2; sd++) for (let r = 0; r < N; r++) for (let c = 0; c < NC - 2; c++) {
      const a = vi(sd, r, c), b = a + 1, cc = vi(sd, r + 1, c), d = cc + 1;
      const ya = spos[a * 3 + 1], yb = spos[b * 3 + 1], yc = spos[cc * 3 + 1], yd = spos[d * 3 + 1];
      let need = 0;
      for (const u of UV) for (const v of UV) {
        const x = (spos[a * 3] * (1 - u) + spos[b * 3] * u) * (1 - v) + (spos[cc * 3] * (1 - u) + spos[d * 3] * u) * v;
        const z = (spos[a * 3 + 2] * (1 - u) + spos[b * 3 + 2] * u) * (1 - v) + (spos[cc * 3 + 2] * (1 - u) + spos[d * 3 + 2] * u) * v;
        const ys = u >= v ? ya + (yb - ya) * u + (yd - yb) * v : ya + (yd - yc) * u + (yc - ya) * v;     // both triangles share the a-d diagonal
        need = Math.max(need, meshAt(x, z) + 0.02 - ys);
      }
      if (need > 0) {
        hits++;
        spos[b * 3 + 1] += need; spos[d * 3 + 1] += need;
        if (c > 0) { spos[a * 3 + 1] += need; spos[cc * 3 + 1] += need; }
      }
    }
    lifted += hits;
    if (!hits) break;
  }
  // close the lap: station N is station 0 again
  for (let sd = 0; sd < 2; sd++) for (let c = 0; c < NC; c++) {
    const y = Math.max(spos[vi(sd, 0, c) * 3 + 1], spos[vi(sd, N, c) * 3 + 1]);
    spos[vi(sd, 0, c) * 3 + 1] = y; spos[vi(sd, N, c) * 3 + 1] = y;
  }
  const sidx = new Uint32Array(N * 2 * (NC - 1) * 6); q = 0;
  for (let r = 0; r < N; r++) for (let sd = 0; sd < 2; sd++) for (let c = 0; c < NC - 1; c++) {
    const a = vi(sd, r, c), b = a + 1, cc = vi(sd, r + 1, c), d = cc + 1;
    if (sd) { sidx[q++] = a; sidx[q++] = b; sidx[q++] = d; sidx[q++] = a; sidx[q++] = d; sidx[q++] = cc; }
    else { sidx[q++] = a; sidx[q++] = d; sidx[q++] = b; sidx[q++] = a; sidx[q++] = cc; sidx[q++] = d; }
  }
  const sPos = new THREE.BufferAttribute(spos, 3), sShift = new THREE.BufferAttribute(sshift, 2);
  const whole = new THREE.BufferGeometry();
  whole.setAttribute('position', sPos); whole.setIndex(new THREE.BufferAttribute(sidx, 1)); whole.computeVertexNormals();
  const sNor = whole.getAttribute('normal'), na = sNor.array;
  for (let sd = 0; sd < 2; sd++) for (let c = 0; c < NC; c++) {           // same normal on both copies of the lap seam
    const p = vi(sd, 0, c) * 3, o = vi(sd, N, c) * 3;
    for (let t = 0; t < 3; t++) { const m = na[p + t] + na[o + t]; na[p + t] = m; na[o + t] = m; }
  }
  for (let k = 0; k < sv; k++) {
    const l = Math.hypot(na[k * 3], na[k * 3 + 1], na[k * 3 + 2]);
    if (l < 1e-4 || na[k * 3 + 1] / l < 0.2) { na[k * 3] = 0; na[k * 3 + 1] = 1; na[k * 3 + 2] = 0; }      // folded or collapsed bits
    else { na[k * 3] /= l; na[k * 3 + 1] /= l; na[k * 3 + 2] /= l; }
  }
  const shMat = makeGroundMaterial(true, true); shMat.polygonOffsetUnits = 2; shMat.polygonOffsetFactor = 0.5;
  const SPER = 2 * (NC - 1) * 6;
  for (let r0 = 0; r0 < N; r0 += PIECE) {
    const r1 = Math.min(N, r0 + PIECE);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', sPos); g.setAttribute('normal', sNor); g.setAttribute('aShift', sShift);
    g.setIndex(new THREE.BufferAttribute(sidx.subarray(r0 * SPER, r1 * SPER), 1));
    const bb = new THREE.Box3(), v3 = new THREE.Vector3();
    for (let sd = 0; sd < 2; sd++) for (let r = r0; r <= r1; r++) for (let c = 0; c < NC; c++) { const k = vi(sd, r, c) * 3; bb.expandByPoint(v3.set(spos[k], spos[k + 1], spos[k + 2])); }
    g.boundingBox = bb; g.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, shMat); m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; m.name = 'verge';
    group.add(m);
  }

  scene.add(group);
  return { group, mat, vergeLifted: lifted };
}

function makeRoadMaterial(L) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms, { uLap: { value: L } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRoad; attribute vec2 aRoad2; varying vec4 vRoad; varying vec2 vRoad2;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad; vRoad2 = aRoad2;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        uniform sampler2D tAsph, tAsphN, tNoise; uniform vec3 uAsphMean; uniform float uLap;
        varying vec4 vRoad; varying vec2 vRoad2;
        float rRough; vec3 rDetailN;
        vec4 noTile( sampler2D smp, vec2 uv ) {
          float k = texture2D( tNoise, uv * 0.031 ).r * 8.0;
          float ia = floor( k ), f = fract( k );
          vec2 oa = sin( vec2( 3.0, 7.0 ) * ia ), ob = sin( vec2( 3.0, 7.0 ) * ( ia + 1.0 ) );
          vec2 dx = dFdx( uv ), dy = dFdy( uv );
          return mix( textureGrad( smp, uv + oa, dx, dy ), textureGrad( smp, uv + ob, dx, dy ), smoothstep( 0.2, 0.8, f ) );
        }`)
      .replace('#include <map_fragment>', /* glsl */`
        float d = vRoad.x, hw = vRoad.y, s = vRoad2.x;
        vec2 wuv = vFogWorld.xz;
        float rDist = length( vFogWorld - cameraPosition );
        float rDet = 1.0 - smoothstep( 25.0, 160.0, rDist );
        vec3 tA = noTile( tAsph, wuv / 2.0 ).rgb / uAsphMean;
        vec3 base = vec3( 0.105, 0.105, 0.11 ) * mix( vec3( 1.0 ), tA, 0.35 + 0.65 * rDet ) * vRoad.w;
        vec3 n1 = texture2D( tNoise, vec2( d / 29.0, s / 83.0 ) ).rgb;
        vec3 n2 = texture2D( tNoise, vec2( d / 3.7, s / 240.0 ) ).rgb;      // long streaks along the lap
        base *= 0.86 + 0.28 * n1.r;
        // paving joint near the crown and faint lane-width paver bands
        float joint = 1.0 - smoothstep( 0.0, 0.035, abs( d - 0.4 ) );
        base *= 1.0 - 0.22 * joint * smoothstep( 0.35, 0.6, n1.b );
        base *= 0.97 + 0.06 * step( 0.5, fract( ( d + hw ) / 3.9 ) );
        // rubbered racing line: two tyre tracks, heavier in corners
        float rl = abs( d - vRoad.z );
        float tracks = ( 1.0 - smoothstep( 0.25, 0.75, abs( rl - 0.82 ) ) ) * 0.65 + ( 1.0 - smoothstep( 0.6, 2.4, rl ) ) * 0.55;
        float rub = clamp( tracks * ( 0.35 + 0.65 * n2.g ) * ( 0.42 + 0.58 * vRoad2.y ), 0.0, 1.0 );
        base = mix( base, base * vec3( 0.56, 0.56, 0.585 ), rub );
        rRough = mix( 0.88, 0.60, rub * 0.9 );
        // marbles / dust off line toward the edges
        base *= 1.0 + 0.10 * smoothstep( hw - 2.2, hw - 0.4, abs( d ) ) * n2.r;
        // paint
        float aa = max( fwidth( d ), 1e-4 ) * 0.75, ad = abs( d );
        float eLine = smoothstep( hw - 0.19 - aa, hw - 0.19 + aa, ad ) * ( 1.0 - smoothstep( hw - 0.035 - aa, hw - 0.035 + aa, ad ) );
        float paintWear = 0.72 + 0.28 * smoothstep( 0.25, 0.6, texture2D( tNoise, vec2( d * 2.3, s / 2.9 ) ).g );
        float ds = min( s, uLap - s ), as = max( fwidth( s ), 1e-4 ) * 0.75;
        float sf = 1.0 - smoothstep( 0.19 - as, 0.19 + as, ds );
        // F1 grid: 22 staggered boxes behind the line, 8 m apart
        float gq = ( uLap - 9.0 - s ) / 8.0, gk = floor( gq + 0.5 );
        float gs = ( gq - gk ) * 8.0;
        float gsgn = mod( gk, 2.0 ) < 0.5 ? 1.0 : -1.0;
        float gdl = abs( d - gsgn * hw * 0.44 );
        float gOn = step( -0.5, gk ) * step( gk, 21.5 );
        float gBar = ( 1.0 - smoothstep( 0.065 - as, 0.065 + as, abs( gs ) ) ) * ( 1.0 - smoothstep( 1.28 - aa, 1.28 + aa, gdl ) );
        float gLeg = ( 1.0 - smoothstep( 0.055 - aa, 0.055 + aa, abs( gdl - 1.225 ) ) ) * step( 0.0, gs ) * ( 1.0 - smoothstep( 0.62 - as, 0.62 + as, gs ) );
        float paint = max( max( eLine, sf ), max( gBar, gLeg ) * gOn );
        base = mix( base, vec3( 0.80, 0.80, 0.78 ) * paintWear, paint * ( 0.86 + 0.14 * paintWear ) );
        rRough = mix( rRough, 0.52, paint );
        diffuseColor.rgb = base;
        rDetailN = ( noTile( tAsphN, wuv / 2.0 ).xyz * 2.0 - 1.0 ) * rDet * ( 1.0 - 0.6 * paint ) * ( 1.0 - 0.45 * rub );
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rRough;')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        normal = normalize( normal + ( viewMatrix * vec4( rDetailN.x, 0.0, rDetailN.y, 0.0 ) ).xyz * 0.42 );`);
  };
  mat.customProgramCacheKey = () => 'road';
  return mat;
}

function makeKerbMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tNoise, tAsphN; float kRough;')
      .replace('#include <map_fragment>', /* glsl */`
        float kx = vUv.x, ks = vUv.y;
        float blk = ks / 1.8, fb = fract( blk );
        float ka = max( fwidth( blk ), 1e-4 );
        float sel = smoothstep( 0.5 - ka, 0.5 + ka, fb ) * ( 1.0 - smoothstep( 1.0 - ka, 1.0, fb ) ) + ( 1.0 - smoothstep( 0.0, ka, fb ) );
        vec3 red = vec3( 0.52, 0.035, 0.03 ), yel = vec3( 0.80, 0.57, 0.045 );
        vec3 kc = mix( yel, red, clamp( sel, 0.0, 1.0 ) );
        vec3 kn = texture2D( tNoise, vec2( kx * 1.7, ks / 2.3 ) ).rgb;
        vec3 kn2 = texture2D( tNoise, vec2( kx / 6.0, ks / 31.0 ) ).rgb;
        kc *= 0.72 + 0.4 * kn2.r;
        // worn paint shows concrete; rubber scuffs on the inner half
        float worn = smoothstep( 0.62, 0.8, kn.g + 0.25 * kn2.b );
        kc = mix( kc, vec3( 0.42, 0.41, 0.38 ), worn * 0.55 );
        float scuff = ( 1.0 - smoothstep( 0.15, 0.9, kx ) ) * smoothstep( 0.35, 0.75, kn2.g );
        kc = mix( kc, kc * 0.33, scuff * 0.7 );
        float gap = 1.0 - smoothstep( 0.0, 0.012, abs( fract( ks / 1.8 * 2.0 + 0.5 ) - 0.5 ) / 2.0 * 1.8 );
        kc *= 1.0 - 0.5 * gap;
        diffuseColor.rgb = kc;
        kRough = mix( 0.55, 0.85, worn );
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = kRough;')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        vec3 kdn = texture2D( tAsphN, vUv * vec2( 1.0, 1.0 ) / 1.4 ).xyz * 2.0 - 1.0;
        normal = normalize( normal + ( viewMatrix * vec4( kdn.x, 0.0, kdn.y, 0.0 ) ).xyz * 0.22 );`);
  };
  mat.defines = { USE_UV: '' };
  mat.customProgramCacheKey = () => 'kerb';
  return mat;
}
