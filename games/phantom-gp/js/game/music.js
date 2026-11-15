// music.js — the soundtrack, synthesised from nothing: an original drift-phonk piece (cowbell lead, distorted 808,
// claps, hats) rendered into two buffers. `film` is the 16-bar score the opening film is cut to; `loop` is the
// 8-bar groove that carries on under the race. No samples and no existing tune are used.
export const BPM = 150, BEAT = 60 / BPM, SR = 44100;
const BAR = 4 * BEAT, S16 = BEAT / 4;
const N = (name) => { const m = /^([A-G])(b?)(\d)$/.exec(name), semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] - (m[2] ? 1 : 0); return 440 * Math.pow(2, (semi - 9) / 12 + (+m[3] - 4)); };
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/* ---- one-shot voices (mono Float32Array) ---- */
function cowbell(f, dur = 0.42, drive = 2.6) {
  const n = Math.floor(dur * SR), o = new Float32Array(n), f2 = f * 1.504;
  let p1 = 0, p2 = 0, lp = 0, bp = 0; const fc = 2 * Math.sin(Math.PI * Math.min(0.24, f * 1.7 / SR)), q = 0.55;
  for (let i = 0; i < n; i++) {
    const t = i / SR; p1 += f / SR; p2 += f2 / SR;
    const x = ((p1 % 1) < 0.5 ? 1 : -1) * 0.55 + ((p2 % 1) < 0.5 ? 1 : -1) * 0.45;
    lp += fc * bp; const hp = x - lp - q * bp; bp += fc * hp;                           // state-variable band-pass
    const env = Math.min(1, t / 0.0012) * (0.62 * Math.exp(-t / 0.035) + 0.38 * Math.exp(-t / 0.16));
    o[i] = Math.tanh((bp * 0.9 + x * 0.12) * env * drive) * 0.8;
  }
  return o;
}
function kick() {
  const n = Math.floor(0.42 * SR), o = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR, f = 44 + 130 * Math.exp(-t / 0.028); ph += f / SR; o[i] = Math.tanh((Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.16) + (t < 0.004 ? (rnd() - 0.5) * 0.8 : 0)) * 2.6) * 0.95; }
  return o;
}
function bass808(f, dur, slide = 0) {
  const n = Math.floor((dur + 0.12) * SR), o = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, fr = f * (1 + 0.6 * Math.exp(-t / 0.018)) * (slide ? Math.pow(2, slide / 12 * Math.min(1, t / (dur * 0.7))) : 1); ph += fr / SR;
    const env = Math.min(1, t / 0.004) * (t < dur ? 1 - 0.35 * t / dur : Math.max(0, 0.65 * (1 - (t - dur) / 0.12)));
    const s = Math.sin(2 * Math.PI * ph);
    o[i] = Math.tanh((s + 0.25 * Math.sin(4 * Math.PI * ph)) * 3.4 * env) * 0.82;
  }
  return o;
}
function noiseHit(dur, hp, lpc, shape) {
  const n = Math.floor(dur * SR), o = new Float32Array(n); let a = 0, b = 0; const kh = Math.exp(-2 * Math.PI * hp / SR), kl = 1 - Math.exp(-2 * Math.PI * lpc / SR);
  for (let i = 0; i < n; i++) { const x = rnd() * 2 - 1; a = kh * a + (1 - kh) * x; const h = x - a; b += kl * (h - b); o[i] = b * shape(i / SR); }
  return o;
}
const clap = () => noiseHit(0.24, 900, 5200, (t) => { let e = 0; for (const d of [0, 0.011, 0.023, 0.034]) if (t >= d) e = Math.max(e, Math.exp(-(t - d) / 0.006)); return (e * 0.8 + Math.exp(-t / 0.07) * (t > 0.034 ? 0.9 : 0)) * 1.9; });
const hat = (open) => noiseHit(open ? 0.22 : 0.05, 7000, 16000, (t) => Math.exp(-t / (open ? 0.07 : 0.012)) * 1.5);
function snare() {
  const a = noiseHit(0.2, 1400, 9000, (t) => Math.exp(-t / 0.05) * 1.6), n = a.length;
  for (let i = 0; i < n; i++) { const t = i / SR; a[i] = Math.tanh((a[i] + Math.sin(2 * Math.PI * 195 * t) * Math.exp(-t / 0.04) * 0.9) * 1.5) * 0.8; }
  return a;
}
function riser(dur) {
  const n = Math.floor(dur * SR), o = new Float32Array(n); let lp = 0, bp = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, fcut = 300 * Math.pow(30, u), fc = 2 * Math.sin(Math.PI * Math.min(0.3, fcut / SR));
    lp += fc * bp; const hp = (rnd() * 2 - 1) - lp - 0.35 * bp; bp += fc * hp;
    ph += (160 * Math.pow(6, u)) / SR;
    o[i] = (bp * 0.55 + Math.sin(2 * Math.PI * ph) * 0.16) * u * u;
  }
  return o;
}
function impact() {
  const n = Math.floor(1.6 * SR), o = new Float32Array(n); let ph = 0, lp = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += (30 + 70 * Math.exp(-t / 0.12)) / SR; lp += 0.02 * ((rnd() * 2 - 1) - lp); o[i] = Math.tanh((Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.5) + lp * 5 * Math.exp(-t / 0.3)) * 2.2) * 0.9; }
  return o;
}
function pad(freqs, dur) {
  const n = Math.floor(dur * SR), o = new Float32Array(n), ph = freqs.flatMap((f) => [[f * 0.996, rnd()], [f * 1.004, rnd()]]); let lp = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    let x = 0; for (const p of ph) { p[1] += p[0] / SR; x += (p[1] % 1) * 2 - 1; }
    const u = i / n, k = 0.012 + 0.03 * Math.sin(Math.PI * u);
    lp += k * (x / ph.length - lp); lp2 += k * (lp - lp2);
    o[i] = lp2 * Math.min(1, u * 6) * Math.min(1, (1 - u) * 5) * 1.8;
  }
  return o;
}

