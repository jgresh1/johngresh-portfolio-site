// cars.js — builds the car once and gives the game two of them (shared geometry, separate paint), with the moving
// parts wired up: wheels, tyre blur, the dash display, and a ground shadow that needs no shadow-map refresh.
import * as THREE from 'three';
import { DETAIL, DRIVE_BTN } from '../car/geo.js';
import { makeMaterials, PAINTS } from '../car/mats.js';
import { buildCar } from '../car/car.js';
import { loadHand } from '../car/hands.js';
import { surfaceAt } from '../track/world.js';

export { PAINTS };
const HX0 = -2.95, HX1 = 3.15, HZ = 1.15;                 // footprint covered by the height image (car frame)

// top-down height image of the car: lets the shadow shader find what stands between a ground point and the sun
function bakeHeight(renderer, car) {
  const rt = new THREE.WebGLRenderTarget(128, 384, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const cam = new THREE.OrthographicCamera(-HZ, HZ, HX1, HX0, 0.1, 6);
  cam.position.set(0, 3, 0); cam.up.set(1, 0, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const sc = new THREE.Scene(); sc.add(car);
  sc.overrideMaterial = new THREE.ShaderMaterial({ side: THREE.DoubleSide,
    vertexShader: 'varying float vY;\n#include <common>\nvoid main() { vec4 p = vec4(position, 1.0);\n#ifdef USE_INSTANCING\n p = instanceMatrix * p;\n#endif\n vec4 w = modelMatrix * p; vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'varying float vY; void main() { gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }' });
  const prev = renderer.getRenderTarget(), sm = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(sc, cam);
  renderer.setRenderTarget(prev); renderer.shadowMap.enabled = sm;
  sc.remove(car); sc.overrideMaterial.dispose();
  return rt.texture;
}

const SHADOW_FRAG = /* glsl */`
  uniform sampler2D tH; uniform vec3 uSun; uniform float uFade;
  varying vec2 vL; varying float vEdge;
  float hAt(vec2 p) {
    vec2 uv = vec2((p.y + ${HZ.toFixed(2)}) / ${(2 * HZ).toFixed(2)}, (p.x - ${HX0.toFixed(2)}) / ${(HX1 - HX0).toFixed(2)});
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(tH, uv).r;
  }
  void main() {
    vec2 dir = uSun.xz / max(uSun.y, 0.2);
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float occ = 0.0;
    // Only the car casts: where the height image is empty (bare road, height 0) there is nothing to cast, whatever
    // height the ray is at. Without that test the lowest steps of the ray counted the road itself as a caster and
    // the whole patch showed as a grainy dark box round the car.
    for (int i = 0; i < STEPS; i++) { float h = (float(i) + n) / float(STEPS) * 1.06, hv = hAt(vL + dir * h); occ = max(occ, smoothstep(h - 0.03, h + 0.02, hv) * smoothstep(0.012, 0.035, hv)); }
    float under = smoothstep(0.015, 0.04, hAt(vL));
    float a = max(occ * 0.70, under * 0.86) * uFade * vEdge;      // (fades out before the patch's own edge: a long shadow never ends on a line)
    if (a < 0.004) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }`;

export class CarView {
  constructor(car, M, heightTex, q) {
    this.car = car; this.M = M; this.q = q;
    this.root = new THREE.Group(); this.root.add(car); this.root.matrixAutoUpdate = false;
    this.wheels = [];
    car.traverse((o) => {
      if (o.userData && o.userData.wheel) {
        const { front, side } = o.userData.wheel;
        this.wheels.push({ group: o, steer: o.getObjectByName('steer'), spin: o.getObjectByName('spin'), front, side,
          k: (front ? 0 : 2) + (side > 0 ? 0 : 1), p0: o.position.clone(), q0: o.quaternion.clone() });
      }
      if (o.name === 'steeringWheel') this.sw = o;
      if (o.name === 'driver') this.driver = o;
    });
    this.paddle = this.sw ? this.sw.getObjectByName('paddleUR') : null;
    this.btn = this.sw ? this.sw.getObjectByName('btnDrive') : null; this.handR = car.getObjectByName('handR') || null;      // for the film's button press
    this.pressInit();
    // deep = parts only seen when you look into an inlet (radiator cores, the air filter): not drawn on the circuit
    const DEEP = { coreFin: 1, coreTube: 1, filter: 1, ductFrame: 1 };
    this.meshes = []; car.traverse((o) => { if (o.isMesh) { const m = Array.isArray(o.material) ? o.material[0] : o.material; this.meshes.push([o, o.castShadow, !!DEEP[m.userData.key]]); } });
    this.paint = 0;
    // ground shadow
    const NX = 11, NZ = 7, X0 = -4.3, X1 = 4.5, Z0 = -2.5, Z1 = 2.5;
    const g = new THREE.BufferGeometry(), pos = new Float32Array(NX * NZ * 3), loc = new Float32Array(NX * NZ * 2), idx = [];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const k = j * NX + i; loc[k * 2] = X0 + (X1 - X0) * i / (NX - 1); loc[k * 2 + 1] = Z0 + (Z1 - Z0) * j / (NZ - 1); }
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i; idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aLocal', new THREE.BufferAttribute(loc, 2)); g.setIndex(idx);
    this.shU = { tH: { value: heightTex }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uFade: { value: 1 } };
    this.shadow = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.shU, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, defines: { STEPS: q.shadowSteps || 12 },
      vertexShader: `attribute vec2 aLocal; varying vec2 vL; varying float vEdge; void main() { vL = aLocal;
        vEdge = clamp(min(min(aLocal.x - (${X0.toFixed(2)}), ${X1.toFixed(2)} - aLocal.x), min(aLocal.y - (${Z0.toFixed(2)}), ${Z1.toFixed(2)} - aLocal.y)) / 0.6, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`, fragmentShader: SHADOW_FRAG }));
    this.shadow.frustumCulled = false; this.shadow.renderOrder = 3;
    this._f = new THREE.Vector3(); this._u = new THREE.Vector3(); this._r = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this._qi = new THREE.Quaternion(); this._v = new THREE.Vector3();
    this.pos = new THREE.Vector3(); this.fwd = new THREE.Vector3(1, 0, 0); this.up = new THREE.Vector3(0, 1, 0);
    this.dash = null;
  }
  setPaint(i) { this.paint = i; this.M.applyPaint(PAINTS[i]); }
  // cars cast real shadows in the studio only; on the circuit the ground shadow stands in (no shadow-map refresh)
  setStage(studio) { for (const [m, c, deep] of this.meshes) { m.castShadow = studio && c; if (deep) m.visible = studio && !this.q.noDeep; } }

  // stand the car at the origin, as in the studio
  home() {
    this.root.matrix.identity(); this.root.matrixWorldNeedsUpdate = true; this.car.rotation.set(0, 0, 0); this.car.position.set(0, 0, 0); this.shadow.visible = false;
    for (const w of this.wheels) { w.group.position.copy(w.p0); w.group.quaternion.copy(w.q0); }
  }
  // The body pitches and rolls on its springs; the wheels must not. Each wheel group gets the inverse of the body's
  // rotation, so in the road's frame it stays where it was built, raised by that corner's suspension travel.
  plantWheels(lift) {
    const qi = this._qi.copy(this.car.quaternion).invert(), v = this._v;
    for (const w of this.wheels) {
      v.copy(w.p0); v.y += lift ? lift[w.k] : 0;
      w.group.position.copy(v.applyQuaternion(qi));
      w.group.quaternion.multiplyQuaternions(qi, w.q0);
    }
  }

  /* The film's button press. The right hand has two extra thumb poses (morph targets): held over the drive button,
     and down on it. Here the thumb's skin near the button is kept, in the steering wheel's frame, for all three
     poses, so that the button can be put exactly where the skin pushes it: it goes down when touched, and the thumb
     never passes through it. */
  pressInit() {
    const h = this.handR, sw = this.sw; this.pressV = null; this.pressTouch = 0.5;
    if (!h || !sw || !this.btn || !h.geometry.morphAttributes.position || h.geometry.morphAttributes.position.length < 2) return;
    this.car.updateMatrixWorld(true);
    const M = new THREE.Matrix4().copy(sw.matrixWorld).invert().multiply(h.matrixWorld), v = new THREE.Vector3(), B = DRIVE_BTN;
    const src = [h.geometry.attributes.position, ...h.geometry.morphAttributes.position], keep = [], R2 = (B.r + 0.012) ** 2;
    for (let i = 0; i < src[0].count; i++) {
      const p = []; let near = false;
      for (const a of src) { v.fromBufferAttribute(a, i).applyMatrix4(M); p.push(v.x, v.y, v.z); if ((v.x - B.x) ** 2 + (v.y - B.y) ** 2 < R2 && v.z < B.top + 0.03) near = true; }
      if (near) keep.push(p);
    }
    this.pressV = keep;
    // how far towards the pressed pose the thumb is when it first touches the cap
    for (let b = 0; b <= 1.0001; b += 0.02) if (this.thumbZ(1 - b, b) <= B.top) { this.pressTouch = Math.max(0, b - 0.02); break; }
    this.pressButton(0, 0);
  }
  // the lowest point of the thumb's skin over the cap, for a blend of the poses (a: over the button, b: down on it)
  thumbZ(a, b) {
    const B = DRIVE_BTN, r2 = (B.r + 0.0004) ** 2, k = 1 - a - b; let z = 1e9;
    for (const p of this.pressV) {
      const x = p[0] * k + p[3] * a + p[6] * b - B.x, y = p[1] * k + p[4] * a + p[7] * b - B.y;
      if (x * x + y * y < r2) { const zz = p[2] * k + p[5] * a + p[8] * b; if (zz < z) z = zz; }
    }
    return z;
  }
  // set the thumb's pose; the button follows the skin. Returns how far down the button is, 0..1 of its travel.
  pressButton(a, b) {
    if (!this.pressV) return 0;
    this.handR.morphTargetInfluences[0] = a; this.handR.morphTargetInfluences[1] = b;
    const d = Math.min(DRIVE_BTN.travel, Math.max(0, DRIVE_BTN.top - (this.thumbZ(a, b) - 0.00015)));
    this.btn.position.z = -d;
    return d / DRIVE_BTN.travel;
  }

  // wheels: angles in radians (front axle, rear axle), steer in radians (+ = right), blur = fraction of a turn per exposure
  setWheels(angF, angR, steer, blurF, blurR) {
    for (const w of this.wheels) {
      w.spin.rotation.z = (w.front ? angF : angR) * (w.side > 0 ? -1 : 1);
      if (w.front) w.steer.rotation.y = -steer;
    }
    const M = this.M;
    M.spinF.value = blurF; M.spinR.value = blurR;
    M.sidewallF.bumpScale = 1.4 * (1 - Math.min(1, blurF * 30)); M.sidewall.bumpScale = 1.4 * (1 - Math.min(1, blurR * 30));
  }

  // place the car from a simulation body (sim.js) and move its parts
  sync(b, sun, dt) {
    const c = Math.cos(b.psi), s = Math.sin(b.psi), f = this._f, u = this._u, r = this._r;
    f.set(c, b.slope || 0, s).normalize(); r.set(-s, b.bank || 0, c).normalize();
    u.crossVectors(r, f).normalize(); r.crossVectors(f, u);
    this.pos.set(b.x, b.y, b.z); this.fwd.copy(f); this.up.copy(u);
    this._m.makeBasis(f, u, r).setPosition(this.pos);
    this.root.matrix.copy(this._m); this.root.matrixWorldNeedsUpdate = true;
    this.car.rotation.set(-b.rollA * 1.0, 0, -b.pitch);
    this.plantWheels(b.wheelLift);
    const sh = 1 / 90, tw = 2 * Math.PI;
    this.setWheels(b.wheelAng, b.wheelAngR, b.steer, Math.min(0.5, Math.abs(b.u) / 0.36 * sh / tw), Math.min(0.5, (Math.abs(b.u) / 0.36 + b.spinR * 60) * sh / tw));
    // ground shadow: a small grid laid on the surface around the car
    const g = this.shadow.geometry, P = g.attributes.position.array, L = g.attributes.aLocal.array;
    for (let k = 0, n = L.length / 2; k < n; k++) { const lx = L[k * 2], lz = L[k * 2 + 1], x = b.x + c * lx - s * lz, z = b.z + s * lx + c * lz; P[k * 3] = x; P[k * 3 + 1] = surfaceAt(x, z) + 0.015; P[k * 3 + 2] = z; }
    g.attributes.position.needsUpdate = true;
    this.shU.uSun.value.set(sun.dot(f), Math.max(0.2, sun.dot(u)), sun.dot(r));
    this.shadow.visible = true;
  }

  /* ---- dash display on the steering wheel (the player's car) ---- */
  makeDash() {
    if (!this.sw || this.dash) return;
    const K = DETAIL.tex >= 1 ? 2 : 1, c = document.createElement('canvas'); c.width = 470 * K; c.height = 338 * K;      // drawn in 470 x 338 units
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.094, 0.0676), new THREE.MeshBasicMaterial({ map: t, transparent: true, color: new THREE.Color(1.5, 1.5, 1.5) }));
    m.position.set(0, 0.0307, 0.0119); this.sw.add(m);
    this.dash = { c, g: c.getContext('2d'), t, key: '' }; this.dash.g.scale(K, K);
    this.drawDash(1, 0, 0, 1);
  }
  // gear: a number, or 'N' (the film, before the driver presses the button)
  drawDash(gear, kmh, rev, energy) {
    const D = this.dash; if (!D) return;
    const leds = Math.round(Math.min(1, Math.max(0, rev)) * 15), key = gear + '|' + Math.round(kmh) + '|' + leds + '|' + Math.round(energy * 20);
    if (key === D.key) return; D.key = key;
    const g = D.g, PX = 5000, cx = (x) => 235 + x * PX, cy = (y) => 338 - (y + 0.003) * PX;   // metres on the wheel -> pixels
    g.clearRect(0, 0, 470, 338);
    g.fillStyle = '#02060a'; g.beginPath(); g.roundRect(cx(-0.045), cy(0.055), 0.09 * PX, 0.058 * PX, 11); g.fill();
    const F = 'Bahnschrift, "DIN Alternate", "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#eaf6ff'; g.font = `700 150px ${F}`; g.fillText(String(gear), cx(0), cy(0.0255));
    g.font = `700 34px ${F}`; g.fillStyle = '#ffffff'; g.fillText(String(Math.round(kmh)), cx(-0.029), cy(0.004)); g.fillStyle = '#7fd4ff'; g.font = `600 17px ${F}`; g.fillText('KM/H', cx(-0.029), cy(-0.0015));
    g.fillStyle = '#ffd24a'; g.font = `700 24px ${F}`; g.fillText('ERS ' + Math.round(energy * 100) + '%', cx(0.027), cy(0.0445));
    g.fillStyle = '#7fd4ff'; g.fillText('P-26', cx(-0.029), cy(0.0445));
    g.fillStyle = '#8fff9a'; g.font = `700 30px ${F}`; g.fillText('RACE', cx(0.029), cy(0.004));
    // energy bar
    g.fillStyle = '#18222b'; g.fillRect(cx(0.012), cy(0.0375), 0.03 * PX, 7); g.fillStyle = '#ffd24a'; g.fillRect(cx(0.012), cy(0.0375), 0.03 * PX * energy, 7);
    const lc = ['#19ff4a', '#19ff4a', '#19ff4a', '#19ff4a', '#19ff4a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#3d6bff', '#3d6bff', '#3d6bff', '#3d6bff', '#3d6bff'];
    for (let i = 0; i < 15; i++) { g.fillStyle = '#0a0b0d'; g.beginPath(); g.arc(cx(-0.042 + i * 0.006), cy(0.0615), 7.2, 0, 7); g.fill(); g.globalAlpha = i < leds ? 1 : 0.12; g.fillStyle = lc[i]; g.beginPath(); g.arc(cx(-0.042 + i * 0.006), cy(0.0615), 6.4, 0, 7); g.fill(); g.globalAlpha = 1; }
    D.t.needsUpdate = true;
  }
}

