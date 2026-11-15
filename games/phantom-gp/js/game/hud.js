// hud.js — everything drawn in the page rather than in the scene: loading, title, film captions, race HUD, menus.
import { W, frameAt } from '../track/world.js';
import { PAINTS } from '../car/mats.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
export const fmtLap = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };

export const DEFAULTS = { laps: 1, skill: 'pro', paint: 0, assist: 1, autoThrottle: false, music: true, sound: true, quality: 'auto', line: true };
export function loadSettings(touch) {
  const s = { ...DEFAULTS, assist: touch ? 2 : 1, autoThrottle: touch };
  try { Object.assign(s, JSON.parse(localStorage.getItem('phantom-gp') || '{}')); } catch (e) { /* private window: defaults */ }
  return s;
}
const save = (s) => { try { localStorage.setItem('phantom-gp', JSON.stringify(s)); } catch (e) { /* fine */ } };

const OPTIONS = {
  laps: ['Laps', [['1', 1], ['2', 2], ['3', 3]]],
  skill: ['Rival', [['Rookie', 'rookie'], ['Pro', 'pro'], ['Legend', 'legend']]],
  paint: ['Livery', PAINTS.map((p, i) => [p.name, i])],
  assist: ['Driving help', [['Off', 0], ['Brakes', 1], ['Full', 2]]],
  autoThrottle: ['Throttle', [['Auto', true], ['Manual', false]]],
  line: ['Racing line', [['On', true], ['Off', false]]],
  music: ['Music', [['On', true], ['Off', false]]],
  sound: ['Sound', [['On', true], ['Off', false]]],
  quality: ['Quality', [['Auto', 'auto'], ['High', 'high'], ['Medium', 'medium'], ['Low', 'low']]],
};

