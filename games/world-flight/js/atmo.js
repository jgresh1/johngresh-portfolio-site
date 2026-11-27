// atmo.js — sun position for any place on Earth, sky colours through the day, haze, sky dome, sun shadows,
// and the shader patch every material in the scene goes through.
import * as THREE from 'three';

const D2R = Math.PI / 180;

export const ATMO = {
  hour: 14.5,                 // the local hour by the sun's own clock (noon = the sun due south or north), 0..24
  dayOfYear: 172,             // day of the year, 1..365
  lat: 35.55, lon: 139.78,    // where the sun is being looked at from (the page keeps these at the aircraft)
  sunDir: new THREE.Vector3(0, 1, 0),
  sunEl: 0, sunAz: 0,
  sunLight: 0,                // direct light strength (0 below the horizon)
  night: 0,                   // 0 day .. 1 full night
  uniforms: {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 0.95, 0.86) },
    uZenith: { value: new THREE.Color(0.11, 0.26, 0.66) },
    uHorizon: { value: new THREE.Color(0.62, 0.74, 0.9) },
    uHaze: { value: 0.55e-4 },          // extinction at sea level, 1/m
    uHazeH: { value: 1400 },            // haze scale height, m
    uNight: { value: 0 },
    uTime: { value: 0 },
    uBake: { value: 0 },                // 1 while the ground photo is being copied into the roof lookup
    uPaint: { value: 0 },               // 1 where surveyed road markings are drawn, so the photo's blurred copy is faded
    uRelief: { value: new THREE.Vector4(1, 0.11, 0.22, 0.4) },   // window relief on photo walls: strength, how much darker than the wall counts (from, to), glass roughness
    tGroundA: { value: null }, uGroundA: { value: new THREE.Vector4(0, 0, 1, 0) },
    tGroundB: { value: null }, uGroundB: { value: new THREE.Vector4(0, 0, 1, 0) },
    // the airfield ground map (fly/airfield.js): the texture, world xz -> its u and v, its size and origin in metres, the runway's length
    tField: { value: null }, uFieldA: { value: new THREE.Vector3() }, uFieldB: { value: new THREE.Vector3() }, uFieldL: { value: new THREE.Vector4(1, 1, 0, 0) }, uFieldOn: { value: 0 }, uFieldRun: { value: 0 },
    // the clouds (clouds.js): this frame's picture of them (light sent and let through; where they start and end),
    // one over the size of the screen in pixels, and whether there is a picture at all
    tCloud: { value: null }, tCloudZ: { value: null }, uCloudInv: { value: new THREE.Vector2(1, 1) }, uCloudOn: { value: 0 },
    // their shadow: the picture, its centre and one over its width, the layers' base and top heights, the light let through past its edge
    tCloudSh: { value: null }, uCloudShA: { value: new THREE.Vector3() }, uCloudShB: { value: new THREE.Vector4(900, 1700, 3600, 4300) }, uShadeFar: { value: new THREE.Vector2(1, 1) }, uShadeOn: { value: 0 },
    uLift: { value: 0 },                // metres above the sea of the ground the weather sits on: haze, fog and cloud bases are measured up from it
    uCamAlt: { value: 0 },              // the camera's height above the sea (the scene is flat; the Earth under it is not)
    uFog: { value: new THREE.Vector3(0, 120, 0) },      // fog and falling rain or snow: what a metre stops at the ground (1/m), the height it thins over
    uGrey: { value: 0 },                // how closed the sky is over the camera, 0 clear .. 1 overcast
    uEnvSky: { value: 0 },              // 1 while the sky is drawn for the reflection map (no screen picture of the clouds to read)
    uEnvCloud: { value: new THREE.Vector3() },          // low, middle and high cover, for that map
    uFlash: { value: 0 },               // lightning: everything lit for an instant
    uWet: { value: 0 }, uSnow: { value: 0 },            // rain on the ground, snow lying
    uSea: { value: 0.25 },              // how rough the wind makes the water, 0 calm .. 1 a gale
    uShift: { value: new THREE.Vector2() },             // metres the page's origin has moved so far (east, south), so patterns tied to the ground stay put when it moves
  },
  // the clear-sky values for the hour (setTime); the weather greys and dims them into the uniforms (weather.js)
  clear: { zen: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), haze: 0.55e-4, light: 0 },
  sunCut: 1,                            // how much of the sun the cloud over the camera lets through (weather.js)
};
const U = ATMO.uniforms;

