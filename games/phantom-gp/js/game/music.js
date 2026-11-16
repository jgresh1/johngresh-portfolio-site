// music.js — the soundtrack, synthesised from nothing: an original driving electronic score in D minor (four-on-the-
// floor kick, a rolling bass, wide saw-chord stabs, a plucked arpeggio, a lead line, and a low brass-like "braam" on
// the big hits), rendered into two buffers. `film` is the 16-bar score the opening film is cut to (the beat map is
// in intro.js); `loop` is the 16-bar groove under the race. No samples and no existing tune are used.
//
// The grid is the film's: 150 beats a minute, 64 beats. Change the notes freely; move a hit and a cut misses it.
export const BPM = 150, BEAT = 60 / BPM, SR = 44100;
const BAR = 4 * BEAT, S16 = BEAT / 4;
const N = (name) => { const m = /^([A-G])(b?)(\d)$/.exec(name), semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] - (m[2] ? 1 : 0); return 440 * Math.pow(2, (semi - 9) / 12 + (+m[3] - 4)); };
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const softClip = (x) => (x >= 1 ? 1 : x <= -1 ? -1 : 1.5 * x - 0.5 * x * x * x);
// bus levels into the master: drums, bass, melodic, reverb. Set by measurement (see README): bass left to itself takes
// most of the energy and everything else goes flat.
const MIX = { d: 1.5, b: 0.52, m: 2.05, r: 1.55 };

/* ------------------------------------------------------------------ oscillators and filters */
// band-limited sawtooth added into o (no aliasing hash on the high notes)
function sawAdd(o, f, amp, ph) {
  const dt = f / SR; let p = ph % 1;
  for (let i = 0; i < o.length; i++) {
    let v = 2 * p - 1;
    if (p < dt) { const t = p / dt; v -= t + t - t * t - 1; } else if (p > 1 - dt) { const t = (p - 1) / dt; v -= t * t + t + t + 1; }
    o[i] += v * amp; p += dt; if (p >= 1) p -= 1;
  }
}
// resonant low-pass, in place; cut(t) in Hz
function lowpass(x, cut, q = 0.9) {
  let lp = 0, bp = 0;
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(7000, Math.max(30, cut(i / SR))) / SR);
    const hp = x[i] - lp - q * bp; bp += f * hp; lp += f * bp; x[i] = lp;
  }
  return x;
}
// several detuned saws per note: the wide "supersaw". o: { det, cut(t), q, atk, rel, amp(t) }
function saws(freqs, dur, o) {
  const n = Math.floor((dur + o.rel) * SR), x = new Float32Array(n), per = o.voices || 5;
  for (const f of freqs) for (let k = 0; k < per; k++) sawAdd(x, f * (1 + o.det * ((k - (per - 1) / 2) / per) * (0.8 + 0.4 * rnd())), 0.9 / Math.sqrt(freqs.length * per), rnd());
  lowpass(x, o.cut, o.q ?? 0.9);
  for (let i = 0; i < n; i++) { const t = i / SR, e = Math.min(1, t / o.atk) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / o.rel)); x[i] *= e * (o.amp ? o.amp(t) : 1); }
  return x;
}

