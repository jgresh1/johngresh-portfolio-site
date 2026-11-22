// input.js — keyboard, gamepad, mouse and touch, all ending in one set of numbers the aircraft reads:
//   roll (-1 left .. 1 right), pitch (1 = stick back, nose up), yaw (1 = nose right), throttle 0..1, brake 0..1
// The cursor is never captured. Dragging the picture looks around (1:1, stays where it is left).
//
//   keyboard   A D / arrows roll · S / down = stick back (nose up), W / up = nose down · Q E rudder
//              R F (or + -) throttle · Space air brake and wheel brakes · C view · V look ahead · P or Esc pause
//   gamepad    left stick flies · right stick looks · triggers throttle up / down · bumpers rudder · A brake · Y view · Start pause
//   touch      left thumb: a stick that appears where the thumb lands · right edge: throttle lever · drag elsewhere to look
//   mouse      (option) the cursor is the stick: where it sits in the window is how far the stick is over; hold a button to look
//
// Feel. A key is on or off, so each axis is shaped in time: the first third of the travel comes at once (a tap is a
// small correction), the rest builds over a quarter of a second (holding is a full deflection), and letting go
// springs it home. Sticks and thumbs are shaped in travel instead: fine near the centre, full at the rim.
// `response` (gentle / normal / sharp) moves both.
export const RESPONSE = { gentle: { expo: 2.0, first: 0.24, build: 2.0 }, normal: { expo: 1.5, first: 0.35, build: 2.6 }, sharp: { expo: 1.15, first: 0.5, build: 3.6 } };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// One key axis, one frame on: v is where it is (-1..1), want is the key (-1, 0, 1).
// The first part of the travel comes at once, the rest builds, and letting go springs it home.
export function shapeKey(v, want, dt, R = RESPONSE.normal) {
  if (want === 0) { const step = 9 * dt; return Math.abs(v) <= step ? 0 : v - Math.sign(v) * step; }
  if (v !== 0 && Math.sign(v) !== want) { const step = 11 * dt; return Math.abs(v) <= step ? 0 : v - Math.sign(v) * step; }      // reversing: through the centre quickly
  const a = Math.abs(v);
  return want * Math.min(1, a < R.first ? Math.min(R.first, a + 9 * dt) : a + R.build * dt);
}
const expo = (x, e = 1.6) => Math.sign(x) * Math.pow(Math.abs(x), e);

