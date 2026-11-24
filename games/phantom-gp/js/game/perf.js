// perf.js — keeps the frame rate up on any device. It measures what a frame costs here, so it needs no list of devices.
//
// Frames arriving late say that something is slow, not what. So when they do, the governor measures what a frame of
// the circuit really costs on this device: the page's own time to build it (`work`, every frame) and the wait for the
// graphics card to finish it (`wait`, asked for only on sampled frames, and only while frames are late or detail is
// reduced, so a device that keeps up is never made to wait). Three cases follow:
//   - work + wait is over a screen interval: the game is the cause. Take something away (main.js decides what each
//     step is): things to draw if the processor is the slow part, pixels if the graphics card is.
//   - it is small but the frames are still late: something else is holding them (a phone in low-power mode is called
//     30 times a second whatever is drawn). Nothing is taken away.
//   - detail is reduced and a frame now costs well under the interval: give a step back, and wait twice as long
//     before trying again if it had to be taken away again.
// Where it settles is remembered, so the next race, and the next visit, start there instead of finding it again.
const SCREEN = 16.7;                              // a 60 Hz screen; a faster one is not chased
export const PIX = [1, 0.86, 0.74, 0.64, 0.55];   // the resolution steps

/* A first guess at the quality level from the name of the graphics chip (not a phone, not software drawing: main.js
   has dealt with those). It only has to be near: the governor measures the real thing and remembers it.
   "High" is for graphics cards. The graphics built into a processor, and the small chips in thin laptops, get
   "medium": before, anything that was not Intel got "high", so a laptop with AMD's built-in graphics or a GeForce MX
   was given the same circuit as a gaming PC. */
export function guessTier(name, mem = 8) {
  if (mem <= 4) return 'medium';
  if (/Mali|Adreno|PowerVR|VideoCore/i.test(name)) return 'medium';
  if (/Apple/i.test(name)) return /Apple M1(?! (Pro|Max|Ultra))/.test(name) ? 'medium' : 'high';      // Safari says only "Apple GPU"
  if (/NVIDIA|GeForce|Quadro/i.test(name)) return /RTX|Titan|GTX 1[06][5-8]0|GTX 9[678]0/i.test(name) ? 'high' : 'medium';      // medium: MX and GT laptop chips, Quadros, older cards
  if (/Radeon|AMD/i.test(name)) return /RX \d{3,4}|RX Vega|Radeon Pro|FirePro/i.test(name) ? 'high' : 'medium';                 // medium: built into the processor
  if (/Intel/i.test(name)) return /Arc(\(TM\))? [AB]\d{3}/i.test(name) ? 'high' : 'medium';                                      // high: Arc cards
  return 'medium';
}

export class Governor {
  // apply(): put this.geo (0..geoMax) and this.scale into effect.  o: { geoMax, touch, key (what the memory belongs to) }
  constructor(apply, o = {}) {
    this.apply = apply; this.geoMax = o.geoMax ?? 4; this.touch = !!o.touch; this.key = o.key || '';
    this.geo = 0; this.px = 0; this.trail = [];
    this.avg = 14; this.work = 4; this.wait = 0; this.samples = 0; this.tick = 0;      // frame interval, own time, the card's (ms, smoothed)
    this.cool = 3; this.t = 0; this.enabled = true;
    this.refresh = SCREEN; this.seen = -1; this.probe = []; this.run = 0; this.runMax = 0;
    this.held = 0;                                // the interval something outside is holding frames to (0: nothing is)
    this.room = 0; this.patience = 4; this.sinceUp = 1e9; this.stuck = 0; this.exhausted = false; this.wasLate = false;
    this.gain = { geo: null, px: null }; this.last = null;      // what a step of each kind has bought here, as a share of a frame's cost
    this.log = [];
    try {
      const s = JSON.parse(localStorage.getItem('phantom.gov') || 'null');
      if (s && s.key === this.key) { this.geo = Math.min(Math.max(s.geo | 0, 0), this.geoMax); this.px = Math.min(Math.max(s.px | 0, 0), PIX.length - 1); this.remembered = true; }
    } catch (e) { /* private window */ }
    for (let i = 0; i < Math.max(this.geo, this.px); i++) { if (i < this.geo) this.trail.push('geo'); if (i < this.px) this.trail.push('px'); }
  }
  get scale() { return PIX[this.px]; }
  get step() { return this.geo + this.px; }
  get steps() { return this.geoMax + PIX.length - 1; }
  get cost() { return this.work + this.wait; }    // what a frame takes to make, start to finish

