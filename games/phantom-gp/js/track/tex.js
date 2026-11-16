// tex.js — procedural detail textures (canvas). The only photographic inputs are the SPW orthophotos.
import * as THREE from 'three';

export function rng32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (t) => t * t * (3 - 2 * t);

// Tileable value-noise fBm, Float32Array in [0,1].
export function periodicNoise(size, baseFreq, octaves, seed, persistence = 0.5) {
  const out = new Float32Array(size * size);
  const rand = rng32(seed);
  let amp = 1, total = 0, freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array(freq * freq);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * freq, y0 = Math.floor(gy), fy = smooth(gy - y0);
      const r0 = (y0 % freq) * freq, r1 = ((y0 + 1) % freq) * freq;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * freq, x0 = Math.floor(gx), fx = smooth(gx - x0), x1 = (x0 + 1) % freq;
        const a = grid[r0 + (x0 % freq)], b = grid[r0 + x1], c = grid[r1 + (x0 % freq)], d = grid[r1 + x1];
        out[y * size + x] += amp * ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy);
      }
    }
    total += amp; amp *= persistence; freq *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

export function toTex(cv, { srgb = false, repeat = true, aniso = 16, mips = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = mips;
  if (!mips) t.minFilter = THREE.LinearFilter;
  return t;
}

function heightCanvas(size) {
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, size, size);
  return [c, ctx];
}

function wrapped(ctx, size, x, y, r, fn) {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    const px = x + ox, py = y + oy;
    if (px > -r && px < size + r && py > -r && py < size + r) fn(px, py);
  }
}

// height (R channel of a canvas, or Float32Array) -> tangent-space normal map canvas
export function normalFrom(height, size, strength) {
  let h = height;
  if (!(height instanceof Float32Array)) {
    const d = height.getContext('2d').getImageData(0, 0, size, size).data;
    h = new Float32Array(size * size);
    for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  }
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size), o = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xm = (x - 1 + size) % size, xp = (x + 1) % size, ym = (y - 1 + size) % size, yp = (y + 1) % size;
    const dx = (h[y * size + xp] - h[y * size + xm]) * strength, dy = (h[yp * size + x] - h[ym * size + x]) * strength;
    const l = Math.sqrt(dx * dx + dy * dy + 1), i = (y * size + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (-dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------- asphalt: 2 m tile. map = neutral detail (mean ~ 0.5 grey), normal from aggregate relief ---------- */
export function asphaltMaps(size = 1024) {
  const rand = rng32(11);
  const [c, ctx] = canvas(size, size);
  const [hc, hx] = heightCanvas(size);
  const n = periodicNoise(size, 6, 5, 3);
  const img = ctx.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = 104 + (n[i] - 0.5) * 46 + (rand() - 0.5) * 22;
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v + 1; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // aggregate: stones 3-9 mm (1 px ~ 2 mm)
  for (let i = 0; i < 52000; i++) {
    const x = rand() * size, y = rand() * size, r = 0.8 + rand() * rand() * 3.4;
    const g = 70 + rand() * 120, a = 0.35 + rand() * 0.55;
    const col = `rgba(${g | 0},${g | 0},${(g + 3 * rand()) | 0},${a})`, hcol = `rgba(${(150 + rand() * 105) | 0},0,0,0.8)`;
    wrapped(ctx, size, x, y, r, (px, py) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(px, py, r, r * (0.6 + rand() * 0.4), rand() * 3.14, 0, 6.283); ctx.fill(); });
    wrapped(hx, size, x, y, r, (px, py) => { hx.fillStyle = hcol; hx.beginPath(); hx.arc(px, py, r, 0, 6.283); hx.fill(); });
  }
  // dark binder pits
  for (let i = 0; i < 16000; i++) {
    const x = rand() * size, y = rand() * size, r = 0.6 + rand() * 1.6;
    wrapped(ctx, size, x, y, r, (px, py) => { ctx.fillStyle = 'rgba(18,18,20,0.5)'; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.283); ctx.fill(); });
    wrapped(hx, size, x, y, r, (px, py) => { hx.fillStyle = 'rgba(30,0,0,0.7)'; hx.beginPath(); hx.arc(px, py, r, 0, 6.283); hx.fill(); });
  }
  return { map: toTex(c, { srgb: true }), normalMap: toTex(normalFrom(hc, size, 3.2)) };
}

