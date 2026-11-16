// main.js — boot, the game's states (title, film, race, pause, result, menu) and the frame loop.
import * as THREE from 'three';
import { Gfx, LOOKS } from './gfx.js';
import { Studio } from './studio.js';
import { ATMO, setSun, installAtmosphere, bakeSky, makeSky, makeEnvironment, SunShadows } from '../track/atmo.js';
import { cloudNoise3D } from '../track/tex.js';
import { W, LOAD, MESH, loadWorld, upgradeGround, frameAt, surfaceAt } from '../track/world.js';
import { buildTerrain, TERRAIN, groundUniforms } from '../track/terrain.js';
import { buildRoad } from '../track/road.js';
import { ROADS, loadRoads, prepRoads, buildRoadMeshes } from '../track/roads.js';
import { buildCars, loadHands, PAINTS } from './cars.js';
import { TRACK, buildTrack, Car, Rival, Race, touch, autopilot, lineAt, vpAt } from './sim.js';
import { Chase, CAM_MODES } from './chase.js';
import { Input } from './input.js';
import { Hud, loadSettings, fmtLap } from './hud.js';
import { Sound } from './audio.js';
import { Intro } from './intro.js';
import { Governor } from './perf.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
// let the page breathe between loading steps. A message, not a timer: browsers slow timers to one a second in a tab
// that is not in front, which made a background load take ten seconds longer.
const yieldNow = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
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
  rematch: () => startRace({ mode: 'grid' }), toMenu: () => toMenu(), duel: () => startRace({ mode: 'grid' }), film: () => playFilm(), roam: () => startRoam(),
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
/* The title needs only the car and the studio, so they come first and the title shows in a few seconds. The circuit
   downloads from the first moment and is built behind the title; Start waits for it (the button shows how far). */
