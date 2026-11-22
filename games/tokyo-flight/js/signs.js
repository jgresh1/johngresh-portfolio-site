// signs.js — shop signs with the real names.
//
// The names and positions come from OpenStreetMap (data/pois, built by tools/build_pois.py): the shop, bar,
// bank or hotel that really is in that building. The sign itself is made here: a lit box over the shopfront
// for street-level tenants, a stack of projecting vertical signs for the ones upstairs, the way a Tokyo
// side street carries them. The lettering and colours are generic. No logo or house style is copied.
import * as THREE from 'three';
import { patch } from './atmo.js';
import { geoToWorld, worldToGeo, lonTile, latTile } from './geo.js';

const Z = 16, CELL = 32;
const FONT_SANS = '"Yu Gothic UI","Yu Gothic","Meiryo","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
const FONT_SERIF = '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif';
// background, lettering, accent
const PALETTES = [
  ['#f4f1ea', '#1c1c1c', '#c8102e'], ['#16181c', '#f2f2f2', '#e0b048'], ['#b5121b', '#ffffff', '#ffd75e'], ['#1f4e8c', '#ffffff', '#9fd0ff'],
  ['#0f5a3c', '#ffffff', '#cfe8a9'], ['#f6c400', '#1a1a1a', '#c8102e'], ['#ffffff', '#0b3d91', '#e8442e'], ['#5b3a1e', '#f5e6c8', '#e0a23a'],
  ['#e9e4d8', '#3a2a1c', '#7a1f1f'], ['#222b3a', '#e8edf5', '#39c0d8'], ['#d7263d', '#fff6e0', '#1a1a1a'], ['#f08a24', '#ffffff', '#2a2a2a'],
  ['#2b2b2b', '#ff5a36', '#f2f2f2'], ['#7b2d8e', '#ffffff', '#ffd75e'], ['#e8eef2', '#11698e', '#f07b3f'], ['#1c1c1c', '#ffe9a8', '#b5121b'],
];
const LABEL = {
  restaurant: 'RESTAURANT', cafe: 'CAFE', bar: 'BAR', pub: 'IZAKAYA', fast_food: 'FOOD', bank: 'BANK', pharmacy: 'PHARMACY', karaoke_box: 'KARAOKE',
  cinema: 'CINEMA', hotel: 'HOTEL', hostel: 'HOSTEL', office: 'OFFICE', clinic: 'CLINIC', dentist: 'DENTAL', post_office: 'POST', nightclub: 'CLUB',
  station: 'STATION', subway_entrance: 'SUBWAY', museum: 'MUSEUM', theatre: 'THEATRE', fitness_centre: 'GYM', amusement_arcade: 'GAME',
  'shop:convenience': '24H', 'shop:supermarket': 'SUPERMARKET', 'shop:clothes': 'FASHION', 'shop:books': 'BOOKS', 'shop:electronics': 'ELECTRONICS',
  'shop:hairdresser': 'HAIR', 'shop:bakery': 'BAKERY', 'shop:cosmetics': 'COSMETICS', 'shop:shoes': 'SHOES', 'shop:jewelry': 'JEWELLERY', 'shop:department_store': 'DEPARTMENT STORE',
};
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const isCJK = (s) => /[぀-ヿ㐀-鿿ｦ-ﾟ]/.test(s);

function fit(ctx, text, font, weight, maxW, maxH) {
  let size = maxH;
  for (let i = 0; i < 12; i++) { ctx.font = `${weight} ${size}px ${font}`; const w = ctx.measureText(text).width; if (w <= maxW) break; size *= Math.max(maxW / w, 0.7); }
  return size;
}

