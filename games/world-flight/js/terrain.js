// terrain.js — the ground, anywhere on Earth: a quadtree of map tiles, each one a small height mesh with a photograph on it.
//   photo      Esri World Imagery, zoom 7 to 19 (a metre a pixel or better over most land)
//   elevation  Terrain Tiles on AWS ("terrarium"), at zoom 6, 9 and 12 only. A tile holds 256 x 256 heights and a ground
//              square is 33 x 33 points, so one height tile serves every square it covers three levels down (and at
//              zoom 12, one height every 30 m, everything below: that is as fine as most of the world was measured).
//              A flight asks for a few dozen of them, where one per ground square was over a thousand.
//   water      OpenStreetMap's water outlines, drawn into a mask by maps.js: the sea, lakes and rivers become
//              moving, reflecting water in the photo's own colour. The sea is level at 0 m; lakes keep their height.
// The tree's roots follow the aircraft, so there is ground wherever it goes. Every tile is built in metres round its
// own middle and placed by `frameAt`, so when the page moves its origin (geo.js) a tile is put back exactly by
// working its place out again; nothing is rebuilt.
// It also keeps a top-down copy of the photo around the camera (GroundBake) that building roofs read from.
import * as THREE from 'three';
import { geoToWorld, worldToGeo, frameAt, tileLon, tileLat, lonTile, latTile, tileMetres, ORIGIN } from './geo.js';
import { ATMO, patch } from './atmo.js';
import { photoUrl, heightUrl, fetchTile, NET, PHOTO_BLANK, PHOTO_MAX } from './net.js';

const ROOT_Z = 7, N = 32, DS = 256;
const demLevel = (z) => (z <= 9 ? 6 : z <= 12 ? 9 : 12);      // the level a ground square's heights are read from
const FLAT = { h: new Float32Array(DS * DS), lo: 0, hi: 0 };
export const MASK_Z = [7, 10];             // the zoom levels a water mask is drawn at as a tile arrives (maps.js); tiles between and below use the nearest above
const MASK_NEAR_Z = 14;                    // and close to the camera, the level the buildings' own map tiles are at (fetched anyway): 5 m a dot
const NONE = 0, QUEUED = 1, LOADING = 2, READY = 3;
const OCEAN = 191;                         // mask value from which a spot counts as open sea (maps.js draws the sea at 255, inland water at 128)

/* ------------------------------------------------------------------ elevation records */
const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(DS, DS) : Object.assign(document.createElement('canvas'), { width: DS, height: DS });
const cx = cv.getContext('2d', { willReadFrequently: true });

// terrarium PNG: metres = R * 256 + G + B / 256 - 32768
async function fetchDem(url, signal) {
  let bmp;
  try {
    const r = await fetchTile(url, { signal, mode: 'cors' });
    if (!r.ok) return null;
    bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  } catch (e) { if (e.name === 'AbortError') throw e; return null; }
  NET.height++;
  cx.clearRect(0, 0, DS, DS); cx.drawImage(bmp, 0, 0, DS, DS); bmp.close?.();
  const d = cx.getImageData(0, 0, DS, DS).data, h = new Float32Array(DS * DS);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, p = 0; i < DS * DS; i++, p += 4) { const v = d[p] * 256 + d[p + 1] + d[p + 2] / 256 - 32768; h[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  return { h, lo, hi };
}

// a water mask as the graphics card reads it; its blurred levels say how far off the nearest land is
function maskRecord(mask, size) {
  const tex = new THREE.DataTexture(mask, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  return { mask, size, tex };
}
const DRY = maskRecord(new Uint8Array(16), 4);

// bilinear lookup through a view {rec, ox, oy, s} (the part of a record a tile covers)
function sample(view, u, v, arr, S = DS) {
  const fx = Math.min(Math.max((view.ox + u * view.s) * S - 0.5, 0), S - 1.001), fy = Math.min(Math.max((view.oy + v * view.s) * S - 0.5, 0), S - 1.001);
  const x = fx | 0, y = fy | 0, tx = fx - x, ty = fy - y, i = y * S + x;
  return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + S] * (1 - tx) + arr[i + S + 1] * tx) * ty;
}
const wet = (view, u, v) => sample(view, u, v, view.rec.mask, view.rec.size);
const half = (v, x, y) => ({ rec: v.rec, s: v.s / 2, ox: v.ox + (x & 1) * v.s / 2, oy: v.oy + (y & 1) * v.s / 2 });

