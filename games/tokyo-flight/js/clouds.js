// clouds.js — the clouds: volumes the aircraft flies under, through and over.
//
// Three layers, as a weather report gives them:
//   low    cumulus, stratocumulus, stratus, nimbostratus or cumulonimbus: a slab between a base and a top height,
//          filled where a 3D noise says so. How much of it is filled is the reported cover; the kind sets the shape
//          (flat sheet, heaps with level bases and domed tops, or towers with an anvil).
//   mid    altocumulus / altostratus: a thinner slab higher up.
//   high   cirrus: a single thin sheet of streaks.
// One ray per pixel of a small picture (a third to a half of the screen each way) is walked through the slabs.
// Each sample inside cloud is lit by the sun through the cloud between it and the sun, and by the sky. The result
// is two small pictures: the light the cloud sends and how much it lets through, and how far away it starts and
// ends. Every surface in the world then takes its share of the cloud for its own distance (atmo.js, apHazed), so
// a tower in front of a cloud stays sharp and one inside it fades.
// A second small picture, looking down the sun's rays, holds the clouds' shadow for the ground, the sea, the
// buildings and the aircraft.
//
// It stays light by drawing few rays and few steps and settling them over several frames: each frame starts its
// steps at a different depth and is blended with the last ones, moved to where they now are on screen.
import * as THREE from 'three';
import { ATMO } from './atmo.js';

