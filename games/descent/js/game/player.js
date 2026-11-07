// The player's fish: swimming, stamina, health, biting, growth, evolution, upgrades and abilities.
import { FORMS, ATTRS, ABILITIES, PASSIVES, XP_NEED, TIER_XP, XP_DROP, MAX_LEVEL, DIFFICULTY, ABILITY_SLOTS, VIS, ZONES, LEVEL_ZONE, BOUNDS } from './data.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const START = { x: 16, z: -14 };

export class Player {
  constructor(gw, eco, specks, rnd) {
    this.gw = gw; this.eco = eco; this.specks = specks; this.rnd = rnd;
    this.events = [];
    this.difficulty = 'normal'; this.diff = DIFFICULTY.normal;
    this.reset();
  }

  reset() {
    this.level = 1; this.xp = 0; this.attrs = {}; this.abilities = []; this.passives = {}; this.cdTimers = {};
    this.discovered = {}; this.eatenCount = 0; this.deaths = 0; this.time = 0; this.totalXp = 0; this.meals = 0; this.bestCombo = 0;
    this.levelTimes = []; this.levelStart = 0;
    this.x = START.x; this.z = START.z; this.y = this.gw.floor(this.x, this.z) + 0.9;
    this.vx = this.vy = this.vz = 0; this.fx = 1; this.fy = 0; this.fz = 0; this.roll = 0; this.turnLean = 0;
    this.stats = {}; this.recompute(); this.hp = this.stats.hpMax; this.stam = this.stats.stam;
    this.dead = false; this.invuln = 0; this.flash = 0; this.sinceHurt = 99; this.poison = 0;
    this.biteCd = 0; this.biteT = 0; this.stamLock = false; this.dashing = false; this.speedFrac = 0; this.cover = 0; this.depthHere = 3;
    this.inkT = 0; this.cloak = 0; this.puffT = 0; this.rushT = 0; this.rushing = false; this.slowT = 0; this.stunT = 0; this.pulse = 0; this.pulseR = 0; this.pulseCd = 0;
    this.frenzy = 0; this.frenzyT = 0; this.combo = 0; this.comboT = 0; this.recent = []; this.progressScale = 0.82;
    this.ph = 0; this.amp = 1; this.mx = this.my = this.mz = 0; this.viewX = 1; this.viewZ = 0; this.levelReady = false; this.safe = { x: this.x, y: this.y, z: this.z };
    this.lockId = 0; this.lungeT = 0; this.ghost = false; this.biteMissT = 0;
  }

  get form() { return FORMS[this.level - 1]; }
  get xpNeed() { return XP_NEED[this.level - 1]; }
  get progress() { return clamp(this.xp / this.xpNeed, 0, 1); }

  // ---- derived numbers ---------------------------------------------------------------------------------------------------------
  rank(id) { return this.attrs[id] || 0; }
  recompute() {
    const f = this.form, a = (id) => this.rank(id), p = f.perk || {}, s = this.stats, d = this.diff;
    const baseLen = f.len * (this.progressScale + (1 - this.progressScale) * (this.xpNeed ? clamp(this.xp / this.xpNeed, 0, 1) : 0));
    s.baseLen = baseLen;
    s.speed = f.speed * (1 + 0.12 * a('speed')) * (1 + (p.speed || 0));
    s.dashMul = 2.1 * (p.dashMul || 1);
    s.turn = f.turn * (1 + 0.18 * a('turn'));
    s.hpMax = Math.round(f.hp * (1 + 0.18 * a('vital')) * (p.hpMul || 1));
    s.stam = f.stam * (1 + 0.25 * a('stamina')) * (p.stamMul || 1);
    s.stamRegen = f.regen * (1 + 0.25 * a('stamina')) * (p.regenMul || 1);
    s.dashCost = p.dashCost || 1;
    s.armor = clamp((p.armor || 0) + 0.10 * a('armor'), 0, 0.7);
    s.eat = f.eat + 0.05 * a('jaws') + (p.eat || 0);
    s.biteCd = 0.8 * (1 - 0.12 * a('jaws'));
    s.sense = f.sense * (1 + 0.30 * a('senses'));
    s.stealth = clamp(f.stealth + (p.stealth || 0) + 0.12 * a('stealth'), 0, 0.8);
    s.xpMul = (1 + 0.12 * a('appetite') + (p.xp || 0)) * d.xp;
    s.slick = 0.35 * a('slick');
    s.miss = p.miss || 0;
    s.regenHp = 0.045 * (1 + 0.5 * a('vital')) * d.regen;
    s.apex = !!p.apex; s.spineProof = !!p.spineProof; s.lunge = p.lunge || 1; s.shellBonus = p.shellBonus || 1;
    s.frenzy = !!this.passives.frenzy;
  }

