// treetex.js — procedural tree textures: spruce needle atlas, broadleaf cluster atlas, bark with relief.
import { rng32, periodicNoise, canvas, toTex, normalFrom } from './tex.js';

const rgb = (r, g, b) => `rgb(${Math.max(0, Math.min(255, r)) | 0},${Math.max(0, Math.min(255, g)) | 0},${Math.max(0, Math.min(255, b)) | 0})`;

// a twig clothed in needles: dark core stroke, then needles; older growth near the base is darker and bluer
function clad(ctx, rand, x0, y0, x1, y1, nl, core, lightTip = 1) {
  const L = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0), n = Math.max(3, Math.floor(L / 3.2));
  ctx.strokeStyle = rgb(12 + rand() * 9, 26 + rand() * 12, 14 + rand() * 8); ctx.lineWidth = core;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  for (let i = 0; i <= n; i++) {
    const t = i / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
    for (const sgn of [-1, 1]) {
      const na = ang + sgn * (0.5 + rand() * 0.65), l = nl * (0.7 + rand() * 0.6);
      const sh = Math.pow(rand(), 1.15) * (0.38 + 0.8 * t * lightTip);
      ctx.strokeStyle = rgb(13 + sh * 66, 34 + sh * 104, 18 + sh * 26); ctx.lineWidth = 1.4 + rand() * 1.3;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * l, py + Math.sin(na) * l); ctx.stroke();
    }
  }
}

// 1024 x 1024. Top half (v 0.5..1): a comb of twiglets hanging from a twig along the top edge.
// Bottom half (v 0..0.5): a flat spray seen from above, base at u = 0, tip at u = 1, centred on v = 0.25.
export function spruceAtlas(size = 1024) {
  const rand = rng32(101), [c, ctx] = canvas(size, size), h = size / 2;
  ctx.clearRect(0, 0, size, size); ctx.lineCap = 'round';
  // --- comb
  const top = 16;
  for (let x = 12; x < size - 12; x += 8 + rand() * 9) {
    const edge = Math.min(x, size - x) / (size * 0.5), len = (0.25 + 0.72 * Math.pow(rand(), 0.7)) * (h - 44) * (0.45 + 0.55 * Math.sqrt(edge));
    let px = x, py = top, a = Math.PI / 2 + (rand() - 0.5) * 0.5; const segs = 4;
    for (let k = 0; k < segs; k++) {
      const sl = len / segs, nx = px + Math.cos(a) * sl, ny = Math.min(py + Math.sin(a) * sl, h - 14);
      clad(ctx, rand, px, py, nx, ny, 10, 7 - k, 0.6 + 0.5 * k / segs);
      if (k < segs - 1 && rand() < 0.7) { const a2 = a + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.4), l2 = sl * (0.7 + rand() * 0.7); clad(ctx, rand, nx, ny, nx + Math.cos(a2) * l2, Math.min(ny + Math.sin(a2) * l2, h - 12), 9, 5, 1.1); }
      px = nx; py = ny; a += (rand() - 0.5) * 0.35;
    }
  }
  ctx.strokeStyle = 'rgb(60,44,29)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(size, top); ctx.stroke();
  clad(ctx, rand, 0, top, size, top, 11, 8, 0.5);
  // --- flat spray
  const cy = h + h / 2, env = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.75) * (1 - 0.3 * t);
  for (let x = 30; x < size - 40; x += 13 + rand() * 6) {
    const t = x / size, w = env(t) * (h * 0.46);
    for (const sgn of [-1, 1]) {
      const a = sgn * (0.95 - 0.3 * t + (rand() - 0.5) * 0.2), L = w * (0.8 + rand() * 0.35) / Math.sin(Math.abs(a));
      const ex = x + Math.cos(a) * L, ey = cy + Math.sin(a) * L;
      clad(ctx, rand, x, cy, ex, ey, 9, 6, 1.0);
      const subs = Math.floor(L / 34);
      for (let q = 1; q <= subs; q++) {
        if (rand() < 0.3) continue;
        const f = q / (subs + 1), mx = x + (ex - x) * f, my = cy + (ey - cy) * f, a2 = a + (rand() < 0.5 ? -1 : 1) * (0.45 + rand() * 0.35) * 0.9, l2 = L * (0.34 - 0.16 * f) * (0.7 + rand() * 0.6);
        clad(ctx, rand, mx, my, mx + Math.cos(a2) * l2, my + Math.sin(a2) * l2, 8, 4, 1.15);
      }
    }
  }
  ctx.strokeStyle = 'rgb(62,46,30)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(size - 30, cy); ctx.stroke();
  clad(ctx, rand, 10, cy, size - 14, cy, 10, 7, 0.9);
  return toTex(c, { srgb: true, repeat: false, aniso: 8 });
}

