import * as THREE from 'three';
import { installOpticsChunks, U, setSun, setWater } from './optics.js';
installOpticsChunks();                       // must happen before any material compiles
import { Caustics, OceanSurface, PlanarReflection, makeBackground } from './water.js';
import { bakeWorld, Terrain } from './terrain.js';
import { Post } from './post.js';
import { Scatter } from './scatter.js';
import { buildLife } from './life.js';
import { buildDeepLife } from './lifedeep.js';
import { Schools } from './fauna/fish.js';
import { Particles } from './particles.js';
import { VentField, VENT } from './vents.js';
import { initUI } from './ui.js';
import { suiteViews } from './suite.js';
import { Heroes } from './fauna/heroes.js';
import { Jellies } from './fauna/jelly.js';
import { WORLD } from './worldgen.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = { dt: 0.016, time: 0, running: true, exposureAuto: true, exposure: 1, lamp: false, photo: false, fps: 0, renderScale: 1, autoScale: true, gpuMs: 0 };

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false, depth: false, stencil: false });
renderer.setClearColor(0x000000, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.autoClear = false;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 1, 100);            // flag only: optics chunks do the real fog
const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.08, 6000);
camera.position.set(-30, -2.6, 10);
camera.rotation.order = 'YXZ';

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
const sun = new THREE.DirectionalLight(0xfff2dc, Math.PI);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.01;
const SH = 42;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 420 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(new THREE.Color(0.40, 0.58, 0.95), new THREE.Color(0.17, 0.27, 0.30), 1.0);
scene.add(hemi);
const LAMP_I = 90;                                              // candela-ish: lit floor at ~4 m = mid-grey at exposure 1.0
const lamp = new THREE.SpotLight(0xf2f8ff, 0, 80, 1.0, 0.9, 2);
scene.add(lamp, lamp.target);
const strobe = new THREE.SpotLight(0xfff1de, 0, 45, 1.25, 1.0, 1.4);     // wide, soft camera strobe (close-range colour)
scene.add(strobe, strobe.target);

setSun(62, 40);
setWater('tropical');

// ---------------------------------------------------------------------------
// Systems (created after the world is baked)
// ---------------------------------------------------------------------------
let game = null;
let world = null, terrain = null, surface = null, caustics = null, post = null, refl = null, bg = null, scatter = null, schools = null, particles = null, heroes = null, jellies = null, vents = null, ui = null;
window.__BOOT__ = [];
const setLoad = (p, msg) => { window.__BOOT__.push([+(performance.now() / 1000).toFixed(2), msg || '']); $('l-bar').style.width = (p * 100).toFixed(0) + '%'; if (msg) $('l-msg').textContent = msg; };

function sizeToWindow() {
  const dpr = Math.min(window.devicePixelRatio || 1, state.dprScale ?? 1.25, parseFloat(params.get('dpr') || '9')) * (state.renderScale ?? 1);
  const w = Math.max(2, Math.floor(window.innerWidth * dpr)), h = Math.max(2, Math.floor(window.innerHeight * dpr));
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (post) post.setSize(w, h);
  if (refl) refl.resize(w, h);
}

// ---------------------------------------------------------------------------
// Camera controls
// ---------------------------------------------------------------------------
const ctl = { yaw: -Math.PI / 2 + 0.2, pitch: -0.12, vel: new THREE.Vector3(), keys: new Set(), drag: false, lx: 0, ly: 0, boost: false };
function applyLook() { camera.rotation.set(ctl.pitch, ctl.yaw, 0); }
applyLook();
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => { if (game && game.active) return; ctl.drag = true; ctl.lx = e.clientX; ctl.ly = e.clientY; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointerup', (e) => { ctl.drag = false; });
cv.addEventListener('pointermove', (e) => {
  if (!ctl.drag || (game && game.active)) return;
  ctl.yaw -= (e.clientX - ctl.lx) * 0.0032; ctl.pitch -= (e.clientY - ctl.ly) * 0.0032;
  ctl.pitch = Math.max(-1.55, Math.min(1.55, ctl.pitch));
  ctl.lx = e.clientX; ctl.ly = e.clientY; applyLook();
});
window.addEventListener('keydown', (e) => {
  if (game && game.active) { if (e.code === 'KeyP') { state.photo = !state.photo; document.body.classList.toggle('photo', state.photo); } return; }
  ctl.keys.add(e.code);
  if (e.code === 'KeyL') { state.lamp = !state.lamp; }
  if (e.code === 'KeyP') { state.photo = !state.photo; document.body.classList.toggle('photo', state.photo); }
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (SITES[n - 1]) goto(SITES[n - 1]); }
});
window.addEventListener('keyup', (e) => ctl.keys.delete(e.code));

const SITES = [
  { name: 'Lagoon', x: -300, d: 2.4, z: -105, yaw: -1.81, pitch: -0.11 },
  { name: 'Reef crest', x: 140, d: 1.3, z: 30, yaw: -1.2, pitch: -0.10 },
  { name: 'Fore-reef', x: 230, d: 4.6, z: 0, yaw: -1.57, pitch: -0.15 },
  { name: 'The wall', x: 362, d: 30, z: 0, yaw: 1.35, pitch: -0.25 },
  { name: 'Twilight slope', x: 700, d: 3.5, z: 0, yaw: -1.57, pitch: -0.42, floorRel: true, lamp: true },
  { name: 'Abyss', x: 6500, d: 3, z: 0, yaw: -1.57, pitch: -0.45, floorRel: true, lamp: true },
  { name: 'Vent field', x: 6150, d: 4, z: 236, yaw: -1.57, pitch: -0.25, floorRel: true, lamp: true },
];
function goto(s) {
  camera.position.x = s.x; camera.position.z = s.z;
  camera.position.y = s.floorRel ? world.height(s.x, s.z) + s.d : -s.d;
  ctl.yaw = s.yaw; ctl.pitch = s.pitch; applyLook();
  state.lamp = !!s.lamp; { const cb = document.getElementById('c-lamp'); if (cb) cb.checked = state.lamp; }
}

