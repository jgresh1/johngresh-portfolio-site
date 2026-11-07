// Specks: plankton clouds, copepods, glass shrimp (tiny food drawn as glowing points) and short-lived effect particles
// (eat bursts, bubbles, scales, ink). Everything is simulated on the CPU in typed arrays and drawn as additive sprites.
import * as THREE from 'three';
import { U, OPTICS_VERT } from '../optics.js';

const SPECK_VERT = /* glsl */`
attribute vec4 aData;          // x size (m), y twinkle phase, z hint 0..1, w alive
attribute vec3 aCol;
uniform float uPx, uHintAll, uBoost;
varying vec4 vCol;
${OPTICS_VERT}
void main() {
  vec3 P = position;
  vec3 rel = P - cameraPosition; float dist = length(rel);
  if (aData.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return; }
  vec3 T, L; uwPathV(cameraPosition, P, T, L);
  float px = uPx * aData.x / max(dist, 0.15);
  float tw = 0.78 + 0.22 * sin(uOptA.x * 2.6 + aData.y * 40.0);
  float hint = max(aData.z, uHintAll);
  // lit by the surface light that reaches this depth, so they dim with depth like everything else
  vec3 amb = uwAmbAtV(P) * 0.9 + 0.12;
  gl_PointSize = clamp(px * (1.0 + 1.2 * hint) + 5.5, 7.0, 30.0) * (0.9 + 0.2 * tw);
  vCol = vec4(aCol * (1.7 + 2.0 * hint) * tw * (0.7 + amb) * T * uBoost, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;
const SPECK_FRAG = /* glsl */`
precision highp float;
varying vec4 vCol;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q);
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.0, r);
  float core = smoothstep(0.22, 0.0, r);
  gl_FragColor = vec4(vCol.rgb * (0.55 * a * a + 2.2 * core), 1.0) * a;
}`;

const FX_VERT = /* glsl */`
attribute vec4 aData;          // x size (m), y alpha, z unused, w alive
attribute vec3 aCol;
uniform float uPx;
varying vec4 vCol;
${OPTICS_VERT}
void main() {
  vec3 P = position;
  if (aData.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return; }
  vec3 rel = P - cameraPosition; float dist = length(rel);
  vec3 T, L; uwPathV(cameraPosition, P, T, L);
  gl_PointSize = clamp(uPx * aData.x / max(dist, 0.15), 1.5, aData.z > 0.5 ? 380.0 : 11.0);
  vCol = vec4(aCol * T, aData.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;
const FX_FRAG_ADD = /* glsl */`
precision highp float;
varying vec4 vCol;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q);
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.1, r);
  gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);
}`;
const FX_FRAG_ALPHA = /* glsl */`
precision highp float;
varying vec4 vCol;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q);
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.0, r) * vCol.a;
  gl_FragColor = vec4(vCol.rgb, a);
}`;

const TAU = Math.PI * 2;

export class Specks {
  constructor(scene, cap = 4200) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3);
    this.data = new Float32Array(cap * 4); this.col = new Float32Array(cap * 3);
    this.type = new Uint8Array(cap); this.cloud = new Int32Array(cap).fill(-1);
    this.free = []; for (let i = cap - 1; i >= 0; i--) this.free.push(i);
    this.hi = 0;                                         // highest used index + 1
    this.clouds = new Map(); this.nextCloud = 1;
    this.eaten = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.BufferAttribute(this.data, 4); this.aData.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3);
    g.setAttribute('position', this.aPos); g.setAttribute('aData', this.aData); g.setAttribute('aCol', this.aCol);
    this.uniforms = Object.assign({}, U, { uPx: { value: 900 }, uHintAll: { value: 0 }, uBoost: { value: 1 } });
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SPECK_VERT, fragmentShader: SPECK_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 11;
    scene.add(this.points);
    this.geo = g;
    this.fx = new Fx(scene, 1600);
    this._noise = 0;
  }

  get count() { return this.cap - this.free.length; }

  // a cloud of n specks of `type` (index into palette), size s metres, spread radius r
  addCloud(key, type, cx, cy, cz, n, radius, size, col, rnd, floorFn) {
    const id = this.nextCloud++;
    const cl = { id, key, type, cx, cy, cz, vx: 0, vy: 0, vz: 0, r: radius, alive: 0, members: [], born: 0, flee: type === 1 };
    for (let k = 0; k < n && this.free.length; k++) {
      const i = this.free.pop();
      const a = rnd() * TAU, b = Math.acos(2 * rnd() - 1), rr = radius * Math.cbrt(rnd());
      let x = cx + Math.sin(b) * Math.cos(a) * rr, y = cy + Math.cos(b) * rr * 0.6, z = cz + Math.sin(b) * Math.sin(a) * rr;
      if (floorFn) { const f = floorFn(x, z) + 0.06; if (y < f) y = f; }
      if (y > -0.2) y = -0.2;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0;
      this.data[i * 4] = size * (0.7 + 0.6 * rnd()); this.data[i * 4 + 1] = rnd(); this.data[i * 4 + 2] = 0; this.data[i * 4 + 3] = 1;
      const v = 0.8 + 0.4 * rnd();
      this.col[i * 3] = col[0] * v; this.col[i * 3 + 1] = col[1] * v; this.col[i * 3 + 2] = col[2] * v;
      this.type[i] = type; this.cloud[i] = id; cl.members.push(i); cl.alive++;
      if (i + 1 > this.hi) this.hi = i + 1;
    }
    this.clouds.set(id, cl);
    this.aCol.needsUpdate = true;
    return cl;
  }

  kill(i) {
    if (this.data[i * 4 + 3] === 0) return;
    this.data[i * 4 + 3] = 0;
    const cl = this.clouds.get(this.cloud[i]);
    if (cl) { cl.alive--; }
    this.cloud[i] = -1; this.free.push(i);
  }

  removeCloud(id) {
    const cl = this.clouds.get(id); if (!cl) return;
    for (const i of cl.members) if (this.cloud[i] === id) this.kill(i);
    this.clouds.delete(id);
  }

  // eat everything within `r` of (x,y,z); returns count per type via cb(i, type, x,y,z)
  eatAt(x, y, z, r, cb) {
    const r2 = r * r, pos = this.pos, d = this.data;
    let n = 0;
    for (let i = 0; i < this.hi; i++) {
      if (d[i * 4 + 3] === 0) continue;
      const dx = pos[i * 3] - x; if (dx > r || dx < -r) continue;
      const dy = pos[i * 3 + 1] - y; if (dy > r || dy < -r) continue;
      const dz = pos[i * 3 + 2] - z; if (dz > r || dz < -r) continue;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      const t = this.type[i]; const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      const cl = this.clouds.get(this.cloud[i]);
      this.kill(i); n++; this.eaten++;
      cb(i, t, px, py, pz, cl);
    }
    return n;
  }

  // nearest living speck to a point (for the radar and lock-on); returns index or -1
  nearest(x, y, z, r) {
    const pos = this.pos, d = this.data; let best = -1, bd = r * r;
    for (let i = 0; i < this.hi; i++) {
      if (d[i * 4 + 3] === 0) continue;
      const dx = pos[i * 3] - x, dy = pos[i * 3 + 1] - y, dz = pos[i * 3 + 2] - z, q = dx * dx + dy * dy + dz * dz;
      if (q < bd) { bd = q; best = i; }
    }
    return best;
  }

  update(dt, px, py, pz, pr, panic, camera, height, currentXZ, floorFn, mouth = null) {
    this.uniforms.uPx.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const pos = this.pos, vel = this.vel, d = this.data;
    const t = performance.now() * 0.001;
    // clouds drift with the current and wander; members are attracted to their cloud's centre
    for (const cl of this.clouds.values()) {
      cl.cx += (currentXZ[0] * 0.05 + Math.sin(t * 0.13 + cl.id * 1.7) * 0.07) * dt; cl.cz += (currentXZ[1] * 0.05 + Math.cos(t * 0.11 + cl.id * 2.3) * 0.07) * dt;
      cl.cy += Math.sin(t * 0.09 + cl.id) * 0.02 * dt;
      const f = floorFn(cl.cx, cl.cz) + 0.3; if (cl.cy < f) cl.cy += (f - cl.cy) * Math.min(1, dt * 2);
      if (cl.cy > -0.6) cl.cy = -0.6;
    }
    const pr2 = (pr * 5) * (pr * 5);
    const mo = mouth && mouth.on, Ra = mo ? mouth.r * 3.4 : 0, Ra2 = Ra * Ra;
    for (let i = 0; i < this.hi; i++) {
      if (d[i * 4 + 3] === 0) continue;
      const cl = this.clouds.get(this.cloud[i]);
      const o = i * 3;
      let vx = vel[o], vy = vel[o + 1], vz = vel[o + 2];
      if (cl) {
        const dx = cl.cx - pos[o], dy = cl.cy - pos[o + 1], dz = cl.cz - pos[o + 2];
        const dl = Math.hypot(dx, dy, dz) || 1, pull = dl > cl.r ? 0.9 : 0.05;
        vx += dx / dl * pull * dt; vy += dy / dl * pull * dt; vz += dz / dl * pull * dt;
      }
      // brownian jitter
      const ph = d[i * 4 + 1] * 97.0 + t * 1.3;
      vx += Math.sin(ph) * 0.25 * dt; vy += Math.sin(ph * 1.31 + 1.0) * 0.12 * dt; vz += Math.cos(ph * 0.87) * 0.25 * dt;
      // copepods / glass shrimp dart away from the player
      if (this.type[i] === 1) {
        const dx = pos[o] - px, dy = pos[o + 1] - py, dz = pos[o + 2] - pz, q = dx * dx + dy * dy + dz * dz;
        if (q < pr2 * panic * panic) { const dl = Math.sqrt(q) || 1, k = (1.0 + 4 * panic) * dt * 6; vx += dx / dl * k; vy += dy / dl * k * 0.5; vz += dz / dl * k; }
      }
      // filter feeding: plankton in front of the mouth is drawn in; elsewhere the player's wake pushes things aside a little
      let drawn = false;
      if (mo) {
        const dx = mouth.x - pos[o], dy = mouth.y - pos[o + 1], dz = mouth.z - pos[o + 2], q = dx * dx + dy * dy + dz * dz;
        if (q < Ra2) { const dl = Math.sqrt(q) || 1, front = (-dx * mouth.fx - dy * mouth.fy - dz * mouth.fz) / dl; if (front > -0.25) { const k = (1 - dl / Ra) * 5.5 * dt; vx += dx / dl * k; vy += dy / dl * k; vz += dz / dl * k; drawn = true; } }
      }
      if (!drawn) {
        const dx = pos[o] - px, dy = pos[o + 1] - py, dz = pos[o + 2] - pz, q = dx * dx + dy * dy + dz * dz, rr = pr * 1.6;
        if (q < rr * rr) { const dl = Math.sqrt(q) || 1, k = (1 - dl / rr) * 0.9 * dt; vx += dx / dl * k; vy += dy / dl * k; vz += dz / dl * k; }
      }
      const damp = Math.exp(-dt * 2.2);
      vx *= damp; vy *= damp; vz *= damp;
      vel[o] = vx; vel[o + 1] = vy; vel[o + 2] = vz;
      pos[o] += vx * dt; pos[o + 1] += vy * dt; pos[o + 2] += vz * dt;
      const fl = floorFn(pos[o], pos[o + 2]) + 0.04; if (pos[o + 1] < fl) { pos[o + 1] = fl; vel[o + 1] = Math.abs(vel[o + 1]); }
      if (pos[o + 1] > -0.15) { pos[o + 1] = -0.15; vel[o + 1] = -Math.abs(vel[o + 1]); }
    }
    this.aPos.needsUpdate = true; this.aData.needsUpdate = true;
    this.geo.setDrawRange(0, this.hi);
    this.fx.update(dt, camera, height);
  }

  setHint(i, v) { this.data[i * 4 + 2] = v; }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Effect particles: additive sparkles/bubbles + normal-blended soft clouds (ink)