  setDifficulty(k) { this.difficulty = k; this.diff = DIFFICULTY[k]; this.recompute(); }

  // body length now (grows through the level, swells with Puff Up)
  get len() { return this.stats.baseLen * (this.puffT > 0 ? 1.9 : 1); }

  // ---- input + movement -----------------------------------------------------------------------------------------------------
  // inp: { fwd, right, up (each -1..1), dash }, view: { yaw, pitch }
  update(dt, inp, view, specks) {
    const st = this.stats, gw = this.gw;
    this.time += dt;
    if (this.dead) return;
    this.recompute();
    this.depthHere = -gw.floor(this.x, this.z); if (!this.tooShallow) this.shallowT = 0;
    const cy = Math.cos(view.pitch), sy = Math.sin(view.yaw), cyaw = Math.cos(view.yaw);
    const fwdC = [-sy * cy, Math.sin(view.pitch), -cyaw * cy], rightC = [cyaw, 0, -sy];
    this.viewX = -sy; this.viewZ = -cyaw;
    // timers
    this.invuln = Math.max(0, this.invuln - dt); this.blinkT = Math.max(0, (this.blinkT || 0) - dt); this.flash = Math.max(0, this.flash - dt * 2.2); this.sinceHurt += dt;
    this.biteCd = Math.max(0, this.biteCd - dt); this.biteT = Math.max(0, this.biteT - dt); this.lungeT = Math.max(0, this.lungeT - dt);
    this.inkT = Math.max(0, this.inkT - dt); this.cloak = Math.max(0, this.cloak - dt); this.puffT = Math.max(0, this.puffT - dt); this.slowT = Math.max(0, this.slowT - dt);
    this.stunT = Math.max(0, this.stunT - dt); this.pulse = Math.max(0, this.pulse - dt); this.pulseCd = Math.max(0, this.pulseCd - dt); this.frenzyT = Math.max(0, this.frenzyT - dt);
    if (this.frenzyT <= 0) this.frenzy = 0;
    this.comboT = Math.max(0, this.comboT - dt); if (this.comboT <= 0) this.combo = 0;
    for (const k in this.cdTimers) this.cdTimers[k] = Math.max(0, this.cdTimers[k] - dt);
    this.rushT = Math.max(0, this.rushT - dt); this.rushing = this.rushT > 0;
    if (this.poison > 0) { this.poison -= dt; this.hp -= st.hpMax * 0.02 * dt; if (this.hp <= 1) { this.hp = 1; } }

    // wish direction (camera relative)
    let wx = fwdC[0] * inp.fwd + rightC[0] * inp.right, wy = fwdC[1] * inp.fwd + inp.up, wz = fwdC[2] * inp.fwd + rightC[2] * inp.right;
    const wl = Math.hypot(wx, wy, wz); if (wl > 1) { wx /= wl; wy /= wl; wz /= wl; }
    const moving = wl > 0.05 && this.stunT <= 0;
    // dash / stamina
    const wantDash = inp.dash && moving && !this.stamLock && this.stam > 0.05;
    this.dashing = wantDash || this.rushing;
    if (wantDash && !this.rushing) this.stam = Math.max(0, this.stam - dt * st.dashCost);
    else if (!this.dashing) { if (this.sinceDash > 0.5 || this.sinceDash === undefined) this.stam = Math.min(st.stam, this.stam + dt * st.stamRegen); }
    this.sinceDash = this.dashing ? 0 : (this.sinceDash || 0) + dt;
    if (this.stam <= 0.02) this.stamLock = true; else if (this.stam > st.stam * 0.28) this.stamLock = false;
    // target velocity
    let speed = st.speed * (this.dashing ? st.dashMul : 1) * (this.puffT > 0 ? 0.72 : 1) * (this.slowT > 0 ? 0.55 : 1) * (1 + 0.06 * this.frenzy) * (this.poison > 0 ? 0.85 : 1);
    if (this.rushing) speed = st.speed * 3.1;
    let tx, ty, tz;
    if (this.rushing) { tx = this.fx * speed; ty = this.fy * speed; tz = this.fz * speed; if (moving) { tx += wx * speed * 0.15; ty += wy * speed * 0.15; tz += wz * speed * 0.15; } }
    else if (this.lungeT > 0) { tx = this.vx; ty = this.vy; tz = this.vz; }
    else { tx = wx * speed; ty = wy * speed; tz = wz * speed; }
    if (this.stunT > 0) { tx = ty = tz = 0; }
    const k = this.rushing ? 9 : (moving ? (this.dashing ? 5.0 : 3.4) * (1 + 0.1 * this.rank('turn')) : 2.2);
    const ek = 1 - Math.exp(-k * dt);
    this.vx += (tx - this.vx) * ek; this.vy += (ty - this.vy) * ek; this.vz += (tz - this.vz) * ek;
    // water gently pushes you toward the play area
    const bp = gw.boundsPush(this.x, this.z, this._bp || (this._bp = { x: 0, z: 0 })); this.vx += bp.x * 6 * dt; this.vz += bp.z * 6 * dt;
    let spd = Math.hypot(this.vx, this.vy, this.vz);
    this.speedFrac = spd / st.speed;
    // heading follows the motion, with a turn-rate cap (agility)
    if (spd > st.speed * 0.14 && this.stunT <= 0) {
      this._turnTo(this.vx / spd, this.vy / spd, this.vz / spd, dt, st.turn * (this.dashing ? 1.25 : 1) * (this.rushing ? 0.2 : 1));
    } else this.turnLean *= Math.exp(-dt * 4);
    // integrate + collide
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    // the ground is exact (gw.floor = what is drawn), so the fish can rest right on it; head and tail are checked as well because the ground
    // is not flat under a body (a nose-down fry over a ripple would otherwise dip its head into the sand)
    const L = this.len, hd = VIS[this.form.vis].geo ? VIS[this.form.vis].geo.depth : 0.22, clr = L * (0.5 * hd + 0.035) + 0.012, hl = L * 0.45;     // belly clearance follows the body depth of this form
    { const sol = gw.solids;                                           // coral heads, boulders, barrel sponges, table-coral plates: slide around them, not through
      if (sol && sol.n) for (let k = 0; k < 3; k++) {
        const o = k === 0 ? 0 : k === 1 ? 0.38 : -0.34, d = sol.push(this.x + this.fx * L * o, this.y + this.fy * L * o, this.z + this.fz * L * o, L * 0.2 + 0.012, false);
        if (d) { const dl = Math.hypot(d.x, d.y, d.z) || 1, nx = d.x / dl, ny = d.y / dl, nz = d.z / dl; this.x += d.x; this.y += d.y; this.z += d.z;
          const vn = this.vx * nx + this.vy * ny + this.vz * nz; if (vn < 0) { this.vx -= nx * vn; this.vy -= ny * vn; this.vz -= nz * vn; } }
      } }
    let fl = gw.floor(this.x, this.z) + clr;
    { const fH = gw.floor(this.x + this.fx * hl, this.z + this.fz * hl) + clr * 0.8 - this.fy * hl, fT = gw.floor(this.x - this.fx * hl, this.z - this.fz * hl) + clr * 0.8 + this.fy * hl;
      if (fH > fl) fl = fH; if (fT > fl) fl = fT; }
    if (this.y < fl) { this.y = fl; if (this.vy < 0) this.vy *= 0.2; if (this.fy < 0) { this.fy *= 0.3; this._renorm(); } }
    const top = -(L * 0.35 + 0.1); if (this.y > top) { this.y = top; if (this.vy > 0) this.vy = 0; if (this.fy > 0) { this.fy *= 0.3; this._renorm(); } }
    // a big fish cannot swim in water that is too shallow for it: the shore gently turns it back
    this.tooShallow = false;
    { const need = L * 0.55 + 0.25, dep = -gw.floor(this.x, this.z);
      if (dep < need) {
        this.tooShallow = true; this.shallowT = (this.shallowT || 0) + dt; if (this.shallowT > 0.8 && !this.shallowTold) { this.shallowTold = true; this.events.push({ t: 'shallow' }); }
        const g = gw.world.grad(this.x, this.z, 3), gl = Math.hypot(g[0], g[1]) || 1, k = clamp((need - dep) / (need * 0.5), 0.15, 1.6);
        this.vx += -g[0] / gl * 9 * k * dt; this.vz += -g[1] / gl * 9 * k * dt;
        const up = (this.vx * g[0] + this.vz * g[1]) / gl;               // moving up the slope (toward shallower water): brake
        if (up > 0) { this.vx -= g[0] / gl * up * Math.min(1, 6 * dt); this.vz -= g[1] / gl * up * Math.min(1, 6 * dt); }
        if (this.y > -(dep * 0.5)) this.y = -(dep * 0.5);
      } }
    const maxD = -BOUNDS.maxDepth; if (this.y < maxD) { this.y = maxD; if (this.vy < 0) this.vy = 0; }
    // cover (hiding), stillness helps
    this.cover = Math.min(1, gw.cover(this.x, this.y, this.z) * (this.speedFrac < 0.2 ? 1.12 : 1));
    // health regrows after a calm moment
    if (this.sinceHurt > 6 && this.hp < st.hpMax) this.hp = Math.min(st.hpMax, this.hp + st.hpMax * st.regenHp * dt);
    // animation
    const sf = clamp(this.speedFrac / 1.6, 0, 1.2);
    this.ph += dt * TAU * (VIS[this.form.vis].freq ?? 3) * (0.5 + 1.5 * sf + (this.dashing ? 0.6 : 0));
    this.amp += ((0.45 + 0.8 * sf) - this.amp) * Math.min(1, dt * 6);
    this.roll = this.turnLean * 0.55;
    // mouth
    const rl = L * 0.5; this.mx = this.x + this.fx * rl; this.my = this.y + this.fy * rl; this.mz = this.z + this.fz * rl;
    // food: swim through plankton to eat it
    if (this.stunT <= 0) this.eatSpecks();
    // a safe spot to come back to
    if (this.hp > st.hpMax * 0.6 && this.eco.threats.length === 0 && this.sinceHurt > 4) { this._safeT = (this._safeT || 0) + dt; if (this._safeT > 3) { this.safe.x = this.x; this.safe.y = this.y; this.safe.z = this.z; this._safeT = 0; } } else this._safeT = 0;
    // hazards
    this.touchHazards(dt);
  }

