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
    const v = 104 + (n[i] - 0.5) * 16 + (rand() - 0.5) * 26;
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

/* ---------- one beam of guardrail: u = along the beam (4 m), v = up its section. Weathered zinc, the lap joint and
   its bolts at the start, rain streaks, splash dirt along the bottom ---------- */
export function armcoMaps(W = 1024, H = 128) {
  const rand = rng32(83), n = periodicNoise(256, 6, 4, 84), n2 = periodicNoise(256, 24, 3, 85), [c, x] = canvas(W, H), [hc, hx] = canvas(W, H);
  const img = x.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const a = n[(j * 2 % 256) * 256 + (i % 256)], b = n2[(j % 256) * 256 + ((i * 2) % 256)];
    const v = 158 + (a - 0.5) * 44 + (b - 0.5) * 20 + (rand() - 0.5) * 9, k = (j * W + i) * 4;
    d[k] = v - 2; d[k + 1] = v; d[k + 2] = v + 4; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  for (let i = 0; i < 150; i++) {                    // rain streaks down the face
    const px = rand() * W, y0 = rand() * H * 0.6, len = 14 + rand() * 70, g = x.createLinearGradient(0, y0, 0, y0 + len);
    const dark = rand() < 0.7; g.addColorStop(0, dark ? `rgba(52,50,46,${0.1 + rand() * 0.22})` : 'rgba(232,234,236,0.16)'); g.addColorStop(1, 'rgba(60,58,52,0)');
    x.fillStyle = g; x.fillRect(px, y0, 1 + rand() * 3.5, len);
  }
  const g2 = x.createLinearGradient(0, H * 0.62, 0, H); g2.addColorStop(0, 'rgba(70,62,50,0)'); g2.addColorStop(1, 'rgba(70,62,50,0.42)');
  x.fillStyle = g2; x.fillRect(0, H * 0.62, W, H * 0.38);                       // dirt thrown up from the ground
  // the lap joint: the next beam's end lies over this one for 0.3 m
  const lap = Math.round(W * 0.078);
  x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, 0, lap, H);
  x.fillStyle = 'rgba(20,20,22,0.6)'; x.fillRect(lap, 0, 2, H); x.fillStyle = 'rgba(240,240,244,0.3)'; x.fillRect(lap - 2, 0, 2, H);
  hx.fillStyle = '#b0b0b0'; hx.fillRect(0, 0, lap, H);
  const bolt = (bx, by, r) => {
    x.fillStyle = 'rgba(110,70,40,0.22)'; x.fillRect(bx - r * 0.6, by, r * 1.2, r * 4.5);                 // a rust run under it
    x.beginPath(); x.arc(bx, by, r + 1.5, 0, 6.283); x.fillStyle = 'rgba(30,30,32,0.55)'; x.fill();
    x.beginPath(); x.arc(bx, by, r, 0, 6.283); x.fillStyle = '#8f9498'; x.fill();
    x.beginPath(); x.arc(bx - r * 0.25, by - r * 0.3, r * 0.45, 0, 6.283); x.fillStyle = 'rgba(235,238,240,0.6)'; x.fill();
    hx.beginPath(); hx.arc(bx, by, r, 0, 6.283); hx.fillStyle = '#ffffff'; hx.fill();
  };
  for (const u of [0.014, 0.062]) for (const v of [0.22, 0.4, 0.6, 0.78]) bolt(u * W, v * H, 4.2);
  bolt(0.038 * W, 0.5 * H, 5.2);                                                 // the one through the post
  const hd = hx.getImageData(0, 0, W, H).data, [nc, nx2] = canvas(W, H), ni = nx2.createImageData(W, H), o = ni.data;
  const hm = (i, j) => hd[(Math.min(H - 1, Math.max(0, j)) * W + ((i + W) % W)) * 4] / 255;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const dx = (hm(i + 1, j) - hm(i - 1, j)) * 2.4, dy = (hm(i, j + 1) - hm(i, j - 1)) * 2.4, l = Math.sqrt(dx * dx + dy * dy + 1), k = (j * W + i) * 4;
    o[k] = (-dx / l * 0.5 + 0.5) * 255; o[k + 1] = (-dy / l * 0.5 + 0.5) * 255; o[k + 2] = (1 / l * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  nx2.putImageData(ni, 0, 0);
  return { map: toTex(c, { srgb: true }), normalMap: toTex(nc) };
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
/* Curtain wall of the pit buildings, drawn (phone tier only: the other tiers build it pane by pane). u = one 6 m bay
   per tile (four panes), v = one floor per tile: a solid spandrel panel at the bottom, vision glass above, mullions. */
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

/* Roller shutter of a pit garage, drawn (phone tier only). A 0.8 m tile: eight slats (the piers frame the door). */
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

/* ============================================================================================================
   Plain surfaces for the modelled buildings (arch.js). Their windows, doors and trim are geometry, so these maps
   carry only the material itself. Render, cladding and panels are near white: a building's colour is its vertex
   colour. Brick and slate are drawn in their own colours and only shaded by the vertex colour.
   ============================================================================================================ */
// painted render, a 3 m tile: fine grain, soft weather streaks that fade in and out (so the tile repeats cleanly)
export function renderMaps(size = 512) {
  const S = size, rand = rng32(300), [c, x] = canvas(S, S), [hc, hx] = canvas(S, S), [oc, ox] = canvas(S, S);
  x.fillStyle = '#ecebe6'; x.fillRect(0, 0, S, S); hx.fillStyle = grey(0.6); hx.fillRect(0, 0, S, S); ox.fillStyle = orm(0.93, 0); ox.fillRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) {
    const X = rand() * S, w = 20 + rand() * 70, a = 0.012 + rand() * 0.022, g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(72,66,56,0)'); g.addColorStop(0.2 + rand() * 0.3, `rgba(72,66,56,${a})`); g.addColorStop(1, 'rgba(72,66,56,0)');
    x.fillStyle = g; x.fillRect(X, 0, w, S); x.fillRect(X - S, 0, w, S);
  }
  grain(x, hx, S, 301, 0.09, 0.06);
  return finish(c, hc, oc, S, 1.5);
}

