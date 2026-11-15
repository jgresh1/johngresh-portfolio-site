// intro.js — the opening film: 64 beats in the studio, cut to the soundtrack, ending on the cut to the race.
//   0-4    black, title card            4-15.5  stills flash into a 3 x 3 collage, faster and faster
//   16-24  the drop: the whole car      24-32   four shots along the body, one per two beats
//   32-40  the gear changes             40-56   wet floor, wheelspin, two slow-motion looks at the tyre lettering
//   56-64  the camera drops in behind the car, the floor starts to run, flash, cut to the circuit
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
const CHASE = { pos: [-6.38, 1.58, 0], tg: [12.6, 0.95, 0], fov: 70.9 };     // where the race camera sits at 290 km/h

export class Intro {
  constructor(ctx) {
    this.ctx = ctx; this.done = true; this.clock = null; this.tile = 0; this.beat = 0; this.cut = -1; this.wheel = 0; this.gear = 1; this.lastShift = -1; this.cap = '';
    this.cam = ctx.studio.camera; this.tg = V(0, 0.4, 0);
    const v = ctx.view;
    // right hand and its paddle, for the gear change
    v.root.updateMatrixWorld(true);
    this.hand = null;
    if (v.sw) { this.grip = v.sw.localToWorld(V(0.1335, -0.012, 0.004)); this.gripAxis = V(0, 1, 0).transformDirection(v.sw.matrixWorld); }
    this.paddleZ = v.paddle ? v.paddle.position.z : 0;
    this._m = new THREE.Matrix4(); this._t = new THREE.Matrix4();
  }