  _renorm() { const l = Math.hypot(this.fx, this.fy, this.fz) || 1; this.fx /= l; this.fy /= l; this.fz /= l; }
  _turnTo(dx, dy, dz, dt, rate) {
    const dot = clamp(this.fx * dx + this.fy * dy + this.fz * dz, -1, 1), maxA = rate * dt;
    let nx, ny, nz;
    if (dot > 0.99999) { nx = dx; ny = dy; nz = dz; }
    else {
      let tx = dx, ty = dy, tz = dz, d = dot;
      if (dot < -0.9995) { tx = -this.fz; ty = 0; tz = this.fx; d = 0; }
      const ang = Math.acos(d), k = Math.min(1, maxA / Math.max(ang, 1e-5)), s = Math.sin(ang) || 1;
      const w0 = Math.sin((1 - k) * ang) / s, w1 = Math.sin(k * ang) / s;
      nx = this.fx * w0 + tx * w1; ny = this.fy * w0 + ty * w1; nz = this.fz * w0 + tz * w1;
      const cross = this.fx * tz - this.fz * tx;
      this.turnLean += (clamp(cross * 2.4, -1, 1) - this.turnLean) * Math.min(1, dt * 7);
    }
    this.fx = nx; this.fy = ny; this.fz = nz; this._renorm();
  }

