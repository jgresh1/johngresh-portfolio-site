// Descent: Evolve. Orchestrates the game: state machine, input, the per-frame loop, events, evolution / level-up flow, saving.
import * as THREE from 'three';
import { mulberry32 } from '../flora/geom.js';
import { FORMS, SPECIES, VIS, TIER_XP, XP_DROP, MAX_LEVEL, DIFFICULTY, ZONES, LEVEL_ZONE, zoneAt, ABILITIES, ATTRS, PASSIVES } from './data.js';
import { GWorld } from './gworld.js';
import { Specks } from './specks.js';
import { CreatureRenderer } from './render.js';
import { Ecosystem } from './creatures.js';
import { Player, START } from './player.js';
import { CameraRig } from './camera.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { Achievements } from './achievements.js';
import { FEEL } from '../feel.js';

const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SAVE_KEY = 'descent.save.v1', SET_KEY = 'descent.settings.v1';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const DEFAULTS = { difficulty: 'normal', sens: 1, invert: false, zoom: 1, hints: 0.6, guide: true, volume: 0.7, music: 0.5, quality: 2, ui: 0, tut: {} };

export class Game {
  constructor(api) {
    this.api = api;
    const { scene, camera, world, scatter } = api;
    this.camera = camera; this.scene = scene;
    this.settings = Object.assign({}, DEFAULTS, store.get(SET_KEY) || {});
    this.seed = 20261001;
    this.rnd = mulberry32(this.seed);
    this.gw = new GWorld(world, scatter);
    this.specks = new Specks(scene);
    this.fx = this.specks.fx;
    this.rend = new CreatureRenderer(scene);
    this.eco = new Ecosystem({ gw: this.gw, renderer: this.rend, specks: this.specks, rnd: this.rnd, difficulty: this.settings.difficulty });
    this.eco.fx = this.fx;
    this.player = new Player(this.gw, this.eco, this.specks, this.rnd);
    this.player.setDifficulty(this.settings.difficulty);
    this.rig = new CameraRig(camera, this.gw); this.rig.zoom = this.settings.zoom;
    this.eco.hintScale = this.settings.hints;
    this.audio = new GameAudio(this.settings);
    this.ach = new Achievements(this);
    this.hud = new Hud(this);
    this.mode = 'off'; this.active = false; this.timeScale = 1; this.rawT = 0;
    this.keys = new Set(); this.pressed = new Set(); this.mouseDown = false; this.lockWanted = false;
    this.coast = { x: 0, y: 0 }; this.lookTr = FEEL.tracker();
    this.lockTarget = null; this.cards = null; this.evoT = 0; this.deadT = 0; this.titleT = 0; this.sinceSave = 0; this.hitStop = 0;
    this.frustum = new THREE.Frustum(); this._pv = new THREE.Matrix4();
    this.resetStats(); this.saveInfo = null; this.bot = null; this.simT = 0; this.warmed = false; this.discT = 0; this.tutT = 0; this.lastToastKey = '';
    this.refreshSaveInfo();
    this.bindInput();
    this.eco.maxCreatures = 520;
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------------------------------------------------------------
  resetStats() { this.stats = { alerts: 0, bites: 0, misses: 0, bySp: {}, alertSp: {}, deathSp: {} }; }

  setSeed(seed) { this.fixedSeed = true; this.seed = seed; const r = mulberry32(seed); this.rnd = r; this.eco.rnd = r; this.player.rnd = r; }

  refreshSaveInfo() { const s = store.get(SAVE_KEY); this.saveInfo = s && s.level ? { level: s.level } : null; }

  enter(titleScreen = true) {
    const a = this.api;
    this.active = true; a.state.game = true; document.body.classList.add('game-on');
    for (const g of [a.schools, a.heroes, a.jellies]) if (g && g.group) g.group.visible = false;
    a.post.params.aperture = 0; a.post.params.aoRadius = 0.30; a.post.params.ao = 1.0;
    a.state.lamp = false;
    if (!this.warmed) this.warm();
    this.hud.setHidden(false);
    if (titleScreen) this.showTitle();
  }

  exit() {
    const a = this.api;
    this.active = false; a.state.game = false; a.state.shadowR = 0; a.U.uNearFade.value.set(0, 0); a.U.uOccl.value.z = 0; this.mode = 'off'; document.body.classList.remove('game-on'); if (a.post.taaSubject) a.post.taaSubject.on = false;
    if (document.pointerLockElement) document.exitPointerLock();
    for (const g of [a.schools, a.heroes, a.jellies]) if (g && g.group) g.group.visible = true;
    this.rend.begin(); this.rend.end(); this.specks.points.visible = false; this.fx.a.p.visible = false; this.fx.n.p.visible = false;
    this.hud.hideOverlays(); this.hud.setHidden(true);
    a.camera.near = 0.08; a.camera.fov = 58; a.camera.updateProjectionMatrix();
    a.ctl.yaw = this.rig.yaw; a.ctl.pitch = this.rig.pitch; a.ctl.vel.set(0, 0, 0); a.applyLook();
  }

  warm(compile = true) {
    this.warmed = true;
    try { const t0 = performance.now(); const n = this.gw.solids.prewarm(); console.info('collision fields', n, Math.round(performance.now() - t0) + ' ms'); } catch (e) { console.error('solids warm', e); }
    for (const k of Object.keys(SPECIES)) { try { this.eco.rec(k); } catch (e) { console.error('warm', k, e); } }
    for (const f of FORMS) { try { this.rend.ensure(f.vis, 2, f.len, true); } catch (e) { console.error('warm form', f.id, e); } }
    // compile every creature shader now (a first shark or turtle would otherwise hitch the frame it appears)
    if (compile) try {
      const meshes = []; for (const r of this.rend.recs.values()) for (const l of r.lods) for (const m of l.meshes) { if (!m.visible) { m.visible = true; meshes.push(m); } }
      this.api.renderer.compile(this.scene, this.camera);
      for (const m of meshes) m.visible = false;
    } catch (e) { console.warn('shader warm-up skipped', e); }
  }

  showTitle() {
    this.mode = 'title'; this.titleT = 0; this.timeScale = 1;
    this.player.reset(); this.player.ghost = true; this.player.setDifficulty(this.settings.difficulty);
    this.resetWorld();
    this.rig.zoom = 1.1; this.rig.yaw = 0.9; this.rig.pitch = -0.1; this.rig.cut = true;
    this.hud.setHidden(true); this.hud.title(!!this.saveInfo);
    this.audio.setMood('title');
  }

  resetWorld() {
    const e = this.eco;
    for (const c of e.list) c.dead = true;
    e.list = []; e.schools.clear(); e.counts = {}; e.threats.length = 0; e.decoys.length = 0; e.events.length = 0;
    for (const id of [...this.specks.clouds.keys()]) this.specks.removeCloud(id);
    this.specks.fx.live = 0; this.specks.fx.life.fill(0); this.specks.fx.data.fill(0); this.specks.fx.na.fill(0);
    e.direct(0, this.player, 170);
    for (let i = 0; i < 6; i++) e.direct(0, this.player, 40);
    this.updateViewDir();
    for (let i = 0; i < 20; i++) e.update(0.05, this.player);
    e.events.length = 0;
    this.seedStartFood();
  }

  // a little food right where the fish starts, so the first minute is never empty
  seedStartFood() {
    const pl = this.player, sp = SPECIES.plankton, e = this.eco, rnd = this.rnd;
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2, r = 2.5 + rnd() * 4, x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r;
      const y = Math.min(this.gw.floor(x, z) + 0.6 + rnd() * 0.8, -0.8);
      const cl = this.specks.addCloud('plankton', 0, x, y, z, 26, 1.4, sp.len, sp.col, rnd, (xx, zz) => this.gw.floor(xx, zz));
      if (cl) { e.counts.plankton = (e.counts.plankton || 0) + 1; cl.speckKey = 'plankton'; }
    }
  }

