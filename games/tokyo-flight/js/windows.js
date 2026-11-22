// Reading a wall's windows off its photo. No three.js in here, so tools/ and tests can run it on their own.
//
// The survey's wall photos were taken from an aircraft at 20 to 40 cm a pixel. Where the aircraft could see the
// wall, the windows show as dark upright rectangles that line up in rows and columns. Where it could not (the
// lower floors on any ordinary street: the building opposite was in the way) the "photo" is whatever stood in
// front: the neighbour's roof, its plant, its own windows.
//
// detect() is told which part of the wall was hidden (o.hid, worked out from the buildings around it) and
//   1. reads only the part that was seen: finds every dark patch that is a clean rectangle of window size and
//      keeps the ones that line up with others (same left and right edge on another floor, or same sill and
//      head beside it). Roof clutter gives patches too, but not rectangles in rows and columns;
//   2. carries that grid of floors and bays on into the hidden part, where the windows are marked as made;
//   3. when nothing could be read but much of the wall was hidden, lays out plain windows there by building use.
// It returns null when there is nothing to build, and the wall then stays exactly as photographed.
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const fract = (v) => v - Math.floor(v);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

export const READ = { tried: 0, small: 0, blank: 0, loose: 0, ok: 0, windows: 0, carried: 0, laid: 0, plain: 0, keep: null };

// mean of D over a box of (2rx+1) x (2ry+1) cells, counting only the cells where V is set
function boxMean(D, V, nx, ny, rx, ry) {
  const w = nx + 1, S = new Float64Array(w * (ny + 1)), N = new Int32Array(w * (ny + 1)), out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    let run = 0, cnt = 0;
    for (let i = 0; i < nx; i++) { if (V[j * nx + i]) { run += D[j * nx + i]; cnt++; } S[(j + 1) * w + i + 1] = S[j * w + i + 1] + run; N[(j + 1) * w + i + 1] = N[j * w + i + 1] + cnt; }
  }
  for (let j = 0; j < ny; j++) {
    const j0 = Math.max(0, j - ry), j1 = Math.min(ny, j + ry + 1);
    for (let i = 0; i < nx; i++) {
      const i0 = Math.max(0, i - rx), i1 = Math.min(nx, i + rx + 1);
      const n = N[j1 * w + i1] - N[j0 * w + i1] - N[j1 * w + i0] + N[j0 * w + i0];
      out[j * nx + i] = n ? (S[j1 * w + i1] - S[j0 * w + i1] - S[j1 * w + i0] + S[j0 * w + i0]) / n : 0;
    }
  }
  return out;
}

// connected patches of a 0/1 mask (edge neighbours), each as its bounding box and cell count
function patches(mask, nx, ny) {
  const out = [], stack = new Int32Array(nx * ny);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1) continue;
    let top = 0, i0 = nx, i1 = -1, j0 = ny, j1 = -1, area = 0;
    stack[top++] = start; mask[start] = 2;
    while (top) {
      const p = stack[--top], i = p % nx, j = (p - i) / nx;
      area++; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
      if (i > 0 && mask[p - 1] === 1) { mask[p - 1] = 2; stack[top++] = p - 1; }
      if (i < nx - 1 && mask[p + 1] === 1) { mask[p + 1] = 2; stack[top++] = p + 1; }
      if (j > 0 && mask[p - nx] === 1) { mask[p - nx] = 2; stack[top++] = p - nx; }
      if (j < ny - 1 && mask[p + nx] === 1) { mask[p + nx] = 2; stack[top++] = p + nx; }
    }
    out.push({ i0, i1, j0, j1, area });
  }
  return out;
}

// plain windows for a wall nothing could be read from, by what the building is used for
function layout(b) {
  const s = b.seed || 0.5;
  if (b.cls === 3) return { fh: 3.0, bay: 3.1, ww: 1.7, wh: 1.5, sill: 0.9 };            // flats
  if (b.cls === 4) return { fh: 2.8, bay: 2.6, ww: 1.2, wh: 1.1, sill: 0.95 };           // houses
  if (b.cls === 5) return { fh: 4.5, bay: 5.0, ww: 2.4, wh: 1.1, sill: 2.2 };            // sheds
  const bay = 1.6 + 1.8 * fract(s * 7.13);
  return { fh: 3.6 + 0.5 * fract(s * 7.1), bay, ww: Math.min(bay * (0.5 + 0.2 * fract(s * 2.9)), 2.4), wh: 1.5 + 0.5 * fract(s * 6.7), sill: 0.9 };
}

