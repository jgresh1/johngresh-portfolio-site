// Procedural textures. Everything is drawn on canvas at load: no image files.
import * as THREE from 'three';
import { smooth, clamp, DETAIL } from './geo.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export function rng(seed = 1) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (x, y, z = 0) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  if (o.wrapS) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = o.aniso ?? 16;
  if (o.channel) t.channel = o.channel;
  t.needsUpdate = true;
  return t;
}
const FONT_HEAVY = '"Arial Black", "Segoe UI Black", "Helvetica Neue", Impact, Arial, sans-serif';
const FONT_TECH = 'Bahnschrift, "DIN Alternate", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

// ---------------------------------------------------------------- carbon fibre (2x2 twill)
export function carbon(repeatM = 0.016) {
  const S = 256, T = 4, tw = S / T;
  const cc = mk(S, S), cn = mk(S, S), ca = mk(S, S);
  const gc = cc.getContext('2d'), gn = cn.getContext('2d'), ga = ca.getContext('2d');
  const dc = gc.createImageData(S, S), dn = gn.createImageData(S, S), da = ga.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (x / tw) | 0, j = (y / tw) | 0, fx = (x % tw + 0.5) / tw, fy = (y % tw + 0.5) / tw;
    const warp = ((((j - i) % 4) + 4) % 4) < 2;
    const fa = warp ? fx : fy, fl = warp ? fy : fx, ac = 2 * fa - 1;
    const edge = smooth(0, 0.16, 1 - Math.abs(ac));
    const fil = hash(i * 7 + (warp ? 0 : 31), j * 13, Math.floor(fa * 10));
    const alb = (warp ? 0.115 : 0.085) * (0.7 + 0.55 * fil) * (0.3 + 0.7 * edge);
    const k = (y * S + x) * 4, v = clamp(alb * 255, 0, 255);
    dc.data[k] = v; dc.data[k + 1] = v; dc.data[k + 2] = v * 1.03; dc.data[k + 3] = 255;
    const ka = 0.6 * ac, kl = 0.3 * Math.pow(2 * fl - 1, 3);
    let nx = warp ? ka : kl, ny = warp ? kl : ka; const nl = Math.hypot(nx, ny, 1);
    nx /= nl; ny /= nl;
    dn.data[k] = 127.5 + 127.5 * nx; dn.data[k + 1] = 127.5 - 127.5 * ny; dn.data[k + 2] = 127.5 + 127.5 / nl; dn.data[k + 3] = 255;
    da.data[k] = warp ? 128 : 255; da.data[k + 1] = warp ? 255 : 128; da.data[k + 2] = 255 * (0.25 + 0.75 * edge); da.data[k + 3] = 255;
  }
  gc.putImageData(dc, 0, 0); gn.putImageData(dn, 0, 0); ga.putImageData(da, 0, 0);
  const r = [1 / repeatM, 1 / repeatM];
  return { map: tex(cc, { repeat: r }), normal: tex(cn, { srgb: false, repeat: r }), aniso: tex(ca, { srgb: false, repeat: r }) };
}

