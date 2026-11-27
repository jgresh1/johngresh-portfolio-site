// picker.js — picking a place on the globe: the hand on it, what is named on it, the search, and the card that
// offers the ways to start there.
//
//   the hand     a drag turns the Earth under the pointer and it carries on when let go; the wheel or a pinch comes
//                in towards the place under the pointer; a click that did not drag picks that spot
//   on it        the world's airports as small amber dots (more of them the closer the view), and names: the great
//                cities from far out, then towns and airfields from the map as the view comes in
//   search       airports from the game's own list as the words are typed, places from Open-Meteo's open
//                gazetteer (no key) a moment after typing stops
//   the card     the place's name and the ways to start: in the air over it, or lined up on a runway nearby
import * as THREE from 'three';
import { dirOf, geoOf } from './globe.js';
import { CITIES, IDEAS } from './places.js';
import { tileLon, tileLat, lonTile, latTile } from './geo.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, D2R = Math.PI / 180;
const coords = (lat, lon) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PLACE = new Set(['city', 'town', 'village', 'island', 'suburb', 'hamlet']);

export class Picker {
  constructor({ globe, airports, maps, canvas, touch = false, go, back, isOpen }) {
    Object.assign(this, { globe, airports, maps, canvas, touch, go, back, isOpen });
    this.ui = $('globeUI'); this.card = $('gCard'); this.hits = $('gHits'); this.q = $('gQ');
    this.sel = null; this.labels = []; this.pool = []; this.labelAt = 0; this.dots = null; this.namesAsked = new Set(); this.namesRev = -1;
    this.layer = document.createElement('div'); this.layer.className = 'layer'; this.layer.id = 'gLabels'; this.ui.insertBefore(this.layer, this.ui.firstChild);
    this.pin = document.createElement('div'); this.pin.className = 'gPin'; this.layer.appendChild(this.pin);
    this._s = {}; this._v = new THREE.Vector3();
    this.pointers(); this.search(); this.ideas();
    $('gClose').onclick = () => this.select(null);
    $('gBack').onclick = () => this.back();
  }

  open(canBack) {
    this.ui.classList.add('on'); $('gBack').classList.toggle('on', !!canBack); this.select(null); this.hits.classList.remove('on');
    $('gTip').textContent = this.touch ? 'Drag the globe. Pinch to come in. Tap anywhere.' : 'Drag the globe. Scroll to come in. Click anywhere.';
    this.airports.load().then(() => this.makeDots());
  }
  close() { this.ui.classList.remove('on'); this.globe.held = false; this.q.blur(); }

