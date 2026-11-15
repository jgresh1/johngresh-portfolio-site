// music.js — the soundtrack, synthesised from nothing: an original drift-phonk piece rendered into two buffers.
// `film` is the 16-bar score the opening film is cut to (the beat map is in intro.js); `loop` is the 16-bar groove
// that runs under the race. No samples and no existing tune are used.
//
// What makes it hit: a tuned 808-style cowbell lead (two square waves through a band-pass, driven), one continuous
// distorted 808 that glides between notes, a clicky kick on every 808 hit, clap + snare on 2 and 4, rolling hats,
// reverb and a ping-pong echo on sends, hard side-chain pumping from the kick, and a loud clipped master.
export const BPM = 150, BEAT = 60 / BPM, SR = 44100;
const BAR = 4 * BEAT, S16 = BEAT / 4;
const N = (name) => { const m = /^([A-G])(b?)(\d)$/.exec(name), semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] - (m[2] ? 1 : 0); return 440 * Math.pow(2, (semi - 9) / 12 + (+m[3] - 4)); };
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const softClip = (x) => (x >= 1 ? 1 : x <= -1 ? -1 : 1.5 * x - 0.5 * x * x * x);
// bus levels into the master: drums, 808, melodic, reverb. The 808 is kept under the drums and the lead on purpose:
// left to itself it takes four fifths of the energy and everything else goes flat.
const MIX = { d: 1.5, b: 0.5, m: 1.85, r: 1.4 };

