// city.js — the buildings and bridges: Project PLATEAU 3D Tiles (MLIT Japan), one tileset per ward or city.
// A set is opened when the camera gets near its area and closed again when it is far away.
// Photo-textured faces keep their aerial photo. Faces without a photo get a roof from the aerial photo under
// them and procedural walls (floors, window bays, glass), so nothing is left as a blank white block.
import * as THREE from 'three';
import { TilesRenderer, Scheduler } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { ECEF_TO_WORLD, geoToWorld } from './geo.js';
import { ATMO, patch } from './atmo.js';
import { usageClass } from './facade.js';
import { plateau } from './net.js';

const FACADE_PARS = /* glsl */`
  varying vec3 vBld;
  uniform sampler2D tGroundA, tGroundB; uniform vec4 uGroundA, uGroundB;
  float bBox( float x, float a, float b, float w ) { return smoothstep( a - w, a + w, x ) - smoothstep( b - w, b + w, x ); }
  // the aerial photo under a point (sharp copy near the view, wide copy beyond)
  vec3 bPhoto( vec2 xz ) {
    vec2 ua = vec2( xz.x - uGroundA.x, uGroundA.y - xz.y ) * uGroundA.z + 0.5;
    vec2 ub = vec2( xz.x - uGroundB.x, uGroundB.y - xz.y ) * uGroundB.z + 0.5;
    vec2 ea = abs( ua - 0.5 ), eb = abs( ub - 0.5 );
    float ia = uGroundA.w * ( 1.0 - smoothstep( 0.44, 0.49, max( ea.x, ea.y ) ) );
    float ib = uGroundB.w * ( 1.0 - smoothstep( 0.44, 0.49, max( eb.x, eb.y ) ) );
    vec3 c = mix( vec3( 0.33, 0.34, 0.34 ), texture2D( tGroundB, ub ).rgb, ib );
    return mix( c, texture2D( tGroundA, ua ).rgb, ia );
  }`;

// shared by both kinds: facade coordinates and the window grid
const FACADE_GRID = /* glsl */`
  float bWall = 1.0 - smoothstep( 0.30, 0.62, abs( vWn.y ) );
  float bSeed = vBld.z, bH = max( vBld.y, 2.5 ), bY = vBld.x;
  float bDist = length( vWp - cameraPosition );
  vec2 bT = normalize( vec2( - vWn.z, vWn.x ) + vec2( 1e-5, 0.0 ) );
  vec2 bFc = vec2( dot( vWp.xz, bT ), bY );
  float bFl = bH > 45.0 ? 3.9 : ( bH < 11.0 ? 2.7 : 3.2 );
  float bBay = mix( 1.4, 3.2, fract( bSeed * 7.13 ) );
  vec2 bQ = bFc / vec2( bBay, bFl );
  vec2 bF = fract( bQ ), bCell = floor( bQ ), bW = fwidth( bQ ) * 0.75;
  float bLod = smoothstep( 0.35, 0.9, max( bW.x, bW.y ) );
  float bR = apHash( bCell + bSeed * 91.7 );
  // after dark: a few buildings stay busy, most keep a handful of lights on, some are dark
  float bBusy = fract( bSeed * 2.3 );
  float bLitFrac = bBusy > 0.85 ? 0.55 : ( bBusy > 0.25 ? mix( 0.06, 0.28, fract( bSeed * 9.1 ) ) : 0.015 );
  float bOn = mix( step( 1.0 - bLitFrac, fract( bR * 7.7 + bSeed ) ), bLitFrac, bLod ) * ( 0.45 + 0.9 * fract( bR * 3.1 ) );
  // one lamp colour per building (warm homes, cool offices), with a little spread window to window
  vec3 bLamp = mix( vec3( 1.0, 0.66, 0.36 ), vec3( 0.78, 0.88, 1.0 ), smoothstep( 0.35, 0.65, fract( bSeed * 13.7 ) + ( fract( bR * 13.3 ) - 0.5 ) * 0.3 * ( 1.0 - bLod ) ) );`;

