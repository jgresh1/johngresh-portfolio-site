// facade.js — real geometry for the buildings around the camera.
//
// The survey gives every building its true outline, height, floor count and use, but its walls are flat:
// a photograph on a plane, or nothing at all. From the air that is enough. Close up it is not, so each
// building within reach of the camera is given a built front: an outer wall skin with window openings cut
// through it, reveals, frames, sills, glass with rooms behind it, balconies, a shopfront at street level,
// mullioned curtain walls on towers, copings along the roof edge. Where an aircraft could see the wall, the
// windows are read off its photo (windows.js) and cut where they really are. Where it could not (most lower
// floors: the building opposite was in the way, and the survey photo there shows the neighbour's roof), the
// same grid of windows is carried on and the wall is rebuilt in its own colour. A building with no photo at
// all gets a pattern chosen by its use, on floor lines from the surveyed floor count.
import * as THREE from 'three';
import { ATMO, patch } from './atmo.js';
import { READ, detect } from './windows.js';
export { READ };

export const CLS = { OTHER: 0, SHOP: 1, OFFICE: 2, APART: 3, HOUSE: 4, INDUS: 5, PUBLIC: 6 };
const USE = {
  '商業施設': 1, '店舗等併用住宅': 1, '店舗等併用共同住宅': 1, '商業系複合施設': 1, '宿泊施設': 1,
  '業務施設': 2, '官公庁施設': 2, '共同住宅': 3, '住宅': 4, '作業所併用住宅': 4,
  '運輸倉庫施設': 5, '工場': 5, '供給処理施設': 5, '農林漁業用施設': 5, '文教厚生施設': 6,
};
export const usageClass = (u) => USE[u] || 0;

