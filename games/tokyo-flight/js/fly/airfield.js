// airfield.js — Haneda round runway 16L/34R: the ground beside the runway, and what stands on it.
//
//   the ground      taxiways, their shoulders, aprons and stands, centre lines and edge lines are drawn by rule in the
//                   ground shader (terrain.js) from a map of how far the nearest taxiway centre line and apron edge
//                   are (assets/airfield/haneda.bin.gz, built by tools/build_airfield.py from OpenStreetMap).
//                   Grass keeps the aerial photo's own tone and gains the detail the photo cannot hold.
//   what stands     runway edge lights, threshold and end lights, the approach lights on their masts at both ends,
//   on it           PAPI units beside each touchdown zone, windsocks where the map has them, a runway sign at each
//                   holding position, the localizer aerial beyond the far end, the glide path mast and its hut.
//
// Positions are in the runway's own frame: s metres along from the 34R end, d metres across (+ to the right of a
// take-off). Heights come from the runway's surface; things off the runway stand on legs long enough for the survey
// ground to be a little higher or lower than that.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ATMO, patch } from '../atmo.js';

async function fetchBin(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('airfield: http ' + r.status);
  let buf = await r.arrayBuffer();
  const u = new Uint8Array(buf, 0, 2);
  if (u[0] === 0x1f && u[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return buf;
}
const hop = () => new Promise((r) => setTimeout(r, 0));

// the ground map -> a texture the ground shader reads, and the numbers that take a world position to a place on it
async function groundMap(runway, base) {
  const meta = await (await fetch(base + 'haneda.json')).json();
  const raw = new Int16Array(await fetchBin(base + 'haneda.bin.gz'));
  const { nx, ny } = meta, n = nx * ny, out = new Uint16Array(n * 4), half = THREE.DataUtils.toHalfFloat;
  for (let p = 0; p < 4; p++) {
    for (let j = 0; j < ny; j++) {
      let d1 = 0, v = 0;                               // stored as second differences along each row
      const o = p * n + j * nx, w = j * nx * 4 + [0, 1, 2, 3][p];
      for (let i = 0; i < nx; i++) { d1 = (d1 + raw[o + i]) << 16 >> 16; v = (v + d1) << 16 >> 16; out[w + i * 4] = half(v * 0.01); }
    }
    await hop();
  }
  const tex = new THREE.DataTexture(out, nx, ny, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
  // world (x, z) -> (s, d): solve from three points on the runway's frame
  const P0 = runway.point(0, 0), Ps = runway.point(1000, 0), Pd = runway.point(0, 500);
  const ax = (Ps.x - P0.x) / 1000, az = (Ps.z - P0.z) / 1000, bx = (Pd.x - P0.x) / 500, bz = (Pd.z - P0.z) / 500, det = ax * bz - az * bx;
  const sx = bz / det, sz = -bx / det, dx = -az / det, dz = ax / det;          // s = sx*(x-x0) + sz*(z-z0), d likewise
  const W = nx * meta.cell, H = ny * meta.cell, U = ATMO.uniforms;
  U.uFieldA.value.set(sx / W, sz / W, (-(sx * P0.x + sz * P0.z) - meta.s0) / W);
  U.uFieldB.value.set(dx / H, dz / H, (-(dx * P0.x + dz * P0.z) - meta.d0) / H);
  U.uFieldL.value.set(W, H, meta.s0, meta.d0); U.uFieldRun.value = runway.length;
  U.tField.value = tex; U.uFieldOn.value = 1;
  return meta;
}

// geometry gathered per material in the runway's frame, merged at the end
class Yard {
  constructor(runway) {
    this.rw = runway; this.by = new Map();
    this.c = runway.point(runway.length / 2, 0);
    const a = runway.point(runway.length / 2 + 1, 0).sub(this.c).setY(0).normalize();
    this.along = a; this.up = new THREE.Vector3(0, 1, 0); this.across = new THREE.Vector3().crossVectors(a, this.up).normalize();
    this._m = new THREE.Matrix4(); this._r = new THREE.Matrix4(); this._p = new THREE.Vector3();
  }
  // the ground beside the runway: the runway's own surface on it, 30 cm under its plane beyond the shoulder
  ground(s, d) { return this.rw.point(s, d, this._p).y - (Math.abs(d) > 37.5 ? 0.3 : 0); }
  // geo is built with x along the runway, y up, z across; it is set down at (s, d), h metres above the ground, turned `yaw` about the vertical
  put(mat, geo, s, d, h = 0, yaw = 0) {
    const p = this.rw.point(s, d, this._p); p.y = this.ground(s, d) + h; p.sub(this.c);
    this._m.makeBasis(this.along, this.up, this.across).setPosition(p);
    if (yaw) geo.rotateY(yaw);
    geo.applyMatrix4(this._m);
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
    return this;
  }
  box(mat, l, h, w, s, d, y, yaw = 0) { return this.put(mat, new THREE.BoxGeometry(l, h, w), s, d, y, yaw); }
  pole(mat, r, h, s, d, y0 = 0, seg = 8) { return this.put(mat, new THREE.CylinderGeometry(r, r, h, seg), s, d, y0 + h / 2); }
  into(group) {
    for (const [mat, list] of this.by) {
      for (const g of list) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = mat.userData.cast !== false; m.receiveShadow = true; m.position.copy(this.c); m.updateMatrixWorld(); m.matrixAutoUpdate = false;
      group.add(m);
      for (const g of list) g.dispose();
    }
  }
}

const std = (key, color, rough, metal = 0, parts = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), 'af-' + key, parts);
// a lamp: lit a little by day, fully after dark
const lamp = (key, r, g, b, day = 0.5, night = 9) => { const m = patch(new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.3 }), 'af-lamp-' + key, { emissive: `totalEmissiveRadiance += vec3( ${r.toFixed(2)}, ${g.toFixed(2)}, ${b.toFixed(2)} ) * ( ${day.toFixed(2)} + ${night.toFixed(1)} * uNight );` }); m.userData.cast = false; return m; };

