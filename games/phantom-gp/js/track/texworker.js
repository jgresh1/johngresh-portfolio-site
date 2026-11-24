// texworker.js — paints one drawn texture at a time for the page (see texq.js), with the very code the page would use.
// A job names a painter in tex.js or treetex.js and gives its arguments; the answer is each painted canvas as a
// bitmap (handed over, not copied), the settings the painter asked for, and where wanted the mean colour of its
// opaque pixels.
import * as TEX from './tex.js';
import * as TREE from './treetex.js';

const FN = { ...TEX, ...TREE };
self.onmessage = (e) => {
  const { id, fn, args, mean } = e.data;
  try {
    const r = FN[fn](...args);
    if (r instanceof Uint8Array) { self.postMessage({ id, data: r }, [r.buffer]); return; }
    const maps = r && r.isTexDesc ? { $: r } : r, out = {}, give = [];
    for (const k in maps) {
      const d = maps[k], cv = d.canvas, extra = {};
      for (const p in d) if (p !== 'isTexDesc' && p !== 'canvas' && p !== 'opts') extra[p] = d[p];      // what the painter set on its texture afterwards
      const o = { w: cv.width, h: cv.height, opts: d.opts, extra };
      if (mean) o.mean = TREE.meanOpaque(d);
      o.bitmap = cv.transferToImageBitmap(); give.push(o.bitmap); out[k] = o;
    }
    self.postMessage({ id, maps: out }, give);
  } catch (err) { self.postMessage({ id, error: String((err && err.message) || err) }); }
};