const TEXTURED = {
  vertPars: 'attribute vec3 aBld; varying vec3 vBld;', vert: 'vBld = aBld;',
  fragPars: FACADE_PARS,
  color: /* glsl */`
    ${FACADE_GRID}
    // Relief. In the photo a window is darker than the wall around it. Each such patch is treated as set back
    // into the wall: the view ray is walked into the surface until it meets the wall face, the side of an
    // opening, or the glass at the back. So every photographed wall shows its own windows as real recesses
    // that shift as the camera moves, with no geometry and nothing invented about where they are.
    float pWin = 0.0, pSide = 0.0;
    float pFade = bWall * ( 1.0 - smoothstep( 120.0, 190.0, bDist ) );
    if ( pFade > 0.01 ) {
      const vec3 pL = vec3( 0.30, 0.55, 0.15 );
      vec3 pN = normalize( vWn ), pV = normalize( vWp - cameraPosition );
      vec3 dp1 = dFdx( vWp ), dp2 = dFdy( vWp ); vec2 du1 = dFdx( vMapUv ), du2 = dFdy( vMapUv );
      vec3 c1 = cross( dp2, pN ), c2 = cross( pN, dp1 );
      float det = dot( dp1, c1 );
      if ( abs( det ) > 1e-10 ) {
        vec3 gu = ( c1 * du1.x + c2 * du2.x ) / det, gv = ( c1 * du1.y + c2 * du2.y ) / det;       // texture travel per metre along the wall
        // a photo stretched past half a metre a texel shows blobs, not windows: no relief from those
        pFade *= 1.0 - smoothstep( 0.35, 0.7, 1.0 / max( length( gu ) * float( textureSize( map, 0 ).x ), 1e-3 ) );
        vec3 slide = ( pV - pN * dot( pV, pN ) ) / max( - dot( pV, pN ), 0.30 );                // sideways travel per metre of depth
        vec2 duv = vec2( dot( gu, slide ), dot( gv, slide ) );
        float lodW = clamp( log2( float( textureSize( map, 0 ).x ) / 512.0 ) + 1.5, 0.0, 5.0 );     // the wall's tone: the photo blurred to about 2 m
        const float DEPTH = 0.24;
        float d = 0.0, back = 0.0; vec2 uvp = vMapUv;
        for ( int i = 0; i < 9; i ++ ) {
          uvp = vMapUv + duv * d;
          float here = dot( textureGrad( map, uvp, du1, du2 ).rgb, pL ), tone = dot( textureLod( map, uvp, lodW ).rgb, pL );
          back = smoothstep( uRelief.y, uRelief.z, tone - here ) * smoothstep( 0.06, 0.16, tone ) * DEPTH * pFade * uRelief.x;       // how far back this spot sits
          if ( d >= back ) break;
          d += DEPTH / 8.0;
        }
        pWin = smoothstep( 0.45, 0.85, back / DEPTH );
        pSide = step( back + DEPTH / 16.0, d ) * step( 0.02, d );                               // stopped on the side of an opening, not its back
        diffuseColor.rgb = textureGrad( map, uvp, du1, du2 ).rgb * ( 1.0 - 0.45 * pSide );
      }
    }
    // grain close up: the facade photos are taken from the air and go soft at street level
    float bNear = 1.0 - smoothstep( 25.0, 260.0, bDist );
    float bGrain = apNoise( vec2( bFc.x * 2.3, bFc.y * 6.0 ) + vWp.xz * 0.7 ) * 0.5 + apNoise( bFc * 11.0 ) * 0.5;
    diffuseColor.rgb *= 1.0 + ( bGrain - 0.5 ) * 0.08 * bNear * ( 1.0 - pWin );
    // the facade photos were shot with the sun on the roofs, so many walls come in underexposed: lift the dark
    // end on walls only (not the glass), then this scene's own sun and shadows do the shading
    float bLum = dot( diffuseColor.rgb, vec3( 0.30, 0.55, 0.15 ) );
    float bDark = bWall * ( 1.0 - smoothstep( 0.02, 0.24, bLum ) ) * ( 1.0 - pWin );
    diffuseColor.rgb *= 1.0 + 0.65 * bDark;
    // shaded walls were photographed under blue skylight: take some of that cast out
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( dot( diffuseColor.rgb, vec3( 0.30, 0.55, 0.15 ) ) ) * vec3( 1.05, 1.0, 0.93 ), 0.40 * bDark );
    // lit windows after dark: the real ones where the relief found them, a plain grid beyond that range
    float bWinN = bBox( bF.x, 0.14, 0.86, bW.x ) * bBox( bF.y, 0.34, 0.80, bW.y );
    bWinN = mix( bWinN, 0.33, bLod ) * bWall * smoothstep( bH - 0.5, bH - 1.4, bY );
    bWinN = mix( bWinN, pWin, pFade );`,
  // the glass in those recesses reflects the sky
  rough: /* glsl */`
    roughnessFactor = mix( roughnessFactor, uRelief.w, pWin );`,
  emissive: /* glsl */`
    totalEmissiveRadiance += bLamp * bWinN * bOn * uNight * 1.25;`,
};

