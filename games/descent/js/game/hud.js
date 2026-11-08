// DOM interface for the game: bars, radar, lock-on, danger arrows, toasts, level-up cards, menus, bestiary.
import { ACHIEVEMENTS } from './achievements.js';
import { FORMS, ATTRS, ABILITIES, PASSIVES, XP_NEED, MAX_LEVEL, ZONES, LEVEL_ZONE, LEVEL_GOALS, SPECIES, TIPS, DIFFICULTY, zoneAt } from './data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ICONS = {
  bolt: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  turn: '<path d="M20 12a8 8 0 1 0-3 6.2"/><path d="M20 19v-5h-5"/>',
  lungs: '<path d="M12 3v7"/><path d="M10 9C7 10 3 14 3 19c0 1.5 1.5 2.5 3 2s2.5-2 2.5-4V12z"/><path d="M14 9c3 1 7 5 7 10 0 1.5-1.5 2.5-3 2s-2.5-2-2.5-4V12z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z"/>',
  heart: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"/>',
  jaw: '<path d="M3 8h18v2c0 5-4 8-9 8s-9-3-9-8z"/><path d="M7 10v3M10 10v4M14 10v4M17 10v3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ghost: '<path d="M5 21V11a7 7 0 0 1 14 0v10l-3-2-2 2-2-2-2 2-2-2z"/><circle cx="9.5" cy="11" r="1"/><circle cx="14.5" cy="11" r="1"/>',
  stomach: '<path d="M7 5c4-2 9 0 10 5 1 5-3 9-8 9-3 0-5-2-5-4 0-2 2-3 3-4S5 7 7 5z"/>',
  drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
  ink: '<path d="M7 18a4 4 0 0 1-1-7.9A5 5 0 0 1 16 8a4 4 0 0 1 1 8z"/><path d="M9 21h8"/>',
  zap: '<circle cx="12" cy="12" r="2.5"/><path d="M6.5 6.5a8 8 0 0 0 0 11M17.5 6.5a8 8 0 0 1 0 11M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17"/>',
  puff: '<circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  rush: '<path d="M4 6l7 6-7 6M12 6l7 6-7 6"/>',
  decoy: '<path d="M3 9c2-2 4-2 6 0-2 2-4 2-6 0zM11 5c2-2 4-2 6 0-2 2-4 2-6 0zM11 15c2-2 4-2 6 0-2 2-4 2-6 0zM15 10c2-2 4-2 6 0-2 2-4 2-6 0z"/>',
  frenzy: '<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-10z"/>',
  pulse: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  fish: '<path d="M2 12c3-5 8-6 12-3l4-3v12l-4-3c-4 3-9 2-12-3z"/><circle cx="8" cy="11" r="1"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

