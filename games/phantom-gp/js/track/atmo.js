// atmo.js — sun, analytic sky + clouds, aerial perspective and cascaded sun shadows.
// The sky model is baked into three's shared shader chunks, so every lit material gets the same
// haze, cloud shadows and cascade selection without per-material patching.
import * as THREE from 'three';

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const v3 = (c) => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;

export const ATMO = {
  sunDir: new THREE.Vector3(),
  sunColor: [1.0, 0.945, 0.86],
  sunIntensity: 9.0,
  zenith: [0.105, 0.245, 0.64],
  horizon: [0.60, 0.72, 0.88],
  haze: 0.80e-4,          // extinction at ground level (1/m)
  cloudAlt: 1500,         // metres above y = 0
  cloudCover: 0.47,
};

export function setSun(azimuthDeg, elevationDeg) {
  const az = THREE.MathUtils.degToRad(azimuthDeg), el = THREE.MathUtils.degToRad(elevationDeg);
  ATMO.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
}

function skyGLSL() {
  const s = ATMO.sunDir;
  return /* glsl */`
const vec3 AP_SUN = ${v3([s.x, s.y, s.z])};
const vec3 AP_ZEN = ${v3(ATMO.zenith)};
const vec3 AP_HOR = ${v3(ATMO.horizon)};
const vec3 AP_SUNC = ${v3(ATMO.sunColor)};
const float AP_CALT = ${f(ATMO.cloudAlt)};
const float AP_COVER = ${f(ATMO.cloudCover)};
float apHash( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 33.33 ); return fract( ( p.x + p.y ) * p.x ); }
float apNoise( vec2 x ) {
  vec2 i = floor( x ), w = fract( x ); w = w * w * ( 3.0 - 2.0 * w );
  return mix( mix( apHash( i ), apHash( i + vec2( 1.0, 0.0 ) ), w.x ), mix( apHash( i + vec2( 0.0, 1.0 ) ), apHash( i + vec2( 1.0, 1.0 ) ), w.x ), w.y );
}
float apFbm( vec2 p ) {
  float a = 0.5, s = 0.0;
  for ( int i = 0; i < 5; i ++ ) { s += a * apNoise( p ); p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 7.3; a *= 0.5; }
  return s;
}
float apFbm3( vec2 p ) {
  float a = 0.5, s = 0.0;
  for ( int i = 0; i < 3; i ++ ) { s += a * apNoise( p ); p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 7.3; a *= 0.5; }
  return s;
}
// cumulus density at a point of the cloud deck (metres)
float apCloud( vec2 p ) {
  float n = apFbm( p / 1900.0 + 3.1 );
  float big = apNoise( p / 6200.0 + 11.0 );
  return smoothstep( 1.0 - AP_COVER, 1.0 - AP_COVER + 0.11, n * 0.72 + big * 0.42 );
}
float apCloudLite( vec2 p ) {
  float n = apFbm3( p / 1900.0 + 3.1 ) * 1.07;
  float big = apNoise( p / 6200.0 + 11.0 );
  return smoothstep( 1.0 - AP_COVER, 1.0 - AP_COVER + 0.24, n * 0.72 + big * 0.42 );
}
float apCloudShadow( vec3 wp ) {
  vec2 p = wp.xz + AP_SUN.xz * ( ( AP_CALT - wp.y ) / AP_SUN.y );
  return 1.0 - 0.62 * apCloudLite( p );
}
vec3 apSky( vec3 d ) {
  float h = max( d.y, 0.0 );
  float t = pow( 1.0 - h, 4.2 );
  vec3 col = mix( AP_ZEN, AP_HOR, t );
  float mu = max( dot( d, AP_SUN ), 0.0 );
  col += AP_SUNC * ( 0.10 * pow( mu, 6.0 ) + 0.55 * pow( mu, 48.0 ) ) * ( 0.4 + 0.6 * t );
  return col;
}
`;
}

let baseChunks = null;