/* ---- the piece ---- */
const LEAD = [
  [[0, 'F5'], [2, 'F5'], [3, 'Eb5'], [5, 'F5'], [6, 'C5'], [8, 'Ab4'], [10, 'C5'], [11, 'Ab4'], [13, 'Bb4'], [14, 'C5']],
  [[0, 'F5'], [2, 'F5'], [3, 'Eb5'], [5, 'F5'], [6, 'C5'], [8, 'Db5'], [10, 'C5'], [11, 'Ab4'], [13, 'Gb4'], [14, 'F4']],
  [[0, 'F5'], [2, 'F5'], [3, 'Eb5'], [5, 'F5'], [6, 'C5'], [8, 'Ab4'], [10, 'C5'], [11, 'Ab4'], [13, 'Bb4'], [14, 'C5']],
  [[0, 'Ab5'], [2, 'Ab5'], [3, 'F5'], [5, 'Ab5'], [6, 'Eb5'], [8, 'Db5'], [10, 'C5'], [12, 'Db5'], [13, 'C5'], [14, 'Ab4'], [15, 'Gb4']],
];
const BASS = [     // [step, note, length in 16ths, slide in semitones]
  [[0, 'F1', 5], [6, 'F1', 3], [10, 'Ab1', 2], [12, 'F1', 3, 0]],
  [[0, 'F1', 5], [6, 'F1', 3], [10, 'Db1', 2], [12, 'Gb1', 4, -1]],
  [[0, 'F1', 5], [6, 'F1', 3], [10, 'Ab1', 2], [12, 'F1', 3, 0]],
  [[0, 'Db1', 5], [6, 'Db1', 3], [10, 'Eb1', 2], [12, 'Gb1', 4, -1]],
];
const KICK = [0, 6, 10], KICK2 = [0, 3, 6, 10, 14];

