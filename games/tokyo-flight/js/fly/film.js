// film.js — the opening: about half a minute, then the aircraft is yours, already flying.
//
//   hangar    lamps come on bank by bank · along the nose · the pilot brings the engine up · tail, controls
//             checked · the doors part and the sun crosses the floor · it rolls out into the light
//   bay       alongside, low over Tokyo Bay · a camera on the water as it goes over · nose-on · and round
//             behind it into the seat you fly from
//   or runway (the other start): lined up on 34R at Haneda, seen down a long lens from further up the runway,
//             then round behind it. The take-off is yours.
//
// The hangar half stretches to cover loading: if the city is not ready when the doors are due, the film goes on
// with more shots of the aircraft (wing, fin, from above, intake, wheels ...) and opens the doors when it is.
// With the city already in the browser's cache it runs straight through in about 32 seconds.
//
// Everything is a function of the film's time, so any moment can be drawn on its own (film.at(t), film.atExtra(i, k)).
// Only things a camera could have recorded: real lamps, a real sun through real doors, exposure that cannot
// keep up when the camera looks out into daylight, and the engine heard from where the camera stands.
import * as THREE from 'three';
import { geoToWorld } from '../geo.js';
import { GEAR_H } from './jet.js';

const D2R = Math.PI / 180, clamp = THREE.MathUtils.clamp;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1), ease = (k) => k * k * (3 - 2 * k), mix = (a, b, k) => a + (b - a) * k;

export const T = {
  lamps: [0.7, 1.35, 2.0, 2.65], nose: 4.0, pit: 6.8, start: 7.5, tail: 9.6, doors: 12.4, doorA: 12.7, doorB: 17.4,
  out: 15.8, roll: 15.9, cut: 18.6, water: 22.2, front: 25.8, round: 29.2, end: 32.4,
};
// where the bay half starts: low over the harbour between Shinagawa and Odaiba, 1.9 km short of Rainbow Bridge,
// heading for the middle of its main span (the towers stand 570 m apart, the deck is 52 m up)
const RW = { line: 3.6, round: 3.4 };                    // seconds: the long-lens shot down the runway, the move round behind
export const RAIL = { lat: 35.6197, lon: 139.7667, heading: 350, alt: 48, climb: 0.062, speed: 100, throttle: 0.72 };

// hangar cameras: [from, to, look from, look to, lens]
const SHOTS = {
  lamps: [[-7.6, 0.85, -10.8], [-6.1, 1.0, -8.9], [0, 1.25, -0.9], [0, 1.25, -0.7], 31],
  nose: [[-1.75, 1.46, -4.1], [-1.5, 1.40, -2.2], [0, 1.27, -3.45], [0, 1.34, -1.6], 23],
  pit: [[-2.75, 1.78, -1.75], [-2.5, 1.74, -1.2], [0, 1.60, -0.95], [0, 1.60, -0.72], 24],          // level with the canopy, the pilot through the glass
  tail: [[2.7, 0.78, 6.4], [1.95, 0.95, 5.5], [0, 1.42, 1.9], [0, 1.5, 1.8], 30],
  doors: [[3.4, 0.46, -16.5], [3.0, 0.5, -15.2], [0, 1.2, -2.2], [0, 1.22, -2.6], 25],
  out: [[-2.3, 1.55, 9.4], [-1.5, 1.42, 5.6], [0.3, 1.5, -40], [0.2, 1.6, -40], 35],
};

