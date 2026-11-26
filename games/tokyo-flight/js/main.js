// main.js — boot, frame loop and the page controls.
import * as THREE from 'three';
import { ATMO, setTime, installCascades, SunShadows, makeSky, makeEnvironment } from './atmo.js';
import { Terrain, GroundBake } from './terrain.js';
import { City } from './city.js';
import { Facades, READ } from './facade.js';
import { Signs } from './signs.js';
import { MapControls } from './controls.js';
import { PLACES } from './places.js';
import { worldToGeo, geoToWorld, GEOID } from './geo.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
// err / fall: how far out small buildings are drawn. near: largest texture within 150 m of the camera, which
// is what street level depends on (8192 = the survey's full size, about 340 MB per sheet on the graphics card).
const QUALITY = {
  low: { err: 30, fall: 26, px: 1.7, dpr: 1, gb: 1.0, tex: 1024, near: 2048 },
  mid: { err: 20, fall: 14, px: 1.25, dpr: 1.5, gb: 2.6, tex: 2048, near: 4096 },
  high: { err: 18, fall: 10, px: 1.0, dpr: 2, gb: 6.0, tex: 2048, near: 8192 },
  max: { err: 13, fall: 5, px: 1.0, dpr: 2, gb: 8.0, tex: 4096, near: 8192 },
};
// Which graphics device this window is really drawing with. A browser can quietly fall back to drawing on
// the processor (after its graphics process has crashed, or with acceleration switched off), and then this
// scene runs at a frame every second or two. That has to be visible on the page, not guessed at.
function graphicsDevice() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { powerPreference: 'high-performance' });
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const software = /Basic Render|SwiftShader|llvmpipe|Software|WARP/i.test(raw);
    const m = raw.match(/ANGLE \([^,]*,\s*([^,(]+?)\s*(?:\(0x|Direct3D|,)/);
    return { raw, software, name: software ? 'Processor only (no GPU)' : (m ? m[1] : raw).replace(/\s+/g, ' ').trim().slice(0, 34) };
  } catch { return { raw: '', software: false, name: 'unknown' }; }
}
const GFX = graphicsDevice();
// No ?q= given: a desktop graphics card gets full-size textures up close, anything else the middle setting.
function pickQuality() {
  if (QUALITY[Q.get('q')]) return Q.get('q');
  if (GFX.software) return 'low';
  if (/RTX|GTX|Radeon (RX|Pro)|Arc\(TM\) A|Apple M\d/i.test(GFX.raw) && !/Mobile|Android/i.test(navigator.userAgent)) return 'high';
  return 'mid';
}
const qName = pickQuality(), q = QUALITY[qName];

async function boot() {
  const view = $('view');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const dpr = () => Math.min(devicePixelRatio || 1, Q.has('dpr') ? +Q.get('dpr') : q.dpr);
  renderer.setPixelRatio(dpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;          // keeps the photo colours as photographed
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  view.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 200000);
  installCascades();
  setTime(+Q.get('t') || 12.75);      // early afternoon: close to when the aerial photos were flown, so the two sets of shadows agree

  $('sGfx').textContent = GFX.name; $('sGfx').title = GFX.raw;
  if (GFX.software) {
    $('sGfx').classList.add('bad');
    const w = $('warn');
    w.innerHTML = '<b>This window is drawing without the graphics card</b>, so it will be very slow. Open <u>' + location.origin + '</u> in Chrome, Edge or Firefox. If this is the Claude app\'s own browser pane, restarting the app gives it the graphics card back.';
    w.style.display = 'block';
  }
  const sky = makeSky(); scene.add(sky);
  // the map page has no weather: its sky keeps a scatter of fair-weather cloud, painted flat
  ATMO.uniforms.uEnvSky.value = 1; ATMO.uniforms.uEnvCloud.value.set(0.2, 0, 0.3);
  // on the processor the three 4096 px shadow maps alone cost seconds a frame
  const shadows = new SunShadows(scene, GFX.software ? { sizes: [1024, 1024, 1024] } : {});
  const fill = new THREE.AmbientLight(0xffdcb4, 0); scene.add(fill);         // city glow after dark
  // light bounced off sunlit streets and walls: without it every shaded face goes a flat dark blue
  const bounce = new THREE.HemisphereLight(0xece9e2, 0xa89f90, 1); scene.add(bounce);
  let envRT = null, envDue = 0;
  const applyTime = () => {
    shadows.sync();
    fill.intensity = 0.17 * ATMO.night;          // street lamps and shop light: a Tokyo street is never dark
    bounce.intensity = 1.35 * (0.25 + 0.75 * ATMO.sunLight) * (1 - 0.8 * ATMO.night);
    renderer.toneMappingExposure = 1.0 + 0.45 * ATMO.night;
    envDue = performance.now() + 120;
  };
  const refreshEnv = () => { envRT = makeEnvironment(renderer, sky, envRT); scene.environment = envRT.texture; envDue = 0; };

  const terrain = new Terrain(renderer); terrain.errPx = q.px;
  scene.add(terrain.group);
  const bake = new GroundBake(renderer, terrain);
  const manifest = await (await fetch('./data/tilesets.json')).json();
  const city = new City({ renderer, camera, manifest, errorTarget: q.err, errorFalloff: q.fall, cacheGB: q.gb, texCap: q.tex, texNear: q.near, onChange: () => shadows.invalidate() });
  city.keepBases = Q.has('cal');
  city.groundAt = (x, z) => ({ y: terrain.heightAt(x, z), zoom: terrain.lastZoom });
  const facades = new Facades(city);
  city.facades = facades; facades.onBuilt = () => shadows.invalidate();
  if (Q.get('facades') === 'off') facades.maxEye = -1;
  if (Q.has('fr')) { facades.radius = +Q.get('fr'); facades.keep = facades.radius * 1.4; facades.fine = Math.min(facades.fine, facades.radius * 0.6); }   // facade reach, metres
  if (Q.has('ftris')) facades.maxTris = +Q.get('ftris');
  if (Q.has('relief')) ATMO.uniforms.uRelief.value.x = +Q.get('relief');   // window relief on photo walls, 0 = off
  if (Q.has('luma')) city.lumaCap = +Q.get('luma');             // test: size of the brightness copy the window reader gets
  if (Q.has('keep')) READ.keep = [];                           // test: keep every wall photo that is read
  if (qName === 'low') { facades.radius = 70; facades.keep = 100; facades.fine = 35; facades.maxTris = 6e5; }
  scene.add(facades.group);
  const signs = Q.get('signs') === 'off' ? null : new Signs(facades);
  if (signs) scene.add(signs.group);
  scene.add(city.group);

  /* ---------------------------------------------------------------- picking and controls */
  const ray = new THREE.Raycaster();
  const groundY = (x, z) => terrain.heightAt(x, z);
  const pickRay = (origin, dir) => {
    let best = city.raycast(origin, dir);
    ray.set(origin, dir); ray.far = 3e5;
    const hits = ray.intersectObjects(terrain.shownNodes.map((n) => n.mesh), false);
    if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
    return best;
  };
  const _d = new THREE.Vector3();
  const pick = (nx, ny) => {
    _d.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    const h = pickRay(camera.position, _d);
    return h ? h.point : null;
  };
  const controls = new MapControls(camera, renderer.domElement, { pick, groundY });
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', () => cv.classList.add('dragging'));
  addEventListener('pointerup', () => cv.classList.remove('dragging'));

  /* ---------------------------------------------------------------- page controls */
  const nav = $('places');
  let current = null;
  for (const p of PLACES) {
    const b = document.createElement('button');
    b.innerHTML = `<b>${p.name}</b><small>${p.note}</small>`;
    b.onclick = () => { controls.flyTo(p); nav.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); current = p.id; };
    b.dataset.id = p.id;
    nav.appendChild(b);
  }
  controls.onMoveStart = () => { if (current) { current = null; nav.querySelectorAll('button.on').forEach((x) => x.classList.remove('on')); } };

  const hour = $('hour'), hourOut = $('hourOut'), sunOut = $('sunOut');
  const showTime = () => {
    const h = ATMO.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    hourOut.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    sunOut.textContent = ATMO.sunEl > -0.8 ? `Sun ${ATMO.sunEl.toFixed(0)}° up, ${['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(ATMO.sunAz / 45) % 8]}` : 'Sun down';
  };
  const setHour = (h) => { setTime(h); hour.value = h; applyTime(); showTime(); };
  hour.addEventListener('input', () => setHour(+hour.value));
  document.querySelectorAll('#clock .quick button').forEach((b) => { b.onclick = () => setHour(+b.dataset.h); });

  const card = $('card');
  card.querySelector('.x').onclick = () => { card.style.display = 'none'; };
  controls.onClick = (e) => {
    const n = controls.ndc(e);
    _d.set(n.x, n.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const hit = city.raycast(camera.position, _d);
    const info = hit && city.describe(hit);
    if (!info) { card.style.display = 'none'; return; }
    const kind = (info.kind || '').split(':')[0];
    $('cName').textContent = info.name || ({ brid: 'Bridge', veg: info.kind.includes('PlantCover') ? 'Planting' : 'Tree', frn: 'Street furniture' }[kind] || 'Building');
    const rows = [];
    if (info.height) rows.push(['Height', `${info.height.toFixed(1)} m`]);
    if (info.floors) rows.push(['Floors', info.basements ? `${info.floors} + ${info.basements} below` : `${info.floors}`]);
    if (info.usage) rows.push(['Use', info.usage]);
    if (info.address) rows.push(['Address', info.address]);
    const g = worldToGeo(hit.point);
    rows.push(['Where', `${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}`]);
    $('cList').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    card.style.display = 'block';
  };

  /* ---------------------------------------------------------------- start view */
  const start = PLACES.find((p) => p.id === (Q.get('place') || 'tower')) || PLACES[0];
  const pose = (Q.get('view') || location.hash.slice(1)).split(',').map(Number);
  if (pose.length >= 5 && pose.every(Number.isFinite)) controls.setPose({ lat: pose[0], lon: pose[1], elev: pose[2], heading: pose[3], pitch: pose[4] });
  else {
    controls.setView({ ...start, elev: 5 });
    nav.querySelector(`button[data-id="${start.id}"]`)?.classList.add('on'); current = start.id;
  }
  hour.value = ATMO.hour; applyTime(); showTime();

  const resize = () => {
    const w = view.clientWidth || innerWidth || 1280, h = view.clientHeight || innerHeight || 720;       // a hidden window reports 0 x 0
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(view); resize();

  /* ---------------------------------------------------------------- frame */
  const clock = new THREE.Clock();
  let hudAt = 0, frames = 0, fpsAt = performance.now(), fps = 0, settled = 0;
  const size = new THREE.Vector2();
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    tick();
  }
  function tick(draw = true) {
    const dt = Math.min(clock.getDelta(), 0.1), now = performance.now();
    controls.update(dt);
    const gy = groundY(camera.position.x, camera.position.z), alt = Math.max(camera.position.y - gy, 1);
    // near and far planes follow the height: close detail at street level, the horizon from the air
    const horizon = Math.sqrt(2 * 6371000 * Math.max(camera.position.y, 2)) + 40000;
    camera.near = THREE.MathUtils.clamp(alt * 0.04, 0.7, 60); camera.far = Math.max(90000, horizon * 1.4);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderer.getSize(size);
    terrain.update(camera, size.y);
    city.eyeHeight = alt;
    city.update();
    facades.update(camera, alt);
    signs?.update(camera, alt);
    if (!draw) return;
    bake.update(camera, gy);
    shadows.update(camera, gy);
    ATMO.uniforms.uTime.value = clock.elapsedTime;
    ATMO.uniforms.uCamAlt.value = camera.position.y + (camera.position.x ** 2 + camera.position.z ** 2) * 7.848e-8;
    if (envDue && now > envDue) refreshEnv();
    renderer.render(scene, camera);
    frames++;
    if (now - fpsAt > 1000) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
    if (now - hudAt > 200) {
      hudAt = now;
      const g = worldToGeo(camera.position), busy = terrain.stats.loading > 0 || city.loading;
      $('sBld').textContent = Math.max(city.stats.buildings, 0).toLocaleString('en-US');
      $('sAlt').textContent = alt < 1000 ? `${alt.toFixed(0)} m` : `${(alt / 1000).toFixed(1)} km`;
      $('sPos').textContent = `${g.lat.toFixed(4)}°N ${g.lon.toFixed(4)}°E`;
      $('sLoad').classList.toggle('idle', !busy);
      settled = busy ? 0 : settled + 1;
      if (!controls.drag && !controls.flight) {
        const v = controls.getView();
        history.replaceState(null, '', `#${v.lat.toFixed(5)},${v.lon.toFixed(5)},${v.elev.toFixed(0)},${v.heading.toFixed(1)},${v.pitch.toFixed(1)}`);
      }
    }
  }
  refreshEnv();
  frame();

  // console / test handle
  window.__tokyo = {
    THREE, renderer, scene, camera, controls, terrain, city, facades, signs, READ, GFX, bake, shadows, ATMO, GEOID, PLACES, setHour, pickRay, quality: qName,
    get fps() { return fps; }, get settled() { return settled; },
    go(id) { const p = PLACES.find((x) => x.id === id); if (p) controls.setView({ ...p, elev: null }); return !!p; },
    tick,
    // Height check: how far the lowest point of each visible building sits above the ground model under it.
    // Run with ?cal=1. A steady offset here means the sea-level-to-ellipsoid figure in geo.js (GEOID) is off.
    calib() {
      const d = [];
      for (const s of city.sets) {
        if (!s.tiles) continue;
        for (const tile of s.tiles.visibleTiles) {
          const b = tile.engineData?.scene?.userData.bases;
          if (!b || tile.geometricError > 1) continue;            // finest tiles only: coarse ones hold partial shapes
          for (let k = 0; k < b.length; k += 3) {
            const g = worldToGeo(new THREE.Vector3(b[k], 0, b[k + 2])), e = terrain.elevation(g.lat, g.lon);
            if (e.z >= 15 && !e.water) d.push(b[k + 1] - geoToWorld(g.lat, g.lon, e.elev).y);
          }
        }
      }
      d.sort((a, b) => a - b);
      const pct = (p) => (d.length ? +d[Math.floor((d.length - 1) * p)].toFixed(2) : null);
      return { n: d.length, p10: pct(0.1), p25: pct(0.25), median: pct(0.5), p75: pct(0.75), p90: pct(0.9) };
    },
    // run frames without waiting for the display (the page may be in a hidden pane) until loading has finished
    async settle(maxMs = 30000, quiet = 1800) {
      cancelAnimationFrame(raf);
      const t0 = performance.now(); let calm = t0, idle = 0, n = 0;
      while (performance.now() - t0 < maxMs && idle < quiet) {
        tick(n % 60 === 59); city.pushQueues(); n++;             // mostly loading steps; a drawn frame now and then
        if (terrain.stats.loading > 0 || city.loading || city._retex > 0 || facades.queue.length) calm = performance.now();
        idle = performance.now() - calm;                         // milliseconds with nothing on its way in
        // a message hop yields to the network without the one-second timer clamp hidden pages get
        for (let k = 0; k < 6; k++) await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
      }
      for (let k = 0; k < 3; k++) { shadows.invalidate(); tick(); await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); }); }
      frame();
      return { ms: Math.round(performance.now() - t0), frames: n, done: idle >= quiet, terrain: terrain.stats.tiles, buildings: city.stats.buildings, tiles: city.stats.tiles };
    },
    // with ?keep=1: save every wall photo read so far to shots/walls-<name>.bin, for tools/walls/run.mjs
    async dumpWalls(name = 'here') {
      const K = READ.keep; if (!K) return { ok: false, why: 'open the page with ?keep=1' };
      const head = new TextEncoder().encode(JSON.stringify(K.map(({ data, ...m }) => m)));
      const res = await fetch(`/__shot/walls-${name}.bin`, { method: 'POST', body: new Blob([new Uint32Array([head.length]), head, ...K.map((k) => k.data)]) });
      return { ...(await res.json()), walls: K.length };
    },
    // save the current frame through the dev server: __tokyo.shot('name')
    async shot(name = 'shot', type = 'image/jpeg') {
      renderer.render(scene, camera);
      const blob = await new Promise((r) => renderer.domElement.toBlob(r, type, 0.92));
      const res = await fetch(`/__shot/${name}.${type === 'image/png' ? 'png' : 'jpg'}`, { method: 'POST', body: blob });
      return res.json();
    },
  };
}

boot().catch((e) => {
  console.error(e);
  const f = document.getElementById('fail');
  f.style.display = 'flex'; f.textContent = 'Could not start: ' + (e.message || e);
});