const K = { WALL: 0, FRAME: 1, GLASS: 2, SLAB: 3, RAIL: 4, BAND: 5, AWN: 6, SHOP: 7, PHOTO: 8 };
const fract = (v) => v - Math.floor(v);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/* ------------------------------------------------------------------ material */
const GEN = {
  vertPars: 'attribute vec4 aK; attribute vec4 aR; varying vec4 vK; varying vec4 vR;',
  vert: 'vK = aK; vR = aR;',
  fragPars: /* glsl */`
    varying vec4 vK; varying vec4 vR;
    float gBox( float x, float a, float b, float w ) { return smoothstep( a - w, a + w, x ) - smoothstep( b - w, b + w, x ); }
    // a room seen through the glass: the view ray is followed to the wall, floor or ceiling it lands on
    vec3 gRoom( vec3 p, vec3 r, vec3 sz, float seed, float shop, out float lamp ) {
      lamp = 0.0;
      vec3 tf = ( step( 0.0, r ) * sz - p ) / ( r + sign( r ) * 1e-4 + 1e-5 );
      float t = min( min( tf.x, tf.y ), tf.z );
      vec3 h = p + r * t;
      float s1 = fract( seed * 7.31 ), s2 = fract( seed * 13.7 ), s3 = fract( seed * 3.17 );
      vec3 wall = mix( vec3( 0.62, 0.58, 0.52 ), vec3( 0.50, 0.54, 0.58 ), s1 ), col;
      if ( t == tf.z ) {                                          // back wall: shelving, doors, pictures
        vec2 q = h.xy / vec2( mix( 0.9, 1.7, s2 ), mix( 0.42, 2.4, 1.0 - shop ) );
        float shelf = step( 0.14, fract( q.y ) ) * step( 0.05, fract( q.x ) );
        // goods on the shelves: small items, mostly pale, a few with colour
        vec2 it = floor( h.xy / vec2( 0.16, 0.42 ) );
        vec3 goods = mix( vec3( 0.62, 0.60, 0.56 ), vec3( apHash( it + seed ), apHash( it + seed + 3.1 ), apHash( it + seed + 7.7 ) ), 0.30 ) * ( 0.75 + 0.25 * apHash( it + 1.7 ) );
        col = mix( wall * 0.50, mix( wall, goods, 0.75 * shop + 0.10 ), shelf );
      } else if ( t == tf.y ) {
        if ( r.y > 0.0 ) { col = vec3( 0.78 ); lamp = step( 0.72, fract( h.z * 0.55 ) ) * step( 0.25, fract( h.x * 0.8 ) ); col += lamp * 1.6; }   // ceiling with light strips
        else col = mix( vec3( 0.30, 0.27, 0.24 ), vec3( 0.42, 0.42, 0.40 ), s3 ) * ( 0.8 + 0.2 * step( 0.5, fract( h.x * 1.3 ) ) );
      } else col = wall * 0.82;
      return col * mix( 1.0, 0.42, clamp( h.z / sz.z, 0.0, 1.0 ) );
    }`,
  color: /* glsl */`
    float gKind = vK.x, gSeed = vK.y, gY = vK.z, gPar = vK.w;
    float gDist = length( vWp - cameraPosition );
    vec3 gBase = diffuseColor.rgb * vColor.rgb;                 // the building's own colour here (blurred photo, or its palette)
    float gL = dot( gBase, vec3( 0.30, 0.55, 0.15 ) );
    // same corrections as the photo walls: lift underexposed shaded faces, take out their blue cast
    float gDark = 1.0 - smoothstep( 0.02, 0.24, gL );
    gBase *= 1.0 + 0.65 * gDark;
    gBase = mix( gBase, vec3( dot( gBase, vec3( 0.30, 0.55, 0.15 ) ) ) * vec3( 1.05, 1.0, 0.93 ), 0.40 * gDark );
    vec2 gUV = vR.xy;                                           // metres along the wall, metres above the building's foot
    float gNear = 1.0 - smoothstep( 30.0, 140.0, gDist );
    float gRough = 0.8, gMetal = 0.0, gLampOut = 0.0;
    vec3 gGlow = vec3( 0.0 );
    vec3 gCol = gBase;
    #ifdef USE_MAP
      vec3 gP1 = dFdx( vWp ), gP2 = dFdy( vWp ); vec2 gU1 = dFdx( vMapUv ), gU2 = dFdy( vMapUv );      // taken here: not allowed inside the branches
    #endif
    if ( gKind > 7.5 ) {
      // The building's own photograph, on the skin where the wall was seen from the air. Windows in it that
      // were not cut as openings still get relief: a patch darker than the wall around it is set back 24 cm
      // (the same walk into the surface that the survey's own walls get, see TEXTURED in city.js).
      float pWin = 0.0;
      #ifdef USE_MAP
        vec2 uvp = vMapUv; float pSide = 0.0;
        float pFade = 1.0 - smoothstep( 120.0, 190.0, gDist );
        vec3 pN = normalize( vWn ), pV = normalize( vWp - cameraPosition );
        vec3 pc1 = cross( gP2, pN ), pc2 = cross( pN, gP1 );
        float pDet = dot( gP1, pc1 );
        if ( pFade > 0.01 && abs( pDet ) > 1e-10 ) {
          vec3 pgu = ( pc1 * gU1.x + pc2 * gU2.x ) / pDet, pgv = ( pc1 * gU1.y + pc2 * gU2.y ) / pDet;
          pFade *= 1.0 - smoothstep( 0.35, 0.7, 1.0 / max( length( pgu ) * float( textureSize( map, 0 ).x ), 1e-3 ) );
          vec3 pSlide = ( pV - pN * dot( pV, pN ) ) / max( - dot( pV, pN ), 0.30 );
          vec2 pDuv = vec2( dot( pgu, pSlide ), dot( pgv, pSlide ) );
          float pLodW = clamp( log2( float( textureSize( map, 0 ).x ) / 512.0 ) + 1.5, 0.0, 5.0 );
          const vec3 pL = vec3( 0.30, 0.55, 0.15 );
          const float P_DEPTH = 0.24;
          float pd0 = 0.0, pBack = 0.0;
          for ( int i = 0; i < 9; i ++ ) {
            uvp = vMapUv + pDuv * pd0;
            float pHere = dot( textureGrad( map, uvp, gU1, gU2 ).rgb, pL ), pTone = dot( textureLod( map, uvp, pLodW ).rgb, pL );
            pBack = smoothstep( uRelief.y, uRelief.z, pTone - pHere ) * smoothstep( 0.06, 0.16, pTone ) * P_DEPTH * pFade * uRelief.x;
            if ( pd0 >= pBack ) break;
            pd0 += P_DEPTH / 8.0;
          }
          pWin = smoothstep( 0.45, 0.85, pBack / P_DEPTH );
          pSide = step( pBack + P_DEPTH / 16.0, pd0 ) * step( 0.02, pd0 );
        }
        gCol = textureGrad( map, uvp, gU1, gU2 ).rgb * ( 1.0 - 0.45 * pSide );
      #endif
      float pl = dot( gCol, vec3( 0.30, 0.55, 0.15 ) ), pd = ( 1.0 - smoothstep( 0.02, 0.24, pl ) ) * ( 1.0 - pWin );
      gCol *= 1.0 + 0.65 * pd;
      gCol = mix( gCol, vec3( dot( gCol, vec3( 0.30, 0.55, 0.15 ) ) ) * vec3( 1.05, 1.0, 0.93 ), 0.40 * pd );
      gCol *= 0.96 + 0.08 * apNoise( gUV * vec2( 9.0, 13.0 ) + gSeed * 30.0 ) * gNear * ( 1.0 - pWin );
      gRough = mix( 0.8, uRelief.w, pWin );
      // after dark some of those windows are lit
      float pOn = step( 0.74, apHash( floor( gUV / vec2( 2.6, 3.4 ) ) + gSeed * 91.7 ) );
      gGlow = mix( vec3( 1.0, 0.74, 0.46 ), vec3( 0.86, 0.93, 1.0 ), step( 0.5, fract( gSeed * 13.7 ) ) ) * pWin * pOn * uNight * 0.9;
    } else if ( gKind < 0.5 ) {
      // wall finish: tile courses, panel joints or cast concrete, by building
      float fin = fract( gSeed * 9.7 );
      vec2 fw = fwidth( gUV ) * 0.8;
      float joints;
      if ( fin < 0.40 ) {                                       // tile cladding
        vec2 tq = gUV / vec2( 0.235, 0.075 ); tq.x += 0.5 * floor( tq.y );
        vec2 tf = fract( tq ), tw = fwidth( tq );
        joints = ( 1.0 - gBox( tf.x, 0.06, 0.94, tw.x ) * gBox( tf.y, 0.10, 0.90, tw.y ) ) * ( 1.0 - smoothstep( 0.25, 0.8, max( tw.x, tw.y ) ) );
        gCol *= 1.0 - 0.22 * joints; gCol *= 0.94 + 0.12 * apHash( floor( tq ) + gSeed * 17.0 ) * ( 1.0 - smoothstep( 0.2, 0.7, max( tw.x, tw.y ) ) );
        gRough = 0.45;
      } else if ( fin < 0.72 ) {                                // metal or stone panels
        vec2 pq = gUV / vec2( 1.2, 0.9 ); vec2 pf = fract( pq ), pw = fwidth( pq );
        joints = 1.0 - gBox( pf.x, 0.012, 0.988, pw.x ) * gBox( pf.y, 0.016, 0.984, pw.y );
        gCol *= 1.0 - 0.38 * joints * ( 1.0 - smoothstep( 0.05, 0.25, max( pw.x, pw.y ) ) ); gCol *= 0.96 + 0.08 * apHash( floor( pq ) + gSeed * 5.0 );
        gRough = 0.55;
      } else {                                                  // concrete or render
        gCol *= 0.90 + 0.20 * ( apNoise( gUV * vec2( 1.6, 0.5 ) + gSeed * 40.0 ) * 0.6 + apNoise( gUV * 14.0 ) * 0.4 );
        float pour = fract( gUV.y / 0.9 ), pwd = fwidth( gUV.y / 0.9 );
        gCol *= 1.0 - 0.10 * ( 1.0 - gBox( pour, 0.015, 0.985, pwd ) ) * ( 1.0 - smoothstep( 0.05, 0.3, pwd ) );
        gRough = 0.9;
      }
      // rain streaks below ledges and a damp band at the foot
      float streak = apNoise( vec2( gUV.x * 3.1 + gSeed * 9.0, gUV.y * 0.22 ) );
      gCol *= 1.0 - 0.16 * smoothstep( 0.55, 0.9, streak ) * gNear;
      gCol *= 1.0 - 0.20 * ( 1.0 - smoothstep( 0.0, 0.5, gY ) );
    } else if ( gKind < 1.5 ) {                                 // window and door frames
      float fm = fract( gSeed * 4.3 );
      gCol = fm < 0.45 ? vec3( 0.050, 0.048, 0.046 ) : ( fm < 0.75 ? vec3( 0.40, 0.41, 0.42 ) : vec3( 0.78, 0.78, 0.76 ) );
      gRough = 0.38; gMetal = 0.75;
    } else if ( gKind < 2.5 || ( gKind > 6.5 && gKind < 7.5 ) ) {  // glass, with a room behind (7 = shop window)
      float shop = step( 6.5, gKind );
      vec3 N = normalize( vWn ), T = vec3( N.z, 0.0, - N.x ), V = normalize( vWp - cameraPosition );
      vec3 r = vec3( dot( V, T ), V.y, - dot( V, N ) );
      float rs = gPar;                                          // which room: seed
      float lamp = 0.0;
      vec3 sz = vec3( vR.z, vR.w, mix( 4.2, 7.0, shop ) );
      vec3 room = gRoom( vec3( vR.xy, 0.0 ), max( r, vec3( -1.0, -1.0, 0.02 ) ), sz, rs + gSeed, shop, lamp );
      // curtains or blinds drawn in some rooms; shop windows show their stock
      float drawn = step( 0.62, fract( rs * 17.3 ) ) * ( 1.0 - shop );
      vec3 blind = mix( vec3( 0.72, 0.70, 0.66 ), vec3( 0.52, 0.56, 0.60 ), fract( rs * 5.7 ) ) * ( 0.85 + 0.15 * step( 0.5, fract( vR.y * 14.0 ) ) );
      room = mix( room, blind, drawn );
      float lit = step( 1.0 - mix( 0.22, 0.85, shop ), fract( rs * 7.7 + gSeed * 3.0 ) );      // lights on in this room after dark
      vec3 lampC = mix( vec3( 1.0, 0.74, 0.46 ), vec3( 0.86, 0.93, 1.0 ), step( 0.5, fract( gSeed * 13.7 + rs * 0.3 ) ) );
      float dayIn = mix( 0.16, 0.50, shop ) * ( 1.0 - 0.6 * uNight );                           // rooms are dim next to daylight
      gCol = room * dayIn * mix( vec3( 0.80, 0.90, 0.92 ), vec3( 1.0 ), shop );
      gGlow = room * lampC * lit * uNight * mix( 0.9, 1.5, shop ) * ( 1.0 - 0.75 * drawn );
      gRough = 0.05;
    } else if ( gKind < 3.5 ) {                                 // slabs, sills, copings
      gCol = mix( gBase, vec3( 0.52, 0.51, 0.49 ), 0.55 ) * ( 0.9 + 0.2 * apNoise( vWp.xz * 3.0 + vWp.y * 2.0 ) );
      gRough = 0.9;
    } else if ( gKind < 4.5 ) {                                 // balcony fronts: frosted glass or painted panel
      float pn = fract( gSeed * 6.1 );
      gCol = pn < 0.5 ? mix( gBase, vec3( 0.70, 0.74, 0.76 ), 0.7 ) : mix( gBase, vec3( 0.80 ), 0.5 );
      float post = 1.0 - gBox( fract( gUV.x / 1.2 ), 0.02, 0.98, fwidth( gUV.x / 1.2 ) );
      gCol = mix( gCol, vec3( 0.30 ), post * 0.8 );
      gRough = pn < 0.5 ? 0.25 : 0.6;
    } else if ( gKind < 5.5 ) {                                 // the band over a shopfront, where the sign goes
      vec3 bc = vec3( apHash( vec2( gPar, 1.3 ) ), apHash( vec2( gPar, 4.7 ) ), apHash( vec2( gPar, 9.1 ) ) );
      float dk = step( 0.5, fract( gPar * 3.3 ) );
      gCol = mix( mix( bc * 0.5 + 0.08, vec3( 0.06 ), dk * 0.7 ), gBase, 0.25 );
      gRough = 0.5;
    } else {                                                    // awning
      vec3 ac = vec3( apHash( vec2( gPar, 2.1 ) ), apHash( vec2( gPar, 5.3 ) ), apHash( vec2( gPar, 8.9 ) ) ) * 0.6 + 0.12;
      gCol = mix( ac, vec3( 0.85 ), step( 0.5, fract( gUV.x / 0.36 ) ) * step( 0.6, fract( gPar * 7.1 ) ) );
      gRough = 0.85;
    }
    diffuseColor.rgb = gCol;`,
  rough: 'roughnessFactor = gRough;',
  metal: 'metalnessFactor = gMetal;',
  emissive: 'totalEmissiveRadiance += gGlow;',
  drop: ['color_fragment'],          // the vertex colour is the wall tint only; glass and frames must not take it
};
// the building's own colour at this point: the photo sheet, blurred to about 1.5 m so only its tone survives
const GEN_MAP = /* glsl */`
  float gLod = clamp( log2( float( textureSize( map, 0 ).x ) / 512.0 ) + 1.0, 0.0, 5.0 );
  vec4 sampledDiffuseColor = textureLod( map, vMapUv, gLod );
  diffuseColor *= sampledDiffuseColor;`;