/* ------------------------------------------------------------------ voices (mono Float32Array one-shots) */
// TR-808 style cowbell, pitched: two squares a 1.48 ratio apart, band-passed, a tiny pitch drop on the hit, driven
function cowbell(f, dur = 0.34) {
  const n = Math.floor(dur * SR), o = new Float32Array(n), f2 = f * 1.48;
  const fc = 2 * Math.sin(Math.PI * Math.min(0.24, f * 1.3 / SR)), q = 0.62;
  let p1 = 0.13, p2 = 0.71, lp = 0, bp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, bend = 1 + 0.03 * Math.exp(-t / 0.004);
    p1 += f * bend / SR; p2 += f2 * bend / SR;
    const x = ((p1 % 1) < 0.5 ? 0.6 : -0.6) + ((p2 % 1) < 0.5 ? 0.4 : -0.4);
    lp += fc * bp; const hp = x - lp - q * bp; bp += fc * hp;
    const env = Math.min(1, t / 0.0007) * (0.66 * Math.exp(-t / 0.026) + 0.34 * Math.exp(-t / 0.12)) * Math.min(1, (dur - t) / 0.02);
    o[i] = Math.tanh((bp * 1.15 + hp * 0.36) * env * 3.4) * 0.74;
  }
  return o;
}
// kick: a fast pitch dive from a click into a short round body, saturated
function kick() {
  const n = Math.floor(0.34 * SR), o = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 55 + 200 * Math.exp(-t / 0.018) + 900 * Math.exp(-t / 0.0022);
    ph += f / SR;
    const body = Math.sin(2 * Math.PI * ph) * Math.min(1, t / 0.0015) * Math.exp(-t / 0.085);
    const click = (rnd() * 2 - 1) * Math.exp(-t / 0.0022) * 0.9 + Math.sin(2 * Math.PI * 3100 * t) * Math.exp(-t / 0.0035) * 0.5;
    o[i] = Math.tanh((body + click) * 3.4) * 0.97;
  }
  return o;
}
// state-variable band-pass noise burst
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
  const air = noiseBP(0.2, 3600, 0.9, (t) => Math.exp(-t / 0.03) * 0.8);          // the bright snap on top
  for (let i = 0; i < s.length; i++) s[i] = Math.tanh((s[i] + (i < air.length ? air[i] : 0)) * 2.4) * 0.9;
  return s;
};
function snare() {
  const a = noiseHP(0.26, 1800, (t) => Math.exp(-t / 0.075) * 0.9), n = a.length;
  for (let i = 0; i < n; i++) { const t = i / SR, body = (Math.sin(2 * Math.PI * 190 * t) * 0.8 + Math.sin(2 * Math.PI * 330 * t) * 0.35) * Math.exp(-t / 0.045); a[i] = Math.tanh((a[i] + body) * 1.8) * 0.85; }
  return a;
}
const hat = (open) => noiseHP(open ? 0.26 : 0.06, 7500, (t) => Math.exp(-t / (open ? 0.075 : 0.011)) * 2.4 * Math.min(1, t / 0.0004));
const crash = () => noiseHP(1.9, 4200, (t) => Math.min(1, t / 0.002) * (0.55 * Math.exp(-t / 0.08) + 0.45 * Math.exp(-t / 0.75)) * 0.9);
// noise that swells into a hit (a reversed cymbal)
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
function pad(freqs, dur) {
  const n = Math.floor(dur * SR), o = new Float32Array(n), ph = freqs.flatMap((f) => [[f * 0.995, rnd()], [f * 1.005, rnd()]]); let lp = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    let x = 0; for (const p of ph) { p[1] += p[0] / SR; x += (p[1] % 1) * 2 - 1; }
    const u = i / n, k = 0.012 + 0.03 * Math.sin(Math.PI * u);
    lp += k * (x / ph.length - lp); lp2 += k * (lp - lp2);
    o[i] = lp2 * Math.min(1, u * 6) * Math.min(1, (1 - u) * 5) * 1.8;
  }
  return o;
}
// One continuous 808: notes [time, freq, length, glide]; glide = slide into this note from the last one (no new attack)
function line808(notes, drive = 5.5) {
  const t0 = notes[0][0], tEnd = Math.max(...notes.map((x) => x[0] + x[2])) + 0.14;
  const n = Math.floor((tEnd - t0) * SR), o = new Float32Array(n);
  let ph = 0, f = notes[0][1], amp = 0, k = -1, lp = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / SR;
    while (k + 1 < notes.length && notes[k + 1][0] <= t) k++;
    const [ns, nf, nl, gl] = notes[k], dt = t - ns;
    const tc = gl ? 0.045 : 0.0025;
    f += (nf - f) * (1 - Math.exp(-1 / (SR * tc)));
    const punch = gl ? 1 : 1 + 0.45 * Math.exp(-dt / 0.014);              // the 808's own attack bend
    ph += f * punch / SR;
    const target = dt < nl ? 1 - 0.32 * dt / nl : 0;
    const atk = !gl && dt < 0.003 ? dt / 0.003 : 1;
    amp += (target * atk - amp) * (target > amp ? 0.5 : 1 - Math.exp(-1 / (SR * 0.035)));
    const s = Math.sin(2 * Math.PI * ph) + 0.28 * Math.sin(4 * Math.PI * ph);
    const y = Math.tanh(s * drive * amp) * 0.8 + softClip(s * amp * 1.4) * 0.2;
    lp += 0.35 * (y - lp);                                                  // tame the fizz the drive makes
    o[i] = lp * 0.9;
  }
  return { o, t0 };
}