function moveCamera(dt) {
  const k = ctl.keys, sp = (k.has('ShiftLeft') || k.has('ShiftRight') ? 14 : 3.2) * (camera.position.y < -300 ? 2 : 1);
  const f = new THREE.Vector3(), r = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  camera.getWorldDirection(f); r.crossVectors(f, up).normalize();
  const acc = new THREE.Vector3();
  if (k.has('KeyW')) acc.add(f); if (k.has('KeyS')) acc.sub(f);
  if (k.has('KeyD')) acc.add(r); if (k.has('KeyA')) acc.sub(r);
  if (k.has('KeyE') || k.has('Space')) acc.y += 1; if (k.has('KeyQ') || k.has('KeyC')) acc.y -= 1;
  if (acc.lengthSq() > 0) acc.normalize().multiplyScalar(sp);
  ctl.vel.lerp(acc, 1 - Math.exp(-dt * 4.5));
  camera.position.addScaledVector(ctl.vel, dt);
  clampCamera();
}
function clampCamera() {
  if (!world) return;
  const p = camera.position;
  p.x = Math.min(Math.max(p.x, WORLD.x0 + 50), WORLD.x0 + WORLD.sx - 50);
  p.z = Math.min(Math.max(p.z, WORLD.z0 + 50), WORLD.z0 + WORLD.sz - 50);
  const floor = world.height(p.x, p.z) + 0.55;
  if (p.y < floor) p.y = floor;
  if (p.y > 80) p.y = 80;
}

// ---------------------------------------------------------------------------
// Per-frame update (shared by the interactive loop and the snapshot tool)
// ---------------------------------------------------------------------------
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function autoExposure() {
  const depth = Math.max(-camera.position.y, 0);
  return 1.0 * Math.exp(0.030 * Math.min(depth, 220)) * (depth > 220 ? Math.exp(0.012 * Math.min(depth - 220, 600)) : 1);
}
function updateShadowFrustum() {
  // focus point ahead of the camera, snapped to shadow-texel steps. The game shrinks the covered area for small fish (state.shadowR): a
  // 10 cm fry needs ~5 mm texels for a readable contact shadow, a shark does not
  const R = state.shadowR || SH, texel = (2 * R) / sun.shadow.mapSize.x, sc = sun.shadow.camera;
  if (Math.abs(sc.right - R) > R * 0.01) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); sun.shadow.normalBias = Math.min(0.01, texel * 1.2); }
  const focus = camera.getWorldDirection(tmpV).multiplyScalar(R * 0.55).add(camera.position);
  focus.x = Math.round(focus.x / texel) * texel; focus.y = Math.round(focus.y / texel) * texel; focus.z = Math.round(focus.z / texel) * texel;
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(U.uSunDirA.value, 200);
  sun.target.updateMatrixWorld();
}
function updateLamp() {
  const depth = Math.max(-camera.position.y, 0);
  const on = state.lamp || depth > 150;
  lamp.intensity = on ? (state.lampI ?? LAMP_I) : 0;
  camera.getWorldDirection(tmpV);
  lamp.position.copy(camera.position).add(tmpV2.set(-0.45, 0.22, 0).applyQuaternion(camera.quaternion));
  lamp.target.position.copy(camera.position).addScaledVector(tmpV, 10);
  lamp.target.updateMatrixWorld();
  const lu = post.volume.material.uniforms;
  // strobe: follows the camera, slightly off-axis like an arm-mounted flash
  strobe.intensity = state.strobe || 0;
  strobe.position.copy(camera.position).add(tmpV2.set(0.28, 0.12, 0).applyQuaternion(camera.quaternion));
  strobe.target.position.copy(camera.position).addScaledVector(tmpV, 8);
  strobe.target.updateMatrixWorld();
  particles.uniforms.uLampOn.value = on ? lamp.intensity * 0.16 : (state.strobe ? state.strobe * 0.5 : 0);
  particles.uniforms.uLampPos.value.copy(lamp.position);
  particles.uniforms.uLampDir.value.copy(tmpV);
  particles.uniforms.uLampCone.value = on ? Math.cos(lamp.angle) : Math.cos(strobe.angle);
  lu.uLamp.value.x = on ? lamp.intensity * (state.lampBackscatter ?? 0.0035) : 0;
  post.params.lumFloor = depth > 100 ? Math.min(0.02, 2e-4 * Math.exp(0.02 * (depth - 100))) : 2e-4;
  lu.uLamp.value.y = Math.cos(lamp.angle);
  lu.uLampPos.value.copy(lamp.position);
  lu.uLampDir.value.copy(tmpV);
}

const REFL_KEEP = new Set(['staghorn', 'massive', 'table', 'foliose', 'stones', 'pocillo']);
function reflSkip(on, prev) {
  if (on) {
    const hidden = [];
    for (const sp of scatter.species) { if (REFL_KEEP.has(sp.id)) continue; for (const v of sp.meshes) for (const m of v) if (m.visible) { m.visible = false; hidden.push(m); } if (sp.decal && sp.decal.visible) { sp.decal.visible = false; hidden.push(sp.decal); } }
    for (const g of [schools.group, heroes.group, jellies.group, particles.points].concat(game && game.active ? [game.rend.group, game.specks.points, game.fx.a.p, game.fx.n.p] : [])) if (g.visible) { g.visible = false; hidden.push(g); }
    return hidden;
  }
  for (const o of prev) o.visible = true;
}