const plain = (windows) => ({
  vertPars: 'attribute vec3 aBld; varying vec3 vBld;', vert: 'vBld = aBld;',
  fragPars: FACADE_PARS,
  color: /* glsl */`
    ${FACADE_GRID}
    vec3 bRoofPhoto = bPhoto( vWp.xz );
    vec3 bIn = bPhoto( vWp.xz - normalize( vWn.xz + vec2( 1e-5, 0.0 ) ) * 2.5 );
    // low roofs take the photo; tall ones lean away from their footprint in the photo, so they get a plain deck
    vec3 bRoofGen = vec3( 0.40, 0.41, 0.42 ) * ( 0.90 + 0.14 * apNoise( vWp.xz * 0.07 ) + 0.06 * apNoise( vWp.xz * 1.9 ) );
    vec3 bRoof = mix( bRoofPhoto, bRoofGen, smoothstep( 28.0, 60.0, bH ) );
    vec3 bPal = mix( vec3( 0.70, 0.68, 0.64 ), vec3( 0.46, 0.45, 0.44 ), fract( bSeed * 5.3 ) );
    bPal = mix( bPal, vec3( 0.52, 0.40, 0.32 ), step( 0.80, fract( bSeed * 11.9 ) ) * 0.75 );
    bPal = mix( bPal, vec3( 0.80, 0.79, 0.76 ), step( 0.70, fract( bSeed * 17.7 ) ) * 0.8 );
    float bInL = dot( bIn, vec3( 0.333 ) );
    vec3 bWallC = mix( bPal, mix( vec3( bInL ), bIn, 0.45 ) * 0.9 + 0.1, 0.30 );
    float bGrain = apNoise( vec2( bFc.x * 1.7, bFc.y * 5.0 ) + vWp.xz * 0.5 ) * 0.5 + apNoise( bFc * 9.0 ) * 0.5;
    bWallC *= ( 0.92 + 0.16 * bGrain ) * 0.86;
    float bWin = 0.0, bWinN = 0.0;
    vec3 bGlass = vec3( 0.03 );
    ${windows ? /* glsl */`
    // three facade types: punched windows, ribbon windows, curtain wall (more likely the taller the building)
    float bStyle = mix( fract( bSeed * 3.91 ), 0.92, smoothstep( 45.0, 110.0, bH ) * 0.75 );
    float bx0 = bStyle > 0.8 ? 0.03 : ( bStyle > 0.5 ? -1.0 : 0.22 );
    float by0 = bStyle > 0.8 ? 0.08 : 0.41, by1 = bStyle > 0.8 ? 0.95 : 0.77;
    bWin = bBox( bF.x, bx0, 1.0 - bx0, bW.x ) * bBox( bF.y, by0, by1, bW.y );
    float bCover = ( bx0 < 0.0 ? 1.0 : 1.0 - 2.0 * bx0 ) * ( by1 - by0 );
    bWin = mix( bWin, bCover, bLod ) * bWall * smoothstep( bH - 0.5, bH - 1.4, bY );
    bWinN = bWin;
    bGlass = mix( vec3( 0.022, 0.032, 0.042 ), vec3( 0.40, 0.40, 0.38 ), mix( step( 0.80, bR ), 0.2, bLod ) * 0.6 );      // some blinds are down
    // glass seen from outside by day is mostly the sky it reflects, not a black hole
    vec3 bRv = reflect( normalize( vWp - cameraPosition ), normalize( vWn ) );
    bGlass = mix( bGlass, apSky( normalize( vec3( bRv.x, abs( bRv.y ) * 0.6 + 0.10, bRv.z ) ) ) * 0.40, 0.70 * ( 1.0 - uNight ) );
    // a thin shadow line under each floor slab
    bWallC *= 1.0 - 0.16 * bBox( bF.y, by1, by1 + 0.07, bW.y ) * ( 1.0 - bLod );` : /* glsl */`
    bWallC = vec3( 0.47, 0.47, 0.46 ) * ( 0.86 + 0.28 * bGrain );
    bRoof = mix( bRoofGen * 1.1, bWallC, 0.5 );`}
    diffuseColor.rgb = mix( bRoof, mix( bWallC, bGlass, bWin ), bWall );`,
  rough: /* glsl */`
    roughnessFactor = mix( 0.90, 0.10, bWin );`,
  emissive: /* glsl */`
    totalEmissiveRadiance += bLamp * bWinN * bOn * uNight * 1.5;`,
});
const PLAIN = { bldg: plain(true), brid: plain(false) };

// Surveyed trees and planting. Shapes and positions are real; the survey gives them either one tiled leaf
// texture or no texture, so the colour is toned here to sit with the trees in the aerial photo.
const HEAD = { vertPars: 'attribute vec3 aBld; varying vec3 vBld;', vert: 'vBld = aBld;', fragPars: 'varying vec3 vBld;' };
const VEG_SHADE = /* glsl */`
    float vH = vBld.y > 0.2 ? clamp( vBld.x / vBld.y, 0.0, 1.0 ) : 0.6;
    vec3 vTint = mix( vec3( 0.78, 0.95, 0.62 ), vec3( 1.12, 1.0, 0.70 ), fract( vBld.z * 7.3 ) );
    float vInner = 0.50 + 0.60 * smoothstep( 0.15, 0.95, vH );          // darker underneath and inside the crown
    float vLeafN = 0.72 + 0.56 * ( apNoise( vWp.xz * 2.6 + vWp.y * 1.7 ) * 0.6 + apNoise( vWp.xz * 9.0 - vWp.y * 6.0 ) * 0.4 );`;
const VEG = {
  textured: { ...HEAD, color: /* glsl */`${VEG_SHADE}
    float vGreen = step( diffuseColor.r * 1.15, diffuseColor.g );           // leaf texels, as against bark
    vec3 vLeaf = mix( vec3( dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) ) ), diffuseColor.rgb, 0.55 ) * vec3( 0.50, 0.58, 0.42 ) * vTint * vInner;
    diffuseColor.rgb = mix( diffuseColor.rgb * 0.55, vLeaf, vGreen );` },
  tree: { ...HEAD, color: /* glsl */`${VEG_SHADE}
    float vTrunk = 1.0 - smoothstep( 0.20, 0.30, vH );
    vec3 vBark = vec3( 0.13, 0.10, 0.075 ) * ( 0.8 + 0.4 * apNoise( vec2( vWp.x + vWp.z, vWp.y * 6.0 ) * 2.0 ) );
    diffuseColor.rgb = mix( vec3( 0.070, 0.125, 0.038 ) * vTint * vInner * vLeafN, vBark, vTrunk );` },
  cover: { ...HEAD, color: /* glsl */`${VEG_SHADE}
    diffuseColor.rgb = vec3( 0.075, 0.130, 0.040 ) * vTint * ( 0.62 + 0.45 * smoothstep( 0.0, 1.0, vH ) ) * vLeafN;` },
};
// Surveyed street furniture: road signs and direction boards keep their photographed faces; poles, signal
// heads and rails come in as plain white or yellow shapes and get a paint finish.
const FRN = {
  textured: { ...HEAD, color: /* glsl */`
    float fLum = dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) );
    float fSat = max( max( diffuseColor.r, diffuseColor.g ), diffuseColor.b ) - min( min( diffuseColor.r, diffuseColor.g ), diffuseColor.b );
    float fFlat = 1.0 - step( 0.15, vBld.y );                 // lying on the road: paint
    // road paint: thermoplastic white or yellow, worn where tyres run
    vec3 fPaint = diffuseColor.rgb * ( 0.66 + 0.12 * apNoise( vWp.xz * 1.3 ) + 0.06 * apNoise( vWp.xz * 11.0 ) );
    // untextured parts of a sign sheet are pure white: make those galvanised steel, leave the sign faces alone
    vec3 fPost = mix( diffuseColor.rgb, vec3( 0.42, 0.43, 0.44 ), step( 0.93, fLum ) * step( fSat, 0.04 ) );
    diffuseColor.rgb = mix( fPost, fPaint, fFlat );`,
    rough: 'roughnessFactor = mix( 0.55, 0.85, fFlat );' },
  plain: { ...HEAD, color: /* glsl */`
    float fSat = max( max( diffuseColor.r, diffuseColor.g ), diffuseColor.b ) - min( min( diffuseColor.r, diffuseColor.g ), diffuseColor.b );
    float fFlat = 1.0 - step( 0.15, vBld.y );
    vec3 fPaint = diffuseColor.rgb * ( 0.66 + 0.12 * apNoise( vWp.xz * 1.3 ) + 0.06 * apNoise( vWp.xz * 11.0 ) );
    vec3 fSteel = vec3( 0.40, 0.41, 0.42 ) * ( 0.92 + 0.16 * apNoise( vec2( vWp.x + vWp.z, vWp.y ) * 7.0 ) );
    diffuseColor.rgb = mix( mix( fSteel, diffuseColor.rgb * 0.85, smoothstep( 0.05, 0.25, fSat ) ), fPaint, fFlat );`,
    rough: 'roughnessFactor = mix( 0.5, 0.85, fFlat );' },
};
// how far away each kind of set is opened, and the largest texture it is ever given
const KIND = {
  bldg: { open: null, cap: Infinity }, brid: { open: null, cap: 2048 },
  // road paint is one flat colour and the leaf texture is a small repeating tile: big sheets of either are
  // wasted memory (the furniture sets alone were holding 1 GB at one crossing)
  veg: { open: 2600, cap: 512, err: 1.5 }, frn: { open: 2000, cap: 512, err: 2 },
};