// (Re)write the shared chunks. Call before the first render, and again if the sun or sky constants change
// (then flag every material .needsUpdate).
export function installAtmosphere() {
  const C = THREE.ShaderChunk;
  if (!baseChunks) baseChunks = { lights: C.lights_fragment_begin, fpv: C.fog_pars_vertex, fv: C.fog_vertex, fpf: C.fog_pars_fragment, ff: C.fog_fragment };

  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 apWP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    apWP = instanceMatrix * apWP;
  #endif
  vFogWorld = ( modelMatrix * apWP ).xyz;
#endif`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${skyGLSL()}
#endif`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  vec3 apRay = vFogWorld - cameraPosition;
  float apDist = length( apRay );
  apRay /= max( apDist, 1e-3 );
  float apK = apRay.y * apDist / 1200.0;
  float apT = abs( apK ) > 1e-3 ? ( 1.0 - exp( - apK ) ) / apK : 1.0;
  float apOD = ${f(ATMO.haze)} * exp( - max( cameraPosition.y, -80.0 ) / 1200.0 ) * apDist * apT;
  float fogFactor = 1.0 - exp( - apOD );
  vec3 apCol = apSky( normalize( vec3( apRay.x, abs( apRay.y ) * 0.25 + 0.015, apRay.z ) ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, apCol * 0.82, fogFactor );
#endif`;

  // one sun, N shadow cascades: take the first cascade whose map contains the fragment
  const dirBlock = /#if \( NUM_DIR_LIGHTS > 0 \) && defined\( RE_Direct \)[\s\S]*?#pragma unroll_loop_end\s*#endif/;
  if (!dirBlock.test(baseChunks.lights)) console.warn('atmo: directional light block not found; shadows fall back to stock');
  C.lights_fragment_begin = baseChunks.lights.replace(dirBlock, /* glsl */`
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
	float csmCloud = 1.0;
	#ifdef USE_FOG
		csmCloud = apCloudShadow( vFogWorld );
	#endif
	csmShadow = ( ( directLight.visible && receiveShadow ) ? csmShadow : 1.0 ) * csmCloud;
	directLight.color *= csmShadow;
	RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`);
}

/* ------------------------------------------------------------------ sky: ray-marched cumulus, baked once */
// Clouds are static, so the whole sky (upper hemisphere, equirect) is marched once at load in small tiles and the
// dome just samples it. The cloud field uses the same coverage function as the ground cloud shadows.
export async function bakeSky(renderer, noise3, { w = 4096, h = 1024, steps = 56 } = {}) {
  const FS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), sc = new THREE.Scene(), cam = new THREE.Camera();
  quad.frustumCulled = false; sc.add(quad);
  const prev = { rt: renderer.getRenderTarget(), tm: renderer.toneMapping, sm: renderer.shadowMap.enabled };
  renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = false;
  // 1) coverage map: 40 km square around the origin
  const cov = new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.UnsignedByteType, depthBuffer: false });
  cov.texture.wrapS = cov.texture.wrapT = THREE.ClampToEdgeWrapping;
  quad.material = new THREE.ShaderMaterial({ vertexShader: FS, fog: false, toneMapped: false, depthTest: false, fragmentShader: `varying vec2 vUv; ${skyGLSL()}
    void main(){ vec2 p = ( vUv - 0.5 ) * 40000.0; float n = apFbm( p / 1900.0 + 3.1 ), big = apNoise( p / 6200.0 + 11.0 );
      float edge = 1.0 - smoothstep( 15000.0, 19500.0, length( p ) );
      gl_FragColor = vec4( vec3( smoothstep( 1.0 - AP_COVER - 0.07, 1.0 - AP_COVER + 0.30, n * 0.72 + big * 0.42 ) * edge ), 1.0 ); }` });
  renderer.setRenderTarget(cov); renderer.render(sc, cam);
  quad.material.dispose();
  // 2) the march
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
  rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter; rt.texture.generateMipmaps = false;
  quad.material = new THREE.ShaderMaterial({
    vertexShader: FS, fog: false, toneMapped: false, depthTest: false,
    uniforms: { tN3: { value: noise3 }, tCov: { value: cov.texture }, uRes: { value: new THREE.Vector2(w, h) } },
    fragmentShader: /* glsl */`
      precision highp float; precision highp sampler3D;
      uniform sampler3D tN3; uniform sampler2D tCov; uniform vec2 uRes;
      ${skyGLSL()}
      const float CB = 1150.0, CT = 2350.0, SIG = 0.016;
      float remap01( float v, float a, float b ) { return clamp( ( v - a ) / ( b - a ), 0.0, 1.0 ); }
      float dens( vec3 p, bool fine ) {
        float hh = ( p.y - CB ) / ( CT - CB );
        if ( hh <= 0.0 || hh >= 1.0 ) return 0.0;
        float cov = texture2D( tCov, p.xz / 40000.0 + 0.5 ).r;
        if ( cov < 0.01 ) return 0.0;
        // flat bases, tops that rise where the cover is thick
        float prof = smoothstep( 0.0, 0.07, hh ) * ( 1.0 - smoothstep( 0.22 + 0.55 * cov, 0.36 + 0.64 * cov, hh ) );
        vec4 n = texture( tN3, p / 3400.0 );
        float d = remap01( n.r * 0.72 + n.b * 0.28, 1.0 - cov * prof * 0.92, 1.0 );
        if ( fine && d > 0.0 ) { float e = texture( tN3, p / 820.0 + 0.37 ).g; d = remap01( d, ( 1.0 - e ) * 0.34, 1.0 ); }
        return d;
      }
      float hg( float mu, float g ) { float g2 = g * g; return ( 1.0 - g2 ) / pow( 1.0 + g2 - 2.0 * g * mu, 1.5 ); }
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        float az = ( uv.x - 0.5 ) * 6.28318530718, el = uv.y * 1.57079632679;
        vec3 d = vec3( cos( el ) * cos( az ), sin( el ), cos( el ) * sin( az ) );
        vec3 col = apSky( d );
        float mu = dot( d, AP_SUN );
        // thin high cirrus behind everything
        vec2 q = d.xz * ( 9000.0 / max( d.y, 0.02 ) );
        float ci = smoothstep( 0.50, 0.86, apFbm( q / vec2( 5200.0, 15000.0 ) ) ) * 0.26 * smoothstep( 0.02, 0.3, d.y );
        col = mix( col, AP_SUNC * 1.5 + AP_HOR * 0.5, ci );
        vec3 ro = vec3( 0.0, 80.0, 0.0 );
        float dy = max( d.y, 0.010 );
        float t0 = ( CB - ro.y ) / dy, t1 = min( ( CT - ro.y ) / dy, t0 + 16000.0 );
        float dt = ( t1 - t0 ) / float( ${steps} );
        float jit = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        float T = 1.0, tSum = 0.0, wSum = 0.0; vec3 L = vec3( 0.0 );
        float phase = mix( hg( mu, 0.6 ), hg( mu, -0.2 ), 0.4 );
        for ( int i = 0; i < ${steps}; i ++ ) {
          float t = t0 + ( float( i ) + jit ) * dt;
          vec3 p = ro + d * t;
          float dn = dens( p, true );
          if ( dn > 0.004 ) {
            float tau = 0.0, sl = 40.0, sd = 0.0;
            for ( int j = 0; j < 6; j ++ ) { sd += sl; tau += dens( p + AP_SUN * sd, false ) * sl; sl *= 1.7; }
            tau *= SIG;
            float sunT = max( exp( - tau ), 0.62 * exp( - 0.22 * tau ) );            // crude multiple scattering
            float hh = ( p.y - CB ) / ( CT - CB );
            vec3 amb = mix( AP_HOR * 0.50 + AP_ZEN * 0.12, AP_ZEN * 0.55 + AP_HOR * 0.75, hh ) * ( 0.75 + 0.25 * ( 1.0 - dn ) );
            vec3 S = AP_SUNC * ${f(ATMO.sunIntensity)} * 0.34 * sunT * ( 0.35 + 0.65 * phase ) + amb;
            float aStep = 1.0 - exp( - dn * SIG * dt );
            L += T * S * aStep; tSum += t * T * aStep; wSum += T * aStep;
            T *= 1.0 - aStep;
            if ( T < 0.012 ) break;
          }
        }
        float td = wSum > 0.0 ? tSum / wSum : t0;
        float fade = 1.0 - exp( - td * 0.000032 );
        L = mix( L, apSky( normalize( vec3( d.x, 0.035, d.z ) ) ) * ( 1.0 - T ), fade );
        gl_FragColor = vec4( col * T + L, T );
      }`,
  });
  // render targets carry their own viewport / scissor (the renderer's are scaled by the pixel ratio)
  const gl = renderer.getContext(), TX = 16, TY = 4, tw = w / TX, th = h / TY;
  rt.scissorTest = true;
  for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
    rt.scissor.set(tx * tw, ty * th, tw, th);
    renderer.setRenderTarget(rt);
    renderer.render(sc, cam);
    gl.flush();
    if ((tx & 3) === 3) { renderer.setRenderTarget(null); await new Promise((r) => setTimeout(r, 0)); }
  }
  rt.scissorTest = false;
  renderer.setRenderTarget(prev.rt); renderer.toneMapping = prev.tm; renderer.shadowMap.enabled = prev.sm;
  quad.material.dispose(); quad.geometry.dispose(); cov.dispose();
  return rt.texture;
}

