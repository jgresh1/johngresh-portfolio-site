// Sponges, sea fans, whips, anemones, starfish, urchins, giant clams, algae.
import * as THREE from 'three';
import { Builder, mulberry32, makeNoise3 } from './geom.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Sea fan (gorgonian): net-like lattice drawn on a canvas -> alpha-tested plane
// ---------------------------------------------------------------------------
// Gorgonian fan: ribs radiate from a stalk and bifurcate to keep an even spacing; cross-bars knit them into a net.
export function makeFanTexture(seed = 1, S = 1024, o = {}) {
  const { half = 0.92, ribs0 = 7, gap = 21, cross = 0.42, tipR = 0.90, sx = 0.62 } = o;
  const rnd = mulberry32(seed), k = S / 512, n3 = makeNoise3(seed + 77);
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
  const B = [S * 0.5, S * 0.985];
  const pos = (th, r) => [B[0] + r * Math.sin(th) * sx, B[1] - r * Math.cos(th)];       // the quad is stretched 1/sx wider again by the geometry
  // rounded, slightly ragged outline
  const rMax = (th) => S * tipR * (0.80 + 0.20 * Math.cos(th / half * Math.PI * 0.5)) * (1 + 0.11 * n3(th * 3.1, 1.7, 0.4) + 0.05 * n3(th * 9.0, 4.1, 2.2));
  const stalkR = S * 0.10, ds = 8 * k;
  const ribs = [];
  for (let i = 0; i < ribs0; i++) ribs.push({ th: -half + 2 * half * (i + 0.5 + (rnd() - 0.5) * 0.5) / ribs0, pts: [], alive: true, r0: stalkR });
  for (let r = stalkR; r < S * 1.05; r += ds) {
    const live = [];
    for (const rb of ribs) if (rb.alive) {
      rb.th += (rnd() - 0.5) * 0.020 + 0.012 * n3(rb.th * 5, r / S * 3, 3.3);
      rb.pts.push([...pos(rb.th, r), r]);
      if (r > rMax(rb.th)) rb.alive = false; else live.push(rb);
    }
    live.sort((p, q) => p.th - q.th);
    const born = [];
    for (let i = 0; i + 1 < live.length; i++) {                      // a gap that grew too wide gets a new rib
      const gp = r * (live[i + 1].th - live[i].th);
      if (gp > gap * k * (1 + 0.35 * rnd())) born.push({ th: (live[i].th + live[i + 1].th) / 2 + (rnd() - 0.5) * 0.01, pts: [[...pos((live[i].th + live[i + 1].th) / 2, r), r]], alive: true, r0: r });
    }
    if (live.length) {                                               // the outermost ribs fan out to the outline
      const l0 = live[0], l1 = live[live.length - 1];
      if (l0.th > -half + gap * k / Math.max(r, 1) * 1.4 && r < rMax(-half) * 0.8) born.push({ th: l0.th - gap * k * (0.7 + 0.5 * rnd()) / r, pts: [[...pos(l0.th - gap * k / r, r), r]], alive: true, r0: r });
      if (l1.th < half - gap * k / Math.max(r, 1) * 1.4 && r < rMax(half) * 0.8) born.push({ th: l1.th + gap * k * (0.7 + 0.5 * rnd()) / r, pts: [[...pos(l1.th + gap * k / r, r), r]], alive: true, r0: r });
    }
    for (const nb of born) ribs.push(nb);
  }
  // stalk
  g.lineWidth = 13 * k; g.beginPath(); g.moveTo(B[0], B[1] + 6); g.lineTo(...pos(0, stalkR * 1.05)); g.stroke();
  // ribs: thick at the base, thin at the tips
  const nodes = [];
  for (let ri = 0; ri < ribs.length; ri++) {
    const rb = ribs[ri], pts = rb.pts;
    for (let i = 1; i < pts.length; i++) {
      const t = pts[i][2] / (S * tipR);
      g.lineWidth = Math.max(1.7 * k, (4.6 - 3.0 * t) * k * (rb.r0 === stalkR ? 1 : 0.8));
      g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
      nodes.push([pts[i][0], pts[i][1], ri, i]);
    }
  }
  // cross-bars between neighbouring ribs (grid-hashed nearest search, roughly perpendicular to the rib)
  const cell = 60 * k, gw = Math.ceil(S / cell) + 1, grid = new Map();
  nodes.forEach((n, idx) => { const key = Math.floor(n[0] / cell) + Math.floor(n[1] / cell) * gw; (grid.get(key) || grid.set(key, []).get(key)).push(idx); });
  g.lineWidth = 1.5 * k;
  for (let i = 0; i < nodes.length; i++) {
    if (rnd() > cross) continue;
    const a = nodes[i], cx = Math.floor(a[0] / cell), cy = Math.floor(a[1] / cell);
    const rp = ribs[a[2]].pts, i0 = Math.max(a[3] - 1, 0), i1 = Math.min(a[3] + 1, rp.length - 1);
    let tx = rp[i1][0] - rp[i0][0], ty = rp[i1][1] - rp[i0][1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let bj = -1, bd = 1e9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const list = grid.get(cx + dx + (cy + dy) * gw); if (!list) continue;
      for (const j of list) {
        if (nodes[j][2] === a[2]) continue;
        const vx = nodes[j][0] - a[0], vy = nodes[j][1] - a[1], d = Math.hypot(vx, vy);
        if (d < 6 * k || d > gap * k * 2.3 || d >= bd) continue;
        if (Math.abs((vx * tx + vy * ty) / d) > 0.90) continue;       // bars run across (and diagonally between) the ribs
        bd = d; bj = j;
      }
    }
    if (bj >= 0) {
      const b2 = nodes[bj], mx = (a[0] + b2[0]) / 2 + (rnd() - 0.5) * 3 * k, my = (a[1] + b2[1]) / 2 + (rnd() - 0.5) * 3 * k;
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(mx, my, b2[0], b2[1]); g.stroke();
    }
  }
  // Re-upload as RGBA with WHITE colour everywhere (alpha = the net). A canvas stores transparent texels as black, which the mip chain would
  // average into the lines: distant fans went dark and opaque-looking instead of fading to a pale, translucent veil.
  const img = g.getImageData(0, 0, S, S), px = img.data;
  for (let i = 0; i < px.length; i += 4) { px[i] = px[i + 1] = px[i + 2] = 255; }
  const tex = new THREE.DataTexture(new Uint8Array(px.buffer.slice(0)), S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 2; tex.flipY = true;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  tex.userData.nodes = nodes.length;
  return tex;
}

export function fanGeometry(seed = 1, o = {}) {
  const { W = 1.6, H = 1.0, nu = 10, nv = 8 } = o;
  const n3 = makeNoise3(seed + 3), b = new Builder();
  b.grid(nu, nv, (u, v) => {
    const x = (u - 0.5) * W;
    const y = v * H;
    const z = 0.26 * W * (u - 0.5) * (u - 0.5) + 0.10 * n3(u * 2.2, v * 2.2, 1.3) + 0.04 * n3(u * 6, v * 6, 7.7) + 0.10 * v * v;
    return V(x, y, z);
  }, [0, 0.5, 0, 6], false);
  return b.toGeometry();
}

// ---------------------------------------------------------------------------
// Sponges
// ---------------------------------------------------------------------------
function tubeSponge(b, x, z, h, r, seed) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 9);
  const wall = r * (0.16 + 0.08 * rnd());
  const off = V(x, 0, z);
  const lean = V((rnd() - 0.5) * 0.35, 0, (rnd() - 0.5) * 0.35);          // tubes lean and bow
  const bulge = 0.10 + 0.14 * rnd(), rimFlare = 0.05 + 0.10 * rnd();
  // organic radius: irregular ribs running up the tube + lumps + a slightly ragged rim
  const wob = (r0, y, a) => {
    const yy = y / h;
    const ribs = 1 + 0.09 * Math.sin(a * (5 + Math.floor(rnd() * 0) + 5) + n3(Math.cos(a) * 1.3 + x * 7, yy * 3, Math.sin(a) * 1.3 + z * 7) * 3.0);
    const lump = 1 + 0.10 * n3(Math.cos(a) * 1.7 + x * 9, yy * 5, Math.sin(a) * 1.7 + z * 9) + 0.045 * n3(Math.cos(a) * 6 + x * 9, yy * 16, Math.sin(a) * 6 + z * 9);
    const rag = yy > 0.94 ? 1 + 0.16 * n3(Math.cos(a) * 4 + x * 3, 0, Math.sin(a) * 4 + z * 3) : 1;
    return r0 * ribs * lump * rag;
  };
  const prof = (t) => r * (0.66 + bulge * Math.sin(Math.PI * Math.min(t * 1.15, 1)) - 0.22 * t * t + rimFlare * Math.pow(t, 6));
  const rows = 16;
  const outer = [[r * 0.5, -0.03]];
  for (let i = 0; i <= rows; i++) { const t = i / rows; outer.push([prof(t), t * h]); }
  const inner = [];
  for (let i = 0; i <= 6; i++) { const t = 1 - i / 6 * 0.42; inner.push([Math.max(prof(t) - wall * (1 + 0.6 * (1 - t) * 2), 0.001), t * h - 0.002 * i]); }
  inner.unshift([prof(1) - wall * 0.3, h + 0.003]);
  inner.push([0.001, h * 0.5]);
  const s0 = b.count;
  b.lathe(outer, 28, [0, rnd(), 0, 5], off, V(1, 1, 1), wob);
  b.lathe(inner, 28, [0, rnd(), 0, 5], off, V(1, 1, 1), wob);
  // bend the whole tube: lateral offset grows with height^1.6
  for (let i = s0; i < b.count; i++) {
    const yy = Math.max(b.pos[i * 3 + 1], 0) / h, k = Math.pow(yy, 1.6);
    b.pos[i * 3] += lean.x * k * h; b.pos[i * 3 + 2] += lean.z * k * h;
  }
}