/* ------------------------------------------------------------------ voices (mono Float32Array one-shots) */
const stab = (freqs, dur) => saws(freqs, dur, { det: 0.022, cut: (t) => 1500 + 4300 * Math.exp(-t / 0.16), q: 0.8, atk: 0.003, rel: 0.14, amp: (t) => 0.75 + 0.25 * Math.exp(-t / 0.1) });
const padv = (freqs, dur, bright = 1) => saws(freqs, dur, { det: 0.016, cut: (t) => (350 + 1100 * Math.sin(Math.PI * Math.min(1, t / dur)) ** 2) * bright, q: 0.6, atk: Math.min(1.2, dur * 0.4), rel: 0.8 });
const pluck = (f) => saws([f], 0.2, { det: 0.008, voices: 3, cut: (t) => 800 + 5200 * Math.exp(-t / 0.045), q: 0.75, atk: 0.002, rel: 0.12, amp: (t) => Math.exp(-t / 0.11) });
const leadv = (f, dur) => saws([f, f * 0.5], dur, { det: 0.011, voices: 3, cut: (t) => 2300 + 3200 * Math.exp(-t / 0.25), q: 0.7, atk: 0.006, rel: 0.09, amp: (t) => 0.8 + 0.2 * Math.exp(-t / 0.2) });
function bassv(f, dur) {
  const x = saws([f], dur, { det: 0.009, voices: 2, cut: (t) => 170 + 900 * Math.exp(-t / 0.06), q: 0.65, atk: 0.003, rel: 0.035 });
  let ph = rnd();
  for (let i = 0; i < x.length; i++) { const t = i / SR; ph += f / SR; const e = Math.min(1, t / 0.003) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.035)); x[i] = Math.tanh((x[i] * 1.7 + Math.sin(2 * Math.PI * ph) * 0.5 * e) * 1.8) * 0.8; }
  return x;
}
// the low brass-like swell of a film trailer: stacked saws opening up through a filter, driven
function braam(f, dur = 2.6) {
  const x = saws([f, f * 1.007, f * 2, f * 2.012, f * 3], dur, { det: 0.02, voices: 3, cut: (t) => 110 + 1900 * (1 - Math.exp(-t / 0.22)) * Math.exp(-t / 1.0), q: 0.55, atk: 0.07, rel: 0.6, amp: (t) => Math.exp(-t / 1.25) });
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 3.2) * 0.85;
  return x;
}
function kick() {
  const n = Math.floor(0.36 * SR), o = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 57 + 190 * Math.exp(-t / 0.02) + 900 * Math.exp(-t / 0.0022);
    ph += f / SR;
    const body = Math.sin(2 * Math.PI * ph) * Math.min(1, t / 0.0015) * Math.exp(-t / 0.08);
    const click = (rnd() * 2 - 1) * Math.exp(-t / 0.0022) * 0.8 + Math.sin(2 * Math.PI * 3100 * t) * Math.exp(-t / 0.0035) * 0.45;
    o[i] = Math.tanh((body + click) * 3.2) * 0.97;
  }
  return o;
}
function tom(f) {
  const n = Math.floor(0.34 * SR), o = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += f * (1 + 0.9 * Math.exp(-t / 0.03)) / SR; o[i] = Math.tanh((Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.11) + (rnd() * 2 - 1) * Math.exp(-t / 0.004) * 0.4) * 2.4) * 0.9; }
  return o;
}
function noiseBP(dur, fc0, q, env) {
  const n = Math.floor(dur * SR), o = new Float32Array(n), fc = 2 * Math.sin(Math.PI * Math.min(0.24, fc0 / SR));
  let lp = 0, bp = 0;
  for (let i = 0; i < n; i++) { const x = rnd() * 2 - 1; lp += fc * bp; const hp = x - lp - q * bp; bp += fc * hp; o[i] = (bp + 0.25 * hp) * env(i / SR); }
  return o;
}
function noiseHP(dur, hp, env) {
  const n = Math.floor(dur * SR), o = new Float32Array(n), k = Math.exp(-2 * Math.PI * hp / SR); let a = 0;
  for (let i = 0; i < n; i++) { const x = rnd() * 2 - 1; a = k * a + (1 - k) * x; o[i] = (x - a) * env(i / SR); }
  return o;
}
const clap = () => {
  const s = noiseBP(0.34, 1250, 0.8, (t) => { let e = 0; for (const d of [0, 0.008, 0.017, 0.027]) if (t >= d) e = Math.max(e, Math.exp(-(t - d) / 0.0042)); return e * 1.1 + (t > 0.027 ? Math.exp(-(t - 0.027) / 0.085) * 0.85 : 0); });
  const air = noiseBP(0.2, 3600, 0.9, (t) => Math.exp(-t / 0.03) * 0.8);
  for (let i = 0; i < s.length; i++) s[i] = Math.tanh((s[i] + (i < air.length ? air[i] : 0)) * 2.4) * 0.9;
  return s;
};
function snare() {
  const a = noiseHP(0.26, 1800, (t) => Math.exp(-t / 0.075) * 0.9), n = a.length;
  for (let i = 0; i < n; i++) { const t = i / SR, body = (Math.sin(2 * Math.PI * 190 * t) * 0.8 + Math.sin(2 * Math.PI * 330 * t) * 0.35) * Math.exp(-t / 0.045); a[i] = Math.tanh((a[i] + body) * 1.8) * 0.85; }
  return a;
}
const hat = (open) => noiseHP(open ? 0.24 : 0.05, 7500, (t) => Math.exp(-t / (open ? 0.07 : 0.01)) * 2.2 * Math.min(1, t / 0.0004));
const crash = () => noiseHP(1.9, 4200, (t) => Math.min(1, t / 0.002) * (0.55 * Math.exp(-t / 0.08) + 0.45 * Math.exp(-t / 0.75)) * 0.9);
const shutter = () => noiseHP(0.07, 3000, (t) => (Math.exp(-t / 0.004) + (t > 0.022 ? 0.6 * Math.exp(-(t - 0.022) / 0.005) : 0)) * 1.6);     // a camera shutter: two clicks
const swell = (dur) => noiseHP(dur, 3000, (t) => Math.pow(t / dur, 3) * 0.8);
function riser(dur) {
  const n = Math.floor(dur * SR), o = new Float32Array(n); let lp = 0, bp = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, fc = 2 * Math.sin(Math.PI * Math.min(0.3, 300 * Math.pow(32, u) / SR));
    lp += fc * bp; const hp = (rnd() * 2 - 1) - lp - 0.3 * bp; bp += fc * hp;
    ph += (150 * Math.pow(7, u)) / SR;
    o[i] = (bp * 0.6 + Math.sin(2 * Math.PI * ph) * 0.2) * u * u;
  }
  return o;
}
function impact() {
  const n = Math.floor(1.8 * SR), o = new Float32Array(n); let ph = 0, lp = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += (28 + 90 * Math.exp(-t / 0.1)) / SR; lp += 0.02 * ((rnd() * 2 - 1) - lp); o[i] = Math.tanh((Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.55) + lp * 5 * Math.exp(-t / 0.3)) * 2.6) * 0.95; }
  return o;
}