/* ------------------------------------------------------------------ geometry writer */
class Emit {
  constructor() { this.p = []; this.n = []; this.uv = []; this.k = []; this.r = []; this.c = []; this.i = []; this.count = 0; }
  // wall frame: origin o (world), t along the wall, n out of it; x along, y up from the building's foot, z out
  frame(o, t, n, foot, uvOf, uvRaw, seed, tint) { this.o = o; this.t = t; this.nn = n; this.foot = foot; this.uvOf = uvOf; this.uvRaw = uvRaw; this.seed = seed; this.tint = tint; this.wk = K.WALL; }
  vert(x, y, z, nx, ny, nz, kind, par, rx, ry, rw, rh) {
    const { o, t, nn } = this;
    this.p.push(o.x + t.x * x + nn.x * z - this.cx, this.foot + y - this.cy, o.z + t.z * x + nn.z * z - this.cz);
    this.n.push(t.x * nx + nn.x * nz, ny, t.z * nx + nn.z * nz);
    const uv = kind === K.PHOTO ? (this.uvRaw ? this.uvRaw(x, y) : null) : (this.uvOf ? this.uvOf(x, y) : null);
    this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
    this.k.push(kind, this.seed, y, par);
    this.r.push(rx, ry, rw, rh);
    this.c.push(this.tint[0], this.tint[1], this.tint[2]);
    return this.count++;
  }
  // a flat four-sided piece given its corners in order (counter-clockwise seen from its front)
  quad(a, b, c, d, nrm, kind, par = 0, room = null) {
    const v = [a, b, c, d].map((q, m) => this.vert(q[0], q[1], q[2], nrm[0], nrm[1], nrm[2], kind, par,
      room ? room[m][0] : q[0], room ? room[m][1] : q[1], room ? room[4] : 0, room ? room[5] : 0));
    this.i.push(v[0], v[1], v[2], v[0], v[2], v[3]);
  }
  front(x0, y0, x1, y1, z, kind, par = 0) { if (x1 - x0 > 1e-3 && y1 - y0 > 1e-3) this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], kind, par); }
  glass(x0, y0, x1, y1, z, roomSeed, shop = false) {
    const w = x1 - x0, h = y1 - y0;
    this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], shop ? K.SHOP : K.GLASS, roomSeed, [[0, 0], [w, 0], [w, h], [0, h], w, h]);
  }
  // the four inner faces of an opening that runs from zo (outside) back to zi
  reveal(x0, y0, x1, y1, zo, zi, kind) {
    this.quad([x0, y0, zo], [x0, y0, zi], [x0, y1, zi], [x0, y1, zo], [1, 0, 0], kind);
    this.quad([x1, y0, zi], [x1, y0, zo], [x1, y1, zo], [x1, y1, zi], [-1, 0, 0], kind);
    this.quad([x0, y0, zo], [x1, y0, zo], [x1, y0, zi], [x0, y0, zi], [0, 1, 0], kind);
    this.quad([x0, y1, zi], [x1, y1, zi], [x1, y1, zo], [x0, y1, zo], [0, -1, 0], kind);
  }
  // a solid block standing on the wall: every face but the one against it
  box(x0, y0, z0, x1, y1, z1, kind, par = 0) {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], kind, par);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], kind, par);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], kind, par);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], kind, par);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], kind, par);
  }
  // one storey of outer skin between x0 and x1 with openings cut out of it (sorted, not overlapping)
  skin(x0, x1, yb, yt, T, holes) {
    let x = x0;
    for (const h of holes) {
      this.front(x, yb, h.x0, yt, T, this.wk);
      this.front(h.x0, yb, h.x1, h.y0, T, this.wk); this.front(h.x0, h.y1, h.x1, yt, T, this.wk);
      x = h.x1;
    }
    this.front(x, yb, x1, yt, T, this.wk);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aK', new THREE.Float32BufferAttribute(this.k, 4));
    g.setAttribute('aR', new THREE.Float32BufferAttribute(this.r, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    return g;
  }
}

/* ------------------------------------------------------------------ reading the windows off the photo */
// windows.js does the reading. It has no three.js in it, so it can be run and tested on its own.
// test hook: with READ.keep = [] every wall photo that is read is also kept, flattened to one sample per 10 cm
function sampleWall(L, uvRaw, W, y0, y1, b) {
  const step = Math.max(0.1, W / 700, (y1 - y0) / 900), nx = Math.max(1, Math.floor(W / step)), ny = Math.max(1, Math.floor((y1 - y0) / step)), data = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const uv = uvRaw(((i + 0.5) * W) / nx, y0 + ((j + 0.5) * (y1 - y0)) / ny);
    data[j * nx + i] = L.data[Math.min(L.h - 1, Math.max(0, Math.floor(uv[1] * L.h))) * L.w + Math.min(L.w - 1, Math.max(0, Math.floor(uv[0] * L.w)))];
  }
  const a = uvRaw(0, y0), c = uvRaw(1, y0), d = uvRaw(0, y0 + 1);
  return { W, y0, y1, H: b.H, floors: b.floors, cls: b.cls, id: b.id, nx, ny, lw: L.w, lh: L.h,
    pxm: Math.hypot((c[0] - a[0]) * L.w, (c[1] - a[1]) * L.h), pym: Math.hypot((d[0] - a[0]) * L.w, (d[1] - a[1]) * L.h), data };
}

