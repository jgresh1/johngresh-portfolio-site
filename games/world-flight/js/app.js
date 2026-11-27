// app.js — World Flight: the title, the opening film, the globe a place is picked from, and then flying there.
//
// The flying itself is Tokyo Flight's (the same aircraft, flight model, controls, clouds, weather, sky and sound,
// in js/fly and beside this file). What is new is where the world comes from. There the ground, the buildings and
// the runway were Japan's surveys of Tokyo; here they are built for whatever place is picked, from sources that
// cover the Earth (net.js): photographs and heights for the ground (terrain.js), OpenStreetMap for water and
// buildings (maps.js), OurAirports for runways (airports.js). The scene's origin is put under that place, and
// moved along with the aircraft as it flies (`rebase` below), so a flight can go on for as long as the fuel of
// the imagination lasts.
import * as THREE from 'three';
import { ATMO, setTime, installCascades, SunShadows, makeSky, makeEnvironment } from './atmo.js';
import { Terrain, GroundBake } from './terrain.js';
import { Clouds } from './clouds.js';
import { Weather, CONDITIONS, MENU, localNow } from './weather.js';
import { Precip, Bolt } from './precip.js';
import { Maps, OsmCity } from './maps.js';
import { Airports } from './airports.js';
import { Globe } from './globe.js';
import { Picker } from './picker.js';
import { setOrigin, moveOrigin, worldToGeo, geoToWorld, destination } from './geo.js';
import { NET, CREDITS } from './net.js';
import { TIERS, ORDER, graphicsDevice, pickTier, Governor } from './fly/perf.js';
import { Jet, loadJet, addLod, GEAR_H } from './fly/jet.js';
import { Flight, SPEC, AD1 } from './fly/flight.js';
import { loadAD1, AD1_VIEW } from './fly/ad1.js';
import { Rig } from './fly/chase.js';
import { Input, padNav } from './fly/input.js';
import { Sound } from './fly/sound.js';
import { Hangar } from './fly/hangar.js';
import { Film, T as FILM } from './fly/film.js';
import { Arrival } from './fly/arrive.js';
import { Roofs } from './fly/roofs.js';
import { MiniMap } from './fly/minimap.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, D2R = Math.PI / 180;
const store = { get(k, d) { try { return localStorage.getItem('world.' + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('world.' + k, v); } catch { /* private window */ } } };
const hop = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
const REBASE = 12000;                                     // metres from the origin at which it is moved under the aircraft
// what each level of detail is given of the things only this game has: buildings (everything within `bNear` metres,
// what shows from far out to `bFar`, how small one may look before it is left out), and the globe's cloud and light pictures
const WORLD = {
  phone: { bNear: 1300, bFar: 4200, bpx: 9, maxZ: 16, demZ: 13, cloudZ: 2, nightZ: 2, jobs: 3 },
  low: { bNear: 1800, bFar: 6200, bpx: 7, maxZ: 17, demZ: 13, cloudZ: 3, nightZ: 3, jobs: 4 },
  mid: { bNear: 2600, bFar: 9000, bpx: 5.5, maxZ: 18, demZ: 13, cloudZ: 3, nightZ: 3, jobs: 5 },
  high: { bNear: 3600, bFar: 14000, bpx: 4, maxZ: 19, demZ: 13, cloudZ: 4, nightZ: 4, jobs: 6 },
};

async function boot() {
  const GFX = graphicsDevice(), tierName = pickTier(Q, GFX), tier = TIERS[tierName], W = WORLD[tierName];
  const touch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  document.body.classList.toggle('touch', touch);
  const app = $('app'), view = $('view');
  const fitApp = () => { document.documentElement.style.setProperty('--app-h', (window.visualViewport?.height || innerHeight) + 'px'); };
  fitApp(); addEventListener('resize', fitApp); window.visualViewport?.addEventListener('resize', fitApp);

  const renderer = new THREE.WebGLRenderer({ antialias: tier.aa, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  view.appendChild(renderer.domElement);
  const cv = renderer.domElement;
  if (GFX.software) {
    const w = $('warn');
    w.innerHTML = '<b>This window is drawing without a graphics card</b>, so it will be slow and plain. Open this address in Chrome, Edge, Firefox or Safari.';
    w.style.display = 'block'; w.onclick = () => { w.style.display = 'none'; };
  }
  const note = (s) => { $('note').textContent = s; };
  const BOOT = window.__boot || (window.__boot = {});      // the page's own watchdog reads this (index.html)
  const load = (f) => { $('start').style.setProperty('--load', Math.min(1, f).toFixed(3)); };
  BOOT.stage = 'aircraft'; note('Loading the aircraft'); load(0.1);
  $('credit').textContent = CREDITS; $('gCredit').textContent = CREDITS; $('mCredit').textContent = CREDITS;

  /* ---------------------------------------------------------------- the hangar and the two aircraft: enough for the title */
  installCascades();
  let timeMode = Q.has('t') ? 'set' : store.get('time', 'live');
  setTime(+Q.get('t') || +store.get('hour', 9.5), localNow(0).day);          // today's date, whatever hour is picked
  const hangar = new Hangar(renderer, tier);
  const sound = new Sound();
  const flyLod = Q.get('jet') || tier.jet, filmLod = Q.get('jet') || tier.jetFilm || tier.jet;
  // Every device starts with the small models (1.6 and 1.3 MB), so the title is up as soon as those are here. The
  // full ones come in behind the title and the film's first shots, and are used from then on.
  const got = { ad1: 0, katy: 0 }, tell = () => { const f = (got.ad1 + got.katy) / 2; load(0.1 + 0.68 * f); note('Loading the aircraft ' + Math.round(Math.min(f, 1) * 100) + '%'); };
  const adHolder = new Jet();
  const [, katyHolder] = await Promise.all([
    loadAD1(adHolder, 'lo', (g, t) => { got.ad1 = Math.min(g / (t || 1.64e6), 1); tell(); }),
    loadJet('lo', undefined, (g, t) => { got.katy = Math.min(g / (t || 1.3e6), 1); tell(); }),
  ]);
  BOOT.stage = 'scene'; note('Setting the scene'); load(0.8);
  const PLANES = {
    ad1: { name: 'NASA AD-1', line: 'NASA AD-1. Its wing turns as it gains speed.', spec: AD1, view: AD1_VIEW, jet: adHolder, key: (l) => 'ad1-' + l, at: new THREE.Vector3(-5.6, 0, 1.0), gearH: AD1.gearH, nose: -6.3, wide: 9.8, blob: null },
    katy: { name: 'Payen Katy', line: 'Payen Katy.', spec: SPEC, view: { dist: 11.5, height: 2.5, min: 6.5, size: 1 }, jet: katyHolder, key: (l) => l, at: new THREE.Vector3(5.6, 0, -0.8), gearH: GEAR_H, nose: -3.3, wide: 5.4, blob: null },
  };
  let plane = PLANES[Q.get('plane')] ? Q.get('plane') : PLANES[store.get('plane', 'ad1')] ? store.get('plane', 'ad1') : 'ad1';
  let jet = PLANES[plane].jet;                              // the one being flown
  const useLod = (name, lod) => { const P = PLANES[name]; return P.jet.use(P.key(lod)) || P.jet.use(P.key('lo')); };
  const onStage = () => stage.parent === hangar.scene && adHolder.root.parent === stage;
  if (filmLod !== 'lo' || flyLod !== 'lo') {
    loadAD1(adHolder, 'hi').then(() => { if (onStage() ? filmLod === 'hi' : plane === 'ad1' && flyLod === 'hi') useLod('ad1', 'hi'); SW.asked = false; }).catch((e) => console.warn('full model', e.message || e));
    addLod(katyHolder, 'hi').then(() => { if (onStage() ? filmLod === 'hi' : plane === 'katy' && flyLod === 'hi') useLod('katy', 'hi'); SW.asked = false; }).catch((e) => console.warn('full model', e.message || e));
  }
  // both stand in the hangar, noses to the doors, each with the soft shadow under it
  const stage = new THREE.Group(); hangar.scene.add(stage);
  PLANES.katy.blob = hangar.blob; hangar.blob.position.x = PLANES.katy.at.x;
  PLANES.ad1.blob = hangar.blob.clone(); PLANES.ad1.blob.scale.set(1.75, 1, 1.8); PLANES.ad1.blob.position.set(PLANES.ad1.at.x, 0.012, PLANES.ad1.at.z + 0.4); hangar.scene.add(PLANES.ad1.blob);
  const park = () => { for (const P of Object.values(PLANES)) { stage.add(P.jet.root); P.jet.root.position.set(P.at.x, P.gearH, P.at.z); P.jet.root.quaternion.identity(); P.jet.root.visible = true; P.jet.pose(0, { parked: 1 }); P.blob.position.z = P.at.z + 0.4; } };
  const stageEnv = (force) => { const e = hangar.refreshEnv(stage, force); adHolder.setEnv(e, 1); katyHolder.setEnv(e, 1); };
  park(); hangar.setLamps(4); stageEnv(true);

  /* ---------------------------------------------------------------- the world */
  const scene = new THREE.Scene();
  scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 200000);
  const sky = makeSky(); scene.add(sky);
  const shadows = new SunShadows(scene, { radii: tier.cascades, sizes: tier.csize, near: { size: tier.jetShadow, radius: 7 } });
  const fill = new THREE.AmbientLight(0xffdcb4, 0); scene.add(fill);
  const bounce = new THREE.HemisphereLight(0xece9e2, 0xa89f90, 1); scene.add(bounce);
  for (const l of [...shadows.all, fill, bounce]) l.layers.enable(1);
  let envRT = null, envDue = 0, exposure = 1;
  const applyLight = () => {
    fill.intensity = 0.17 * ATMO.night;
    bounce.intensity = 1.35 * (0.25 + 0.75 * ATMO.sunLight) * (1 - 0.8 * ATMO.night) * weather.ambient;
    exposure = (1.0 + 0.45 * ATMO.night) * weather.exposure;
  };
  const applyTime = () => { shadows.sync(); applyLight(); for (const P of Object.values(PLANES)) P.jet.uLamp.value = 0.5 + 1.2 * ATMO.night; envDue = performance.now() + 120; };
  const clouds = new Clouds(renderer, tierName);
  const weather = new Weather(clouds, { changed: () => { applyLight(); if (!envDue) envDue = performance.now() + 1500; }, report: () => wxUI() });
  let wxUI = () => {};
  { const w = Q.get('wx') || store.get('wx', 'live'); weather.choose(w === 'live' || CONDITIONS[w] ? w : 'live', true); }
  const refreshEnv = () => { envRT = makeEnvironment(renderer, sky, envRT); scene.environment = envRT.texture; envDue = 0; if (jet.root.parent === scene) jet.setEnv(envRT.texture, 1.15); };

  const maps = new Maps(); maps.maskMax = tierName === 'phone' ? 1024 : 2048;
  const airports = new Airports(); airports.load();
  const terrain = new Terrain(renderer);
  terrain.errPx = tier.terrPx; terrain.maxZ = Math.min(+Q.get('z') || W.maxZ, 19); terrain.demZ = W.demZ; terrain.maxActive = Math.round(tier.terrActive * 1.6); terrain.aniso = tier.aniso;
  terrain.water = maps.water; terrain.flatten = airports.flatten;
  scene.add(terrain.group); scene.add(airports.group);
  const bake = new GroundBake(renderer, terrain, tier.bake);
  let perFrame = tier.tilesPerFrame, cityRev = 0;
  const cityChanged = () => { shadows.invalidate(); roofs.changed = true; cityRev++; };
  const city = new OsmCity({ maps, camera, px: W.bpx, near: W.bNear, far: W.bFar, shadows: tier.cascades.length > 0, jobs: W.jobs, perFrame: () => perFrame, onChange: cityChanged });
  const groundGeo = (lat, lon) => { const e = terrain.elevation(lat, lon); return { elev: airports.at(lat, lon) ?? e.elev, z: e.z }; };
  city.groundAt = groundGeo;
  if (Q.get('buildings') !== '0') scene.add(city.group);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), g1 = {};
  const groundY = (x, z) => terrain.heightAt(x, z);
  const roofs = new Roofs(renderer, scene, city, terrain);
  const world = {
    // a runway's own surface where there is one; elsewhere the ground model, shaped as the drawn ground is
    ground(x, z) {
      const g = worldToGeo(v1.set(x, 0, z), g1), on = airports.at(g.lat, g.lon);
      if (on != null) return { y: geoToWorld(g.lat, g.lon, on, v2).y, water: false };
      const e = terrain.elevation(g.lat, g.lon);
      return { y: geoToWorld(g.lat, g.lon, airports.flatten(g.lat, g.lon, e.elev), v2).y, water: e.water };
    },
    roof(x, y, z) { return roofs.top(x, z); },
  };

  /* ---------------------------------------------------------------- flying */
  const flight = new Flight(world, PLANES[plane].spec);
  flight.assist = store.get('assist', 'easy') === 'real' ? 'real' : 'easy';
  const rig = new Rig(camera, flight, jet, world); rig.fit(PLANES[plane].view);
  const precip = new Precip(scene, tier.drops);
  const bolt = new Bolt(scene);
  weather.onStrike = (F) => { if (F.ground) { const g = world.ground(F.pos.x, F.pos.z).y; bolt.strike(F.pos.x, g + Math.max(weather.now.lowBase, 300), F.pos.z, g); } else bolt.geo.instanceCount = 0; };
  weather.onThunder = (d) => sound.thunder(d);
  const camPrev = new THREE.Vector3(), camVel = new THREE.Vector3(); let camHad = false;
  const input = new Input(cv, $('touch'), { touch });
  input.invert = store.get('invert', '0') === '1';
  input.response = ['gentle', 'normal', 'sharp'].includes(store.get('response', 'normal')) ? store.get('response', 'normal') : 'normal';
  input.mouseFly = !touch && store.get('mouse', '0') === '1';
  const arrival = new Arrival({ jet: () => jet, view: () => PLANES[plane].view, flight, rig, sound, world, camera });

  // 'title' | 'film' | 'globe' | 'dive' (the place is loading) | 'arrive' | 'fly'
  let mode = 'title', paused = false, units = store.get('units', 'm'), hintAt = 0, crashT = 0, clock = 0, flown = false;
  const applyDetail = () => {
    city.detail = gov.detail; city.reach = W.bFar * gov.reach; city.near = W.bNear * Math.sqrt(gov.reach); terrain.maskNear = Math.min(city.reach, 9000);
    terrain.errPx = tier.terrPx * gov.detail;
    shadows.setOn(gov.sun, gov.near);
  };
  const gov = new Governor(tier, tierName, () => { resize(); applyDetail(); });
  if (Q.has('nogov')) { gov.enabled = false; gov.res = gov.geo = 0; gov.trail.length = 0; }
  applyDetail();
  const glc = renderer.getContext(), px1 = new Uint8Array(4);
  const gpuDone = () => glc.readPixels(0, 0, 1, 1, glc.RGBA, glc.UNSIGNED_BYTE, px1);

  const globe = new Globe(renderer, { clouds: W.cloudZ, nightZ: W.nightZ });
  const size = new THREE.Vector2();
  const resize = () => {
    const w = view.clientWidth || innerWidth || 1280, h = view.clientHeight || innerHeight || 720;
    const cap = Q.has('dpr') ? +Q.get('dpr') : Math.min(tier.dpr, Math.sqrt(tier.pixels / (w * h)));
    const k = mode === 'fly' || mode === 'arrive' ? gov.scale : Math.sqrt(gov.scale);
    renderer.setPixelRatio(Math.max(0.5, Math.min(devicePixelRatio || 1, cap) * k));
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(size); clouds.setSize(size.x, size.y);
    camera.aspect = w / h; hangar.camera.aspect = w / h; hangar.camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(view); resize();
  applyTime(); refreshEnv();

  /* ---------------------------------------------------------------- drawing */
  let camAlt = 0, drawN = 0; const upAt = new THREE.Vector3(0, 1, 0);
  function drawWorld(nearJet, expo) {
    const cp = camera.position, gy = groundY(cp.x, cp.z), alt = Math.max(cp.y - gy, 1);
    const horizon = Math.sqrt(2 * 6371000 * Math.max(cp.y, 2)) + 40000;
    camera.near = clamp(alt * 0.02, 1.2, 14); camera.far = Math.max(90000, horizon * 1.4);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderer.getSize(size);
    terrain.update(camera, size.y);
    city.eyeHeight = Math.max(alt, 240);
    if (gov.every < 2 || drawN++ % gov.every === 0) city.update();
    bake.update(camera, gy);
    shadows.follow(jet.root.position); shadows.update(camera, gy);
    ATMO.uniforms.uTime.value = clock;
    if (envDue && performance.now() > envDue) refreshEnv();
    camAlt = cp.y + (cp.x * cp.x + cp.z * cp.z) * 7.848e-8; ATMO.uniforms.uCamAlt.value = camAlt;
    clouds.render(camera, camAlt, upAt.set(cp.x, cp.y + 6371000, cp.z).normalize());
    renderer.toneMappingExposure = expo;
    camera.layers.set(0);
    renderer.render(scene, camera);
    if (jet.root.parent === scene && jet.root.visible) {
      renderer.autoClear = false; renderer.clearDepth();
      camera.layers.set(1); camera.near = nearJet; camera.far = 1500; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      camera.layers.set(0); renderer.autoClear = true;
    }
  }
  // the ground and buildings for a view are asked for without drawing anything (while the globe is on screen)
  function loadWorld() {
    camera.near = 1.2; camera.far = 160000; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); renderer.getSize(size);
    terrain.update(camera, size.y); city.eyeHeight = 240; city.update();
  }
  function falling(dt, near) {
    const cp = camera.position, far = camPrev.distanceTo(cp) >= 300;
    if (camHad && dt > 0 && !far) camVel.copy(cp).sub(camPrev).multiplyScalar(1 / dt); else if (!camHad || far) camVel.set(0, 0, 0);
    camPrev.copy(cp); camHad = true;
    precip.update(dt, camera, camVel, weather, groundY(cp.x, cp.z), near, clock);
    renderer.getDrawingBufferSize(size); bolt.set(weather.flash.amp, size.x, size.y);
    sound.weather({ rain: precip.level.rain, snow: precip.level.snow, hail: precip.level.hail, speed: camVel.length(), gust: weather.now.gust, cockpit: rig.mode === 'cockpit' });
  }
  function drawStage(expo) {
    ATMO.uniforms.uCloudOn.value = 0; ATMO.uniforms.uShadeOn.value = 0;        // no weather indoors
    stageEnv(false);
    renderer.toneMappingExposure = expo;
    renderer.render(hangar.scene, hangar.camera);
  }
  // The full models arrive behind the title. The film opens on the Earth, so there is time: their shaders are built
  // then (off the main thread), and in the dark between the Earth and the hangar they are drawn once into a corner
  // that the black covers, which puts them on the graphics card. The cut into the hangar then costs nothing.
  const SW = { asked: false, built: false, drawn: 0 };
  function warmStage() {
    if (film.t > FILM.dark || !film.playing) return;
    if (!SW.asked && film.t > 0.02) {
      SW.asked = true; SW.built = false; SW.drawn = 0;
      useLod('ad1', filmLod); useLod('katy', filmLod); stageEnv(true);
      hangar.camera.position.set(-2.6, 1.2, -22.6); hangar.camera.lookAt(0, 1, 0.4); hangar.camera.fov = 44; hangar.camera.updateProjectionMatrix(); hangar.camera.updateMatrixWorld();
      renderer.compileAsync(hangar.scene, hangar.camera).catch((e) => console.warn('precompile', e)).then(() => { SW.built = true; });
    }
    if (SW.built && SW.drawn < 2 && film.t > FILM.dark - 0.42) {
      renderer.setViewport(0, 0, 96, 54); renderer.setScissor(0, 0, 96, 54); renderer.setScissorTest(true);
      hangar.setLamps(4); drawStage(1e-4);
      renderer.setScissorTest(false); renderer.getSize(size); renderer.setViewport(0, 0, size.x, size.y); SW.drawn++;
    }
  }
  const toStage = () => { if (!onStage()) { park(); useLod('ad1', filmLod); useLod('katy', filmLod); adHolder.cockpit(false); katyHolder.cockpit(false); stageEnv(true); resize(); } };
  const toWorld = () => { if (jet.root.parent !== scene) { for (const P of Object.values(PLANES)) P.jet.root.parent?.remove(P.jet.root); scene.add(jet.root); useLod(plane, flyLod); jet.setEnv(envRT.texture, 1.15); resize(); } };
  // the globe as a place is picked from it: the night side lit as by a full moon, the clouds thinned so the ground reads
  const PICK = { cloud: 0.55, night: 0.7, dim: 0.5, stars: 0.7, air: 1, glint: 0.8, flare: 0.5 };
  const pickLook = { ...PICK };
  function drawGlobe(expo = 1) {
    renderer.getSize(size);
    // close in, the clouds are let go altogether
    pickLook.cloud = PICK.cloud * clamp((globe.view.dist - 1.12) / 0.9, 0, 1);
    globe.render(size.x, size.y, pickLook, expo);
  }

  /* ---------------------------------------------------------------- read-outs */
  const tape = $('tape'), PX = 3.6;
  for (let d = -360; d <= 720; d += 10) {
    const i = document.createElement('i'); i.style.left = d * PX + 'px'; if (d % 30 === 0) i.className = 'big'; tape.appendChild(i);
    if (d % 30 === 0) { const b = document.createElement('b'); const a = ((d % 360) + 360) % 360; b.textContent = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a] ?? String(a / 10).padStart(2, '0'); b.style.left = d * PX + 'px'; tape.appendChild(b); }
  }
  const wxEl = $('wx'); let wxAt = 0;
  const el = { spd: $('spd'), alt: $('alt'), vs: $('vs'), pwr: $('pwr').firstChild, got: $('pwr').lastChild, ctl: $('ctl').firstChild, pwrT: $('pwrT'), pwrK: $('pwrK'), where: $('where'), alert: $('alert'), hint: $('hint'), spdU: $('spdU'), altU: $('altU') };
  let hudAt = 0, pwrDev = '', whereText = '';
  const hint = (html, secs = 6) => { el.hint.innerHTML = html; el.hint.classList.add('on'); hintAt = performance.now() + secs * 1000; };
  const mini = new MiniMap({ root: $('mini'), canvas: $('miniCv'), view: store.get('mapzoom', 'area'), on: store.get('map', '1') !== '0',
    out: { dist: $('msDist'), distU: $('msDistU'), time: $('msTime'), top: $('msTop'), topU: $('msTopU'), high: $('msHigh'), highU: $('msHighU') } });
  $('mini').classList.toggle('plain', tierName === 'phone' || tierName === 'low');
  const mapNext = () => { if (mode !== 'fly' || paused || !mini.on) return; hint('Map: ' + mini.next(), 1.6); store.set('mapzoom', mini.view); };
  $('mini').onclick = mapNext;
  function hud(now) {
    tape.style.transform = `translateX(${(-flight.heading * PX).toFixed(1)}px)`;
    el.ctl.style.transform = `translate(${(input.roll * 18).toFixed(1)}px, ${(input.pitch * 18).toFixed(1)}px)`;
    el.got.style.transform = `scaleX(${flight.spool.toFixed(3)})`;
    if (hintAt && now > hintAt) { el.hint.classList.remove('on'); hintAt = 0; }
    mini.draw(now, flight, ATMO.night, units);
    if (now - hudAt < 110) return; hudAt = now;
    const imp = units === 'ft';
    el.spd.textContent = Math.round(flight.V * (imp ? 1.94384 : 3.6)); el.spdU.textContent = imp ? 'kt' : 'km/h';
    const top = world.roof(flight.pos.x, 0, flight.pos.z), g = flight.pos.y - flight.agl, over = Math.max(flight.pos.y - Math.max(g, Number.isFinite(top) ? top : g), 0);
    el.alt.textContent = Math.round((flight.onGround ? 0 : flight.agl - flight.spec.gearH) * (imp ? 3.28084 : 1)); el.altU.textContent = imp ? 'ft' : 'm';
    const vs = flight.vs;
    el.vs.textContent = flight.onGround ? 'on the ground' : Math.abs(vs) < 0.6 ? 'level' : `${vs > 0 ? 'climbing' : 'sinking'} ${imp ? Math.round(Math.abs(vs) * 196.85) + ' ft/min' : Math.abs(vs).toFixed(0) + ' m/s'}`;
    if (input.device !== pwrDev) { pwrDev = input.device; el.pwrK.innerHTML = by('<kbd>RT</kbd>more power<i></i><kbd>LT</kbd>less', '', '<kbd>R</kbd>more power<i></i><kbd>F</kbd>less'); }
    el.pwr.style.transform = `scaleX(${input.throttle.toFixed(3)})`; el.pwrT.textContent = `Power ${Math.round(input.throttle * 100)}%` + (flight.spec.sweepV ? ` · wing ${Math.round(flight.sweep * 60)}°` : '') + (input.brake ? ' · brake' : '');
    el.where.textContent = whereText;
    if (now - wxAt > 1500) { wxAt = now; wxEl.innerHTML = (weather.mode === 'live' ? '<b>LIVE</b>' : '') + weather.line(units); }
    const stall = flight.stall > 0.3 && !flight.onGround, low = !flight.onGround && over < 45 && vs < -4;
    el.alert.textContent = stall ? 'STALL' : 'PULL UP'; el.alert.classList.toggle('on', stall || low);
  }
  const setHud = (k) => { app.style.setProperty('--hud', k.toFixed(3)); $('top').classList.toggle('off', k < 0.5); $('mini').classList.toggle('off', k < 0.5); };
  const setBars = (k) => { app.style.setProperty('--bars', k.toFixed(3)); };

  /* ---------------------------------------------------------------- where the aircraft is: names, runways, the sun */
  const TOWNS = new Set(['city', 'town', 'village']), HOODS = new Set(['city', 'town', 'village', 'suburb', 'hamlet', 'quarter', 'neighbourhood', 'island']);
  const here = { lat: 0, lon: 0, elev: 0 }; let hereAt = 0, sunAt = 0, spotsRev = -1, spotsAt = { lat: 1e9, lon: 0 }, liftWant = 0;
  const km = (m) => (m < 950 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 20000 ? 1 : 0) + ' km');
  function whereNow(now, force = false) {
    if (!force && now - hereAt < 900) return; hereAt = now;
    worldToGeo(flight.pos, here);
    ATMO.lat = here.lat; ATMO.lon = here.lon;
    // the sun: where it really is there now (again every few seconds), or wherever the clock in the menu was put
    if (now - sunAt > 12000 || force) { sunAt = now; if (timeMode === 'live') { const t = localNow(here.lon); setTime(t.hour, t.day); } else setTime(ATMO.hour); applyTime(); showHour(); }
    // the weather sits on the ground here, not on the sea: the mean height of the ground some kilometres round
    { let sum = 0, n = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const e = terrain.elevation(here.lat + j * 0.05, here.lon + i * 0.07); if (e.z >= 0) { sum += Math.max(e.elev, 0); n++; } } if (n) { liftWant = sum / n; if (force) weather.lift = liftWant; } }
    // runways are laid as their airport comes near, and the ground is built again level under them
    for (const a of airports.update(here.lat, here.lon, (la, lo) => terrain.elevation(la, lo).elev)) terrain.rebuildNear(a.lat, a.lon, a.longest / 2 + 500);
    // the line under the compass: the nearest airfield if it is close, else the nearest named place
    const ap = airports.ready ? airports.near(here.lat, here.lon, 9)[0] : null, pl = maps.nearest(here.lat, here.lon, HOODS, 40);
    whereText = ap && (!pl || ap.d * 1000 < 2500) ? `${ap.a.iata || ap.a.id} ${ap.a.name} · ${km(ap.d * 1000)}` : pl ? `${pl.n} · ${km(pl.d)}` : `${Math.abs(here.lat).toFixed(2)}° ${here.lat >= 0 ? 'N' : 'S'}  ${Math.abs(here.lon).toFixed(2)}° ${here.lon >= 0 ? 'E' : 'W'}`;
    // the map's names: towns and airfields round here, the largest first
    if (maps.namesRev !== spotsRev || Math.hypot(here.lat - spotsAt.lat, here.lon - spotsAt.lon) > 0.25) {
      spotsRev = maps.namesRev; spotsAt.lat = here.lat; spotsAt.lon = here.lon;
      const list = [...maps.names.values()].filter((p) => TOWNS.has(p.k) && Math.abs(p.lat - here.lat) < 1.2 && Math.abs(p.lon - here.lon) < 1.8).sort((a, b) => a.r - b.r).slice(0, 60).map((p) => ({ name: p.n, lat: p.lat, lon: p.lon }));
      if (airports.ready) for (const { a } of airports.near(here.lat, here.lon, 90, 1).slice(0, 12)) list.push({ name: a.iata || a.id, lat: a.lat, lon: a.lon });
      mini.setSpots(list);
    }
  }
  // The origin is moved under the aircraft. Everything that was placed is carried across exactly: the same turn of
  // a fraction of a degree and the same slide for the aircraft and the cameras, and each tile and runway put back
  // by working its own place out again.
  const _M = new THREE.Matrix4(), _q = new THREE.Quaternion(), _old = new THREE.Vector3();
  function rebase() {
    const g = worldToGeo(flight.pos, g1), M = moveOrigin(g.lat, g.lon, _M);
    _q.setFromRotationMatrix(M); _old.copy(flight.pos);
    flight.pos.applyMatrix4(M); flight.vel.applyQuaternion(_q); flight.quat.premultiply(_q);
    camera.position.applyMatrix4(M); camera.quaternion.premultiply(_q); rig.q.premultiply(_q); rig.spot.applyMatrix4(M);
    jet.root.position.copy(flight.pos); jet.root.quaternion.copy(flight.quat);
    terrain.rebase(); city.rebase(); airports.rebase(); bake.reset(); roofs.map = null; roofs.at = -1e9;
    const dx = flight.pos.x - _old.x, dz = flight.pos.z - _old.z, S = ATMO.uniforms.uShift.value;
    weather.rebase(dx, dz); camPrev.x += dx; camPrev.z += dz; mini.rebase(flight.pos);
    S.x -= dx; S.y -= dz; if (Math.abs(S.x) > 65536) S.x -= Math.sign(S.x) * 131072; if (Math.abs(S.y) > 65536) S.y -= Math.sign(S.y) * 131072;
    shadows.invalidate(); stats.rebases++;
  }
  const stats = { rebases: 0 };

  /* ---------------------------------------------------------------- flying, crashing, starting again */
  const by = (pad, thumb, keys) => (input.device === 'pad' ? pad : input.device === 'touch' || (touch && input.device !== 'keys') ? thumb : keys);
  const pullAt = () => flight.spec.pullAt || 130;         // km/h
  const POWER = () => by(`Hold <b>RT</b> for power (<b>LT</b> takes it off). Pull the stick back at <b>${pullAt()} km/h</b>. The stick steers, <b>A</b> brakes.`, `Push the <b>right lever</b> up to roll. Pull back on the left thumb at <b>${pullAt()} km/h</b>.`, `Hold <b>R</b> for power (<b>F</b> takes it off). Pull back (<b>S</b>) at <b>${pullAt()} km/h</b>. <b>A D</b> steer, <b>Space</b> brakes.`);
  const FLYING = () => by('<b>Left stick</b> flies · <b>RT</b> more power, <b>LT</b> less · <b>A</b> brake · <b>Y</b> view · <b>right stick</b> looks', '<b>Left thumb</b> flies · <b>right lever</b> is power · drag to look', '<b>A D</b> bank · <b>S</b> nose up, <b>W</b> down · <b>R</b> more power, <b>F</b> less · <b>C</b> view · drag to look');
  let rolled = true;
  function beginFlight() {
    mode = 'fly'; flown = true; toWorld(); document.body.classList.add('flying'); document.body.classList.remove('film');
    input.enabled = true; input.throttle = flight.input.throttle;
    setHud(1); setBars(0); $('skip').style.display = 'none'; $('warn').style.display = 'none';
    perFrame = tier.tilesPerFrame;
    rig.look.yaw = 0; rig.look.pitch = 0; rig.dist = PLANES[plane].view.dist;
    const dark = ATMO.night > 0.8 && timeMode === 'live' ? ' It is night here now: <b>Menu</b>, Time of day, for daylight.' : '';
    if (flight.onGround) { rolled = false; hint(POWER() + dark, 14); } else hint(FLYING() + dark, dark ? 13 : 9);
    input.ui = null; titleNav.close(); whereNow(performance.now(), true); resize();
  }
  function events(now) {
    for (const e of flight.events) {
      if (e === 'touchdown') { sound.hit('touch'); input.buzz(0.7, 110); mini.mark('touchdown'); hint('Down. <b>Brake</b> to stop, or power up and go again.', 5); }
      else if (e === 'liftoff') hint(by('Airborne. <b>RT</b> is more power, <b>LT</b> less.', 'Airborne.', 'Airborne. <b>R</b> is more power, <b>F</b> less.'), 6);
      else if (e.startsWith('crash')) { sound.hit('crash'); input.buzz(1, 280); mini.mark('crash'); crashT = now; $('fade').classList.add('on'); }
    }
    flight.events.length = 0;
    if (flight.onGround && !rolled && flight.V > pullAt() / 3.6) { rolled = true; hint(by('<b>Pull the stick back</b> now.', '<b>Pull back</b> now.', '<b>Pull back</b> now (S).'), 4); }
    if (flight.crashed && now - crashT > 1300) { aloft(260, 190); $('fade').classList.remove('on'); hint('Back in the air.', 3); }
  }
  // back in the air where it is: `back` metres behind, `up` metres over whatever is highest there, pointing the same way
  function aloft(back = 0, up = 500) {
    const h = flight.heading * D2R, x = flight.pos.x - Math.sin(h) * back, z = flight.pos.z + Math.cos(h) * back;
    let top = Math.max(world.ground(x, z).y, Number.isFinite(roofs.top(x, z)) ? roofs.top(x, z) : -1e9, back ? flight.pos.y : -1e9);
    for (let d = 300; d <= 3600; d += 300) top = Math.max(top, world.ground(x + Math.sin(h) * d, z - Math.cos(h) * d).y);       // and clear of the hill ahead
    flight.place({ x, y: top + up, z, heading: flight.heading, speed: 90, throttle: 0.66 });
    input.throttle = 0.66; rig.snap(); roofs.map = null; roofs.at = -1e9;
  }

  /* ---------------------------------------------------------------- which aircraft */
  const chips = () => document.querySelectorAll('.chip[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === plane));
  const planeUI = () => { $('planes').querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', b.dataset.p === plane)); chips(); };
  function setPlane(name) {
    if (!PLANES[name] || name === plane) return plane;
    const P = PLANES[name], was = jet, inWorld = jet.root.parent === scene;
    plane = name; jet = P.jet; store.set('plane', name);
    flight.setSpec(P.spec); rig.jet = jet; rig.fit(P.view);
    if (inWorld) {
      scene.remove(was.root); scene.add(jet.root); useLod(name, flyLod); jet.setEnv(envRT.texture, 1.15);
      jet.root.position.copy(flight.pos); jet.root.quaternion.copy(flight.quat); jet.pose(0, { parked: 0, sweep: flight.sweep }); jet.uLamp.value = 0.5 + 1.2 * ATMO.night;
      if (mode === 'fly') rig.update(0);
    }
    jet.cockpit(rig.mode === 'cockpit'); planeUI();
    if (mode === 'fly' && !paused) hint(P.line, 5);
    return plane;
  }
  document.querySelectorAll('.chip[data-p]').forEach((b) => { b.onclick = () => setPlane(b.dataset.p); });

  /* ---------------------------------------------------------------- picking a place, and going there */
  const picker = new Picker({ globe, airports, maps, canvas: cv, touch, units: () => units, go: (dest) => goTo(dest), back: () => closeGlobe(), isOpen: () => mode === 'globe' });
  let dive = null;
  function openGlobe(first = false) {
    if (mode === 'fly') { setPaused(false); const g = worldToGeo(flight.pos, g1); globe.jumpTo(g.lat, g.lon, 1.6); globe.flyTo(g.lat, g.lon, 0.35); }
    mode = 'globe'; input.enabled = false; setHud(0); setBars(0); sound.suspend?.(false);
    document.body.classList.remove('flying', 'film'); $('skip').style.display = 'none'; $('title').style.display = 'none';
    globe.setSun(new Date()); picker.open(flown && !first); resize();
    sound.music?.(0.55, 0.8);
  }
  function closeGlobe() { if (!flown) return; picker.close(); mode = 'fly'; document.body.classList.add('flying'); input.enabled = true; setHud(1); resize(); }
  // Put the world under a place: the origin moves there, what was built for the last place is let go, and the sun
  // and the weather are asked for again.
  function setPlace(lat, lon) {
    setOrigin(lat, lon);
    terrain.rebase(); terrain.rootAt = ''; terrain.setRoots(lat, lon);
    city.clear(); for (const id of [...airports.active.keys()]) airports.lift(id); airports.at0.lat = 1e9;
    bake.reset(); roofs.map = null; roofs.at = -1e9; ATMO.uniforms.uShift.value.set(0, 0); camHad = false;
    weather.pos.lat = lat; weather.pos.lon = lon; weather.mapC.set(0, 0); weather.data = null; weather.nextTry = 0; weather._since = 9;
    ATMO.lat = lat; ATMO.lon = lon; sunAt = 0;
    if (timeMode === 'live') { const t = localNow(lon); setTime(t.hour, t.day); } else setTime(ATMO.hour);
    applyTime(); showHour(); mini.reset(lat, lon); spotsRev = -1; shadows.invalidate();
  }
  // dest: { name, lat, lon, airport (lined up on its runway) | alt, hdg (in the air) }
  function goTo(dest) {
    picker.close(); sound.unlock(); $('title').style.display = 'none'; hangar.camera.clearViewOffset();
    if (mode === 'fly') setPaused(false);
    mode = 'dive'; input.enabled = false; setHud(0); document.body.classList.remove('flying');
    dive = { dest, t: 0, peak: 1, stage: 'load', at: null };
    $('diveName').textContent = dest.name || 'Somewhere on Earth'; $('diveNote').textContent = 'Building the ground'; $('dive').classList.add('on'); $('dive').style.setProperty('--k', '0.04');
    globe.flyTo(dest.lat, dest.lon, 0.0018); globe.spin = 0;
    setPlace(dest.lat, dest.lon);
    // where the first view will be from, near enough for its ground to be asked for: 700 m up, looking along the way it will fly
    const hdg = (dest.hdg ?? 0) * D2R;
    camera.position.set(-Math.sin(hdg) * 900, 1400, Math.cos(hdg) * 900); camera.up.set(0, 1, 0); camera.lookAt(Math.sin(hdg) * 2500, 0, -Math.cos(hdg) * 2500); camera.fov = 45; camera.updateMatrixWorld();
    if (dest.airport) { const rec = airports.lay(dest.airport, null); rec.keep = true; }
    resize();
  }
  function diving(dt) {
    const d = dive; d.t += dt;
    const left = terrain.stats.loading + Math.min(city.pending, 12) * 0.5; d.peak = Math.max(d.peak, left);
    $('dive').style.setProperty('--k', clamp(Math.max(d.t / 14, 1 - left / d.peak), 0.04, 1).toFixed(3));
    if (d.stage === 'load') {
      const D = d.dest, zHere = terrain.elevation(D.lat, D.lon).z;
      // The way in is settled as soon as it can be: in the air at once; on a runway once the ground round the
      // airport is known well enough to say which end to start from. From then on the ground is asked for from
      // where the first picture will really be taken (and that place is put right as better heights arrive).
      if (!d.at) {
        if (!D.airport) { const hdg = D.hdg ?? 0, [la, lo] = destination(D.lat, D.lon, (hdg + 180) % 360, 1500); d.at = { kind: 'air', lat: la, lon: lo, heading: hdg, alt: D.alt ?? 480 }; }       // a little back from the place, so it is ahead and below
        else if (zHere >= 10 || d.t > 6) {
          const windFrom = weather.data ? weather.now.windDir : null, p = airports.pick(D.airport, windFrom, (la, lo) => terrain.elevation(la, lo).elev);
          terrain.rebuildNear(D.airport.lat, D.airport.lon, D.airport.longest / 2 + 500);
          d.at = { kind: 'runway', runway: p.runway, far: p.far };
        }
      }
      if (d.at && (d.t - (d.begun ?? -9) > 0.35)) { d.begun = d.t; arrival.begin(d.at); }
      if (d.at) arrival.firstView(camera);
      loadWorld(); groundY(camera.position.x, camera.position.z);
      const ground = zHere >= 13 && terrain.lastZoom >= Math.min(15, terrain.maxZ - 2), most = city.pending <= 3 || d.t > 5;
      if (d.at && d.t > 2.2 && ((ground && most) || d.t > 11)) {
        toWorld(); jet.root.visible = true;
        arrival.begin(d.at); arrival.firstView(camera); whereNow(performance.now(), true);
        d.stage = 'settle'; d.t2 = 0; $('diveNote').textContent = 'Nearly there';
      }
    } else if (d.stage === 'settle') {
      // the first view's own tiles, and the shaders for what is new, before the picture is shown
      d.t2 += dt; arrival.firstView(camera); loadWorld();
      if (!d.compiling) { d.compiling = true; camera.layers.set(0); renderer.compileAsync(scene, camera).catch((e) => console.warn('precompile', e)).then(() => { d.compiled = true; }); }
      groundY(camera.position.x, camera.position.z);
      if (d.compiled && (d.t2 > 0.6 || d.t2 > 6)) { d.stage = 'fade'; d.t3 = 0; $('fade').classList.add('on'); }
    } else if (d.stage === 'fade') {
      d.t3 += dt;
      if (d.t3 > 0.3) {
        // one draw of the world behind the black, so the first frame shown is not the one that puts it on the graphics card
        arrival.at(0, 0); drawWorld(0.3, 0.0001);
        mode = 'arrive'; setBars(1); $('dive').classList.remove('on'); document.body.classList.add('film'); $('skip').style.display = Q.has('test') ? 'none' : 'block';
        input.ui = { accept: () => arrival.skip(), back: () => arrival.skip(), start: () => arrival.skip() };
        setTimeout(() => $('fade').classList.remove('on'), 60); dive = null; globe.rest(); resize();
        return;
      }
    }
    globe.update(dt); drawGlobe(1);
  }

  /* ---------------------------------------------------------------- menu */
  const menu = $('menu');
  const setPaused = (on) => {
    if (mode !== 'fly') return;
    paused = on; menu.classList.toggle('on', on); sound.suspend(on);
    input.ui = on ? menuUI : null; if (on && input.device === 'pad') menuNav.open($('mResume')); else menuNav.close();
    if (on) { gfxUI(); wxUI(); const ap = airports.ready ? airports.near(here.lat, here.lon, 250)[0] : null;
      $('mRunway').textContent = ap ? `Take off from ${ap.a.name} (${km(ap.d * 1000)})` : 'No runway near here'; $('mRunway').disabled = !ap; $('mRunway')._a = ap?.a;
      $('mWhere').textContent = `${whereText}. ${Math.abs(here.lat).toFixed(3)}° ${here.lat >= 0 ? 'N' : 'S'}, ${Math.abs(here.lon).toFixed(3)}° ${here.lon >= 0 ? 'E' : 'W'}. Ground ${Math.round(flight.pos.y - flight.agl)} m above the sea.`; }
  };
  const menuNav = padNav($('card')), titleNav = padNav($('title'));
  const menuUI = { move: (dx, dy) => menuNav.move(dx, dy), accept: () => menuNav.accept(), back: () => setPaused(false), start: () => setPaused(false) };
  $('bMenu').onclick = () => setPaused(true); $('mResume').onclick = () => setPaused(false);
  menu.addEventListener('pointerdown', (e) => { if (e.target === menu) setPaused(false); });
  $('bView').onclick = () => { if (mode === 'fly') hint('View: ' + rig.next(), 1.6); };
  const mark = (box, fn) => box.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', fn(b)));
  $('mGlobe').onclick = () => openGlobe();
  $('mRunway').onclick = () => { const a = $('mRunway')._a; if (a) goTo({ name: a.name, lat: a.lat, lon: a.lon, airport: a }); };
  $('mAir').onclick = () => { aloft(0, 600); setPaused(false); hint('Back in the air.', 3); };
  const hour = $('hour'), showHour = () => { const h = ATMO.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); $('hourOut').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; hour.value = h; $('hNow').classList.toggle('on', timeMode === 'live'); };
  const setHour = (h) => { timeMode = 'set'; store.set('time', 'set'); setTime(h); applyTime(); showHour(); store.set('hour', h); };
  hour.addEventListener('input', () => setHour(+hour.value));
  menu.querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => setHour(+b.dataset.h); });
  $('hNow').onclick = () => { timeMode = 'live'; store.set('time', 'live'); sunAt = 0; whereNow(performance.now(), true); };
  { const add = (k, name) => { const b = document.createElement('button'); b.className = 'opt'; b.dataset.w = k; b.textContent = name; b.onclick = () => { weather.choose(k); store.set('wx', k); wxUI(); wxAt = 0; }; $('wxOpts').appendChild(b); };
    add('live', 'Live: as it is there now'); for (const k of MENU) add(k, CONDITIONS[k].name); }
  wxUI = () => { mark($('wxOpts'), (b) => b.dataset.w === (weather.mode === 'live' ? 'live' : weather.key)); $('wxSrc').textContent = (weather.mode === 'live' ? weather.line(units) + '. ' : '') + weather.source(); };
  const assistUI = () => mark($('assist'), (b) => b.dataset.a === flight.assist);
  $('assist').querySelectorAll('.opt').forEach((b) => { b.onclick = () => { flight.assist = b.dataset.a; flight.gammaT = flight.pitch; store.set('assist', flight.assist); assistUI(); }; });
  const respUI = () => mark($('resp'), (b) => b.dataset.r === input.response);
  $('resp').querySelectorAll('.opt').forEach((b) => { b.onclick = () => { input.response = b.dataset.r; store.set('response', input.response); respUI(); }; });
  const padUI = () => {
    const b = $('mPad');
    b.textContent = !input.padAllowed ? 'Controller: off' : input.padActive ? 'Controller: in use' : input.padCount ? 'Controller: press a button on it to use it' : 'Controller: none found';
    b.classList.toggle('on', input.padActive);
    $('keys').innerHTML = keysText() + (input.padCount || input.padActive ? PADKEYS : '');
  };
  $('mPad').onclick = () => { input.allowPad(!input.padAllowed); padUI(); };
  const PADKEYS = '<br>Controller: left stick flies · right stick looks · <kbd>RT</kbd> more power, <kbd>LT</kbd> less · <kbd>LB</kbd> <kbd>RB</kbd> rudder · <kbd>A</kbd> brakes · <kbd>Y</kbd> view · <kbd>X</kbd> look ahead · <kbd>Back</kbd> map · cross up and down moves the camera · <kbd>Start</kbd> menu. In the menu the cross moves, <kbd>A</kbd> presses, <kbd>B</kbd> goes back.';
  let toldPad = false;
  input.on.pads = (n) => {
    padUI();
    if (!n || input.padActive || !input.padAllowed || toldPad) return;
    toldPad = true;
    if (mode === 'fly' && !paused) hint('Controller found. Press <b>A</b> on it to fly with it.', 7);
    else if (mode === 'title') note('Controller found. Press A on it to use it.');
  };
  input.on.padOn = () => {
    padUI();
    if (mode === 'title') { note('Controller on. A starts.'); titleNav.open($('start')); }
    else if (mode === 'fly' && !paused) hint(flight.onGround && flight.V < 20 ? POWER() : FLYING(), 9);
    else if (paused) menuNav.open($('mResume'));
  };
  input.on.device = (d) => { if (d !== 'pad') { menuNav.close(); titleNav.close(); } else if (paused) menuNav.open(menuNav.at || $('mResume')); else if (mode === 'title') titleNav.open(titleNav.at || $('start')); };
  const mouseUI = () => { $('mMouse').textContent = input.mouseFly ? 'Mouse flies (hold a button to look)' : 'Mouse looks around'; $('mMouse').classList.toggle('on', input.mouseFly); $('mMouse').style.display = touch ? 'none' : ''; };
  $('mMouse').onclick = () => { input.mouseFly = !input.mouseFly; store.set('mouse', input.mouseFly ? '1' : '0'); mouseUI(); };
  const invertUI = () => { $('mInvert').textContent = input.invert ? 'Up = nose up' : 'Up = nose down (like a stick)'; };
  $('mInvert').onclick = () => { input.invert = !input.invert; store.set('invert', input.invert ? '1' : '0'); invertUI(); };
  const unitsUI = () => { $('mUnits').textContent = units === 'ft' ? 'knots · feet' : 'km/h · metres'; };
  $('mUnits').onclick = () => { units = units === 'ft' ? 'm' : 'ft'; store.set('units', units); unitsUI(); };
  const fpsCan = tierName === 'high' && !touch, fpsEl = $('fpsN');
  let fpsOn = fpsCan && store.get('fps', '1') !== '0';
  const fpsUI = () => { $('fps').classList.toggle('on', fpsOn); const b = $('mFps'); b.style.display = fpsCan ? '' : 'none'; b.textContent = fpsOn ? 'Frame rate shown' : 'Frame rate hidden'; b.classList.toggle('on', fpsOn); };
  $('mFps').onclick = () => { fpsOn = !fpsOn; store.set('fps', fpsOn ? '1' : '0'); fpsUI(); };
  const mapUI = () => { $('mMap').textContent = mini.on ? 'Map on' : 'Map off'; };
  $('mMap').onclick = () => { mini.setOn(!mini.on); store.set('map', mini.on ? '1' : '0'); mapUI(); }; mapUI();
  const soundUI = () => { $('mSound').textContent = sound.muted ? 'Sound off' : 'Sound on'; };
  $('mSound').onclick = () => { sound.mute(!sound.muted); soundUI(); };
  const musicUI = () => { $('mMusic').textContent = sound.musicOn ? 'Music on' : 'Music off'; };
  $('mMusic').onclick = () => { sound.setMusic(!sound.musicOn); musicUI(); }; musicUI();
  for (const [k, t] of Object.entries(TIERS)) { const b = document.createElement('button'); b.className = 'opt' + (k === tierName ? ' on' : ''); b.textContent = t.label; b.onclick = () => { if (k === tierName) return; store.set('tier', k); const u = new URL(location.href); u.searchParams.delete('q'); location.href = u.href; }; $('tiers').appendChild(b); }
  const gfxUI = () => { $('gfx').textContent = `Drawing with: ${GFX.name}. ` + (gov.steps ? `Detail is eased ${gov.steps} of ${gov.most} steps to keep the frames coming; it comes back when there is room.` : 'Detail is eased automatically if frames run slow.') + ` ${city.stats.buildings.toLocaleString()} buildings and ${terrain.stats.tiles} squares of ground are drawn just now.`; };
  gfxUI();
  let toldSlow = false;
  const tooMuch = () => {
    if (toldSlow) return; toldSlow = true;
    const i = ORDER.indexOf(tierName); if (i <= 0) return;
    const lighter = ORDER[i - 1]; store.set('easier', lighter);
    hint(`Running slowly here. <b>Menu</b>, then <b>${TIERS[lighter].label}</b> under Detail, will be smoother.`, 12);
  };
  const keysText = () => (touch ? 'Left thumb: fly (it works wherever the thumb lands). Right lever: power. Turn and pull together for a tight turn. Drag anywhere else to look, pinch to move the camera in or out, double tap to look ahead again. Tap the map to show more or less of the trip.'
    : '<kbd>A</kbd> <kbd>D</kbd> bank · <kbd>S</kbd> nose up · <kbd>W</kbd> nose down · <kbd>Q</kbd> <kbd>E</kbd> rudder · <kbd>R</kbd> more power, <kbd>F</kbd> less (also <kbd>+</kbd> <kbd>−</kbd> or Page Up and Page Down) · <kbd>Space</kbd> brakes · <kbd>C</kbd> view · <kbd>V</kbd> look ahead · <kbd>M</kbd> map · <kbd>G</kbd> the globe · drag to look, wheel to move the camera. A tap on a key is a small correction; holding it is the full stick. Turn and pull together for a tight turn. A controller works too, once a button on it is pressed.');
  $('planes').querySelectorAll('.opt').forEach((b) => { b.onclick = () => setPlane(b.dataset.p); });
  $('mFilm').onclick = () => { setPaused(false); startFilm(); };
  assistUI(); invertUI(); unitsUI(); soundUI(); respUI(); mouseUI(); showHour(); padUI(); fpsUI(); planeUI();
  input.on.pause = () => { if (mode === 'film') film.skip(); else if (mode === 'arrive') arrival.skip(); else if (mode === 'globe') closeGlobe(); else setPaused(!paused); };
  input.on.view = () => { if (mode === 'fly' && !paused) hint('View: ' + rig.next(), 1.6); };
  input.on.map = mapNext;
  input.on.recentre = () => rig.recentre();
  input.on.look = (dx, dy) => { if (mode === 'fly' && !paused) rig.drag(dx, dy); };
  input.on.zoom = (k) => { if (mode === 'fly' && !paused && rig.mode === 'chase') rig.zoom(k); };
  addEventListener('keydown', (e) => { if (e.code === 'KeyG' && mode === 'fly' && !paused && !e.repeat) openGlobe(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'fly' && !Q.has('test')) setPaused(true); });

  /* ---------------------------------------------------------------- title and film */
  const startBtn = $('start');
  setHud(0);
  // the view the film comes down to: the part of the world the visitor's own clock says they are in
  const home = () => ({ lat: 24, lon: clamp(-new Date().getTimezoneOffset() / 4, -170, 170), dist: 3.35, dim: PICK.dim, cloud: PICK.cloud });
  const film = new Film({ hangar, globe, planes: PLANES, sound, hero: () => plane, home });
  function leaveTitle() {
    sound.unlock();
    if (touch && !Q.has('test')) {
      try { const p = app.requestFullscreen?.({ navigationUI: 'hide' }); p?.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {}); } catch { /* not allowed here */ }
      try { navigator.wakeLock?.request('screen').catch(() => {}); } catch { /* not supported */ }
    }
    $('title').classList.add('off'); setTimeout(() => { $('title').style.display = 'none'; }, 400);
    hangar.camera.clearViewOffset(); titleNav.close();
  }
  function startFilm() {
    if (mode === 'fly') setPaused(false);
    leaveTitle(); picker.close();
    input.enabled = false; setHud(0); document.body.classList.remove('flying'); document.body.classList.add('film');
    globe.setSun(new Date());
    if (Q.get('film') === '0') { toGlobe(); return; }
    toStage(); mode = 'film'; film.start(); setBars(1); $('skip').style.display = 'block'; resize();
    input.ui = { accept: () => film.skip(), back: () => film.skip(), start: () => film.skip() };
  }
  function toGlobe() {
    leaveTitle();
    const H = home(); globe.jumpTo(H.lat, H.lon, H.dist); Object.assign(pickLook, PICK);
    openGlobe(true);
    // a link straight to a place: ?apt=LOWI, or ?lat=..&lon=.. (&alt= metres over the ground, &hdg= degrees)
    const direct = () => {
      if (Q.get('apt')) { const a = airports.byId(Q.get('apt')); if (a) return goTo({ name: a.name, lat: a.lat, lon: a.lon, airport: a }); }
      if (Q.has('lat') && Q.has('lon')) return goTo({ name: Q.get('name') || '', lat: +Q.get('lat'), lon: +Q.get('lon'), alt: +Q.get('alt') || 480, hdg: +Q.get('hdg') || 0 });
    };
    if (Q.get('apt')) airports.load().then(direct); else direct();
  }
  input.ui = { move: (dx, dy) => titleNav.move(dx, dy), accept: () => { if (titleNav.at) titleNav.accept(); else if (!startBtn.disabled) startFilm(); }, start: () => { if (!startBtn.disabled) startFilm(); }, alt: () => toGlobe() };
  startBtn.onclick = () => { if (!startBtn.disabled) startFilm(); };
  $('start2').onclick = () => toGlobe();
  $('skip').onclick = () => { if (mode === 'film') film.skip(); else if (mode === 'arrive') arrival.skip(); };
  addEventListener('keydown', (e) => { if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space') && !startBtn.disabled) startFilm(); });
  startBtn.disabled = false; startBtn.classList.add('ready'); $('startT').textContent = 'START';
  BOOT.done = true; load(1);
  note(touch ? 'Best sideways, with sound.' : 'Best with sound. Enter starts.');

  /* ---------------------------------------------------------------- frame */
  let raf = 0, last = performance.now(), frames = 0, fpsAt = last, fps = 0;
  // where the title's camera stands and looks for each aircraft (hangar metres); it travels from one to the other when the choice changes
  const TITLE = { ad1: { pos: [-19.0, 1.7, -9.0], look: [-2.6, 1.0, 2.5] }, katy: { pos: [15.0, 1.5, -13.0], look: [1.8, 1.1, 1.0] } };
  const titleP = [...TITLE[plane].pos], titleL = [...TITLE[plane].look];
  function step(dt, now) {
    clock += dt;
    const flying = mode === 'fly' || mode === 'arrive';
    if (flying) { weather.lift += (liftWant - weather.lift) * (1 - Math.exp(-dt / 20)); const cp = camera.position; weather.update(paused ? 0 : dt, camera, cp.y + (cp.x * cp.x + cp.z * cp.z) * 7.848e-8, flight.pos); flight.wind.copy(weather.wind); flight.rough = weather.bump; }
    input.update(dt);
    if (mode === 'title') {
      if (frames % 24 === 0) { renderer.getSize(size); film.ahead(frames % 48 ? 6.4 : 1.0, size.y); }       // the film's first shot, ready before START is pressed
      // a slow drift round the pair, favouring the one that is picked
      const TV = TITLE[plane], kk = Math.min(1, dt * 1.5), sway = 0.9 * Math.sin(clock * 0.11), c = hangar.camera;
      for (let i = 0; i < 3; i++) { titleP[i] += (TV.pos[i] - titleP[i]) * kk; titleL[i] += (TV.look[i] - titleL[i]) * kk; }
      c.position.set(titleP[0] + sway, titleP[1] + 0.18 * Math.sin(clock * 0.07), titleP[2] - 0.4 * sway);
      c.up.set(0, 1, 0); c.lookAt(v1.set(titleL[0], titleL[1], titleL[2])); c.fov = 30 * Math.max(1, 1.5 / Math.max(c.aspect, 0.4)); c.updateProjectionMatrix();
      renderer.getSize(size); c.setViewOffset(size.x, size.y, (c.aspect > 1.2 ? -0.13 : 0) * size.x, (c.aspect > 1.2 ? 0.12 : 0.22) * size.y, size.x, size.y);
      for (const P of Object.values(PLANES)) P.jet.pose(dt, { parked: 1 });
      drawStage(hangar.exposure);
    } else if (mode === 'film') {
      renderer.getSize(size);
      if (frames % 10 === 0) film.ahead(film.t < FILM.dark ? film.t + 4.5 : FILM.fall + 1.2, size.y);       // the next shot's ground, before it is wanted
      const s = film.update(dt);
      warmStage();
      setBars(s.bars);
      if (s.stage) drawStage(s.exposure); else { renderer.getSize(size); globe.render(size.x, size.y, s.look, s.exposure); }
      if (s.done) { Object.assign(pickLook, PICK); toGlobe(); }
    } else if (mode === 'globe') {
      globe.update(dt); drawGlobe(1); renderer.getSize(size); picker.update(dt, size.x, size.y);
    } else if (mode === 'dive') {
      diving(dt);
    } else if (mode === 'arrive') {
      const s = arrival.update(dt);
      setBars(s.bars); setHud(s.hud);
      falling(dt, 0.7); drawWorld(s.near ?? 0.3, exposure * s.exposure); hud(now); whereNow(now);
      if (s.done) beginFlight();
    } else {
      if (!paused) {
        const I = flight.input; I.roll = input.roll; I.pitch = input.pitch; I.yaw = input.yaw; I.throttle = input.throttle; I.brake = input.brake;
        const wasOn = flight.onGround, x0 = flight.pos.x, z0 = flight.pos.z;
        flight.step(dt);
        if (!flight.onGround && !flight.crashed) flight.pos.y -= ((flight.pos.x * flight.vel.x + flight.pos.z * flight.vel.z) / 6371000) * dt;       // the Earth curving away under a level path
        if (flight.pos.x * flight.pos.x + flight.pos.z * flight.pos.z > REBASE * REBASE) rebase();
        mini.track(flight, dt);
        jet.root.position.copy(flight.pos); jet.root.quaternion.copy(flight.quat);
        jet.pose(dt, { roll: input.roll, pitch: input.pitch, yaw: input.yaw, throttle: input.throttle, parked: 0, look: clamp(flight.bank * 0.9, -0.8, 0.8), sweep: flight.sweep,
          wheel: flight.onGround || wasOn ? Math.hypot(flight.pos.x - x0, flight.pos.z - z0) : 0 });
        jet.uHeat.value = 0.08 + 0.4 * flight.spool;
        events(now);
        if (flight.buffet > 0.12) input.buzz(Math.min(0.2 + flight.buffet * 0.6, 0.8), 70);
        rig.update(dt);
        roofs.update(flight.pos, flight.vel, now);
        const d = camera.position.distanceTo(flight.pos);
        sound.update({ spool: 0.3 + 0.7 * flight.spool, speed: flight.V, where: rig.mode, dist: d, closing: rig.mode === 'flyby' ? (rig._d0 - d) / Math.max(dt, 1e-3) : 0, buffet: flight.buffet, ground: flight.onGround });
        rig._d0 = d;
        sound.music(0.3, 0.5);
        whereNow(now);
      }
      falling(paused ? 0 : dt, rig.mode === 'cockpit' ? 1.5 : 0.7);
      drawWorld(rig.near, exposure); hud(now);
    }
    frames++;
    if (now - fpsAt > 1000) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; if (fpsOn) fpsEl.textContent = Math.round(fps); }
  }
  let shown = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const t0 = performance.now();
    step(dt, now);
    if (shown < 2 && ++shown === 2) { document.body.classList.add('live'); BOOT.live = performance.now(); }
    if ((mode === 'fly' && !paused) || mode === 'arrive') { gov.frame(dt, performance.now() - t0, gpuDone); if (gov.exhausted) tooMuch(); }
  }
  try { await renderer.compileAsync(hangar.scene, hangar.camera); } catch (e) { console.warn('precompile', e); }
  try { await renderer.compileAsync(globe.scene, globe.camera); } catch (e) { console.warn('precompile', e); }
  raf = requestAnimationFrame(frame);

  /* ---------------------------------------------------------------- console / test handle */
  window.__fly = {
    THREE, renderer, scene, camera, hangar, globe, picker, film, arrival, flight, rig, input, sound, terrain, city, maps, airports, roofs, shadows, gov, tier, tierName, GFX, NET, ATMO, FILM, world, weather, clouds, precip, mini, stats, PLANES,
    get jet() { return jet; }, get mode() { return mode; }, get fps() { return fps; }, get plane() { return plane; }, get dive() { return dive; }, get here() { return here; },
    setPlane, goTo, openGlobe, toGlobe, startFilm, setHour, aloft, rebase, setPaused,
    // put the aircraft anywhere near the origin: latitude, longitude, metres above sea level, heading
    goto({ lat, lon, alt = 1500, heading = 0, pitch = 0, bank = 0, speed = 100, look = [0, 0], view = 'chase' }) {
      const w = geoToWorld(lat, lon, alt);
      flight.place({ x: w.x, y: w.y, z: w.z, heading, pitch, roll: bank, speed, throttle: 0.7 });
      input.throttle = 0.7; if (rig.mode !== view) rig.set(view);
      rig.snap(); rig.look.yaw = look[0] * D2R; rig.look.pitch = look[1] * D2R; roofs.map = null; roofs.at = -1e9;
      jet.root.position.copy(flight.pos); jet.root.quaternion.copy(flight.quat);
      return true;
    },
    // draw one moment of the film
    filmAt(t) { cancelAnimationFrame(raf); $('title').style.display = 'none'; hangar.camera.clearViewOffset(); toStage(); mode = 'film'; film.playing = false; if (!film.S.lengthSq()) film.frame(); film.t = t; const s = film.at(t, 0); setBars(s.bars); if (s.stage) drawStage(s.exposure); else { renderer.getSize(size); globe.render(size.x, size.y, s.look, s.exposure); } return { shot: s.shot, stage: s.stage, exposure: +s.exposure.toFixed(2) }; },
    run(n = 1, dt = 1 / 60) { cancelAnimationFrame(raf); for (let i = 0; i < n; i++) step(dt, performance.now()); return { mode, V: flight.V, agl: flight.agl, crashed: flight.crashed }; },
    resume() { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); },
    async settle(maxMs = 30000, quiet = 1500) {
      const t0 = performance.now(); let calm = t0, idle = 0;
      while (performance.now() - t0 < maxMs && idle < quiet) {
        if (terrain.stats.loading > 0 || city.loading || maps.busy || maps.queue.length) calm = performance.now();
        idle = performance.now() - calm;
        for (let k = 0; k < 6; k++) await hop(); await new Promise((r) => setTimeout(r, 30));
      }
      return { ms: Math.round(performance.now() - t0), done: idle >= quiet, ground: terrain.stats.tiles, masks: terrain.stats.masks, squares: city.stats.tiles, buildings: city.stats.buildings, photo: NET.photo, height: NET.height, map: NET.map, fails: NET.fails };
    },
    async shot(name = 'shot') {
      const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
      return (await fetch(`/__shot/${name}.jpg`, { method: 'POST', body: blob })).json();
    },
  };
}

boot().catch((e) => {
  console.error(e);
  const f = document.getElementById('fail');
  f.style.display = 'flex'; f.textContent = 'Could not start: ' + (e.message || e) + '. ';
  if (window.__boot) window.__boot.failed = true;
  const b = document.createElement('button'); b.textContent = 'Load again'; b.className = 'again'; b.onclick = () => location.replace(location.pathname + '?again=' + Date.now()); f.appendChild(b);
});