/* ------------------------------------------------------------------ the piece: D minor, one chord a bar: Dm  Bb  F  C */
const CH = {
  Dm: { stab: ['D4', 'F4', 'A4', 'D5'], pad: ['D3', 'A3', 'F4'], bass: 'D2', arp: ['D4', 'F4', 'A4', 'D5', 'F5', 'A5'] },
  Bb: { stab: ['D4', 'F4', 'Bb4', 'D5'], pad: ['Bb2', 'F3', 'D4'], bass: 'Bb1', arp: ['Bb3', 'D4', 'F4', 'Bb4', 'D5', 'F5'] },
  F: { stab: ['C4', 'F4', 'A4', 'C5'], pad: ['F3', 'C4', 'A4'], bass: 'F2', arp: ['F4', 'A4', 'C5', 'F5', 'A5', 'C6'] },
  C: { stab: ['C4', 'E4', 'G4', 'C5'], pad: ['C3', 'G3', 'E4'], bass: 'C2', arp: ['C4', 'E4', 'G4', 'C5', 'E5', 'G5'] },
};
const PROG = ['Dm', 'Bb', 'F', 'C'];
const ARP = [0, 2, 3, 2, 4, 3, 2, 3, 0, 2, 3, 2, 5, 4, 3, 2];
const STAB = [0, 3, 6, 10, 12];                       // 16th steps the chords hit on
const LEAD = {     // [step, note, length in 16ths], one bar per chord
  A: [
    [[0, 'A4', 2], [2, 'D5', 2], [4, 'F5', 3], [7, 'E5', 1], [8, 'D5', 4], [12, 'A4', 2], [14, 'D5', 2]],
    [[0, 'F5', 3], [3, 'D5', 3], [6, 'Bb4', 2], [8, 'D5', 4], [12, 'F5', 2], [14, 'G5', 2]],
    [[0, 'A5', 3], [3, 'F5', 3], [6, 'C5', 2], [8, 'F5', 4], [12, 'A5', 2], [14, 'G5', 2]],
    [[0, 'G5', 3], [3, 'E5', 3], [6, 'C5', 2], [8, 'E5', 3], [11, 'D5', 1], [12, 'C5', 2], [14, 'E5', 2]],
  ],
  B: [
    [[0, 'D6', 4], [4, 'A5', 2], [6, 'F5', 2], [8, 'A5', 4], [12, 'D6', 2], [14, 'F6', 2]],
    [[0, 'F6', 4], [4, 'D6', 2], [6, 'Bb5', 2], [8, 'D6', 6], [14, 'C6', 2]],
    [[0, 'C6', 4], [4, 'A5', 2], [6, 'F5', 2], [8, 'A5', 4], [12, 'C6', 2], [14, 'A5', 2]],
    [[0, 'G5', 4], [4, 'C6', 2], [6, 'E6', 2], [8, 'D6', 3], [11, 'C6', 1], [12, 'G5', 4]],
  ],
};