/* ---------- grass: 3 m tile, blades as short strokes; map is a multiplier-style detail ---------- */
export function grassMaps(size = 1024) {
  const rand = rng32(23);
  const [c, ctx] = canvas(size, size);
  const [hc, hx] = heightCanvas(size);
  const n = periodicNoise(size, 5, 4, 9);
  const img = ctx.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = n[i];
    d[i * 4] = 78 + v * 40; d[i * 4 + 1] = 98 + v * 44; d[i * 4 + 2] = 52 + v * 26; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = 'round'; hx.lineCap = 'round';
  for (let i = 0; i < 90000; i++) {
    const x = rand() * size, y = rand() * size, len = 3 + rand() * 9, a = rand() * 6.283;
    const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
    const t = rand(), dry = rand() < 0.18;
    const r = dry ? 150 + t * 50 : 60 + t * 70, g = dry ? 150 + t * 45 : 95 + t * 85, b = dry ? 90 + t * 30 : 40 + t * 40;
    const col = `rgba(${r | 0},${g | 0},${b | 0},${0.55 + rand() * 0.4})`, hv = (90 + rand() * 165) | 0;
    wrapped(ctx, size, x, y, len, (px, py) => { ctx.strokeStyle = col; ctx.lineWidth = 0.8 + rand() * 1.1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx, py + dy); ctx.stroke(); });
    wrapped(hx, size, x, y, len, (px, py) => { hx.strokeStyle = `rgba(${hv},0,0,0.7)`; hx.lineWidth = 1.4; hx.beginPath(); hx.moveTo(px, py); hx.lineTo(px + dx, py + dy); hx.stroke(); });
  }
  return { map: toTex(c, { srgb: true }), normalMap: toTex(normalFrom(hc, size, 2.4)) };
}

