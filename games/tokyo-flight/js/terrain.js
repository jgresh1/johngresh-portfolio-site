// terrain.js — the ground: a quadtree of map tiles, each one a small height mesh with the aerial photo on it.
//   photo      GSI seamless aerial photo, zoom 7-18 (about 0.5 m per pixel at the finest level)
//   elevation  GSI 10 m model (zoom <= 14) and the 5 m laser survey (zoom 15); deeper tiles reuse the zoom 15 data
//   water      the laser survey has no returns from water, so its gaps mark rivers, canals, moats and the bay
// It also keeps a top-down copy of the photo around the camera (GroundBake) that plain building roofs read from.
import * as THREE from 'three';
import { geoToWorld, worldToGeo, tileLon, tileLat, lonTile, latTile, tileMetres, ORIGIN } from './geo.js';
import { ATMO, patch } from './atmo.js';

import { gsi, fetchTile } from './net.js';

const PHOTO = (z, x, y) => gsi(`seamlessphoto/${z}/${x}/${y}.jpg`);
const DEM10 = (z, x, y) => gsi(`dem_png/${z}/${x}/${y}.png`);
const DEM5 = (z, x, y) => gsi(`dem5a_png/${z}/${x}/${y}.png`);

const ROOT_Z = 7, MAX_Z = 18, DEM_Z = 15, N = 32, DS = 256;
const NONE = 0, QUEUED = 1, LOADING = 2, READY = 3;

/* ------------------------------------------------------------------ elevation records */
const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(DS, DS) : Object.assign(document.createElement('canvas'), { width: DS, height: DS });
const cx = cv.getContext('2d', { willReadFrequently: true });

async function fetchBitmap(url, signal, opts) {
  const r = await fetchTile(url, { signal, mode: 'cors' });
  if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e; }
  return createImageBitmap(await r.blob(), opts);
}

// GSI elevation PNG: 24-bit value in cm, 2^23 = no data
async function fetchDem(url, signal) {
  let bmp;
  try { bmp = await fetchBitmap(url, signal, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); }
  catch (e) { if (e.name === 'AbortError') throw e; return null; }
  cx.clearRect(0, 0, DS, DS); cx.drawImage(bmp, 0, 0, DS, DS); bmp.close?.();
  const d = cx.getImageData(0, 0, DS, DS).data;
  const h = new Float32Array(DS * DS), na = new Uint8Array(DS * DS);
  for (let i = 0, p = 0; i < DS * DS; i++, p += 4) {
    const v = d[p] * 65536 + d[p + 1] * 256 + d[p + 2];
    if (v === 8388608 || d[p + 3] === 0) na[i] = 1;
    else h[i] = (v < 8388608 ? v : v - 16777216) * 0.01;
  }
  return { h, na };
}

function makeRecord(h, mask) {
  const tex = new THREE.DataTexture(mask, DS, DS, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { h, mask, tex };
}
const seaRecord = () => makeRecord(new Float32Array(DS * DS), new Uint8Array(DS * DS).fill(255));

// bilinear height / water lookup through a view {rec, ox, oy, s} (the part of the record a tile covers)
function sample(view, u, v, arr) {
  const fx = Math.min(Math.max((view.ox + u * view.s) * DS - 0.5, 0), DS - 1.001), fy = Math.min(Math.max((view.oy + v * view.s) * DS - 0.5, 0), DS - 1.001);
  const x = fx | 0, y = fy | 0, tx = fx - x, ty = fy - y, i = y * DS + x;
  return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + DS] * (1 - tx) + arr[i + DS + 1] * tx) * ty;
}

// true when the part of a record a tile covers is all water
function quadIsSea(view) {
  const m = view.rec.mask, x0 = Math.floor(view.ox * DS), y0 = Math.floor(view.oy * DS), n = Math.max(Math.ceil(view.s * DS), 1);
  for (let j = y0; j < Math.min(y0 + n, DS); j++) for (let i = x0; i < Math.min(x0 + n, DS); i++) if (!m[j * DS + i]) return false;
  return true;
}