function signTexture(text) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const cx = cv.getContext('2d');
  cx.fillStyle = '#b3120c'; cx.fillRect(0, 0, 512, 128); cx.strokeStyle = '#f2efe6'; cx.lineWidth = 6; cx.strokeRect(5, 5, 502, 118);
  cx.fillStyle = '#f2efe6'; cx.font = 'bold 92px Arial, Helvetica, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function furniture(runway, meta) {
  const Y = new Yard(runway), L = runway.length, g = new THREE.Group(); g.name = 'airfield';
  const M = {
    steel: std('steel', 0x8b9094, 0.5, 0.7), dark: std('dark', 0x1b1d1f, 0.6, 0.2), yellow: std('yellow', 0xb88a10, 0.5), orange: std('orange', 0xc24a12, 0.55), white: std('white', 0xd8d6cf, 0.6),
    conc: std('conc', 0x7c7a74, 0.9), glass: std('glass', 0xe8ecef, 0.15, 0.1),
    lWhite: lamp('w', 1.0, 0.93, 0.80), lGreen: lamp('g', 0.15, 1.0, 0.40), lRed: lamp('r', 1.0, 0.10, 0.06), lAmber: lamp('a', 1.0, 0.62, 0.12),
    papiW: lamp('pw', 1.0, 0.97, 0.90, 3.2, 9), papiR: lamp('pr', 1.0, 0.07, 0.04, 3.2, 9),
  };
  // a raised light: a frangible stem with a glass dome on it
  const fixture = (lm, s, d, h = 0.32) => { Y.pole(M.yellow, 0.035, h, s, d, 0, 6).put(M.yellow, new THREE.CylinderGeometry(0.075, 0.055, 0.07, 10), s, d, h + 0.035).put(lm, new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), s, d, h + 0.07).put(M.conc, new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10), s, d, 0.015); };
  // runway edge lights every 60 m (amber over the last 600 m), green across each threshold, red across each end
  for (let s = 0; s <= L; s += 60) for (const d of [-30.7, 30.7]) fixture(s > L - 600 || s < 600 ? M.lAmber : M.lWhite, s, d);
  for (let d = -27; d <= 27; d += 3) { fixture(M.lGreen, 2.4, d, 0.18); fixture(M.lRed, -1.2, d, 0.18); fixture(M.lGreen, L - 2.4, d, 0.18); fixture(M.lRed, L + 1.2, d, 0.18); }
  // approach lights: bars of five every 30 m out to 900 m, a wide bar at 300 m, red side rows over the last 270 m.
  // They keep to one plane; each bar stands on a mast as tall as the ground (or the water) under it needs.
  const approach = (s0, dir) => {
    for (let k = 1; k <= 30; k++) {
      const s = s0 - dir * k * 30, top = 0.5 + k * 0.045, drop = dir > 0 ? 9 : 3.5;          // off the 34R end they stand in the bay
      Y.pole(M.steel, 0.07, top + drop, s, 0, -drop, 8).box(M.steel, 0.1, 0.06, 4.4, s, 0, top);
      for (let i = -2; i <= 2; i++) Y.put(M.lWhite, new THREE.SphereGeometry(0.11, 8, 6), s, i * 1.0, top + 0.12);
      if (k === 10) for (const sd of [-1, 1]) { Y.pole(M.steel, 0.07, top + drop, s, sd * 9, -drop, 8).box(M.steel, 0.1, 0.06, 11, s, sd * 9.5, top); for (let i = 0; i < 8; i++) Y.put(M.lWhite, new THREE.SphereGeometry(0.11, 8, 6), s, sd * (4.5 + i * 1.5), top + 0.12); }
      if (k <= 9) for (const sd of [-1, 1]) { Y.pole(M.steel, 0.05, top + drop, s, sd * 10.5, -drop, 6).box(M.steel, 0.1, 0.05, 3.2, s, sd * 10.5, top); for (let i = -1; i <= 1; i++) Y.put(M.lRed, new THREE.SphereGeometry(0.1, 8, 6), s, sd * (10.5 + i), top + 0.11); }
    }
  };
  approach(0, 1); approach(L, -1);
  // PAPI: four units in a row beside each touchdown zone, on the left of a landing; two show white and two red on the right slope
  const papi = (s, side) => { for (let i = 0; i < 4; i++) { const d = side * (41 + i * 3.0); for (const [ds, dd] of [[-0.3, -0.3], [-0.3, 0.3], [0.3, 0]]) Y.pole(M.yellow, 0.025, 0.75, s + ds, d + dd, -0.35, 6);
    Y.box(M.orange, 0.95, 0.3, 0.8, s, d, 0.55).box(M.dark, 0.04, 0.22, 0.7, s - side * 0.0 + (side < 0 ? -0.49 : 0.49), d, 0.55);
    for (const dd of [-0.2, 0.2]) Y.put(i < 2 ? M.papiW : M.papiR, new THREE.SphereGeometry(0.075, 10, 6), s + (side < 0 ? -0.5 : 0.5), d + dd, 0.55); } };
  papi(330, -1); papi(L - 420, 1);            // clear of the exits that cross the strip
  // windsocks: a mast, a swivel, and a sock in orange and white bands hanging part filled
  for (const [s, d] of meta.windsocks || []) {
    Y.pole(M.white, 0.06, 6.2, s, d, -0.6, 10).box(M.conc, 0.9, 0.3, 0.9, s, d, 0.0);
    for (let i = 0; i < 5; i++) { const r0 = 0.45 - i * 0.07, r1 = r0 - 0.07, geo = new THREE.CylinderGeometry(r1, r0, 0.72, 14, 1, true).rotateZ(Math.PI / 2 + 0.22).translate(-0.36 - i * 0.70, 5.45 - i * 0.16, 0); geo.rotateY(-0.5);
      const m = i % 2 ? M.white : M.orange; Y.put(m, geo, s, d, 0); }
  }
  // a runway sign beside each holding position, facing the taxiway: white on red, lit from inside
  const sign = patch(new THREE.MeshStandardMaterial({ map: signTexture('34R-16L'), roughness: 0.5, emissive: 0xffffff }), 'af-sign', {});
  sign.emissiveMap = sign.map; sign.emissiveIntensity = 0.3; sign.userData.cast = false;
  for (const [s, d] of meta.holds || []) {
    if (Math.abs(d) > 130) continue;
    const ss = s - 21, face = new THREE.PlaneGeometry(2.6, 0.65).rotateY(d < 0 ? Math.PI / 2 : -Math.PI / 2).rotateY(Math.PI / 2);
    Y.box(M.dark, 2.7, 0.75, 0.22, ss, d, 0.75).pole(M.dark, 0.04, 0.5, ss - 0.9, d, 0, 6).pole(M.dark, 0.04, 0.5, ss + 0.9, d, 0, 6).box(M.conc, 3.0, 0.08, 0.6, ss, d, 0.02);
    Y.put(sign, face, ss, d + (d < 0 ? -0.115 : 0.115), 0.75);
  }
  // the localizer beyond the far end: a row of aerials on a frame, orange and white; the glide path mast and its hut by the touchdown zone
  { const s = L + 300; Y.box(M.orange, 0.5, 0.2, 42, s, 0, 2.3).box(M.white, 0.5, 0.2, 42, s, 0, 1.2);
    for (let i = -10; i <= 10; i++) { Y.pole(i % 2 ? M.white : M.orange, 0.05, 3.9, s, i * 2, -0.8, 6); Y.box(M.orange, 2.6, 0.06, 0.06, s - 1.0, i * 2, 2.75).box(M.orange, 0.05, 0.9, 0.05, s - 2.2, i * 2, 2.75); }
    Y.box(M.white, 3.2, 2.4, 2.6, s + 9, 14, 1.2).box(M.steel, 3.4, 0.12, 2.8, s + 9, 14, 2.46); }
  { const s = 318, d = 122; for (let i = 0; i < 7; i++) Y.pole(i % 2 ? M.white : M.orange, 0.11, 2.2, s, d, -0.6 + i * 2.2, 8);
    for (const h of [5.2, 9.6, 13.8]) Y.box(M.orange, 0.5, 0.9, 1.9, s - 0.35, d, h);
    Y.box(M.white, 3.4, 2.5, 2.8, s + 6, d + 3, 1.25).box(M.steel, 3.6, 0.12, 3.0, s + 6, d + 3, 2.56).put(M.lRed, new THREE.SphereGeometry(0.16, 8, 6), s, d, 14.95); }
  Y.into(g);
  return g;
}

// loads the ground map and builds the furniture; resolves to the group to add to the scene
export async function loadAirfield(runway, base = './assets/airfield/') {
  const meta = await groundMap(runway, base);
  return furniture(runway, meta);
}