// one sign face. w, h in metres decide the shape; upright = a projecting sign read top to bottom
function drawSign(p, w, h, upright) {
  const ppm = upright ? 150 : 110;
  const cw = Math.min(Math.round(w * ppm / 4) * 4, 1024), ch = Math.min(Math.round(h * ppm / 4) * 4, 512);
  const c = document.createElement('canvas'); c.width = Math.max(cw, 32); c.height = Math.max(ch, 32);
  const g = c.getContext('2d'), W = c.width, H = c.height, hs = hash(p.name), kind = p.kind;
  const eat = /restaurant|cafe|bar|pub|fast_food|izakaya|food/.test(kind);
  let pal = PALETTES[Math.floor(hs * PALETTES.length)];
  if (eat && hs > 0.5) pal = [PALETTES[1], PALETTES[2], PALETTES[7], PALETTES[15], PALETTES[8]][Math.floor(hash(p.name + 'e') * 5)];
  if (kind === 'bank' || kind === 'office') pal = [PALETTES[3], PALETTES[6], PALETTES[9], PALETTES[14]][Math.floor(hs * 4)];
  const [bg, fg, ac] = pal;
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // the lit box: brighter in the middle, a darker rim, a trim line
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.14)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const serif = eat && hash(p.name + 's') > 0.55, font = serif ? FONT_SERIF : FONT_SANS, weight = serif ? 700 : 800;
  const name = p.name, sub = p.en && p.en !== p.name ? p.en : (LABEL[kind] || null);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
  if (upright) {
    const m = Math.round(W * 0.12);
    g.fillStyle = ac; g.fillRect(0, 0, W, Math.round(H * 0.035)); g.fillRect(0, H - Math.round(H * 0.035), W, Math.round(H * 0.035));
    g.fillStyle = fg;
    if (isCJK(name)) {
      const chars = [...name].slice(0, 12), n = chars.length, size = Math.min((W - 2 * m), (H * 0.9) / n);
      g.font = `${weight} ${size}px ${font}`;
      const y0 = H / 2 - (n - 1) * size * 0.5;
      chars.forEach((ch2, i) => {
        if (ch2 === 'ー' || ch2 === '-') { g.save(); g.translate(W / 2, y0 + i * size); g.rotate(Math.PI / 2); g.fillText(ch2, 0, 0); g.restore(); }
        else g.fillText(ch2, W / 2, y0 + i * size);
      });
    } else {
      g.save(); g.translate(W / 2, H / 2); g.rotate(Math.PI / 2);
      const size = fit(g, name, font, weight, H * 0.86, (W - 2 * m) * 0.9);
      g.font = `${weight} ${size}px ${font}`; g.fillText(name, 0, 0); g.restore();
    }
  } else {
    const m = H * 0.12, hasSub = !!sub && H > 60 && W / H > 2.2;
    const size = fit(g, name, font, weight, W - 2 * m - H * 0.3, H * (hasSub ? 0.50 : 0.62));
    g.font = `${weight} ${size}px ${font}`;
    g.fillText(name, W / 2, hasSub ? H * 0.42 : H * 0.52);
    if (hasSub) {
      const s2 = fit(g, sub, FONT_SANS, 600, W - 2 * m - H * 0.3, H * 0.20);
      g.font = `600 ${s2}px ${FONT_SANS}`; g.fillStyle = ac === bg ? fg : ac; g.globalAlpha = 0.95; g.fillText(sub, W / 2, H * 0.80); g.globalAlpha = 1;
    }
    g.fillStyle = ac; g.fillRect(0, 0, Math.round(H * 0.10), H); g.fillRect(W - Math.round(H * 0.10), 0, Math.round(H * 0.10), H);
  }
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = Math.max(2, Math.round(Math.min(W, H) * 0.02)); g.strokeRect(0, 0, W, H);
  return c;
}

