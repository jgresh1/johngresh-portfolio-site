// maps.worker.js — reads OpenStreetMap vector tiles (OpenFreeMap, the OpenMapTiles layout) off the main thread and
// hands back what the game draws from them:
//
//   water      the tile's sea, lakes and rivers drawn into a small mask (sea 255, inland water 128)
//   buildings  every footprint pushed up to its height as walls and a roof, largest first, ready for the graphics card
//   woods      where the map says trees stand, as a mask the page plants from
//   names      towns, suburbs and airfields in the tile
//
// A vector tile is a protocol-buffer file: layers of features, each a list of drawing commands in whole numbers on
// a 4096-wide grid. Nothing here touches the page, so a tile arriving cannot hold up a frame.

/* ------------------------------------------------------------------ protocol buffers, just enough */
class Pbf {
  constructor(buf) { this.b = buf; this.p = 0; this.end = buf.length; }
  varint() {
    const b = this.b; let v = 0, s = 1, c;
    do { c = b[this.p++]; v += (c & 127) * s; s *= 128; } while (c >= 128);
    return v;
  }
  skip(type) {
    if (type === 0) { while (this.b[this.p++] >= 128); } else if (type === 2) this.p += this.varint(); else if (type === 5) this.p += 4; else if (type === 1) this.p += 8; else throw new Error('pbf: wire type ' + type);
  }
}
const TD = new TextDecoder();
const zig = (n) => (n >>> 1) ^ -(n & 1);

function readTile(u8, wanted) {
  const p = new Pbf(u8), layers = {};
  while (p.p < p.end) {
    const tag = p.varint(), f = tag >> 3, t = tag & 7;
    if (f === 3 && t === 2) {
      const len = p.varint(), end = p.p + len, L = readLayer(p, end, wanted);
      if (L) layers[L.name] = L;
      p.p = end;
    } else p.skip(t);
  }
  return layers;
}
function readLayer(p, end, wanted) {
  const L = { name: '', extent: 4096, keys: [], values: [], feats: [] }, start = p.p;
  // the name first: a layer nobody wants is not read at all
  while (p.p < end) {
    const tag = p.varint(), f = tag >> 3, t = tag & 7;
    if (f === 1 && t === 2) { const n = p.varint(); L.name = TD.decode(p.b.subarray(p.p, p.p + n)); p.p += n; break; } else p.skip(t);
  }
  if (!wanted.has(L.name)) return null;
  p.p = start;
  while (p.p < end) {
    const tag = p.varint(), f = tag >> 3, t = tag & 7;
    if (t !== 2) { if (f === 5 && t === 0) L.extent = p.varint(); else p.skip(t); continue; }
    const n = p.varint(), e = p.p + n;
    if (f === 2) L.feats.push([p.p, e]);
    else if (f === 3) L.keys.push(TD.decode(p.b.subarray(p.p, e)));
    else if (f === 4) L.values.push(readValue(p, e));
    p.p = e;
  }
  return L;
}
function readValue(p, end) {
  let v = null;
  const dv = new DataView(p.b.buffer, p.b.byteOffset);
  while (p.p < end) {
    const tag = p.varint(), f = tag >> 3, t = tag & 7;
    if (f === 1 && t === 2) { const n = p.varint(); v = TD.decode(p.b.subarray(p.p, p.p + n)); p.p += n; }
    else if (f === 2 && t === 5) { v = dv.getFloat32(p.p, true); p.p += 4; }
    else if (f === 3 && t === 1) { v = dv.getFloat64(p.p, true); p.p += 8; }
    else if ((f === 4 || f === 5) && t === 0) v = p.varint();
    else if (f === 6 && t === 0) v = zig(p.varint());
    else if (f === 7 && t === 0) v = p.varint() !== 0;
    else p.skip(t);
  }
  return v;
}
// one feature: its kind (1 point, 2 line, 3 area), its properties, and its rings as flat [x, y, x, y, ...] lists
function readFeature(p, L, span, withProps = true) {
  const f = { type: 0, props: {}, rings: [] };
  let geomAt = -1, geomEnd = -1;
  p.p = span[0];
  while (p.p < span[1]) {
    const tag = p.varint(), id = tag >> 3, t = tag & 7;
    if (id === 3 && t === 0) f.type = p.varint();
    else if (id === 2 && t === 2) { const n = p.varint(), e = p.p + n; while (p.p < e) { const k = p.varint(), v = p.varint(); if (withProps) f.props[L.keys[k]] = L.values[v]; } }
    else if (id === 4 && t === 2) { const n = p.varint(); geomAt = p.p; geomEnd = p.p + n; p.p = geomEnd; }
    else p.skip(t);
  }
  if (geomAt < 0) return f;
  p.p = geomAt;
  let x = 0, y = 0, ring = null;
  while (p.p < geomEnd) {
    const cmd = p.varint(), id = cmd & 7; let n = cmd >> 3;
    if (id === 1) { while (n-- > 0) { x += zig(p.varint()); y += zig(p.varint()); ring = [x, y]; f.rings.push(ring); } }
    else if (id === 2) { while (n-- > 0) { x += zig(p.varint()); y += zig(p.varint()); ring.push(x, y); } }
    else if (id === 7) { /* close: the ring ends where it began */ }
  }
  return f;
}
// twice the signed area of a ring; outer rings come out positive (the tile's y runs downwards)
function area2(r) { let a = 0; for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1]; return a; }

