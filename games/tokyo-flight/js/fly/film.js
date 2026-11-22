// film.js — the opening: about forty seconds, then the aircraft is yours, already flying.
//
//   hangar    dark; the lamps come on bank by bank while the camera drifts in from the floor · a slow travelling
//             shot down the port side, past the pilot as he brings the engine up · round the tail while the
//             controls are checked · then one long take from the roof down to the floor behind the aircraft as
//             the doors part, the sun crosses the concrete and it rolls out into the morning
//   bay       from high behind, the harbour and the bridge ahead, coming down alongside · a camera holding
//             station off to starboard as it goes by · above and behind, the city opening out · and into the seat you fly from
//   or runway (the other start): a crane shot down from high over runway 34R at Haneda to the aircraft lined
//             up on it, then round behind it. The take-off is yours.
//
// Every shot is one continuous move along a smooth curve: no cuts on a still camera, no shake, nothing sudden.
// Between the hangar and the air the picture dips to black and comes back; nothing burns out.
// The hangar half stretches to cover loading: if the city is not ready when the doors are due, the film goes on
// with more slow moves round the aircraft (wing, fin, from above, intake, wheels ...) and opens the doors when it is.
//
// Everything is a function of the film's time, so any moment can be drawn on its own (film.at(t), film.atExtra(i, k)).
// Only things a camera could have recorded: real lamps, a real sun through real doors, a lens that stops down
// when the doors let the day in, and the engine heard from where the camera stands. Under it, a slow music bed.
import * as THREE from 'three';
import { geoToWorld } from '../geo.js';
import { GEAR_H } from './jet.js';

const D2R = Math.PI / 180, clamp = THREE.MathUtils.clamp;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1), ease = (k) => k * k * (3 - 2 * k), mix = (a, b, k) => a + (b - a) * k;
// how a move is paced: it is already moving when the shot begins and still moving when it ends
const pace = (k) => 0.3 * k + 0.7 * ease(k);

export const T = {
  lamps: [1.0, 1.9, 2.8, 3.7], glide: 6.2, start: 8.2, tail: 12.2, doors: 17.6, doorA: 18.1, doorB: 23.3, roll: 21.3, cut: 26.7,
  // the bay half, in seconds after the cut
  pass: 5.6, over: 9.0, round: 12.4, air: 15.6,
};
const ROLL_A = 1.7;                                       // m/s2 out of the hangar
const STOP = 0.21;                                        // how far the lens closes for daylight through the doors
const RW = { crane: 6.0, round: 4.2 };                   // seconds: the crane shot down to the runway, the move round behind
// where the bay half starts: low over the harbour between Shinagawa and Odaiba, 1.9 km short of Rainbow Bridge,
// heading for the middle of its main span (the towers stand 570 m apart, the deck is 52 m up)
export const RAIL = { lat: 35.6197, lon: 139.7667, heading: 350, alt: 48, climb: 0.062, speed: 100, throttle: 0.72 };

// a camera move: where the camera goes and what it looks at, each a smooth curve through a few points, and the lens
const curve3 = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
const move = (pos, look, lens, lens1 = lens) => ({ pos: curve3(pos), look: curve3(look), lens, lens1 });