export class Input {
  constructor(surface, layer, { touch = false } = {}) {
    this.surface = surface; this.layer = layer;
    this.roll = 0; this.pitch = 0; this.yaw = 0; this.throttle = 0.6; this.brake = 0;
    this.invert = false;                       // true: up = nose up
    this.response = 'normal'; this.mouseFly = false; this.mx = 0; this.my = 0; this.mIn = false; this.mouseX = 0; this.mouseY = 0;
    this.pad = null; this.rumbleAt = 0;
    this.enabled = false;
    this.keys = new Set(); this.kRoll = 0; this.kPitch = 0; this.kYaw = 0;
    this.on = { view() {}, pause() {}, recentre() {}, look() {}, zoom() {}, any() {} };
    this.padSeen = false; this.padBtn = {};
    this.touch = touch; this.stick = null; this.thr = null; this.pointers = new Map(); this.lookId = null; this.lastTap = 0; this.pinch = 0;

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) this.on.pause(); return; }
      if (!this.enabled) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code); this.on.any();
      if (e.repeat) return;
      if (e.code === 'KeyC') this.on.view();
      if (e.code === 'KeyV') this.on.recentre();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    surface.style.touchAction = 'none';
    surface.addEventListener('pointerdown', (e) => this.down(e));
    surface.addEventListener('pointermove', (e) => this.move(e));
    surface.addEventListener('pointerup', (e) => this.up(e));
    surface.addEventListener('pointercancel', (e) => this.up(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('wheel', (e) => { if (!this.enabled) return; e.preventDefault(); this.on.zoom(Math.exp(clamp(e.deltaY * (e.deltaMode === 1 ? 33 : 1), -300, 300) * 0.0011)); }, { passive: false });
    surface.addEventListener('dblclick', () => { if (this.enabled) this.on.recentre(); });
    surface.addEventListener('pointerleave', () => { this.mIn = false; });
    if (touch) this.buildTouch();
  }

  /* ---------------------------------------------------------------- touch controls */
  buildTouch() {
    const mk = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; this.layer.appendChild(d); return d; };
    const base = mk('t-stick', '<i></i>'), knob = base.firstChild;
    this.stick = { base, knob, id: null, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0, kx: 0, ky: 0, R: 62 };
    const track = mk('t-thr', '<b></b><i></i><span>PWR</span>');
    this.thr = { track, fill: track.children[0], knob: track.children[1], id: null, y0: 0, v0: 0, shown: this.throttle };
    track.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); try { track.setPointerCapture(e.pointerId); } catch { /* gone */ } this.thr.id = e.pointerId; this.thr.y0 = e.clientY; this.thr.v0 = this.throttle; track.classList.add('held'); this.on.any(); });
    track.addEventListener('pointermove', (e) => { if (this.thr.id !== e.pointerId) return; const h = track.clientHeight - 44; this.throttle = clamp(this.thr.v0 - (e.clientY - this.thr.y0) / h, 0, 1); });
    const end = (e) => { if (this.thr.id === e.pointerId) { this.thr.id = null; track.classList.remove('held'); } };
    track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
    const btn = (cls, label, fn, hold) => {
      const b = mk('t-btn ' + cls, label);
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); b.classList.add('held'); if (hold) hold(1); else fn(); this.on.any(); });
      const rel = () => { b.classList.remove('held'); if (hold) hold(0); };
      b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('pointerleave', rel);
      return b;
    };
    btn('t-brake', 'BRAKE', null, (v) => { this.tBrake = v; });
    btn('t-view', 'VIEW', () => this.on.view());
  }

  down(e) {
    if (!this.enabled) return;
    try { this.surface.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const r = this.surface.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.on.any();
    const s = this.stick;
    if (s && e.pointerType !== 'mouse' && s.id == null && x < r.width * 0.46 && y > r.height * 0.22) {
      s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0;
      s.base.style.left = x + 'px'; s.base.style.top = y + 'px'; s.base.classList.add('on');
      return;
    }
    if (this.lookId == null) {
      this.lookId = e.pointerId;
      const now = performance.now();
      if (e.pointerType !== 'mouse' && now - this.lastTap < 300) this.on.recentre();
      this.lastTap = now;
    }
  }

  move(e) {
    if (e.pointerType === 'mouse') {             // where the cursor sits in the window, -1..1 each way from the centre
      const r = this.surface.getBoundingClientRect();
      this.mx = clamp((e.clientX - r.left - r.width / 2) / (r.width * 0.30), -1, 1); this.my = clamp((e.clientY - r.top - r.height / 2) / (r.height * 0.34), -1, 1);
      this.mIn = true;
    }
    const p = this.pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    const s = this.stick;
    if (s && s.id === e.pointerId) {
      let x = e.clientX - s.ox, y = e.clientY - s.oy; const d = Math.hypot(x, y);
      if (d > s.R) {                                   // past the rim the base is dragged along, so the thumb never runs out of travel
        const k = (d - s.R) / d; s.ox += x * k; s.oy += y * k; x -= x * k; y -= y * k;
        const r = this.surface.getBoundingClientRect(); s.base.style.left = s.ox - r.left + 'px'; s.base.style.top = s.oy - r.top + 'px';
      }
      s.x = x / s.R; s.y = y / s.R;
      return;
    }
    if (this.lookId === e.pointerId) {
      // a second finger outside the stick: pinch to bring the camera in or out
      const others = [...this.pointers.entries()].filter(([id]) => id !== e.pointerId && id !== s?.id && id !== this.thr?.id);
      if (others.length) {
        const o = others[0][1], d = Math.hypot(p.x - o.x, p.y - o.y);
        if (this.pinch) this.on.zoom(clamp(this.pinch / Math.max(d, 1), 0.8, 1.25));
        this.pinch = d; return;
      }
      this.on.look(dx, dy);
    }
  }

  up(e) {
    this.pointers.delete(e.pointerId); this.pinch = 0;
    try { this.surface.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const s = this.stick;
    if (s && s.id === e.pointerId) { s.id = null; s.x = s.y = 0; s.base.classList.remove('on'); s.base.style.left = ''; s.base.style.top = ''; }      // back to where it waits
    if (this.lookId === e.pointerId) this.lookId = null;
  }

  /* ---------------------------------------------------------------- every frame */
  update(dt) {
    const k = this.keys, has = (...c) => c.some((x) => k.has(x));
    const R = RESPONSE[this.response] || RESPONSE.normal, ramp = (v, want) => shapeKey(v, want, dt, R);
    const kr = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
    let kp = (has('KeyS', 'ArrowDown') ? 1 : 0) - (has('KeyW', 'ArrowUp') ? 1 : 0);
    if (this.invert) kp = -kp;
    const ky = (has('KeyE') ? 1 : 0) - (has('KeyQ') ? 1 : 0);
    this.kRoll = ramp(this.kRoll, kr); this.kPitch = ramp(this.kPitch, kp); this.kYaw = ramp(this.kYaw, ky);
    let roll = this.kRoll, pitch = this.kPitch, yaw = this.kYaw, brake = has('Space') ? 1 : 0;
    const dthr = (has('KeyR', 'Equal', 'NumpadAdd', 'PageUp', 'ShiftLeft', 'ShiftRight') ? 1 : 0) - (has('KeyF', 'Minus', 'NumpadSubtract', 'PageDown') ? 1 : 0);
    this.throttle = clamp(this.throttle + dthr * 0.55 * dt, 0, 1);

    const pad = this.enabled ? [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected && p.axes.length >= 2) : null;
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88), b = (i) => pad.buttons[i]?.value || 0;
      const lx = dz(pad.axes[0]), ly = dz(pad.axes[1]), rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
      if (lx || ly || rx || ry || pad.buttons.some((x) => x.pressed)) { this.padSeen = true; this.on.any(); }
      if (this.padSeen) {
        roll += expo(lx, R.expo); pitch += expo(ly, R.expo) * (this.invert ? -1 : 1); yaw += b(5) - b(4); this.pad = pad;
        this.throttle = clamp(this.throttle + (b(7) - b(6)) * 0.7 * dt, 0, 1);
        brake = Math.max(brake, b(0));
        if (rx || ry) this.on.look(-rx * 900 * dt, -ry * 700 * dt);          // a held stick turns the view at a steady rate; it stays where it is left
        const edge = (i, fn) => { const d = pad.buttons[i]?.pressed; if (d && !this.padBtn[i]) fn(); this.padBtn[i] = d; };
        edge(3, () => this.on.view()); edge(9, () => this.on.pause()); edge(11, () => this.on.recentre());
      }
    }
    const s = this.stick;
    if (s) {
      if (s.id != null) { roll += expo(s.x, R.expo * 0.93); pitch += expo(s.y, R.expo * 0.93) * (this.invert ? -1 : 1); }
      // the knob follows the thumb exactly; let go and it springs home with a little overshoot
      const tx = s.id != null ? s.x : 0, ty = s.id != null ? s.y : 0;
      if (s.id != null) { s.kx = tx; s.ky = ty; s.vx = s.vy = 0; }
      else { const w = 26, z = 0.62; s.vx += (-w * w * s.kx - 2 * z * w * s.vx) * dt; s.vy += (-w * w * s.ky - 2 * z * w * s.vy) * dt; s.kx += s.vx * dt; s.ky += s.vy * dt; }
      s.knob.style.transform = `translate(${(s.kx * s.R).toFixed(1)}px, ${(s.ky * s.R).toFixed(1)}px)`;
      brake = Math.max(brake, this.tBrake || 0);
      const t = this.thr; t.shown += (this.throttle - t.shown) * (1 - Math.exp(-dt * 22));
      const h = t.track.clientHeight - 44;
      t.knob.style.transform = `translateY(${(-t.shown * h).toFixed(1)}px)`; t.fill.style.height = (t.shown * h + 22).toFixed(1) + 'px';
    }
    // the cursor as the stick: eased a little so a twitch of the hand is not a twitch of the aircraft; a held button looks instead
    if (this.mouseFly && this.enabled) {
      const dz = (v) => (Math.abs(v) < 0.05 ? 0 : (v - Math.sign(v) * 0.05) / 0.95), live = this.mIn && this.lookId == null;
      const k = 1 - Math.exp(-dt * (live ? 18 : 5));
      this.mouseX += ((live ? expo(dz(this.mx), R.expo * 0.9) : 0) - this.mouseX) * k; this.mouseY += ((live ? expo(dz(this.my), R.expo * 0.9) : 0) - this.mouseY) * k;
      roll += this.mouseX; pitch += this.mouseY * (this.invert ? -1 : 1);
    }
    this.roll = clamp(roll, -1, 1); this.pitch = clamp(pitch, -1, 1); this.yaw = clamp(yaw, -1, 1); this.brake = brake;
  }

  // something to feel: a gamepad's motors, a phone's buzzer. strength 0..1, milliseconds.
  buzz(strength, ms = 60) {
    const now = performance.now(); if (now < this.rumbleAt) return; this.rumbleAt = now + ms * 0.8;
    try { this.pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, weakMagnitude: Math.min(1, strength), strongMagnitude: Math.min(1, strength * 0.7) }); } catch { /* no motors */ }
    if (this.touch && strength > 0.45) { try { navigator.vibrate?.(Math.min(ms, 80)); } catch { /* not allowed */ } }
  }
}
