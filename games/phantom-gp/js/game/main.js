// main.js — boot, the game's states (title, film, race, pause, result, menu) and the frame loop.
import * as THREE from 'three';
import { Gfx, LOOKS } from './gfx.js';
import { Studio } from './studio.js';
import { ATMO, setSun, installAtmosphere, bakeSky, makeSky, makeEnvironment, SunShadows } from '../track/atmo.js';
import { cloudNoise3D } from '../track/tex.js';
import { W, LOAD, loadWorld, frameAt, surfaceAt } from '../track/world.js';
import { buildTerrain, TERRAIN } from '../track/terrain.js';
import { buildRoad } from '../track/road.js';
import { buildCars, PAINTS } from './cars.js';
import { TRACK, buildTrack, Car, Rival, Race, touch, autopilot } from './sim.js';
import { Chase, CAM_MODES } from './chase.js';
import { Input } from './input.js';
import { Hud, loadSettings, fmtLap } from './hud.js';
import { Sound } from './audio.js';
import { Intro } from './intro.js';
import { Governor } from './perf.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const yieldNow = () => new Promise((r) => setTimeout(r, 0));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEV = Q.has('dev');

/* ------------------------------------------------------------------ quality tiers */
const TIERS = {
  high: { dpr: 1.75, maxPixels: 3.7e6, minScale: 0.6, msaa: 4, bloom: true, bloomScale: 1, blurTaps: 8, shadow: { radii: [45, 170, 640, 2600], sizes: [4096, 4096, 4096, 2048] }, lod: 620, treeNear: 150, treeHero: 55, wind: true,
    sky: { w: 4096, h: 1024, steps: 56 }, carTol: 0.0003, handLevels: 2, maskScale: 1, lo: false, shadowSteps: 14, studio: { env: 512, mirrorScale: 0.5, bakeScale: 1, shadowScale: 1, bake: 96, spray: 1100 } },
  medium: { dpr: 1.5, maxPixels: 2.1e6, minScale: 0.55, msaa: 4, bloom: true, bloomScale: 0.5, blurTaps: 6, shadow: { radii: [50, 200, 800], sizes: [2048, 2048, 2048] }, lod: 420, farStep: 2, treeNear: 100, treeHero: 32, wind: false,
    sky: { w: 2048, h: 512, steps: 44 }, carTol: 0.0009, handLevels: 1, maskScale: 0.5, lo: false, shadowSteps: 10, studio: { env: 256, mirrorScale: 0.5, bakeScale: 0.75, shadowScale: 1, bake: 64, spray: 800 } },
  low: { dpr: 2, maxPixels: 1.0e6, minScale: 0.55, msaa: 2, bloom: false, bloomScale: 0.5, blurTaps: 0, shadow: { radii: [60, 260, 1000], sizes: [1024, 2048, 1024] }, lod: 240, farStep: 4, treeNear: 38, treeHero: 0, wind: false,
    sky: { w: 2048, h: 512, steps: 32 }, carTol: 0.002, handLevels: 1, maskScale: 0.5, lo: true, noDeep: true, shadowSteps: 8, studio: { env: 256, mirrorScale: 0.34, bakeScale: 0.5, shadowScale: 0.5, bake: 32, spray: 500 } },
};
const input = new Input();
if (input.touch) document.body.classList.add('touch');
const S = loadSettings(input.touch);
function pickTier() {
  const forced = Q.get('q') || (S.quality !== 'auto' ? S.quality : null);
  if (TIERS[forced]) return forced;
  const small = Math.min(screen.width, screen.height);          // 0 in a hidden embedded pane: not a small screen
  if (input.touch || (small > 0 && small < 620)) return 'low';
  let name = '';
  try { const gl = document.createElement('canvas').getContext('webgl2'), ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { /* unknown */ }
  if (/SwiftShader|llvmpipe|Basic Render/i.test(name)) return 'low';
  if (/Intel|Iris|UHD|Mali|Adreno|PowerVR|Apple M1(?! (Pro|Max|Ultra))/i.test(name) || (navigator.deviceMemory && navigator.deviceMemory <= 4)) return 'medium';
  return 'high';
}
const tierName = pickTier(), q = { ...TIERS[tierName] };
if (Q.has('dpr')) { q.dpr = parseFloat(Q.get('dpr')); }

/* ------------------------------------------------------------------ globals */
const canvas = $('view'), stage = $('stage');
const gfx = new Gfx(canvas, q), renderer = gfx.renderer;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 26000);
const sound = new Sound();
const G = { state: 'boot', paused: false, time: 0, acc: 0, top: 0, hits: 0, ctrl: 1, orbit: 0, finishCam: 0, lastWrong: 0, hintT: 0, firstRace: true };
let studio, shadows, terrain, road, trees, props, trackside, cars, P, R, race, chase, intro, hud, gov, lineMesh, sky;