// hangar moves (metres; the aircraft's nose points at -z, the doors are at z = -24)
const SHOTS = {
  // from the dark of the floor by the doors, in and up towards the nose, while the lamps come on
  dark: move([[-10.5, 0.5, -14.5], [-8.4, 0.85, -11.8], [-6.2, 1.3, -9.2], [-4.2, 1.62, -7.0]], [[0, 1.15, -0.2], [0, 1.2, -0.8], [0, 1.26, -1.5], [0, 1.3, -2.2]], 30, 27),
  // down the port side at shoulder height: nose, canopy and pilot, wing root
  glide: move([[-2.2, 1.4, -5.1], [-2.7, 1.62, -2.9], [-3.0, 1.8, -0.9], [-3.7, 1.92, 1.5]], [[0, 1.27, -3.7], [0, 1.48, -1.8], [0, 1.6, -0.75], [0, 1.46, 0.4]], 25),
  // round the tail, starboard to port, rising a little
  tail: move([[4.7, 0.8, 4.2], [3.2, 1.0, 6.1], [0.7, 1.28, 7.0], [-1.7, 1.55, 6.3]], [[0, 1.3, 1.1], [0, 1.35, 1.6], [0, 1.4, 1.9], [0, 1.42, 1.6]], 29),
  // from under the roof behind it down to the floor, and on after it as it goes
  doors: move([[3.4, 6.2, 16], [2.6, 4.4, 13], [1.4, 2.8, 10], [0.4, 1.9, 5.5], [0, 1.72, -1.0]], [[0, 1.6, -6], [0, 1.6, -6.4], [0, 1.58, -7], [0, 1.56, -8], [0, 1.55, -9]], 30, 33),
};

// moves that fill in while the city loads, each EXTRA_LEN seconds, in this order, round again if need be
const EXTRA_LEN = 5.2, HOLD_MAX = 60;
const EXTRAS = [
  move([[-5.4, 1.08, -2.2], [-4.6, 1.14, -0.6], [-3.6, 1.2, 0.9]], [[-1.1, 1.05, 0.2], [-1.25, 1.05, 0.9], [-1.4, 1.05, 1.6]], 26),       // along the port leading edge and its stripe
  move([[-4.0, 2.1, 3.6], [-3.4, 1.98, 2.3], [-3.0, 1.88, 1.0]], [[0, 1.86, 1.4], [0, 1.83, 1.15], [0, 1.8, 0.9]], 24),                   // fin flash and registration
  move([[1.6, 8.0, 5.2], [0.8, 7.4, 3.4], [-0.3, 6.9, 1.6]], [[0, 1.0, 0.0], [0, 1.0, -0.25], [0, 1.0, -0.5]], 34),                      // the delta from above
  move([[2.6, 1.6, -4.2], [2.0, 1.5, -3.2], [1.5, 1.4, -2.3]], [[0.35, 1.2, -1.7], [0.35, 1.19, -1.55], [0.35, 1.18, -1.4]], 24),       // starboard intake lip
  move([[-3.6, 0.3, -1.9], [-3.0, 0.33, -0.8], [-2.4, 0.38, 0.3]], [[-1.0, 0.30, 0.2], [-1.0, 0.31, 0.26], [-1.0, 0.32, 0.32]], 30),    // main wheel and spat
  move([[7.4, 1.8, 6.6], [6.2, 1.62, 7.4], [4.6, 1.48, 7.8]], [[0, 1.3, 0.2], [0, 1.3, 0.1], [0, 1.3, 0]], 30),                           // rear three-quarter
  move([[1.3, 0.92, -8.4], [0.6, 1.02, -7.2], [0.1, 1.12, -6.0]], [[0, 1.25, -3.0], [0, 1.25, -3.0], [0, 1.25, -3.0]], 22),               // head-on, down the probe
  move([[2.6, 2.42, -3.4], [2.0, 2.3, -2.8], [1.3, 2.16, -2.3]], [[0, 1.62, -0.8], [0, 1.62, -0.8], [0, 1.62, -0.8]], 26),               // canopy from above the nose
];