  /* How often the screen itself calls the page (this.refresh, ms). Called for every frame, whatever is on screen.
     A phone in low-power mode is called 30 times a second however little is drawn. Stepping the quality down cannot
     change that, so those frames must not count as slow: the ladder would run to the bottom for nothing.
     The first seven intervals come from frames that draw nothing (main.js holds them back), so they time the screen
     and not the game; the middle one of them is the screen's interval (the page is still starting up, so one or two
     can be late or early). After that only a run of four quicker frames can lower it: one early frame is jitter,
     four in a row is a screen that really goes that fast.
     Only a touch device's figure is used (see sample): on a slow laptop those first frames wait on the page's own
     start-up, and what this learns there is how slow the laptop is, not how slow its screen is. */
  see(dt) {
    const ms = dt * 1000;
    if (this.seen < 0) { this.seen = 0; return; }                 // the first call's interval is from page script, not from the screen
    if (!(ms > 2 && ms < 250)) return;
    if (this.seen < 7) { this.probe.push(ms); if (++this.seen === 7) this.refresh = this.probe.sort((a, b) => a - b)[3]; return; }
    if (ms < this.refresh * 0.85) { this.runMax = Math.max(this.runMax, ms); if (++this.run >= 4) { this.refresh = this.runMax; this.run = 0; this.runMax = 0; } }
    else { this.run = 0; this.runMax = 0; }
  }

  changed(why) {
    this.cool = 1.0; this.samples = 0; this.room = 0;
    this.log.push(`${why} -> things ${this.geo}, pixels ${this.px} (frame ${this.avg.toFixed(0)} ms: own ${this.work.toFixed(0)}, card ${this.wait.toFixed(0)})`); if (this.log.length > 40) this.log.shift();
    try { localStorage.setItem('phantom.gov', JSON.stringify({ key: this.key, geo: this.geo, px: this.px })); } catch (e) { /* private window */ }
    this.apply();
  }

  // Take something away: `n` steps of whichever kind buys more here. Pixels only lighten the graphics card's part;
  // things to draw lighten both. What a step bought is measured and remembered by kind. Until a kind has been
  // measured the guess is by which of the two parts is the larger. `hard`: frames are still badly late.
  down(n = 1, hard = false) {
    if (this.sinceUp < 8) this.patience = Math.min(this.patience * 2, 90);       // what was just given back was too much
    const L = this.last;
    if (L && this.samples >= 3) {
      const g = L.kind === 'px' ? (L.wait - this.wait) / Math.max(L.work + L.wait, 1) : 1 - this.cost / Math.max(L.work + L.wait, 1);
      this.gain[L.kind] = this.gain[L.kind] == null ? g : 0.5 * (this.gain[L.kind] + g);
    }
    this.last = null;
    const cpu = this.work > this.wait * 1.5, gpu = this.wait > this.work * 1.5;
    const guess = cpu ? { geo: 0.15, px: 0 } : gpu ? { px: 0.15, geo: 0.1 } : { px: 0.12, geo: 0.12 };
    const worth = (k) => this.gain[k] ?? guess[k];
    const taken = [];
    for (let i = 0; i < n; i++) {
      const can = { px: this.px < PIX.length - 1, geo: this.geo < this.geoMax };
      // a kind that has bought nothing here is left alone, unless frames are still badly late and it is all there is
      // (and even then not pixels where the processor is the slow part)
      let opts = ['px', 'geo'].filter((k) => can[k] && worth(k) >= 0.03);
      if (!opts.length && hard) opts = ['px', 'geo'].filter((k) => can[k] && !(k === 'px' && cpu));
      if (!opts.length) break;
      opts.sort((x, y) => worth(y) - worth(x));
      let step = taken[0] && opts.includes(taken[0]) ? taken[0] : opts[0];
      // worth about the same: take them in turn
      if (!taken.length && opts.length > 1 && worth(opts[0]) - worth(opts[1]) < 0.05 && this.trail[this.trail.length - 1] === step) step = opts[1];
      this[step]++; this.trail.push(step); taken.push(step);
    }
    if (taken.length) { if (taken.every((k) => k === taken[0])) this.last = { kind: taken[0], work: this.work, wait: this.wait }; this.changed('slow'); }
    return taken.length;
  }
  up() {
    const step = this.trail.pop(); if (!step) return false;
    this[step]--; this.sinceUp = 0; this.last = null; this.changed('room');
    return true;
  }