/* ------------------------------------------------------------------ one wall */
// a street-level shopfront between yb and yt: plinth, big panes, a door, the band the sign hangs on
function shopfront(E, w, b, yb, yt, T, far) {
  const { W } = w, s = b.seed, rh = yt - yb, holes = [];
  const sb = Math.max(1, Math.round(W / 3.4)), sw = W / sb, top = rh - 0.95, door = Math.floor(fract(s * 11.3) * sb);
  for (let i = 0; i < sb; i++) {
    const x0 = i * sw + 0.20, x1 = (i + 1) * sw - 0.20, yA = yb + (i === door ? 0.04 : 0.32), yB = yb + top;
    holes.push({ x0, x1, y0: yA, y1: yB });
    E.reveal(x0, yA, x1, yB, T, 0.05, K.FRAME);
    E.glass(x0, yA, x1, yB, 0.05, fract(s * 31.7 + i * 0.37) + (b.id % 97) * 0.01, true);
    if (far) continue;
    const f = 0.05;                                         // frame bars
    E.box(x0, yB - f, 0.05, x1, yB, 0.10, K.FRAME); E.box(x0, yA, 0.05, x0 + f, yB, 0.10, K.FRAME); E.box(x1 - f, yA, 0.05, x1, yB, 0.10, K.FRAME);
    if (i === door) {
      const m = (x0 + x1) / 2;
      E.box(m - 0.03, yA, 0.05, m + 0.03, yb + 2.15, 0.11, K.FRAME); E.box(x0, yb + 2.15, 0.05, x1, yb + 2.21, 0.11, K.FRAME);
      E.box(m - 0.42, yb + 0.95, 0.10, m - 0.38, yb + 1.25, 0.16, K.FRAME); E.box(m + 0.38, yb + 0.95, 0.10, m + 0.42, yb + 1.25, 0.16, K.FRAME);
    } else { E.box(x0, yA, 0.05, x1, yA + f, 0.10, K.FRAME); if (x1 - x0 > 2.6) { const m = (x0 + x1) / 2; E.box(m - 0.025, yA, 0.05, m + 0.025, yB, 0.10, K.FRAME); } }
  }
  const wk = E.wk; E.wk = K.WALL;                           // the street floor is rebuilt, not photographed
  E.skin(0, W, yb, yt, T, holes); E.wk = wk;
  E.box(0.06, yb + top + 0.10, T, W - 0.06, yt - 0.12, T + 0.14, K.BAND, fract(s * 17.9 + 0.31));
  w.band = { x0: 0.06, x1: W - 0.06, y0: yb + top + 0.10, y1: yt - 0.12, z: T + 0.145, n: sb, sw };
  if (!far && fract(s * 23.1) < 0.35) {                     // awning
    const ay = yb + top + 0.06, d = 1.05, par = fract(s * 41.3);
    E.quad([0.15, ay - 0.42, T + d], [W - 0.15, ay - 0.42, T + d], [W - 0.15, ay, T + 0.02], [0.15, ay, T + 0.02], [0, 0.93, 0.37], K.AWN, par);
    E.quad([0.15, ay - 0.02, T + 0.02], [W - 0.15, ay - 0.02, T + 0.02], [W - 0.15, ay - 0.44, T + d], [0.15, ay - 0.44, T + d], [0, -0.93, -0.37], K.AWN, par);      // its underside
    E.quad([0.15, ay - 0.62, T + d], [W - 0.15, ay - 0.62, T + d], [W - 0.15, ay - 0.42, T + d], [0.15, ay - 0.42, T + d], [0, 0, 1], K.AWN, par);
  }
}
// one window: the opening through the skin, glass set back in it, frame and sill
function windowAt(E, x0, a, x1, bq, T, roomSeed, far, sill = true) {
  E.reveal(x0, a, x1, bq, T, 0.05, K.WALL);
  E.glass(x0, a, x1, bq, 0.05, roomSeed);
  if (far) return;
  const f = 0.045, ww = x1 - x0;
  E.box(x0, a, 0.05, x1, a + f, 0.09, K.FRAME); E.box(x0, bq - f, 0.05, x1, bq, 0.09, K.FRAME);
  E.box(x0, a, 0.05, x0 + f, bq, 0.09, K.FRAME); E.box(x1 - f, a, 0.05, x1, bq, 0.09, K.FRAME);
  for (let k = 1, n = Math.max(1, Math.round(ww / 1.3)); k < n; k++) { const m = x0 + (ww * k) / n; E.box(m - 0.02, a, 0.05, m + 0.02, bq, 0.09, K.FRAME); }
  if (sill) E.box(x0 - 0.06, a - 0.07, T, x1 + 0.06, a, T + 0.08, K.SLAB);
}

// a shop or office front at street level, facing a street: gets a shopfront
const hasShop = (b, w) => (b.cls === CLS.SHOP || (b.cls === CLS.OFFICE && b.H > 10)) && w.open && w.y0 < 0.6 && w.W > 3.2;