const handlers = {
  start: () => begin(), skip: () => { if (G.state === 'film') intro.skip(); },
  resume: () => setPaused(false), restart: () => { setPaused(false); startRace(G.lastRace || { mode: 'grid' }); }, quit: () => { setPaused(false); toMenu(); },
  rematch: () => startRace({ mode: 'grid' }), toMenu: () => toMenu(), duel: () => startRace({ mode: 'grid' }), film: () => playFilm(),
  cam: () => { if (G.state === 'race') hud.toast('Camera', chase.cycle(), 1.1); }, pause: () => { if (G.state === 'race') setPaused(!G.paused); },
  setting: (k, v) => applySetting(k, v),
};
input.on.pause = handlers.pause; input.on.cam = handlers.cam;
input.on.reset = () => { if (G.state === 'race' && !G.paused && race.state === 'green' && !P.done) { P.reset(); chase.snap(); } };
input.on.any = (e) => { if (G.state === 'title' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Pad')) begin(); };

function applySetting(k, v) {
  if (k === 'paint' && cars) { cars.player.setPaint(v); cars.rival.setPaint(rivalPaint()); }
  if (k === 'autoThrottle') input.autoThrottle = v;
  if (k === 'music' || k === 'sound') sound.setOptions(S);
  if (k === 'line' && lineMesh) lineMesh.visible = v && G.state === 'race';
  if (k === 'quality') { const u = new URL(location.href); u.searchParams.delete('q'); location.href = u.toString(); }
}
const rivalPaint = () => (S.paint === 6 ? 5 : 6);        // the rival runs in black, or in crimson if the player took the black car

function resize() {
  const w = Math.max(2, stage.clientWidth), h = Math.max(2, stage.clientHeight);
  gfx.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (studio) studio.setSize(gfx.w, gfx.h);
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  hud = new Hud(S, handlers);
  hud.load('Loading the circuit', 0.02);
  resize();
  LOAD.lo = q.lo;
  await loadWorld((p) => hud.load('Loading the circuit', 0.02 + p * 0.3));
  await yieldNow();
  setSun(112, 39); installAtmosphere();
  scene.fog = new THREE.FogExp2(0xffffff, ATMO.haze);

  hud.load('Painting the sky', 0.34); await yieldNow();
  const skyTex = await bakeSky(renderer, cloudNoise3D(64), q.sky);
  sky = makeSky(skyTex); scene.add(sky);
  scene.environment = makeEnvironment(renderer, sky);
  shadows = new SunShadows(scene, q.shadow); shadows.maxPerFrame = 1;

  hud.load('Building the terrain', 0.4); await yieldNow();
  TERRAIN.farStep = q.farStep || 1;
  terrain = buildTerrain(scene);
  hud.load('Laying the circuit', 0.5); await yieldNow();
  road = buildRoad(scene);
  hud.load('Planting the forest', 0.58); await yieldNow();
  trees = (await import('../track/trees.js')).buildTrees(scene, renderer, q);
  hud.load('Barriers and grandstands', 0.7); await yieldNow();
  props = (await import('../track/props.js')).buildProps(scene, q);
  trackside = (await import('../track/trackside.js')).buildTrackside(scene, q);
  buildTrack();
  lineMesh = buildLine(); scene.add(lineMesh);

  hud.load('Scoring the film', 0.76); await yieldNow();
  sound.prepare();
  hud.load('Building the cars', 0.8); await yieldNow();
  cars = await buildCars(renderer, q);
  cars.player.setPaint(S.paint); cars.rival.setPaint(rivalPaint());
  console.log(`[phantom] tier ${tierName}, car ${cars.tris.toLocaleString()} triangles in ${cars.meshes} meshes, ${cars.ms} ms, lap at the limit ${TRACK.lapTime.toFixed(1)} s, ${TRACK.walls} wall segments`);
  P = new Car(); R = new Rival(); race = new Race(P, R); chase = new Chase(camera);
  scene.add(cars.rival.root, cars.rival.shadow, cars.player.shadow);
  hud.initMap(); hud.rivalName('Voss');

  hud.load('Lighting the studio', 0.86); await yieldNow();
  studio = new Studio(renderer, q.studio);
  studio.setSize(gfx.w, gfx.h);
  toStudio();
  while (studio.bakeN < q.studio.bake) { studio.bakeStep(8); hud.load('Lighting the studio', 0.86 + 0.08 * studio.bakeN / q.studio.bake); await yieldNow(); }

  // warm the circuit: compile every program and draw the first shadow maps now, not at the cut from the film
  hud.load('Warming the tyres', 0.95); await yieldNow();
  toTrack(); race.start({ mode: 'rolling', laps: 1, s0: START_S, skill: S.skill });
  for (let i = 0; i < 5; i++) { frameRace(1 / 60, true); await yieldNow(); }
  G.startPose = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, focus: cars.player.pos.clone() };
  toStudio();

  intro = new Intro({ gfx, studio, view: cars.player, sound, hud, q, mark, warmTrack, onCut: (skipped) => startRace({ mode: 'rolling', laps: 1, fromFilm: !skipped }) });
  // the ladder the governor walks down when frames run long: geometry first (it costs the most on the circuit), then pixels
  const setScale = (v) => { gov.scale = v; gfx.setSize(gfx.cssW, gfx.cssH, v); if (studio) studio.setSize(gfx.w, gfx.h); };
  const treeCut = (k, hero) => { if (!trees) return; const U = trees.uniforms; U.uNear.value = Math.max(26, U.uNear.value * k); if (U.uHero.value > 0) U.uHero.value = hero ? Math.max(14, U.uHero.value * k) : -1000; };
  const LADDER = [
    () => treeCut(0.72, true), () => setScale(0.86), () => { treeCut(0.7, true); gfx.noBloom = true; }, () => setScale(0.74),
    () => { treeCut(0.7, false); q.lod = Math.min(q.lod, 240); }, () => setScale(0.64), () => { for (const l of shadows.lights) l.castShadow = false; }, () => setScale(0.55),
  ];
  gov = new Governor(q, (what, v) => {
    if (what === 'scale') setScale(v); else LADDER[v - 1]();
    if (DEV) console.log('[perf]', what, v, 'avg', gov.avg.toFixed(1));
  }, LADDER.length);
  new ResizeObserver(resize).observe(stage); resize();
  // leaving the tab, or turning a phone upright, stops the clock
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.state === 'race') setPaused(true); else sound.pause(); } else if (!G.paused) sound.resume(); });
  const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
  portrait.addEventListener('change', () => { if (portrait.matches && G.state === 'race') setPaused(true); });
  window.__game = { THREE, G, gfx, scene, camera, studio, cars, P, R, race, chase, input, hud, sound, intro, gov, q, S, W, TRACK, tierName, frame, startRace, toMenu, playFilm, begin, setPaused, shot, step };
  hud.load('Ready', 1);
  G.state = 'title'; hud.screen('title');
  $('title-fine').textContent = input.touch ? 'Turn the sound on' : 'Sound on · press Enter';
  if (Q.has('race')) { await sound.init(); startRace({ mode: Q.get('race') === 'grid' ? 'grid' : 'rolling' }); }
  let last = performance.now();
  const loop = (now) => { const dt = (now - last) / 1000; last = now; gov.sample(dt); frame(Math.min(0.05, Math.max(0.001, dt))); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
const START_S = 600;                                      // the film cuts to the run down to Eau Rouge

// the racing line: a thin ribbon on the road, green where you can stay flat, red where the car must slow
function buildLine() {
  const N = TRACK.N, pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3), sAt = new Float32Array(N * 2), idx = [], fr = {};
  for (let i = 0; i < N; i++) {
    frameAt(i * TRACK.ds, fr);
    const j = (i + 6) % N, slow = TRACK.vp[j] < TRACK.vp[i] - 0.25, lim = TRACK.vp[i] < 80;
    const c = slow ? [1.0, 0.10, 0.06] : lim ? [1.0, 0.72, 0.05] : [0.10, 0.9, 0.30];
    for (let k = 0; k < 2; k++) {
      const d = TRACK.line[i] + (k ? 0.22 : -0.22), o = (i * 2 + k) * 3;
      pos[o] = fr.x + fr.rx * d; pos[o + 1] = fr.y + fr.bank * d + 0.02; pos[o + 2] = fr.z + fr.rz * d;
      col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; sAt[i * 2 + k] = i * TRACK.ds;
    }
    if (i < N - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aS', new THREE.BufferAttribute(sAt, 1)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { uS: { value: 0 }, uL: { value: TRACK.L } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    vertexShader: 'attribute float aS; uniform float uS, uL; varying vec3 vC; varying float vA; void main() { vC = color; float d = mod(aS - uS + uL, uL); vA = smoothstep(9.0, 22.0, d) * (1.0 - smoothstep(120.0, 230.0, d)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main() { if (vA < 0.01) discard; gl_FragColor = vec4(vC * 1.6, vA * 0.5); }', vertexColors: true }));
  m.frustumCulled = false; m.renderOrder = 2; m.visible = false;
  return m;
}

/* ------------------------------------------------------------------ scene switches */
function toStudio() {
  studio.scene.add(cars.player.root); cars.player.home(); cars.player.setStage(true);
  cars.player.setWheels(0, 0, 0, 0, 0);
  gfx.setLook(LOOKS.studio); gfx.fx.blur = 0; lineMesh.visible = false;
  for (const l of studio.lights) l.shadow.needsUpdate = true;
}
function toTrack() {
  scene.add(cars.player.root); cars.player.setStage(false); cars.rival.setStage(false);
  gfx.setLook(LOOKS.track); shadows.invalidate();
}

// The film calls this a few times before it cuts to the race (in the black beat before the drop and in the final
// flash): it draws the circuit into a corner of the frame from where the race will start, so the shadow maps, the
// tree cells and every texture are current and the cut does not stutter.
function warmTrack() {
  const sp = G.startPose; if (!sp) return;
  camera.position.copy(sp.p); camera.quaternion.copy(sp.q); camera.fov = sp.fov; camera.near = 0.3; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); chase.fov = 0;
  terrain.update(camera, q.lod); if (trees) trees.update(camera, 0);
  shadows.update(camera, sp.focus);
  const rt = gfx.rt;
  rt.viewport.set(0, 0, 96, 54); rt.scissor.set(0, 0, 96, 54); rt.scissorTest = true;
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  rt.scissorTest = false; rt.viewport.set(0, 0, gfx.w, gfx.h); rt.scissor.set(0, 0, gfx.w, gfx.h);
}

/* ------------------------------------------------------------------ states */
async function begin() {
  if (G.state !== 'title') return;
  G.state = 'starting';
  await sound.init(); sound.setOptions(S);
  if (Q.has('nofilm')) startRace({ mode: 'rolling', laps: 1 }); else playFilm();
}
function playFilm() {
  sound.stopFilm(); toStudio();
  input.enabled = false; G.paused = false;
  G.state = 'film'; hud.screen('cine'); intro.start();
}
function startRace(o = {}) {
  const laps = o.laps || S.laps, mode = o.mode || 'grid', tm = performance.now();
  G.lastRace = { mode: 'grid' };
  toTrack(); mark('toTrack', tm);
  race.start({ laps, mode, s0: START_S, skill: S.skill });
  P.auto = null; G.ctrl = mode === 'rolling' ? 0 : 1; G.top = 0; G.hits = 0; G.finishCam = 0; G.acc = 0; G.hintT = 9;
  P.settle(0); R.settle(0);
  cars.player.sync(P, ATMO.sunDir, 0); cars.rival.sync(R, ATMO.sunDir, 0);
  chase.snap(); chase.update(0.016, cars.player, P); mark('placed', tm);
  input.enabled = true; input.autoThrottle = S.autoThrottle;
  lineMesh.visible = S.line;
  G.state = 'race'; G.paused = false; hud.screen('race'); hud.lights(race.lights); hud.hint(true);
  if (o.fromFilm) sound.raceLevel(); else sound.startLoop();
  if (mode === 'rolling') { gfx.fx.flash = 1.0; hud.toast('One lap · beat Voss to the flag', 'Your race', 3.2); }
  gov.reset(); mark('started', tm);
}
function setPaused(p) {
  if (G.state !== 'race') return;
  G.paused = p; hud.screen(p ? 'pause' : 'race'); input.enabled = !p;
  if (p) sound.pause(); else sound.resume();
}
function toMenu() {
  if (G.state === 'film') return;
  toTrack();
  if (race.state === 'idle' || race.state === 'lights') race.start({ mode: 'rolling', laps: 1, s0: START_S, skill: S.skill });
  race.state = 'green'; race.laps = 1e9; race.result = null; P.done = R.done = false;
  P.auto = autopilot(0.6); R.skill = { pace: 0.6, ease: 0.02, push: 0.02 }; R.pace = 0.6;
  input.enabled = false; lineMesh.visible = false;
  G.state = 'menu'; hud.screen('menu'); G.orbit = 0;
  sound.startLoop();
}
function finish() {
  const r = race.result, best = P.laps.length ? Math.min(...P.laps) : 0;
  const gap = r.gap || 0;
  hud.result({
    won: r.won,
    line: r.won ? `You beat Voss by ${gap.toFixed(2)} s.` : (P.done ? `Voss took it by ${gap.toFixed(2)} s.` : 'Voss reached the flag first.'),
    stats: [['Race time', P.done ? fmtLap(P.finishT) : '—'], ['Best lap', race.mode === 'grid' && best ? fmtLap(best) : '—'], ['Top speed', Math.round(G.top * 3.6) + ' km/h'], ['Contacts', String(G.hits)]],
  });
  G.state = 'result'; hud.screen('result'); input.enabled = false; lineMesh.visible = false;
}

/* ------------------------------------------------------------------ frame */
const H = 1 / 120;
function simulate(dt) {
  input.poll(dt, P.speed);
  // after the film the car drives itself for a moment, then hands over
  if (G.ctrl < 1 && G.state === 'race') { G.ctrl = Math.min(1, G.ctrl + dt / 1.1); P.auto = G.ctrl < 1 ? autopilot(0.97) : null; }
  G.acc += dt; let n = 0;
  while (G.acc >= H && n < 8) {
    G.acc -= H; n++;
    const racing = G.state === 'race' && race.state === 'green';
    if (race.state === 'green' || race.state === 'done') { P.step(H, racing && !P.done ? input : IDLE, G.state === 'race' ? S.assist : 0, R); }
    R.step(H, P, race);
    if (race.state === 'green' || race.state === 'done') { const h = touch(P, R, H); if (h > 0.15) { G.hits++; sound.sfx('hit', h); } }
    race.update(H);
  }
  if (n === 8) G.acc = 0;
  P.settle(dt); R.settle(dt);
  G.top = Math.max(G.top, P.speed);
  for (const e of race.events) onRaceEvent(e);
  race.events.length = 0;
  if (G.state === 'race' && race.state === 'green' && !P.done) {
    if (P.impact > 0.5 && !G.wasHit) sound.sfx('wall', P.impact);
    G.wasHit = P.impact > 0.5;
    if (P.offT > 2.2 || P.wrongT > 4.5) { P.reset(); chase.snap(); hud.toast('', 'Back on track', 1.2); }
    else if (P.wrongT > 1 && G.time - G.lastWrong > 2.5) { hud.toast('', 'Wrong way', 1.5); G.lastWrong = G.time; }
    else if (P.stuckT > 2 && G.time - G.lastWrong > 4) { hud.toast(input.touch ? 'Hold the brake to reverse' : 'Hold brake to reverse · R to reset', 'Stuck?', 2.5); G.lastWrong = G.time; }
  }
}
const IDLE = { steer: 0, throttle: 0, brake: 0, boost: false };
function onRaceEvent(e) {
  if (G.state !== 'race') return;
  if (e === 'light') { hud.lights(race.lights); sound.sfx('beep'); }
  else if (e === 'go') { hud.lights(0); setTimeout(() => hud.lights(-1), 700); sound.sfx('go'); hud.toast('', 'Go', 1.0); }
  else if (e === 'final') hud.toast('', 'Final lap', 2);
  else if (e === 'lap') hud.toast('Lap ' + fmtLap(P.laps[P.laps.length - 1]), 'Lap ' + (P.lap + 1), 2);
  else if (e === 'win') { hud.toast('Chequered flag', 'You win', 3.5); sound.sfx('win'); P.auto = autopilot(0.7); G.finishCam = 0.001; }
  else if (e === 'lose') { hud.toast('Voss takes the flag', 'Second', 3.5); sound.sfx('lose'); }
  else if (e === 'finish') { P.auto = autopilot(0.7); G.finishCam = 0.001; }
  else if (e === 'done') { P.auto = autopilot(0.6); finish(); }
}

const _o = new THREE.Vector3();
function frameRace(dt, warm = false) {
  if (!G.paused && !warm) simulate(dt);
  const pv = cars.player, rv = cars.rival, sun = ATMO.sunDir;
  pv.sync(P, sun, dt); rv.sync(R, sun, dt);
  const orbiting = G.state === 'menu' || G.state === 'result' || G.finishCam > 0;
  if (orbiting && !warm) {
    // slow orbit round the player's car behind the menus and after the flag
    if (!G.paused) G.orbit += dt * 0.16;
    if (G.finishCam > 0) G.finishCam += dt;
    const rad = 8.5, a = G.orbit + P.psi + 2.4;
    _o.set(P.x + Math.cos(a) * rad, 0, P.z + Math.sin(a) * rad); _o.y = Math.max(P.y + 1.7, surfaceAt(_o.x, _o.z) + 0.9);
    camera.position.lerp(_o, G.orbit < 0.02 ? 1 : 1 - Math.exp(-6 * dt));
    camera.up.set(0, 1, 0); camera.lookAt(P.x, P.y + 0.7, P.z);
    if (camera.fov !== 40) { camera.fov = 40; camera.near = 0.3; camera.updateProjectionMatrix(); chase.fov = 0; }
  } else if (!G.paused || warm) chase.update(dt, pv, P);
  camera.updateMatrixWorld();
  if (pv.dash && chase.mode === 2) pv.drawDash(P.gear, Math.abs(P.u) * 3.6, (P.rpm - 6200) / 6100, P.energy);
  lineMesh.material.uniforms.uS.value = P.s;
  terrain.update(camera, q.lod);
  if (trees) trees.update(camera, G.paused ? 0 : dt);
  if (props && props.update) props.update(camera, dt);
  shadows.update(camera, pv.pos);
  const v = P.speed;
  gfx.fx.blur = orbiting ? 0 : (chase.mode <= 1 ? 1 : 0.6) * (0.006 + 0.046 * (v / 95) ** 2 + 0.03 * P.boost);
  gfx.fx.flash = Math.max(0, gfx.fx.flash - dt * 2.6);
  gfx.fx.chroma = 0.0025 * P.boost + 0.01 * P.impact;
  renderer.info.reset();
  if (gfx.bloom && gfx.noBloom) gfx.look.bloom = [0, 0, 9];
  gfx.renderScene(scene, camera);
  gfx.present(dt);
  if (G.state === 'race') {
    hud.race(G.paused ? 0 : dt, P, R, race, { assist: S.assist === 2 ? 'Full help' : '', playerColor: PAINTS[S.paint].a, rivalColor: S.paint === 6 ? '#e23a3a' : '#111' });
    if (G.hintT > 0) { G.hintT -= dt; if (G.hintT <= 0) hud.hint(false); }
  }
  if (!warm) sound.update(dt, P, R, camera, G);
}

function frame(dt) {
  if (DEV) { const t = performance.now(), st = G.state; frameBody(dt); const d = performance.now() - t; if (d > 50) console.log('[hitch] ' + Math.round(d) + ' ms ' + st + ' -> ' + G.state + ' ' + (G.marks || '')); G.marks = ''; return; }
  frameBody(dt);
}
const mark = (name, t) => { if (DEV) G.marks = (G.marks || '') + name + ':' + Math.round(performance.now() - t) + ' '; };
function frameBody(dt) {
  G.time += dt;
  if (G.state === 'film') {
    renderer.info.reset();
    if (intro.update(dt)) { /* the film ends by calling onCut */ }
  } else if (G.state === 'title' || G.state === 'starting') {
    // the car turning slowly in the studio behind the title
    const cam = studio.camera, a = G.time * 0.11 + 0.6, fit = Math.max(1, 1.9 / cam.aspect);
    cam.fov = 27; cam.updateProjectionMatrix();
    cam.position.set(Math.cos(a) * 7.6 * fit, 1.35 + 0.25 * Math.sin(G.time * 0.07), Math.sin(a) * 7.6 * fit); cam.up.set(0, 1, 0); cam.lookAt(0.2, 0.42, 0);
    studio.floorU.uTime.value = G.time;
    renderer.info.reset();
    studio.render(gfx.rt, cam);
    gfx.fx.flash = Math.max(0, gfx.fx.flash - dt * 2); gfx.fx.fade = 0;
    gfx.present(dt);
  } else if (G.state !== 'boot') frameRace(dt);
}

/* ------------------------------------------------------------------ test hooks */
// run frames by hand (the embedded browser pane does not always fire requestAnimationFrame)
function step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); return { state: G.state, s: P && Math.round(P.s), v: P && Math.round(P.speed * 3.6), calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; }
async function shot(name, w = 1600, h = 900, frames = 2) {
  const cw = gfx.cssW, ch = gfx.cssH, cap = gfx.dprCap, mp = q.maxPixels;
  gfx.dprCap = 1; q.maxPixels = 1e9; gfx.setSize(w, h, 1);
  camera.aspect = w / h; camera.updateProjectionMatrix(); if (studio) studio.setSize(gfx.w, gfx.h);
  for (let i = 0; i < frames; i++) frame(0.0001);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  const res = await fetch('/__shot/' + name + '.jpg', { method: 'POST', body: blob }).then((r) => r.json()).catch((e) => ({ ok: false, e: String(e) }));
  gfx.dprCap = cap; q.maxPixels = mp; gfx.setSize(cw, ch, gov ? gov.scale : 1); resize();
  return { ...res, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, w: gfx.w, h: gfx.h };
}

// drive the player's car by autopilot with no rendering (checks the physics and the rival against each other)
function simTest(pace = 1, secs = 150, laps = 1, skill = 'pro', mode = 'rolling') {
  race.start({ mode, laps, s0: START_S, skill }); P.auto = autopilot(pace);
  let t = 0, off = 0, wall = 0; const offAt = [], gaps = [], wallAt = [];
  while (t < secs && race.state !== 'done') {
    if (race.state === 'green') P.step(H, IDLE, 0, R);
    R.step(H, P, race); if (race.state === 'green') touch(P, R, H); race.update(H); t += H;
    if (P.surface !== 1) { off += H; if (!offAt.length || Math.abs(offAt[offAt.length - 1] - P.s) > 60) offAt.push(Math.round(P.s)); }
    if (P.impact > 0.3) { wall++; if (!wallAt.length || Math.abs(wallAt[wallAt.length - 1] - P.s) > 60) wallAt.push(Math.round(P.s)); }
    if (Math.round(t / H) % 1200 === 0) gaps.push(+(P.prog - R.prog).toFixed(0));
  }
  race.events.length = 0;
  return { t: +t.toFixed(1), state: race.state, result: race.result && { won: race.result.won, gap: +(race.result.gap || 0).toFixed(2) }, pT: P.finishT && +P.finishT.toFixed(2), rT: R.finishT && +R.finishT.toFixed(2), off: +off.toFixed(1), offAt, wall, wallAt, gaps, top: Math.round(P.speed * 3.6) };
}
window.__simTest = simTest;
// film test: run the film on a hand-driven clock up to `beat` and capture a frame there
window.__filmAt = async (beat, name, w = 1280, h = 720, from = null) => {
  const au = await import('./audio.js'), mu = await import('./music.js');
  if (G.state !== 'film' || from !== null) { if (G.state === 'title') G.state = 'starting'; playFilm(); window.__fb = from ?? 0; }
  intro.clock = { beats: () => window.__fb, rate: () => 1, wall: () => au.wallAt(window.__fb * mu.BEAT) };
  const cw = gfx.cssW, ch = gfx.cssH, cap = gfx.dprCap, mp = q.maxPixels;
  gfx.dprCap = 1; q.maxPixels = 1e9; gfx.setSize(w, h, 1); studio.setSize(gfx.w, gfx.h);
  while (window.__fb < beat) { window.__fb = Math.min(beat, window.__fb + 0.04); intro.last = performance.now() / 1000 - 0.016; frame(0.016); }
  intro.last = performance.now() / 1000 - 0.016; frame(0.016);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  const res = name ? await fetch('/__shot/' + name + '.jpg', { method: 'POST', body: blob }).then((r) => r.json()) : null;
  gfx.dprCap = cap; q.maxPixels = mp; gfx.setSize(cw, ch, gov ? gov.scale : 1); resize();
  return { res, beat: window.__fb, state: G.state };
};

boot().catch((e) => { console.error(e); $('load-text').textContent = 'Failed: ' + e.message; });