/* ------------------------------------------------------------------ ground material */
const GROUND = {
  fragPars: /* glsl */`
    uniform vec3 uPhotoST; uniform vec3 uMaskST; uniform sampler2D tMask;
    uniform sampler2D tField; uniform vec3 uFieldA, uFieldB; uniform vec4 uFieldL; uniform float uFieldOn, uFieldRun;`,
  map: /* glsl */`
    vec2 gUv = vMapUv * uPhotoST.x + uPhotoST.yz;
    vec4 sampledDiffuseColor = texture2D( map, gUv );
    float gDist = length( vWp - cameraPosition );
    // Close up the half-metre photo is stretched over many screen pixels. Sharpen it against its own
    // neighbours so kerbs, lane lines and crossings keep an edge instead of melting.
    // Where the neighbouring texels really differ (kerb, paint, shadow edge) the blend between them is
    // snapped to one side or the other, which turns a half-metre blur into a clean line.
    float gSharp = 1.0 - smoothstep( 60.0, 260.0, gDist );
    if ( gSharp > 0.0 ) {
      const vec2 gT = vec2( 1.0 / 256.0, 0.0 );
      const vec3 gW = vec3( 0.30, 0.55, 0.15 );
      float gM = dot( sampledDiffuseColor.rgb, gW );
      float gA = dot( texture2D( map, gUv + gT.xy ).rgb, gW ), gB = dot( texture2D( map, gUv - gT.xy ).rgb, gW );
      float gC = dot( texture2D( map, gUv + gT.yx ).rgb, gW ), gD = dot( texture2D( map, gUv - gT.yx ).rgb, gW );
      float gLo = min( gM, min( min( gA, gB ), min( gC, gD ) ) ), gHi = max( gM, max( max( gA, gB ), max( gC, gD ) ) );
      float gEdge = smoothstep( 0.05, 0.16, gHi - gLo );
      float gNew = mix( gLo, gHi, smoothstep( 0.30, 0.70, ( gM - gLo ) / max( gHi - gLo, 1e-4 ) ) );
      sampledDiffuseColor.rgb *= mix( 1.0, gNew / max( gM, 1e-3 ), gEdge * gSharp );
      // Where the survey's own road markings are drawn on top, the photo still holds a blurred copy of the same
      // paint. Fade grey-white patches that stand out from the road around them back to the road colour.
      if ( uPaint > 0.0 ) {
        vec3 gWide = texture2D( map, gUv, 3.5 ).rgb;
        vec3 gNow = sampledDiffuseColor.rgb;
        float gSat = max( max( gNow.r, gNow.g ), gNow.b ) - min( min( gNow.r, gNow.g ), gNow.b );
        float gGhost = smoothstep( 1.10, 1.38, dot( gNow, gW ) / max( dot( gWide, gW ), 0.02 ) ) * ( 1.0 - smoothstep( 0.05, 0.14, gSat ) );
        sampledDiffuseColor.rgb = mix( gNow, gWide * 0.92, gGhost * uPaint * gSharp );
      }
    }
    diffuseColor *= sampledDiffuseColor;
    vec3 gPhoto = diffuseColor.rgb;
    float gMask = texture2D( tMask, vMapUv * uMaskST.x + uMaskST.yz ).r;
    float gLum = dot( gPhoto, vec3( 0.30, 0.55, 0.15 ) );
    // bright pixels inside the water outline are quays, boats and bridge decks: leave them as photographed
    float gWater = smoothstep( 0.40, 0.62, gMask ) * ( 1.0 - smoothstep( 0.13, 0.26, gLum ) );
    vec3 gDeep = mix( vec3( 0.010, 0.032, 0.038 ), gPhoto * 0.5, 0.10 );
    diffuseColor.rgb = mix( gPhoto, gDeep, gWater );
    // fine grain close up, so the half-metre photo does not read as a smear
    float gNear = ( 1.0 - smoothstep( 30.0, 320.0, gDist ) ) * ( 1.0 - gWater );
    float gGrain = apNoise( vWp.xz * 3.1 ) * 0.35 + apNoise( vWp.xz * 13.0 ) * 0.35 + apNoise( vWp.xz * 47.0 ) * 0.30;
    diffuseColor.rgb *= 1.0 + ( gGrain - 0.5 ) * 0.13 * gNear;
    // Haneda round runway C, drawn by rule from the map of its taxiway centre lines and aprons (fly/airfield.js)
    float fGlow = 0.0;
    vec2 fUv = vec2( dot( uFieldA.xy, vWp.xz ) + uFieldA.z, dot( uFieldB.xy, vWp.xz ) + uFieldB.z );
    vec2 fL = fUv * uFieldL.xy + uFieldL.zw;                                   // metres along the runway, metres across
    float fw = clamp( ( fwidth( fL.x ) + fwidth( fL.y ) ) * 0.6, 0.002, 6.0 );
    vec2 fE = min( fUv, 1.0 - fUv ) * uFieldL.xy;
    float fIn = uFieldOn * smoothstep( 4.0, 44.0, min( fE.x, fE.y ) );
    if ( fIn > 0.0 ) {
      vec4 fT = texture2D( tField, fUv );
      float fTaxi = fT.r < 3.0 ? length( fT.gb ) : fT.r;                       // metres to the nearest centre line
      float fPave = 1.0 - smoothstep( 15.0 - fw, 15.0 + fw, fTaxi );
      float fShld = 1.0 - smoothstep( 22.0 - fw, 22.0 + fw, fTaxi );
      float fApron = 1.0 - smoothstep( - fw, fw, fT.a );
      float fRun = max( max( - fL.x - 60.0, fL.x - uFieldRun - 60.0 ), abs( fL.y ) - 37.5 );
      float fNear = 1.0 - smoothstep( 70.0, 130.0, min( min( fTaxi, max( fT.a, 0.0 ) ), max( fRun, 0.0 ) ) );
      vec2 fq = vWp.xz;
      float fN = apFbm( fq * 0.09 ), fF = apNoise( fq * 9.0 ), fM = apNoise( fq * 1.7 );
      // grass: the photo's own tone, with the detail the photo cannot hold; mown in strips along the runway
      float fGreen = smoothstep( -0.03, 0.02, gPhoto.g - 0.5 * ( gPhoto.r + gPhoto.b ) );
      vec3 fGrass = mix( gPhoto, vec3( 0.085, 0.125, 0.045 ) * ( 0.75 + 0.5 * fN ), 0.5 ) * ( 0.82 + 0.36 * fM ) * ( 0.86 + 0.28 * apNoise( fq * 21.0 ) );
      fGrass *= 0.95 + 0.07 * step( 0.5, fract( fL.y / 9.0 ) );
      vec3 fCol = mix( diffuseColor.rgb, fGrass, fNear * ( 0.35 + 0.65 * fGreen ) * ( 1.0 - gWater ) );
      vec3 fAsph = vec3( 0.118, 0.120, 0.124 ) * ( 0.80 + 0.32 * fN ) * ( 0.93 + 0.14 * fF );
      vec3 fOld = vec3( 0.165, 0.163, 0.157 ) * ( 0.82 + 0.30 * fN ) * ( 0.93 + 0.14 * fF );
      vec2 fJ2 = abs( fract( fL / 7.5 ) - 0.5 ) * 7.5;
      float fJoint = 1.0 - smoothstep( 0.03, 0.06 + fw, 3.75 - max( fJ2.x, fJ2.y ) );
      vec3 fConc = vec3( 0.40, 0.39, 0.37 ) * ( 0.84 + 0.22 * fN ) * ( 0.94 + 0.12 * fF ) * ( 1.0 - 0.4 * fJoint );
      fConc *= 1.0 - 0.25 * exp( - fTaxi * fTaxi / 18.0 ) * apFbm( fq * 0.7 );              // tyres and oil along the lines
      fCol = mix( fCol, fOld, fShld );
      fCol = mix( fCol, fAsph * ( 1.0 + 0.10 * exp( - pow( ( fTaxi - 3.0 ) / 2.5, 2.0 ) ) ), fPave );
      fCol = mix( fCol, fConc, fApron );
      // paint: yellow centre lines, and the double yellow line along each taxiway edge
      float fThin = max( min( 1.0, 0.15 / ( 2.0 * fw ) ), 0.22 );
      float fLine = 1.0 - smoothstep( 0.075 - fw, 0.075 + fw, fTaxi );
      float fEdge = ( 1.0 - smoothstep( 0.075 - fw, 0.075 + fw, abs( abs( fTaxi - 14.55 ) - 0.15 ) ) ) * ( 1.0 - fApron );
      fCol = mix( fCol, vec3( 0.70, 0.54, 0.07 ) * ( 0.8 + 0.2 * fF ), max( fLine, fEdge ) * fThin * 0.9 );
      diffuseColor.rgb = mix( diffuseColor.rgb, fCol, fIn );
      fGlow = fIn * ( 1.0 - smoothstep( 0.1, 0.5 + fw, fTaxi ) );
    }`,
  rough: /* glsl */`
    roughnessFactor = mix( 0.95, mix( 0.06, 0.24, smoothstep( 400.0, 9000.0, gDist ) ), gWater );`,
  normal: /* glsl */`
    if ( gWater > 0.01 ) {
      vec2 wq = vWp.xz; float wt = uTime;
      vec2 e = vec2( 0.45, 0.0 );
      #define W_H( p ) ( apFbm( ( p ) * 0.085 + vec2( wt * 0.21, wt * 0.13 ) ) + 0.45 * apFbm( ( p ) * 0.41 - vec2( wt * 0.37, - wt * 0.19 ) ) )
      float w0 = W_H( wq ), wx = W_H( wq + e.xy ), wz = W_H( wq + e.yx );
      float wAmp = 1.25 / ( 1.0 + gDist * 0.0011 );
      vec3 wn = normalize( vec3( ( w0 - wx ) * wAmp, 1.0, ( w0 - wz ) * wAmp ) );
      normal = normalize( mix( normal, normalize( ( viewMatrix * vec4( wn, 0.0 ) ).xyz ), gWater ) );
    }`,
  // city glow after dark: lit streets show as a dim warm copy of the photo
  emissive: /* glsl */`
    totalEmissiveRadiance += gPhoto * vec3( 1.0, 0.74, 0.46 ) * ( 0.055 * uNight ) * ( 1.0 - gWater ) * smoothstep( 0.05, 0.35, gLum );
    totalEmissiveRadiance += vec3( 0.10, 1.0, 0.36 ) * fGlow * uNight * 0.7;`,                                  // taxiway centre-line lights
  final: /* glsl */`
    if ( uBake > 0.5 ) gl_FragColor = vec4( gPhoto, 1.0 );`,
};

