// precip.js — what falls, and lightning.
//
// Rain, drizzle, snow and hail are each a few thousand drops in a box of air that travels with the camera: a drop
// that leaves one side comes back in at the other, so the box is always full. Every drop falls at its own kind's
// speed and goes with the wind; the camera's own speed is taken off, so from an aircraft at 400 km/h the rain
// comes at the lens in long lines from a point ahead, and standing on the runway it falls. A drop is drawn as a
// streak as long as it travels while the shutter is open.
// They are drawn with the aircraft (after the world), so the aircraft hides the drops behind it.
import * as THREE from 'three';
import { ATMO } from './atmo.js';

const VERT = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uShift, uVel, uWob;
uniform float uBox, uLen, uSize, uShare, uGround, uNearClip, uTime;
varying vec2 vQ; varying float vA;
void main() {
  vec3 rel = ( fract( aSeed.xyz + uShift ) - 0.5 ) * uBox;                 // where the drop is, from the camera
  // snow does not fall straight: each flake swings about its own path
  rel += uWob * vec3( sin( uTime * ( 1.3 + aSeed.w ) + aSeed.x * 40.0 ), 0.3 * sin( uTime * 1.7 + aSeed.y * 31.0 ), cos( uTime * ( 1.1 + aSeed.w * 0.7 ) + aSeed.z * 37.0 ) );
  vec3 v = uVel * ( 0.82 + 0.36 * aSeed.w );
  vec3 head = mat3( viewMatrix ) * rel, tail = mat3( viewMatrix ) * ( rel - v * uLen );
  // the streak, turned to face the lens
  vec2 a = head.xy / max( - head.z, 0.05 ), b = tail.xy / max( - tail.z, 0.05 );
  vec2 dir = a - b; float l = length( dir ); dir = l > 1e-5 ? dir / l : vec2( 0.0, 1.0 );
  vec3 along = mix( tail, head, position.y );
  float w = uSize * ( 0.7 + 0.6 * aSeed.w );
  w = max( w, - along.z * 0.00055 );                                         // never thinner than about half a pixel
  along.xy += vec2( - dir.y, dir.x ) * position.x * w;
  gl_Position = projectionMatrix * vec4( along, 1.0 );
  vQ = vec2( position.x * 2.0, position.y );
  float d = length( rel );
  vA = smoothstep( uBox * 0.5, uBox * 0.34, d ) * smoothstep( uNearClip, uNearClip * 2.2, d );
  vA *= step( aSeed.w * 0.999, uShare ) * step( uGround, cameraPosition.y + rel.y );
  vA *= uSize / w;                                                           // a drop widened to be seen is fainter by as much
  if ( head.z > -0.05 || tail.z > -0.05 ) vA = 0.0;
}`;
const FRAG = /* glsl */`
uniform vec3 uCol; uniform float uAlpha, uRound;
varying vec2 vQ; varying float vA;
void main() {
  float across = 1.0 - vQ.x * vQ.x;
  float along = mix( smoothstep( 0.0, 0.25, vQ.y ) * ( 1.0 - 0.6 * smoothstep( 0.6, 1.0, vQ.y ) ), 1.0 - pow( abs( vQ.y * 2.0 - 1.0 ), 2.0 ), uRound );
  float a = across * along * vA * uAlpha;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uCol, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function field(count, box) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(count * 4); for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  // the drops are in order of their fourth number, so "the first share of them" is a random share
  const order = []; for (let i = 0; i < count; i++) order.push(i); order.sort((a, b) => seed[a * 4 + 3] - seed[b * 4 + 3]);
  const s2 = new Float32Array(count * 4); order.forEach((o, i) => { for (let k = 0; k < 4; k++) s2[i * 4 + k] = seed[o * 4 + k]; });
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s2, 4));
  g.instanceCount = count;
  const u = { uShift: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(0, -8, 0) }, uWob: { value: new THREE.Vector3() }, uBox: { value: box }, uLen: { value: 0.02 }, uSize: { value: 0.01 },
    uShare: { value: 0 }, uGround: { value: -1e9 }, uNearClip: { value: 0.6 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(0.8, 0.82, 0.86) }, uAlpha: { value: 0.3 }, uRound: { value: 0 } };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 50; m.visible = false; m.layers.set(1);
  return { mesh: m, u, count, box, off: new THREE.Vector3(), fall: new THREE.Vector3() };
}

