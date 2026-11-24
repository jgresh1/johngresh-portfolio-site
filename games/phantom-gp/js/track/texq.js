// texq.js — the drawn textures, painted off the page's own thread.
//
// Every ground, tree and wall texture here is drawn stroke by stroke (tex.js, treetex.js): about three seconds of
// work on a desktop, three or four times that on a laptop or a tablet. Done on the page it stopped the page: the
// car on the title screen stood still and no button answered until the circuit was built.
//
// So the painters run in background workers (texworker.js). A call here hands back its textures at once, empty; the
// worker paints, sends the picture, and the texture is filled in. Nothing may read a texture's pixels, or draw the
// circuit, before then: `painted(...)` waits for particular textures, `settled()` for all of them.
// Where workers cannot paint (an old browser), a call paints on the spot, as it always did.
import * as TEX from './tex.js';
import * as TREE from './treetex.js';

// what each painter hands to toTex for each texture it returns ($ = it returns a single texture)
const C = { srgb: true }, N = {}, PBR = { map: { srgb: true, aniso: 8 }, normalMap: { aniso: 8 }, orm: { aniso: 8 } }, LEAF = { $: { srgb: true, repeat: false, aniso: 8 } };
const SHAPE = {
  asphaltMaps: { map: C, normalMap: N }, grassMaps: { map: C, normalMap: N }, gravelMaps: { map: C, normalMap: N }, armcoMaps: { map: C, normalMap: N },
  noiseTex: { $: { aniso: 4 } }, steelTex: { $: C }, fenceTex: { $: { srgb: true, aniso: 16 } }, leafTex: LEAF, spruceAtlas: LEAF, leafAtlas: LEAF,
  barkMaps: { map: { srgb: true, aniso: 8 }, normalMap: { aniso: 8 } },
  curtainWallMaps: PBR, shutterMaps: PBR, panelMaps: PBR, concreteMaps: PBR, renderMaps: PBR, brickMaps: PBR, claddingMaps: PBR, slateMaps: PBR,
};
const paintHere = (fn, args) => (TEX[fn] || TREE[fn])(...args);

let pool = null, nextId = 1, outstanding = 0;
const jobs = new Map(), waiters = [], held = new Map();
const done = () => { if (--outstanding === 0) for (const w of waiters.splice(0)) w(); };

function workers() {
  if (pool) return pool;
  pool = [];
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || new URLSearchParams(location.search).has('noworker')) return pool;
    const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./texworker.js', import.meta.url), { type: 'module' });
      w.load = 0; w.onmessage = (e) => reply(w, e.data); w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); giveUp(); };
      pool.push(w);
    }
  } catch (e) { pool = []; }
  return pool;
}
// the workers cannot do it after all: paint everything still waiting here, and everything from now on
function giveUp() {
  for (const w of pool || []) { try { w.terminate(); } catch (e) { /* gone */ } }
  pool = [];
  for (const [id, j] of [...jobs]) { jobs.delete(id); finishHere(j); }
}
function finishHere(j) {
  try {
    const r = paintHere(j.fn, j.args);
    if (j.data) j.resolve(r);                                  // (cloudNoiseData: the array itself)
    else { const real = j.single ? { $: r } : r; for (const k in j.texs) { const t = j.texs[k], src = real[k]; t.image = src.image; t.premultiplyAlpha = src.premultiplyAlpha; t.needsUpdate = true; src.image = null; src.dispose(); } j.resolve(); }
  } catch (e) { console.error('texture', j.fn, e); j.resolve(j.data ? null : undefined); }
  done();
}
function reply(w, m) {
  const j = jobs.get(m.id); if (!j) return;
  jobs.delete(m.id); w.load--;
  if (m.error) { console.warn('texture worker:', j.fn, m.error); jobs.set(m.id, j); giveUp(); return; }
  if (j.data) { j.resolve(m.data); done(); return; }
  for (const k in j.texs) {
    const t = j.texs[k], o = m.maps[k];
    const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
    c.getContext('2d', { willReadFrequently: true }).drawImage(o.bitmap, 0, 0); o.bitmap.close();
    t.image = c; Object.assign(t, o.extra); if (o.mean) t.userData.mean = o.mean;
    const want = SHAPE[j.fn][k], got = o.opts;
    if (!!want.srgb !== !!got.srgb || (want.repeat !== false) !== (got.repeat !== false) || (want.aniso ?? 16) !== got.aniso) console.warn('texq: settings for', j.fn, k, 'differ from the painter\'s', want, got);
    t.needsUpdate = true;
  }
  j.resolve(); done();
}
function send(j) {
  const W = workers(), id = nextId++;
  outstanding++;
  if (!W.length) { Promise.resolve().then(() => finishHere(j)); return; }
  const w = W.reduce((a, b) => (b.load < a.load ? b : a));
  w.load++; jobs.set(id, j);
  w.postMessage({ id, fn: j.fn, args: j.args, mean: !!j.mean });
}