/* ------------------------------------------------------------------ triangles for a footprint (ear clipping, after Mapbox's earcut) */
function earcut(data, holes) {
  const out = [], outerLen = holes.length ? holes[0] * 2 : data.length;        // (holes are given as point numbers)
  let outer = linked(data, 0, outerLen, true);
  if (!outer || outer.next === outer.prev) return out;
  if (holes.length) outer = eliminateHoles(data, holes, outer);
  clip(outer, out, 0);
  return out;
}
function node(i, x, y, last) {
  const p = { i, x, y, prev: null, next: null };
  if (!last) { p.prev = p; p.next = p; } else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; }
  return p;
}
function linked(data, start, end, clockwise) {
  let last = null, a = 0;
  for (let i = start, j = end - 2; i < end; j = i, i += 2) a += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
  if (clockwise === a > 0) for (let i = start; i < end; i += 2) last = node(i / 2, data[i], data[i + 1], last);
  else for (let i = end - 2; i >= start; i -= 2) last = node(i / 2, data[i], data[i + 1], last);
  if (last && last.x === last.next.x && last.y === last.next.y) { const n = last.next; remove(last); last = n; }
  return last;
}
const remove = (p) => { p.next.prev = p.prev; p.prev.next = p.next; };
const area = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
const inTri = (ax, ay, bx, by, cx, cy, px, py) => (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
function filter(start, end) {
  if (!start) return start;
  end ??= start;
  let p = start, again;
  do {
    again = false;
    if ((p.x === p.next.x && p.y === p.next.y) || area(p.prev, p, p.next) === 0) { remove(p); p = end = p.prev; if (p === p.next) break; again = true; } else p = p.next;
  } while (again || p !== end);
  return end;
}
function isEar(ear) {
  const a = ear.prev, b = ear, c = ear.next;
  if (area(a, b, c) >= 0) return false;
  let p = c.next;
  while (p !== a) { if (inTri(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false; p = p.next; }
  return true;
}
function clip(ear, out, pass) {
  if (!ear) return;
  let stop = ear, guard = 0;
  while (ear.prev !== ear.next) {
    const prev = ear.prev, next = ear.next;
    if (isEar(ear)) { out.push(prev.i, ear.i, next.i); remove(ear); ear = next.next; stop = next.next; continue; }
    ear = next;
    if (ear === stop) {
      if (!pass) { ear = filter(ear); stop = ear; pass = 1; if (!ear) return; continue; }
      // no clean ear left (a footprint that crosses itself): take the corners as they come, so it always ends
      if (++guard > 4096) return;
      out.push(ear.prev.i, ear.i, ear.next.i); const n = ear.next; remove(ear); ear = n; stop = n;
    }
  }
}
function eliminateHoles(data, holes, outer) {
  const queue = [];
  for (let i = 0; i < holes.length; i++) {
    const s = holes[i] * 2, e = i < holes.length - 1 ? holes[i + 1] * 2 : data.length, list = linked(data, s, e, false);
    if (!list) continue;
    let left = list, p = list; do { if (p.x < left.x || (p.x === left.x && p.y < left.y)) left = p; p = p.next; } while (p !== list);
    queue.push(left);
  }
  queue.sort((a, b) => a.x - b.x);
  for (const h of queue) {
    const bridge = findBridge(h, outer);
    if (!bridge) continue;
    const b2 = split(bridge, h);
    filter(b2, b2.next); outer = filter(bridge, bridge.next);
  }
  return outer;
}
function findBridge(hole, outer) {
  let p = outer, qx = -Infinity, m = null;
  const hx = hole.x, hy = hole.y;
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
      if (x <= hx && x > qx) { qx = x; m = p.x < p.next.x ? p : p.next; if (x === hx) return m; }
    }
    p = p.next;
  } while (p !== outer);
  if (!m) return null;
  const stop = m, mx = m.x, my = m.y; let tanMin = Infinity;
  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x && inTri(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && p.x > m.x))) { m = p; tanMin = tan; }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}
