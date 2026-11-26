// baked.js — the built-in city: every building of the 23 wards from files made for this game (tools/city).
//
// The survey's own tiles are made for a planning viewer; streamed as they are, a first view asks for hundreds of
// megabytes and a laptop never gets through them. Here the city is 1 km squares of small files on this site:
//   a  what shows from far: the larger blocks and the landmarks in their surveyed shape   (loaded out to `reach`)
//   b  every other building as a block                                                    (loaded where they would show)
//   r  bridges                                                                            (loaded within a few km)
// A first view over the bay is about 22 MB and is read off the main thread (baked.worker.js).
// Inside a square the buildings are in order of size, so a far square draws only its largest: how small a
// building may look on screen before it is left out is `px` (pixels on a 1000-pixel-tall screen).
// It answers to the same names as City (city.js), so the flight page can use either.
import * as THREE from 'three';
import { patch } from './atmo.js';
import { PLAIN } from './city.js';

const FOCAL = 960;                 // pixels per radian-ish on the 1000-pixel screen detail is judged against (55 degree lens)

export class BakedCity {
  constructor({ renderer, camera, base, px = 9, reach = 9000, shadows = true, onChange = () => {}, jobs = 6, perFrame = () => 2, bridgeReach = 5000 }) {
    this.renderer = renderer; this.camera = camera; this.base = base; this.onChange = onChange; this.castShadows = shadows;
    this.px = px; this.detail = 1; this.reach = reach; this.bridgeReach = bridgeReach; this.jobs = jobs; this.perFrame = perFrame;
    this.group = new THREE.Group(); this.group.name = 'city';
    this.bridges = new THREE.Group(); this.bridges.name = 'bridges'; this.group.add(this.bridges);
    this.sets = [];                                    // (the streamed city's list; empty here)
    this.stats = { buildings: 0, tiles: 0, open: 0, bytes: 0, failed: 0 };
    this.eyeHeight = 1e9; this.errorTarget = 0;        // (set by the page for the streamed city; not used here)
    this.cells = new Map(); this.index = null; this.unit = 0.04; this.size = 1000; this.farH = 18;
    this.busy = 0; this.ready = []; this.queue = []; this.wanted = 0; this.at = new THREE.Vector3(1e9, 0, 1e9); this.key = '';
    this.mats = null; this.jobsById = new Map(); this.nextId = 1;
    this.hold = false;                                 // set by the page while the hangar is on screen, so squares are not shown faster than they are drawn (app.js, warm)
    this.workers = [0, 1].map(() => { const w = new Worker(new URL('./baked.worker.js', import.meta.url), { type: 'module' }); w.onmessage = (e) => this.arrived(e.data); w.onerror = (e) => console.warn('city worker', e.message); return w; });
    fetch(base + 'index.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((ix) => {
      this.index = ix; this.unit = ix.unit; this.size = ix.cell; this.farH = ix.farHeight;
      for (const [k, row] of Object.entries(ix.cells)) { const [ix_, iz_] = k.split('_').map(Number); this.cells.set(k, { k, cx: (ix_ + 0.5) * ix.cell, cz: (iz_ + 0.5) * ix.cell, row, a: null, b: null, r: null, d: 1e9 }); }
      this.stats.open = 1;
    }).catch((e) => { console.warn('city index', e.message || e); this.stats.failed++; });
  }

  materials() {
    if (this.mats) return this.mats;
    // the block look of the streamed city (city.js), with the heights and the seed unpacked from whole numbers
    const unpack = `vBld = aBld * vec3( ${this.unit.toFixed(4)}, ${this.unit.toFixed(4)}, 1.0 / 65535.0 );`;
    const make = (kind) => { const m = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), 'bk-' + kind, { ...PLAIN[kind], vert: unpack }); m.dispose = () => {}; return m; };
    return (this.mats = { bldg: make('bldg'), brid: make('brid') });
  }

  // how far away a file of each kind is wanted
  radius(band) {
    if (band === 'a') return this.reach;
    if (band === 'r') return Math.min(this.reach, this.bridgeReach);
    return Math.min(this.reach, (this.farH * FOCAL) / (this.px * this.detail) + 150);      // b: out to where its largest building would show
  }

  update() {
    if (!this.index) return;
    const cam = this.camera.position, S = this.size / 2;
    const key = `${this.reach.toFixed(0)}|${(this.px * this.detail).toFixed(2)}`;
    const moved = Math.hypot(cam.x - this.at.x, cam.z - this.at.z);
    if (moved > 120 || key !== this.key) {
      this.at.copy(cam); this.key = key;
      const R = { a: this.radius('a'), b: this.radius('b'), r: this.radius('r') }, col = { a: 4, b: 5, r: 6 };
      const want = []; let gone = false;
      for (const c of this.cells.values()) {
        c.d = Math.hypot(Math.max(Math.abs(cam.x - c.cx) - S, 0), Math.max(Math.abs(cam.z - c.cz) - S, 0));
        for (const band of ['a', 'r', 'b']) {
          if (!c.row[col[band]]) continue;
          const have = c[band];
          if (c.d < R[band]) { if (!have) want.push({ c, band, d: c.d + (band === 'b' ? 0 : -400) }); }
          else if (have && have !== 'loading' && have !== 'failed' && c.d > R[band] * 1.3 + 600) { this.drop(c, band); gone = true; }
        }
      }
      want.sort((x, y) => x.d - y.d);
      this.queue = want; this.wanted = want.length;
      if (gone) this.onChange();
    }
    while (this.busy < this.jobs && this.queue.length) this.load(this.queue.shift());
    // squares that have arrived go into the scene a few a frame
    let n = this.hold ? 0 : this.perFrame(), added = false;
    while (n-- > 0 && this.ready.length) { this.show(this.ready.shift()); added = true; }
    if (added) this.onChange();
    this.cut(cam);
  }

  load({ c, band }) {
    if (c[band]) return;
    c[band] = 'loading'; this.busy++;
    const id = this.nextId++; this.jobsById.set(id, { c, band, tries: 0 });
    this.workers[id % this.workers.length].postMessage({ id, url: `${this.base}${c.k}.${band}.bin.gz`, ox: c.cx, oz: c.cz, unit: this.unit });
  }

  arrived(m) {
    const job = this.jobsById.get(m.id); if (!job) return;
    const { c, band } = job;
    if (!m.ok) {
      // a dropped connection gets two more goes; after that the square is left out and not waited for
      if (++job.tries <= 2) { setTimeout(() => this.workers[m.id % this.workers.length].postMessage({ id: m.id, url: `${this.base}${c.k}.${band}.bin.gz`, ox: c.cx, oz: c.cz, unit: this.unit }), 700 * job.tries); return; }
      this.jobsById.delete(m.id); this.busy--; c[band] = 'failed'; this.stats.failed++; console.warn('city', c.k, band, m.error); return;
    }
    this.jobsById.delete(m.id); this.busy--;
    if (c[band] !== 'loading') return;                 // no longer wanted
    this.ready.push({ c, band, m });
  }

  show({ c, band, m }) {
    if (c[band] !== 'loading') return;
    const g = new THREE.BufferGeometry();
    const attr = (arr, n, norm) => { const a = new THREE.BufferAttribute(arr, n, norm); a.onUpload(function () { this.array = null; }); return a; };       // once on the graphics card the copy here is not needed
    g.setAttribute('position', attr(m.position, 3, false)); g.setAttribute('normal', attr(m.normal, 3, true)); g.setAttribute('aBld', attr(m.bld, 3, false));
    g.setIndex(attr(m.index, 1, false));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(...m.lo), new THREE.Vector3(...m.hi)); g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mats = this.materials(), mesh = new THREE.Mesh(g, band === 'r' ? mats.brid : mats.bldg);
    mesh.position.set(c.cx, 0, c.cz); mesh.scale.setScalar(this.unit); mesh.updateMatrixWorld(true); mesh.matrixAutoUpdate = false;
    mesh.castShadow = this.castShadows; mesh.receiveShadow = true;
    mesh.userData = { ends: m.ends, scores: m.scores, count: m.ends.length, drawn: -1, total: m.index.length };
    (band === 'r' ? this.bridges : this.group).add(mesh);
    c[band] = mesh; this.stats.tiles++; this.stats.bytes += m.position.byteLength + m.normal.byteLength + m.bld.byteLength + m.index.byteLength;
  }

  drop(c, band) {
    const mesh = c[band]; c[band] = null;
    if (!mesh || !mesh.isMesh) return;
    mesh.parent?.remove(mesh); mesh.geometry.dispose(); this.stats.tiles--;
  }

  // draw only the buildings of each square that are large enough to see from here
  cut(cam) {
    const S = this.size / 2, k = (this.px * this.detail) / FOCAL * 10;        // scores are in tenths of a metre
    let n = 0;
    for (const c of this.cells.values()) {
      if (!c.a?.isMesh && !c.b?.isMesh) continue;
      const d = Math.hypot(Math.max(Math.abs(cam.x - c.cx) - S, 0), Math.max(Math.abs(cam.z - c.cz) - S, 0), Math.max(cam.y - 60, 0) * 0.5), min = d * k;
      for (const mesh of [c.a, c.b]) {
        if (!mesh?.isMesh) continue;
        const u = mesh.userData, sc = u.scores;
        let lo = 0, hi = u.count;                     // how many are at least `min` (they are in falling order)
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sc[mid] >= min) lo = mid + 1; else hi = mid; }
        if (lo !== u.drawn) { u.drawn = lo; mesh.visible = lo > 0; mesh.geometry.setDrawRange(0, lo ? u.ends[lo - 1] : 0); }
        n += lo;
      }
    }
    this.stats.buildings = n;
  }

  // (the streamed city's test hook; nothing to push here)
  pushQueues() {}
  // files still on their way in
  get pending() { return this.index ? this.queue.length + this.busy + this.ready.length : 4; }
  get loading() { return !this.index || this.pending > 0; }
}