  /* Before the first race: the circuit's first frames have just been drawn off screen, and timed. If one of them
     already costs more than a screen interval, start part of the way down instead of finding that out during the
     race. (Those frames leave out the bloom and the final pass, so this errs high; the race corrects it either way.) */
  prime(work, wait) {
    if (!this.enabled || this.remembered) return;
    this.work = work; this.wait = wait; this.samples = 3;
    const need = (work + wait) / (SCREEN * 0.85);
    let n = need > 5 ? this.steps : need > 3.4 ? 6 : need > 2.6 ? 5 : need > 2.0 ? 4 : need > 1.6 ? 3 : need > 1.3 ? 2 : need > 1.1 ? 1 : 0;
    const apply = this.apply; this.apply = () => {};
    while (n-- > 0 && this.down(1, true)) { this.samples = 3; this.last = null; }
    this.apply = apply; this.last = null; this.samples = 0; this.work = 4; this.wait = 0;
    if (this.step) this.apply();
  }

  // dt: real time between frames (s); workMs: the page's own time for this frame; gpuDone(): returns once the graphics
  // card has finished everything sent to it. Only frames that draw the circuit are sampled (main.js).
  sample(dt, workMs = 0, gpuDone = null) {
    if (!this.enabled || dt <= 0) return;
    // One long frame is a hitch, not the frame rate (another program taking the processor for a moment, a tab that
    // was out of sight): it counts for no more than twice the running average. Frames that stay long still move
    // the average within a few frames. (Frames over a quarter of a second used to be left out altogether, as
    // hitches. A laptop drawing the circuit at three frames a second was then never helped at all.)
    const ms = Math.min(dt * 1000, this.avg * 2 + 4);
    dt = Math.min(dt, 0.25);
    this.avg += (ms - this.avg) * 0.06; this.work += (Math.min(workMs, this.work * 2 + 4) - this.work) * 0.06;
    this.t += dt; this.cool -= dt; this.sinceUp += dt;
    // the screen's own interval: a touch device's as `see` found it; anything else is taken as 60 a second
    const base = this.touch ? Math.max(SCREEN, this.refresh) : SCREEN;
    if (this.held && this.avg < base * 1.15) this.held = 0;
    const rate = Math.max(base, this.held), budget = rate * 0.85;
    // late = missing that rate by a third or more, and never stricter than 46 frames a second
    const late = this.avg > Math.max(21.5, rate * 1.3), reduced = this.step > 0;
    if (late && !this.wasLate) { this.samples = 0; this.tick = 0; }           // a new spell of late frames: measure afresh
    this.wasLate = late;
    if (gpuDone && (late || reduced) && this.tick++ % (late ? (this.avg > 45 ? 3 : 6) : 45) === 0) {
      const t0 = performance.now(); gpuDone();
      const w = performance.now() - t0;
      // (one long wait is a hitch, as one long frame is: it counts for no more than twice the running figure)
      this.wait = this.samples ? this.wait + (Math.min(w, this.wait * 2 + 4) - this.wait) * 0.35 : w; this.samples++;
    }
    if (this.cool > 0 || this.t < 0.7) return;
    if (late) {
      this.room = 0;
      if (gpuDone && this.samples < 3) return;
      if (!gpuDone || this.cost > budget) {
        if (!this.down(this.cost > budget * 2.2 ? 2 : 1, this.cost > budget * 1.6)) {
          this.cool = 1.0; this.stuck += 1.0;                                 // nothing left to take away
          if (this.stuck > 8 && this.avg > 30) this.exhausted = true;      // under 33 frames a second with nothing left to give up
        }
      } else if (!this.held || this.avg > this.held * 1.3) {
        // a frame costs little here and they still arrive late: held back from outside
        this.held = Math.min(this.avg, 50);
        this.log.push(`held to ${this.held.toFixed(0)} ms from outside (a frame costs ${this.cost.toFixed(0)} ms)`);
      }
    } else {
      this.stuck = Math.max(0, this.stuck - dt);
      // room to give a step back: the step is worth about an eighth of a frame, so after it the cost must still fit
      if (reduced && this.samples >= 2 && this.cost < budget * 0.78) { this.room += dt; if (this.room > this.patience) this.up(); }
      else this.room = Math.max(0, this.room - dt * 2);
    }
  }
  reset() { this.avg = 14; this.cool = 1.2; this.t = 0; this.samples = 0; this.tick = 0; this.wasLate = false; this.room = 0; }
}