  start() {
    const { studio, hud, gfx, sound, view } = this.ctx;
    this.done = false; this.warm = 0; this.tile = 0; this.cut = -1; this.wheel = 0; this.gear = 1; this.lastShift = -1; this.cap = ''; this.last = performance.now() / 1000; this.run = 0; this.runV = 0;
    studio.floorU.uWet.value = 0; studio.floorU.uRun.value = 0; studio.clearSpray(); studio.setTunnel(0, 0); this.prevWheel = 0;
    gfx.clearCollage(); gfx.setLook(LOOKS.studio); gfx.fx.fade = 1; gfx.fx.flash = 0; gfx.fx.blur = 0; gfx.fx.punch = 0; gfx.fx.chroma = 0;
    view.home(); view.setWheels(0, 0, 0, 0, 0); if (view.dash) view.drawDash(1, 0, 0, 1);
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
    studio.floorU.uWet.value = 0; studio.floorU.uRun.value = 0; studio.clearSpray(); studio.setTunnel(0, 0);
    this.poseHand(0); view.car.position.set(0, 0, 0); view.car.rotation.set(0, 0, 0);
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
    if (v.paddle) v.paddle.position.z = this.paddleZ + 0.007 * k;
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
    const beatF = b - Math.floor(b), pulse = Math.exp(-beatF * 7);
    studio.floorU.uTime.value += dt;
    fx.flash = Math.max(0, fx.flash - dt * 5); fx.punch = 0; fx.chroma = 0; fx.blur = 0; fx.fade = 0;
    // keep the circuit ready for the cut: a few tiny frames of it while the screen is black, and again in the last flash
    if (this.ctx.warmTrack && ((b > 15.55 && b < 16 && this.warm < 5) || (b > 62.9 && this.warm < 10))) { this.warm = Math.max(this.warm, b > 60 ? 5 : 0) + 1; this.ctx.warmTrack(); }
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
      fx.punch = 0.035 * pulse; fx.chroma = 0.004 * pulse;
    } else if (b < 32) {
      // ---- along the body, a cut every two beats
      const k = Math.floor((b - 24) / 2), u = ((b - 24) / 2) % 1; cutTo(3 + k);
      if (k === 0) { const x = lerp(3.3, -1.3, u); this.look([x, 0.36, 1.72], [x - 1.0, 0.42, 0.55], 32, false); }
      else if (k === 1) { const x = lerp(3.0, -2.5, u); this.look([x, 2.9, 0.001], [x, 0, 0], 34, false, [0, 0, -1]); }
      else if (k === 2) this.look(mix3([-6.0, 0.6, 1.5], [-4.3, 0.62, 0.45], ease(u)), [-2.2, 0.62, 0], 30);
      else this.look(mix3([4.9, 0.5, -1.0], [3.2, 0.98, -0.5], u), [1.5, 0.5, 0], 28);
      fx.punch = 0.03 * pulse; fx.chroma = 0.003 * pulse;
    } else if (b < 40) {
      // ---- the gear changes: a pull of the right paddle on every other beat, then every beat
      const second = b >= 36; cutTo(second ? 8 : 7);
      if (!second) this.look(mix3([1.02, 1.08, 0.66], [0.93, 1.04, 0.60], (b - 32) / 4), [0.70, 0.60, 0.10], 34, false);
      else this.look(mix3([0.31, 0.97, 0.45], [0.37, 0.94, 0.41], (b - 36) / 4), [0.74, 0.60, 0.11], 40, false);
      const shifts = [33, 35, 37, 38, 39];
      let since = 9, idx = -1; for (let i = 0; i < shifts.length; i++) if (b >= shifts[i]) { since = b - shifts[i]; idx = i; }
      if (idx !== this.lastShift) { this.lastShift = idx; if (idx >= 0) { this.gear = 2 + idx; sound.sfx('shift'); fx.flash = 0.25; } else this.gear = 1; }
      const next = shifts[idx + 1] ?? 40, prev = idx >= 0 ? shifts[idx] : 32, rev = clamp((b - prev) / (next - prev), 0, 1);
      this.poseHand(since < 0.3 ? Math.sin(Math.PI * clamp(since / 0.3, 0, 1)) : 0);
      const rpm = lerp(8200, 12300, rev);
      if (view.dash) view.drawDash(this.gear, 60 + this.gear * 34 + rev * 30, (rpm - 6200) / 6100, 1);
      eng = [rpm, since < 0.12 ? 0.1 : 1, 0.2];
      fx.punch = since < 0.2 ? 0.03 * (1 - since / 0.2) : 0;
    } else if (b < 56) {
      // ---- wet floor, wheelspin, and the two slow looks at the tyre
      this.poseHand(0);
      studio.floorU.uWet.value = 1;
      const w = this.clock.wall();
      // picture speed: the two slow-motion dips in the music (audio.js) drop the picture almost to a stop
      let slow = 0, hold = -1;
      SLOW.forEach((s, i) => { const w0 = wallAt(s.beat * BEAT), a = w0 + s.in, c = a + s.hold, d = c + s.out; if (w > w0 && w < d) { slow = w < a ? ease((w - w0) / s.in) : w < c ? 1 : 1 - ease((w - c) / s.out); hold = i; this.holdU = clamp((w - a) / s.hold, 0, 1); } });
      vis = lerp(1, 0.012, slow);
      const up = clamp((b - 40) / 2.5, 0, 1);
      spin = 175 * ease(up);
      if (b < 44) { cutTo(9); const u = (b - 40) / 4; this.look(mix3([-4.9, 0.36, 3.1], [-4.4, 0.42, 2.7], u), [-1.5, 0.36, 0.45], 28); }
      else if (b < 48) { cutTo(10); this.look([-1.74, 0.69, 2.02], [-1.8, 0.585, 1.0], 19, false); if (hold === 0 && slow > 0.6) this.caption('Created by', 'John Gresh'); else this.caption('', ''); }
      else if (b < 52) { cutTo(11); this.look([-1.95, 0.66, 1.72], [-1.8, 0.607, 1.0], 12.5, false); if (hold === 1 && slow > 0.6) this.caption('Co-producer', 'Luke Carlan'); else this.caption('', ''); }
      else { cutTo(12); this.caption('', ''); const u = (b - 52) / 4; this.look(mix3([5.6, 0.26, 1.5], [5.0, 0.3, 1.0], u), [0, 0.45, 0], 24); }
      // while the picture is held, the lettering sits at the top of the tyre and drifts through the frame
      this.nameAt = hold === 0 ? 0 : hold === 1 ? Math.PI / 2 : null; this.slow = slow;
      eng = [lerp(9000, 12400, 0.5 + 0.5 * Math.sin(b * 1.7)) * lerp(1, 0.5, slow), 1, 0.2 * lerp(1, 0.6, slow)];
      fx.chroma = 0.003 * pulse * (1 - slow);
    } else {
      // ---- the camera drops in behind the car, the floor starts to run under it, flash, cut
      cutTo(13); this.caption('', '');
      studio.floorU.uWet.value = 1;
      const u = clamp((b - 56) / 5, 0, 1), e = ease(u);
      const a = lerp(0.35, Math.PI, e), rad = lerp(5.6, 6.38, e);
      const pos = [Math.cos(a) * rad, lerp(0.3, CHASE.pos[1], e), Math.sin(a) * rad * 0.7], tg = mix3([0, 0.45, 0], CHASE.tg, e);
      this.look(pos, tg, lerp(24, CHASE.fov, ease(clamp((b - 57) / 6, 0, 1))), false);
      const go = clamp((b - 58.5) / 5.5, 0, 1);
      this.runV = 86 * go * go; this.run += this.runV * dt; studio.floorU.uRun.value = this.run % 4096; studio.setTunnel(this.run, Math.min(1, go * 2.2));
      spin = lerp(175, 60, go);
      fx.blur = 0.05 * go * go; fx.chroma = 0.004 * go;
      if (b > 63) fx.flash = Math.max(fx.flash, ease((b - 63) / 1) * 1.0);
      eng = [lerp(9000, 12300, (b * 0.5) % 1), 1, 0.22];
    }

