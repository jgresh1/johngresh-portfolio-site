// audio.js — everything you hear: two synthesised engines, wind, tyres, impacts, and the soundtrack with a clock the
// opening film is cut to. All of it is generated in the browser.
import { renderFilm, renderLoop, BEAT, SR } from './music.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Slow-motion dips in the film: the music is slowed with the picture. Each: the beat it starts on, then seconds of
// real time to ease in, hold and ease out, and the playback rate while held.
export const SLOW = [{ beat: 44.8, in: 0.3, hold: 1.5, out: 0.35, rate: 0.5 }, { beat: 48.8, in: 0.3, hold: 1.5, out: 0.35, rate: 0.5 }];
// break-points (real seconds from the start of the film, rate) and the music time reached at each
function slowCurve() {
  const pts = [[0, 1, 0]]; let w = 0, tau = 0;
  for (const s of SLOW) {
    const ws = w + (s.beat * BEAT - tau); tau = s.beat * BEAT; w = ws; pts.push([w, 1, tau]);
    w += s.in; tau += s.in * (1 + s.rate) / 2; pts.push([w, s.rate, tau]);
    w += s.hold; tau += s.hold * s.rate; pts.push([w, s.rate, tau]);
    w += s.out; tau += s.out * (1 + s.rate) / 2; pts.push([w, 1, tau]);
  }
  return pts;
}
const CURVE = slowCurve();
export function tauAt(w) {                      // music time (s) at real time w (s)
  let i = 0; while (i + 1 < CURVE.length && CURVE[i + 1][0] <= w) i++;
  const [w0, r0, t0] = CURVE[i], nx = CURVE[i + 1];
  if (!nx) return t0 + (w - w0);
  const u = (w - w0) / Math.max(1e-6, nx[0] - w0), r = r0 + (nx[1] - r0) * u;
  return t0 + (w - w0) * (r0 + r) / 2;
}
export function wallAt(tau) { let lo = 0, hi = tau + 10; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (tauAt(m) < tau) lo = m; else hi = m; } return (lo + hi) / 2; }
export function rateAt(w) { let i = 0; while (i + 1 < CURVE.length && CURVE[i + 1][0] <= w) i++; const nx = CURVE[i + 1]; if (!nx) return 1; const u = (w - CURVE[i][0]) / Math.max(1e-6, nx[0] - CURVE[i][0]); return CURVE[i][1] + (nx[1] - CURVE[i][1]) * u; }

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

export class Sound {
  constructor() { this.ctx = null; this.ready = false; this.opts = { music: true, sound: true }; this.film = null; this.loop = null; this.music = null; }
  // render the soundtrack while the game loads (plain arrays; needs no audio context and no user gesture)
  prepare() { if (!this.film) { this.film = renderFilm(); this.loop = renderLoop(); } }

  async init() {
    if (this.ready) { try { await this.ctx.resume(); } catch (e) { /* fine */ } return; }
    this.prepare();
    try {
      const AC = window.AudioContext || window.webkitAudioContext; const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
      try { await ctx.resume(); } catch (e) { /* stays suspended until a later gesture */ }
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -9; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.16;
      this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp).connect(ctx.destination);
      this.musicG = ctx.createGain(); this.musicG.gain.value = 0.9; this.musicG.connect(this.master);
      this.fxG = ctx.createGain(); this.fxG.gain.value = 1; this.fxG.connect(this.master);
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.noise = nb;
      this.eng = [new Engine(ctx, this.fxG, nb), new Engine(ctx, this.fxG, nb)];
      const band = (type, f, q) => { const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; src.connect(fl).connect(g).connect(this.fxG); src.start(); return { fl, g }; };
      this.wind = band('lowpass', 500, 0.5); this.skid = band('bandpass', 1250, 5); this.rumble = band('lowpass', 110, 0.8);
      const mk = (m) => { const b = ctx.createBuffer(2, m.len, SR); b.copyToChannel(m.L, 0); b.copyToChannel(m.R, 1); return b; };
      this.filmBuf = mk(this.film);
      // fold the loop's ring-out back onto its start so it repeats without a gap
      const lp = this.loop, dn = Math.floor(lp.dur * SR); for (let i = dn; i < lp.len; i++) { lp.L[i - dn] += lp.L[i]; lp.R[i - dn] += lp.R[i]; }
      this.loopBuf = ctx.createBuffer(2, dn, SR); this.loopBuf.copyToChannel(lp.L.subarray(0, dn), 0); this.loopBuf.copyToChannel(lp.R.subarray(0, dn), 1);
      this.film = this.loop = null;
      this.ready = true; this.setOptions(this.opts);
    } catch (e) { console.warn('audio unavailable', e); this.ready = false; }
  }
  setOptions(o) { this.opts = { music: o.music, sound: o.sound }; if (!this.ready) return; const t = this.ctx.currentTime; this.musicG.gain.setTargetAtTime(o.music ? this.musicLevel || 0.9 : 0, t, 0.05); this.fxG.gain.setTargetAtTime(o.sound ? 1 : 0, t, 0.05); }
  setMusicLevel(v, tc = 0.4) { this.musicLevel = v; if (this.ready && this.opts.music) this.musicG.gain.setTargetAtTime(v, this.ctx.currentTime, tc); }
  pause() { if (this.ready) this.ctx.suspend(); }
  resume() { if (this.ready) this.ctx.resume(); }

  /* ---- soundtrack ---- */
  // start the film score; returns a clock: beats() = position in beats, rate() = current speed (1 or less in slow motion)
  playFilm() {
    this.stopMusic();
    const t0p = performance.now() / 1000;
    if (!this.ready) return { beats: () => tauAt(performance.now() / 1000 - t0p) / BEAT, rate: () => rateAt(performance.now() / 1000 - t0p), wall: () => performance.now() / 1000 - t0p };
    const ctx = this.ctx, t0 = ctx.currentTime + 0.12, src = ctx.createBufferSource();
    src.buffer = this.filmBuf; src.connect(this.musicG);
    src.playbackRate.setValueAtTime(1, t0);
    for (const [w, r] of CURVE.slice(1)) src.playbackRate.linearRampToValueAtTime(r, t0 + w);
    src.start(t0);
    // the race loop begins on the beat the film ends
    const wEnd = wallAt(64 * BEAT), lp = ctx.createBufferSource(); lp.buffer = this.loopBuf; lp.loop = true; lp.connect(this.musicG); lp.start(t0 + wEnd);
    this.music = [src, lp]; this.setMusicLevel(0.95, 0.02);
    const lat = (ctx.outputLatency || ctx.baseLatency || 0);
    const wall = () => ctx.currentTime - t0 - lat;
    return { beats: () => tauAt(Math.max(0, wall())) / BEAT, rate: () => rateAt(Math.max(0, wall())), wall };
  }
  stopMusic() { if (this.music) for (const s of this.music) { try { s.stop(); } catch (e) { /* not started */ } s.disconnect(); } this.music = null; }
  stopFilm() { this.stopMusic(); }
  // make sure the race loop is playing (it already is when the race follows the film)
  startLoop() {
    if (!this.ready) return;
    if (!this.music || this.music.length !== 1) { this.stopMusic(); const lp = this.ctx.createBufferSource(); lp.buffer = this.loopBuf; lp.loop = true; lp.connect(this.musicG); lp.start(); this.music = [lp]; }
    this.setMusicLevel(0.46, 1.2);
  }
  raceLevel() { if (this.music && this.music.length === 2) { try { this.music[0].stop(); } catch (e) { /* done */ } this.music = [this.music[1]]; } this.setMusicLevel(0.46, 1.5); }

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
