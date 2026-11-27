// globe.js — the Earth from space. Two jobs: the film's shots of the whole planet, and the place where a flight is
// picked (drag it, zoom in, click anywhere).
//
// It is the real thing as far as open pictures allow, and only what a camera in orbit could record:
//   day side     Esri World Imagery at the zoom the view needs (the same photographs the ground is made of)
//   clouds       NASA's VIIRS picture of the whole Earth from two days ago (GIBS, public domain): the white in it is
//                laid over the surface, and throws a shadow on the ground beside it
//   night side   NASA's Black Marble city lights
//   the sun      where it really is at this minute; its glint on the sea; the thin blue line of air on the limb,
//                reddening at the terminator; the sun itself with the flare a lens makes of it
// The Earth has radius 1 and does not turn; the camera goes round it. North is +y, longitude 0 faces +z.
import * as THREE from 'three';
import { photoUrl, PHOTO_BLANK, NET } from './net.js';

const D2R = Math.PI / 180, clamp = THREE.MathUtils.clamp;
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
const tileLat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z)));
const mercY = (lat) => (1 - Math.asinh(Math.tan(clamp(lat, -1.4844, 1.4844))) / Math.PI) / 2;
export const dirOf = (lat, lon, out = new THREE.Vector3()) => { const p = lat * D2R, l = lon * D2R; return out.set(Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)); };
export const geoOf = (v) => ({ lat: Math.asin(clamp(v.y / v.length(), -1, 1)) / D2R, lon: Math.atan2(v.x, v.z) / D2R });

// where the sun is overhead at a moment (declination and the equation of time to a tenth of a degree)
export function subsolar(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0), day = (date.getTime() - start) / 86400000;
  const B = (2 * Math.PI * (day - 81)) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const h = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return { lat: decl, lon: ((-15 * (h - 12 + eot / 60) + 540) % 360) - 180 };
}