// ---------------------------------------------------------------- paint flakes / orange peel
export function flakes() {
  const S = 256, c = mk(S, S), g = c.getContext('2d'), d = g.createImageData(S, S), r = rng(7);
  for (let i = 0; i < S * S; i++) {
    const a = r() * Math.PI * 2, m = Math.pow(r(), 2.2) * 0.45, nx = Math.cos(a) * m, ny = Math.sin(a) * m, nz = Math.sqrt(1 - nx * nx - ny * ny);
    d.data[i * 4] = 127.5 + 127.5 * nx; d.data[i * 4 + 1] = 127.5 + 127.5 * ny; d.data[i * 4 + 2] = 127.5 + 127.5 * nz; d.data[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return tex(c, { srgb: false, repeat: [14, 14] });
}
function valueNoise(S, cells, seed) {
  const r = rng(seed), grid = new Float32Array(cells * cells); for (let i = 0; i < grid.length; i++) grid[i] = r();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gx = x / S * cells, gy = y / S * cells, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const g = (ix, iy) => grid[((iy % cells + cells) % cells) * cells + ((ix % cells + cells) % cells)];
    out[y * S + x] = (g(x0, y0) * (1 - sx) + g(x0 + 1, y0) * sx) * (1 - sy) + (g(x0, y0 + 1) * (1 - sx) + g(x0 + 1, y0 + 1) * sx) * sy;
  }
  return out;
}
export function orangePeel() {
  const S = 256, c = mk(S, S), g = c.getContext('2d'), d = g.createImageData(S, S);
  const h1 = valueNoise(S, 24, 3), h2 = valueNoise(S, 56, 5);
  const H = (x, y) => { const k = ((y + S) % S) * S + (x + S) % S; return h1[k] * 0.7 + h2[k] * 0.3; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const nx = (H(x - 1, y) - H(x + 1, y)) * 1.6, ny = (H(x, y - 1) - H(x, y + 1)) * 1.6, l = Math.hypot(nx, ny, 1), k = (y * S + x) * 4;
    d.data[k] = 127.5 + 127.5 * nx / l; d.data[k + 1] = 127.5 - 127.5 * ny / l; d.data[k + 2] = 127.5 + 127.5 / l; d.data[k + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return tex(c, { srgb: false, repeat: [9, 9] });
}

// ---------------------------------------------------------------- tyres
export function tireSidewall(compound = '#f5c518', brand = 'JOHN GRESH', sub = 'LUKE CARLAN') {
  const W = 4096, H = 256;
  const c = mk(W, H), g = c.getContext('2d'), b = mk(W, H), gb = b.getContext('2d');
  g.fillStyle = '#131313'; g.fillRect(0, 0, W, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, W, H);
  // subtle scuff variation
  const r = rng(11);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 0 : 60},${r() < 0.5 ? 0 : 60},${r() < 0.5 ? 0 : 60},${0.03 + r() * 0.05})`; g.fillRect(r() * W, r() * H, 40 + r() * 400, 1 + r() * 3); }
  // fine concentric ribs near bead and shoulder (bump only)
  gb.strokeStyle = '#a0a0a0'; gb.lineWidth = 2;
  for (const y of [14, 22, 30, 228, 236, 244]) { gb.beginPath(); gb.moveTo(0, y); gb.lineTo(W, y); gb.stroke(); }
  // compound bands, broken around the wordmarks
  const bands = [[58, 9], [190, 9]];
  g.font = `italic 900 132px ${FONT_HEAVY}`; const bw = Math.max(620, g.measureText(brand).width + 130);
  const gaps = [[W * 0.25, bw], [W * 0.75, bw], [0, 520], [W * 0.5, 520], [W, 520]];
  for (const [y, h] of bands) {
    g.fillStyle = compound; gb.fillStyle = '#b4b4b4';
    let x = 0;
    const cuts = gaps.map(([cx, w]) => [cx - w / 2, cx + w / 2]).sort((p, q) => p[0] - q[0]);
    for (const [a, e] of cuts) { if (a > x) { g.fillRect(x, y, a - x, h); gb.fillRect(x, y, a - x, h); } x = Math.max(x, e); }
    if (x < W) { g.fillRect(x, y, W - x, h); gb.fillRect(x, y, W - x, h); }
  }
  const text = (s, cx, cy, px, col, font, italic = true) => {
    for (const [ctx, style] of [[g, col], [gb, '#f0f0f0']]) {
      ctx.font = `${italic ? 'italic ' : ''}900 ${px}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = style;
      ctx.fillText(s, cx, cy);
    }
  };
  for (const cx of [W * 0.25, W * 0.75]) text(brand, cx, 130, 132, compound, FONT_HEAVY);
  for (const cx of [0, W * 0.5, W]) { text(sub, cx, 110, 44, '#e9e9e9', FONT_TECH, false); text('305/720 R18  ·  M', cx, 158, 28, '#a9a9a9', FONT_TECH, false); }
  const map = tex(c), bump = tex(b, { srgb: false });
  map.wrapS = bump.wrapS = THREE.RepeatWrapping;
  return { map, bump };
}
export function tireTread() {
  const S = 512, c = mk(S, S), g = c.getContext('2d'), d = g.createImageData(S, S);
  const n1 = valueNoise(S, 48, 21), n2 = valueNoise(S, 160, 22), n3 = valueNoise(S, 8, 23);
  for (let i = 0; i < S * S; i++) { const v = 212 + 22 * (n1[i] - 0.5) + 34 * (n2[i] - 0.5) + 26 * (n3[i] - 0.5); d.data[i * 4] = v; d.data[i * 4 + 1] = v; d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
  g.putImageData(d, 0, 0);
  const r = rng(5);
  for (let i = 0; i < 160; i++) { const k = r() < 0.5 ? 255 : 0; g.fillStyle = `rgba(${k},${k},${k},${0.015 + r() * 0.035})`; g.fillRect(r() * S, 0, 1 + r() * 2, S); }
  for (const x of [0.25, 0.75]) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(S * x - 1, 0, 2.5, S); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(S * x + 2, 0, 2, S); }
  return tex(c, { srgb: false, repeat: [4, 2] });
}