/* ---------- gravel: 1.5 m tile, crushed limestone ---------- */
export function gravelMaps(size = 1024) {
  const rand = rng32(37);
  const [c, ctx] = canvas(size, size);
  const [hc, hx] = heightCanvas(size);
  ctx.fillStyle = '#8f8a80'; ctx.fillRect(0, 0, size, size);
  hx.fillStyle = '#202020'; hx.fillRect(0, 0, size, size);
  for (let i = 0; i < 30000; i++) {
    const x = rand() * size, y = rand() * size, r = 2 + rand() * rand() * 7.5, t = rand();
    const g = 120 + t * 110, col = `rgb(${(g + 6) | 0},${(g + 2) | 0},${(g - 10) | 0})`, rot = rand() * 3.14, e = 0.55 + rand() * 0.45;
    const hv = (60 + rand() * 195) | 0;
    wrapped(ctx, size, x, y, r + 1, (px, py) => {
      ctx.fillStyle = 'rgba(40,36,30,0.55)'; ctx.beginPath(); ctx.ellipse(px + 1.2, py + 1.4, r, r * e, rot, 0, 6.283); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(px, py, r, r * e, rot, 0, 6.283); ctx.fill();
    });
    wrapped(hx, size, x, y, r + 1, (px, py) => {
      const gr = hx.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(${hv},0,0,1)`); gr.addColorStop(1, `rgba(${(hv * 0.45) | 0},0,0,1)`);
      hx.fillStyle = gr; hx.beginPath(); hx.ellipse(px, py, r, r * e, rot, 0, 6.283); hx.fill();
    });
  }
  return { map: toTex(c, { srgb: true }), normalMap: toTex(normalFrom(hc, size, 4.5)) };
}

/* ---------- generic tiling noise (R = fbm, G = fine fbm, B = cells) ---------- */
export function noiseTex(size = 512) {
  const a = periodicNoise(size, 4, 6, 71), b = periodicNoise(size, 32, 4, 72), c2 = periodicNoise(size, 12, 3, 73);
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) { d[i * 4] = a[i] * 255; d[i * 4 + 1] = b[i] * 255; d[i * 4 + 2] = c2[i] * 255; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { aniso: 4 });
}

/* ---------- galvanised steel ---------- */
export function steelTex(size = 256) {
  const rand = rng32(61), n = periodicNoise(size, 8, 4, 62), [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = 150 + (n[i] - 0.5) * 60 + (rand() - 0.5) * 14;
    d[i * 4] = v; d[i * 4 + 1] = v + 2; d[i * 4 + 2] = v + 5; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { srgb: true });
}

/* ---------- catch-fence mesh (alpha): diamond wire + cables. tile = 1 m x 1 m ---------- */
export function fenceTex(size = 256) {
  const [c, ctx] = canvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(176,180,184,1)'; ctx.lineWidth = 1.5;
  const n = 16, s = size / n;
  for (let i = -n; i < 2 * n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s + size, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i * s, size); ctx.lineTo(i * s + size, 0); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,124,128,1)'; ctx.lineWidth = 2.6;
  for (const y of [0.17, 0.5, 0.83]) { ctx.beginPath(); ctx.moveTo(0, y * size); ctx.lineTo(size, y * size); ctx.stroke(); }
  const t = toTex(c, { srgb: true, aniso: 16 });
  t.premultiplyAlpha = false;
  return t;
}

/* ---------- foliage: mid-range broadleaf spray (the other tree textures live in treetex.js) ---------- */
// broadleaf spray: a fan of small twigs carrying alternate leaves, anchored at the bottom centre (v = 0)
export function leafTex(size = 512) {
  const rand = rng32(131), [c, ctx] = canvas(size, size);
  ctx.clearRect(0, 0, size, size);
  const leaf = (x, y, rot, l, sh) => {
    const w = l * (0.46 + rand() * 0.14), g = 52 + sh * 108, r = 20 + sh * 62 + (rand() < 0.05 ? 30 : 0), b = 10 + sh * 22;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(l * 0.45, -w, l, 0); ctx.quadraticCurveTo(l * 0.45, w, 0, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(12,28,8,0.45)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(l, 0); ctx.stroke();
    ctx.restore();
  };
  const twig = (x, y, a, len, depth, layer) => {
    const n = Math.floor(len / 13); let px = x, py = y;
    ctx.strokeStyle = 'rgb(46,36,26)'; ctx.lineWidth = 1.2 + depth; ctx.beginPath(); ctx.moveTo(x, y);
    const pts = [];
    for (let i = 1; i <= n; i++) { a += (rand() - 0.5) * 0.22; px += Math.cos(a) * 13; py += Math.sin(a) * 13; ctx.lineTo(px, py); pts.push([px, py, a]); }
    ctx.stroke();
    pts.forEach(([qx, qy, qa], i) => {
      const sgn = i % 2 ? 1 : -1;
      leaf(qx, qy, qa + sgn * (0.75 + rand() * 0.5), 22 + rand() * 12, Math.pow(rand(), 1.3) * (0.4 + 0.6 * layer));
      if (rand() < 0.4) leaf(qx, qy, qa - sgn * (0.6 + rand() * 0.6), 18 + rand() * 10, Math.pow(rand(), 1.3) * (0.4 + 0.6 * layer));
      if (depth > 0 && i > 1 && i % 3 === 0 && i < n - 1) twig(qx, qy, qa + sgn * (0.55 + rand() * 0.35), len * (0.55 - i / n * 0.3), depth - 1, layer);
    });
    leaf(px, py, a, 26, 0.5 + 0.5 * layer);
  };
  const bx = size / 2, by = size * 0.97;
  for (let layer = 0; layer < 3; layer++) for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3 + (rand() - 0.5) * 0.8) * 0.3;
    twig(bx, by, a, size * (0.52 + rand() * 0.36) * (1 - Math.abs(k - 3) * 0.06), 2, layer / 2);
  }
  return toTex(c, { srgb: true, repeat: false, aniso: 8 });
}

/* ---------- tileable 3D noise for the cloud bake: R = Perlin-Worley shape, G = fine Worley for erosion ---------- */
export function cloudNoise3D(S = 64) {
  const n = S * S * S;
  const worley = (cells, seed) => {
    const rand = rng32(seed), pts = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = rand();
    const out = new Float32Array(n), k = cells / S;
    for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const px = (x + 0.5) * k, py = (y + 0.5) * k, pz = (z + 0.5) * k, cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
      let best = 9;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ix = cx + dx, iy = cy + dy, iz = cz + dz;
        const w = (((iz % cells) + cells) % cells * cells + ((iy % cells) + cells) % cells) * cells + ((ix % cells) + cells) % cells;
        const ex = ix + pts[w * 3] - px, ey = iy + pts[w * 3 + 1] - py, ez = iz + pts[w * 3 + 2] - pz, d = ex * ex + ey * ey + ez * ez;
        if (d < best) best = d;
      }
      out[(z * S + y) * S + x] = 1 - Math.min(1, Math.sqrt(best));
    }
    return out;
  };
  const value = (freq, seed) => {
    const rand = rng32(seed), g = new Float32Array(freq * freq * freq);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    const out = new Float32Array(n), k = freq / S, sm = (t) => t * t * (3 - 2 * t);
    const at = (x, y, z) => g[((z % freq) * freq + (y % freq)) * freq + (x % freq)];
    for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const px = x * k, py = y * k, pz = z * k, x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz), fx = sm(px - x0), fy = sm(py - y0), fz = sm(pz - z0);
      const l = (a, b, t) => a + (b - a) * t;
      out[(z * S + y) * S + x] = l(l(l(at(x0, y0, z0), at(x0 + 1, y0, z0), fx), l(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), fx), fy),
        l(l(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), fx), l(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), fx), fy), fz);
    }
    return out;
  };
  const w1 = worley(3, 1), w2 = worley(6, 2), w3 = worley(12, 3), w4 = worley(9, 4), w5 = worley(18, 5);
  const v1 = value(4, 6), v2 = value(8, 7), v3 = value(16, 8);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const perlin = (v1[i] * 0.55 + v2[i] * 0.3 + v3[i] * 0.15), wf = w1[i] * 0.6 + w2[i] * 0.28 + w3[i] * 0.12;
    const pw = Math.min(1, Math.max(0, (perlin - (wf - 1) * -0.0 - (1 - wf) * 0.62) / (1 - (1 - wf) * 0.62)));   // remap(perlin, 1 - worley, 1, 0, 1)-style
    data[i * 4] = pw * 255; data[i * 4 + 1] = (w4[i] * 0.62 + w5[i] * 0.38) * 255; data[i * 4 + 2] = wf * 255; data[i * 4 + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, S, S, S);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

/* ============================================================================================================
   Building materials. Each returns { map, normalMap, orm }: colour, relief, and a gloss / metal map (green =
   roughness, blue = metalness) so glass reflects the sky and the wall beside it does not. Nothing here is a
   photograph: every pixel is drawn.
   ============================================================================================================ */
const px = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
const orm = (rough, metal) => `rgb(255,${px(rough)},${px(metal)})`;
const grey = (h) => { const v = px(h); return `rgb(${v},${v},${v})`; };
function finish(c, hc, oc, size, strength, aniso = 8) {
  return { map: toTex(c, { srgb: true, aniso }), normalMap: toTex(normalFrom(hc, size, strength), { aniso }), orm: toTex(oc, { aniso }) };
}
// speckle a colour canvas and its height canvas with fine grain (plaster, concrete, paint)
function grain(ctx, hctx, size, seed, amt, hAmt) {
  const n = periodicNoise(size, 6, 5, seed), n2 = periodicNoise(size, 48, 2, seed + 1);
  const a = ctx.getImageData(0, 0, size, size), d = a.data, b = hctx.getImageData(0, 0, size, size), e = b.data;
  for (let i = 0; i < size * size; i++) {
    const k = 1 + (n[i] - 0.5) * amt + (n2[i] - 0.5) * amt * 0.5; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k;
    const h = e[i * 4] + (n2[i] - 0.5) * hAmt * 255; e[i * 4] = e[i * 4 + 1] = e[i * 4 + 2] = h;
  }
  ctx.putImageData(a, 0, 0); hctx.putImageData(b, 0, 0);
}
// one pane of glass at (x, y, w, h) in canvas pixels: dark, smooth and partly mirror; some have a blind part-way down
function pane(x, hx, ox, X, Y, Wd, Ht, rand, o = {}) {
  // (the glass is mostly mirror, and a mirror's colour is what it reflects with: a mid blue-grey, not the dark of the room behind)
  const g = x.createLinearGradient(0, Y, 0, Y + Ht), t = o.tint || [104, 128, 142], k = 0.86 + rand() * 0.28;
  g.addColorStop(0, `rgb(${t[0] * k},${t[1] * k},${t[2] * k})`); g.addColorStop(1, `rgb(${t[0] * k * 0.8},${t[1] * k * 0.8},${t[2] * k * 0.8})`);
  x.fillStyle = g; x.fillRect(X, Y, Wd, Ht);
  hx.fillStyle = grey(0.30); hx.fillRect(X, Y, Wd, Ht);
  ox.fillStyle = orm(0.05, o.metal ?? 0.78); ox.fillRect(X, Y, Wd, Ht);
  if (o.blinds !== false && rand() < (o.blindP ?? 0.3)) {
    const bh = Ht * (0.25 + rand() * 0.55), v = 150 + rand() * 60;
    x.fillStyle = `rgba(${v},${v - 4},${v - 14},0.92)`; x.fillRect(X + 2, Y + 2, Wd - 4, bh);
    for (let yy = Y + 4; yy < Y + bh; yy += 4) { x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(X + 2, yy, Wd - 4, 1); }
    ox.fillStyle = orm(0.35, 0.1); ox.fillRect(X + 2, Y + 2, Wd - 4, bh);
  }
}
function frame(x, hx, ox, X, Y, Wd, Ht, lw, col, hgt = 0.72) {
  x.strokeStyle = col; x.lineWidth = lw; x.strokeRect(X, Y, Wd, Ht);
  hx.strokeStyle = grey(hgt); hx.lineWidth = lw; hx.strokeRect(X, Y, Wd, Ht);
  ox.strokeStyle = orm(0.45, 0.5); ox.lineWidth = lw; ox.strokeRect(X, Y, Wd, Ht);
}

/* Facades for the ordinary buildings. u = metres / 12 (six bays), v = one storey per tile.
   0, 2: rendered walls with punched windows, sills and stains   1: ribbon glazing between metal panels
   3: profiled metal cladding (big sheds) with a strip of high windows */
export function facadeMaps(size = 512, style = 0) {
  const S = size, rand = rng32(180 + style), [c, x] = canvas(S, S), [hc, hx] = canvas(S, S), [oc, ox] = canvas(S, S);
  const wall = ['#b6b1a6', '#a4a9ae', '#d3cfc4', '#858a8f'][style % 4];
  x.fillStyle = wall; x.fillRect(0, 0, S, S);
  hx.fillStyle = grey(0.56); hx.fillRect(0, 0, S, S);
  ox.fillStyle = orm(style === 1 || style === 3 ? 0.5 : 0.9, style === 1 || style === 3 ? 0.35 : 0); ox.fillRect(0, 0, S, S);
  const cols = 6, cw = S / cols;
  if (style === 3) {
    // ribs every 0.25 m, sheet laps every storey
    for (let i = 0; i < 48; i++) { const X = i * S / 48; hx.fillStyle = grey(0.44); hx.fillRect(X, 0, S / 96, S); x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(X, 0, S / 96, S); }
    grain(x, hx, S, 190, 0.10, 0.02);
    const Y = S * 0.16, Ht = S * 0.16;
    for (let i = 0; i < cols; i++) if (i % 3 !== 2) { pane(x, hx, ox, i * cw + 3, Y, cw - 6, Ht, rand, { blinds: false }); frame(x, hx, ox, i * cw + 3, Y, cw - 6, Ht, 3, '#3a3d42'); }
    x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, S - 5, S, 5); hx.fillStyle = grey(0.42); hx.fillRect(0, S - 5, S, 5);
  } else if (style === 1) {
    grain(x, hx, S, 191, 0.06, 0.01);
    const Y = S * 0.20, Ht = S * 0.56;
    for (let i = 0; i < cols * 2; i++) { const X = i * cw / 2; pane(x, hx, ox, X + 1, Y, cw / 2 - 2, Ht, rand, { blindP: 0.18, tint: [96, 128, 138] }); frame(x, hx, ox, X + 1, Y, cw / 2 - 2, Ht, 3, '#c9ccce'); }
    // metal spandrel panels: a joint at every second mullion and along the floor line
    for (let i = 0; i < cols; i++) { x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(i * cw - 1, 0, 2, S); hx.fillStyle = grey(0.40); hx.fillRect(i * cw - 1, 0, 2, S); }
    x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(0, S - 3, S, 3); hx.fillStyle = grey(0.40); hx.fillRect(0, S - 3, S, 3);
  } else {
    grain(x, hx, S, 192 + style, 0.16, 0.035);
    const X0 = cw * 0.17, Wd = cw * 0.66, Y = S * 0.22, Ht = S * 0.52;
    for (let i = 0; i < cols; i++) {
      const X = i * cw + X0;
      // a stain under each sill, darker on the pale wall
      const g = x.createLinearGradient(0, Y + Ht, 0, S); g.addColorStop(0, 'rgba(50,46,40,0.30)'); g.addColorStop(1, 'rgba(50,46,40,0)');
      x.fillStyle = g; x.fillRect(X + rand() * 6, Y + Ht, Wd * (0.5 + rand() * 0.5), S - Y - Ht);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(X - 3, Y - 3, Wd + 6, Ht + 6);                    // the reveal's shadow
      pane(x, hx, ox, X, Y, Wd, Ht, rand);
      frame(x, hx, ox, X, Y, Wd, Ht, 4, style === 0 ? '#e7e6e1' : '#34373b');
      x.fillStyle = style === 0 ? '#e7e6e1' : '#34373b'; x.fillRect(X + Wd / 2 - 1.5, Y, 3, Ht); hx.fillStyle = grey(0.72); hx.fillRect(X + Wd / 2 - 1.5, Y, 3, Ht);
      x.fillStyle = '#c9c6bd'; x.fillRect(X - 6, Y + Ht + 2, Wd + 12, 6); hx.fillStyle = grey(0.86); hx.fillRect(X - 6, Y + Ht + 2, Wd + 12, 6);      // sill
    }
    // the floor line: a shallow groove with a dirt line below it
    x.fillStyle = 'rgba(0,0,0,0.20)'; x.fillRect(0, S - 4, S, 4); hx.fillStyle = grey(0.44); hx.fillRect(0, S - 4, S, 4);
  }
  return finish(c, hc, oc, S, 2.4);
}

/* Curtain wall of the pit buildings. u = one 6 m bay per tile (four panes), v = one floor per tile: a solid spandrel
   panel at the bottom, vision glass above, aluminium mullions. */
export function curtainWallMaps(size = 512) {
  const S = size, rand = rng32(210), [c, x] = canvas(S, S), [hc, hx] = canvas(S, S), [oc, ox] = canvas(S, S);
  x.fillStyle = '#1b2228'; x.fillRect(0, 0, S, S); hx.fillStyle = grey(0.5); hx.fillRect(0, 0, S, S); ox.fillStyle = orm(0.4, 0.5); ox.fillRect(0, 0, S, S);
  const n = 4, pw = S / n, sp = S * 0.24;                          // spandrel height (canvas bottom = floor level)
  for (let i = 0; i < n; i++) {
    pane(x, hx, ox, i * pw, 0, pw, S - sp, rand, { blindP: 0.22, tint: [92, 126, 140], metal: 0.82 });
    // spandrel: back-painted glass, a shade greyer and a little less mirror
    x.fillStyle = `rgb(${70 + rand() * 8},${88 + rand() * 8},${98 + rand() * 8})`; x.fillRect(i * pw, S - sp, pw, sp);
    ox.fillStyle = orm(0.12, 0.6); ox.fillRect(i * pw, S - sp, pw, sp); hx.fillStyle = grey(0.32); hx.fillRect(i * pw, S - sp, pw, sp);
  }
  const bar = (X, Y, Wd, Ht) => { x.fillStyle = '#c4c8ca'; x.fillRect(X, Y, Wd, Ht); hx.fillStyle = grey(0.78); hx.fillRect(X, Y, Wd, Ht); ox.fillStyle = orm(0.42, 0.75); ox.fillRect(X, Y, Wd, Ht); };
  for (let i = 0; i <= n; i++) bar(i * pw - 3, 0, 6, S);
  bar(0, S - sp - 3, S, 6); bar(0, 0, S, 5); bar(0, S - 5, S, 5);
  return finish(c, hc, oc, S, 2.0);
}

/* Roller shutter of a pit garage. A 0.8 m tile: eight slats (the piers frame the door, so no guide rails are drawn). */
export function shutterMaps(size = 256) {
  const S = size, [c, x] = canvas(S, S), [hc, hx] = canvas(S, S), [oc, ox] = canvas(S, S);
  x.fillStyle = '#d9dbdb'; x.fillRect(0, 0, S, S); ox.fillStyle = orm(0.5, 0.35); ox.fillRect(0, 0, S, S);
  const a = hx.createImageData(S, S), d = a.data;
  for (let y = 0; y < S; y++) { const f = (y / S * 8) % 1, h = 0.35 + 0.5 * Math.sin(Math.PI * f) - (f < 0.08 ? 0.3 : 0); for (let xx = 0; xx < S; xx++) { const i = (y * S + xx) * 4; d[i] = d[i + 1] = d[i + 2] = px(h); d[i + 3] = 255; } }
  hx.putImageData(a, 0, 0);
  for (let k = 0; k < 8; k++) { x.fillStyle = 'rgba(0,0,0,0.26)'; x.fillRect(0, k * S / 8, S, 2); x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(0, k * S / 8 + S / 16, S, 3); }
  grain(x, hx, S, 215, 0.08, 0.0);
  return finish(c, hc, oc, S, 3.0);
}

/* Painted cladding panels (pit buildings, cornices). A 3 m x 1.5 m panel per tile, joints all round, faint streaks. */
export function panelMaps(size = 256) {
  const S = size, rand = rng32(220), [c, x] = canvas(S, S), [hc, hx] = canvas(S, S), [oc, ox] = canvas(S, S);
  x.fillStyle = '#e3e4e1'; x.fillRect(0, 0, S, S); hx.fillStyle = grey(0.6); hx.fillRect(0, 0, S, S); ox.fillStyle = orm(0.42, 0.12); ox.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) { const X = rand() * S, g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(60,62,60,0.10)'); g.addColorStop(0.5 + rand() * 0.5, 'rgba(60,62,60,0)'); x.fillStyle = g; x.fillRect(X, 0, 2 + rand() * 6, S); }
  grain(x, hx, S, 221, 0.05, 0.006);
  for (const [X, Y, Wd, Ht] of [[0, 0, S, 2], [0, S - 2, S, 2], [0, 0, 2, S], [S - 2, 0, 2, S]]) { x.fillStyle = 'rgba(40,42,44,0.75)'; x.fillRect(X, Y, Wd, Ht); hx.fillStyle = grey(0.3); hx.fillRect(X, Y, Wd, Ht); }
  return finish(c, hc, oc, S, 2.2);
}

/* Cast concrete, a 4 m tile: formwork panels 2 m wide, pour lines every metre, tie holes, rain streaks from the top
   of each pour, grain. */
export function concreteMaps(size = 512) {
  const S = size, rand = rng32(51), [c, x] = canvas(S, S), [hc, hx] = canvas(S, S), [oc, ox] = canvas(S, S);
  x.fillStyle = '#a3a29c'; x.fillRect(0, 0, S, S); hx.fillStyle = grey(0.6); hx.fillRect(0, 0, S, S); ox.fillStyle = orm(0.9, 0); ox.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {          // each pour its own shade
    const v = (rand() - 0.5) * 22; x.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`; x.fillRect(i * S / 2, j * S / 4, S / 2, S / 4);
  }
  for (let i = 0; i < 26; i++) {
    const X = rand() * S, Y = Math.floor(rand() * 4) * S / 4, len = S / 4 * (0.4 + rand() * 1.4), g = x.createLinearGradient(0, Y, 0, Y + len);
    g.addColorStop(0, `rgba(38,36,32,${0.05 + rand() * 0.11})`); g.addColorStop(1, 'rgba(38,36,32,0)'); x.fillStyle = g; x.fillRect(X, Y, 3 + rand() * 16, len);
  }
  grain(x, hx, S, 52, 0.22, 0.05);
  for (let i = 0; i < 2; i++) { x.fillStyle = 'rgba(30,30,28,0.30)'; x.fillRect(i * S / 2, 0, 2, S); hx.fillStyle = grey(0.36); hx.fillRect(i * S / 2, 0, 2, S); }
  for (let j = 0; j < 4; j++) { x.fillStyle = 'rgba(30,30,28,0.22)'; x.fillRect(0, j * S / 4, S, 2); hx.fillStyle = grey(0.42); hx.fillRect(0, j * S / 4, S, 2); }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {          // tie holes
    const X = (i + 0.5) * S / 4, Y = (j + 0.5) * S / 4;
    x.fillStyle = 'rgba(20,20,18,0.45)'; x.beginPath(); x.arc(X, Y, S / 220, 0, 7); x.fill(); hx.fillStyle = grey(0.2); hx.beginPath(); hx.arc(X, Y, S / 170, 0, 7); hx.fill();
  }
  return finish(c, hc, oc, S, 2.6);
}
