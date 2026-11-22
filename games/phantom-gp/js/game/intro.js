// intro.js — the opening film: 64 beats in the studio, cut to the soundtrack, ending on the cut to the race.
//   0-4    black, title card            4-15.5  stills flash into a 3 x 3 collage, faster and faster
//   16-24  the drop: the whole car      24-28   a low sweep along the side, in from ahead of the nose
//   28-32  overhead, nose to tail, speed-ramped (fast, slow over the cockpit, fast)
//   32-34  the thumb presses a button: N becomes 1         34-40   the gear changes
//   40-42  wet floor, wheelspin      42-48, 48-54  the two names on the tyre, six beats each: the picture is
//          speed-ramped down to a crawl, held, and whipped back up to speed before the cut      54-56  from the front
//   56-64  the camera drops in behind the car, the hall's lights come up, the car runs out through the door, cut to the circuit
// The burn-out (40-56) is shot locked off: neither the car nor any camera in it moves.
import * as THREE from 'three';
import { LOOKS } from './gfx.js';
import { SLOW, wallAt } from './audio.js';
import { BEAT } from './music.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// stills for the collage: [camera, target, field of view]
const STILLS = [
  [[0.1, 0.85, 9.6], [0.1, 0.46, 0], 23], [[3.35, 0.32, 1.45], [2.35, 0.14, 0.95], 24], [[-4.0, 0.75, 1.3], [-2.15, 0.62, 0.1], 28],
  [[3.1, 0.42, 2.0], [1.85, 0.34, 0.8], 22], [[1.9, 1.05, 1.15], [0.25, 0.72, 0], 26], [[5.2, 0.28, 0.0], [2.8, 0.3, 0], 20],
  [[2.4, 0.75, 1.9], [0.8, 0.45, 0.55], 22], [[-5.2, 1.3, 3.4], [-0.4, 0.45, 0], 26], [[2.9, 1.2, 0.6], [2.15, 0.45, 0], 22],
  [[-4.6, 0.3, 0.0], [-2.6, 0.32, 0], 22], [[1.95, 1.5, 1.3], [0.42, 0.64, 0], 30], [[-0.6, 1.0, 2.6], [-1.0, 0.58, 0.2], 22],
  [[0.3, 6.0, 0.4], [0.3, 0, 0], 30], [[-3.3, 0.5, -2.1], [-1.9, 0.34, -0.85], 24], [[4.4, 1.0, -2.6], [1.0, 0.4, 0], 24],
  [[6.25, 1.52, 4.6], [0.3, 0.4, 0], 25], [[-2.6, 2.4, 0.0], [-0.2, 0.5, 0], 30],
];
// when each still is shot (beat) and which cell of the 3 x 3 grid it lands in
const TILES = [[4, 4], [5, 0], [6, 8], [7, 2], [8, 6], [8.5, 1], [9, 7], [9.5, 3], [10, 5], [10.5, 4], [11, 8], [11.5, 0], [12, 6], [12.5, 2], [13, 7], [13.25, 1], [13.5, 5], [13.75, 3]];
// The low sweep along the car's right side (beats 24-28): the camera's path and what it looks at. It starts ahead of
// the nose, a hand's width off the floor, and runs back past the front wheel to the sidepod, looking in at the car.
const curve = (pts) => new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])), false, 'centripetal');
const SIDE_CAM = curve([[5.0, 0.13, 0.5], [3.75, 0.15, 1.3], [2.3, 0.21, 1.7], [0.75, 0.33, 1.85]]);
const SIDE_TG = curve([[2.95, 0.24, 0.1], [2.1, 0.3, 0.45], [0.6, 0.4, 0.5], [-1.3, 0.5, 0.45]]);
// Speed ramp for the overhead shot (beats 28-32): time 0..1 -> distance 0..1. Full speed in, a crawl over the cockpit
// (a tenth of the speed), full speed out.
const RAMP = (() => {
  const N = 96, t = new Float32Array(N + 1), sm = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  for (let i = 1; i <= N; i++) { const u = (i - 0.5) / N; t[i] = t[i - 1] + lerp(1, 0.1, sm(0.16, 0.30, u) * (1 - sm(0.70, 0.84, u))); }
  return (u) => { const x = clamp(u, 0, 1) * N, i = Math.min(N - 1, Math.floor(x)); return lerp(t[i], t[i + 1], x - i) / t[N]; };
})();
const CHASE = { pos: [-6.38, 1.58, 0], tg: [12.6, 0.95, 0], fov: 70.9 };     // where the race camera sits at 290 km/h