const R_EARTH = 6371000;
const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const VERT = /* glsl */`
precision highp float;
in vec3 position; out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

/* ------------------------------------------------------------------ the noise the clouds are cut from */
// Made once, on the graphics card, a few slices a frame. All of it repeats, so it can be laid end to end.
//   kind 0  shape, 96 x 96 x 96: r = billows (smooth noise lifted by cells), g b a = cells at three sizes
//   kind 1  detail, 32 x 32 x 32: r g b = small cells at three sizes, for the wisps at a cloud's edge
//   kind 2  slow variation, 256 x 256: r g b = three smooth fields, a = streaks (cirrus)
// r, g, b, a of the shape are spread evenly between 0 and 1 (MAP below), so "the top 30 percent" is 30 percent of the sky.
const NOISE_FRAG = /* glsl */`
precision highp float; precision highp int;
in vec2 vUv; out vec4 o;
uniform float uZ; uniform int uKind;
vec3 h3( ivec3 c ) {
  uvec3 v = uvec3( c ) * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return vec3( v ) * ( 1.0 / 4294967295.0 );
}
ivec3 wrap( ivec3 c, int per ) { return ( ( c % per ) + per ) % per; }
// 1 at a cell's centre, 0 at its walls
float cells( vec3 p, int per ) {
  p *= float( per ); ivec3 i = ivec3( floor( p ) ); vec3 f = fract( p ); float m = 1.0;
  for ( int z = -1; z <= 1; z ++ ) for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
    ivec3 d = ivec3( x, y, z ); vec3 r = vec3( d ) + h3( wrap( i + d, per ) ) - f; m = min( m, dot( r, r ) );
  }
  return 1.0 - min( sqrt( m ), 1.0 );
}
float cells3( vec3 p, int per ) { return cells( p, per ) * 0.625 + cells( p, per * 2 ) * 0.25 + cells( p, per * 4 ) * 0.125; }
float grad( vec3 p, int per ) {
  p *= float( per ); ivec3 i = ivec3( floor( p ) ); vec3 f = fract( p ); vec3 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  float n = 0.0;
  for ( int z = 0; z <= 1; z ++ ) for ( int y = 0; y <= 1; y ++ ) for ( int x = 0; x <= 1; x ++ ) {
    ivec3 d = ivec3( x, y, z ); vec3 g = normalize( h3( wrap( i + d, per ) ) * 2.0 - 1.0 + 1e-4 );
    vec3 w = mix( 1.0 - u, u, vec3( d ) );
    n += dot( g, f - vec3( d ) ) * w.x * w.y * w.z;
  }
  return n;
}
float smoothN( vec3 p, int per, int oct ) { float a = 1.0, s = 0.0, w = 0.0; for ( int i = 0; i < oct; i ++ ) { s += a * grad( p, per ); w += a; a *= 0.5; per *= 2; } return s / w; }
float even( float v, float lo, float hi ) { return smoothstep( lo, hi, v ); }
void main() {
  vec3 p = vec3( vUv, uZ );
  if ( uKind == 0 ) {
    float c4 = cells3( p, 4 ), c8 = cells3( p, 8 ), c16 = cells3( p, 16 );
    float s = smoothN( p, 4, 5 ) * 1.25 + 0.5;
    float bill = c4 + clamp( s, 0.0, 1.0 ) * ( 1.0 - c4 );
    float low = c4 * 0.625 + c8 * 0.25 + c16 * 0.125;
    float shape = ( bill - ( low - 1.0 ) ) / ( 2.0 - low );
    o = vec4( even( shape, MAP_R ), even( c4, MAP_G ), even( c8, MAP_B ), even( c16, MAP_A ) );
  } else if ( uKind == 1 ) {
    o = vec4( cells3( p, 2 ), cells3( p, 4 ), cells3( p, 8 ), 1.0 );
  } else {
    vec3 q = vec3( vUv, 0.37 );
    float a = smoothN( q, 3, 5 ), b = smoothN( q + vec3( 0.0, 0.0, 0.31 ), 4, 5 ), c = smoothN( q + vec3( 0.0, 0.0, 0.67 ), 3, 5 );
    // streaks: fine noise pulled out along one axis
    // streaks for cirrus: fibres a few times longer than wide, bent by a slow swirl so they are not ruled lines
    vec2 sw = vUv + 0.035 * vec2( smoothN( q + vec3( 0.3, 0.1, 0.2 ), 3, 3 ), smoothN( q + vec3( 0.7, 0.4, 0.9 ), 3, 3 ) );
    float fib = smoothN( vec3( sw.x, sw.y * 3.0, 0.5 ), 4, 5 );
    o = vec4( even( a, -0.30, 0.30 ), even( b, -0.30, 0.30 ), even( c, -0.30, 0.30 ), even( fib, -0.26, 0.26 ) );
  }
}`;
// where each raw field's values lie (5th and 95th percentile, measured with Clouds.measure): spread to 0..1
const NOISE_MAP = { MAP_R: '0.727, 0.942', MAP_G: '0.245, 0.73', MAP_B: '0.245, 0.73', MAP_A: '0.245, 0.73' };

class Noise {
  constructor(renderer) {
    this.renderer = renderer;
    const o3 = { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter };
    this.shape = new THREE.WebGL3DRenderTarget(96, 96, 96, o3);
    this.detail = new THREE.WebGL3DRenderTarget(32, 32, 32, o3);
    this.vary = new THREE.WebGLRenderTarget(256, 256, { ...o3 });
    for (const t of [this.shape.texture, this.detail.texture, this.vary.texture]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.wrapR = THREE.RepeatWrapping; }
    let frag = NOISE_FRAG; for (const [k, v] of Object.entries(NOISE_MAP)) frag = frag.replaceAll(k, v);
    this.mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms: { uZ: { value: 0 }, uKind: { value: 0 } }, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(tri, this.mat); this.mesh.frustumCulled = false;
    this.cam = new THREE.Camera();
    this.jobs = [{ rt: this.vary, kind: 2, z: 0, n: 1 }];
    for (let z = 0; z < 32; z++) this.jobs.push({ rt: this.detail, kind: 1, z, n: 32 });
    for (let z = 0; z < 96; z++) this.jobs.push({ rt: this.shape, kind: 0, z, n: 96 });
    this.total = this.jobs.length;
  }
  get done() { return this.jobs.length === 0; }
  // the slow variation as numbers (256 x 256 x 4), so the page can ask the same question of it as the shader does
  readVary() {
    if (this.varyPx || this.jobs.some((j) => j.kind === 2)) return this.varyPx || null;
    const px = new Uint8Array(256 * 256 * 4);
    try { this.renderer.readRenderTargetPixels(this.vary, 0, 0, 256, 256, px); this.varyPx = px; } catch { this.varyPx = null; }
    return this.varyPx;
  }
  // one channel of it at a place (the same reading as textureLod( tVary, xz / scale ))
  varyAt(x, z, scale, ch) {
    const px = this.readVary(); if (!px) return 0.5;
    const fx = ((x / scale) % 1 + 1) % 1 * 256 - 0.5, fy = ((z / scale) % 1 + 1) % 1 * 256 - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0, W = (i) => ((i % 256) + 256) % 256;
    const at = (i, j) => px[(W(j) * 256 + W(i)) * 4 + ch] / 255;
    return (at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx) * (1 - ty) + (at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx) * ty;
  }
  // draw up to `n` more slices; true once all are in
  step(n = 4) {
    if (!this.jobs.length) return true;
    const r = this.renderer, prev = r.getRenderTarget(), auto = r.autoClear;
    r.autoClear = true;
    for (let i = 0; i < n && this.jobs.length; i++) {
      const j = this.jobs.shift();
      this.mat.uniforms.uZ.value = (j.z + 0.5) / j.n; this.mat.uniforms.uKind.value = j.kind;
      r.setRenderTarget(j.rt, j.z); r.render(this.mesh, this.cam);
    }
    r.setRenderTarget(prev); r.autoClear = auto;
    return this.jobs.length === 0;
  }
}

/* ------------------------------------------------------------------ where there is cloud */
// Shared by the picture of the clouds and by their shadow. `p` is (east, height above the sea, south) in metres.
const FIELD = /* glsl */`
uniform highp sampler3D tShape, tDetail;
uniform sampler2D tWx, tVary;
uniform vec4 uWxST;          // weather map: uv = xz * uWxST.xy + uWxST.zw
uniform vec4 uLow;           // base, top (m), kind (0 sheet, 1 heaps, 2 towers), thickness (1/m)
uniform vec4 uLow2;          // how much the edges are eaten, the anvil, rain under it (1/m), how even the tops are
uniform vec4 uMid;           // base, top, kind (0 sheet, 1 cells), thickness
uniform vec4 uHigh;          // height, how much light it stops, streak direction (x, z)
uniform vec4 uDrift;         // how far the wind has carried the low layer (x, z) and the middle one (x, z)
uniform float uEvo;          // the clouds' own slow change: a height the noise is read at
const float SHAPE = 1.0 / 9600.0, DETAIL = 1.0 / 1430.0;
float sat( float x ) { return clamp( x, 0.0, 1.0 ); }
// what the report says about a place: r low, g middle, b high cover, a rain; and the slow variation there
void placeAt( vec2 xz, out vec4 wx, out vec4 vary ) {
  wx = textureLod( tWx, xz * uWxST.xy + uWxST.zw, 0.0 );
  vary = textureLod( tVary, xz / 53000.0, 0.0 );
  // clearer lanes and thicker patches tens of kilometres across; none where the sky is clear or closed
  // showers and storms stand in cells with clear air between them: the same amount of cloud, gathered up
  float lanes = sat( wx.r + ( vary.r - 0.5 ) * 2.2 * wx.r * ( 1.0 - wx.r ) );
  wx.r = mix( lanes, sat( wx.r * 2.15 * smoothstep( 0.30, 0.75, vary.r ) ), sat( ( uLow.z - 1.15 ) * 2.0 ) * ( 1.0 - sat( ( uLow.z - 1.75 ) * 4.0 ) ) );      // a thunderstorm fills its sky
  wx.g = sat( wx.g + ( vary.b - 0.5 ) * 2.2 * wx.g * ( 1.0 - wx.g ) );
}
// The low layer. The answer is signed: above 0 is inside cloud, and how far above is how deep inside.
// h runs from 0 at the base to 1 at the top of the slab.
float lowShape( vec3 p, vec4 wx, float lod ) {
  float h = ( p.y - uLow.x ) / ( uLow.y - uLow.x );
  if ( h <= 0.0 || h >= 1.0 || wx.r < 0.01 ) return -1.0;
  float cu = sat( uLow.z ), cb = sat( uLow.z - 1.0 ), c = wx.r;
  vec2 q = p.xz + uDrift.xy;
  // a sheet's lumps are flatter than they are wide; a tower's run up through it, so it stands as one column
  vec4 n = textureLod( tShape, vec3( q, p.y * mix( mix( 0.5, 1.0, cu ), 0.6, cb ) + uEvo ) * SHAPE, lod );
  float open = 1.0 - c;
  // a sheet: the slab filled between a soft base and a soft top
  float sheet = n.r * smoothstep( 0.0, 0.10, h ) * ( 1.0 - smoothstep( 0.72, 1.0, h ) ) - open;
  // heaps: a level base, and a top that domes over the middle of each one. Some stand taller than others.
  float tv = textureLod( tVary, q / 7300.0, 0.0 ).g;
  float top = mix( 1.0, mix( 0.42, 1.0, tv ), uLow2.w );
  float heap = n.r - open - c * 0.93 * pow( sat( h / top ), 1.7 ) - ( 1.0 - smoothstep( 0.0, 0.035, h ) );
  // towers: wide at the foot, drawn in higher up, spread out again under the lid into an anvil
  float anvil = uLow2.y * smoothstep( 0.70, 0.84, h ) * ( 1.0 - smoothstep( 0.93, 1.0, h ) );
  float tower = n.r * smoothstep( 0.0, 0.03, h ) * max( 1.0 - 0.42 * smoothstep( 0.04, 0.6, h ), anvil * 1.2 ) - open;
  float x = mix( mix( sheet, heap, cu ), tower, cb );
  // billows: cells 1.2 km and 600 m across push the surface out and in
  return x + ( n.b * 0.6 + n.a * 0.4 - 0.5 ) * mix( 0.07, 0.24, cu ) * smoothstep( 0.0, 0.08, c ) * ( 1.0 - 0.6 * smoothstep( 0.85, 1.0, c ) );
}
float midShape( vec3 p, vec4 wx, float lod ) {
  float h = ( p.y - uMid.x ) / ( uMid.y - uMid.x );
  float c = wx.g * smoothstep( 0.04, 0.16, wx.g );                     // a trace of middle cloud is no cloud, not specks
  if ( h <= 0.0 || h >= 1.0 || c < 0.01 ) return -1.0;
  vec2 q = p.xz + uDrift.zw;
  vec4 n = textureLod( tShape, vec3( q * 1.7, p.y * 1.3 + uEvo * 0.6 ) * SHAPE + 0.37, lod + 1.0 );
  float u = mix( n.r, n.g * 0.6 + n.b * 0.4, 0.75 * uMid.z );
  float g = smoothstep( 0.0, 0.22, h ) * ( 1.0 - smoothstep( 0.55, 1.0, h ) );
  return u * g - ( 1.0 - c ) + ( n.a - 0.5 ) * 0.10 * uMid.z;
}
// how much light a metre of air stops at p (1/m). fine = with the wisps at the edges eaten out
float cloudAt( vec3 p, vec4 wx, float lod, bool fine ) {
  float xl = lowShape( p, wx, lod ), xm = midShape( p, wx, lod );
  if ( xl <= 0.0 && xm <= 0.0 ) return 0.0;
  float cu = sat( uLow.z ), hl = sat( ( p.y - uLow.x ) / ( uLow.y - uLow.x ) );
  if ( fine && lod < 2.5 ) {
    vec3 dn = textureLod( tDetail, vec3( p.xz + uDrift.xy * 1.2, p.y - uEvo * 2.0 ) * DETAIL, lod ).rgb;
    float hf = dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125;
    // close to, a second and finer set of cells: curls a few tens of metres across
    if ( lod < 0.8 ) { vec3 d2 = textureLod( tDetail, vec3( p.xz + uDrift.xy * 1.3, p.y - uEvo * 3.0 ).yzx * ( DETAIL * 4.3 ) + 0.31, 0.0 ).rgb; hf = mix( hf, hf * 0.72 + ( d2.r * 0.6 + d2.g * 0.4 ) * 0.28, 1.0 - lod / 0.8 ); }
    float e = mix( hf, 1.0 - hf, sat( hl * 4.0 ) ) * ( 1.0 - lod / 2.5 );       // wispy underneath, cauliflower on top
    xl -= e * uLow2.x * 0.55; xm -= hf * 0.07 * ( 1.0 - lod / 2.5 );
  }
  float lo = sat( xl / mix( 0.12, 0.05, cu ) ), mi = sat( xm / 0.13 );
  return lo * uLow.w * mix( 1.0, 0.55 + 0.75 * hl, cu ) + mi * uMid.w;
}`;

/* ------------------------------------------------------------------ the picture of the clouds */
const MARCH = (o) => /* glsl */`
precision highp float; precision highp int; precision highp sampler2D;
layout( location = 0 ) out vec4 oC;      // rgb light sent, a light let through
layout( location = 1 ) out vec4 oZ;      // r where the cloud starts, g where the middle of what is seen of it lies (km, times b), b how much it hides
#define STEPS ${o.steps}
#define LIGHT ${o.light}
const float R = ${R_EARTH}.0, PI = 3.14159265, ZS = 0.001;
uniform vec3 uCam, uUp, uRayX, uRayY, uRayZ;
uniform float uCamAlt, uRange, uFrame, uAlpha, uHistOn, uAdapt;
uniform vec2 uRes;
uniform vec3 uSunDir, uSunCol, uZenith, uHorizon, uAmbHi, uAmbLo;
uniform float uSunE, uHaze, uHazeH, uNight, uGrey;
uniform vec3 uFogV;
uniform vec4 uFlash;         // a lightning stroke: where (from the camera) and how bright
uniform sampler2D tHist, tHistZ;
uniform mat4 uReproj;
${FIELD}
// distances along the ray to the sphere at height h above the sea (x near, y far); x > y when the ray misses it
vec2 shell( float b, float h ) {
  float c = ( uCamAlt - h ) * ( 2.0 * R + uCamAlt + h );
  float disc = b * b - c;
  if ( disc < 0.0 ) return vec2( 1.0, -1.0 );
  float s = sqrt( disc ), q = - b - ( b >= 0.0 ? s : - s );
  float t1 = q, t2 = abs( q ) > 1e-6 ? c / q : 0.0;
  return vec2( min( t1, t2 ), max( t1, t2 ) );
}
// the stretch of the ray inside the slab between heights h0 and h1 (x from, y to; empty when y <= x)
vec2 slab( float b, float h0, float h1, float tMax ) {
  vec2 po = shell( b, h1 ), pi = shell( b, h0 );
  float t0, t1;
  bool hitsBase = pi.x <= pi.y && pi.x > 0.0;
  if ( uCamAlt > h1 ) { if ( po.x > po.y || po.y <= 0.0 ) return vec2( 1.0, -1.0 ); t0 = max( po.x, 0.0 ); t1 = hitsBase ? pi.x : po.y; }
  else if ( uCamAlt >= h0 ) { t0 = 0.0; t1 = hitsBase ? pi.x : po.y; }
  else { t0 = pi.y; t1 = po.y; }
  return vec2( t0, min( t1, tMax ) );
}
float hg( float c, float g ) { float g2 = g * g; return ( 1.0 - g2 ) / pow( 1.0 + g2 - 2.0 * g * c, 1.5 ); }
vec3 skyAt( vec3 d ) {
  float t = pow( 1.0 - max( d.y, 0.0 ), 4.5 );
  return mix( uZenith, uHorizon, t );
}
// how much of the light from a point t metres off, at height a1, is lost to haze on the way to the camera
float hazeF( float t, float a1 ) {
  float k = ( a1 - uCamAlt ) / uHazeH, e0 = exp( - max( uCamAlt, 0.0 ) / uHazeH ), e1 = exp( - max( a1, 0.0 ) / uHazeH );
  float od = uHaze * t * ( abs( k ) > 1e-3 ? ( e0 - e1 ) / k : e0 );
  float kf = ( a1 - uCamAlt ) / uFogV.y, f0 = exp( - max( uCamAlt, 0.0 ) / uFogV.y ), f1 = exp( - max( a1, 0.0 ) / uFogV.y );
  od += uFogV.x * t * ( abs( kf ) > 1e-3 ? ( f0 - f1 ) / kf : f0 );
  return 1.0 - exp( - od );
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 rd = normalize( uRayZ + ( uv.x * 2.0 - 1.0 ) * uRayX + ( uv.y * 2.0 - 1.0 ) * uRayY );
  float mu = dot( rd, uUp ), Ra = R + uCamAlt, b = Ra * mu;
  // the ray stops at the sea
  float tMax = uRange;
  { vec2 g = shell( b, 0.0 ); if ( uCamAlt > 0.0 && g.x <= g.y && g.x > 0.0 ) tMax = min( tMax, g.x ); }
  float lowFrom = uLow2.z > 0.0 ? 0.0 : uLow.x;                 // rain hangs under the low layer down to the ground
  vec2 sA = slab( b, lowFrom, uLow.y, tMax ), sB = slab( b, uMid.x, uMid.y, tMax );
  int nA = ( STEPS * 7 ) / 10, nB = STEPS - nA;
  if ( sB.y > sB.x && ( sA.y <= sA.x || sB.x < sA.x ) ) { vec2 s = sA; sA = sB; sB = s; int n = nA; nA = nB; nB = n; }
  float jit = fract( 52.9829189 * fract( dot( gl_FragCoord.xy + uFrame * vec2( 32.665, 11.815 ), vec2( 0.06711056, 0.00583715 ) ) ) );
  float cosT = dot( rd, uSunDir );
  // light scattered on towards the eye: strong looking towards the sun through thin cloud, a little looking away from it
  float phase = min( mix( hg( cosT, 0.62 ), hg( cosT, -0.30 ), 0.5 ), 1.55 );
  vec3 sunL = uSunCol * uSunE;
  float sunUp = dot( uSunDir, uUp );
  vec3 air = skyAt( normalize( vec3( rd.x, abs( rd.y ) * 0.3 + 0.02, rd.z ) ) ) * 0.92;

  float T = 1.0; vec3 C = vec3( 0.0 ); float zW = 0.0, wSum = 0.0, zFirst = -1.0, zLast = 0.0;
  // cirrus: one thin sheet. Below it, it is the last thing the ray meets; above it, the first.
  float ciA = 0.0, ciT = 0.0; vec3 ciC = vec3( 0.0 );
  if ( uHigh.y > 0.0 ) {
    vec2 s = shell( b, uHigh.x );
    float t = uCamAlt < uHigh.x ? s.y : ( s.x <= s.y && s.x > 0.0 ? s.x : -1.0 );
    if ( t > 0.0 && t < tMax ) {
      vec2 q = uCam.xz + rd.xz * t + uDrift.zw * 1.6;
      float cov = textureLod( tWx, ( uCam.xz + rd.xz * t ) * uWxST.xy + uWxST.zw, 0.0 ).b;
      if ( cov > 0.01 ) {
        vec2 sd = uHigh.zw, sq = vec2( dot( q, sd ), dot( q, vec2( - sd.y, sd.x ) ) );
        float lod = clamp( log2( t / 9000.0 ), 0.0, 5.0 );
        float st = textureLod( tVary, sq / vec2( 83000.0, 61000.0 ), lod ).a * 0.6 + textureLod( tVary, sq / vec2( 31000.0, 23000.0 ) + 0.4, lod ).a * 0.4;
        float big = textureLod( tVary, q / 97000.0 + 0.2, 0.0 ).b * 0.7 + textureLod( tVary, q / 31000.0 + 0.6, 0.0 ).r * 0.3;
        float a = sat( ( big - ( 1.0 - cov ) ) / 0.22 ) * ( 0.15 + 0.85 * smoothstep( 0.30, 0.80, st ) ) * uHigh.y;
        a *= sat( abs( mu ) * 6.0 + 0.25 );                               // seen edge on it is thicker, but never a wall
        ciA = a; ciT = t;
        float ph = min( mix( hg( cosT, 0.7 ), 1.0, 0.55 ), 2.2 );
        ciC = sunL * ph * 0.62 + uAmbHi * 0.55;
        ciC = mix( ciC, air, hazeF( t, uHigh.x ) );
      }
    }
  }
  if ( ciA > 0.0 && uCamAlt >= uHigh.x ) { C += ciC * ciA; T *= 1.0 - ciA; zFirst = ciT; zLast = ciT; zW += ciA * ciT; wSum += ciA; }

  for ( int seg = 0; seg < 2; seg ++ ) {
    vec2 s = seg == 0 ? sA : sB; int n = seg == 0 ? nA : nB;
    if ( s.y <= s.x || T < 0.012 ) continue;
    float t0 = max( s.x, 0.5 ), t1 = s.y;
    // Strides grow with distance, so a fixed number of them reaches the horizon. Empty air is crossed in long
    // strides; where one lands in cloud the ray goes back a stride and walks the cloud in short steps (a third
    // as long). A ray has only so many short steps: past that it goes on in long ones, so nothing is left out.
    int nC = ( n * 11 ) / 20, fineLeft = n - nC, miss = 0; bool fine = false;
    float kC = max( ${o.kmin}, pow( t1 / max( t0, 700.0 ), 1.0 / float( nC ) ) - 1.0 );
    float t = t0 + max( ${o.dtmin} * 3.0, t0 * kC ) * jit;
    vec4 wx, vary; float wxAtT = -1e9;
    for ( int i = 0; i < n; i ++ ) {
      if ( t >= t1 || T < 0.012 ) break;
      float dtC = max( ${o.dtmin} * 3.0, t * kC ), dt = fine ? dtC * 0.3333 : dtC;
      float alt = uCamAlt + mu * t + t * t * ( 1.0 - mu * mu ) / ( 2.0 * Ra );
      vec3 p = vec3( uCam.x + rd.x * t, alt, uCam.z + rd.z * t );
      if ( abs( t - wxAtT ) > 1500.0 ) { placeAt( p.xz, wx, vary ); wxAtT = t; }           // the report changes over kilometres, not steps
      float lod = clamp( log2( dt / 110.0 ), 0.0, 3.2 );
      // a long stride asks a blurred and generous question (is there cloud anywhere near here?), so thin cloud is not stepped over
      if ( ! fine && fineLeft > 0 ) {
        if ( max( lowShape( p, wx, lod + 1.2 ), midShape( p, wx, lod + 1.2 ) ) > -0.10 ) { fine = true; miss = 0; t = max( t - dtC * ( 1.0 - 0.3333 * jit ), t0 ); continue; }
        t += dt; continue;
      }
      float sig = cloudAt( p, wx, lod, true );
      // rain under the cloud: a grey veil where the cloud above is thick
      float rain = 0.0;
      if ( uLow2.z > 0.0 && alt < uLow.x + 300.0 && wx.a > 0.02 ) {
        float above = lowShape( vec3( p.x, mix( uLow.x, uLow.y, 0.3 ), p.z ), wx, lod + 1.0 );
        rain = uLow2.z * wx.a * smoothstep( 0.0, 0.12, above ) * sat( ( uLow.x + 300.0 - alt ) / 400.0 );
      }
      float ext = sig + rain;
      if ( ext > 1e-6 ) {
        vec3 S = vec3( 0.0 );
        if ( sig > 1e-6 ) {
          // the sun, through the cloud on the way to it
          float tau = 0.0;
          if ( uSunE > 0.002 ) {
            float ls = ${o.ls};
            for ( int j = 0; j < LIGHT; j ++ ) {
              vec3 lp = p + vec3( uSunDir.x, sunUp, uSunDir.z ) * ( ls * ( float( j ) + 0.6 ) );
              tau += cloudAt( lp, wx, lod + 1.0 + float( j ) * 0.5, false ) * ls;
              ls *= 1.9;
            }
          }
          // Light does not only go straight through a cloud: most of it bounces from drop to drop and comes out
          // further in. So the sun dies away more slowly than the cloud's own thickness says, at two rates.
          tau *= 0.36;
          float sun = max( exp( - tau ), 0.36 * exp( - tau * 0.22 ) );
          // the sky's light: all of it on top of a cloud, less inside and underneath
          float hl = sat( ( alt - uLow.x ) / ( uLow.y - uLow.x ) ), hm = sat( ( alt - uMid.x ) / ( uMid.y - uMid.x ) );
          float hh = alt >= uMid.x ? 0.55 + 0.45 * hm : hl;
          vec3 amb = mix( uAmbLo, uAmbHi, hh * hh ) * ( 0.45 + 0.55 * exp( - tau * 0.3 ) );
          float pw = 1.0 - 0.35 * exp( - sig * dt * 2.0 ) * sat( cosT * 0.5 + 0.5 );   // a cloud's sunward edge is a little darker than its heart
          S = ( sunL * sun * phase * pw + amb ) * sig;
          if ( uFlash.w > 0.0 ) { vec3 fd = rd * t - uFlash.xyz; S += vec3( 0.75, 0.82, 1.0 ) * sig * uFlash.w / pow( 1.0 + dot( fd, fd ) * 1.6e-7, 1.5 ); }
        }
        S += rain * ( uAmbLo * 0.9 + uAmbHi * 0.35 );
        float Tr = exp( - ext * dt );
        vec3 Si = ( S - S * Tr ) / ext;
        float hz = hazeF( t, alt );
        C += T * mix( Si, air * ( 1.0 - Tr ), hz );
        float w = T * ( 1.0 - Tr );
        zW += w * ( t + 0.5 * dt ); wSum += w;
        if ( zFirst < 0.0 && 1.0 - T * Tr > 0.015 ) zFirst = t;
        zLast = t + dt;
        T *= Tr;
      }
      if ( fine ) { fineLeft --; if ( sig > 0.0 ) miss = 0; else if ( ++ miss >= 5 ) fine = false; if ( fineLeft <= 0 ) fine = false; }
      t += dt;
    }
  }
  if ( ciA > 0.0 && uCamAlt < uHigh.x ) { C += T * ciC * ciA; float w = T * ciA; zW += w * ciT; wSum += w; if ( zFirst < 0.0 ) zFirst = ciT; zLast = ciT; T *= 1.0 - ciA; }
  if ( T < 0.012 ) T = 0.0;

  float op = 1.0 - T;
  float zM = wSum > 1e-5 ? zW / wSum : 30000.0;
  float zA = zFirst < 0.0 ? zM : min( zFirst, zM );
  vec4 cur = vec4( C, T ), curZ = vec4( zA * ZS * op, max( zM, zA + 5.0 ) * ZS * op, op, 1.0 );
  if ( uHistOn > 0.5 ) {
    vec4 pc = uReproj * vec4( rd * zM, 1.0 );
    vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
    if ( pc.w > 0.0 && puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0 ) {
      vec4 h = texture( tHist, puv ), hz = texture( tHistZ, puv );
      float a = uAlpha + ( 1.0 - uAlpha ) * uAdapt * smoothstep( 0.5, 0.95, abs( h.a - cur.a ) );
      cur = mix( h, cur, a ); curZ = mix( hz, curZ, a );
    }
  }
  oC = cur; oZ = curZ;
}`;

/* ------------------------------------------------------------------ the clouds' shadow */
// Looking down the sun's rays at a square of the sea: r = light the low layer lets through, g = the middle and high ones.
const SHADOW = /* glsl */`
precision highp float; precision highp int; precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform vec3 uShC;           // centre (x, z) and size of the square (m)
uniform vec3 uSunDir;
${FIELD}
void main() {
  vec2 q = uShC.xy + ( vUv - 0.5 ) * uShC.z;
  float sy = max( uSunDir.y, 0.06 );
  vec2 sl = uSunDir.xz / sy;
  vec4 wx, vary; placeAt( q + sl * uLow.x, wx, vary );
  float tl = 0.0, tm = 0.0;
  for ( int i = 0; i < 8; i ++ ) { float a = mix( uLow.x, uLow.y, ( float( i ) + 0.5 ) / 8.0 ); tl += sat( ( lowShape( vec3( q.x + sl.x * a, a, q.y + sl.y * a ), wx, 0.6 ) - 0.2 * uLow2.x ) / mix( 0.12, 0.05, sat( uLow.z ) ) ); }      // less the wisps the picture eats away
  tl *= uLow.w * ( uLow.y - uLow.x ) / 8.0 / sy;
  for ( int i = 0; i < 3; i ++ ) { float a = mix( uMid.x, uMid.y, ( float( i ) + 0.5 ) / 3.0 ); tm += sat( midShape( vec3( q.x + sl.x * a, a, q.y + sl.y * a ), wx, 1.5 ) / 0.13 ); }
  tm *= uMid.w * ( uMid.y - uMid.x ) / 3.0 / sy;
  float hi = 1.0 - 0.45 * uHigh.y * wx.b;
  // light that has bounced about inside the cloud still comes out underneath: a shadow is deep, never black
  o = vec4( max( exp( - tl * 0.55 ), 0.035 ), max( exp( - tm * 0.6 ), 0.10 ) * hi, 0.0, 1.0 );
}`;

// What is left of the grain after the frames are blended is one small-picture pixel across: a three by three
// soft blur takes it out, at the cost of a softness no cloud minds.
const SOFT = /* glsl */`
precision highp float; precision highp sampler2D;
layout( location = 0 ) out vec4 oC; layout( location = 1 ) out vec4 oZ;
uniform sampler2D tA, tB; uniform vec2 uPx;
void main() {
  vec2 uv = gl_FragCoord.xy * uPx; vec4 a = vec4( 0.0 ), b = vec4( 0.0 );
  for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
    float w = ( i == 0 ? 2.0 : 1.0 ) * ( j == 0 ? 2.0 : 1.0 ) / 16.0; vec2 q = uv + vec2( float( i ), float( j ) ) * uPx;
    a += texture( tA, q ) * w; b += texture( tB, q ) * w;
  }
  oC = a; oZ = b;
}`;

const QUALITY = {       // rays as a share of the screen each way, steps along a ray, steps towards the sun, shadow picture, reach (m)
  phone: { res: 0.30, steps: 40, light: 2, shadow: 256, range: 50000, dtmin: '55.0', kmin: '0.06', ls: '90.0' },
  low: { res: 0.34, steps: 56, light: 3, shadow: 384, range: 70000, dtmin: '45.0', kmin: '0.05', ls: '80.0' },
  mid: { res: 0.42, steps: 88, light: 4, shadow: 512, range: 110000, dtmin: '36.0', kmin: '0.04', ls: '65.0' },
  high: { res: 0.5, steps: 150, light: 5, shadow: 768, range: 150000, dtmin: '26.0', kmin: '0.03', ls: '55.0' },
};

export class Clouds {
  constructor(renderer, tierName = 'mid') {
    this.renderer = renderer; this.q = QUALITY[tierName] || QUALITY.mid;
    const gl = renderer.getContext();
    this.ok = renderer.capabilities.isWebGL2 !== false && !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.on = false;                         // is there anything to draw
    this.noise = new Noise(renderer);
    this.cam = new THREE.Camera();
    this.wx = new THREE.DataTexture(new Uint8Array(16 * 16 * 4), 16, 16, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.wx.minFilter = this.wx.magFilter = THREE.LinearFilter; this.wx.wrapS = this.wx.wrapT = THREE.ClampToEdgeWrapping; this.wx.needsUpdate = true;
    const A = ATMO.uniforms;
    this.field = {
      tShape: { value: this.noise.shape.texture }, tDetail: { value: this.noise.detail.texture }, tVary: { value: this.noise.vary.texture }, tWx: { value: this.wx },
      uWxST: { value: new THREE.Vector4(1e-6, 1e-6, 0.5, 0.5) },
      uLow: { value: new THREE.Vector4(900, 1700, 1, 0.03) }, uLow2: { value: new THREE.Vector4(0.4, 0, 0, 1) },
      uMid: { value: new THREE.Vector4(3600, 4300, 1, 0.01) }, uHigh: { value: new THREE.Vector4(9500, 0.5, 1, 0) },
      uDrift: { value: new THREE.Vector4() }, uEvo: { value: 0 },
    };
    this.u = {
      ...this.field,
      uCam: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uRayX: { value: new THREE.Vector3() }, uRayY: { value: new THREE.Vector3() }, uRayZ: { value: new THREE.Vector3() },
      uCamAlt: A.uCamAlt, uRange: { value: this.q.range }, uFrame: { value: 0 }, uAlpha: { value: 1 }, uHistOn: { value: 0 }, uAdapt: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) },
      uSunDir: A.uSunDir, uSunCol: A.uSunCol, uZenith: A.uZenith, uHorizon: A.uHorizon, uHaze: A.uHaze, uHazeH: A.uHazeH, uNight: A.uNight, uGrey: A.uGrey, uFogV: A.uFog,
      uAmbHi: { value: new THREE.Color(0.5, 0.6, 0.75) }, uAmbLo: { value: new THREE.Color(0.3, 0.33, 0.38) }, uSunE: { value: 1 },
      uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
      tHist: { value: null }, tHistZ: { value: null }, uReproj: { value: new THREE.Matrix4() },
    };
    const raw = (frag, uniforms) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.march = raw(MARCH(this.q), this.u);
    this.soft = raw(SOFT, { tA: { value: null }, tB: { value: null }, uPx: { value: new THREE.Vector2(1, 1) } });
    this.shMat = raw(SHADOW, { ...this.field, uShC: { value: new THREE.Vector3(0, 0, 76000) }, uSunDir: A.uSunDir });
    this.mesh = new THREE.Mesh(tri, this.march); this.mesh.frustumCulled = false;
    this.rts = []; this.cur = 0; this.w = 0; this.h = 0;
    this.shRT = new THREE.WebGLRenderTarget(this.q.shadow, this.q.shadow, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.shSize = 76000; this.shAt = -1e9; this.shKey = '';
    this.frame = 0; this.hist = false; this.reset = true;
    this.prevVP = new THREE.Matrix4(); this.prevPos = new THREE.Vector3(1e9, 0, 0);
    this._m = new THREE.Matrix4(); this._t = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); this._up = new THREE.Vector3();
    this.drift = { lx: 0, lz: 0, mx: 0, mz: 0 }; this.evo = 0;
    this.cover = { low: 0, mid: 0, high: 0 };          // the report at the camera, for whoever wants it
    this.ms = 0;
  }

  // the picture is a share of the screen's size
  setSize(w, h) {
    const cw = Math.max(64, Math.round(w * this.q.res)), ch = Math.max(36, Math.round(h * this.q.res));
    ATMO.uniforms.uCloudInv.value.set(1 / w, 1 / h);
    if (cw === this.w && ch === this.h) return;
    this.w = cw; this.h = ch;
    for (const r of this.rts) r.dispose();
    const mk = () => { const r = new THREE.WebGLRenderTarget(cw, ch, { count: 2, format: THREE.RGBAFormat, type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); for (const t of r.textures) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; } return r; };
    this.rts = [mk(), mk()]; this.hist = false; this.reset = true;
    this.out?.dispose(); this.out = mk(); this.soft.uniforms.uPx.value.set(1 / cw, 1 / ch);
    this.u.uRes.value.set(cw, ch);
  }

  // the wind carries each layer; they also change slowly of themselves
  advance(dt, wind) {
    const D = this.drift;
    D.lx -= wind.lx * dt; D.lz -= wind.lz * dt; D.mx -= wind.mx * dt; D.mz -= wind.mz * dt;
    this.evo += dt * 2.2;
    this.field.uDrift.value.set(D.lx, D.lz, D.mx, D.mz); this.field.uEvo.value = this.evo;
  }

  // Draw this frame's clouds for `camera`. Call before the world is drawn. `camAlt`: metres above the sea.
  render(camera, camAlt, up) {
    const A = ATMO.uniforms;
    A.uCloudOn.value = 0; A.uShadeOn.value = 0;
    if (!this.ok || !this.on || !this.rts.length) return;
    if (!this.noise.done) { this.noise.step(8); if (!this.noise.done) return; }
    const r = this.renderer, t0 = performance.now(), prev = r.getRenderTarget(), auto = r.autoClear, U = this.u;
    r.autoClear = true;
    // rays: the camera's own frame
    const e = camera.matrixWorld.elements, P = camera.projectionMatrix.elements;
    const tx = 1 / P[0], ty = 1 / P[5];
    U.uRayX.value.set(e[0], e[1], e[2]).multiplyScalar(tx); U.uRayY.value.set(e[4], e[5], e[6]).multiplyScalar(ty); U.uRayZ.value.set(-e[8], -e[9], -e[10]);
    U.uCam.value.copy(camera.position); U.uUp.value.copy(up);
    this.shadow(camera);
    const jump = this.prevPos.distanceTo(camera.position) > 220;
    const burst = this.reset || jump || !this.hist ? 6 : 1;
    for (let i = 0; i < burst; i++) {
      const dst = this.rts[1 - this.cur], src = this.rts[this.cur];
      U.uFrame.value = (this.frame++) % 64;
      if (burst > 1) {
        // a new view: several walks at once, averaged, so it does not arrive as grain
        U.uHistOn.value = i ? 1 : 0; U.uAlpha.value = 1 / (i + 1); U.uAdapt.value = 0;
        U.uReproj.value.multiplyMatrices(this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), this._t.makeTranslation(camera.position.x, camera.position.y, camera.position.z));
      } else {
        U.uHistOn.value = 1; U.uAlpha.value = 0.1; U.uAdapt.value = 0;
        U.uReproj.value.multiplyMatrices(this.prevVP, this._t.makeTranslation(camera.position.x, camera.position.y, camera.position.z));
      }
      U.tHist.value = src.textures[0]; U.tHistZ.value = src.textures[1];
      this.mesh.material = this.march;
      r.setRenderTarget(dst); r.render(this.mesh, this.cam);
      this.cur = 1 - this.cur;
    }
    this.hist = true; this.reset = false;
    this.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.prevPos.copy(camera.position);
    r.setRenderTarget(prev); r.autoClear = auto;
    const acc = this.rts[this.cur], out = this.out;
    this.soft.uniforms.tA.value = acc.textures[0]; this.soft.uniforms.tB.value = acc.textures[1];
    this.mesh.material = this.soft; r.setRenderTarget(out); r.render(this.mesh, this.cam); r.setRenderTarget(prev);
    A.tCloud.value = out.textures[0]; A.tCloudZ.value = out.textures[1]; A.uCloudOn.value = 1; A.uShadeOn.value = 1;
    this.ms += (performance.now() - t0 - this.ms) * 0.1;
  }

  // the shadow picture: kept centred ahead of the camera, redrawn when it has moved a tenth of its width, or every third of a second
  shadow(camera) {
    const A = ATMO.uniforms, now = performance.now(), S = this.shSize, G = S / 10;
    camera.getWorldDirection(this._f);
    const fl = Math.hypot(this._f.x, this._f.z) || 1, ahead = S * 0.22;
    const cx = Math.round((camera.position.x + (this._f.x / fl) * ahead) / G) * G, cz = Math.round((camera.position.z + (this._f.z / fl) * ahead) / G) * G;
    const key = cx + '|' + cz;
    if (key === this.shKey && now - this.shAt < 330) return;
    this.shKey = key; this.shAt = now;
    const r = this.renderer;
    this.shMat.uniforms.uShC.value.set(cx, cz, S);
    this.mesh.material = this.shMat;
    r.setRenderTarget(this.shRT); r.render(this.mesh, this.cam);
    A.tCloudSh.value = this.shRT.texture; A.uCloudShA.value.set(cx, cz, 1 / S);
    const L = this.field.uLow.value, M = this.field.uMid.value;
    A.uCloudShB.value.set(L.x, L.y, M.x, M.y);
  }

  // Where each raw noise field's values lie, for NOISE_MAP: draws slices unspread and reads them back.
  measure() {
    const r = this.renderer, rt = new THREE.WebGLRenderTarget(96, 96, { type: THREE.UnsignedByteType, depthBuffer: false });
    const mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, uniforms: { uZ: { value: 0 }, uKind: { value: 0 } }, depthTest: false,
      fragmentShader: NOISE_FRAG.replace(/even\( (\w+), MAP_\w \)/g, '$1') });
    const m = new THREE.Mesh(tri, mat), prev = r.getRenderTarget(), buf = new Uint8Array(96 * 96 * 4), all = [[], [], [], []];
    for (const z of [0.03, 0.21, 0.47, 0.66, 0.9]) {
      mat.uniforms.uZ.value = z; r.setRenderTarget(rt); r.render(m, this.cam); r.readRenderTargetPixels(rt, 0, 0, 96, 96, buf);
      for (let i = 0; i < buf.length; i += 4) for (let c = 0; c < 4; c++) all[c].push(buf[i + c] / 255);
    }
    r.setRenderTarget(prev); rt.dispose(); mat.dispose();
    return all.map((a) => { a.sort((x, y) => x - y); return [0.02, 0.05, 0.25, 0.5, 0.75, 0.95, 0.98].map((p) => +a[Math.floor(p * (a.length - 1))].toFixed(3)); });
  }
}