  // ---- eating ----------------------------------------------------------------------------------------------------------------
  mouthRadius() { return this.len * (this.biteT > 0 ? 0.50 : 0.24) + 0.012; }

  speckReach() { const L = this.len; return L * 0.5 + 0.1 + (this.rushing ? L * 0.5 : 0) + (this.biteT > 0 ? L * 0.3 : 0); }

  eatSpecks() {
    const L = this.len, r = this.speckReach();
    this.specks.eatAt(this.mx, this.my, this.mz, r, (i, type, x, y, z, cl) => {
      const key = cl ? cl.speckKey || cl.key : 'plankton';
      this.onEat({ key, sp: SPECIES_REF[key], len: SPECIES_REF[key].len, x, y, z, speck: true });
    });
  }

  // how far a bite can actually reach (lunge distance + open mouth); the lock-on ring uses this
  biteReach() { const st = this.stats; return st.speed * 2.6 * st.lunge * 0.22 * st.lunge * 0.85 + this.len * 0.5 * 1.6 + 0.04 + this.len * 0.3; }

  // press: lunge at the target (or straight ahead) and bite whatever is in reach
  bite(target, camDir) {
    if (this.dead || this.biteCd > 0 || this.stunT > 0) return false;
    this.biteCd = this.stats.biteCd; this.biteT = 0.3;
    let dx = this.fx, dy = this.fy, dz = this.fz;
    if (target) { dx = target.x - this.x; dy = target.y - this.y; dz = target.z - this.z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l; }
    else if (camDir) { dx = camDir[0]; dy = camDir[1]; dz = camDir[2]; }
    const lunge = this.stats.speed * 2.6 * this.stats.lunge;
    this.vx = dx * lunge; this.vy = dy * lunge; this.vz = dz * lunge; this.lungeT = 0.22 * this.stats.lunge;
    this.fx = this.fx * 0.35 + dx * 0.65; this.fy = this.fy * 0.35 + dy * 0.65; this.fz = this.fz * 0.35 + dz * 0.65; this._renorm();
    this.stam = Math.max(0, this.stam - 0.06 * this.stats.stam);
    this.bitTarget = target; this.biteHit = false;
    this.events.push({ t: 'lunge' });
    return true;
  }