function updateScene(t, camMoved = true) {
  U.uOptA.value.x = t;
  camera.updateMatrixWorld(true);
  terrain.update(camera);
  surface.update(camera);
  // effective water level for ALL optics: near the surface it follows the wave height at the camera, so every stage (sky/background,
  // water shader, fog, post) agrees which side of the water the camera is on; far from the surface it is the flat mean level.
  { const cy = Math.abs(camera.position.y), k = Math.min(Math.max((cy - 0.5) / 1.1, 0), 1); U.uOptA.value.y = surface.uniforms.uCamH.value * (1 - k * k * (3 - 2 * k)); }
  scatter.update(camera.position, state.sync ? Infinity : 4);
  if (!state.game) {
    schools.update(camera.position, !!state.sync);
    schools.updateLOD(camera.position, U.uOptA.value.x);
    heroes.update(camera.position, !!state.sync);
    jellies.update(camera.position, !!state.sync);
  }
  { const dcam = Math.max(-camera.position.y, 0);                 // caustics only matter where sunlight reaches: skip the three splat passes (and the gain) in deep water
    const cg = 1 - Math.min(Math.max((dcam - 90) / 50, 0), 1);
    U.uCausP.value.y = cg;
    if (cg > 0) caustics.update(t); }
  updateShadowFrustum();
  updateLamp();
  particles.update(camera, post.size.y);
  { const d = Math.max(-camera.position.y, 0), lit = lamp.intensity > 0 || (state.strobe || 0) > 0;          // sunlit water: a light dusting; in a lamp beam: a blizzard of marine snow
    particles.uniforms.uBoost.value = lit ? 1.0 : 0.30 + 0.25 * Math.min(Math.max((d - 20) / 200, 0), 1);
    particles.uniforms.uSize.value = lit ? 2.3 : 1.0; }
  vents.update(camera, post.size.y, { on: particles.uniforms.uLampOn.value, pos: lamp.position, dir: tmpV.clone(), cone: particles.uniforms.uLampCone.value });
  renderer.shadowMap.needsUpdate = true;
  // planar reflection for the mirror seen from below (shallow enough to matter)
  const under = camera.position.y < 0 && camera.position.y > -28;
  surface.uniforms.uReflOn.value = under && state.reflect !== false ? 1 : 0;
  if (surface.uniforms.uReflOn.value) {
    refl.resize(post.size.x, post.size.y);
    surface.mesh.visible = false; bg.visible = false;
    const hidden = reflSkip(true);                               // the mirror is seen at grazing angles: only the big, far-visible things matter
    refl.render(scene, camera, 0);
    reflSkip(false, hidden);
    surface.mesh.visible = true; bg.visible = true;
    surface.uniforms.uReflTex.value = refl.rt.texture;
    surface.uniforms.uReflMat.value.copy(refl.matrix);
  }
  post.params.exposure = state.exposureAuto ? 0 : state.exposure;     // 0 = auto (GPU log-average)
  // deep, lamp-lit: fixed exposure tuned to the lamp (like an ROV camera), so dark water stays dark and subjects are not blown out
  { const d = Math.max(-camera.position.y, 0), lampDeep = lamp.intensity > 0 ? Math.min(Math.max((d - 80) / 120, 0), 1) : 0;
    if (lampDeep > 0 && state.exposureAuto) post.params.expComp = 1; post.params.deepFixed = lampDeep; }
  post.params.dt = state.dt || 0.016;
  // per-pixel colour restoration (see the volumetric pass): daylight strength fades with the sun; artificial light
  // (ROV lamp / strobe) restores the round trip through the water
  const dp = Math.max(-camera.position.y, 0);
  const sunFade = 1 - Math.min(Math.max((dp - 60) / 140, 0), 1);
  const sk = (state.strobe || 0) / ((state.strobe || 0) + 10);
  const lampDom = lamp.intensity > 0 ? (1 - sunFade) : 0;
  U.uWB.value.set((state.wb ?? 0.55) * sunFade * (1 - 0.85 * sk), (state.wbLampK ?? 0.9) * Math.max(lampDom, sk));
  post.params.tint.setRGB(1, 1, 1);
}

function zoneName(d) {
  if (camera.position.y > 0) return ['Above the surface', ''];
  if (d < 12) return ['Sunlit shallows', 'epipelagic'];
  if (d < 40) return ['Reef', 'epipelagic'];
  if (d < 120) return ['Deep reef & wall', 'epipelagic'];
  if (d < 200) return ['Blue water', 'epipelagic'];
  if (d < 1000) return ['Twilight zone', 'mesopelagic'];
  return ['Midnight zone', 'bathypelagic'];
}
let hudT = 0;
function updateHud(dt) {
  hudT += dt; if (hudT < 0.1) return; hudT = 0;
  if (state.game) return;
  const d = Math.max(-camera.position.y, 0);
  $('g-depth').textContent = d < 100 ? d.toFixed(1) : Math.round(d);
  const [z, s] = zoneName(d);
  $('g-zone').textContent = z; $('g-sub').textContent = s + (state.fps ? '  ·  ' + state.fps.toFixed(0) + ' fps' + (state.renderScale < 0.98 ? ' · ' + Math.round(state.renderScale * 100) + '% res' : '') : '');
}

