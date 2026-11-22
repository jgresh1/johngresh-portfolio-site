// perf.js — keeps the frame rate up on any device. It measures real frame times, so it needs no list of devices.
// When frames run long it takes the next step down a ladder (main.js decides what each step is: fewer detailed
// trees, a lower render resolution, no bloom, ...). When there is room to spare it raises the resolution again.
export class Governor {
  constructor(q, apply, steps) {
    this.apply = apply; this.steps = steps; this.avg = 14; this.step = 0; this.scale = 1; this.cool = 3; this.n = 0; this.enabled = true;
    this.quiet = 0; this.lock = 0; this.raised = null;
    this.refresh = 16.7; this.seen = -1; this.probe = []; this.run = 0; this.runMax = 0;
  }
  /* How often the screen itself calls the page (this.refresh, ms). Called for every frame, whatever is on screen.
     A phone in low-power mode is called 30 times a second however little is drawn. Stepping the quality down cannot
     change that, so those frames must not count as slow: the ladder would run to the bottom for nothing.
     The first seven intervals come from frames that draw nothing (main.js holds them back), so they time the screen
     and not the game; the middle one of them is the screen's interval (the page is still starting up, so one or two
     can be late or early). After that only a run of four quicker frames can lower it: one early frame is jitter,
     four in a row is a screen that really goes that fast. */
  see(dt) {
    const ms = dt * 1000;
    if (this.seen < 0) { this.seen = 0; return; }                 // the first call's interval is from page script, not from the screen
    if (!(ms > 2 && ms < 250)) return;
    if (this.seen < 7) { this.probe.push(ms); if (++this.seen === 7) this.refresh = this.probe.sort((a, b) => a - b)[3]; return; }
    if (ms < this.refresh * 0.85) { this.runMax = Math.max(this.runMax, ms); if (++this.run >= 4) { this.refresh = this.runMax; this.run = 0; this.runMax = 0; } }
    else { this.run = 0; this.runMax = 0; }
  }
  // dt: real time between frames (s). Only frames that draw the circuit are sampled (main.js).
  sample(dt) {
    if (!this.enabled || dt <= 0 || dt > 0.25) return;        // tab switches and loading hitches are not the frame rate
    // slow = missing the screen's own rate by a third or more, and never stricter than 46 frames a second
    const slow = Math.max(21.5, this.refresh * 1.3), fast = Math.max(17.6, this.refresh * 1.06);
    // One long frame is a hitch, not the frame rate (another program taking the processor for a moment): it counts
    // for no more than twice the running average. Frames that stay long still move the average within a few frames.
    const ms = Math.min(dt * 1000, this.avg * 2 + 4);
    this.avg += (ms - this.avg) * 0.06; this.n++; this.cool -= dt; this.quiet += dt; this.lock -= dt;
    if (this.cool > 0 || this.n < 40) return;
    if (this.avg > slow) {
      this.quiet = 0;
      if (this.raised !== null) { this.scale = this.raised; this.raised = null; this.lock = 60; this.apply('scale', this.scale); }   // the last raise cost frames: undo it
      else if (this.step < this.steps) { this.step++; this.apply('step', this.step); }
      this.cool = 1.6; this.avg = slow * 0.8;
    } else if (this.avg < fast && this.scale < 1 && this.quiet > 20 && this.lock <= 0) {
      // a screen never reports less than its own interval, so try a step up in resolution and take it back if it costs frames
      this.raised = this.scale; this.scale = Math.min(1, this.scale * 1.08); this.apply('scale', this.scale); this.cool = 3; this.quiet = 12;
    } else if (this.raised !== null && this.quiet > 16) this.raised = null;
  }
  reset() { this.avg = 14; this.cool = 2; this.n = 0; }
}
