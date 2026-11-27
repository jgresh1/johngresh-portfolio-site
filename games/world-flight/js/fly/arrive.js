// arrive.js — the few seconds between picking a place and flying it. One continuous move, no shake.
//
//   in the air    from high behind the aircraft, down and alongside, then round into the seat you fly from
//   on a runway   a crane shot down from high over the runway ahead of the aircraft, then round behind it
//
// The aircraft is flown along a straight line meanwhile (or stands on the runway), so the stick is handed over with
// everything already moving. Everything is a function of the time since it began.
import * as THREE from 'three';
import { geoToWorld } from '../geo.js';

const D2R = Math.PI / 180, clamp = THREE.MathUtils.clamp;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1), ease = (k) => k * k * (3 - 2 * k), mix = (a, b, k) => a + (b - a) * k;
const AIR = { reveal: 5.2, round: 3.2 }, RW = { crane: 5.6, round: 3.8 };

export class Arrival {
  // jet(): the aircraft's holder now; view(): its chase-camera numbers ({ dist })
  constructor({ jet, view, flight, rig, sound, world, camera }) {
    Object.assign(this, { jet, view, flight, rig, sound, world, camera });
    this.t = 0; this.end = 0; this.kind = 'air'; this.playing = false;
    this.base = new THREE.Vector3(); this.F = new THREE.Vector3(); this.R = new THREE.Vector3();
    this._p = new THREE.Vector3(); this._c = new THREE.Vector3(); this._u = new THREE.Vector3(0, 1, 0);
    this.state = { exposure: 0, bars: 1, hud: 0, near: 0.3, done: false };
    this.prevD = 0; this._round = false;
  }

  // { kind: 'air', lat, lon, heading, alt (m above the ground), speed, throttle } or { kind: 'runway', runway, far }
  begin(s) {
    this.s = s; this.kind = s.kind; this.t = 0; this.playing = true; this._round = false;
    this.end = s.kind === 'runway' ? RW.crane + RW.round : AIR.reveal + AIR.round;
    if (s.kind === 'runway') {
      const R = s.runway; this.heading = s.far ? (R.heading + 180) % 360 : R.heading;
      // metres ahead of the aircraft along the take-off run, metres to its right -> a point on the runway's surface
      this.rp = (ahead, right, out) => (s.far ? R.point(R.length - 30 - ahead, -right, out) : R.point(30 + ahead, right, out));
    } else {
      const h = s.heading * D2R;
      this.heading = s.heading; this.speed = s.speed ?? 96; this.throttle = s.throttle ?? 0.68;
      this.F.set(Math.sin(h), 0, -Math.cos(h)); this.R.set(Math.cos(h), 0, Math.sin(h));
      geoToWorld(s.lat, s.lon, 0, this.base);
      // level flight, clear of everything for the first four kilometres ahead
      let top = -1e9; for (let d = -300; d <= 4200; d += 150) top = Math.max(top, this.world.ground(this.base.x + this.F.x * d, this.base.z + this.F.z * d).y);
      this.y0 = top + (s.alt ?? 450);
    }
    this.rig.set('chase');
    return this.at(0, 0);
  }
  rail(tau, out = this._p) { return out.copy(this.base).addScaledVector(this.F, this.speed * tau).setY(this.y0); }
  // where the first view will be from, so its ground can be loaded before the picture comes up
  firstView(cam) { if (this.kind === 'runway') this.crane(0, cam); else { this.reveal(0, this.rail(0), cam); cam.fov = 38; cam.updateMatrixWorld(); } }

  update(dt) {
    if (!this.playing) return this.state;
    this.t = Math.min(this.t + dt, this.end);
    const s = this.at(this.t, dt);
    if (this.t >= this.end) { this.playing = false; s.done = true; }
    return s;
  }
  skip() { this.t = this.end; }

