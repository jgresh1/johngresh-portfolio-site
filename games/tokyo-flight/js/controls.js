// controls.js — map-style camera. The cursor is never captured.
//   drag            move: the ground point under the cursor stays under the cursor
//   right-drag      turn / tilt about the point that was under the cursor (1:1, no coast)
//   wheel           move towards / away from the point under the cursor
//   W A S D         fly level, R / F up and down, Q / E turn, Shift = faster
//   touch           one finger moves, two fingers pinch, twist and tilt
import * as THREE from 'three';
import { geoToWorld, worldToGeo } from './geo.js';

const D2R = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;

export class MapControls {
  constructor(camera, dom, { pick, groundY }) {
    this.camera = camera; this.dom = dom; this.pick = pick; this.groundY = groundY;
    this.yaw = 0; this.pitch = -0.5;                 // radians; yaw turns left, pitch < 0 looks down
    this.minPitch = -89.5 * D2R; this.maxPitch = 25 * D2R;
    this.turnRate = 0.22 * D2R;                      // radians per pixel
    this.keys = new Set(); this.pointers = new Map(); this.drag = null; this.flight = null;
    this.zoom = null;                                // { pivot, remain } short glide for the wheel
    this.onMoveStart = () => {}; this.onClick = () => {};
    this._v = new THREE.Vector3(); this._q = new THREE.Vector3(); this._ray = new THREE.Ray();
    this._ndc = new THREE.Vector2();
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => this.down(e));
    dom.addEventListener('pointermove', (e) => this.move(e));
    dom.addEventListener('pointerup', (e) => this.up(e));
    dom.addEventListener('pointercancel', (e) => this.up(e));
    dom.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return; this.keys.add(e.code); if (this.moveKeys()) this.cancelFlight(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  /* ---------------------------------------------------------------- pose */
  forward(out = new THREE.Vector3(), yaw = this.yaw, pitch = this.pitch) {
    const c = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
  }
  apply() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
  }
  // look at a place: heading in degrees clockwise from north, pitch in degrees below the horizon, range in metres
  setView({ lat, lon, heading = 0, pitch = 30, range = 1500, elev = null, lift = 0 }) {
    const t = geoToWorld(lat, lon, elev ?? 0);
    if (elev == null) t.y = this.groundY(t.x, t.z);
    t.y += lift;
    this.yaw = -heading * D2R; this.pitch = clamp(-pitch * D2R, this.minPitch, this.maxPitch);
    this.camera.position.copy(t).addScaledVector(this.forward(this._v), -range);
    this.flight = null; this.zoom = null;
    this.apply();
  }
  getView() {
    const g = worldToGeo(this.camera.position);
    return { lat: g.lat, lon: g.lon, elev: g.elev, heading: ((-this.yaw / D2R) % 360 + 360) % 360, pitch: -this.pitch / D2R };
  }
  setPose({ lat, lon, elev, heading, pitch }) {
    geoToWorld(lat, lon, elev, this.camera.position);
    this.yaw = -heading * D2R; this.pitch = clamp(-pitch * D2R, this.minPitch, this.maxPitch);
    this.flight = null; this.zoom = null; this.apply();
  }

  /* ---------------------------------------------------------------- flights */
  flyTo(place, seconds = null) {
    const cam = this.camera;
    const T = geoToWorld(place.lat, place.lon, 0); T.y = this.groundY(T.x, T.z) + (place.lift || 0);
    const f0 = this.forward(new THREE.Vector3());
    // the point the camera is looking at now
    const g = this.pick(0, 0);
    const r0 = g ? clamp(g.distanceTo(cam.position), 50, 40000) : clamp((cam.position.y - this.groundY(cam.position.x, cam.position.z)) / Math.max(-f0.y, 0.15), 50, 40000);
    const L0 = cam.position.clone().addScaledVector(f0, r0);
    const yaw1 = -(place.heading ?? 0) * D2R;
    let dy = (yaw1 - this.yaw) % (2 * Math.PI); if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    const dist = L0.distanceTo(T);
    this.flight = {
      t: 0, dur: seconds ?? clamp(1.8 + dist / 5000, 2.2, 6.5),
      L0, L1: T, r0, r1: place.range ?? 1500, yaw0: this.yaw, dyaw: dy, p0: this.pitch, p1: clamp(-(place.pitch ?? 30) * D2R, this.minPitch, this.maxPitch),
      hump: clamp(dist * 0.42, 0, 45000),
    };
    this.zoom = null; this.drag = null;
  }
  cancelFlight() { if (this.flight) { this.flight = null; } }