// w: { W width, y0, y1 height range above the foot, open: faces a street or yard, top: reaches the roof,
//      hid: null or { at(x) }: the height below which the wall was hidden from the air }
// b: { cls, floors, H, seed }      det: the window grid read off this wall's photo, or null
function buildWall(E, w, b, detail, det) {
  const { W, y0, y1 } = w, s = b.seed, H = b.H;
  const far = detail < 1;                                    // beyond the fine range: openings and glass only
  const shopFloor = hasShop(b, w);
  const tower = (b.cls === CLS.OFFICE && H >= 45) || (b.cls === CLS.SHOP && H >= 70);
  let style = tower ? 'curtain' : b.cls === CLS.APART ? (w.open && W >= 5 && fract(s * 3.3) < 0.8 ? 'balcony' : 'punched')
    : b.cls === CLS.HOUSE ? 'house' : b.cls === CLS.INDUS ? 'indus' : b.cls === CLS.PUBLIC ? 'ribbon'
      : b.cls === CLS.OFFICE ? (fract(s * 5.9) < 0.45 ? 'ribbon' : fract(s * 5.9) < 0.6 ? 'curtain' : 'punched') : (fract(s * 5.9) < 0.3 ? 'ribbon' : 'punched');
  if (!w.open && style !== 'curtain') style = 'blind';
  const S = Math.max(b.floors, 1);
  const fh0 = clamp(H / S, 2.6, 5.2), gh = shopFloor ? clamp(fh0 * 1.18, 3.5, 5.0) : fh0;
  const fh = S > 1 ? clamp((H - gh - 0.5) / (S - 1), 2.5, 5.2) : fh0;
  const T = det ? 0.18 : style === 'curtain' ? 0.09 : style === 'ribbon' ? 0.15 : 0.22;
  w.T = T;
  if (det && !det.rows.length && !shopFloor && !det.cover) return;        // stays exactly as photographed
  E.wk = det ? K.PHOTO : K.WALL;
  // returns at both ends and the top edge, so the skin is a solid sheet and not a floating card
  E.quad([0, y0, 0], [0, y0, T], [0, y1, T], [0, y1, 0], [-1, 0, 0], K.WALL);
  E.quad([W, y0, T], [W, y0, 0], [W, y1, 0], [W, y1, T], [1, 0, 0], K.WALL);
  if (w.top) E.box(-0.04, y1, -0.10, W + 0.04, y1 + 0.09, T + 0.07, K.SLAB);       // coping
  else E.quad([0, y1, T], [W, y1, T], [W, y1, 0], [0, y1, 0], [0, 1, 0], K.WALL);

  if (det) {
    // The photo stays on the skin wherever the aircraft saw this wall, and the windows read from it become
    // real openings. Where the wall was hidden from the air the photo shows something else (the neighbour's
    // roof), so there the skin is rebuilt in the wall's own colour and the window grid is carried on.
    const hid = w.hid, hidden = (x, y) => !!hid && y < hid.at(x);
    const plainRun = (xa, xb, yb, yt) => {
      const n = Math.max(1, Math.ceil((xb - xa) / 3.2));
      for (let q = 0; q < n; q++) { const a = xa + ((xb - xa) * q) / n, c = xa + ((xb - xa) * (q + 1)) / n; E.front(a, yb, c, yt, T, hidden((a + c) / 2, (yb + yt) / 2) ? K.WALL : K.PHOTO); }
    };
    const plainBand = (yb, yt) => { const n = Math.max(1, Math.ceil((yt - yb) / 4)); for (let q = 0; q < n; q++) plainRun(0, W, yb + ((yt - yb) * q) / n, yb + ((yt - yb) * (q + 1)) / n); };
    let y = y0;
    const R = det.rows, g1 = R.length ? Math.min(R[0].y - 0.45, y0 + 4.2) : Math.min(y0 + 4.0, y1);
    if (shopFloor && g1 - y0 > 2.9) { shopfront(E, w, b, y0, g1, T, far); y = g1; }
    for (let k = 0; k < R.length; k++) {
      // this storey's strip runs half way to the rows below and above, 1.5 m at most; plain wall fills the rest
      const r = R[k];
      const lo = Math.max(y, k ? Math.max((R[k - 1].y + R[k - 1].h + r.y) / 2, r.y - 1.5) : r.y - 1.5);
      const hi = Math.min(y1, k < R.length - 1 ? Math.min((r.y + r.h + R[k + 1].y) / 2, r.y + r.h + 1.5) : r.y + r.h + 1.5);
      if (hi - lo < 0.5) continue;
      if (lo > y + 1e-3) plainBand(y, lo);
      const holes = [];
      for (let m = 0; m < r.wins.length; m++) {
        const [x0, x1, made] = r.wins[m], a = Math.max(r.y, lo + 0.08), bq = Math.min(r.y + r.h, hi - 0.1);
        if (bq - a < 0.4) continue;
        holes.push({ x0, x1, y0: a, y1: bq, made });
        windowAt(E, x0, a, x1, bq, T, fract(s * 31.7 + m * 0.37 + k * 0.613), far, det.bays);
      }
      // the skin of this storey, cut between the openings so each piece can be photo or rebuilt wall
      let x = 0;
      for (let m = 0; m < holes.length; m++) {
        const h = holes[m], xe = m < holes.length - 1 ? (h.x1 + holes[m + 1].x0) / 2 : W;
        const xa = Math.max(x, h.x0 - 0.5), xb = Math.min(xe, h.x1 + 0.5);
        if (xa > x + 1e-3) plainRun(x, xa, lo, hi);
        E.wk = h.made || hidden((h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2) ? K.WALL : K.PHOTO;
        E.skin(xa, xb, lo, hi, T, [h]);
        if (xe > xb + 1e-3) plainRun(xb, xe, lo, hi);
        x = xe;
      }
      if (x < W - 1e-3) plainRun(x, W, lo, hi);
      y = hi;
    }
    if (y < y1 - 1e-3) plainBand(y, y1);
    E.wk = K.WALL;
    return;
  }

  const bwT = style === 'curtain' ? 1.5 : style === 'balcony' ? 3.1 : style === 'house' ? 2.6 : style === 'indus' ? 5 : 1.5 + 1.9 * fract(s * 7.13);
  const nb = Math.max(1, Math.round(W / bwT)), bw = W / nb;
  const rows = [];
  for (let j = 0; j < S; j++) { const yb = j === 0 ? 0 : gh + (j - 1) * fh, yt = j === 0 ? gh : yb + fh; if (yb >= y0 - 0.3 && yt <= y1 + 0.05) rows.push({ j, yb: Math.max(yb, y0), yt }); }
  // foot and head of the wall where no whole storey fits
  const first = rows.length ? rows[0].yb : y1, last = rows.length ? rows[rows.length - 1].yt : y1;
  E.front(0, y0, W, first, T, K.WALL); E.front(0, last, W, y1, T, K.WALL);

  for (const row of rows) {
    const { j, yb, yt } = row, holes = [], rh = yt - yb;
    const ground = j === 0 && y0 < 0.6;
    if (ground && shopFloor) { shopfront(E, w, b, yb, yt, T, far); continue; }
    if (style === 'blind') { E.front(0, yb, W, yt, T, K.WALL); continue; }
    if (style === 'curtain') {
      // glass storey to storey; a spandrel strip hides the floor slab
      E.front(0, yb, W, yb + 0.55, T, K.FRAME);
      for (let i = 0; i < nb; i++) E.glass(i * bw + 0.03, yb + 0.55, (i + 1) * bw - 0.03, yt, T - 0.05, fract(s * 31.7 + i * 0.37 + j * 0.613));
      for (let i = 0; i <= nb; i++) { const x = clamp(i * bw, 0.03, W - 0.03); if (far && i % 2) continue; E.box(x - 0.03, yb + 0.55, T - 0.05, x + 0.03, yt, T + 0.05, K.FRAME); }
      continue;
    }
    if (style === 'ribbon') {
      const a = yb + Math.min(0.95, rh * 0.32), bq = yt - Math.min(0.55, rh * 0.18), e = Math.min(0.45, W * 0.08);
      holes.push({ x0: e, x1: W - e, y0: a, y1: bq });
      E.reveal(e, a, W - e, bq, T, 0.04, K.SLAB);
      const n2 = Math.max(1, Math.round((W - 2 * e) / Math.max(bw, 1.2))), ww = (W - 2 * e) / n2;
      for (let i = 0; i < n2; i++) {
        E.glass(e + i * ww, a, e + (i + 1) * ww, bq, 0.04, fract(s * 31.7 + i * 0.37 + j * 0.613));
        if (!far && i) E.box(e + i * ww - 0.03, a, 0.04, e + i * ww + 0.03, bq, 0.11, K.FRAME);
      }
      E.skin(0, W, yb, yt, T, holes);
      if (!far) E.box(e - 0.05, a - 0.06, T, W - e + 0.05, a, T + 0.07, K.SLAB);
      continue;
    }
    if (style === 'balcony') {
      // sliding doors on to a balcony that runs the width of the building
      for (let i = 0; i < nb; i++) {
        const x0 = i * bw + 0.30, x1 = (i + 1) * bw - 0.30, a = yb + 0.08, bq = yb + Math.min(2.15, rh - 0.4);
        holes.push({ x0, x1, y0: a, y1: bq });
        E.reveal(x0, a, x1, bq, T, 0.05, K.FRAME);
        E.glass(x0, a, x1, bq, 0.05, fract(s * 31.7 + i * 0.37 + j * 0.613));
        if (!far) { const m = (x0 + x1) / 2; E.box(m - 0.025, a, 0.05, m + 0.025, bq, 0.10, K.FRAME); E.box(x0, bq - 0.05, 0.05, x1, bq, 0.10, K.FRAME); }
      }
      E.skin(0, W, yb, yt, T, holes);
      if (j > 0 || y0 > 0.6) {
        const d = 1.15;
        E.box(0.05, yb - 0.16, T, W - 0.05, yb, T + d, K.SLAB);
        E.box(0.05, yb, T + d - 0.05, W - 0.05, yb + 1.12, T + d, K.RAIL);
        if (!far) {
          E.box(0.05, yb + 1.12, T + d - 0.07, W - 0.05, yb + 1.17, T + d + 0.02, K.FRAME);
          for (let i = 0; i <= nb; i += 2) { const x = clamp(i * bw, 0.07, W - 0.07); E.box(x - 0.02, yb, T, x + 0.02, yb + (i === 0 || i >= nb ? 1.12 : rh - 0.16), T + d - 0.05, K.RAIL); }
        }
      }
      continue;
    }
    // punched openings (also houses and sheds, with their own sizes)
    const house = style === 'house', shed = style === 'indus';
    for (let i = 0; i < nb; i++) {
      if (house && (i + j + Math.floor(s * 8)) % 2 === 1) continue;
      if (shed && !(ground && i === Math.floor(fract(s * 11.3) * nb)) && (i + j) % 3 !== 0) continue;
      if (!house && !shed && nb > 5 && i % 5 === 4 && fract(s * 13.3) < 0.5) continue;      // a blank bay now and then
      let ww = house ? Math.min(bw * 0.62, 1.7) : shed ? Math.min(bw * 0.7, 3.4) : Math.min(bw * (0.46 + 0.2 * fract(s * 2.9)), 2.3);
      let wh = house ? Math.min(rh * 0.42, 1.25) : shed ? Math.min(rh * 0.3, 1.2) : Math.min(rh * (0.44 + 0.12 * fract(s * 6.7)), 1.9);
      let a = yb + (house ? 0.95 : shed ? rh - wh - 0.5 : Math.min(0.92, rh * 0.3));
      if (ground && (house || shed) && i === Math.floor(fract(s * 11.3) * nb)) { ww = shed ? Math.min(bw * 0.8, 4) : 0.95; wh = Math.min(rh - 0.35, shed ? 3.6 : 2.05); a = yb + 0.03; }   // the door
      const x0 = i * bw + (bw - ww) / 2, x1 = x0 + ww, bq = Math.min(a + wh, yt - 0.25);
      if (bq - a < 0.4 || ww < 0.4) continue;
      holes.push({ x0, x1, y0: a, y1: bq });
      if (a < yb + 0.1) { E.reveal(x0, a, x1, bq, T, 0.05, K.WALL); E.front(x0, a, x1, bq, 0.05, K.FRAME); }      // a door leaf
      else windowAt(E, x0, a, x1, bq, T, fract(s * 31.7 + i * 0.37 + j * 0.613), far);
    }
    E.skin(0, W, yb, yt, T, holes);
  }
}

/* ------------------------------------------------------------------ walls of one building, from its survey mesh */
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();

// every triangle of a tile, sorted by which building it belongs to (done once per tile)
function triIndex(scene) {
  if (scene.userData.tris) return scene.userData.tris;
  const out = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes._batchid) return;
    const g = o.geometry, B = g.attributes._batchid, I = g.index, n = I ? I.count : g.attributes.position.count, per = new Map();
    for (let t = 0; t < n; t += 3) { const id = B.getX(I ? I.getX(t) : t); let l = per.get(id); if (!l) per.set(id, l = []); l.push(t); }
    out.push({ o, per });
  });
  return (scene.userData.tris = out);
}