/* ------------------------------------------------------------------ sun */
export function sunAt(hour, dayOfYear) {
  const decl = 23.44 * D2R * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const B = (2 * Math.PI * (dayOfYear - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);       // minutes
  const solar = hour + eot / 60;
  const H = 15 * (solar - 12) * D2R, lat = ATMO.lat * D2R;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(sinEl);
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;   // from north, clockwise
  return { el: el / D2R, az: ((az / D2R) % 360 + 360) % 360 };
}

const KEYS = [   // sun elevation (deg) -> zenith, horizon, sun colour, direct light, haze
  { el: -18, zen: [0.0035, 0.0055, 0.013], hor: [0.030, 0.024, 0.022], sun: [0, 0, 0], light: 0, haze: 0.50 },
  { el: -8, zen: [0.012, 0.022, 0.060], hor: [0.110, 0.070, 0.062], sun: [0.30, 0.10, 0.03], light: 0, haze: 0.55 },
  { el: -3, zen: [0.040, 0.085, 0.230], hor: [0.520, 0.300, 0.190], sun: [1.00, 0.36, 0.10], light: 0, haze: 0.70 },
  { el: 0, zen: [0.075, 0.150, 0.380], hor: [0.800, 0.500, 0.300], sun: [1.00, 0.44, 0.14], light: 0.10, haze: 0.85 },
  { el: 4, zen: [0.095, 0.200, 0.480], hor: [0.820, 0.640, 0.470], sun: [1.00, 0.60, 0.30], light: 0.55, haze: 0.90 },
  { el: 12, zen: [0.105, 0.240, 0.580], hor: [0.700, 0.720, 0.760], sun: [1.00, 0.82, 0.60], light: 0.85, haze: 0.80 },
  { el: 28, zen: [0.110, 0.260, 0.650], hor: [0.620, 0.730, 0.880], sun: [1.00, 0.94, 0.84], light: 1.00, haze: 0.62 },
  { el: 75, zen: [0.105, 0.250, 0.660], hor: [0.600, 0.720, 0.880], sun: [1.00, 0.96, 0.90], light: 1.00, haze: 0.55 },
];
const lerp = (a, b, t) => a + (b - a) * t;

export function setTime(hour, dayOfYear = ATMO.dayOfYear) {
  ATMO.hour = hour; ATMO.dayOfYear = dayOfYear;
  const { el, az } = sunAt(hour, dayOfYear);
  ATMO.sunEl = el; ATMO.sunAz = az;
  // below the horizon the light keeps coming from where the sun went down (afterglow), the strength goes to zero
  const e = Math.max(el, 1.5) * D2R, a = az * D2R;
  ATMO.sunDir.set(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).normalize();
  const eg = el * D2R;
  U.uSunDir.value.set(Math.cos(eg) * Math.sin(a), Math.sin(eg), -Math.cos(eg) * Math.cos(a)).normalize();
  let i = 0;
  while (i < KEYS.length - 2 && el > KEYS[i + 1].el) i++;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  let t = THREE.MathUtils.clamp((el - k0.el) / (k1.el - k0.el), 0, 1);
  t = t * t * (3 - 2 * t);
  const mix3 = (p, q) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
  U.uZenith.value.setRGB(...mix3(k0.zen, k1.zen));
  U.uHorizon.value.setRGB(...mix3(k0.hor, k1.hor));
  U.uSunCol.value.setRGB(...mix3(k0.sun, k1.sun));
  U.uHaze.value = 0.55e-4 * lerp(k0.haze, k1.haze, t);
  ATMO.sunLight = lerp(k0.light, k1.light, t);
  ATMO.clear.zen.copy(U.uZenith.value); ATMO.clear.hor.copy(U.uHorizon.value); ATMO.clear.sun.copy(U.uSunCol.value);
  ATMO.clear.haze = U.uHaze.value; ATMO.clear.light = ATMO.sunLight;
  ATMO.night = THREE.MathUtils.clamp((2 - el) / 9, 0, 1);       // lights come on from just before sunset to -7 deg
  U.uNight.value = ATMO.night;
}

/* ------------------------------------------------------------------ shared GLSL */
export const ATMO_GLSL = /* glsl */`
uniform vec3 uSunDir, uSunCol, uZenith, uHorizon;
uniform float uHaze, uHazeH, uNight, uTime, uBake, uPaint, uLift;
uniform vec4 uRelief;
uniform sampler2D tCloud, tCloudZ, tCloudSh;
uniform vec2 uCloudInv, uShadeFar;
uniform vec3 uCloudShA, uFog, uEnvCloud;
uniform vec4 uCloudShB;
uniform float uCloudOn, uShadeOn, uCamAlt, uGrey, uEnvSky, uFlash, uWet, uSnow, uSea;
float apHash( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 33.33 ); return fract( ( p.x + p.y ) * p.x ); }
float apHash3( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
float apNoise( vec2 x ) {
  vec2 i = floor( x ), w = fract( x ); w = w * w * ( 3.0 - 2.0 * w );
  return mix( mix( apHash( i ), apHash( i + vec2( 1.0, 0.0 ) ), w.x ), mix( apHash( i + vec2( 0.0, 1.0 ) ), apHash( i + vec2( 1.0, 1.0 ) ), w.x ), w.y );
}
float apFbm( vec2 p ) {
  float a = 0.5, s = 0.0;
  for ( int i = 0; i < 4; i ++ ) { s += a * apNoise( p ); p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 7.3; a *= 0.5; }
  return s;
}
vec3 apSky( vec3 d ) {
  float h = max( d.y, 0.0 );
  float t = pow( 1.0 - h, 4.5 );
  vec3 col = mix( uZenith, uHorizon, t );
  float mu = max( dot( d, uSunDir ), 0.0 );
  col += uSunCol * ( 0.07 * pow( mu, 8.0 ) + 0.45 * pow( mu, 64.0 ) ) * ( 0.35 + 0.65 * t ) * ( 1.0 - uGrey );      // no glow round a sun that is behind cloud
  return col;
}
// height above the sea of a point in the scene: the scene is a flat sheet touching the Earth at Tokyo Station,
// and the Earth falls away under it by the distance squared over twice its radius
float apAlt( vec3 wp ) { return wp.y + dot( wp.xz, wp.xz ) * 7.848e-8; }
// how much light is lost in a layer of haze between the camera and a point dist away at height a1:
// sig = what a metre stops at the ground, H = the height it thins over
float apLayer( float sig, float H, float dist, float a1 ) {
  // the air is as thick as at the ground up to the level the weather sits on (uLift), and thins above it: the mean
  // thickness along the line of sight, between the camera's height and the point's
  float x0 = uCamAlt - uLift, x1 = a1 - uLift, lo = min( x0, x1 ), hi = max( x0, x1 ), span = hi - lo;
  float mean = span > 1e-3 * H ? ( min( hi, 0.0 ) - min( lo, 0.0 ) + H * ( exp( - max( lo, 0.0 ) / H ) - exp( - max( hi, 0.0 ) / H ) ) ) / span : exp( - max( x0, 0.0 ) / H );
  return sig * dist * mean;
}
// The clouds between the camera and a point dist away. The clouds' picture says how much light they send and let
// through along this line of sight in all, and where along it they start and end; the point takes the share that
// lies in front of it. So a tower in front of a cloud is untouched, one inside it fades, the ground under it is veiled.
vec3 apClouded( vec3 col, float dist ) {
  if ( uCloudOn < 0.5 ) return col;
  vec2 suv = gl_FragCoord.xy * uCloudInv;
  vec4 c = texture2D( tCloud, suv ), z = texture2D( tCloudZ, suv );
  if ( z.b < 0.003 ) return col;
  float zA = z.r / z.b * 1000.0, zM = z.g / z.b * 1000.0;
  if ( dist <= zA ) return col;
  // The cloud is taken as even from where it starts. Its whole depth of dimming and the middle of what is seen of
  // it give how fast it thickens: half way through a thin veil, one clear-sight length into a thick one.
  float T = max( c.a, 1e-4 ), tauT = - log( T );
  float g = ( 1.0 - ( 1.0 + tauT ) * T ) / max( 1.0 - T, 1e-4 );
  float Tf = exp( - min( tauT, g * ( dist - zA ) / max( zM - zA, 1.0 ) ) );
  return col * Tf + c.rgb * ( ( 1.0 - Tf ) / max( 1.0 - T, 1e-4 ) );
}
// aerial perspective: haze thins with height, takes the colour of the sky near the horizon in that direction;
// fog and falling rain are a second, shallower layer; then the clouds
vec3 apHazed( vec3 col, vec3 wp ) {
  vec3 ray = wp - cameraPosition;
  float dist = length( ray );
  ray /= max( dist, 1e-3 );
  col *= 1.0 + uFlash;
  float a1 = apAlt( wp );
  float od = apLayer( uHaze, uHazeH, dist, a1 ) + apLayer( uFog.x, uFog.y, dist, a1 );
  float f = 1.0 - exp( - od );
  vec3 air = apSky( normalize( vec3( ray.x, abs( ray.y ) * 0.3 + 0.02, ray.z ) ) );
  return apClouded( mix( col, air * 0.92, f ), dist );
}
// how much of the sun reaches a point through the clouds above it
float apCloudShade( vec3 wp ) {
  if ( uShadeOn < 0.5 || uSunDir.y < 0.02 ) return 1.0;
  float alt = apAlt( wp );
  vec2 q = wp.xz - uSunDir.xz * ( max( alt, 0.0 ) / max( uSunDir.y, 0.06 ) );
  vec2 uv = ( q - uCloudShA.xy ) * uCloudShA.z + 0.5;
  vec2 s = texture2D( tCloudSh, uv ).rg;
  s = mix( s, uShadeFar, smoothstep( 0.42, 0.5, max( abs( uv.x - 0.5 ), abs( uv.y - 0.5 ) ) ) );
  // a point inside or above a layer is not under it
  float lo = mix( s.r, 1.0, smoothstep( uCloudShB.x, uCloudShB.y, alt ) );
  float mi = mix( s.g, 1.0, smoothstep( uCloudShB.z, uCloudShB.w, alt ) );
  return lo * mi;
}
`;

// Rain and snow on whatever stands outside. Wet: darker, and shiny where the water lies (level surfaces, most in the
// low places). Snow: lies on what is level, not on walls. Goes in after a surface has set its own colour and roughness.
export const WEATHERED = /* glsl */`
    if ( uWet + uSnow > 0.001 ) {
      float wUp = clamp( vWn.y, 0.0, 1.0 );
      float wWet = uWet * ( 0.35 + 0.65 * wUp ) * WX_DRY;
      diffuseColor.rgb *= 1.0 - 0.27 * wWet;
      float wPud = smoothstep( 0.42, 0.74, apNoise( vWp.xz * 0.21 ) * 0.6 + apNoise( vWp.xz * 0.9 ) * 0.4 );
      roughnessFactor = mix( roughnessFactor, mix( 0.40, 0.07, wPud * wUp ), wWet * 0.88 );
      float wSn = uSnow * smoothstep( 0.5, 0.82, wUp ) * smoothstep( 0.15, 0.55, uSnow * 0.9 + apNoise( vWp.xz * 0.07 ) * 0.5 + apNoise( vWp.xz * 0.6 ) * 0.2 ) * WX_DRY;
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.80, 0.83, 0.88 ) * ( 0.94 + 0.06 * apNoise( vWp.xz * 1.7 ) ), wSn * WX_SNOW );
      roughnessFactor = mix( roughnessFactor, 0.86, wSn );
    }`;
const INDOORS = /^(jet-|hg-|pilot)/;         // the aircraft's own surfaces and the hangar's are not rained on

/* ------------------------------------------------------------------ material patch */
// Every material is a stock three material plus named pieces of GLSL. `parts` may hold:
//   vertPars, vert (after project_vertex), fragPars, color (after map_fragment), rough (after roughnessmap_fragment),
//   normal (after normal_fragment_maps), emissive (after emissivemap_fragment), final (before tone mapping)
export function patch(material, key, parts = {}, extraUniforms = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, extraUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;\n${parts.vertPars || ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vWn = normalize( mat3( modelMatrix ) * objectNormal );
        ${parts.vert || ''}`);
    let fs = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define AP_PATCHED\nvarying vec3 vWp;\nvarying vec3 vWn;\n${ATMO_GLSL}\n${parts.fragPars || ''}`)
      .replace('#include <tonemapping_fragment>', `${parts.final || ''}
        if ( uBake < 0.5 ) gl_FragColor.rgb = apHazed( gl_FragColor.rgb, vWp );
        #include <tonemapping_fragment>`);
    const after = (chunk, code) => { if (code) fs = fs.replace(`#include <${chunk}>`, `#include <${chunk}>\n${code}`); };
    if (parts.map) fs = fs.replace('#include <map_fragment>', `${parts.map}\n${parts.color || ''}`);       // replaces the stock texture lookup
    else after('map_fragment', parts.color);
    // the weather on it, unless it is indoors; `wet` and `snowed` are GLSL for how much of each this surface takes (the ground: none on water)
    const weathered = INDOORS.test(key) ? '' : WEATHERED.replaceAll('WX_DRY', parts.wet || '1.0').replaceAll('WX_SNOW', parts.snowed || '1.0');
    after('roughnessmap_fragment', (parts.rough || '') + weathered);
    after('normal_fragment_maps', parts.normal);
    after('emissivemap_fragment', parts.emissive);
    after('metalnessmap_fragment', parts.metal);
    for (const chunk of parts.drop || []) fs = fs.replace(`#include <${chunk}>`, '');
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => 'world-' + key;
  return material;
}

/* ------------------------------------------------------------------ cascaded sun shadows */
// One sun, several shadow maps: each fragment takes the first (finest) map that contains it.
let baseLights = null;
export function installCascades() {
  const C = THREE.ShaderChunk;
  if (!baseLights) baseLights = C.lights_fragment_begin;
  const dirBlock = /#if \( NUM_DIR_LIGHTS > 0 \) && defined\( RE_Direct \)[\s\S]*?#pragma unroll_loop_end\s*#endif/;
  if (!dirBlock.test(baseLights)) { console.warn('atmo: directional light block not found; stock shadows'); return; }
  C.lights_fragment_begin = baseLights.replace(dirBlock, /* glsl */`
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	float csmShadow = 1.0;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	float csmDone = 0.0;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		if ( csmDone < 0.5 ) {
			vec3 csmC = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
			vec2 csmE = abs( csmC.xy - 0.5 );
			if ( max( csmE.x, csmE.y ) < 0.485 && csmC.z > 0.0 && csmC.z < 1.0 ) {
				directionalLightShadow = directionalLightShadows[ i ];
				csmShadow = getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] );
				csmDone = 1.0;
			}
		}
	}
	#pragma unroll_loop_end
	#endif
	directionalLight = directionalLights[ 0 ];
	getDirectionalLightInfo( directionalLight, directLight );
	csmShadow = ( directLight.visible && receiveShadow ) ? csmShadow : 1.0;
	directLight.color *= csmShadow;
	#ifdef AP_PATCHED
	directLight.color *= apCloudShade( vWp );
	#endif
	RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`);
}

export class SunShadows {
  // near: { size, radius } adds one more map held tight round a moving object (the aircraft). It is listed first,
  // so anything inside it takes its shadow from there: the aircraft shades itself crisply at any height.
  constructor(scene, { radii = [320, 1300, 5200], sizes = [4096, 4096, 4096], near = null } = {}) {
    this.lights = []; this.keys = []; this.base = radii; this.sizes = sizes; this.scale = 1;
    this.right = new THREE.Vector3(); this.up = new THREE.Vector3();
    this.D = 9000;
    this.dirty = radii.map(() => 0);        // time a re-render was last asked for
    this.sunOn = true; this.nearOn = true;  // the page can do without the cascades, or the tight map (setOn)
    this.sunParked = false; this.nearParked = false;
    this.last = radii.map(() => -1e9);
    this.near = null;
    if (near || !radii.length) {
      const l = new THREE.DirectionalLight(0xffffff, 0), R = near ? near.radius : 1;
      l.castShadow = !!near;
      if (near) {
        l.shadow.mapSize.set(near.size, near.size);
        l.shadow.autoUpdate = false; l.shadow.needsUpdate = true; l.shadow.radius = 1.5;
        Object.assign(l.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 2 * R + 50 }); l.shadow.camera.updateProjectionMatrix();
        l.shadow.bias = -0.0006; l.shadow.normalBias = 0.014;
      }
      scene.add(l); scene.add(l.target);
      this.near = l; this.nearR = R; this.nearShadow = !!near;
    }
    radii.forEach((R, i) => {
      const l = new THREE.DirectionalLight(0xffffff, 0);
      l.castShadow = true;
      l.shadow.mapSize.set(sizes[i], sizes[i]);
      l.shadow.autoUpdate = false; l.shadow.needsUpdate = true;
      l.shadow.radius = 1.4;
      scene.add(l); scene.add(l.target);
      this.lights.push(l); this.keys.push('');
    });
    this._c = new THREE.Vector3(); this._f = new THREE.Vector3();
    this.setScale(1);
  }

  get all() { return this.near ? [this.near, ...this.lights] : this.lights; }

  // keep the tight map on a point (call every frame the object moves)
  follow(p) {
    const l = this.near; if (!l) return;
    if (this.nearShadow && !this.nearOn) {                 // parked: it only has to go on pointing the sun's way
      if (!this.nearParked) { this.park(l); this.nearParked = true; }
      l.position.copy(l.target.position).addScaledVector(ATMO.sunDir, 10); l.updateMatrixWorld();
      return;
    }
    if (this.nearParked) {
      const R = this.nearR; Object.assign(l.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 2 * R + 50 }); l.shadow.camera.updateProjectionMatrix();
      this.nearParked = false;
    }
    l.target.position.copy(p); l.position.copy(p).addScaledVector(ATMO.sunDir, this.nearR + 25);
    l.target.updateMatrixWorld(); l.updateMatrixWorld();
    if (this.nearShadow) l.shadow.needsUpdate = true;
  }

  // Do without the cascades (sun) or the tight map (near), for a machine that cannot keep up. The lights go on
  // casting, because every lit shader is rebuilt when the number of shadow maps changes and that freezes the
  // picture for seconds on the very machines this is for. Instead a map that is not wanted is parked: drawn once
  // more round a speck far under the ground, with nothing in it, and then left alone. Nothing falls inside it,
  // so nothing is shaded by it, and it costs no more draws.
  setOn(sun, near) {
    if (sun === this.sunOn && near === this.nearOn) return false;
    this.sunOn = sun; this.nearOn = near; this.keys.fill('');
    return true;
  }
  park(l) {
    const c = l.shadow.camera; c.left = c.bottom = -0.5; c.right = c.top = 0.5; c.near = 1; c.far = 20; c.updateProjectionMatrix();
    l.target.position.set(0, -1e6, 0); l.position.copy(l.target.position).addScaledVector(ATMO.sunDir, 10);
    l.target.updateMatrixWorld(); l.updateMatrixWorld();
    l.shadow.needsUpdate = true;
  }

  setScale(s) {
    this.scale = s;
    this.lights.forEach((l, i) => {
      const R = this.base[i] * s, texel = (2 * R) / this.sizes[i], sh = l.shadow;
      sh.camera.left = -R; sh.camera.right = R; sh.camera.top = R; sh.camera.bottom = -R;
      sh.camera.near = 10; sh.camera.far = this.D * 2; sh.camera.updateProjectionMatrix();
      sh.bias = -Math.max(texel * 1.5, 0.05) / (this.D * 2);
      sh.normalBias = texel * 1.8 + 0.02;
    });
    this.keys.fill('');
  }

  // light colour / strength and direction follow ATMO
  sync() {
    const d = ATMO.sunDir, c = U.uSunCol.value;
    this.right.crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    this.up.crossVectors(d, this.right).normalize();
    const m = Math.max(c.r, c.g, c.b, 1e-3);
    this.all.forEach((l, i) => {
      l.color.setRGB(c.r / m, c.g / m, c.b / m);
      // Every texture here is a photograph of an already sunlit surface, so the sun is kept modest:
      // at full strength roads and roofs come out twice as bright as they were photographed.
      l.intensity = i === 0 ? 3.3 * ATMO.sunLight : 0;
      l.castShadow = ATMO.sunLight > 0.02 && (l !== this.near || this.nearShadow);
    });
    this.keys.fill('');
  }

  // call when casters appear / disappear; cascades then re-render, the far ones less often
  invalidate() { const t = performance.now(); for (let i = 0; i < this.dirty.length; i++) if (!this.dirty[i]) this.dirty[i] = t; }

  update(camera, groundY) {
    const alt = Math.max(camera.position.y - groundY, 2);
    // cascade sizes grow with height above the ground, in steps so the maps are not redrawn every frame
    const s = THREE.MathUtils.clamp(2 ** (Math.round(Math.log2(Math.max(alt / 260, 1)) * 2) / 2), 1, 8);
    if (Math.abs(s - this.scale) > 1e-3) this.setScale(s);
    const d = ATMO.sunDir, c = this._c, fwd = this._f, now = performance.now();
    if (!this.sunOn) { if (!this.sunParked) { for (const l of this.lights) this.park(l); this.sunParked = true; } return; }
    if (this.sunParked) { this.sunParked = false; this.setScale(this.scale); }
    camera.getWorldDirection(fwd);
    const gap = [140, 420, 1100];
    for (let i = 0; i < this.lights.length; i++) {
      const R = this.base[i] * this.scale, texel = (2 * R) / this.sizes[i];
      // centre the map ahead of the camera, on the ground the camera is looking at
      const reach = Math.min(R * 0.7, alt / Math.max(-fwd.y, 0.12) * 0.9 + R * 0.25);
      c.copy(camera.position).addScaledVector(fwd, reach);
      const G = Math.max(texel, Math.round(R / 5 / texel) * texel);
      const u = Math.round(c.dot(this.right) / G) * G, v = Math.round(c.dot(this.up) / G) * G, w = Math.round(c.dot(d) / 200) * 200;
      const key = u + '|' + v + '|' + w;
      const l = this.lights[i];
      let redraw = false;
      if (key !== this.keys[i]) {
        this.keys[i] = key;
        l.target.position.set(0, 0, 0).addScaledVector(this.right, u).addScaledVector(this.up, v).addScaledVector(d, w);
        l.position.copy(l.target.position).addScaledVector(d, this.D);
        l.target.updateMatrixWorld(); l.updateMatrixWorld();
        redraw = true;
      } else if (this.dirty[i] && now - this.last[i] > gap[i]) redraw = true;
      if (redraw) { l.shadow.needsUpdate = true; this.last[i] = now; this.dirty[i] = 0; }
    }
  }
}