function render(bars, build) {
  const len = Math.floor((bars * BAR + 0.6) * SR), bus = { d: [new Float32Array(len), new Float32Array(len)], b: [new Float32Array(len), new Float32Array(len)], m: [new Float32Array(len), new Float32Array(len)] };
  const kicks = [];
  const put = (b, s, t, g = 1, pan = 0) => { const L = bus[b][0], R = bus[b][1], i0 = Math.floor(t * SR), gl = g * Math.min(1, 1 - pan), gr = g * Math.min(1, 1 + pan); for (let i = 0; i < s.length && i0 + i < len; i++) { if (i0 + i < 0) continue; L[i0 + i] += s[i] * gl; R[i0 + i] += s[i] * gr; } };
  const cache = new Map(), V = (key, mk) => cache.get(key) || cache.set(key, mk()).get(key);
  const K = kick(), C = clap(), H = hat(false), HO = hat(true), SN = snare();
  const api = {
    lead(bar, pat, g = 0.5, oct = 1, dur = 0.42) { for (const [st, nt] of LEAD[pat % 4]) put('m', V(nt + oct + dur, () => cowbell(N(nt) * oct, dur)), bar * BAR + st * S16, g, ((st * 7) % 5 - 2) * 0.12); },
    bass(bar, pat, g = 0.62) { for (const [st, nt, l, sl] of BASS[pat % 4]) { put('b', V('b' + nt + l + (sl || 0), () => bass808(N(nt) * 2, l * S16, sl || 0)), bar * BAR + st * S16, g); } },
    kicks(bar, steps = KICK, g = 0.8) { for (const st of steps) { put('d', K, bar * BAR + st * S16, g); kicks.push(bar * BAR + st * S16); } },
    claps(bar, steps = [4, 12], g = 0.62) { for (const st of steps) put('d', C, bar * BAR + st * S16, g, 0.08); },
    hats(bar, g = 0.2, roll = false) { for (let st = 0; st < 16; st += 2) put('d', st % 8 === 6 ? HO : H, bar * BAR + st * S16, g * (st % 4 === 2 ? 1 : 0.7), st % 4 ? 0.3 : -0.3); if (roll) for (let k = 0; k < 6; k++) put('d', H, bar * BAR + 14 * S16 + k * S16 / 3, g * (0.5 + k * 0.1), 0.2); },
    hit(name, t, g = 1, pan = 0) { put('d', { K, C, H, HO, SN }[name], t, g, pan); if (name === 'K') kicks.push(t); },
    roll(t0, t1, g = 0.5) { let t = t0, k = 0; while (t < t1) { const u = (t - t0) / (t1 - t0); put('d', SN, t, g * (0.45 + 0.55 * u), (k++ % 2 ? 0.2 : -0.2)); t += u < 0.5 ? S16 : S16 / 2; } },
    riser(t0, dur, g = 0.5) { put('m', riser(dur), t0, g); },
    impact(t, g = 0.9) { put('b', V('imp', impact), t, g); },
    pad(t, dur, notes, g = 0.3) { put('m', pad(notes.map(N), dur), t, g); },
    bell(t, nt, g = 0.5, oct = 1, dur = 0.42) { put('m', V(nt + oct + dur, () => cowbell(N(nt) * oct, dur)), t, g); },
    mute(t0, t1, fade = 0.012) { for (const b of ['d', 'b', 'm']) for (const ch of bus[b]) { const a = Math.floor(t0 * SR), e = Math.min(len, Math.floor(t1 * SR)), f = Math.floor(fade * SR); for (let i = a; i < e; i++) ch[i] *= i - a < f ? 1 - (i - a) / f : 0; } },
    // low-pass the melodic bus over a span (cut-off moves from f0 to f1): the "underwater" opening
    filter(t0, t1, f0, f1) { for (const ch of bus.m) { let lp = 0, lp2 = 0; const a = Math.floor(t0 * SR), e = Math.min(len, Math.floor(t1 * SR)); for (let i = a; i < e; i++) { const u = (i - a) / (e - a), k = 1 - Math.exp(-2 * Math.PI * (f0 * Math.pow(f1 / f0, u)) / SR); lp += k * (ch[i] - lp); lp2 += k * (lp - lp2); ch[i] = lp2; } } },
  };
  build(api);
  // the kick ducks the lead and the bass (the pumping that makes it move), then a soft limiter
  kicks.sort((a, b) => a - b);
  const L = new Float32Array(len), R = new Float32Array(len); let ki = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR; while (ki + 1 < kicks.length && kicks[ki + 1] <= t) ki++;
    const dk = kicks.length && kicks[ki] <= t ? t - kicks[ki] : 9, duck = 1 - 0.55 * Math.exp(-dk / 0.11);
    L[i] = Math.tanh((bus.d[0][i] + bus.b[0][i] * (0.55 + 0.45 * duck) + bus.m[0][i] * duck) * 1.25);
    R[i] = Math.tanh((bus.d[1][i] + bus.b[1][i] * (0.55 + 0.45 * duck) + bus.m[1][i] * duck) * 1.25);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.92 / Math.max(peak, 1e-3);
  for (let i = 0; i < len; i++) { L[i] *= g; R[i] *= g; }
  return { L, R, len, dur: bars * BAR };
}