  /* ---------------------------------------------------------------- pointer */
  ndc(e, out = this._ndc) {
    const r = this.dom.getBoundingClientRect();
    return out.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  rayAt(nx, ny, out = this._ray) {
    out.origin.copy(this.camera.position);
    out.direction.set(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    return out;
  }

  down(e) {
    try { this.dom.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    this.cancelFlight(); this.zoom = null;
    this.onMoveStart();
    const n = this.ndc(e), hit = this.pick(n.x, n.y);
    if (this.pointers.size === 2) return this.startPinch();
    const turn = e.button === 2 || e.button === 1 || e.ctrlKey || e.shiftKey || e.altKey;
    this.drag = {
      mode: turn ? 'turn' : 'pan', id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: 0, button: e.button,
      grab: hit ? hit.clone() : null, cam0: this.camera.position.clone(), yaw0: this.yaw, pitch0: this.pitch,
    };
    if (!hit && !turn) this.drag.mode = 'look';       // grabbed the sky: turn in place
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pinch) return this.movePinch();
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
    if (d.moved < 3) return;
    const cam = this.camera;
    if (d.mode === 'pan') {
      // keep the grabbed point under the cursor: slide the camera over the level plane through it
      cam.position.copy(d.cam0); this.apply();
      const n = this.ndc(e), ray = this.rayAt(n.x, n.y);
      const h = d.cam0.y - d.grab.y;
      let dirY = ray.direction.y;
      const lim = -Math.max(Math.abs(h), 2) / Math.max(40 * Math.abs(h), 4000);      // do not chase the horizon
      if (h > 0 && dirY > lim) dirY = lim; else if (h < 0 && dirY < -lim) dirY = -lim;
      const t = (d.grab.y - d.cam0.y) / dirY;
      const hl = Math.hypot(ray.direction.x, ray.direction.z) || 1, s = Math.sqrt(Math.max(1 - dirY * dirY, 0)) / hl;
      const qx = d.cam0.x + ray.direction.x * s * t, qz = d.cam0.z + ray.direction.z * s * t;
      cam.position.set(d.cam0.x + d.grab.x - qx, d.cam0.y, d.cam0.z + d.grab.z - qz);
    } else if (d.mode === 'turn' && d.grab) {
      this.orbit(d.grab, d.cam0, d.yaw0, d.pitch0, -dx * this.turnRate, -dy * this.turnRate, 1);
    } else {
      this.yaw = d.yaw0 - dx * this.turnRate;                  // turn in place: drag right looks right
      this.pitch = clamp(d.pitch0 - dy * this.turnRate, this.minPitch, this.maxPitch);
    }
    this.clampToGround(); this.apply();
  }

  // camera rotated rigidly about a pivot: the pivot keeps its place on screen
  orbit(pivot, cam0, yaw0, pitch0, dYaw, dPitch, scale) {
    const pitch = clamp(pitch0 + dPitch, this.minPitch, this.maxPitch), dp = pitch - pitch0;
    const o = this._v.copy(cam0).sub(pivot);
    const right = this._q.set(Math.cos(yaw0), 0, -Math.sin(yaw0));
    o.applyAxisAngle(right, dp).applyAxisAngle(THREE.Object3D.DEFAULT_UP, dYaw).multiplyScalar(scale);
    this.camera.position.copy(pivot).add(o);
    this.yaw = yaw0 + dYaw; this.pitch = pitch;
  }

  up(e) {
    const d = this.drag;
    this.pointers.delete(e.pointerId);
    try { this.dom.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (this.pinch) { this.pinch = null; this.drag = null; return; }
    if (d && d.id === e.pointerId) {
      this.drag = null;
      if (d.moved < 4 && d.button === 0 && e.type === 'pointerup') this.onClick(e);
    }
  }

  startPinch() {
    const [a, b] = [...this.pointers.values()];
    const r = this.dom.getBoundingClientRect();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const n = this._ndc.set(((mx - r.left) / r.width) * 2 - 1, -((my - r.top) / r.height) * 2 + 1);
    const hit = this.pick(n.x, n.y);
    this.drag = null;
    if (!hit) { this.pinch = null; return; }
    this.pinch = { pivot: hit.clone(), d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, a0: Math.atan2(b.y - a.y, b.x - a.x), y0: my, cam0: this.camera.position.clone(), yaw0: this.yaw, pitch0: this.pitch };
  }
  movePinch() {
    const [a, b] = [...this.pointers.values()], p = this.pinch;
    if (!b) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2;
    let da = ang - p.a0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    this.orbit(p.pivot, p.cam0, p.yaw0, p.pitch0, da, -(my - p.y0) * this.turnRate, clamp(p.d0 / d, 0.02, 50));
    this.clampToGround(); this.apply();
  }

  wheel(e) {
    e.preventDefault();
    this.cancelFlight(); this.onMoveStart();
    const n = this.ndc(e), hit = this.pick(n.x, n.y);
    const step = clamp(e.deltaY * (e.deltaMode === 1 ? 33 : 1), -400, 400) * 0.0016;       // log distance per notch
    let pivot = hit;
    if (!pivot) {
      const alt = Math.max(this.camera.position.y - this.groundY(this.camera.position.x, this.camera.position.z), 30);
      pivot = this.rayAt(n.x, n.y).at(alt * 4, new THREE.Vector3());
    }
    if (this.zoom) this.zoom.remain += step; else this.zoom = { pivot: pivot.clone(), remain: step };
    this.zoom.pivot.copy(pivot);
  }

  moveKeys() {
    const k = this.keys;
    return k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD') || k.has('KeyR') || k.has('KeyF') || k.has('KeyQ') || k.has('KeyE')
      || k.has('ArrowUp') || k.has('ArrowDown') || k.has('ArrowLeft') || k.has('ArrowRight');
  }

  clampToGround() {
    const p = this.camera.position, g = this.groundY(p.x, p.z) + 1.6;
    if (p.y < g) p.y = g;
    if (p.y > 60000) p.y = 60000;
  }

  update(dt) {
    const cam = this.camera, k = this.keys;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(f.t + dt / f.dur, 1);
      const s = f.t * f.t * f.t * (f.t * (f.t * 6 - 15) + 10);
      this.yaw = f.yaw0 + f.dyaw * s; this.pitch = f.p0 + (f.p1 - f.p0) * s;
      const r = Math.exp(Math.log(f.r0) + (Math.log(f.r1) - Math.log(f.r0)) * s) + f.hump * Math.sin(Math.PI * s) ** 2;
      const L = this._q.copy(f.L0).lerp(f.L1, s);
      cam.position.copy(L).addScaledVector(this.forward(this._v), -r);
      if (f.t >= 1) this.flight = null;
      this.clampToGround(); this.apply();
      return;
    }
    if (this.zoom) {
      const z = this.zoom, a = 1 - Math.exp(-dt * 16), part = z.remain * a;
      z.remain -= part;
      const o = this._v.copy(cam.position).sub(z.pivot), len = o.length();
      const nl = Math.max(len * Math.exp(part), 3);
      if (len > 1e-3) cam.position.copy(z.pivot).addScaledVector(o, nl / len);
      if (Math.abs(z.remain) < 1e-4) this.zoom = null;
    }
    if (this.moveKeys()) {
      const alt = Math.max(cam.position.y - this.groundY(cam.position.x, cam.position.z), 12);
      const sp = alt * 1.1 * (k.has('ShiftLeft') || k.has('ShiftRight') ? 3.5 : 1) * dt;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      let mf = 0, ms = 0, mu = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) mf += 1; if (k.has('KeyS') || k.has('ArrowDown')) mf -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ms += 1; if (k.has('KeyA') || k.has('ArrowLeft')) ms -= 1;
      if (k.has('KeyR')) mu += 1; if (k.has('KeyF')) mu -= 1;
      cam.position.x += (fx * mf - fz * ms) * sp; cam.position.z += (fz * mf + fx * ms) * sp; cam.position.y += mu * sp * 0.8;
      if (k.has('KeyQ')) this.yaw += 0.9 * dt; if (k.has('KeyE')) this.yaw -= 0.9 * dt;
    }
    this.clampToGround(); this.apply();
  }
}