// true when the part of a mask a tile covers is all open sea
function allSea(view) {
  const S = view.rec.size, m = view.rec.mask, x0 = Math.floor(view.ox * S), y0 = Math.floor(view.oy * S), n = Math.max(Math.ceil(view.s * S), 1);
  if (view.rec === DRY) return false;
  for (let j = y0; j < Math.min(y0 + n, S); j++) for (let i = x0; i < Math.min(x0 + n, S); i++) if (m[j * S + i] < 250) return false;
  return true;
}

/* ------------------------------------------------------------------ ground material */
const GROUND = {
  fragPars: /* glsl */`
    uniform vec3 uPhotoST; uniform vec3 uMaskST; uniform sampler2D tMask; uniform vec2 uShift;`,
  map: /* glsl */`
    vec2 gUv = vMapUv * uPhotoST.x + uPhotoST.yz;
    vec4 sampledDiffuseColor = texture2D( map, gUv );
    float gDist = length( vWp - cameraPosition );
    vec2 gq = vWp.xz + uShift;                                   // ground metres that stay put when the page moves its origin
    const vec3 gW = vec3( 0.30, 0.55, 0.15 );
    // Close up a metre of photo is stretched over many screen pixels. Sharpen it against its own neighbours so
    // kerbs, lane lines and field edges keep an edge instead of melting: where neighbouring texels really differ
    // the blend between them is snapped to one side or the other.
    float gSharp = 1.0 - smoothstep( 60.0, 260.0, gDist );
    if ( gSharp > 0.0 ) {
      const vec2 gT = vec2( 1.0 / 256.0, 0.0 );
      float gM = dot( sampledDiffuseColor.rgb, gW );
      float gA = dot( texture2D( map, gUv + gT.xy ).rgb, gW ), gB = dot( texture2D( map, gUv - gT.xy ).rgb, gW );
      float gC = dot( texture2D( map, gUv + gT.yx ).rgb, gW ), gD = dot( texture2D( map, gUv - gT.yx ).rgb, gW );
      float gLo = min( gM, min( min( gA, gB ), min( gC, gD ) ) ), gHi = max( gM, max( max( gA, gB ), max( gC, gD ) ) );
      float gEdge = smoothstep( 0.05, 0.16, gHi - gLo );
      float gNew = mix( gLo, gHi, smoothstep( 0.30, 0.70, ( gM - gLo ) / max( gHi - gLo, 1e-4 ) ) );
      sampledDiffuseColor.rgb *= mix( 1.0, gNew / max( gM, 1e-3 ), gEdge * gSharp );
    }
    diffuseColor *= sampledDiffuseColor;
    vec3 gPhoto = diffuseColor.rgb;
    vec2 gMuv = vMapUv * uMaskST.x + uMaskST.yz;
    float gMask = texture2D( tMask, gMuv ).r;
    float gLum = dot( gPhoto, gW );
    // Water is where the map says it is. What stands out from the water round it in the photograph (a ship, a
    // wake, a pier, a bridge deck) is left as photographed; the rest becomes moving water in the photo's own colour:
    // a turquoise lagoon stays turquoise and a muddy river stays brown.
    vec3 gWide = texture2D( map, gUv, 4.0 ).rgb;
    float gOpen = smoothstep( 0.86, 0.99, texture2D( tMask, gMuv, 4.0 ).r );
    float gStands = smoothstep( 0.07, 0.16, gLum - dot( gWide, gW ) );
    float gWater = smoothstep( 0.22, 0.40, gMask ) * ( 1.0 - gStands * ( 1.0 - 0.6 * gOpen ) );
    vec3 gTint = mix( gWide, vec3( dot( gWide, gW ) ) * vec3( 0.55, 0.85, 1.0 ), 0.35 );
    vec3 gDeep = mix( vec3( 0.010, 0.032, 0.040 ), gTint * 0.62, 0.55 - 0.25 * gOpen );
    diffuseColor.rgb = mix( gPhoto, gDeep, gWater );
    // white horses when the wind gets up
    if ( uSea > 0.45 && gDist < 9000.0 ) {
      float gFoam = smoothstep( 0.80, 0.95, apNoise( gq * 0.045 + uTime * 0.03 ) * 0.55 + apNoise( gq * 0.23 - uTime * 0.05 ) * 0.45 + 0.13 );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.50, 0.52, 0.54 ), gFoam * gWater * smoothstep( 0.45, 1.0, uSea ) * 0.7 * ( 1.0 - smoothstep( 2500.0, 9000.0, gDist ) ) );
    }
    // fine grain close up, so the photo does not read as a smear from a few metres
    float gNear = ( 1.0 - smoothstep( 30.0, 320.0, gDist ) ) * ( 1.0 - gWater );
    float gGrain = apNoise( gq * 3.1 ) * 0.35 + apNoise( gq * 13.0 ) * 0.35 + apNoise( gq * 47.0 ) * 0.30;
    diffuseColor.rgb *= 1.0 + ( gGrain - 0.5 ) * 0.13 * gNear;`,
  rough: /* glsl */`
    // Water: glassy close to, where each wave is seen; from far off and high up the waves are smaller than a pixel
    // and what is left of them is a broad soft sheen, wider and dimmer the rougher the sea.
    roughnessFactor = mix( 0.95, mix( 0.06 + 0.07 * uSea, 0.33 + 0.15 * uSea, smoothstep( 250.0, 6000.0, gDist ) ), gWater );`,
  wet: '( 1.0 - gWater )', snowed: '( 0.72 + 0.28 * smoothstep( 0.08, 0.32, gLum ) )',
  normal: /* glsl */`
    if ( gWater > 0.01 ) {
      vec2 wq = gq; float wt = uTime;
      vec2 e = vec2( 0.45, 0.0 );
      #define W_H( p ) ( apFbm( ( p ) * 0.085 + vec2( wt * 0.21, wt * 0.13 ) ) + 0.45 * apFbm( ( p ) * 0.41 - vec2( wt * 0.37, - wt * 0.19 ) ) )
      float w0 = W_H( wq ), wx = W_H( wq + e.xy ), wz = W_H( wq + e.yx );
      float wAmp = ( 0.75 + 1.1 * uSea ) / ( 1.0 + gDist * 0.0011 );
      vec3 wn = normalize( vec3( ( w0 - wx ) * wAmp, 1.0, ( w0 - wz ) * wAmp ) );
      normal = normalize( mix( normal, normalize( ( viewMatrix * vec4( wn, 0.0 ) ).xyz ), gWater ) );
    }`,
  // after dark: lit streets and yards show as a dim warm copy of the photo, strongest where it is pale (roads, roofs, paving)
  emissive: /* glsl */`
    totalEmissiveRadiance += gPhoto * vec3( 1.0, 0.74, 0.46 ) * ( 0.055 * uNight ) * ( 1.0 - gWater ) * smoothstep( 0.05, 0.35, gLum );`,
  final: /* glsl */`
    if ( uBake > 0.5 ) gl_FragColor = vec4( gPhoto, 1.0 );`,
};
const BARE = { ...GROUND, map: /* glsl */`
    float gDist = length( vWp - cameraPosition ); vec2 gq = vWp.xz + uShift; float gLum = 0.0;
    float gMask = texture2D( tMask, vMapUv * uMaskST.x + uMaskST.yz ).r;
    float gWater = smoothstep( 0.22, 0.40, gMask );
    vec3 gPhoto = mix( vec3( 0.13, 0.15, 0.12 ), vec3( 0.010, 0.032, 0.040 ), gWater ); diffuseColor.rgb = gPhoto;` };