const locallyInside = (a, b) => (area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0);
function split(a, b) {
  const a2 = { i: a.i, x: a.x, y: a.y, prev: null, next: null }, b2 = { i: b.i, x: b.x, y: b.y, prev: null, next: null }, an = a.next, bp = b.prev;
  a.next = b; b.prev = a; a2.next = an; an.prev = a2; b2.next = a2; a2.prev = b2; bp.next = b2; b2.prev = bp;
  return b2;
}

/* ------------------------------------------------------------------ fetching */
const cache = new Map();                    // 'z/x/y' -> bytes of the tile (a few dozen kept, for a second asking)
const KEEP = 48;
const coming = new Map();                   // 'z/x/y' -> the fetch still on its way
let fresh = false;                          // was the last tile handed out fetched just now (not taken from the store)
function tileBytes(url, key) {
  if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); fresh = false; return Promise.resolve(v); }
  if (coming.has(key)) return coming.get(key).then((v) => { fresh = false; return v; });
  const p = fetchTile(url, key).finally(() => coming.delete(key));
  coming.set(key, p);
  return p.then((v) => { fresh = true; return v; });
}
async function fetchTile(url, key) {
  const res = await fetch(url, { mode: 'cors' });
  if (res.status === 204 || res.status === 404) return null;                  // nothing there (open sea)
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let buf = await res.arrayBuffer();
  let u8 = new Uint8Array(buf);
  if (u8[0] === 0x1f && u8[1] === 0x8b) u8 = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  cache.set(key, u8); if (cache.size > KEEP) cache.delete(cache.keys().next().value);
  return u8;
}

/* ------------------------------------------------------------------ water and woods: masks */
let cvs = null, ctx = null;
function canvas(size) {
  if (!cvs || cvs.width !== size) { cvs = new OffscreenCanvas(size, size); ctx = cvs.getContext('2d', { willReadFrequently: true }); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  return ctx;
}
function fillFeature(c, f) {
  c.beginPath();
  for (const r of f.rings) { if (r.length < 6) continue; c.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) c.lineTo(r[i], r[i + 1]); c.closePath(); }
  c.fill('evenodd');
}
function red(c, size) {
  const d = c.getImageData(0, 0, size, size).data, m = new Uint8Array(size * size);
  let any = 0; for (let i = 0, p = 0; i < m.length; i++, p += 4) { m[i] = d[p]; any |= d[p]; }
  return any ? m : null;
}
function waterMask(layers, size, u8) {
  const L = layers.water; if (!L || !L.feats.length) return null;
  const c = canvas(size), k = size / L.extent, p = new Pbf(u8);
  c.setTransform(k, 0, 0, k, 0, 0); c.globalCompositeOperation = 'lighten';
  const feats = L.feats.map((s) => readFeature(p, L, s)).filter((f) => f.type === 3);
  // inland water first, the sea over it
  c.fillStyle = 'rgb(128,128,128)'; for (const f of feats) if (f.props.class !== 'ocean') fillFeature(c, f);
  c.fillStyle = 'rgb(255,255,255)'; for (const f of feats) if (f.props.class === 'ocean') fillFeature(c, f);
  return red(c, size);
}
function woodMask(layers, size, u8) {
  const L = layers.landcover; if (!L || !L.feats.length) return null;
  const c = canvas(size), k = size / L.extent, p = new Pbf(u8);
  c.setTransform(k, 0, 0, k, 0, 0); c.fillStyle = '#fff';
  let n = 0;
  for (const s of L.feats) { const f = readFeature(p, L, s); if (f.type === 3 && f.props.class === 'wood') { fillFeature(c, f); n++; } }
  // buildings, water and roads are not woods, whatever the outline says
  c.fillStyle = '#000';
  for (const name of ['water', 'building', 'aeroway']) { const B = layers[name]; if (B) for (const s of B.feats) { const f = readFeature(p, B, s, false); if (f.type === 3) fillFeature(c, f); } }
  return n ? red(c, size) : null;
}