const SURFACE_V = /* glsl */`
  varying vec2 vUv; varying vec3 vP;
  void main() { vUv = uv; vP = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const SURFACE_F = /* glsl */`
  precision highp float;
  uniform sampler2D tDay, tCloud, tNight;
  uniform vec4 uCloudST; uniform vec3 uNightST;          // a tile's own square inside the wider cloud and night pictures: scale, offset (and for the clouds, how many of their tiles go round the Earth)
  uniform vec3 uSun; uniform float uCloud, uNight, uDim, uHasDay, uHasCloud, uHasNight, uGlint;
  varying vec2 vUv; varying vec3 vP;
  const vec3 LUM = vec3( 0.30, 0.55, 0.15 );
  // cloud is what is bright and white in NASA's picture; bright sand is bright and not white
  float cloudAt( vec2 uv ) {
    vec3 c = texture2D( tCloud, clamp( uv, 0.002, 0.998 ) ).rgb; float mn = min( c.r, min( c.g, c.b ) ), mx = max( c.r, max( c.g, c.b ) );
    return smoothstep( 0.07, 0.52, mn ) * smoothstep( 0.44, 0.76, mn / max( mx, 1e-3 ) );
  }
  void main() {
    vec3 n = normalize( vP ), v = normalize( cameraPosition - vP );
    float mu = dot( n, uSun );
    vec3 day = mix( vec3( 0.03, 0.06, 0.11 ), texture2D( tDay, vUv ).rgb, uHasDay );
    float lum = dot( day, LUM );
    // the sea, told from the land by its colour: dark and bluer than it is red
    float sea = smoothstep( 0.0, 0.05, day.b - day.r * 1.04 ) * ( 1.0 - smoothstep( 0.22, 0.42, lum ) );
    vec2 cuv = vUv * uCloudST.x + uCloudST.yz;
    float cl = cloudAt( cuv ) * uCloud * uHasCloud;
    // a cloud's shadow falls on the ground away from the sun: look for cloud a little way towards it
    vec3 east = normalize( cross( vec3( 0.0, 1.0, 0.0 ), n ) + vec3( 1e-5, 0.0, 0.0 ) ), north = cross( n, east );
    vec2 toSun = vec2( dot( uSun, east ), - dot( uSun, north ) );
    float low = 1.0 - smoothstep( 0.0, 0.55, mu );
    float shade = cloudAt( cuv + toSun * uCloudST.w * ( 0.00045 + 0.0014 * low ) ) * uCloud * uHasCloud;
    // daylight: full from a little way inside the terminator, warm and dim where the sun is low
    float lit = smoothstep( -0.07, 0.24, mu );
    vec3 sunCol = mix( vec3( 1.0, 0.50, 0.24 ), vec3( 1.0, 0.985, 0.96 ), smoothstep( 0.0, 0.34, mu ) );
    vec3 col = day * sunCol * lit * ( 1.0 - 0.52 * shade * ( 1.0 - cl ) );
    // the sun's glint on the sea: wide and soft, as from orbit
    vec3 h = normalize( uSun + v );
    float spec = pow( max( dot( n, h ), 0.0 ), 260.0 ) * 0.62 + pow( max( dot( n, h ), 0.0 ), 30.0 ) * 0.085;        // (never to white: a sheen, with the sea still showing through it)
    col += sunCol * spec * sea * ( 1.0 - cl ) * lit * uGlint;
    // clouds: white where the sun is high, salmon along the terminator, grey-blue in the shade of their own depth
    vec3 cloudCol = sunCol * ( 0.80 + 0.08 * cl ) * lit * mix( 0.72, 1.0, smoothstep( 0.0, 0.5, mu ) );
    col = mix( col, cloudCol, cl );
    // the air seen from above: a blue veil that thickens towards the limb
    float rim = 1.0 - max( dot( n, v ), 0.0 );
    vec3 air = mix( vec3( 0.26, 0.48, 1.0 ), vec3( 1.0, 0.46, 0.22 ), ( 1.0 - smoothstep( -0.04, 0.22, mu ) ) * 0.8 );
    col += air * ( 0.035 + 0.42 * pow( rim, 3.4 ) ) * smoothstep( -0.16, 0.10, mu );
    // the night side: city lights, dimmed where cloud lies over them; and for the globe one picks from, a moonlit map
    vec3 lights = texture2D( tNight, clamp( vUv * uNightST.x + uNightST.yz, 0.002, 0.998 ) ).rgb * uHasNight;
    float dark = 1.0 - smoothstep( -0.16, 0.06, mu );
    float glow = max( dot( lights, vec3( 0.45, 0.45, 0.10 ) ) - 0.035, 0.0 );  // the picture's own dark blue ground is not light
    col += vec3( 1.0, 0.78, 0.50 ) * glow * ( 1.6 + 5.0 * glow ) * dark * uNight * ( 1.0 - 0.75 * cl );
    col += mix( day, vec3( lum ) * vec3( 0.55, 0.70, 1.0 ), 0.45 ) * uDim * ( 1.0 - lit ) * ( 1.0 - 0.5 * cl ) + vec3( 0.5, 0.56, 0.66 ) * cl * uDim * ( 1.0 - lit ) * 0.2;
    gl_FragColor = vec4( col, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// the air beyond the limb: every ray that passes the Earth close by goes through it
const AIR_V = /* glsl */`
  varying vec3 vW; void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const AIR_F = /* glsl */`
  precision highp float;
  uniform vec3 uSun; uniform float uAir; varying vec3 vW;
  void main() {
    vec3 rd = normalize( vW - cameraPosition );
    float t = - dot( cameraPosition, rd );                                    // nearest the Earth's middle along the ray
    vec3 p = cameraPosition + rd * max( t, 0.0 );
    float b = length( p );                                                    // how close the ray passes: 1 = the ground
    float thick = exp( - max( b - 1.0, 0.0 ) / 0.0046 ) * smoothstep( 0.996, 1.0, b );
    float mu = dot( normalize( p ), uSun );
    float day = smoothstep( -0.24, 0.08, mu );
    vec3 col = mix( vec3( 1.0, 0.36, 0.12 ), vec3( 0.32, 0.56, 1.0 ), smoothstep( -0.14, 0.14, mu ) );
    // looking towards the sun through the air it glows far brighter (the ring of first light)
    float fwd = pow( max( dot( rd, uSun ), 0.0 ), 28.0 );
    col = col * ( 0.62 + 0.9 * fwd ) + vec3( 1.0, 0.70, 0.44 ) * fwd * 0.42;
    gl_FragColor = vec4( col * thick * day * uAir, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const NONE = 0, LOADING = 1, READY = 2, EMPTY = 3;
// where the picture is felt for ground: the middle first, then down to its foot and out to its sides
const FEEL = [[0, 0], [0, -0.5], [0, -0.92], [-0.55, -0.5], [0.55, -0.5], [-0.8, -0.9], [0.8, -0.9], [-0.6, 0.05], [0.6, 0.05], [0, 0.45], [-0.85, -0.2], [0.85, -0.2]];

export class Globe {
  constructor(renderer, { clouds = 3, nightZ = 3, maxTiles = 420, stars = 2600 } = {}) {
    this.renderer = renderer; this.maxTiles = maxTiles;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
    this.sun = new THREE.Vector3(1, 0, 0); this.at = null; this.setSun(new Date());
    this.u = { uSun: { value: this.sun }, uCloud: { value: 1 }, uNight: { value: 1 }, uDim: { value: 0 }, uGlint: { value: 1 } };
    this.tiles = new Map(); this.layers = { cloud: new Map(), night: new Map() }; this.cloudZ = clouds; this.nightZ = nightZ;
    this.cloudMax = clouds + 4; this.nightMax = Math.min(nightZ + 3, 7);          // how sharp those two pictures may be asked for where the view is close
    this.capC = Math.min(clouds, 3); this.capN = Math.min(nightZ, 3);            // ... and the level in use just now (the whole Earth in view: one level everywhere)
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.blank.needsUpdate = true;
    this.loading = 0; this.maxLoad = 10; this.queue = []; this.tick = 0; this.stats = { tiles: 0, got: 0, failed: 0 };
    this.day = this.cloudDay(); this.zWant = 2;
    // the two caps the map's tiles do not reach (beyond 85 degrees)
    for (const s of [1, -1]) {
      const g = new THREE.CircleGeometry(Math.cos(85.0511 * D2R), 48); g.rotateX(-s * Math.PI / 2); g.translate(0, s * Math.sin(85.0511 * D2R), 0);
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { uSun: this.u.uSun, uDim: this.u.uDim, uCol: { value: new THREE.Color(s > 0 ? 0x8fa6b8 : 0xe4eaef) } },
        vertexShader: 'varying vec3 vP; void main() { vP = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
        fragmentShader: `precision highp float; uniform vec3 uSun, uCol; uniform float uDim; varying vec3 vP; void main() { float lit = smoothstep( -0.07, 0.24, dot( normalize( vP ), uSun ) ); gl_FragColor = vec4( uCol * ( lit + uDim * ( 1.0 - lit ) * 0.6 ), 1.0 );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` }));
      m.renderOrder = -1; this.group.add(m);
    }
    // air on the limb
    this.uAir = { value: 1 };
    this.air = new THREE.Mesh(new THREE.SphereGeometry(1.09, 96, 64), new THREE.ShaderMaterial({ vertexShader: AIR_V, fragmentShader: AIR_F, uniforms: { uSun: this.u.uSun, uAir: this.uAir }, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.air.renderOrder = 50; this.scene.add(this.air);
    this.makeStars(stars); this.makeSun();
    // the view when a place is being picked: the point under the middle of the screen, and how far out the camera is
    this.view = { lat: 20, lon: 0, dist: 3.4 }; this.want = { lat: 20, lon: 0, dist: 3.4 }; this.vel = { lat: 0, lon: 0 };
    this.held = false; this.idle = 0; this.spin = 1;        // it turns slowly of itself until it is touched
    this.pick = null; this.film = false;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._ray = new THREE.Raycaster(); this._s = new THREE.Sphere(new THREE.Vector3(), 1);
    this.base(2); setTimeout(() => this.base(3), 600);       // the whole Earth coarsely at once, then twice as sharp
    { const z = Math.min(clouds, 3), n = 2 ** z; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) this.layer('cloud', z, x, y, 22); }
    { const z = Math.min(nightZ, 3), n = 2 ** z; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) this.layer('night', z, x, y, 18); }
  }

  setSun(date) { const s = subsolar(date); this.at = s; dirOf(s.lat, s.lon, this.sun); return s; }
  // two days back, by the clock in Greenwich: the last whole day NASA has finished
  cloudDay() { const d = new Date(Date.now() - 2 * 86400000); return d.toISOString().slice(0, 10); }

  makeStars(n) {
    const pos = new Float32Array(n * 3), mag = new Float32Array(n);
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      // more of them along one band, as the sky really has
      let v; do { v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
      v.normalize(); if (rnd() < 0.45) { v.y *= 0.22; v.normalize(); v.applyAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), 1.05); }
      pos.set([v.x * 90, v.y * 90, v.z * 90], i * 3); mag[i] = Math.pow(rnd(), 5.0) * 0.9 + 0.1;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    this.uStars = { value: 1 };
    this.stars = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uStars: this.uStars, uPx: { value: 1 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: 'attribute float aMag; varying float vM; uniform float uPx; void main() { vM = aMag; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_PointSize = ( 1.1 + 2.4 * aMag ) * uPx; }',
      fragmentShader: 'precision highp float; varying float vM; uniform float uStars; void main() { float d = length( gl_PointCoord - 0.5 ) * 2.0; float a = smoothstep( 1.0, 0.2, d ); gl_FragColor = vec4( mix( vec3( 0.75, 0.84, 1.0 ), vec3( 1.0, 0.92, 0.80 ), fract( vM * 37.0 ) ) * a * ( 0.25 + vM ) * uStars, 1.0 ); }' }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -5; this.scene.add(this.stars);
  }
  makeSun() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.045, 'rgba(255,250,236,1)'); g.addColorStop(0.09, 'rgba(255,226,170,0.55)'); g.addColorStop(0.24, 'rgba(255,190,120,0.16)'); g.addColorStop(0.55, 'rgba(120,150,255,0.04)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    // the streak a lens draws through a bright point
    const s = c.createLinearGradient(40, 0, 216, 0); s.addColorStop(0, 'rgba(160,190,255,0)'); s.addColorStop(0.5, 'rgba(210,225,255,0.4)'); s.addColorStop(1, 'rgba(160,190,255,0)');
    c.globalCompositeOperation = 'lighter'; c.fillStyle = s; c.fillRect(40, 127, 176, 2);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    // the disc itself, far away, hidden by the Earth when it is behind it; and what the lens makes of it, drawn over everything
    this.disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); this.disc.renderOrder = 40; this.scene.add(this.disc);
    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0 })); this.flare.renderOrder = 60; this.scene.add(this.flare);
    this.flareK = 1;
  }

  /* ---------------------------------------------------------------- tiles */
  material(t) {
    return new THREE.ShaderMaterial({ vertexShader: SURFACE_V, fragmentShader: SURFACE_F, uniforms: {
      ...this.u, tDay: { value: this.blank }, tCloud: { value: this.blank }, tNight: { value: this.blank }, uHasDay: { value: 0 }, uHasCloud: { value: 0 }, uHasNight: { value: 0 },
      uCloudST: { value: new THREE.Vector4(1, 0, 0, 4) }, uNightST: { value: new THREE.Vector3(1, 0, 0) } } });
  }
  tile(z, x, y) {
    const k = z + '/' + x + '/' + y; let t = this.tiles.get(k);
    if (t) return t;
    const N = z <= 2 ? 48 : z === 3 ? 28 : z <= 5 ? 16 : 8, n = 2 ** z, pos = new Float32Array((N + 1) * (N + 1) * 3), uv = new Float32Array((N + 1) * (N + 1) * 2), idx = [];
    const R = 1 + z * 2.2e-5;
    for (let j = 0; j <= N; j++) {
      const lat = tileLat(y + j / N, z), cp = Math.cos(lat), sp = Math.sin(lat);
      for (let i = 0; i <= N; i++) {
        const lon = ((x + i / N) / n) * 2 * Math.PI - Math.PI, q = j * (N + 1) + i;
        pos[q * 3] = R * cp * Math.sin(lon); pos[q * 3 + 1] = R * sp; pos[q * 3 + 2] = R * cp * Math.cos(lon); uv[q * 2] = i / N; uv[q * 2 + 1] = j / N;
        if (i < N && j < N) idx.push(q, q + N + 1, q + 1, q + 1, q + N + 1, q + N + 2);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    t = { k, z, x, y, s: NONE, mesh: new THREE.Mesh(g, null), used: 0, tex: null, mid: new THREE.Vector3() };
    t.mesh.material = this.material(t); t.mesh.visible = false; t.mesh.renderOrder = z; t.mid.copy(g.boundingSphere.center).normalize();
    this.group.add(t.mesh); this.tiles.set(k, t); this.wire(t);
    return t;
  }
  // the cloud and night pictures are kept at one coarse level each: a finer tile reads its own square of them
  wire(t) {
    const U = t.mesh.material.uniforms;
    for (const [name, L, Z, st, has, tex] of [['cloud', this.layers.cloud, this.cloudZ, 'uCloudST', 'uHasCloud', 'tCloud'], ['night', this.layers.night, this.nightZ, 'uNightST', 'uHasNight', 'tNight']]) {
      for (let lz = Math.min(name === 'cloud' ? this.capC : this.capN, t.z); lz >= Math.min(2, t.z); lz--) {
        const d = t.z - lz, px = t.x >> d, py = t.y >> d, got = L.get(lz + '/' + px + '/' + py);
        if (got?.tex) { const s = 1 / 2 ** d; U[tex].value = got.tex; U[st].value.set(s, (t.x - (px << d)) * s, (t.y - (py << d)) * s, 2 ** lz); U[has].value = 1; break; }
      }
    }
  }
  async image(url, blankSize = 0) {
    const r = await fetch(url, { mode: 'cors' }); if (!r.ok) return null;
    const b = await r.blob(); if (blankSize && b.size === blankSize) return null;
    return this.bitmap(b);
  }
  async bitmap(b) {
    NET.bytes += b.size;
    const bmp = await createImageBitmap(b, { colorSpaceConversion: 'none' }).catch(() => null);
    if (!bmp) return null;
    const tex = new THREE.Texture(bmp); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    return tex;
  }
  pump() {
    this.queue.sort((a, b) => a.pri - b.pri);
    while (this.loading < this.maxLoad && this.queue.length) {
      const job = this.queue.pop(); this.loading++;
      job.run().catch(() => { this.stats.failed++; }).finally(() => { this.loading--; this.pump(); });
    }
  }
  ask(t, pri) {
    if (t.s !== NONE) return;
    t.s = LOADING;
    this.queue.push({ pri, run: async () => {
      const tex = await this.image(photoUrl(t.z, t.x, t.y), PHOTO_BLANK);
      if (!this.tiles.has(t.k)) { tex?.dispose(); return; }
      if (!tex) { t.s = EMPTY; return; }
      t.tex = tex; t.mesh.material.uniforms.tDay.value = tex; t.mesh.material.uniforms.uHasDay.value = 1; t.s = READY; this.stats.got++; NET.photo++;
    } });
    this.pump();
  }
  layer(name, z, x, y, pri) {
    const L = this.layers[name], k = z + '/' + x + '/' + y; if (L.has(k)) return;
    const rec = { tex: null }; L.set(k, rec);
    const url = name === 'cloud' ? `${GIBS}VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${this.day}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg` : `${GIBS}VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/${z}/${y}/${x}.png`;
    // (NASA's server turns some requests away when many arrive together: those are asked for twice more, a little later)
    const run = async (tries = 0) => {
      let tex = null, gone = false;
      try { const r = await fetch(url, { mode: 'cors' }); if (r.status === 404 || r.status === 400) gone = true; else if (r.ok) tex = await this.bitmap(await r.blob()); } catch { /* tried again below */ }
      if (tex) { rec.tex = tex; for (const t of this.tiles.values()) this.wire(t); }
      else if (!gone && tries < 2) setTimeout(() => { this.queue.push({ pri: pri - 20, run: () => run(tries + 1) }); this.pump(); }, 900 + 900 * tries);
      else if (!gone) this.stats.failed++;
    };
    this.queue.push({ pri, run: () => run(0) });
    this.pump();
  }
  // a whole level of the day side, with the clouds and the lights that go with it
  base(z) {
    const n = 2 ** z;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const t = this.tile(z, x, y); t.keep = true; this.ask(t, 100 - z * 10);
      if (z <= this.cloudZ) this.layer('cloud', z, x, y, 60 - z * 10);
      if (z <= this.nightZ) this.layer('night', z, x, y, 50 - z * 10);
    }
    this.baseZ = Math.max(this.baseZ || 0, z);
  }
  get ready() { let n = 0, all = 0; for (const t of this.tiles.values()) if (t.z === 2) { all++; if (t.s === READY || t.s === EMPTY) n++; } return all > 0 && n === all; }
  // how much of level z has arrived (0..1)
  have(z) { let n = 0, all = 0; for (const t of this.tiles.values()) if (t.z === z && t.keep) { all++; if (t.s === READY || t.s === EMPTY) n++; } return all ? n / all : 0; }

  // Which tiles the view needs. The picture is felt over at a dozen places; where one of them is ground, the level
  // whose dots match the screen's at that distance is asked for round it, with the two levels above it underneath.
  // (Looking straight down that is one patch under the camera; along the limb it is a strip from the nadir to the horizon.)
  refine(h, look = {}) {
    const cam = this.camera, d = cam.position.length(), fovK = 2 * Math.tan(cam.fov * D2R / 2), c0 = this._v.copy(cam.position).normalize();
    this.tick++;
    const show = new Set(), wantCloud = (look.cloud ?? 1) > 0.03, wantNight = (look.night ?? 1) > 0.03 && d > (this.film ? 1.03 : 1.25);
    let zTop = 2;
    // Seen whole, the Earth wears one level of cloud and of lights (a patch of a sharper level shows as a block).
    // Close in, they are asked for as sharp as the ground is.
    const whole = d > 1.9 && cam.fov > 12, capC = whole ? Math.min(this.cloudZ, 3) : this.cloudMax, capN = whole ? Math.min(this.nightZ, 3) : this.nightMax;
    if (capC !== this.capC || capN !== this.capN) { this.capC = capC; this.capN = capN; for (const t of this.tiles.values()) this.wire(t); }
    for (let s = 0; s < FEEL.length; s++) {
      const p = this.hit(FEEL[s][0], FEEL[s][1], this._w); if (!p) continue;
      const dist = p.distanceTo(cam.position), g = geoOf(p), cosLat = Math.max(Math.cos(g.lat * D2R), 0.05);
      const span = Math.min(fovK * dist, 2.6);                                  // radians of ground the picture's height covers out there
      const z = clamp(Math.round(Math.log2((2 * Math.PI * cosLat / span) * (h / 256)) - 0.1), 2, 17);
      if (s === 0) this.zWant = z; if (z > zTop) zTop = z;
      const reach = s === 0 ? 3 : 1;
      for (let L = Math.max(3, z - 2); L <= z; L++) {
        const n = 2 ** L, cx = ((g.lon + 180) / 360) * n, cy = mercY(g.lat * D2R) * n, half = L === z ? reach : Math.min(reach, 2);
        for (let y = Math.max(0, Math.floor(cy - half)); y <= Math.min(n - 1, Math.floor(cy + half)); y++) for (let x = Math.floor(cx - half); x <= Math.floor(cx + half); x++) {
          const t = this.tile(L, ((x % n) + n) % n, y);
          if (t.mid.dot(c0) < 1 / d - 0.12) continue;                           // over the horizon
          t.used = this.tick; show.add(t);
          if (t.s === NONE) this.ask(t, L * 10 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - (s ? 6 : 0));
          // the clouds and the lights over it, as sharp as they are worth having here
          if (wantCloud) { const lz = Math.min(L, capC), sh = L - lz; this.layer('cloud', lz, t.x >> sh, t.y >> sh, 40 + lz); }
          if (wantNight) { const lz = Math.min(L, capN), sh = L - lz; this.layer('night', lz, t.x >> sh, t.y >> sh, 30 + lz); }
        }
      }
    }
    for (const t of this.tiles.values()) t.mesh.visible = (t.keep && (t.s === READY || t.z === 2)) || (show.has(t) && t.s === READY);
    if (this.tiles.size > this.maxTiles) {
      const old = [...this.tiles.values()].filter((t) => !t.keep && t.used < this.tick - 120 && t.s !== LOADING).sort((a, b) => a.used - b.used);
      for (let i = 0; i < old.length && this.tiles.size > this.maxTiles - 40; i++) { const t = old[i]; this.group.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); t.tex?.dispose(); t.tex?.image?.close?.(); this.tiles.delete(t.k); }
    }
  }
  // the flight is on screen: what was still on order for the globe is dropped (it is asked for again when the globe comes back)
  rest() {
    this.queue.length = 0;
    for (const t of this.tiles.values()) if (t.s === LOADING && !t.tex) t.s = NONE;
    for (const L of [this.layers.cloud, this.layers.night]) for (const [k, r] of L) if (!r.tex) L.delete(k);
  }
  // true when nothing more is on its way for the view as it stands
  get settled() { return this.loading === 0 && this.queue.length === 0; }

  /* ---------------------------------------------------------------- the camera */
  // the point of the Earth in the middle of the picture (null if the middle is sky)
  centre(out) { return this.hit(0, 0, out); }
  // the point of the Earth under a place on the screen, x and y from -1 to 1
  hit(nx, ny, out = new THREE.Vector3()) {
    this._ray.setFromCamera({ x: nx, y: ny }, this.camera);
    return this._ray.ray.intersectSphere(this._s, out);
  }
  // free camera, for the film: where it is, what it looks at, which way is up, the lens
  pose(pos, look, up, fov) {
    const c = this.camera; c.position.copy(pos); c.up.copy(up); c.lookAt(look); c.fov = fov * Math.max(1, 1.25 / Math.max(c.aspect, 0.4)); this.fit();
  }
  fit() {
    const c = this.camera, d = c.position.length();
    c.near = Math.max((d - 1) * 0.25, 2e-5); c.far = d + 110; c.updateProjectionMatrix(); c.updateMatrixWorld();
  }
  // the picking camera: straight down on (lat, lon) from `dist` Earth radii, north up; close in it tips forward a little
  aim() {
    const v = this.view, c = this.camera, p = dirOf(v.lat, v.lon, this._v);
    c.position.copy(p).multiplyScalar(v.dist); c.up.set(0, 1, 0); c.lookAt(0, 0, 0);
    c.fov = 30 * Math.max(1, 1.25 / Math.max(c.aspect, 0.4)); this.fit();
  }
  // every frame while a place is being picked
  update(dt) {
    const v = this.view, w = this.want;
    if (!this.held) {
      // let go of, it carries on and slows; left alone at a distance, it turns slowly of itself
      w.lon += this.vel.lon * dt; w.lat += this.vel.lat * dt;
      const f = Math.exp(-dt / 0.55); this.vel.lon *= f; this.vel.lat *= f;
      this.idle += dt;
      if (this.spin > 0 && !this.pick) w.lon += dt * 2.2 * this.spin * clamp((w.dist - 1.6) / 1.2, 0, 1);
    }
    // past the top or bottom it gives a little and comes back
    if (!this.held) { if (w.lat > 84) w.lat += (84 - w.lat) * Math.min(1, dt * 9); if (w.lat < -84) w.lat += (-84 - w.lat) * Math.min(1, dt * 9); }
    w.dist = clamp(w.dist, 1.0008, 5.2);
    const e = 1 - Math.exp(-dt / 0.09), ez = 1 - Math.exp(-dt / 0.14);
    let dl = w.lon - v.lon; dl -= Math.round(dl / 360) * 360;
    v.lon += dl * e; v.lat += (w.lat - v.lat) * e; v.dist *= Math.pow(w.dist / v.dist, ez);
    w.lon = v.lon + dl * (1 - e); v.lat = clamp(v.lat, -89, 89);
    this.aim();
  }
  // a drag of (dx, dy) screen pixels turns it under the hand
  drag(dx, dy, h, dt) {
    const v = this.want, k = (2 * Math.tan(this.camera.fov * D2R / 2) * (this.view.dist - 1)) / h / D2R;
    const dLon = -dx * k / Math.max(Math.cos(this.view.lat * D2R), 0.12), over = Math.max(Math.abs(v.lat) - 84, 0), dLat = dy * k / (1 + over * 0.6);
    v.lon += dLon; v.lat = clamp(v.lat + dLat, -89.5, 89.5);
    if (dt > 0) { const a = Math.min(1, dt / 0.06); this.vel.lon += (dLon / dt - this.vel.lon) * a; this.vel.lat += (dLat / dt - this.vel.lat) * a; }
    this.idle = 0; this.spin = 0;
  }
  // in or out by a factor, towards the place under the pointer
  zoom(f, nx = 0, ny = 0) {
    const w = this.want, d0 = w.dist, d1 = clamp(1 + (d0 - 1) * f, 1.0008, 5.2);
    const p = this.hit(nx, ny, this._w);
    if (p && f < 1) { const g = geoOf(p), k = 1 - (d1 - 1) / (d0 - 1); let dl = g.lon - w.lon; dl -= Math.round(dl / 360) * 360; w.lon += dl * k * 0.9; w.lat += (g.lat - w.lat) * k * 0.9; }
    w.dist = d1; this.spin = 0; this.idle = 0;
  }
  // travel to a place (the search, the list of ideas): alt in Earth radii above the ground
  flyTo(lat, lon, alt = 0.02) { this.want.lat = lat; this.want.lon = lon; this.want.dist = 1 + alt; this.vel.lon = this.vel.lat = 0; this.spin = 0; }
  jumpTo(lat, lon, dist) { Object.assign(this.view, { lat, lon, dist }); Object.assign(this.want, { lat, lon, dist }); this.vel.lon = this.vel.lat = 0; }
  // where a place on the Earth is on the screen, in pixels; null if it is round the back
  screen(lat, lon, w, h, out = {}) {
    const p = dirOf(lat, lon, this._v), c = this.camera.position;
    if (p.dot(c) < 1.0) return null;                                          // below the horizon from here
    p.project(this.camera); if (p.z > 1 || Math.abs(p.x) > 1.15 || Math.abs(p.y) > 1.15) return null;
    out.x = (p.x * 0.5 + 0.5) * w; out.y = (-p.y * 0.5 + 0.5) * h; return out;
  }
  get altKm() { return (this.view.dist - 1) * 6371; }

  /* ---------------------------------------------------------------- drawing */
  // look: { cloud, night, dim, stars, air, glint, flare } each 0..1 (dim = how lit the night side is, for picking)
  render(w, h, look = {}, exposure = 1) {
    const r = this.renderer, c = this.camera, U = this.u;
    if (c.aspect !== w / h) { c.aspect = w / h; c.updateProjectionMatrix(); }
    U.uCloud.value = look.cloud ?? 1; U.uNight.value = look.night ?? 1; U.uDim.value = look.dim ?? 0; U.uGlint.value = look.glint ?? 1;
    this.uAir.value = look.air ?? 1; this.uStars.value = look.stars ?? 0.6; this.stars.material.uniforms.uPx.value = Math.max(1, h / 900);
    this.refine(h, look);
    // the sun: its disc far off; and the flare, which is in the lens, only while the Earth is not in its way
    const s = this.sun, cp = c.position, along = cp.dot(s), b = this._v.copy(cp).addScaledVector(s, -along).length();
    const seen = along > 0 ? 1 : THREE.MathUtils.smoothstep(b, 1.0, 1.035);
    this.disc.position.copy(cp).addScaledVector(s, 80); this.disc.scale.setScalar(80 * 0.34);
    this.flare.position.copy(this.disc.position); this.flare.scale.setScalar(80 * 0.9);
    this.flare.material.opacity = 0.42 * seen * (look.flare ?? 1) * this.flareK; this.disc.material.opacity = (look.flare ?? 1);
    this.stars.position.copy(cp);
    r.toneMappingExposure = exposure;
    r.render(this.scene, c);
    return seen;
  }
}