export function tubeSpongeCluster(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const n = o.n ?? (3 + Math.floor(rnd() * 5));
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = i === 0 ? 0 : 0.05 + rnd() * 0.14;
    const h = (0.16 + rnd() * 0.5) * (i === 0 ? 1.15 : 0.85), r = 0.030 + rnd() * 0.038;
    tubeSponge(b, Math.cos(a) * d, Math.sin(a) * d, h, r, seed * 13 + i);
  }
  return b.toGeometry();
}

export function barrelSponge(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 21), b = new Builder();
  const h = o.h ?? 0.7, r = o.r ?? 0.42;
  const nl = 5 + Math.floor(rnd() * 4), ph = rnd() * 6.283, ph2 = rnd() * 6.283;
  // fleshy vertical lobes, finer flutes that drift up the wall, lumps, and a ragged lip
  const wob = (r0, y, a) => {
    const yy = Math.min(Math.max(y / h, 0), 1.2), ca = Math.cos(a), sa = Math.sin(a);
    const lobes = 1 + 0.11 * Math.sin(a * nl + ph + 1.6 * n3(ca * 1.3, yy * 1.5, sa * 1.3));
    const flutes = 1 + 0.045 * Math.sin(a * (nl * 2 + 1) + ph2 + yy * 4.0);
    const lumps = 1 + 0.09 * n3(ca * 2.6 + 4, yy * 4.5, sa * 2.6) + 0.035 * n3(ca * 7 + 1, yy * 13, sa * 7);
    const lip = yy > 0.9 ? 1 + 0.22 * n3(ca * 5 + 2, 0, sa * 5) * Math.min((yy - 0.9) * 10, 1) : 1;
    return r0 * lobes * flutes * lumps * lip;
  };
  const rr = (t) => r * (0.60 + 0.40 * (1 - Math.pow(1 - Math.min(t / 0.45, 1), 2))) * (1 + 0.05 * Math.sin((t - 0.5) * 3.0)) * (t > 0.8 ? 1 + 0.06 * (t - 0.8) / 0.2 : 1);
  const rim = r * (0.15 + 0.05 * rnd());
  const prof = [[0.001, -0.035], [r * 0.34, -0.03]];
  const rows = 26;
  for (let i = 0; i <= rows; i++) { const t = i / rows; prof.push([rr(t), t * h]); }
  const rt = rr(1);
  prof.push([rt * 0.985, h * 1.018], [rt - rim * 0.35, h * 1.034], [rt - rim * 0.75, h * 1.030], [rt - rim, h * 1.008]);   // thick rounded lip
  for (let i = 0; i <= 12; i++) {                                    // cavity wall down to a floor
    const t = 1 - (i / 12) * 0.72;
    prof.push([Math.max(rr(t) - rim * (1.05 + 0.5 * (1 - t) * 3), 0.02), t * h * 0.995]);
  }
  prof.push([0.001, h * 0.25]);
  b.lathe(prof, 40, [0, rnd(), 0, 5], V(), V(1, 1, 1), wob);
  return b.toGeometry();
}