export class Signs {
  constructor(facades, { maxSigns = 420 } = {}) {
    this.facades = facades; this.maxSigns = maxSigns;
    this.group = new THREE.Group(); this.group.name = 'signs';
    this.tiles = new Map(); this.grid = new Map(); this.version = 0;
    this.count = 0; this.placed = 0;
    this.edge = patch(new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.5, metalness: 0.6 }), 'sign-edge', {});
    this.plane = new THREE.PlaneGeometry(1, 1); this.box = new THREE.BoxGeometry(1, 1, 1);
    this.aniso = 8;
    facades.onDress = (e) => this.dress(e);
    this._key = '';
  }

  /* ---------------------------------------------------------------- data */
  update(camera, eye) {
    if (eye > 220) return;
    const g = worldToGeo(camera.position), cx = Math.floor(lonTile(g.lon, Z)), cy = Math.floor(latTile(g.lat, Z)), key = cx + ',' + cy;
    if (key === this._key) return;
    this._key = key;
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) this.load(x, y);
  }

  async load(x, y) {
    const key = x + '/' + y;
    if (this.tiles.has(key)) return;
    this.tiles.set(key, []);
    let rows = [];
    try { const r = await fetch(`./data/pois/${Z}/${x}/${y}.json`); if (r.ok) rows = await r.json(); } catch { /* no file for this tile */ }
    const v = new THREE.Vector3(), list = [];
    for (const [lat, lon, kind, name, en, lvl] of rows) {
      geoToWorld(lat, lon, 0, v);
      const p = { x: v.x, z: v.z, kind, name, en, lvl, owner: null };
      list.push(p);
      const ck = Math.floor(v.x / CELL) + ',' + Math.floor(v.z / CELL);
      let a = this.grid.get(ck); if (!a) this.grid.set(ck, a = []); a.push(p);
    }
    this.tiles.set(key, list); this.count += list.length; this.version++;
    // buildings already standing get their signs now
    for (const per of this.facades.byScene.values()) for (const e of per.values()) if (!e.signs) this.dress(e);
  }

  near(x0, z0, x1, z1) {
    const out = [];
    for (let r = Math.floor(z0 / CELL); r <= Math.floor(z1 / CELL); r++) for (let c = Math.floor(x0 / CELL); c <= Math.floor(x1 / CELL); c++) {
      const a = this.grid.get(c + ',' + r); if (a) for (const p of a) if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) out.push(p);
    }
    return out;
  }

  /* ---------------------------------------------------------------- placement */
  dress(e) {
    if (!e.walls.length || this.placed > this.maxSigns) return;
    const [x0, z0, x1, z1] = e.box;
    const cands = this.near(x0 - 2.5, z0 - 2.5, x1 + 2.5, z1 + 2.5).filter((p) => !p.owner || p.owner === e);
    if (!cands.length) return;
    // which of them are this building's: inside its outline, or right against one of its walls
    const mine = [];
    for (const p of cands) {
      let best = Infinity, inside = true;
      for (const w of e.walls) {
        const dx = p.x - w.ox, dz = p.z - w.oz, along = dx * w.tx + dz * w.tz, out = dx * w.nx + dz * w.nz;
        if (out > 0.05) inside = false;                                           // on the street side of this wall
        if (along > -1 && along < w.W + 1) best = Math.min(best, Math.abs(out));
      }
      // (only the walls that were built are known here, so "inside" is also held to the building's own box)
      if ((inside && p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) || best < 2.2) { p.owner = e; mine.push(p); }
    }
    if (!mine.length) return;
    e.signs = [];
    const street = mine.filter((p) => p.lvl == null || (p.lvl >= 0 && p.lvl <= 1)), upper = mine.filter((p) => !street.includes(p));
    // street-level tenants: one bay of a shopfront band each, the bay nearest to where the map puts them
    const slots = [];
    for (const b of e.bands) for (let i = 0; i < b.n; i++) slots.push({ b, i, x: (i + 0.5) * b.sw, used: false });
    for (const p of street) {
      let pick = null, bd = Infinity;
      for (const s of slots) {
        if (s.used) continue;
        const wx = s.b.ox + s.b.tx * s.x, wz = s.b.oz + s.b.tz * s.x, d = Math.hypot(p.x - wx, p.z - wz);
        if (d < bd) { bd = d; pick = s; }
      }
      if (!pick) { upper.push(p); continue; }
      pick.used = true;
      const b = pick.b, w = Math.min(b.sw - 0.30, 4.2), h = b.y1 - b.y0 - 0.06;
      this.board(e, p, b, pick.x, (b.y0 + b.y1) / 2, b.z + 0.012, w, h);
    }
    // everyone else: projecting signs, stacked up the end of the widest street wall
    if (upper.length) {
      const wall = [...e.walls].filter((w) => w.open).sort((a, b) => b.W - a.W)[0] || e.walls[0];
      const base = Math.max(...e.bands.filter((b) => b.ox === wall.ox && b.oz === wall.oz).map((b) => b.y1), wall.y0 + 3.6) + 0.45;
      const ph = 1.55, pw = 0.62, room = Math.max(0, Math.floor((wall.y1 - 0.8 - base) / (ph + 0.12)));
      upper.slice(0, Math.min(room * 2, 14)).forEach((p, i) => {
        const col = i < room ? 0 : 1, row = i < room ? i : i - room;
        const x = col === 0 ? Math.min(0.5, wall.W / 2) : Math.max(wall.W - 0.5, wall.W / 2);
        this.blade(e, p, wall, x, base + row * (ph + 0.12) + ph / 2, pw, ph);
      });
    }
    const prev = e.onFree;
    e.onFree = () => { prev?.(); for (const m of e.signs) { this.group.remove(m); m.userData.tex.dispose(); m.userData.mat.dispose(); this.placed--; } for (const p of mine) if (p.owner === e) p.owner = null; e.signs = null; };
  }

  material(p, w, h, upright) {
    const tex = new THREE.CanvasTexture(drawSign(p, w, h, upright));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.aniso;
    // a lit box: a little of its own light by day, fully lit after dark
    const mat = patch(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0 }), 'sign', { emissive: 'totalEmissiveRadiance += diffuseColor.rgb * ( 0.05 + 1.35 * uNight );' });
    return { tex, mat };
  }

  place(mesh, wall, x, y, z) {
    const m = mesh.matrix, px = wall.ox + wall.tx * x + wall.nx * z, pz = wall.oz + wall.tz * x + wall.nz * z;
    m.set(wall.tx * mesh.userData.sx, 0, wall.nx * mesh.userData.sz, px,
      0, mesh.userData.sy, 0, wall.foot + y,
      wall.tz * mesh.userData.sx, 0, wall.nz * mesh.userData.sz, pz,
      0, 0, 0, 1);
    mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
    mesh.castShadow = false; mesh.receiveShadow = false;
    this.group.add(mesh); this.placed++;
  }

  // flat board on the band over a shopfront
  board(e, p, wall, x, y, z, w, h) {
    const { tex, mat } = this.material(p, w, h, false);
    const mesh = new THREE.Mesh(this.plane, mat);
    mesh.userData = { tex, mat, sx: w, sy: h, sz: 1, name: p.name };
    this.place(mesh, wall, x, y, z); e.signs.push(mesh);
  }

  // box sign standing out from the wall, read from either side
  blade(e, p, wall, x, y, w, h) {
    const { tex, mat } = this.material(p, w, h, true);
    const mesh = new THREE.Mesh(this.box, [mat, mat, this.edge, this.edge, this.edge, this.edge]);
    mesh.userData = { tex, mat, sx: 0.14, sy: h, sz: w, name: p.name };
    this.place(mesh, wall, x, y, (wall.T || 0.2) + 0.12 + w / 2); e.signs.push(mesh);
  }
}
