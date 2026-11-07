// The living reef: CPU simulation of every creature near the player. Schools, prey that flee, ambushers, hunters, drifters,
// the spawn director that keeps the right mix of food and danger around the player, and the draw sync into CreatureRenderer.
import * as THREE from 'three';
import { SPECIES, DIFFICULTY, speedsFor, biteDamage, noticeRange, VIS } from './data.js';
import { lodFor } from './render.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
let NEXT_ID = 1;

// ---------------------------------------------------------------------------------------------------------------------------------
// spatial hash (cell 8 m); rebuilt every frame
// ---------------------------------------------------------------------------------------------------------------------------------
class Grid {
  constructor() { this.cell = 8; this.b = new Array(8192).fill(null); this.used = []; }
  key(cx, cy, cz) { return ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) & 8191; }
  clear() { for (const k of this.used) this.b[k].length = 0; this.used.length = 0; }
  insert(c) {
    const k = this.key(Math.floor(c.x / 8), Math.floor(c.y / 8), Math.floor(c.z / 8));
    let a = this.b[k]; if (!a) a = this.b[k] = [];
    if (a.length === 0) this.used.push(k);
    a.push(c);
  }
  query(x, y, z, r, fn) {
    const c0 = Math.floor((x - r) / 8), c1 = Math.floor((x + r) / 8), d0 = Math.floor((y - r) / 8), d1 = Math.floor((y + r) / 8), e0 = Math.floor((z - r) / 8), e1 = Math.floor((z + r) / 8);
    for (let a = c0; a <= c1; a++) for (let b = d0; b <= d1; b++) for (let c = e0; c <= e1; c++) {
      const arr = this.b[this.key(a, b, c)]; if (!arr) continue;
      for (let i = 0; i < arr.length; i++) fn(arr[i]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// creature
// ---------------------------------------------------------------------------------------------------------------------------------
class Creature {
  constructor(key, sp, len, rnd) {
    this.id = NEXT_ID++; this.key = key; this.sp = sp; this.fam = sp.fam; this.role = sp.role; this.beh = sp.beh; this.len = len;
    this.vis = sp.vis ?? sp.model ?? key;
    const k = Math.pow(len / sp.len, 0.5), s = speedsFor(sp);
    this.cruise = s.cruise * k; this.flee = s.flee * k; this.chase = s.chase * k; this.turn = s.turn;
    this.x = 0; this.y = 0; this.z = 0; this.fx = 1; this.fy = 0; this.fz = 0; this.sp_ = 0;     // sp_ = current speed
    this.kx = 0; this.ky = 0; this.kz = 0;                                                          // knock-back velocity
    this.roll = 0; this.ph = rnd() * TAU; this.amp = 1; this.turnLean = 0; this.flash = 0;
    this.hr = 0; this.hg = 0; this.hb = 0; this.ha = 0; this.cls = 0;
    this.tr = 0.88 + 0.24 * rnd(); this.tg = 0.88 + 0.24 * rnd(); this.tb = 0.88 + 0.24 * rnd();
    this.s0 = rnd(); this.s1 = rnd(); this.s2 = rnd(); this.s3 = rnd();
    this.state = 'idle'; this.stateT = 0; this.thinkT = rnd() * 0.2; this.cd = 0; this.chaseT = 0; this.alert = 0; this.stun = 0;
    this.home = null; this.goal = null; this.school = null; this.ox = 0; this.oy = 0; this.oz = 0;
    this.target = null; this.hunger = 12 + rnd() * 30; this.dead = false; this.eatenT = -1; this.minH = Math.max(0.04, len * 0.28);
    this.bend = 0; this.moodT = rnd() * 14; this.freq = (VIS[this.vis]?.freq ?? 2.5);
    this.seen = false;
  }
}

class School {
  constructor(id, key, sp, x, y, z, rnd) {
    this.id = id; this.key = key; this.sp = sp; this.members = []; this.x = x; this.y = y; this.z = z; this.vx = 0; this.vy = 0; this.vz = 0;
    this.gx = x; this.gy = y; this.gz = z; this.goalT = 0; this.panic = 0; this.tx = 0; this.ty = 0; this.tz = 0; this.rad = 1; this.checkT = rnd() * 0.2; this.hot = 0;
    this.dir = [1, 0, 0];
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// ecosystem
// ---------------------------------------------------------------------------------------------------------------------------------
export class Ecosystem {
  constructor({ gw, renderer, specks, rnd, difficulty = 'normal' }) {
    this.gw = gw; this.renderer = renderer; this.specks = specks; this.rnd = rnd; this.diff = DIFFICULTY[difficulty];
    this.list = []; this.schools = new Map(); this.grid = new Grid(); this.counts = {};
    this.events = []; this.time = 0; this.dirT = 0; this.threats = []; this.nextSchool = 1;
    this.keys = Object.keys(SPECIES).filter((k) => SPECIES[k].fam !== 'speck');
    this.speckKeys = Object.keys(SPECIES).filter((k) => SPECIES[k].fam === 'speck');
    this.ready = new Set();                     // species the renderer can draw
    this.recs = new Map();
    this.hintScale = 0.6; this.maxCreatures = 520;
    this._d3 = { x: 0, y: 0, z: 0 }; this.tmp = { x: 0, z: 0 }; this.hab = { zone: 'lagoon', depth: 3, sand: 0, reef: 0, rock: 0, grass: 0, slope: 0 };
    this.fx = null; this.player = null; this.decoys = []; this.golden = null; this.goldT = 40;
    this.stats = { spawned: 0, despawned: 0, eatenByPred: 0 };
  }

  setDifficulty(d) { this.diff = DIFFICULTY[d]; }

  // ---- renderer records (lazy) ------------------------------------------------------------------------------------------------
  rec(key) {
    let r = this.recs.get(key);
    if (r !== undefined) return r;
    const sp = SPECIES[key]; r = null;
    try {
      if (sp.fam === 'fish' || sp.fam === 'hero') {
        const cap = sp.beh === 'shoal' ? (sp.grp[1] > 100 ? 260 : 160) : (sp.fam === 'hero' ? 10 : 40);
        r = this.renderer.ensure(sp.vis ?? key, cap, sp.len, sp.len > 0.3);
      } else if (sp.fam === 'crawl') r = this.renderer.ensure('crawl_' + sp.model, 48, sp.len, false);
      else if (sp.fam === 'jelly') r = this.renderer.ensure('jelly', 28, sp.len, false);
    } catch (e) { console.error('renderer record failed for', key, e); r = null; }
    this.recs.set(key, r);
    return r;
  }

  // ---- habitat ---------------------------------------------------------------------------------------------------------------
  suit(sp, h) {
    const a = sp.hab;
    if (!a.zones.includes(h.zone)) return 0;
    if (h.depth < a.depth[0]) return 0;
    if (h.depth > a.depth[1] && a.place !== 'water') return 0;
    let s = 1;
    for (const k of ['reef', 'sand', 'rock', 'grass']) {
      const r = a[k]; if (!r) continue;
      const v = h[k];
      if (v < r[0]) s *= Math.pow(clamp(v / Math.max(r[0], 0.01), 0, 1), 2); else if (v > r[1]) s *= Math.pow(clamp((1 - v) / Math.max(1 - r[1], 0.01), 0, 1), 2);
    }
    if (a.steep) { if (h.slope < a.steep[0] || h.slope > a.steep[1]) return 0; }
    return s;
  }

  levelWeight(sp, pl) {
    const L = pl.level, len = pl.len;
    if (sp.role === 'prey') { const d = sp.tier - L; return d === 0 ? 1.5 : Math.abs(d) === 1 ? 1.0 : Math.abs(d) === 2 ? 0.7 : 0.45; }
    if (sp.role === 'pred') { const r = sp.len / len; return r >= 1.25 ? 1.0 : r >= 0.8 ? 0.5 : 0.7; }
    return 0.8;
  }

  spawnRadius(sp) { return clamp(26 + 46 * Math.sqrt(sp.len), 30, 130); }

  // ---- spawning --------------------------------------------------------------------------------------------------------------
  placeY(sp, h, floorY, len, rnd) {
    const a = sp.hab; let y;
    if (a.place === 'floor') y = floorY + Math.max(0.03, len * 0.3);
    else if (a.place === 'near') y = floorY + lerp(a.h[0], a.h[1], rnd());
    else { const d0 = a.depthBand[0], d1 = Math.max(d0 + 0.3, Math.min(a.depthBand[1], h.depth - 1.6)); y = -lerp(d0, d1, rnd()); }
    return clamp(y, floorY + len * 0.4 + 0.05, -(len * 0.5 + 0.2));
  }

  spawnGroup(key, x, z, h, group = true) {
    const sp = SPECIES[key], rnd = this.rnd, gw = this.gw;
    const floorY = gw.floor(x, z);
    const n = sp.grp ? Math.round(lerp(sp.grp[0], sp.grp[1], Math.pow(rnd(), 1.4))) : 1;
    const y0 = this.placeY(sp, h, floorY, sp.len, rnd);
    let school = null;
    if (sp.beh === 'shoal' || sp.beh === 'pack') { school = new School(this.nextSchool++, key, sp, x, y0, z, rnd); school.rad = clamp(0.8 + Math.cbrt(n) * sp.len * 6, 0.8, 9); school.cd = 0; this.schools.set(school.id, school); school.pack = sp.beh === 'pack'; school.home = { x, z }; }
    const dir = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const vr = sp.beh === 'shoal' ? 0.10 : 0.16;
      const len = sp.len * (1 + vr * (rnd() * 2 - 1));
      const c = new Creature(key, sp, len, rnd);
      const spread = school ? school.rad : (sp.beh === 'solo' ? 2.5 : 1.5);
      const a = rnd() * TAU, rr = spread * Math.sqrt(rnd());
      c.x = x + Math.cos(a) * rr; c.z = z + Math.sin(a) * rr;
      const fy = gw.floor(c.x, c.z);
      c.y = clamp(y0 + (rnd() - 0.5) * (school ? school.rad * 0.5 : 0.8), fy + c.minH + 0.03, -(len * 0.5 + 0.2));
      c.fx = Math.cos(dir); c.fz = Math.sin(dir); c.fy = 0;
      c.sp_ = c.cruise * 0.7;
      c.home = { x: c.x, y: c.y, z: c.z, hx: c.fx, hz: c.fz };
      if (school) { c.school = school; school.members.push(c); c.ox = (rnd() * 2 - 1); c.oy = (rnd() * 2 - 1) * 0.5; c.oz = (rnd() * 2 - 1); const l = Math.hypot(c.ox, c.oy * 2, c.oz) || 1; if (l > 1) { c.ox /= l; c.oy /= l; c.oz /= l; } }
      if (sp.beh === 'den') { this.setupDen(c, h); }
      this.list.push(c);
    }
    this.counts[key] = (this.counts[key] || 0) + 1;
    this.stats.spawned += n;
    return n;
  }

  // moray: tuck into the slope so only the head shows
  setupDen(c, h) {
    const gw = this.gw, hb = gw.hab(c.x, c.z, this.hab);
    const gx = hb.gx, gz = hb.gz, gl = Math.hypot(gx, gz) || 1;
    // heading points downhill (out of the slope); the body lies back into the rock
    c.fx = gx / gl; c.fz = gz / gl; c.fy = 0;
    const out = c.fx, outz = c.fz;
    c.x -= out * c.len * 0.18; c.z -= outz * c.len * 0.18;
    c.y = gw.floor(c.x, c.z) + c.len * 0.12;
    c.home = { x: c.x, y: c.y, z: c.z, hx: c.fx, hz: c.fz }; c.noClamp = true; c.sp_ = 0;
  }

  removeCreature(c, why) {
    if (c.dead) return;
    c.dead = true;
    if (c.decoy) { const i = this.decoys.indexOf(c); if (i >= 0) this.decoys.splice(i, 1); return; }
    if (c.school) { const i = c.school.members.indexOf(c); if (i >= 0) c.school.members.splice(i, 1); if (c.school.members.length === 0) { this.schools.delete(c.school.id); this.counts[c.key] = Math.max(0, (this.counts[c.key] || 1) - 1); } }
    else this.counts[c.key] = Math.max(0, (this.counts[c.key] || 1) - 1);
    if (why === 'despawn') this.stats.despawned++;
  }

  // keep populations right around the player. force = fill instantly (game start)
  direct(dt, pl, force = 0) {
    this.dirT -= dt;
    if (this.dirT > 0 && !force) return;
    this.dirT = 0.22;
    const rnd = this.rnd, gw = this.gw, px = pl.x, pz = pl.z;
    // despawn: creatures far from the player (or fully out of any need)
    let removed = 0;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i]; if (c.dead) continue;
      const R = this.spawnRadius(c.sp) * 1.3;
      const dx = c.x - px, dz = c.z - pz, d2 = dx * dx + dz * dz;
      if (d2 > R * R && c.state !== 'chase' && !c.golden && removed < 60) { this.removeCreature(c, 'despawn'); removed++; }
    }
    // spawn
    const tries = force ? force : 5;
    for (let t = 0; t < tries; t++) {
      if (this.list.length >= this.maxCreatures) break;
      const sp0 = this.keys[(rnd() * this.keys.length) | 0], sp = SPECIES[sp0];
      if (!this.rec(sp0)) continue;
      const R = this.spawnRadius(sp);
      const r = force ? Math.sqrt(rnd()) * R : lerp(R * 0.3, R, Math.sqrt(rnd()));
      const a = rnd() * TAU, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (!gw.inBounds(x, z)) continue;
      if (!force) {                                   // do not pop into view
        const dx = x - pl.x, dz = z - pl.z, dl = Math.hypot(dx, dz) || 1;
        if ((dx / dl) * pl.viewX + (dz / dl) * pl.viewZ > 0.6 && r < R * 0.8 && rnd() < 0.9) continue;
      }
      const h = gw.hab(x, z, this.hab);
      let s = this.suit(sp, h); if (s <= 0) continue;
      const area = Math.PI * R * R / 1e4, expected = sp.dens * area;
      const have = this.counts[sp0] || 0;
      if (have + 0.5 > expected * 1.4 + 0.5) continue;
      s *= this.levelWeight(sp, pl) * clamp(expected / (have + 1), 0.02, 1);
      if (rnd() > s * 0.9) continue;
      this.spawnGroup(sp0, x, z, h);
    }
    // plankton and other specks
    for (const k of this.speckKeys) {
      const sp = SPECIES[k], R = this.spawnRadius(sp);
      const area = Math.PI * R * R / 1e4, cap = Math.max(1.2, sp.dens * area);
      let have = this.counts[k] || 0;
      for (let t = 0; t < (force ? 6 : 2) && have < cap; t++) {
        const r = force ? Math.sqrt(rnd()) * R : lerp(R * 0.35, R, Math.sqrt(rnd())), a = rnd() * TAU, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
        if (!gw.inBounds(x, z)) continue;
        const h = gw.hab(x, z, this.hab); const s = this.suit(sp, h); if (s <= 0 || rnd() > s) continue;
        const fy = gw.floor(x, z);
        const y = sp.hab.place === 'near' ? fy + lerp(sp.hab.h[0], sp.hab.h[1], rnd()) : -lerp(0.8, Math.max(1.2, Math.min(14, h.depth - 0.8)), rnd());
        const n = Math.round(lerp(sp.cloud[0], sp.cloud[1], rnd())), rad = lerp(sp.cloud[2], sp.cloud[3], rnd());
        const cl = this.specks.addCloud(k, sp.beh === 'copepod' ? 1 : 0, x, Math.min(y, -0.5), z, n, rad, sp.len, sp.col, rnd, (xx, zz) => gw.floor(xx, zz));
        if (cl) { this.counts[k] = (this.counts[k] || 0) + 1; cl.speckKey = k; have++; }
      }
    }
    // clouds that have been eaten away or are too far
    for (const [id, cl] of this.specks.clouds) {
      const R = this.spawnRadius(SPECIES[cl.key]) * 1.3, dx = cl.cx - px, dz = cl.cz - pz;
      if (cl.alive <= 0 || dx * dx + dz * dz > R * R) { this.specks.removeCloud(id); this.counts[cl.key] = Math.max(0, (this.counts[cl.key] || 1) - 1); }
    }
    // compact the list
    if (this.list.some((c) => c.dead)) this.list = this.list.filter((c) => !c.dead);
  }

  // ---- movement helpers ------------------------------------------------------------------------------------------------------
  turnToward(c, dx, dy, dz, dt, rate) {
    const l = Math.hypot(dx, dy, dz); if (l < 1e-6) return;
    dx /= l; dy /= l; dz /= l;
    const dot = clamp(c.fx * dx + c.fy * dy + c.fz * dz, -1, 1), maxA = rate * dt;
    let nx, ny, nz;
    if (dot > 0.99999) { nx = dx; ny = dy; nz = dz; }
    else {
      let tx = dx, ty = dy, tz = dz, d = dot;
      if (dot < -0.9995) { tx = -c.fz; ty = 0; tz = c.fx; d = 0; }
      const ang = Math.acos(d), k = Math.min(1, maxA / Math.max(ang, 1e-5)), s = Math.sin(ang) || 1;
      const w0 = Math.sin((1 - k) * ang) / s, w1 = Math.sin(k * ang) / s;
      nx = c.fx * w0 + tx * w1; ny = c.fy * w0 + ty * w1; nz = c.fz * w0 + tz * w1;
      // lean into the turn
      const cross = c.fx * tz - c.fz * tx;
      c.turnLean += (clamp(cross * 2.2, -1, 1) - c.turnLean) * Math.min(1, dt * 6);
    }
    const nl = Math.hypot(nx, ny, nz) || 1; c.fx = nx / nl; c.fy = ny / nl; c.fz = nz / nl;
  }

  // steer toward a point (or direction) at a speed
  go(c, dt, dx, dy, dz, speed, turnMul = 1) {
    this.turnToward(c, dx, dy, dz, dt, c.turn * turnMul);
    const acc = Math.max(speed, c.cruise) * 3.2;
    c.sp_ += clamp(speed - c.sp_, -acc * dt, acc * dt);
    c.turnLean *= Math.exp(-dt * 2);
  }

  avoidTerrain(c, d) {
    // push the desired heading up (and away from the surface) when the seabed ahead is close
    const gw = this.gw, la = Math.max(c.len * 3, c.sp_ * 0.9, 1.2);
    const fl = gw.floor(c.x + c.fx * la, c.z + c.fz * la) + c.minH + c.len * 0.4 + 0.15;
    const need = fl - c.y;
    if (need > 0) d.y += Math.min(need / la * 2.0, 1.4);
    if (c.y > -(c.len * 0.6 + 0.5)) d.y -= 0.6;
    if (c.len > 0.3) {                                  // big animals will not swim into water too shallow for them
      const dep = -gw.floor(c.x + c.fx * la * 1.5, c.z + c.fz * la * 1.5), need2 = c.len * 0.6 + 0.2;
      if (dep < need2) { d.x -= c.fx * 2.5; d.z -= c.fz * 2.5; d.y += 0.3; }
    }
  }

  // after a death / level-up: nearby hunters lose interest and drift away
  setCalm(pl, radius) {
    const r2 = radius * radius;
    for (const c of this.list) {
      if (c.dead || c.role !== 'pred') continue;
      const dx = c.x - pl.x, dy = c.y - pl.y, dz = c.z - pl.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r2) {
        c.alert = 0; c.goal = null; c.chaseT = 0; c.moodT = Math.max(c.moodT, 12);
        if (c.beh === 'ambush' || c.beh === 'den') { c.state = 'wait'; c.cd = 8; }          // ambushers just stay put and wait a while
        else { c.state = 'rest'; c.stateT = 8; const l = Math.sqrt(d2) || 1; c.kx += dx / l * 5; c.kz += dz / l * 5; }
      }
    }
  }

  // ---- decoys and stun (abilities) -------------------------------------------------------------------------------------------
  stunAround(pl, radius, dur) {
    const r2 = radius * radius;
    for (const c of this.list) {
      if (c.dead || c.decoy) continue;
      const dx = c.x - pl.x, dy = c.y - pl.y, dz = c.z - pl.z;
      if (dx * dx + dy * dy + dz * dz < r2) { c.stun = c.role === 'pred' ? dur * 0.6 : dur; c.flash = 0.5; if (c.role === 'pred' && c.state === 'chase') { c.state = 'rest'; c.stateT = dur * 0.6 + 2; c.alert = 0; } }
    }
  }
  spawnDecoys(pl, n, dur) {
    const sp = SPECIES.silverfry, rnd = this.rnd;
    for (let i = 0; i < n; i++) {
      const c = new Creature('silverfry', sp, Math.max(0.09, pl.len * 0.45), rnd);
      const a = rnd() * TAU, r = 0.4 + pl.len * 1.5 * rnd();
      c.x = pl.x + Math.cos(a) * r; c.y = pl.y + (rnd() - 0.5) * 0.6; c.z = pl.z + Math.sin(a) * r; c.fx = Math.cos(a); c.fz = Math.sin(a); c.fy = 0;
      c.role = 'neutral'; c.beh = 'decoy'; c.decoy = true; c.life = dur; c.cruise = Math.max(1.2, pl.stats.speed * 0.55); c.turn = 6; c.sp_ = c.cruise; c.home = { x: c.x, y: c.y, z: c.z };
      c.key = 'silverfry'; c.noGroup = true; this.list.push(c); this.decoys.push(c);
    }
  }
  nearestDecoy(c, r) {
    let best = null, bd = r;
    for (const d of this.decoys) { if (d.dead) continue; const dd = Math.hypot(d.x - c.x, d.y - c.y, d.z - c.z); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
  updateDecoy(c, dt) {
    c.life -= dt; if (c.life <= 0) { this.removeCreature(c, 'despawn'); const i = this.decoys.indexOf(c); if (i >= 0) this.decoys.splice(i, 1); return; }
    const t = this.time * 1.6 + c.s0 * 20; const d3 = this._d3; d3.x = c.fx + Math.sin(t) * 0.8; d3.y = Math.sin(t * 0.7) * 0.4; d3.z = c.fz + Math.cos(t * 1.1) * 0.8;
    this.avoidTerrain(c, d3); this.go(c, dt, d3.x, d3.y, d3.z, c.cruise, 1.5); this.integrate(c, dt);
  }

  integrate(c, dt) {
    const gw = this.gw, sp = c.sp_;
    c.x += (c.fx * sp + c.kx) * dt; c.y += (c.fy * sp + c.ky) * dt; c.z += (c.fz * sp + c.kz) * dt;
    const kd = Math.exp(-dt * 3.5); c.kx *= kd; c.ky *= kd; c.kz *= kd;
    if (!c.noClamp) {
      const fl = gw.floor(c.x, c.z) + c.minH;
      if (c.y < fl) { c.y = fl; if (c.fy < 0) { c.fy *= 0.2; const l = Math.hypot(c.fx, c.fy, c.fz) || 1; c.fx /= l; c.fy /= l; c.fz /= l; } }
      const top = -(c.len * 0.4 + 0.1);
      if (c.y > top) { c.y = top; if (c.fy > 0) { c.fy *= 0.2; const l = Math.hypot(c.fx, c.fy, c.fz) || 1; c.fx /= l; c.fy /= l; c.fz /= l; } }
    }
    // tail beat follows speed
    const sf = clamp(sp / Math.max(c.cruise * 1.8, 0.1), 0, 1.4);
    c.ph += dt * TAU * c.freq * (0.35 + 1.1 * sf);
    c.amp += ((0.35 + 0.9 * clamp(sf, 0, 1)) - c.amp) * Math.min(1, dt * 5);
    c.roll = c.turnLean * 0.5;
    c.turnAnim = c.turnLean;
  }

  // ---- queries ---------------------------------------------------------------------------------------------------------------
  // can the player eat this?
  edible(pl, c) {
    if (c.dead || c.eatenT >= 0) return false;
    if (c.role !== 'prey' && c.role !== 'hazard' && c.role !== 'pred') return false;
    if (c.fam === 'jelly' || c.role === 'neutral' || c.hidden) return false;
    if (c.fam === 'hero' && c.role !== 'pred') return false;
    if (c.len > pl.len * pl.stats.eat) return false;
    return true;
  }

  // ---- per-frame update ------------------------------------------------------------------------------------------------------
  update(dt, pl) {
    this.time += dt; this.player = pl;
    // rebuild grid
    this.grid.clear();
    for (const c of this.list) if (!c.dead) this.grid.insert(c);
    this.threats.length = 0;
    // schools first (virtual centres), then creatures
    for (const s of this.schools.values()) this.updateSchool(s, dt, pl);
    for (const c of this.list) {
      if (c.dead) continue;
      if (c.eatenT >= 0) { c.eatenT += dt; if (c.eatenT > 0.25) this.removeCreature(c, 'eaten'); continue; }
      c.flash = Math.max(0, c.flash - dt * 2.5);
      if (c.stun > 0) { c.stun -= dt; c.sp_ *= Math.exp(-dt * 4); this.integrate(c, dt * 0.5); continue; }
      c.thinkT -= dt;
      switch (c.beh) {
        case 'shoal': this.updateShoalMember(c, dt, pl); break;
        case 'solo': this.updateSolo(c, dt, pl); break;
        case 'pack': this.updatePackMember(c, dt, pl); break;
        case 'patrol': case 'solo-hunter': case 'stalker': this.updateHunter(c, dt, pl); break;
        case 'ambush': case 'den': this.updateAmbusher(c, dt, pl); break;
        case 'drift': this.updateDrift(c, dt, pl); break;
        case 'decoy': this.updateDecoy(c, dt); break;
        case 'crawl': case 'sessile': this.updateCrawl(c, dt, pl); break;
        case 'station': this.updateStation(c, dt, pl); break;
        case 'jelly': this.updateJelly(c, dt, pl); break;
        default: this.updateSolo(c, dt, pl);
      }
    }
    this.direct(dt, pl);
    this.goldenDirector(dt, pl);
    this.classify(dt, pl);
  }

  // every few minutes one rare golden fish of the right size appears nearby: faster, warier and worth a lot of growth
  goldenDirector(dt, pl) {
    if (this.golden && (this.golden.dead || this.golden.eatenT >= 0)) { this.golden = null; this.goldT = 90 + this.rnd() * 60; }
    if (this.golden) { const g = this.golden; if (Math.hypot(g.x - pl.x, g.z - pl.z) > 190) { this.removeCreature(g, 'despawn'); this.golden = null; this.goldT = 45; } return; }
    if (pl.ghost || pl.dead || pl.level < 2) return;
    this.goldT -= dt; if (this.goldT > 0) return;
    this.goldT = 6;
    const rnd = this.rnd, gw = this.gw;
    const keys = this.keys.filter((k) => { const s = SPECIES[k]; return s.role === 'prey' && s.fam === 'fish' && Math.abs(s.tier - pl.level) <= 1 && s.len * 1.12 <= pl.len * pl.stats.eat; });
    if (!keys.length) return;
    for (let t = 0; t < 12; t++) {
      const key = keys[(rnd() * keys.length) | 0], sp = SPECIES[key], a = rnd() * TAU, r = lerp(20, 38, rnd()), x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r;
      if (!gw.inBounds(x, z)) continue;
      const h = gw.hab(x, z, this.hab); if (this.suit(sp, h) < 0.3 || !this.rec(key)) continue;
      const len = sp.len * 1.1, c = new Creature(key, sp, len, rnd);
      c.x = x; c.z = z; c.y = this.placeY(sp, h, gw.floor(x, z), len, rnd); c.fx = Math.cos(a + 3.14); c.fz = Math.sin(a + 3.14); c.fy = 0;
      c.cruise *= 1.25; c.flee *= 1.55; c.beh = 'solo'; c.golden = true; c.tr = 2.2; c.tg = 1.6; c.tb = 0.35; c.home = { x, y: c.y, z, hx: c.fx, hz: c.fz }; c.sp_ = c.cruise;
      this.list.push(c); this.golden = c; this.events.push({ t: 'golden', c }); return;
    }
  }

  // ---- schools ---------------------------------------------------------------------------------------------------------------
  pickGoal(s, pl) {
    const sp = s.sp, rnd = this.rnd, gw = this.gw;
    for (let t = 0; t < 6; t++) {
      const a = rnd() * TAU, r = lerp(8, sp.beh === 'pack' ? 90 : 36, rnd());
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      if (!gw.inBounds(x, z)) continue;
      const h = gw.hab(x, z, this.hab); if (this.suit(sp, h) < 0.25) continue;
      const fy = gw.floor(x, z);
      s.gx = x; s.gz = z; s.gy = this.placeY(sp, h, fy, sp.len, rnd); return;
    }
    // go back toward home
    s.gx = s.home.x + (rnd() - 0.5) * 20; s.gz = s.home.z + (rnd() - 0.5) * 20; s.gy = s.y;
  }

  updateSchool(s, dt, pl) {
    const sp = s.sp, m = s.members.length; if (m === 0) return;
    // centre of mass of members (smoothed toward the virtual centre so the school stays coherent)
    s.goalT -= dt;
    const dg = Math.hypot(s.gx - s.x, s.gz - s.z);
    if (s.goalT <= 0 || dg < 3) { this.pickGoal(s, pl); s.goalT = 14 + this.rnd() * 22; }
    // threats: predators (and the player if it can eat them)
    s.checkT -= dt;
    if (s.checkT <= 0) {
      s.checkT = 0.15; let best = null, bd = 1e9;
      const alertR = s.rad + 4 + sp.len * 40;
      this.grid.query(s.x, s.y, s.z, alertR, (o) => {
        if (o === null || o.dead || o.role !== 'pred' || o.beh === 'shoal') return;
        if (o.len < sp.len * 1.3 || o.school === s) return;
        const dx = o.x - s.x, dy = o.y - s.y, dz = o.z - s.z, d = Math.hypot(dx, dy, dz) - s.rad;
        const rr = 3 + o.len * 5 + (o.state === 'chase' || o.state === 'strike' || o.state === 'hunt' ? 6 : 0);
        if (d < rr && d < bd) { bd = d; best = o; }
      });
      if (pl.len * pl.stats.eat >= sp.len && !pl.dead) {
        const dx = pl.x - s.x, dy = pl.y - s.y, dz = pl.z - s.z, d = Math.hypot(dx, dy, dz) - s.rad;
        const rr = (1.0 + 7 * pl.len) * (0.45 + 0.55 * pl.speedFrac) * (pl.stats.apex ? 1.6 : 1);
        if (d < rr && d < bd) { bd = d; best = { x: pl.x, y: pl.y, z: pl.z }; }
      }
      if (best) { s.panic = 1.4 + this.rnd() * 0.6; s.tx = best.x; s.ty = best.y; s.tz = best.z; }
    }
    s.panic = Math.max(0, s.panic - dt);
    let dx = s.gx - s.x, dy = s.gy - s.y, dz = s.gz - s.z, l = Math.hypot(dx, dy, dz) || 1;
    let sp_ = (s.pack ? sp.len * 0 + (speedsFor(sp).cruise) : speedsFor(sp).cruise) * 1.0;
    if (s.panic > 0) {
      dx = s.x - s.tx; dy = (s.y - s.ty) * 0.4; dz = s.z - s.tz; l = Math.hypot(dx, dy, dz) || 1; sp_ = speedsFor(sp).flee * 0.85;
    }
    // terrain: lift the virtual centre when the seabed rises
    const gw = this.gw, fl = gw.floor(s.x + dx / l * 4, s.z + dz / l * 4) + s.rad * 0.5 + 0.5;
    if (s.y < fl) dy += (fl - s.y) * 0.8;
    if (sp.hab.place === 'water' || sp.hab.place === 'near') {
      const maxY = -(0.7 + s.rad * 0.4); if (s.y > maxY) dy -= (s.y - maxY) * 1.0;
    }
    const nl = Math.hypot(dx, dy, dz) || 1;
    const k = Math.min(1, dt * 1.5);
    s.vx += (dx / nl * sp_ - s.vx) * k; s.vy += (dy / nl * sp_ - s.vy) * k; s.vz += (dz / nl * sp_ - s.vz) * k;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    const bp = gw.boundsPush(s.x, s.z, this.tmp); s.x += bp.x * 4 * dt; s.z += bp.z * 4 * dt;
    const sl = Math.hypot(s.vx, s.vy, s.vz);
    if (sl > 0.02) { s.dir[0] = s.vx / sl; s.dir[1] = s.vy / sl; s.dir[2] = s.vz / sl; }
  }

  updateShoalMember(c, dt, pl) {
    const s = c.school, sp = c.sp, gw = this.gw;
    if (!s) return this.updateSolo(c, dt, pl);
    let dx, dy, dz, speed;
    if (s.panic > 0) {
      // burst away from the threat, each fish a little differently
      dx = c.x - s.tx + (c.ox) * 1.5; dy = (c.y - s.ty) * 0.3 + c.oy; dz = c.z - s.tz + c.oz * 1.5;
      speed = c.flee * (0.85 + 0.3 * c.s0);
    } else {
      const t = this.time * 0.35 + c.s1 * 20, br = 1 + 0.18 * Math.sin(t);
      const tx = s.x + c.ox * s.rad * br, ty = s.y + c.oy * s.rad * 0.55 * br, tz = s.z + c.oz * s.rad * br;
      dx = tx - c.x; dy = ty - c.y; dz = tz - c.z;
      const d = Math.hypot(dx, dy, dz);
      speed = c.cruise * clamp(0.75 + d / Math.max(s.rad, 1) * 1.6, 0.5, 2.4) + Math.hypot(s.vx, s.vy, s.vz) * 0.5;
      // the school's heading keeps individuals polarised
      dx += s.dir[0] * Math.min(d, 2) * 0.6; dy += s.dir[1] * Math.min(d, 2) * 0.6; dz += s.dir[2] * Math.min(d, 2) * 0.6;
    }
    const d3 = this._d3; d3.x = dx; d3.y = dy; d3.z = dz; this.avoidTerrain(c, d3);
    this.go(c, dt, d3.x, d3.y, d3.z, speed, 1.4);
    this.integrate(c, dt);
  }

  // ---- bottom dwellers and jellies -------------------------------------------------------------------------------------------
  updateCrawl(c, dt, pl) {
    const gw = this.gw, sp = c.sp, rnd = this.rnd;
    const worm = c.beh === 'sessile' && sp.model === 'worm';
    if (c.thinkT <= 0) {
      c.thinkT = 0.1 + rnd() * 0.08;
      const dxp = pl.x - c.x, dyp = pl.y - c.y, dzp = pl.z - c.z, dp = Math.hypot(dxp, dyp, dzp);
      // fears: the player (if it could eat this), or a big fish close by. Moving slowly makes you much harder to spot.
      let fear = null, fd = 0;
      if (pl.len * pl.stats.eat >= c.len && !pl.dead) {
        const rr = (0.25 + c.len * 4 + pl.len * 0.9) * (0.35 + 0.65 * clamp(pl.speedFrac, 0, 1.4));
        if (dp < rr) { fear = pl; fd = dp; }
      }
      if (!fear) this.grid.query(c.x, c.y, c.z, 1.6 + c.len * 8, (o) => { if (!o.dead && o.role === 'pred' && o.len > c.len * 2 && !fear) fear = o; });
      if (worm) { if (fear) { c.hidden = true; c.hideT = 2.8 + rnd() * 1.5; } }
      else if (fear) {
        if (c.beh === 'sessile') { /* urchins just sit there */ }
        else if (sp.model === 'hermit') { c.state = 'hide'; c.stateT = 2.5 + rnd() * 2; }
        else if (c.state !== 'flee') { c.state = 'flee'; c.stateT = 0.7 + rnd() * 0.8; c.tgt = fear; c.flick = sp.model === 'shrimp' ? 0.25 : 0; }
      }
      if (!worm && c.beh === 'crawl' && c.state === 'idle' && rnd() < 0.12) { c.state = 'walk'; c.stateT = 1.5 + rnd() * 3; const a = rnd() * TAU; c.walk = [Math.cos(a), Math.sin(a)]; }
    }
    c.stateT -= dt;
    if (worm) {
      if (c.hidden) { c.hideT -= dt; if (c.hideT <= 0) c.hidden = false; }
      c.amp += ((c.hidden ? 0.1 : 1) - c.amp) * Math.min(1, dt * (c.hidden ? 14 : 1.4));
      c.hidden = c.hidden || false;
      c.ph += dt * 1.2; c.sp_ = 0;
      return;
    }
    let dx = c.fx, dz = c.fz, speed = 0;
    if (c.beh === 'sessile') { c.sp_ = 0; c.ph += dt * 0.6; return; }
    if (c.state === 'flee' && c.tgt) {
      dx = c.x - c.tgt.x; dz = c.z - c.tgt.z; speed = c.flee;
      if (c.flick > 0) { speed *= 3.2; c.flick -= dt; }              // shrimp: tail-flick burst
      if (c.stateT <= 0) { c.state = 'idle'; }
    } else if (c.state === 'walk' && c.walk) { dx = c.walk[0]; dz = c.walk[1]; speed = c.cruise; if (c.stateT <= 0) c.state = 'idle'; }
    else if (c.state === 'hide') { speed = 0; c.hidden = false; if (c.stateT <= 0) c.state = 'idle'; }
    this.turnToward(c, dx, 0, dz, dt, 5);
    c.fy = 0; { const l = Math.hypot(c.fx, c.fz) || 1; c.fx /= l; c.fz /= l; }
    c.sp_ += clamp(speed - c.sp_, -dt * 3, dt * 3 + speed * 0.5);
    // walking along the seabed (never into deep water or up the surface)
    c.x += c.fx * c.sp_ * dt; c.z += c.fz * c.sp_ * dt;
    c.y = gw.floor(c.x, c.z) + c.minH;
    c.ph += dt * (0.5 + 8 * clamp(c.sp_ / Math.max(c.cruise * 3, 0.05), 0, 1.5));
    c.amp = 1; c.turnLean *= Math.exp(-dt * 3);
  }

  // cleaning station: hover close and nearly still for a moment and the shrimp heals you (then it needs a minute to rest)
  updateStation(c, dt, pl) {
    const gw = this.gw;
    c.y = gw.floor(c.x, c.z) + c.minH; c.sp_ = 0; c.ph += dt * 2.2; c.amp = 1; c.cool = Math.max(0, (c.cool || 0) - dt);
    const d = Math.hypot(pl.x - c.x, pl.y - c.y, pl.z - c.z);
    c.ready = c.cool <= 0;
    c.pingT = (c.pingT ?? this.rnd() * 2) - dt;
    if (c.ready && c.pingT <= 0 && d < 16) { c.pingT = 2.8; this.events.push({ t: 'ping', c }); }
    if (c.ready && !pl.dead) {
      if (d < 0.5 + pl.len * 1.1 && pl.speedFrac < 0.5) { c.heal = (c.heal || 0) + dt; if (c.heal > 1.1 && !c.healing) { c.healing = true; c.healT = 3.4; this.events.push({ t: 'cleanStart', c }); } }
      else c.heal = Math.max(0, (c.heal || 0) - dt * 2);
    }
    if (c.healing) {
      c.healT -= dt;
      if (d > 0.9 + pl.len * 1.6 || pl.speedFrac > 1.0) { c.healing = false; c.heal = 0; }
      else { pl.hp = Math.min(pl.stats.hpMax, pl.hp + pl.stats.hpMax * 0.12 * dt); pl.poison = 0; pl.sinceHurt = Math.max(pl.sinceHurt, 2); if (this.rnd() < dt * 6) this.events.push({ t: 'cleanTick', c }); }
      if (c.healT <= 0) { c.healing = false; c.cool = 55; c.heal = 0; this.events.push({ t: 'cleanDone', c }); }
    }
  }

  updateJelly(c, dt, pl) {
    const gw = this.gw, sp = c.sp;
    if (!c.goal || c.stateT <= 0 || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 2) {
      for (let t = 0; t < 4; t++) { const a = this.rnd() * TAU, r = lerp(6, 25, this.rnd()), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; if (!gw.inBounds(x, z)) continue; const h = gw.hab(x, z, this.hab); if (this.suit(sp, h) < 0.3) continue; c.goal = { x, y: this.placeY(sp, h, gw.floor(x, z), c.len, this.rnd), z }; c.stateT = 30; break; }
      if (!c.goal) c.goal = { x: c.home.x, y: c.y, z: c.home.z };
    }
    c.stateT -= dt;
    const d3 = this._d3; d3.x = c.goal.x - c.x; d3.y = (c.goal.y - c.y) * 0.5; d3.z = c.goal.z - c.z; this.avoidTerrain(c, d3);
    const l = Math.hypot(d3.x, d3.z) || 1, pulse = 0.5 + 0.5 * Math.sin(c.ph), sp0 = 0.07 + 0.12 * pulse;
    c.ph += dt * TAU * 0.42;
    c.x += d3.x / l * sp0 * dt; c.z += d3.z / l * sp0 * dt; c.y += (d3.y * 0.05 + 0.05 * Math.cos(c.ph)) * dt;
    const top = -(c.len * 0.6 + 0.3), fl = gw.floor(c.x, c.z) + c.len * 1.8 + 0.3; if (c.y > top) c.y = top; if (c.y < fl) c.y = fl;
    c.fx = d3.x / l; c.fz = d3.z / l; c.fy = 0; c.amp = 1; c.roll = 0;
  }

  // ---- individual prey -------------------------------------------------------------------------------------------------------
  threatNear(c, pl, alertR) {
    // returns the nearest thing this creature fears (a creature or the player) or null
    let best = null, bd = alertR;
    this.grid.query(c.x, c.y, c.z, alertR, (o) => {
      if (o.dead || o.role !== 'pred' || o.len < c.len * 1.3 || o === c || o.school === c.school && c.school) return;
      if ((o.beh === 'ambush' || o.beh === 'den') && o.state !== 'strike') return;
      const d = Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z) - o.len * 0.5;
      const w = d / (1 + o.len * 0.3);
      if (w < bd) { bd = w; best = o; }
    });
    if (pl.len * pl.stats.eat >= c.len && !pl.dead) {
      const d = Math.hypot(pl.x - c.x, pl.y - c.y, pl.z - c.z) - pl.len * 0.5;
      const rr = (0.6 + 6 * pl.len) * (0.35 + 0.65 * pl.speedFrac) * (pl.stats.apex ? 1.7 : 1) * (c.beh === 'sessile' ? 0.5 : 1);
      if (d < rr && d < bd) { bd = d; best = pl; }
    }
    return best;
  }

  updateSolo(c, dt, pl) {
    const gw = this.gw, sp = c.sp;
    if (c.thinkT <= 0) {
      c.thinkT = 0.12 + this.rnd() * 0.1;
      if (c.role !== 'pred' || c.len < pl.len * 1.25) {
        const th = this.threatNear(c, pl, (3 + c.len * 14) * (c.golden ? 2.2 : 1));
        if (th) { c.state = 'flee'; c.stateT = 1.1 + this.rnd() * 1.0; c.tgt = th; }
      }
      if (c.state === 'idle' || c.state === 'wander') {
        if (!c.goal || c.stateT <= 0 || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 0.6) {
          const h = c.home, a = this.rnd() * TAU, r = (sp.beh === 'solo' ? 4 : 2.5) * Math.sqrt(this.rnd());
          const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r, fy = gw.floor(x, z);
          c.goal = { x, y: clamp(h.y + (this.rnd() - 0.5) * 1.0, fy + c.minH + 0.1, -(c.len + 0.3)), z };
          c.state = 'wander'; c.stateT = 3 + this.rnd() * 6; c.hover = this.rnd() < 0.3;
        }
      }
    }
    c.stateT -= dt;
    let dx, dy, dz, speed;
    if (c.state === 'flee' && c.tgt) {
      const t = c.tgt; dx = c.x - t.x; dy = (c.y - t.y) * 0.3; dz = c.z - t.z; speed = c.flee;
      if (c.stateT <= 0) { c.state = 'idle'; c.goal = null; }
    } else if (c.goal) {
      dx = c.goal.x - c.x; dy = c.goal.y - c.y; dz = c.goal.z - c.z; speed = c.hover ? c.cruise * 0.12 : c.cruise * 0.7;
    } else { dx = c.fx; dy = 0; dz = c.fz; speed = c.cruise * 0.3; }
    const d3 = this._d3; d3.x = dx; d3.y = dy; d3.z = dz; this.avoidTerrain(c, d3);
    this.go(c, dt, d3.x, d3.y, d3.z, speed, 1.2);
    this.integrate(c, dt);
  }

  updateDrift(c, dt, pl) {
    const gw = this.gw, sp = c.sp;
    if (!c.goal || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 4 || c.stateT <= 0) {
      for (let t = 0; t < 5; t++) {
        const a = this.rnd() * TAU, r = lerp(15, 60, this.rnd()), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (!gw.inBounds(x, z)) continue; const h = gw.hab(x, z, this.hab); if (this.suit(sp, h) < 0.3) continue;
        c.goal = { x, y: this.placeY(sp, h, gw.floor(x, z), c.len, this.rnd), z }; c.stateT = 40; break;
      }
      if (!c.goal) c.goal = { x: c.home.x, y: c.y, z: c.home.z };
    }
    c.stateT -= dt;
    const d3 = this._d3; d3.x = c.goal.x - c.x; d3.y = c.goal.y - c.y; d3.z = c.goal.z - c.z; this.avoidTerrain(c, d3);
    this.go(c, dt, d3.x, d3.y, d3.z, c.cruise * 0.9, 0.6);
    this.integrate(c, dt);
  }

  // ---- predators -------------------------------------------------------------------------------------------------------------
  // can this predator go for the player right now, and from how far will it notice them?
  noticeRangeFor(c, pl) {
    const sp = c.sp, base = noticeRange(sp);
    const sizeF = 0.45 + 0.55 * clamp(pl.len / Math.max(c.len * 0.3, 0.05), 0, 1);
    const move = 0.55 + 0.45 * clamp(pl.speedFrac, 0, 1.4);
    let r = base * sizeF * move * this.diff.notice * (1 - pl.stats.stealth) * (1 - 0.72 * pl.cover);
    if (pl.inkT > 0) r *= 0.12;
    if (pl.cloak > 0) r *= 0.3;
    return r;
  }
  canAttackPlayer(c, pl) { return !pl.dead && !pl.ghost && c.len >= pl.len * 1.25 && pl.depthHere >= c.len * 0.6 + 0.2; }

  biteRange(c, pl) { return c.len * 0.5 + pl.len * 0.35 + 0.12; }

  hitPlayer(c, pl, sp) {
    const dmg = biteDamage(c.len, pl.len, sp.biteK ?? 1) * this.diff.dmg;
    this.events.push({ t: 'bite', c, dmg, venom: sp.venom || 0 });
    c.cd = 2.2 + this.rnd() * 0.8;
    c.state = 'recover'; c.stateT = 2.0 + this.rnd() * 1.2; c.afterBite = true; c.bitThisChase = true;
    c.flash = 0.3;
  }

  updateHunter(c, dt, pl) {
    const sp = c.sp, gw = this.gw;
    c.cd = Math.max(0, c.cd - dt); c.hunger -= dt; c.moodT -= dt;
    const dxp = pl.x - c.x, dyp = pl.y - c.y, dzp = pl.z - c.z, dp = Math.hypot(dxp, dyp, dzp);
    const canAtk = this.canAttackPlayer(c, pl);
    let dx = c.fx, dy = 0, dz = c.fz, speed = c.cruise;
    // ---- thinking
    if (c.thinkT <= 0) {
      c.thinkT = 0.1 + this.rnd() * 0.08;
      const nr = this.noticeRangeFor(c, pl);
      if (c.state === 'idle' || c.state === 'patrol' || c.state === 'rest' || c.state === 'hunt') {
        if (canAtk && dp < nr && c.moodT <= 0) {
          const toward = (dxp * c.fx + dyp * c.fy + dzp * c.fz) / (dp || 1);
          if (toward > -0.2 || dp < c.len * 3) { c.state = 'alert'; c.stateT = 0.5 + this.rnd() * 0.4; c.alert = 1; this.events.push({ t: 'alert', c }); }
        }
        if (c.state !== 'alert' && c.hunger <= 0 && c.state !== 'rest') this.pickHuntTarget(c);
      } else if (c.state === 'chase') {
        const lose = nr * 1.7 + 4;
        if (!canAtk || dp > lose || pl.inkT > 0) { c.loseT = (c.loseT || 0) + (pl.inkT > 0 ? 0.5 : 0.12); if (c.loseT > 2.2) { if (!c.bitThisChase && c.chaseT > 3) this.events.push({ t: 'escaped', c }); c.bitThisChase = false; c.moodT = 18 + this.rnd() * 25; c.state = 'rest'; c.stateT = 3; c.alert = 0; c.loseT = 0; } } else c.loseT = 0;
      }
    }
    c.stateT -= dt;
    // ---- acting
    switch (c.state) {
      case 'idle': case 'patrol': {
        c.state = 'patrol';
        if (!c.goal || c.stateT <= 0 || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 3 + c.len) this.pickWanderGoal(c);
        dx = c.goal.x - c.x; dy = c.goal.y - c.y; dz = c.goal.z - c.z; speed = c.cruise;
        break;
      }
      case 'rest': {
        if (c.stateT <= 0) { c.state = 'patrol'; c.chaseT = 0; }
        if (!c.goal) this.pickWanderGoal(c);
        dx = c.goal.x - c.x; dy = c.goal.y - c.y; dz = c.goal.z - c.z; speed = c.cruise * 0.6;
        break;
      }
      case 'alert': {
        dx = dxp; dy = dyp; dz = dzp; speed = c.cruise * 0.35;
        if (c.stateT <= 0) {
          if (canAtk && this.rnd() < this.diff.commit) { c.state = 'chase'; c.chaseT = 0; c.bitThisChase = false; }
          else { c.state = 'rest'; c.stateT = 4 + this.rnd() * 4; c.alert = 0; c.goal = null; c.moodT = 8 + this.rnd() * 10; }
        }
        break;
      }
      case 'chase': {
        c.chaseT += dt;
        const dcy = this.decoys.length ? this.nearestDecoy(c, 30) : null;
        if (dcy) {
          dx = dcy.x - c.x; dy = dcy.y - c.y; dz = dcy.z - c.z; speed = c.chase * this.diff.chase;
          if (Math.hypot(dx, dy, dz) < c.len * 0.6 + 0.2) { dcy.life = 0; c.state = 'recover'; c.stateT = 1.4; c.flash = 0.2; this.events.push({ t: 'decoyEaten', c }); }
          break;
        }
        if (pl.inkT > 0) c.loseT = (c.loseT || 0) + dt * 3;                       // blinded by the ink cloud: it loses you in under a second
        const lead = Math.min(0.35, dp / Math.max(c.chase, 0.1));
        dx = dxp + pl.vx * lead; dy = dyp + pl.vy * lead; dz = dzp + pl.vz * lead;
        speed = c.chase * this.diff.chase * (1 - 0.32 * clamp((c.chaseT - 3.5) / 5, 0, 1));          // hunters tire during a long chase
        this.threats.push(c);
        if (dp < this.biteRange(c, pl) + 0.15 && c.cd <= 0 && !(pl.inkT > 0)) this.tryBitePlayer(c, pl);
        if (c.chaseT > 6 + 2 * Math.sqrt(c.len)) { if (!c.bitThisChase && c.chaseT > 3) this.events.push({ t: 'escaped', c }); c.bitThisChase = false; c.moodT = 22 + this.rnd() * 28; c.state = 'rest'; c.stateT = 5 + this.rnd() * 3; c.alert = 0; c.goal = null; }
        break;
      }
      case 'recover': {
        // swim on past, turn, think again
        speed = c.cruise * 0.9; dx = c.fx; dy = 0.1; dz = c.fz;
        if (c.stateT <= 0) {
          const again = c.afterBite ? this.rnd() < this.diff.commit * 0.8 : true; c.afterBite = false;
          if (again && canAtk && dp < this.noticeRangeFor(c, pl) * 1.4 && c.chaseT < 6 + 2 * Math.sqrt(c.len)) c.state = 'chase';
          else { c.state = 'rest'; c.stateT = 4 + this.rnd() * 4; c.alert = 0; c.goal = null; c.moodT = 25 + this.rnd() * 30; }
        } else this.threats.push(c);
        break;
      }
      case 'hunt': {
        const t = c.target;
        if (!t || t.dead || t.eatenT >= 0) { c.state = 'patrol'; c.hunger = 25 + this.rnd() * 40; c.target = null; break; }
        dx = t.x - c.x; dy = t.y - c.y; dz = t.z - c.z; speed = c.chase * 0.9;
        const d = Math.hypot(dx, dy, dz);
        if (d < c.len * 0.55 + t.len * 0.4) { t.eatenT = 0; this.stats.eatenByPred++; this.events.push({ t: 'npcEat', pred: c, prey: t }); c.hunger = 25 + this.rnd() * 40; c.state = 'rest'; c.stateT = 3; c.target = null; }
        else if (d > 40 || (c.chaseT += dt) > 8) { c.state = 'patrol'; c.hunger = 15; c.target = null; c.chaseT = 0; }
        if (canAtk && dp < this.noticeRangeFor(c, pl) * 0.6) { c.state = 'alert'; c.stateT = 0.4; c.alert = 1; }
        break;
      }
    }
    if (c.state !== 'chase' && c.state !== 'alert' && c.state !== 'recover') c.alert = Math.max(0, c.alert - dt * 2);
    const d3 = this._d3; d3.x = dx; d3.y = dy; d3.z = dz; this.avoidTerrain(c, d3);
    this.go(c, dt, d3.x, d3.y, d3.z, speed, c.state === 'chase' ? 1.3 : 0.9);
    this.integrate(c, dt);
  }

  tryBitePlayer(c, pl) {
    if (pl.invuln > 0 || pl.rushing) { c.cd = 0.35; return false; }
    if (this.rnd() < pl.stats.miss) { c.cd = 1.3; c.state = 'recover'; c.stateT = 1.0; this.events.push({ t: 'miss', c }); return false; }
    this.hitPlayer(c, pl, c.sp); return true;
  }

  pickWanderGoal(c) {
    const gw = this.gw, sp = c.sp, rnd = this.rnd;
    for (let t = 0; t < 6; t++) {
      const a = rnd() * TAU, r = lerp(10, 50, rnd()), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!gw.inBounds(x, z)) continue; const h = gw.hab(x, z, this.hab); if (this.suit(sp, h) < 0.25) continue;
      c.goal = { x, y: this.placeY(sp, h, gw.floor(x, z), c.len, rnd), z }; c.stateT = 20 + rnd() * 20; return;
    }
    c.goal = { x: c.home.x, y: c.home.y, z: c.home.z }; c.stateT = 15;
  }

  pickHuntTarget(c) {
    let best = null, bd = 30;
    this.grid.query(c.x, c.y, c.z, 30, (o) => {
      if (o.dead || o.role !== 'prey' || o.eatenT >= 0 || o.len > c.len * 0.4 || (o.fam !== 'fish')) return;
      const d = Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z); if (d < bd) { bd = d; best = o; }
    });
    if (best) { c.state = 'hunt'; c.target = best; c.chaseT = 0; } else c.hunger = 10 + this.rnd() * 15;
  }

  // pack members: follow the pack centre while cruising; the pack goes after the player together
  updatePackMember(c, dt, pl) {
    const s = c.school, sp = c.sp;
    if (!s) return this.updateHunter(c, dt, pl);
    if (c.state === 'chase' || c.state === 'alert' || c.state === 'recover' || c.state === 'rest') {
      // behave like a lone hunter until it calms down
      const keepSchool = c.school; this.updateHunter(c, dt, pl); c.school = keepSchool;
      if (c.state === 'patrol') c.state = 'idle';
      return;
    }
    c.cd = Math.max(0, c.cd - dt);
    const dxp = pl.x - c.x, dyp = pl.y - c.y, dzp = pl.z - c.z, dp = Math.hypot(dxp, dyp, dzp);
    if (c.thinkT <= 0) {
      c.thinkT = 0.12 + this.rnd() * 0.1;
      s.mood = (s.mood ?? this.rnd() * 14) - 0.12;
      if (this.canAttackPlayer(c, pl) && (s.mood <= 0 || s.hot > 0)) {
        const nr = this.noticeRangeFor(c, pl) * (s.hot > 0 ? 1.5 : 1);
        if (dp < nr) { c.state = 'alert'; c.stateT = 0.4 + this.rnd() * 0.6; c.alert = 1; s.hot = 8; s.mood = 25 + this.rnd() * 30; this.events.push({ t: 'alert', c }); }
      }
    }
    s.hot = Math.max(0, s.hot - dt / Math.max(1, s.members.length));
    const t = this.time * 0.3 + c.s1 * 20, br = 1 + 0.15 * Math.sin(t);
    let dx = s.x + c.ox * s.rad * br - c.x, dy = s.y + c.oy * s.rad * 0.5 - c.y, dz = s.z + c.oz * s.rad * br - c.z;
    const d = Math.hypot(dx, dy, dz), speed = c.cruise * clamp(0.8 + d / Math.max(s.rad, 1), 0.6, 2.2);
    dx += s.dir[0] * 2; dy += s.dir[1] * 2; dz += s.dir[2] * 2;
    const d3 = this._d3; d3.x = dx; d3.y = dy; d3.z = dz; this.avoidTerrain(c, d3);
    this.go(c, dt, d3.x, d3.y, d3.z, speed, 1.0);
    this.integrate(c, dt);
  }

  // ---- ambushers (lizardfish, scorpionfish, grouper, moray) ------------------------------------------------------------------
  updateAmbusher(c, dt, pl) {
    const sp = c.sp, gw = this.gw, den = c.beh === 'den';
    c.cd = Math.max(0, c.cd - dt); c.stateT -= dt; c.hunger -= dt;
    const dxp = pl.x - c.x, dyp = pl.y - c.y, dzp = pl.z - c.z, dp = Math.hypot(dxp, dyp, dzp);
    const strike = den ? c.len * 1.0 + 0.8 : c.len * 2.6 + 0.6;
    let dx = c.fx, dy = 0, dz = c.fz, speed = 0;
    if (c.state === 'idle') { c.state = 'wait'; }
    if (c.state === 'wait') {
      const h = c.home;
      // relax toward the home heading, tiny breathing sway
      dx = h.hx; dz = h.hz; dy = 0; speed = 0.0;
      if (c.thinkT <= 0) {
        c.thinkT = 0.08 + this.rnd() * 0.06;
        if (this.canAttackPlayer(c, pl) && c.cd <= 0) {
          const eff = this.noticeRangeFor(c, pl) * (den ? 0.6 : 1);
          const toward = (dxp * c.fx + dyp * c.fy + dzp * c.fz) / (dp || 1);
          if (dp < Math.min(strike * 1.05, eff + c.len) && toward > (den ? -0.3 : -0.4)) { c.state = 'tell'; c.stateT = den ? 0.38 : 0.55; c.alert = 1; c.strikeFrom = { x: c.x, y: c.y, z: c.z }; this.events.push({ t: 'alert', c }); }
        }
        if (c.state === 'wait' && c.cd <= 0 && c.hunger <= 0) {                       // snap at a passing fish
          let best = null, bd = strike;
          this.grid.query(c.x, c.y, c.z, strike, (o) => { if (o.dead || o.role !== 'prey' || o.fam !== 'fish' || o.len > c.len * 0.4 || o.eatenT >= 0) return; const d = Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z); if (d < bd) { bd = d; best = o; } });
          if (best) { c.state = 'strike'; c.stateT = 0.5; c.target = best; c.strikeFrom = { x: c.x, y: c.y, z: c.z }; }
          c.hunger = 6 + this.rnd() * 14;
        }
      }
    } else if (c.state === 'tell') {
      // it has seen you: it turns and tenses. Swim away now and it may let you go.
      dx = dxp; dy = dyp; dz = dzp; speed = 0; this.threats.push(c);
      if (!this.canAttackPlayer(c, pl) || dp > strike * 1.5) { c.state = 'wait'; c.cd = 1.5; c.alert = 0; this.events.push({ t: 'dodged', c }); }
      else if (c.stateT <= 0) { c.state = 'strike'; c.stateT = 0.55; }
    } else if (c.state === 'strike') {
      const t = c.target && !c.target.dead && c.target.eatenT < 0 ? c.target : pl;
      dx = t.x - c.x; dy = t.y - c.y; dz = t.z - c.z; speed = c.chase;
      const dd = Math.hypot(dx, dy, dz), isPl = t === pl;
      if (isPl && dd < this.biteRange(c, pl) && c.cd <= 0) { this.tryBitePlayer(c, pl); c.state = 'recover'; c.stateT = 2.4; }
      else if (!isPl && dd < c.len * 0.5 + t.len * 0.4) { t.eatenT = 0; this.events.push({ t: 'npcEat', pred: c, prey: t }); c.state = 'recover'; c.stateT = 2.0; c.target = null; }
      else if (c.stateT <= 0 || Math.hypot(c.x - c.strikeFrom.x, c.y - c.strikeFrom.y, c.z - c.strikeFrom.z) > strike * 1.6) { c.state = 'recover'; c.stateT = 1.8; c.target = null; }
      this.threats.push(c);
    } else if (c.state === 'recover') {
      speed = 0; dx = c.fx; dz = c.fz;
      if (c.stateT <= 0) { c.state = 'return'; c.alert = 0; }
    } else if (c.state === 'return') {
      const h = c.home; dx = h.x - c.x; dy = h.y - c.y; dz = h.z - c.z; speed = c.cruise * 1.1;
      if (Math.hypot(dx, dy, dz) < 0.35) { c.state = 'wait'; c.sp_ = 0; }
    }
    if (c.state !== 'strike') c.alert = Math.max(0, c.alert - dt * 2);
    const d3 = this._d3; d3.x = dx; d3.y = dy; d3.z = dz; if (!c.noClamp) this.avoidTerrain(c, d3);
    this.go(c, dt, d3.x, d3.y, d3.z, speed, c.state === 'strike' ? 3.0 : (c.state === 'tell' ? 2.4 : 1.2));
    this.integrate(c, dt);
    // ambushers lie still, so keep their tail nearly flat
    if (c.state === 'wait') c.amp = 0.25 + 0.1 * Math.sin(this.time * 1.4 + c.s0 * 6);
  }

  // ---- classification: what is food, what is danger (drives rim hints, radar and lock-on) -------------------------------------
  classify(dt, pl) {
    const sense = pl.stats.sense, scale = this.hintScale;
    for (const c of this.list) {
      if (c.dead) continue;
      const dx = c.x - pl.x, dy = c.y - pl.y, dz = c.z - pl.z, d = Math.hypot(dx, dy, dz);
      c.dist = d;
      let cls = 0;
      if (c.beh === 'station') cls = c.ready ? 4 : 0;
      else if (c.role === 'pred') cls = c.len >= pl.len * 1.25 ? 2 : (this.edible(pl, c) ? 1 : 0);
      else if (this.edible(pl, c)) cls = c.role === 'hazard' ? 3 : 1;
      else if (c.role === 'hazard') cls = 3;
      c.cls = cls;
      let want = 0, r = 0, g = 0, b = 0;
      if (c.golden && cls === 1) { r = 1.0; g = 0.78; b = 0.15; want = 0.9; }
      else if (cls === 1) { r = 0.20; g = 1.0; b = 0.50; want = d < sense ? 0.5 : (d < sense * 1.6 ? 0.5 * (1 - (d - sense) / (sense * 0.6)) : 0); }
      else if (cls === 2) { r = 1.0; g = 0.16; b = 0.10; want = (d < sense * 1.5 ? 0.5 : 0) + (c.alert > 0.5 ? 0.5 : 0); }
      else if (cls === 3) { r = 1.0; g = 0.72; b = 0.08; want = d < sense * 0.9 ? 0.45 : 0; }
      else if (cls === 4) { r = 0.3; g = 0.85; b = 1.0; want = d < sense * 1.2 ? 0.6 : 0; }
      if (pl.pulse > 0 && d < pl.pulseR) want = Math.max(want, 1.0);
      want *= scale;
      if (want > 0) { c.hr = r; c.hg = g; c.hb = b; }
      c.ha += (want - c.ha) * Math.min(1, dt * 5);
      if (c.ha < 0.003 && want === 0) c.ha = 0;
    }
  }

  // best creature to bite: closest to the view axis within reach
  lockTarget(pl, camDir, reach) {
    let best = null, bs = 1e9;
    for (const c of this.list) {
      if (c.dead || c.cls !== 1 && c.cls !== 3 || !this.edible(pl, c)) continue;
      const dx = c.x - pl.x, dy = c.y - pl.y, dz = c.z - pl.z, d = Math.hypot(dx, dy, dz) - c.len * 0.4;
      if (d > reach) continue;
      const cosv = (dx * camDir[0] + dy * camDir[1] + dz * camDir[2]) / Math.max(Math.hypot(dx, dy, dz), 1e-3);
      const cosf = (dx * pl.fx + dy * pl.fy + dz * pl.fz) / Math.max(Math.hypot(dx, dy, dz), 1e-3);
      if (cosv < 0.80 && cosf < 0.85) continue;
      const score = (1 - Math.max(cosv, cosf)) * 6 + d / Math.max(reach, 1);
      if (score < bs) { bs = score; best = c; }
    }
    return best;
  }

  // ---- draw ------------------------------------------------------------------------------------------------------------------
  draw(camera, frustum, pl) {
    const rend = this.renderer, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, sph = this._sphere || (this._sphere = new THREE.Sphere());
    const d = this._dr || (this._dr = {});
    for (const c of this.list) {
      if (c.dead) continue;
      const r = this.rec(c.key); if (!r) continue;
      const dx = c.x - cx, dy = c.y - cy, dz = c.z - cz, dist = Math.hypot(dx, dy, dz);
      if (dist > 200 + c.len * 80) continue;
      const rad = c.len * (c.fam === 'hero' ? 1.3 : 0.7) + 0.2;
      if (dist > rad * 1.5 && frustum) { sph.center.set(c.x, c.y, c.z); sph.radius = rad; if (!frustum.intersectsSphere(sph)) continue; }
      let scale = c.len;
      if (c.eatenT >= 0) {                            // being swallowed: shrink into the player's mouth
        const k = clamp(1 - c.eatenT / 0.22, 0, 1); scale = c.len * k; if (k <= 0) continue;
        c.x += (pl.mx - c.x) * 0.22; c.y += (pl.my - c.y) * 0.22; c.z += (pl.mz - c.z) * 0.22;
      }
      d.x = c.x; d.y = c.y; d.z = c.z; d.fx = c.fx; d.fy = c.fy; d.fz = c.fz; d.roll = c.roll; d.len = scale;
      d.ph = c.fam === 'hero' ? c.ph / (TAU * c.freq) : c.ph;
      d.amp = c.amp; d.turn = c.turnLean; d.flash = c.flash; d.hr = c.hr; d.hg = c.hg; d.hb = c.hb; d.ha = c.ha;
      d.tr = c.tr; d.tg = c.tg; d.tb = c.tb; d.s0 = c.s0; d.s1 = c.s1; d.s2 = c.s2; d.s3 = c.s3;
      rend.draw(r, lodFor(dist, c.len), d);
      if (c.golden && this.fx && Math.random() < 0.25) this.fx.burst(c.x, c.y, c.z, 1, [1, 0.8, 0.3], 0.25, 0.012, 0.9);
    }
  }
}