/* ---- the slow motion on the two names (beats 42-54) ----
   slowAt: how far into one slow motion (an entry of SLOW) the film is at film time w: 0 = real time, 1 = held. */
const slowAt = (s, w) => { const w0 = s.beat * BEAT, a = w0 + s.in, c = a + s.hold, d = c + s.out; return w <= w0 || w >= d ? 0 : w < a ? ease((w - w0) / s.in) : w < c ? 1 : 1 - ease((w - c) / s.out); };
/* Speed is a power of its floor: floor ** slow. It then falls by the same ratio in every instant of the ramp, the way
   a camera's speed ramp does: a tenth of full speed by the middle of the ramp, a soft landing, a crawl, and a whip
   back up. (A straight blend from 1 to the floor is still at half speed in the middle and then stops dead; that is
   how it was, with a quarter-second ramp.) The water falls at 1.2% of real time in the hold. The wheel turns at
   0.18%, so the lettering creeps half a radian across the top of the tyre while it is held. */
const SPIN = 175, SLOW_PIC = 0.012, SLOW_WHEEL = 0.0018;
// The height each name shot's camera looks at (m). Chosen so the name stands in the middle of the frame's height
// when it is at the top of the tyre: it used to sit in the upper third (the big name) and the upper quarter (the small one).
const NAME_Y = [0.626, 0.644];
/* TURN[i](w): how far the rear wheel has turned (rad) at film time w, counted from the middle of slow motion i's
   hold, where the name stands at the top of the tyre. It is the sum of the same speed curve, worked out once, so the
   wheel's angle through the whole shot is a function of the film clock: it spins, slows until the name arrives,
   creeps, and spins away, with nothing snapped into place and no drift at any frame rate. */
const TURN = SLOW.map((s) => {
  const h = 1 / 2000, w0 = s.beat * BEAT, n = Math.ceil((s.in + s.hold + s.out) / h), A = new Float64Array(n + 1);
  for (let k = 1; k <= n; k++) A[k] = A[k - 1] + SPIN * Math.pow(SLOW_WHEEL, slowAt(s, w0 + (k - 0.5) * h)) * h;
  const at = (w) => { if (w <= w0) return SPIN * (w - w0); if (w >= w0 + n * h) return A[n] + SPIN * (w - w0 - n * h); const x = (w - w0) / h, k = Math.floor(x); return lerp(A[k], A[k + 1], x - k); };
  const mid = at(w0 + s.in + s.hold / 2);
  return (w) => at(w) - mid;
});

export class Intro {
  constructor(ctx) {
    this.ctx = ctx; this.done = true; this.clock = null; this.tile = 0; this.beat = 0; this.cut = -1; this.wheel = 0; this.gear = 1; this.lastShift = -1; this.cap = '';
    this.cam = ctx.studio.camera; this.tg = V(0, 0.4, 0); this.nameY = NAME_Y;
    const v = ctx.view;
    // right hand and its paddle, for the gear change
    v.root.updateMatrixWorld(true);
    this.hand = null;
    if (v.sw) { this.grip = v.sw.localToWorld(V(0.1335, -0.012, 0.004)); this.gripAxis = V(0, 1, 0).transformDirection(v.sw.matrixWorld); }
    this.paddleZ = v.paddle ? v.paddle.position.z : 0;
    // the button shot: camera and target given in the steering wheel's own frame (x right, y up the wheel, z towards the driver)
    const L = (x, y, z) => (v.sw ? v.sw.localToWorld(V(x, y, z)).toArray() : [0.5, 0.8, 0.2]);
    this.pressCam = [L(0.02, 0.165, 0.235), L(0.035, 0.15, 0.205)]; this.pressTg = L(0.07, 0.04, 0.012); this.pressLamp = L(-0.06, 0.26, 0.3);
    this._m = new THREE.Matrix4(); this._t = new THREE.Matrix4();
  }

