// app.js — Tokyo Flight: title, the opening film, then flying the Katy over the streamed city.
// The city itself (ground, buildings, sky, shadows) is the same engine the map page uses (explore.html).
import * as THREE from 'three';
import { ATMO, setTime, installCascades, SunShadows, makeSky, makeEnvironment } from './atmo.js';
import { Terrain, GroundBake } from './terrain.js';
import { City } from './city.js';
import { BakedCity } from './baked.js';
import { PLACES } from './places.js';
import { worldToGeo, geoToWorld } from './geo.js';
import { NET, EXPLORE, CITY } from './net.js';
import { TIERS, ORDER, graphicsDevice, pickTier, Governor } from './fly/perf.js';
import { loadJet, addLod, GEAR_H } from './fly/jet.js';
import { Flight } from './fly/flight.js';
import { Rig } from './fly/chase.js';
import { Input } from './fly/input.js';
import { Sound } from './fly/sound.js';
import { Hangar } from './fly/hangar.js';
import { Film, T as FILM, RAIL } from './fly/film.js';
import { Roofs } from './fly/roofs.js';
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
  note('Loading the aircraft');

  /* ---------------------------------------------------------------- the hangar and the aircraft: enough for the title */
  installCascades();
  setTime(+Q.get('t') || +store.get('hour', 9));
  const hangar = new Hangar(renderer, tier);
  const sound = new Sound();
  const flyLod = Q.get('jet') || tier.jet, filmLod = Q.get('jet') || tier.jetFilm || tier.jet;
  const jet = await loadJet(flyLod);
  // the hangar close-ups get the full model; it arrives behind the title and is used from then on
  if (filmLod !== flyLod) addLod(jet, filmLod).then(() => { if (jet.root.parent === hangar.scene) jet.use(filmLod); }).catch((e) => console.warn('full model', e));
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
  const applyTime = () => {
    shadows.sync();
    fill.intensity = 0.17 * ATMO.night;
    bounce.intensity = 1.35 * (0.25 + 0.75 * ATMO.sunLight) * (1 - 0.8 * ATMO.night);
    exposure = 1.0 + 0.45 * ATMO.night;
    jet.uLamp.value = 0.5 + 1.2 * ATMO.night;
    envDue = performance.now() + 120;
  };
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
  function drawStage(expo) {
    jet.setEnv(hangar.refreshEnv(jet.root), 1);
    renderer.toneMappingExposure = expo;
    renderer.render(hangar.scene, hangar.camera);
  }
  const toStage = () => { if (jet.root.parent !== hangar.scene) { hangar.scene.add(jet.root); jet.use(filmLod); jet.setEnv(hangar.refreshEnv(jet.root, true), 1); if (gov.scale < 1) resize(); } };
  const toWorld = () => { if (jet.root.parent !== scene) { scene.add(jet.root); jet.use(flyLod); jet.setEnv(envRT.texture, 1.15); if (gov.scale < 1) resize(); } };

  /* ---------------------------------------------------------------- read-outs */
  const tape = $('tape'), PX = 3.6;
  for (let d = -360; d <= 720; d += 10) {
    const i = document.createElement('i'); i.style.left = d * PX + 'px'; if (d % 30 === 0) i.className = 'big'; tape.appendChild(i);
    if (d % 30 === 0) { const b = document.createElement('b'); const a = ((d % 360) + 360) % 360; b.textContent = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a] ?? String(a / 10).padStart(2, '0'); b.style.left = d * PX + 'px'; tape.appendChild(b); }
  }
  const el = { spd: $('spd'), alt: $('alt'), vs: $('vs'), pwr: $('pwr').firstChild, got: $('pwr').lastChild, ctl: $('ctl').firstChild, pwrT: $('pwrT'), where: $('where'), alert: $('alert'), hint: $('hint'), spdU: $('spdU'), altU: $('altU') };
  let hudAt = 0;
  const hint = (html, secs = 6) => { el.hint.innerHTML = html; el.hint.classList.add('on'); hintAt = performance.now() + secs * 1000; };
  function hud(now) {
    tape.style.transform = `translateX(${(-flight.heading * PX).toFixed(1)}px)`;
    el.ctl.style.transform = `translate(${(input.roll * 18).toFixed(1)}px, ${(input.pitch * 18).toFixed(1)}px)`;       // the stick: back is down, as in the hand
    el.got.style.transform = `scaleX(${flight.spool.toFixed(3)})`;
    if (hintAt && now > hintAt) { el.hint.classList.remove('on'); hintAt = 0; }
    if (now - hudAt < 110) return; hudAt = now;
    const imp = units === 'ft';
    el.spd.textContent = Math.round(flight.V * (imp ? 1.94384 : 3.6)); el.spdU.textContent = imp ? 'kt' : 'km/h';
    const top = world.roof(flight.pos.x, 0, flight.pos.z), g = flight.pos.y - flight.agl, over = Math.max(flight.pos.y - Math.max(g, Number.isFinite(top) ? top : g), 0);
    el.alt.textContent = Math.round((flight.onGround ? 0 : flight.agl - GEAR_H) * (imp ? 3.28084 : 1)); el.altU.textContent = imp ? 'ft' : 'm';
    const vs = flight.vs;
    el.vs.textContent = flight.onGround ? 'on the ground' : Math.abs(vs) < 0.6 ? 'level' : `${vs > 0 ? 'climbing' : 'sinking'} ${imp ? Math.round(Math.abs(vs) * 196.85) + ' ft/min' : Math.abs(vs).toFixed(0) + ' m/s'}`;
    el.pwr.style.transform = `scaleX(${input.throttle.toFixed(3)})`; el.pwrT.textContent = `Power ${Math.round(input.throttle * 100)}%` + (input.brake ? ' · brake' : '');
    // nearest landmark
    let best = null, bd = 1e12;
    for (const p of PLACES) { if (p.id === 'all') continue; p.w ??= geoToWorld(p.lat, p.lon, 0); const d = Math.hypot(p.w.x - flight.pos.x, p.w.z - flight.pos.z); if (d < bd) { bd = d; best = p; } }
    el.where.textContent = best ? `${best.name} · ${bd < 950 ? Math.round(bd / 10) * 10 + ' m' : (bd / 1000).toFixed(1) + ' km'}` : '';
    const stall = flight.stall > 0.3 && !flight.onGround, low = !flight.onGround && over < 45 && vs < -4;
    el.alert.textContent = stall ? 'STALL' : 'PULL UP'; el.alert.classList.toggle('on', stall || low);
  }
  // (a site menu button, where the page is part of a larger site, sits in the top row while that row is showing)
  const setHud = (k) => { app.style.setProperty('--hud', k.toFixed(3)); $('top').classList.toggle('off', k < 0.5); };
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
    hint(POWER, 12);
  }
  const POWER = touch ? 'Push the <b>right lever</b> up to roll. Pull back on the left thumb at <b>130 km/h</b>.' : 'Hold <b>R</b> for power. Pull back (<b>S</b>) at <b>130 km/h</b>. <b>A D</b> steer, <b>Space</b> brakes.';
  let rolled = true;
  function beginFlight() {
    mode = 'fly'; toWorld(); document.body.classList.add('flying'); document.body.classList.remove('film');
    input.enabled = true; input.throttle = flight.input.throttle;
    setHud(1); setBars(0); $('skip').style.display = 'none'; $('warn').style.display = 'none';
    perFrame = tier.tilesPerFrame;
    rig.look.yaw = 0; rig.look.pitch = 0; rig.dist = 11.5;
    if (flight.onGround) { rolled = false; hint(POWER, 14); }
    else hint(touch ? '<b>Left thumb</b> flies · <b>right lever</b> is power · drag to look' : '<b>A D</b> bank · <b>S</b> nose up, <b>W</b> down · <b>R F</b> power · <b>C</b> view · drag to look', 9);
  }
  function events(now) {
    for (const e of flight.events) {
      if (e === 'touchdown') { sound.hit('touch'); input.buzz(0.7, 110); hint('Down. <b>Brake</b> to stop, or power up and go again.', 5); }
      else if (e === 'liftoff') hint('Airborne.', 2.5);
      else if (e.startsWith('crash')) { sound.hit('crash'); input.buzz(1, 280); crashT = now; $('fade').classList.add('on'); }
    }
    flight.events.length = 0;
    // on the take-off roll: say when to pull, once
    if (flight.onGround && !rolled && flight.V > 36) { rolled = true; hint(touch ? '<b>Pull back</b> now.' : '<b>Pull back</b> now (S).', 4); }
    if (flight.crashed && now - crashT > 1300) {
      // back in the air where it happened, well clear of everything, pointing the same way
      const h = flight.heading * D2R, x = flight.pos.x - Math.sin(h) * 260, z = flight.pos.z + Math.cos(h) * 260;
      const top = Math.max(world.ground(x, z).y, Number.isFinite(roofs.top(x, z)) ? roofs.top(x, z) : -1e9, flight.pos.y);
      flight.place({ x, y: top + 190, z, heading: flight.heading, speed: 88, throttle: 0.66 });
      input.throttle = 0.66; rig.snap(); $('fade').classList.remove('on'); hint('Back in the air.', 3);
    }
  }

  /* ---------------------------------------------------------------- menu */
  const menu = $('menu');
  const setPaused = (on) => {
    if (mode !== 'fly') return;
    paused = on; menu.classList.toggle('on', on); sound.suspend(on);
    if (on) gfxUI();
    if (on) { const g = worldToGeo(camera.position); $('mExplore').href = `${EXPLORE}#${g.lat.toFixed(5)},${g.lon.toFixed(5)},${Math.max(g.elev, 60).toFixed(0)},${flight.heading.toFixed(1)},20.0`; }
  };
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
  const assistUI = () => mark($('assist'), (b) => b.dataset.a === flight.assist);
  $('assist').querySelectorAll('.opt').forEach((b) => { b.onclick = () => { flight.assist = b.dataset.a; flight.gammaT = flight.pitch; store.set('assist', flight.assist); assistUI(); }; });
  const respUI = () => mark($('resp'), (b) => b.dataset.r === input.response);
  $('resp').querySelectorAll('.opt').forEach((b) => { b.onclick = () => { input.response = b.dataset.r; store.set('response', input.response); respUI(); }; });
  const mouseUI = () => { $('mMouse').textContent = input.mouseFly ? 'Mouse flies (hold a button to look)' : 'Mouse looks around'; $('mMouse').classList.toggle('on', input.mouseFly); $('mMouse').style.display = touch ? 'none' : ''; };
  $('mMouse').onclick = () => { input.mouseFly = !input.mouseFly; store.set('mouse', input.mouseFly ? '1' : '0'); mouseUI(); };
  const invertUI = () => { $('mInvert').textContent = input.invert ? 'Up = nose up' : 'Up = nose down (like a stick)'; };
  $('mInvert').onclick = () => { input.invert = !input.invert; store.set('invert', input.invert ? '1' : '0'); invertUI(); };
  const unitsUI = () => { $('mUnits').textContent = units === 'ft' ? 'knots · feet' : 'km/h · metres'; };
  $('mUnits').onclick = () => { units = units === 'ft' ? 'm' : 'ft'; store.set('units', units); unitsUI(); };
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
  $('keys').innerHTML = touch ? 'Left thumb: fly (it works wherever the thumb lands). Right lever: power. Turn and pull together for a tight turn. Drag anywhere else to look, pinch to move the camera in or out, double tap to look ahead again.'
    : '<kbd>A</kbd> <kbd>D</kbd> bank · <kbd>S</kbd> nose up · <kbd>W</kbd> nose down · <kbd>Q</kbd> <kbd>E</kbd> rudder · <kbd>R</kbd> <kbd>F</kbd> power · <kbd>Space</kbd> brakes · <kbd>C</kbd> view · <kbd>V</kbd> look ahead · drag to look, wheel to move the camera. A tap on a key is a small correction; holding it is the full stick. Turn and pull together for a tight turn. A gamepad works too.';
  $('mFilm').onclick = () => { setPaused(false); startFilm(film.variant); };
  assistUI(); invertUI(); unitsUI(); soundUI(); respUI(); mouseUI(); showHour();
  input.on.pause = () => { if (mode === 'film') film.skip(); else setPaused(!paused); };
  input.on.view = () => { if (mode === 'fly' && !paused) hint('View: ' + rig.next(), 1.6); };
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
  }
  startBtn.onclick = () => { if (!startBtn.disabled) startFilm('air'); };
  $('start2').onclick = () => startFilm('runway');
  $('skip').onclick = () => film.skip();
  addEventListener('keydown', (e) => { if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space') && !startBtn.disabled) startFilm('air'); });
  // Nothing to wait for on the title: the hangar and the aircraft are here, and the film covers the city's loading.
  startBtn.disabled = false; startBtn.classList.add('ready'); $('startT').textContent = 'START';
  note(touch ? 'Best sideways, with sound.' : 'Best with sound. Enter starts.');

  /* ---------------------------------------------------------------- frame */
  let raf = 0, last = performance.now(), frames = 0, fpsAt = last, fps = 0;
  function step(dt, now) {
    clock += dt;
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
      else { toWorld(); drawWorld(s.near ?? 0.3, exposure * s.exposure); hud(now); }
      if (s.done) beginFlight();
    } else {
      if (!paused) {
        const I = flight.input; I.roll = input.roll; I.pitch = input.pitch; I.yaw = input.yaw; I.throttle = input.throttle; I.brake = input.brake;
        const wasOn = flight.onGround, x0 = flight.pos.x, z0 = flight.pos.z;
        flight.step(dt);
        jet.root.position.copy(flight.pos); jet.root.quaternion.copy(flight.quat);
        jet.pose(dt, { roll: input.roll, pitch: input.pitch, yaw: input.yaw, throttle: input.throttle, parked: 0, look: clamp(flight.bank * 0.9, -0.8, 0.8),
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
      drawWorld(rig.near, exposure); hud(now);
    }
    frames++;
    if (now - fpsAt > 1000) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const t0 = performance.now();
    step(dt, now);
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
    THREE, renderer, scene, camera, hangar, jet, flight, rig, input, film, sound, terrain, city, roofs, shadows, gov, tier, tierName, GFX, NET, ATMO, FILM, RAIL, world, setHour, place, PLACES,
    get mode() { return mode; }, get fps() { return fps; },
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
  f.style.display = 'flex'; f.textContent = 'Could not start: ' + (e.message || e);
});