const USAGE = {
  '業務施設': 'Offices', '商業施設': 'Shops', '宿泊施設': 'Hotel', '商業系複合施設': 'Mixed commercial', '住宅': 'House', '共同住宅': 'Apartments',
  '店舗等併用住宅': 'Shop with home', '店舗等併用共同住宅': 'Shops with apartments', '作業所併用住宅': 'Workshop with home', '官公庁施設': 'Government',
  '文教厚生施設': 'School, hospital or public hall', '運輸倉庫施設': 'Transport or warehouse', '工場': 'Factory', '農林漁業用施設': 'Farm or fishery',
  '供給処理施設': 'Utility plant', '防衛施設': 'Defence', 'その他': 'Other', '不明': 'Not recorded',
};

const _m = new THREE.Matrix4();

// The photo sheets inside a .b3dm tile, as image blobs, in the order its faces first use them.
function b3dmImages(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x6d643362) return null;                                   // "b3dm"
  const glb = 28 + dv.getUint32(12, true) + dv.getUint32(16, true) + dv.getUint32(20, true) + dv.getUint32(24, true);
  if (dv.getUint32(glb, true) !== 0x46546c67) return null;                                 // "glTF"
  const jsonLen = dv.getUint32(glb + 12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, glb + 20, jsonLen)));
  const bin = glb + 20 + jsonLen + 8, order = [];
  for (const mesh of json.meshes || []) for (const p of mesh.primitives || []) {
    const ti = json.materials?.[p.material]?.pbrMetallicRoughness?.baseColorTexture?.index;
    if (ti != null && !order.includes(ti)) order.push(ti);
  }
  return order.map((ti) => {
    const t = json.textures[ti], img = json.images[t.extensions?.EXT_texture_webp?.source ?? t.source];
    const bv = json.bufferViews[img.bufferView];
    return new Blob([new Uint8Array(buf, bin + (bv.byteOffset || 0), bv.byteLength)], { type: img.mimeType || 'image/webp' });
  });
}

export class City {
  // lite: stream the survey's photo-free building sets (a sixth of the download, no photo sheets to decode);
  // reach: how far out a ward's set is opened, metres (null = by height, as the explorer does);
  // turn: optional () => Promise, awaited before each tile is prepared, so the page can meter that work per frame
  constructor({ renderer, camera, manifest, kinds = ['bldg', 'brid', 'veg', 'frn'], errorTarget = 12, errorFalloff = 0, cacheGB = 2.2, texCap = 2048, texNear = 4096, onChange = () => {},
    lite = false, reach = null, parseJobs = 6, downloadJobs = null, turn = null, shadows = true, aniso = 8 }) {
    this.renderer = renderer; this.camera = camera; this.onChange = onChange; this.errorTarget = errorTarget; this.cacheGB = cacheGB;
    this.lite = lite; this.reach = reach; this.parseJobs = parseJobs; this.downloadJobs = downloadJobs; this.turn = turn; this.castShadows = shadows;
    this.texCap = texCap;          // largest texture beyond arm's length
    this.texNear = texNear;        // largest texture within 150 m: this is what decides how street level looks
    this.errorFalloff = errorFalloff;
    this.group = new THREE.Group(); this.group.name = 'city';
    this.draco = new DRACOLoader().setDecoderPath(new URL('../vendor/addons/libs/draco/', import.meta.url).href);
    this.draco.setWorkerLimit(4);
    this.maxAniso = Math.min(aniso, renderer.capabilities.getMaxAnisotropy());
    this.stats = { buildings: 0, tiles: 0, open: 0 };
    this.sets = manifest.sets.filter((s) => kinds.includes(s.kind)).map((s) => {
      const [w, so, e, n] = s.region, box = new THREE.Box3(), v = new THREE.Vector3();
      for (const [la, lo] of [[so, w], [so, e], [n, w], [n, e]]) box.expandByPoint(geoToWorld(la, lo, 0, v));
      box.min.y = -50; box.max.y = 700;
      return { ...s, box, tiles: null };
    });
    this._ray = new THREE.Raycaster(); this._ray.firstHitOnly = true;
    this._size = new THREE.Vector2();
    this._retex = 0; this._retexAt = 0;
    this.keepBases = false;
    this.facades = null;           // the 3D facade builder (facade.js), set by main.js
    this.groundAt = null;          // (x, z) -> { y, zoom }: set by main.js once the ground exists
    this.eyeHeight = 1e9;          // camera height above the ground, set every frame by main.js
  }