const CSS = `
#gui { position: fixed; inset: 0; pointer-events: none; font-family: "Segoe UI", system-ui, sans-serif; color: #e3f6ff; user-select: none; z-index: 5; --teal:#7fd8ff; --gold:#ffd166; --red:#ff5a4d; --green:#5dffb0; }
#gui * { box-sizing: border-box; }
#gui .glass { background: rgba(4,26,38,.58); border: 1px solid rgba(160,220,255,.22); border-radius: 14px; backdrop-filter: blur(8px); box-shadow: 0 4px 24px rgba(0,10,20,.35); }
#gui .ic { width: 1em; height: 1em; display: inline-block; vertical-align: -.12em; }
#gui .ui { zoom: var(--ui, 1); }
#gui .ov > * { zoom: var(--ui, 1); }
body.photo #gui .hudpart { display: none; }
#gui.hide .hudpart { display: none; }
.card0 { position: absolute; left: 20px; top: 18px; width: 290px; padding: 12px 14px 12px; }
.card0 .row1 { display: flex; align-items: center; gap: 10px; }
.badge { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; font-weight: 600; font-size: 19px; background: radial-gradient(circle at 35% 30%, #3c8fb5, #0e3c58); border: 2px solid rgba(160,230,255,.6); box-shadow: 0 0 14px rgba(80,200,255,.35); }
.card0 .nm { font-size: 16px; letter-spacing: .02em; line-height: 1.1; }
.card0 .sub { font-size: 11px; opacity: .65; letter-spacing: .12em; text-transform: uppercase; margin-top: 2px; }
.bar { position: relative; height: 9px; border-radius: 6px; background: rgba(255,255,255,.1); overflow: hidden; margin-top: 8px; }
.bar > i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; border-radius: 6px; transition: width .12s linear; }
.bar.xp > i { background: linear-gradient(90deg, #36c6ff, #7dffd3 70%, #ffe27a); }
.bar.hp > i { background: linear-gradient(90deg, #ff4d4d, #ffb347 55%, #6dff8f); }
.bar.st > i { background: linear-gradient(90deg, #3a8dff, #8be4ff); }
.bar.xp { height: 11px; }
.bar.big { height: 12px; }
.lbl { display: flex; justify-content: space-between; font-size: 11px; opacity: .8; margin-top: 7px; letter-spacing: .06em; }
.lbl + .bar { margin-top: 3px; }
.bar.low > i { animation: lowhp .7s infinite alternate; }
@keyframes lowhp { from { filter: brightness(1); } to { filter: brightness(1.9); } }
.chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; min-height: 0; }
.chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px 2px 5px; border-radius: 9px; font-size: 11px; background: rgba(120,210,255,.12); border: 1px solid rgba(160,220,255,.25); color: #cfeeff; }
.chip.ab { border-color: rgba(255,209,102,.5); color: #ffe7a8; background: rgba(255,209,102,.1); }
.chip.ps { border-color: rgba(190,140,255,.5); color: #e3ccff; background: rgba(190,140,255,.1); }
.chip .ic { font-size: 13px; }
.forms { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 14px; }
.fchip { padding: 4px 9px; border-radius: 9px; font-size: 11px; background: rgba(255,255,255,.06); border: 1px solid rgba(160,220,255,.18); opacity: .5; }
.fchip.done { opacity: .9; border-color: rgba(93,255,176,.4); }
.fchip.now { opacity: 1; background: rgba(60,160,220,.35); border-color: rgba(190,240,255,.8); font-weight: 600; }
.statrow { display: flex; align-items: center; gap: 8px; margin-top: 7px; font-size: 12px; opacity: .92; }
.statrow .ic { opacity: .8; font-size: 14px; }
.statrow .bar { flex: 1; margin-top: 0; }
.top-r { position: absolute; right: 20px; top: 18px; display: flex; gap: 10px; align-items: flex-start; pointer-events: auto; }
.where { padding: 9px 14px; text-align: right; min-width: 180px; }
.where .d { font-size: 28px; font-weight: 300; line-height: 1; }
.where .d small { font-size: 13px; opacity: .6; margin-left: 3px; }
.where .z { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; opacity: .85; margin-top: 5px; }
.btn-ic { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; font-size: 19px; color: #d8f3ff; }
.btn-ic:hover { background: rgba(30,90,125,.65); }
.goal { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); max-width: 520px; text-align: center; padding: 8px 16px; font-size: 13px; letter-spacing: .02em; opacity: .95; }
.goal b { color: var(--gold); font-weight: 600; }
.combo { position: absolute; top: 74px; left: 50%; transform: translateX(-50%); font-size: 22px; font-weight: 600; color: var(--gold); text-shadow: 0 2px 10px rgba(0,0,0,.5); opacity: 0; transition: opacity .2s; letter-spacing: .04em; }
.combo.on { opacity: 1; }
.toasts { position: absolute; top: 116px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; }
.toast { padding: 7px 14px; font-size: 13px; border-radius: 12px; background: rgba(4,26,38,.7); border: 1px solid rgba(160,220,255,.25); animation: toastin .25s ease-out; transition: opacity .4s; }
.toast.disc { border-color: rgba(255,209,102,.7); color: #ffe7a8; }
.toast.warn { border-color: rgba(255,90,77,.7); color: #ffc8c2; }
.toast.good { border-color: rgba(93,255,176,.6); }
@keyframes toastin { from { opacity: 0; transform: translateY(-8px); } }
.radar { position: absolute; left: 20px; bottom: 20px; width: 150px; height: 150px; border-radius: 50%; overflow: hidden; }
.radar canvas { width: 150px; height: 150px; display: block; }
.radar-leg { position: absolute; left: 20px; bottom: 176px; font-size: 10px; letter-spacing: .08em; opacity: .7; display: flex; gap: 10px; }
.radar-leg i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.abil { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; gap: 12px; align-items: flex-end; }
.slot { position: relative; width: 56px; height: 56px; display: grid; place-items: center; font-size: 26px; border-radius: 14px; overflow: hidden; }
.slot .k { position: absolute; right: 5px; bottom: 3px; font-size: 11px; opacity: .85; font-weight: 600; }
.slot .cd { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: rgba(0,10,20,.7); }
.slot.empty { opacity: .35; }
.slot.ready { box-shadow: 0 0 14px rgba(110,220,255,.45); border-color: rgba(160,230,255,.6); }
.slot .nm { position: absolute; left: 0; right: 0; top: 3px; text-align: center; font-size: 8px; letter-spacing: .08em; opacity: .65; text-transform: uppercase; }
.slot.small { width: 46px; height: 46px; font-size: 21px; }
#gui.touch .slot { pointer-events: auto; touch-action: none; }
#gui.touch .slot .k { display: none; }
#gui.touch .abil { bottom: calc(18px + env(safe-area-inset-bottom, 0px)); }
#gui.touch .hint { bottom: calc(86px / var(--ui, 1)); }
@media (orientation: portrait) {                                   /* tall phone: tiles beside the radar on the right, under the rise/sink/dash column */
  #gui.touch .abil { left: auto; right: max(14px, env(safe-area-inset-right, 0px)); transform: none; }
  #gui.touch .hint { left: calc(14px / var(--ui, 1)); transform: none; max-width: calc((100vw - 104px) / var(--ui, 1)); }
}
.guide { position: absolute; right: 20px; bottom: 22px; padding: 9px 13px; font-size: 12px; display: flex; align-items: center; gap: 10px; max-width: 250px; }
.guide .arr { width: 30px; height: 30px; display: grid; place-items: center; }
.guide .arr svg { width: 26px; height: 26px; transition: transform .1s; }
.guide small { opacity: .65; display: block; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
.cross { position: absolute; left: 50%; top: 50%; width: calc(4px * var(--ui, 1)); height: calc(4px * var(--ui, 1)); margin: calc(-2px * var(--ui, 1)) 0 0 calc(-2px * var(--ui, 1)); border-radius: 50%; background: rgba(255,255,255,.55); box-shadow: 0 0 6px rgba(0,0,0,.5); }
/* lock-on reticle: an SVG ring (rotating arcs, ticks, glow), a pill with the name and the growth you would get */
.lock { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: opacity .14s; --lk: 93,255,176; --sz: 64px; }
.lock.on { opacity: 1; }
.lock.haz { --lk: 255,193,7; }
.lock.gold { --lk: 255,215,94; }
.lock .box { position: absolute; left: calc(var(--sz) / -2); top: calc(var(--sz) / -2); width: var(--sz); height: var(--sz); transition: transform .16s cubic-bezier(.2,.8,.3,1); }
.lock.in .box { transform: scale(.86); }
.lock.acq .box { animation: lkin .22s cubic-bezier(.2,.8,.3,1); }
.lock .box svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.lock .glow { fill: none; stroke: rgba(var(--lk), .30); stroke-width: 7; filter: blur(3.5px); }
.lock .rim { fill: none; stroke: rgba(var(--lk), .22); stroke-width: 1; vector-effect: non-scaling-stroke; }
.lock .arcs { transform-origin: 50px 50px; animation: lkspin 10s linear infinite; }
.lock.in .arcs { animation-duration: 3.2s; }
.lock .arc { fill: none; stroke: rgb(var(--lk)); stroke-width: 2.2; stroke-linecap: round; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 3px rgba(var(--lk), .8)); transition: stroke-width .15s; }
.lock.in .arc { stroke-width: 3.2; }
.lock .tick { stroke: rgba(var(--lk), .95); stroke-width: 1.7; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.lock .dot { fill: rgba(var(--lk), .95); filter: drop-shadow(0 0 3px rgba(var(--lk), .9)); }
.lock .tag { position: absolute; left: 0; top: calc(var(--sz) / 2 + 12px); transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 3px 11px 3px 9px; border-radius: 999px; white-space: nowrap; font-size: calc(12px * var(--ui, 1)); letter-spacing: .04em;
  background: rgba(3,22,34,.78); border: 1px solid rgba(var(--lk), .5); box-shadow: 0 2px 14px rgba(0,10,20,.55), inset 0 0 10px rgba(var(--lk), .08); }
.lock .tag .ic-w { display: inline-flex; align-items: center; }
.lock .tag .ic { color: rgb(var(--lk)); font-size: 1.2em; vertical-align: 0; }
.lock .tag .nm { color: #eaf8ff; }
.lock .tag .xp { color: rgb(var(--lk)); font-weight: 700; font-variant-numeric: tabular-nums; }
@keyframes lkspin { to { transform: rotate(360deg); } }
@keyframes lkin { from { transform: scale(1.9); opacity: 0; } to { transform: none; opacity: 1; } }
.thr { position: absolute; left: 0; top: 0; width: calc(36px * var(--ui, 1)); height: calc(36px * var(--ui, 1)); margin: calc(-18px * var(--ui, 1)) 0 0 calc(-18px * var(--ui, 1)); display: none; place-items: center; color: #fff; font-weight: 800; font-size: 18px; }
.thr.on { display: grid; }
.thr .tri { position: absolute; inset: 0; background: rgba(255,60,50,.88); clip-path: polygon(50% 0, 100% 100%, 0 100%); filter: drop-shadow(0 0 6px rgba(255,40,30,.8)); }
.thr span { position: relative; top: calc(5px * var(--ui, 1)); font-size: calc(15px * var(--ui, 1)); }
.vig { position: fixed; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, rgba(255,0,0,0) 45%, rgba(220,10,10,.55) 100%); opacity: 0; }
.vig.low { animation: lowv 1s infinite alternate; }
@keyframes lowv { from { opacity: .0; } to { opacity: .35; } }
.ftxt { position: absolute; left: 0; top: 0; font-size: calc(15px * var(--ui, 1)); font-weight: 700; text-shadow: 0 1px 6px rgba(0,0,0,.8); animation: floaty 1.1s ease-out forwards; white-space: nowrap; pointer-events: none; }
@keyframes floaty { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -48px); } }
.hint { position: absolute; left: 50%; bottom: 100px; transform: translateX(-50%); padding: 9px 18px; font-size: 14px; text-align: center; max-width: 560px; animation: toastin .3s; }
.banner { position: absolute; left: 0; right: 0; top: max(30%, 200px); text-align: center; opacity: 0; pointer-events: none; }
.banner b { display: block; font-weight: 200; font-size: clamp(26px, 4vw, 48px); letter-spacing: .34em; text-indent: .34em; text-transform: uppercase; text-shadow: 0 3px 22px rgba(0,30,60,.85); }
.banner span { display: block; margin-top: 8px; font-size: 14px; letter-spacing: .14em; opacity: .85; text-shadow: 0 2px 10px rgba(0,20,40,.9); }
.banner.on { animation: bannerin 4.2s ease-in-out forwards; }
@keyframes bannerin { 0% { opacity: 0; transform: translateY(8px); } 14% { opacity: 1; transform: none; } 78% { opacity: 1; } 100% { opacity: 0; } }
.gold { position: absolute; left: 0; top: 0; width: calc(44px * var(--ui, 1)); margin: calc(-22px * var(--ui, 1)) 0 0 calc(-22px * var(--ui, 1)); display: none; flex-direction: column; align-items: center; color: #ffd75e; filter: drop-shadow(0 0 8px rgba(255,200,60,.8)); }
.gold.on { display: flex; } .gold svg { width: calc(26px * var(--ui, 1)); height: calc(26px * var(--ui, 1)); fill: #ffd75e; } .gold span { font-size: calc(10px * var(--ui, 1)); letter-spacing: .06em; margin-top: 1px; white-space: nowrap; text-shadow: 0 1px 4px #000; }
.lockp { position: absolute; left: 50%; top: 68%; transform: translateX(-50%); padding: 12px 24px; font-size: 17px; letter-spacing: .08em; pointer-events: none; animation: lockpulse 1.4s infinite alternate; }
.lockp small { display: block; font-size: 11px; opacity: .65; margin-top: 3px; letter-spacing: .12em; text-transform: uppercase; }
@keyframes lockpulse { from { box-shadow: 0 0 0 rgba(120,220,255,0); } to { box-shadow: 0 0 22px rgba(120,220,255,.45); } }
.hint kbd, .kbd { display: inline-block; min-width: 22px; padding: 1px 6px; border-radius: 6px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.3); font: 600 12px "Segoe UI", sans-serif; text-align: center; }

/* overlays */
.ov { position: fixed; inset: 0; display: none; pointer-events: auto; align-items: center; justify-content: center; flex-direction: column; background: rgba(2,12,20,.55); backdrop-filter: blur(5px); z-index: 20; }
.ov.on { display: flex; }
.ov.clear { background: transparent; backdrop-filter: none; }
#ov-title { backdrop-filter: none; background: radial-gradient(ellipse at 50% 42%, rgba(2,14,24,.62) 0%, rgba(2,14,24,.22) 62%, rgba(2,14,24,.4) 100%); }
.panel { scrollbar-width: thin; scrollbar-color: rgba(160,220,255,.4) transparent; }
.panel::-webkit-scrollbar { width: 8px; } .panel::-webkit-scrollbar-thumb { background: rgba(160,220,255,.35); border-radius: 4px; } .panel::-webkit-scrollbar-track { background: transparent; }
.ov.bottom { justify-content: flex-end; padding-bottom: 6vh; background: linear-gradient(to top, rgba(2,12,20,.78), rgba(2,12,20,0) 62%); backdrop-filter: none; }
.ov h1 { margin: 0; font-weight: 200; font-size: clamp(34px, 6vw, 72px); letter-spacing: .38em; text-indent: .38em; text-shadow: 0 4px 30px rgba(0,30,60,.7); }
.ov h2 { margin: 0 0 6px; font-weight: 300; font-size: 28px; letter-spacing: .22em; text-indent: .22em; text-transform: uppercase; }
.ov .tag { margin: 10px 0 28px; font-size: 15px; letter-spacing: .24em; text-transform: uppercase; opacity: .8; }
.menu { display: flex; flex-direction: column; gap: 10px; min-width: 260px; }
.mbtn { display: block; padding: 12px 22px; border-radius: 12px; font-size: 15px; letter-spacing: .12em; text-transform: uppercase; text-align: center; cursor: pointer; color: #e8f8ff; background: rgba(8,40,60,.62); border: 1px solid rgba(160,220,255,.3); transition: background .15s, transform .1s; }
.mbtn:hover { background: rgba(30,100,140,.75); transform: translateY(-1px); }
.mbtn.main { background: linear-gradient(180deg, rgba(40,150,200,.8), rgba(14,80,120,.85)); border-color: rgba(190,240,255,.65); font-weight: 600; }
.mbtn.dim { opacity: .45; pointer-events: none; }
.mbtn small { display: block; font-size: 10px; opacity: .65; letter-spacing: .1em; margin-top: 3px; }
.panel { padding: 22px 26px; max-width: min(92vw, 720px); max-height: 82vh; overflow: auto; }
.panel h3 { margin: 0 0 12px; font-weight: 300; letter-spacing: .2em; text-transform: uppercase; font-size: 14px; opacity: .9; }
.panel p { margin: 6px 0; line-height: 1.5; font-size: 14px; opacity: .92; }
.keys { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 14px; align-items: center; }
.set { display: grid; grid-template-columns: 150px 1fr 54px; gap: 10px 14px; align-items: center; font-size: 13px; }
.set input[type=range] { width: 100%; }
.set select { background: #0a2a3e; color: #d8f3ff; border: 1px solid rgba(160,220,255,.3); border-radius: 6px; padding: 4px 6px; grid-column: 2 / 4; }
.cards { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
.ucard { width: 230px; padding: 18px 18px 16px; border-radius: 16px; cursor: pointer; text-align: center; background: rgba(6,34,50,.78); border: 1px solid rgba(160,220,255,.3); transition: transform .15s, border-color .15s, box-shadow .15s; position: relative; }
.ucard:hover { transform: translateY(-6px); border-color: rgba(190,240,255,.9); box-shadow: 0 10px 34px rgba(60,180,255,.3); }
.ucard .big { font-size: 40px; color: var(--teal); }
.ucard .nm { font-size: 17px; margin: 8px 0 2px; letter-spacing: .03em; }
.ucard .rk { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .7; }
.ucard .tx { font-size: 13px; line-height: 1.45; opacity: .9; margin-top: 10px; }
.ucard .num { position: absolute; left: 10px; top: 8px; font-size: 11px; opacity: .55; }
.ucard.ability { border-color: rgba(255,209,102,.6); } .ucard.ability .big { color: var(--gold); }
.ucard.passive { border-color: rgba(190,140,255,.6); } .ucard.passive .big { color: #d5b3ff; }
.evo { text-align: center; margin-bottom: 26px; }
.evo .nm { font-size: clamp(28px, 4.4vw, 52px); font-weight: 200; letter-spacing: .26em; text-indent: .26em; text-transform: uppercase; text-shadow: 0 4px 24px rgba(0,30,60,.8); }
.evo .lv { font-size: 13px; letter-spacing: .3em; text-transform: uppercase; opacity: .8; margin-bottom: 8px; }
.evo .bl { font-size: 15px; opacity: .88; margin-top: 10px; max-width: 520px; line-height: 1.5; }
.evo .pk { margin-top: 14px; display: inline-block; padding: 6px 14px; border-radius: 10px; background: rgba(255,209,102,.14); border: 1px solid rgba(255,209,102,.5); font-size: 13px; color: #ffe7a8; }
.dead h2 { color: #ff8b80; }
.stats { display: grid; grid-template-columns: repeat(2, auto); gap: 6px 26px; justify-content: center; font-size: 14px; margin: 14px 0 20px; }
.stats b { font-weight: 600; color: var(--teal); }
.dex { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.dcard { padding: 10px 12px; border-radius: 12px; background: rgba(6,34,50,.7); border: 1px solid rgba(160,220,255,.2); font-size: 12px; }
.dcard.unk { opacity: .45; }
.dcard .t { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
.dcard .r { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
.r.prey { color: var(--green); } .r.pred { color: var(--red); } .r.hazard { color: #ffc107; } .r.neutral { color: #b6c8d6; }
.dcard p { margin: 4px 0 0; font-size: 12px; line-height: 1.4; opacity: .85; }
.tipline { margin-top: 20px; font-size: 13px; opacity: .65; max-width: 480px; text-align: center; }
.fade { position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none; z-index: 19; }
@media (max-width: 900px) { .card0 { width: 230px; } .goal { display: none; } .radar { width: 110px; height: 110px; } .radar canvas { width: 110px; height: 110px; } .guide { display: none; } }
`;