  // called every frame while the mouth is open: eat the nearest edible thing in reach
  biteStep() {
    if (this.biteT <= 0 || this.biteHit) return;
    const mr = this.mouthRadius() * 1.6 + 0.04, eco = this.eco;
    let best = null, bd = 1e9;
    const mx = this.mx, my = this.my, mz = this.mz;
    eco.grid.query(mx, my, mz, mr + 0.8 + this.len, (c) => {
      if (c.dead || !eco.edible(this, c)) return;
      const d = Math.hypot(c.x - mx, c.y - my, c.z - mz) - c.len * 0.42;
      if (d < mr && d < bd) { bd = d; best = c; }
    });
    if (!best && this.bitTarget && !this.bitTarget.dead && eco.edible(this, this.bitTarget)) {
      const c = this.bitTarget, d = Math.hypot(c.x - mx, c.y - my, c.z - mz) - c.len * 0.42;
      if (d < mr * 1.3) best = c;
    }
    if (best) { this.biteHit = true; this.eatCreature(best); }
  }

  eatCreature(c) {
    const sp = c.sp;
    if (c.eatenT >= 0) return;
    // hazards bite back
    if (sp.spiny && !this.stats.spineProof) { this.hurtRaw(sp.spiny * this.stats.hpMax, c, 'spines'); }
    if (sp.toxic) { this.poison = 5; this.slowT = Math.max(this.slowT, 2.5); this.events.push({ t: 'toxic', c }); this.hurtRaw(sp.toxic * 0.5 * this.stats.hpMax, c, 'toxin'); }
    c.eatenT = 0;
    this.onEat({ key: c.key, sp, len: c.len, x: c.x, y: c.y, z: c.z, speck: false, golden: !!c.golden });
  }