  start() {
    const { studio, hud, gfx, sound, view } = this.ctx;
    this.done = false; this.warm = 0; this.tile = 0; this.cut = -1; this.wheel = 0; this.gear = 1; this.lastShift = -1; this.cap = ''; this.last = performance.now() / 1000; this.run = 0; this.runV = 0; this.nameShot = -1; this.prevShot = -1; this.slow = 0; this.filmW = 0;
    studio.floorU.uWet.value = 0; studio.floorU.uRun.value = 0; studio.clearSpray(); studio.setLaunch(0); this.prevWheel = 0;
    gfx.clearCollage(); gfx.setLook(LOOKS.studio); gfx.fx.fade = 1; gfx.fx.flash = 0; gfx.fx.blur = 0; gfx.fx.punch = 0; gfx.fx.chroma = 0;
    view.home(); view.setWheels(0, 0, 0, 0, 0); if (view.dash) view.drawDash('N', 0, 0, 1); view.pressButton(0, 0); studio.fill.intensity = 0; this.pressed = false;
    hud.bars(true); hud.caption('', '');
    this.clock = sound.playFilm();
    this.endWall = wallAt(64 * BEAT);
  }
  skip() { if (this.done) return; this.finish(true); }
  finish(skipped) {
    const { hud, gfx, sound, studio, view } = this.ctx;
    const tm = performance.now();
    this.done = true; hud.bars(false); hud.caption('', ''); gfx.fx.fade = 0; gfx.fx.punch = 0; gfx.fx.chroma = 0;
    sound.filmEngine(4000, 0, 0); if (skipped) sound.stopFilm();
    studio.floorU.uWet.value = 0; studio.floorU.uRun.value = 0; studio.clearSpray(); studio.setLaunch(0);
    this.poseHand(0); view.pressButton(0, 0); studio.fill.intensity = 0; view.car.position.set(0, 0, 0); view.car.rotation.set(0, 0, 0);
    if (this.ctx.mark) this.ctx.mark('filmEnd', tm);
    this.ctx.onCut(skipped);
  }

