// maps.js — what the game takes from OpenStreetMap, anywhere: water outlines for the ground, every building as a
// block, and the names of places. The tiles are read and turned into arrays off the main thread (maps.worker.js).
//
//   Maps      asks for tiles, a few at a time, nearest first; keeps the names it has seen
//   OsmCity   the buildings round the camera: zoom-14 squares, everything close by, only what shows from far beyond
//             that. It answers to the same names as Tokyo Flight's built-in city, so the rest of the page is the same.
import * as THREE from 'three';
import { patch } from './atmo.js';
import { PLAIN } from './blocks.js';
import { frameAt, geoToWorld, worldToGeo, tileLon, tileLat, lonTile, latTile, tileMetres, wrapX } from './geo.js';
import { mapReady, mapUrl, NET } from './net.js';

const FOCAL = 960;                 // pixels per radian-ish on the 1000-pixel screen detail is judged against (55 degree lens)
const BZ = 14;                     // the zoom buildings are read at (the deepest the map tiles go)
const MASK = { 7: 1024, 10: 2048, 14: 512 };       // dots across a water mask at each level it is drawn at
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Maps {
  constructor({ workers = 2 } = {}) {
    this.jobs = new Map(); this.queue = []; this.busy = 0; this.next = 1; this.max = 6;
    this.names = new Map();                    // 'name|lat|lon' -> { n, lat, lon, k (kind), r (rank), c (code) }
    this.namesRev = 0; this.stats = { tiles: 0, bytes: 0, failed: 0 }; this.maskMax = 2048;
    this.workers = Array.from({ length: workers }, () => { const w = new Worker(new URL('./maps.worker.js', import.meta.url), { type: 'module' }); w.onmessage = (e) => this.arrived(e.data); w.onerror = (e) => console.warn('map worker', e.message); return w; });
    this.ready = mapReady();
  }

  // one tile, read for what `want` names ({ water, buildings, woods, names }); pri: larger goes first
  ask(z, x, y, want, opts = {}, pri = 0) {
    return new Promise((resolve) => {
      const id = this.next++;
      this.queue.push({ id, z, x, y, want, opts, pri, resolve, tries: 0 });
      this.pump();
    });
  }
  async pump() {
    if (!(await this.ready)) { for (const j of this.queue.splice(0)) j.resolve(null); return; }
    while (this.busy < this.max && this.queue.length) {
      let bi = 0; for (let i = 1; i < this.queue.length; i++) if (this.queue[i].pri > this.queue[bi].pri) bi = i;
      const j = this.queue.splice(bi, 1)[0];
      if (j.cancelled?.()) { j.resolve(null); continue; }
      this.send(j);
    }
  }
  send(j) {
    this.busy++; this.jobs.set(j.id, j);
    this.workers[Math.abs(j.x * 31 + j.y * 17 + j.z) % this.workers.length].postMessage({ id: j.id, url: mapUrl(j.z, j.x, j.y), key: `${j.z}/${wrapX(j.x, j.z)}/${j.y}`, want: j.want, ...j.opts });
  }
  arrived(m) {
    const j = this.jobs.get(m.id); if (!j) return;
    this.jobs.delete(m.id); this.busy--;
    if (!m.ok) {
      // a dropped connection gets two more goes, then the tile is done without
      if (++j.tries <= 2) { setTimeout(() => { this.send(j); }, 600 * j.tries); return; }
      this.stats.failed++; NET.fails++; console.warn('map tile', j.z, j.x, j.y, m.error); j.resolve(null);
    } else {
      if (m.fresh) { this.stats.tiles++; this.stats.bytes += m.bytes || 0; NET.map++; }
      if (m.names) this.keep(j.z, j.x, j.y, m.names);
      j.resolve(m);
    }
    this.pump();
  }
  keep(z, x, y, list) {
    for (const n of list) {
      const lat = tileLat(y + n.y, z), lon = tileLon(wrapX(x, z) + n.x, z);
      if (n.x < 0 || n.x >= 1 || n.y < 0 || n.y >= 1) continue;                // the tile's margin belongs to its neighbour
      const k = `${n.n}|${lat.toFixed(2)}|${lon.toFixed(2)}`, had = this.names.get(k);
      if (!had || n.r < had.r) this.names.set(k, { n: n.n, lat, lon, k: n.k, r: n.r, c: n.c, z });
    }
    this.namesRev++;
  }

  // the water outlines over a ground tile, as terrain.js asks for them
  water = async (z, x, y) => {
    const size = Math.min(MASK[z] || 512, this.maskMax), m = await this.ask(z, x, y, { water: true, names: z < 14 }, { size }, 100 - z);
    if (!m || m.empty) return null;                            // nothing known: the coarser mask above stays
    return m.water ? { mask: m.water, size } : { mask: new Uint8Array(16), size: 4 };       // mapped, and dry
  };

  // the nearest named place of the kinds wanted; kinds: a Set of classes ('city', 'town', 'village', 'suburb', 'airfield' ...)
  nearest(lat, lon, kinds, maxKm = 60) {
    let best = null, bd = maxKm * 1000; const c = Math.cos(lat * Math.PI / 180);
    for (const p of this.names.values()) {
      if (kinds && !kinds.has(p.k)) continue;
      const d = Math.hypot((p.lat - lat) * 110574, (p.lon - lon) * 111320 * c);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { ...best, d: bd } : null;
  }
}

/* ------------------------------------------------------------------ buildings */
export class OsmCity {
  constructor({ maps, camera, px = 6, near = 2400, far = 9000, shadows = true, onChange = () => {}, perFrame = () => 2, jobs = 5 }) {
    this.maps = maps; this.camera = camera; this.onChange = onChange; this.castShadows = shadows;
    this.px = px; this.detail = 1; this.near = near; this.reach = far; this.perFrame = perFrame; this.jobs = jobs;
    this.group = new THREE.Group(); this.group.name = 'city'; this.group.matrixAutoUpdate = false;
    this.sets = []; this.bridges = null;                // (names the streamed city of Tokyo Flight has; nothing here)
    this.stats = { buildings: 0, tiles: 0, open: 1, bytes: 0, failed: 0, all: 0 };
    this.eyeHeight = 1e9; this.errorTarget = 0; this.hold = false;
    this.groundAt = null;                               // (lat, lon) -> { elev, z }: the ground under a place, and how fine the data was
    this.tiles = new Map(); this.busy = 0; this.ready = []; this.queue = []; this.at = new THREE.Vector3(1e9, 0, 1e9); this.key = '';
    this.mat = null; this._g = {}; this._v = new THREE.Vector3(); this.seatAt = 0; this.rev = 0;
  }

  material() {
    if (this.mat) return this.mat;
    const m = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), 'osm-bldg', PLAIN.bldg);
    m.dispose = () => {};
    return (this.mat = m);
  }

  tile(x, y) {
    const k = x + '_' + y; let t = this.tiles.get(k);
    if (!t) {
      t = { k, x, y, latC: tileLat(y + 0.5, BZ), lonC: tileLon(x + 0.5, BZ), c: new THREE.Vector3(), d: 1e9, band: null, want: null, loading: null, mesh: null, zoom: -1, empty: false, failed: 0 };
      t.width = tileMetres(BZ, t.latC); geoToWorld(t.latC, t.lonC, 0, t.c);
      this.tiles.set(k, t);
    }
    return t;
  }

  update() {
    const cam = this.camera.position;
    const key = `${this.reach.toFixed(0)}|${this.near.toFixed(0)}|${this.rev}`;
    const moved = Math.hypot(cam.x - this.at.x, cam.z - this.at.z);
    if (moved > 150 || key !== this.key) {
      this.at.copy(cam); this.key = key;
      const g = worldToGeo(cam, this._g), n = 2 ** BZ, W = tileMetres(BZ, g.lat);
      const cx = Math.floor(lonTile(g.lon, BZ)), cy = Math.floor(latTile(g.lat, BZ)), R = Math.min(Math.ceil(this.reach / W) + 1, 12);
      const want = []; let gone = false;
      for (let y = Math.max(cy - R, 0); y <= Math.min(cy + R, n - 1); y++) for (let x = cx - R; x <= cx + R; x++) {
        const t = this.tile(x, y), S = t.width / 2;
        t.d = Math.hypot(Math.max(Math.abs(cam.x - t.c.x) - S, 0), Math.max(Math.abs(cam.z - t.c.z) - S, 0));
        t.want = t.d < this.near ? 'all' : t.d < this.reach ? 'far' : null;
        if (t.want && !t.empty && t.failed < 2 && t.band !== t.want && t.loading !== t.want && !(t.want === 'far' && t.band === 'all')) want.push(t);
      }
      for (const t of this.tiles.values()) {
        const S = t.width / 2; t.d = Math.hypot(Math.max(Math.abs(cam.x - t.c.x) - S, 0), Math.max(Math.abs(cam.z - t.c.z) - S, 0));
        if (t.d > this.reach * 1.3 + 700) { if (t.mesh) { this.drop(t); gone = true; } this.tiles.delete(t.k); }
        else if (t.band === 'all' && t.d > this.near * 1.35 + 500 && t.loading !== 'far') want.push(Object.assign(t, { want: 'far' }));      // far enough again for the light version
      }
      want.sort((a, b) => (a.d + (a.want === 'all' ? -500 : 0)) - (b.d + (b.want === 'all' ? -500 : 0)));
      this.queue = want;
      if (gone) this.onChange();
    }
    while (this.busy < this.jobs && this.queue.length) this.load(this.queue.shift());
    // squares that have arrived go into the scene a few a frame
    let n = this.hold ? 0 : this.perFrame(), added = false;
    while (n-- > 0 && this.ready.length) { this.show(this.ready.shift()); added = true; }
    if (added) this.onChange();
    this.reseat();
    this.cut(cam);
  }

  load(t) {
    const band = t.want; if (!band || t.loading === band) return;
    t.loading = band; this.busy++;
    this.maps.ask(BZ, t.x, t.y, { buildings: true }, { band, width: t.width, seed: (t.x * 7 + t.y * 13) % 1000 }, 50 - t.d / 1000).then((m) => {
      this.busy--;
      if (t.loading !== band) return;
      t.loading = null;
      if (!m) { t.failed++; this.stats.failed++; return; }
      if (!this.tiles.has(t.k)) return;                 // left behind meanwhile
      if (!m.buildings) { if (band === 'all') t.empty = true; if (t.mesh && band === 'far') { this.drop(t); this.onChange(); } t.band = band; return; }
      this.ready.push({ t, band, b: m.buildings });
    });
  }

  show({ t, band, b }) {
    if (!this.tiles.has(t.k)) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3, true));
    g.setAttribute('aBld', new THREE.BufferAttribute(b.bld, 3, false));
    g.setIndex(new THREE.BufferAttribute(b.index, 1));
    const mesh = new THREE.Mesh(g, this.material());
    mesh.matrixAutoUpdate = false; mesh.castShadow = this.castShadows; mesh.receiveShadow = true;
    mesh.userData = { ends: b.ends, scores: b.scores, spans: b.spans, at: b.at, count: b.count, drawn: -1, ground: new Float32Array(b.count), lo: b.lo, hi: b.hi };
    if (t.mesh) this.drop(t);
    t.mesh = mesh; t.band = band; t.zoom = -1;
    this.seat(t, true);
    frameAt(t.latC, t.lonC, 0, mesh.matrix); mesh.matrixWorld.copy(mesh.matrix);
    this.group.add(mesh);
    this.stats.tiles++; this.stats.bytes += b.position.byteLength + b.normal.byteLength + b.bld.byteLength + b.index.byteLength; this.stats.all += b.count;
  }

  // Stand every building of a square on the ground under its middle. Done again when finer ground has arrived.
  seat(t, first = false) {
    const mesh = t.mesh, u = mesh.userData, pos = mesh.geometry.attributes.position, P = pos.array, W = t.width;
    let zmin = 99, lo = 1e9, hi = -1e9;
    for (let i = 0; i < u.count; i++) {
      const ux = u.at[i * 3] / W + 0.5, uy = u.at[i * 3 + 1] / W + 0.5, lon = tileLon(t.x + ux, BZ), lat = tileLat(t.y + uy, BZ);
      const e = this.groundAt ? this.groundAt(lat, lon) : { elev: 0, z: 0 };
      // on a slope it stands on the lowest ground under it (its walls go into the hill), never in the air
      const r = (u.at[i * 3 + 2] * 0.7) / W;
      if (this.groundAt && r * W > 4) for (const [dx, dy] of SIDES) { const g = this.groundAt(tileLat(t.y + uy + dy * r, BZ), tileLon(t.x + ux + dx * r, BZ)).elev; if (g < e.elev) e.elev = g; }
      if (e.z < zmin) zmin = e.z;
      const d = e.elev - u.ground[i]; u.ground[i] = e.elev;
      if (e.elev < lo) lo = e.elev; if (e.elev > hi) hi = e.elev;
      if (d !== 0) for (let v = u.spans[i * 2], end = v + u.spans[i * 2 + 1]; v < end; v++) P[v * 3 + 1] += d;
    }
    t.zoom = zmin; pos.needsUpdate = true;
    const g = mesh.geometry;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(u.lo[0], u.lo[1] + lo, u.lo[2]), new THREE.Vector3(u.hi[0], u.hi[1] + hi, u.hi[2]));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    if (!first) this.onChange();
  }
  // one square a frame at most: the nearest whose ground has become finer since it was stood on it
  reseat() {
    if (!this.groundAt || ++this.seatAt % 20) return;
    let best = null;
    for (const t of this.tiles.values()) {
      if (!t.mesh || t.zoom >= 14) continue;
      const z = this.groundAt(t.latC, t.lonC).z;
      if (z > t.zoom && (!best || t.d < best.d)) best = t;
    }
    if (best) this.seat(best);
  }

  drop(t) {
    const mesh = t.mesh; t.mesh = null; t.band = null;
    if (!mesh) return;
    this.group.remove(mesh); mesh.geometry.dispose(); this.stats.tiles--; this.stats.all -= mesh.userData.count;
  }

  // draw only the buildings of each square that are large enough to see from here
  cut(cam) {
    const k = (this.px * this.detail) / FOCAL;
    let n = 0;
    for (const t of this.tiles.values()) {
      const mesh = t.mesh; if (!mesh) continue;
      const S = t.width / 2, d = Math.hypot(Math.max(Math.abs(cam.x - t.c.x) - S, 0), Math.max(Math.abs(cam.z - t.c.z) - S, 0), Math.max(cam.y - t.c.y - 60, 0) * 0.5), min = d * k;
      const u = mesh.userData, sc = u.scores;
      let lo = 0, hi = u.count;                     // how many are at least `min` (they are in falling order)
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sc[mid] >= min) lo = mid + 1; else hi = mid; }
      if (lo !== u.drawn) { u.drawn = lo; mesh.visible = lo > 0; mesh.geometry.setDrawRange(0, lo ? u.ends[lo - 1] : 0); }
      n += lo;
    }
    this.stats.buildings = n;
  }

  // the page has moved its origin: every square goes back where it belongs
  rebase() {
    for (const t of this.tiles.values()) {
      geoToWorld(t.latC, t.lonC, 0, t.c);
      if (t.mesh) { frameAt(t.latC, t.lonC, 0, t.mesh.matrix); t.mesh.matrixWorld.copy(t.mesh.matrix); }
    }
    this.at.set(1e9, 0, 1e9);
  }

  clear() { for (const t of this.tiles.values()) if (t.mesh) this.drop(t); this.tiles.clear(); this.queue.length = 0; this.ready.length = 0; this.at.set(1e9, 0, 1e9); this.rev++; }
  pushQueues() {}
  get pending() { return this.queue.length + this.busy + this.ready.length; }
  get loading() { return this.pending > 0; }
}