export class Precip {
  // n: how many drops this device is given (rain; snow and hail take a share of it)
  constructor(scene, n = 6000) {
    this.rain = field(n, 34); this.snow = field(Math.round(n * 0.8), 30); this.hail = field(Math.round(n * 0.12), 26);
    this.group = new THREE.Group(); this.group.add(this.rain.mesh, this.snow.mesh, this.hail.mesh);
    scene.add(this.group);
    this.level = { rain: 0, snow: 0, hail: 0 };       // 0..1: how hard each is falling, for the sound
    this._v = new THREE.Vector3();
  }

  one(F, share, dt, camera, camVel, wind, fallSpeed, shutter) {
    const u = F.u, m = F.mesh;
    m.visible = share > 0.004; if (!m.visible) return;
    // the drops' own movement, built up over time, less where the camera has gone: together, where the box has got to
    F.fall.set(wind.x, -fallSpeed, wind.z);
    F.off.addScaledVector(F.fall, dt);
    const b = F.box, s = u.uShift.value, c = camera.position;
    s.set(((F.off.x - c.x) / b) % 1, ((F.off.y - c.y) / b) % 1, ((F.off.z - c.z) / b) % 1);
    u.uVel.value.copy(F.fall).sub(camVel);
    const rel = u.uVel.value.length();
    u.uLen.value = Math.min(shutter, 9 / Math.max(rel, 1));        // no streak longer than 9 m
    u.uShare.value = share;
  }

  // wx: the Weather; camVel: the camera's velocity (m/s); ground: height of the ground under the camera; near: nothing drawn closer than this
  update(dt, camera, camVel, wx, ground, near = 0.6, time = 0) {
    const S = wx.now, wind = wx.wind, day = Math.max(ATMO.clear.light, 0.06) * (1 - 0.55 * S.dark), n = ATMO.night;
    const tone = 0.5 * day + 0.07 * n;
    // rain: 0.5 mm/h is a few drops, 4 is steady rain, 20 a downpour. Drizzle: many small slow drops.
    const r = wx.rainHere, fine = S.fine, lr = Math.min(Math.sqrt(r / 22), 1);
    this.one(this.rain, lr, dt, camera, camVel, wind, 8.5 - 5.5 * fine + 1.2 * lr, 0.022);
    let u = this.rain.u; u.uSize.value = 0.0042 - 0.0018 * fine + 0.002 * lr; u.uAlpha.value = 0.42 - 0.1 * fine; u.uRound.value = 0; u.uWob.value.set(0, 0, 0);
    u.uCol.value.setRGB(tone * 0.97, tone, tone * 1.06); u.uGround.value = ground; u.uNearClip.value = near; u.uTime.value = time;
    // snow: 0.5 cm/h light, 2 moderate, 5 heavy. Flakes fall at about a metre a second and wander; grains are small and fall straight.
    const sn = wx.snowHere, ls = Math.min(Math.sqrt(sn / 6), 1);
    this.one(this.snow, ls, dt, camera, camVel, wind, 1.3 + 0.9 * fine, 0.012);
    u = this.snow.u; u.uSize.value = 0.016 - 0.009 * fine; u.uAlpha.value = 0.8; u.uRound.value = 1; u.uWob.value.setScalar(0.22 * (1 - fine));
    const st = Math.min(tone * 1.75, 1.0); u.uCol.value.setRGB(st, st, st * 1.03); u.uGround.value = ground; u.uNearClip.value = near; u.uTime.value = time;
    // hail: few, fast, white
    const h = wx.hailHere;
    this.one(this.hail, Math.min(h, 1), dt, camera, camVel, wind, 19, 0.012);
    u = this.hail.u; u.uSize.value = 0.011; u.uAlpha.value = 0.9; u.uRound.value = 0.5; u.uWob.value.set(0, 0, 0);
    u.uCol.value.setRGB(st, st, st * 1.03); u.uGround.value = ground; u.uNearClip.value = near; u.uTime.value = time;
    this.level.rain = lr; this.level.snow = ls; this.level.hail = Math.min(h, 1);
  }
}