/* ------------------------------------------------------------------ buildings */
const fract = (v) => v - Math.floor(v);
// width: the tile's width in metres; band 'far' = only what shows from a distance
function buildings(layers, u8, width, band, key) {
  const L = layers.building; if (!L || !L.feats.length) return null;
  const p = new Pbf(u8), k = width / L.extent, half = width / 2, UNIT = 0.05;
  const items = [];
  for (const s of L.feats) {
    const f = readFeature(p, L, s);
    if (f.type !== 3 || f.props.hide_3d) continue;
    let h = +f.props.render_height || 0; const base = Math.max(+f.props.render_min_height || 0, 0);
    // group the rings into footprints: an outer ring, then its courtyards
    let cur = null;
    for (const r of f.rings) {
      if (r.length >= 4 && r[0] === r[r.length - 2] && r[1] === r[r.length - 1]) r.length -= 2;
      if (r.length < 6) continue;
      const a = area2(r);
      if (a > 0) { cur = { outer: r, holes: [], a: a * 0.5 * k * k, h, base }; items.push(cur); } else if (a < 0 && cur) cur.holes.push(r);
    }
  }
  if (!items.length) return null;
  let nv = 0, ni = 0;
  for (const it of items) {
    // where the map has no height it says 5 m for everything: give those a spread that suits their size
    const r = it.outer; let sx = 0, sy = 0; for (let i = 0; i < r.length; i += 2) { sx += r[i]; sy += r[i + 1]; }
    it.cx = (sx / (r.length / 2)) * k - half; it.cz = (sy / (r.length / 2)) * k - half;
    const s = Math.sin(Math.round(it.cx * 2) * 12.9898 + Math.round(it.cz * 2) * 78.233 + key) * 43758.5453; it.seed = fract(s);
    if (it.h <= 5.01 && it.h >= 4.99 && it.base === 0) it.h = it.a > 1800 ? 7 + 5 * it.seed : it.a > 420 ? 6 + 6 * fract(it.seed * 7.7) : it.a < 28 ? 2.6 + it.seed : 4.2 + 4.6 * fract(it.seed * 3.3);
    if (it.h <= it.base + 0.5) it.h = it.base + 3;
    it.h = Math.min(it.h, 1000);
    // how big it looks from the air, in metres
    it.score = Math.max((it.h - it.base) * 1.15, Math.sqrt(it.a) * 0.9);
    // small plain houses get a low pitched roof: four slopes to a point over the middle
    const n = r.length / 2;
    it.pitch = it.holes.length === 0 && n >= 4 && n <= 6 && it.a < 380 && it.a > 22 && it.h - it.base < 13 && it.base === 0 && convex(r) && fract(it.seed * 5.1) < 0.86 ? 1 : 0;
  }
  let list = items;
  if (band === 'far') list = items.filter((it) => it.score >= 16);
  if (!list.length) return null;
  list.sort((a, b) => b.score - a.score);
  for (const it of list) {
    const n = it.outer.length / 2; let e = n, v = n; for (const hl of it.holes) { e += hl.length / 2; v += hl.length / 2; }
    if (it.pitch) { nv += n * 3 + e * 4; ni += n * 3 + e * 6; } else { nv += v + e * 4; ni += (v - 2 + it.holes.length * 2) * 3 + e * 6; }
  }
  const position = new Float32Array(nv * 3), normal = new Int8Array(nv * 3), bld = new Uint16Array(nv * 3), index = new Uint32Array(ni);
  const count = list.length, ends = new Uint32Array(count), scores = new Float32Array(count), spans = new Uint32Array(count * 2), at = new Float32Array(count * 3);
  let vi = 0, ii = 0, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  const put = (x, y, z, nx, ny, nz, up, h, seed) => {
    const q = vi * 3; position[q] = x; position[q + 1] = y; position[q + 2] = z; normal[q] = nx; normal[q + 1] = ny; normal[q + 2] = nz;
    bld[q] = Math.min(Math.round(up / UNIT), 65535); bld[q + 1] = Math.min(Math.round(h / UNIT), 65535); bld[q + 2] = seed;
    if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z; if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
    return vi++;
  };
  list.forEach((it, bi) => {
    const v0 = vi, seed = Math.round(it.seed * 65535), H = it.h - it.base, top = it.h, bot = it.base > 0 ? it.base : -3;      // walls go 3 m into the ground, for slopes
    const flat = [], holeAt = [];
    for (let i = 0; i < it.outer.length; i += 2) flat.push(it.outer[i] * k - half, it.outer[i + 1] * k - half);
    for (const hl of it.holes) { holeAt.push(flat.length / 2); for (let i = 0; i < hl.length; i += 2) flat.push(hl[i] * k - half, hl[i + 1] * k - half); }
    const n0 = it.outer.length / 2;
    if (it.pitch) {
      // eaves at the wall top, the point `rise` above the middle
      const rise = Math.min(1.2 + 0.16 * Math.sqrt(it.a), 3.6) * (0.75 + 0.5 * fract(it.seed * 9.7));
      let mx = 0, mz = 0; for (let i = 0; i < n0; i++) { mx += flat[i * 2]; mz += flat[i * 2 + 1]; } mx /= n0; mz /= n0;
      for (let i = 0; i < n0; i++) {
        const j = (i + 1) % n0, ax = flat[i * 2], az = flat[i * 2 + 1], bx = flat[j * 2], bz = flat[j * 2 + 1];
        // the slope's own normal: up and out from the wall under it
        const ux = bx - ax, uz = bz - az, wx = mx - ax, wz = mz - az;
        let nx = -uz * rise, ny = uz * wx - ux * wz, nz = ux * rise;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz) || 1; nx = Math.round(nx / l * 127); ny = Math.round(ny / l * 127); nz = Math.round(nz / l * 127);
        const a = put(ax, top, az, nx, ny, nz, H, H, seed), b = put(bx, top, bz, nx, ny, nz, H, H, seed), c = put(mx, top + rise, mz, nx, ny, nz, H, H, seed);
        if ((bx - ax) * (mz - az) - (mx - ax) * (bz - az) > 0) { index[ii++] = a; index[ii++] = c; index[ii++] = b; } else { index[ii++] = a; index[ii++] = b; index[ii++] = c; }
      }
    } else {
      const r0 = vi;
      for (let i = 0; i < flat.length; i += 2) put(flat[i], top, flat[i + 1], 0, 127, 0, H, H, seed);
      const tri = earcut(flat, holeAt);
      for (let t = 0; t + 2 < tri.length; t += 3) {
        const a = tri[t], b = tri[t + 1], c = tri[t + 2];
        // seen from above, with south down the page, the front of a roof is the anticlockwise side
        if ((flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) - (flat[c * 2] - flat[a * 2]) * (flat[b * 2 + 1] - flat[a * 2 + 1]) > 0) { index[ii++] = r0 + a; index[ii++] = r0 + c; index[ii++] = r0 + b; }
        else { index[ii++] = r0 + a; index[ii++] = r0 + b; index[ii++] = r0 + c; }
      }
    }
    // walls: outer ring clockwise on the page, so the outside is to the left of the way round
    const wall = (ring, from, n, flip) => {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = flat[(from + i) * 2], az = flat[(from + i) * 2 + 1], bx = flat[(from + j) * 2], bz = flat[(from + j) * 2 + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1; let nx = dz / len, nz = -dx / len; if (flip) { nx = -nx; nz = -nz; }
        const NX = Math.round(nx * 127), NZ = Math.round(nz * 127);
        const aT = put(ax, top, az, NX, 0, NZ, H, H, seed), aB = put(ax, bot, az, NX, 0, NZ, 0, H, seed), bB = put(bx, bot, bz, NX, 0, NZ, 0, H, seed), bT = put(bx, top, bz, NX, 0, NZ, H, H, seed);
        if (flip) { index[ii++] = aT; index[ii++] = aB; index[ii++] = bB; index[ii++] = aT; index[ii++] = bB; index[ii++] = bT; }
        else { index[ii++] = aT; index[ii++] = bB; index[ii++] = aB; index[ii++] = aT; index[ii++] = bT; index[ii++] = bB; }
      }
    };
    // (a courtyard's ring runs the other way round, so the same rule faces its walls into the yard)
    wall(it.outer, 0, n0, false);
    it.holes.forEach((hl, q) => wall(hl, holeAt[q], hl.length / 2, false));
    // where it stands and how far it reaches from there (for standing it on the ground)
    let reach = 0; for (let i = 0; i < n0; i++) reach = Math.max(reach, Math.hypot(flat[i * 2] - it.cx, flat[i * 2 + 1] - it.cz));
    ends[bi] = ii; scores[bi] = it.score; spans[bi * 2] = v0; spans[bi * 2 + 1] = vi - v0; at[bi * 3] = it.cx; at[bi * 3 + 1] = it.cz; at[bi * 3 + 2] = reach;
  });
  return { position: position.subarray(0, vi * 3), normal: normal.subarray(0, vi * 3), bld: bld.subarray(0, vi * 3), index: index.subarray(0, ii), ends, scores, spans, at, lo, hi, count, all: items.length, unit: UNIT };
}
function convex(r) {
  let sign = 0;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const ax = r[i], ay = r[i + 1], bx = r[(i + 2) % n], by = r[(i + 3) % n], cx = r[(i + 4) % n], cy = r[(i + 5) % n];
    const c = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (c !== 0) { if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); }
  }
  return true;
}