// shots that fill in while the city loads, each EXTRA_LEN seconds, in this order, round again if need be
const EXTRA_LEN = 3.3, HOLD_MAX = 60;
const EXTRAS = [
  [[-4.7, 1.12, -1.2], [-3.7, 1.18, 0.5], [-1.2, 1.05, 0.5], [-1.4, 1.05, 1.5], 26],       // along the port leading edge and its stripe
  [[-3.5, 2.0, 2.7], [-3.15, 1.92, 1.5], [0, 1.85, 1.3], [0, 1.8, 0.95], 24],               // fin flash and registration
  [[0.6, 7.6, 3.9], [0.25, 7.0, 2.5], [0, 1.0, -0.2], [0, 1.0, -0.45], 34],                 // the delta from above
  [[1.95, 1.52, -3.3], [1.62, 1.43, -2.45], [0.35, 1.2, -1.62], [0.35, 1.18, -1.42], 24],   // starboard intake lip
  [[-2.95, 0.32, -0.95], [-2.5, 0.36, -0.2], [-1.0, 0.30, 0.25], [-1.0, 0.32, 0.3], 30],    // main wheel and spat
  [[6.6, 1.7, 7.6], [5.3, 1.52, 6.6], [0, 1.3, 0.1], [0, 1.3, 0], 30],                      // rear three-quarter
  [[0.38, 0.98, -7.7], [0.2, 1.1, -6.3], [0, 1.25, -3.0], [0, 1.25, -3.0], 22],             // head-on, down the probe
  [[1.95, 2.32, -3.1], [1.55, 2.2, -2.45], [0, 1.62, -0.8], [0, 1.62, -0.8], 26],           // canopy from above the nose
];

