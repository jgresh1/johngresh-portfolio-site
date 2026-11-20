// road.js — racing surface ribbon (banked, 1 m stations), red/yellow kerbs, and the shoulder strips that
// stitch both into the LiDAR terrain.
import * as THREE from 'three';
import { W, VERGE, naturalAt, meshAt, KERB_KP, kerbRamps } from './world.js';
import { groundUniforms, makeGroundMaterial } from './terrain.js';
import { lapLoads, buildMarks } from './marks.js';

const COLS = 11;                       // vertices across the asphalt

export function buildRoad(scene, qual = {}) {
  const N = W.N, L = W.L, wear = lapLoads().wear;
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
      aux2[k * 2] = r * W.ds; aux2[k * 2 + 1] = wear[i];
    }
  }
  const idx = new Uint32Array(N * (COLS - 1) * 6); let q = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < COLS - 1; c++) {
    const a = r * COLS + c, b = a + 1, cc = a + COLS, d = cc + 1;
    idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = cc;
  }
  // split into ~250 m pieces so frustum culling and shadow cascades stay tight
  const mat = makeRoadMaterial(L, !!qual.lo);
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
  const KP = KERB_KP;                    // (fraction across, height m); contactAt() in world.js uses the same profile
  const kpos = [], knor = [], kuv = [], kidx = [];
  for (const side of [-1, 1]) {
    const kw = side < 0 ? W.kerbL : W.kerbR, rampOf = kerbRamps()[side < 0 ? 0 : 1];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (!(kw[i] > 0 && kw[j] > 0)) continue;
      const base = kpos.length / 3;
      for (const st of [i, j]) {
        const dx = W.dx[st], dz = W.dz[st], rx = -dz * side, rz = dx * side, hw = W.hw[st], w = kw[st];
        const ramp = rampOf[st];
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

  const marks = buildMarks(group);

  scene.add(group);
  return { group, mat, vergeLifted: lifted, marks };
}

/* The asphalt. What is drawn, in order: the stone-and-binder grain; paver lanes, each a slightly different batch,
   with the joint between them; the joints across the road where a day's paving stopped; patches of newer, darker
   surface with a sealed edge; cracks sealed with tar; the rubbered line (heaviest where lapLoads() says the cars
   brake, turn and put their power down), dust and marbles off it; then the paint. `lite` (phones) leaves out the
   patches and the sealed cracks. */
function makeRoadMaterial(L, lite = false) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  if (lite) mat.defines = { ROAD_LITE: 1 };
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
        float rHash( float n ) { return fract( sin( n * 127.1 + 3.7 ) * 43758.5453 ); }
        vec4 noTile( sampler2D smp, vec2 uv ) {
          float k = texture2D( tNoise, uv * 0.031 ).r * 8.0;
          float ia = floor( k ), f = fract( k );
          vec2 oa = sin( vec2( 3.0, 7.0 ) * ia ), ob = sin( vec2( 3.0, 7.0 ) * ( ia + 1.0 ) );
          vec2 dx = dFdx( uv ), dy = dFdy( uv );
          return mix( textureGrad( smp, uv + oa, dx, dy ), textureGrad( smp, uv + ob, dx, dy ), smoothstep( 0.2, 0.8, f ) );
        }`)
      .replace('#include <map_fragment>', /* glsl */`
        float d = vRoad.x, hw = vRoad.y, s = vRoad2.x, wear = vRoad2.y;
        vec2 wuv = vFogWorld.xz;
        float rDist = length( vFogWorld - cameraPosition );
        float rDet = 1.0 - smoothstep( 25.0, 160.0, rDist );
        float rNear = 1.0 - smoothstep( 70.0, 260.0, rDist );             // thin lines are not drawn far away
        float aa = max( fwidth( d ), 1e-4 ) * 0.75, as = max( fwidth( s ), 1e-4 ) * 0.75, ad = abs( d );
        vec3 tA = noTile( tAsph, wuv / 2.0 ).rgb / uAsphMean;
        vec3 base = vec3( 0.073, 0.072, 0.071 ) * mix( vec3( 1.0 ), tA, 0.35 + 0.65 * rDet ) * vRoad.w;
        vec3 n1 = texture2D( tNoise, vec2( d / 29.0, s / 83.0 ) ).rgb;
        vec3 n2 = texture2D( tNoise, vec2( d / 3.7, s / 240.0 ) ).rgb;      // long streaks along the lap
        vec3 n3 = texture2D( tNoise, vec2( d / 1.1, s / 520.0 ) ).rgb;      // fine ones: each car's tyres leave their own
        base *= 0.93 + 0.14 * n1.r;
        // paver lanes and the joints between them
        float lane = ( d + hw ) / 3.9, lf = fract( lane );
        base *= 0.955 + 0.09 * rHash( floor( lane ) + floor( s / 640.0 ) * 7.0 );
        float jd = min( lf, 1.0 - lf ) * 3.9;
        float joint = ( 1.0 - smoothstep( 0.010, 0.022 + aa, jd ) ) * step( 0.5, lane ) * step( lane, 2.0 * hw / 3.9 - 0.4 );
        base *= 1.0 - 0.34 * joint * ( 0.45 + 0.55 * smoothstep( 0.3, 0.6, n1.b ) ) * ( 0.3 + 0.7 * rNear );
        // where a day's paving stopped: a joint across the road, and the next batch a shade different
        float tj = s / 217.0, tjd = abs( fract( tj + 0.5 ) - 0.5 ) * 217.0;
        base *= 0.955 + 0.09 * rHash( floor( tj ) * 3.1 + 2.0 );
        base *= 1.0 - 0.30 * ( 1.0 - smoothstep( 0.012, 0.026 + as, tjd ) ) * rNear;
        float tar = 0.0;
        #ifndef ROAD_LITE
        {
          // patches: a rectangle cut out and relaid, darker for being newer, its edge sealed with tar
          float pc = floor( s / 61.0 ), ph = rHash( pc ), ph2 = rHash( pc + 17.3 ), ph3 = rHash( pc + 41.7 );
          float ps0 = pc * 61.0 + 3.0 + ph2 * 16.0, ps1 = ps0 + 6.0 + ph3 * 30.0;
          float pd0 = mix( - hw - 1.0, hw * 0.15, ph3 ), pd1 = ph2 > 0.55 ? hw + 1.0 : pd0 + 2.8 + 3.4 * ph;
          float on = step( 0.6, ph );
          float pe = min( min( s - ps0, ps1 - s ), min( d - pd0, pd1 - d ) );           // metres inside the patch
          float pk = max( aa, as );
          float inP = on * smoothstep( - pk, pk, pe );
          base *= mix( 1.0, 0.78 + 0.16 * ph2, inP );
          tar = on * ( 1.0 - smoothstep( 0.022, 0.04 + pk, abs( pe ) ) ) * rNear * step( ad, hw - 0.3 );
          // cracks sealed with tar, in some stretches of the lap only: long ones that wander along the road ...
          float cc = floor( s / 83.0 ), cf = fract( s / 83.0 );
          float cOn = step( 0.5, rHash( cc + 9.0 ) );
          float cd = hw * ( rHash( cc + 5.0 ) * 1.3 - 0.65 ) + ( texture2D( tNoise, vec2( s / 31.0, 0.61 ) ).r - 0.5 ) * 2.2 + ( texture2D( tNoise, vec2( s / 3.3, 0.23 ) ).g - 0.5 ) * 0.06;
          float crack = ( 1.0 - smoothstep( 0.011, 0.022 + aa, abs( d - cd ) ) ) * cOn * step( 0.04 + 0.3 * rHash( cc + 2.0 ), cf ) * step( cf, 0.97 - 0.4 * rHash( cc + 3.0 ) );
          // ... and short ones across it
          float tq = s / 17.0, tc = floor( tq );
          float ts = ( fract( tq ) - 0.5 ) * 17.0 - ( texture2D( tNoise, vec2( d / 11.0, tc * 0.137 ) ).r - 0.5 ) * 1.6;
          float tcr = ( 1.0 - smoothstep( 0.011, 0.022 + as, abs( ts ) ) ) * step( 0.7, rHash( tc + 23.0 ) ) * step( 0.35, rHash( floor( s / 170.0 ) + 4.0 ) );
          tcr *= step( d, mix( - hw * 0.3, hw + 1.0, rHash( tc + 31.0 ) ) );
          tar = max( tar, max( crack, tcr ) * rNear * step( ad, hw - 0.25 ) );
        }
        #endif
        // the rubbered line: the width the cars sweep, darker in the two wheel tracks, laid in streaks
        float rl = abs( d - vRoad.z );
        float band = 1.0 - smoothstep( 0.5, 2.7, rl );
        float tracks = 1.0 - smoothstep( 0.2, 0.75, abs( rl - 0.82 ) );
        float streak = smoothstep( 0.2, 0.8, n3.g * 0.55 + n2.g * 0.55 );
        float rub = clamp( ( band * 0.72 + tracks * 0.34 ) * ( 0.4 + 0.8 * streak ) * ( 0.26 + 0.74 * wear ), 0.0, 1.0 );
        base = mix( base, base * vec3( 0.40, 0.40, 0.425 ), rub );
        rRough = mix( 0.90, 0.55, rub );
        // off the line: dust, and the marbles the tyres throw out in the corners
        base *= 1.0 + ( 0.07 + 0.16 * wear ) * smoothstep( 1.8, 4.6, rl ) * ( 0.4 + 0.9 * n2.r );
        base = mix( base, vec3( 0.014, 0.014, 0.015 ), tar * 0.9 );
        rRough = mix( rRough, 0.62, tar );
        // paint
        float eLine = smoothstep( hw - 0.19 - aa, hw - 0.19 + aa, ad ) * ( 1.0 - smoothstep( hw - 0.035 - aa, hw - 0.035 + aa, ad ) );
        float paintWear = 0.72 + 0.28 * smoothstep( 0.25, 0.6, texture2D( tNoise, vec2( d * 2.3, s / 2.9 ) ).g );
        float ds = min( s, uLap - s );
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
        // paint the tyres run over is grey with rubber
        base = mix( base, vec3( 0.80, 0.80, 0.78 ) * paintWear * ( 1.0 - 0.55 * rub ), paint * ( 0.86 + 0.14 * paintWear ) );
        rRough = mix( rRough, 0.52, paint );
        diffuseColor.rgb = base;
        rDetailN = ( noTile( tAsphN, wuv / 2.0 ).xyz * 2.0 - 1.0 ) * rDet * ( 1.0 - 0.6 * paint ) * ( 1.0 - 0.5 * rub ) * ( 1.0 - tar );
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rRough;')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        normal = normalize( normal + ( viewMatrix * vec4( rDetailN.x, 0.0, rDetailN.y, 0.0 ) ).xyz * 0.42 );`);
  };
  mat.customProgramCacheKey = () => 'road' + (lite ? 'L' : '');
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