// ---------------------------------------------------------------------------------------------------------------------------------
class Fx {
  constructor(scene, cap) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3); this.data = new Float32Array(cap * 4); this.col = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.grav = new Float32Array(cap); this.grow = new Float32Array(cap); this.kind = new Uint8Array(cap);
    this.next = 0; this.live = 0;
    const mk = (frag, blending) => {
      const g = new THREE.BufferGeometry();
      const aPos = new THREE.BufferAttribute(this.pos, 3); aPos.setUsage(THREE.DynamicDrawUsage);
      const aData = new THREE.BufferAttribute(this.data, 4); aData.setUsage(THREE.DynamicDrawUsage);
      const aCol = new THREE.BufferAttribute(this.col, 3); aCol.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', aPos); g.setAttribute('aData', aData); g.setAttribute('aCol', aCol);
      const m = new THREE.ShaderMaterial({ uniforms: this.uniforms ?? (this.uniforms = Object.assign({}, U, { uPx: { value: 900 } })), vertexShader: FX_VERT, fragmentShader: frag, blending, transparent: true, depthWrite: false, depthTest: true });
      const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
      return { p, g, aPos, aData, aCol };
    };
    this.a = mk(FX_FRAG_ADD, THREE.AdditiveBlending); this.a.p.renderOrder = 12;
    this.n = mk(FX_FRAG_ALPHA, THREE.NormalBlending); this.n.p.renderOrder = 9;
    // the two materials draw the same arrays; a particle is visible in the pass that matches its kind (alive flag w = 1 additive, 2 normal)
    this.na = new Float32Array(cap * 4);
    this.n.g.setAttribute('aData', (this.n.aData = new THREE.BufferAttribute(this.na, 4)));
    this.n.aData.setUsage(THREE.DynamicDrawUsage);
  }

  spawn(kind, x, y, z, vx, vy, vz, size, life, r, g, b, alpha = 1, grav = 0, grow = 0) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    const o = i * 3;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz;
    this.col[o] = r; this.col[o + 1] = g; this.col[o + 2] = b;
    this.data[i * 4] = size; this.data[i * 4 + 1] = alpha; this.data[i * 4 + 2] = 0; this.data[i * 4 + 3] = kind === 0 ? 1 : 0;
    this.na[i * 4] = size; this.na[i * 4 + 1] = alpha; this.na[i * 4 + 2] = 1; this.na[i * 4 + 3] = kind === 1 ? 1 : 0;
    this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.grow[i] = grow; this.kind[i] = kind;
  }

  // sparkle burst (additive)
  burst(x, y, z, n, col, speed = 1, size = 0.03, life = 0.7, spread = 1) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, b = Math.acos(2 * Math.random() - 1), s = speed * (0.3 + Math.random() * 0.9);
      this.spawn(0, x, y, z, Math.sin(b) * Math.cos(a) * s * spread, Math.cos(b) * s * spread, Math.sin(b) * Math.sin(a) * s * spread, size * (0.6 + 0.8 * Math.random()), life * (0.6 + 0.7 * Math.random()), col[0], col[1], col[2], 1, 0, 0);
    }
  }
  bubbles(x, y, z, n, size = 0.02, spread = 0.1) {
    for (let k = 0; k < n; k++) this.spawn(0, x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 0.15, 0.25 + Math.random() * 0.25, (Math.random() - 0.5) * 0.15, size * (0.5 + Math.random()), 1.4 + Math.random() * 1.2, 0.55, 0.75, 0.9, 0.5, 0.1, 0);
  }
  ink(x, y, z, n, radius, col = [0.02, 0.02, 0.03], life = 6) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, b = Math.acos(2 * Math.random() - 1), r = radius * Math.cbrt(Math.random());
      this.spawn(1, x + Math.sin(b) * Math.cos(a) * r * 0.4, y + Math.cos(b) * r * 0.3, z + Math.sin(b) * Math.sin(a) * r * 0.4, Math.sin(b) * Math.cos(a) * radius * 0.12, Math.cos(b) * 0.03, Math.sin(b) * Math.sin(a) * radius * 0.12, radius * (0.45 + 0.5 * Math.random()), life * (0.7 + 0.5 * Math.random()), col[0], col[1], col[2], 0.55, 0, 0.1);
    }
  }
  ring(x, y, z, radius, n, col, life = 0.9) {
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, c = Math.cos(a), s = Math.sin(a);
      this.spawn(0, x, y, z, c * radius / life, 0.0, s * radius / life, 0.022, life, col[0], col[1], col[2], 1, 0, 0);
    }
  }

  update(dt, camera, height) {
    this.uniforms.uPx.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    let live = 0;
    for (let i = 0; i < this.cap; i++) {
      const L = this.life[i];
      if (L <= 0) continue;
      const o = i * 3;
      this.life[i] = L - dt;
      if (this.life[i] <= 0) { this.data[i * 4 + 3] = 0; this.na[i * 4 + 3] = 0; continue; }
      live++;
      const k = this.life[i] / this.max[i];
      this.vel[o + 1] += this.grav[i] * dt;
      const dmp = Math.exp(-dt * 1.2);
      this.vel[o] *= dmp; this.vel[o + 1] *= dmp; this.vel[o + 2] *= dmp;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 1] > -0.05) this.life[i] = 0;
      const a = this.kind[i] === 1 ? Math.min(1, k * 3) * Math.min(1, (1 - k) * 8 + 0.2) * 0.5 : Math.min(1, k * 2.2);
      if (this.kind[i] === 1) { this.na[i * 4 + 1] = a; this.na[i * 4] += this.grow[i] * dt * this.na[i * 4] * 3; }
      else this.data[i * 4 + 1] = a;
    }
    this.live = live;
    for (const q of [this.a, this.n]) { q.aPos.needsUpdate = true; q.aData.needsUpdate = true; q.aCol.needsUpdate = true; }
  }
}
export { Fx };