export class Film {
  // ready: () => true once the first view of the city has loaded (the film holds in the hangar until then)
  constructor({ hangar, jet, flight, rig, sound, world, camera, runway = null, ready = () => true }) {
    Object.assign(this, { hangar, jet, flight, rig, sound, world, camera, runway, ready });
    this.variant = 'air'; this.end = T.end;
    this.hold = null; this.held = 0;
    this.t = 0; this.playing = false; this.length = T.end; this.fired = new Set(); this.rolled = 0; this.prevCam = new THREE.Vector3(); this.prevD = 0;
    this.base = geoToWorld(RAIL.lat, RAIL.lon, 0);
    const h = RAIL.heading * D2R;
    this.F = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h)); this.R = new THREE.Vector3(Math.cos(h), 0, Math.sin(h));
    this._p = new THREE.Vector3(); this._l = new THREE.Vector3(); this._c = new THREE.Vector3();
    this.state = { stage: true, exposure: 1.5, bars: 1, hud: 0, done: false };
  }

  // variant: 'air' (handed over flying, over the bay) or 'runway' (handed over lined up at Haneda)
  setVariant(v) { this.variant = v === 'runway' && this.runway ? 'runway' : 'air'; this.end = this.variant === 'runway' ? T.cut + RW.line + RW.round : T.end; }
  start(variant = this.variant) { this.setVariant(variant); this.t = 0; this.playing = true; this.fired.clear(); this.rolled = 0; this.hold = null; this.held = 0; this.rig.set('chase'); }
  skip() { this.t = this.end; this.hold = null; }

  // where the aircraft is on the bay run, `tau` seconds after the cut
  rail(tau, out = this._p) {
    const s = RAIL.speed * tau;
    out.copy(this.base).addScaledVector(this.F, s);
    out.y = this.world.ground(out.x, out.z).y + RAIL.alt + RAIL.climb * s;
    return out;
  }
  // the pose the world camera should load tiles for while the hangar is on screen
  firstView(cam) {
    if (this.variant === 'runway') { this.runwayShot(0, cam); return; }
    const p = this.rail(0, this._p);
    cam.position.copy(p).addScaledVector(this.R, 13).addScaledVector(this.F, -9); cam.position.y += 1.6;
    cam.lookAt(this._l.copy(p).addScaledVector(this.F, 60)); cam.fov = 40; cam.updateMatrixWorld();
  }

  update(dt) {
    if (!this.playing) return this.state;
    if (this.hold) {
      const h = this.hold; h.t += dt; this.held += dt;
      if (h.t >= EXTRA_LEN) {
        if (!this.ready() && this.held < HOLD_MAX) { h.i = (h.i + 1) % EXTRAS.length; h.t = 0; } else this.hold = null;
      }
      if (this.hold) return this.atExtra(h.i, h.t / EXTRA_LEN, dt);
    }
    const t0 = this.t; this.t = Math.min(this.t + dt, this.end);
    if (t0 < T.doors && this.t >= T.doors && !this.ready() && this.held < HOLD_MAX) {      // the city is still on its way: stay in the hangar
      this.t = T.doors; this.hold = { i: 0, t: 0 };
      return this.atExtra(0, 0, dt);
    }
    const cross = (at, fn) => { if (t0 <= at && this.t > at && !this.fired.has(at)) { this.fired.add(at); fn(); } };
    T.lamps.forEach((at) => cross(at, () => this.sound.hit('clunk')));
    cross(T.start, () => this.sound.hit('click'));
    cross(T.doorA, () => this.sound.door(T.doorB - T.doorA));
    const s = this.at(this.t, dt);
    if (this.t >= this.end) { this.playing = false; s.done = true; }
    return s;
  }

  // one of the fill-in shots: i = which, k = 0..1 through it. Lamps on, doors shut, engine idling.
  atExtra(i, k, dt = 0) {
    const H = this.hangar, J = this.jet, cam = H.camera, st = this.state, S = EXTRAS[i % EXTRAS.length];
    H.setLamps(4); H.setDoor(0);
    J.root.position.set(0, GEAR_H, 0); J.root.quaternion.identity(); H.blob.position.z = 0.4;
    J.uHeat.value = 0.4 * Math.pow(0.34 / 0.54, 1.5); J.uLamp.value = 0.9;
    J.pose(dt, { throttle: 0.34 / 0.72, parked: 0, look: i % EXTRAS.length === 7 ? 0.5 : 0 });
    cam.position.set(mix(S[0][0], S[1][0], k), mix(S[0][1], S[1][1], k), mix(S[0][2], S[1][2], k));
    cam.lookAt(this._l.set(mix(S[2][0], S[3][0], k), mix(S[2][1], S[3][1], k), mix(S[2][2], S[3][2], k)));
    cam.fov = S[4] * Math.max(1, 1.5 / Math.max(cam.aspect, 0.4)); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    st.exposure = H.exposure; st.stage = true; st.bars = 1; st.hud = 0; st.done = false;
    this.sound.update({ spool: 0.34, where: 'hangar', dist: cam.position.distanceTo(J.root.position) });
    return st;
  }

  at(t, dt = 0) {
    const J = this.jet, st = this.state;
    st.done = false;
    if (t < T.cut) {
      const H = this.hangar, cam = H.camera;
      let n = 0; for (const at of T.lamps) n += ease(seg(t, at, at + 0.4));
      H.setLamps(n); H.setDoor(seg(t, T.doorA, T.doorB));
      const d = t > T.roll ? 0.5 * 1.45 * (t - T.roll) ** 2 : 0;
      J.root.position.set(0, GEAR_H, -d); J.root.quaternion.identity(); H.blob.position.z = 0.4 - d;
      // engine: lit at `start`, idling by the tail shot, a little more to roll
      const spool = 0.34 * ease(seg(t, T.start, T.start + 4.2)) + 0.2 * ease(seg(t, T.roll - 0.6, T.roll + 1.6));
      J.uHeat.value = 0.4 * Math.pow(spool / 0.54, 1.5); J.uLamp.value = 0.9 * seg(t, T.start - 0.4, T.start);
      // full and free: rudder, elevators, ailerons, each one way then the other
      const sw = (a, b) => (t > a && t < b ? Math.sin(((t - a) / (b - a)) * Math.PI * 2) : 0);
      J.pose(dt, { yaw: sw(T.tail + 0.2, T.tail + 1.15), pitch: sw(T.tail + 1.15, T.tail + 2.0), roll: sw(T.tail + 2.0, T.tail + 2.7), throttle: spool / 0.72,
        parked: 1 - seg(t, T.start + 0.4, T.start + 1.4), wheel: d - this.rolled, look: t > T.pit + 0.9 && t < T.tail ? -0.9 : 0 });
      this.rolled = d;
      const name = t < T.nose ? 'lamps' : t < T.pit ? 'nose' : t < T.tail ? 'pit' : t < T.doors ? 'tail' : t < T.out ? 'doors' : 'out';
      const t0 = { lamps: 0, nose: T.nose, pit: T.pit, tail: T.tail, doors: T.doors, out: T.out }[name], t1 = { lamps: T.nose, nose: T.pit, pit: T.tail, tail: T.doors, doors: T.out, out: T.cut }[name];
      const S = SHOTS[name], k = seg(t, t0, t1), e = name === 'lamps' || name === 'out' ? k : ease(k) * 0.5 + k * 0.5;
      cam.position.set(mix(S[0][0], S[1][0], e), mix(S[0][1], S[1][1], e), mix(S[0][2], S[1][2], e));
      this._l.set(mix(S[2][0], S[3][0], e), mix(S[2][1], S[3][1], e), mix(S[2][2], S[3][2], e));
      if (name === 'doors') this._l.z -= d * 0.6;
      cam.lookAt(this._l); cam.fov = S[4] * Math.max(1, 1.5 / Math.max(cam.aspect, 0.4)); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      // looking out into daylight the exposure cannot keep up: by the cut the frame is white
      // the lens stops down as daylight comes in; then, looking straight out into it, it cannot keep up: by the cut the frame is white
      st.exposure = H.exposure * mix(1, 0.5, ease(seg(t, T.doorA, T.doorB - 0.8))) * (1 + 16 * Math.pow(seg(t, T.out + 0.5, T.cut), 2.4));
      st.stage = true; st.bars = 1; st.hud = 0;
      const dist = cam.position.distanceTo(J.root.position);
      this.sound.update({ spool, where: 'hangar', dist });
      return st;
    }
    if (this.variant === 'runway') return this.atRunway(t, dt);
    /* ---- over the bay */
    const tau = t - T.cut, F = this.flight, cam = this.camera, P = this.rail(tau, this._p);
    F.place({ x: P.x, y: P.y, z: P.z, heading: RAIL.heading, pitch: Math.atan(RAIL.climb) / D2R + 0.5 * Math.sin(tau * 0.7), roll: 2.4 * Math.sin(tau * 0.9 + 0.6), speed: RAIL.speed, throttle: RAIL.throttle });
    F.agl = P.y - this.world.ground(P.x, P.z).y;
    J.root.position.copy(F.pos); J.root.quaternion.copy(F.quat);
    J.uHeat.value = 0.4; J.uLamp.value = 0.9;
    J.pose(dt, { roll: 0.12 * Math.sin(tau * 0.9 + 2.2), pitch: 0.06 * Math.sin(tau * 0.7), throttle: RAIL.throttle, parked: 0 });
    const U = this._l.set(0, 1, 0);
    let fov = 40, where = 'film';
    if (t < T.water) {
      const k = seg(t, T.cut, T.water);
      cam.position.copy(P).addScaledVector(this.R, mix(13, 10, k)).addScaledVector(this.F, mix(-9, -4.5, k)).addScaledVector(U, mix(1.6, 1.15, k));
      cam.lookAt(this._c.copy(P).addScaledVector(this.F, 7)); fov = 40;
    } else if (t < T.front) {
      // a camera that stays where it is (a helicopter holding station off to the side) and follows the aircraft past
      const mid = this.rail((T.water + T.front) / 2 - T.cut + 0.1, this._c);
      cam.position.copy(mid).addScaledVector(this.R, -75); cam.position.y = mid.y - 7;
      cam.up.set(0, 1, 0); cam.lookAt(P);
      fov = clamp((2 * Math.atan(9.5 / Math.max(cam.position.distanceTo(P), 10))) / D2R, 8, 46);
    } else if (t < T.round) {
      const k = ease(seg(t, T.front, T.round));
      cam.position.copy(P).addScaledVector(this.F, mix(23, 15, k)).addScaledVector(this.R, mix(-4.5, -9, k)).addScaledVector(U, mix(-1.6, 0.6, k));
      cam.lookAt(P); fov = 30;
    } else {
      // round the port side and in behind: this is the flying camera itself, with its look brought back to dead ahead
      const k = ease(seg(t, T.round, T.end - 0.25)), R = this.rig;
      if (!this._round || dt === 0) { R.snap(); this._round = true; }
      R.look.yaw = mix(-2.55, 0, k); R.look.pitch = mix(0.10, 0, k); R.dist = mix(15.5, 11.5, k);
      R.update(dt); fov = R.fov; where = 'chase';
    }
    if (t < T.round) { this._round = false; cam.fov = fov * Math.max(1, 1.35 / Math.max(cam.aspect, 0.4)); cam.updateMatrixWorld(); }
    const dist = cam.position.distanceTo(P), closing = dt > 0 ? (this.prevD - dist) / dt : 0; this.prevD = dist;
    this.sound.update({ spool: RAIL.throttle, speed: RAIL.speed, where, dist, closing: clamp(closing, -160, 160) });
    st.near = t < T.round ? clamp(dist * 0.25, 0.3, 6) : this.rig.near;
    st.exposure = 1 + 5 * Math.exp(-tau / 0.4);
    st.stage = false; st.bars = 1 - ease(seg(t, T.end - 1.6, T.end - 0.4)); st.hud = ease(seg(t, T.end - 1.2, T.end));
    return st;
  }

  /* ---- lined up at Haneda */
  // the long-lens camera: on the centre line further up the runway, half a metre off the ground, looking back at the aircraft
  runwayShot(k, cam) {
    const R = this.runway, P = R.point(30, 0, this._p);
    R.point(mix(118, 104, k), -1.4, cam.position); cam.position.y += 0.55;
    cam.up.set(0, 1, 0); cam.lookAt(this._c.copy(P).setY(P.y + 0.95));
    cam.fov = mix(7.4, 6.6, k) * Math.max(1, 1.35 / Math.max(cam.aspect, 0.4)); cam.updateMatrixWorld();
    return P;
  }
  atRunway(t, dt = 0) {
    const st = this.state, J = this.jet, F = this.flight, R = this.runway, cam = this.camera, tau = t - T.cut;
    const P = R.point(30, 0, this._p);
    F.place({ x: P.x, y: P.y, z: P.z, heading: R.heading, speed: 0, throttle: 0, ground: true });
    F.agl = F.spec.gearH;
    J.root.position.copy(F.pos); J.root.quaternion.copy(F.quat);
    J.uHeat.value = 0.12; J.uLamp.value = 0.9;
    J.pose(dt, { throttle: 0.06, parked: 0, pitch: 0.25 * Math.sin(tau * 2.2) * (tau < 1.6 ? 1 : 0) });
    let where = 'film';
    if (tau < RW.line) { this._round = false; this.runwayShot(ease(seg(tau, 0, RW.line)), cam); }
    else {
      const k = ease(seg(tau, RW.line, RW.line + RW.round - 0.25)), Rg = this.rig;
      if (!this._round || dt === 0) { Rg.snap(); this._round = true; }
      Rg.look.yaw = mix(-2.7, 0, k); Rg.look.pitch = mix(0.16, 0, k); Rg.dist = mix(16, 11.5, k);
      Rg.update(dt); where = 'chase';
    }
    const dist = cam.position.distanceTo(F.pos);
    this.sound.update({ spool: 0.3, speed: 0, where, dist, closing: 0, ground: true });
    st.near = tau < RW.line ? clamp(dist * 0.25, 0.3, 12) : this.rig.near;
    st.exposure = 1 + 5 * Math.exp(-tau / 0.4);
    st.stage = false; st.done = false; st.bars = 1 - ease(seg(t, this.end - 1.6, this.end - 0.4)); st.hud = ease(seg(t, this.end - 1.2, this.end));
    return st;
  }
}
