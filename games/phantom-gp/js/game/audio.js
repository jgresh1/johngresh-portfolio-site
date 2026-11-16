// audio.js — everything you hear: two synthesised engines, wind, tyres, impacts (all generated in the browser), and
// the score (music.js) with the clock the opening film is cut to.
import { loadScore, SCORE, BEAT } from './music.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Slow motion in the film: the picture slows so the names on the tyre can be read; the music does not. Each: the
// beat it starts on, then seconds to ease in, hold and ease out. Both fit inside their four-beat shots (intro.js).
export const SLOW = [{ beat: 44.2, in: 0.25, hold: 1.15, out: 0.28 }, { beat: 48.2, in: 0.25, hold: 1.15, out: 0.28 }];
// The music plays at one speed from start to finish, so film time and music time are the same thing. (They were not
// while the music slowed with the picture; these two stay so the film's code reads the same either way.)
export const tauAt = (w) => w;
export const wallAt = (tau) => tau;

class Engine {
  constructor(ctx, out, noise) {
    this.ctx = ctx;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 1200; this.lp.Q.value = 0.9;
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(513); for (let i = 0; i < 513; i++) curve[i] = Math.tanh((i / 256 - 1) * 2.4); shaper.curve = curve;
    this.pre = ctx.createGain(); this.pre.gain.value = 0.7;
    this.osc = [['sawtooth', 1, 0.5], ['square', 0.5, 0.42], ['sawtooth', 1.5, 0.22], ['sine', 0.25, 0.5]].map(([type, mul, g]) => { const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = type; o.frequency.value = 120 * mul; gg.gain.value = g; o.connect(gg).connect(this.pre); o.start(); return { o, mul }; });
    this.ns = ctx.createBufferSource(); this.ns.buffer = noise; this.ns.loop = true;
    this.nbp = ctx.createBiquadFilter(); this.nbp.type = 'bandpass'; this.nbp.frequency.value = 900; this.nbp.Q.value = 1.4;
    this.ng = ctx.createGain(); this.ng.gain.value = 0.0;
    this.ns.connect(this.nbp).connect(this.ng).connect(this.lp); this.ns.start();
    this.pre.connect(shaper).connect(this.lp).connect(this.gain).connect(this.pan).connect(out);
  }
  // rpm, load 0..1 (throttle), vol 0..1, pan -1..1, pitch factor (doppler)
  set(rpm, load, vol, pan = 0, pitch = 1) {
    const t = this.ctx.currentTime, f = rpm / 60 * 3 * pitch;
    for (const { o, mul } of this.osc) o.frequency.setTargetAtTime(f * mul, t, 0.018);
    this.lp.frequency.setTargetAtTime(clamp(f * (2.2 + 4.2 * load), 300, 9000), t, 0.03);
    this.nbp.frequency.setTargetAtTime(clamp(f * 2.6, 300, 6000), t, 0.03);
    this.ng.gain.setTargetAtTime(0.25 + 0.5 * load, t, 0.04);
    this.gain.gain.setTargetAtTime(vol * (0.42 + 0.58 * load), t, 0.03);
    if (this.pan.pan) this.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.05);
  }
}

// Music levels. The film plays at full level. On the circuit the same piece carries on, but well back, under the
// engines; behind the menus a little higher.
const FILM_LEVEL = 0.95, RACE_LEVEL = 0.34, MENU_LEVEL = 0.46;

export class Sound {
  constructor() { this.ctx = null; this.ready = false; this.opts = { music: true, sound: true }; this.scoreP = null; this.music = null; }
  // fetch and decode the score while the game loads (needs no user gesture); the game runs without music if it fails
  prepare() { return this.scoreP || (this.scoreP = loadScore().catch((e) => { console.warn('music not loaded', e); return null; })); }