const LABELS = { prey: 'Food', pred: 'Hunter', hazard: 'Hazard', neutral: 'Harmless' };

export class Hud {
  constructor(game) {
    this.g = game; this.t = 0; this.cache = {}; this.toastList = [];
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const root = this.root = document.createElement('div'); root.id = 'gui';
    root.innerHTML = `
      <div class="hudpart ui">
        <div class="card0 glass">
          <div class="row1"><div class="badge" id="g-lv">1</div><div><div class="nm" id="g-form">Glass Fry</div><div class="sub" id="g-sub">Growth</div></div></div>
          <div class="lbl"><span>GROWTH</span><span id="g-xpt">0 / 56</span></div>
          <div class="bar xp"><i id="g-xp"></i></div>
          <div class="statrow" style="margin-top:10px"><span class="ic-wrap" style="color:#ff8a80">${icon('heart')}</span><div class="bar hp" id="g-hpb"><i id="g-hp"></i></div><span id="g-hpt" style="width:34px;text-align:right;font-size:11px;opacity:.8">100</span></div>
          <div class="statrow"><span style="color:#8be4ff">${icon('bolt')}</span><div class="bar st"><i id="g-st"></i></div><span style="width:34px"></span></div>
          <div class="chips" id="g-chips"></div>
        </div>
        <div class="goal glass" id="g-goal"></div>
        <div class="combo" id="g-combo"></div>
        <div class="toasts" id="g-toasts"></div>
        <div class="top-r"><div class="where glass"><div class="d"><span id="g-d">0</span><small>m</small></div><div class="z" id="g-z">Lagoon</div></div>
          <div class="btn-ic glass" id="g-pause" title="Pause (Esc)">${icon('gear')}</div></div>
        <div class="radar glass"><canvas id="g-radar" width="300" height="300"></canvas></div>
        <div class="radar-leg"><span><i style="background:#5dffb0"></i>food</span><span><i style="background:#ff5a4d"></i>danger</span><span><i style="background:#ffc107"></i>hazard</span><span><i style="background:#6fe6ff"></i>heal</span></div>
        <div class="abil" id="g-abil"></div>
        <div class="guide glass" id="g-guide"><div class="arr" id="g-arr">${icon('fish')}</div><div><small>Hunt near</small><span id="g-gt">Reef flat</span></div></div>
        <div class="banner" id="g-banner"></div>
        <div id="g-hint" class="hint glass" style="display:none"></div>
        <div id="g-lockp" class="lockp glass" style="display:none">Click to take control <small>Esc to pause</small></div>
      </div>
      <div class="hudpart marks">
        <div class="cross"></div>
        <div class="lock" id="g-lock"><div class="box">
          <svg viewBox="0 0 100 100"><circle class="glow" cx="50" cy="50" r="40"/><circle class="rim" cx="50" cy="50" r="46"/>
            <g class="arcs"><path class="arc" d="M50 8A42 42 0 0 1 86 29"/><path class="arc" d="M92 50A42 42 0 0 1 71 86"/><path class="arc" d="M50 92A42 42 0 0 1 14 71"/><path class="arc" d="M8 50A42 42 0 0 1 29 14"/></g>
            <path class="tick" d="M50 2v8M98 50h-8M50 98v-8M2 50h8"/><circle class="dot" cx="50" cy="50" r="1.8"/></svg></div>
          <div class="tag" id="g-lockt"><span class="ic-w"></span><span class="nm"></span><span class="xp"></span></div></div>
        <div class="thr" id="g-thr0"><div class="tri"></div><span>!</span></div><div class="thr" id="g-thr1"><div class="tri"></div><span>!</span></div><div class="thr" id="g-thr2"><div class="tri"></div><span>!</span></div><div class="thr" id="g-thr3"><div class="tri"></div><span>!</span></div>
        <div class="gold" id="g-gold"><svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z"/></svg><span id="g-goldt"></span></div>
      </div>
      <div class="vig" id="g-vig"></div>
      <div class="fade" id="g-fade"></div>
      <div class="ov" id="ov-title"></div><div class="ov" id="ov-pause"></div><div class="ov bottom clear" id="ov-evo"></div><div class="ov dead" id="ov-dead"></div><div class="ov" id="ov-win"></div><div class="ov" id="ov-dex"></div><div class="ov" id="ov-help"></div><div class="ov" id="ov-set"></div>`;
    document.body.appendChild(root);
    this.$ = (id) => root.querySelector('#' + id);
    this.radar = this.$('g-radar').getContext('2d');
    this.thr = [0, 1, 2, 3].map((i) => this.$('g-thr' + i));
    this.buildAbil();
    this.$('g-pause').onclick = () => game.pause();
    this.hudHidden = false;
    this.ui = 1; this.updateScale(true);
    window.addEventListener('resize', () => this.updateScale());
  }