// facing brick in stretcher bond, a tile of six bricks by sixteen courses (1.32 m x 1.2 m)
export function brickMaps(size = 512) {
  const S = size, rand = rng32(310), [c, x] = canvas(S, S), [hc, hx] = canvas(S, S), [oc, ox] = canvas(S, S);
  x.fillStyle = '#aaa59a'; x.fillRect(0, 0, S, S); hx.fillStyle = grey(0.4); hx.fillRect(0, 0, S, S); ox.fillStyle = orm(0.96, 0); ox.fillRect(0, 0, S, S);
  const rows = 16, cols = 6, ch = S / rows, bw = S / cols, m = Math.max(2, S / 128);
  for (let j = 0; j < rows; j++) for (let i = -1; i < cols; i++) {
    const X = (i + (j % 2 ? 0.5 : 0)) * bw + m / 2, Y = j * ch + m / 2, k = 0.86 + rand() * 0.24, burnt = rand() < 0.12 ? 0.78 : 1;
    const r = 146 * k * burnt, g = (88 + rand() * 12) * k * burnt, b = (72 + rand() * 10) * k * burnt, hh = 0.62 + rand() * 0.08;
    for (const dx of [0, S]) {
      x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(X + dx, Y, bw - m, ch - m);
      hx.fillStyle = grey(hh); hx.fillRect(X + dx, Y, bw - m, ch - m);
      ox.fillStyle = orm(0.86 + rand() * 0.08, 0); ox.fillRect(X + dx, Y, bw - m, ch - m);
    }
  }
  grain(x, hx, S, 311, 0.12, 0.05);
  return finish(c, hc, oc, S, 2.6);
}