function render(bars, build) {
  const len = Math.floor((bars * BAR + 1.2) * SR);
  const mk = () => [new Float32Array(len), new Float32Array(len)];
  const bus = { d: mk(), b: mk(), m: mk(), r: mk(), e: mk() };       // drums, bass, melodic, reverb send, echo send
  const kicks = [];
  const put = (b, s, t, g = 1, pan = 0, rv = 0, ec = 0) => {
    const i0 = Math.floor(t * SR), gl = g * Math.min(1, 1 - pan), gr = g * Math.min(1, 1 + pan);
    const [L, R] = bus[b], [rL, rR] = bus.r, eL = bus.e[0];
    for (let i = Math.max(0, -i0); i < s.length && i0 + i < len; i++) {
      const v = s[i], j = i0 + i; L[j] += v * gl; R[j] += v * gr;
      if (rv) { rL[j] += v * gl * rv; rR[j] += v * gr * rv; }
      if (ec) eL[j] += v * g * ec;
    }
  };
  const cache = new Map(), V = (key, make) => cache.get(key) || cache.set(key, make()).get(key);
  const D = { K: kick(), C: clap(), SN: snare(), H: hat(false), HO: hat(true), CR: crash(), SH: shutter(), T1: tom(92), T2: tom(68) };
  const hit = (name, t, g = 1, pan = 0, rv = 0) => { put('d', D[name], t, g, pan, rv); if (name === 'K') kicks.push(t); };
  const chord = (bar) => CH[PROG[bar % 4]];
  const api = {
    BAR, BEAT, S16, hit, chord,
    // wide chord stabs: two takes of the same chord, one each side
    stabs(bar, g = 0.5, steps = STAB, hold = 1.6) {
      const c = chord(bar), f = c.stab.map(N);
      for (const st of steps) for (const side of [-1, 1]) put('m', V('st' + PROG[bar % 4] + hold + side, () => stab(f, hold * S16)), bar * BAR + st * S16, g, side * 0.55, 0.22, 0.12);
    },
    pad(bar, bars = 1, g = 0.35, name = null, bright = 1) {
      const c = name ? CH[name] : chord(bar), f = c.pad.map(N), dur = bars * BAR;
      for (const side of [-1, 1]) put('m', V('pd' + (name || PROG[bar % 4]) + bars + bright + side, () => padv(f, dur, bright)), bar * BAR, g, side * 0.5, 0.35);
    },
    // the rolling bass: three sixteenths after every kick, with the odd octave jump
    bass(bar, g = 0.8, name = null) {
      const f = N((name ? CH[name] : chord(bar)).bass);
      for (let beat = 0; beat < 4; beat++) for (const st of [1, 2, 3]) {
        const up = st === 2 && (beat === 1 || beat === 3);
        put('b', V('bs' + f + up, () => bassv(up ? f * 2 : f, S16 * 0.82)), bar * BAR + (beat * 4 + st) * S16, g * (st === 2 ? 1 : 0.86));
      }
    },
    arp(bar, g = 0.3, name = null, from = 0, to = 16) {
      const c = name ? CH[name] : chord(bar);
      for (let st = from; st < to; st++) { const nt = c.arp[ARP[st]]; put('m', V('ar' + nt, () => pluck(N(nt))), bar * BAR + st * S16, g * (st % 4 === 0 ? 1 : 0.78), st % 2 ? 0.4 : -0.4, 0.2, 0.3); }
    },
    lead(bar, sec, g = 0.5, oct = 1) {
      for (const [st, nt, l] of LEAD[sec][bar % 4]) put('m', V('ld' + nt + l + oct, () => leadv(N(nt) * oct, l * S16 * 0.92)), bar * BAR + st * S16, g, 0.05 * (st % 3 - 1), 0.25, 0.3);
    },
    kicks(bar, steps = [0, 4, 8, 12], g = 0.95) { for (const st of steps) hit('K', bar * BAR + st * S16, g); },
    backbeat(bar, g = 1) { for (const st of [4, 12]) { hit('C', bar * BAR + st * S16, 0.85 * g, 0.06, 0.3); hit('SN', bar * BAR + st * S16, 0.42 * g, -0.06, 0.2); } },
    // closed hats on every sixteenth, the open hat on the off-beat
    hats(bar, g = 0.2, roll = 0) {
      for (let st = 0; st < 16; st++) { if (st % 4 === 2) hit('HO', bar * BAR + st * S16, g * 0.9, 0.2); else hit('H', bar * BAR + st * S16, g * (st % 2 ? 0.5 : 0.75), st % 2 ? 0.45 : -0.4); }
      if (roll) { const from = roll === 2 ? 8 : 12, n = roll === 2 ? 12 : 6; for (let k = 0; k < n; k++) hit('H', bar * BAR + from * S16 + k * (16 - from) * S16 / n, g * (0.45 + 0.5 * k / n), 0.18); }
    },
    roll(t0, t1, g = 0.5) { let t = t0, k = 0; while (t < t1) { const u = (t - t0) / (t1 - t0); hit('SN', t, g * (0.4 + 0.6 * u), k++ % 2 ? 0.18 : -0.18, 0.15); t += u < 0.5 ? S16 : u < 0.8 ? S16 / 2 : S16 / 3; } },
    riser(t0, dur, g = 0.5) { put('m', riser(dur), t0, g, 0, 0.2); },
    swell(tHit, dur, g = 0.4) { put('d', V('sw' + dur, () => swell(dur)), tHit - dur, g, 0, 0.3); },
    impact(t, g = 0.9) { put('b', V('imp', impact), t, g); },
    braam(t, g = 0.6, note = 'D1') { for (const side of [-1, 1]) put('m', V('br' + note + side, () => braam(N(note) * 2)), t, g, side * 0.35, 0.3); },
    crash(t, g = 0.4) { hit('CR', t, g, 0, 0.35); },
    mute(t0, t1, fade = 0.012) { for (const b of ['d', 'b', 'm', 'r', 'e']) for (const ch of bus[b]) { const a = Math.floor(t0 * SR), e = Math.min(len, Math.floor(t1 * SR)), f = Math.floor(fade * SR); for (let i = a; i < e; i++) ch[i] *= i - a < f ? 1 - (i - a) / f : 0; } },
    // low-pass the melodic bus over a span (cut-off moves from f0 to f1): the "underwater" opening
    filter(t0, t1, f0, f1) { for (const ch of bus.m) { let lp = 0, lp2 = 0; const a = Math.floor(t0 * SR), e = Math.min(len, Math.floor(t1 * SR)); for (let i = a; i < e; i++) { const u = (i - a) / (e - a), k = 1 - Math.exp(-2 * Math.PI * (f0 * Math.pow(f1 / f0, u)) / SR); lp += k * (ch[i] - lp); lp2 += k * (lp - lp2); ch[i] = lp2; } } },
    // the full groove for one bar
    groove(bar, o = {}) {
      api.kicks(bar); api.bass(bar, o.bass ?? 0.8); api.backbeat(bar, o.back ?? 1); api.hats(bar, o.hats ?? 0.34, o.roll || 0);
      if (o.stabs !== 0) api.stabs(bar, o.stabs ?? 0.5, o.steps || STAB, o.hold || 1.6);
      if (o.arp) api.arp(bar, o.arp);
      if (o.lead) api.lead(bar, o.lead, o.leadG ?? 0.5, o.oct || 1);
    },
  };
  build(api);

  /* ---- sends: a plate-ish reverb and a dotted-eighth ping-pong echo ---- */
  const [wL, wR] = reverb(bus.r[0], bus.r[1]);
  const DL = Math.round(3 * S16 * SR), fb = 0.38, echoL = new Float32Array(len), echoR = new Float32Array(len), ein = bus.e[0];
  for (let i = DL; i < len; i++) { echoL[i] = ein[i - DL] + fb * echoR[i - DL]; echoR[i] = echoL[i - DL]; }
  for (let i = 1; i < len; i++) { echoL[i] = echoL[i - 1] + 0.45 * (echoL[i] - echoL[i - 1]); echoR[i] = echoR[i - 1] + 0.45 * (echoR[i] - echoR[i - 1]); }

  /* ---- mix: the kick pumps everything else, then a loud master ---- */
  kicks.sort((a, b) => a - b);
  const L = new Float32Array(len), R = new Float32Array(len); let ki = 0, hpL = 0, hpR = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR; while (ki + 1 < kicks.length && kicks[ki + 1] <= t) ki++;
    const dk = kicks.length && kicks[ki] <= t ? t - kicks[ki] : 9, pump = Math.exp(-dk / 0.11);
    const dm = 1 - 0.74 * pump, db = 1 - 0.8 * Math.exp(-dk / 0.06);
    const l = bus.d[0][i] * MIX.d + bus.b[0][i] * db * MIX.b + (bus.m[0][i] + echoL[i] * 0.4) * dm * MIX.m + wL[i] * dm * MIX.r;
    const r = bus.d[1][i] * MIX.d + bus.b[1][i] * db * MIX.b + (bus.m[1][i] + echoR[i] * 0.4) * dm * MIX.m + wR[i] * dm * MIX.r;
    hpL += 0.0035 * (l - hpL); hpR += 0.0035 * (r - hpR);                       // ~25 Hz high-pass: no DC, no rumble
    L[i] = l - hpL; R[i] = r - hpR;
  }
  // loudness: bring the busy bars to a set level, then clip the peaks softly
  let ss = 0, cnt = 0; for (let i = 0; i < len; i += 4) { const v = (L[i] + R[i]) * 0.5; if (Math.abs(v) > 0.02) { ss += v * v; cnt++; } }
  const rms = Math.sqrt(ss / Math.max(1, cnt)), gIn = 0.3 / Math.max(rms, 1e-3);
  let peak = 0;
  for (let i = 0; i < len; i++) { L[i] = softClip(Math.tanh(L[i] * gIn * 1.05)); R[i] = softClip(Math.tanh(R[i] * gIn * 1.05)); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const g = 0.97 / Math.max(peak, 1e-3);
  for (let i = 0; i < len; i++) { L[i] *= g; R[i] *= g; }
  return { L, R, len, dur: bars * BAR };
}