  updateViewDir() { const p = this.player, r = this.rig; p.viewX = -Math.sin(r.yaw); p.viewZ = -Math.cos(r.yaw); }

  newGame() {
    if (!this.fixedSeed) { const r = mulberry32((Date.now() ^ (Math.random() * 4294967296)) >>> 0); this.rnd = r; this.eco.rnd = r; this.player.rnd = r; }      // every new game is a different reef (tests call setSeed first)
    store.del(SAVE_KEY); this.saveInfo = null; this.ach.resetRun();
    const pl = this.player; pl.reset(); pl.ghost = false; pl.setDifficulty(this.settings.difficulty);
    this.beginPlay(true);
  }
  continueGame() {
    const s = store.get(SAVE_KEY); if (!s) return this.newGame();
    const pl = this.player; pl.load(s); pl.ghost = false; pl.setDifficulty(s.difficulty || this.settings.difficulty);
    this.beginPlay(false);
  }
  beginPlay(fresh) {
    const pl = this.player;
    pl.y = Math.max(pl.y, this.gw.floor(pl.x, pl.z) + 0.9); pl.events.length = 0;
    this.resetWorld();
    this.rig.zoom = this.settings.zoom; this.rig.facePlayer(pl); this.rig.yaw = -1.5; this.rig.pitch = -0.1; this.rig.cut = true;
    this.mode = 'play'; this.timeScale = 1; this.hud.hideOverlays(); this.hud.setHidden(false); this.hud.clearHint(); this.zoneNow = null;
    this.cards = null; this.hitStop = 0; this.evoT = 0; this.sinceSave = 0; this.lastDiscCheck = 0;
    this.eco.setCalm(pl, 24); pl.invuln = Math.max(pl.invuln, 6);                  // a quiet first few seconds
    this.requestLock();
    this.audio.start(); this.audio.setMood('play');
    if (fresh || !this.settings.tut.moved) this.hud.hint(this.touchOn ? 'Drag on the left of the screen to swim, drag on the right to look. Swim into the glowing <b>plankton</b> to eat.' : 'Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to swim, drag the mouse to look. Swim into the glowing <b>plankton</b> to eat.', 12000);
  }

  menuAction(a) {
    this.audio.ui();
    switch (a) {
      case 'new': this.newGame(); break;
      case 'continue': this.continueGame(); break;
      case 'help': this.hud.helpPanel(this.mode === 'title' ? 'title' : 'pausemenu'); break;
      case 'settings': this.hud.settingsPanel(this.mode === 'title' ? 'title' : 'pausemenu'); break;
      case 'explore': this.exit(); break;
      case 'title': this.hud.title(!!this.saveInfo); break;
      case 'pausemenu': this.hud.pauseMenu(); break;
      case 'resume': this.resume(); break;
      case 'dex': this.hud.dex(this.mode === 'title' ? 'title' : (this.mode === 'victory' ? 'victoryback' : 'pausemenu')); break;
      case 'victoryback': this.hud.victory(this.victoryInfo()); break;
      case 'stats': this.hud.statsPanel(); break;
      case 'ach': this.hud.achPanel(this.mode === 'title' ? 'title' : 'pausemenu'); break;
      case 'quit': this.save(); this.refreshSaveInfo(); this.showTitle(); break;
      case 'respawn': this.respawn(); break;
      case 'keep': this.hud.hideOverlays(); this.mode = 'play'; this.timeScale = 1; this.requestLock(); break;
    }
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused'; if (document.pointerLockElement) document.exitPointerLock();
    this.hud.pauseMenu(); this.save(); this.audio.duck(true);
  }
  resume() { this.mode = 'play'; this.hud.hideOverlays(); this.requestLock(); this.audio.duck(false); }
  requestLock() { /* free mouse: the cursor is never captured; drag with either button to look */ }