/* The car is built from about 400 small meshes. Drawn like that, two cars cost over 700 draw calls a frame, which is
   what limits a phone. Everything that never moves relative to its parent is merged into one mesh per material:
   the body, each wheel's spinning parts, each upright. */
function mergeInto(parent, meshes) {
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert(), rel = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  const buckets = new Map();
  for (const m of meshes) {
    const g = m.geometry, mats = Array.isArray(m.material) ? m.material : [m.material];
    const total = g.index ? g.index.count : g.attributes.position.count;
    /* A mesh with ONE material draws its whole geometry, whatever groups the geometry carries (three.js only looks at
       groups when the material is an array). Boxes, cylinders and extruded plates all come with groups (one per face,
       side/caps, caps/walls); honouring them here used to keep group 0 and drop the rest, so every merged box was a
       single face, every cylinder had no ends and every plate had no edge: the steering wheel had no rim wall, and
       from in front you saw through it to the buttons. */
    const groups = Array.isArray(m.material) && g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
    rel.multiplyMatrices(inv, m.matrixWorld); nm.getNormalMatrix(rel);
    const flip = rel.determinant() < 0;
    for (const gr of groups) {
      const mat = mats[gr.materialIndex]; if (!mat) continue;
      const key = mat.uuid + '|' + (m.castShadow ? 1 : 0) + '|' + m.renderOrder;
      let b = buckets.get(key); if (!b) { b = { mat, cast: m.castShadow, order: m.renderOrder, attrs: {}, idx: [], n: 0 }; buckets.set(key, b); }
      for (const name of Object.keys(g.attributes)) if (!b.attrs[name]) { const size = g.attributes[name].itemSize, data = new Array(b.n * size).fill(name === 'color' ? 1 : 0); b.attrs[name] = { size, data }; }
      const remap = new Map(), first = b.idx.length, end = Math.min(total, gr.start + gr.count);
      for (let k = gr.start; k < end; k++) {
        const vi = g.index ? g.index.getX(k) : k;
        let ni = remap.get(vi);
        if (ni === undefined) {
          ni = b.n++; remap.set(vi, ni);
          for (const name in b.attrs) {
            const A = b.attrs[name], src = g.attributes[name];
            if (!src) { for (let c = 0; c < A.size; c++) A.data.push(name === 'color' ? 1 : 0); }
            else if (name === 'position') { v.fromBufferAttribute(src, vi).applyMatrix4(rel); A.data.push(v.x, v.y, v.z); }
            else if (name === 'normal') { v.fromBufferAttribute(src, vi).applyMatrix3(nm).normalize(); A.data.push(v.x, v.y, v.z); }
            else for (let c = 0; c < A.size; c++) A.data.push(src.getComponent(vi, c));
          }
        }
        b.idx.push(ni);
      }
      if (flip) for (let k = first; k + 2 < b.idx.length; k += 3) { const t = b.idx[k + 1]; b.idx[k + 1] = b.idx[k + 2]; b.idx[k + 2] = t; }
    }
    m.parent.remove(m); g.dispose();
  }
  for (const b of buckets.values()) {
    const g = new THREE.BufferGeometry();
    for (const name in b.attrs) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(b.attrs[name].data), b.attrs[name].size));
    g.setIndex(new THREE.BufferAttribute(b.n > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = true; mesh.renderOrder = b.order; parent.add(mesh);
  }
}
function mergeCar(car, wheels) {
  const empty = car.getObjectByName('emptySeat'); if (empty) empty.parent.remove(empty);
  car.updateMatrixWorld(true);
  const inWheel = (o) => { for (let p = o; p; p = p.parent) if (p.userData && p.userData.wheel) return true; return false; };
  const ok = (o) => o.isMesh && !o.isInstancedMesh && o.visible && o.name !== 'paddleUR' && o.name !== 'handR' && o.name !== 'btnDrive';
  const body = []; car.traverse((o) => { if (ok(o) && !inWheel(o)) body.push(o); });
  const jobs = [[car, body]];
  for (const w of wheels) {
    const spin = [], st = [];
    w.spin.traverse((o) => { if (ok(o)) spin.push(o); });
    w.steer.traverse((o) => { if (ok(o) && !spin.includes(o)) st.push(o); });
    jobs.push([w.spin, spin], [w.steer, st]);
  }
  for (const [parent, list] of jobs) mergeInto(parent, list);
}

