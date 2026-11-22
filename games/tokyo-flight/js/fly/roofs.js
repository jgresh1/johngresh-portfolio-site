// roofs.js — how high the highest thing is at any spot near the aircraft, so it can hit buildings.
// Asking the survey meshes directly costs milliseconds a query (no search tree), so the graphics card does it:
// every second or so the buildings and ground around the aircraft are drawn straight down into a small picture
// whose colour is the height, and that picture is read back without stalling the frame.
// Bridges are left out, so flying under them works; their decks and towers are not solid (known gap).
import * as THREE from 'three';

const SIZE = 512, SPAN = 900, LO = -60, RANGE = 1200;      // pixels, metres across, lowest height, height range

export class Roofs {
  constructor(renderer, scene, city, terrain) {
    this.renderer = renderer; this.scene = scene; this.city = city; this.terrain = terrain;
    this.rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true, type: THREE.UnsignedByteType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    this.cam = new THREE.OrthographicCamera(-SPAN / 2, SPAN / 2, SPAN / 2, -SPAN / 2, 10, 9000);
    this.cam.up.set(0, 0, -1);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: 'varying float vY; void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying float vY; void main() { float h = clamp( ( vY - ( ${LO.toFixed(1)} ) ) / ${RANGE.toFixed(1)}, 0.0, 1.0 ) * 65535.0; float hi = floor( h / 256.0 ); gl_FragColor = vec4( hi / 255.0, ( h - hi * 256.0 ) / 255.0, 1.0, 1.0 ); }`,
    });
    this.buf = new Uint8Array(SIZE * SIZE * 4);
    this.map = null;                 // { cx, cz, h: Float32Array } the last picture read back
    this.busy = false; this.at = -1e9; this.cx = 1e9; this.cz = 1e9; this.changed = true;
    this.ok = true;
  }

  // call every frame with the aircraft's position and velocity
  update(pos, vel, now) {
    if (this.busy || !this.ok) return;
    const ax = pos.x + vel.x * 2.0, az = pos.z + vel.z * 2.0;          // centred where it will be in two seconds
    const far = Math.hypot(ax - this.cx, az - this.cz);
    if (!(far > 160 || (this.changed && now - this.at > 900) || now - this.at > 4000)) return;
    this.capture(ax, az, now);
  }

  capture(cx, cz, now) {
    const r = this.renderer, G = SPAN / SIZE;
    cx = Math.round(cx / G) * G; cz = Math.round(cz / G) * G;
    this.busy = true; this.at = now; this.cx = cx; this.cz = cz; this.changed = false;
    this.cam.position.set(cx, 4000, cz); this.cam.lookAt(cx, 0, cz); this.cam.updateMatrixWorld();
    // draw only the ground and the buildings, with every surface coloured by its height
    const hidden = [];
    for (const o of this.scene.children) if (o.visible && o !== this.city.group && o !== this.terrain.group) { o.visible = false; hidden.push(o); }
    for (const s of this.city.sets) if (s.tiles && s.kind !== 'bldg' && s.tiles.group.visible) { s.tiles.group.visible = false; hidden.push(s.tiles.group); }
    const prev = r.getRenderTarget(), sm = r.shadowMap.autoUpdate, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha(), ac = r.autoClear, bg = this.scene.background;
    r.shadowMap.autoUpdate = false; r.autoClear = true; this.scene.background = null; this.scene.overrideMaterial = this.mat;
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 1);
    r.render(this.scene, this.cam);
    this.scene.overrideMaterial = null; this.scene.background = bg;
    r.autoClear = ac; r.setRenderTarget(prev); r.setClearColor(cc, ca); r.shadowMap.autoUpdate = sm;
    for (const o of hidden) o.visible = true;
    const done = () => {
      const h = this.map?.h || new Float32Array(SIZE * SIZE), b = this.buf;
      for (let i = 0, p = 0; i < SIZE * SIZE; i++, p += 4) h[i] = b[p + 2] ? LO + ((b[p] * 256 + b[p + 1]) / 65535) * RANGE : -1e9;
      this.map = { cx, cz, h }; this.busy = false;
    };
    const fail = (e) => { console.warn('roof map', e?.message || e); this.busy = false; this.ok = false; };
    try {
      if (r.readRenderTargetPixelsAsync) r.readRenderTargetPixelsAsync(this.rt, 0, 0, SIZE, SIZE, this.buf).then(done, fail);
      else { r.readRenderTargetPixels(this.rt, 0, 0, SIZE, SIZE, this.buf); done(); }
    } catch (e) { fail(e); }
  }

  // highest surface within a couple of metres of (x, z); -Infinity where nothing is known
  top(x, z) {
    const m = this.map; if (!m) return -Infinity;
    // the picture looks straight down with north at the top; the read-back starts at its bottom row (south)
    const G = SPAN / SIZE, i = Math.floor((x - m.cx) / G + SIZE / 2), jj = Math.floor((m.cz - z) / G + SIZE / 2);
    if (i < 1 || i >= SIZE - 1 || jj < 1 || jj >= SIZE - 1) return -Infinity;
    let top = -1e9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = m.h[(jj + dj) * SIZE + i + di]; if (v > top) top = v; }
    return top < -1e8 ? -Infinity : top;
  }
}