// ---------------------------------------------------------------------------
// Whips / sea rods
// ---------------------------------------------------------------------------
export function seaWhip(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const { L = 1.1, r0 = 0.006, kids = 2 } = o;
  const grow = (pos, dir, len, r, depth) => {
    const n = 7, pts = [pos.clone()], d = dir.clone(), p = pos.clone();
    for (let i = 0; i < n; i++) { d.add(V((rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.25)).normalize(); p.addScaledVector(d, len / n); pts.push(p.clone()); }
    b.tube(pts, (t) => r * (1 - 0.55 * t), 4, [0, rnd(), depth, 5]);
    if (depth < 1) for (let k = 0; k < kids; k++) {
      const i = 2 + Math.floor(rnd() * 4), t = pts[i + 1].clone().sub(pts[i]).normalize();
      const cd = t.clone().add(V((rnd() - 0.5) * 1.1, 0.2, (rnd() - 0.5) * 1.1)).normalize();
      grow(pts[i], cd, len * 0.5, r * 0.7, depth + 1);
    }
  };
  grow(V(0, -0.02, 0), V((rnd() - 0.5) * 0.2, 1, (rnd() - 0.5) * 0.2).normalize(), L, r0, 0);
  return b.toGeometry();
}

// ---------------------------------------------------------------------------
// Anemone: stalk + ring of curling tentacles (aInfo.x along tentacle -> tip colour)
// ---------------------------------------------------------------------------
export function anemone(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 5), b = new Builder();
  const { tent = 330, R = 0.17, H = 0.085, radial = 4, seg = 6, tl = 0.078, thick = 1.0 } = o;
  const ph = rnd() * TAU;
  // column + oral disc: thick stalk flaring into a frilly, slightly dished disc with a lobed rim
  const prof = [[0.001, H * 0.80], [R * 0.30, H * 0.78], [R * 0.62, H * 0.93], [R * 0.92, H * 1.00], [R * 1.03, H * 0.86], [R * 0.84, H * 0.46], [R * 0.52, H * 0.14], [R * 0.34, -0.02], [R * 0.26, -0.045]];
  b.lathe(prof, 30, [0, 0.5, 0, 7], V(), V(1, 1, 1), (r0, y, a) => r0 * (1 + 0.07 * Math.sin(a * 6 + ph) + 0.05 * n3(Math.cos(a) * 2.1 + 5, y * 6, Math.sin(a) * 2.1)));
  for (let i = 0; i < tent; i++) {
    const ring = Math.sqrt((i + 0.5) / tent), a = i * 2.39996 + rnd() * 0.25;
    const rr = R * 0.90 * ring;
    const base = V(Math.cos(a) * rr, H * (1.0 - 0.10 * ring * ring) - 0.004, Math.sin(a) * rr);
    const len = tl * (0.70 + 0.55 * rnd()) * (0.62 + 0.55 * ring);
    const out = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a));
    const lean = 0.20 + 0.80 * ring, curl = (rnd() - 0.5) * 2.6, wv = rnd() * TAU, wv2 = rnd() * TAU, freq = 2.6 + rnd() * 3.2;
    const pts = [];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const p = base.clone();
      p.y += len * (0.92 * t - 0.30 * t * t);
      p.addScaledVector(out, len * (0.10 * t + 0.62 * lean * t * t) + len * 0.12 * Math.sin(t * freq + wv2) * t);
      p.addScaledVector(side, len * (curl * 0.30 * t * t + 0.16 * Math.sin(t * freq * 1.3 + wv) * t));
      pts.push(p);
    }
    b.tube(pts, (t) => thick * (0.0030 * (1 - 0.74 * t) + 0.0006 + 0.0018 * Math.exp(-Math.pow((t - 0.93) / 0.09, 2))), radial, [0, rnd(), 0, 7]);     // thin, tapering, with a slight bulb at the tip
  }
  return b.toGeometry();
}