/* ------------------------------------------------------------------ quadtree */
const _F = new THREE.Matrix4(), _I = new THREE.Matrix4(), _v = new THREE.Vector3();
class Node {
  constructor(z, x, y, parent) {
    this.z = z; this.x = x; this.y = y; this.parent = parent; this.children = null;
    this.state = NONE; this.mesh = null; this.dem = null; this.wat = null; this.tex = null; this.ownsTex = false; this.ownsDem = false; this.ownsWat = false;
    this.seen = 0; this.shown = 0; this.pri = 0; this.abort = null; this.masking = false;
    this.lon0 = tileLon(x, z); this.lon1 = tileLon(x + 1, z); this.lat1 = tileLat(y, z); this.lat0 = tileLat(y + 1, z);
    this.latC = (this.lat0 + this.lat1) / 2; this.lonC = (this.lon0 + this.lon1) / 2;
    this.size = tileMetres(z, this.latC);
    // lowest and highest ground, as far as is known before its own heights arrive
    this.lo = parent ? parent.lo - 40 : -450; this.hi = parent ? parent.hi + 40 : 8900;
    this.box = new THREE.Box3(); this.rough();
  }
  // rough bounds until the mesh exists (and again whenever the origin moves)
  rough() {
    this.box.makeEmpty();
    for (const [la, lo] of [[this.lat0, this.lon0], [this.lat0, this.lon1], [this.lat1, this.lon0], [this.lat1, this.lon1], [this.latC, this.lonC]]) {
      this.box.expandByPoint(geoToWorld(la, lo, this.lo - 5, _v)); this.box.expandByPoint(geoToWorld(la, lo, this.hi + 5, _v));
    }
  }
  place() {
    const m = this.mesh; if (!m) { this.rough(); return; }
    frameAt(this.latC, this.lonC, 0, m.matrix); m.matrixWorld.copy(m.matrix);
    this.box.copy(m.geometry.boundingBox).applyMatrix4(m.matrix);
  }
}