/* ------------------------------------------------------------------ quadtree */
class Node {
  constructor(z, x, y, parent) {
    this.z = z; this.x = x; this.y = y; this.parent = parent; this.children = null;
    this.state = NONE; this.mesh = null; this.dem = null; this.tex = null; this.ownsTex = false; this.ownsRec = false;
    this.seen = 0; this.shown = 0; this.pri = 0; this.abort = null;
    this.lon0 = tileLon(x, z); this.lon1 = tileLon(x + 1, z); this.lat1 = tileLat(y, z); this.lat0 = tileLat(y + 1, z);
    this.size = tileMetres(z, (this.lat0 + this.lat1) / 2);
    // rough bounds until the mesh exists
    this.box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const [la, lo] of [[this.lat0, this.lon0], [this.lat0, this.lon1], [this.lat1, this.lon0], [this.lat1, this.lon1], [(this.lat0 + this.lat1) / 2, (this.lon0 + this.lon1) / 2]]) {
      this.box.expandByPoint(geoToWorld(la, lo, -30, v)); this.box.expandByPoint(geoToWorld(la, lo, z < 11 ? 3800 : 700, v));
    }
  }
}

export class Terrain {
  constructor(renderer) {
    this.renderer = renderer;
    this.group = new THREE.Group(); this.group.name = 'terrain';
    this.roots = [];
    this.queue = []; this.active = 0; this.maxActive = 14;
    this.frame = 0; this.shownNodes = [];
    this.errPx = 1.25;            // photo pixels per screen pixel before a tile splits
    this.maxZ = MAX_Z;            // deepest photo zoom asked for (18 = half a metre a pixel)
    this.flatten = null;          // optional (lat, lon, height) -> height, applied to every ground vertex as it is built
    this.aniso = 8;
    this.changed = 0;             // bumps whenever a tile appears: shadows and the roof lookup re-render
    this.stats = { tiles: 0, loading: 0 };
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this._fr = new THREE.Frustum(); this._m = new THREE.Matrix4(); this._v = new THREE.Vector3();
    const cxm = Math.floor(lonTile(ORIGIN.lon, ROOT_Z)), cym = Math.floor(latTile(ORIGIN.lat, ROOT_Z));
    for (let y = cym - 1; y <= cym + 1; y++) for (let x = cxm - 2; x <= cxm + 2; x++) this.roots.push(new Node(ROOT_Z, x, y, null));
    for (const r of this.roots) this.request(r, 0);
  }