// ---------------------------------------------------------------------------
// Starfish (five arms), urchin (spines), giant clam
// ---------------------------------------------------------------------------
export function starfish(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const R = o.R ?? 0.16, arms = o.arms ?? 5;
  const outline = (a) => R * (0.28 + 0.72 * Math.pow(Math.abs(Math.cos(a * arms / 2)), 2.2 + 1.2 * (arms === 5 ? 0 : 0)));
  const rot = rnd() * TAU;
  b.grid(36, 8, (u, v) => {
    const a = u * TAU + rot, r = outline(a) * v;
    const th = 0.032 * Math.pow(1 - v, 0.6) * (0.4 + 0.6 * Math.abs(Math.cos(a * arms / 2)));
    const bump = 0.004 * Math.sin(a * 30) * v;
    return V(Math.cos(a) * r, th + bump + 0.006, Math.sin(a) * r);
  }, [0, rnd(), 0, 11], false);
  b.grid(36, 4, (u, v) => {
    const a = u * TAU + rot, r = outline(a) * (1 - 0.0 * v);
    return V(Math.cos(a) * r, 0.006 * (1 - v), Math.sin(a) * r);
  }, [0, rnd(), 0, 11], true);
  return b.toGeometry();
}

export function urchin(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const R = o.R ?? 0.045, n = o.spines ?? 220, L = o.L ?? 0.17;
  b.lathe(Array.from({ length: 9 }, (_, i) => { const t = i / 8, a = t * Math.PI * 0.95 - 0.05; return [Math.sin(a) * R, -Math.cos(a) * R + R]; }), 10, [0, rnd(), 0, 12]);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 1.85, rr = Math.sqrt(1 - Math.min(y * y, 1)), a = i * 2.39996 + rnd() * 0.2;
    if (y < -0.75) continue;
    const d = V(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    const base = d.clone().multiplyScalar(R * 0.95).add(V(0, R, 0));
    const len = L * (0.6 + 0.6 * rnd()) * (y < -0.3 ? 0.6 : 1);
    const d2 = d.clone().add(V((rnd() - 0.5) * 0.1, 0.05, (rnd() - 0.5) * 0.1)).normalize();
    b.tube([base, base.clone().addScaledVector(d2, len * 0.5), base.clone().addScaledVector(d2, len)], (t) => 0.0025 * (1 - 0.9 * t), 3, [0, rnd(), 0, 12], false);
  }
  return b.toGeometry();
}