    // ---- wheels, spray and the shudder of a car held on the brakes
    if (b >= 40) {
      const R = 0.36;
      if (this.nameAt !== null && this.slow > 0.02 && b < 52) {
        // right rear wheel: rotation.z = -angle; the big name is at the top at 0, the small one a quarter turn on
        const target = -(this.nameAt + lerp(0.34, -0.34, this.holdU || 0));
        this.wheel = lerp(this.wheel + spin * vis * dt, -target, this.slow > 0.98 ? 1 : 0);
        if (this.slow > 0.98) this.wheel = -target;
      } else this.wheel += spin * vis * dt;
      const roll = b >= 56 ? this.run / R : 0;
      const wr = Math.abs(this.wheel + roll - this.prevWheel) / dt; this.prevWheel = this.wheel + roll;
      view.setWheels(roll, this.wheel + roll, 0, Math.min(0.5, this.runV / R / 90 / 6.283), Math.min(0.5, wr / 90 / 6.283));
      const sh = (b < 56 ? 1 : 1 - clamp((b - 58.5) / 3, 0, 1)) * ease(clamp((b - 40) / 2, 0, 1)) * (0.2 + 0.8 * vis);
      view.car.position.set(Math.sin(now * 61) * 0.0016 * sh, Math.abs(Math.sin(now * 47)) * 0.0012 * sh, Math.sin(now * 23) * 0.004 * sh);
      view.car.rotation.set(0, Math.sin(now * 5.3) * 0.004 * sh, 0);
      const rate = spin / 175 * (b < 56 ? 1 : 1 - clamp((b - 58.5) / 4, 0, 1));
      if (rate > 0.05) for (const z of [0.8, -0.8]) studio.emit(V(-1.92, 0.02, z), V(-0.72, 0.62, 0), 4 + 7 * rate, Math.round((studio.NP / 90) * rate * vis * dt * 60 + Math.random() * 0.6));
      studio.updateSpray(dt * vis);
    } else { view.setWheels(0, 0, 0, 0, 0); view.car.position.set(0, 0, 0); view.car.rotation.set(0, 0, 0); }
    if (eng) sound.filmEngine(eng[0], eng[1], eng[2]); else sound.filmEngine(4000, 0, 0);

    if (!collage) studio.render(gfx.rt, this.cam);
    gfx.present(dtFrame);
    return false;
  }
}