// profiled steel cladding, a 1.6 m x 3 m tile: eight trapezoid ribs, a sheet lap along the top edge, fixings
export function claddingMaps(size = 512) {
  const S = size, rand = rng32(320), [c, x] = canvas(S, S), [hc, hx] = canvas(S, S), [oc, ox] = canvas(S, S);
  x.fillStyle = '#e4e6e6'; x.fillRect(0, 0, S, S); ox.fillStyle = orm(0.44, 0.3); ox.fillRect(0, 0, S, S);
  const a = hx.createImageData(S, S), d = a.data, prof = (f) => (f < 0.36 ? 0.76 : f < 0.46 ? 0.76 - (f - 0.36) * 3.2 : f < 0.9 ? 0.44 : 0.44 + (f - 0.9) * 3.2);
  for (let X = 0; X < S; X++) { const h = px(prof((X / S * 8) % 1)); for (let Y = 0; Y < S; Y++) { const i = (Y * S + X) * 4; d[i] = d[i + 1] = d[i + 2] = h; d[i + 3] = 255; } }
  hx.putImageData(a, 0, 0);
  for (let k = 0; k < 8; k++) { x.fillStyle = 'rgba(0,0,0,0.085)'; x.fillRect((k + 0.46) * S / 8, 0, 0.44 * S / 8, S); }
  for (let i = 0; i < 10; i++) { const X = rand() * S, g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(60,62,60,0)'); g.addColorStop(0.3, `rgba(60,62,60,${0.03 + rand() * 0.05})`); g.addColorStop(1, 'rgba(60,62,60,0)'); x.fillStyle = g; x.fillRect(X, 0, 2 + rand() * 7, S); }
  x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, 0, S, 2); hx.fillStyle = grey(0.36); hx.fillRect(0, 0, S, 2);
  for (let k = 0; k < 8; k++) for (const Y of [S * 0.08, S * 0.42, S * 0.75]) { x.fillStyle = 'rgba(40,42,44,0.55)'; x.beginPath(); x.arc((k + 0.18) * S / 8, Y, S / 300, 0, 7); x.fill(); }
  grain(x, hx, S, 321, 0.05, 0.0);
  return finish(c, hc, oc, S, 3.2);
}

// roof slates, a 1.2 m tile: six courses, each slate its own shade, the lower edge of every course standing proud
export function slateMaps(size = 512) {
  const S = size, rand = rng32(330), [c, x] = canvas(S, S), [hc, hx] = canvas(S, S), [oc, ox] = canvas(S, S);
  x.fillStyle = '#34363a'; x.fillRect(0, 0, S, S); ox.fillStyle = orm(0.7, 0); ox.fillRect(0, 0, S, S);
  const rows = 6, cols = 4, ch = S / rows, sw = S / cols;
  for (let j = 0; j < rows; j++) {
    const g = hx.createLinearGradient(0, j * ch, 0, (j + 1) * ch); g.addColorStop(0, grey(0.34)); g.addColorStop(0.92, grey(0.7)); g.addColorStop(1, grey(0.2));
    hx.fillStyle = g; hx.fillRect(0, j * ch, S, ch);
    for (let i = -1; i < cols; i++) {
      const X = (i + (j % 2 ? 0.5 : 0)) * sw, k = 0.9 + rand() * 0.2, v = [58 * k, 60 * k, (63 + rand() * 4) * k];
      for (const dx of [0, S]) {
        x.fillStyle = `rgb(${v[0]},${v[1]},${v[2]})`; x.fillRect(X + dx + 1, j * ch, sw - 2, ch - 1);
        hx.fillStyle = grey(0.24); hx.fillRect(X + dx - 1, j * ch, 2, ch);
      }
    }
    x.fillStyle = 'rgba(0,0,0,0.42)'; x.fillRect(0, (j + 1) * ch - 2, S, 2);
  }
  grain(x, hx, S, 331, 0.14, 0.03);
  return finish(c, hc, oc, S, 2.8);
}