export class Terrain {
  constructor(renderer) {
    this.renderer = renderer;
    this.group = new THREE.Group(); this.group.name = 'terrain'; this.group.matrixAutoUpdate = false;
    this.roots = new Map(); this.rootAt = '';
    this.queue = []; this.active = 0; this.maxActive = 14;
    this.frame = 0; this.shownNodes = [];
    this.errPx = 1.25;            // photo pixels per screen pixel before a tile splits
    this.maxZ = 18;               // deepest photo zoom asked for
    this.demZ = 12; this.dems = new Map();
    this.flatten = null;          // optional (lat, lon, height) -> height, applied to every ground vertex as it is built (runways)
    this.water = null;            // optional (z, x, y) -> Promise of { mask, size } or null: the water outlines for a tile (maps.js)
    this.maskNear = 5000;         // metres from the camera within which the sharp outlines are asked for
    this.aniso = 8;
    this.changed = 0;             // bumps whenever a tile appears: shadows and the roof lookup re-render
    this.kinds = 0;               // which ground surfaces exist so far (1 with its photo, 2 without): each is its own shader
    this.stats = { tiles: 0, loading: 0, masks: 0 };
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this._fr = new THREE.Frustum(); this._m = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._g = {};
    this.setRoots(ORIGIN.lat, ORIGIN.lon);
  }