async function boot() {
  hud = new Hud(S, handlers);
  hud.load('Building the car', 0.05);
  resize();
  LOAD.lo = q.lo;
  MESH.step = q.lo ? 2 : 1; TERRAIN.detail = q.lo ? 0.5 : 1;        // phones: a 4 m terrain mesh and half-size grain maps
  let netP = 0, titleUp; const gate = new Promise((r) => { titleUp = r; });
  // the title's own files first: the circuit's 11 MB starts only once the car's two hand meshes are in, or they queue behind it
  const first = loadHands();
  const worldP = first.then(() => loadWorld((p) => { netP = p; if (!G.trackReady) hud.startProgress(0.7 * p); }, gate));
  const hiP = q.lo ? null : worldP.then(() => upgradeGround());
  const roadsP = first.then(() => loadRoads());

  await yieldNow();
  cars = await buildCars(renderer, q);
  cars.player.setPaint(S.paint); cars.rival.setPaint(rivalPaint());
  hud.load('Lighting the studio', 0.7); await yieldNow();
  studio = new Studio(renderer, q.studio);
  studio.setSize(gfx.w, gfx.h);
  toStudio();
  while (studio.bakeN < q.studio.bake) { studio.bakeStep(8); hud.load('Lighting the studio', 0.7 + 0.28 * studio.bakeN / q.studio.bake); await yieldNow(); }

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
  // Phones: after a rotation Safari reports the old size for a moment and can leave the page scrolled or pinch-zoomed,
  // so measure again a few times, put the page back at the top, and refuse the pinch gesture altogether.
  const settle = () => { window.scrollTo(0, 0); resize(); for (const ms of [120, 350, 800]) setTimeout(resize, ms); };
  addEventListener('orientationchange', settle); addEventListener('resize', settle);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', settle);
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  // leaving the tab, or turning a phone upright, stops the clock
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.state === 'race') setPaused(true); else sound.pause(); } else if (!G.paused) sound.resume(); });
  const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
  portrait.addEventListener('change', () => { if (portrait.matches && G.state === 'race') setPaused(true); });
  hud.load('Ready', 1);
  hud.fineText = input.touch ? 'Turn the sound on' : 'Sound on · press Enter';
  G.state = 'title'; hud.screen('title'); hud.startProgress(0.7 * netP);
  G.bootT = Math.round(performance.now());
  let last = performance.now();
  const loop = (now) => { const dt = (now - last) / 1000; last = now; if (G.trackReady) gov.sample(dt); frame(Math.min(0.05, Math.max(0.001, dt))); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);

  // ---- the circuit, behind the title
  await new Promise((r) => { requestAnimationFrame(() => yieldNow().then(r)); setTimeout(r, 120); });      // let the title paint first
  titleUp();
  sound.prepare();
  await worldP;
  const step = async (p) => { hud.startProgress(0.7 + 0.3 * p); (window.__bootT ||= []).push(['circuit ' + p, Math.round(performance.now())]); await yieldNow(); };
  await step(0);
  setSun(112, 39); installAtmosphere();
  scene.fog = new THREE.FogExp2(0xffffff, ATMO.haze);
  const skyTex = await bakeSky(renderer, cloudNoise3D(64), q.sky);
  sky = makeSky(skyTex); scene.add(sky);
  scene.environment = makeEnvironment(renderer, sky);
  shadows = new SunShadows(scene, q.shadow); shadows.maxPerFrame = 1;
  await step(0.1);
  TERRAIN.farStep = MESH.farStep = q.farStep || 1;
  await roadsP; prepRoads();                // free roam's roads: fitted to the ground before the terrain and trees are built
  terrain = buildTerrain(scene);
  await step(0.35);
  road = buildRoad(scene);
  buildRoadMeshes(scene);
  await step(0.45);
  trees = (await import('../track/trees.js')).buildTrees(scene, renderer, q);
  await step(0.6);
  props = (await import('../track/props.js')).buildProps(scene, q);
  trackside = (await import('../track/trackside.js')).buildTrackside(scene, q);
  await step(0.7);
  buildTrack();
  lineMesh = buildLine(); scene.add(lineMesh);
  console.log(`[phantom] tier ${tierName}, car ${cars.tris.toLocaleString()} triangles in ${cars.meshes} meshes, ${cars.ms} ms, lap at the limit ${TRACK.lapTime.toFixed(1)} s, ${TRACK.walls} wall segments`);
  P = new Car(); R = new Rival(); race = new Race(P, R); chase = new Chase(camera);
  scene.add(cars.rival.root, cars.rival.shadow, cars.player.shadow);
  hud.initMap(ROADS.pieces); hud.rivalName('Voss');
  await step(0.8);
  // warm the circuit: compile every program and draw the first shadow maps now, not at the cut from the film
  const back = G.state; G.state = 'warming';
  toTrack(); race.start({ mode: 'rolling', laps: 1, s0: START_S, skill: S.skill });
  P.settle(0); R.settle(0); cars.player.sync(P, ATMO.sunDir, 0); cars.rival.sync(R, ATMO.sunDir, 0); chase.snap(); chase.update(0.016, cars.player, P);
  // compile the circuit's shaders without blocking the page where the browser can (parallel shader compile)
  // (raced against a timer: if a program never reports ready the wait must not hang the load)
  try { await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 5000))]); } catch (e) { /* the first frame compiles them */ }
  for (let i = 0; i < 5; i++) { frameRace(1 / 60, true); await step(0.8 + 0.04 * i); }
  G.startPose = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, focus: cars.player.pos.clone() };
  toStudio(); G.state = back;
  releaseStatic();
  G.trackReady = true; G.readyT = Math.round(performance.now());
  hud.startProgress(1);
  window.__game = { THREE, G, gfx, scene, camera, studio, cars, P, R, race, chase, input, hud, sound, intro, gov, q, S, W, TRACK, tierName, frame, startRace, startRoam, toMenu, playFilm, begin, setPaused, shot, step: stepFrames, START_S, ROADS };
  if (Q.has('race')) { await sound.init(); startRace({ mode: Q.get('race') === 'grid' ? 'grid' : 'rolling' }); }
  else if (G.wantStart) { G.wantStart = false; begin(); }
  // full-size ground photos (desktops): swapped in at a calm moment, see frameBody
  if (hiP) hiP.then((swap) => { G.groundSwap = swap; });
}
/* Everything on the circuit that never changes (terrain, roads, barriers, buildings) keeps a second copy of its
   geometry in ordinary memory after the graphics card has its own. That copy is about 100 MB, which a phone cannot
   spare, so each buffer lets go of it the moment it has been uploaded. */