  save() { if (this.mode === 'title' || this.mode === 'off') return; store.set(SAVE_KEY, this.player.serialize()); this.refreshSaveInfo(); }
  setSetting(k, v) {
    this.settings[k] = v; store.set(SET_KEY, this.settings);
    switch (k) {
      case 'difficulty': this.eco.setDifficulty(v); this.player.setDifficulty(v); break;
      case 'zoom': this.rig.zoom = v; break;
      case 'hints': this.eco.hintScale = v; break;
      case 'ui': this.hud.updateScale(true); break;
      case 'volume': case 'music': this.audio.setVolumes(this.settings); break;
      case 'quality': if (this.api.ui) { this.api.ui.applyQuality(v); } break;
    }
  }

  victoryInfo() {
    const p = this.player; const total = Object.keys(SPECIES).length;
    return { time: p.time, meals: p.meals, deaths: p.deaths, found: Object.keys(p.discovered).length, total, combo: p.bestCombo, difficulty: DIFFICULTY[p.difficulty].name };
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // input
  // ---------------------------------------------------------------------------------------------------------------------------------
  bindInput() {
    const cv = this.api.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (!this.active) { if (e.code === 'Escape' && !e.repeat && this.api.state.game === false && this.mode === 'off') { this.enter(true); } return; }
      if (e.repeat) { if (this.mode === 'play') e.preventDefault(); return; }
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ControlLeft'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') { if (this.mode === 'play') this.pause(); else if (this.mode === 'paused') this.resume(); }
      if (e.code === 'Tab') { if (this.mode === 'play') { this.pause(); this.hud.dex('pausemenu'); } else if (this.mode === 'paused') this.resume(); }
      if (e.code === 'KeyM') this.audio.toggleMute();
      if (this.mode === 'levelup' && this.cards) { const i = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code]; if (i !== undefined && this.cards[i]) this.pickCard(i); }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('pagehide', () => { if (this.active && (this.mode === 'play' || this.mode === 'paused')) this.save(); });
    window.addEventListener('blur', () => { this.keys.clear(); if (this.active && this.mode === 'play') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.active && this.mode === 'play') this.pause(); });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.active && this.mode === 'play') this.pause(); });
    cv.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (this.mode === 'play') {
        if (e.button === 0) this.pressed.add('Mouse0');                // bite on press; right button: ability on release, unless it was a drag
        this.mouseDown = true; this.dragBtn = e.button; this.dragPx = 0; this.lx = e.clientX; this.ly = e.clientY;
        this.fling(0, 0); this.lookTr.reset(); this.lookTr.add(e.clientX, e.clientY, e.timeStamp);
      }
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (this.mouseDown && e.button === 2 && this.dragBtn === 2 && this.dragPx < 6 && this.active && this.mode === 'play') this.pressed.add('Mouse2');
      if (this.mouseDown && this.dragPx > 12 && this.active && this.mode === 'play' && document.pointerLockElement !== cv) {   // flicked: let the view coast
        const [vx, vy] = this.lookTr.vel(e.timeStamp), sp = Math.hypot(vx, vy);
        if (sp > 0.5) { const f = 0.22 * smooth01((sp - 0.5) / 0.7); this.fling(vx * f, vy * f); }
      }
      this.mouseDown = false;
    });
    cv.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
    window.addEventListener('mousemove', (e) => {
      if (!this.active || this.mode !== 'play') return;
      const locked = document.pointerLockElement === cv;
      let dx = 0, dy = 0;
      if (locked) { dx = e.movementX; dy = e.movementY; } else if (this.mouseDown && this.lx !== undefined) { dx = e.clientX - this.lx; dy = e.clientY - this.ly; this.lx = e.clientX; this.ly = e.clientY; this.dragPx += Math.abs(dx) + Math.abs(dy); } else return;
      let g = 1;
      if (!locked) { this.lookTr.add(e.clientX, e.clientY, e.timeStamp); const [vx, vy] = this.lookTr.vel(e.timeStamp); g = 0.8 + 0.45 * smooth01((Math.hypot(vx, vy) - 0.15) / 1.65); }   // slow drags aim finely
      this.look(dx * g, dy * g);
    });
    cv.addEventListener('wheel', (e) => { if (this.active && this.mode === 'play') { this.zoomBy(e.deltaY > 0 ? 1.08 : 0.93); e.preventDefault(); } }, { passive: false });
  }

  // phones and tablets (main.js makes the controls, touch.js): the ability tiles become buttons, and hints name touches instead of keys
  useTouch(t) {
    this.touch = t;
    const tiles = [[this.hud.slotBite, 'KeyF'], [this.hud.slotPulse, 'KeyQ'], [this.hud.slotA[0], 'KeyE'], [this.hud.slotA[1], 'KeyR']];
    for (const [el, k] of tiles) el.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.active && this.mode === 'play') this.pressed.add(k); }, { passive: false });
  }
  get touchOn() { return !!(this.touch && this.touch.on); }

  // a look flick (px/ms): the view keeps turning and eases to a stop; fling(0, 0) catches it
  fling(vx, vy) { const c = this.coast; c.x = Math.max(-2000, Math.min(2000, vx * 1000)); c.y = Math.max(-700, Math.min(700, vy * 1000 * 0.4)); }
  coastLook(dt) {
    const c = this.coast; if (!c.x && !c.y) return;
    if (this.mouseDown || this.mode !== 'play') { c.x = c.y = 0; return; }
    this.look(c.x * dt, c.y * dt);
    const k = Math.exp(-4.6 * dt); c.x *= k; c.y *= k; if (Math.abs(c.x) < 10 && Math.abs(c.y) < 10) c.x = c.y = 0;
  }

  zoomBy(f) { this.rig.zoom = clamp(this.rig.zoom * f, 0.45, 2.6); this.settings.zoom = this.rig.zoom; }

  look(dx, dy) {
    const s = 0.0023 * this.settings.sens;
    this.rig.yaw -= dx * s; this.rig.pitch -= dy * s * (this.settings.invert ? -1 : 1);
    this.rig.pitch = clamp(this.rig.pitch, -1.45, 1.45);
  }

  readInput() {
    const k = this.keys, i = this._inp || (this._inp = { fwd: 0, right: 0, up: 0, dash: false });
    const any = (...c) => c.some((x) => k.has(x));
    if (this.botInput) { Object.assign(i, this.botInput); return i; }
    i.fwd = (any('KeyW', 'ArrowUp') ? 1 : 0) - (any('KeyS', 'ArrowDown') ? 1 : 0);
    i.right = (any('KeyD', 'ArrowRight') ? 1 : 0) - (any('KeyA', 'ArrowLeft') ? 1 : 0);
    i.up = (any('Space') ? 1 : 0) - (any('KeyC', 'KeyZ', 'ControlLeft', 'ControlRight') ? 1 : 0);
    i.dash = any('ShiftLeft', 'ShiftRight');
    const t = this.touch;
    if (t && t.on) { i.fwd = clamp(i.fwd + t.fwd, -1, 1); i.right = clamp(i.right + t.right, -1, 1); i.up = clamp(i.up + t.up, -1, 1); i.dash = i.dash || t.dash; }
    return i;
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // frame
  // ---------------------------------------------------------------------------------------------------------------------------------
  frame(dt) {
    dt = Math.min(dt, 0.1);
    this.rawT += dt;
    const a = this.api;
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.08; }
    const h = dt * this.timeScale;
    switch (this.mode) {
      case 'title': this.titleFrame(h, dt); break;
      case 'play': this.playFrame(h, dt); break;
      case 'evolving': case 'levelup': this.evolveFrame(h, dt); break;
      case 'dead': this.deadFrame(h, dt); break;
      case 'victory': this.victoryFrame(h, dt); break;
      case 'paused': this.rig.update(0, this.player, {}); break;
    }
    this.pressed.clear();
    this.hud.setTouch(this.touchOn);
    this.hud.lockPrompt(this.mode === 'play' && !this.botInput && !document.pointerLockElement && this.lockWanted);
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this._pv);
    this.drawWorld(dt);
    if (this.mode !== 'title') { this.hud.update(dt, cam); this.hud.overlay(cam, window.innerWidth, window.innerHeight); }
    this.audio.update(dt, this);
  }

  // headless simulation: advance game logic only (no rendering). Used by tests and the balance bot.
  sim(seconds, step = 1 / 30) {
    let n = Math.round(seconds / step);
    while (n-- > 0) { if (this.mode === 'play') this.simStep(step); else if (this.mode === 'evolving' || this.mode === 'levelup') this.evolveSim(step); else if (this.mode === 'dead') this.deadT += step; else break; }
  }

  titleFrame(h, dt) {
    this.titleT += dt;
    const pl = this.player;
    this.rig.yaw += dt * 0.07; this.rig.pitch = -0.1 + Math.sin(this.titleT * 0.2) * 0.05;
    this.updateViewDir();
    pl.invuln = 99;
    // the title fish idles and drifts in a slow loop
    const t = this.titleT * 0.25; this._ti = this._ti || { fwd: 0, right: 0, up: 0, dash: false }; this._ti.fwd = 0.35;
    this.gw.solids.update(h, pl.x, pl.z);
    pl.update(h, this._ti, { yaw: Math.sin(t) * 1.4 + 0.6, pitch: -0.02 + Math.sin(t * 1.3) * 0.1 }, this.specks);
    this.stepWorld(h, true);
    this.rig.update(dt, pl, { distMul: 1.5, shiftX: 0.55, side: 0, shiftY: 0.05 });
  }

  playFrame(h, dt) {
    this.coastLook(dt);
    let rem = h;
    while (rem > 1e-5) { const s = Math.min(rem, 1 / 30); this.simStep(s); rem -= s; }
    const pl = this.player;
    this.rig.update(dt, pl, { fovKick: pl.dashing ? 9 : 0, distMul: pl.rushing ? 1.15 : 1 });
    this.sinceSave += dt; if (this.sinceSave > 30) { this.sinceSave = 0; this.save(); }
  }

  simStep(s) {
    const pl = this.player, eco = this.eco;
    this.simT += s;
    this.gw.solids.update(s, pl.x, pl.z);
    this.updateViewDir();
    const inp = this.readInput();
    if (this.botHook) this.botHook(s);
    if (!this.settings.tut.moved && (inp.fwd || inp.right)) { this.settings.tut.moved = true; store.set(SET_KEY, this.settings); }
    pl.update(s, inp, { yaw: this.rig.yaw, pitch: this.rig.pitch }, this.specks);
    // actions
    const camDir = this.camDir();
    if (this.pressed.has('Mouse0') || this.pressed.has('KeyF') || this.botBite) {
      if (pl.bite(this.lockTarget, camDir)) this.audio.lunge();
      this.botBite = false;
    }
    if (this.pressed.has('KeyE') || this.pressed.has('Mouse2') || this.botAbility === 0) { if (pl.useAbility(0, this.fx)) this.rig.addShake(0.15); this.botAbility = -1; }
    if (this.pressed.has('KeyR') || this.botAbility === 1) { if (pl.useAbility(1, this.fx)) this.rig.addShake(0.15); this.botAbility = -1; }
    if (this.pressed.has('KeyQ') || this.botPulse) { pl.sensePulse(this.fx); this.botPulse = false; }
    pl.biteStep();
    this.stepWorld(s, false);
    this.consume();
    // lock-on
    this.lockTarget = eco.lockTarget(pl, camDir, pl.biteReach() * 1.5 + pl.len);
    // progress
    if (pl.levelReady && this.mode === 'play') { if (pl.level >= MAX_LEVEL) this.finale(); else this.startEvolve(); }
    if (pl.dead && this.mode === 'play') this.startDeath();
    this.discT += s; if (this.discT > 0.5) { this.discT = 0; this.checkDiscoveries(); this.tutorial(); this.zoneWatch(); }
  }

  // a title card when you swim into a new part of the reef
  zoneWatch() {
    const pl = this.player, z = zoneAt(pl.x, -this.gw.floor(pl.x, pl.z));
    if (z === this.zoneNow) { this.zoneSince = 0; return; }
    this.zoneSince = (this.zoneSince || 0) + 0.5;
    if (this.zoneSince >= 2 || !this.zoneNow) {
      const first = !this.zoneNow; this.zoneNow = z; this.zoneSince = 0;
      if (!first || this.player.time < 3) { const Z = ZONES[z]; this.hud.banner(Z.name, Z.blurb); }
    }
  }

  camDir() { const r = this.rig, c = Math.cos(r.pitch); return [-Math.sin(r.yaw) * c, Math.sin(r.pitch), -Math.cos(r.yaw) * c]; }

  stepWorld(s, quiet) {
    const pl = this.player, eco = this.eco, a = this.api;
    eco.update(s, pl);
    const cur = a.U.uCurrent.value;
    const mo = this._mouth || (this._mouth = { on: true, x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0, r: 0.1 });
    mo.on = !pl.dead && pl.stunT <= 0; mo.x = pl.mx; mo.y = pl.my; mo.z = pl.mz; mo.fx = pl.fx; mo.fy = pl.fy; mo.fz = pl.fz; mo.r = pl.speckReach();
    this.specks.update(s, pl.x, pl.y, pl.z, pl.len, 0.35 + 0.65 * clamp(pl.speedFrac, 0, 1.2), this.camera, a.post.size.y, [cur.x, cur.y], (x, z) => this.gw.floor(x, z), mo);
    if (quiet) eco.events.length = 0;
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // events
  // ---------------------------------------------------------------------------------------------------------------------------------
  project(x, y, z) {
    const v = this._pv3 || (this._pv3 = new THREE.Vector3()); v.set(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight];
  }

  consume() {
    const eco = this.eco, pl = this.player, hud = this.hud, A = this.audio;
    for (const e of eco.events) {
      switch (e.t) {
        case 'bite': {
          if (pl.hurt(e.dmg, e.c, e.venom)) { this.ach.onBitten(); this.stats.bites++; this.stats.bySp[e.c.key] = (this.stats.bySp[e.c.key] || 0) + 1; this.onHurt(e); }
          break;
        }
        case 'golden': this.hud.toast(`<b>A golden ${e.c.sp.name} is nearby!</b> Catch it for a big growth bonus.`, 'disc', 5000); this.audio.pulse(); break;
        case 'alert': { this.stats.alerts++; this.stats.alertSp[e.c.key] = (this.stats.alertSp[e.c.key] || 0) + 1; A.alert(); if (!this.settings.tut.alert) { this.settings.tut.alert = true; store.set(SET_KEY, this.settings); hud.hint(this.touchOn ? 'A hunter noticed you! Hold <kbd>Dash</kbd> to get away, or dive into the seagrass to hide.' : 'A hunter noticed you! <kbd>Shift</kbd> to dash away, or dive into the seagrass to hide.', 7000); } break; }
        case 'escaped': this.ach.onEscaped(); break;
        case 'dodged': this.ach.onDodged(); break;
        case 'miss': this.stats.misses++; hud.toast('It bit the false eye and missed!', 'good'); break;
        case 'npcEat': { const p = e.prey; this.fx.burst(p.x, p.y, p.z, 8, [0.9, 0.9, 1], 0.7, 0.03, 0.5); const d = Math.hypot(p.x - pl.x, p.y - pl.y, p.z - pl.z); if (d < 25) A.npcEat(d); break; }
        case 'decoyEaten': A.pop(0.4); break;
        case 'ping': this.fx.ring(e.c.x, e.c.y + 0.12, e.c.z, 0.45, 20, [0.4, 0.9, 1.0], 1.1); break;
        case 'cleanStart': hud.toast('The cleaner shrimp is tending your wounds. Stay still.', 'good', 3200); A.pulse(); break;
        case 'cleanTick': { const c = e.c; this.fx.burst(c.x, c.y + 0.1, c.z, 2, [0.5, 0.95, 1.0], 0.5, 0.012, 0.8); if (Math.random() < 0.3) A.pop(0.3); break; }
        case 'cleanDone': hud.toast('All cleaned up!', 'good'); A.levelup(); this.ach.onCleaned(); break;
      }
    }
    eco.events.length = 0;
    for (const e of pl.events) {
      switch (e.t) {
        case 'eat': this.onEat(e); break;
        case 'slick': hud.toast('Wriggled free!', 'good'); break;
        case 'shallow': hud.toast('Too shallow for a fish your size. Swim back into deeper water.', ''); setTimeout(() => { pl.shallowTold = false; }, 25000); break;
        case 'toxic': hud.toast('Poison! You feel sick.', 'warn'); break;
        case 'sting': hud.toast('Stung!', 'warn'); A.hurt(0.5); break;
        case 'ability': A.ability(e.id); break;
        case 'pulse': A.pulse(); break;
        case 'hurt': if (e.why) { this.rig.addShake(0.3); hud.hurtFlash(0.45); A.hurt(0.5); } break;
        case 'death': break;
      }
    }
    pl.events.length = 0;
  }

  onHurt(e) {
    const pl = this.player, hud = this.hud;
    this.rig.addShake(0.7); hud.hurtFlash(0.85); this.audio.hurt(1); this.hitStop = Math.max(this.hitStop, 0.07);
    this.fx.burst(pl.x, pl.y, pl.z, 12, [1.0, 0.85, 0.7], 1.2, 0.03, 0.7);
    if (!this.settings.tut.hurt) { this.settings.tut.hurt = true; store.set(SET_KEY, this.settings); hud.hint('Ouch! You get a moment of safety after a bite. Health comes back when you stay unhurt, and eating helps too.', 8000); }
  }

  onEat(e) {
    const hud = this.hud, pl = this.player;
    this.ach.onEat(e);
    const col = e.col || (e.speck ? [0.3, 1, 0.8] : [0.9, 0.95, 1]);
    this.fx.burst(e.x, e.y, e.z, e.speck ? 3 : 10, col, e.speck ? 0.4 : 1.0, e.speck ? 0.012 : 0.02, e.speck ? 0.4 : 0.6);
    const s = this.project(e.x, e.y, e.z);
    if (s && (!e.speck || (e.xp >= 0.5 && Math.random() < 0.5))) hud.float(s[0], s[1] - 8, '+' + (e.xp < 10 ? e.xp.toFixed(1) : Math.round(e.xp)), e.first ? '#ffe27a' : '#9dffd4');
    this.audio.eat(e.speck ? 0 : clamp(e.xp / 8, 0.2, 1.4), pl.combo);
    if (e.golden) { this.hud.toast(`<b>Golden catch!</b> +${Math.round(e.xp)} growth`, 'disc', 3800); this.fx.burst(e.x, e.y, e.z, 40, [1, 0.8, 0.25], 1.8, 0.02, 1.1); this.audio.levelup(); this.ach.onGolden(); }
    if (e.first) hud.toast(`<b>New food:</b> ${e.name} — bonus growth!`, 'disc', 3200);
    if (!e.speck && !this.settings.tut.bite) { }
    if (!this.settings.tut.ate1 && !e.speck) { this.settings.tut.ate1 = true; store.set(SET_KEY, this.settings); }
    if (e.speck && !this.settings.tut.plankton) { this.settings.tut.plankton = true; store.set(SET_KEY, this.settings); hud.hint(this.touchOn ? 'Nice! Bigger prey: aim at a green-ringed fish and tap the screen or <kbd>Bite</kbd>. Hold <kbd>Dash</kbd> to dash.' : 'Nice! Bigger prey: aim at a green-ringed fish and press <kbd>click</kbd> or <kbd>F</kbd> to bite. <kbd>Shift</kbd> dashes.', 9000); }
  }

  checkDiscoveries() {
    const pl = this.player, eco = this.eco;
    const R = Math.min(22, Math.max(8, pl.stats.sense * 1.1));
    if (this.rawT - (this.lastDisc || 0) < 2.2) return;
    let best = null, bd = 1e9;
    for (const c of eco.list) {
      if (c.dead || c.decoy || pl.discovered[c.key]) continue;
      const d = c.dist - c.len * 3; if (d < R && d < bd) { bd = d; best = c; }
    }
    if (best) {
      this.lastDisc = this.rawT; pl.discovered[best.key] = { seen: true, ate: 0 };
      if (best.role === 'pred' || best.role === 'hazard') this.hud.toast(`<b>Bestiary:</b> ${best.sp.name}${best.role === 'pred' ? ' (hunter)' : ' (hazard)'}`, 'warn', 3000);    // food you simply see is recorded quietly
    }
  }

  tutorial() {
    const s = this.settings.tut, pl = this.player, hud = this.hud;
    if (!s.lock && this.lockTarget && !this.lockTarget.dead && this.lockTarget.role === 'prey') { s.lock = true; store.set(SET_KEY, s === this.settings.tut ? this.settings : this.settings); hud.hint(this.touchOn ? 'Green ring = food in reach. Tap the screen or <kbd>Bite</kbd> to lunge and bite.' : 'Green ring = food in reach. Press <kbd>click</kbd> or <kbd>F</kbd> to lunge and bite.', 7000); }
    if (!s.ability && pl.abilities.length) { s.ability = true; store.set(SET_KEY, this.settings); hud.hint(this.touchOn ? `Tap the <kbd>${ABILITIES[pl.abilities[0]].name}</kbd> tile at the bottom to use it.` : `Press <kbd>E</kbd>${pl.abilities.length > 1 ? ' or <kbd>R</kbd>' : ''} to use ${ABILITIES[pl.abilities[0]].name}.`, 6000); }
  }

  xpFor(c) {
    const pl = this.player, sp = c.sp, d = Math.max(0, pl.level - sp.tier);
    return TIER_XP(sp.tier) * (sp.xp ?? 1) * XP_DROP[Math.min(d, XP_DROP.length - 1)] * pl.stats.xpMul;
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // evolution / level-up / death / finale
  // ---------------------------------------------------------------------------------------------------------------------------------
  startEvolve() {
    const pl = this.player, hud = this.hud;
    this.evoFrom = pl.level - 1;
    this.cards = pl.beginLevelUp();
    this.mode = 'evolving'; this.evoT = 0; this.timeScale = 0.35; this.evoSwapped = false; this.evoCards = false;
    if (document.pointerLockElement) document.exitPointerLock();
    hud.hideOverlays(); this.hitStop = 0;
    this.audio.evolve(); hud.flashWhite(0.0);
    this.ach.onLevel(pl.level);
  }

  evolveSim(s) { this.evoT += s / Math.max(this.timeScale, 0.05); if (this.evoT > 3.6 && this.mode === 'evolving') { this.mode = 'levelup'; } }

  evolveFrame(h, dt) {
    const pl = this.player, hud = this.hud, f = FORMS[pl.level - 1];
    this.evoT += dt;
    // world keeps moving slowly; the camera swings around the fish
    this.rig.yaw += dt * 0.55; this.rig.pitch += (-0.12 - this.rig.pitch) * Math.min(1, dt * 2);
    this.updateViewDir();
    this._ti = this._ti || { fwd: 0, right: 0, up: 0, dash: false }; this._ti.fwd = 0;
    pl.update(h, this._ti, { yaw: this.rig.yaw, pitch: this.rig.pitch }, this.specks);
    this.stepWorld(h, true);
    this.rig.update(dt, pl, { distMul: 1.35, shiftY: this.mode === 'levelup' || this.evoT > 1.1 ? 0.3 : 0.08 });
    if (this.mode === 'evolving') {
      const t = this.evoT;
      if (t > 1.15 && !this.evoSwapped) { this.evoSwapped = true; this.hud.flashWhite(0.85, 900); this.fx.ring(pl.x, pl.y, pl.z, 2 + pl.len * 3, 72, [0.7, 0.95, 1], 1.2); this.fx.burst(pl.x, pl.y, pl.z, 60, [0.8, 1, 1], 2.2 + pl.len, 0.025, 1.3); this.hud.evolveIntro(f, f.perk); this.rig.addShake(0.4); }
      if (t > 3.4) { this.mode = 'levelup'; this.timeScale = 0.12; hud.cards(this.cards, (i) => this.pickCard(i)); this.audio.cardsIn(); }
    }
  }

  pickCard(i) {
    const pl = this.player, card = this.cards[i]; if (!card) return;
    pl.finishLevelUp(card); this.cards = null;
    this.hud.hideOverlays(); this.mode = 'play'; this.timeScale = 1;
    const name = card.kind === 'attr' ? ATTRS[card.id].name : card.kind === 'ability' ? ABILITIES[card.id].name : PASSIVES[card.id].name;
    this.hud.toast(`<b>${name}</b> ${card.kind === 'attr' ? 'rank ' + card.rank : 'unlocked'}`, 'good', 3200);
    this.audio.levelup(); this.save(); this.requestLock();
    this.eco.setCalm(pl, 20);
    this.hud.hint(`<b>${pl.form.name}.</b> ${pl.form.perk.text}`, 6000);
  }

  startDeath() {
    const pl = this.player; const kk = pl.lastKiller ? pl.lastKiller.key : '?'; this.stats.deathSp[kk] = (this.stats.deathSp[kk] || 0) + 1;
    this.mode = 'dead'; this.deadT = 0; this.timeScale = 0.35; this.deathXp = pl.xp;
    if (document.pointerLockElement) document.exitPointerLock();
    this.killer = pl.lastKiller; this.audio.death();
    this.fx.burst(pl.x, pl.y, pl.z, 40, [1, 0.7, 0.5], 1.6, 0.04, 1.0); this.rig.addShake(0.8); this.hud.hurtFlash(0.9);
  }
  deadFrame(h, dt) {
    this.deadT += dt;
    this.stepWorld(h, true);
    this.rig.update(dt, this.player, { distMul: 1.2 });
    if (this.deadT > 1.7 && !this.deathShown) { this.deathShown = true; const lost = this.player.xp * this.player.diff.deathLoss; this.hud.death(this.player.lastKiller, lost); }
  }
  respawn() {
    const pl = this.player; this.deathShown = false;
    const kx = pl.x, ky = pl.y, kz = pl.z, k = pl.lastKiller;
    pl.respawn();
    const s = pl.safe, far = Math.hypot(s.x - kx, s.z - kz) > 90;
    if (far) {                                                       // the last calm spot is a long way off: come back a little way from where you were eaten, away from the killer
      let dx = k ? kx - k.x : 1, dz = k ? kz - k.z : 0; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      let x = kx + dx * 28, z = kz + dz * 28; if (!this.gw.inBounds(x, z)) { x = kx - dx * 28; z = kz - dz * 28; }
      pl.x = x; pl.z = z; pl.y = Math.min(-(pl.len * 0.4 + 0.2), Math.max(ky, this.gw.floor(x, z) + pl.len * 0.5 + 0.5));
    }
    this.eco.setCalm(pl, 35);
    this.mode = 'play'; this.timeScale = 1; this.hud.hideOverlays(); this.rig.facePlayer(pl); this.requestLock();
    this.updateViewDir(); this.save();
  }

  finale() {
    const pl = this.player;
    this.mode = 'victory'; this.timeScale = 0.4; this.victT = 0; this.victShown = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.victory(); this.hud.flashWhite(0.6, 1500); this.ach.onFinish();
    this.fx.ring(pl.x, pl.y, pl.z, 6 + pl.len * 3, 96, [1, 0.95, 0.7], 1.6);
    this.save();
  }
  victoryFrame(h, dt) {
    this.victT += dt;
    const pl = this.player;
    this.rig.yaw += dt * 0.35; this.updateViewDir();
    this._ti = this._ti || { fwd: 0, right: 0, up: 0, dash: false }; this._ti.fwd = 0.3;
    pl.update(h, this._ti, { yaw: this.rig.yaw + 0.6, pitch: 0 }, this.specks); pl.invuln = 99;
    this.stepWorld(h, true);
    this.rig.update(dt, pl, { distMul: 1.3 });
    if (this.victT > 2.2 && !this.victShown) { this.victShown = true; this.hud.victory(this.victoryInfo()); }
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // drawing
  // ---------------------------------------------------------------------------------------------------------------------------------
  drawWorld(dt) {
    const pl = this.player, rend = this.rend, mode = this.mode;
    this.specks.points.visible = true; this.specks.fx.a.p.visible = true; this.specks.fx.n.p.visible = true;
    this.specks.uniforms.uHintAll.value = pl.pulse > 0 ? 1 : 0;
    rend.begin();
    if (!(mode === 'dead' && this.deadT > 0.35)) this.drawPlayer(dt);
    this.eco.draw(this.camera, this.frustum, pl);
    rend.end();
    this.updateTaaSubject();
  }

  // tell the temporal anti-aliasing where the player's fish is on screen: it moves with the camera, so its pixels must not be reprojected
  updateTaaSubject() {
    const a = this.api, cam = this.camera, pl = this.player, post = a.post;
    a.state.shadowR = clamp(pl.len * 90, 9, 42);                      // sun shadow area: tight (crisp) for a fry, the usual 42 m for big fish
    { const cut = 0.12 + 0.22 * pl.len; a.U.uNearFade.value.set(cut, cut * 1.08); }      // flora closer to the lens than this is cut away (short dither band), so a blade or a branch never fills the screen
    const sp = post.taaSubject || (post.taaSubject = { on: false, u: 0, v: 0, r: 0, d0: 0, d1: 1 });
    const oc = a.U.uOccl.value, pj = cam.projectionMatrix.elements; a.U.uOcclP.value.set(pj[0], pj[5]);
    if (this.mode === 'off' || (this.mode === 'dead' && this.deadT > 0.35)) { sp.on = false; oc.z = 0; return; }
    const v = this._tv || (this._tv = new THREE.Vector3()); v.set(pl.x, pl.y, pl.z).applyMatrix4(cam.matrixWorldInverse);
    const zc = -v.z; if (zc <= cam.near * 1.5) { sp.on = false; oc.z = 0; return; }
    const L = pl.len * (this.mode === 'evolving' ? 1.3 : 1) * 0.85, th = Math.tan(cam.fov * Math.PI / 360);
    const n = cam.near, f = cam.far, depthOf = (z) => (f * (z - n)) / (z * (f - n));
    v.set(pl.x, pl.y, pl.z).project(cam);
    sp.on = true; sp.u = v.x * 0.5 + 0.5; sp.v = v.y * 0.5 + 0.5; sp.r = Math.max(0.5 * (L * 1.3 / zc) / th, 0.015);
    sp.d0 = depthOf(Math.max(n * 1.01, zc - L * 1.1)); sp.d1 = depthOf(zc + L * 1.1);
    oc.set(v.x, v.y, sp.r * 1.1 + 0.03, zc);                          // hole in the foliage in front of the fish (ndc position, radius, view depth)
  }

  drawPlayer(dt) {
    const pl = this.player, rend = this.rend;
    let idx = pl.level - 1, scale = 1, glow = 0;
    if (this.mode === 'evolving') {
      const t = this.evoT;
      if (t < 1.15) { idx = this.evoFrom; scale = 1 + 0.2 * (t / 1.15); glow = clamp(t / 1.15, 0, 1); }
      else { scale = 0.65 + 0.35 * clamp((t - 1.15) / 0.9, 0, 1) + 0.05 * Math.sin((t - 1.15) * 9) * Math.exp(-(t - 1.15) * 1.3); glow = clamp(1 - (t - 1.15) / 1.6, 0, 1); }
    }
    const f = FORMS[idx];
    const rec = rend.ensure(f.vis, 2, f.len, true);
    const d = this._pd || (this._pd = {});
    const len = (idx === pl.level - 1 ? pl.len : f.len * 1.0) * scale;
    d.x = pl.x; d.y = pl.y; d.z = pl.z; d.fx = pl.fx; d.fy = pl.fy; d.fz = pl.fz; d.roll = pl.roll; d.len = len;
    d.ph = rec.fam === 'hero' ? pl.ph / (Math.PI * 2 * (VIS[f.vis].freq || 1)) : pl.ph; d.amp = pl.amp; d.turn = pl.turnLean;
    let flash = pl.flash;
    if (pl.blinkT > 0 && pl.flash <= 0.05) flash = Math.max(flash, (Math.sin(this.rawT * 24) > 0 ? 0.28 : 0));
    d.flash = flash;
    const pulse = pl.pulse > 0 ? 0.12 : 0;
    // calm-start / respawn protection: a faint cyan shimmer. The glow is added to the lit colour before the water's attenuation, so on a dark
    // skin at depth even 0.1 washes the fish out (the great white turned pink-white) - keep it tiny and the default glow at zero.
    const shield = pl.invuln > 1.2 && pl.invuln < 50 ? 0.03 + 0.012 * Math.sin(this.rawT * 8) : 0;
    const bright = Math.max(glow, pulse, shield, pl.puffT > 0 ? 0.08 : 0, pl.rushing ? 0.2 : 0);
    d.hr = 0.55; d.hg = 0.9; d.hb = 1.0; d.ha = Math.max(bright, this.playerGlow ?? 0);
    d.tr = 1; d.tg = 1; d.tb = 1; d.s0 = 0.31; d.s1 = 0.62; d.s2 = 0.17; d.s3 = 0.5;
    rend.draw(rec, 0, d);
    // a soft ground-contact cue is provided by the sun shadow; swim wake bubbles when dashing
    if (pl.dashing && Math.random() < 0.5) this.fx.bubbles(pl.x - pl.fx * pl.len * 0.4, pl.y, pl.z - pl.fz * pl.len * 0.4, 1, 0.012 + pl.len * 0.02, pl.len * 0.2);
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // test helpers
  // ---------------------------------------------------------------------------------------------------------------------------------
  debug() {
    const pl = this.player, eco = this.eco;
    const counts = {}; for (const c of eco.list) counts[c.key] = (counts[c.key] || 0) + 1;
    return { mode: this.mode, level: pl.level, xp: +pl.xp.toFixed(1), need: pl.xpNeed, hp: +pl.hp.toFixed(1), stam: +pl.stam.toFixed(2), len: +pl.len.toFixed(3), pos: [pl.x, pl.y, pl.z].map((v) => +v.toFixed(1)), creatures: eco.list.length, specks: this.specks.count, counts, threats: eco.threats.length, meals: pl.meals, deaths: pl.deaths };
  }
}

export function initGame(api) {
  const g = new Game(api);
  return g;
}
