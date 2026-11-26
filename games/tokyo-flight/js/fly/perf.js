// perf.js — what this device is given to draw, and a governor that keeps the frame rate up while flying.
//
// Four tiers. The two light ones stream the survey's photo-free building sets (real shapes, a sixth of the
// download, nothing large to decode) and colour the roofs from the aerial photo; the two heavy ones stream the
// photo-textured sets. Everything else scales with it: resolution, how far out buildings are opened, how small
// a building may get before it is left out, shadow maps, the aircraft model (`jet` while flying; `jetFilm` in the
// hangar, where the camera is close enough to see the difference).
// `px` and `far` are for the built-in city (baked.js): how small a building may look before it is left out (pixels on
// a 1000-pixel screen) and how far out the skyline is kept. `err`, `fall`, `gb`, `tex`, `near`, `lite`, `reach` are for
// the survey's streamed tiles, which are now an option (city.js).
export const TIERS = {
  phone: { drops: 1800, label: 'Lightest', dpr: 2, pixels: 1.25e6, aa: false, err: 38, fall: 36, gb: 0.30, tex: 512, near: 512, lite: true, px: 11, far: 9000, reach: 5200, kinds: ['bldg', 'brid'],
    terrPx: 2.4, maxZ: 16, aniso: 2, cascades: [], csize: [], jetShadow: 1024, jet: 'lo', jetFilm: 'hi', bake: [2048, 1024], parse: 2, down: 8, terrActive: 8, tilesPerFrame: 1, slowMs: 24 },
  low: { drops: 3000, label: 'Low', dpr: 1, pixels: 1.6e6, aa: true, err: 30, fall: 28, gb: 0.6, tex: 1024, near: 1024, lite: true, px: 8, far: 12000, reach: 7000, kinds: ['bldg', 'brid'],
    terrPx: 1.9, maxZ: 17, aniso: 4, cascades: [600], csize: [2048], jetShadow: 1024, jet: 'lo', jetFilm: 'hi', bake: [2048, 1024], parse: 3, down: 10, terrActive: 10, tilesPerFrame: 1, slowMs: 22 },
  mid: { drops: 5500, label: 'Medium', dpr: 1.25, pixels: 2.6e6, aa: true, err: 22, fall: 16, gb: 1.6, tex: 1024, near: 2048, lite: false, px: 5.5, far: 17000, reach: 10000, kinds: ['bldg', 'brid'],
    terrPx: 1.4, maxZ: 18, aniso: 8, cascades: [420, 2400], csize: [2048, 2048], jetShadow: 2048, jet: 'hi', bake: [4096, 2048], parse: 4, down: 14, terrActive: 14, tilesPerFrame: 1, slowMs: 21 },
  high: { drops: 9000, label: 'High', dpr: 2, pixels: 6e6, aa: true, err: 16, fall: 9, gb: 4.0, tex: 2048, near: 2048, lite: false, px: 4, far: 26000, reach: 16000, kinds: ['bldg', 'brid'],
    terrPx: 1.05, maxZ: 18, aniso: 8, cascades: [320, 1300, 5200], csize: [4096, 4096, 4096], jetShadow: 2048, jet: 'hi', bake: [4096, 2048], parse: 6, down: 18, terrActive: 14, tilesPerFrame: 2, slowMs: 20 },
};
export const ORDER = ['phone', 'low', 'mid', 'high'];