  onEat(e) {
    const sp = e.sp, st = this.stats;
    const diff = Math.max(0, this.level - sp.tier);
    let base = TIER_XP(sp.tier) * (sp.xp ?? 1) * XP_DROP[Math.min(diff, XP_DROP.length - 1)];
    if (sp.shell) base *= st.shellBonus;
    // combo (quick meals) and variety (different species lately)
    this.combo = this.comboT > 0 ? Math.min(this.combo + 1, 8) : 1; this.comboT = 2.6; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const comboMul = 1 + 0.04 * (Math.min(this.combo, 6) - 1);
    const now = this.time; this.recent = this.recent.filter((r) => now - r.t < 18); if (!this.recent.some((r) => r.k === e.key)) this.recent.push({ k: e.key, t: now }); else for (const r of this.recent) if (r.k === e.key) r.t = now;
    const varietyMul = 1 + 0.03 * Math.min(Math.max(this.recent.length - 1, 0), 5);
    let gain = base * st.xpMul * comboMul * varietyMul * (e.golden ? 5 : 1);
    let first = false;
    if (!this.discovered[e.key]) { this.discovered[e.key] = { ate: 0, seen: true }; first = true; gain += Math.max(3, base * 1.5 * st.xpMul); }
    this.discovered[e.key].ate = (this.discovered[e.key].ate || 0) + 1;
    this.meals++; this.eatenCount++;
    if (st.frenzy) { this.frenzy = Math.min(5, this.frenzy + 1); this.frenzyT = 3; }
    this.hp = Math.min(st.hpMax, this.hp + st.hpMax * (e.speck ? 0.004 : 0.02 + 0.5 * e.len / Math.max(this.len, 0.05) * 0.04));
    this.addXp(gain);
    this.events.push({ t: 'eat', key: e.key, name: sp.name, xp: gain, first, x: e.x, y: e.y, z: e.z, combo: this.combo, speck: e.speck, col: sp.col, golden: !!e.golden, len: e.len });
  }

  addXp(n) {
    if (this.levelReady) return;
    this.xp += n; this.totalXp += n;
    if (this.xp >= this.xpNeed) { this.xp = this.xpNeed; this.levelReady = true; this.events.push({ t: this.level >= MAX_LEVEL ? 'finale' : 'levelReady' }); }
  }

  // choose upgrade cards for the coming level-up
  offerCards(rnd = this.rnd) {
    const pool = [];
    for (const id in ATTRS) { const r = this.rank(id); if (r < ATTRS[id].max) pool.push({ kind: 'attr', id, rank: r + 1, w: 1 }); }
    const abilityRoom = this.abilities.length < ABILITY_SLOTS;
    if (abilityRoom && this.level >= 2) for (const id in ABILITIES) if (!this.abilities.includes(id)) pool.push({ kind: 'ability', id, w: (this.level % 2 === 0 ? 1.3 : 0.7) });
    if (!this.passives.frenzy && this.level >= 3) pool.push({ kind: 'passive', id: 'frenzy', w: 0.8 });
    let cand = pool;
    if (this.level === 1) cand = pool.filter((c) => ['speed', 'appetite', 'vital', 'stealth', 'senses', 'turn'].includes(c.id));
    // weighted draw without replacement; try to guarantee an ability on levels 3, 5, 7, 9
    const picks = [];
    const draw = (arr) => { let t = 0; for (const c of arr) t += c.w; let r = rnd() * t; for (const c of arr) { r -= c.w; if (r <= 0) return c; } return arr[arr.length - 1]; };
    const rest = cand.slice();
    if ([3, 5, 7, 9].includes(this.level) && abilityRoom) { const ab = rest.filter((c) => c.kind === 'ability'); if (ab.length) { const c = draw(ab); picks.push(c); rest.splice(rest.indexOf(c), 1); } }
    while (picks.length < 3 && rest.length) { const c = draw(rest); picks.push(c); rest.splice(rest.indexOf(c), 1); }
    return picks;
  }

