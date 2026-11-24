// slice.js — the page stays alive while the circuit is built.
//
// Building the circuit is seconds of work for the processor. Done in one run, the page can draw nothing and answer
// nothing until it ends: the car on the title screen stands still and no button responds. So the builders stop every
// few milliseconds, let the page draw a frame and take whatever was clicked, and carry on:
//
//     for (...) { if (due()) await breathe(); ... }
//
// SLICE.ms is how long they work between two frames. 20 ms leaves the title about thirty frames a second on a 60 Hz
// screen. A tab that is not showing draws no frames, so there the builders only step aside for a moment and run on.
export const SLICE = { on: false, ms: 20 };
let until = 0;
const ch = new MessageChannel(); let wake = null;
ch.port1.onmessage = () => { const w = wake; wake = null; if (w) w(); };
const hop = () => new Promise((r) => { const prev = wake; wake = () => { if (prev) prev(); r(); }; ch.port2.postMessage(0); });      // back of the task queue (not held back in a hidden tab, as timers are)

// time to let the page have a frame?
export const due = () => SLICE.on && performance.now() >= until;
// the same question from a loop that turns thousands of times a millisecond: it looks at the clock one turn in 256
let turns = 0;
export const dueN = () => SLICE.on && (++turns & 255) === 0 && performance.now() >= until;
// let it: resolves after the next frame has been drawn and shown
export async function breathe() {
  if (!SLICE.on) return;
  if (typeof document !== 'undefined' && !document.hidden) await new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => hop().then(go)); setTimeout(go, 150); });
  else await hop();
  until = performance.now() + SLICE.ms;
}