// 1024 x 1024, four leaf clusters (2 x 2). Each: a twig rising from the bottom centre of its cell with alternate leaves.
export function leafAtlas(size = 1024, o = {}) {
  const rand = rng32(o.seed ?? 977), [c, ctx] = canvas(size, size), cell = size / 2;
  const ls = o.leaf ?? 1, hue = o.hue ?? 0;
  ctx.clearRect(0, 0, size, size); ctx.lineCap = 'round';
  const leaf = (px, py, ang, L, shade) => {
    const Wd = L * (0.5 + rand() * 0.1) * (o.narrow ?? 1);
    const r0 = 26 + shade * (62 + hue * 30), g0 = 60 + shade * 88, b0 = 13 + shade * 24;
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    const path = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(L * 0.22, -Wd * 0.66, L * 0.68, -Wd * 0.52, L, 0); ctx.bezierCurveTo(L * 0.68, Wd * 0.52, L * 0.22, Wd * 0.66, 0, 0); };
    const gr = ctx.createLinearGradient(0, -Wd * 0.5, 0, Wd * 0.5);      // the two halves of the blade catch the light differently
    gr.addColorStop(0, rgb(r0 * 1.12, g0 * 1.08, b0)); gr.addColorStop(0.49, rgb(r0 * 0.86, g0 * 0.9, b0 * 0.9));
    gr.addColorStop(0.51, rgb(r0 * 0.74, g0 * 0.78, b0 * 0.85)); gr.addColorStop(1, rgb(r0 * 0.95, g0 * 0.96, b0));
    path(); ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = `rgba(${(r0 * 1.5 + 30) | 0},${(g0 * 1.2 + 30) | 0},${(b0 * 1.4 + 10) | 0},0.6)`; ctx.lineWidth = Math.max(1, L * 0.022);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.97, 0); ctx.stroke();
    ctx.lineWidth = Math.max(0.6, L * 0.009); ctx.beginPath();
    for (let k = 1; k <= 6; k++) { const t = k / 7, vx = L * t, hl = Wd * 0.5 * Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.86; ctx.moveTo(vx, 0); ctx.lineTo(vx + hl * 0.55, -hl); ctx.moveTo(vx, 0); ctx.lineTo(vx + hl * 0.55, hl); }
    ctx.stroke();
    path(); ctx.strokeStyle = 'rgba(8,24,6,0.55)'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.restore();
  };
  for (let ci = 0; ci < 4; ci++) {
    const ox = (ci % 2) * cell, oy = Math.floor(ci / 2) * cell, pad = 26;
    ctx.save(); ctx.beginPath(); ctx.rect(ox + 2, oy + 2, cell - 4, cell - 4); ctx.clip();
    const twigs = [];
    const twig = (x, y, a, len, wdt, depth) => {
      const n = Math.max(2, Math.floor(len / 19)), pts = [[x, y, a]];
      for (let i = 1; i <= n; i++) { a += (rand() - 0.5) * 0.2; x += Math.cos(a) * 19; y += Math.sin(a) * 19; pts.push([x, y, a]); }
      twigs.push({ pts, wdt });
      if (depth > 0) for (let i = 2; i < n - 1; i++) if (rand() < 0.62) twig(pts[i][0], pts[i][1], pts[i][2] + (i % 2 ? 1 : -1) * (0.55 + rand() * 0.45), len * (0.62 - 0.3 * i / n), wdt * 0.6, depth - 1);
    };
    twig(ox + cell / 2, oy + cell - 6, -Math.PI / 2 + (rand() - 0.5) * 0.25, cell * 0.72, 5, 2);
    // two layers: shaded leaves underneath, sunlit ones on top
    for (let layer = 0; layer < 2; layer++) {
      for (const tw of twigs) {
        if (layer === 0) { ctx.strokeStyle = 'rgb(52,40,28)'; ctx.lineWidth = tw.wdt; ctx.beginPath(); tw.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
        tw.pts.forEach(([x, y, a], i) => {
          if (i === 0 && tw.wdt > 4) return;
          const sgn = (i + layer) % 2 ? 1 : -1, L = cell * (0.105 + rand() * 0.035) * ls;
          const sh = layer ? 0.5 + rand() * 0.5 : rand() * 0.45;
          const fits = (ang) => { const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L; return ex > ox + pad && ex < ox + cell - pad && ey > oy + pad && ey < oy + cell - pad * 0.3; };
          let ang = a + sgn * (0.7 + rand() * 0.55); if (!fits(ang)) ang = a - sgn * (0.7 + rand() * 0.4);
          if (fits(ang)) leaf(x, y, ang, L, sh);
          if (i === tw.pts.length - 1 && layer === 1 && fits(a)) leaf(x, y, a, L * 1.05, 0.6 + rand() * 0.4);
        });
      }
    }
    ctx.restore();
  }
  return toTex(c, { srgb: true, repeat: false, aniso: 8 });
}