export class Hud {
  constructor(settings, on) {
    this.s = settings; this.on = on; this.cur = 'load'; this.toastT = 0; this.acc = 0; this.last = {};
    this.layers = { load: $('load'), title: $('title'), cine: $('cine'), race: $('hud'), pause: $('pause'), result: $('result'), menu: $('menu') };
    const rev = $('h-rev'); for (let i = 0; i < 15; i++) rev.appendChild(document.createElement('i'));
    this.revEls = [...rev.children];
    this.rows($('menu-rows'), ['laps', 'skill', 'paint', 'assist', 'autoThrottle', 'line', 'music', 'quality']);
    this.rows($('pause-rows'), ['assist', 'autoThrottle', 'line', 'music', 'sound']);
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); fn(); });
    click('b-start', () => on.start()); click('skip', () => on.skip()); click('b-resume', () => on.resume()); click('b-restart', () => on.restart()); click('b-quit', () => on.quit());
    click('b-rematch', () => on.rematch()); click('b-tomenu', () => on.toMenu()); click('b-duel', () => on.duel()); click('b-intro', () => on.film());
    click('b-cam', () => on.cam()); click('b-pause', () => on.pause());
    $('menu-keys').innerHTML = matchMedia('(pointer: coarse)').matches
      ? 'Drag the puck to steer · Brake on the right · Boost when the bar is full'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows to drive · <kbd>Shift</kbd> or <kbd>Space</kbd> boost · <kbd>C</kbd> camera · <kbd>R</kbd> back on track · <kbd>Esc</kbd> pause · gamepad works too';
    $('h-hint').innerHTML = '<div><kbd>W A S D</kbd>drive</div><div><kbd>Shift</kbd>boost</div><div><kbd>C</kbd>camera</div>';
  }

  rows(host, keys) {
    for (const k of keys) {
      const [label, opts] = OPTIONS[k], row = document.createElement('div'); row.className = 'row'; row.dataset.key = k;
      const sp = document.createElement('span'); sp.textContent = label; row.appendChild(sp);
      const seg = document.createElement('div'); seg.className = 'seg' + (k === 'paint' ? ' paint' : ''); row.appendChild(seg);
      for (const [name, val] of opts) {
        const b = document.createElement('button'); b.dataset.spring = ''; b.dataset.val = JSON.stringify(val);
        if (k === 'paint') { const p = PAINTS[val]; b.style.background = `linear-gradient(135deg, ${p.a} 0 60%, ${p.b} 60% 100%)`; b.title = name; b.setAttribute('aria-label', name); } else b.textContent = name;
        b.addEventListener('click', () => { this.s[k] = val; save(this.s); this.refresh(); this.on.setting(k, val); });
        seg.appendChild(b);
      }
      host.appendChild(row);
    }
    this.refresh();
  }
  refresh() {
    for (const row of document.querySelectorAll('.row[data-key]')) {
      const v = JSON.stringify(this.s[row.dataset.key]);
      for (const b of row.querySelectorAll('button')) b.classList.toggle('on', b.dataset.val === v);
      if (row.dataset.key === 'autoThrottle') row.style.display = document.body.classList.contains('touch') ? '' : 'none';
    }
    document.body.classList.toggle('manual', !this.s.autoThrottle);
  }

  screen(name) {
    this.cur = name;
    for (const [k, el] of Object.entries(this.layers)) el.classList.toggle('on', k === name || (k === 'race' && (name === 'pause')));
    document.body.classList.toggle('racing', name === 'race');
    $('h-btns').classList.toggle('off', !(name === 'race' || name === 'pause'));     // the site's own menu button docks here while the row shows
  }
  load(text, p) { $('load-text').textContent = text; $('load-bar').firstElementChild.style.width = Math.round(p * 100) + '%'; }
  bars(on) { $('cine').classList.toggle('bars', on); }
  caption(small, big, center = false) { const c = $('cap'); c.firstElementChild.textContent = small || ''; c.lastElementChild.textContent = big || ''; c.classList.toggle('center', center); c.classList.toggle('on', !!(small || big)); }
  toast(small, big, sec = 1.8) { const t = $('h-toast'); t.firstElementChild.textContent = small || ''; t.lastElementChild.textContent = big || ''; t.classList.add('on'); this.toastT = sec; }
  lights(n) { const L = $('h-lights'); L.classList.toggle('on', n >= 0); [...L.children].forEach((el, i) => el.classList.toggle('lit', i < n)); }
  hint(on) { $('h-hint').classList.toggle('off', !on); }
  rivalName(n) { $('h-rname').textContent = n; }

  initMap() {
    const c = $('h-map'); this.mapCtx = c.getContext('2d');
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let i = 0; i < W.N; i += 4) { minx = Math.min(minx, W.tx[i]); maxx = Math.max(maxx, W.tx[i]); minz = Math.min(minz, W.tz[i]); maxz = Math.max(maxz, W.tz[i]); }
    const pad = 16, sc = Math.min((c.width - 2 * pad) / (maxx - minx), (c.height - 2 * pad) / (maxz - minz));
    this.mapT = { sc, ox: (c.width - (maxx - minx) * sc) / 2 - minx * sc, oz: (c.height - (maxz - minz) * sc) / 2 - minz * sc, w: c.width, h: c.height };
    // the outline never changes: draw it once
    const bg = document.createElement('canvas'); bg.width = c.width; bg.height = c.height; const g = bg.getContext('2d'), { ox, oz } = this.mapT;
    g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
    for (let i = 0; i <= W.N; i += 3) { const k = i % W.N, x = W.tx[k] * sc + ox, z = W.tz[k] * sc + oz; i ? g.lineTo(x, z) : g.moveTo(x, z); }
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 9; g.stroke(); g.strokeStyle = '#f1f2f3'; g.lineWidth = 4; g.stroke();
    const sf = frameAt(0, {}); g.fillStyle = '#e2231a'; g.fillRect(sf.x * sc + ox - 7, sf.z * sc + oz - 2, 14, 4);
    this.mapBg = bg;
  }

  // per frame while racing
  race(dt, P, R, race, top) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('h-toast').classList.remove('on'); }
    const L = this.last, kmh = Math.round(Math.abs(P.u) * 3.6);
    if (kmh !== L.kmh) { $('h-kmh').textContent = kmh; L.kmh = kmh; }
    const gear = P.rev ? 'R' : P.gear; if (gear !== L.gear) { $('h-gear').textContent = gear; L.gear = gear; }
    const leds = Math.round(Math.min(1, Math.max(0, (P.rpm - 6200) / 6100)) * 15);
    if (leds !== L.leds) { this.revEls.forEach((el, i) => { el.className = i < leds ? (i < 5 ? 'g' : i < 10 ? 'r' : 'b') : ''; }); L.leds = leds; }
    const en = Math.round(P.energy * 100); if (en !== L.en) { $('h-boost').firstElementChild.style.transform = `scaleX(${P.energy.toFixed(3)})`; L.en = en; }
    if (P.boost !== L.boost) { $('h-boost').classList.toggle('on', !!P.boost); L.boost = P.boost; }
    this.acc += dt; if (this.acc < 0.1) return; this.acc = 0;
    const pos = race.pos; if (pos !== L.pos) { const el = $('h-p'); el.textContent = 'P' + pos; el.classList.toggle('p2', pos === 2); L.pos = pos; }
    const lapN = Math.min(race.laps, Math.max(1, P.lap + 1)), lapS = lapN + '/' + race.laps; if (lapS !== L.lapS) { $('h-lap').textContent = lapS; L.lapS = lapS; }
    $('h-time').textContent = fmtTime(race.t);
    const g = race.gap, gv = $('h-gapv'); gv.textContent = (g >= 0 ? '+' : '−') + Math.min(99.9, Math.abs(g)).toFixed(2); gv.className = g >= 0 ? 'ahead' : 'behind';
    const tags = (P.draft > 0.25 ? '<b>Slipstream</b>' : '') + (P.boost ? '<b>Boost</b>' : '') + (top.assist ? '<b>' + top.assist + '</b>' : '');
    if (tags !== L.tags) { $('h-tags').innerHTML = tags; L.tags = tags; }
    // name of the corner coming up
    let name = '';
    for (const [nm, ls] of W.meta.labels) { const d = ((ls - P.s) % W.L + W.L) % W.L; if (d < 170 || d > W.L - 60) name = nm; }
    if (name !== L.corner) { const el = $('h-corner'); if (name) el.textContent = name; el.classList.toggle('on', !!name); L.corner = name; }
    // minimap
    const c = this.mapCtx, { sc, ox, oz, w, h } = this.mapT;
    c.clearRect(0, 0, w, h); c.drawImage(this.mapBg, 0, 0);
    const dot = (b, col, r) => { c.beginPath(); c.arc(b.x * sc + ox, b.z * sc + oz, r, 0, 6.283); c.fillStyle = col; c.fill(); c.lineWidth = 3; c.strokeStyle = '#0b0b0c'; c.stroke(); };
    dot(R, top.rivalColor || '#ff3b2f', 7); dot(P, top.playerColor || '#f2b200', 8.5);
  }

  result(r) {
    $('r-title').textContent = r.won ? 'Victory' : 'Beaten'; $('r-title').className = r.won ? 'win' : 'lose';
    $('r-line').textContent = r.line;
    $('r-stats').innerHTML = r.stats.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  }
}