  request(node, pri) {
    node.pri = pri; node.seen = this.frame;
    if (node.state === NONE) { node.state = QUEUED; this.queue.push(node); }
  }

  pump() {
    if (!this.queue.length || this.active >= this.maxActive) return;
    // drop requests nobody has asked for lately, nearest first for the rest
    this.queue = this.queue.filter((n) => { if (this.frame - n.seen > 20 && n.parent) { n.state = NONE; return false; } return true; });
    this.queue.sort((a, b) => b.pri - a.pri);
    while (this.queue.length && this.active < this.maxActive) {
      const n = this.queue.pop();
      this.active++; n.state = LOADING;
      this.load(n).catch((e) => { if (e.name !== 'AbortError') console.warn('terrain tile', n.z, n.x, n.y, e.message); n.state = NONE; })
        .finally(() => { this.active--; });
    }
  }

  async load(n) {
    const ac = new AbortController(); n.abort = ac;
    const { z, x, y, parent } = n;
    const sub = (v) => ({ rec: v.rec, s: v.s / 2, ox: v.ox + (x & 1) * v.s / 2, oy: v.oy + (y & 1) * v.s / 2 });
    // open sea: the parent already found no photo / no elevation here, so do not ask again for every child
    const noPhoto = parent && !parent.ownsTex && parent.z >= 9, allSea = parent && parent.z >= 9 && quadIsSea(sub(parent.dem));
    const photoP = noPhoto ? Promise.resolve(null)
      : fetchBitmap(PHOTO(z, x, y), ac.signal, { colorSpaceConversion: 'none' }).catch((e) => { if (e.name === 'AbortError') throw e; return null; });
    photoP.catch(() => {});
    const alive = () => { if (ac.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    let dem;
    if (allSea) dem = sub(parent.dem);
    else if (z <= 14) {
      const d = await fetchDem(DEM10(z, x, y), ac.signal);
      alive();
      if (d) {
        const mask = new Uint8Array(DS * DS);
        for (let i = 0; i < mask.length; i++) mask[i] = d.na[i] ? 255 : 0;
        dem = { rec: makeRecord(d.h, mask), ox: 0, oy: 0, s: 1 }; n.ownsRec = true;
      } else if (parent) dem = sub(parent.dem);
      else { dem = { rec: seaRecord(), ox: 0, oy: 0, s: 1 }; n.ownsRec = true; }
    } else if (z === DEM_Z) {
      const d = await fetchDem(DEM5(z, x, y), ac.signal);
      alive();
      const pv = sub(parent.dem);
      if (d) {
        // gaps in the laser survey are water; give them the level of the coarse model, then flatten
        const mask = new Uint8Array(DS * DS), h = d.h;
        let gaps = 0;
        for (let j = 0; j < DS; j++) for (let i = 0; i < DS; i++) {
          const k = j * DS + i;
          if (d.na[k]) { mask[k] = 255; gaps++; h[k] = Math.max(sample(pv, (i + 0.5) / DS, (j + 0.5) / DS, pv.rec.h), -2); }
        }
        if (gaps) {
          // water finds its level: spread the lowest value across each connected gap, and never above the bank
          for (let pass = 0; pass < 6; pass++) {
            for (let k = 0; k < h.length; k++) if (mask[k]) { const a = k % DS ? k - 1 : k, b = k >= DS ? k - DS : k; if (mask[a] ? h[a] < h[k] : h[a] - 0.4 < h[k]) h[k] = mask[a] ? h[a] : h[a] - 0.4; if (mask[b] ? h[b] < h[k] : h[b] - 0.4 < h[k]) h[k] = mask[b] ? h[b] : h[b] - 0.4; }
            for (let k = h.length - 1; k >= 0; k--) if (mask[k]) { const a = (k + 1) % DS ? k + 1 : k, b = k < h.length - DS ? k + DS : k; if (mask[a] ? h[a] < h[k] : h[a] - 0.4 < h[k]) h[k] = mask[a] ? h[a] : h[a] - 0.4; if (mask[b] ? h[b] < h[k] : h[b] - 0.4 < h[k]) h[k] = mask[b] ? h[b] : h[b] - 0.4; }
          }
        }
        dem = { rec: makeRecord(h, mask), ox: 0, oy: 0, s: 1 }; n.ownsRec = true;
      } else dem = pv;
    } else dem = sub(parent.dem);
    const bmp = await photoP;
    if (ac.signal.aborted) bmp?.close?.();
    alive();
    let photoST;
    if (bmp) {
      const t = new THREE.Texture(bmp);
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(this.aniso, this.maxAniso);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.needsUpdate = true;
      n.tex = t; n.ownsTex = true; photoST = new THREE.Vector3(1, 0, 0);
    } else if (parent) {
      // no photo at this zoom (open water, or beyond the survey): stretch the parent's
      n.tex = parent.tex; const p = parent.photoST;
      photoST = new THREE.Vector3(p.x / 2, p.y + (x & 1) * p.x / 2, p.z + (y & 1) * p.x / 2);
    } else { n.tex = null; photoST = new THREE.Vector3(1, 0, 0); }
    n.dem = dem; n.photoST = photoST;
    this.build(n);
    n.state = READY; n.abort = null;
  }

  build(n) {
    const V = (N + 1) * (N + 1), total = V + 4 * (N + 1);
    const pos = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    const c = geoToWorld((n.lat0 + n.lat1) / 2, (n.lon0 + n.lon1) / 2, 0), v = this._v;
    const y0 = n.y, zz = n.z;
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= N; j++) {
      const lat = tileLat(y0 + j / N, zz);
      for (let i = 0; i <= N; i++) {
        const k = j * (N + 1) + i, lon = n.lon0 + (n.lon1 - n.lon0) * (i / N);
        let h = sample(n.dem, i / N, j / N, n.dem.rec.h);
        if (this.flatten) h = this.flatten(lat, lon, h);
        geoToWorld(lat, lon, h, v);
        pos[k * 3] = v.x - c.x; pos[k * 3 + 1] = v.y - c.y; pos[k * 3 + 2] = v.z - c.z;
        uv[k * 2] = i / N; uv[k * 2 + 1] = j / N;
        if (v.y < lo) lo = v.y; if (v.y > hi) hi = v.y;
      }
    }
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, d = a + N + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // skirts hide the cracks between neighbours of different detail
    const nor = g.attributes.normal.array, drop = n.size / N * 1.5 + 4;
    let s = V;
    const edge = (k, skirtIdx) => {
      pos[skirtIdx * 3] = pos[k * 3]; pos[skirtIdx * 3 + 1] = pos[k * 3 + 1] - drop; pos[skirtIdx * 3 + 2] = pos[k * 3 + 2];
      uv[skirtIdx * 2] = uv[k * 2]; uv[skirtIdx * 2 + 1] = uv[k * 2 + 1];
      nor[skirtIdx * 3] = nor[k * 3]; nor[skirtIdx * 3 + 1] = nor[k * 3 + 1]; nor[skirtIdx * 3 + 2] = nor[k * 3 + 2];
    };
    const strips = [
      (i) => i,                                   // north
      (i) => N * (N + 1) + (N - i),               // south
      (i) => (N - i) * (N + 1),                   // west
      (i) => i * (N + 1) + N,                     // east
    ];
    for (const f of strips) {
      for (let i = 0; i <= N; i++) edge(f(i), s + i);
      for (let i = 0; i < N; i++) { const a = f(i), b = f(i + 1), sa = s + i, sb = s + i + 1; idx.push(a, b, sa, b, sb, sa); }
      s += N + 1;
    }
    g.setIndex(idx);
    g.attributes.position.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
    const mat = patch(new THREE.MeshStandardMaterial({ map: n.tex, color: n.tex ? 0xffffff : 0x1a2c33, roughness: 0.95, metalness: 0 }), n.tex ? 'ground' : 'ground-bare', n.tex ? GROUND : {
      ...GROUND, map: 'vec3 gPhoto = diffuseColor.rgb; float gDist = length( vWp - cameraPosition ); float gLum = 0.0; float gWater = 1.0; float fGlow = 0.0; diffuseColor.rgb = vec3( 0.010, 0.032, 0.038 );',
    }, { uPhotoST: { value: n.photoST }, uMaskST: { value: new THREE.Vector3(n.dem.s, n.dem.ox, n.dem.oy) }, tMask: { value: n.dem.rec.tex } });
    const m = new THREE.Mesh(g, mat);
    m.position.copy(c); m.updateMatrixWorld();
    m.matrixAutoUpdate = false; m.receiveShadow = true; m.castShadow = false; m.visible = false;
    m.userData.node = n;
    n.mesh = m;
    n.box.copy(g.boundingBox).translate(c);
    n.box.min.y = lo - 2; n.box.max.y = hi + 2;          // without the skirt
    this.group.add(m);
    this.stats.tiles++;
  }

  dispose(n) {
    if (n.children) { for (const c of n.children) this.dispose(c); n.children = null; }
    n.abort?.abort(); n.abort = null;
    if (n.mesh) {
      this.group.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh.material.dispose(); n.mesh = null; this.stats.tiles--;
    }
    if (n.ownsTex && n.tex) { n.tex.dispose(); n.tex.image?.close?.(); }
    if (n.ownsRec && n.dem) n.dem.rec.tex.dispose();
    n.tex = null; n.dem = null; n.ownsTex = n.ownsRec = false; n.state = NONE;
  }

  update(camera, viewportH) {
    this.frame++;
    const fr = this._fr; fr.setFromProjectionMatrix(this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const pxK = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const splitK = (DS * this.errPx) / pxK;                    // split while tile size > splitK * distance
    const cam = camera.position, show = [];
    const visit = (n) => {
      n.seen = this.frame;
      if (n.state !== READY) return;
      const d = Math.max(n.box.distanceToPoint(cam), 1);
      const want = n.z < this.maxZ && n.size > splitK * d && fr.intersectsBox(n.box);
      if (want) {
        if (!n.children) n.children = [0, 1, 2, 3].map((q) => new Node(n.z + 1, n.x * 2 + (q & 1), n.y * 2 + (q >> 1), n));
        let all = true;
        for (const c of n.children) if (c.state !== READY) { all = false; this.request(c, -d); } else c.seen = this.frame;
        if (all) { for (const c of n.children) visit(c); return; }
      }
      show.push(n);
    };
    for (const r of this.roots) visit(r);
    // swap visibility
    let changed = false;
    for (const n of show) n.shown = this.frame;
    for (const n of this.shownNodes) if (n.shown !== this.frame && n.mesh) n.mesh.visible = false;
    for (const n of show) if (!n.mesh.visible) { n.mesh.visible = true; changed = true; }
    this.shownNodes = show;
    if (changed) this.changed++;
    this.pump();
    this.stats.loading = this.queue.length + this.active;
    if (this.frame % 90 === 0) this.prune();
  }

  // free subtrees that have not been needed for a while
  prune() {
    const old = this.frame - 600;
    const walk = (n) => {
      if (!n.children) return;
      let stale = true;
      for (const c of n.children) { walk(c); if (c.seen > old || c.children) stale = false; }
      if (stale) { for (const c of n.children) this.dispose(c); n.children = null; }
    };
    for (const r of this.roots) walk(r);
  }

  // deepest loaded tile over a point
  nodeAt(lat, lon) {
    for (const r of this.roots) {
      if (lon < r.lon0 || lon >= r.lon1 || lat < r.lat0 || lat >= r.lat1) continue;
      let n = r;
      if (n.state !== READY) return null;
      for (;;) {
        if (!n.children) return n;
        const c = n.children.find((k) => lon >= k.lon0 && lon < k.lon1 && lat >= k.lat0 && lat < k.lat1);
        if (!c || c.state !== READY) return n;
        n = c;
      }
    }
    return null;
  }

  // ground elevation (m above sea level) and whether it is water, at a latitude / longitude
  elevation(lat, lon) {
    const n = this.nodeAt(lat, lon);
    if (!n) return { elev: 0, water: false, z: -1 };
    const u = (lon - n.lon0) / (n.lon1 - n.lon0), v = latTile(lat, n.z) - n.y;
    return { elev: sample(n.dem, u, v, n.dem.rec.h), water: sample(n.dem, u, v, n.dem.rec.mask) > 128, z: n.z };
  }

  // world height of the ground under a world point
  heightAt(x, z) {
    const g = worldToGeo(this._v.set(x, 0, z));
    const e = this.elevation(g.lat, g.lon);
    this.lastZoom = e.z;                      // zoom of the elevation data used: 15 and up means the 5 m survey
    return geoToWorld(g.lat, g.lon, e.elev, this._v).y;
  }
}

/* ------------------------------------------------------------------ top-down photo for roofs */
// Plain (untextured) building roofs take their colour from the aerial photo under them. The photo lives in the
// terrain tiles, so two square top-down copies are kept around the view: a sharp one and a wide one.
export class GroundBake {
  constructor(renderer, terrain, res = [4096, 2048]) {
    this.renderer = renderer; this.terrain = terrain;
    this.levels = [
      { size: 3600, res: res[0], tex: 'tGroundA', st: 'uGroundA', gap: 500, last: -1e9, cx: 1e9, cz: 1e9, seen: -1 },
      { size: 28000, res: res[1], tex: 'tGroundB', st: 'uGroundB', gap: 1500, last: -1e9, cx: 1e9, cz: 1e9, seen: -1 },
    ];
    for (const L of this.levels) {
      L.rt = new THREE.WebGLRenderTarget(L.res, L.res, { depthBuffer: true, type: THREE.UnsignedByteType });
      L.rt.texture.colorSpace = THREE.SRGBColorSpace;
      L.rt.texture.minFilter = L.rt.texture.magFilter = THREE.LinearFilter; L.rt.texture.generateMipmaps = false;
      L.cam = new THREE.OrthographicCamera(-L.size / 2, L.size / 2, L.size / 2, -L.size / 2, 10, 30000);
      L.cam.up.set(0, 0, -1);
      ATMO.uniforms[L.tex].value = L.rt.texture;
    }
    this._f = new THREE.Vector3();
  }

  update(camera, groundY) {
    const now = performance.now(), f = this._f, U = ATMO.uniforms;
    camera.getWorldDirection(f);
    const alt = Math.max(camera.position.y - groundY, 5);
    const fl = Math.hypot(f.x, f.z) || 1;
    for (const L of this.levels) {
      const ahead = Math.min(L.size * 0.36, alt / Math.max(-f.y, 0.1));
      const G = L.size / 10;
      const cx = Math.round((camera.position.x + (f.x / fl) * ahead) / G) * G, cz = Math.round((camera.position.z + (f.z / fl) * ahead) / G) * G;
      const moved = cx !== L.cx || cz !== L.cz, stale = L.seen !== this.terrain.changed;
      if (!moved && !(stale && now - L.last > L.gap)) continue;
      L.cx = cx; L.cz = cz; L.last = now; L.seen = this.terrain.changed;
      L.cam.position.set(cx, 12000, cz); L.cam.lookAt(cx, 0, cz); L.cam.updateMatrixWorld();
      const r = this.renderer, prev = r.getRenderTarget(), sm = r.shadowMap.autoUpdate;
      U.uBake.value = 1; r.shadowMap.autoUpdate = false;
      r.setRenderTarget(L.rt); r.setClearColor(0x30383a, 1); r.clear();
      r.render(this.terrain.group, L.cam);
      r.setRenderTarget(prev); r.shadowMap.autoUpdate = sm;
      U.uBake.value = 0;
      U[L.st].value.set(cx, cz, 1 / L.size, 1);
    }
  }
}
