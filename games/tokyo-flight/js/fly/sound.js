// sound.js — everything heard is made here from noise and a few tones; there are no recordings.
//   engine   a small turbojet: compressor whine that climbs with the revs, a roar and a low rumble behind it
//   air      wind over the airframe, by speed; quieter and duller from the cockpit
//   fly-by   heard from a camera standing still: level by distance, pitch by how fast the aircraft closes or leaves
//   film     hangar lamps, the door, with a hall's echo
//   music    a slow ambient bed: four held chords on soft strings through a long hall (see `music`)
//   weather  rain on the skin (a hiss that grows with the rain and the speed), hail (hard ticks), thunder (a crack
//            and a long roll, later and duller the further off the stroke was)
// None of this has been heard by its author (it was written without ears); levels were set by reasoning.
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.level = 0.85;
    this.musicOn = true;
    try { this.muted = localStorage.getItem('tokyo.mute') === '1'; this.musicOn = localStorage.getItem('tokyo.music') !== '0'; } catch { /* private window */ }
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
    this.rainHi = chain(noise(), 'highpass', 3200, 0.4, 0); this.rainHi.gn.connect(out);
    this.rainMid = chain(noise(), 'bandpass', 1400, 0.5, 0); this.rainMid.gn.connect(out);
    this.hailAt = 0;
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

  // what is falling on the aircraft: rain, snow, hail 0..1; speed m/s; in the cockpit it drums on the canopy
  weather({ rain = 0, snow = 0, hail = 0, speed = 0, cockpit = false }) {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const t = c.currentTime, v = clamp(0.35 + speed / 110, 0.35, 1.5), k = cockpit ? 1.25 : 0.8;
    this.rainHi.gn.gain.setTargetAtTime((0.11 * rain + 0.015 * snow) * v * k, t, 0.25);
    this.rainMid.gn.gain.setTargetAtTime(0.10 * rain * rain * v * k, t, 0.25);
    this.rainMid.fl.frequency.setTargetAtTime(cockpit ? 900 : 1500, t, 0.3);
    // hailstones: single hard ticks, more of them the harder it hails
    if (hail > 0.05 && t > this.hailAt) {
      this.hailAt = t + (0.02 + Math.random() * 0.12) / hail;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 1800 + Math.random() * 2600; fl.Q.value = 3;
      const g = c.createGain(); g.gain.setValueAtTime((0.10 + 0.12 * Math.random()) * k, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.035);
      s.connect(fl).connect(g).connect(this.out); s.start(t, Math.random() * 1.9); s.stop(t + 0.05);
    }
  }

  // a stroke `dist` metres off, heard now: close, a crack then the roll; far, only a long low rumble
  thunder(dist = 3000) {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const t = c.currentTime, near = clamp(1 - dist / 4000, 0, 1), level = clamp(1.5 / (1 + (dist / 2500) ** 1.4), 0.05, 1.2), len = 3.5 + Math.min(dist / 2500, 5);
    const roll = (f, q, g, dur, at) => {
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(f, t + at); fl.frequency.exponentialRampToValueAtTime(Math.max(f * 0.3, 40), t + at + dur); fl.Q.value = q;
      const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t + at); gn.gain.exponentialRampToValueAtTime(g, t + at + 0.06 + 0.4 * (1 - near));
      // the roll comes in waves as the sound of each part of the stroke arrives
      for (let i = 1; i <= 4; i++) gn.gain.setTargetAtTime(g * (0.25 + 0.5 * Math.random()) * (1 - i / 5), t + at + (dur * i) / 5, dur / 14);
      gn.gain.setTargetAtTime(0.0001, t + at + dur * 0.8, dur / 8);
      s.connect(fl).connect(gn); gn.connect(this.out); const h = c.createGain(); h.gain.value = 0.5; gn.connect(h).connect(this.hall);
      s.start(t + at, Math.random() * 1.9); s.stop(t + at + dur + 1.5);
    };
    roll(140 + 220 * near, 0.6, 0.9 * level, len, 0);
    roll(70, 0.8, 0.8 * level, len * 1.3, 0.15);
    if (near > 0.2) roll(2600, 0.5, 0.5 * level * near, 0.35, 0);        // the crack
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

  /* ---------------------------------------------------------------- ambient music */
  // A slow bed under the film and, much lower, under the flying: no tune and no beat, only four chords held for
  // twelve seconds each and gliding into one another (D minor 9, B flat major 7, F add 9, C sus 2), played by soft
  // detuned strings through a long hall, with a little air on top. `level` 0..1 is how loud it sits; `open` 0..1
  // brightens it (the film opens it up as the hangar doors part).
  setMusic(on) { this.musicOn = on; try { localStorage.setItem('tokyo.music', on ? '1' : '0'); } catch { /* private window */ } }
  music(level = 0.5, open = 0.3) {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if (!this.musicOn) { if (!this.pad) return; level = 0; }
    if (!this.pad) {
      const CH = [[73.42, 110.0, 146.83, 174.61, 220.0, 329.63], [58.27, 116.54, 146.83, 174.61, 220.0, 293.66], [87.31, 130.81, 174.61, 196.0, 261.63, 349.23], [65.41, 98.0, 130.81, 146.83, 196.0, 293.66]];
      const out = c.createGain(); out.gain.value = 0;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.4;
      // a long hall of its own: five seconds of dying noise
      const ir = c.createBuffer(2, c.sampleRate * 5, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3.2); }
      const hall = c.createConvolver(); hall.buffer = ir;
      const wet = c.createGain(); wet.gain.value = 0.9; const dry = c.createGain(); dry.gain.value = 0.35;
      lp.connect(dry).connect(out); lp.connect(hall).connect(wet).connect(out); out.connect(this.master);
      const voices = CH[0].map((f, i) => {
        const g = c.createGain(); g.gain.value = [0.16, 0.13, 0.11, 0.09, 0.075, 0.05][i]; g.connect(lp);
        const os = [-7, 0, 6].map((cents) => { const o = c.createOscillator(); o.type = i < 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = cents + (Math.random() * 4 - 2); o.connect(g); o.start(); return o; });
        // each voice breathes at its own slow rate
        const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 0.05 + 0.03 * i; lg.gain.value = g.gain.value * 0.35; l.connect(lg).connect(g.gain); l.start();
        return os;
      });
      const air = c.createBufferSource(); air.buffer = this.noiseBuf; air.loop = true;
      const af = c.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 5200; af.Q.value = 0.8; const ag = c.createGain(); ag.gain.value = 0.012;
      air.connect(af).connect(ag).connect(hall); air.start();
      this.pad = { out, lp, voices, CH, at: -1, t0: c.currentTime };
    }
    const P = this.pad, t = c.currentTime, k = Math.floor((t - P.t0) / 12) % P.CH.length;
    if (k !== P.at) { P.at = k; P.voices.forEach((os, i) => os.forEach((o) => o.frequency.setTargetAtTime(P.CH[k][i], t, 1.6))); }      // glide to the next chord
    P.out.gain.setTargetAtTime(level * 0.34, t, 0.8);
    P.lp.frequency.setTargetAtTime(380 + 1900 * open * open, t, 1.2);
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
