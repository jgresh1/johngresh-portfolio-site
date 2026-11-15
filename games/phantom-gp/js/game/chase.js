// chase.js — the race cameras: two chase views, the roll-hoop camera and the nose camera.
import * as THREE from 'three';
import { surfaceAt } from '../track/world.js';

const V = THREE.Vector3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
export const CAM_MODES = ['Chase', 'Far chase', 'Onboard', 'Nose'];

export class Chase {
  constructor(camera) {
    this.cam = camera; this.mode = 0;
    this.dir = new V(1, 0, 0); this.pos = new V(); this.look = new V(); this.fov = 60; this.roll = 0; this.t = 0; this.y = 0; this.side = 0;
    this._a = new V(); this._b = new V(); this._r = new V(); this._up = new V(0, 1, 0); this.first = true;
  }
  cycle() { this.mode = (this.mode + 1) % CAM_MODES.length; this.first = true; return CAM_MODES[this.mode]; }
  snap() { this.first = true; }

  // view: CarView (pos, fwd, up), b: sim body. Returns nothing; moves the camera.
  update(dt, view, b) {
    const cam = this.cam, v = Math.abs(b.u), a = this._a, r = this._r;
    this.t += dt;
    r.crossVectors(view.fwd, view.up).normalize();
    const shakeAmp = 0.003 + 0.013 * (v / 90) ** 2 + 0.06 * b.impact + (b.surface !== 1 ? 0.035 * clamp(v / 40, 0, 1) : 0) + (b.kerb ? 0.014 * clamp(v / 50, 0, 1) : 0);
    const sx = (Math.sin(this.t * 71.3) + Math.sin(this.t * 113.7 + 1.3)) * 0.5 * shakeAmp, sy = (Math.sin(this.t * 83.9 + 0.7) + Math.sin(this.t * 127.1)) * 0.5 * shakeAmp;
    let fovT;
    if (this.mode <= 1) {
      const far = this.mode === 1;
      // the camera trails the direction the car is moving, a touch behind its heading, so slides show
      a.copy(view.fwd).multiplyScalar(Math.max(b.u, 6)).addScaledVector(r, b.w * 0.6).normalize();
      if (this.first) this.dir.copy(a); else this.dir.lerp(a, 1 - Math.exp(-(far ? 5 : 7.5) * dt)).normalize();
      const dist = (far ? 8.4 : 5.5) + v * 0.011 + b.boost * 0.5, h = (far ? 2.5 : 1.42) + v * 0.002;
      this.side = damp(this.side, clamp(b.yaw * 1.6, -1.6, 1.6), 3, dt);
      a.copy(view.pos).addScaledVector(this.dir, -dist).addScaledVector(view.up, h * 0.35); a.y += h * 0.65;
      a.addScaledVector(r, -this.side * 0.35);
      if (this.first) this.y = a.y; else this.y = damp(this.y, a.y, 14, dt);
      a.y = Math.max(this.y, surfaceAt(a.x, a.z) + 0.55);
      this.pos.copy(a);
      this.look.copy(view.pos).addScaledVector(this.dir, 7 + v * 0.07).addScaledVector(r, this.side * 1.3); this.look.y += 0.95;
      cam.position.copy(this.pos); cam.position.x += r.x * sx; cam.position.z += r.z * sx; cam.position.y += sy;
      cam.up.set(0, 1, 0); cam.lookAt(this.look);
      this.roll = damp(this.roll, clamp(-b.ay * 0.0006 - (b.bank || 0) * 0.5, -0.09, 0.09), 5, dt);
      cam.rotateZ(this.roll);
      fovT = (far ? 54 : 58) + 15 * (v / 90) ** 1.3 + 4 * b.boost;
      if (Math.abs(cam.near - 0.3) > 1e-3) { cam.near = 0.3; this.fov = 0; }
    } else {
      const nose = this.mode === 3;
      a.copy(view.pos).addScaledVector(view.fwd, nose ? 2.25 : -0.02).addScaledVector(view.up, nose ? 0.5 : 1.09);
      this.pos.copy(a);
      this.look.copy(a).addScaledVector(view.fwd, 12).addScaledVector(view.up, nose ? -0.2 : -1.9).addScaledVector(r, clamp(b.yaw * 2.2, -3, 3));
      cam.position.copy(this.pos).addScaledVector(r, sx * 0.5).addScaledVector(view.up, sy * 0.5);
      cam.up.copy(view.up); cam.lookAt(this.look);
      fovT = (nose ? 66 : 60) + 12 * (v / 90) ** 1.3 + 3 * b.boost;
      if (Math.abs(cam.near - 0.12) > 1e-3) { cam.near = 0.12; this.fov = 0; }
    }
    const f = this.first || this.fov === 0 ? fovT : damp(this.fov, fovT, 4, dt);
    if (Math.abs(f - this.fov) > 0.02) { this.fov = f; cam.fov = f; cam.updateProjectionMatrix(); }
    this.first = false;
  }
}