  open(set) {
    const t = new TilesRenderer(plateau(this.lite && set.lite ? set.lite : set.url));
    t.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.draco, autoDispose: false }));
    t.registerPlugin({ name: 'TOKYO_FACADES', processTileModel: (scene, tile) => this.prepare(scene, tile, set) });
    t.errorTarget = this.errorTarget;
    t.autoDisableRendererCulling = false;                     // the shadow cameras cull for themselves
    // every set shares one cache; the stock 0.4 GB holds about 70 photo-textured tiles, far too few for a city view
    const GB = 2 ** 30, c = t.lruCache;
    c.maxBytesSize = this.cacheGB * GB; c.minBytesSize = this.cacheGB * 0.8 * GB; c.maxSize = 14000; c.minSize = 10000;
    t.parseQueue.maxJobs = this.parseJobs;
    if (this.downloadJobs) { if ('maxJobsPerOrigin' in t.downloadQueue) t.downloadQueue.maxJobsPerOrigin = this.downloadJobs; else t.downloadQueue.maxJobs = this.downloadJobs; }
    ECEF_TO_WORLD.decompose(t.group.position, t.group.quaternion, t.group.scale);
    t.setCamera(this.camera);
    t.addEventListener('tile-visibility-change', ({ scene, visible }) => {
      const n = scene?.userData.buildings || 0;
      this.stats.buildings += visible ? n : -n; this.stats.tiles += visible ? 1 : -1;
      this.onChange();
    });
    t.addEventListener('load-model', ({ scene, tile }) => {
      if (tile.engineData) tile.engineData.metadata = null;
      scene.batchTable = null; scene.featureTable = null;
    });
    t.addEventListener('dispose-model', ({ scene }) => {
      if (scene) this.facades?.dropScene(scene);
      const info = scene?.userData.tex;
      if (info) { info.dead = true; for (const e of info.entries) e.tex.dispose(); }       // resized copies are ours to free
    });
    t.addEventListener('load-error', (e) => console.warn('tiles', set.id, e.error?.message || e.error));
    this.group.add(t.group);
    set.tiles = t; this.stats.open++;
  }

  close(set) {
    this.group.remove(set.tiles.group);
    set.tiles.dispose(); set.tiles = null; this.stats.open--;
    this.onChange();
  }

  // runs once per tile, before it is first shown
  async prepare(scene, tile, set) {
    if (this.turn) await this.turn();
    scene.updateMatrixWorld(true);                 // no parent yet: world = tile transform x node transforms
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const count = Math.max(scene.batchTable?.count || 1, 1);
    const lo = new Float32Array(count).fill(Infinity), hi = new Float32Array(count).fill(-Infinity);
    const x0 = new Float32Array(count).fill(Infinity), x1 = new Float32Array(count).fill(-Infinity);
    const z0 = new Float32Array(count).fill(Infinity), z1 = new Float32Array(count).fill(-Infinity);
    const work = [];
    for (const o of meshes) {
      const P = o.geometry.attributes.position, B = o.geometry.attributes._batchid, n = P.count;
      const e = _m.multiplyMatrices(ECEF_TO_WORLD, o.matrixWorld).elements;
      const wy = new Float32Array(n), ids = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
        const id = B ? Math.min(B.getX(i), count - 1) : 0;
        wy[i] = Y; ids[i] = id;
        if (Y < lo[id]) lo[id] = Y; if (Y > hi[id]) hi[id] = Y;
        if (X < x0[id]) x0[id] = X; if (X > x1[id]) x1[id] = X;
        if (Z < z0[id]) z0[id] = Z; if (Z > z1[id]) z1[id] = Z;
      }
      work.push({ o, wy, ids, n });
    }
    const seed = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      // from the footprint centre, so a building keeps its look when a more detailed tile replaces this one
      const s = Math.sin(Math.round((x0[k] + x1[k]) / 2) * 12.9898 + Math.round((z0[k] + z1[k]) / 2) * 78.233) * 43758.5453;
      seed[k] = s - Math.floor(s);
    }
    // Photo sheets are up to 4096 px (86 MB each once on the graphics card) and a skyline view holds over a
    // thousand tiles, so each tile starts at the size its distance calls for. retexture() resizes it later.
    // A tile with children is usually only a stepping stone to them and never shown close up, so it starts
    // small whatever its distance; retexture() enlarges it if it does end up on screen.
    const cap = Math.min(this.wantCap(tile.traversal?.distanceFromCamera ?? 1e9, set.kind), tile.children?.length ? 512 : Infinity);
    const entries = [], seen = new Map(), jobs = [];
    for (const { o } of work) {
      const map = o.material.map, img = map?.image;
      if (!img) continue;
      let e = seen.get(map);
      if (!e) {
        e = { tex: map, w: img.width, h: img.height, meshes: [] }; seen.set(map, e); entries.push(e);
        if (Math.max(e.w, e.h) > cap) {
          const k = cap / Math.max(e.w, e.h);
          jobs.push(createImageBitmap(img, { resizeWidth: Math.max(Math.round(e.w * k), 1), resizeHeight: Math.max(Math.round(e.h * k), 1), resizeQuality: 'high' })
            .then((small) => { img.close?.(); map.image = small; }).catch(() => {}));
        }
      }
      e.meshes.push(o);
    }
    if (jobs.length) await Promise.all(jobs);
    if (entries.length) {
      scene.userData.tex = { url: new URL(tile.content.uri, tile.internal.basePath + '/').href, cap, kind: set.kind, entries, max: Math.max(...entries.map((e) => Math.max(e.w, e.h))), busy: false, dead: false, fails: 0 };
    }
    for (const { o, wy, ids, n } of work) {
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const id = ids[i]; a[i * 3] = wy[i] - lo[id]; a[i * 3 + 1] = hi[id] - lo[id]; a[i * 3 + 2] = seed[id]; }
      o.geometry.setAttribute('aBld', new THREE.BufferAttribute(a, 3));
      const old = o.material, map = old.map || null;
      if (map) {
        map.anisotropy = this.maxAniso; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
        map.onUpdate = () => { map.image?.close?.(); map.onUpdate = null; };       // the decoded copy is not needed once it is on the GPU
      }
      if (set.kind === 'veg') {
        const part = map ? 'textured' : (set.id.includes('PlantCover') ? 'cover' : 'tree');
        o.material = patch(new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.92, metalness: 0 }), 'veg-' + part, VEG[part]);
      } else if (set.kind === 'frn') {
        const m = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : old.color, roughness: 0.5, metalness: 0, vertexColors: !map && !!old.vertexColors && !!o.geometry.attributes.color });
        o.material = patch(m, map ? 'frn-t' : 'frn-p', map ? FRN.textured : FRN.plain);
      } else if (map) {
        o.material = patch(new THREE.MeshStandardMaterial({ map, roughness: 0.86, metalness: 0 }), 'bt', TEXTURED);
      } else {
        o.material = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), 'bp-' + set.kind, PLAIN[set.kind] || PLAIN.brid);
      }
      old.dispose();
      o.castShadow = this.castShadows; o.receiveShadow = true;
    }
    scene.userData.buildings = set.kind === 'bldg' ? count : 0;
    scene.userData.set = set.id;
    // what the facade builder needs to know about each building: where it stands, how tall, how many floors, what for
    if (set.kind === 'bldg') {
      const bt0 = scene.batchTable, col = (key) => { try { const a = bt0?.getPropertyArray(key); return a && a.length === count ? a : null; } catch { return null; } };
      const use = col('bldg:usage'), fl = col('bldg:storeysAboveGround');
      const cls = new Uint8Array(count), floors = new Uint8Array(count);
      for (let k = 0; k < count; k++) { cls[k] = use ? usageClass(use[k]) : 0; const f = fl ? fl[k] : 0; floors[k] = f > 0 && f < 120 ? f : 0; }
      scene.userData.bld = { n: count, x0, x1, z0, z1, lo, hi, seed, cls, floors };
    }
    // Road markings arrive in the street-furniture sets as flat painted shapes at their surveyed height,
    // which is a few centimetres off this scene's ground model. Remember them so they can be laid on it.
    if (set.kind === 'frn') {
      const flat = [];
      for (const { o, ids, n } of work) {
        const idx = [];
        for (let i = 0; i < n; i++) { const id = ids[i]; if (hi[id] - lo[id] < 0.15 && Math.max(x1[id] - x0[id], z1[id] - z0[id]) > 0.3) idx.push(i); }
        if (idx.length) flat.push({ o, idx: Uint32Array.from(idx), home: null });
      }
      if (flat.length) { scene.userData.flat = { parts: flat, zoom: -1 }; this.drape(scene); }
    }
    if (this.keepBases && set.kind === 'bldg') {             // for the height check in main.js (__tokyo.calib)
      const b = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) { b[k * 3] = (x0[k] + x1[k]) / 2; b[k * 3 + 1] = lo[k]; b[k * 3 + 2] = (z0[k] + z1[k]) / 2; }
      scene.userData.bases = b;
    }
    // Keep the few survey fields the info card shows. The full record (63 fields per building, plus the
    // whole tile file it points into) is dropped in the load-model handler: across a skyline it is gigabytes.
    const bt = scene.batchTable;
    if (bt) {
      const col = (k) => { try { const a = bt.getPropertyArray(k); return a && a.length === bt.count ? a : null; } catch { return null; } };
      const pick = (k) => { const a = col(k); return a ? Array.from(a) : null; };
      scene.userData.info = {
        name: set.kind === 'veg' ? null : pick('gml:name'),          // tree "names" are survey serial numbers
        height: pick('bldg:measuredHeight') || pick('veg:height') || pick('veg:averageHeight'),
        floors: pick('bldg:storeysAboveGround'), basements: pick('bldg:storeysBelowGround'),
        usage: pick('bldg:usage'), address: pick('bldg:address'), id: pick('gml_id'), kind: pick('feature_type'),
      };
    }
  }

  update() {
    const cam = this.camera.position, alt = Math.max(cam.y, 0);
    const openD = this.reach ?? Math.min(7000 + alt * 5, 45000), closeD = openD * 1.5 + 2000;
    // detail is judged against a fixed 1000 px tall screen, so a big monitor does not quadruple the download
    this.renderer.getSize(this._size);
    const vw = (1000 * this._size.x) / Math.max(this._size.y, 1);
    const low = 1 - THREE.MathUtils.smoothstep(this.eyeHeight, 25, 160);       // 1 at street level, 0 above the roofs
    for (const s of this.sets) {
      const d = s.box.distanceToPoint(cam), near = KIND[s.kind]?.open;        // trees and furniture only matter close by
      // ... and low down: from the air their thousands of small tiles would only hold up the buildings
      const want = near ? d < near && this.eyeHeight < 420 : d < openD;
      const drop = near ? d > near * 1.6 || this.eyeHeight > 700 : d > closeD;
      if (!s.tiles && want) this.open(s);
      else if (s.tiles && drop) { this.close(s); continue; }
      if (s.tiles) {
        s.tiles.errorTarget = this.errorTarget * (KIND[s.kind]?.err ?? 1);
        // Small buildings drop out with distance, where haze hides them. Down among the buildings the first row
        // hides nearly everything behind it, so the drop-off is made much steeper: without this a street view
        // still streams every building out to the horizon (57,000 of them from one Ginza crossing).
        s.tiles.errorFalloff = this.errorFalloff + (70 - this.errorFalloff) * low;
        s.tiles.errorFalloffDensity = 2e-4 + 8e-4 * low;
        s.tiles.setResolution(this.camera, vw, 1000);
        s.tiles.update();
      }
    }
    const now = performance.now();
    if (now - this._retexAt > 350) { this._retexAt = now; this.retexture(); this.redrape(); }
  }

  /* ---------------------------------------------------------------- photo brightness, for reading windows */
  // The facade builder looks for each wall's window grid in its photo. The picture on the graphics card cannot
  // be read back cheaply, so the tile is fetched again (it is in the browser's cache) and each photo sheet is
  // kept as a brightness map, 2048 px at most. info.luma: undefined = not asked, null = failed, else one per sheet.
  luma(scene) {
    const info = scene.userData.tex;
    if (!info) return null;
    if (!info.lumaP) {
      info.lumaP = (async () => {
        const blobs = b3dmImages(await (await fetch(info.url)).arrayBuffer());
        if (!blobs || blobs.length !== info.entries.length) return null;
        const out = [];
        for (let i = 0; i < blobs.length; i++) {
          const en = info.entries[i], k = Math.min(1, (this.lumaCap || 2048) / Math.max(en.w, en.h));
          const bmp = await createImageBitmap(blobs[i], { premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeWidth: Math.max(1, Math.round(en.w * k)), resizeHeight: Math.max(1, Math.round(en.h * k)), resizeQuality: 'medium' });
          const cv = new OffscreenCanvas(bmp.width, bmp.height), cx = cv.getContext('2d', { willReadFrequently: true });
          cx.drawImage(bmp, 0, 0); bmp.close();
          const d = cx.getImageData(0, 0, cv.width, cv.height).data, L = new Uint8Array(cv.width * cv.height);
          for (let p = 0, q = 0; p < L.length; p++, q += 4) L[p] = (d[q] * 77 + d[q + 1] * 150 + d[q + 2] * 29) >> 8;
          out.push({ w: cv.width, h: cv.height, data: L });
        }
        return out;
      })().catch(() => null).then((r) => { info.luma = info.dead ? null : r; return info.luma; });
    }
    return info.lumaP;
  }

  /* ---------------------------------------------------------------- road markings on the ground */
  // Move each flat marking vertex to 4 cm above the ground model under it. Called when the tile loads and
  // again when finer ground data has arrived (markings laid on the coarse 10 m model sit visibly wrong).
  drape(scene) {
    const f = scene.userData.flat;
    if (!f || !this.groundAt) return;
    scene.updateMatrixWorld(true);
    let zoom = 99;
    for (const part of f.parts) {
      const P = part.o.geometry.attributes.position;
      // world = ECEF_TO_WORLD x tile transform when the scene is not in the tree yet, the full chain once it is
      const e = (scene.parent ? _m.copy(part.o.matrixWorld) : _m.multiplyMatrices(ECEF_TO_WORLD, part.o.matrixWorld)).elements;
      if (!part.home) { part.home = new Float32Array(part.idx.length * 3); part.idx.forEach((i, k) => { part.home[k * 3] = P.getX(i); part.home[k * 3 + 1] = P.getY(i); part.home[k * 3 + 2] = P.getZ(i); }); }
      const ux = e[1], uy = e[5], uz = e[9];                   // local direction that is "up" in the world
      for (let k = 0; k < part.idx.length; k++) {
        const x = part.home[k * 3], y = part.home[k * 3 + 1], z = part.home[k * 3 + 2];
        const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
        const g = this.groundAt(X, Z), d = g.y + 0.04 - Y;
        if (g.zoom < zoom) zoom = g.zoom;
        P.setXYZ(part.idx[k], x + ux * d, y + uy * d, z + uz * d);
      }
      P.needsUpdate = true;
    }
    f.zoom = zoom;
  }

  redrape() {
    let paint = 0;
    for (const s of this.sets) {
      if (!s.tiles || s.kind !== 'frn') continue;
      for (const tile of s.tiles.visibleTiles) {
        const scene = tile.engineData?.scene, f = scene?.userData.flat;
        if (!f) continue;
        if (tile.traversal.distanceFromCamera < 260) paint = 1;
        if (f.zoom < 15 && tile.traversal.distanceFromCamera < 700) this.drape(scene);
      }
    }
    ATMO.uniforms.uPaint.value = paint;
  }

  /* ---------------------------------------------------------------- texture size by distance */
  // The survey's photo sheets are 8 to 20 cm per pixel at full size. That only shows within a block or two,
  // so full size is kept for the tiles around the camera and the rest step down with distance.
  wantCap(d, kind = 'bldg') {
    const far = d < 320 ? Math.min(this.texCap, 2048) : d < 1000 ? 1024 : d < 2600 ? 512 : 256;
    return Math.min(d < 150 ? this.texNear : far, KIND[kind]?.cap ?? Infinity);
  }

  retexture() {
    if (this._retex >= 3) return;
    const todo = [];
    for (const s of this.sets) {
      if (!s.tiles) continue;
      for (const tile of s.tiles.visibleTiles) {
        const scene = tile.engineData?.scene, info = scene?.userData.tex;
        if (!info || info.busy || info.fails > 2) continue;
        const d = tile.traversal.distanceFromCamera;
        const want = this.wantCap(d, info.kind), need = Math.min(want, info.max), have = Math.min(info.cap, info.max);
        // grow as soon as it is too small; shrink only once the camera is well clear (judged at 0.55 of the
        // distance), so stepping back and forth across a threshold does not reload a 300 MB sheet each time
        const loose = Math.min(this.wantCap(d * 0.55, info.kind), info.max);
        if (need > have) todo.push({ s, tile, scene, info, d, cap: want });
        else if (loose * 4 <= have) todo.push({ s, tile, scene, info, d: d + 1e6, cap: this.wantCap(d * 0.55, info.kind) });
      }
    }
    todo.sort((a, b) => a.d - b.d);
    for (const j of todo) { if (this._retex >= 3) break; this.resize(j); }
  }

  async resize({ s, tile, scene, info, cap }) {
    info.busy = true; this._retex++;
    try {
      const blobs = b3dmImages(await (await fetch(info.url)).arrayBuffer());        // from the browser's cache
      if (!blobs || blobs.length !== info.entries.length) { info.fails = 9; return; }
      const made = await Promise.all(info.entries.map((e, i) => {
        const k = Math.min(1, cap / Math.max(e.w, e.h));
        return createImageBitmap(blobs[i], k < 1
          ? { premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeWidth: Math.max(Math.round(e.w * k), 1), resizeHeight: Math.max(Math.round(e.h * k), 1), resizeQuality: 'high' }
          : { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      }));
      if (info.dead) { made.forEach((b) => b.close?.()); return; }
      let delta = 0;
      info.entries.forEach((e, i) => {
        const old = e.tex, t = new THREE.Texture(made[i]);
        t.flipY = old.flipY; t.colorSpace = old.colorSpace; t.wrapS = old.wrapS; t.wrapT = old.wrapT;
        t.minFilter = old.minFilter; t.magFilter = old.magFilter; t.anisotropy = old.anisotropy; t.generateMipmaps = old.generateMipmaps;
        t.needsUpdate = true;
        t.onUpdate = () => { t.image?.close?.(); t.onUpdate = null; };
        delta += (made[i].width * made[i].height - (old.userData.px || Math.min(e.w, info.cap) * Math.min(e.h, info.cap))) * 4 * 1.34;
        t.userData.px = made[i].width * made[i].height;
        for (const m of e.meshes) m.material.map = t;
        this.facades?.retexture(old, t);
        old.dispose(); e.tex = t;
      });
      info.cap = cap;
      const lru = s.tiles?.lruCache;
      if (lru?.getMemoryUsage) lru.setMemoryUsage(tile, Math.max(lru.getMemoryUsage(tile) + delta, 0));
    } catch (e) { info.fails++; } finally { info.busy = false; this._retex--; }
  }

  // The library starts queued downloads on the next display frame. When frames are stepped by hand
  // (hidden window, test runs) there is no display frame, so run whatever it has waiting.
  pushQueues() {
    for (const [handle, cb] of [...Scheduler.pending]) { Scheduler.cancelAnimationFrame(handle); cb(); }
  }

  // how many tiles are still on their way in (a set whose list has not arrived counts as a few)
  get pending() {
    let n = 0;
    for (const s of this.sets) {
      if (!s.tiles) continue;
      const st = s.tiles.stats;
      n += s.tiles.root ? st.queued + st.downloading + st.parsing : 4;
    }
    return n;
  }

  // true while anything is still on its way in
  get loading() {
    for (const s of this.sets) {
      if (!s.tiles) continue;
      const st = s.tiles.stats;
      if (!s.tiles.root || st.queued + st.downloading + st.parsing > 0) return true;
    }
    return this._retex > 0;
  }

  raycast(origin, dir, far = 1e5) {
    this._ray.set(origin, dir); this._ray.far = far;
    let best = null;
    for (const s of this.sets) {
      if (!s.tiles) continue;
      const hits = [];
      s.tiles.raycast(this._ray, hits);
      for (const h of hits) if (!best || h.distance < best.distance) best = h;
    }
    return best;
  }

  // what the survey records about the building under a hit
  describe(hit) {
    let o = hit.object, info = null;
    while (o) { if (o.userData.info) { info = o.userData.info; break; } o = o.parent; }
    if (!info) return null;
    const B = hit.object.geometry.attributes._batchid;
    const id = B && hit.face ? B.getX(hit.face.a) : 0;
    const at = (a) => (a && a[id] != null ? a[id] : null);
    const usage = at(info.usage), h = at(info.height), fl = at(info.floors), bs = at(info.basements);
    const A = hit.object.geometry.attributes.aBld;
    return {
      name: at(info.name),
      height: typeof h === 'number' && h > 0 && h < 1000 ? h : (A ? A.getY(hit.face.a) : null),
      floors: fl > 0 && fl < 200 ? fl : null,
      basements: bs > 0 && bs < 50 ? bs : null,
      usage: usage ? (USAGE[usage] || usage) : null,
      address: at(info.address),
      id: at(info.id), kind: at(info.kind),
    };
  }
}