// Freeverb-style: parallel damped combs, then all-passes in series; each filter runs over the whole buffer in turn
function reverb(inL, inR, room = 0.82, damp = 0.3) {
  const CL = [1116, 1188, 1277, 1356, 1422, 1491], AL = [556, 441, 341, 225];
  const run = (inp, spread) => {
    const n = inp.length, acc = new Float32Array(n);
    for (const l0 of CL) {
      const l = l0 + spread, buf = new Float32Array(l); let idx = 0, f = 0;
      for (let i = 0; i < n; i++) { const y = buf[idx]; f = y * (1 - damp) + f * damp; buf[idx] = inp[i] * 0.03 + f * room; if (++idx >= l) idx = 0; acc[i] += y; }
    }
    for (const l0 of AL) {
      const l = l0 + spread, buf = new Float32Array(l); let idx = 0;
      for (let i = 0; i < n; i++) { const y = buf[idx], x = acc[i]; buf[idx] = x + y * 0.5; if (++idx >= l) idx = 0; acc[i] = y - x; }
    }
    return acc;
  };
  return [run(inL, 0), run(inR, 23)];
}

// beats where the opening film's stills flash in (intro.js TILES) and where the gears change
const TILE_BEATS = [4, 5, 6, 7, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.25, 13.5, 13.75];
const SHIFT_BEATS = [33, 35, 37, 38, 39];