/* ------------------------------------------------------------------ names */
function names(layers, u8) {
  const out = [], p = new Pbf(u8);
  for (const [name, kind] of [['place', 0], ['aerodrome_label', 1]]) {
    const L = layers[name]; if (!L) continue;
    for (const s of L.feats) {
      const f = readFeature(p, L, s); if (f.type !== 1 || !f.rings.length) continue;
      const n = f.props['name:latin'] || f.props['name:en'] || f.props.name; if (!n) continue;
      out.push({ n, x: f.rings[0][0] / L.extent, y: f.rings[0][1] / L.extent, k: kind ? 'airfield' : f.props.class || '', r: f.props.rank ?? 99, c: kind ? f.props.icao || f.props.iata || '' : '' });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
self.onmessage = async (e) => {
  const { id, url, key, want, size = 512, width = 2000, band = 'all', seed = 0 } = e.data;
  try {
    const u8 = await tileBytes(url, key), wasFresh = fresh;
    const out = { id, ok: true, empty: !u8, fresh: wasFresh }, move = [];
    if (u8) {
      const need = new Set();
      if (want.water) need.add('water');
      if (want.buildings) need.add('building');
      if (want.woods) { need.add('landcover'); need.add('water'); need.add('building'); need.add('aeroway'); }
      if (want.names) { need.add('place'); need.add('aerodrome_label'); }
      const layers = readTile(u8, need);
      out.bytes = u8.length;
      if (want.water) { out.water = waterMask(layers, size, u8); if (out.water) move.push(out.water.buffer); }
      if (want.woods) { out.woods = woodMask(layers, want.woods, u8); if (out.woods) move.push(out.woods.buffer); }
      if (want.names) out.names = names(layers, u8);
      if (want.buildings) {
        const b = buildings(layers, u8, width, band, seed);
        if (b) {
          // (the arrays were sized for the worst case; hand over exact copies so nothing larger than needed is kept)
          b.position = b.position.slice(); b.normal = b.normal.slice(); b.bld = b.bld.slice(); b.index = b.index.slice();
          out.buildings = b; move.push(b.position.buffer, b.normal.buffer, b.bld.buffer, b.index.buffer, b.ends.buffer, b.scores.buffer, b.spans.buffer, b.at.buffer);
        }
      }
    }
    self.postMessage(out, move);
  } catch (err) { self.postMessage({ id, ok: false, error: String(err?.message || err) }); }
};