  /* Call this inside a tap, click or key press, before anything is awaited. A phone only lets sound start from
     inside the gesture itself; once the game has waited for a download the tap no longer counts, the audio clock
     never starts, and the film (which ran on that clock alone) sat on its first black frame. */
  unlock() {
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC({ latencyHint: 'interactive' }); }
      const ctx = this.ctx;
      if (this.held || (this.unlocked && ctx.state === 'running')) return;      // (held: the game has stopped the sound itself, see pause)
      const p = ctx.resume(); if (p && p.catch) p.catch(() => {});
      const s = ctx.createBufferSource(); s.buffer = this.silent || (this.silent = ctx.createBuffer(1, 1, 22050)); s.connect(ctx.destination); s.start(0);
      if (ctx.state === 'running') this.unlocked = true;
    } catch (e) { /* no audio on this device: the game runs silent */ }
  }

  async init() {
    if (this.ready) { this.unlock(); return; }
    this.unlock();
    const score = await this.prepare();
    try {
      const ctx = this.ctx; if (!ctx) throw new Error('no audio context');
      // (never wait on resume: on a phone that has not unlocked sound it does not settle)
      this.unlock();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -9; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.16;
      this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp).connect(ctx.destination);
      this.musicG = ctx.createGain(); this.musicG.gain.value = 0.9; this.musicG.connect(this.master);
      this.fxG = ctx.createGain(); this.fxG.gain.value = 1; this.fxG.connect(this.master);
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.noise = nb;
      this.eng = [new Engine(ctx, this.fxG, nb), new Engine(ctx, this.fxG, nb)];
      const band = (type, f, q) => { const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; src.connect(fl).connect(g).connect(this.fxG); src.start(); return { fl, g }; };
      this.wind = band('lowpass', 500, 0.5); this.skid = band('bandpass', 1250, 5); this.rumble = band('lowpass', 110, 0.8);
      this.filmBuf = score && score.film; this.loopBuf = score && score.race;
      this.ready = true; this.setOptions(this.opts);
    } catch (e) { console.warn('audio unavailable', e); this.ready = false; }
  }
  setOptions(o) { this.opts = { music: o.music, sound: o.sound }; if (!this.ready) return; const t = this.ctx.currentTime; this.musicG.gain.setTargetAtTime(o.music ? this.musicLevel || 0.9 : 0, t, 0.05); this.fxG.gain.setTargetAtTime(o.sound ? 1 : 0, t, 0.05); }
  setMusicLevel(v, tc = 0.4) { this.musicLevel = v; if (this.ready && this.opts.music) this.musicG.gain.setTargetAtTime(v, this.ctx.currentTime, tc); }
  pause() { this.held = true; if (this.ctx) { const p = this.ctx.suspend(); if (p && p.catch) p.catch(() => {}); } }
  resume() { this.held = false; this.resumeT = performance.now() / 1000; if (this.ctx) { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); } }

  /* ---- soundtrack ---- */
  /* Start the film score. Returns the film's clock: wall() = seconds into the film, beats() = the same in beats.
     The film runs on the audio clock, so every cut stays on the beat. But that clock only moves while the device is
     actually playing sound, and a phone may refuse to (or take a while). So it is watched: if it has not moved for
     half a second the film carries on by the ordinary clock instead of standing still, and if sound does start
     later the music comes in at the point the film has reached. */
  playFilm() {
    this.stopMusic();
    const now = () => performance.now() / 1000, self = this, wEnd = 64 * BEAT;
    // the ordinary clock: adds up frame times (a long gap, such as the tab being hidden, counts as a quarter second)
    const free = (w0) => { const f = { w: w0, p: now(), a: self.ctx ? self.ctx.currentTime : 0 }; f.tick = () => { const p = now(); if (!self.held) f.w += Math.min(p - f.p, 0.25); f.p = p; return f.w; }; return f; };
    if (!this.ready) { const f = free(0); return { wall: f.tick, beats: () => Math.max(0, f.tick()) / BEAT, rate: () => 1 }; }
    const ctx = this.ctx, lat = ctx.outputLatency || ctx.baseLatency || 0;
    // put the music on so that film time `at` falls on audio time `when`
    const schedule = (when, at) => {
      if (!this.filmBuf || !this.loopBuf) return;
      const src = ctx.createBufferSource(); src.buffer = this.filmBuf; src.connect(this.musicG);
      src.start(when, Math.max(0, Math.min(at, this.filmBuf.duration - 0.02)));
      // The race music takes over on the beat the film ends, 48 beats into its loop: exactly where the film's music
      // has got to. The film's last 40 ms fade out as these fade in.
      const tEnd = when + (wEnd - at), lp = ctx.createBufferSource(), lg = ctx.createGain(); lp.buffer = this.loopBuf; lp.loop = true;
      lg.gain.setValueAtTime(0, tEnd); lg.gain.linearRampToValueAtTime(1, tEnd + 0.04);
      lp.connect(lg).connect(this.musicG); lp.start(tEnd, SCORE.race.entry);
      this.music = [src, lp];
    };
    let t0 = ctx.currentTime + 0.12;                       // the audio time of the film's first frame
    schedule(t0, 0); this.setMusicLevel(FILM_LEVEL, 0.02);
    let fr = null, lastA = ctx.currentTime, lastP = now(), lastW = -1;
    const clock = {
      wall() {
        const p = now(), a = ctx.currentTime;
        if (fr) {
          const w = fr.tick();
          if (a === fr.a || ctx.state !== 'running' || self.held || w > wEnd - 1.5) return w;
          // sound has started after all: bring the music in where the film is, and go back to the audio clock
          schedule(a + 0.08, w + 0.08); self.setMusicLevel(FILM_LEVEL, 0.02);
          t0 = a - w; fr = null; lastA = a; lastP = p; lastW = w; return w;            // (the clock holds for the output delay, then follows the sound)
        }
        if (a !== lastA || self.held || p - (self.resumeT || 0) < 1.5) { lastA = a; lastP = p; }         // moving, or stopped on purpose, or just asked to start again
        else if (p - lastP > 0.5) { fr = free(Math.max(0, a - t0 - lat)); self.stopMusic(); return fr.w; }
        return lastW = Math.max(lastW, a - t0 - lat);
      },
      beats() { return Math.max(0, clock.wall()) / BEAT; },
      rate() { return 1; },
    };
    return clock;
  }
  stopMusic() { if (this.music) for (const s of this.music) { try { s.stop(); } catch (e) { /* not started */ } s.disconnect(); } this.music = null; }
  stopFilm() { this.stopMusic(); }
  // make sure the race loop is playing (it already is when the race follows the film)
  startLoop(menu = false) {
    if (!this.ready) return;
    if ((!this.music || this.music.length !== 1) && this.loopBuf) { this.stopMusic(); const lp = this.ctx.createBufferSource(); lp.buffer = this.loopBuf; lp.loop = true; lp.connect(this.musicG); lp.start(); this.music = [lp]; }
    this.setMusicLevel(menu ? MENU_LEVEL : RACE_LEVEL, 1.2);
  }
  /* The race has begun straight from the film. The hit on the cut rings out at the film's level (the film's source
     is left to finish), then the music falls away over about four seconds and carries on softly under the race. */
  raceLevel() {
    if (!this.music || this.music.length !== 2) { this.startLoop(); return; }
    this.music = [this.music[1]]; this.musicLevel = RACE_LEVEL;
    if (this.ready && this.opts.music) { const t = this.ctx.currentTime, g = this.musicG.gain; g.cancelScheduledValues(t); g.setValueAtTime(FILM_LEVEL, t); g.setTargetAtTime(RACE_LEVEL, t + 0.45, 1.3); }
  }

  /* ---- one-shots ---- */
  tone(f, dur, g = 0.2, type = 'sine', f1 = f) {
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), gg = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(g, t + 0.008); gg.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(gg).connect(this.fxG); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(dur, g, f, q = 0.8, type = 'lowpass') {
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), gg = ctx.createGain();
    s.buffer = this.noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl).connect(gg).connect(this.fxG); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  sfx(name, k = 1) {
    if (!this.ready || !this.opts.sound) return;
    if (name === 'beep') this.tone(520, 0.16, 0.16, 'square');
    else if (name === 'go') this.tone(1040, 0.5, 0.2, 'square');
    else if (name === 'hit' || name === 'wall') { this.burst(0.22, 0.5 * k, 900, 0.7); this.tone(90, 0.25, 0.5 * k, 'sine', 40); }
    else if (name === 'win') [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 0.14, 'triangle'), i * 110));
    else if (name === 'lose') [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 0.12, 'triangle'), i * 160));
    else if (name === 'whoosh') this.burst(0.7, 0.35 * k, 1800, 0.6, 'bandpass');
    else if (name === 'pass') { this.burst(0.5, 0.3, 2400, 0.7, 'bandpass'); [659, 988].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 0.13, 'square'), i * 90)); }
    else if (name === 'passed') { this.burst(0.5, 0.3, 900, 0.7, 'bandpass'); this.tone(330, 0.3, 0.13, 'square', 220); }
    else if (name === 'tow') this.tone(880, 0.12, 0.07, 'triangle', 1320);
    else if (name === 'shift') { this.burst(0.07, 0.3 * k, 2600, 1.2, 'bandpass'); this.tone(170, 0.09, 0.3 * k, 'square', 70); }
  }

  /* ---- continuous sounds, once per frame ---- */
  update(dt, P, R, camera, G) {
    if (!this.ready) return;
    const racing = G.state === 'race' || G.state === 'menu' || G.state === 'result', t = this.ctx.currentTime;
    if (!racing || !this.opts.sound) { if (G.state !== 'film') { this.eng[0].set(4000, 0, 0); this.eng[1].set(4000, 0, 0); } this.wind.g.gain.setTargetAtTime(0, t, 0.1); this.skid.g.gain.setTargetAtTime(0, t, 0.1); this.rumble.g.gain.setTargetAtTime(0, t, 0.1); return; }
    const quiet = G.state === 'race' ? 1 : 0.35, v = Math.abs(P.u);
    this.eng[0].set(P.rpm, P.shiftT > 0 ? 0.1 : P.throttle, 0.2 * quiet, 0);
    // rival: by distance, side and closing speed
    const dx = R.x - camera.position.x, dz = R.z - camera.position.z, dist = Math.hypot(dx, dz);
    const e = camera.matrixWorld.elements, side = (dx * e[0] + dz * e[2]) / Math.max(dist, 1);
    const rel = ((R.u * Math.cos(R.psi) - P.u * Math.cos(P.psi)) * dx + (R.u * Math.sin(R.psi) - P.u * Math.sin(P.psi)) * dz) / Math.max(dist, 1);
    this.eng[1].set(R.rpm, R.throttle, 0.26 * quiet / (1 + dist / 14), side * 0.8, clamp(1 - rel / 343, 0.8, 1.25));
    this.wind.fl.frequency.setTargetAtTime(300 + 900 * clamp(v / 90, 0, 1), t, 0.1); this.wind.g.gain.setTargetAtTime(0.16 * quiet * (v / 90) ** 2, t, 0.1);
    this.skid.g.gain.setTargetAtTime(0.11 * quiet * P.slip * clamp(v / 25, 0, 1), t, 0.05); this.skid.fl.frequency.setTargetAtTime(1000 + 500 * P.slip, t, 0.05);
    const rough = P.surface !== 1 ? 1 : P.kerb ? 0.7 : 0;
    this.rumble.g.gain.setTargetAtTime(0.5 * quiet * rough * clamp(v / 40, 0, 1), t, 0.04); this.rumble.fl.frequency.setTargetAtTime(P.kerb ? 160 : 90, t, 0.05);
  }
  // the film drives the engine by hand: rpm and load, or vol 0 to silence it
  filmEngine(rpm, load, vol) { if (this.ready && this.opts.sound) this.eng[0].set(rpm, load, vol, 0); else if (this.ready) this.eng[0].set(4000, 0, 0); }
}
