// app.js — Tokyo Flight: title, the opening film, then flying the Katy over the streamed city.
// The city itself (ground, buildings, sky, shadows) is the same engine the map page uses (explore.html).
import * as THREE from 'three';
import { ATMO, setTime, installCascades, SunShadows, makeSky, makeEnvironment } from './atmo.js';
import { Terrain, GroundBake } from './terrain.js';
import { Clouds } from './clouds.js';
import { Weather, CONDITIONS, MENU, tokyoNow } from './weather.js';
import { Precip, Bolt } from './precip.js';
import { City } from './city.js';
import { BakedCity } from './baked.js';
import { PLACES } from './places.js';
import { worldToGeo, geoToWorld } from './geo.js';
import { NET, EXPLORE, CITY } from './net.js';
import { TIERS, ORDER, graphicsDevice, pickTier, Governor } from './fly/perf.js';
import { loadJet, addLod, GEAR_H } from './fly/jet.js';
import { Flight, SPEC, AD1 } from './fly/flight.js';
import { loadAD1, AD1_VIEW, AD1_BYTES } from './fly/ad1.js';
import { Rig } from './fly/chase.js';
import { Input, padNav } from './fly/input.js';
import { Sound } from './fly/sound.js';
import { Hangar } from './fly/hangar.js';
import { Film, T as FILM, RAIL } from './fly/film.js';
import { Roofs } from './fly/roofs.js';
import { MiniMap } from './fly/minimap.js';
import { Runway } from './fly/runway.js';
import { loadAirfield } from './fly/airfield.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, D2R = Math.PI / 180;
const store = { get(k, d) { try { return localStorage.getItem('tokyo.' + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('tokyo.' + k, v); } catch { /* private window */ } } };
const hop = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });

