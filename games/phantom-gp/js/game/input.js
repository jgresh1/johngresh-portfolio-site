// input.js — keyboard, gamepad and touch, merged into one set of driving inputs.
// Touch: the left thumb drags a steering puck (1:1 with the finger, rubber band past full lock, springs home on
// release); the right thumb has the brake, the boost and, with auto-throttle off, the throttle.
import { FEEL } from './feel.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = (id) => document.getElementById(id);

export class Input {
  constructor() {
    this.steer = 0; this.throttle = 0; this.brake = 0; this.boost = false;
    this.keys = new Set(); this.kSteer = 0;
    this.touch = matchMedia('(pointer: coarse)').matches;
    // An iPad with a keyboard or trackpad attached says its pointer is fine. It is still an iPad: it gets the
    // light quality level (main.js), and its touch controls appear the moment the screen is touched.
    this.tablet = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (this.tablet && !this.touch) addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !this.touch) { this.touch = true; document.body.classList.add('touch'); } }, { capture: true, passive: true });
    this.autoThrottle = this.touch;
    this.on = { pause() {}, cam() {}, reset() {}, any() {} };
    this.enabled = false;
    this.pad = { steer: 0, thr: 0, brk: 0, boost: false, last: {} };
    this.t = { steerId: -1, x0: 0, x: 0, puck: FEEL.spring(0, 380, 26), brake: false, gas: false, boost: false, range: 80 };
    this.usedTouch = false;
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.repeat) { if (this.enabled && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault(); return; }
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.on.pause();
      else if (e.code === 'KeyC') this.on.cam();
      else if (e.code === 'KeyR') this.on.reset();
      this.on.any(e);
      if (this.enabled && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.bindTouch();
  }

  bindTouch() {
    const zone = $('t-steer'), puck = $('t-puck'), T = this.t;
    if (!zone) return;
    const setRange = () => { T.range = clamp(zone.clientWidth * 0.30, 52, zone.clientWidth > 520 ? 150 : 120); };      // (a tablet's thumb has further to travel than a phone's)
    zone.addEventListener('pointerdown', (e) => {
      if (T.steerId !== -1) return;
      this.usedTouch = true; setRange();
      T.steerId = e.pointerId; T.x0 = e.clientX - T.puck.x * T.range; T.x = e.clientX; T.puck.v = 0;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      zone.classList.add('on'); e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === T.steerId) { T.x = e.clientX; e.preventDefault(); } });
    const up = (e) => { if (e.pointerId === T.steerId) { T.steerId = -1; zone.classList.remove('on'); T.puck.to = 0; } };
    zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
    const pedal = (id, key) => {
      const el = $(id); if (!el) return;
      const set = (v) => (e) => { T[key] = v; this.usedTouch = true; e.preventDefault(); if (v) FEEL.buzz(5); };
      el.addEventListener('pointerdown', (e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } set(true)(e); });
      el.addEventListener('pointerup', set(false)); el.addEventListener('pointercancel', set(false)); el.addEventListener('lostpointercapture', () => { T[key] = false; });
    };
    pedal('t-brake', 'brake'); pedal('t-gas', 'gas'); pedal('t-boost', 'boost');
    this.puckEl = puck;
  }

  // speed in m/s: keyboard steering moves slower at speed so a tap is a small correction
  poll(dt, speed = 0) {
    const K = this.keys, T = this.t;
    // ---- keyboard
    const kl = K.has('ArrowLeft') || K.has('KeyA'), kr = K.has('ArrowRight') || K.has('KeyD');
    const target = (kr ? 1 : 0) - (kl ? 1 : 0);
    // A key is all or nothing, so the wheel behind it turns at a rate and the first part of its travel does little
    // (the curve below): a tap is a nudge and a held key still reaches full lock.
    const fast = 0.15;      // sim.js scales steering with speed itself (see "How the car steers at speed")
    const rate = target === 0 ? 8 : (Math.sign(target) !== Math.sign(this.kSteer) && this.kSteer !== 0 ? 7 : 3.6 - 2.5 * fast);
    this.kSteer += clamp(target - this.kSteer, -rate * dt, rate * dt);
    const shape = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
    let steer = shape(this.kSteer, 1.2 + 0.8 * fast);
    let thr = K.has('ArrowUp') || K.has('KeyW') ? 1 : 0, brk = K.has('ArrowDown') || K.has('KeyS') ? 1 : 0;
    let boost = K.has('ShiftLeft') || K.has('ShiftRight') || K.has('Space');
    // ---- gamepad
    const gp = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find((g) => g && g.connected && g.buttons.length > 7);
    if (gp) {
      const ax = Math.abs(gp.axes[0]) > 0.09 ? gp.axes[0] : 0, s = shape(ax, 1.5 + 0.7 * fast);
      if (Math.abs(s) > Math.abs(steer)) steer = s;
      thr = Math.max(thr, gp.buttons[7].value); brk = Math.max(brk, gp.buttons[6].value);
      boost = boost || gp.buttons[0].pressed || gp.buttons[5].pressed;
      const edge = (i, fn) => { const p = gp.buttons[i] && gp.buttons[i].pressed; if (p && !this.pad.last[i]) fn(); this.pad.last[i] = p; };
      edge(9, () => this.on.pause()); edge(3, () => this.on.cam()); edge(2, () => this.on.reset()); edge(0, () => this.on.any({ code: 'Pad' }));
    }
    // ---- touch
    if (T.steerId !== -1) {
      const raw = (T.x - T.x0) / T.range;
      T.puck.x = FEEL.rubber(raw, 1, 0.35); T.puck.to = T.puck.x; T.puck.v = 0;
    } else if (T.puck.x !== 0 || T.puck.v !== 0) FEEL.step(T.puck, dt);
    if (this.puckEl) this.puckEl.style.transform = `translate3d(${(T.puck.x * T.range).toFixed(1)}px, 0, 0)`;
    if (this.usedTouch) {
      const ts = clamp(T.puck.x, -1, 1), curved = shape(ts, 1.3 + 0.7 * fast);
      if (Math.abs(curved) > Math.abs(steer)) steer = curved;
      if (T.brake) brk = 1; if (T.gas) thr = 1; if (T.boost) boost = true;
    }
    if (this.autoThrottle && this.enabled) thr = brk > 0.05 ? 0 : 1;
    this.steer = clamp(steer, -1, 1);
    // pedals have a little travel: quick to press, quicker to release
    this.throttle += clamp(thr - this.throttle, -dt * 9, dt * 6.5);
    this.brake += clamp(brk - this.brake, -dt * 10, dt * 7.5);
    this.boost = boost;
    return this;
  }
}