// giant clam: fluted shell with a scalloped rim and a rippling iridescent mantle
export function giantClam(seed, o = {}) {
  const rnd = mulberry32(seed), n3 = makeNoise3(seed + 4), b = new Builder();
  const R = o.R ?? 0.42;
  // shell: elongated bowl, ~8 flutes
  b.grid(48, 14, (u, v) => {
    const a = u * TAU, r = R * (0.25 + 0.75 * v) * (1 + 0.03 * n3(Math.cos(a) * 2 + 3, v * 2, Math.sin(a) * 2));
    const flute = 0.05 * Math.pow(v, 1.5) * Math.sin(a * 8) * (0.6 + 0.4 * v);
    const rx = r * (1.0 + flute * 1.5), rz = r * 0.78 * (1.0 + flute * 1.5);
    const y = 0.02 + 0.30 * R * (1 - Math.pow(v, 1.6)) * (0.3 + 0.7 * (1 - v)) - 0.02 + (v > 0.85 ? 0.05 * (v - 0.85) : 0) ;
    return V(Math.cos(a) * rx, R * 0.85 * (1 - Math.pow(1 - v, 1.8)) * 0.35 + 0.0 * y + 0.02, Math.sin(a) * rz);
  }, [0, rnd(), 0, 4], true);
  // mantle: a wide corrugated band that swells over the shell margin and almost closes the opening, leaving a narrow dark slit
  b.grid(72, 10, (u, v) => {
    const a = u * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.5 + 0.5 * Math.sin(a * 13 + n3(ca * 3, 0, sa * 3) * 4);
    const edge = 1 - v;
    const r = R * (1.0 - 0.90 * v) * (1 + 0.035 * w * edge);
    const y = R * 0.34 + 0.03 + 0.045 * Math.sin(Math.min(v * 1.2, 1) * Math.PI) + 0.030 * w * edge - 0.055 * Math.pow(v, 5) + 0.012 * n3(ca * 6, v * 4, sa * 6);
    return V(ca * r, y, sa * r * 0.78);
  }, [0, rnd(), 0, 10], false);
  return b.toGeometry();
}

// broadleaf macro-algae bunch (kind 8)
export function algaeBunch(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const blades = o.blades ?? 9;
  for (let k = 0; k < blades; k++) {
    const a = rnd() * TAU, r0 = rnd() * 0.05, L = 0.16 + rnd() * 0.22, w = 0.02 + rnd() * 0.02;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const base = dir.clone().multiplyScalar(r0);
    const rows = 6, start = b.count;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const p = base.clone().addScaledVector(dir, L * 0.5 * t * t).add(V(0, L * t * (1 - 0.2 * t), 0));
      const side = V(-Math.sin(a), 0, Math.cos(a));
      const wt = w * Math.sin(Math.PI * Math.min(t * 1.05, 1) * 0.9 + 0.35) * (1 + 0.3 * Math.sin(t * 14 + k));
      const nrm = V(Math.cos(a), 0.4, Math.sin(a)).normalize();
      b.vertex(p.clone().addScaledVector(side, -wt), nrm, 0, t, [t, rnd(), 0, 8]);
      b.vertex(p.clone().addScaledVector(side, wt), nrm, 1, t, [t, rnd(), 1, 8]);
    }
    for (let i = 0; i < rows; i++) { const a0 = start + i * 2; b.tri(a0, a0 + 2, a0 + 1); b.tri(a0 + 1, a0 + 2, a0 + 3); }
  }
  return b.toGeometry();
}