async function boot() {
  const GFX = graphicsDevice(), tierName = pickTier(Q, GFX), tier = TIERS[tierName];
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
    w.style.display = 'block'; w.onclick = () => { w.style.display = 'none'; };        // said once; a tap puts it away
  }
  const note = (s) => { $('note').textContent = s; };
  const BOOT = window.__boot || (window.__boot = {});      // the page's own watchdog reads this (index.html)
  const load = (f) => { $('start').style.setProperty('--load', Math.min(1, f).toFixed(3)); };
  BOOT.stage = 'aircraft'; note('Loading the aircraft'); load(0.12);

  /* ---------------------------------------------------------------- the hangar and the aircraft: enough for the title */
  installCascades();
  setTime(+Q.get('t') || +store.get('hour', 9));
  const hangar = new Hangar(renderer, tier);
  const sound = new Sound();
  const flyLod = Q.get('jet') || tier.jet, filmLod = Q.get('jet') || tier.jetFilm || tier.jet;
  // Every device starts with the small model (1.3 MB), so the title is up as soon as that is here. The full one
  // (4.3 MB) comes in behind the title and is used from then on wherever this device was going to use it.
  const firstLod = Q.get('jet') || 'lo';
  const jet = await loadJet(firstLod, undefined, (got, total) => { const f = got / (total || 1.3e6); load(0.12 + 0.6 * f); note('Loading the aircraft ' + Math.round(Math.min(f, 1) * 100) + '%'); });
  BOOT.stage = 'scene'; note('Setting the scene'); load(0.78);
  for (const l of new Set([flyLod, filmLod])) {
    if (l !== firstLod) addLod(jet, l).then(() => { if (jet.root.parent === hangar.scene ? l === filmLod : l === flyLod && plane === 'katy') jet.use(l); }).catch((e) => console.warn('full model', e.message || e));
  }
  // The Katy is the aircraft: the title, the film and every visit start with it. The AD-1 is a second one to fly,
  // picked in the menu (further down); its model is fetched then.
  let plane = 'katy';
  jet.root.position.set(0, GEAR_H, 0); jet.pose(0, { parked: 1 });
  hangar.scene.add(jet.root);
  hangar.setLamps(4);
  jet.setEnv(hangar.refreshEnv(jet.root, true), 1);

  /* ---------------------------------------------------------------- the city */
  const scene = new THREE.Scene();
  scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 200000);
  const sky = makeSky(); scene.add(sky);
  const shadows = new SunShadows(scene, { radii: tier.cascades, sizes: tier.csize, near: { size: tier.jetShadow, radius: 7 } });
  const fill = new THREE.AmbientLight(0xffdcb4, 0); scene.add(fill);
  const bounce = new THREE.HemisphereLight(0xece9e2, 0xa89f90, 1); scene.add(bounce);
  for (const l of [...shadows.all, fill, bounce]) l.layers.enable(1);
  let envRT = null, envDue = 0, exposure = 1;
  // the sky's own light on the ground and how far the picture is opened up: both follow the weather (a closed sky
  // still lights the ground, evenly; a storm is dark)
  const applyLight = () => {
    fill.intensity = 0.17 * ATMO.night;
    bounce.intensity = 1.35 * (0.25 + 0.75 * ATMO.sunLight) * (1 - 0.8 * ATMO.night) * weather.ambient;
    exposure = (1.0 + 0.45 * ATMO.night) * weather.exposure;
  };
  const applyTime = () => {
    shadows.sync();
    applyLight();
    jet.uLamp.value = 0.5 + 1.2 * ATMO.night;
    envDue = performance.now() + 120;
  };
  // The weather: live from the open services unless a condition was picked in the menu (weather.js). The clouds are
  // drawn from it (clouds.js); when the sky closes or opens, the light and the reflection map follow.
  const clouds = new Clouds(renderer, tierName);
  // (the reflection map is redone at most every second and a half however fast the sky is changing)
  const weather = new Weather(clouds, { changed: () => { applyLight(); if (!envDue) envDue = performance.now() + 1500; }, report: () => wxUI() });
  let wxUI = () => {};
  { const w = Q.get('wx') || store.get('wx', 'live'); weather.choose(w === 'live' || CONDITIONS[w] ? w : 'live', true); }
  const refreshEnv = () => { envRT = makeEnvironment(renderer, sky, envRT); scene.environment = envRT.texture; envDue = 0; if (jet.root.parent === scene) jet.setEnv(envRT.texture, 1.15); };

  const terrain = new Terrain(renderer);
  const runway = new Runway();                              // Haneda 16L/34R, modelled; the ground is pressed down under it
  terrain.flatten = (lat, lon, h) => runway.flatten(lat, lon, h);
  scene.add(runway.mesh);
  loadAirfield(runway).then((g) => { g.traverse((o) => o.layers.enable(0)); scene.add(g); }).catch((e) => console.warn('airfield', e));      // taxiways, aprons, lights, signs
  terrain.errPx = tier.terrPx; terrain.maxZ = tier.maxZ; terrain.maxActive = tier.terrActive; terrain.aniso = tier.aniso;
  scene.add(terrain.group);
  const bake = new GroundBake(renderer, terrain, tier.bake);
  // new tiles are made ready a few per frame, so a burst of arrivals cannot stall a frame
  const turns = []; let perFrame = 6;
  const turn = () => new Promise((r) => turns.push(r));
  // The city is the built-in one (baked.js): small files made for this game, on this site. The survey's own
  // photo-textured tiles can still be streamed instead (?city=survey, or Photo buildings in the menu): hundreds of
  // megabytes for a first view, so only for a strong machine on a fast line.
  const survey = (Q.get('city') || store.get('city', 'built')) === 'survey';
  let cityRev = 0;
  const cityChanged = () => { shadows.invalidate(); roofs.changed = true; cityRev++; };
  const city = survey
    ? new City({ renderer, camera, manifest: await (await fetch('./data/tilesets.json')).json(), kinds: tier.kinds, errorTarget: tier.err, errorFalloff: tier.fall, cacheGB: tier.gb, texCap: tier.tex, texNear: tier.near,
      lite: tier.lite, reach: tier.reach, parseJobs: tier.parse, downloadJobs: tier.down, turn, shadows: tier.cascades.length > 0, aniso: tier.aniso, onChange: cityChanged })
    : new BakedCity({ renderer, camera, base: CITY, px: tier.px, reach: tier.far, shadows: tier.cascades.length > 0, jobs: Math.min(tier.down, 8), perFrame: () => perFrame, onChange: cityChanged });
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const groundY = (x, z) => terrain.heightAt(x, z);
  city.groundAt = (x, z) => ({ y: groundY(x, z), zoom: terrain.lastZoom });
  scene.add(city.group);
  const roofs = new Roofs(renderer, scene, city, terrain);
  const world = {
    // the runway's own surface where there is one; elsewhere the survey, shaped as the drawn ground is
    ground(x, z) {
      const g = worldToGeo(v1.set(x, 0, z)), on = runway.at(g.lat, g.lon);
      if (on != null) return { y: geoToWorld(g.lat, g.lon, on, v2).y, water: false };
      const e = terrain.elevation(g.lat, g.lon);
      return { y: geoToWorld(g.lat, g.lon, runway.flatten(g.lat, g.lon, e.elev), v2).y, water: e.water };
    },
    roof(x, y, z) { return roofs.top(x, z); },
  };

  /* ---------------------------------------------------------------- flying */
  const flight = new Flight(world);
  flight.assist = store.get('assist', 'easy') === 'real' ? 'real' : 'easy';
  const rig = new Rig(camera, flight, jet, world);
  // what falls, and lightning (precip.js). The weather's wind and rough air go to the flight model each frame.
  const precip = new Precip(scene, tier.drops);
  const bolt = new Bolt(scene);
  weather.onStrike = (F) => { if (F.ground) { const g = world.ground(F.pos.x, F.pos.z).y; bolt.strike(F.pos.x, g + Math.max(weather.now.lowBase, 300), F.pos.z, g); } else bolt.geo.instanceCount = 0; };
  weather.onThunder = (d) => sound.thunder(d);
  const camPrev = new THREE.Vector3(), camVel = new THREE.Vector3(); let camHad = false;
  const input = new Input(cv, $('touch'), { touch });
  input.invert = store.get('invert', '0') === '1';
  input.response = ['gentle', 'normal', 'sharp'].includes(store.get('response', 'normal')) ? store.get('response', 'normal') : 'normal';
  input.mouseFly = !touch && store.get('mouse', '0') === '1';
  // the film waits in the hangar (with more shots of the aircraft) until the first view over the bay has arrived
  // "arrived" = the ground is in and no more than a twentieth of the building tiles are still outstanding
  // (by the time the film asks, every set in range has been opened; one whose list has not arrived counts as pending)
  const cityReady = () => terrain.stats.loading <= 6 && city.stats.open > 0 && city.pending + turns.length <= Math.max(3, city.stats.tiles * 0.05);
  const film = new Film({ hangar, jet, flight, rig, sound, world, camera, runway, ready: cityReady });
  film.setVariant(Q.get('start') === 'runway' ? 'runway' : 'air');
  let mode = 'title', paused = false, units = store.get('units', 'm'), lastEvent = 0, hintAt = 0, crashT = 0, clock = 0;
  // what the governor has taken away, put into effect (perf.js)
  const applyDetail = () => {
    if (survey) { city.errorTarget = tier.err * gov.detail; city.reach = tier.reach * gov.reach; } else { city.detail = gov.detail; city.reach = tier.far * gov.reach; }
    terrain.errPx = tier.terrPx * gov.detail;
    shadows.setOn(gov.sun, gov.near);
  };
  const gov = new Governor(tier, tierName, () => { resize(); applyDetail(); });
  if (Q.has('nogov')) { gov.enabled = false; gov.res = gov.geo = 0; gov.trail.length = 0; }
  applyDetail();
  const glc = renderer.getContext(), px1 = new Uint8Array(4);
  const gpuDone = () => glc.readPixels(0, 0, 1, 1, glc.RGBA, glc.UNSIGNED_BYTE, px1);        // returns when the graphics card has caught up

  const size = new THREE.Vector2();
  const resize = () => {
    const w = view.clientWidth || innerWidth || 1280, h = view.clientHeight || innerHeight || 720;       // a hidden window reports 0 x 0
    const cap = Q.has('dpr') ? +Q.get('dpr') : Math.min(tier.dpr, Math.sqrt(tier.pixels / (w * h)));
    // the hangar is a far lighter scene than the city, and its close-ups are where sharpness shows: it gives up less
    const k = jet.root.parent === scene ? gov.scale : Math.sqrt(gov.scale);
    renderer.setPixelRatio(Math.max(0.5, Math.min(devicePixelRatio || 1, cap) * k));
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(size); clouds.setSize(size.x, size.y);
    camera.aspect = w / h; hangar.camera.aspect = w / h; hangar.camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(view); resize();
  applyTime(); refreshEnv();

  /* ---------------------------------------------------------------- drawing */
  // The city needs its near plane metres out (the far one is past the horizon); the aircraft is centimetres from
  // the lens. So the city is drawn first, then the depth is cleared and the aircraft alone is drawn over it.
  function drawWorld(nearJet, expo) {
    const cp = camera.position, gy = groundY(cp.x, cp.z), alt = Math.max(cp.y - gy, 1);
    const horizon = Math.sqrt(2 * 6371000 * Math.max(cp.y, 2)) + 40000;
    camera.near = clamp(alt * 0.02, 1.2, 14); camera.far = Math.max(90000, horizon * 1.4);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderer.getSize(size);
    terrain.update(camera, size.y);
    city.eyeHeight = Math.max(alt, 240);                     // seen from the air nothing hides the far city, however low the aircraft is
    if (gov.every < 2 || drawN++ % gov.every === 0) city.update();
    bake.update(camera, gy);
    shadows.follow(jet.root.position); shadows.update(camera, gy);
    ATMO.uniforms.uTime.value = clock;
    if (envDue && performance.now() > envDue) refreshEnv();
    // the clouds for this view, before anything that sits in them is drawn
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
  // While the hangar is on screen the city is loaded, and now and then drawn into a corner of the picture that the
  // hangar is then painted over. That puts its squares on the graphics card and builds its shaders before the film
  // cuts to it. It has to be this canvas and not an off-screen picture: a shader built for one is not the shader
  // used for the other, and the cut then stopped for a second to build them all again. Each new kind of surface is
  // built off the main thread first (compileAsync), and the corner is only drawn once that has finished.
  // The corner costs a whole draw of the city, so it is drawn only while new ground or buildings are arriving
  // (every few frames), then four more times half a second apart for the shadows and roof colours to settle.
  let camAlt = 0; const upAt = new THREE.Vector3(0, 1, 0);
  let warmN = 0, drawN = 0, warmBusy = false, warmFor = '', warmOK = false, warmSeen = '', warmNew = false, warmTail = 0, warmAt = 0, warmTiles = 0;
  function warm() {
    film.firstView(camera);
    const sig = `${terrain.kinds}|${city.group.children.length > 1}|${(city.bridges?.children.length || 0) > 0}|${scene.children.length}`;
    if (sig !== warmFor && !warmBusy) {
      warmBusy = true; warmFor = sig; camera.layers.set(0);
      renderer.compileAsync(scene, camera).catch((e) => console.warn('precompile', e)).then(() => { warmBusy = false; warmOK = true; });
    }
    const rev = `${terrain.changed}|${cityRev}`, t = performance.now();
    if (rev !== warmSeen) { warmSeen = rev; warmNew = true; warmTail = 4; }
    if (bake.building && warmTail < 2) warmTail = 2;             // the roof-colour shader is still being built: keep going until it has run once
    const due = warmOK && !warmBusy && (warmNew ? warmN % (tier === TIERS.phone ? 10 : 5) === 0 : warmTail > 0 && t - warmAt > 500);
    warmN++;
    if (due) { if (!warmNew) warmTail--; warmNew = false; warmAt = t; }
    if (!due) { camera.near = 1.2; camera.far = 120000; camera.updateProjectionMatrix(); renderer.getSize(size); terrain.update(camera, size.y); city.eyeHeight = 240; city.hold = city.stats.tiles - warmTiles >= 12; city.update(); city.hold = false; return; }
    renderer.setViewport(0, 0, 160, 90); renderer.setScissor(0, 0, 160, 90); renderer.setScissorTest(true);
    city.hold = true; drawWorld(0.3, 1); city.hold = false; warmTiles = city.stats.tiles;      // squares go to the graphics card a dozen at a draw, not in one heap after a wait
    renderer.getSize(size); renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y);
  }
  // the drops go with the wind and fall; the camera's own speed (found from where it was last frame) is taken off
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
    jet.setEnv(hangar.refreshEnv(jet.root), 1);
    renderer.toneMappingExposure = expo;
    renderer.render(hangar.scene, hangar.camera);
  }
  const toStage = () => { if (jet.root.parent !== hangar.scene) { hangar.scene.add(jet.root); jet.use(filmLod); jet.setEnv(hangar.refreshEnv(jet.root, true), 1); if (gov.scale < 1) resize(); } };
  const toWorld = () => { if (jet.root.parent !== scene) { scene.add(jet.root); jet.use(PLANES[plane].key()); jet.setEnv(envRT.texture, 1.15); if (gov.scale < 1) resize(); } };

  /* ---------------------------------------------------------------- read-outs */
  const tape = $('tape'), PX = 3.6;
  for (let d = -360; d <= 720; d += 10) {
    const i = document.createElement('i'); i.style.left = d * PX + 'px'; if (d % 30 === 0) i.className = 'big'; tape.appendChild(i);
    if (d % 30 === 0) { const b = document.createElement('b'); const a = ((d % 360) + 360) % 360; b.textContent = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a] ?? String(a / 10).padStart(2, '0'); b.style.left = d * PX + 'px'; tape.appendChild(b); }
  }
  const wxEl = $('wx'); let wxAt = 0;
  const el = { spd: $('spd'), alt: $('alt'), vs: $('vs'), pwr: $('pwr').firstChild, got: $('pwr').lastChild, ctl: $('ctl').firstChild, pwrT: $('pwrT'), where: $('where'), alert: $('alert'), hint: $('hint'), spdU: $('spdU'), altU: $('altU') };
  let hudAt = 0;
  const hint = (html, secs = 6) => { el.hint.innerHTML = html; el.hint.classList.add('on'); hintAt = performance.now() + secs * 1000; };
  // The map of the flight, top right (fly/minimap.js): the line flown so far on the survey photo, the places, and
  // four numbers. A click on it, M, or a controller's Back button shows more or less: Close, Area, Whole trip.
  const mini = new MiniMap({ root: $('mini'), canvas: $('miniCv'), view: store.get('mapzoom', 'area'), on: store.get('map', '1') !== '0',
    out: { dist: $('msDist'), distU: $('msDistU'), time: $('msTime'), top: $('msTop'), topU: $('msTopU'), high: $('msHigh'), highU: $('msHighU') } });
  $('mini').classList.toggle('plain', tierName === 'phone' || tierName === 'low');          // no blurred glass on the light levels
  const mapNext = () => { if (mode !== 'fly' || paused || !mini.on) return; hint('Map: ' + mini.next(), 1.6); store.set('mapzoom', mini.view); };
  $('mini').onclick = mapNext;
  function hud(now) {
    tape.style.transform = `translateX(${(-flight.heading * PX).toFixed(1)}px)`;
    el.ctl.style.transform = `translate(${(input.roll * 18).toFixed(1)}px, ${(input.pitch * 18).toFixed(1)}px)`;       // the stick: back is down, as in the hand
    el.got.style.transform = `scaleX(${flight.spool.toFixed(3)})`;
    if (hintAt && now > hintAt) { el.hint.classList.remove('on'); hintAt = 0; }
    mini.draw(now, flight, ATMO.night, units);              // it redraws itself about six times a second
    if (now - hudAt < 110) return; hudAt = now;
    const imp = units === 'ft';
    el.spd.textContent = Math.round(flight.V * (imp ? 1.94384 : 3.6)); el.spdU.textContent = imp ? 'kt' : 'km/h';
    const top = world.roof(flight.pos.x, 0, flight.pos.z), g = flight.pos.y - flight.agl, over = Math.max(flight.pos.y - Math.max(g, Number.isFinite(top) ? top : g), 0);
    el.alt.textContent = Math.round((flight.onGround ? 0 : flight.agl - flight.spec.gearH) * (imp ? 3.28084 : 1)); el.altU.textContent = imp ? 'ft' : 'm';
    const vs = flight.vs;
    el.vs.textContent = flight.onGround ? 'on the ground' : Math.abs(vs) < 0.6 ? 'level' : `${vs > 0 ? 'climbing' : 'sinking'} ${imp ? Math.round(Math.abs(vs) * 196.85) + ' ft/min' : Math.abs(vs).toFixed(0) + ' m/s'}`;
    el.pwr.style.transform = `scaleX(${input.throttle.toFixed(3)})`; el.pwrT.textContent = `Power ${Math.round(input.throttle * 100)}%` + (flight.spec.sweepV ? ` · wing ${Math.round(flight.sweep * 60)}°` : '') + (input.brake ? ' · brake' : '');
    // nearest landmark
    let best = null, bd = 1e12;
    for (const p of PLACES) { if (p.id === 'all') continue; p.w ??= geoToWorld(p.lat, p.lon, 0); const d = Math.hypot(p.w.x - flight.pos.x, p.w.z - flight.pos.z); if (d < bd) { bd = d; best = p; } }
    el.where.textContent = best ? `${best.name} · ${bd < 950 ? Math.round(bd / 10) * 10 + ' m' : (bd / 1000).toFixed(1) + ' km'}` : '';
    if (now - wxAt > 1500) { wxAt = now; wxEl.innerHTML = (weather.mode === 'live' ? '<b>LIVE</b>' : '') + weather.line(units); }
    const stall = flight.stall > 0.3 && !flight.onGround, low = !flight.onGround && over < 45 && vs < -4;
    el.alert.textContent = stall ? 'STALL' : 'PULL UP'; el.alert.classList.toggle('on', stall || low);
  }
  // (a site menu button, where the page is part of a larger site, sits in the top row while that row is showing)
  const setHud = (k) => { app.style.setProperty('--hud', k.toFixed(3)); $('top').classList.toggle('off', k < 0.5); $('mini').classList.toggle('off', k < 0.5); };
  const setBars = (k) => { app.style.setProperty('--bars', k.toFixed(3)); };

  /* ---------------------------------------------------------------- flying, crashing, starting again */
  function place(p) {
    const w = geoToWorld(p.lat, p.lon, 0), back = (p.range ?? 1500) * 0.8, h = (p.heading ?? 0) * D2R;
    const x = w.x - Math.sin(h) * back, z = w.z + Math.cos(h) * back;
    flight.place({ x, y: Math.max(groundY(x, z), 0) + 260 + (p.lift || 0), z, heading: p.heading ?? 0, speed: 92, throttle: 0.66 });
    input.throttle = 0.66; rig.snap(); roofs.map = null; roofs.at = -1e9;
  }
  // on the threshold stripes of 34R, engine idling, brakes off
  function toRunway() {
    const s = runway.start(), w = geoToWorld(s.lat, s.lon, 0);
    flight.place({ x: w.x, y: 0, z: w.z, heading: s.heading, speed: 0, throttle: 0, ground: true });
    input.throttle = 0; rig.snap(); roofs.map = null; roofs.at = -1e9; rolled = false;
    hint(POWER(), 12);
  }
  // what to say depends on what is in the player's hands: a controller once one has been taken up, else touch or keys
  const by = (pad, thumb, keys) => (input.device === 'pad' ? pad : input.device === 'touch' || (touch && input.device !== 'keys') ? thumb : keys);
  const pullAt = () => flight.spec.pullAt || 130;         // km/h
  const POWER = () => by(`Hold <b>RT</b> for power. Pull the stick back at <b>${pullAt()} km/h</b>. The stick steers, <b>A</b> brakes.`, `Push the <b>right lever</b> up to roll. Pull back on the left thumb at <b>${pullAt()} km/h</b>.`, `Hold <b>R</b> for power. Pull back (<b>S</b>) at <b>${pullAt()} km/h</b>. <b>A D</b> steer, <b>Space</b> brakes.`);
  const FLYING = () => by('<b>Left stick</b> flies · <b>RT LT</b> power · <b>A</b> brake · <b>Y</b> view · <b>right stick</b> looks', '<b>Left thumb</b> flies · <b>right lever</b> is power · drag to look', '<b>A D</b> bank · <b>S</b> nose up, <b>W</b> down · <b>R F</b> power · <b>C</b> view · drag to look');
  let rolled = true;
  function beginFlight() {
    mode = 'fly'; toWorld(); document.body.classList.add('flying'); document.body.classList.remove('film');
    input.enabled = true; input.throttle = flight.input.throttle;
    setHud(1); setBars(0); $('skip').style.display = 'none'; $('warn').style.display = 'none';
    perFrame = tier.tilesPerFrame;
    rig.look.yaw = 0; rig.look.pitch = 0; rig.dist = PLANES[plane].view.dist;
    if (flight.onGround) { rolled = false; hint(POWER(), 14); }
    else hint(FLYING(), 9);
    input.ui = null; titleNav.close();
    if (Q.get('plane') === 'ad1' && !askedPlane) { askedPlane = true; setPlane('ad1'); }      // a link straight to the second aircraft: it takes over once it is here
  }
  function events(now) {
    for (const e of flight.events) {
      if (e === 'touchdown') { sound.hit('touch'); input.buzz(0.7, 110); mini.mark('touchdown'); hint('Down. <b>Brake</b> to stop, or power up and go again.', 5); }
      else if (e === 'liftoff') hint('Airborne.', 2.5);
      else if (e.startsWith('crash')) { sound.hit('crash'); input.buzz(1, 280); mini.mark('crash'); crashT = now; $('fade').classList.add('on'); }
    }
    flight.events.length = 0;
    // on the take-off roll: say when to pull, once
    if (flight.onGround && !rolled && flight.V > pullAt() / 3.6) { rolled = true; hint(by('<b>Pull the stick back</b> now.', '<b>Pull back</b> now.', '<b>Pull back</b> now (S).'), 4); }
    if (flight.crashed && now - crashT > 1300) {
      // back in the air where it happened, well clear of everything, pointing the same way
      const h = flight.heading * D2R, x = flight.pos.x - Math.sin(h) * 260, z = flight.pos.z + Math.cos(h) * 260;
      const top = Math.max(world.ground(x, z).y, Number.isFinite(roofs.top(x, z)) ? roofs.top(x, z) : -1e9, flight.pos.y);
      flight.place({ x, y: top + 190, z, heading: flight.heading, speed: 88, throttle: 0.66 });
      input.throttle = 0.66; rig.snap(); $('fade').classList.remove('on'); hint('Back in the air.', 3);
    }
  }

  /* ---------------------------------------------------------------- which aircraft */
  const ad1Lod = Q.get('jet') || tier.jet;
  const PLANES = {
    katy: { name: 'Payen Katy', spec: SPEC, view: { dist: 11.5, height: 2.5, min: 6.5, size: 1 }, key: () => flyLod },
    ad1: { name: 'NASA AD-1 oblique wing', spec: AD1, view: AD1_VIEW, key: () => 'ad1-' + ad1Lod },
  };
  let planeBusy = false, askedPlane = false;
  const planeUI = (msg = '') => $('planes').querySelectorAll('.opt').forEach((b) => { b.classList.toggle('on', b.dataset.p === plane); if (b.dataset.p === 'ad1') b.textContent = PLANES.ad1.name + (msg ? ' · ' + msg : ''); });
  // Change aircraft where it is, in the air or on the ground: same place, same speed. The AD-1 is fetched the first
  // time it is asked for (the Katy flies on meanwhile), and its shaders are built before it is shown.
  async function setPlane(name) {
    if (!PLANES[name] || name === plane || planeBusy) return plane;
    if (name === 'ad1' && !jet.has(PLANES.ad1.key())) {
      planeBusy = true; planeUI('loading');
      try {
        await loadAD1(jet, ad1Lod, (got, total) => planeUI('loading ' + Math.round(Math.min(got / (total || AD1_BYTES[ad1Lod] || 4e6), 1) * 100) + '%'));
        planeUI('getting ready');
        try { await renderer.compileAsync(jet.models[PLANES.ad1.key()].model, camera, scene); } catch (e) { console.warn('precompile', e); }
      } catch (e) { console.warn('second aircraft', e.message || e); planeBusy = false; planeUI('could not load, press to try again'); return plane; }
      planeBusy = false;
    }
    plane = name; const P = PLANES[name];
    flight.setSpec(P.spec); rig.fit(P.view);
    if (jet.root.parent === scene) { jet.use(jet.has(P.key()) ? P.key() : firstLod); jet.root.position.copy(flight.pos); jet.pose(0, { parked: 0, sweep: flight.sweep }); if (mode === 'fly') rig.update(0); }
    jet.cockpit(rig.mode === 'cockpit'); planeUI();
    if (mode === 'fly' && !paused) hint(name === 'ad1' ? 'NASA AD-1. Its wing turns as it gains speed.' : 'Payen Katy.', 5);
    return plane;
  }

  /* ---------------------------------------------------------------- menu */
  const menu = $('menu');
  const setPaused = (on) => {
    if (mode !== 'fly') return;
    paused = on; menu.classList.toggle('on', on); sound.suspend(on);
    input.ui = on ? menuUI : null; if (on && input.device === 'pad') menuNav.open($('mResume')); else menuNav.close();
    if (on) { gfxUI(); wxUI(); }
    if (on) { const g = worldToGeo(camera.position); $('mExplore').href = `${EXPLORE}#${g.lat.toFixed(5)},${g.lon.toFixed(5)},${Math.max(g.elev, 60).toFixed(0)},${flight.heading.toFixed(1)},20.0`; }
  };
  // a controller in the menu: the cross moves, A presses, B or Start goes back to the flying
  const menuNav = padNav($('card')), titleNav = padNav($('title'));
  const menuUI = { move: (dx, dy) => menuNav.move(dx, dy), accept: () => menuNav.accept(), back: () => setPaused(false), start: () => setPaused(false) };
  $('bMenu').onclick = () => setPaused(true); $('mResume').onclick = () => setPaused(false);
  menu.addEventListener('pointerdown', (e) => { if (e.target === menu) setPaused(false); });
  $('bView').onclick = () => { if (mode === 'fly') hint('View: ' + rig.next(), 1.6); };
  const mark = (box, fn) => box.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', fn(b)));
  { const b = document.createElement('button'); b.className = 'opt on'; b.textContent = 'Haneda runway 34R: take off'; b.onclick = () => { toRunway(); setPaused(false); }; $('places').appendChild(b); }
  for (const p of PLACES) { if (p.id === 'all') continue; const b = document.createElement('button'); b.className = 'opt'; b.textContent = p.name; b.onclick = () => { place(p); setPaused(false); }; $('places').appendChild(b); }
  const hour = $('hour'), showHour = () => { const h = ATMO.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); $('hourOut').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; hour.value = h; };
  const setHour = (h) => { setTime(h); applyTime(); showHour(); store.set('hour', h); };
  hour.addEventListener('input', () => setHour(+hour.value));
  menu.querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => setHour(+b.dataset.h); });
  // Tokyo's own time now, with the sun where it is on today's date
  $('hNow').onclick = () => { const t = tokyoNow(); setTime(t.hour, t.day); applyTime(); showHour(); store.set('hour', t.hour); };
  // weather: live, or any one condition
  { const add = (k, name) => { const b = document.createElement('button'); b.className = 'opt'; b.dataset.w = k; b.textContent = name; b.onclick = () => { weather.choose(k); store.set('wx', k); wxUI(); wxAt = 0; }; $('wxOpts').appendChild(b); };
    add('live', 'Live: as it is there now'); for (const k of MENU) add(k, CONDITIONS[k].name); }
  wxUI = () => { mark($('wxOpts'), (b) => b.dataset.w === (weather.mode === 'live' ? 'live' : weather.key)); $('wxSrc').textContent = (weather.mode === 'live' ? weather.line(units) + '. ' : '') + weather.source(); };
  const assistUI = () => mark($('assist'), (b) => b.dataset.a === flight.assist);
  $('assist').querySelectorAll('.opt').forEach((b) => { b.onclick = () => { flight.assist = b.dataset.a; flight.gammaT = flight.pitch; store.set('assist', flight.assist); assistUI(); }; });
  const respUI = () => mark($('resp'), (b) => b.dataset.r === input.response);
  $('resp').querySelectorAll('.opt').forEach((b) => { b.onclick = () => { input.response = b.dataset.r; store.set('response', input.response); respUI(); }; });
  // The controller's line in the menu. Not one found: say so. One found: say how to take it up. In use: say so.
  // Pressing the line turns controllers off (and on again): off is remembered.
  const padUI = () => {
    const b = $('mPad');
    b.textContent = !input.padAllowed ? 'Controller: off' : input.padActive ? 'Controller: in use' : input.padCount ? 'Controller: press a button on it to use it' : 'Controller: none found';
    b.classList.toggle('on', input.padActive);
    $('keys').innerHTML = keysText() + (input.padCount || input.padActive ? PADKEYS : '');
  };
  $('mPad').onclick = () => { input.allowPad(!input.padAllowed); padUI(); };
  const PADKEYS = '<br>Controller: left stick flies · right stick looks · <kbd>RT</kbd> <kbd>LT</kbd> power · <kbd>LB</kbd> <kbd>RB</kbd> rudder · <kbd>A</kbd> brakes · <kbd>Y</kbd> view · <kbd>X</kbd> look ahead · <kbd>Back</kbd> map · cross up and down moves the camera · <kbd>Start</kbd> menu. In the menu the cross moves, <kbd>A</kbd> presses, <kbd>B</kbd> goes back.';
  let toldPad = false;
  // a controller has appeared or gone: it is offered, not used (input.js)
  input.on.pads = (n) => {
    padUI();
    if (!n || input.padActive || !input.padAllowed || toldPad) return;
    toldPad = true;
    if (mode === 'fly' && !paused) hint('Controller found. Press <b>A</b> on it to fly with it.', 7);
    else if (mode === 'title') note('Controller found. Press A on it to use it.');
  };
  // the player has pressed a button on it: it is theirs now
  input.on.padOn = () => {
    padUI();
    if (mode === 'title') { note('Controller on. A starts, X takes off from Haneda.'); titleNav.open($('start')); }
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
  const mapUI = () => { $('mMap').textContent = mini.on ? 'Map on' : 'Map off'; };
  $('mMap').onclick = () => { mini.setOn(!mini.on); store.set('map', mini.on ? '1' : '0'); mapUI(); }; mapUI();
  const soundUI = () => { $('mSound').textContent = sound.muted ? 'Sound off' : 'Sound on'; };
  $('mSound').onclick = () => { sound.mute(!sound.muted); soundUI(); };
  const musicUI = () => { $('mMusic').textContent = sound.musicOn ? 'Music on' : 'Music off'; };
  $('mMusic').onclick = () => { sound.setMusic(!sound.musicOn); musicUI(); }; musicUI();
  for (const [k, t] of Object.entries(TIERS)) { const b = document.createElement('button'); b.className = 'opt' + (k === tierName ? ' on' : ''); b.textContent = t.label; b.onclick = () => { if (k === tierName) return; store.set('tier', k); const u = new URL(location.href); u.searchParams.delete('q'); location.href = u.href; }; $('tiers').appendChild(b); }
  // the survey's photo-textured buildings in place of the built-in city: a far larger download, kept as a choice
  $('mCity').textContent = survey ? 'Buildings: survey photos (large download)' : 'Buildings: built-in city';
  $('mCity').classList.toggle('on', survey);
  $('mCity').onclick = () => { store.set('city', survey ? 'built' : 'survey'); const u = new URL(location.href); u.searchParams.delete('city'); location.href = u.href; };
  const gfxUI = () => { $('gfx').textContent = `Drawing with: ${GFX.name}. ` + (gov.steps ? `Detail is eased ${gov.steps} of ${gov.most} steps to keep the frames coming; it comes back when there is room.` : 'Detail is eased automatically if frames run slow.') + (survey ? ' Survey photo buildings take minutes to arrive on a first visit.' : ''); };
  gfxUI();
  // Everything the governor can take away is gone and frames are still late: this level is too much for this
  // device. Said once; next time the page starts one level lighter (a level picked in the menu is left alone).
  let toldSlow = false;
  const tooMuch = () => {
    if (toldSlow) return; toldSlow = true;
    const i = ORDER.indexOf(tierName); if (i <= 0) return;
    const lighter = ORDER[i - 1]; store.set('easier', lighter);
    hint(`Running slowly here. <b>Menu</b>, then <b>${TIERS[lighter].label}</b> under Detail, will be smoother.`, 12);
  };
  const keysText = () => (touch ? 'Left thumb: fly (it works wherever the thumb lands). Right lever: power. Turn and pull together for a tight turn. Drag anywhere else to look, pinch to move the camera in or out, double tap to look ahead again. Tap the map to show more or less of the trip.'
    : '<kbd>A</kbd> <kbd>D</kbd> bank · <kbd>S</kbd> nose up · <kbd>W</kbd> nose down · <kbd>Q</kbd> <kbd>E</kbd> rudder · <kbd>R</kbd> <kbd>F</kbd> power · <kbd>Space</kbd> brakes · <kbd>C</kbd> view · <kbd>V</kbd> look ahead · <kbd>M</kbd> map · drag to look, wheel to move the camera. A tap on a key is a small correction; holding it is the full stick. Turn and pull together for a tight turn. A controller works too, once a button on it is pressed.');
  $('planes').querySelectorAll('.opt').forEach((b) => { b.onclick = () => setPlane(b.dataset.p); });
  $('mFilm').onclick = () => { setPaused(false); setPlane('katy'); startFilm(film.variant); };       // the opening is the Katy's film
  assistUI(); invertUI(); unitsUI(); soundUI(); respUI(); mouseUI(); showHour(); padUI();
  input.on.pause = () => { if (mode === 'film') film.skip(); else setPaused(!paused); };
  input.on.view = () => { if (mode === 'fly' && !paused) hint('View: ' + rig.next(), 1.6); };
  input.on.map = mapNext;
  input.on.recentre = () => rig.recentre();
  input.on.look = (dx, dy) => { if (mode === 'fly' && !paused) rig.drag(dx, dy); };
  input.on.zoom = (k) => { if (mode === 'fly' && !paused && rig.mode === 'chase') rig.zoom(k); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'fly' && !Q.has('test')) setPaused(true); });

  /* ---------------------------------------------------------------- title and film */
  const startBtn = $('start');
  $('exploreLink').href = EXPLORE; $('mExplore').href = EXPLORE; setHud(0);
  function startFilm(variant = film.variant) {
    film.setVariant(variant);
    sound.unlock();
    if (touch && !Q.has('test')) {
      // a phone gives the page its whole screen, sideways, and keeps the screen awake (where the browser allows each)
      try { const p = app.requestFullscreen?.({ navigationUI: 'hide' }); p?.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {}); } catch { /* not allowed here */ }
      try { navigator.wakeLock?.request('screen').catch(() => {}); } catch { /* not supported */ }
    }
    $('title').classList.add('off'); setTimeout(() => { $('title').style.display = 'none'; }, 400);
    hangar.camera.clearViewOffset();
    input.enabled = false; setHud(0); document.body.classList.remove('flying'); document.body.classList.add('film');
    if (Q.get('film') === '0') { film.at(film.end, 0); film.t = film.end; beginFlight(); return; }
    toStage(); mode = 'film'; film.start(variant); setBars(1); $('skip').style.display = 'block'; perFrame = 4;
    titleNav.close(); input.ui = { accept: () => film.skip(), back: () => film.skip(), start: () => film.skip() };          // any of the three skips the film
  }
  // on the title a controller moves between the buttons; A presses, Start starts, X takes off from Haneda
  input.ui = { move: (dx, dy) => titleNav.move(dx, dy), accept: () => { if (titleNav.at) titleNav.accept(); else if (!startBtn.disabled) startFilm('air'); }, start: () => { if (!startBtn.disabled) startFilm('air'); }, alt: () => startFilm('runway') };
  startBtn.onclick = () => { if (!startBtn.disabled) startFilm('air'); };
  $('start2').onclick = () => startFilm('runway');
  $('skip').onclick = () => film.skip();
  addEventListener('keydown', (e) => { if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space') && !startBtn.disabled) startFilm('air'); });
  // Nothing to wait for on the title: the hangar and the aircraft are here, and the film covers the city's loading.
  startBtn.disabled = false; startBtn.classList.add('ready'); $('startT').textContent = 'START';
  BOOT.done = true; load(1);
  note(touch ? 'Best sideways, with sound.' : 'Best with sound. Enter starts.');

  /* ---------------------------------------------------------------- frame */
  let raf = 0, last = performance.now(), frames = 0, fpsAt = last, fps = 0;
  function step(dt, now) {
    clock += dt;
    { const cp = camera.position; weather.update(paused ? 0 : dt, camera, cp.y + (cp.x * cp.x + cp.z * cp.z) * 7.848e-8, mode === 'fly' ? flight.pos : cp); }
    flight.wind.copy(weather.wind); flight.rough = weather.bump;
    for (let i = 0; i < perFrame && turns.length; i++) turns.shift()();
    input.update(dt);
    if (mode === 'title') {
      const a = -0.86 + 0.16 * Math.sin(clock * 0.11), r = 10.6, c = hangar.camera;
      c.position.set(Math.sin(a) * r, 1.25 + 0.2 * Math.sin(clock * 0.07), -Math.cos(a) * r - 0.4);
      c.lookAt(v1.set(0, 1.28, -0.5)); c.fov = 30 * Math.max(1, 1.5 / Math.max(c.aspect, 0.4)); c.updateProjectionMatrix();
      // the aircraft sits up and to the right of the frame, clear of the title's words
      renderer.getSize(size); c.setViewOffset(size.x, size.y, (c.aspect > 1.2 ? -0.16 : 0) * size.x, (c.aspect > 1.2 ? 0.11 : 0.2) * size.y, size.x, size.y);
      jet.pose(dt, { parked: 1 });
      warm(); drawStage(hangar.exposure);
    } else if (mode === 'film') {
      const s = film.update(dt);
      setBars(s.bars); setHud(s.hud);
      if (s.stage) { toStage(); warm(); drawStage(s.exposure); }
      else { toWorld(); falling(dt, 0.7); drawWorld(s.near ?? 0.3, exposure * s.exposure); hud(now); }
      if (s.done) beginFlight();
    } else {
      if (!paused) {
        const I = flight.input; I.roll = input.roll; I.pitch = input.pitch; I.yaw = input.yaw; I.throttle = input.throttle; I.brake = input.brake;
        const wasOn = flight.onGround, x0 = flight.pos.x, z0 = flight.pos.z;
        flight.step(dt);
        mini.track(flight, dt);
        jet.root.position.copy(flight.pos); jet.root.quaternion.copy(flight.quat);
        jet.pose(dt, { roll: input.roll, pitch: input.pitch, yaw: input.yaw, throttle: input.throttle, parked: 0, look: clamp(flight.bank * 0.9, -0.8, 0.8), sweep: flight.sweep,
          wheel: flight.onGround || wasOn ? Math.hypot(flight.pos.x - x0, flight.pos.z - z0) : 0 });
        jet.uHeat.value = 0.08 + 0.4 * flight.spool;
        events(now);
        if (flight.buffet > 0.12) input.buzz(Math.min(0.2 + flight.buffet * 0.6, 0.8), 70);           // the shake of a wing near the stall, in the hand
        rig.update(dt);
        roofs.update(flight.pos, flight.vel, now);
        const d = camera.position.distanceTo(flight.pos);
        sound.update({ spool: 0.3 + 0.7 * flight.spool, speed: flight.V, where: rig.mode, dist: d, closing: rig.mode === 'flyby' ? (rig._d0 - d) / Math.max(dt, 1e-3) : 0, buffet: flight.buffet, ground: flight.onGround });
        rig._d0 = d;
        sound.music(0.3, 0.5);                        // the bed stays on under the flying, well back
      }
      falling(paused ? 0 : dt, rig.mode === 'cockpit' ? 1.5 : 0.7);
      drawWorld(rig.near, exposure); hud(now);
    }
    frames++;
    if (now - fpsAt > 1000) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
  }
  let shown = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const t0 = performance.now();
    step(dt, now);
    if (shown < 2 && ++shown === 2) { document.body.classList.add('live'); BOOT.live = performance.now(); }      // the still picture gives way to the real one
    // the governor watches the flying and the film's shots over the city, so it has settled before the stick is handed over
    if ((mode === 'fly' && !paused) || (mode === 'film' && !film.state.stage)) { gov.frame(dt, performance.now() - t0, gpuDone); if (gov.exhausted) tooMuch(); }
  }
  // shaders for the aircraft under the city's lights, built now rather than at the cut
  scene.add(jet.root); jet.setEnv(envRT.texture, 1.15);
  try { await renderer.compileAsync(jet.root, camera, scene); } catch (e) { console.warn('precompile', e); }
  toStage();
  try { await renderer.compileAsync(hangar.scene, hangar.camera); } catch (e) { console.warn('precompile', e); }       // the title's first frame does not stop to build shaders
  raf = requestAnimationFrame(frame);

  /* ---------------------------------------------------------------- console / test handle */
  window.__fly = {
    THREE, renderer, scene, camera, hangar, jet, flight, rig, input, film, sound, terrain, city, roofs, shadows, gov, tier, tierName, GFX, NET, ATMO, FILM, RAIL, world, setHour, place, PLACES, weather, clouds, precip, bolt, mini,
    get mode() { return mode; }, get fps() { return fps; }, get plane() { return plane; }, setPlane, PLANES,
    runway, toRunway, start: startFilm,
    begin(variant = film.variant) { if (mode !== 'fly') { film.setVariant(variant); $('title').style.display = 'none'; film.at(film.end, 0); beginFlight(); } },
    // draw one moment of the film (hidden panes do not run the frame loop)
    filmAt(t, extra = -1) { cancelAnimationFrame(raf); $('title').style.display = 'none'; hangar.camera.clearViewOffset(); mode = 'film'; film.playing = false; film.t = t; const s = extra >= 0 ? film.atExtra(extra, t, 0) : film.at(t, 0); setBars(s.bars); setHud(s.hud); if (s.stage) { toStage(); drawStage(s.exposure); } else { toWorld(); drawWorld(s.near ?? 0.3, exposure * s.exposure); hud(performance.now()); } return { stage: s.stage, exposure: +s.exposure.toFixed(2) }; },
    // draw the hangar from any camera: position, look-at point (hangar metres), lens; lamps 0..4, doors 0..1, engine heat 0..1
    stageAt(pos, look, fov = 30, lamps = 4, door = 0, heat = 0) {
      cancelAnimationFrame(raf); $('title').style.display = 'none'; toStage(); mode = 'film'; film.playing = false;
      hangar.setLamps(lamps); hangar.setDoor(door); jet.root.position.set(0, GEAR_H, 0); jet.root.quaternion.identity(); hangar.blob.position.z = 0.4;
      jet.uHeat.value = heat; jet.uLamp.value = 0.9; jet.pose(0, { parked: 0 });
      const c = hangar.camera; c.clearViewOffset(); c.position.set(...pos); c.lookAt(new THREE.Vector3(...look)); c.fov = fov; c.updateProjectionMatrix(); c.updateMatrixWorld();
      setBars(0); setHud(0); drawStage(hangar.exposure * (1 - 0.5 * door));
      return true;
    },
    // draw the world from anywhere near the runway: [metres along it, metres across, metres above its surface] for the camera and for what it looks at
    worldAt(from, to, fov = 40, near = 0.5) {
      cancelAnimationFrame(raf); $('title').style.display = 'none'; toWorld(); setBars(0); setHud(0);
      const a = runway.point(from[0], from[1]); a.y += from[2]; const b = runway.point(to[0], to[1]); b.y += to[2];
      camera.position.copy(a); camera.up.set(0, 1, 0); camera.lookAt(b); camera.fov = fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      renderer.getSize(size); terrain.update(camera, size.y); city.update(); city.pushQueues(); for (let i = 0; i < 8 && turns.length; i++) turns.shift()();
      drawWorld(near, exposure);
      return { loading: terrain.stats.loading, pending: city.pending };
    },
    // draw the aircraft where it is, from a camera given in its own frame: [right, up, back] in metres from its centre of gravity,
    // for the camera and for what it looks at; `pose` = control positions to show (roll, pitch, yaw -1..1, sweep 0..1)
    craftAt(from, to = [0, 0, 0], fov = 35, near = 0.3, pose = {}) {
      cancelAnimationFrame(raf); $('title').style.display = 'none'; toWorld(); setBars(0); setHud(0);
      jet.root.position.copy(flight.pos); jet.root.quaternion.copy(flight.quat); jet.pose(0, { parked: 0, sweep: flight.sweep, ...pose });
      const a = new THREE.Vector3(...from).applyQuaternion(jet.root.quaternion).add(jet.root.position), b = new THREE.Vector3(...to).applyQuaternion(jet.root.quaternion).add(jet.root.position);
      camera.position.copy(a); camera.up.set(0, 1, 0); camera.lookAt(b); camera.fov = fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      renderer.getSize(size); terrain.update(camera, size.y); city.update(); city.pushQueues(); for (let i = 0; i < 8 && turns.length; i++) turns.shift()();
      drawWorld(near, exposure);
      return { loading: terrain.stats.loading, pending: city.pending, plane, lod: jet.lod, tris: jet.tris };
    },
    // put the aircraft anywhere: latitude, longitude, metres above sea level, heading; `look` is the viewer's own turn and tilt in degrees
    goto({ lat, lon, alt = 1500, heading = 0, pitch = 0, bank = 0, speed = 110, look = [0, 0], view = 'chase', dist = 11.5 }) {
      const w = geoToWorld(lat, lon, alt);
      flight.place({ x: w.x, y: w.y, z: w.z, heading, pitch, roll: bank, speed, throttle: 0.7 });
      input.throttle = 0.7; if (rig.mode !== view) rig.set(view);
      rig.snap(); rig.dist = dist; rig.look.yaw = look[0] * D2R; rig.look.pitch = look[1] * D2R; roofs.map = null; roofs.at = -1e9;
      jet.root.position.copy(flight.pos); jet.root.quaternion.copy(flight.quat);
      return true;
    },
    // run n frames of `dt` seconds by hand
    run(n = 1, dt = 1 / 60) { cancelAnimationFrame(raf); for (let i = 0; i < n; i++) { step(dt, performance.now()); city.pushQueues(); } return { mode, V: flight.V, agl: flight.agl, crashed: flight.crashed }; },
    resume() { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); },
    // keep loading (no display frames needed) until nothing more is on its way in
    async settle(maxMs = 30000, quiet = 1500) {
      cancelAnimationFrame(raf);
      const t0 = performance.now(); let calm = t0, idle = 0, n = 0;
      while (performance.now() - t0 < maxMs && idle < quiet) {
        for (let i = 0; i < 8 && turns.length; i++) turns.shift()();
        if (mode === 'fly' || (mode === 'film' && !film.state.stage)) { camera.updateMatrixWorld(); renderer.getSize(size); terrain.update(camera, size.y); city.update(); if (n % 40 === 39) drawWorld(rig.near, exposure); }
        else { film.firstView(camera); camera.near = 1.2; camera.far = 120000; camera.updateProjectionMatrix(); renderer.getSize(size); terrain.update(camera, size.y); city.eyeHeight = 240; city.update(); if (n % 40 === 39) warm(); }
        city.pushQueues(); n++;
        if (terrain.stats.loading > 0 || city.loading || turns.length) calm = performance.now();
        idle = performance.now() - calm;
        for (let k = 0; k < 6; k++) await hop();
      }
      return { ms: Math.round(performance.now() - t0), done: idle >= quiet, terrain: terrain.stats.tiles, tiles: city.stats.tiles, buildings: city.stats.buildings, viaCache: NET.viaCache, direct: NET.direct };
    },
    // call straight after run() or filmAt(), in the same breath: the picture is gone once the browser has shown it
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