/* ------------------------------------------------------------------ the piece (F minor, a touch of phrygian) */
const LEAD = {
  A: [
    [[0, 'F5'], [2, 'F5'], [3, 'F5'], [5, 'Eb5'], [7, 'F5'], [8, 'C5'], [10, 'C5'], [11, 'Ab4'], [13, 'Bb4'], [14, 'C5']],
    [[0, 'F5'], [2, 'F5'], [3, 'F5'], [5, 'Eb5'], [7, 'F5'], [8, 'Db5'], [10, 'C5'], [11, 'Bb4'], [13, 'Ab4'], [14, 'Gb4']],
    [[0, 'F5'], [2, 'F5'], [3, 'F5'], [5, 'Eb5'], [7, 'F5'], [8, 'C5'], [10, 'C5'], [11, 'Ab4'], [13, 'Bb4'], [14, 'C5']],
    [[0, 'Ab5'], [2, 'Ab5'], [3, 'Ab5'], [5, 'G5'], [7, 'F5'], [8, 'Eb5'], [10, 'F5'], [11, 'C5'], [12, 'Db5'], [13, 'C5'], [14, 'Bb4'], [15, 'Ab4']],
  ],
  B: [
    [[0, 'C6'], [1, 'C6'], [3, 'Bb5'], [4, 'Ab5'], [6, 'G5'], [7, 'Ab5'], [8, 'F5'], [10, 'F5'], [11, 'G5'], [12, 'Ab5'], [14, 'G5']],
    [[0, 'F5'], [1, 'F5'], [3, 'Eb5'], [4, 'F5'], [6, 'Ab5'], [8, 'Gb5'], [10, 'Eb5'], [11, 'F5'], [12, 'C5'], [14, 'Eb5'], [15, 'F5']],
    [[0, 'C6'], [1, 'C6'], [3, 'Bb5'], [4, 'Ab5'], [6, 'G5'], [7, 'Ab5'], [8, 'F5'], [10, 'F5'], [11, 'G5'], [12, 'Ab5'], [14, 'G5']],
    [[0, 'Db6'], [2, 'C6'], [3, 'Bb5'], [4, 'Ab5'], [6, 'Bb5'], [7, 'Ab5'], [8, 'G5'], [10, 'F5'], [11, 'Eb5'], [12, 'F5'], [13, 'G5'], [14, 'Ab5'], [15, 'C6']],
  ],
};
const BASS = {     // [step, note, length in 16ths, glide into it]
  A: [
    [[0, 'F1', 6], [6, 'F1', 3], [10, 'Ab1', 3, 1], [13, 'F2', 3, 1]],
    [[0, 'F1', 6], [6, 'F1', 3], [10, 'Db2', 3], [13, 'C2', 3, 1]],
    [[0, 'F1', 6], [6, 'F1', 3], [10, 'Ab1', 3, 1], [13, 'F2', 3, 1]],
    [[0, 'Db2', 6], [6, 'Db2', 3], [10, 'Eb2', 3, 1], [13, 'C2', 3, 1]],
  ],
  B: [
    [[0, 'F1', 3], [3, 'F1', 3], [6, 'Ab1', 4, 1], [10, 'C2', 2], [12, 'F2', 4, 1]],
    [[0, 'Db2', 3], [3, 'Db2', 3], [6, 'C2', 4, 1], [10, 'Ab1', 2], [12, 'Bb1', 4, 1]],
    [[0, 'F1', 3], [3, 'F1', 3], [6, 'Ab1', 4, 1], [10, 'C2', 2], [12, 'F2', 4, 1]],
    [[0, 'Gb1', 3], [3, 'Gb1', 3], [6, 'Ab1', 4, 1], [10, 'C2', 2], [12, 'Eb2', 4, 1]],
  ],
};