/* ------------------------------------------------------------------ sky dome */
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { ...U, uSunDisc: { value: 1 } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w * 0.999999;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform float uSunDisc;
      ${ATMO_GLSL}
      void main() {
        vec3 d = normalize( vDir );
        vec3 col = apSky( d );
        float mu = dot( d, uSunDir );
        float day = 1.0 - uNight;
        // sun disc and stars
        col += uSunDisc * uSunCol * ( 60.0 * smoothstep( 0.99990, 0.99996, mu ) + 1.2 * pow( max( mu, 0.0 ), 1200.0 ) );
        vec3 sd = d * 420.0; vec3 cell = floor( sd );
        float st = step( 0.9965, apHash3( cell ) ) * smoothstep( 0.45, 0.0, length( fract( sd ) - 0.5 ) );
        col += vec3( 0.9, 0.95, 1.0 ) * st * 0.5 * smoothstep( 0.6, 1.0, uNight ) * smoothstep( 0.0, 0.25, d.y );
        col = mix( col, uHorizon * 0.5, smoothstep( 0.0, -0.25, d.y ) );
        if ( uEnvSky > 0.5 ) {
          // The reflection map has no picture of the clouds to read, so they are painted on it flat: enough for the
          // light they send down and for what polished metal mirrors.
          if ( d.y > 0.012 ) {
            vec3 sunC = uSunCol * ( 1.0 * day * ( 1.0 - uGrey ) + 0.08 ) + uHorizon * 0.45;
            vec3 base = uZenith * 0.5 + uHorizon * 0.42;
            float fade = smoothstep( 0.012, 0.16, d.y );
            vec2 q = d.xz * ( 9000.0 / d.y );
            float ci = smoothstep( 1.0 - 0.6 * uEnvCloud.z, 1.25 - 0.6 * uEnvCloud.z, apFbm( q / vec2( 6200.0, 17000.0 ) + 4.0 ) + 0.25 ) * 0.5;
            col = mix( col, mix( uHorizon, sunC, 0.7 ), ci * fade );
            float cov = max( uEnvCloud.x, uEnvCloud.y * 0.8 );
            vec2 p = d.xz * ( 2000.0 / d.y );
            float n = apFbm( p / 2300.0 + 3.1 ), n2 = apFbm( ( p + uSunDir.xz * 260.0 ) / 2300.0 + 3.1 );
            float cu = smoothstep( 0.92 - 0.72 * cov, 1.06 - 0.72 * cov, n + 0.18 );
            float lit = clamp( 0.55 + ( n - n2 ) * 7.0, 0.0, 1.0 ) * ( 1.0 - 0.8 * uGrey );
            col = mix( col, mix( base, sunC, lit ), cu * 0.94 * fade );
          }
        } else if ( uCloudOn > 0.5 ) {
          vec4 c = texture2D( tCloud, gl_FragCoord.xy * uCloudInv );
          col = col * c.a + c.rgb;
        }
        gl_FragColor = vec4( col, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.scale.setScalar(cam.far * 0.5); mesh.updateMatrixWorld(); };
  return mesh;
}

// Reflection / sky-light map made from the sky dome plus a grey city floor.
export function makeEnvironment(renderer, sky, prev) {
  const pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  const s2 = new THREE.Mesh(sky.geometry, sky.material.clone());
  for (const k in U) s2.material.uniforms[k] = U[k];
  s2.material.uniforms.uSunDisc = { value: 0 };
  s2.material.uniforms.uEnvSky = { value: 1 }; s2.material.uniforms.uCloudOn = { value: 0 };
  s2.material.toneMapped = false;
  s2.scale.setScalar(900); s2.frustumCulled = false;
  sc.add(s2);
  // the lower half is the city itself: sunlit streets and roofs by day, a dim warm glow at night
  const h = U.uHorizon.value, z = U.uZenith.value, day = ATMO.sunLight;
  const floor = new THREE.Color(0.05 * (h.r + z.r) + 0.24 * day + 0.012, 0.05 * (h.g + z.g) + 0.23 * day + 0.009, 0.05 * (h.b + z.b) + 0.21 * day + 0.006);
  const g = new THREE.Mesh(new THREE.SphereGeometry(880, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: floor, side: THREE.BackSide, fog: false }));
  sc.add(g);
  const rt = pm.fromScene(sc, 0, 1, 2000);
  pm.dispose(); s2.material.dispose(); g.geometry.dispose(); g.material.dispose();
  if (prev) prev.dispose();
  return rt;
}
