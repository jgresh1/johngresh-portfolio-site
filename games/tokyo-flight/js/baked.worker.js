// baked.worker.js — reads one file of the built-in city (tools/city/bake.mjs writes them) off the main thread and
// hands back arrays that go straight to the graphics card. Nothing here touches the page, so a square arriving
// cannot hold up a frame.
//
// A file is a 16-byte head, then blocks (a footprint, its roof triangles, its outline, base and top heights), then
// free shapes (landmarks and bridges: vertices, normals, triangles). Whole numbers of `unit` metres from the
// square's centre. Buildings are written out largest first, so drawing the first part of a square draws its
// largest buildings.
const fract = (v) => v - Math.floor(v);

async function read(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let buf = await res.arrayBuffer();
  const u = new Uint8Array(buf, 0, 2);
  // gzip, unless the server already opened it on the way
  if (u[0] === 0x1f && u[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return buf;
}

function build(buf, ox, oz, unit) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const nPrism = dv.getUint32(8, true), nShape = dv.getUint32(12, true);
  // first pass: where each building is and how big its arrays will be
  const items = []; let o = 16, nv = 0, ni = 0;
  for (let k = 0; k < nPrism; k++) {
    const v = dv.getUint16(o, true), t = dv.getUint16(o + 2, true), e = dv.getUint16(o + 4, true), w = v <= 256 ? 1 : 2;
    items.push({ o, shape: false, s: dv.getUint16(o + 10, true) });
    nv += v + e * 4; ni += t * 3 + e * 6; o += 12 + v * 4 + (t * 3 + e * 2) * w;
  }
  for (let k = 0; k < nShape; k++) {
    const v = dv.getUint32(o, true), n = dv.getUint32(o + 4, true), w = v <= 65535 ? 2 : 4;
    items.push({ o, shape: true, s: dv.getUint16(o + 12, true) });
    nv += v; ni += n; o += 16 + v * 6 + v * 3 + (v & 1) + n * w;
  }
  items.sort((a, b) => b.s - a.s);
  const position = new Int16Array(nv * 3), normal = new Int8Array(nv * 3), bld = new Uint16Array(nv * 3), index = new Uint32Array(ni);
  const ends = new Uint32Array(items.length), scores = new Uint16Array(items.length);
  const lo = [32767, 32767, 32767], hi = [-32767, -32767, -32767];
  let vi = 0, ii = 0;
  const put = (x, y, z, nx, ny, nz, up, h, seed) => {
    const p = vi * 3; position[p] = x; position[p + 1] = y; position[p + 2] = z; normal[p] = nx; normal[p + 1] = ny; normal[p + 2] = nz; bld[p] = up; bld[p + 1] = h; bld[p + 2] = seed;
    if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z; if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
    return vi++;
  };
  // the same recipe the streamed tiles use, so a building looks the same either way
  const seedAt = (lx, lz) => { const s = Math.sin(Math.round(ox + lx * unit) * 12.9898 + Math.round(oz + lz * unit) * 78.233) * 43758.5453; return Math.round(fract(s) * 65535); };
  items.forEach((it, n) => {
    let p = it.o;
    if (!it.shape) {
      const v = dv.getUint16(p, true), t = dv.getUint16(p + 2, true), e = dv.getUint16(p + 4, true), base = dv.getInt16(p + 6, true), top = dv.getInt16(p + 8, true), w = v <= 256 ? 1 : 2, h = Math.max(top - base, 0);
      const at = p + 12, ti = at + v * 4, ei = ti + t * 3 * w;
      const X = (i) => dv.getInt16(at + i * 4, true), Z = (i) => dv.getInt16(at + i * 4 + 2, true), I = (q) => (w === 1 ? u8[q] : dv.getUint16(q, true));
      let sx = 0, sz = 0; for (let i = 0; i < v; i++) { sx += X(i); sz += Z(i); }
      const seed = seedAt(sx / v, sz / v), v0 = vi;
      for (let i = 0; i < v; i++) put(X(i), top, Z(i), 0, 127, 0, h, h, seed);
      for (let k = 0; k < t * 3; k++) index[ii++] = v0 + I(ti + k * w);
      for (let k = 0; k < e; k++) {
        const a = I(ei + k * 2 * w), b = I(ei + (k * 2 + 1) * w), xa = X(a), za = Z(a), xb = X(b), zb = Z(b), dx = xb - xa, dz = zb - za, len = Math.hypot(dx, dz) || 1;
        const nx = Math.round((-dz / len) * 127), nz = Math.round((dx / len) * 127);
        const aT = put(xa, top, za, nx, 0, nz, h, h, seed), aB = put(xa, base, za, nx, 0, nz, 0, h, seed), bB = put(xb, base, zb, nx, 0, nz, 0, h, seed), bT = put(xb, top, zb, nx, 0, nz, h, h, seed);
        index[ii++] = aT; index[ii++] = aB; index[ii++] = bB; index[ii++] = aT; index[ii++] = bB; index[ii++] = bT;
      }
    } else {
      const v = dv.getUint32(p, true), cnt = dv.getUint32(p + 4, true), base = dv.getInt16(p + 8, true), top = dv.getInt16(p + 10, true), w = v <= 65535 ? 2 : 4, h = Math.max(top - base, 0);
      const at = p + 16, na = at + v * 6, ia = na + v * 3 + (v & 1);
      let sx = 0, sz = 0; for (let i = 0; i < v; i++) { sx += dv.getInt16(at + i * 6, true); sz += dv.getInt16(at + i * 6 + 4, true); }
      const seed = seedAt(sx / Math.max(v, 1), sz / Math.max(v, 1)), v0 = vi;
      for (let i = 0; i < v; i++) { const y = dv.getInt16(at + i * 6 + 2, true); put(dv.getInt16(at + i * 6, true), y, dv.getInt16(at + i * 6 + 4, true), dv.getInt8(na + i * 3), dv.getInt8(na + i * 3 + 1), dv.getInt8(na + i * 3 + 2), Math.max(y - base, 0), h, seed); }
      for (let k = 0; k < cnt; k++) index[ii++] = v0 + (w === 2 ? dv.getUint16(ia + k * 2, true) : dv.getUint32(ia + k * 4, true));
    }
    ends[n] = ii; scores[n] = it.s;
  });
  return { position, normal, bld, index, ends, scores, lo, hi };
}

self.onmessage = async (e) => {
  const { id, url, ox, oz, unit } = e.data;
  try {
    const out = build(await read(url), ox, oz, unit);
    self.postMessage({ id, ok: true, ...out }, [out.position.buffer, out.normal.buffer, out.bld.buffer, out.index.buffer, out.ends.buffer, out.scores.buffer]);
  } catch (err) { self.postMessage({ id, ok: false, error: String(err?.message || err) }); }
};