// 16 bars for the film. Bars are numbered from 0; beat b is at b * BEAT seconds.
export function renderFilm() {
  seed = 4711;
  return render(16, (m) => {
    const { BAR, BEAT } = m;
    // bars 0-1: black, then the stills. A deep hit and a low swell; the arpeggio far away behind a filter; every
    // still lands on a camera shutter and a low drum
    m.impact(0, 0.85); m.braam(0, 0.36); m.pad(0, 2, 0.4, 'Dm');
    m.arp(1, 0.22, 'Dm');
    TILE_BEATS.forEach((b, i) => { const t = b * BEAT; m.hit('SH', t, 0.5 + 0.02 * i, i % 2 ? 0.35 : -0.35, 0.35); m.hit(b === Math.floor(b) ? 'T2' : 'T1', t, b === Math.floor(b) ? 0.6 : 0.36, 0, 0.25); });
    // bars 2-3: the tension: Bb then C, the arpeggio opening up, kicks, the riser and a snare roll into half a beat of silence
    m.pad(2, 1, 0.4, 'Bb'); m.pad(3, 1, 0.42, 'C', 1.5);
    m.arp(2, 0.3, 'Bb'); m.arp(3, 0.36, 'C');
    m.filter(0, 4 * BAR, 420, 6000);
    m.kicks(2, [0, 8], 0.8); m.kicks(3, [0, 4, 8, 10], 0.85); m.hats(3, 0.16, 2);
    m.riser(2 * BAR + BEAT, 6.5 * BEAT, 0.5); m.roll(3 * BAR, 3 * BAR + 3.5 * BEAT, 0.5); m.swell(4 * BAR, 1.6, 0.35);
    m.mute(15.5 * BEAT - 0.02, 16 * BEAT);
    // bars 4-7: the drop. The groove and the chords; the lead comes in for the shots along the body, each cut on a crash
    m.impact(4 * BAR, 0.8); m.crash(4 * BAR, 0.5); m.braam(4 * BAR, 0.6);
    for (let b = 4; b < 8; b++) m.groove(b, { stabs: 0.52, arp: b >= 6 ? 0.2 : 0, lead: b >= 6 ? 'A' : null, leadG: 0.5, roll: b === 7 ? 2 : b === 5 ? 1 : 0 });
    for (const b of [24, 26, 28, 30]) m.crash(b * BEAT, 0.26);
    // bars 8-9: the gear changes. The drums step back; pad and arpeggio; every shift is a drum hit with a breath before it
    m.pad(8, 1, 0.42, 'Dm', 1.3); m.pad(9, 1, 0.42, 'Bb', 1.3);
    m.arp(8, 0.3, 'Dm'); m.arp(9, 0.32, 'Bb');
    m.hats(8, 0.1); m.hats(9, 0.12, 1);
    for (const b of SHIFT_BEATS) { m.hit('T2', b * BEAT, 0.95, 0, 0.3); m.hit('C', b * BEAT, 0.5, 0, 0.3); m.swell(b * BEAT, 0.32, 0.16); }
    m.roll(9 * BAR + 2 * BEAT, 10 * BAR, 0.4);
    // bars 10-13: the wheels spin: the groove again with the lead on top and the arpeggio under it
    // (the two slow-motion dips are done at playback)
    m.crash(10 * BAR, 0.45); m.impact(10 * BAR, 0.6); m.braam(10 * BAR, 0.5, 'F1');
    for (let b = 10; b < 14; b++) { m.groove(b, { stabs: 0.5, arp: 0.2, lead: b < 12 ? 'A' : 'B', leadG: b < 12 ? 0.5 : 0.42, roll: b % 2 ? 1 : 0 }); if (b >= 12) m.lead(b, 'A', 0.26); }
    // bars 14-15: the run out of the hall: Bb then C, climbing; kicks, the riser, a snare roll, half a beat of
    // silence, and the race
    m.pad(14, 1, 0.4, 'Bb', 1.6); m.pad(15, 1, 0.42, 'C', 2.0);
    m.kicks(14); m.bass(14, 0.75, 'Bb'); m.hats(14, 0.2, 1); m.arp(14, 0.34, 'Bb');
    m.kicks(15, [0, 4, 8, 10, 12, 13, 14], 0.9); m.bass(15, 0.7, 'C'); m.hats(15, 0.22, 2); m.arp(15, 0.4, 'C', 0, 14);
    m.riser(14 * BAR, 2 * BAR - 0.5 * BEAT, 0.65); m.roll(15 * BAR, 15 * BAR + 3.5 * BEAT, 0.55);
    m.mute(63.5 * BEAT - 0.02, 64 * BEAT + 1.2);
  });
}

