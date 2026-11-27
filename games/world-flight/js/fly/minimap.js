// minimap.js — the map in the top right corner while flying: the photograph of the ground, north up, with the line flown so far
// drawn on it, and four numbers under it (distance and time in the air, top speed, greatest height).
//
// It is a small 2D canvas redrawn about six times a second (every frame only while a change of view is easing),
// so it costs the flight next to nothing. It never waits for anything: it starts as a dark square with the line
// and the marks on it, and the photo fills in behind as its tiles arrive. The photo is the one the ground itself
// is made of (net.js), so many of the tiles are already in the browser's cache, and nothing new has to be credited.
// The map belongs to one flight: reset(lat, lon) starts a new one round a place (a new line, numbers at nought).
//
//   track(flight, dt)   once a frame after the aircraft has moved: adds to the line and the numbers
//   draw(now, flight, night, units)   once a frame: redraws when it is due
//   mark('touchdown' | 'crash')   a mark where the aircraft is
//   next()   Close -> Area -> Whole trip; returns the new view's name
import { worldToGeo, lonTile, latTile } from '../geo.js';
import { photoUrl, fetchTile, PHOTO_BLANK } from '../net.js';

const D2R = Math.PI / 180, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// "Map metres": web mercator, scaled so that a metre is a metre where the flight began. x is east, y is south.
// (They do not change when the page moves its origin: the line is kept by latitude and longitude.)
let W = 40075016.686, X0 = 0.5, Y0 = 0.5;
const mapX = (lon) => { let d = lonTile(lon, 0) - X0; if (d > 0.5) d -= 1; else if (d < -0.5) d += 1; return d * W; }, mapY = (lat) => (latTile(lat, 0) - Y0) * W;

export const VIEWS = { close: { name: 'Close', span: 5000 }, area: { name: 'Area', span: 12000 }, trip: { name: 'Whole trip', span: 0 } };
const ORDER = ['close', 'area', 'trip'];
const TRIP_MIN = 6000, TRIP_PAD = 1.3;          // the whole trip: never closer than 6 km across, a margin round what was flown
const GAP = 40, MAX = 6000;                     // a point on the line every 40 m; at 6,000 points every other one goes
const JUMP = 90;                                // further than this in one step: the aircraft was put there, not flown there
const EASE = 0.085;                             // s; a change of view is 98% done in a third of a second
const SEA = '#0f1f2b', AMBER = '#ffb35c', BAD = '#ff7a5c', DARK = 'rgba(8, 11, 14, 0.9)';
const NONE = 0, LOADING = 1, READY = 2, FAILED = 3;
const KEEP = 64, JOBS = 4, RETRY = 30000, GIVE_UP = 15000;
const BAR = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
const FONT = '"Segoe UI", "Hiragino Sans", system-ui, -apple-system, sans-serif';


const tileKey = (z, x, y) => z * 2 ** 44 + x * 2 ** 22 + y;