  // camera from position / target / fov; `fit` pulls back on narrow screens so the subject still fits
  look(pos, tg, fov, fit = true, up = null) {
    const cam = this.cam, k = fit ? Math.max(1, 1.7 / cam.aspect) : 1;
    cam.position.set(tg[0] + (pos[0] - tg[0]) * k, Math.max(0.04, tg[1] + (pos[1] - tg[1]) * k), tg[2] + (pos[2] - tg[2]) * k);
    if (up) cam.up.set(up[0], up[1], up[2]); else cam.up.set(0, 1, 0);
    cam.lookAt(tg[0], tg[1], tg[2]);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
  caption(small, big, center) { const k = small + '|' + big; if (k !== this.cap) { this.cap = k; this.ctx.hud.caption(small, big, center); } }
  // squeeze the right hand a few degrees round the grip and pull the paddle towards the driver
  poseHand(k) {
    const v = this.ctx.view;
    if (v.paddle) v.paddle.position.z = this.paddleZ + 0.010 * k;
    if (this.hand && this.grip) {
      if (k === 0) { this.hand.matrixAutoUpdate = true; this.hand.matrix.identity(); this.hand.updateMatrix(); return; }
      this.hand.matrixAutoUpdate = false;
      this._m.makeTranslation(this.grip.x, this.grip.y, this.grip.z).multiply(this._t.makeRotationAxis(this.gripAxis, -0.07 * k)).multiply(this._t.makeTranslation(-this.grip.x, -this.grip.y, -this.grip.z));
      this.hand.matrix.copy(this._m); this.hand.matrixWorldNeedsUpdate = true;
    }
  }

  update(dtFrame) {
    if (this.done) return true;
    const { gfx, studio, hud, sound, view } = this.ctx, fx = gfx.fx;
    const b = this.clock.beats(), now = performance.now() / 1000, dt = Math.min(0.05, Math.max(0.001, now - this.last)); this.last = now;
    if (b >= 64) { this.finish(false); return true; }
    studio.floorU.uTime.value += dt;
    fx.flash = Math.max(0, fx.flash - dt * 5); fx.punch = 0; fx.chroma = 0; fx.blur = 0; fx.fade = 0;      // (no zoom or colour pulse on the beat: he found the picture pulsing too much)
    // keep the circuit ready for the cut: a few tiny frames of it while the screen is black, and again in the last flash
    if (this.ctx.warmTrack && ((b > 15.55 && b < 16 && this.warm < 5) || (b > 62.9 && this.warm < 10))) { this.warm = Math.max(this.warm, b > 60 ? 5 : 0) + 1; this.ctx.warmTrack(); }
    studio.fill.intensity = 0;
    let collage = false, vis = 1, spin = 0, eng = null;        // vis: picture speed (1 = real time), spin: rear wheel speed (rad/s)
    const cutTo = (id) => { if (this.cut !== id) { this.cut = id; fx.flash = 0.55; return true; } return false; };

    if (b < 4) {
      // ---- title card over the car, barely lit
      const u = b / 4;
      this.look([7.6, 1.1, 5.4], [0.3, 0.42, 0], 25);
      fx.fade = 1 - 0.16 * ease(clamp(u * 1.4, 0, 1));
      this.caption(b > 0.4 && b < 3.7 ? 'A John Gresh production' : '', b > 0.4 && b < 3.7 ? 'Phantom GP' : '', true);
    } else if (b < 16) {
      // ---- stills flashing into the collage
      this.caption('', '');
      collage = true;
      while (this.tile < TILES.length && b >= TILES[this.tile][0]) {
        const [, cell] = TILES[this.tile], st = STILLS[this.tile % STILLS.length];
        this.look(st[0], st[1], st[2]);
        studio.render(gfx.rt, this.cam);
        gfx.stampTile(cell, 3, TILES[this.tile][0] * BEAT);
        this.tile++;
      }
      const out = b > 14 ? ease(clamp((b - 14) / 1.5, 0, 1)) : 0;
      const strobe = b > 14 && b < 15.5 ? Math.exp(-((b * 4) % 1) * 5) * 0.9 : 0;
      gfx.drawCollage(b * BEAT, 1 + 0.55 * out, strobe);
      if (b >= 15.5) fx.fade = 1;
    } else if (b < 24) {
      // ---- the drop: the whole car, pushing in, then round the back
      if (b < 20) { cutTo(1); const u = (b - 16) / 4; this.look(mix3([7.4, 0.95, 4.7], [5.9, 0.72, 3.7], u), [0.45, 0.42, 0], 26); }
      else { cutTo(2); const u = (b - 20) / 4, a = lerp(2.52, 2.86, u); this.look([Math.cos(a) * 7.2, lerp(1.5, 1.05, u), Math.sin(a) * 7.2], [-0.2, 0.45, 0], 25); }
    } else if (b < 32) {
      // ---- two slow sweeps, four beats each
      if (b < 28) {
        // low along the side: in from ahead of the nose, close to the floor, back past the front wheel to the
        // sidepod, looking in at the car all the way (it is already moving at the cut and eases a little to the end)
        cutTo(3); const e = 1 - Math.pow(1 - (b - 24) / 4, 1.3), c = SIDE_CAM.getPointAt(e), t = SIDE_TG.getPointAt(e);
        this.look([c.x, c.y, c.z], [t.x, t.y, t.z], 30, false);
      } else {
        // straight down from overhead, nose to tail: in fast, slow over the cockpit, out fast (RAMP)
        cutTo(4); const x = lerp(4.7, -4.1, RAMP((b - 28) / 4));
        this.look([x, 2.9, 0.001], [x, 0, 0], 34, false, [0, 0, -1]);
      }
    } else if (b < 34) {
      /* ---- into gear. The right thumb lifts off the grip and over the button, comes down until its skin meets the
         cap, presses it on the beat, lets it up and goes back. The button is moved by the thumb's skin (pressButton),
         so it goes down exactly as far as it is pushed; the dash changes when it is most of the way down. */
      cutTo(5);
      this.look(mix3(this.pressCam[0], this.pressCam[1], (b - 32) / 2), this.pressTg, 27, false);
      studio.fill.position.set(this.pressLamp[0], this.pressLamp[1], this.pressLamp[2]); studio.fill.intensity = 0.42;
      const bt = view.pressTouch; let pa = 0, pb = 0;
      if (b < 32.55) pa = ease(clamp((b - 32.12) / 0.43, 0, 1));
      else if (b < 32.9) { pb = bt * ease((b - 32.55) / 0.35); pa = 1 - pb; }
      else if (b < 33.2) { pb = lerp(bt, 1, ease(clamp((b - 32.9) / 0.1, 0, 1))); pa = 1 - pb; }
      else if (b < 33.48) { pb = 1 - ease((b - 33.2) / 0.28); pa = 1 - pb; }
      else pa = 1 - ease(clamp((b - 33.48) / 0.42, 0, 1));
      const depth = view.pressButton(pa, pb);
      if (depth > 0.6 && b > 32.9 && !this.pressed) { this.pressed = true; this.pressB = b; sound.sfx('shift', 0.6); fx.flash = 0.12; }
      const rpm = !this.pressed ? 5200 : lerp(6800, 8200, clamp(b - this.pressB, 0, 1));
      if (view.dash) view.drawDash(this.pressed ? 1 : 'N', 0, (rpm - 6200) / 6100, 1);
      eng = [rpm, this.pressed ? 0.7 : 0.1, 0.2];
    } else if (b < 40) {
      // ---- the gear changes: one pull of the right paddle, then one on every beat
      view.pressButton(0, 0);
      // the cockpit lamp: beside the lens for the first camera (lit from the driver's side, the back of the wheel was black on black)
      if (b < 36) { studio.fill.position.set(1.0, 0.86, 0.14); studio.fill.intensity = 0.5; }
      else { studio.fill.position.set(this.pressLamp[0], this.pressLamp[1], this.pressLamp[2]); studio.fill.intensity = 0.3; }
      const second = b >= 36; cutTo(second ? 8 : 7);
      /* First camera: on the deck just ahead of the cockpit, looking back at the driver over the wheel, so the back of
         the wheel faces it: housing, paddles, quick release, both hands. (It used to stand off to the side, almost
         in the wheel's own plane, where the wheel is a sliver and half its parts are hidden or lost in the dark.) */
      if (!second) this.look(mix3([1.00, 0.82, 0.14], [0.985, 0.812, 0.132], (b - 34) / 2), [0.725, 0.60, 0.03], 34, false);
      else this.look(mix3([0.31, 0.97, 0.45], [0.37, 0.94, 0.41], (b - 36) / 4), [0.74, 0.60, 0.11], 40, false);
      const shifts = [35, 37, 38, 39];
      let since = 9, idx = -1; for (let i = 0; i < shifts.length; i++) if (b >= shifts[i]) { since = b - shifts[i]; idx = i; }
      if (idx !== this.lastShift) { this.lastShift = idx; if (idx >= 0) { this.gear = 2 + idx; sound.sfx('shift'); fx.flash = 0.25; } else this.gear = 1; }
      const next = shifts[idx + 1] ?? 40, prev = idx >= 0 ? shifts[idx] : 34, rev = clamp((b - prev) / (next - prev), 0, 1);
      this.poseHand(since < 0.3 ? Math.sin(Math.PI * clamp(since / 0.3, 0, 1)) : 0);
      const rpm = lerp(8200, 12300, rev);
      if (view.dash) view.drawDash(this.gear, 60 + this.gear * 34 + rev * 30, (rpm - 6200) / 6100, 1);
      eng = [rpm, since < 0.12 ? 0.1 : 1, 0.2];
    } else if (b < 56) {
      // ---- wet floor, wheelspin, and the two long slow looks at the tyre
      this.poseHand(0);
      studio.floorU.uWet.value = 1;
      const w = wallAt(b * BEAT);
      // picture speed: twice (SLOW in audio.js) the picture is ramped down almost to a stop, held there while the
      // name is read, and ramped back up; the music carries on at full speed
      let slow = 0, hold = -1;
      SLOW.forEach((s, i) => { const k = slowAt(s, w); if (k > 0) { slow = k; hold = i; } });
      vis = Math.pow(SLOW_PIC, slow);
      const up = clamp((b - 40) / 2, 0, 1);
      spin = SPIN * ease(up);
      // locked off: the car stands still, held on its brakes, and so does every camera in this part
      if (b < 42) { cutTo(9); this.caption('', ''); this.look([-4.7, 0.38, 2.95], [-1.5, 0.36, 0.45], 28); }
      else if (b < 48) { cutTo(10); this.look([-1.74, 0.69, 2.02], [-1.8, this.nameY[0], 1.0], 19, false); if (hold === 0 && slow > 0.6) this.caption('Created by', 'John Gresh'); else this.caption('', ''); }
      else if (b < 54) { cutTo(11); this.look([-1.95, 0.66, 1.72], [-1.8, this.nameY[1], 1.0], 12.5, false); if (hold === 1 && slow > 0.6) this.caption('Co-producer', 'Luke Carlan'); else this.caption('', ''); }
      else { cutTo(12); this.caption('', ''); this.look([5.35, 0.28, 1.3], [0, 0.45, 0], 24); }
      // in the two name shots the wheel's angle comes from the film clock (TURN): the name arrives at the top of the tyre as the picture lands
      this.nameShot = b >= 42 && b < 48 ? 0 : b >= 48 && b < 54 ? 1 : -1; this.slow = slow; this.filmW = w;
      eng = [lerp(9000, 12400, 0.5 + 0.5 * Math.sin(b * 1.7)) * lerp(1, 0.5, slow), 1, 0.2 * lerp(1, 0.6, slow)];     // the engine slows with the picture; the music does not
      fx.chroma = 0;                         // locked off and clean: no lens tricks on the burn-out
    } else {
      // ---- the camera drops in behind the car; the hall's lights come up and the door at its far end rises on
      // daylight; the car runs down the hall and out through it. The white-out at the cut is the door reaching the lens.
      cutTo(13); this.caption('', '');
      studio.floorU.uWet.value = 1;
      const u = clamp((b - 56) / 5, 0, 1), e = ease(u);
      const a = lerp(0.35, Math.PI, e), rad = lerp(5.6, 6.38, e);
      const pos = [Math.cos(a) * rad, lerp(0.3, CHASE.pos[1], e), Math.sin(a) * rad * 0.7], tg = mix3([0, 0.45, 0], CHASE.tg, e);
      this.look(pos, tg, lerp(24, CHASE.fov, ease(clamp((b - 57) / 6, 0, 1))), false);
      // distance run is worked out from the beat, not added up frame by frame, so the door arrives exactly on the cut
      const go = clamp((b - 58.5) / 5.5, 0, 1), T = 5.5 * BEAT, total = 86 * T / 3;
      this.runV = 86 * go * go; this.run = total * go * go * go;
      studio.setLaunch(ease(clamp((b - 56) / 1.5, 0, 1)), this.run, this.runV, total - 6.4 - this.run, ease(clamp((b - 56.4) / 2.0, 0, 1)));
      spin = lerp(175, 60, go);
      fx.blur = 0.018 * go * go; fx.chroma = 0.0006 * go;      // the smear is in the scene now (road, lights); the lens adds very little
      if (b > 63.2) fx.flash = Math.max(fx.flash, ease((b - 63.2) / 0.8) * 1.0);
      eng = [lerp(9000, 12300, (b * 0.5) % 1), 1, 0.22];
    }

    // ---- wheels and the water they throw
    if (b >= 40) {
      const R = 0.36;
      const named = b < 56 ? this.nameShot : -1, cut = named !== this.prevShot; this.prevShot = named;
      // right rear wheel: rotation.z = -angle; the big name is at the top at 0, the small one a quarter turn on
      if (named >= 0) this.wheel = (named ? Math.PI / 2 : 0) + TURN[named](this.filmW);
      else this.wheel += spin * vis * dt;
      const roll = b >= 56 ? this.run / R : 0;
      // how fast the tyre is turning, for its blur: known exactly in the name shots; at a cut the angle jumps, so not measured there
      const wr = named >= 0 ? SPIN * Math.pow(SLOW_WHEEL, this.slow) : cut ? spin * vis : Math.abs(this.wheel + roll - this.prevWheel) / dt;
      this.prevWheel = this.wheel + roll;
      view.setWheels(roll, this.wheel + roll, 0, Math.min(0.5, this.runV / R / 90 / 6.283), Math.min(0.5, wr / 90 / 6.283));
      view.car.position.set(0, 0, 0); view.car.rotation.set(0, 0, 0);      // the car itself does not move: no shudder, no sway
      // water off the rear tyres: fewer, finer drops, each leaving along the tread (studio.emitTyre)
      // (standing: a fan of drops off each spinning tyre and a little mist; running: fewer drops and a wake of fine spray)
      const moving = b >= 58.5 ? clamp(this.runV / 60, 0, 1) : 0;
      const rate = spin / 175 * (1 - 0.6 * moving), tread = Math.max(spin * R, this.runV);
      if (rate > 0.05) {
        const want = 250 * rate * vis * dt, wantM = (12 * rate + 30 * moving) * vis * dt;
        for (const z of [0.7875, -0.7875]) studio.emitTyre(-1.8, R - 0.0045, z, R, 0.2, tread, Math.floor(want + Math.random()), Math.floor(wantM + Math.random()), moving);
      }
      studio.updateSpray(dt * vis, vis / 160, b >= 56 ? this.runV : 0);
    } else { view.setWheels(0, 0, 0, 0, 0); view.car.position.set(0, 0, 0); view.car.rotation.set(0, 0, 0); }
    if (eng) sound.filmEngine(eng[0], eng[1], eng[2]); else sound.filmEngine(4000, 0, 0);

    if (!collage) studio.render(gfx.rt, this.cam);
    gfx.present(dtFrame);
    return false;
  }
}