// 16 bars for the film. Bars are numbered from 0; beat b is at b * BEAT seconds.
export function renderFilm() {
  seed = 4711;
  return render(16, (m) => {
    // bars 0-1: the lead alone, muffled, opening up; a boom on the first beat; ticks where the first stills flash in
    m.impact(0, 0.8); m.pad(0, 2 * BAR, ['F2', 'C3'], 0.22);
    m.lead(0, 0, 0.42); m.lead(1, 1, 0.46);
    for (let b = 4; b < 8; b++) m.hit('H', b * BEAT, 0.5);
    m.filter(0, 2 * BAR, 500, 5200);
    // bars 2-3: hats and a sparse kick join, a riser and a snare roll into the silence before the drop
    m.lead(2, 2, 0.5); m.lead(3, 3, 0.5);
    m.hats(2, 0.2); m.hats(3, 0.22, true); m.kicks(2, [0, 8], 0.7); m.kicks(3, [0, 4, 8], 0.7);
    m.riser(2 * BAR + BEAT, 7 * BEAT - 0.5 * BEAT, 0.42); m.roll(3 * BAR, 3 * BAR + 3.5 * BEAT, 0.42);
    m.mute(15.5 * BEAT - 0.02, 16 * BEAT);
    // bars 4-7: the drop
    m.impact(4 * BAR, 0.7);
    for (let b = 4; b < 8; b++) { m.lead(b, b, 0.56); m.bass(b, b); m.kicks(b, b % 2 ? KICK2 : KICK); m.claps(b); m.hats(b, 0.2, b === 7); }
    m.hit('HO', 4 * BAR, 0.5);
    // bars 8-9: breakdown for the gear changes: bass and claps only, the lead an octave down and quiet
    for (let b = 8; b < 10; b++) { m.bass(b, b, 0.55); m.kicks(b, [0, 10], 0.75); m.claps(b, [4, 12], 0.7); m.lead(b, b, 0.2, 0.5, 0.3); }
    m.pad(8 * BAR, 2 * BAR, ['F2', 'Ab2', 'C3'], 0.2);
    // bars 10-13: the groove again, harder (two slow-motion dips happen here; they are done at playback)
    for (let b = 10; b < 14; b++) { m.lead(b, b, 0.56); m.lead(b, b, 0.18, 0.5); m.bass(b, b, 0.66); m.kicks(b, KICK2); m.claps(b); m.hats(b, 0.22, b % 2 === 1); }
    m.hit('HO', 10 * BAR, 0.5);
    // bars 14-15: the build to the cut
    for (let b = 14; b < 16; b++) { m.bass(b, b, 0.6); m.kicks(b, [0, 4, 8, 12], 0.8); m.hats(b, 0.22, true); }
    for (let k = 0; k < 8; k++) m.bell(14 * BAR + k * 2 * S16, ['F4', 'Ab4', 'C5', 'Eb5'][k % 4], 0.3 + k * 0.012, 1, 0.2);
    for (let k = 0; k < 14; k++) m.bell(15 * BAR + k * S16, ['F4', 'Ab4', 'C5', 'Eb5', 'F5', 'Ab5', 'C5', 'Eb5'][k % 8], 0.4 + k * 0.012, k < 8 ? 1 : 2, 0.16);
    m.riser(14 * BAR, 2 * BAR - 0.5 * BEAT, 0.6); m.roll(15 * BAR, 15 * BAR + 3.5 * BEAT, 0.5);
    m.mute(63.5 * BEAT - 0.02, 64 * BEAT + 0.6);
  });
}

// 8 bars that loop under the race
export function renderLoop() {
  seed = 9091;
  return render(8, (m) => {
    m.impact(0, 0.6); m.hit('HO', 0, 0.5);
    for (let b = 0; b < 8; b++) {
      m.lead(b, b, b < 4 ? 0.54 : 0.5); if (b >= 4) m.lead(b, b, 0.2, 0.5);
      m.bass(b, b, 0.64); m.kicks(b, b % 2 ? KICK2 : KICK); m.claps(b); m.hats(b, 0.2, b % 4 === 3);
    }
  });
}