// the two hand meshes: the only files the car needs, so the game fetches them before anything large (see boot)
let handsP = null;
export function loadHands() {
  return handsP || (handsP = Promise.all([loadHand('./vendor/hands/left.glb'), loadHand('./vendor/hands/right.glb')]).then(([L, R]) => ({ L, R }))
    .catch((e) => { console.warn('hand meshes not loaded', e); return null; }));
}
export async function buildCars(renderer, q) {
  DETAIL.tol = q.carTol; DETAIL.hand = q.handLevels; DETAIL.tex = q.maskScale;
  const hands = await loadHands();
  const t0 = performance.now();
  const M1 = makeMaterials();
  const b = buildCar(M1, { hands });
  b.driver.userData = {};
  mergeCar(b.car, b.wheels);
  let tris = 0, meshes = 0; b.car.traverse((o) => { if (o.isMesh) meshes++; if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
  const heightTex = bakeHeight(renderer, b.car);
  const player = new CarView(b.car, M1, heightTex, q);
  const M2 = makeMaterials(M1);
  const c2 = b.car.clone(true);
  c2.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(M2.twin) : M2.twin(o.material); });
  const rival = new CarView(c2, M2, heightTex, q);
  player.makeDash();
  /* Further rivals, made when a race first needs them: each a copy of the first rival's car (the player's has the
     dash display on it) with its own set of materials, so it carries its own paint. The copy shares every
     geometry and texture, so it costs draw calls, not memory. The first rival is stood square first: a copy
     takes its wheels' rest positions from where they are. */
  const rivals = [rival];
  const ensure = (n) => {
    while (rivals.length < n) {
      rival.home();
      const M = makeMaterials(M1), c = rival.car.clone(true);
      c.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(M.twin) : M.twin(o.material); });
      rivals.push(new CarView(c, M, heightTex, q));
    }
    return rivals;
  };
  return { player, rival, rivals, ensure, tris: Math.round(tris), meshes, ms: Math.round(performance.now() - t0) };
}