  // the roots cover some 400 km east and west and 300 km north and south of a place; ones left far behind are let go
  setRoots(lat, lon) {
    const n = 2 ** ROOT_Z, cxm = Math.floor(lonTile(lon, ROOT_Z)), cym = Math.floor(latTile(lat, ROOT_Z));
    const rx = THREE.MathUtils.clamp(Math.ceil(300000 / tileMetres(ROOT_Z, lat)), 1, 6), ry = THREE.MathUtils.clamp(Math.ceil(210000 / tileMetres(ROOT_Z, lat)), 1, 5);
    const key = `${cxm}|${cym}|${rx}`; if (key === this.rootAt) return;
    this.rootAt = key;
    const want = new Set();
    for (let y = Math.max(cym - ry, 0); y <= Math.min(cym + ry, n - 1); y++) for (let x = cxm - rx; x <= cxm + rx; x++) {
      const k = x + '_' + y; want.add(k);
      if (!this.roots.has(k)) { const r = new Node(ROOT_Z, x, y, null); this.roots.set(k, r); this.request(r, -Math.hypot(x - cxm, y - cym) * 1e5); }
    }
    for (const [k, r] of this.roots) {
      if (want.has(k)) continue;
      if (Math.abs(r.x - cxm) > rx + 1 || Math.abs(r.y - cym) > ry + 1) { this.dispose(r); this.roots.delete(k); }
    }
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
    const alive = () => { if (ac.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    // water first of all from above: a tile wholly at sea needs neither a photograph nor heights
    n.wat = parent ? half(parent.wat, x, y) : { rec: DRY, ox: 0, oy: 0, s: 1 };
    const sea = parent && parent.z >= 8 && allSea(n.wat);
    const noPhoto = sea || z > PHOTO_MAX || (parent && !parent.ownsTex && parent.z >= 10);      // the parent already found nothing sharper here
    const photoP = noPhoto ? Promise.resolve(null) : (async () => {
      try {
        const r = await fetchTile(photoUrl(z, x, y), { signal: ac.signal, mode: 'cors' });
        if (!r.ok) return null;
        const b = await r.blob();
        if (b.size === PHOTO_BLANK) return null;
        NET.photo++; NET.bytes += b.size;
        return await createImageBitmap(b, { colorSpaceConversion: 'none' });
      } catch (e) { if (e.name === 'AbortError') throw e; return null; }
    })();
    photoP.catch(() => {});
    let dem = null;
    if (!sea) {
      const L = demLevel(z), sh = z - L, tx = x >> sh, ty = y >> sh, rec = await this.heights(L, tx, ty);
      alive();
      if (rec) {
        const s = 1 / 2 ** sh; dem = { rec, ox: (x - tx * 2 ** sh) * s, oy: (y - ty * 2 ** sh) * s, s };
        // lowest and highest in its own part of the tile
        const x0 = Math.floor(dem.ox * DS), y0 = Math.floor(dem.oy * DS), m = Math.max(Math.ceil(s * DS), 1), h = rec.h; let lo = Infinity, hi = -Infinity;
        for (let j = y0; j < Math.min(y0 + m, DS); j++) for (let i = x0; i < Math.min(x0 + m, DS); i++) { const v = h[j * DS + i]; if (v < lo) lo = v; if (v > hi) hi = v; }
        n.lo = lo; n.hi = hi;
      } else if (parent && parent.dem) { dem = half(parent.dem, x, y); n.lo = parent.lo; n.hi = parent.hi; }
    }
    if (!dem) { dem = { rec: FLAT, ox: 0, oy: 0, s: 1 }; n.lo = 0; n.hi = 0; }
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
      // nothing at this zoom (open water, or beyond what was photographed): stretch the parent's
      n.tex = parent.tex; const p = parent.photoST;
      photoST = new THREE.Vector3(p.x / 2, p.y + (x & 1) * p.x / 2, p.z + (y & 1) * p.x / 2);
    } else { n.tex = null; photoST = new THREE.Vector3(1, 0, 0); }
    n.dem = dem; n.photoST = photoST;
    this.build(n);
    n.state = READY; n.abort = null;
    if (MASK_Z.includes(z) && this.water && !sea) this.mask(n);
  }

  // one tile of heights, shared by every ground square that lies in it (the last 150 used are kept)
  heights(z, x, y) {
    const k = z + '/' + x + '/' + y; let p = this.dems.get(k);
    if (p) { this.dems.delete(k); this.dems.set(k, p); return p; }
    p = fetchDem(heightUrl(z, x, y)).catch(() => null).then((d) => { if (!d) this.dems.delete(k); return d; });       // (one that failed is asked for again by the next square)
    this.dems.set(k, p); if (this.dems.size > 150) this.dems.delete(this.dems.keys().next().value);
    return p;
  }

  // The water outlines for a tile arrive after it (they come with the map tiles, which are larger): the tile is shown
  // meanwhile with the coarser mask from above, then it and everything under it is given the sharper one.
  mask(n) {
    if (n.masking || n.ownsWat) return;
    n.masking = true;
    this.water(n.z, n.x, n.y).then((w) => {
      n.masking = false;
      if (!w && !n.parent && n.hi <= 0.5) w = { mask: new Uint8Array(16).fill(255), size: 4 };       // nothing mapped and no land in its heights: open sea
      if (!w || n.state !== READY) return;
      n.wat = { rec: maskRecord(w.mask, w.size), ox: 0, oy: 0, s: 1 }; n.ownsWat = true; this.stats.masks++;
      const down = (k) => {
        if (k !== n) { if (k.ownsWat) return; k.wat = half(k.parent.wat, k.x, k.y); }
        if (k.mesh) this.rebuild(k);
        if (k.children) for (const c of k.children) if (c.state === READY) down(c);
      };
      down(n); this.changed++;
    }).catch((e) => { n.masking = false; console.warn('water', n.z, n.x, n.y, e.message || e); });
  }

  build(n) {
    const V = (N + 1) * (N + 1), total = V + 4 * (N + 1);
    const pos = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    const F = frameAt(n.latC, n.lonC, 0, _F), inv = _I.copy(F).invert(), v = this._v;
    const y0 = n.y, zz = n.z;
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= N; j++) {
      const lat = tileLat(y0 + j / N, zz);
      for (let i = 0; i <= N; i++) {
        const k = j * (N + 1) + i, lon = n.lon0 + (n.lon1 - n.lon0) * (i / N);
        let h = sample(n.dem, i / N, j / N, n.dem.rec.h);
        if (wet(n.wat, i / N, j / N) >= OCEAN) h = 0;
        if (this.flatten) h = this.flatten(lat, lon, h);
        geoToWorld(lat, lon, h, v).applyMatrix4(inv);
        pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
        uv[k * 2] = i / N; uv[k * 2 + 1] = j / N;
        if (h < lo) lo = h; if (h > hi) hi = h;
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
    g.computeBoundingBox();                                    // without the skirt: what the camera's distance is measured to
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
    g.computeBoundingSphere();
    const mat = patch(new THREE.MeshStandardMaterial({ map: n.tex, color: 0xffffff, roughness: 0.95, metalness: 0 }), n.tex ? 'ground' : 'ground-bare', n.tex ? GROUND : BARE,
      { uPhotoST: { value: n.photoST }, uMaskST: { value: new THREE.Vector3(n.wat.s, n.wat.ox, n.wat.oy) }, tMask: { value: n.wat.rec.tex } });
    const m = new THREE.Mesh(g, mat);
    this.kinds |= n.tex ? 1 : 2;
    m.matrixAutoUpdate = false; m.receiveShadow = true; m.castShadow = false; m.visible = false;
    m.userData.node = n;
    n.mesh = m; n.lo = lo; n.hi = hi;
    n.place();
    this.group.add(m);
    this.stats.tiles++;
  }

  // the same tile again with what is now known (a sharper water mask, a runway to make room for)
  rebuild(n) {
    const old = n.mesh; if (!old) return;
    const shown = old.visible;
    this.group.remove(old); old.geometry.dispose(); old.material.dispose(); n.mesh = null; this.stats.tiles--;
    this.build(n); n.mesh.visible = shown;
  }
  // every loaded tile that reaches within `radius` metres of a place is built again (a runway has been laid there)
  rebuildNear(lat, lon, radius) {
    const c = geoToWorld(lat, lon, 0, new THREE.Vector3()), s = new THREE.Sphere(c, radius + 9000);
    const walk = (n) => {
      if (n.state !== READY) return;
      if (n.box.distanceToPoint(c) > radius + (n.hi - n.lo) + 9000 && !n.box.intersectsSphere(s)) return;
      const g = Math.hypot(...[(n.latC - lat) * 110574, (n.lonC - lon) * 111320 * Math.cos(lat * Math.PI / 180)]);
      if (n.mesh && g < radius + n.size) this.rebuild(n);
      if (n.children) for (const k of n.children) walk(k);
    };
    for (const r of this.roots.values()) walk(r);
    this.changed++;
  }

  dispose(n) {
    if (n.children) { for (const c of n.children) this.dispose(c); n.children = null; }
    n.abort?.abort(); n.abort = null;
    if (n.mesh) {
      this.group.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh.material.dispose(); n.mesh = null; this.stats.tiles--;
    }
    if (n.ownsTex && n.tex) { n.tex.dispose(); n.tex.image?.close?.(); }
    if (n.ownsWat && n.wat) n.wat.rec.tex.dispose();
    n.tex = null; n.dem = null; n.wat = null; n.ownsTex = n.ownsDem = n.ownsWat = false; n.state = NONE;
  }

  // the page has moved its origin: every tile goes back where it belongs in the new frame
  rebase() {
    const walk = (n) => { n.place(); if (n.children) for (const c of n.children) walk(c); };
    for (const r of this.roots.values()) walk(r);
    this.changed++;
  }

  update(camera, viewportH) {
    this.frame++;
    const fr = this._fr; fr.setFromProjectionMatrix(this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const pxK = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const splitK = (DS * this.errPx) / pxK;                    // split while tile size > splitK * distance
    const cam = camera.position, show = [];
    if (this.frame % 30 === 1) { const g = worldToGeo(cam, this._g); this.setRoots(g.lat, g.lon); }
    const visit = (n) => {
      n.seen = this.frame;
      if (n.state !== READY) return;
      const d = Math.max(n.box.distanceToPoint(cam), 1);
      const inView = fr.intersectsBox(n.box);
      if (n.z === MASK_NEAR_Z && d < this.maskNear && this.water && !n.ownsWat && !n.masking && !n.dry && inView) { if (allSea(n.wat)) n.dry = true; else this.mask(n); }
      const want = n.z < this.maxZ && n.size > splitK * d && inView;
      if (want) {
        if (!n.children) n.children = [0, 1, 2, 3].map((q) => new Node(n.z + 1, n.x * 2 + (q & 1), n.y * 2 + (q >> 1), n));
        let all = true;
        for (const c of n.children) if (c.state !== READY) { all = false; this.request(c, -d); } else c.seen = this.frame;
        if (all) { for (const c of n.children) visit(c); return; }
      }
      show.push(n);
    };
    for (const r of this.roots.values()) { if (r.state === NONE) this.request(r, -1e7); visit(r); }
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
    for (const r of this.roots.values()) walk(r);
  }

  // deepest loaded tile over a point
  nodeAt(lat, lon) {
    for (const r of this.roots.values()) {
      if (lat < r.lat0 || lat >= r.lat1) continue;
      let l = lon; if (l < r.lon0) l += 360; else if (l >= r.lon1) l -= 360;
      if (l < r.lon0 || l >= r.lon1) continue;
      let n = r;
      if (n.state !== READY) return null;
      for (;;) {
        if (!n.children) break;
        const c = n.children.find((k) => l >= k.lon0 && l < k.lon1 && lat >= k.lat0 && lat < k.lat1);
        if (!c || c.state !== READY) break;
        n = c;
      }
      this._lon = l;
      return n;
    }
    return null;
  }

  // ground elevation (m above sea level) and whether it is water, at a latitude / longitude
  elevation(lat, lon) {
    const n = this.nodeAt(lat, lon);
    if (!n) return { elev: 0, water: false, z: -1 };
    const u = (this._lon - n.lon0) / (n.lon1 - n.lon0), v = latTile(lat, n.z) - n.y, w = wet(n.wat, u, v);
    return { elev: w >= OCEAN ? 0 : sample(n.dem, u, v, n.dem.rec.h), water: w > 64, z: n.z };
  }

  // world height of the ground under a world point
  heightAt(x, z) {
    const g = worldToGeo(this._v.set(x, 0, z), this._g);
    const e = this.elevation(g.lat, g.lon);
    this.lastZoom = e.z;
    return geoToWorld(g.lat, g.lon, e.elev, this._v).y;
  }
}

/* ------------------------------------------------------------------ top-down photo for roofs */
// Building roofs take their colour from the photograph under them. The photo lives in the terrain tiles, so two
// square top-down copies are kept around the view: a sharp one and a wide one.
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
      L.cam = new THREE.OrthographicCamera(-L.size / 2, L.size / 2, L.size / 2, -L.size / 2, 10, 40000);
      L.cam.up.set(0, 0, -1);
      ATMO.uniforms[L.tex].value = L.rt.texture;
    }
    this._f = new THREE.Vector3();
    this.kinds = 0; this.building = 0;       // the ground surfaces whose off-screen shader is built, and being built
  }

