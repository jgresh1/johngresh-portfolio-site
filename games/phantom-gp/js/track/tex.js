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

/* ---------- concrete / galvanised steel / painted panels ---------- */
export function concreteTex(size = 512) {
  const rand = rng32(51), n = periodicNoise(size, 4, 6, 52), [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = 150 + (n[i] - 0.5) * 70 + (rand() - 0.5) * 16;
    d[i * 4] = v; d[i * 4 + 1] = v - 2; d[i * 4 + 2] = v - 7; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) {           // rain streaks
    const x = rand() * size, w = 2 + rand() * 9;
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, 'rgba(40,38,34,0.28)'); g.addColorStop(0.6 + rand() * 0.4, 'rgba(40,38,34,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, w, size);
  }
  return toTex(c, { srgb: true });
}

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

/* ---------- facade: window bands. u = metres/12, v = one storey per tile ---------- */
export function facadeTex(size = 512, style = 0) {
  const rand = rng32(80 + style), [c, ctx] = canvas(size, size);
  const wall = ['#b9b6ae', '#8d9299', '#d6d2c8', '#6f7479'][style % 4];
  ctx.fillStyle = wall; ctx.fillRect(0, 0, size, size);
  const n = periodicNoise(size, 4, 5, 90 + style), img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < size * size; i++) { const k = 0.86 + n[i] * 0.28; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; }
  ctx.putImageData(img, 0, 0);
  const cols = 6, cw = size / cols;
  for (let i = 0; i < cols; i++) {
    const g = ctx.createLinearGradient(0, size * 0.2, 0, size * 0.78);
    const b = 30 + rand() * 30;
    g.addColorStop(0, `rgb(${b + 40},${b + 62},${b + 84})`); g.addColorStop(1, `rgb(${b},${b + 8},${b + 18})`);
    ctx.fillStyle = g; ctx.fillRect(i * cw + cw * 0.1, size * 0.22, cw * 0.8, size * 0.56);
    ctx.strokeStyle = 'rgba(30,32,36,0.9)'; ctx.lineWidth = 3; ctx.strokeRect(i * cw + cw * 0.1, size * 0.22, cw * 0.8, size * 0.56);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, size * 0.97, size, size * 0.03);
  return toTex(c, { srgb: true });
}

/* ---------- pit building: 24 m of frontage, full height. Garages at the bottom, glazed floors above ---------- */
export function pitFacadeTex(size = 1024) {
  const rand = rng32(140), [c, ctx] = canvas(size, size);
  ctx.fillStyle = '#d9dad6'; ctx.fillRect(0, 0, size, size);
  const gTop = size * 0.70, gH = size * 0.30;                 // garage band (canvas y grows downward; v = 0 is the bottom)
  for (let i = 0; i < 4; i++) {
    const x0 = i * size / 4 + 14, w = size / 4 - 28;
    ctx.fillStyle = '#eceded'; ctx.fillRect(x0, gTop + 34, w, gH - 34);
    for (let y = gTop + 40; y < size - 6; y += 9) { ctx.fillStyle = `rgba(0,0,0,${0.10 + rand() * 0.05})`; ctx.fillRect(x0, y, w, 2); }
    ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 6; ctx.strokeRect(x0, gTop + 34, w, gH - 34);
    ctx.fillStyle = '#f6f6f2'; ctx.fillRect(x0 + w / 2 - 34, gTop + 6, 68, 24);
  }
  ctx.fillStyle = '#b3121a'; ctx.fillRect(0, gTop - 26, size, 26);
  for (let f = 0; f < 3; f++) {                                 // three glazed floors
    const y0 = 60 + f * (gTop - 100) / 3, h = (gTop - 100) / 3 - 22;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#5d7890'); g.addColorStop(1, '#1d2732');
    ctx.fillStyle = g; ctx.fillRect(0, y0, size, h);
    ctx.fillStyle = 'rgba(210,214,216,0.95)';
    for (let x = 0; x < size; x += size / 16) ctx.fillRect(x - 2, y0, 4, h);
    ctx.fillRect(0, y0 + h * 0.5 - 1, size, 2);
  }
  ctx.fillStyle = '#f1f1ee'; ctx.fillRect(0, 0, size, 44);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 44, size, 5);
  return toTex(c, { srgb: true });
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