  // everything on the screen scales with the window height (reference 900 px) times the player's own choice, so the HUD is not tiny on a big monitor
  updateScale(force) {
    const pref = this.g.settings && this.g.settings.ui ? +this.g.settings.ui : 0;                      // 0 = automatic
    const auto = clamp(Math.min(window.innerHeight / 900, window.innerWidth / 1100), 0.9, 2.2);
    const fit = Math.max(0.6, Math.min(window.innerWidth / 1000, window.innerHeight / 640));         // never so big that a panel does not fit the window
    const s = +Math.min(pref > 0 ? pref : auto, fit).toFixed(3);
    if (!force && s === this.ui) return;
    this.ui = s; this.root.style.setProperty('--ui', String(s));
    this.$('g-abil').style.zoom = this.touch && s < 1 ? (1 / s).toFixed(3) : '';           // finger-sized tiles on a phone, whatever the HUD scale
  }

  setTouch(on) { if (this.touch !== on) { this.touch = on; this.root.classList.toggle('touch', on); this.updateScale(true); } }
  tip(s) { return this.touch ? s.replace('click to bite', 'tap to bite').replace('Shift dashes, but it', 'Dashing').replace('Q sends a sense pulse', 'The Sense tile sends a pulse') : s; }

  buildAbil() {
    const el = this.$('g-abil'); el.innerHTML = '';
    this.slots = [];
    const mk = (key, name, cls = '') => { const d = document.createElement('div'); d.className = 'slot glass ' + cls; d.innerHTML = `<span class="nm">${name}</span><span class="ico"></span><div class="cd"></div><span class="k">${key}</span>`; el.appendChild(d); return d; };
    this.slotBite = mk('F', 'Bite', 'small'); this.slotBite.querySelector('.ico').innerHTML = icon('jaw');
    this.slotPulse = mk('Q', 'Sense', 'small'); this.slotPulse.querySelector('.ico').innerHTML = icon('pulse');
    this.slotA = [mk('E', 'Ability'), mk('R', 'Ability')];
  }