  reveal(k, P, cam) {
    const e = 1 - Math.pow(1 - k, 1.8), U = this._u.set(0, 1, 0), z = this.view().dist / 11.5;
    cam.position.copy(P).addScaledVector(this.F, mix(-130, -8, e) * z).addScaledVector(this.R, mix(36, 12, e) * z).addScaledVector(U, mix(46, 1.6, e) * z);
    cam.up.set(0, 1, 0); cam.lookAt(this._c.copy(P).addScaledVector(this.F, mix(260, 7, ease(e))).addScaledVector(U, mix(-8, 0, e)));
    return mix(36, 40, e);
  }
  crane(k, cam) {
    const P = this.rp(0, 0, this._p), e = 1 - Math.pow(1 - k, 1.7), z = this.view().dist / 11.5;
    this.rp(mix(215, 64, e) * z, mix(-36, -6.5, e) * z, cam.position); cam.position.y += mix(26, 1.35, e) * z;
    cam.up.set(0, 1, 0); cam.lookAt(this._c.copy(P).setY(P.y + mix(1.8, 0.95, e)));
    cam.fov = mix(27, 19, e) * Math.max(1, 1.35 / Math.max(cam.aspect, 0.4)); cam.updateMatrixWorld();
    return P;
  }

  at(t, dt = 0) {
    const st = this.state, J = this.jet(), F = this.flight, cam = this.camera, Rg = this.rig, dist0 = this.view().dist;
    st.done = false;
    let where = 'film', P;
    if (this.kind === 'runway') {
      P = this.rp(0, 0, this._p);
      F.place({ x: P.x, y: P.y, z: P.z, heading: this.heading, speed: 0, throttle: 0, ground: true });
      F.agl = F.spec.gearH;
      J.root.position.copy(F.pos); J.root.quaternion.copy(F.quat);
      J.uHeat.value = 0.12; J.uLamp.value = 0.9;
      J.pose(dt, { throttle: 0.06, parked: 0, pitch: 0.25 * Math.sin(t * 2.2) * (t < 1.6 ? 1 : 0), sweep: 0 });
      if (t < RW.crane) { this._round = false; this.crane(seg(t, 0, RW.crane), cam); }
      else {
        const k = ease(seg(t, RW.crane, RW.crane + RW.round - 0.25));
        if (!this._round || dt === 0) { Rg.snap(); this._round = true; }
        Rg.look.yaw = mix(-2.7, 0, k); Rg.look.pitch = mix(0.16, 0, k); Rg.dist = mix(dist0 * 1.4, dist0, k);
        Rg.update(dt); where = 'chase';
      }
      const dist = cam.position.distanceTo(F.pos);
      this.sound.update({ spool: 0.3, speed: 0, where, dist, closing: 0, ground: true });
      st.near = t < RW.crane ? clamp(dist * 0.25, 0.3, 12) : Rg.near;
    } else {
      P = this.rail(t, this._p);
      F.place({ x: P.x, y: P.y, z: P.z, heading: this.heading, pitch: 0.5 * Math.sin(t * 0.7), roll: 2.4 * Math.sin(t * 0.9 + 0.6), speed: this.speed, throttle: this.throttle });
      F.agl = P.y - this.world.ground(P.x, P.z).y;
      J.root.position.copy(F.pos); J.root.quaternion.copy(F.quat);
      J.uHeat.value = 0.4; J.uLamp.value = 0.9;
      J.pose(dt, { roll: 0.12 * Math.sin(t * 0.9 + 2.2), pitch: 0.06 * Math.sin(t * 0.7), throttle: this.throttle, parked: 0, sweep: F.sweep });
      let fov = 40;
      if (t < AIR.reveal) { this._round = false; fov = this.reveal(seg(t, 0, AIR.reveal), P, cam); cam.fov = fov * Math.max(1, 1.35 / Math.max(cam.aspect, 0.4)); cam.updateMatrixWorld(); }
      else {
        const k = ease(seg(t, AIR.reveal, this.end - 0.25));
        if (!this._round || dt === 0) { Rg.snap(); this._round = true; }
        Rg.look.yaw = mix(-0.36, 0, k); Rg.look.pitch = mix(0.10, 0, k); Rg.dist = mix(dist0 * 1.8, dist0, k);
        Rg.update(dt); where = 'chase';
      }
      const dist = cam.position.distanceTo(P), closing = dt > 0 ? (this.prevD - dist) / dt : 0; this.prevD = dist;
      this.sound.update({ spool: this.throttle, speed: this.speed, where, dist, closing: clamp(closing, -160, 160) });
      st.near = t < AIR.reveal ? clamp(dist * 0.25, 0.3, 6) : Rg.near;
    }
    st.exposure = ease(seg(t, 0.05, 1.2));                          // up from black
    st.bars = 1 - ease(seg(t, this.end - 1.6, this.end - 0.4)); st.hud = ease(seg(t, this.end - 1.2, this.end));
    return st;
  }
}