  /* ---------------------------------------------------------------- the hand on the globe */
  pointers() {
    const cv = this.canvas, P = new Map(); let moved = 0, downAt = 0, lastT = 0, pinch = 0;
    const norm = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), r.height]; };
    cv.addEventListener('pointerdown', (e) => {
      if (!this.isOpen()) return;
      P.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { cv.setPointerCapture(e.pointerId); } catch { /* gone */ }
      if (P.size === 1) { moved = 0; downAt = performance.now(); lastT = downAt; this.globe.held = true; this.globe.vel.lon = this.globe.vel.lat = 0; }
      if (P.size === 2) { const [a, b] = [...P.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      this.q.blur(); this.hits.classList.remove('on');
    });
    cv.addEventListener('pointermove', (e) => {
      const p = P.get(e.pointerId); if (!p || !this.isOpen()) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y, now = performance.now(), h = cv.getBoundingClientRect().height;
      p.x = e.clientX; p.y = e.clientY;
      if (P.size === 1) { moved += Math.abs(dx) + Math.abs(dy); if (moved > 5) this.globe.drag(dx, dy, h, Math.max((now - lastT) / 1000, 1e-3)); lastT = now; }
      else if (P.size === 2) {
        const [a, b] = [...P.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = cv.getBoundingClientRect();
        if (pinch > 0 && d > 0) this.globe.zoom(pinch / d, (((a.x + b.x) / 2 - r.left) / r.width) * 2 - 1, -((((a.y + b.y) / 2 - r.top) / r.height) * 2 - 1));
        pinch = d; moved += 99;
      }
    });
    const up = (e) => {
      if (!P.has(e.pointerId)) return;
      P.delete(e.pointerId);
      if (P.size === 0) {
        this.globe.held = false;
        // let go after a pause: it stays where it was put. Let go in a flick: it carries on.
        if (performance.now() - lastT > 90) this.globe.vel.lon = this.globe.vel.lat = 0;
        if (this.isOpen() && moved <= 5 && performance.now() - downAt < 600 && e.type === 'pointerup') { const [nx, ny] = norm(e); this.click(nx, ny); }
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { if (!this.isOpen()) return; e.preventDefault(); const [nx, ny] = norm(e); this.globe.zoom(Math.exp(clamp(e.deltaY, -400, 400) * 0.0018), nx, ny); }, { passive: false });
    cv.addEventListener('dblclick', (e) => { if (!this.isOpen()) return; const [nx, ny] = norm(e); this.globe.zoom(0.4, nx, ny); });
  }
  click(nx, ny) {
    const p = this.globe.hit(nx, ny); if (!p) return;
    const g = geoOf(p), G = this.globe;
    // an airport's dot under the pointer is what was meant
    const reach = Math.max(G.altKm * 0.018, 0.6), ap = this.airports.ready ? this.airports.near(g.lat, g.lon, reach, this.minSize())[0] : null;
    if (ap) this.select({ lat: ap.a.lat, lon: ap.a.lon, airport: ap.a, name: ap.a.name });
    else this.select({ lat: g.lat, lon: g.lon });
    if (G.altKm > 900) G.flyTo(this.sel.lat, this.sel.lon, Math.max((G.view.dist - 1) * 0.42, 0.02));
  }

  /* ---------------------------------------------------------------- the card */
  // s: { lat, lon, name?, airport?, alt?, hdg?, note? } or null
  select(s) {
    this.sel = s; this.card.classList.toggle('on', !!s); this.pin.style.display = s ? 'block' : 'none';
    if (!s) return;
    this.wantNames(s.lat, s.lon, 10);
    this.fill();
  }
  fill() {
    const s = this.sel; if (!s) return;
    const A = this.airports, near = A.ready ? A.near(s.lat, s.lon, 70).filter((o) => !s.airport || o.a !== s.airport) : [];
    const town = this.maps.nearest(s.lat, s.lon, PLACE, 30);
    const name = s.name || (town && town.d < 12000 ? town.n : null) || coords(s.lat, s.lon);
    $('gName').textContent = name;
    const bits = [];
    if (s.airport) bits.push(`${s.airport.iata || s.airport.id} · ${s.airport.town}${s.airport.cc ? ', ' + s.airport.cc : ''} · ${Math.round(s.airport.elev ?? 0)} m above the sea · longest runway ${Math.round(s.airport.longest)} m`);
    else { if (s.note) bits.push(s.note[0].toUpperCase() + s.note.slice(1)); if (town && town.n !== name) bits.push(`${(town.d / 1000).toFixed(0)} km from ${town.n}`); bits.push(coords(s.lat, s.lon)); }
    $('gSub').textContent = bits.join(' · ');
    const go = $('gGo'); go.textContent = '';
    const add = (title, sub, dest, main) => { const b = document.createElement('button'); if (main) b.className = 'main'; b.innerHTML = `${esc(title)}<i>${esc(sub)}</i>`; b.onclick = () => this.go(dest); go.appendChild(b); };
    const rw = (a) => `${a.rw.length} runway${a.rw.length > 1 ? 's' : ''}, the longest ${Math.round(a.longest)} m`;
    if (s.airport) {
      add('TAKE OFF HERE', `Lined up on the runway at ${s.airport.name}. ${rw(s.airport)}.`, { name, lat: s.airport.lat, lon: s.airport.lon, airport: s.airport }, true);
      add('Start in the air over it', 'Already flying, 600 m up.', { name, lat: s.lat, lon: s.lon, alt: 600, hdg: s.hdg ?? 0 }, false);
    } else add('FLY HERE', `Already in the air, ${s.alt ?? 480} m over the ground.`, { name, lat: s.lat, lon: s.lon, alt: s.alt ?? 480, hdg: s.hdg ?? 0 }, true);
    // the airports nearby, the larger and the nearer first
    near.sort((p, q) => (q.a.size - p.a.size) * 18 + (p.d - q.d));
    for (const o of near.slice(0, 3)) add(`Take off from ${o.a.name}`, `${o.d.toFixed(0)} km away · ${rw(o.a)}`, { name: o.a.name, lat: o.a.lat, lon: o.a.lon, airport: o.a }, false);
  }

  /* ---------------------------------------------------------------- search, and the list of ideas */
  search() {
    let timer = 0, seq = 0;
    const show = (rows) => {
      this.hits.textContent = '';
      for (const r of rows) { const b = document.createElement('button'); b.innerHTML = `${esc(r.title)}<i>${esc(r.sub)}</i>`; b.onclick = () => { this.hits.classList.remove('on'); this.q.blur(); this.globe.flyTo(r.lat, r.lon, r.look ?? 0.012); this.select(r.sel); }; this.hits.appendChild(b); }
      this.hits.classList.toggle('on', rows.length > 0);
    };
    const ports = (t) => this.airports.search(t, 5).map((a) => ({ title: a.name, sub: `${a.iata || a.id} · ${a.town}${a.cc ? ', ' + a.cc : ''}`, lat: a.lat, lon: a.lon, look: 0.006, sel: { lat: a.lat, lon: a.lon, airport: a, name: a.name } }));
    this.q.addEventListener('input', () => {
      const t = this.q.value.trim(), mine = ++seq; clearTimeout(timer);
      if (t.length < 2) { show([]); return; }
      const local = this.airports.ready ? ports(t) : []; show(local);
      timer = setTimeout(async () => {
        try {
          const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t)}&count=6&language=en&format=json`); if (!r.ok || mine !== seq) return;
          const j = await r.json(); if (mine !== seq) return;
          const places = (j.results || []).map((p) => ({ title: p.name, sub: [p.admin1, p.country].filter(Boolean).join(', '), lat: p.latitude, lon: p.longitude, look: /^(PPLC|PPLA|PPL)/.test(p.feature_code || '') && (p.population || 0) > 300000 ? 0.012 : 0.006, sel: { lat: p.latitude, lon: p.longitude, name: p.name } }));
          show([...places, ...local].slice(0, 9));
        } catch { /* the airports found already stay */ }
      }, 260);
    });
    this.q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.hits.querySelector('button')?.click(); if (e.key === 'Escape') { this.q.value = ''; show([]); this.q.blur(); } });
    this.q.addEventListener('keyup', (e) => e.stopPropagation());
  }
  ideas() {
    const box = $('gIdeas');
    for (const d of IDEAS) {
      const b = document.createElement('button'); b.innerHTML = `<b>${esc(d.name)}</b><i>${esc(d.note)}</i>`;
      b.onclick = async () => {
        this.globe.flyTo(d.lat, d.lon, d.look ?? 0.012);
        if (d.apt) { await this.airports.load(); const a = this.airports.byId(d.apt); if (a) { this.select({ lat: a.lat, lon: a.lon, airport: a, name: d.name }); return; } }
        this.select({ lat: d.lat, lon: d.lon, name: d.name, note: d.note, alt: d.alt, hdg: d.hdg });
      };
      box.appendChild(b);
    }
    // a wheel over the row slides it sideways
    box.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { box.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }

  /* ---------------------------------------------------------------- what is drawn on the globe */
  minSize() { const a = this.globe.altKm; return a > 5200 ? 2 : a > 1100 ? 1 : 0; }
  makeDots() {
    if (this.dots || !this.airports.ready) return;
    const L = this.airports.list, pos = new Float32Array(L.length * 3), size = new Float32Array(L.length), v = this._v;
    L.forEach((a, i) => { dirOf(a.lat, a.lon, v); pos.set([v.x, v.y, v.z], i * 3); size[i] = a.size; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.uMin = { value: 2 }; this.uPx = { value: 1 }; this.uOn = { value: 1 };
    this.dots = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uMin: this.uMin, uPx: this.uPx, uOn: this.uOn }, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: `attribute float aSize; uniform float uMin, uPx; varying float vA; void main() {
        float face = dot( position, cameraPosition ) - 1.0;                       // over the horizon from here: not drawn
        vA = step( uMin - 0.5, aSize ) * smoothstep( 0.0, 0.02 * length( cameraPosition ), face );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_PointSize = vA > 0.0 ? ( 4.2 + 2.4 * aSize - 1.6 * uMin ) * uPx : 0.0; }`,
      fragmentShader: `precision highp float; varying float vA; uniform float uOn; void main() { float d = length( gl_PointCoord - 0.5 ) * 2.0; if ( d > 1.0 || vA <= 0.0 ) discard;
        float ring = smoothstep( 1.0, 0.72, d ); vec3 c = mix( vec3( 0.06, 0.05, 0.03 ), vec3( 1.0, 0.70, 0.36 ), smoothstep( 0.80, 0.56, d ) ); gl_FragColor = vec4( c, ring * vA * uOn ); }` }));
    this.dots.frustumCulled = false; this.dots.renderOrder = 30; this.globe.scene.add(this.dots);
  }
  // the map's names round a place, asked for once per tile
  wantNames(lat, lon, z) {
    const n = 2 ** z, x = Math.floor(lonTile(lon, z)), y = Math.floor(latTile(lat, z)), k = z + '/' + x + '/' + y;
    if (this.namesAsked.has(k) || y < 0 || y >= n) return;
    this.namesAsked.add(k);
    this.maps.ask(z, x, y, { names: true }, {}, 5).then(() => { if (this.sel) this.fill(); });
  }
  label() { let e = this.pool.pop(); if (!e) { e = document.createElement('div'); this.layer.appendChild(e); } return e; }

  update(dt, w, h) {
    const G = this.globe, now = performance.now(), alt = G.altKm;
    if (this.dots) { this.uMin.value = this.minSize(); this.uPx.value = Math.max(1, h / 900) * (window.devicePixelRatio > 1.5 ? 1.5 : 1); this.dots.visible = true; }
    if (this.sel) { const p = G.screen(this.sel.lat, this.sel.lon, w, h, this._s); this.pin.style.display = p ? 'block' : 'none'; if (p) this.pin.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`; }
    if (now - this.labelAt < 140) { for (const L of this.labels) { const p = G.screen(L.lat, L.lon, w, h, this._s); L.el.style.display = p ? 'block' : 'none'; if (p) L.el.style.transform = `translate(${(p.x + 7).toFixed(1)}px, ${(p.y - 8).toFixed(1)}px)`; } return; }
    this.labelAt = now;
    // names from the map once the view is in close enough for them to mean something
    const c = geoOf(G.centre(this._v) || G.camera.position);
    // (only once the view has come to rest: on the way in, every level passed through would be fetched for nothing)
    const still = Math.abs(Math.log((G.want.dist - 1) / (G.view.dist - 1))) < 0.06;
    if (alt < 2600 && still) { const z = clamp(Math.round(10.2 - Math.log2(Math.max(alt, 12) / 30)), 4, 10); for (const [dx, dy] of (z >= 8 ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]])) { const n = 2 ** z; this.wantNames(clamp(tileLat(clamp(Math.floor(latTile(c.lat, z)) + dy, 0, n - 1) + 0.5, z), -84, 84), tileLon(Math.floor(lonTile(c.lon, z)) + dx + 0.5, z), z); } }
    // candidates, most important first
    const cand = [];
    const span = Math.min(alt / 6371 / D2R * 0.9 + 1.5, 80);                  // degrees round the middle worth looking at
    if (alt > 250) for (const ct of CITIES) cand.push({ n: ct[0], lat: ct[1], lon: ct[2], w: 1000 + ct[3], cls: ct[3] > 12 || alt < 4000 ? 'big' : '' });
    if (alt < 2600) {
      const kinds = alt > 900 ? new Set(['city']) : alt > 220 ? new Set(['city', 'town']) : new Set(['city', 'town', 'village', 'suburb', 'island']);
      for (const p of this.maps.names.values()) { if (!kinds.has(p.k) || Math.abs(p.lat - c.lat) > span || Math.abs(p.lon - c.lon) > span * 1.6) continue; cand.push({ n: p.n, lat: p.lat, lon: p.lon, w: (p.k === 'city' ? 600 : p.k === 'town' ? 300 : 100) - p.r, cls: p.k === 'city' ? 'big' : '' }); }
    }
    if (alt < 700 && this.airports.ready) for (const { a } of this.airports.near(c.lat, c.lon, Math.min(alt * 0.5, 260), alt > 160 ? 1 : 0).slice(0, 40)) cand.push({ n: (a.iata || a.id) + (alt < 260 ? ' ' + a.name.replace(/ (International )?Airport$/, '') : ''), lat: a.lat, lon: a.lon, w: 150 + a.size * 120, cls: 'apt' });
    cand.sort((p, q) => q.w - p.w);
    for (const L of this.labels) { L.el.style.display = 'none'; this.pool.push(L.el); }
    this.labels.length = 0;
    const boxes = [], seen = new Set();
    for (const cd of cand) {
      if (this.labels.length >= 34) break;
      if (seen.has(cd.n)) continue;
      const p = G.screen(cd.lat, cd.lon, w, h, this._s); if (!p || p.x < 4 || p.y < 60 || p.x > w - 60 || p.y > h - 80) continue;
      const bw = cd.n.length * (cd.cls === 'big' ? 7.6 : 6.6) + 14, bx = p.x + 2, by = p.y - 16;
      let ok = true; for (const b of boxes) if (bx < b[0] + b[2] && bx + bw > b[0] && by < b[1] + 20 && by + 20 > b[1]) { ok = false; break; }
      if (!ok) continue;
      boxes.push([bx, by, bw]); seen.add(cd.n);
      const e = this.label(); e.className = 'gLabel ' + cd.cls; e.textContent = cd.n; e.style.display = 'block'; e.style.transform = `translate(${(p.x + 7).toFixed(1)}px, ${(p.y - 8).toFixed(1)}px)`;
      this.labels.push({ el: e, lat: cd.lat, lon: cd.lon });
    }
  }
}