  show(id) { for (const o of this.root.querySelectorAll('.ov')) o.classList.toggle('on', o.id === id); }
  hideOverlays() { for (const o of this.root.querySelectorAll('.ov')) o.classList.remove('on'); }
  setHidden(h) { this.root.classList.toggle('hide', h); }

  // ---- per-frame --------------------------------------------------------------------------------------------------------------
  update(dt, cam) {
    const g = this.g, p = g.player, st = p.stats;
    this.t += dt;
    const set = (id, v) => { const e = this.$(id); if (this.cache[id] !== v) { e.textContent = v; this.cache[id] = v; } };
    const w = (id, f) => { const e = this.$(id); const v = (clamp(f, 0, 1) * 100).toFixed(1) + '%'; if (this.cache['w' + id] !== v) { e.style.width = v; this.cache['w' + id] = v; } };
    w('g-xp', p.progress); w('g-hp', p.hp / st.hpMax); w('g-st', p.stam / st.stam);
    this.$('g-hpb').classList.toggle('low', p.hp / st.hpMax < 0.3);
    this.$('g-vig').classList.toggle('low', p.hp / st.hpMax < 0.3 && !p.dead);
    if (this.hurtV > 0) { this.hurtV = Math.max(0, this.hurtV - dt * 1.8); this.$('g-vig').style.opacity = String(Math.max(this.hurtV, 0)); } else if (this.hurtV === 0) { this.$('g-vig').style.opacity = ''; this.hurtV = -1; }
    if (this.t - (this.slow || 0) < 0.1) return;
    this.slow = this.t;
    set('g-lv', String(p.level)); set('g-form', p.form.name);
    { const ck = JSON.stringify([p.attrs, p.abilities, p.passives]); if (this.cache.chips !== ck) { this.cache.chips = ck; const el = this.$('g-chips'); let h = ''; for (const id in p.attrs) h += `<span class="chip" title="${ATTRS[id].name}: ${ATTRS[id].text}">${icon(ATTRS[id].icon)}${p.attrs[id]}</span>`; for (const id of p.abilities) h += `<span class="chip ab" title="${ABILITIES[id].name}">${icon(ABILITIES[id].icon)}</span>`; for (const id in p.passives) h += `<span class="chip ps" title="${PASSIVES[id].name}">${icon(PASSIVES[id].icon)}</span>`; el.innerHTML = h; el.style.display = h ? 'flex' : 'none'; } }
    set('g-xpt', Math.floor(p.xp) + ' / ' + p.xpNeed); set('g-hpt', String(Math.ceil(p.hp)));
    const d = Math.max(-p.y, 0); set('g-d', d < 100 ? d.toFixed(1) : String(Math.round(d)));
    const zone = zoneAt(p.x, -g.gw.floor(p.x, p.z)); set('g-z', ZONES[zone].name);
    set('g-sub', p.stats.speed ? 'Level ' + p.level + ' of ' + MAX_LEVEL : '');
    // goal
    const gt = LEVEL_GOALS[p.level - 1]; if (this.cache.goal !== gt) { this.$('g-goal').innerHTML = gt; this.cache.goal = gt; }
    // combo
    const cb = this.$('g-combo'); const ct = p.combo > 1 && p.comboT > 0 ? 'x' + p.combo + ' combo' : ''; if (this.cache.combo !== ct) { cb.textContent = ct; cb.classList.toggle('on', !!ct); this.cache.combo = ct; }
    // ability tiles
    const upd = (el, cdLeft, cdMax, ready) => { el.querySelector('.cd').style.height = (cdMax > 0 ? clamp(cdLeft / cdMax, 0, 1) * 100 : 0) + '%'; el.classList.toggle('ready', ready && cdLeft <= 0); };
    upd(this.slotBite, p.biteCd, st.biteCd, true); upd(this.slotPulse, p.pulseCd, 7, true);
    for (let i = 0; i < 2; i++) {
      const id = p.abilities[i], el = this.slotA[i], ico = el.querySelector('.ico'), nm = el.querySelector('.nm');
      const key = id || 'none';
      if (el.dataset.id !== key) { el.dataset.id = key; el.classList.toggle('empty', !id); ico.innerHTML = id ? icon(ABILITIES[id].icon) : icon('lock'); nm.textContent = id ? ABILITIES[id].name : ''; }
      if (id) upd(el, p.cdLeft(id), ABILITIES[id].cd, true);
    }
    // guide arrow toward the recommended zone
    const zt = ZONES[LEVEL_ZONE[p.level - 1]], gx = zt.goal[0] - p.x, gz = zt.goal[1] - p.z, gd = Math.hypot(gx, gz);
    const inZone = zone === LEVEL_ZONE[p.level - 1];
    this.$('g-guide').style.display = (inZone && gd < 60) || !g.settings.guide ? 'none' : 'flex';
    set('g-gt', zt.short + ' · ' + Math.round(gd) + ' m');
    this.$('g-arr').firstChild.style.transform = `rotate(${(Math.atan2(gx, -gz) + g.rig.yaw) * 180 / Math.PI + 90}deg)`;
  }

