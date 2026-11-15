// perf.js — keeps the frame rate up on any device. It measures real frame times, so it needs no list of devices.
// When frames run long it takes the next step down a ladder (main.js decides what each step is: fewer detailed
// trees, a lower render resolution, no bloom, ...). When there is room to spare it raises the resolution again.
export class Governor {
  constructor(q, apply, steps) {
    this.apply = apply; this.steps = steps; this.avg = 14; this.step = 0; this.scale = 1; this.cool = 3; this.n = 0; this.enabled = true;
    this.quiet = 0; this.lock = 0; this.raised = null;
  }
  // dt: real time between frames (s)
  sample(dt) {
    if (!this.enabled || dt <= 0 || dt > 0.25) return;        // tab switches and loading hitches are not the frame rate
    this.avg += (dt * 1000 - this.avg) * 0.06; this.n++; this.cool -= dt; this.quiet += dt; this.lock -= dt;
    if (this.cool > 0 || this.n < 40) return;
    if (this.avg > 21.5) {
      this.quiet = 0;
      if (this.raised !== null) { this.scale = this.raised; this.raised = null; this.lock = 60; this.apply('scale', this.scale); }   // the last raise cost frames: undo it
      else if (this.step < this.steps) { this.step++; this.apply('step', this.step); }
      this.cool = 1.6; this.avg = 17;
    } else if (this.avg < 17.6 && this.scale < 1 && this.quiet > 20 && this.lock <= 0) {
      // 60 Hz screens never report less than 16.7 ms, so try a step up in resolution and take it back if it costs frames
      this.raised = this.scale; this.scale = Math.min(1, this.scale * 1.08); this.apply('scale', this.scale); this.cool = 3; this.quiet = 12;
    } else if (this.raised !== null && this.quiet > 16) this.raised = null;
  }
  reset() { this.avg = 14; this.cool = 2; this.n = 0; }
}
