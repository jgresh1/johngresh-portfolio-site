// sound.js — everything heard is made here from noise and a few tones; there are no recordings.
//   engine   a small turbojet: compressor whine that climbs with the revs, a roar and a low rumble behind it
//   air      wind over the airframe, by speed; quieter and duller from the cockpit
//   fly-by   heard from a camera standing still: level by distance, pitch by how fast the aircraft closes or leaves
//   film     hangar lamps, the door, with a hall's echo
// None of this has been heard by its author (it was written without ears); levels were set by reasoning.
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.level = 0.85;
    try { this.muted = localStorage.getItem('tokyo.mute') === '1'; } catch { /* private window */ }
  }

  // must be called from inside a tap or key press, or phones stay silent
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC({ latencyHint: 'interactive' });
    const out = c.createDynamicsCompressor(); out.threshold.value = -14; out.ratio.value = 6; out.attack.value = 0.004; out.release.value = 0.25;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.level;
    out.connect(this.master).connect(c.destination); this.out = out;
    // two seconds of white noise, looped: the raw material for the engine, the wind and the door
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 1.9); return s; };
    const chain = (src, type, f, q, g) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gn = c.createGain(); gn.gain.value = g; src.connect(fl).connect(gn); return { fl, gn }; };
    // engine: everything meets at one bus that can be dulled (from inside the cockpit) and set by distance
    this.eng = c.createGain(); this.eng.gain.value = 0;
    this.engLP = c.createBiquadFilter(); this.engLP.type = 'lowpass'; this.engLP.frequency.value = 18000;
    this.eng.connect(this.engLP).connect(out);
    this.roar = chain(noise(), 'bandpass', 300, 0.7, 0); this.roar.gn.connect(this.eng);
    this.rumble = chain(noise(), 'lowpass', 110, 0.5, 0); this.rumble.gn.connect(this.eng);
    this.hiss = chain(noise(), 'highpass', 2600, 0.5, 0); this.hiss.gn.connect(this.eng);
    this.whine = [1, 2.01, 3.03].map((m, i) => { const o = c.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = 400 * m; const g = c.createGain(); g.gain.value = 0; o.connect(g).connect(this.eng); o.start(); return { o, g, m, k: [1, 0.42, 0.18][i] }; });
    this.wind = chain(noise(), 'bandpass', 500, 0.6, 0); this.wind.gn.connect(out);
    this.windLo = chain(noise(), 'lowpass', 160, 0.4, 0); this.windLo.gn.connect(out);
    // a hall: one and a half seconds of dying noise
    const ir = c.createBuffer(2, c.sampleRate * 1.6, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 2.6); }
    this.hall = c.createConvolver(); this.hall.buffer = ir;
    this.hallIn = c.createGain(); this.hallIn.gain.value = 0; this.hallIn.connect(this.hall).connect(out);
    this.engLP.connect(this.hallIn);
  }

  get time() { return this.ctx ? this.ctx.currentTime : 0; }
  mute(on) { this.muted = on; try { localStorage.setItem('tokyo.mute', on ? '1' : '0'); } catch { /* private window */ } if (this.ctx) this.master.gain.setTargetAtTime(on ? 0 : this.level, this.ctx.currentTime, 0.05); }
  suspend(on) { if (!this.ctx) return; if (on) this.ctx.suspend(); else this.ctx.resume(); }

  // spool 0..1, speed m/s, where: 'chase' | 'cockpit' | 'flyby' | 'hangar'; dist m and closing m/s (positive = coming nearer) for fly-by and film
  update({ spool = 0, speed = 0, where = 'chase', dist = 12, closing = 0, buffet = 0, ground = false, gain = 1 }) {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const t = c.currentTime, set = (p, v, tc = 0.06) => p.setTargetAtTime(v, t, tc);
    const N = clamp(spool, 0, 1.05), run = N > 0.005 ? 1 : 0;
    let dop = 1, level = 1, lp = 18000, windK = 1, hall = 0;
    if (where === 'cockpit') { level = 0.42; lp = 1100; windK = 0.6; }
    else if (where === 'flyby' || where === 'film') { dop = clamp(343 / (343 - clamp(closing, -200, 200)), 0.62, 1.6); level = clamp(2.2 / (1 + (dist / 28) ** 1.7), 0, 1.5); lp = clamp(16000 / (1 + dist / 900), 1500, 18000); windK = clamp(1.4 / (1 + (dist / 40) ** 2), 0, 1); }
    else if (where === 'hangar') { level = clamp(1.6 / (1 + (dist / 14) ** 1.5), 0, 1.3); hall = 0.5; windK = 0; }
    set(this.eng.gain, level * gain * run); set(this.engLP.frequency, lp, 0.1); set(this.hallIn.gain, hall, 0.2);
    const f0 = (700 + 3300 * N) * dop;
    for (const w of this.whine) { set(w.o.frequency, Math.min(f0 * w.m, 15000), 0.04); set(w.g.gain, (0.010 + 0.034 * N) * w.k * (0.3 + 0.7 * N)); }
    set(this.roar.fl.frequency, (190 + 560 * N) * dop); set(this.roar.gn.gain, 0.05 + 0.60 * N * N);
    set(this.rumble.gn.gain, 0.10 + 0.55 * N * N + 0.5 * buffet); set(this.hiss.gn.gain, 0.02 + 0.13 * Math.pow(N, 1.5));
    const v = clamp(speed / 140, 0, 1.2);
    set(this.wind.fl.frequency, 260 + 1500 * v); set(this.wind.gn.gain, (0.5 * v * v + 0.25 * buffet) * windK * gain);
    set(this.windLo.gn.gain, (0.35 * v * v + (ground ? 0.25 * Math.min(speed / 40, 1) : 0) + 0.4 * buffet) * windK * gain);
  }

  // short one-off sounds. 'clunk' a lamp bank switching on, 'click' a switch, 'touch' tyres meeting the runway, 'crash'
  hit(kind, when = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when, dst = kind === 'clunk' || kind === 'click' ? this.hallIn : this.out;
    const burst = (dur, type, f, q, g, toHall = 0.6) => {
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gn = c.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(fl).connect(gn); gn.connect(this.out);
      if (toHall && dst === this.hallIn) { const h = c.createGain(); h.gain.value = toHall; gn.connect(h).connect(this.hall); }
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    };
    const tone = (f0, f1, dur, g) => { const o = c.createOscillator(), gn = c.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(gn).connect(this.out); o.start(t); o.stop(t + dur + 0.05); };
    if (kind === 'clunk') { tone(95, 48, 0.22, 0.5); burst(0.05, 'highpass', 2200, 0.7, 0.25); burst(0.5, 'bandpass', 420, 2, 0.07); }
    else if (kind === 'click') { burst(0.03, 'highpass', 3000, 0.7, 0.2); tone(180, 120, 0.05, 0.12); }
    else if (kind === 'touch') { burst(0.35, 'bandpass', 1500, 1.2, 0.5, 0); tone(70, 40, 0.3, 0.6); }
    else if (kind === 'crash') { tone(120, 28, 0.9, 0.9); burst(1.2, 'lowpass', 900, 0.5, 0.9, 0); burst(0.25, 'highpass', 1800, 0.5, 0.5, 0); }
  }

  // the hangar door running: a motor hum and rattle for `dur` seconds
  door(dur) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain(), s = c.createBufferSource(), fl = c.createBiquadFilter(), g2 = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(42, t); o.frequency.linearRampToValueAtTime(58, t + 0.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.10, t + 0.5); g.gain.setValueAtTime(0.10, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    o.connect(lp).connect(g); g.connect(this.out); g.connect(this.hallIn);
    s.buffer = this.noiseBuf; s.loop = true; fl.type = 'bandpass'; fl.frequency.value = 700; fl.Q.value = 3;
    g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.06, t + 0.6); g2.gain.setValueAtTime(0.06, t + dur - 0.4); g2.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl).connect(g2); g2.connect(this.out); g2.connect(this.hall);
    o.start(t); o.stop(t + dur + 0.1); s.start(t); s.stop(t + dur + 0.1);
  }
}