export function makeSky(skyTex) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { uSunDisc: { value: 1 }, tSky: { value: skyTex } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform float uSunDisc; uniform sampler2D tSky;
      ${skyGLSL()}
      void main() {
        vec3 d = normalize( vDir );
        float el = asin( clamp( d.y, -1.0, 1.0 ) ), az = atan( d.z, d.x );
        vec4 s = texture2D( tSky, vec2( az / 6.28318530718 + 0.5, clamp( el / 1.57079632679, 0.0005, 0.9995 ) ) );
        vec3 col = s.rgb;
        float mu = dot( d, AP_SUN );
        col += uSunDisc * s.a * AP_SUNC * ( 240.0 * smoothstep( 0.99988, 0.99996, mu ) + 1.4 * pow( max( mu, 0.0 ), 900.0 ) );
        col = mix( col, AP_HOR * 0.55, smoothstep( 0.0, -0.22, d.y ) );
        gl_FragColor = vec4( col, 1.0 );
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.scale.setScalar(30000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return mesh;
}

export function makeEnvironment(renderer, sky) {
  const pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  const s2 = sky.clone(); s2.material = sky.material.clone(); s2.material.uniforms.uSunDisc.value = 0;
  s2.material.uniforms.tSky.value = sky.material.uniforms.tSky.value;      // render-target textures do not survive a uniform clone
  s2.onBeforeRender = () => {};
  s2.position.set(0, 60, 0); s2.scale.setScalar(900);
  sc.add(s2);
  // ground bounce: dark green-grey hemisphere below the horizon
  const g = new THREE.Mesh(new THREE.SphereGeometry(880, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.14, 0.10), side: THREE.BackSide, fog: false }));
  g.position.set(0, 60, 0); sc.add(g);
  const rt = pm.fromScene(sc, 0, 1, 2000, { position: new THREE.Vector3(0, 60, 0) });
  pm.dispose(); s2.material.dispose();
  return rt.texture;
}

