// Phone and tablet controls, shared by the game and the free camera: a stick that appears under the left thumb, drag
// anywhere else to look, a quick tap to act (bite), two fingers to pinch-zoom, and hold buttons to rise, sink and dash.
// Touch events are handled here and cancelled, so the browser never turns them into mouse clicks or page zoom.

const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const STICK_R = 52;                    // px from centre to full speed
const TAP_MS = 280, TAP_PX = 12;       // a touch shorter and stiller than this is a tap

/**
 * @param cv   the canvas
 * @param opts.active()      true while the controls should show and work
 * @param opts.look(dx, dy)  screen-pixel drag, already scaled for touch
 * @param opts.tap()         quick tap away from the stick
 * @param opts.pinch(f)      finger spread changed by factor f since the last call
 * @returns {{ on: boolean, fwd: number, right: number, up: number, dash: boolean, tick(): void }}  call tick() once a frame
 */
export function initTouch(cv, opts) {
  const T = { on: matchMedia('(pointer: coarse)').matches, fwd: 0, right: 0, up: 0, dash: false, tick };
  const root = document.createElement('div');
  root.id = 'touchui';
  root.innerHTML = `<div class="t-stick"><i></i></div>
    <div class="t-btns">
      <div class="t-b" data-k="up">${SVG('<path d="M6 15l6-6 6 6"/>')}<small>rise</small></div>
      <div class="t-b" data-k="down">${SVG('<path d="M6 9l6 6 6-6"/>')}<small>sink</small></div>
      <div class="t-b t-dash" data-k="dash">${SVG('<path d="M4 6l7 6-7 6M12 6l7 6-7 6"/>')}<small>dash</small></div>
    </div>`;
  document.body.appendChild(root);
  const base = root.querySelector('.t-stick'), knob = base.querySelector('i');
  const held = { up: 0, down: 0, dash: 0 };

  let stick = null;                                     // { id, x, y }: the finger on the stick and the stick's centre
  const looks = new Map();                              // finger id -> { x, y, x0, y0, t0 }
  let spread = 0;

  function tick() {                                     // once a frame: show the controls when wanted, and tell the page's CSS that this is a touch device
    if (T.on !== T.body) { T.body = T.on; document.body.classList.toggle('touch', T.on); }
    show(T.on && opts.active());
  }
  function show(on) { if (T.shown !== on) { T.shown = on; root.classList.toggle('on', on); if (!on) release(); } }
  function release() {
    stick = null; looks.clear(); T.fwd = T.right = 0; base.classList.remove('on');
    for (const k in held) held[k] = 0;
    root.querySelectorAll('.t-b.down').forEach((b) => b.classList.remove('down'));
    sync();
  }
  function sync() { T.up = (held.up ? 1 : 0) - (held.down ? 1 : 0); T.dash = !!held.dash; }
  function setStick(x, y) {
    let dx = x - stick.x, dy = y - stick.y, d = Math.hypot(dx, dy);
    if (d > STICK_R * 1.6) { const k = (d - STICK_R * 1.6) / d; stick.x += dx * k; stick.y += dy * k; dx = x - stick.x; dy = y - stick.y; d = Math.hypot(dx, dy); base.style.left = stick.x + 'px'; base.style.top = stick.y + 'px'; }
    const m = Math.min(1, d / STICK_R), u = d > 0 ? m / d : 0;
    const live = m < 0.12 ? 0 : (m - 0.12) / 0.88;     // small dead zone so a resting thumb does not drift
    T.right = dx * u * (live / (m || 1)); T.fwd = -dy * u * (live / (m || 1));
    knob.style.transform = `translate(${dx * u * STICK_R}px, ${dy * u * STICK_R}px)`;
  }
  const spreadNow = () => { const [a, b] = [...looks.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  cv.addEventListener('touchstart', (e) => {
    T.on = true;
    if (!opts.active()) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (!stick && t.clientX < innerWidth * 0.42 && t.clientY > innerHeight * 0.22) {
        stick = { id: t.identifier, x: t.clientX, y: t.clientY };
        base.style.left = stick.x + 'px'; base.style.top = stick.y + 'px'; knob.style.transform = ''; base.classList.add('on');
      } else looks.set(t.identifier, { x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now() });
    }
    if (looks.size === 2) spread = spreadNow();
  }, { passive: false });

  cv.addEventListener('touchmove', (e) => {
    if (!opts.active()) return;
    e.preventDefault();
    let ldx = 0, ldy = 0;
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) { setStick(t.clientX, t.clientY); continue; }
      const l = looks.get(t.identifier);
      if (!l) continue;
      ldx += t.clientX - l.x; ldy += t.clientY - l.y; l.x = t.clientX; l.y = t.clientY;
    }
    if (looks.size >= 2) { const s = spreadNow(); if (spread > 0 && s > 0) opts.pinch(s / spread); spread = s; }
    else if (ldx || ldy) opts.look(ldx * 1.9, ldy * 1.9);
  }, { passive: false });

  const end = (e) => {
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) { stick = null; T.fwd = T.right = 0; base.classList.remove('on'); continue; }
      const l = looks.get(t.identifier);
      if (!l) continue;
      looks.delete(t.identifier);
      if (e.type === 'touchend' && looks.size === 0 && performance.now() - l.t0 < TAP_MS && Math.hypot(l.x - l.x0, l.y - l.y0) < TAP_PX && opts.active()) opts.tap();
    }
    if (looks.size < 2) spread = 0;
    if (e.cancelable) e.preventDefault();
  };
  cv.addEventListener('touchend', end, { passive: false });
  cv.addEventListener('touchcancel', end, { passive: false });

  // hold buttons
  for (const b of root.querySelectorAll('.t-b')) {
    const k = b.dataset.k;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); held[k]++; b.classList.add('down'); sync(); }, { passive: false });
    const up = (e) => { e.preventDefault(); held[k] = Math.max(0, held[k] - e.changedTouches.length); if (!held[k]) b.classList.remove('down'); sync(); };
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
  }
  window.addEventListener('blur', release);
  return T;
}
