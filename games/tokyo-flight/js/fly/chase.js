// chase.js — the cameras while flying.
//   chase     behind and above, on a soft arm: it lags the turn-in, eases out under power, leans a third of the bank
//   cockpit   the pilot's eye
//   flyby     a camera standing still ahead of the aircraft that follows it past, then finds a new spot
// Looking around (drag, right stick) is 1:1 and stays where it is left; V or a double tap puts it back.
import * as THREE from 'three';
import { EYE } from './jet.js';

const D2R = Math.PI / 180, clamp = THREE.MathUtils.clamp;
export const VIEWS = ['chase', 'cockpit', 'flyby'];

export class Rig {
  constructor(camera, flight, jet, world) {
    this.camera = camera; this.flight = flight; this.jet = jet; this.world = world;
    this.mode = 'chase';
    this.look = { yaw: 0, pitch: 0 };          // radians, the viewer's own offset
    this.dist = 11.5; this.height = 2.5;
    this.q = new THREE.Quaternion(); this.ready = false;       // the arm's own (smoothed) direction
    this.pull = 0; this.fov = 55; this.shake = new THREE.Vector3(); this.t = 0; this.vPrev = 0;
    this.spot = new THREE.Vector3(); this.spotAge = 1e9;
    this.eye = jet.body(EYE.x, EYE.y, EYE.z);
    this._f = new THREE.Vector3(); this._u = new THREE.Vector3(); this._r = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._m = new THREE.Matrix4(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.near = 0.3;
  }

  set(mode) {
    this.mode = mode; this.look.yaw = 0; this.look.pitch = 0; this.spotAge = 1e9;
    this.jet.cockpit(mode === 'cockpit');
  }
  next() { this.set(VIEWS[(VIEWS.indexOf(this.mode) + 1) % VIEWS.length]); return this.mode; }
  recentre() { this.look.yaw = 0; this.look.pitch = 0; }
  // drag in pixels -> the view turns with it, 1:1
  drag(dx, dy, perPx = 0.0042) {
    this.look.yaw -= dx * perPx;
    this.look.pitch = clamp(this.look.pitch - dy * perPx, this.mode === 'cockpit' ? -1.1 : -1.25, this.mode === 'cockpit' ? 1.3 : 1.35);
    if (this.mode === 'cockpit') this.look.yaw = clamp(this.look.yaw, -2.6, 2.6);
  }
  zoom(k) { this.dist = clamp(this.dist * k, 6.5, 60); }

  // the direction the arm wants: along the flight path (the nose when slow), leaning part of the bank
  target(out) {
    const F = this.flight, v = F.V, f = this._f;
    if (v > 12 && !F.onGround) f.copy(F.vel).multiplyScalar(1 / v).lerp(this._u.set(0, 0, -1).applyQuaternion(F.quat), 0.45).normalize();
    else f.set(0, 0, -1).applyQuaternion(F.quat);
    const yaw = Math.atan2(-f.x, -f.z), pitch = Math.asin(clamp(f.y, -1, 1));
    return out.setFromEuler(this._e.set(pitch * 0.85, yaw, -F.bank * 0.34, 'YXZ'));
  }

  snap() { this.target(this.q); this.ready = true; this.pull = 0; }

  update(dt) {
    const cam = this.camera, F = this.flight, J = this.jet.root;
    this.t += dt;
    if (!this.ready) this.snap();
    const acc = dt > 0 ? (F.V - this.vPrev) / dt : 0; this.vPrev = F.V;
    // what the air is doing to the airframe, felt as a tremor in the picture
    const amp = 0.012 * F.buffet + 0.0025 * F.spool + 0.004 * clamp((F.n - 2.5) / 3, 0, 1) + (F.onGround ? 0.006 * Math.min(F.V / 40, 1) : 0);
    const t = this.t;
    this.shake.set(Math.sin(t * 61) + Math.sin(t * 37.3 + 1), Math.sin(t * 53 + 2) + Math.sin(t * 43.1), Math.sin(t * 47 + 4)).multiplyScalar(amp);

    if (this.mode === 'cockpit') {
      const p = this._p.copy(this.eye);
      p.y -= clamp((F.n - 1) * 0.012, -0.03, 0.05);                 // the head sinks under g
      p.z += clamp(acc * 0.0025, -0.03, 0.03);
      p.add(this.shake);
      cam.position.copy(p).applyQuaternion(J.quaternion).add(J.position);
      cam.quaternion.copy(J.quaternion).multiply(this._q.setFromEuler(this._e.set(this.look.pitch - 0.10, this.look.yaw, 0, 'YXZ')));
      this.fov += (68 - this.fov) * (1 - Math.exp(-dt * 6)); this.near = 0.03;
    } else if (this.mode === 'flyby') {
      this.spotAge += dt;
      const away = this._p.copy(J.position).sub(this.spot).dot(F.vel) > 0;
      let fresh = false;
      if (this.spotAge > 1e8 || (away && this.spot.distanceTo(J.position) > 420) || this.spotAge > 14) {
        // ahead of the aircraft, off to one side, a little below it, clear of the ground and the roofs
        const side = Math.sin(this.t * 7.7) > 0 ? 1 : -1, lead = clamp(F.V, 40, 140) * 1.9;
        const f = this._f.copy(F.vel).setY(0).normalize(), r = this._r.set(-f.z, 0, f.x);
        const s = this.spot.copy(J.position).addScaledVector(F.vel, 1.9).addScaledVector(r, side * (16 + lead * 0.08));
        s.y = J.position.y + F.vel.y * 1.9 - 5;
        const floor = Math.max(this.world.ground(s.x, s.z).y + 1.7, this.world.roof(s.x, s.y, s.z) + 1.5);
        if (s.y < floor) s.y = floor;
        this.spotAge = 0; fresh = true;
      }
      cam.position.copy(this.spot);
      const d = cam.position.distanceTo(J.position);
      this._m.lookAt(cam.position, J.position, this._u.set(0, 1, 0));
      cam.quaternion.setFromRotationMatrix(this._m).multiply(this._q.setFromEuler(this._e.set(this.shake.y * 0.3, this.shake.x * 0.3, 0)));
      const want = clamp((2 * Math.atan(9 / Math.max(d, 12))) / D2R, 13, 55);      // close to a quarter of the frame, without a lens so long the far ground smears
      this.fov = fresh ? want : this.fov + (want - this.fov) * (1 - Math.exp(-dt * 5)); this.near = clamp(d * 0.2, 0.5, 20);
    } else {
      this.target(this._q2);
      this.q.slerp(this._q2, 1 - Math.exp(-dt * (F.onGround ? 3 : 4.2)));
      this.pull += (clamp(acc * 0.11, -1.2, 2.2) - this.pull) * (1 - Math.exp(-dt * 2.2));
      const q = this._q.copy(this.q).multiply(this._q2.setFromEuler(this._e.set(this.look.pitch, this.look.yaw, 0, 'YXZ')));
      const looking = Math.min(1, Math.abs(this.look.yaw) + Math.abs(this.look.pitch));
      const p = this._p.set(0, this.height * (1 - 0.6 * looking), this.dist + this.pull).applyQuaternion(q).add(J.position);
      const floor = this.world.ground(p.x, p.z).y + 0.9;
      if (p.y < floor) p.y = floor;
      cam.position.copy(p).add(this.shake.multiplyScalar(6));
      // look past the aircraft, at a point ahead of it
      const aim = this._f.set(0, 0.9, -14 * (1 - looking)).applyQuaternion(q).add(J.position);
      this._m.lookAt(cam.position, aim, this._u.set(0, 1, 0).applyQuaternion(q));
      cam.quaternion.setFromRotationMatrix(this._m);
      const want = 54 + 9 * clamp((F.V - 70) / 70, 0, 1);
      this.fov += (want - this.fov) * (1 - Math.exp(-dt * 2)); this.near = 0.35;
    }
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; }
    cam.updateMatrixWorld();
  }
}