export class Film {
  // ready: () => true once the first view of the city has loaded (the film holds in the hangar until then)
  constructor({ hangar, jet, flight, rig, sound, world, camera, runway = null, ready = () => true }) {
    Object.assign(this, { hangar, jet, flight, rig, sound, world, camera, runway, ready });
    this.variant = 'air'; this.end = T.cut + T.air;
    this.hold = null; this.held = 0;
    this.t = 0; this.playing = false; this.length = T.cut + T.air; this.fired = new Set(); this.rolled = 0; this.prevCam = new THREE.Vector3(); this.prevD = 0;
    this.base = geoToWorld(RAIL.lat, RAIL.lon, 0);
    const h = RAIL.heading * D2R;
    this.F = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h)); this.R = new THREE.Vector3(Math.cos(h), 0, Math.sin(h));
    this._p = new THREE.Vector3(); this._l = new THREE.Vector3(); this._c = new THREE.Vector3(); this._u = new THREE.Vector3();
    this.state = { stage: true, exposure: 1.5, bars: 1, hud: 0, done: false };
  }

  // variant: 'air' (handed over flying, over the bay) or 'runway' (handed over lined up at Haneda)
  setVariant(v) { this.variant = v === 'runway' && this.runway ? 'runway' : 'air'; this.end = T.cut + (this.variant === 'runway' ? RW.crane + RW.round : T.air); }
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
    this.bayReveal(0, this.rail(0, this._p), cam); cam.fov = 38; cam.updateMatrixWorld();
  }

  update(dt) {
    if (!this.playing) return this.state;
    if (this.hold) {
      const h = this.hold; h.t += dt; this.held += dt;
      if (h.t >= EXTRA_LEN) {
        if (!this.ready() && this.held < HOLD_MAX) { h.i = (h.i + 1) % EXTRAS.length; h.t = 0; } else this.hold = null;
      }
      if (this.hold) { this.music(); return this.atExtra(h.i, h.t / EXTRA_LEN, dt); }
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
    this.music();
    if (this.t >= this.end) { this.playing = false; s.done = true; }
    return s;
  }

  // the music bed: in under the lamps, opening up as the doors part, full over the bay, easing back for the hand-over
  music() {
    const t = this.t, hold = !!this.hold;
    const level = ease(seg(t, 0.2, 5)) * (1 - 0.45 * ease(seg(t, this.end - 3.2, this.end)));
    const open = t < T.cut ? 0.14 + (hold ? 0 : 0.5 * ease(seg(t, T.doorA, T.cut))) : 1 - 0.3 * ease(seg(t, this.end - 3.2, this.end));
    this.sound.music?.(level, open);
  }

  // one of the fill-in shots: i = which, k = 0..1 through it. Lamps on, doors shut, engine idling.
  atExtra(i, k, dt = 0) {
    const H = this.hangar, J = this.jet, cam = H.camera, st = this.state, S = EXTRAS[i % EXTRAS.length];
    H.setLamps(4); H.setDoor(0);
    J.root.position.set(0, GEAR_H, 0); J.root.quaternion.identity(); H.blob.position.z = 0.4;
    J.uHeat.value = 0.4 * Math.pow(0.34 / 0.54, 1.5); J.uLamp.value = 0.9;
    J.pose(dt, { throttle: 0.34 / 0.72, parked: 0, look: i % EXTRAS.length === 7 ? 0.5 : 0 });
    const e = pace(clamp(k, 0, 1));
    S.pos.getPointAt(e, cam.position); cam.lookAt(S.look.getPointAt(e, this._l));
    cam.fov = mix(S.lens, S.lens1, e) * Math.max(1, 1.5 / Math.max(cam.aspect, 0.4)); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    st.exposure = H.exposure; st.stage = true; st.bars = 1; st.hud = 0; st.done = false;
    this.sound.update({ spool: 0.34, where: 'hangar', dist: cam.position.distanceTo(J.root.position) });
    return st;
  }

  at(t, dt = 0) {
    const J = this.jet, st = this.state;
    st.done = false;
    if (t < T.cut) {
      const H = this.hangar, cam = H.camera;
      let n = 0; for (const at of T.lamps) n += ease(seg(t, at, at + 0.5));
      H.setLamps(n); H.setDoor(seg(t, T.doorA, T.doorB));
      const d = t > T.roll ? 0.5 * ROLL_A * (t - T.roll) ** 2 : 0;
      J.root.position.set(0, GEAR_H, -d); J.root.quaternion.identity(); H.blob.position.z = 0.4 - d;
      // engine: lit at `start`, idling by the tail shot, a little more to roll
      const spool = 0.34 * ease(seg(t, T.start, T.start + 4.6)) + 0.2 * ease(seg(t, T.roll - 0.8, T.roll + 1.8));
      J.uHeat.value = 0.4 * Math.pow(spool / 0.54, 1.5); J.uLamp.value = 0.9 * seg(t, T.start - 0.4, T.start);
      // full and free: rudder, elevators, ailerons, each one way then the other
      const sw = (a, b) => (t > a && t < b ? Math.sin(((t - a) / (b - a)) * Math.PI * 2) : 0), c0 = T.tail + 0.7;
      J.pose(dt, { yaw: sw(c0, c0 + 1.35), pitch: sw(c0 + 1.35, c0 + 2.6), roll: sw(c0 + 2.6, c0 + 3.7), throttle: spool / 0.72,
        parked: 1 - seg(t, T.start + 0.4, T.start + 1.4), wheel: d - this.rolled, look: t > T.glide + 1.6 && t < T.tail - 0.9 ? -0.9 : 0 });
      this.rolled = d;
      const name = t < T.glide ? 'dark' : t < T.tail ? 'glide' : t < T.doors ? 'tail' : 'doors';
      const t0 = { dark: 0, glide: T.glide, tail: T.tail, doors: T.doors }[name], t1 = { dark: T.glide, glide: T.tail, tail: T.doors, doors: T.cut }[name];
      const S = SHOTS[name], e = pace(seg(t, t0, t1));
      S.pos.getPointAt(e, cam.position); S.look.getPointAt(e, this._l);
      if (name === 'doors') this._l.z -= 0.85 * d;                       // the look goes with the aircraft as it rolls away
      cam.lookAt(this._l); cam.fov = mix(S.lens, S.lens1, e) * Math.max(1, 1.5 / Math.max(cam.aspect, 0.4)); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      // the lens stops down as the doors let the day in, so the apron outside is exposed and the hangar falls into
      // silhouette; over the last moments the picture dips to black
      st.exposure = H.exposure * mix(1, STOP, ease(seg(t, T.doorA + 0.3, T.doorB - 0.4))) * (1 - ease(seg(t, T.cut - 0.8, T.cut - 0.05)));
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
    if (tau < T.pass) {
      fov = this.bayReveal(seg(tau, 0, T.pass), P, cam);
    } else if (tau < T.over) {
      // a camera that stays where it is (a helicopter holding station off to starboard, a little below) and follows
      // the aircraft past, with the waterfront and the city behind it
      const mid = this.rail((T.pass + T.over) / 2 + 0.15, this._c);
      cam.position.copy(mid).addScaledVector(this.R, 82); cam.position.y = mid.y - 4;
      cam.up.set(0, 1, 0); cam.lookAt(P);
      fov = clamp((2 * Math.atan(9.5 / Math.max(cam.position.distanceTo(P), 10))) / D2R, 9, 40);
    } else if (tau < T.round) {
      // above and behind, drifting across from starboard to port: the bridge and the city open out ahead
      const k = pace(seg(tau, T.over, T.round)), U2 = this._u.set(0, 1, 0);
      cam.position.copy(P).addScaledVector(this.F, mix(-16, -22, k)).addScaledVector(this.R, mix(6.5, -4.2, k)).addScaledVector(U2, mix(6.5, 4.6, k));
      cam.up.set(0, 1, 0); cam.lookAt(this._c.copy(P).addScaledVector(this.F, mix(22, 14, k)).addScaledVector(U2, mix(-1, 0.6, k))); fov = mix(42, 46, k);
    } else {
      // and in behind: this is the flying camera itself, with its look brought back to dead ahead
      const k = ease(seg(tau, T.round, T.air - 0.25)), R = this.rig;
      if (!this._round || dt === 0) { R.snap(); this._round = true; }
      R.look.yaw = mix(-0.36, 0, k); R.look.pitch = mix(0.10, 0, k); R.dist = mix(21, 11.5, k);
      R.update(dt); fov = R.fov; where = 'chase';
    }
    if (tau < T.round) { this._round = false; cam.fov = fov * Math.max(1, 1.35 / Math.max(cam.aspect, 0.4)); cam.updateMatrixWorld(); }
    const dist = cam.position.distanceTo(P), closing = dt > 0 ? (this.prevD - dist) / dt : 0; this.prevD = dist;
    this.sound.update({ spool: RAIL.throttle, speed: RAIL.speed, where, dist, closing: clamp(closing, -160, 160) });
    st.near = tau < T.round ? clamp(dist * 0.25, 0.3, 6) : this.rig.near;
    st.exposure = ease(seg(tau, 0.05, 1.1));                        // up from black
    st.stage = false; st.bars = 1 - ease(seg(t, this.end - 1.6, this.end - 0.4)); st.hud = ease(seg(t, this.end - 1.2, this.end));
    return st;
  }

  // the first move over the bay: from high behind, looking past the aircraft at the bridge and the city, down to
  // level with it and alongside. k = 0..1; returns the lens.
  bayReveal(k, P, cam) {
    const e = 1 - Math.pow(1 - k, 1.8), U = this._u.set(0, 1, 0);
    cam.position.copy(P).addScaledVector(this.F, mix(-125, -7, e)).addScaledVector(this.R, mix(34, 11.5, e)).addScaledVector(U, mix(44, 1.5, e));
    cam.up.set(0, 1, 0); cam.lookAt(this._c.copy(P).addScaledVector(this.F, mix(240, 7, ease(e))).addScaledVector(U, mix(-6, 0, e)));
    return mix(36, 40, e);
  }

  /* ---- lined up at Haneda */
  // the crane shot: from high over the runway ahead of the aircraft, down and in until it is just above the centre line
  // looking back at it. k = 0..1.
  runwayShot(k, cam) {
    const R = this.runway, P = R.point(30, 0, this._p), e = 1 - Math.pow(1 - k, 1.7);
    R.point(mix(215, 64, e), mix(-36, -6.5, e), cam.position); cam.position.y += mix(26, 1.35, e);
    cam.up.set(0, 1, 0); cam.lookAt(this._c.copy(P).setY(P.y + mix(1.8, 0.95, e)));
    cam.fov = mix(27, 19, e) * Math.max(1, 1.35 / Math.max(cam.aspect, 0.4)); cam.updateMatrixWorld();
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
    if (tau < RW.crane) { this._round = false; this.runwayShot(seg(tau, 0, RW.crane), cam); }
    else {
      const k = ease(seg(tau, RW.crane, RW.crane + RW.round - 0.25)), Rg = this.rig;
      if (!this._round || dt === 0) { Rg.snap(); this._round = true; }
      Rg.look.yaw = mix(-2.7, 0, k); Rg.look.pitch = mix(0.16, 0, k); Rg.dist = mix(16, 11.5, k);
      Rg.update(dt); where = 'chase';
    }
    const dist = cam.position.distanceTo(F.pos);
    this.sound.update({ spool: 0.3, speed: 0, where, dist, closing: 0, ground: true });
    st.near = tau < RW.crane ? clamp(dist * 0.25, 0.3, 12) : this.rig.near;
    st.exposure = ease(seg(tau, 0.05, 1.1));                        // up from black
    st.stage = false; st.done = false; st.bars = 1 - ease(seg(t, this.end - 1.6, this.end - 0.4)); st.hud = ease(seg(t, this.end - 1.2, this.end));
    return st;
  }
}