/* ------------------------------------------------------------------ a lightning stroke to the ground */
// A crooked line from the cloud base down, with a few branches; drawn for the third of a second the stroke flickers.
const BVERT = /* glsl */`
attribute vec3 aA, aB; attribute float aW;
uniform vec2 uPx; uniform float uWide;
varying float vX, vW;
void main() {
  vec4 a = projectionMatrix * viewMatrix * vec4( aA, 1.0 ), b = projectionMatrix * viewMatrix * vec4( aB, 1.0 );
  vec2 da = a.xy / max( a.w, 1e-3 ), db = b.xy / max( b.w, 1e-3 );
  vec2 dir = normalize( ( db - da ) / uPx + 1e-6 );
  vec4 p = mix( a, b, position.y );
  p.xy += vec2( - dir.y, dir.x ) * uPx * position.x * uWide * aW * p.w;
  gl_Position = p; vX = position.x * 2.0; vW = aW;
  if ( a.w < 0.5 || b.w < 0.5 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
}`;
const BFRAG = /* glsl */`
uniform float uAmp; varying float vX, vW;
void main() {
  float c = exp( - vX * vX * 5.0 );
  gl_FragColor = vec4( vec3( 0.82, 0.88, 1.0 ) * c * uAmp * ( 0.5 + 0.5 * vW ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export class Bolt {
  constructor(scene) {
    const MAX = 96; this.max = MAX;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3); this.b = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3); this.w = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    g.setAttribute('aA', this.a); g.setAttribute('aB', this.b); g.setAttribute('aW', this.w); g.instanceCount = 0;
    this.u = { uPx: { value: new THREE.Vector2(1 / 1000, 1 / 600) }, uWide: { value: 3 }, uAmp: { value: 0 } };
    const mat = (wide) => new THREE.ShaderMaterial({ vertexShader: BVERT, fragmentShader: BFRAG, uniforms: { uPx: this.u.uPx, uWide: { value: wide }, uAmp: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.core = new THREE.Mesh(g, mat(3.2)); this.glow = new THREE.Mesh(g, mat(22));
    for (const m of [this.core, this.glow]) { m.frustumCulled = false; m.renderOrder = 40; m.visible = false; scene.add(m); }
    this.geo = g;
  }
  // from (x, yTop, z) down to yGround
  strike(x, yTop, z, yGround) {
    const segs = []; let p = new THREE.Vector3(x, yTop, z);
    const walk = (from, toY, w, n, spread) => {
      let q = from.clone(); const step = (from.y - toY) / n;
      for (let i = 0; i < n && segs.length < this.max; i++) {
        const r = q.clone(); r.y -= step; r.x += (Math.random() - 0.5) * spread; r.z += (Math.random() - 0.5) * spread;
        segs.push([q, r, w]);
        if (w > 0.6 && Math.random() < 0.16 && i > 1 && i < n - 3) walk(r, r.y - step * (2 + Math.random() * 4), 0.4, 3 + Math.floor(Math.random() * 3), spread * 1.6);
        q = r;
      }
    };
    walk(p, yGround, 1, 22, (yTop - yGround) * 0.11);
    segs.forEach(([q, r, w], i) => { this.a.setXYZ(i, q.x, q.y, q.z); this.b.setXYZ(i, r.x, r.y, r.z); this.w.setX(i, w); });
    this.a.needsUpdate = this.b.needsUpdate = this.w.needsUpdate = true; this.geo.instanceCount = segs.length;
  }
  // amp: how bright the stroke is this instant (0 = not there); the glow is a share of it
  set(amp, w, h) {
    this.core.visible = this.glow.visible = amp > 0.01 && this.geo.instanceCount > 0;
    this.u.uPx.value.set(1 / w, 1 / h);
    this.core.material.uniforms.uAmp.value = amp * 2.4; this.glow.material.uniforms.uAmp.value = amp * 0.16;
    this.core.material.uniforms.uPx.value = this.glow.material.uniforms.uPx.value = this.u.uPx.value;
  }
}