  applyCard(card) {
    if (card.kind === 'attr') this.attrs[card.id] = this.rank(card.id) + 1;
    else if (card.kind === 'ability') this.abilities.push(card.id);
    else if (card.kind === 'passive') this.passives[card.id] = true;
  }

  // step 1: evolve into the next form (cards are drawn from the form you are leaving); step 2: apply the chosen card
  beginLevelUp() {
    const cards = this.offerCards();
    this.levelTimes.push(this.time - this.levelStart); this.levelStart = this.time;
    this.level = Math.min(MAX_LEVEL, this.level + 1); this.xp = 0; this.levelReady = false;
    this.recompute(); this.hp = this.stats.hpMax; this.stam = this.stats.stam; this.invuln = 99; this.poison = 0;
    this.events.push({ t: 'evolved', level: this.level });
    return cards;
  }
  finishLevelUp(card) {
    if (card) this.applyCard(card);
    this.recompute(); this.hp = this.stats.hpMax; this.invuln = 3.5;
  }

  // ---- damage ----------------------------------------------------------------------------------------------------------------
  hurt(frac, src, venom = 0) {
    if (this.dead || this.invuln > 0 || this.rushing) return false;
    const st = this.stats;
    if (this.rnd() < st.slick) { this.invuln = 0.9; this.events.push({ t: 'slick', c: src }); return false; }
    let d = frac * st.hpMax * (1 - st.armor) * (this.puffT > 0 ? 0.5 : 1);
    this.hp -= d; this.invuln = 1.1; this.blinkT = 1.1; this.flash = 1; this.sinceHurt = 0;
    if (venom) this.poison = Math.max(this.poison, 4);
    // knock back away from the biter
    if (src) { const dx = this.x - src.x, dy = this.y - src.y, dz = this.z - src.z, l = Math.hypot(dx, dy, dz) || 1; this.vx += dx / l * 4.5; this.vy += dy / l * 2.2; this.vz += dz / l * 4.5; }
    this.events.push({ t: 'hurt', dmg: d, c: src });
    if (this.hp <= 0) this.die(src);
    return true;
  }
  hurtRaw(d, src, why) { if (this.dead) return; this.hp -= d * (1 - this.stats.armor * 0.5); this.flash = Math.max(this.flash, 0.6); this.sinceHurt = 0; this.events.push({ t: 'hurt', dmg: d, c: src, why }); if (this.hp <= 0) this.die(src); }
  die(src) { this.hp = 0; this.dead = true; this.deaths++; this.lastKiller = src || null; this.events.push({ t: 'death', c: src }); }

  touchHazards(dt) {
    const eco = this.eco, L = this.len;
    eco.grid.query(this.x, this.y, this.z, L + 3, (c) => {
      if (c.dead || c.role !== 'hazard' || c.fam !== 'jelly') return;
      const bell = c.len * 0.5, dx = this.x - c.x, dz = this.z - c.z, dy = this.y - c.y;
      if (Math.hypot(dx, dz) < bell + L * 0.3 && dy > -c.len * 1.6 - L * 0.3 && dy < c.len * 0.4 + L * 0.3) {
        if (this.sinceSting === undefined || this.time - this.sinceSting > 0.9) { this.sinceSting = this.time; this.slowT = 2.0; this.hurtRaw(c.sp.sting * this.stats.hpMax, c, 'sting'); this.events.push({ t: 'sting', c }); }
      }
    });
  }