/* ---------- bark: colour + relief ---------- */
export function barkMaps(kind, size = 512) {
  const rand = rng32(kind === 'spruce' ? 151 : kind === 'birch' ? 171 : 161), n = periodicNoise(size, 5, 5, 152), n2 = periodicNoise(size, 24, 3, 153);
  const [c, ctx] = canvas(size, size), [hc, hx] = canvas(size, size);
  const img = ctx.createImageData(size, size), d = img.data, him = hx.createImageData(size, size), hd = him.data;
  const set = (i, r, g, b, h) => { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; hd[i * 4] = hd[i * 4 + 1] = hd[i * 4 + 2] = Math.max(0, Math.min(255, h)); hd[i * 4 + 3] = 255; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (kind === 'spruce') {
      // scaly plates: warped cells stretched along the trunk
      const u = x / size * 9 + n[i] * 1.6, v = y / size * 4.5 + n2[i] * 0.5 + Math.floor(u) * 0.37;
      const fx = Math.abs((u % 1) - 0.5) * 2, fy = Math.abs((v % 1) - 0.5) * 2, plate = 1 - Math.pow(Math.max(fx, fy), 3.5);
      const tone = 0.62 + 0.5 * n2[(Math.floor(v) * 37 + Math.floor(u) * 91) % (size * size)];
      const k = (58 + plate * 62) * tone + (rand() - 0.5) * 10;
      set(i, k * 1.04, k * 0.86, k * 0.74, 40 + plate * 190);
    } else if (kind === 'birch') {
      const band = Math.pow(Math.max(0, Math.sin(y / size * 46 + n[i] * 7)), 14) * (n2[i] > 0.52 ? 1 : 0), scar = Math.pow(Math.max(0, n[i] - 0.66) * 3.2, 2);
      const k = 205 + (n2[i] - 0.5) * 34 - band * 150 - Math.min(1, scar) * 170 + (rand() - 0.5) * 8;
      set(i, k, k * 0.98, k * 0.93, 150 - band * 70 - Math.min(1, scar) * 90 + n2[i] * 30);
    } else {
      // beech: smooth silver-grey with faint horizontal lenticels and lichen blotches
      const band = Math.pow(Math.max(0, Math.sin(y / size * 70 + n[i] * 5)), 20) * 0.5, lich = Math.max(0, n[i] - 0.58) * 2.4;
      const k = 112 + (n2[i] - 0.5) * 30 + (n[i] - 0.5) * 40 - band * 40 + (rand() - 0.5) * 8;
      set(i, k * (1 - lich * 0.12), k * (1 + lich * 0.06), k * (0.97 - lich * 0.2), 120 + n2[i] * 40 - band * 60 + n[i] * 30);
    }
  }
  ctx.putImageData(img, 0, 0); hx.putImageData(him, 0, 0);
  return { map: toTex(c, { srgb: true, aniso: 8 }), normalMap: toTex(normalFrom(hc, size, kind === 'spruce' ? 5 : 2.2), { aniso: 8 }) };
}

// mean linear colour of the opaque texels of a canvas texture
export function meanOpaque(tex) {
  const cv = tex.image, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let r = 0, g = 0, b = 0, n = 0;
  const lin = (v) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 128) { r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); n++; }
  return [r / n, g / n, b / n];
}