// L: brightness sheet { w, h, data }. uvRaw(x, y): the wall's mapping into it, x along the wall and y up from
// the building's foot, in metres. b: { cls, seed }. o.hid.at(x): height below which the wall was hidden from
// the air at x. o.open: a street or yard in front. o.yMin: lowest sill allowed (above the shopfront).
// Returns { fh, wh, rows: [{ y, h, wins: [[x0, x1, made], ...] }], bays, ref: [x, y] | null, cover } or null.
export function detect(L, uvRaw, W, y0, y1, b, o = {}) {
  READ.tried++;
  const hid = o.hid || null, open = o.open !== false, yMin = o.yMin ?? y0 + 0.9;
  const hidAt = (x, y) => !!hid && y < hid.at(x);
  const g0 = Math.max(y0, 3.4);                              // the street floor is never read: no aircraft saw it properly
  const step = Math.max(0.2, W / 420, (y1 - g0) / 520);
  const nx = Math.floor(W / step), ny = Math.floor((y1 - g0) / step);
  if (nx < 12 || ny < 14) { READ.small++; return null; }
  const sx = W / nx, sy = (y1 - g0) / ny, D = new Float32Array(nx * ny), V = new Uint8Array(nx * ny);
  let nVis = 0;
  // the wall's mapping into the sheet is flat, so three corners give it for every sample
  const q0 = uvRaw(0.5 * sx, g0 + 0.5 * sy), qx = uvRaw(1.5 * sx, g0 + 0.5 * sy), qy = uvRaw(0.5 * sx, g0 + 1.5 * sy);
  const u0 = q0[0] * L.w, v0 = q0[1] * L.h, ux = (qx[0] - q0[0]) * L.w, vx = (qx[1] - q0[1]) * L.h, uy = (qy[0] - q0[0]) * L.w, vy = (qy[1] - q0[1]) * L.h;
  const Ld = L.data, Lw = L.w, Lh = L.h;
  for (let i = 0; i < nx; i++) {
    const jh = hid ? clamp(Math.ceil((hid.at((i + 0.5) * sx) - g0) / sy - 0.5), 0, ny) : 0;      // first row of this column that was seen
    for (let j = 0; j < ny; j++) {
      let px = Math.floor(u0 + ux * i + uy * j), py = Math.floor(v0 + vx * i + vy * j);
      px = px < 0 ? 0 : px >= Lw ? Lw - 1 : px; py = py < 0 ? 0 : py >= Lh ? Lh - 1 : py;
      D[j * nx + i] = 1 - Ld[py * Lw + px] / 255;
      if (j >= jh) { V[j * nx + i] = 1; nVis++; }
    }
  }
  // how much darker each seen point is than the wall around it (a 5 m box), so a wall half in shadow still reads
  const tone = boxMean(D, V, nx, ny, Math.max(2, Math.round(2.4 / sx)), Math.max(2, Math.round(2.4 / sy)));
  const C = new Float32Array(nx * ny); let s2 = 0;
  for (let p = 0; p < D.length; p++) if (V[p]) { C[p] = D[p] - tone[p]; s2 += C[p] * C[p]; }
  const tau = Math.max(0.03, 0.5 * Math.sqrt(s2 / Math.max(nVis, 1)));

  // the wall's own middle tone, taken over what was seen and is not a dark or bright patch
  const tones = []; for (let p = 0, st = Math.max(5, (D.length / 3000) | 1); p < D.length; p += st) if (V[p] && Math.abs(C[p]) < tau * 0.5) tones.push(D[p]);
  const Dwall = median(tones);
  const mean = (A, x0, x1, ya, yb) => {
    const i0 = clamp(Math.floor(x0 / sx), 0, nx - 1), i1 = clamp(Math.ceil(x1 / sx), i0 + 1, nx), j0 = clamp(Math.floor((ya - g0) / sy), 0, ny - 1), j1 = clamp(Math.ceil((yb - g0) / sy), j0 + 1, ny);
    let s = 0; for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) s += A[j * nx + i];
    return s / ((i1 - i0) * (j1 - j0));
  };

  // how much darker a rectangle is than the 0.4 m of wall framing it: what makes a window a window, in sun or shade
  const framed = (x0, x1, ya, yb) => {
    const i0 = clamp(Math.round(x0 / sx), 0, nx - 1), i1 = clamp(Math.round(x1 / sx), i0 + 1, nx), j0 = clamp(Math.round((ya - g0) / sy), 0, ny - 1), j1 = clamp(Math.round((yb - g0) / sy), j0 + 1, ny);
    const mi = Math.max(1, Math.round(0.4 / sx)), mj = Math.max(1, Math.round(0.4 / sy));
    const I0 = Math.max(0, i0 - mi), I1 = Math.min(nx, i1 + mi), J0 = Math.max(0, j0 - mj), J1 = Math.min(ny, j1 + mj);
    let inS = 0, inN = 0, outS = 0, outN = 0;
    for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++) {
      if (!V[j * nx + i]) continue;
      if (i >= i0 && i < i1 && j >= j0 && j < j1) { inS += D[j * nx + i]; inN++; } else { outS += D[j * nx + i]; outN++; }
    }
    return inN && outN ? inS / inN - outS / outN : 0;
  };

  let rows = [], cols = [], nRib = 0, nGood = 0, Kwin = 1;
  if (nVis * sx * sy >= 18) {
    // 1. dark patches that are clean rectangles of window size
    const mask = new Uint8Array(nx * ny), cands = [];
    let sized = 0;
    for (let p = 0; p < C.length; p++) mask[p] = V[p] && C[p] > tau ? 1 : 0;
    for (const q of patches(mask, nx, ny)) {
      const cw = q.i1 - q.i0 + 1, ch = q.j1 - q.j0 + 1, w = cw * sx, h = ch * sy;
      if (w < 0.7 || h < 0.8 || h > 4.2 || q.area < 12) continue;
      sized++;
      if (q.area < 0.72 * cw * ch) continue;
      cands.push({ x0: q.i0 * sx, x1: (q.i1 + 1) * sx, y0: g0 + q.j0 * sy, y1: g0 + (q.j1 + 1) * sy, w, h, col: 0, row: 0 });
    }
    // 2. keep the ones that line up with others
    const TX = 0.45, TY = 0.45;
    for (let a = 0; a < cands.length; a++) for (let c = a + 1; c < cands.length; c++) {
      const A = cands[a], B = cands[c];
      const apartY = A.y1 <= B.y0 + 0.1 || B.y1 <= A.y0 + 0.1, apartX = A.x1 <= B.x0 + 0.1 || B.x1 <= A.x0 + 0.1;
      if (apartY && Math.abs(A.x0 - B.x0) <= TX && Math.abs(A.x1 - B.x1) <= TX && Math.abs(A.h - B.h) <= Math.max(0.6, 0.35 * Math.min(A.h, B.h))) { A.col++; B.col++; }
      if (apartX && Math.abs(A.y0 - B.y0) <= TY && Math.abs(A.y1 - B.y1) <= TY) { A.row++; B.row++; }
    }
    const ribbon = (c) => c.w >= 0.5 * W;
    const good = cands.filter((c) => c.col + c.row >= 2 || (ribbon(c) && c.col >= 1));
    nRib = good.filter(ribbon).length; nGood = good.length;
    if (good.length) Kwin = median(good.map((c) => framed(c.x0, c.x1, c.y0, c.y1)));
    if (o.dbg) Object.assign(o.dbg, { good: good.length, cands: cands.length, sized, Kwin });
    // on a real front nearly every clean rectangle lines up; a few that happen to among many that do not is pattern or clutter
    // and most window-sized dark patches are clean rectangles; where they are not, it is ornament, lettering or a roof
    if ((good.length >= 3 || nRib >= 2) && good.length >= 0.4 * cands.length && cands.length >= 0.5 * sized) {
      // 3. floors: rectangles that share a height band become one row, drawn at the row's middle sill and head
      good.sort((p, q) => p.y0 - q.y0);
      for (const c of good) {
        let r = rows.find((r) => Math.min(r.y1, c.y1) - Math.max(r.y0, c.y0) >= 0.6 * Math.min(r.y1 - r.y0, c.h));
        if (!r) rows.push(r = { y0: c.y0, y1: c.y1, list: [] });
        r.list.push(c);
        r.y0 = median(r.list.map((m) => m.y0)); r.y1 = median(r.list.map((m) => m.y1));
      }
      rows.sort((p, q) => p.y0 - q.y0);
      // two rows must not share a height: the one with fewer windows goes
      for (let k = 1; k < rows.length; k++) if (rows[k].y0 < rows[k - 1].y1 + 0.3) { rows.splice(rows[k].list.length > rows[k - 1].list.length ? k - 1 : k, 1); k = Math.max(0, k - 1); }
      rows = rows.filter((r) => r.y1 <= y1 - 0.25 && r.y1 - r.y0 >= 0.6 && r.y0 >= yMin - 0.6);
      // 4. bays: left and right edges that recur from floor to floor
      for (const r of rows) for (const c of r.list) {
        let k = cols.find((k) => Math.abs(k.x0 - c.x0) <= TX && Math.abs(k.x1 - c.x1) <= TX);
        if (!k) cols.push(k = { x0: c.x0, x1: c.x1, list: [], rows: new Set() });
        k.list.push(c); k.rows.add(r);
        k.x0 = median(k.list.map((m) => m.x0)); k.x1 = median(k.list.map((m) => m.x1));
      }
    } else if (cands.length < 2) READ.blank++; else READ.loose++;
  } else READ.blank++;

  // a clean piece of this wall to take its colour from: seen, not a window, as near the wall's middle tone as can be found
  let ref = null;
  if (nVis > 60) {
    const mid = Dwall; let best = Infinity;
    const ei = Math.min(Math.ceil(0.8 / sx), nx >> 2), ej = Math.min(Math.ceil(0.8 / sy), ny >> 2);
    for (let j = ej; j < ny - ej; j += 2) for (let i = ei; i < nx - ei; i += 2) {
      const p = j * nx + i; if (!V[p] || !V[p - ej * nx]) continue;
      const e = Math.abs(D[p] - mid) + Math.abs(tone[p] - mid) + Math.abs(C[p]);
      if (e < best) { best = e; ref = [(i + 0.5) * sx, g0 + (j + 0.5) * sy]; }
    }
  }

  // a grid cell that was seen counts as a window when it stands out from its frame at least a third as much
  // as the windows that were found do (a dark poster or a shadow fills the cell and its frame alike, and fails)
  const dark = (x0, x1, ya, yb) => ya >= g0 - 0.3 && framed(x0, x1, ya, yb) > 0.35 * Kwin;
  const tidy = (wins) => {
    wins = wins.map((w) => [Math.max(w[0], 0.15), Math.min(w[1], W - 0.15), w[2]]).filter((w) => w[1] - w[0] >= 0.5).sort((p, q) => p[0] - q[0]);
    // overlapping: a window that was read beats one that was made, then the wider one stays
    for (let k = 1; k < wins.length; k++) if (wins[k][0] < wins[k - 1][1] + 0.14) {
      const a = wins[k - 1], c = wins[k], dropA = a[2] !== c[2] ? a[2] > c[2] : c[1] - c[0] > a[1] - a[0];
      wins.splice(dropA ? k - 1 : k, 1); k = Math.max(0, k - 1);
    }
    return wins;
  };
  // how much of the wall above the lowest sill was hidden, in square metres
  let hidArea = 0;
  if (hid) for (let y = yMin + 0.5; y < y1; y += 1) for (let x = 0.5; x < W; x += 1) if (hidAt(x, y)) hidArea++;

  const out = [];
  let fh = 3.6, read = 0, made = 0;
  if (rows.length) {
    const gaps = []; for (let k = 1; k < rows.length; k++) { const g = rows[k].y0 - rows[k - 1].y0; if (g >= 2.4 && g <= 6) gaps.push(g); }
    if (gaps.length) fh = median(gaps);
    else { const up = rows[0].y0 - 0.9, n = Math.max(1, Math.round(up / 3.7)); fh = clamp(up / n, 2.7, 5); }      // one floor seen: split the height under it into storeys
    const wh = median(rows.map((r) => r.y1 - r.y0));
    // bays to carry on: the ones seen on two floors (or all of them when only one floor was seen)
    let bays = cols.filter((k) => k.rows.size >= Math.min(2, rows.length)).sort((p, q) => p.x0 - q.x0);
    if (bays.length >= 2) {
      // an even run of bays carries on across the part of the wall that was hidden, and fills its own gaps
      const d = []; for (let k = 1; k < bays.length; k++) d.push(bays[k].x0 - bays[k - 1].x0);
      const pitch = Math.min(...d), bwid = median(bays.map((k) => k.x1 - k.x0));
      if (pitch >= bwid + 0.25 && d.every((g) => Math.abs(g - Math.round(g / pitch) * pitch) <= 0.5 && g / pitch < 3.5)) {
        const have = bays.slice(), first = bays[0].x0, add = [];
        for (let x = first - Math.floor((first - 0.3) / pitch) * pitch; x + bwid <= W - 0.3; x += pitch) if (!have.some((k) => k.x0 < x + bwid + 0.14 && k.x1 > x - 0.14)) add.push({ x0: x, x1: x + bwid, ext: true, rows: new Set() });
        bays = bays.concat(add).sort((p, q) => p.x0 - q.x0);
      }
    }
    // floors to carry on: below the lowest one seen, in any gap of two storeys or more, and above the highest
    const lattice = rows.map((r) => ({ y0: r.y0, y1: r.y1, r }));
    for (let y = rows[0].y0 - fh; y >= yMin - 0.05; y -= fh) lattice.push({ y0: y, y1: y + wh, r: null });
    for (let k = 1; k < rows.length; k++) { const g = rows[k].y0 - rows[k - 1].y0, m = Math.round(g / fh); for (let q = 1; q < m; q++) lattice.push({ y0: rows[k - 1].y0 + (g * q) / m, y1: rows[k - 1].y0 + (g * q) / m + wh, r: null }); }
    for (let y = rows[rows.length - 1].y0 + fh; y + wh <= y1 - 0.4; y += fh) lattice.push({ y0: y, y1: y + wh, r: null });
    lattice.sort((p, q) => p.y0 - q.y0);
    for (const l of lattice) {
      const ym = (l.y0 + l.y1) / 2;
      // each window that was read takes its bay's edges, so a column of windows comes out as one straight column
      let wins = l.r ? l.r.list.map((c) => { const k = cols.find((k) => k.list.includes(c)); return k.rows.size >= 2 ? [k.x0, k.x1, 0] : [c.x0, c.x1, 0]; }) : [];
      for (const k of bays) {
        if (wins.some((w) => w[0] < k.x1 + 0.14 && w[1] > k.x0 - 0.14)) continue;
        if (hidAt((k.x0 + k.x1) / 2, ym)) wins.push([k.x0, k.x1, 1]);                                 // hidden here: carried on from the floors that were seen
        else if (dark(k.x0, k.x1, l.y0, l.y1)) wins.push([k.x0, k.x1, 0]);                             // seen, and dark enough to be one
      }
      wins = tidy(wins);
      if (wins.length) { out.push({ y: l.y0, h: l.y1 - l.y0, wins }); for (const w of wins) if (w[2]) made++; else read++; }
    }
    if (read < 3 && nRib < 2) { out.length = 0; made = 0; READ.loose++; }
    else { READ.ok++; READ.windows += read; READ.carried += made; return { fh, wh, rows: out, bays: nRib * 2 < nGood, ref, cover: hidArea > 4 }; }
  }

  // nothing read. A wall that was mostly seen stays as photographed; one that was hidden is rebuilt.
  if (hidArea < 10) return null;
  const P = layout(b);
  if (open) {
    const nb = Math.max(1, Math.round(W / P.bay)), bw = W / nb, ww = Math.min(P.ww, bw - 0.5);
    for (let y = yMin - 0.9 + P.sill; y + P.wh <= y1 - 0.4 && ww >= 0.5; y += P.fh) {
      const wins = [];
      for (let i = 0; i < nb; i++) { const x0 = i * bw + (bw - ww) / 2; if (hidAt(x0 + ww / 2, y + P.wh / 2)) wins.push([x0, x0 + ww, 1]); }
      if (wins.length) { out.push({ y, h: P.wh, wins: tidy(wins) }); made += wins.length; }
    }
  }
  if (made < 3) { out.length = 0; made = 0; }                // one or two windows on a small hidden patch read as a mistake: plain wall instead
  if (made) { READ.laid++; READ.carried += made; } else READ.plain++;
  return { fh: P.fh, wh: P.wh, rows: out, bays: true, ref, cover: true };
}