function releaseStatic() {
  const drop = function () { this.array = null; };
  const skip = new Set([cars.player.root, cars.rival.root, cars.player.shadow, cars.rival.shadow]);
  const walk = (o) => {
    if (skip.has(o)) return;
    if (o.isMesh && !o.isInstancedMesh && o.geometry) {
      const g = o.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      for (const a of Object.values(g.attributes)) if (a.isBufferAttribute && !a.isInstancedBufferAttribute && a.usage === THREE.StaticDrawUsage) a.onUpload(drop);
      if (g.index) g.index.onUpload(drop);
    }
    for (const c of o.children) walk(c);
  };
  walk(scene);
}
// swap the full-size ground photos in where a frame or two of upload cannot be seen
function calmSwap() {
  if (!G.groundSwap) return;
  const calm = G.state === 'title' || G.state === 'menu' || G.state === 'result' || (G.state === 'race' && G.paused);
  if (calm) { G.groundSwap(groundUniforms); G.groundSwap = null; }
}
const START_S = 1350;                                     // the film cuts to the Kemmel straight at 290 km/h: ten seconds of slipstream before Les Combes

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
  gfx.setLook(LOOKS.studio); gfx.fx.blur = 0; if (lineMesh) lineMesh.visible = false;
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
  if (G.groundSwap) { G.groundSwap(groundUniforms); G.groundSwap = null; }     // the film calls this on black beats and flashes: a good moment for the upload
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
  if (!G.trackReady) { G.wantStart = true; hud.startProgress(null); return; }      // starts by itself when the circuit is built
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
  if (o.mode === 'roam') return startRoam();
  const laps = o.laps || S.laps, mode = o.mode || 'grid', tm = performance.now();
  G.lastRace = { mode: 'grid' }; setRoam(false);
  toTrack(); mark('toTrack', tm);
  race.start({ laps, mode, s0: START_S, skill: S.skill });
  P.auto = null; G.ctrl = mode === 'rolling' ? 0 : 1; G.top = 0; G.hits = 0; G.finishCam = 0; G.acc = 0; G.hintT = 9; G.leading = null; G.passes = 0; G.inTow = false;
  P.settle(0); R.settle(0);
  cars.player.sync(P, ATMO.sunDir, 0); cars.rival.sync(R, ATMO.sunDir, 0);
  chase.snap(); chase.update(0.016, cars.player, P); mark('placed', tm);
  input.enabled = true; input.autoThrottle = S.autoThrottle;
  lineMesh.visible = S.line;
  G.state = 'race'; G.paused = false; hud.screen('race'); hud.lights(race.lights); hud.hint(true);
  if (o.fromFilm) sound.raceLevel(); else sound.startLoop();
  if (mode === 'rolling') { gfx.fx.flash = 1.0; hud.toast('Tuck in behind Voss, then pull out and pass', 'Your race', 3.6); }
  gov.reset(); mark('started', tm);
}
// free roam: no rival, no laps, the whole place to drive in
function setRoam(on) {
  G.roam = on; P.roam = on; document.body.classList.toggle('roam', on);
  cars.rival.root.visible = !on; if (on) cars.rival.shadow.visible = false;
}
function roamSpawn() {
  // a main road close to La Source, well clear of the circuit: the longest piece of the biggest road class there is
  let best = null, score = -1;
  for (const p of ROADS.pieces) { const sc = p.rank * 1000 + p.n; if (sc > score) { score = sc; best = p; } }
  if (!best) return null;
  const i = Math.min(best.n - 2, Math.max(4, Math.round(best.n * 0.12)));
  const rx = -best.tz[i], rz = best.tx[i], off = best.hw * 0.42;
  return { x: best.x[i] + rx * off, z: best.z[i] + rz * off, psi: Math.atan2(best.tz[i], best.tx[i]), name: best.name };
}
function startRoam() {
  const sp = roamSpawn();
  toTrack();
  race.start({ laps: 1, mode: 'rolling', s0: START_S, skill: S.skill }); race.laps = 1e9; race.events.length = 0;
  setRoam(true); G.lastRace = { mode: 'roam' };
  P.auto = null; G.ctrl = 1; G.top = 0; G.hits = 0; G.finishCam = 0; G.acc = 0; G.hintT = 9; G.leading = null;
  if (sp) P.placeAt(sp.x, sp.z, sp.psi, 0); else P.place(START_S, 0, 0);
  P.settle(0); cars.player.sync(P, ATMO.sunDir, 0);
  chase.snap(); chase.update(0.016, cars.player, P);
  input.enabled = true; input.autoThrottle = false;          // free roam: the throttle is yours, on every device
  lineMesh.visible = false;
  G.state = 'race'; G.paused = false; hud.screen('race'); hud.lights(-1); hud.hint(true); hud.refresh(true);
  sound.startLoop();
  hud.toast(sp && sp.name ? sp.name : 'The roads round the circuit', 'Free roam', 3.6);
  gov.reset();
}
function setPaused(p) {
  if (G.state !== 'race') return;
  G.paused = p; hud.screen(p ? 'pause' : 'race'); input.enabled = !p;
  if (p) sound.pause(); else sound.resume();
}
function toMenu() {
  if (G.state === 'film') return;
  toTrack();
  if (G.roam) { setRoam(false); race.start({ mode: 'rolling', laps: 1, s0: START_S, skill: S.skill }); hud.refresh(); }
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
    stats: [['Race time', P.done ? fmtLap(P.finishT) : '—'], ['Best lap', race.mode === 'grid' && best ? fmtLap(best) : '—'], ['Top speed', Math.round(G.top * 3.6) + ' km/h'], ['Overtakes', String(G.passes || 0)]],
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
    if (race.state === 'green' || race.state === 'done') { P.step(H, racing && !P.done ? input : IDLE, G.state === 'race' ? S.assist : 0, G.roam ? null : R); }
    if (G.roam) continue;
    R.step(H, P, race);
    if (race.state === 'green' || race.state === 'done') { const h = touch(P, R, H); if (h > 0.15) { G.hits++; sound.sfx('hit', h); } }
    race.update(H);
  }
  if (n === 8) G.acc = 0;
  P.settle(dt); R.settle(dt);
  G.top = Math.max(G.top, P.speed);
  // the lead changing hands, and the tow catching: say so (2 m of hysteresis so a side-by-side fight does not chatter)
  if (G.state === 'race' && race.state === 'green' && !P.done && !R.done && !G.roam) {
    const lead = P.prog - R.prog, was = G.leading;
    if (was === undefined || was === null) G.leading = lead >= 0;
    else if (!was && lead > 2) { G.leading = true; G.passes = (G.passes || 0) + 1; hud.toast('You lead', 'Overtake', 1.6); sound.sfx('pass'); gfx.fx.flash = Math.max(gfx.fx.flash, 0.25); }
    else if (was && lead < -2) { G.leading = false; hud.toast('Take it back', 'Voss is through', 1.6); sound.sfx('passed'); }
    const tow = P.draft > 0.3; if (tow && !G.inTow) sound.sfx('tow'); G.inTow = tow;
  }
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
  pv.sync(P, sun, dt); if (!G.roam) rv.sync(R, sun, dt);
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
  if (!warm) gfx.present(dt);
  if (G.state === 'race') {
    hud.race(G.paused ? 0 : dt, P, R, race, { assist: S.assist === 2 ? 'Full help' : '', playerColor: PAINTS[S.paint].a, rivalColor: S.paint === 6 ? '#e23a3a' : '#111', roam: G.roam, label: G.roam && P.road ? (P.road.name || 'Service road') : undefined });
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
  // the picture must match the page: checked every frame, because after a phone is rotated the browser's own resize
  // events can arrive early (with the old size) or not at all
  if (stage.clientWidth !== gfx.cssW || stage.clientHeight !== gfx.cssH) resize();
  calmSwap();
  if (G.state === 'warming') return;           // the circuit is drawing its first frames off screen; the title holds
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
function stepFrames(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); return { state: G.state, s: P && Math.round(P.s), v: P && Math.round(P.speed * 3.6), calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; }
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
// A keyboard player, for tuning: it sees a point ahead on the racing line (or beside the rival when close behind it),
// presses left / right `delay` seconds later, holds the throttle and leaves the braking to the help. No rendering.
// It is a clumsy driver on purpose: if it can lap cleanly and the result is close, a person can too.
//   __keyTest({ assist: 1, skill: 'pro', mode: 'rolling' | 'grid', laps: 1, style: 'racer' | 'line' | 'none', delay: 0.16, deadM: 0.7 })
window.__keyTest = (o = {}) => {
  const { assist = 1, skill = 'pro', secs = 300, delay = 0.16, look = 0.55, deadM = 0.7, mode = 'rolling', brakes = assist === 0, laps = 1, style = 'racer' } = o;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), shape = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
  race.start({ mode, laps, s0: START_S, skill }); P.auto = null;
  let t = 0, k = 0, key = 0, off = 0, bumps = 0, lead = 0, close = 0, passes = 0, was = null, resets = 0, tG = 0;
  const q = [], f2 = {}, gaps = [], inp = { steer: 0, throttle: 1, brake: 0, boost: false };
  while (t < secs && race.state !== 'done') {
    const v = Math.abs(P.u), la = clamp(v * look, 9, 60); frameAt(P.s + la, f2);
    let want = 0;
    if (style !== 'none') {
      let ln = lineAt(P.s + la); const gp = R.prog - P.prog, i = Math.floor(P.s / TRACK.ds) % TRACK.N;
      if (style === 'racer' && gp > 0 && gp < 34 && Math.abs(R.d - P.d) < 3.2) ln = clamp(R.d + (TRACK.dMax[i] - R.d > R.d - TRACK.dMin[i] ? 2.9 : -2.9), TRACK.dMin[i] + 0.4, TRACK.dMax[i] - 0.4);
      const e = la * Math.sin(wrap(Math.atan2(f2.z + f2.rz * ln - P.z, f2.x + f2.rx * ln - P.x) - P.psi)); want = e > deadM ? 1 : e < -deadM ? -1 : 0;
    }
    q.push([t + delay, want, brakes && v > vpAt(P.s + v * 0.9) * 1.02 ? 1 : 0]);
    let brk = inp.brake; while (q.length && q[0][0] <= t) { key = q[0][1]; brk = q[0][2]; q.shift(); }
    const rate = key === 0 ? 8 : (Math.sign(key) !== Math.sign(k) && k !== 0 ? 7 : 3.225);       // as input.js
    k += clamp(key - k, -rate * H, rate * H);
    inp.steer = shape(k, 1.32); inp.brake = brk; inp.throttle = brk ? 0 : 1; inp.boost = P.energy > 0.3 && v > 50 && Math.abs(k) < 0.2;
    if (race.state === 'green') P.step(H, inp, assist, R);
    R.step(H, P, race); if (race.state === 'green' && touch(P, R, H) > 0.15) bumps++; race.update(H); t += H;
    if (race.state !== 'green') continue;
    tG += H; if (P.surface !== 1) off += H;
    if (P.offT > 2.2 || P.wrongT > 4.5) { P.reset(); resets++; }
    const ahead = P.prog > R.prog; if (was !== null && ahead !== was) passes++; was = ahead; if (ahead) lead += H;
    if (Math.abs(P.prog - R.prog) < 40) close += H;
    if (Math.round(t / H) % 1200 === 0) gaps.push(Math.round(P.prog - R.prog));
  }
  race.events.length = 0;
  return { won: race.result && race.result.won, gap: race.result && +(race.result.gap || 0).toFixed(2), pT: +(P.finishT || 0).toFixed(1), rT: +(R.finishT || 0).toFixed(1), offS: +off.toFixed(1), bumps, resets, leadPct: Math.round(100 * lead / Math.max(tG, 1)), closePct: Math.round(100 * close / Math.max(tG, 1)), passes, gaps: gaps.join(' ') };
};
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

// if anything stops the load, say so on screen (a phone has no console to look in)
const fail = (msg) => { const t = 'Could not load: ' + msg; $('load-text').textContent = t; const f = $('title-fine'); if (f) f.textContent = t; if (hud) hud.fineText = t; };
addEventListener('error', (e) => { if (!G.trackReady) fail(e.message || 'script error'); });
addEventListener('unhandledrejection', (e) => { if (!G.trackReady) fail((e.reason && e.reason.message) || String(e.reason)); });
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.trackReady = false; fail('the graphics memory ran out. Close other tabs and reload.'); });
boot().catch((e) => { console.error(e); fail(e.message); });