  // lock-on ring + danger arrows + radar, after the camera matrices are final
  overlay(cam, w, h) {
    const g = this.g, p = g.player, eco = g.eco;
    const proj = (x, y, z, out) => { out.set(x, y, z).project(cam); return out; };
    const v = this._v || (this._v = new g.api.THREE.Vector3());
    // lock
    const lock = this.$('g-lock'), t = g.lockTarget;
    if (t && !t.dead) {
      proj(t.x, t.y, t.z, v);
      if (v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1) {
        const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h, hz = t.role === 'hazard', gd = !!t.golden && !hz;
        const dist = Math.hypot(t.x - cam.position.x, t.y - cam.position.y, t.z - cam.position.z);
        const inR = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) - t.len * 0.4 <= p.biteReach();
        if (this.cache.lockId !== t) { this.cache.lockId = t; lock.classList.remove('acq'); void lock.offsetWidth; lock.classList.add('acq'); }
        lock.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`; lock.classList.add('on');
        lock.classList.toggle('haz', hz); lock.classList.toggle('gold', gd); lock.classList.toggle('in', inR);
        const gain = this.g.xpFor(t), xp = hz ? 'hazard' : '+' + gain.toFixed(gain < 10 ? 1 : 0) + ' xp', key = t.sp.name + '|' + xp + '|' + hz;
        if (this.cache.lockt !== key) { this.cache.lockt = key; const tg = this.$('g-lockt'); tg.children[0].innerHTML = icon(hz ? 'bolt' : 'fish'); tg.children[1].textContent = t.sp.name; tg.children[2].textContent = xp; }
        const sz = clamp((t.len * 1.4 / Math.max(dist, 0.2)) * h * 0.9 / (2 * Math.tan(cam.fov * Math.PI / 360)), 46 * this.ui, 170 * this.ui);
        if (this.cache.lockz !== (sz | 0)) { this.cache.lockz = sz | 0; lock.style.setProperty('--sz', sz.toFixed(0) + 'px'); }
      } else { lock.classList.remove('on'); this.cache.lockId = null; }
    } else { lock.classList.remove('on'); this.cache.lockId = null; }
    // danger markers for hunters that are after you
    const list = eco.threats.filter((c) => !c.dead).slice(0, 4);
    for (let i = 0; i < 4; i++) {
      const el = this.thr[i], c = list[i];
      if (!c) { el.classList.remove('on'); continue; }
      proj(c.x, c.y, c.z, v);
      let sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const behind = v.z > 1; if (behind) { sx = w - sx; sy = h - sy; }
      const m = 46; const off = behind || sx < m || sx > w - m || sy < m || sy > h - m;
      if (off) { const cx = w / 2, cy = h / 2; let dx = sx - cx, dy = sy - cy; if (behind) { dx = -dx; dy = -dy; } const k = Math.min((w / 2 - m) / Math.max(Math.abs(dx), 1e-3), (h / 2 - m) / Math.max(Math.abs(dy), 1e-3)); sx = cx + dx * k; sy = cy + dy * k; }
      else sy -= 40;
      el.style.transform = `translate(${sx}px,${sy}px)`; el.classList.add('on');
    }
    // golden fish marker
    { const gf = eco.golden;
      if (gf && !gf.dead && gf.eatenT < 0) {
        proj(gf.x, gf.y, gf.z, v); let sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h; const behind = v.z > 1; if (behind) { sx = w - sx; sy = h - sy; }
        const m = 60, off = behind || sx < m || sx > w - m || sy < m || sy > h - m;
        if (off) { const cx = w / 2, cy = h / 2; let dx = sx - cx, dy = sy - cy; if (behind) { dx = -dx; dy = -dy; } const k = Math.min((w / 2 - m) / Math.max(Math.abs(dx), 1e-3), (h / 2 - m) / Math.max(Math.abs(dy), 1e-3)); sx = cx + dx * k; sy = cy + dy * k; } else sy -= 30;
        const dist = Math.hypot(gf.x - p.x, gf.y - p.y, gf.z - p.z); this.goldMarker(sx, sy, 'Golden ' + gf.sp.name + ' \u00b7 ' + Math.round(dist) + ' m');
      } else this.goldMarker(null);
    }
    // radar
    this.drawRadar(cam);
  }

  drawRadar(cam) {
    const g = this.g, p = g.player, eco = g.eco, c = this.radar, S = 300, R = S / 2;
    c.clearRect(0, 0, S, S);
    const range = Math.max(14, p.stats.sense * 2.4);
    const yaw = g.rig.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw);
    c.save(); c.translate(R, R);
    c.strokeStyle = 'rgba(140,220,255,.22)'; c.lineWidth = 1.5;
    for (const f of [0.33, 0.66, 1]) { c.beginPath(); c.arc(0, 0, (R - 6) * f, 0, 6.283); c.stroke(); }
    c.beginPath(); c.moveTo(0, -(R - 6)); c.lineTo(0, R - 6); c.moveTo(-(R - 6), 0); c.lineTo(R - 6, 0); c.stroke();
    // view cone
    c.fillStyle = 'rgba(120,210,255,.08)'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R - 6, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.closePath(); c.fill();
    const toR = (x, z) => { const dx = x - p.x, dz = z - p.z; const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs; return [rx / range * (R - 6), rz / range * (R - 6), Math.hypot(dx, dz)]; };
    // specks (food clouds): faint cyan dots
    const sp = g.specks; c.fillStyle = 'rgba(110,255,220,.55)';
    for (const cl of sp.clouds.values()) { const [x, y, d] = toR(cl.cx, cl.cz); if (d < range && cl.alive > 0) { c.beginPath(); c.arc(x, y, 3 + Math.min(cl.alive, 40) * 0.06, 0, 6.283); c.fill(); } }
    for (const cr of eco.list) {
      if (cr.dead || !cr.cls) continue;
      const [x, y, d] = toR(cr.x, cr.z); if (d > range) continue;
      const k = cr.cls;
      if (k === 1) { c.fillStyle = '#5dffb0'; c.beginPath(); c.arc(x, y, 3.2, 0, 6.283); c.fill(); }
      else if (k === 2) { c.fillStyle = cr.alert > 0.5 ? '#ff2a1a' : '#ff6a5d'; c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 6, y + 5); c.lineTo(x - 6, y + 5); c.closePath(); c.fill(); }
      else if (k === 3) { c.fillStyle = '#ffc107'; c.fillRect(x - 3, y - 3, 6, 6); }
      else if (k === 4) { c.strokeStyle = '#6fe6ff'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.moveTo(x, y - 5); c.lineTo(x, y + 5); c.stroke(); }
    }
    // player
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.fill();
    c.restore();
  }

  // ---- feedback ---------------------------------------------------------------------------------------------------------------
  toast(text, kind = '', ms = 2600) {
    const box = this.$('g-toasts'), el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = text; box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, ms);
  }
  banner(title, sub = '') { const el = this.$('g-banner'); el.classList.remove('on'); void el.offsetWidth; el.innerHTML = `<b>${title}</b><span>${sub}</span>`; el.classList.add('on'); }
  goldMarker(x, y, text) { const el = this.$('g-gold'); if (x === null) { el.classList.remove('on'); return; } el.classList.add('on'); el.style.transform = `translate(${x}px,${y}px)`; if (this.cache.goldt !== text) { this.cache.goldt = text; this.$('g-goldt').textContent = text; } }
  lockPrompt(on) { if (this.cache.lockp !== on) { this.cache.lockp = on; this.$('g-lockp').style.display = on ? 'block' : 'none'; } }
  hint(html, ms = 6000) { const el = this.$('g-hint'); el.innerHTML = html; el.style.display = 'block'; clearTimeout(this._ht); this._ht = setTimeout(() => { el.style.display = 'none'; }, ms); }
  clearHint() { this.$('g-hint').style.display = 'none'; clearTimeout(this._ht); }
  float(sx, sy, text, color = '#fff') {
    const el = document.createElement('div'); el.className = 'ftxt'; el.textContent = text; el.style.left = sx + 'px'; el.style.top = sy + 'px'; el.style.color = color; this.root.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }
  hurtFlash(a = 0.8) { this.hurtV = a; this.$('g-vig').style.opacity = String(a); }
  flashWhite(a = 0.7, ms = 500) { const f = this.$('g-fade'); f.style.transition = 'none'; f.style.opacity = String(a); requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = '0'; }); }

  // ---- overlays --------------------------------------------------------------------------------------------------------------
  title(hasSave) {
    const el = this.$('ov-title');
    el.innerHTML = `<h1>DESCENT</h1><div class="tag">Eat. Grow. Evolve.</div>
      <div class="menu">
        <div class="mbtn main" data-a="new">New game</div>
        <div class="mbtn ${hasSave ? '' : 'dim'}" data-a="continue">Continue<small>${hasSave ? this.saveInfo() : 'no saved game'}</small></div>
        <div class="mbtn" data-a="help">How to play</div>
        <div class="mbtn" data-a="ach">Achievements</div>
        <div class="mbtn" data-a="settings">Settings</div>
        <div class="mbtn" data-a="explore">Explore the ocean<small>free camera, no fish to eat</small></div>
      </div><div class="tipline">From a see-through fry in the seagrass to the apex of the sea. 10 forms, one reef.</div>`;
    this.bind(el); this.show('ov-title');
  }
  saveInfo() { const s = this.g.saveInfo; return s ? `${FORMS[s.level - 1].name} · level ${s.level}` : ''; }
  bind(el) { el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => this.g.menuAction(b.dataset.a, b); }); }

  pauseMenu() {
    const el = this.$('ov-pause');
    el.innerHTML = `<h2>Paused</h2><div class="tag" style="margin:6px 0 20px">${this.g.player.form.name} · level ${this.g.player.level}</div>
      <div class="menu"><div class="mbtn main" data-a="resume">Resume</div><div class="mbtn" data-a="dex">Bestiary</div><div class="mbtn" data-a="stats">Your fish</div><div class="mbtn" data-a="ach">Achievements</div><div class="mbtn" data-a="help">Controls</div><div class="mbtn" data-a="settings">Settings</div><div class="mbtn" data-a="quit">Save &amp; quit to title</div></div>`;
    this.bind(el); this.show('ov-pause');
  }

  helpPanel(back = 'resume') {
    const el = this.$('ov-help');
    el.innerHTML = `<div class="panel glass"><h3>How to play</h3>
      <p>You are a tiny fish. <b>Eat</b> things smaller than you to grow, and keep away from anything bigger. Fill the growth bar to <b>evolve</b> into a bigger fish and pick an upgrade. Ten forms, ten upgrades. Reach the top.</p>
      <div class="keys">${this.touch ? `
        <span><span class="kbd">Left thumb</span></span><span>Drag on the left of the screen to swim toward where the camera looks</span>
        <span><span class="kbd">Right thumb</span></span><span>Drag anywhere else to look around. Pinch to zoom.</span>
        <span><span class="kbd">Tap</span></span><span>Bite. Aim at the green-ringed fish. The Bite tile works too.</span>
        <span><span class="kbd">Rise</span> <span class="kbd">Sink</span></span><span>Swim up / down (hold)</span>
        <span><span class="kbd">Dash</span></span><span>Dash (hold; uses stamina)</span>
        <span><span class="kbd">Sense</span></span><span>Sense pulse: food glows green, danger red</span>
        <span><span class="kbd">Tiles</span></span><span>Abilities you unlock appear at the bottom; tap to use</span>
        <span><span class="kbd">Gear</span></span><span>Pause, bestiary and settings</span>` : `
        <span><span class="kbd">Drag</span></span><span>Look around (hold either mouse button and move; the right button never bites)</span>
        <span><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span></span><span>Swim toward where the camera looks</span>
        <span><span class="kbd">Space</span> <span class="kbd">C</span></span><span>Swim up / down</span>
        <span><span class="kbd">Shift</span></span><span>Dash (uses stamina)</span>
        <span><span class="kbd">Click</span> <span class="kbd">F</span></span><span>Bite. Aim at the green-ringed fish.</span>
        <span><span class="kbd">Right-click</span> <span class="kbd">E</span> <span class="kbd">R</span></span><span>Abilities you unlock</span>
        <span><span class="kbd">Q</span></span><span>Sense pulse: food glows green, danger red</span>
        <span><span class="kbd">Tab</span></span><span>Bestiary</span>
        <span><span class="kbd">Esc</span></span><span>Pause</span>`}
      </div>
      <p style="margin-top:12px"><b>Tips.</b> ${TIPS.slice(0, 5).map((t) => this.tip(t)).join(' ')}</p>
      <div class="menu" style="margin-top:16px"><div class="mbtn main" data-a="${back}">Back</div></div></div>`;
    this.bind(el); this.show('ov-help');
  }

  settingsPanel(back = 'resume') {
    const s = this.g.settings, el = this.$('ov-set');
    const row = (id, label, min, max, step, val, fmt) => `<label>${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><span id="${id}-v">${fmt(val)}</span>`;
    el.innerHTML = `<div class="panel glass"><h3>Settings</h3><div class="set">
      <label>Difficulty</label><select id="s-diff">${Object.entries(DIFFICULTY).map(([k, d]) => `<option value="${k}" ${s.difficulty === k ? 'selected' : ''}>${d.name}</option>`).join('')}</select>
      ${row('s-sens', 'Mouse speed', 0.3, 2.5, 0.05, s.sens, (v) => (+v).toFixed(2) + 'x')}
      <label>Invert look</label><select id="s-inv"><option value="0" ${!s.invert ? 'selected' : ''}>Off</option><option value="1" ${s.invert ? 'selected' : ''}>On</option></select>
      ${row('s-zoom', 'Camera distance', 0.6, 2.0, 0.05, s.zoom, (v) => (+v).toFixed(2) + 'x')}
      <label>Colour hints</label><select id="s-hints"><option value="0" ${s.hints === 0 ? 'selected' : ''}>Off</option><option value="0.6" ${s.hints === 0.6 ? 'selected' : ''}>Subtle</option><option value="1" ${s.hints === 1 ? 'selected' : ''}>Strong</option></select>
      <label>Interface size</label><select id="s-ui"><option value="0" ${!s.ui ? 'selected' : ''}>Automatic</option><option value="0.85" ${s.ui === 0.85 ? 'selected' : ''}>Small</option><option value="1" ${s.ui === 1 ? 'selected' : ''}>Medium</option><option value="1.3" ${s.ui === 1.3 ? 'selected' : ''}>Large</option><option value="1.7" ${s.ui === 1.7 ? 'selected' : ''}>Extra large</option></select>
      <label>Direction guide</label><select id="s-guide"><option value="1" ${s.guide ? 'selected' : ''}>On</option><option value="0" ${!s.guide ? 'selected' : ''}>Off</option></select>
      ${row('s-vol', 'Sound volume', 0, 1, 0.05, s.volume, (v) => Math.round(v * 100) + '%')}
      ${row('s-mus', 'Music volume', 0, 1, 0.05, s.music, (v) => Math.round(v * 100) + '%')}
      <label>Quality</label><select id="s-q"><option value="0">Low</option><option value="1">Medium</option><option value="2" ${s.quality === 2 ? 'selected' : ''}>High</option><option value="3" ${s.quality === 3 ? 'selected' : ''}>Ultra</option></select>
    </div><div class="menu" style="margin-top:18px"><div class="mbtn main" data-a="${back}">Back</div></div></div>`;
    const g = this.g, $ = (id) => el.querySelector('#' + id);
    $('s-diff').onchange = (e) => g.setSetting('difficulty', e.target.value);
    $('s-inv').onchange = (e) => g.setSetting('invert', e.target.value === '1');
    $('s-hints').onchange = (e) => g.setSetting('hints', +e.target.value);
    $('s-guide').onchange = (e) => g.setSetting('guide', e.target.value === '1');
    $('s-ui').onchange = (e) => g.setSetting('ui', +e.target.value);
    $('s-q').onchange = (e) => g.setSetting('quality', +e.target.value);
    for (const [id, key, fmt] of [['s-sens', 'sens', (v) => (+v).toFixed(2) + 'x'], ['s-zoom', 'zoom', (v) => (+v).toFixed(2) + 'x'], ['s-vol', 'volume', (v) => Math.round(v * 100) + '%'], ['s-mus', 'music', (v) => Math.round(v * 100) + '%']]) {
      $(id).oninput = (e) => { $(id + '-v').textContent = fmt(e.target.value); g.setSetting(key, +e.target.value); };
    }
    this.bind(el); this.show('ov-set');
  }

  statsPanel() {
    const p = this.g.player, el = this.$('ov-help');
    const ab = p.abilities.map((id) => `<div><b>${ABILITIES[id].name}</b> <span style="opacity:.7">${ABILITIES[id].text}</span></div>`).join('') || '<div style="opacity:.6">None yet</div>';
    const at = Object.keys(p.attrs).map((id) => `<div><b>${ATTRS[id].name}</b> rank ${p.attrs[id]} <span style="opacity:.7">${ATTRS[id].text}</span></div>`).join('') || '<div style="opacity:.6">No upgrades yet</div>';
    const ps = Object.keys(p.passives).map((id) => `<div><b>${PASSIVES[id].name}</b> <span style="opacity:.7">${PASSIVES[id].text}</span></div>`).join('');
    const st = p.stats;
    const line = FORMS.map((f, i) => `<span class="fchip ${i + 1 < p.level ? 'done' : i + 1 === p.level ? 'now' : ''}">${i + 1 <= p.level ? f.name : '???'} · ${f.len < 1 ? Math.round(f.len * 100) + ' cm' : f.len.toFixed(1) + ' m'}</span>`).join('');
    el.innerHTML = `<div class="panel glass"><h3>${p.form.name} · level ${p.level}</h3><div class="forms">${line}</div><p>${p.form.blurb}</p><p><b>${p.form.perk.name}.</b> ${p.form.perk.text}</p>
      <div class="stats"><span>Length</span><b>${p.len.toFixed(2)} m</b><span>Swim speed</span><b>${st.speed.toFixed(1)} m/s</b><span>Health</span><b>${st.hpMax}</b><span>Dash time</span><b>${st.stam.toFixed(1)} s</b><span>Eats up to</span><b>${Math.round(st.eat * 100)}% of your size</b><span>Sense range</span><b>${st.sense.toFixed(0)} m</b></div>
      <h3>Upgrades</h3>${at}<h3 style="margin-top:12px">Abilities</h3>${ab}${ps ? '<h3 style="margin-top:12px">Passive</h3>' + ps : ''}
      <div class="menu" style="margin-top:16px"><div class="mbtn main" data-a="resume">Back</div></div></div>`;
    this.bind(el); this.show('ov-help');
  }

  dex(back = 'resume') {
    const g = this.g, el = this.$('ov-dex'), disc = g.player.discovered;
    const keys = Object.keys(SPECIES).sort((a, b) => SPECIES[a].len - SPECIES[b].len);
    const known = keys.filter((k) => disc[k]).length;
    const cards = keys.map((k) => {
      const s = SPECIES[k], d = disc[k];
      if (!d) return `<div class="dcard unk"><div class="t"><span>? ? ?</span><span class="r">${LABELS[s.role]}</span></div><p>Not found yet.</p></div>`;
      return `<div class="dcard"><div class="t"><span>${s.name}</span><span class="r ${s.role}">${LABELS[s.role]}</span></div><div style="opacity:.65;font-size:11px">${s.len < 0.1 ? Math.round(s.len * 100) + ' cm' : s.len < 1 ? Math.round(s.len * 100) + ' cm' : s.len.toFixed(1) + ' m'}${d.ate ? ' · eaten ' + d.ate : ''}</div><p>${s.hint}</p></div>`;
    }).join('');
    el.innerHTML = `<div class="panel glass" style="width:min(92vw,900px)"><h3>Bestiary · ${known} of ${keys.length} found</h3><div class="dex">${cards}</div><div class="menu" style="margin-top:16px"><div class="mbtn main" data-a="${back}">Back</div></div></div>`;
    this.bind(el); this.show('ov-dex');
  }

  achPanel(back = 'resume') {
    const g = this.g, el = this.$('ov-help'), done = g.ach.done;
    const rows = ACHIEVEMENTS.map((a) => `<div class="dcard ${done[a.id] ? '' : 'unk'}"><div class="t"><span>${done[a.id] ? icon('trophy') + ' ' : ''}${a.name}</span><span class="r ${done[a.id] ? 'prey' : 'neutral'}">${done[a.id] ? 'Done' : 'Locked'}</span></div><p>${a.text}</p></div>`).join('');
    el.innerHTML = `<div class="panel glass" style="width:min(92vw,820px)"><h3>Achievements · ${g.ach.count()} of ${ACHIEVEMENTS.length}</h3><div class="dex">${rows}</div><div class="menu" style="margin-top:16px"><div class="mbtn main" data-a="${back}">Back</div></div></div>`;
    this.bind(el); this.show('ov-help');
  }

  evolveIntro(form, perk) {
    const el = this.$('ov-evo');
    el.innerHTML = `<div class="evo"><div class="lv">You evolved · level ${this.g.player.level}</div><div class="nm">${form.name}</div><div class="bl">${form.blurb}</div><div class="pk"><b>${perk.name}</b> · ${perk.text}</div></div>`;
    this.show('ov-evo');
  }
  cards(cards, onPick) {
    const el = this.$('ov-evo'), p = this.g.player, f = p.form;
    const html = cards.map((c, i) => {
      let nm, tx, rk, big, cls = '';
      if (c.kind === 'attr') { const A = ATTRS[c.id]; nm = A.name; tx = A.text; rk = `Rank ${c.rank} of ${A.max}`; big = icon(A.icon); }
      else if (c.kind === 'ability') { const A = ABILITIES[c.id]; nm = A.name; tx = A.text; rk = `Ability · ${A.cd}s cooldown`; big = icon(A.icon); cls = 'ability'; }
      else { const A = PASSIVES[c.id]; nm = A.name; tx = A.text; rk = 'Passive'; big = icon(A.icon); cls = 'passive'; }
      return `<div class="ucard ${cls}" data-i="${i}"><span class="num">${i + 1}</span><div class="big">${big}</div><div class="nm">${nm}</div><div class="rk">${rk}</div><div class="tx">${tx}</div></div>`;
    }).join('');
    el.innerHTML = `<div class="evo" style="margin-bottom:22px"><div class="lv">Level ${p.level} · ${f.name}</div><div class="nm" style="font-size:clamp(22px,3vw,36px)">Choose an upgrade</div></div><div class="cards">${html}</div>`;
    el.querySelectorAll('.ucard').forEach((c) => { c.onclick = () => onPick(+c.dataset.i); });
    this.show('ov-evo');
  }

  death(killer, lost) {
    const el = this.$('ov-dead'), p = this.g.player;
    const by = killer ? (killer.sp ? killer.sp.name : 'something big') : 'the sea';
    el.innerHTML = `<h2>Eaten</h2><div class="tag" style="margin:6px 0 10px">by a ${by}</div>
      <div class="stats"><span>Growth lost</span><b>${Math.round(lost)} xp</b><span>Meals so far</span><b>${p.meals}</b></div>
      <div class="menu"><div class="mbtn main" data-a="respawn">Swim again</div><div class="mbtn" data-a="quit">Quit to title</div></div><div class="tipline">${this.tip(TIPS[(Math.random() * TIPS.length) | 0])}</div>`;
    this.bind(el); this.show('ov-dead');
  }

  victory(info) {
    const el = this.$('ov-win');
    const mm = Math.floor(info.time / 60), ss = Math.floor(info.time % 60).toString().padStart(2, '0');
    el.innerHTML = `<h1 style="font-size:clamp(28px,4.5vw,54px)">APEX</h1><div class="tag" style="margin:10px 0 6px">You rule the reef</div>
      <div class="stats"><span>Time</span><b>${mm}:${ss}</b><span>Meals</span><b>${info.meals}</b><span>Times eaten</span><b>${info.deaths}</b><span>Species found</span><b>${info.found} of ${info.total}</b><span>Best combo</span><b>x${info.combo}</b><span>Difficulty</span><b>${info.difficulty}</b></div>
      <div class="menu"><div class="mbtn main" data-a="keep">Keep swimming</div><div class="mbtn" data-a="dex">Bestiary</div><div class="mbtn" data-a="new">Play again</div><div class="mbtn" data-a="quit">Title</div></div>`;
    this.bind(el); this.show('ov-win');
  }
}
