// atmo.js — sun position for Tokyo, sky colours through the day, haze, sky dome, sun shadows,
// and the shader patch every material in the scene goes through.
import * as THREE from 'three';
import { ORIGIN } from './geo.js';

const D2R = Math.PI / 180;

export const ATMO = {
  hour: 14.5,                 // Japan Standard Time
  dayOfYear: 121,             // 1 May: the season most of the aerial photos were flown in
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
  },
};
const U = ATMO.uniforms;

/* ------------------------------------------------------------------ sun */
export function sunAt(hour, dayOfYear) {
  const decl = 23.44 * D2R * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const B = (2 * Math.PI * (dayOfYear - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);       // minutes
  const solar = hour + (4 * (ORIGIN.lon - 135) + eot) / 60;
  const H = 15 * (solar - 12) * D2R, lat = ORIGIN.lat * D2R;
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
  ATMO.night = THREE.MathUtils.clamp((2 - el) / 9, 0, 1);       // lights come on from just before sunset to -7 deg
  U.uNight.value = ATMO.night;
}

/* ------------------------------------------------------------------ shared GLSL */
export const ATMO_GLSL = /* glsl */`
uniform vec3 uSunDir, uSunCol, uZenith, uHorizon;
uniform float uHaze, uHazeH, uNight, uTime, uBake, uPaint;
uniform vec4 uRelief;
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
  col += uSunCol * ( 0.07 * pow( mu, 8.0 ) + 0.45 * pow( mu, 64.0 ) ) * ( 0.35 + 0.65 * t );
  return col;
}
// aerial perspective: haze thins with height, takes the colour of the sky near the horizon in that direction
vec3 apHazed( vec3 col, vec3 wp ) {
  vec3 ray = wp - cameraPosition;
  float dist = length( ray );
  ray /= max( dist, 1e-3 );
  float k = ray.y * dist / uHazeH;
  float tr = abs( k ) > 1e-3 ? ( 1.0 - exp( - k ) ) / k : 1.0;
  float od = uHaze * exp( - max( cameraPosition.y, 0.0 ) / uHazeH ) * dist * tr;
  float f = 1.0 - exp( - od );
  vec3 air = apSky( normalize( vec3( ray.x, abs( ray.y ) * 0.3 + 0.02, ray.z ) ) );
  return mix( col, air * 0.92, f );
}
`;

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
      .replace('#include <common>', `#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;\n${ATMO_GLSL}\n${parts.fragPars || ''}`)
      .replace('#include <tonemapping_fragment>', `${parts.final || ''}
        if ( uBake < 0.5 ) gl_FragColor.rgb = apHazed( gl_FragColor.rgb, vWp );
        #include <tonemapping_fragment>`);
    const after = (chunk, code) => { if (code) fs = fs.replace(`#include <${chunk}>`, `#include <${chunk}>\n${code}`); };
    if (parts.map) fs = fs.replace('#include <map_fragment>', `${parts.map}\n${parts.color || ''}`);       // replaces the stock texture lookup
    else after('map_fragment', parts.color);
    after('roughnessmap_fragment', parts.rough);
    after('normal_fragment_maps', parts.normal);
    after('emissivemap_fragment', parts.emissive);
    after('metalnessmap_fragment', parts.metal);
    for (const chunk of parts.drop || []) fs = fs.replace(`#include <${chunk}>`, '');
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => 'tokyo-' + key;
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
    l.target.position.copy(p); l.position.copy(p).addScaledVector(ATMO.sunDir, this.nearR + 25);
    l.target.updateMatrixWorld(); l.updateMatrixWorld();
    if (this.nearShadow) l.shadow.needsUpdate = true;
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
        // high thin cloud and a scatter of fair-weather cumulus, lit from the sun side
        if ( d.y > 0.012 ) {
          vec2 q = d.xz * ( 9000.0 / d.y );
          float ci = smoothstep( 0.52, 0.9, apFbm( q / vec2( 6200.0, 17000.0 ) + 4.0 ) ) * 0.30;
          vec2 p = d.xz * ( 2600.0 / d.y ) + cameraPosition.xz * 0.6;
          float n = apFbm( p / 2300.0 + 3.1 ), n2 = apFbm( ( p + uSunDir.xz * 260.0 ) / 2300.0 + 3.1 );
          float cu = smoothstep( 0.60, 0.74, n );
          float lit = clamp( 0.55 + ( n - n2 ) * 7.0, 0.0, 1.0 );
          vec3 sunC = uSunCol * ( 1.15 * day + 0.1 ) + uHorizon * 0.25;
          vec3 cuCol = mix( uZenith * 0.55 + uHorizon * 0.35, sunC, lit );
          float fade = smoothstep( 0.012, 0.16, d.y );
          col = mix( col, mix( uHorizon, sunC, 0.7 ), ci * fade );
          col = mix( col, cuCol, cu * 0.92 * fade );
        }
        // sun disc and stars
        col += uSunDisc * uSunCol * ( 60.0 * smoothstep( 0.99990, 0.99996, mu ) + 1.2 * pow( max( mu, 0.0 ), 1200.0 ) );
        vec3 sd = d * 420.0; vec3 cell = floor( sd );
        float st = step( 0.9965, apHash3( cell ) ) * smoothstep( 0.45, 0.0, length( fract( sd ) - 0.5 ) );
        col += vec3( 0.9, 0.95, 1.0 ) * st * 0.5 * smoothstep( 0.6, 1.0, uNight ) * smoothstep( 0.0, 0.25, d.y );
        col = mix( col, uHorizon * 0.5, smoothstep( 0.0, -0.25, d.y ) );
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