  respawn() {
    const lossK = this.diff.deathLoss;
    this.xp = Math.floor(this.xp * (1 - lossK));
    this.dead = false; this.levelReady = false; this.hp = this.stats.hpMax; this.stam = this.stats.stam; this.poison = 0;
    const s = this.safe; this.x = s.x; this.y = s.y; this.z = s.z; this.vx = this.vy = this.vz = 0; this.invuln = 4; this.sinceHurt = 99;
    this.events.push({ t: 'respawn' });
  }

  // ---- abilities -------------------------------------------------------------------------------------------------------------
  cdLeft(id) { return this.cdTimers[id] || 0; }
  useAbility(slot, fx) {
    const id = this.abilities[slot]; if (!id || this.dead) return false;
    if (this.cdLeft(id) > 0) return false;
    const A = ABILITIES[id]; this.cdTimers[id] = A.cd;
    const eco = this.eco, L = this.len;
    switch (id) {
      case 'ink': this.inkT = A.dur; this.inkAt = { x: this.x, y: this.y, z: this.z }; fx.ink(this.x - this.fx * L * 0.3, this.y, this.z - this.fz * L * 0.3, 26, 1.1 + L * 2); break;
      case 'stun': eco.stunAround(this, 4 + L * 7, A.dur); fx.ring(this.x, this.y, this.z, 4 + L * 7, 48, [0.5, 0.8, 1.0], 0.7); break;
      case 'puff': this.puffT = A.dur; fx.burst(this.x, this.y, this.z, 20, [0.8, 0.9, 1], 1.4, 0.04, 0.6); break;
      case 'rush': this.rushT = A.dur; fx.bubbles(this.x, this.y, this.z, 14, 0.03, 0.2); break;
      case 'decoy': eco.spawnDecoys(this, 9, A.dur); fx.burst(this.x, this.y, this.z, 26, [0.9, 0.95, 1], 1.2, 0.03, 0.8); break;
    }
    this.events.push({ t: 'ability', id });
    return true;
  }
  sensePulse(fx) {
    if (this.pulseCd > 0 || this.dead) return false;
    this.pulse = 3.2; this.pulseR = this.stats.sense * 2.4; this.pulseCd = 7;
    fx.ring(this.x, this.y, this.z, this.pulseR * 0.5, 64, [0.4, 0.9, 1.0], 0.9);
    this.events.push({ t: 'pulse' });
    return true;
  }

  // ---- save ------------------------------------------------------------------------------------------------------------------
  serialize() {
    return { v: 1, level: this.level, xp: this.xp, attrs: this.attrs, abilities: this.abilities, passives: this.passives, discovered: this.discovered, eaten: this.eatenCount, deaths: this.deaths,
      time: this.time, totalXp: this.totalXp, meals: this.meals, bestCombo: this.bestCombo, levelTimes: this.levelTimes, difficulty: this.difficulty, safe: this.safe, pos: [this.x, this.y, this.z] };
  }
  load(d) {
    this.reset();
    this.level = clamp(d.level | 0, 1, MAX_LEVEL); this.xp = d.xp || 0; this.attrs = d.attrs || {}; this.abilities = d.abilities || []; this.passives = d.passives || {};
    this.discovered = d.discovered || {}; this.eatenCount = d.eaten || 0; this.deaths = d.deaths || 0; this.time = d.time || 0; this.totalXp = d.totalXp || 0; this.meals = d.meals || 0;
    this.bestCombo = d.bestCombo || 0; this.levelTimes = d.levelTimes || []; this.levelStart = this.time;
    this.setDifficulty(d.difficulty || 'normal');
    if (d.safe) { this.safe = { ...d.safe }; this.x = d.safe.x; this.y = d.safe.y; this.z = d.safe.z; }
    this.recompute(); this.hp = this.stats.hpMax; this.stam = this.stats.stam; this.invuln = 3;
  }
}

import { SPECIES } from './data.js';
const SPECIES_REF = SPECIES;