function extractWalls(scene, id) {
  const groups = new Map();
  for (const { o, per } of triIndex(scene)) {
    const list = per.get(id);
    if (!list) continue;
    const g = o.geometry, P = g.attributes.position, UV = g.attributes.uv, I = g.index, m = o.matrixWorld, tex = o.material.map || null;
    for (const t of list) {
      const ia = I ? I.getX(t) : t, ib = I ? I.getX(t + 1) : t + 1, ic = I ? I.getX(t + 2) : t + 2;
      _a.fromBufferAttribute(P, ia).applyMatrix4(m); _b.fromBufferAttribute(P, ib).applyMatrix4(m); _c.fromBufferAttribute(P, ic).applyMatrix4(m);
      _n.crossVectors(_e1.subVectors(_b, _a), _e2.subVectors(_c, _a));
      const area = _n.length() / 2;
      if (area < 0.02) continue;
      _n.divideScalar(area * 2);
      if (Math.abs(_n.y) > 0.3) continue;                       // roofs and floors
      const hl = Math.hypot(_n.x, _n.z), nx = _n.x / hl, nz = _n.z / hl;
      const key = Math.round(Math.atan2(nz, nx) / 0.05) + '|' + Math.round((nx * _a.x + nz * _a.z) / 0.25);
      let w = groups.get(key);
      if (!w) groups.set(key, w = { nx: 0, nz: 0, area: 0, tris: [], tex, mesh: o, best: 0, uvTri: null });
      w.nx += nx * area; w.nz += nz * area; w.area += area;
      w.tris.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
      if (UV && tex && area > w.best) { w.best = area; w.uvTri = [_a.clone(), _b.clone(), _c.clone(), UV.getX(ia), UV.getY(ia), UV.getX(ib), UV.getY(ib), UV.getX(ic), UV.getY(ic)]; }
    }
  }
  return [...groups.values()];
}

// the largest upright rectangle the wall fills, found on a coarse raster of the wall's own plane
function wallRect(w) {
  const hl = Math.hypot(w.nx, w.nz); w.nx /= hl; w.nz /= hl;
  const tx = w.nz, tz = -w.nx, T = w.tris;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, d = 0;
  for (let k = 0; k < T.length; k += 3) { const u = T[k] * tx + T[k + 2] * tz, v = T[k + 1]; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; d += T[k] * w.nx + T[k + 2] * w.nz; }
  d /= T.length / 3;
  const W = u1 - u0, Hh = v1 - v0;
  if (W < 1.5 || Hh < 2.2) return null;
  const res = Math.max(0.35, W / 160, Hh / 240), cols = Math.max(1, Math.ceil(W / res)), rows = Math.max(1, Math.ceil(Hh / res)), grid = new Uint8Array(cols * rows);
  for (let k = 0; k < T.length; k += 9) {
    const ax = (T[k] * tx + T[k + 2] * tz - u0) / res, ay = (T[k + 1] - v0) / res, bx = (T[k + 3] * tx + T[k + 5] * tz - u0) / res, by = (T[k + 4] - v0) / res, cx = (T[k + 6] * tx + T[k + 8] * tz - u0) / res, cy = (T[k + 7] - v0) / res;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(cols - 1, Math.floor(Math.max(ax, bx, cx)));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), j1 = Math.min(rows - 1, Math.floor(Math.max(ay, by, cy)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i + 0.5, py = j + 0.5, l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      if (l1 >= -0.02 && l2 >= -0.02 && l1 + l2 <= 1.02) grid[j * cols + i] = 1;
    }
  }
  // rows that are filled nearly edge to edge, taken as one run up from the lowest such row
  let jA = -1, jB = -1;
  for (let j = 0; j < rows; j++) { let f = 0; for (let i = 0; i < cols; i++) f += grid[j * cols + i]; if (f >= cols * 0.86) { if (jA < 0) jA = j; jB = j; } else if (jA >= 0) break; }
  if (jA < 0) return null;
  // columns that are filled over that run, longest stretch
  let best = [0, -1], run = -1;
  for (let i = 0; i <= cols; i++) {
    let ok = i < cols; if (ok) { let f = 0; for (let j = jA; j <= jB; j++) f += grid[j * cols + i]; ok = f >= (jB - jA + 1) * 0.9; }
    if (ok && run < 0) run = i; if (!ok && run >= 0) { if (i - run > best[1] - best[0] + 1) best = [run, i - 1]; run = -1; }
  }
  const uA = u0 + best[0] * res, uB = Math.min(u1, u0 + (best[1] + 1) * res), vA = v0 + jA * res, vB = Math.min(v1, v0 + (jB + 1) * res);
  if (uB - uA < 1.5 || vB - vA < 2.2) return null;
  return { tx, tz, d, uA, uB, vA, vB };
}

/* ------------------------------------------------------------------ wall footprints, for "is there a street in front of this wall" */
class WallIndex {
  constructor() { this.tiles = new Map(); this.top = -Infinity; }             // top: the highest wall seen so far
  add(scene) {
    if (this.tiles.has(scene)) return;
    const segs = [], grid = new Map();
    for (const { o, per } of triIndex(scene)) {
      const g = o.geometry, P = g.attributes.position, I = g.index, m = o.matrixWorld;
      for (const [id, list] of per) for (const t of list) {
        _a.fromBufferAttribute(P, I ? I.getX(t) : t).applyMatrix4(m); _b.fromBufferAttribute(P, I ? I.getX(t + 1) : t + 1).applyMatrix4(m); _c.fromBufferAttribute(P, I ? I.getX(t + 2) : t + 2).applyMatrix4(m);
        _n.crossVectors(_e1.subVectors(_b, _a), _e2.subVectors(_c, _a));
        const l = _n.length(); if (l < 0.04 || Math.abs(_n.y) > 0.3 * l) continue;
        // the triangle seen from above is a line: keep its two ends
        const ab = Math.hypot(_a.x - _b.x, _a.z - _b.z), bc = Math.hypot(_b.x - _c.x, _b.z - _c.z), ca = Math.hypot(_c.x - _a.x, _c.z - _a.z);
        const [p, q] = ab >= bc && ab >= ca ? [_a, _b] : bc >= ca ? [_b, _c] : [_c, _a];
        if (Math.hypot(p.x - q.x, p.z - q.z) < 0.25) continue;
        const k = segs.length;
        segs.push(p.x, p.z, q.x, q.z, Math.min(_a.y, _b.y, _c.y), Math.max(_a.y, _b.y, _c.y), id);
        if (segs[k + 5] > this.top) this.top = segs[k + 5];
        const c0 = Math.floor(Math.min(p.x, q.x) / 8), c1 = Math.floor(Math.max(p.x, q.x) / 8), r0 = Math.floor(Math.min(p.z, q.z) / 8), r1 = Math.floor(Math.max(p.z, q.z) / 8);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const key = c + ',' + r; let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(k); }
      }
    }
    this.tiles.set(scene, { segs, grid });
  }
  remove(scene) { this.tiles.delete(scene); }
  // distance along a level ray to the first wall of another building, or Infinity
  cast(ox, oz, dx, dz, y, far, skipScene, skipId) {
    let best = Infinity;
    const ex = ox + dx * far, ez = oz + dz * far;
    const c0 = Math.floor(Math.min(ox, ex) / 8), c1 = Math.floor(Math.max(ox, ex) / 8), r0 = Math.floor(Math.min(oz, ez) / 8), r1 = Math.floor(Math.max(oz, ez) / 8);
    for (const [scene, { segs, grid }] of this.tiles) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const cell = grid.get(c + ',' + r); if (!cell) continue;
      for (const k of cell) {
        if (scene === skipScene && segs[k + 6] === skipId) continue;
        if (y < segs[k + 4] - 0.2 || y > segs[k + 5] + 0.2) continue;
        const px = segs[k], pz = segs[k + 1], sx = segs[k + 2] - px, sz = segs[k + 3] - pz, den = dx * sz - dz * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((px - ox) * sz - (pz - oz) * sx) / den, u = ((px - ox) * dz - (pz - oz) * dx) / den;
        if (t > 0 && t < best && u >= -0.02 && u <= 1.02) best = t;
      }
    }
    return best;
  }
  // Could an aircraft have seen this point? A ray leaves it at the given climb (metres up per metre out) and
  // is stopped by any other building's wall that is still above it there. Walks the 8 m cells along the ray.
  blocked(ox, oz, dx, dz, y, climb, far, skipScene, skipId) {
    let cx = Math.floor(ox / 8), cz = Math.floor(oz / 8), t = 0;
    const ax = Math.abs(dx), az = Math.abs(dz), ix = dx > 0 ? 1 : -1, iz = dz > 0 ? 1 : -1;
    const tdx = ax > 1e-9 ? 8 / ax : Infinity, tdz = az > 1e-9 ? 8 / az : Infinity;
    let tmx = ax > 1e-9 ? (dx > 0 ? (cx + 1) * 8 - ox : ox - cx * 8) / ax : Infinity, tmz = az > 1e-9 ? (dz > 0 ? (cz + 1) * 8 - oz : oz - cz * 8) / az : Infinity;
    while (t <= far) {
      const key = cx + ',' + cz;
      for (const [scene, { segs, grid }] of this.tiles) {
        const cell = grid.get(key); if (!cell) continue;
        for (const k of cell) {
          if (scene === skipScene && segs[k + 6] === skipId) continue;
          const px = segs[k], pz = segs[k + 1], sx = segs[k + 2] - px, sz = segs[k + 3] - pz, den = dx * sz - dz * sx;
          if (Math.abs(den) < 1e-9) continue;
          const tt = ((px - ox) * sz - (pz - oz) * sx) / den, u = ((px - ox) * dz - (pz - oz) * dx) / den;
          if (tt <= 0.3 || tt > far || u < -0.02 || u > 1.02) continue;
          const yr = y + tt * climb;
          if (yr >= segs[k + 4] - 0.3 && yr <= segs[k + 5]) return true;
        }
      }
      if (tmx < tmz) { t = tmx; tmx += tdx; cx += ix; } else { t = tmz; tmz += tdz; cz += iz; }
    }
    return false;
  }
}