// 16 bars under the race: the progression four times, a little more each time
export function renderLoop() {
  seed = 9091;
  return render(16, (m) => {
    const { BAR, BEAT } = m;
    m.impact(0, 0.55); m.crash(0, 0.4); m.braam(0, 0.4);
    for (let b = 0; b < 4; b++) m.groove(b, { stabs: 0.5, arp: 0.2, roll: b === 3 ? 1 : 0 });
    m.crash(4 * BAR, 0.35);
    for (let b = 4; b < 8; b++) m.groove(b, { stabs: 0.5, arp: 0.18, lead: 'A', roll: b === 7 ? 2 : 0 });
    m.crash(8 * BAR, 0.4); m.braam(8 * BAR, 0.34);
    for (let b = 8; b < 12; b++) m.groove(b, { stabs: 0.44, steps: [0, 6, 12], hold: 4.5, arp: 0.24, lead: 'B', leadG: 0.44, roll: b === 11 ? 1 : 0 });
    m.crash(12 * BAR, 0.35);
    for (let b = 12; b < 16; b++) { m.groove(b, { stabs: 0.5, arp: 0.2, lead: 'A', roll: b === 15 ? 2 : b % 2 }); m.lead(b, 'A', 0.2, 2); }
    m.roll(15 * BAR + 2 * BEAT, 16 * BAR, 0.4);
  });
}