// ---------------------------------------------------------------- livery masks
// Evaluates fn(x, y, z, out) at every texel of a loft's normalised uv1 grid.
export function liveryMask(rings, fn, W = 2048, H = 1024) {
  W = Math.round(W * DETAIL.tex); H = Math.round(H * DETAIL.tex);
  const N = rings.length, M = rings[0].length, flat = new Float32Array(N * M * 3);
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const p = rings[i][j], k = (i * M + j) * 3; flat[k] = p.x; flat[k + 1] = p.y; flat[k + 2] = p.z; }
  const c = mk(W, H), g = c.getContext('2d'), d = g.createImageData(W, H), out = [0, 0, 0, 1];
  for (let py = 0; py < H; py++) {
    const fj = (1 - (py + 0.5) / H) * (M - 1), j0 = Math.min(Math.floor(fj), M - 2), tj = fj - j0;
    for (let px = 0; px < W; px++) {
      const fi = (px + 0.5) / W * (N - 1), i0 = Math.min(Math.floor(fi), N - 2), ti = fi - i0;
      const a = (i0 * M + j0) * 3, b = a + 3, cc = a + M * 3, dd = cc + 3;
      const w00 = (1 - ti) * (1 - tj), w01 = (1 - ti) * tj, w10 = ti * (1 - tj), w11 = ti * tj;
      out[3] = 1;
      fn(flat[a] * w00 + flat[b] * w01 + flat[cc] * w10 + flat[dd] * w11,
        flat[a + 1] * w00 + flat[b + 1] * w01 + flat[cc + 1] * w10 + flat[dd + 1] * w11,
        flat[a + 2] * w00 + flat[b + 2] * w01 + flat[cc + 2] * w10 + flat[dd + 2] * w11, out);
      const k = (py * W + px) * 4;
      d.data[k] = out[0] * 255; d.data[k + 1] = out[1] * 255; d.data[k + 2] = out[2] * 255; d.data[k + 3] = out[3] * 255;
    }
  }
  g.putImageData(d, 0, 0);
  return tex(c, { srgb: false, channel: 1, aniso: 16 });
}