// Which graphics device this window is really drawing with. A browser can quietly fall back to drawing on the
// processor (graphics process crashed, or acceleration switched off); that has to be seen, not guessed at.
export function graphicsDevice() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { powerPreference: 'high-performance' });
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const software = /Basic Render|SwiftShader|llvmpipe|Software|WARP/i.test(raw);
    const m = raw.match(/ANGLE \([^,]*,\s*([^,(]+?)\s*(?:\(0x|Direct3D|,)/);
    return { raw, software, maxTex, name: software ? 'Processor only (no GPU)' : (m ? m[1] : raw).replace(/\s+/g, ' ').trim().slice(0, 34) };
  } catch { return { raw: '', software: false, maxTex: 4096, name: 'unknown' }; }
}

// A first guess from the name of the graphics chip. It only has to be near: the governor below measures the real
// thing. It errs light, because a laptop given too much shows a slide show, and one given too little shows a
// slightly plainer city that the menu can raise.
export function guessTier(raw, env = {}) {
  const { phone = false, tablet = false, mem = 8, cores = 8, software = false } = env;
  if (software || phone || mem <= 4 || cores <= 2) return 'phone';
  if (tablet) return 'low';
  if (/Mali|Adreno|PowerVR|VideoCore/i.test(raw)) return 'phone';                 // a phone chip in something that is not a phone
  if (/Apple/i.test(raw)) return /Apple M\d/.test(raw) ? 'high' : cores >= 8 ? 'mid' : 'low';
  if (/NVIDIA|GeForce|Quadro/i.test(raw)) {
    if (/RTX|Titan|GTX 1[06][678]0|GTX 9[78]0/i.test(raw)) return 'high';
    if (/GTX 1[06][35]0|GTX 9[56]0|Quadro [TP]\d{4}|Quadro M[2-5]\d{3}/i.test(raw)) return 'mid';
    return 'low';                                                                  // MX and GT laptop chips, older and smaller Quadros
  }
  if (/Radeon|AMD/i.test(raw)) {
    if (/RX \d{4}|RX [5-9][7-9]0|RX Vega/i.test(raw)) return 'high';
    if (/RX \d{3}|Radeon Pro|FirePro/i.test(raw)) return 'mid';
    if (/Radeon(\(TM\))? (R\d|HD)/i.test(raw)) return 'phone';                    // built into processors before Ryzen
    return 'low';                                                                  // built into Ryzen: "Radeon Graphics", Vega 3 to 11, 680M, 780M
  }
  if (/Intel/i.test(raw)) {
    if (/Arc(\(TM\))? [AB]\d{3}/i.test(raw)) return 'high';                        // Arc cards
    if (/Iris|\bXe\b|Arc/i.test(raw)) return 'low';                                // Iris, Iris Xe, the Arc graphics inside Core Ultra
    return 'phone';                                                                // HD and UHD Graphics
  }
  return 'low';
}

export function pickTier(Q, GFX) {
  const asked = Q.get('q');
  if (TIERS[asked]) return asked;
  let saved = null, easier = null;
  try { saved = localStorage.getItem('tokyo.tier'); easier = localStorage.getItem('tokyo.easier'); } catch { /* private window */ }
  if (TIERS[saved]) return saved;                                                  // chosen in the menu
  const ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1;
  const phone = /Android.*Mobile|iPhone|iPod/i.test(ua) || (touch && Math.min(screen.width, screen.height) < 600);
  const tablet = !phone && (/iPad|Android/i.test(ua) || (touch && /Macintosh/i.test(ua)));
  const guess = guessTier(GFX.raw, { phone, tablet, software: GFX.software, mem: navigator.deviceMemory || 8, cores: navigator.hardwareConcurrency || 8 });
  // a tier this device could not keep up with last time is not offered to it again
  return TIERS[easier] && ORDER.indexOf(easier) < ORDER.indexOf(guess) ? easier : guess;
}

// What the governor can take away. Two ladders, lightest touch first: pixels, and things to draw.
//   detail: how much bigger a building's error on screen may be before it is refined (fewer, plainer tiles)
//   reach:  how far out building sets are opened      sun, near: the cascaded shadow maps, the aircraft's own
//   every:  the tile tree is walked every nth frame
const RES = [1, 0.86, 0.74, 0.64, 0.55, 0.48];
const GEO = [
  { detail: 1, reach: 1, sun: true, near: true, every: 1 },
  { detail: 1.3, reach: 0.86, sun: true, near: true, every: 1 },
  { detail: 1.65, reach: 0.74, sun: false, near: true, every: 1 },
  { detail: 2.1, reach: 0.64, sun: false, near: true, every: 2 },
  { detail: 2.7, reach: 0.55, sun: false, near: false, every: 2 },
  { detail: 3.4, reach: 0.48, sun: false, near: false, every: 2 },
];
const SCREEN = 16.7;        // a 60 Hz screen; a faster one is not chased

// Holds the frame rate while flying.
//
// Frames arriving late say that something is slow, not what. So when they do, the governor measures what a frame
// really costs here: this page's own time to build it (`work`, every frame) and the wait for the graphics card to
// finish it (`wait`, asked for only on sampled frames, and only while frames are late or detail is reduced, so a
// device that keeps up is never made to wait). Three cases follow:
//   - work + wait is over a screen interval: the page is the cause. Take something away.
//   - it is small but the frames are still late: something else is holding them (a phone in low-power mode shows
//     30 a second whatever is drawn). Nothing is taken away.
//   - detail is reduced and a frame now costs well under the interval: give a step back, and wait twice as long
//     before trying again if it had to be taken away again.
// Where it settles is remembered, so the next flight starts there instead of finding it again.
export class Governor {
  constructor(tier, name, apply) {
    this.tier = tier; this.name = name; this.apply = apply;
    this.res = 0; this.geo = 0; this.trail = [];
    this.ema = SCREEN; this.work = 4; this.wait = 0;  // frame interval, the page's own time, the graphics card's (ms, smoothed)
    this.samples = 0; this.tick = 0;
    this.rate = SCREEN; this.capped = false;          // the interval frames can arrive at
    this.slow = 0; this.room = 0; this.hold = 0; this.sinceUp = 1e9; this.patience = 5;
    this.stuck = 0; this.exhausted = false;           // nothing left to take away and still slow
    this.gain = { res: null, geo: null }; this.last = null;       // what a step of each kind has bought here, as a share of a frame's cost
    this.wasLate = false;
    this.enabled = true; this.log = [];
    try {
      const s = JSON.parse(localStorage.getItem('tokyo.gov') || 'null');
      if (s && s.tier === name) { this.res = Math.min(Math.max(s.res | 0, 0), RES.length - 1); this.geo = Math.min(Math.max(s.geo | 0, 0), GEO.length - 1); }
    } catch { /* private window */ }
    for (let i = 0; i < Math.max(this.res, this.geo); i++) { if (i < this.res) this.trail.push('res'); if (i < this.geo) this.trail.push('geo'); }
  }
  get scale() { return RES[this.res]; }
  get detail() { return GEO[this.geo].detail; }
  get reach() { return GEO[this.geo].reach; }
  get sun() { return GEO[this.geo].sun; }
  get near() { return GEO[this.geo].near; }
  get every() { return GEO[this.geo].every; }
  get steps() { return this.res + this.geo; }
  get most() { return RES.length + GEO.length - 2; }
  get cost() { return this.work + this.wait; }      // what a frame takes to make, start to finish

  changed(why) {
    this.hold = 0.9; this.samples = 0; this.slow = 0; this.room = 0;
    this.log.push(`${why} -> pixels ${this.res}, things ${this.geo} (frame ${this.ema.toFixed(0)} ms: own ${this.work.toFixed(0)}, card ${this.wait.toFixed(0)})`); if (this.log.length > 40) this.log.shift();
    try { localStorage.setItem('tokyo.gov', JSON.stringify({ tier: this.name, res: this.res, geo: this.geo })); } catch { /* private window */ }
    this.apply();
  }

  // Take something away: `n` steps of whichever kind buys more here. Pixels only lighten the graphics card's part;
  // things to draw lighten both. What a step bought is measured and remembered by kind, so a device whose graphics
  // chip is the slow part loses pixels before buildings, and one whose processor is never loses pixels for nothing.
  // Until a kind has been measured the guess is by which of the two parts is the larger.
  down(n = 1, hard = false) {
    if (this.sinceUp < 8) this.patience = Math.min(this.patience * 2, 90);      // what was just given back was too much
    const L = this.last;
    if (L && this.samples >= 3) {
      const g = L.kind === 'res' ? (L.wait - this.wait) / Math.max(L.work + L.wait, 1) : 1 - this.cost / Math.max(L.work + L.wait, 1);
      this.gain[L.kind] = this.gain[L.kind] == null ? g : 0.5 * (this.gain[L.kind] + g);
    }
    this.last = null;
    const cpu = this.work > this.wait * 1.5, gpu = this.wait > this.work * 1.5;
    const guess = cpu ? { geo: 0.15, res: 0 } : gpu ? { res: 0.15, geo: 0.08 } : { res: 0.12, geo: 0.12 };
    const worth = (k) => this.gain[k] ?? guess[k];
    const taken = [];
    for (let i = 0; i < n; i++) {
      const can = { res: this.res < RES.length - 1, geo: this.geo < GEO.length - 1 };
      // a kind that has bought nothing here is left alone, unless frames are still badly late and it is all there is
      // (and even then not pixels where the processor is the slow part)
      let opts = ['res', 'geo'].filter((k) => can[k] && worth(k) >= 0.03);
      if (!opts.length && hard) opts = ['res', 'geo'].filter((k) => can[k] && !(k === 'res' && cpu));
      if (!opts.length) break;
      opts.sort((x, y) => worth(y) - worth(x));
      let step = taken[0] && opts.includes(taken[0]) ? taken[0] : opts[0];
      // worth about the same: take them in turn
      if (!taken.length && opts.length > 1 && worth(opts[0]) - worth(opts[1]) < 0.05 && this.trail[this.trail.length - 1] === step) step = opts[1];
      this[step]++; this.trail.push(step); taken.push(step);
    }
    if (taken.length) { if (taken.every((k) => k === taken[0])) this.last = { kind: taken[0], work: this.work, wait: this.wait }; this.changed('slow'); }
    else this.slow = 0;
    return taken.length;
  }
  up() {
    const step = this.trail.pop(); if (!step) return false;
    this[step]--; this.sinceUp = 0; this.last = null; this.changed('room');
    return true;
  }

  // dt: seconds since the last frame; workMs: time this page spent building the frame; gpuDone(): returns once the
  // graphics card has finished everything sent to it
  frame(dt, workMs, gpuDone) {
    const ms = Math.min(dt * 1000, 120);
    this.ema += (ms - this.ema) * 0.08; this.work += (workMs - this.work) * 0.08;
    this.sinceUp += dt;
    if (!this.enabled) return;
    const late = this.ema > Math.max(this.tier.slowMs, this.rate * 1.3), reduced = this.steps > 0;
    if (this.capped && this.ema < SCREEN * 1.15) { this.capped = false; this.rate = SCREEN; }
    if (late && !this.wasLate) { this.samples = 0; this.tick = 0; }          // a new spell of late frames: measure afresh
    this.wasLate = late;
    if (gpuDone && (late || reduced) && this.tick++ % (late ? 6 : 30) === 0) {
      const t0 = performance.now(); gpuDone();
      const w = performance.now() - t0;
      this.wait = this.samples ? this.wait + (w - this.wait) * 0.35 : w; this.samples++;
    }
    if (this.hold > 0) { this.hold -= dt; return; }
    const budget = this.rate * 0.85;
    if (late) {
      this.slow += dt; this.room = 0;
      if (this.slow > 1.1 && this.samples >= 3) {
        if (this.cost > budget) {
          if (!this.down(this.cost > budget * 2.2 ? 2 : 1, this.cost > budget * 1.6)) {
            // nothing left to take away
            this.stuck += 1.1; if (this.stuck > 8 && this.cost > budget * 1.4) this.exhausted = true;
          }
        } else if (!this.capped || this.ema > this.rate * 1.3) {
          // a frame costs little here and they still arrive late: held back from outside
          this.capped = true; this.rate = Math.min(Math.max(this.ema, SCREEN), 50); this.slow = 0;
          this.log.push(`held to ${this.rate.toFixed(0)} ms from outside (a frame costs ${this.cost.toFixed(0)} ms)`);
        } else this.slow = 0;
      }
    } else {
      this.slow = Math.max(0, this.slow - dt); this.stuck = Math.max(0, this.stuck - dt);
      if (reduced && this.samples >= 2 && this.cost < budget * 0.6) {
        this.room += dt;
        if (this.room > this.patience) this.up();
      } else this.room = 0;
    }
  }
}