/* ------------------------------------------------------------------ manager */
export class Facades {
  constructor(city) {
    this.city = city;
    this.group = new THREE.Group(); this.group.name = 'facades';
    this.radius = 120; this.keep = 165; this.maxEye = 170;      // metres: build within, drop beyond, and only this low
    this.fine = 55;                                            // within this, frames, sills and mullions too
    this.maxTris = 2.4e6;                                      // stop adding buildings past this many triangles
    this.budget = 5;                                           // milliseconds of building per frame
    this.byScene = new Map(); this.walls = new WallIndex();
    this.mats = new Map(); this.plainMat = null;
    this.queue = []; this._scanAt = 0;
    this.stats = { buildings: 0, tris: 0, ms: 0, t: { walls: 0, sky: 0, read: 0, emit: 0 } };      // t: milliseconds spent so far, by step
    this.onBuilt = null;                                       // (entry) => void, after a building is built
    this.onDress = null;                                       // (entry) => void: signs.js hangs the signs here
  }

  material(tex) {
    if (!tex) return this.plainMat || (this.plainMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }), 'gen-p', GEN));
    let m = this.mats.get(tex);
    if (!m) { m = patch(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.8, metalness: 0 }), 'gen-t', { ...GEN, map: GEN_MAP }); this.mats.set(tex, m); }
    return m;
  }

  // called by City when it swaps a tile's photo sheet for a larger or smaller copy
  retexture(oldTex, newTex) {
    const m = this.mats.get(oldTex);
    if (m) { m.map = newTex; this.mats.delete(oldTex); this.mats.set(newTex, m); }
  }

  dropScene(scene) {
    const per = this.byScene.get(scene);
    if (per) { for (const e of per.values()) this.free(e); this.byScene.delete(scene); }
    this.walls.remove(scene); delete scene.userData.tris;
  }
  free(e) {
    for (const m of e.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.stats.buildings--; this.stats.tris -= e.tris;
    e.onFree?.();
  }

  update(camera, eye) {
    const cam = camera.position, now = performance.now();
    if (now - this._scanAt > 220) {
      this._scanAt = now; this.queue.length = 0;
      const live = eye < this.maxEye, active = new Set();
      for (const s of this.city.sets) {
        if (!s.tiles || s.kind !== 'bldg') continue;
        // "active" = the tiles the survey model is showing right now, in view or not. Coarse tiles count too:
        // the largest buildings live in those and stay there however close the camera comes.
        for (const tile of s.tiles.activeTiles) {
          const scene = tile.engineData?.scene, B = scene?.userData.bld;
          if (!B || !scene.parent) continue;
          active.add(scene);
          if (!live || tile.traversal.distanceFromCamera > this.radius + 30) continue;
          this.walls.add(scene);                               // neighbours count when asking what faces a wall
          const info = scene.userData.tex;
          if (info && info.luma === undefined) { this.city.luma(scene); continue; }      // its photo is still being read
          const per = this.byScene.get(scene);
          for (let k = 0; k < B.n; k++) {
            if (per?.has(k) || B.hi[k] - B.lo[k] < 2.4) continue;
            const dx = Math.max(B.x0[k] - cam.x, 0, cam.x - B.x1[k]), dz = Math.max(B.z0[k] - cam.z, 0, cam.z - B.z1[k]), d = Math.hypot(dx, dz);
            if (d < this.radius) this.queue.push({ scene, k, d });
          }
        }
      }
      this.queue.sort((a, b) => b.d - a.d);
      // a building first met at a distance was built without its fine detail: rebuild it once the camera is close
      for (const [scene, per] of this.byScene) {
        const B = scene.userData.bld;
        for (const [k, e] of per) {
          if (e.fine) continue;
          const dx = Math.max(B.x0[k] - cam.x, 0, cam.x - B.x1[k]), dz = Math.max(B.z0[k] - cam.z, 0, cam.z - B.z1[k]), d = Math.hypot(dx, dz);
          if (d < this.fine * 0.8) { this.free(e); per.delete(k); this.queue.push({ scene, k, d }); }
        }
      }
      // let go of what is far behind, and of tiles the survey model has swapped for a finer or coarser one
      // (the same building then arrives in the new tile and is built again from that)
      for (const [scene, per] of this.byScene) {
        const B = scene.userData.bld, gone = !active.has(scene);
        for (const [k, e] of per) {
          const dx = Math.max(B.x0[k] - cam.x, 0, cam.x - B.x1[k]), dz = Math.max(B.z0[k] - cam.z, 0, cam.z - B.z1[k]);
          if (!live || gone || Math.hypot(dx, dz) > this.keep) { this.free(e); per.delete(k); }
        }
        if (!per.size) this.byScene.delete(scene);
      }
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < this.budget && this.stats.tris < this.maxTris) {
      const { scene, k, d } = this.queue.pop();
      if (!scene.parent || !scene.userData.bld) continue;
      let per = this.byScene.get(scene); if (!per) this.byScene.set(scene, per = new Map());
      if (!per.has(k)) per.set(k, this.build(scene, k, d));
    }
    this.stats.ms = performance.now() - t0;
  }

  // For each stretch of a wall: the height below which an aircraft could not have seen it, because another
  // building stands in a line of sight that climbs away from the wall at 60 degrees. The survey's wall photos
  // were taken from the air, so below that line the "photo" is of whatever stood in front. Null: all of it was seen.
  skyline(ox, oz, r, w, W, y0, y1, foot, scene, k) {
    const n = clamp(Math.round(W / 3), 2, 12), h = new Float32Array(n), walls = this.walls;
    let any = false;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, px = ox + r.tx * W * f + w.nx * 0.4, pz = oz + r.tz * W * f + w.nz * 0.4;
      const shut = (y) => walls.blocked(px, pz, w.nx, w.nz, foot + y, 1.73, Math.min(60, (walls.top - foot - y) / 1.73 + 1), scene, k);
      if (!shut(y0 + 0.5)) { h[i] = y0; continue; }
      any = true;
      if (shut(y1 - 0.3)) { h[i] = y1 + 1; continue; }
      let lo = y0 + 0.5, hi = y1 - 0.3;
      for (let m = 0; m < 6; m++) { const mid = (lo + hi) / 2; if (shut(mid)) lo = mid; else hi = mid; }
      h[i] = hi;
    }
    return any ? { n, h, at: (x) => h[clamp(Math.floor((x / W) * n), 0, n - 1)] } : null;
  }

  build(scene, k, dist) {
    const B = scene.userData.bld, foot = B.lo[k], H = B.hi[k] - foot, seed = B.seed[k];
    let cls = B.cls[k];
    if (!cls) cls = H < 9 ? CLS.HOUSE : H < 34 ? CLS.SHOP : CLS.OFFICE;
    const floors = B.floors[k] || Math.max(1, Math.round(H / 3.3));
    const b = { cls, floors, H, seed, id: k };
    this.walls.add(scene);
    scene.updateMatrixWorld(true);
    const e = { meshes: [], tris: 0, read: 0, bands: [], walls: [], scene, k, foot, H, cls, fine: dist < this.fine,
      box: [B.x0[k], B.z0[k], B.x1[k], B.z1[k]] };
    const emits = new Map();
    const cx = (B.x0[k] + B.x1[k]) / 2, cz = (B.z0[k] + B.z1[k]) / 2;
    // the colour a building with no photo gets (the same palette its far shader uses)
    const m1 = fract(seed * 5.3), pal = [0.70 + (0.46 - 0.70) * m1, 0.68 + (0.45 - 0.68) * m1, 0.64 + (0.44 - 0.64) * m1];
    if (fract(seed * 11.9) > 0.80) { pal[0] += (0.52 - pal[0]) * 0.75; pal[1] += (0.40 - pal[1]) * 0.75; pal[2] += (0.32 - pal[2]) * 0.75; }
    if (fract(seed * 17.7) > 0.70) { pal[0] += (0.80 - pal[0]) * 0.8; pal[1] += (0.79 - pal[1]) * 0.8; pal[2] += (0.76 - pal[2]) * 0.8; }
    // first every wall is measured and read, then all are built: a wall that was wholly hidden from the air
    // takes its colour from one of the building's walls that was seen
    const plan = [], tm = this.stats.t; let t0 = performance.now();
    const lap = (key) => { const n = performance.now(); tm[key] += n - t0; t0 = n; };
    for (const w of extractWalls(scene, k)) {
      const r = wallRect(w);
      if (!r) continue;
      const W = r.uB - r.uA, y0 = r.vA - foot, y1 = r.vB - foot;
      const ox = w.nx * r.d + r.tx * r.uA, oz = w.nz * r.d + r.tz * r.uA;       // wall start, on the wall plane
      // what stands in front of this wall? Probed at a third and two thirds of its length, 1.6 m above its foot.
      let gap = Infinity;
      for (const f of [0.3, 0.7]) gap = Math.min(gap, this.walls.cast(ox + r.tx * W * f + w.nx * 0.35, oz + r.tz * W * f + w.nz * 0.35, w.nx, w.nz, r.vA + 1.6, 9, scene, k));
      if (gap < 0.8) continue;                                  // party wall: nobody will ever see it
      let uvNear = null, uvRaw = null;
      if (w.uvTri) {
        // the photo sheet's own mapping on this wall (it is flat, so three corners give it exactly)
        const [A, Bv, C, ua, va, ub, vb, uc, vc] = w.uvTri;
        const au = A.x * r.tx + A.z * r.tz - r.uA, av = A.y - foot, bu = Bv.x * r.tx + Bv.z * r.tz - r.uA - au, bv2 = Bv.y - foot - av, cu = C.x * r.tx + C.z * r.tz - r.uA - au, cv = C.y - foot - av;
        const det = bu * cv - cu * bv2;
        if (Math.abs(det) > 1e-6) {
          const dux = ((ub - ua) * cv - (uc - ua) * bv2) / det, duy = (bu * (uc - ua) - cu * (ub - ua)) / det, dvx = ((vb - va) * cv - (vc - va) * bv2) / det, dvy = (bu * (vc - va) - cu * (vb - va)) / det;
          uvRaw = (x, y) => [ua + dux * (x - au) + duy * (y - av), va + dvx * (x - au) + dvy * (y - av)];
          // the photo's colour near a point, kept 0.7 m inside the wall, clear of the next patch on the sheet
          uvNear = (x, y) => uvRaw(clamp(x, 0.7, Math.max(W - 0.7, 0.7)), clamp(y, y0 + 0.7, Math.max(y1 - 0.7, y0 + 0.7)));
        }
      }
      const wall = { W, y0, y1, open: gap > 3.2, top: y1 > H - 0.6, hid: null };
      // A wall with a photo is read for its own windows, over the part an aircraft could see. Those become real
      // openings and the photo stays on the wall around them. The part that was hidden is rebuilt: the same
      // grid of windows carried on, in the wall's own colour. Nothing read and nothing hidden (a blank side
      // wall, plain glass): the photo is kept as it is. A wall with no photo gets a pattern for its use.
      let det = null, ref = null;
      if (uvRaw) {
        const info = scene.userData.tex, L = info?.luma?.[info.entries.findIndex((en) => en.meshes.includes(w.mesh))];
        lap('walls');
        wall.hid = this.skyline(ox, oz, r, w, W, y0, y1, foot, scene, k);
        lap('sky');
        if (L && READ.keep) { const smp = sampleWall(L, uvRaw, W, y0, y1, b); smp.hid = wall.hid ? Array.from(wall.hid.h) : null; smp.open = wall.open; smp.seed = seed; READ.keep.push(smp); }
        det = (L && detect(L, uvRaw, W, y0, y1, b, { hid: wall.hid, open: wall.open, yMin: hasShop(b, wall) ? y0 + 4.4 : y0 + 0.9 })) || { fh: 3.6, wh: 0, rows: [], bays: false, ref: null, cover: false };
        if (det.rows.some((row) => row.wins.some((q) => !q[2]))) e.read++;
        if (det.ref) ref = uvRaw(det.ref[0], det.ref[1]);
        lap('read');
      }
      plan.push({ w, r, W, y0, y1, ox, oz, wall, det, ref, uvRaw, uvNear });
    }
    lap('walls');
    // per photo sheet: the colour reference of the largest wall that has one
    const lend = new Map();
    for (const p of plan) if (p.ref) { const cur = lend.get(p.w.tex); if (!cur || p.W * (p.y1 - p.y0) > cur.area) lend.set(p.w.tex, { area: p.W * (p.y1 - p.y0), uv: p.ref }); }
    for (const { w, r, W, y0, y1, ox, oz, wall, det, ref, uvRaw, uvNear } of plan) {
      const tex = w.tex;
      let E = emits.get(tex); if (!E) { E = new Emit(); E.cx = cx; E.cy = foot; E.cz = cz; emits.set(tex, E); }
      // everything that is not the photo itself (rebuilt wall, reveals, shopfront) is coloured from one clean
      // piece of this wall's photo; failing that from another wall's; failing that from the photo close by
      const tone = ref || lend.get(tex)?.uv || null, uvOf = !uvRaw ? null : tone ? () => tone : uvNear;
      E.frame({ x: ox, z: oz }, { x: r.tx, z: r.tz }, { x: w.nx, z: w.nz }, foot, uvOf, uvRaw, seed, uvOf ? [1, 1, 1] : pal);
      buildWall(E, wall, b, dist < this.fine ? 1 : 0, det);
      const where = { ox, oz, tx: r.tx, tz: r.tz, nx: w.nx, nz: w.nz, foot, W, y0, y1, open: wall.open, T: wall.T };
      e.walls.push(where);
      if (wall.band) e.bands.push({ ...where, ...wall.band });       // the band's own y0 / y1 must win over the wall's
    }
    for (const [tex, E] of emits) {
      if (!E.count) continue;
      const mesh = new THREE.Mesh(E.geometry(), this.material(tex));
      mesh.position.set(cx, foot, cz); mesh.updateMatrixWorld(); mesh.matrixAutoUpdate = false;
      // The surveyed shell behind already casts the building's shadow. Drawing all this detail into three
      // shadow maps as well would triple its cost for shadows a few centimetres deep.
      mesh.castShadow = false; mesh.receiveShadow = true;
      this.group.add(mesh); e.meshes.push(mesh); e.tris += E.i.length / 3;
    }
    lap('emit');
    this.stats.buildings++; this.stats.tris += e.tris;
    this.onBuilt?.(e); this.onDress?.(e);
    return e;
  }
}