function stepFrame(dt) {
  if (game && game.active) game.frame(dt);
  else { if (ui) ui.updateDive(dt);
  if (state.diving) clampCamera(); else moveCamera(dt); }
  state.time += dt; state.dt = dt;
  updateScene(state.time);
  post.render(scene, camera, null);
  updateHud(dt);
}
let last = performance.now(), fpsAcc = 0, fpsN = 0;
// --- GPU frame timing (when the browser exposes timer queries) drives automatic render-resolution scaling ---
const gpuT = { ext: null, q: null, ema: 0, n: 0, lastAdapt: 0, tried: false };
function gpuTimerBegin() {
  if (!gpuT.tried) { gpuT.tried = true; try { gpuT.ext = renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2'); } catch (e) { gpuT.ext = null; } }
  if (!gpuT.ext) return;
  const gl = renderer.getContext();
  if (gpuT.q) {                                                   // collect the previous result without stalling
    if (gl.getQueryParameter(gpuT.q, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(gpuT.ext.GPU_DISJOINT_EXT)) { const ms = gl.getQueryParameter(gpuT.q, gl.QUERY_RESULT) / 1e6; if (ms > 0 && ms < 500) { gpuT.ema = gpuT.ema ? gpuT.ema * 0.9 + ms * 0.1 : ms; gpuT.n++; state.gpuMs = gpuT.ema; } }
      gl.deleteQuery(gpuT.q); gpuT.q = null;
    } else return;                                                // still in flight: skip timing this frame
  }
  gpuT.q = gl.createQuery(); gl.beginQuery(gpuT.ext.TIME_ELAPSED_EXT, gpuT.q); gpuT.open = true;
}
function gpuTimerEnd() { if (gpuT.ext && gpuT.open) { renderer.getContext().endQuery(gpuT.ext.TIME_ELAPSED_EXT); gpuT.open = false; } }
function adaptResolution(now) {
  if (!state.autoScale || !gpuT.ext || gpuT.n < 20 || now - gpuT.lastAdapt < 1500) return;
  gpuT.lastAdapt = now;
  const target = state.gpuTarget ?? 12.5, g = gpuT.ema;                              // ms of GPU time we are happy with at 60 fps (leaves room for the compositor)
  let s = state.renderScale;
  if (g > target * 1.15) s = Math.max(0.5, s * Math.max(0.80, Math.sqrt(target / g)));           // cost ~ pixels ~ scale^2
  else if (g < target * 0.70 && s < 1) s = Math.min(1, s * 1.07);
  if (Math.abs(s - state.renderScale) > 0.025) { state.renderScale = s; gpuT.ema = 0; gpuT.n = 0; sizeToWindow(); }
}
function loop(now) {
  requestAnimationFrame(loop);
  const cap = state.fpsCap ?? 60;
  if (cap > 0 && now - last < 1000 / cap - 1.5) return;             // frame limiter: do not pin the GPU
  const dt = Math.min((now - last) / 1000, 0.1); last = now; state.dt = dt;
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { state.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  if (!post || !state.running) return;
  if (game && game.active) game.frame(dt);
  else { if (ui) ui.updateDive(dt);
  if (state.diving) clampCamera(); else moveCamera(dt); }
  state.time += dt;
  gpuTimerBegin();
  updateScene(state.time);
  post.render(scene, camera, null);
  gpuTimerEnd();
  adaptResolution(now);
  updateHud(dt);
}

// ---------------------------------------------------------------------------
// Snapshots (off-screen, deterministic; works while the pane is hidden)
// ---------------------------------------------------------------------------
let snapRT = null;
async function shot(o = {}) {
  const wasRunning = state.running; state.running = false;
  try { return await shotInner(o); } finally { state.running = wasRunning; }
}
async function shotInner(o = {}) {
  const w = o.w || 1600, h = o.h || 900;
  const prevCam = { p: camera.position.clone(), yaw: ctl.yaw, pitch: ctl.pitch, fov: camera.fov, aspect: camera.aspect };
  const prevSize = renderer.getSize(new THREE.Vector2());
  if (o.pos) camera.position.set(...o.pos);
  if (o.floor !== undefined) camera.position.y = world.height(camera.position.x, camera.position.z) + o.floor;
  if (!o.noclamp) camera.position.y = Math.max(camera.position.y, world.height(camera.position.x, camera.position.z) + 0.6);
  if (o.look) { camera.lookAt(...o.look); ctl.yaw = camera.rotation.y; ctl.pitch = camera.rotation.x; camera.rotation.set(ctl.pitch, ctl.yaw, 0); }
  if (o.yaw !== undefined) { ctl.yaw = o.yaw; ctl.pitch = o.pitch ?? 0; applyLook(); }
  camera.fov = o.fov || 58; camera.aspect = w / h; camera.updateProjectionMatrix();
  if (o.sun) setSun(...o.sun);
  const prevStrobe = state.strobe; if (o.strobe !== undefined) state.strobe = o.strobe;
  const prevLamp = state.lamp; if (o.lamp !== undefined) state.lamp = o.lamp;
  const prevDens = particles.uniforms.uDensity.value; if (o.particles !== undefined) particles.uniforms.uDensity.value = o.particles;
  if (o.water) setWater(o.water);
  const t = o.time ?? state.time;
  state.sync = true;
  const oldSS = post.ss, oldMSAA = post.msaa; const wasInstant = post.expoInstant; post.expoInstant = true;
  post.ss = o.ss || 1; post.msaa = o.msaa ?? 4;
  post.setSize(w, h);
  Object.assign(post.params, o.post || {});
  const prevLens = [post.params.aperture, post.params.focus, post.params.blurK];
  if (o.aperture !== undefined) post.params.aperture = o.aperture; if (o.focus !== undefined) post.params.focus = o.focus;
  if (o.exposure !== undefined) { state.exposureAuto = false; state.exposure = o.exposure; } else if (o.exposure === undefined && o.autoExp !== false) state.exposureAuto = true;
  if (!snapRT || snapRT.width !== w || snapRT.height !== h) {
    snapRT?.dispose();
    snapRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  }
  // a few frames so any temporally-jittered effect settles
  const n = o.samples || 1, shutter = o.shutter || 0;
  updateScene(t);
  if (n > 1) post.renderAccum(scene, camera, n, snapRT, (k) => { if (shutter) updateScene(t + (k / n - 0.5) * shutter); });
  else post.render(scene, camera, snapRT);
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(snapRT, 0, 0, w, h, buf);
  renderer.setRenderTarget(null);
  // flip + encode
  const cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  ctx.putImageData(img, 0, 0);
  const type = o.png ? 'image/png' : 'image/jpeg';
  const blob = await new Promise(res => cvs.toBlob(res, type, 0.93));
  const name = (o.name || 'shot') + (o.png ? '.png' : '.jpg');
  if (o.download) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  let ok = null;
  try { ok = await (await fetch('/__snap/' + name, { method: 'POST', body: blob })).json(); } catch (e) { ok = { error: String(e) }; }
  // restore
  post.ss = oldSS; post.msaa = oldMSAA; post.expoInstant = wasInstant; state.sync = false; state.strobe = prevStrobe; state.lamp = prevLamp; [post.params.aperture, post.params.focus, post.params.blurK] = prevLens; particles.uniforms.uDensity.value = prevDens;
  camera.position.copy(prevCam.p); ctl.yaw = prevCam.yaw; ctl.pitch = prevCam.pitch; applyLook();
  camera.fov = prevCam.fov; camera.aspect = prevCam.aspect; camera.updateProjectionMatrix();
  if (!o.keepSize) { post.setSize(prevSize.x, prevSize.y); }
  post.resetHistory();
  return { name, w, h, ...ok, depth: Math.max(-(o.pos ? o.pos[1] : camera.position.y), 0) };
}


// ---------------------------------------------------------------------------
// Dev helpers (used from the console to frame test shots)
// ---------------------------------------------------------------------------
function makeDev() {
  const hc = (a, r, sp, t) => { const w = sp / Math.max(r[0], 1); return [a[0] + r[0] * (Math.sin(w * t + 1) + 0.25 * Math.sin(2.1 * w * t + 0.5)), a[1] + r[1] * Math.sin(0.61 * w * t + 2), a[2] + r[2] * (Math.cos(0.83 * w * t) + 0.25 * Math.sin(1.7 * w * t + 2.2))]; };
  const T = {
    h: (x, z) => world.height(x, z),
    // shot with camera/look given as terrain-relative heights: T.shot(name, [x,z,h], [x,z,h], fov, extra)
    shot: (name, c, l, fov = 62, extra = {}) => shot({ name, w: 1280, h: 720, time: 5.0, pos: [c[0], world.height(c[0], c[1]) + c[2], c[1]], look: [l[0], world.height(l[0], l[1]) + l[2], l[1]], fov, samples: 4, ...extra }),
    // isolate: hide all streamed animals, then show one slot of `kind` at an absolute anchor
    heroSlot: (kind, anchor, range = null, speed = null) => {
      heroes.update = () => {}; jellies.update = () => {}; schools.update = () => {};
      heroes.entries.forEach(e => e.slots.forEach(s => { s.key = null; s.mesh.visible = false; }));
      jellies.entries.forEach(e => e.slots.forEach(s => { s.key = null; s.mesh.visible = false; }));
      schools.species.forEach(e => e.slots.forEach(s => { s.key = null; s.mesh.visible = false; }));
      const e = heroes.entries.find(x => x.name === kind), slot = e.slots[0];
      slot.key = 't'; slot.mesh.visible = true; slot.uniforms.uAnchor.value.set(...anchor); slot.uniforms.uSchoolT.value = 0;
      if (range) slot.uniforms.uRange.value.set(...range); if (speed !== null) slot.uniforms.uSpeed.value = speed;
      return { slot, at: (t) => hc(anchor, slot.uniforms.uRange.value.toArray(), slot.uniforms.uSpeed.value, t) };
    },
    // shoot a hero from a spot relative to its heading at time t
    heroShot: async (name, kind, anchor, range, speed, fwd, side, up, fov = 55, tt = 5.0, extra = {}) => {
      const hs = T.heroSlot(kind, anchor, range, speed);
      const p0 = hs.at(tt), p1 = hs.at(tt + 0.5), v = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], l = Math.hypot(...v) || 1, f = v.map(x => x / l);
      const sd = [-f[2], 0, f[0]], sl = Math.hypot(sd[0], sd[2]) || 1, s = [sd[0] / sl, 0, sd[2] / sl];
      const cam = [p0[0] + f[0] * fwd + s[0] * side, p0[1] + up, p0[2] + f[2] * fwd + s[2] * side];
      return shot({ name, w: 1280, h: 720, time: tt, pos: cam, look: p0, fov, samples: 6, ...extra });
    },
  };
  return T;
}


// Species gallery: each species alone on a flat patch, drawn with the size + colour its own generator produces, framed by its size (review sheets).
// opts: { only:['table',..], size:'small'|'median'|'large', yaw, variant, fish:false, depth, dist, w, h, samples, time }
async function gallery(tag = 'gal', opts = {}) {
  const all = scatter.species, sp = all.filter((s) => !opts.only || opts.only.includes(s.id));
  const prevUpdate = scatter.update; scatter.update = () => {};
  const prev = new Map(); all.forEach((s) => prev.set(s, s.meshes.map((v) => v.map((m) => [m.visible, m.count]))));
  const decals = all.filter((s) => s.decal).map((s) => [s.decal, s.decal.count]);
  const grp = [schools, heroes, jellies].filter((o) => o && o.group).map((o) => [o.group, o.group.visible]);
  if (!opts.fish) grp.forEach(([g]) => { g.visible = false; });
  const flat = (() => { for (let x = -300; x < 0; x += 5) for (let z = -200; z < 200; z += 5) { const h = world.height(x, z); if (-h > 3.0 && -h < 4.2) { let mx = -1e9, mn = 1e9; for (let a = -4; a <= 4; a += 2) for (let b = -4; b <= 4; b += 2) { const hh = world.height(x + a, z + b); mx = Math.max(mx, hh); mn = Math.min(mn, hh); } if (mx - mn < 0.25) return [x, z, h]; } } return [-300, -105, world.height(-300, -105)]; })();
  const [fx, fz, fh] = flat;
  const collect = (s, depth) => {                           // run the species' own generator on a synthetic flat seabed
    const out = []; let seed = 90210;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let c = 0; c < 80 && out.length < 60; c++) {
      const ctx = { cx: c, cz: 0, x0: c * 16, z0: 0, S: 16, rnd, sample: () => ({ h: 0, depth, slope: 0.05, nx: 0, ny: 1, nz: 0, m: [1, 1, 1, 1] }),
        push: (variant, x, y, z, sx, sy, sz, yaw, align, nrm, color) => out.push({ variant, sx, sy, sz, color }) };
      try { s.gen(ctx); } catch (e) { /* species not valid at this depth */ }
    }
    return out;
  };
  const names = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  const report = {};
  for (const s of sp) {
    let inst = [];
    for (const d of (opts.depth ? [opts.depth] : [4, 10, 25, 55, 100, 200, 500, 1200, 3000, 6000])) { inst = collect(s, d); if (inst.length >= 4) break; }
    if (!inst.length) { report[s.id] = 'no instances'; continue; }
    inst.sort((a, b) => a.sx - b.sx);
    const pickI = opts.size === 'small' ? inst[Math.floor(inst.length * 0.1)] : opts.size === 'large' ? inst[Math.floor(inst.length * 0.92)] : inst[Math.floor(inst.length * 0.5)];
    const vi = Math.min(opts.variant ?? pickI.variant, s.meshes.length - 1);
    all.forEach((o) => o.meshes.forEach((v) => v.forEach((m) => { m.visible = false; })));
    all.forEach((o) => { if (o.decal) o.decal.count = 0; });
    const mesh = s.meshes[vi][0], geo = mesh.geometry;
    { const ud = mesh.userData; if (ud.cpuM) { mesh.dispose(); mesh.instanceMatrix = new THREE.InstancedBufferAttribute(ud.cpuM, 16); mesh.instanceColor = new THREE.InstancedBufferAttribute(ud.cpuC, 3); } }   // scatter hands out right-sized views: give the gallery the full arrays back
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const bs = geo.boundingSphere, smax = Math.max(pickI.sx, pickI.sz);
    const nC = Math.max(1, opts.cluster ?? 1), spread = (opts.spread ?? 0.75) * bs.radius * smax;
    let R = bs.radius * smax;
    const rr = (() => { let a = 12345; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; })();
    for (let ci = 0; ci < nC; ci++) {
      const ang = rr() * 6.283, rad = ci === 0 ? 0 : Math.sqrt(rr()) * spread, jitter = ci === 0 ? 1 : 0.75 + 0.5 * rr();
      q.setFromAxisAngle(Y, (opts.yaw ?? 0.7) + rr() * 6.283);
      m4.compose(new THREE.Vector3(fx + Math.cos(ang) * rad, fh - 0.02 * pickI.sy, fz + Math.sin(ang) * rad), q, new THREE.Vector3(pickI.sx * jitter, pickI.sy * jitter, pickI.sz * jitter));
      mesh.setMatrixAt(ci, m4);
      const cj = 0.88 + 0.24 * rr();
      mesh.instanceColor.setXYZ(ci, pickI.color[0] * cj, pickI.color[1] * cj, pickI.color[2] * cj);
    }
    R += spread;
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.count = nC; mesh.visible = true;
    const dist = opts.dist ?? Math.min(Math.max(R * 2.7, 0.7), 14), cy = fh + bs.center.y * pickI.sy;
    report[s.id] = { v: vi, s: +pickI.sx.toFixed(2), R: +R.toFixed(2), col: pickI.color.map((c) => +c.toFixed(2)) };
    const r = await shot({ name: tag + '_' + s.id, w: opts.w ?? 800, h: opts.h ?? 500, time: opts.time ?? 5.0, pos: [fx - dist, cy + dist * (opts.elev ?? 0.34) + 0.1, fz - dist * 0.25], look: [fx, cy, fz], fov: 48, samples: opts.samples ?? 4, strobe: opts.strobe ?? 3, aperture: 5, focus: dist });
    names.push(r.name);
  }
  all.forEach((s) => { const pv = prev.get(s); s.meshes.forEach((v, i) => v.forEach((m, j) => { m.visible = pv[i][j][0]; m.count = pv[i][j][1]; })); });
  decals.forEach(([d, c]) => { d.count = c; });
  grp.forEach(([g, v]) => { g.visible = v; });
  scatter.update = prevUpdate; scatter.dirty = true;
  return { names, report };
}

// Top-down debug map from the baked world data (hillshade + masks)
async function dumpMap(x0, z0, x1, z1, w = 1200, name = 'map') {
  const h = Math.round(w * (z1 - z0) / (x1 - x0));
  const cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext('2d'), img = ctx.createImageData(w, h);
  const L = new THREE.Vector3(-0.5, 0.75, -0.35).normalize(), m = [0, 0, 0, 0];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) / w * (x1 - x0), z = z0 + (j + 0.5) / h * (z1 - z0);
    const ht = world.height(x, z); const e = Math.max((x1 - x0) / w, 2);
    const n = new THREE.Vector3(-(world.height(x + e, z) - world.height(x - e, z)) / (2 * e), 1, -(world.height(x, z + e) - world.height(x, z - e)) / (2 * e)).normalize();
    const shade = 0.35 + 0.65 * Math.max(0, n.dot(L));
    world.masks(x, z, m);
    const depth = -ht;
    let r = 0.55 * m[0] + 0.30 * m[2] + 0.1, g = 0.50 * m[0] + 0.30 * m[2] + 0.1, b = 0.32 * m[0] + 0.30 * m[2] + 0.1;
    r += m[1] * 0.5; g -= m[1] * 0.2; b -= m[1] * 0.1;
    g += m[3] * 0.5; r -= m[3] * 0.2;
    const tint = Math.min(1, Math.log(1 + depth) / Math.log(4000));
    r = r * shade * (1 - tint) + 0.02 * tint; g = g * shade * (1 - tint) + 0.15 * tint * (1 - tint) + 0.08 * tint; b = b * shade * (1 - tint * 0.5) + 0.35 * tint;
    const o = (j * w + i) * 4;
    img.data[o] = Math.min(255, r * 255); img.data[o + 1] = Math.min(255, g * 255); img.data[o + 2] = Math.min(255, b * 255); img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise(res => cvs.toBlob(res, 'image/png'));
  return await (await fetch('/__snap/' + name + '.png', { method: 'POST', body: blob })).json();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  setLoad(0.02, 'shaping the seabed…');
  world = await bakeWorld(renderer, (p) => setLoad(0.05 + p * 0.55, 'shaping the seabed…'));
  setLoad(0.62, 'laying sand and rock…');
  terrain = new Terrain(renderer, world);
  scene.add(terrain.group);
  scatter = new Scatter(scene, world);
  buildLife(scatter);
  buildDeepLife(scatter);
  schools = new Schools(scene, world, scatter);
  heroes = new Heroes(scene, world);
  jellies = new Jellies(scene, world);
  vents = new VentField(scene, world);
  particles = new Particles(90000, 36);
  scene.add(particles.points);
  surface = new OceanSurface();
  scene.add(surface.mesh);
  bg = makeBackground();
  scene.add(bg);
  caustics = new Caustics(renderer);
  refl = new PlanarReflection(renderer, 0.5);
  post = new Post(renderer);
  post.expoInstant = false;
  sizeToWindow();
  window.addEventListener('resize', sizeToWindow);
  setLoad(0.86, 'warming up the light…');
  state.sync = true; updateScene(0); state.sync = false;
  heroes.entries.concat(jellies.entries).forEach(e => e.slots.forEach(s => { if (!s.mesh.visible) { s.mesh.visible = true; s._warm = true; } }));
  schools.species.forEach(e => e.slots.forEach(s => { if (!s.mesh.visible) { s.mesh.visible = true; s._warm = true; } }));
  setLoad(0.9, 'compiling shaders…');
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* older path: compile lazily */ }
  post.render(scene, camera, null);
  heroes.entries.concat(jellies.entries, schools.species).forEach(e => e.slots.forEach(s => { if (s._warm) { s.mesh.visible = false; s._warm = false; } }));
  window.__OCEAN__ = { THREE, renderer, scene, camera, post, world, terrain, surface, caustics, state, ctl, U, shot, dumpMap, stepFrame, goto, SITES, updateScene, sun, hemi, lamp, refl, scatter, schools, heroes, jellies, vents, particles, strobe, applyLook, setSun, setWater };
  window.__OCEAN__.T = makeDev();
  window.__OCEAN__.gallery = gallery;
  // Pin a school so that at shot time its centre is at `at` and (optionally) it swims along `heading` ([x,z], either direction).
  // Picks the random seed whose path best matches the heading, then shifts the anchor to hit `at`. Returns { slot, sp, centre }.
  const placeSchool = (school, t) => {
    const sp = schools.species.find((e) => e.name === school.name).sp;
    let seed = school.seed, anchor = school.anchor ?? school.at;
    if (seed === undefined && school.heading) {
      let best = -1, bs = 1;
      for (let sd = 1; sd <= 90; sd++) {
        const sl = schools.pin(school.name, ...anchor, sd);
        const c0 = schools.centre(sl, sp, t), c1 = schools.centre(sl, sp, t + 0.5);
        let vx = c1[0] - c0[0], vz = c1[2] - c0[2]; const l = Math.hypot(vx, vz) || 1;
        const al = Math.abs((vx * school.heading[0] + vz * school.heading[1]) / l);
        if (al > best) { best = al; bs = sd; }
        schools.unpinAll();
      }
      seed = bs;
    }
    let slot = schools.pin(school.name, ...anchor, seed ?? 1);
    if (school.at) {                                                   // move the anchor so the centre lands on `at` at time t
      const c = schools.centre(slot, sp, t);
      slot.uniforms.uAnchor.value.set(anchor[0] + school.at[0] - c[0], anchor[1] + school.at[1] - c[1], anchor[2] + school.at[2] - c[2]);
    }
    return { slot, sp, centre: schools.centre(slot, sp, t) };
  };
  window.__OCEAN__.placeSchool = placeSchool;

  // The portfolio set: the 12 standard views plus hero animals, the clownfish on its anemone, a sea fan and a black-smoker chimney.
  // O.best('best', { w: 2560, h: 1440, samples: 16 }) -> snaps/best_*.jpg   (about 15 s on the 7900 XTX)
  window.__OCEAN__.best = async (tag = 'best', opts = {}) => {
    const w = opts.w || 2560, h = opts.h || 1440, samples = opts.samples || 16, out = [];
    const common = { w, h, samples };
    out.push(...await window.__OCEAN__.suite(tag, { w, h, samples }));
    const T = window.__OCEAN__.T, H = (x, z) => world.height(x, z);
    const restore = () => { delete schools.update; delete heroes.update; delete jellies.update; };
    out.push((await T.heroShot(tag + '_x01_turtle', 'turtle', [200, -6, 10], null, null, 2.2, 1.3, 0.55, 52, 5.0, { ...common, aperture: 2, focus: 2.4 })).name);
    out.push((await T.heroShot(tag + '_x02_shark', 'shark', [430, -22, -20], null, null, 3.2, 1.6, 0.25, 50, 5.0, { ...common, aperture: 2, focus: 3.4 })).name);
    restore();
    {                                                                                   // clownfish
      const cam = camera.position; cam.set(205, H(205, 4) + 2, 4);
      scatter.update(cam, Infinity); schools.update(cam, true);
      const sl = schools.species.find((e) => e.name === 'clown').slots.filter((s) => s.key)[1] || schools.species.find((e) => e.name === 'clown').slots.find((s) => s.key);
      if (sl) { const a = sl.uniforms.uAnchor.value; out.push((await shot({ name: tag + '_x03_clownfish', ...common, time: 5, pos: [a.x - 0.35, a.y + 0.55, a.z - 0.35], look: [a.x, a.y - 0.04, a.z], fov: 38, aperture: 1.6, focus: 0.72, noclamp: true })).name); }
    }
    {                                                                                   // biggest sea fan near the fore-reef, seen from the open-water side
      const cam = camera.position; cam.set(262, H(262, -4) + 3, -4); scatter.update(cam, Infinity);
      const c = []; for (const id of ['fan0', 'fan1', 'fan2']) for (const p of scatter.instancePositions(id, cam, 30, 200)) c.push(p);
      c.sort((a, b) => b.s - a.s);
      if (c.length) { const f = c[0], k = Math.max(f.s, 0.8); out.push((await shot({ name: tag + '_x04_seafan', ...common, time: 6, pos: [f.x + 2.6 * k, f.y + 0.5 * f.s, f.z + 0.5], look: [f.x, f.y + 0.55 * f.s, f.z], fov: 50, aperture: 2, focus: 2.6 * k, noclamp: true })).name); }
    }
    {                                                                                   // black smoker
      const t0 = vents.tops[0], fl = H(t0.x, t0.z);
      out.push((await shot({ name: tag + '_x05_vent', ...common, time: 9, lamp: true, pos: [t0.x - 7, fl + 3.0, t0.z - 5], look: [t0.x, fl + 4, t0.z], fov: 60 })).name);
      out.push((await shot({ name: tag + '_x06_vent_plume', ...common, time: 6, lamp: true, pos: [t0.x - 16, fl + 7, t0.z - 6], look: [t0.x, fl + 7, t0.z], fov: 62 })).name);
    }
    return out;
  };
  window.__OCEAN__.suite = async (tag = 'r', opts = {}) => {
    const res = [];
    for (const [n, v] of suiteViews(world)) {
      if (opts.only && !opts.only.some((k) => n.startsWith(k))) continue;
      const { pins, school, ...rest } = v;
      if (pins) for (const p of pins) schools.pin(...p);
      if (school) {
        const { centre: cen } = placeSchool(school, rest.time ?? 5), yw = school.yaw ?? 0;
        if (school.frame !== false) {                                  // frame the school: camera `dist` m from its centre at the shot time
          rest.pos = [cen[0] + Math.cos(yw) * school.dist, cen[1] + (school.up ?? 0), cen[2] + Math.sin(yw) * school.dist]; rest.look = cen; rest.noclamp = true;
        }
      }
      res.push((await shot({ name: tag + '_' + n, w: opts.w || 800, h: opts.h || 450, time: 5, samples: opts.samples || 4, ...rest })).name);
      if (pins || school) schools.unpinAll();
    }
    return res;
  };
  try { ui = initUI({ state, camera, post, particles, scatter, renderer, sites: SITES, goto, setSun, setWater, shot, lamp, ctl, applyLook, world, U, sizeToWindow }); window.__OCEAN__.ui = ui; } catch (e) { console.error('ui init failed', e); }
  goto(SITES[0]);
  try {
    const { initGame } = await import('./game/game.js');
    game = initGame({ THREE, scene, camera, renderer, post, world, scatter, particles, schools, heroes, jellies, vents, state, ctl, U, ui, lamp, sizeToWindow, applyLook, setSun, setWater, SITES, goto });
    window.__OCEAN__.game = game;
    if (!params.has('explore')) {                                          // compile the creature shaders while the loading screen is still up
      setLoad(0.96, 'waking the reef…');
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
      game.warm();
    }
  } catch (e) { console.error('game init failed', e); fetch('/__log', { method: 'POST', body: 'game init failed ' + String(e.stack || e) }); }
  setLoad(1, 'ready');
  $('loading').classList.add('done');
  if (game && !params.has('explore')) game.enter(true);
  requestAnimationFrame(loop);
}
boot().catch((e) => { console.error(e); $('l-msg').textContent = 'error: ' + e.message; fetch('/__log', { method: 'POST', body: String(e.stack || e) }); });