/* ------------------------------------------------------------------ cascaded sun shadows */
export class SunShadows {
  constructor(scene, { radii = [26, 95, 420, 2600], sizes = [2048, 4096, 4096, 4096] } = {}) {
    this.lights = []; this.keys = []; this.radii = radii; this.sizes = sizes;
    this.maxPerFrame = 9;                    // cascades re-rendered per frame at most (nearest first); the rest wait a frame
    const d = ATMO.sunDir;
    this.right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    this.up = new THREE.Vector3().crossVectors(d, this.right).normalize();
    this.D = 3200;
    radii.forEach((R, i) => {
      const l = new THREE.DirectionalLight(new THREE.Color(...ATMO.sunColor), i === 0 ? ATMO.sunIntensity : 0);
      l.castShadow = true;
      const sh = l.shadow, texel = (2 * R) / sizes[i];
      sh.mapSize.set(sizes[i], sizes[i]);
      sh.camera.left = -R; sh.camera.right = R; sh.camera.top = R; sh.camera.bottom = -R;
      sh.camera.near = 20; sh.camera.far = this.D * 2; sh.camera.updateProjectionMatrix();
      sh.bias = -Math.max(texel * 1.2, 0.02) / (this.D * 2);
      sh.normalBias = texel * 1.6 + 0.01;
      sh.radius = i < 2 ? 1.6 : 1.2;
      sh.autoUpdate = false; sh.needsUpdate = true;
      scene.add(l); scene.add(l.target);
      this.lights.push(l); this.keys.push('');
    });
    this._c = new THREE.Vector3(); this._f = new THREE.Vector3();
  }

  // focus: optional world point the near cascades should centre on (telephoto / chase cameras)
  update(camera, focus = null) {
    const d = ATMO.sunDir, c = this._c, fwd = this._f;
    camera.getWorldDirection(fwd);
    let used = 0;
    for (let i = 0; i < this.lights.length; i++) {
      const R = this.radii[i], texel = (2 * R) / this.sizes[i];
      if (focus && i < 2) c.copy(focus);
      else c.copy(camera.position).addScaledVector(fwd, R * 0.55);
      const G = Math.max(texel, Math.round(R / 4 / texel) * texel);
      const u = Math.round(c.dot(this.right) / G) * G, v = Math.round(c.dot(this.up) / G) * G, w = Math.round(c.dot(d) / 100) * 100;
      const key = u + '|' + v + '|' + w;
      if (key === this.keys[i]) continue;
      if (used >= this.maxPerFrame) continue;
      used++;
      this.keys[i] = key;
      const l = this.lights[i];
      l.target.position.set(0, 0, 0).addScaledVector(this.right, u).addScaledVector(this.up, v).addScaledVector(d, w);
      l.position.copy(l.target.position).addScaledVector(d, this.D);
      l.target.updateMatrixWorld(); l.updateMatrixWorld();
      l.shadow.needsUpdate = true;
    }
  }

  invalidate() { this.keys.fill(''); }

  // force the n nearest cascades to re-render this frame (moving shadow casters)
  touch(n) { for (let i = 0; i < n && i < this.lights.length; i++) this.lights[i].shadow.needsUpdate = true; }
}