function request(fn, args, o = {}) {
  const key = fn + JSON.stringify(args), had = held.get(key);
  if (had && !o.hold) { held.delete(key); return had; }
  const shape = SHAPE[fn], single = '$' in shape, texs = {};
  if (!workers().length) return paintHere(fn, args);            // no workers here: painted on the spot
  let resolve; const p = new Promise((r) => { resolve = r; });
  for (const k in shape) { const [c] = TEX.canvas(1, 1), t = TEX.toTex(c, shape[k]); t.userData.painted = p; texs[k] = t; }
  send({ fn, args, texs, single, mean: o.mean, resolve });
  const out = single ? texs.$ : texs;
  if (o.hold) held.set(key, out);
  return out;
}

// resolves when these textures (or objects of textures) have their pictures
export const painted = (...list) => Promise.all(list.flatMap((t) => (t && t.isTexture ? [t] : Object.values(t || {}))).map((t) => (t && t.userData && t.userData.painted) || null));
// run fn once those textures have their pictures; settled() waits for it too
export function whenPainted(list, fn) { outstanding++; painted(...list).then(fn).catch((e) => console.error(e)).finally(done); }
// resolves when nothing is being painted and nothing is waiting on a painting
export const settled = () => (outstanding ? new Promise((r) => waiters.push(r)) : Promise.resolve());
/* Start painting now what a builder will ask for later, so the workers are busy from the first moment instead of
   idle until the builder's turn. The builder's own call (same painter, same arguments) then picks the result up. */
export function preheat(list) { if (!workers().length) return; for (const [fn, args = [], o = {}] of list) request(fn, args, { ...o, hold: true }); }

export const asphaltMaps = (...a) => request('asphaltMaps', a), grassMaps = (...a) => request('grassMaps', a), gravelMaps = (...a) => request('gravelMaps', a);
export const noiseTex = (...a) => request('noiseTex', a), steelTex = (...a) => request('steelTex', a), fenceTex = (...a) => request('fenceTex', a), armcoMaps = (...a) => request('armcoMaps', a);
export const curtainWallMaps = (...a) => request('curtainWallMaps', a), shutterMaps = (...a) => request('shutterMaps', a), panelMaps = (...a) => request('panelMaps', a), concreteMaps = (...a) => request('concreteMaps', a);
export const renderMaps = (...a) => request('renderMaps', a), brickMaps = (...a) => request('brickMaps', a), claddingMaps = (...a) => request('claddingMaps', a), slateMaps = (...a) => request('slateMaps', a);
// (the tree textures bring the mean colour of their opaque pixels: trees.js balances the species with it)
export const leafTex = (...a) => request('leafTex', a, { mean: true }), spruceAtlas = (...a) => request('spruceAtlas', a, { mean: true }), leafAtlas = (...a) => request('leafAtlas', a, { mean: true });
export const barkMaps = (...a) => request('barkMaps', a);
export const TREES = [['spruceAtlas', [], { mean: true }], ['leafTex', [], { mean: true }], ['leafAtlas', [], { mean: true }], ['leafAtlas', [1024, { seed: 431, leaf: 0.78, narrow: 1.15, hue: 0.5 }], { mean: true }], ['barkMaps', ['spruce']], ['barkMaps', ['beech']], ['barkMaps', ['birch']]];
export const GROUND = [['grassMaps'], ['asphaltMaps'], ['gravelMaps'], ['noiseTex']];

// the sky's 3D cloud noise: the numbers from a worker, the texture made here
export function cloudNoise3D(S = 64) {
  if (!workers().length) return Promise.resolve(TEX.cloudNoise3D(S));
  return new Promise((resolve) => send({ fn: 'cloudNoiseData', args: [S], data: true, resolve })).then((data) => (data ? TEX.cloudNoise3D(S, data) : TEX.cloudNoise3D(S)));
}