export class MiniMap {
  constructor({ root, canvas, out = {}, view = 'area', on = true }) {
    this.root = root; this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.out = out; this.said = {};
    this.view = VIEWS[view] ? view : 'area';
    this.on = true; this.setOn(on);
    // the line: pairs of map metres, a NaN pair where it was put somewhere else
    this.pts = new Float32Array(MAX * 2); this.n = 0; this.gap = GAP; this.since = 0;
    this.bx0 = Infinity; this.bx1 = -Infinity; this.by0 = Infinity; this.by1 = -Infinity;
    this.marks = [];                             // { x, y, k: 'start' | 'touchdown' | 'crash' }
    this.p = { x: 0, y: 0, z: 0 }; this.had = false;
    // the numbers
    this.dist = 0; this.time = 0; this.top = 0; this.high = 0;
    // the view as drawn: metres across, and the centre as an offset from the aircraft
    this.span = 0; this.ox = 0; this.oy = 0; this.anim = false;
    this.k = 1; this.css = 0; this.dirty = true; this.drawnAt = -1e9; this.textAt = -1e9; this.tick = 0;
    this.tiles = new Map(); this.ready = 0; this.loading = 0; this.zT = 11;
    this.list = []; this.want = []; this.boxes = []; this.near = [];
    this.stats = { draws: 0, ms: 0, worst: 0, asked: 0, got: 0, none: 0, failed: 0 };
    this.spots = [];                             // what is named on the map: towns and airfields (setSpots)
    this.byRank = (a, b) => Math.abs(b.z - this.zT) - Math.abs(a.z - this.zT) || a.z - b.z;      // the wanted level last, on top
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.fit()).observe(canvas);
    this.fit();
  }

  // a new flight, round a place: the line, the marks and the numbers start again
  reset(lat, lon) {
    W = 40075016.686 * Math.cos(lat * D2R); X0 = lonTile(lon, 0); Y0 = latTile(lat, 0);
    for (const t of this.tiles.values()) t.bmp?.close?.();
    this.tiles.clear(); this.ready = 0;
    this.n = 0; this.gap = GAP; this.since = 0; this.marks.length = 0; this.had = false;
    this.bx0 = Infinity; this.bx1 = -Infinity; this.by0 = Infinity; this.by1 = -Infinity;
    this.dist = 0; this.time = 0; this.top = 0; this.high = 0; this.span = 0; this.dirty = true; this.textAt = -1e9;
    for (const s of this.spots) { s.x = mapX(s.lon); s.y = mapY(s.lat); }
  }
  // the places to name: [{ name, lat, lon }], most important first
  setSpots(list) { this.spots = list.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, x: mapX(p.lon), y: mapY(p.lat), w: 0, wf: '', d: 0 })); this.dirty = true; }
  // the page has moved its origin: where the aircraft was last seen moves with it, so no gap is cut in the line
  rebase(pos) { this.p.x = pos.x; this.p.y = pos.y; this.p.z = pos.z; }
  get name() { return VIEWS[this.view].name; }
  next() { this.view = ORDER[(ORDER.indexOf(this.view) + 1) % ORDER.length]; this.dirty = true; return this.name; }
  setOn(on) { this.on = !!on; this.root?.classList.toggle('hide', !this.on); this.dirty = true; }

  // the canvas has as many dots as the screen gives its box (up to twice its size in CSS pixels)
  fit() {
    this.dpr = globalThis.devicePixelRatio || 1;
    const w = this.cv.clientWidth; if (!w) return;
    const S = Math.round(w * Math.min(this.dpr, 2));
    if (S !== this.cv.width || S !== this.cv.height) { this.cv.width = S; this.cv.height = S; }
    this.k = S / w; this.css = w; this.dirty = true;
  }

  /* ---------------------------------------------------------------- the line and the numbers */
  track(flight, dt) {
    const q = flight.pos, p = this.p;
    const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d3 = this.had ? Math.hypot(dx, dy, dz) : Infinity;
    p.x = q.x; p.y = q.y; p.z = q.z; this.had = true;
    if (d3 > JUMP) { this.cut(); return; }
    if (!flight.crashed) {
      if (!flight.onGround) {
        this.dist += d3; this.time += dt;
        const h = flight.agl - flight.spec.gearH; if (h > this.high) this.high = h;
      }
      if (flight.V > this.top) this.top = flight.V;
    }
    this.since += Math.hypot(dx, dz);
    if (this.since >= this.gap) { this.since = 0; this.add(); }
  }
  // a new piece of line starts where the aircraft is now
  cut() {
    if (this.n && this.pts[2 * this.n - 2] === this.pts[2 * this.n - 2]) this.push(NaN, NaN);
    const at = this.add(); this.since = 0;
    this.note('start', at);
  }
  add() {
    const g = worldToGeo(this.p), x = mapX(g.lon), y = mapY(g.lat);
    this.push(x, y);
    if (x < this.bx0) this.bx0 = x; if (x > this.bx1) this.bx1 = x; if (y < this.by0) this.by0 = y; if (y > this.by1) this.by1 = y;
    return { x, y };
  }
  push(x, y) {
    if (this.n >= MAX) this.thin();
    this.pts[2 * this.n] = x; this.pts[2 * this.n + 1] = y; this.n++;
  }
  // every other point goes (the ends of each piece stay) and new ones come half as often
  thin() {
    const P = this.pts; let o = 0, run = 0;
    for (let i = 0; i < this.n; i++) {
      const x = P[2 * i], gapHere = x !== x, last = i === this.n - 1 || P[2 * i + 2] !== P[2 * i + 2];
      if (gapHere) { run = 0; P[2 * o] = NaN; P[2 * o + 1] = NaN; o++; continue; }
      if (run % 2 === 0 || last) { P[2 * o] = x; P[2 * o + 1] = P[2 * i + 1]; o++; }
      run++;
    }
    this.n = o; this.gap *= 2;
  }
  mark(kind) { if (this.had) { const g = worldToGeo(this.p); this.note(kind, { x: mapX(g.lon), y: mapY(g.lat) }); } }
  note(k, at) { this.marks.push({ x: at.x, y: at.y, k }); if (this.marks.length > 160) this.marks.shift(); this.dirty = true; }

  /* ---------------------------------------------------------------- the photo */
  tile(z, x, y) {
    const key = tileKey(z, x, y); let t = this.tiles.get(key);
    if (!t) {
      const m = W / 2 ** z;
      t = { key, z, x, y, s: NONE, asked: false, bmp: null, used: this.tick, at: 0, m, mx: (x / 2 ** z - X0) * W, my: (y / 2 ** z - Y0) * W };
      this.tiles.set(key, t);
    }
    return t;
  }
  // ask for a tile unless it is here, on its way, known to be open sea, or failed a moment ago
  ask(t, now) {
    t.used = this.tick;
    if (t.s === READY || t.s === LOADING || (t.s === NONE && t.asked)) return;
    if (t.s === FAILED && now - t.at < RETRY) return;
    if (this.loading >= JOBS) return;
    t.s = LOADING; t.asked = true; this.loading++; this.stats.asked++;
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), GIVE_UP);
    fetchTile(photoUrl(t.z, t.x, t.y), { mode: 'cors', signal: stop.signal })
      .then(async (r) => {
        if (r.status === 404) { t.s = NONE; this.stats.none++; return; }            // open sea has no photo
        if (!r.ok) throw new Error('http ' + r.status);
        const b = await r.blob();
        if (b.size === PHOTO_BLANK) { t.s = NONE; this.stats.none++; return; }      // nothing photographed at this level
        t.bmp = await createImageBitmap(b); t.s = READY; this.ready++; this.stats.got++;
      })
      .catch(() => { t.s = FAILED; t.at = performance.now(); this.stats.failed++; })
      .finally(() => { clearTimeout(timer); this.loading--; this.dirty = true; if (this.ready > KEEP || this.tiles.size > 400) this.trim(); });
  }
  // the pictures used longest ago go; so do old notes of sea and of failures
  trim() {
    const all = [...this.tiles.values()];
    if (this.ready > KEEP) {
      const old = all.filter((t) => t.s === READY).sort((a, b) => a.used - b.used);
      for (let i = 0; i < old.length && this.ready > KEEP - 8; i++) { const t = old[i]; t.bmp?.close?.(); t.bmp = null; this.tiles.delete(t.key); this.ready--; }
    }
    if (this.tiles.size > 400) for (const t of all) if ((t.s === NONE || t.s === FAILED) && this.tick - t.used > 300) this.tiles.delete(t.key);
  }

  /* ---------------------------------------------------------------- drawing */
  draw(now, flight, night = 0, units = 'm') {
    if (!this.on || (typeof document !== 'undefined' && document.hidden)) return;
    if ((globalThis.devicePixelRatio || 1) !== this.dpr) this.fit();          // moved to another screen, or the page was zoomed
    const S = this.cv.width; if (S < 16 || !this.css) return;
    if (!this.anim && !this.dirty && now - this.drawnAt < 160) return;
    const t0 = performance.now();
    const dt = clamp((now - this.drawnAt) / 1000, 0, 0.25); this.drawnAt = now; this.dirty = false; this.tick++;
    const ctx = this.ctx, k = this.k, small = this.css < 130;

    // where the aircraft is, and the view that is wanted
    const g = worldToGeo(flight.pos), ax = mapX(g.lon), ay = mapY(g.lat);
    let wantSpan, wox = 0, woy = 0;
    if (this.view === 'trip') {
      const x0 = Math.min(this.bx0, ax), x1 = Math.max(this.bx1, ax), y0 = Math.min(this.by0, ay), y1 = Math.max(this.by1, ay);
      wantSpan = Math.max(TRIP_MIN, TRIP_PAD * Math.max(x1 - x0, y1 - y0)); wox = (x0 + x1) / 2 - ax; woy = (y0 + y1) / 2 - ay;
    } else wantSpan = VIEWS[this.view].span;
    if (!this.span) { this.span = wantSpan; this.ox = wox; this.oy = woy; }
    else {
      const e = 1 - Math.exp(-dt / EASE);
      this.span *= (wantSpan / this.span) ** e; this.ox += (wox - this.ox) * e; this.oy += (woy - this.oy) * e;
    }
    this.anim = Math.abs(Math.log(wantSpan / this.span)) > 0.004 || Math.hypot(wox - this.ox, woy - this.oy) > this.span * 0.003;
    if (!this.anim) { this.span = wantSpan; this.ox = wox; this.oy = woy; }
    const span = this.span, inv = S / span, x0 = ax + this.ox - span / 2, y0 = ay + this.oy - span / 2;

    // The photo. The level is the one whose dots are about the canvas's own, for the view that is wanted (not the
    // one easing towards it, or every level between would be fetched on the way).
    const zT = this.zT = clamp(Math.ceil(Math.log2(W / 256 / (wantSpan / S)) - 0.35), 5, 16), n = 2 ** zT;
    const wx0 = ax + wox - wantSpan / 2, wy0 = ay + woy - wantSpan / 2;
    const a0 = Math.floor((wx0 / W + X0) * n), a1 = Math.floor(((wx0 + wantSpan) / W + X0) * n);
    const b0 = Math.floor((wy0 / W + Y0) * n), b1 = Math.floor(((wy0 + wantSpan) / W + Y0) * n);
    const want = this.want; want.length = 0;
    let whole = !this.anim;
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const t = this.tile(zT, a, b); want.push(t);
      if (t.s !== READY && !(t.s === NONE && t.asked)) whole = false;
    }
    if (!whole) {
      // nearest the middle first; and one coarse tile that covers the whole view, which is here in one go
      const mx = ax + wox, my = ay + woy;
      for (const t of want) t.d = Math.abs(t.mx + t.m / 2 - mx) + Math.abs(t.my + t.m / 2 - my);
      want.sort((p, q) => p.d - q.d);
      if (zT > 7 && want.length && want[0].s !== READY) this.ask(this.tile(zT - 3, want[0].x >> 3, want[0].y >> 3), now);
      for (const t of want) this.ask(t, now);
    } else for (const t of want) t.used = this.tick;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = SEA; ctx.fillRect(0, 0, S, S);
    // every picture that is here and in view goes down, the wanted level on top; once that level is whole it goes down alone
    const list = this.list; list.length = 0;
    for (const t of this.tiles.values()) {
      if (t.s !== READY || (whole && t.z !== zT)) continue;
      const l = (t.mx - x0) * inv, u = (t.my - y0) * inv, w = t.m * inv;
      if (l >= S || u >= S || l + w <= 0 || u + w <= 0 || (t.z !== zT && w < 8)) continue;
      list.push(t);
    }
    if (!whole) list.sort(this.byRank);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
    for (const t of list) {
      const l = Math.round((t.mx - x0) * inv), u = Math.round((t.my - y0) * inv), r = Math.round((t.mx + t.m - x0) * inv), d = Math.round((t.my + t.m - y0) * inv);
      ctx.drawImage(t.bmp, l, u, r - l, d - u); t.used = this.tick;
    }
    // darkened, so the line and the marks read on it, and it is not a bright square at night
    ctx.fillStyle = `rgba(6, 10, 14, ${(0.22 + 0.38 * clamp(night, 0, 1)).toFixed(3)})`; ctx.fillRect(0, 0, S, S);

    const apx = (ax - x0) * inv, apy = (ay - y0) * inv;
    // where a place's name may not go: the aircraft, the scale, the N, and (added below) the line and its marks
    const boxes = this.boxes; boxes.length = 0;
    const names = !small && span <= 30000;
    if (names) boxes.push(apx - 9 * k, apy - 9 * k, 18 * k, 18 * k, 0, S - 24 * k, S * 0.5, 24 * k, S / 2 - 8 * k, 0, 16 * k, 14 * k);

    // the line flown: a dark casing, then amber
    if (this.n) {
      const P = this.pts, N = this.n, far = span, step = 7 * k;
      ctx.beginPath(); let pen = false, lx = 0, ly = 0, kx = -1e9, ky = -1e9;
      for (let i = 0; i < N; i++) {
        const X = P[2 * i];
        if (X !== X) { pen = false; continue; }
        const u = X - x0, v = P[2 * i + 1] - y0;
        if (u < -far || v < -far || u > span + far || v > span + far) { pen = false; continue; }          // well out of view (a piece is far shorter than that)
        const px = u * inv, py = v * inv;
        if (!pen) { ctx.moveTo(px, py); pen = true; lx = px; ly = py; }
        else if (Math.abs(px - lx) + Math.abs(py - ly) >= 1.5 || i === N - 1 || P[2 * i + 2] !== P[2 * i + 2]) { ctx.lineTo(px, py); lx = px; ly = py; }
        if (names && boxes.length < 1600 && px > 0 && py > 0 && px < S && py < S && Math.abs(px - kx) + Math.abs(py - ky) >= step) { boxes.push(px - step / 2, py - step / 2, step, step); kx = px; ky = py; }
      }
      if (P[2 * N - 2] === P[2 * N - 2]) { if (pen) ctx.lineTo(apx, apy); else ctx.moveTo(apx, apy); }       // and on to where it is now
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = DARK; ctx.lineWidth = (small ? 3.2 : 4) * k; ctx.stroke();
      ctx.strokeStyle = AMBER; ctx.lineWidth = (small ? 1.7 : 2) * k; ctx.stroke();
    }

    // the places: a dot each, and a name for the nearest few where there is room
    const near = this.near; near.length = 0;
    if (names) for (const m of this.marks) { const px = (m.x - x0) * inv, py = (m.y - y0) * inv; if (px > 0 && py > 0 && px < S && py < S) boxes.push(px - 5 * k, py - 5 * k, 10 * k, 10 * k); }
    ctx.lineWidth = 1.2 * k; ctx.strokeStyle = DARK; ctx.fillStyle = '#fff';
    for (const s of this.spots) {
      const px = (s.x - x0) * inv, py = (s.y - y0) * inv;
      if (px < 3 * k || py < 3 * k || px > S - 3 * k || py > S - 3 * k) continue;
      ctx.beginPath(); ctx.arc(px, py, (small ? 1.7 : 2.2) * k, 0, 6.2832); ctx.fill(); ctx.stroke();
      if (names) { s.d = Math.hypot(s.x - ax, s.y - ay); s.px = px; s.py = py; near.push(s); }
    }
    if (names && near.length) {
      near.sort((p, q) => p.d - q.d);
      const font = `600 ${(9.5 * k).toFixed(1)}px ${FONT}`; ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.lineJoin = 'round'; ctx.lineWidth = 2.6 * k; ctx.strokeStyle = DARK;
      const h = 12 * k, pad = 5 * k;
      let put = 0;
      for (const s of near) {
        if (put >= 6) break;
        if (s.wf !== font) { s.w = ctx.measureText(s.name).width; s.wf = font; }
        // beside the dot on the right, else on the left, else under it, else over it; else it goes without a name
        let bx = 0, by = 0, ok = false;
        for (let j = 0; j < 4 && !ok; j++) {
          bx = j === 0 ? s.px + pad : j === 1 ? s.px - pad - s.w : s.px - s.w / 2;
          by = j < 2 ? s.py - h / 2 : j === 2 ? s.py + 3.5 * k : s.py - 3.5 * k - h;
          ok = bx >= 3 * k && bx + s.w <= S - 3 * k && by >= 2 * k && by + h <= S - 2 * k && !this.hits(bx - 2 * k, by, s.w + 4 * k, h);
        }
        if (!ok) continue;
        ctx.strokeText(s.name, bx, by + h / 2); ctx.fillStyle = '#fff'; ctx.fillText(s.name, bx, by + h / 2);
        boxes.push(bx - 2 * k, by, s.w + 4 * k, h); put++;
      }
    }

    // marks: a ring where each piece of line starts, a dot at each landing, a red cross where it came to grief
    for (const m of this.marks) {
      const px = (m.x - x0) * inv, py = (m.y - y0) * inv;
      if (px < -8 || py < -8 || px > S + 8 || py > S + 8) continue;
      if (m.k === 'crash') {
        const r = 3.6 * k; ctx.beginPath(); ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r); ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r);
        ctx.lineCap = 'round'; ctx.strokeStyle = DARK; ctx.lineWidth = 3.6 * k; ctx.stroke(); ctx.strokeStyle = BAD; ctx.lineWidth = 1.8 * k; ctx.stroke();
      } else if (m.k === 'start') {
        ctx.beginPath(); ctx.arc(px, py, 3.1 * k, 0, 6.2832);
        ctx.strokeStyle = DARK; ctx.lineWidth = 3.4 * k; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * k; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(px, py, 2.3 * k, 0, 6.2832);
        ctx.fillStyle = AMBER; ctx.fill(); ctx.strokeStyle = DARK; ctx.lineWidth = 1.2 * k; ctx.stroke();
      }
    }

    // the aircraft: a dart pointing the way it is heading
    {
      const s = (small ? 0.82 : 1) * k;
      ctx.save(); ctx.translate(apx, apy); ctx.rotate(flight.heading * D2R); ctx.scale(s, s);
      ctx.beginPath(); ctx.moveTo(0, -7.5); ctx.lineTo(5.2, 6); ctx.lineTo(0, 3.2); ctx.lineTo(-5.2, 6); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.strokeStyle = DARK; ctx.lineWidth = 2.6; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
    }

    // north, and a length to judge distance by
    ctx.lineJoin = 'round'; ctx.strokeStyle = DARK; ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = `700 ${((small ? 8 : 9) * k).toFixed(1)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineWidth = 2.4 * k;
    ctx.strokeText('N', S / 2, 3.5 * k); ctx.fillText('N', S / 2, 3.5 * k);
    if (!small) {
      const imp = units === 'ft', unit = imp ? 1852 : 1000; let len = BAR[0];
      for (const b of BAR) if (b * unit * inv <= S * 0.36) len = b;
      const w = len * unit * inv, bx = 8 * k, by = S - 8 * k;
      ctx.beginPath(); ctx.moveTo(bx, by - 3.5 * k); ctx.lineTo(bx, by); ctx.lineTo(bx + w, by); ctx.lineTo(bx + w, by - 3.5 * k);
      ctx.lineCap = 'butt'; ctx.strokeStyle = DARK; ctx.lineWidth = 3.4 * k; ctx.stroke(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'; ctx.lineWidth = 1.4 * k; ctx.stroke();
      ctx.font = `600 ${(8.5 * k).toFixed(1)}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const label = `${len} ${imp ? 'nm' : 'km'}`; ctx.strokeStyle = DARK; ctx.lineWidth = 2.4 * k;
      ctx.strokeText(label, bx + 1 * k, by - 6 * k); ctx.fillText(label, bx + 1 * k, by - 6 * k);
    }

    if (now - this.textAt > 480) { this.textAt = now; this.text(units); }
    const ms = performance.now() - t0; this.stats.draws++; this.stats.ms += ms; if (ms > this.stats.worst) this.stats.worst = ms;
  }
  // does a box touch one already taken?
  hits(x, y, w, h) {
    const B = this.boxes;
    for (let i = 0; i < B.length; i += 4) if (x < B[i] + B[i + 2] && x + w > B[i] && y < B[i + 1] + B[i + 3] && y + h > B[i + 1]) return true;
    return false;
  }

  /* ---------------------------------------------------------------- the numbers under it */
  read(units = 'm') {
    const imp = units === 'ft', d = this.dist / (imp ? 1852 : 1000);
    const s = Math.floor(this.time), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, '0');
    return {
      dist: d < 100 ? d.toFixed(1) : String(Math.round(d)), distU: imp ? 'nm' : 'km',
      time: h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`,
      top: String(Math.round(this.top * (imp ? 1.94384 : 3.6))), topU: imp ? 'kt' : 'km/h',
      high: String(Math.round(this.high * (imp ? 3.28084 : 1))), highU: imp ? 'ft' : 'm',
    };
  }
  text(units) {
    const r = this.read(units), o = this.out, said = this.said;
    for (const key in r) if (o[key] && said[key] !== r[key]) { said[key] = r[key]; o[key].textContent = r[key]; }
  }
}
