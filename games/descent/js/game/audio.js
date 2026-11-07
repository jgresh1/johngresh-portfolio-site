// Procedural sound: everything is synthesised with WebAudio (no files). Underwater low-pass, a soft generative pad + notes that follow your
// level, a heartbeat when hunters chase you, and short sound effects. Safe to call before the browser allows audio (it starts on first gesture).
export class GameAudio {
  constructor(settings) {
    this.ctx = null; this.vol = settings.volume ?? 0.7; this.musicVol = settings.music ?? 0.5; this.muted = false;
    this.mood = 'title'; this.noteT = 2; this.danger = 0; this.hbT = 0; this.ducked = false; this.started = false; this.padOn = false; this.root = 146.8;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return true; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
      const ctx = this.ctx = new C();
      const master = this.master = ctx.createGain(); master.gain.value = this.muted ? 0 : this.vol;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
      master.connect(comp); comp.connect(ctx.destination);
      // water: everything is a little muffled
      const uw = this.uw = ctx.createBiquadFilter(); uw.type = 'lowpass'; uw.frequency.value = 4200; uw.Q.value = 0.4; uw.connect(master);
      const sfx = this.sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(uw);
      const music = this.music = ctx.createGain(); music.gain.value = this.musicVol; music.connect(uw);
      // cheap reverb: decaying noise impulse
      const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      const conv = this.conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.32; conv.connect(wet); wet.connect(uw);
      sfx.connect(conv); music.connect(conv);
      // brown-noise water bed
      const nb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), nd = nb.getChannelData(0); let last = 0;
      for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; nd[i] = last * 3.5; }
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; const bg = this.bedGain = ctx.createGain(); bg.gain.value = 0.14;
      src.connect(lp); lp.connect(bg); bg.connect(music); src.start();
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 140; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
      // pad: three soft sines
      this.pad = [1, 1.5, 2.25].map((m, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = i === 0 ? 'triangle' : 'sine'; o.frequency.value = this.root * m; o.detune.value = (i - 1) * 7; g.gain.value = 0; o.connect(g); g.connect(music); o.start(); return { o, g, m }; });
      this.padOn = true;
      return true;
    } catch (e) { this.ctx = null; return false; }
  }

  start() { this.started = true; this.ensure(); }
  setVolumes(s) { this.vol = s.volume; this.musicVol = s.music; if (this.ctx) { this.master.gain.value = this.muted ? 0 : this.vol; this.music.gain.value = this.musicVol; } }
  toggleMute() { this.muted = !this.muted; if (this.ctx) this.master.gain.value = this.muted ? 0 : this.vol; }
  duck(on) { this.ducked = on; if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol * (on ? 0.35 : 1), this.ctx.currentTime, 0.15); }
  setMood(m) { this.mood = m; }

  // ---- building blocks -----------------------------------------------------------------------------------------------------
  tone(f, dur, type = 'sine', vol = 0.1, when = 0, slideTo = 0, bus = null, attack = 0.005) {
    const c = this.ctx; if (!c || this.muted) return;
    try {
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfx); o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* audio is optional */ }
  }
  noise(dur, ftype = 'lowpass', f0 = 1000, f1 = 300, vol = 0.1, when = 0, q = 0.7) {
    const c = this.ctx; if (!c || this.muted) return;
    try {
    const t = c.currentTime + when, n = Math.max(1, Math.floor(c.sampleRate * dur)), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t);
    } catch (e) { /* audio is optional */ }
  }

  // ---- effects -------------------------------------------------------------------------------------------------------------
  ui() { if (!this.ensure()) return; this.tone(660, 0.07, 'sine', 0.07, 0, 880); }
  eat(size = 0.5, combo = 1) {
    if (!this.ctx) return; const f = 480 + (1 - Math.min(size, 1.4) / 1.4) * 520 + Math.min(combo, 8) * 28;
    this.tone(f, 0.09 + 0.05 * size, 'sine', 0.05 + 0.07 * Math.min(size, 1), 0, f * 1.7);
    if (size > 0.3) { this.noise(0.07, 'highpass', 3000, 1400, 0.03); this.tone(150, 0.12, 'sine', 0.08 * size, 0, 70); }
  }
  pop(v = 0.5) { this.tone(420, 0.07, 'sine', 0.05 * v, 0, 700); }
  npcEat(d) { if (!this.ctx) return; const v = Math.max(0.05, 1 - d / 25); this.tone(130, 0.18, 'sine', 0.08 * v, 0, 60); this.noise(0.1, 'lowpass', 900, 200, 0.06 * v); }
  lunge() { this.noise(0.22, 'bandpass', 400, 1900, 0.09, 0, 1.2); this.tone(220, 0.14, 'sine', 0.05, 0, 440); }
  hurt(k = 1) {
    this.tone(110, 0.28, 'sine', 0.30 * k, 0, 38); this.noise(0.2, 'lowpass', 1600, 180, 0.28 * k); this.tone(310, 0.18, 'sawtooth', 0.05 * k, 0, 140);
  }
  alert() { this.tone(98, 0.6, 'sawtooth', 0.045, 0, 88); this.tone(103.8, 0.6, 'sawtooth', 0.04, 0.02, 92); this.noise(0.5, 'bandpass', 200, 900, 0.05, 0, 2); }
  pulse() { this.tone(1100, 0.7, 'sine', 0.10, 0, 1000); this.tone(1100, 0.7, 'sine', 0.05, 0.28, 1000); this.tone(1100, 0.7, 'sine', 0.025, 0.55, 1000); }
  ability(id) {
    switch (id) {
      case 'ink': this.noise(0.6, 'lowpass', 900, 150, 0.2); this.tone(90, 0.5, 'sine', 0.12, 0, 55); break;
      case 'stun': this.tone(900, 0.4, 'square', 0.05, 0, 90); this.noise(0.3, 'highpass', 2500, 600, 0.07); break;
      case 'puff': this.tone(200, 0.35, 'sine', 0.12, 0, 700); this.noise(0.2, 'bandpass', 800, 2400, 0.05); break;
      case 'rush': this.noise(0.9, 'bandpass', 300, 2600, 0.14, 0, 1); this.tone(140, 0.7, 'sawtooth', 0.06, 0, 420); break;
      case 'decoy': [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.05, i * 0.06)); break;
    }
  }
  evolve() {
    this.tone(180, 1.3, 'sine', 0.16, 0, 1500, null, 0.3); this.tone(270, 1.3, 'triangle', 0.08, 0, 2200, null, 0.3);
    this.noise(1.2, 'bandpass', 400, 6000, 0.08, 0, 1.5);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 1.8, 'triangle', 0.07, 1.15 + i * 0.07)); this.noise(0.9, 'highpass', 6000, 2000, 0.1, 1.15);
  }
  cardsIn() { [783.99, 1174.66].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.06, i * 0.1)); }
  levelup() { [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.55, 'triangle', 0.08, i * 0.08)); }
  death() { this.tone(330, 1.4, 'sawtooth', 0.09, 0, 55); this.tone(311, 1.4, 'sawtooth', 0.07, 0.03, 52); this.noise(1.2, 'lowpass', 900, 80, 0.2); this.hurt(1); }
  victory() { [[392, 0], [523.25, 0.18], [659.25, 0.36], [784, 0.54], [1046.5, 0.8]].forEach(([f, t]) => { this.tone(f, 1.8, 'triangle', 0.09, t); this.tone(f / 2, 1.8, 'sine', 0.06, t); }); }

  // ---- per frame: music + danger ---------------------------------------------------------------------------------------------
  update(dt, game) {
    try { this._update(dt, game); } catch (e) { /* audio is optional */ }
  }
  _update(dt, game) {
    const c = this.ctx; if (!c || this.muted) return;
    const pl = game.player, mode = game.mode;
    // water gets duller with depth
    const depth = Math.max(-pl.y, 0); this.uw.frequency.value += ((4200 - Math.min(depth, 80) * 25) - this.uw.frequency.value) * Math.min(1, dt * 2);
    const level = mode === 'title' ? 1 : pl.level;
    const roots = [146.8, 146.8, 164.8, 164.8, 130.8, 130.8, 110, 110, 98, 98], root = roots[level - 1] * (mode === 'title' ? 1 : 1);
    if (Math.abs(root - this.root) > 0.1) { this.root = root; this.pad.forEach((p) => p.o.frequency.setTargetAtTime(root * p.m, c.currentTime, 2.0)); }
    const th = mode === 'play' ? Math.min(1, game.eco.threats.length * 0.6) : 0;
    this.danger += (th - this.danger) * Math.min(1, dt * 1.6);
    const padLevel = (0.05 + 0.03 * (1 - this.danger)) * (mode === 'paused' ? 0.5 : 1);
    this.pad.forEach((p, i) => p.g.gain.setTargetAtTime(padLevel * (i === 0 ? 1 : 0.7), c.currentTime, 0.8));
    this.bedGain.gain.setTargetAtTime(0.12 + 0.12 * this.danger, c.currentTime, 0.5);
    // notes
    this.noteT -= dt;
    if (this.noteT <= 0 && mode !== 'paused') {
      this.noteT = 3.2 + Math.random() * 5.5 - 2 * this.danger;
      const sc = this.danger > 0.4 ? [0, 1, 5, 7, 10] : [0, 2, 4, 7, 9], deg = sc[(Math.random() * sc.length) | 0], oct = [1, 2, 2, 4][(Math.random() * 4) | 0];
      const f = this.root * Math.pow(2, deg / 12) * oct;
      this.tone(f, 3.2, 'triangle', 0.05, 0, 0, this.music, 0.35);
    }
    // heartbeat while hunted
    if (this.danger > 0.25) {
      this.hbT -= dt;
      if (this.hbT <= 0) { this.hbT = 0.95 - 0.35 * this.danger; this.tone(58, 0.16, 'sine', 0.20 * this.danger, 0, 36); this.tone(52, 0.14, 'sine', 0.14 * this.danger, 0.17, 34); }
    }
  }
}