function render(bars, build) {
  const len = Math.floor((bars * BAR + 1.2) * SR);
  const mk = () => [new Float32Array(len), new Float32Array(len)];
  const bus = { d: mk(), b: mk(), m: mk(), r: mk(), e: mk() };       // drums, bass, melodic, reverb send, echo send
  const kicks = [];
  const put = (b, s, t, g = 1, pan = 0, rv = 0, ec = 0) => {
    const i0 = Math.floor(t * SR), gl = g * Math.min(1, 1 - pan), gr = g * Math.min(1, 1 + pan);
    const [L, R] = bus[b], [rL, rR] = bus.r, [eL, eR] = bus.e;
    for (let i = Math.max(0, -i0); i < s.length && i0 + i < len; i++) {
      const v = s[i], j = i0 + i; L[j] += v * gl; R[j] += v * gr;
      if (rv) { rL[j] += v * gl * rv; rR[j] += v * gr * rv; }
      if (ec) { eL[j] += v * g * ec; }
    }
  };
  const cache = new Map(), V = (key, make) => cache.get(key) || cache.set(key, make()).get(key);
  const K = kick(), C = clap(), SN = snare(), H = hat(false), HO = hat(true), CR = crash();
  const hit = (name, t, g = 1, pan = 0, rv = 0) => { put('d', { K, C, SN, H, HO, CR }[name], t, g, pan, rv); if (name === 'K') kicks.push(t); };
  const bell = (t, nt, g = 0.5, oct = 1, dur = 0.34, pan = 0, rv = 0.16, ec = 0.22) => put('m', V(nt + oct + dur, () => cowbell(N(nt) * oct, dur)), t, g, pan, rv, ec);
  const api = {
    BAR, BEAT, S16, hit, bell,
    lead(bar, sec, pat, g = 0.5, oct = 1, dur = 0.34) { for (const [st, nt] of LEAD[sec][pat % 4]) bell(bar * BAR + st * S16, nt, g, oct, dur, ((st * 7) % 5 - 2) * 0.2 * (oct === 1 ? 1 : -1)); },
    // a run of bars of 808 as one voice (so the glides join up); each note start also gets the kick unless told not to
    bass(bar0, secs, g = 0.8, kickG = 0.9, kickEvery = 1) {
      const notes = []; let k = 0;
      secs.forEach((sec, i) => { for (const [st, nt, l, gl] of BASS[sec][(bar0 + i) % 4]) { const t = (bar0 + i) * BAR + st * S16; notes.push([t, N(nt) * 2, l * S16, !!gl]); if (kickG > 0 && !gl && (k++ % kickEvery) === 0) hit('K', t, kickG); } });
      const { o, t0 } = line808(notes); put('b', o, t0, g);
    },
    kicks(bar, steps, g = 0.9) { for (const st of steps) hit('K', bar * BAR + st * S16, g); },
    backbeat(bar, g = 1, ghost = false) {
      for (const st of [4, 12]) { hit('C', bar * BAR + st * S16, 0.62 * g, 0.06, 0.32); hit('SN', bar * BAR + st * S16, 0.42 * g, -0.06, 0.22); }
      if (ghost) hit('SN', bar * BAR + 15 * S16, 0.16 * g, 0.2, 0.1);
    },
    hats(bar, g = 0.22, roll = 0) {
      for (let st = 0; st < 16; st++) { const acc = st % 4 === 2 ? 1 : st % 2 ? 0.45 : 0.7; if (st === 6 || st === 14) hit('HO', bar * BAR + st * S16, g * 0.55, 0.25); else hit('H', bar * BAR + st * S16, g * acc, st % 2 ? 0.45 : -0.4); }
      // rolls: 1 = 32nd-note triplets over the last beat, 2 = over the last two beats
      if (roll) { const from = roll === 2 ? 8 : 12, n = roll === 2 ? 12 : 6; for (let k = 0; k < n; k++) hit('H', bar * BAR + from * S16 + k * (16 - from) * S16 / n, g * (0.45 + 0.5 * k / n), 0.18); }
    },
    roll(t0, t1, g = 0.5) { let t = t0, k = 0; while (t < t1) { const u = (t - t0) / (t1 - t0); hit('SN', t, g * (0.4 + 0.6 * u), k++ % 2 ? 0.18 : -0.18, 0.15); t += u < 0.5 ? S16 : u < 0.8 ? S16 / 2 : S16 / 3; } },
    riser(t0, dur, g = 0.5) { put('m', riser(dur), t0, g, 0, 0.2); },
    swell(tHit, dur, g = 0.4) { put('d', V('sw' + dur, () => swell(dur)), tHit - dur, g, 0, 0.3); },
    impact(t, g = 0.9) { put('b', V('imp', impact), t, g); },
    crash(t, g = 0.4) { hit('CR', t, g, 0, 0.35); },
    pad(t, dur, notes, g = 0.3) { put('m', pad(notes.map(N), dur), t, g, 0, 0.3); },
    mute(t0, t1, fade = 0.012) { for (const b of ['d', 'b', 'm', 'r', 'e']) for (const ch of bus[b]) { const a = Math.floor(t0 * SR), e = Math.min(len, Math.floor(t1 * SR)), f = Math.floor(fade * SR); for (let i = a; i < e; i++) ch[i] *= i - a < f ? 1 - (i - a) / f : 0; } },
    // low-pass the melodic bus over a span (cut-off moves from f0 to f1): the "underwater" opening
    filter(t0, t1, f0, f1) { for (const ch of bus.m) { let lp = 0, lp2 = 0; const a = Math.floor(t0 * SR), e = Math.min(len, Math.floor(t1 * SR)); for (let i = a; i < e; i++) { const u = (i - a) / (e - a), k = 1 - Math.exp(-2 * Math.PI * (f0 * Math.pow(f1 / f0, u)) / SR); lp += k * (ch[i] - lp); lp2 += k * (lp - lp2); ch[i] = lp2; } } },
  };
  build(api);

  /* ---- sends: a plate-ish reverb and a dotted-eighth ping-pong echo ---- */
  const [wL, wR] = reverb(bus.r[0], bus.r[1]);
  const D = Math.round(3 * S16 * SR), fb = 0.4, echoL = new Float32Array(len), echoR = new Float32Array(len), ein = bus.e[0];
  for (let i = D; i < len; i++) { echoL[i] = ein[i - D] + fb * echoR[i - D]; echoR[i] = echoL[i - D]; }
  for (let i = 1; i < len; i++) { echoL[i] = echoL[i - 1] + 0.45 * (echoL[i] - echoL[i - 1]); echoR[i] = echoR[i - 1] + 0.45 * (echoR[i] - echoR[i - 1]); }   // darker repeats

  /* ---- mix: the kick pumps everything else, then a loud master ---- */
  kicks.sort((a, b) => a - b);
  const L = new Float32Array(len), R = new Float32Array(len); let ki = 0, hpL = 0, hpR = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR; while (ki + 1 < kicks.length && kicks[ki + 1] <= t) ki++;
    const dk = kicks.length && kicks[ki] <= t ? t - kicks[ki] : 9, pump = Math.exp(-dk / 0.1);
    const dm = 1 - 0.55 * pump, db = 1 - 0.7 * Math.exp(-dk / 0.05);
    let l = bus.d[0][i] * MIX.d + bus.b[0][i] * db * MIX.b + (bus.m[0][i] + echoL[i] * 0.42) * dm * MIX.m + wL[i] * dm * MIX.r;
    let r = bus.d[1][i] * MIX.d + bus.b[1][i] * db * MIX.b + (bus.m[1][i] + echoR[i] * 0.42) * dm * MIX.m + wR[i] * dm * MIX.r;
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
function reverb(inL, inR, room = 0.8, damp = 0.3) {
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
    const { BAR, BEAT, S16 } = m;
    // bars 0-1: black, then the stills. A boom, the lead alone and muffled, opening up; every still lands on a snap
    m.impact(0, 0.85); m.pad(0, 2 * BAR, ['F2', 'C3'], 0.24);
    m.lead(0, 'A', 0, 0.44); m.lead(1, 'A', 1, 0.48);
    m.filter(0, 2 * BAR, 450, 5600);
    TILE_BEATS.forEach((b, i) => { const t = b * BEAT; m.hit('C', t, 0.28 + 0.02 * i, i % 2 ? 0.3 : -0.3, 0.4); m.hit('H', t, 0.35); if (b === Math.floor(b)) m.hit('K', t, 0.55); });
    // bars 2-3: hats and kicks join, the riser and a snare roll run into a half beat of silence before the drop
    m.lead(2, 'A', 2, 0.5); m.lead(3, 'A', 3, 0.52);
    m.hats(2, 0.2); m.hats(3, 0.22, 2); m.kicks(2, [0, 8], 0.8); m.kicks(3, [0, 4, 8, 10], 0.85);
    m.riser(2 * BAR + BEAT, 6.5 * BEAT, 0.5); m.roll(3 * BAR, 3 * BAR + 3.5 * BEAT, 0.5); m.swell(4 * BAR, 1.6, 0.35);
    m.mute(15.5 * BEAT - 0.02, 16 * BEAT);
    // bars 4-7: the drop. Everything, and a crash plus an 808 stab on each shot along the body (beats 24-30)
    m.impact(4 * BAR, 0.8); m.crash(4 * BAR, 0.5);
    m.bass(4, ['A', 'A', 'A', 'A'], 0.85, 1.0);
    for (let b = 4; b < 8; b++) { m.lead(b, 'A', b, 0.56); m.lead(b, 'A', b, 0.16, 2, 0.2); m.backbeat(b, 1, b % 2 === 1); m.hats(b, 0.22, b === 7 ? 2 : b % 2); }
    for (const b of [24, 26, 28, 30]) { m.crash(b * BEAT, 0.28); m.hit('K', b * BEAT, 0.6); }
    // bars 8-9: the gear changes. 808 and claps, the lead dark and low; every shift is a hit
    m.bass(8, ['A', 'A'], 0.8, 0.85);
    for (let b = 8; b < 10; b++) { m.backbeat(b, 0.9); m.lead(b, 'A', b, 0.22, 0.5, 0.26); m.hats(b, 0.12); }
    m.pad(8 * BAR, 2 * BAR, ['F2', 'Ab2', 'C3'], 0.2);
    for (const b of SHIFT_BEATS) { m.hit('K', b * BEAT, 0.95); m.hit('C', b * BEAT, 0.55, 0, 0.3); m.swell(b * BEAT, 0.32, 0.16); }
    // bars 10-13: the switch-up, harder (the two slow-motion dips are done at playback)
    m.crash(10 * BAR, 0.45); m.impact(10 * BAR, 0.5);
    m.bass(10, ['B', 'B', 'B', 'B'], 0.85, 1.0);
    for (let b = 10; b < 14; b++) { m.lead(b, 'B', b, 0.56); m.lead(b, 'B', b, 0.16, 0.5); m.backbeat(b, 1.05, true); m.hats(b, 0.24, b % 2 ? 2 : 1); }
    // bars 14-15: the build to the cut: a climbing bell arpeggio, the riser, a snare roll, silence, then the race
    m.bass(14, ['A', 'A'], 0.7, 0.9);
    m.kicks(14, [4, 8, 12], 0.85); m.kicks(15, [0, 4, 8, 12], 0.9); m.hats(14, 0.22, 1); m.hats(15, 0.24, 2);
    for (let k = 0; k < 8; k++) m.bell(14 * BAR + k * 2 * S16, ['F4', 'Ab4', 'C5', 'Eb5'][k % 4], 0.34 + k * 0.012, 1, 0.2);
    for (let k = 0; k < 14; k++) m.bell(15 * BAR + k * S16, ['F4', 'Ab4', 'C5', 'Eb5', 'F5', 'Ab5', 'C5', 'Eb5'][k % 8], 0.42 + k * 0.012, k < 8 ? 1 : 2, 0.16);
    m.riser(14 * BAR, 2 * BAR - 0.5 * BEAT, 0.65); m.roll(15 * BAR, 15 * BAR + 3.5 * BEAT, 0.55);
    m.mute(63.5 * BEAT - 0.02, 64 * BEAT + 1.2);
  });
}

