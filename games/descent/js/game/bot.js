// A simple autopilot that plays the game like a careful casual player. Used for balance tests (headless fast-forward) and demos.
//   const bot = new Bot(game, { skill: 0.7 }); bot.run(600);   -> plays 10 game minutes without rendering and returns telemetry
import { ZONES, LEVEL_ZONE, zoneAt, MAX_LEVEL } from './data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Bot {
  constructor(game, opts = {}) {
    this.g = game; this.skill = opts.skill ?? 0.7; this.react = opts.react ?? 0.45; this.pickMode = opts.pick || 'smart'; this.cautious = opts.cautious ?? true; this.risky = opts.risky ?? false;
    this.t = 0; this.target = null; this.targetT = 0; this.wanderYaw = 0; this.wanderT = 0; this.fleeT = 0; this.seenThreat = new Map();
    this.black = new Map(); this.progT = 0; this.bestD = 1e9; this.log = []; this.levelLog = []; this.hurtLog = []; this.lastSample = 0; this.stuckT = 0; this.lastPos = [0, 0, 0]; this.dmgTaken = 0; this.hpPrev = null;
    this.rnd = (() => { let a = 99991; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; })();
    this.inp = { fwd: 0, right: 0, up: 0, dash: false };
  }

  attach() { this.g.botInput = this.inp; this.g.botHook = null; }
  detach() { this.g.botInput = null; }

  aim(dirX, dirY, dirZ, dt, rate = 5) {
    const r = this.g.rig, yaw = Math.atan2(-dirX, -dirZ), pitch = Math.asin(clamp(dirY / (Math.hypot(dirX, dirY, dirZ) || 1), -1, 1));
    let dy = yaw - r.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    r.yaw += clamp(dy, -rate * dt, rate * dt); r.pitch += clamp(pitch - r.pitch, -rate * dt, rate * dt); r.pitch = clamp(r.pitch, -1.2, 1.2);
  }

  // one decision step (called before the player's physics step)
  think(dt) {
    const g = this.g, pl = g.player, eco = g.eco, inp = this.inp, gw = g.gw;
    this.t += dt;
    inp.fwd = 0; inp.right = 0; inp.up = 0; inp.dash = false;
    // damage log
    if (this.hpPrev !== null && pl.hp < this.hpPrev - 0.01) this.dmgTaken += this.hpPrev - pl.hp;
    this.hpPrev = pl.hp;
    // ---- danger?
    let threat = null, td = 1e9;
    for (const c of eco.threats) { const d = Math.hypot(c.x - pl.x, c.y - pl.y, c.z - pl.z); if (d < td) { td = d; threat = c; } }
    // hunters that are alert / patrolling nearby also matter
    if (!threat && this.cautious) for (const c of eco.list) {
      if (c.dead || c.role !== 'pred' || c.len < pl.len * 1.25) continue;
      const d = c.dist ?? Math.hypot(c.x - pl.x, c.y - pl.y, c.z - pl.z);
      if (d < 7 + c.len * 2.5 && d < td) { td = d; threat = c; }
    }
    if (threat) { const first = this.seenThreat.get(threat.id); if (first === undefined) this.seenThreat.set(threat.id, this.t); }
    const reacted = threat && this.t - (this.seenThreat.get(threat.id) ?? this.t) >= this.react * (1.2 - this.skill * 0.6);
    if (threat && reacted && td < 36) {
      // flee: away from the hunter, toward cover / the shallows if close
      let dx = pl.x - threat.x, dy = (pl.y - threat.y) * 0.3, dz = pl.z - threat.z;
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      // prefer a direction with cover: sample a few headings
      let best = null, bs = -1;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, tx = pl.x + Math.cos(a) * 12, tz = pl.z + Math.sin(a) * 12;
        const away = ((tx - pl.x) * dx + (tz - pl.z) * dz) / 12;
        const sc = gw.cover(tx, gw.floor(tx, tz) + 0.4, tz) * 1.2 + away * 0.9 + (-gw.floor(tx, tz) < threat.len * 0.6 + 0.3 ? 1.0 : 0);
        if (sc > bs) { bs = sc; best = [tx - pl.x, tz - pl.z]; }
      }
      const bl = Math.hypot(best[0], best[1]) || 1;
      const ex = best[0] / bl * 0.6 + dx * 0.4, ez = best[1] / bl * 0.6 + dz * 0.4, ey = -0.25;
      this.aim(ex, ey, ez, dt, 8);
      inp.fwd = 1; inp.dash = pl.stam > pl.stats.stam * 0.12 && td < 14 + threat.len * 3;
      // abilities when it is right on top of us
      if (td < 2.5 + threat.len) { for (let s = 0; s < 2; s++) { const id = pl.abilities[s]; if (id && pl.cdLeft(id) <= 0) { g.botAbility = s; break; } } }
      this.target = null; this.fleeT = 1.0; return;
    }
    if (!threat) this.seenThreat.clear();
    if (this.fleeT > 0) { this.fleeT -= dt; }
    // ---- hurt and calm? rest in cover
    if (pl.hp < pl.stats.hpMax * 0.45 && pl.sinceHurt < 12 && pl.cover > 0.2) { this.aim(pl.fx, 0, pl.fz, dt); return; }
    // ---- choose food
    this.targetT -= dt;
    // stick with a target for a while (a person does not dither between two clouds); clouds are looked up again because they drift and get eaten
    if (this.target && this.target.cloud) { const cl = g.specks.clouds.get(this.target.id); if (!cl || cl.alive <= 0) this.target = null; else { this.target.cx = cl.cx; this.target.cy = cl.cy; this.target.cz = cl.cz; } }
    if (!this.target || this.target.dead || this.target.eatenT >= 0 || this.targetT <= 0) { this.target = this.pickFood(); this.targetT = this.target && this.target.cloud ? 7 : 1.2; this.progT = 0; this.bestD = 1e9; }
    // give up on a target that is not getting any closer (darting copepods, fish that outswim us)
    if (this.target) {
      const tt = this.target, pp = tt.cloud ? { x: tt.cx, y: tt.cy, z: tt.cz } : tt, dd = Math.hypot(pp.x - pl.x, pp.y - pl.y, pp.z - pl.z);
      if (dd < this.bestD - 0.4) { this.bestD = dd; this.progT = 0; } else this.progT += dt;
      if (this.progT > (tt.cloud ? 5 : 3.5)) { this.black.set(tt.cloud ? 'c' + tt.id : tt.id, this.t + 20); this.target = null; this.progT = 0; this.bestD = 1e9; this.targetT = 0; }
    }
    const tg = this.target;
    if (tg) {
      let p = tg.cloud ? { x: tg.cx, y: tg.cy, z: tg.cz, len: 0.3 } : tg;
      if (tg.cloud) { const i = g.specks.nearest(pl.mx, pl.my, pl.mz, 4); if (i >= 0) p = { x: g.specks.pos[i * 3], y: g.specks.pos[i * 3 + 1], z: g.specks.pos[i * 3 + 2], len: 0.1 }; }
      const lead = tg.cloud ? 0 : 0.2;
      const dx = p.x + (tg.fx || 0) * (tg.sp_ || 0) * lead - pl.x, dy = p.y - pl.y, dz = p.z + (tg.fz || 0) * (tg.sp_ || 0) * lead - pl.z, d = Math.hypot(dx, dy, dz);
      this.aim(dx, dy, dz, dt, 5 + 4 * this.skill);
      inp.fwd = d > pl.len * 0.4 ? 1 : 0;
      if (!tg.cloud) {
        inp.dash = d > 3 + pl.len * 4 && pl.stam > pl.stats.stam * 0.55;
        if (d < pl.biteReach() * 1.1 && pl.biteCd <= 0) g.botBite = true;
        if (d < 14 && this.skill > 0.5) { inp.fwd = d > pl.len * 1.2 ? 1 : 0.3; }
      } else inp.fwd = 1;
      return;
    }
    // ---- nothing to eat: head for the recommended zone, wandering
    const zone = zoneAt(pl.x, -gw.floor(pl.x, pl.z)), want = ZONES[LEVEL_ZONE[pl.level - 1]];
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.wanderT = 2 + this.rnd() * 4; this.wanderYaw = (this.rnd() - 0.5) * 2.2; }
    let gx = want.goal[0] - pl.x, gz = want.goal[1] - pl.z; const gd = Math.hypot(gx, gz);
    if (zone === LEVEL_ZONE[pl.level - 1] && gd < 90) { gx = Math.cos(this.wanderYaw + this.t * 0.1); gz = Math.sin(this.wanderYaw + this.t * 0.1); }
    const fl = gw.floor(pl.x, pl.z), wy = clamp((fl + 1.6) - pl.y, -1, 1) * 0.5;
    this.aim(gx, wy * Math.hypot(gx, gz), gz, dt, 2.5);
    inp.fwd = 1;
  }

  pickFood() {
    const g = this.g, pl = g.player, eco = g.eco; let best = null, bs = 0;
    const R = Math.max(22, pl.stats.sense * 2.4);
    for (const c of eco.list) {
      if (c.dead || c.cls !== 1 || !eco.edible(pl, c) || c.eatenT >= 0) continue;
      if ((this.black.get(c.id) ?? 0) > this.t) continue;
      const d = c.dist ?? Math.hypot(c.x - pl.x, c.y - pl.y, c.z - pl.z); if (d > R) continue;
      // avoid food that sits right next to a hunter
      let danger = 0; if (!this.risky) eco.grid.query(c.x, c.y, c.z, 6, (o) => { if (!o.dead && o.role === 'pred' && o.len > pl.len * 1.25) danger = 1; });
      if (danger) continue;
      const sc = g.xpFor(c) / (d + 3) * (c.sp.beh === 'sessile' ? 0.8 : 1);
      if (sc > bs) { bs = sc; best = c; }
    }
    for (const cl of g.specks.clouds.values()) {
      if (cl.alive <= 0 || (this.black.get('c' + cl.id) ?? 0) > this.t) continue;
      const d = Math.hypot(cl.cx - pl.x, cl.cy - pl.y, cl.cz - pl.z); if (d > R) continue;
      if (pl.level >= 5 && d > 8) continue;
      const per = (cl.type === 1 ? 1.6 : 0.8) * (g.player.stats.xpMul) * [1, 0.7, 0.45, 0.28, 0.15][Math.min(pl.level - 1, 4)];
      const sc = Math.min(cl.alive, 20) * per / (d + 4);
      if (sc > bs) { bs = sc; best = { cloud: true, cx: cl.cx, cy: cl.cy, cz: cl.cz, dead: false, id: cl.id }; }
    }
    return best;
  }

  choose(cards) {
    if (this.pickMode === 'random') return (this.rnd() * cards.length) | 0;
    const pref = ['speed', 'stealth', 'vital', 'appetite', 'armor', 'stamina', 'jaws', 'senses', 'turn', 'slick'];
    let bi = 0, bs = -1;
    cards.forEach((c, i) => { let s = c.kind === 'ability' ? 6 : c.kind === 'passive' ? 4 : 10 - pref.indexOf(c.id); if (s > bs) { bs = s; bi = i; } });
    return bi;
  }

  // run for `seconds` of game time (headless)
  run(seconds, dt = 1 / 20, sampleEvery = 20) {
    const g = this.g, pl = g.player; this.attach();
    let t = 0;
    const sample = () => this.log.push({ t: +g.simT.toFixed(0), lv: pl.level, xp: +pl.xp.toFixed(0), hp: +pl.hp.toFixed(0), meals: pl.meals, deaths: pl.deaths, n: g.eco.list.length, x: +pl.x.toFixed(0), z: +pl.z.toFixed(0), d: +(-pl.y).toFixed(1), th: g.eco.threats.length });
    const t0 = performance.now();
    while (t < seconds) {
      const mode = g.mode;
      if (mode === 'play') { this.think(dt); g.simStep(dt); }
      else if (mode === 'evolving' || mode === 'levelup') { g.mode = 'levelup'; if (g.cards) { const lv = pl.level; this.levelLog.push({ lv, t: +pl.time.toFixed(0), meals: pl.meals, deaths: pl.deaths, dmg: +this.dmgTaken.toFixed(0) }); g.pickCard(this.choose(g.cards)); } }
      else if (mode === 'dead') { g.respawn(); }
      else if (mode === 'victory') { this.levelLog.push({ lv: 10, t: +pl.time.toFixed(0), meals: pl.meals, deaths: pl.deaths, dmg: +this.dmgTaken.toFixed(0), finished: true }); break; }
      else break;
      t += dt;
      if (g.simT - this.lastSample >= sampleEvery) { this.lastSample = g.simT; sample(); }
    }
    return { simT: +g.simT.toFixed(0), wall: +((performance.now() - t0) / 1000).toFixed(1), level: pl.level, xp: +pl.xp.toFixed(0), meals: pl.meals, deaths: pl.deaths, mode: g.mode, dmg: +this.dmgTaken.toFixed(0), levels: this.levelLog.slice(), tail: this.log.slice(-3) };
  }
}