// ---------------------------------------------------------------- decals
export function textDecal(text, o = {}) {
  const px = o.px || 180, font = `${o.italic === false ? '' : 'italic '}${o.weight || 900} ${px}px ${o.font || FONT_HEAVY}`;
  const m = mk(8, 8).getContext('2d'); m.font = font; if (o.spacing) m.letterSpacing = o.spacing;
  const mt = m.measureText(text);
  const tw = Math.ceil(Math.max(mt.width, (mt.actualBoundingBoxLeft || 0) + (mt.actualBoundingBoxRight || 0))), pad = Math.round(px * 0.34);
  const W = tw + pad * 2, H = Math.round(px * 1.2);
  const c = mk(W, H), g = c.getContext('2d');
  g.font = font; if (o.spacing) g.letterSpacing = o.spacing;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (o.stroke) { g.lineWidth = px * 0.09; g.strokeStyle = o.stroke; g.lineJoin = 'round'; g.strokeText(text, W / 2, H / 2 + px * 0.04); }
  g.fillStyle = o.color || '#ffffff'; g.fillText(text, W / 2, H / 2 + px * 0.04);
  if (o.underline) { g.fillStyle = o.underline; g.fillRect(pad, H - px * 0.16, tw, px * 0.05); }
  return { map: tex(c), aspect: W / H };
}
// A stuck-on legend label: white lettering on a matt charcoal sticker with a pale keyline, corners rounded (clear
// outside them). For the wheel's thumb buttons, where the legend has to read as something lying on the surface.
export function labelDecal(text, o = {}) {
  const px = o.px || 96, sp = Math.round(px * 0.1), font = `700 ${px}px ${FONT_HEAVY}`;
  const m = mk(8, 8).getContext('2d'); m.font = font; m.letterSpacing = sp + 'px';
  const tw = Math.ceil(m.measureText(text).width), pad = Math.round(px * 0.42), W = tw + pad * 2, H = Math.round(px * 1.5);
  const c = mk(W, H), g = c.getContext('2d');
  g.fillStyle = '#2b2d32'; g.beginPath(); g.roundRect(2, 2, W - 4, H - 4, px * 0.27); g.fill();
  g.strokeStyle = '#8d9199'; g.lineWidth = px * 0.045; g.beginPath(); g.roundRect(px * 0.1, px * 0.1, W - px * 0.2, H - px * 0.2, px * 0.2); g.stroke();
  g.font = font; g.letterSpacing = sp + 'px'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
  g.fillText(text, W / 2 + sp / 2, H / 2 + px * 0.04);
  return { map: tex(c), aspect: W / H };
}
export function numberRoundel(num, o = {}) {
  const S = 512, c = mk(S, S), g = c.getContext('2d');
  g.fillStyle = o.bg || '#ffffff'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2); g.fill();
  g.lineWidth = S * 0.03; g.strokeStyle = o.ring || '#111'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.445, 0, Math.PI * 2); g.stroke();
  g.fillStyle = o.color || '#101010'; g.font = `italic 900 ${S * 0.52}px ${FONT_HEAVY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), S / 2 - S * 0.02, S / 2 + S * 0.035);
  return { map: tex(c), aspect: 1 };
}
// Row of louvre slots (alpha cut-out look, painted dark).
export function louvres(n = 9) {
  const W = 512, H = 256, c = mk(W, H), g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const x = 20 + i * (W - 40) / n, w = (W - 40) / n * 0.52;
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.97)'); gr.addColorStop(0.7, 'rgba(8,8,8,0.92)'); gr.addColorStop(1, 'rgba(40,40,40,0.75)');
    g.fillStyle = gr; g.beginPath(); g.roundRect(x, 26, w, H - 52, w * 0.45); g.fill();
  }
  return { map: tex(c), aspect: W / H };
}

// ---------------------------------------------------------------- parts
export function wheelCover(accent = '#f5c518') {
  const S = 1024, c = mk(S, S), g = c.getContext('2d'), R = S / 2;
  g.fillStyle = '#0d0d0e'; g.fillRect(0, 0, S, S);
  const ring = (r, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(R, R, r, 0, Math.PI * 2); g.stroke(); };
  ring(R * 0.955, R * 0.022, accent);
  ring(R * 0.905, R * 0.006, '#3a3a3c');
  ring(R * 0.30, R * 0.012, '#2c2c2e');
  // arc text
  // text on an arc, centred on midDeg (0 = top). `flip` turns the letters the other way up so text along the bottom reads upright.
  const arcText = (s, radius, midDeg, px, col, weight = 700, flip = false) => {
    g.font = `${weight} ${px}px ${FONT_TECH}`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    const gap = px * 0.08, dir = flip ? -1 : 1;
    let span = -gap / radius; for (const ch of s) span += (g.measureText(ch).width + gap) / radius;
    let ang = midDeg * Math.PI / 180 - dir * span / 2;
    for (const ch of s) { const w = g.measureText(ch).width; ang += dir * (w / 2) / radius; g.save(); g.translate(R + Math.sin(ang) * radius, R - Math.cos(ang) * radius); g.rotate(ang + (flip ? Math.PI : 0)); g.fillText(ch, 0, 0); g.restore(); ang += dir * (w / 2 + gap) / radius; }
  };
  arcText('JOHN  GRESH', R * 0.78, 0, 92, '#e4e4e4', 800);
  arcText('LUKE  CARLAN', R * 0.8, 180, 30, '#9a9a9e', 700, true);
  // radial fastener marks
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillStyle = '#28282a'; g.beginPath(); g.arc(R + Math.cos(a) * R * 0.62, R + Math.sin(a) * R * 0.62, 7, 0, Math.PI * 2); g.fill(); }
  return tex(c);
}
// Steering wheel faceplate (0.16 x 0.115 m): printed legends and the LCD. Returns the colour map and an
// emissive map that holds only the screen and the shift lights.
export function steeringFace() {
  // (drawn in 1024 x 736 units; the canvas itself is twice that on the full-detail car, where the film looks at it from 25 cm)
  const K = DETAIL.tex >= 1 ? 2 : 1, W = 1024, H = 736, c = mk(W * K, H * K), g = c.getContext('2d'), e = mk(W * K, H * K), ge = e.getContext('2d');
  g.scale(K, K); ge.scale(K, K);
  g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, W, H); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const PX = W / 0.16, px = (m) => m * PX, cx = (x) => W / 2 + x * PX, cy = (y) => H / 2 - y * PX;
  const sx = cx(-0.045), sy = cy(0.047), sw = px(0.09), sh = px(0.058);
  for (const ctx of [g, ge]) { ctx.fillStyle = '#03070b'; ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 14); ctx.fill(); }
  g.strokeStyle = '#2b2e34'; g.lineWidth = 5; g.beginPath(); g.roundRect(sx - 4, sy - 4, sw + 8, sh + 8, 16); g.stroke();
  const txt = (t, x, y, size, col, weight = 700) => { for (const ctx of [g, ge]) { ctx.fillStyle = col; ctx.font = `${weight} ${size}px ${FONT_TECH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, cx(x), cy(y)); } };
  txt('N', 0, 0.0165, 150, '#eaf6ff');
  txt('BBAL 56.5', -0.029, 0.0375, 28, '#7fd4ff'); txt('ERS 100%', 0.029, 0.0375, 28, '#ffd24a');
  txt('+0.000', -0.03, -0.004, 30, '#8fff9a'); txt('L 00', 0.03, -0.004, 30, '#e0e0e0');
  for (let i = 0; i < 20; i++) { const col = i < 9 ? '#19ff4a' : i < 15 ? '#ffd024' : '#ff3030'; for (const ctx of [g, ge]) { ctx.fillStyle = i < 12 ? col : '#18222b'; ctx.fillRect(cx(-0.04) + i * px(0.004), cy(0.0445), px(0.0031), px(0.0022)); } }
  const lc = ['#19ff4a', '#19ff4a', '#19ff4a', '#19ff4a', '#19ff4a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#3d6bff', '#3d6bff', '#3d6bff', '#3d6bff', '#3d6bff'];
  lc.forEach((col, i) => {
    const x = cx(-0.042 + i * 0.006), y = cy(0.0535);
    g.fillStyle = '#16171a'; g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill();
    for (const ctx of [g, ge]) { ctx.globalAlpha = i < 9 ? 1 : 0.16; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  });
  g.fillStyle = '#9a9da3'; g.font = `600 17px ${FONT_TECH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [t, x, y] of [['RADIO', -0.064, 0.0415], ['PIT', -0.064, 0.0195], ['MARK', -0.064, -0.0025], ['DRINK', -0.064, -0.0245], ['DRS', 0.064, 0.0415], ['OT', 0.064, 0.0195], ['ACK', 0.064, -0.0025], ['PC', 0.064, -0.0245], ['BRK', -0.036, -0.0515], ['DIFF', 0, -0.0535], ['ENG', 0.036, -0.0515]]) g.fillText(t, cx(x), cy(y));
  for (const [x, y] of [[-0.036, -0.034], [0, -0.039], [0.036, -0.034]]) for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.fillStyle = i === 9 ? '#ffd24a' : '#777'; g.fillRect(cx(x) + Math.cos(a) * px(0.0138) - 2, cy(y) + Math.sin(a) * px(0.0138) - 2, 4, 4); }
  return { map: tex(c), emissive: tex(e) };
}
export function ledPanel(cols = 7, rows = 9) {
  const W = 128, H = 160, c = mk(W, H), g = c.getContext('2d');
  g.fillStyle = '#120000'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = (i + 0.5) / cols * W, y = (j + 0.5) / rows * H, gr = g.createRadialGradient(x, y, 0, x, y, 8);
    gr.addColorStop(0, '#ffb0a0'); gr.addColorStop(0.35, '#ff2010'); gr.addColorStop(1, 'rgba(120,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - 9, y - 9, 18, 18);
  }
  return tex(c);
}
export function radiator() {
  const S = 256, c = mk(S, S), g = c.getContext('2d');
  g.fillStyle = '#050505'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 4) { g.fillStyle = y % 16 === 0 ? '#3a3d42' : '#17181a'; g.fillRect(0, y, S, 1.5); }
  for (let x = 0; x < S; x += 32) { g.fillStyle = '#2b2d31'; g.fillRect(x, 0, 3, S); }
  return tex(c, { repeat: [5, 5] });
}
export function heatTint() {
  const W = 256, H = 16, c = mk(W, H), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, '#8a8478'); gr.addColorStop(0.35, '#9a8a62'); gr.addColorStop(0.55, '#8a5e52'); gr.addColorStop(0.72, '#5a4a78'); gr.addColorStop(0.86, '#3a5a8a'); gr.addColorStop(1, '#2b2b30');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return tex(c);
}
export function fabric() {
  const S = 128, c = mk(S, S), g = c.getContext('2d'), d = g.createImageData(S, S), r = rng(41);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = 128 + 46 * Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) + 30 * Math.sin((x + y) * Math.PI / 4) + (r() - 0.5) * 50, k = (y * S + x) * 4;
    d.data[k] = d.data[k + 1] = d.data[k + 2] = v; d.data[k + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return tex(c, { srgb: false, repeat: [70, 70] });
}
// Race-suit quilting, as a colour multiplier (white = unchanged): rows of stitches with the cloth puffed up between them
// and pulled a shade darker along each row, and a faint unevenness all over. One tile is one quilted panel.
export function quilt() {
  const S = 512, c = mk(S, S), g = c.getContext('2d'), d = g.createImageData(S, S), r = rng(53);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dy = Math.min(y % (S / 2), S / 2 - (y % (S / 2))), dx = Math.min(x, S - x);            // distance to the nearest row of stitches
    const pull = 1 - 0.13 * Math.exp(-dy / 9) - 0.09 * Math.exp(-dx / 9);
    const v = 255 * pull * (0.955 + 0.045 * Math.sin(x * 0.045 + 1.3) * Math.sin(y * 0.038)) + (r() - 0.5) * 9, k = (y * S + x) * 4;
    d.data[k] = d.data[k + 1] = d.data[k + 2] = Math.max(0, Math.min(255, v)); d.data[k + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  g.fillStyle = 'rgba(40,40,44,0.62)';
  for (const y of [1, S / 2]) for (let x = 3; x < S; x += 15) g.fillRect(x, y - 1, 9, 2.4);        // the stitches themselves
  for (let y = 3; y < S; y += 15) g.fillRect(0, y, 2.4, 9);
  return tex(c, { repeat: [7, 9] });
}
// Glove cloth height map (tile = 40 mm): fine knit plus soft creases that run across the fingers.
export function gloveKnit() {
  const S = 512, c = mk(S, S), g = c.getContext('2d'), d = g.createImageData(S, S), r = rng(77), h = new Float32Array(S * S);
  for (let i = 0; i < 90; i++) {
    const cy = r() * S, cx = r() * S, sg = 5 + r() * 11, len = 70 + r() * 230, amp = (r() < 0.5 ? -1 : 1) * (14 + r() * 26), tilt = (r() - 0.5) * 0.16;
    for (let dy = -Math.ceil(sg * 3); dy <= sg * 3; dy++) for (let dx = -Math.ceil(len); dx <= len; dx++) {
      const yy = dy - dx * tilt, k = Math.exp(-yy * yy / (2 * sg * sg)) * Math.pow(Math.cos(dx / len * Math.PI / 2), 2);
      h[(((Math.round(cy + dy) % S) + S) % S) * S + (((Math.round(cx + dx) % S) + S) % S)] += amp * k;
    }
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = 128 + h[y * S + x] + 16 * Math.sin(x * Math.PI / 3) * Math.sin(y * Math.PI / 3) + (r() - 0.5) * 22, k = (y * S + x) * 4;
    d.data[k] = d.data[k + 1] = d.data[k + 2] = Math.max(0, Math.min(255, v)); d.data[k + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return tex(c, { srgb: false, repeat: [25, 25] });
}
export function visorStrip(text = 'NORTHWIND') {
  const W = 1024, H = 128, c = mk(W, H), g = c.getContext('2d');
  g.fillStyle = '#08080a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2f2ee'; g.font = `700 74px ${FONT_TECH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = '16px';
  g.fillText(text, W / 2, H / 2 + 4);
  return tex(c);
}
// Small scrutineering-style marks: extinguisher "E", high-voltage triangle.
export function markE() {
  const S = 256, c = mk(S, S), g = c.getContext('2d');
  g.fillStyle = '#d3121c'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.46, 0, 7); g.fill();
  g.lineWidth = S * 0.035; g.strokeStyle = '#fff'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.40, 0, 7); g.stroke();
  g.fillStyle = '#fff'; g.font = `900 ${S * 0.56}px ${FONT_HEAVY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('E', S / 2, S / 2 + S * 0.03);
  return { map: tex(c), aspect: 1 };
}
export function markHV() {
  const S = 256, c = mk(S, S), g = c.getContext('2d');
  g.fillStyle = '#111'; g.beginPath(); g.moveTo(S / 2, 10); g.lineTo(S - 8, S - 16); g.lineTo(8, S - 16); g.closePath(); g.fill();
  g.fillStyle = '#f7d417'; g.beginPath(); g.moveTo(S / 2, 34); g.lineTo(S - 34, S - 30); g.lineTo(34, S - 30); g.closePath(); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.moveTo(S * 0.56, S * 0.36); g.lineTo(S * 0.40, S * 0.62); g.lineTo(S * 0.50, S * 0.62); g.lineTo(S * 0.44, S * 0.84); g.lineTo(S * 0.62, S * 0.54); g.lineTo(S * 0.52, S * 0.54); g.closePath(); g.fill();
  return { map: tex(c), aspect: 1 };
}
export function softbox() {
  const W = 256, H = 128, c = mk(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const gx = g.createLinearGradient(0, 0, W, 0); gx.addColorStop(0, 'rgba(0,0,0,0.75)'); gx.addColorStop(0.06, 'rgba(0,0,0,0.3)'); gx.addColorStop(0.3, 'rgba(0,0,0,0)'); gx.addColorStop(0.7, 'rgba(0,0,0,0)'); gx.addColorStop(0.94, 'rgba(0,0,0,0.3)'); gx.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = gx; g.fillRect(0, 0, W, H);
  const gy = g.createLinearGradient(0, 0, 0, H); gy.addColorStop(0, 'rgba(0,0,0,0.7)'); gy.addColorStop(0.1, 'rgba(0,0,0,0.25)'); gy.addColorStop(0.35, 'rgba(0,0,0,0)'); gy.addColorStop(0.65, 'rgba(0,0,0,0)'); gy.addColorStop(0.9, 'rgba(0,0,0,0.25)'); gy.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = gy; g.fillRect(0, 0, W, H);
  return tex(c, { aniso: 1 });
}
export function radialGlow(inner = '#ffffff', outer = '#000000', power = 1) {
  const S = 256, c = mk(S, S), g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (let i = 0; i <= 10; i++) { const t = i / 10, k = Math.pow(1 - t, power); gr.addColorStop(t, `rgba(255,255,255,${k})`); }
  g.fillStyle = outer; g.fillRect(0, 0, S, S); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, { aniso: 1 });
}
export function backdrop(center = '#2b2e35', edge = '#070708') {
  const W = 512, H = 512, c = mk(W, H), g = c.getContext('2d'), gr = g.createRadialGradient(W / 2, H * 0.52, 0, W / 2, H * 0.52, W * 0.75);
  gr.addColorStop(0, center); gr.addColorStop(0.55, '#0c0d10'); gr.addColorStop(1, edge);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // dither to hide banding
  const d = g.getImageData(0, 0, W, H), r = rng(99);
  for (let i = 0; i < d.data.length; i += 4) { const n = (r() - 0.5) * 2.2; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
  g.putImageData(d, 0, 0);
  return tex(c, { aniso: 1 });
}