// 16 bars under the race: the groove (A), the switch-up (B), the groove again with a fill into the loop point
export function renderLoop() {
  seed = 9091;
  return render(16, (m) => {
    const { BAR } = m;
    m.impact(0, 0.55); m.crash(0, 0.4);
    m.bass(0, ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'], 0.85, 1.0);
    for (let b = 0; b < 8; b++) { m.lead(b, 'A', b, 0.54); if (b >= 4) m.lead(b, 'A', b, 0.16, 2, 0.2); m.backbeat(b, 1, b % 2 === 1); m.hats(b, 0.22, b % 4 === 3 ? 2 : b % 2); }
    m.crash(8 * BAR, 0.4);
    m.bass(8, ['B', 'B', 'B', 'B'], 0.85, 1.0);
    for (let b = 8; b < 12; b++) { m.lead(b, 'B', b, 0.54); m.lead(b, 'B', b, 0.15, 0.5); m.backbeat(b, 1.05, true); m.hats(b, 0.24, b % 2 ? 2 : 1); }
    m.crash(12 * BAR, 0.35);
    m.bass(12, ['A', 'A', 'A', 'A'], 0.85, 1.0);
    for (let b = 12; b < 16; b++) { m.lead(b, 'A', b, 0.54); m.lead(b, 'A', b, 0.16, 2, 0.2); m.backbeat(b, 1, b % 2 === 1); m.hats(b, 0.22, b === 15 ? 2 : b % 2); }
    m.roll(15 * BAR + 2 * m.BEAT, 16 * BAR, 0.45);
  });
}
