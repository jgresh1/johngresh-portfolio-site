// HUD extras: dive-site bar, settings panel, photo mode, scripted auto-dive.
import * as THREE from 'three';

export function initUI(api) {
  const { state, camera, post, particles, scatter, renderer, sites, goto, setSun, setWater, shot, lamp, ctl, applyLook, world, U, sizeToWindow } = api;
  const $ = (id) => document.getElementById(id);
  const root = document.createElement('div');
  root.id = 'ui-extra';
  root.innerHTML = `
    <div id="sites"></div>
    <div id="tr"><button id="b-menu" title="Game menu (Esc)">Game menu</button><button id="gear" title="Settings">⚙</button></div>
    <div id="panel" class="hidden">
      <h3>Settings</h3>
      <label>Quality
        <select id="q-level"><option value="0">Low</option><option value="1">Medium</option><option value="2" selected>High</option><option value="3">Ultra</option></select>
      </label>
      <label>Sun height <span id="v-sun">62°</span><input id="s-sun" type="range" min="12" max="88" value="62"></label>
      <label>Water
        <select id="q-water"><option value="tropical">Tropical clear</option><option value="lagoon">Green lagoon</option><option value="oceanic">Deep oceanic</option></select>
      </label>
      <label>Shafts <span id="v-shaft">0.22</span><input id="s-shaft" type="range" min="0" max="100" value="22"></label>
      <label>Particles <span id="v-part">100%</span><input id="s-part" type="range" min="0" max="100" value="100"></label>
      <label>Strobe <span id="v-strobe">0</span><input id="s-strobe" type="range" min="0" max="60" value="0"></label>
      <label>Frame cap
        <select id="q-fps"><option value="30">30 fps</option><option value="60" selected>60 fps</option><option value="0">Uncapped</option></select>
      </label>
      <label class="row"><input id="c-taa" type="checkbox" checked> Temporal anti-aliasing</label>
      <label class="row"><input id="c-ares" type="checkbox" checked> Auto resolution (keeps 60 fps)</label>
      <label class="row"><input id="c-lamp" type="checkbox"> Lamp (L)</label>
      <label class="row"><input id="c-auto" type="checkbox" checked> Auto exposure</label>
      <label>Exposure <span id="v-exp">1.0</span><input id="s-exp" type="range" min="-30" max="30" value="0"></label>
      <div class="btns"><button id="b-dive">Auto dive (G)</button><button id="b-photo">Photo mode (P)</button><button id="b-save">Save PNG</button></div>
    </div>`;
  document.body.appendChild(root);
  const css = document.createElement('style');
  css.textContent = `
    #ui-extra { position: fixed; inset: 0; pointer-events: none; font-family: "Segoe UI", system-ui, sans-serif; color: #d8f3ff; }
    #ui-extra button, #ui-extra select, #ui-extra input { pointer-events: auto; }
    #sites { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; max-width: 92vw; }
    #sites button { background: rgba(6,30,44,.55); border: 1px solid rgba(160,220,255,.28); color: #cfeefe; padding: 6px 12px; border-radius: 16px; font-size: 12px; cursor: pointer; backdrop-filter: blur(6px); }
    #sites button:hover { background: rgba(20,70,100,.7); }
    #sites button small { opacity: .6; margin-left: 4px; }
    #tr { position: absolute; right: 18px; top: 14px; display: flex; gap: 8px; }
    #b-menu { height: 38px; padding: 0 14px; border-radius: 19px; background: rgba(6,30,44,.55); border: 1px solid rgba(160,220,255,.28); color: #d8f3ff; font: 600 11px "Segoe UI", system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; backdrop-filter: blur(6px); }
    #b-menu:hover, #gear:hover { background: rgba(20,70,100,.7); }
    #gear { width: 38px; height: 38px; border-radius: 19px; background: rgba(6,30,44,.55); border: 1px solid rgba(160,220,255,.28); color: #d8f3ff; font-size: 18px; cursor: pointer; backdrop-filter: blur(6px); }
    #panel { position: absolute; right: 18px; top: 60px; width: 250px; padding: 14px 16px; background: rgba(4,22,34,.78); border: 1px solid rgba(160,220,255,.22); border-radius: 12px; backdrop-filter: blur(10px); pointer-events: auto; font-size: 12px; }
    #panel.hidden { display: none; }
    #panel h3 { margin: 0 0 10px; font-weight: 400; letter-spacing: .14em; text-transform: uppercase; font-size: 11px; opacity: .8; }
    #panel label { display: block; margin: 9px 0; opacity: .92; }
    #panel label span { float: right; opacity: .65; }
    #panel input[type=range] { width: 100%; margin-top: 4px; }
    #panel select { width: 100%; margin-top: 4px; background: #0a2a3e; color: #d8f3ff; border: 1px solid rgba(160,220,255,.3); border-radius: 6px; padding: 4px; }
    #panel .row { display: flex; align-items: center; gap: 8px; }
    #panel .btns { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    #panel .btns button { background: rgba(30,90,125,.6); border: 1px solid rgba(160,220,255,.3); color: #e6f7ff; padding: 7px; border-radius: 8px; cursor: pointer; }
    body.photo #ui-extra { display: none; }
    body.touch #sites { left: max(14px, env(safe-area-inset-left, 0px)); right: calc(84px + env(safe-area-inset-right, 0px)); bottom: calc(14px + env(safe-area-inset-bottom, 0px)); transform: none; max-width: none; flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; scrollbar-width: none; }
    body.touch #sites::-webkit-scrollbar { display: none; }
    body.touch #sites button { flex: none; padding: 9px 14px; font-size: 13px; }
    body.touch #panel { max-height: calc(100vh - 80px); overflow-y: auto; }
  `;
  document.head.appendChild(css);

  // ---- dive sites ----
  const bar = $('sites');
  sites.forEach((s, i) => {
    const b = document.createElement('button');
    b.innerHTML = `${i + 1} · ${s.name}`;
    b.onclick = () => { stopDive(); goto(s); };
    bar.appendChild(b);
  });

  // ---- panel wiring ----
  const P = (id) => $(id);
  P('gear').onclick = () => P('panel').classList.toggle('hidden');
  P('s-sun').oninput = (e) => { const v = +e.target.value; P('v-sun').textContent = v + '°'; setSun(v, 40); };
  P('q-water').onchange = (e) => setWater(e.target.value);
  P('s-shaft').oninput = (e) => { const v = +e.target.value / 100; P('v-shaft').textContent = v.toFixed(2); post.params.shaft = v; };
  P('s-part').oninput = (e) => { const v = +e.target.value / 100; P('v-part').textContent = Math.round(v * 100) + '%'; particles.uniforms.uDensity.value = v; };
  P('s-strobe').oninput = (e) => { state.strobe = +e.target.value; P('v-strobe').textContent = e.target.value; };
  P('q-fps').onchange = (e) => { state.fpsCap = +e.target.value; };
  P('c-lamp').onchange = (e) => { state.lamp = e.target.checked; };
  P('c-taa').onchange = (e) => { post.taa = e.target.checked; post.resetHistory(); };
  P('c-ares').onchange = (e) => { state.autoScale = e.target.checked; if (!state.autoScale && state.renderScale !== 1) { state.renderScale = 1; sizeToWindow(); } };
  P('c-auto').onchange = (e) => { state.exposureAuto = e.target.checked; };
  P('s-exp').oninput = (e) => { const v = Math.pow(2, +e.target.value / 6); state.exposure = v; P('v-exp').textContent = v.toFixed(2); if (state.exposureAuto) { state.exposureAuto = false; P('c-auto').checked = false; } };
  P('b-photo').onclick = () => togglePhoto();
  P('b-save').onclick = async () => { const r = await shot({ name: 'descent_' + Date.now(), w: 2560, h: 1440, samples: 12, png: true, download: true }); flash('Saved ' + r.name); };
  P('b-dive').onclick = () => (state.diving ? stopDive() : startDive());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyG' && !e.repeat) (state.diving ? stopDive() : startDive());
    if (e.code === 'KeyP') { /* body class toggled in main */ }
    if (e.code === 'KeyH') $('panel').classList.toggle('hidden');
  });
  function togglePhoto() { state.photo = !state.photo; document.body.classList.toggle('photo', state.photo); }

  // ---- quality presets ----
  const QUALITY = [
    { dpr: 0.75, msaa: 0, shaftSteps: 20, part: 0.4, scatterK: 0.55 },
    { dpr: 1.0, msaa: 0, shaftSteps: 28, part: 0.7, scatterK: 0.8 },
    { dpr: 1.25, msaa: 0, shaftSteps: 40, part: 1.0, scatterK: 1.0 },
    { dpr: 1.75, msaa: 0, shaftSteps: 56, part: 1.0, scatterK: 1.15 },       // temporal AA does the anti-aliasing; hardware MSAA costs ~6 ms for little gain on top
  ];
  const applyQuality = (lv) => {
    const q = QUALITY[lv];
    state.dprScale = q.dpr; post.msaa = q.msaa; post.params.shaftSteps = q.shaftSteps;
    particles.uniforms.uDensity.value = q.part; P('s-part').value = q.part * 100; P('v-part').textContent = Math.round(q.part * 100) + '%';
    for (const sp of scatter.species) sp.radiusScale = q.scatterK;
    scatter.dirty = true;
    sizeToWindow();
  };
  P('q-level').onchange = (e) => applyQuality(+e.target.value);
  applyQuality(2);

  // ---- auto dive ----
  const path = [
    [-60, 2.2, 14, 1.35, -0.05], [30, 2.6, 6, 1.4, -0.08], [125, 2.4, -20, 1.2, -0.10], [205, 7, -8, 1.45, -0.14],
    [285, 14, 0, 1.57, -0.16], [345, 24, 4, 1.57, -0.10], [372, 58, 0, 2.3, -0.10], [430, 140, 6, 1.9, -0.25], [560, 260, 0, 1.6, -0.3],
    [900, 520, 0, 1.6, -0.35], [1800, 900, 0, 1.6, -0.3], [3200, 1500, 0, 1.6, -0.25], [4800, 2200, 60, 1.6, -0.2], [6000, 2780, 200, 1.62, -0.18], [6150, 2864, 236, 1.57, -0.1],
  ];
  let dive = null;
  function startDive() {
    state.diving = true; $('b-dive').textContent = 'Stop dive';
    dive = { t: 0, total: 190 };
    api.setLampAuto?.(true);
  }
  function stopDive() { state.diving = false; dive = null; $('b-dive').textContent = 'Auto dive (G)'; }
  const catmull = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  function updateDive(dt) {
    if (!dive) return;
    // any keyboard movement or drag cancels the dive
    if (ctl.keys.size > 0 || ctl.drag) { stopDive(); return; }
    dive.t += dt;
    // ease the parameter so shallow zones linger and the dark deep flies past
    const u = Math.min(dive.t / dive.total, 0.9999) * (path.length - 1);
    const i = Math.floor(u), f = u - i, n = path.length - 1;
    const P0 = path[Math.max(i - 1, 0)], P1 = path[i], P2 = path[Math.min(i + 1, n)], P3 = path[Math.min(i + 2, n)];
    const x = catmull(P0[0], P1[0], P2[0], P3[0], f), d = catmull(P0[1], P1[1], P2[1], P3[1], f), z = catmull(P0[2], P1[2], P2[2], P3[2], f);
    camera.position.x = x; camera.position.z = z;
    const fl = world.height(x, z);
    camera.position.y = Math.max(-d, fl + 1.2);
    ctl.yaw = catmull(P0[3], P1[3], P2[3], P3[3], f) + 0.08 * Math.sin(dive.t * 0.23);
    ctl.pitch = catmull(P0[4], P1[4], P2[4], P3[4], f) + 0.03 * Math.sin(dive.t * 0.31);
    applyLook();
    if (dive.t >= dive.total) stopDive();
  }

  let msgT = 0;
  function flash(msg) { const el = document.createElement('div'); el.textContent = msg; el.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);background:rgba(6,30,44,.85);color:#e6f7ff;padding:8px 16px;border-radius:14px;font:12px system-ui;z-index:9'; document.body.appendChild(el); setTimeout(() => el.remove(), 2500); }

  return { updateDive, stopDive, startDive, applyQuality, flash };
}
