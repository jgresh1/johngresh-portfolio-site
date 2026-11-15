// Feel: weight, springs and momentum for every touch and click (shared with Camp Hollowpine and Lamplight Cove).
// Things you touch behave like objects with mass. A slow pull tracks your finger exactly; a flick carries on
// after you let go and settles; a press sinks, overshoots a hair on release, and springs home.
// Springs write a CSS custom property (--p) and the stylesheet decides what it means for each control.
export const FEEL = (() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const live = new Set(); let raf = 0, last = 0;
  function tick(now) {
    const dt = Math.min(0.04, Math.max(0.001, (now - last) / 1000)); last = now;
    for (const f of live) if (!f(dt)) live.delete(f);
    raf = live.size ? requestAnimationFrame(tick) : 0;
  }
  // runs f(dt) every frame until it returns false (its own loop, so it keeps going while the game is paused)
  function run(f) { live.add(f); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  // a damped spring: k stiffness, c damping (c < 2*sqrt(k) overshoots)
  function spring(x = 0, k = 420, c = 24) { return { x, v: 0, to: x, k, c }; }
  function step(s, dt) {
    if (reduce.matches) { s.x = s.to; s.v = 0; return false; }
    const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
    for (let i = 0; i < n; i++) { s.v += (s.k * (s.to - s.x) - s.c * s.v) * h; s.x += s.v * h; }
    if (Math.abs(s.to - s.x) < 5e-4 && Math.abs(s.v) < 5e-3) { s.x = s.to; s.v = 0; return false; }
    return true;
  }
  // pointer velocity in px/ms over the last ~100 ms; zero when the finger stopped before it lifted
  function tracker() {
    const pts = [];
    return {
      add(x, y, t) { pts.push([x, y, t]); while (pts.length > 2 && t - pts[0][2] > 100) pts.shift(); },
      reset() { pts.length = 0; },
      vel(t) {
        if (pts.length < 2) return [0, 0];
        const a = pts[0], b = pts[pts.length - 1];
        if (t - b[2] > 60) return [0, 0];
        const ms = Math.max(8, b[2] - a[2]); return [(b[0] - a[0]) / ms, (b[1] - a[1]) / ms];
      },
    };
  }
  // past `lim`, extra travel shrinks the way an iPhone list stretches past its end (d sets how stiff)
  function rubber(x, lim, d) {
    const a = Math.abs(x); if (a <= lim) return x;
    return Math.sign(x) * (lim + (1 - 1 / ((a - lim) * 0.55 / d + 1)) * d);
  }
  // a short tap of the phone's motor, where the browser allows it
  let lastBuzz = 0;
  function buzz(ms = 8) {
    const t = performance.now(); if (t - lastBuzz < 60) return; lastBuzz = t;
    try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms); } catch (e) { /* not allowed: fine */ }
  }

  // ---- springy controls: hover lifts (--p toward -1), a press sinks (toward 1), letting go bounces home
  const SEL = '.mbtn, .ucard, .t-b, .touch .slot, [data-spring]';
  const state = new WeakMap();
  function of(el) {
    let s = state.get(el);
    if (!s) {
      s = spring(0, 560, 27); s.hover = false; s.down = false;
      s.fn = dt => { const m = step(s, dt); el.style.setProperty('--p', s.x.toFixed(4)); return m; };
      state.set(el, s);
    }
    return s;
  }
  const settle = (el, s) => { s.to = s.down ? 1 : s.hover ? -1 : 0; run(s.fn); };
  const find = e => e.target instanceof Element ? e.target.closest(SEL) : null;
  document.addEventListener('pointerover', e => { const el = find(e); if (!el || e.pointerType !== 'mouse') return; const s = of(el); s.hover = true; settle(el, s); });
  document.addEventListener('pointerout', e => {
    const el = find(e); if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
    const s = of(el); s.hover = false; s.down = false; settle(el, s);
  });
  document.addEventListener('pointerdown', e => {
    const el = find(e); if (!el) return;
    const s = of(el); s.down = true; s.v += 6;   // a kick, so even the quickest tap visibly lands
    settle(el, s); if (e.pointerType === 'touch') buzz(6);
  }, true);
  const up = e => { const el = find(e); if (!el) return; const s = of(el); s.down = false; if (e.pointerType !== 'mouse') s.hover = false; settle(el, s); };
  document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  // keyboard presses on a focused button get the same push
  document.addEventListener('keydown', e => { if ((e.code === 'Enter' || e.code === 'Space') && document.activeElement?.matches?.(SEL)) { const el = document.activeElement, s = of(el); s.down = true; s.v += 6; settle(el, s); setTimeout(() => { s.down = false; settle(el, s); }, 90); } });

  // test hook: advance every live spring by `ms` (for panes where requestAnimationFrame never fires)
  function pump(ms = 16, dt = 1 / 60) { for (let t = 0; t < ms / 1000; t += dt) for (const f of live) if (!f(dt)) live.delete(f); }
  return { run, spring, step, tracker, rubber, buzz, reduce, pump };
})();