  // The copy is drawn with the ground's own surfaces, but drawn off screen they are a different shader from the one
  // on screen. Built at its first use it stopped the page for most of a second, so it is built in the background
  // first, and until it is ready the copy is left as it is.
  ready() {
    const want = this.terrain.kinds;
    if (want === this.kinds) return want > 0;
    if (this.building) return false;
    const r = this.renderer, L = this.levels[0], prev = r.getRenderTarget();
    r.setRenderTarget(L.rt);
    const mats = r.compile(this.terrain.group, L.cam);
    r.setRenderTarget(prev);
    const progs = new Set();
    for (const m of mats) { const pr = r.properties.get(m).currentProgram; if (pr) progs.add(pr); }
    this.building = want;
    const poll = () => { for (const pr of progs) if (pr.isReady()) progs.delete(pr); if (progs.size) setTimeout(poll, 20); else { this.kinds = this.building; this.building = 0; } };
    poll();
    return this.kinds === want;
  }

  reset() { for (const L of this.levels) { L.cx = 1e9; L.cz = 1e9; L.last = -1e9; } }

  update(camera, groundY) {
    if (!this.ready()) return;
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
      L.cam.position.set(cx, groundY + 14000, cz); L.cam.lookAt(cx, groundY, cz); L.cam.updateMatrixWorld();
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
