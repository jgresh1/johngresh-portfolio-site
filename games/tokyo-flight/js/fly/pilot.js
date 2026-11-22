// pilot.js — the pilot, built the way the driver in Phantom GP is built (js/fly/kit is that game's modelling kit):
// every part is a lofted or swept surface with real thickness and edges, cloth is drawn thread by thread, and the
// gloved hands are hand meshes whose fingers are wrapped round the stick and the throttle.
//
// A French test pilot of 1954: a white hard helmet open at the face with a leather-bound edge, two-lens goggles on
// an elastic strap, a rubber oxygen mask with its ribbed hose, a khaki cotton flight suit and scarf, a parachute
// harness with a quick-release box, leather gloves and boots. Nobody was measured for this; it is a period figure
// sized to fit the Katy's very small cockpit (he is about nine tenths of full size).
//
// Built in "seat" axes (x forward, y up, z to the pilot's right, metres, origin at the model's origin); the group
// returned is turned into the aircraft's own axes (X aft, Y starboard, Z up).
import * as THREE from 'three';
import { v3, clamp, lerp, smooth, DEG, curve, range, loft, tube, rod, ellipseLoop, squircleLoop } from './kit/geo.js';
import * as TX from './kit/tex.js';
import { loadHand, buildGripHand } from './kit/hands.js';

const P = (X, Y, Z) => v3(-X, Z, Y);                       // a point given in the aircraft's axes -> seat axes

export async function loadHands(base = './assets/hands/') {
  try { const [L, R] = await Promise.all([loadHand(base + 'left.glb'), loadHand(base + 'right.glb')]); return { L, R }; }
  catch (e) { console.warn('hand meshes', e.message || e); return null; }
}

function materials() {
  const fabric = TX.fabric(), knit = TX.gloveKnit();
  const WEAVE = '#include <color_fragment>\n#ifdef USE_BUMPMAP\ndiffuseColor.rgb *= 0.80 + 0.40 * texture2D( bumpMap, vBumpMapUv ).r;\n#endif';
  const weave = (m) => { m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', WEAVE); }; m.customProgramCacheKey = () => 'pilot-weave'; return m; };
  const cloth = { roughness: 0.92, bumpMap: fabric, bumpScale: 1.1, sheen: 0.55, sheenRoughness: 0.65 };
  const M = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xd8d4c6, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.22, side: THREE.DoubleSide }),          // enamelled helmet, a little chalked
    leather: new THREE.MeshPhysicalMaterial({ color: 0x2a1a10, roughness: 0.55, bumpMap: knit, bumpScale: 0.5, sheen: 0.35, sheenColor: new THREE.Color(0x6b4a30) }),
    skin: new THREE.MeshPhysicalMaterial({ color: 0x9c7663, roughness: 0.6, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xc9a090) }),
    cap: new THREE.MeshPhysicalMaterial({ color: 0x3a281a, roughness: 0.62, bumpMap: knit, bumpScale: 0.6, sheen: 0.3, sheenColor: new THREE.Color(0x7a5a40) }),                 // the leather flying cap worn under the shell
    lens: new THREE.MeshPhysicalMaterial({ color: 0x1a1c16, metalness: 1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.3, iridescenceIOR: 1.6, iridescenceThicknessRange: [260, 340] }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb9bbbd, metalness: 1, roughness: 0.22 }),
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x3a4036, roughness: 0.58, sheen: 0.3, sheenColor: new THREE.Color(0x7b8472) }),
    hose: new THREE.MeshPhysicalMaterial({ color: 0x23261f, roughness: 0.5, sheen: 0.25 }),
    web: weave(new THREE.MeshPhysicalMaterial({ ...cloth, color: 0xb5ad8c, bumpScale: 1.6, sheenColor: new THREE.Color(0xe6dfc4) })),                    // harness webbing
    strap: weave(new THREE.MeshPhysicalMaterial({ ...cloth, color: 0x4a4b40, bumpScale: 1.4, sheenColor: new THREE.Color(0x8c8d80) })),                  // goggle elastic
    suit: weave(new THREE.MeshPhysicalMaterial({ ...cloth, color: 0x6a6648, sheenColor: new THREE.Color(0xa9a482) })),
    scarf: weave(new THREE.MeshPhysicalMaterial({ ...cloth, color: 0xc9c4b4, roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color(0xf0ece0) })),
    glove: new THREE.MeshPhysicalMaterial({ color: 0x4a2e1a, roughness: 0.5, bumpMap: knit, bumpScale: 1.1, vertexColors: true, sheen: 0.4, sheenColor: new THREE.Color(0x8a5e3c) }),
    cuff: new THREE.MeshPhysicalMaterial({ color: 0x3d2616, roughness: 0.56, bumpMap: knit, bumpScale: 0.8, sheen: 0.35, sheenColor: new THREE.Color(0x7a5234) }),
    boot: new THREE.MeshPhysicalMaterial({ color: 0x120e0b, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    alu: new THREE.MeshStandardMaterial({ color: 0x9a9c9e, metalness: 1, roughness: 0.34 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8a1410, roughness: 0.4 }),
  };
  return M;
}

export function buildPilot(hands) {
  const M = materials();
  const root = new THREE.Group(); root.name = 'pilot';
  // seat axes -> aircraft axes
  root.matrix.makeBasis(v3(-1, 0, 0), v3(0, 0, 1), v3(0, 1, 0)); root.matrixAutoUpdate = false;
  const g = new THREE.Group(); root.add(g);
  const add = (geo, mat, parent = g, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
  const along = (geo, n, pos) => { geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), n.clone().normalize())); geo.translate(pos.x, pos.y, pos.z); return geo; };

  /* ================================================================ head (its own group, so it can turn) */
  const HC = P(2.035, 0, 1.735);
  const head = new THREE.Group(); head.name = 'head'; head.position.copy(HC); head.rotation.z = -0.04; g.add(head);
  // helmet shell: a super-ellipsoid dome; below the brow it is open at the face and comes down over the ears and the nape
  const HT = 0.128, BROW = 0.036, RIM = -0.082;
  const lowF = curve([[RIM, 0.118], [-0.05, 0.132], [0, 0.139]]), lowR = curve([[RIM, 0.098], [-0.05, 0.120], [0, 0.130]]), lowW = curve([[RIM, 0.104], [-0.05, 0.116], [0, 0.121]]);
  const dims = (y) => { if (y < 0) return [lowF(y), lowR(y), lowW(y)]; const k = Math.pow(Math.max(0, 1 - Math.pow(y / HT, 2.3)), 1 / 2.3); return [0.139 * k, 0.130 * k, 0.121 * k]; };
  const shell0 = (y, phi) => { const [F, R, W] = dims(y), c = Math.cos(phi), s = Math.sin(phi), e = 2 / 2.15; return v3((c >= 0 ? F : R) * Math.sign(c) * Math.pow(Math.abs(c), e), y, W * Math.sign(s) * Math.pow(Math.abs(s), e)); };
  const shellN = (y, phi) => { const d = 0.004, yy = clamp(y, RIM + 0.004, HT - 0.008); return shell0(yy + d, phi).sub(shell0(yy - d, phi)).cross(shell0(yy, phi + d).sub(shell0(yy, phi - d))).normalize(); };
  const shell = (y, phi, off = 0) => { const p = shell0(y, phi); return off ? p.addScaledVector(shellN(y, phi), off) : p; };
  const open = (y) => lerp(64, 76, smooth(BROW, RIM, y)) * DEG;               // half-angle of the face opening: wider towards the jaw
  { const crown = []; for (let k = 0; k <= 26; k++) { const y = lerp(BROW, HT * 0.9995, Math.sin(k / 26 * Math.PI / 2)); const r = []; for (let j = 0; j <= 96; j++) r.push(shell0(y, 2 * Math.PI * j / 96)); r[96] = r[0].clone(); crown.push(r); }
    add(loft(crown, { capEnd: true }), M.shell, head);
    const skirt = []; for (let k = 0; k <= 12; k++) { const y = lerp(RIM, BROW, k / 12), a = open(y), r = []; for (let j = 0; j <= 72; j++) r.push(shell0(y, lerp(a, 2 * Math.PI - a, j / 72))); skirt.push(r); }
    add(loft(skirt, { facing: v3(-1, 0, 0) }), M.shell, head);
    // leather binding round the whole edge: across the brow, down each cheek, round the bottom rim
    const edge = []; for (let j = 0; j <= 20; j++) edge.push(shell(BROW, lerp(-open(BROW), open(BROW), j / 20), 0.001));
    for (let k = 1; k <= 12; k++) { const y = lerp(BROW, RIM, k / 12); edge.push(shell(y, open(y), 0.001)); }
    for (let j = 1; j < 72; j++) edge.push(shell(RIM, lerp(open(RIM), 2 * Math.PI - open(RIM), j / 72), 0.001));
    for (let k = 12; k >= 1; k--) { const y = lerp(BROW, RIM, k / 12); edge.push(shell(y, -open(y), 0.001)); }
    add(tube(edge, v3(0, 1, 0), () => ellipseLoop(0.0052, 0.0052, 10), { closedPath: true }), M.leather, head);
    // earphone housings moulded into the shell
    for (const sz of [-1, 1]) add(along(new THREE.SphereGeometry(0.043, 28, 18).scale(1, 0.2, 1), shellN(-0.022, 96 * DEG * sz), shell(-0.022, 96 * DEG * sz, 0.002)), M.shell, head);
  }
  // the head inside: skull and face, nose, neck
  const face = (y, phi, off = 0) => { const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y + 0.012) / 0.128, 2.4)), 1 / 2.4), c = Math.cos(phi), s = Math.sin(phi); const p = v3((c >= 0 ? 0.098 : 0.094) * k * c, y, 0.078 * k * s); return off ? p.add(v3(c, 0, s).multiplyScalar(off)) : p; };
  { const rings = []; for (let k = 0; k <= 22; k++) { const y = lerp(-0.128, 0.105, k / 22), r = []; for (let j = 0; j <= 48; j++) r.push(face(y, 2 * Math.PI * j / 48)); r[48] = r[0].clone(); rings.push(r); }
    add(loft(rings, { capStart: true, capEnd: true }), M.skin, head);
    add(new THREE.SphereGeometry(0.017, 16, 12).scale(1.25, 1.5, 0.9).translate(0.098, -0.028, 0), M.skin, head);
    add(rod(v3(-0.012, -0.10, 0), v3(-0.03, -0.20, 0), 0.052, 24), M.skin, head); }
  // goggles: a padded frame hugging the face, two lenses with a bridge between them, chrome rims, elastic round the helmet
  { const GY0 = -0.012, GY1 = 0.034, GA = 58 * DEG;
    const patch = (y0, y1, a0, a1, off, rows = 10, cols = 20, facing = v3(1, 0, 0)) => { const rings = []; for (let i = 0; i <= rows; i++) { const y = lerp(y0, y1, i / rows), r = []; for (let j = 0; j <= cols; j++) r.push(face(y, lerp(a0, a1, j / cols), off)); rings.push(r); } return loft(rings, { facing }); };
    add(patch(GY0 - 0.006, GY1 + 0.006, -GA - 0.05, GA + 0.05, 0.007, 10, 36), M.leather, head);                                  // padded frame
    // the leather cap under the shell: it comes down over the ears, the cheeks and the jaw, and round the back of the neck
    for (const sz of [-1, 1]) add(patch(-0.124, 0.05, sz * 43 * DEG, sz * 180 * DEG, 0.0042, 16, 30, v3(-0.2, 0, sz)), M.cap, head);
    for (const sz of [-1, 1]) {
      add(patch(GY0, GY1, sz * 0.085, sz * GA, 0.0125), M.lens, head, false);
      const rim = []; for (let k = 0; k < 40; k++) { const t = 2 * Math.PI * k / 40, c = Math.cos(t), s = Math.sin(t), q = 2 / 3.2; rim.push(face(lerp(GY0, GY1, 0.5 + 0.5 * Math.sign(s) * Math.pow(Math.abs(s), q)), sz * lerp(0.085, GA, 0.5 + 0.5 * Math.sign(c) * Math.pow(Math.abs(c), q)), 0.0135)); }
      add(tube(rim, v3(1, 0, 0), () => ellipseLoop(0.0024, 0.0024, 8), { closedPath: true }), M.chrome, head, false);
      const st = []; for (let j = 0; j <= 14; j++) st.push(j < 3 ? face(0.011, sz * lerp(GA + 0.03, 1.2, j / 3), 0.012) .lerp(shell(0.011, sz * 72 * DEG, 0.0035), j / 3) : shell(0.011, sz * lerp(72, 180, (j - 3) / 11) * DEG, 0.0035));
      add(tube(st, v3(0, 1, 0), () => squircleLoop(0.0016, 0.0125, 4, 12)), M.strap, head, false);
    } }
  // oxygen mask: a rubber cup over nose and mouth, a valve on its front, straps back to the helmet, the ribbed hose
  { const mc = v3(0.094, -0.058, 0), rings = [];
    for (const [u, a, b, dy] of [[-0.006, 0.050, 0.060, 0.004], [0.006, 0.050, 0.060, 0.002], [0.022, 0.045, 0.053, -0.002], [0.036, 0.036, 0.042, -0.006], [0.046, 0.026, 0.030, -0.009], [0.050, 0.020, 0.023, -0.010]]) {
      const r = []; for (let j = 0; j <= 40; j++) { const t = 2 * Math.PI * j / 40, c = Math.cos(t), s = Math.sin(t), e = 2 / 2.6; r.push(v3(mc.x + u - 0.016 * Math.pow(Math.abs(c), 2), mc.y + dy + b * Math.sign(s) * Math.pow(Math.abs(s), e), a * Math.sign(c) * Math.pow(Math.abs(c), e))); } r[40] = r[0].clone(); rings.push(r);
    }
    add(loft(rings, { capEnd: true }), M.rubber, head);
    add(new THREE.CylinderGeometry(0.0125, 0.0135, 0.012, 24).rotateZ(Math.PI / 2).translate(mc.x + 0.055, mc.y - 0.012, 0), M.alu, head);
    for (const sz of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.007, 0.007, 0.006, 16).rotateX(Math.PI / 2).translate(mc.x + 0.018, mc.y + 0.004, sz * 0.047), M.alu, head, false);
      const sp = [v3(mc.x + 0.018, mc.y + 0.004, sz * 0.049)]; for (let j = 1; j <= 6; j++) sp.push(shell(lerp(-0.045, -0.03, j / 6), sz * lerp(62, 92, j / 6) * DEG, 0.005));
      add(tube(sp, v3(0, 1, 0), () => squircleLoop(0.0014, 0.009, 4, 10)), M.web, head, false);
    }
    const hp = new THREE.CatmullRomCurve3([v3(mc.x + 0.02, mc.y - 0.05, 0.0), v3(mc.x + 0.012, mc.y - 0.10, -0.012), v3(mc.x - 0.012, mc.y - 0.17, -0.04), v3(mc.x - 0.03, mc.y - 0.25, -0.075), v3(mc.x - 0.02, mc.y - 0.33, -0.10)], false, 'centripetal').getPoints(90);
    add(tube(hp, v3(0, 0, 1), (i) => { const r = 0.0155 + 0.0026 * Math.sin(i * 1.9); return ellipseLoop(r, r, 14); }), M.hose, head);
    add(tube([shell(RIM + 0.004, 78 * DEG, 0.002), v3(0.06, -0.128, 0.05), v3(0.068, -0.134, 0), v3(0.06, -0.128, -0.05), shell(RIM + 0.004, -78 * DEG, 0.002)], v3(1, 0, 0), () => squircleLoop(0.0016, 0.008, 4, 10)), M.leather, head, false);      // chin strap
  }

  /* ================================================================ torso: flight suit, scarf, parachute harness */
  const spX = curve([[0, -2.005], [0.35, -2.04], [0.7, -2.072], [1, -2.085]]), spY = curve([[0, 1.135], [0.35, 1.27], [0.7, 1.41], [1, 1.515]]);
  const wA = curve([[0, 0.158], [0.35, 0.146], [0.7, 0.172], [0.9, 0.188], [1, 0.190]]), wF = curve([[0, 0.105], [0.35, 0.098], [0.7, 0.108], [0.9, 0.098], [1, 0.078]]), wB = curve([[0, 0.092], [0.35, 0.086], [0.7, 0.092], [1, 0.072]]);
  const NT = 2.6;
  const frame = (t) => { const a = clamp(t - 0.01, 0, 1), b = clamp(t + 0.01, 0, 1); let dx = spX(b) - spX(a), dy = spY(b) - spY(a); const l = Math.hypot(dx, dy); dx /= l; dy /= l; return { p: v3(spX(t), spY(t), 0), d: v3(dx, dy, 0), f: v3(dy, -dx, 0) }; };
  const chest = (t, z, off = 0) => { const fr = frame(t), k = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(z) / wA(t)), NT)), 1 / NT); return fr.p.addScaledVector(fr.f, wF(t) * k + off).setZ(z); };
  const tRing = (c, f, a, bF, bB) => { const r = []; for (let j = 0; j <= 56; j++) { const ph = 2 * Math.PI * j / 56, cs = Math.cos(ph), sn = Math.sin(ph), e = 2 / NT; r.push(c.clone().addScaledVector(f, (cs >= 0 ? bF : bB) * Math.sign(cs) * Math.pow(Math.abs(cs), e)).setZ(a * Math.sign(sn) * Math.pow(Math.abs(sn), e))); } r[56] = r[0].clone(); return r; };
  { const tr = []; for (const t of range(0, 1, 0.04)) { const fr = frame(t); tr.push(tRing(fr.p, fr.f, wA(t), wF(t), wB(t))); }
    const fr = frame(1); for (const u of [0.3, 0.6, 0.85, 1]) tr.push(tRing(fr.p.clone().addScaledVector(fr.d, 0.05 * u), fr.f, 0.19 * lerp(1, 0.4, Math.pow(u, 1.6)), 0.078 * lerp(1, 0.86, u), 0.072 * lerp(1, 0.86, u)));
    add(loft(tr, { capStart: true, capEnd: true }), M.suit);
    const top = fr.p.clone().addScaledVector(fr.d, 0.05);
    add(along(new THREE.TorusGeometry(0.066, 0.013, 12, 36).rotateX(Math.PI / 2), fr.d, top), M.suit);                             // collar
    const sc = []; for (let j = 0; j < 40; j++) { const a = 2 * Math.PI * j / 40; sc.push(top.clone().addScaledVector(fr.d, 0.028 + 0.006 * Math.sin(a * 3)).add(v3(0.058 * Math.cos(a), 0, 0.064 * Math.sin(a)))); }
    add(tube(sc, v3(0, 1, 0), (i) => ellipseLoop(0.013 + 0.003 * Math.sin(i * 1.3), 0.017, 12), { closedPath: true }), M.scarf);  // scarf, bunched at the throat
    add(tube([chest(0.92, 0, 0.004), chest(0.82, 0.012, 0.012), chest(0.7, 0.02, 0.012)], frame(0.8).f, () => squircleLoop(0.03, 0.006, 3, 14)), M.scarf);
    // harness: two straps over the shoulders to the quick-release box, two from the box down to the lap, the box itself
    const strapOn = (pts, hints, w) => add(tube(pts, (i) => hints[i], () => squircleLoop(w, 0.0024, 4, 12)), M.web, g, false);
    for (const sz of [-1, 1]) {
      const pts = [v3(spX(1) - 0.075, spY(1) + 0.012, sz * 0.105), v3(spX(1) - 0.02, spY(1) + 0.058, sz * 0.105)], hints = [v3(-0.4, 1, 0), v3(0.3, 1, 0)];
      for (const t of range(1.0, 0.44, -0.04)) { const tt = clamp(t, 0, 1), z = sz * lerp(0.03, 0.105, smooth(0.46, 0.86, tt)); pts.push(chest(tt, z, lerp(0.006, 0.013, smooth(0.7, 0.8, tt)))); hints.push(frame(tt).f); }
      strapOn(pts, hints, 0.023);
      const low = [], lh = []; for (const t of range(0.42, 0.04, -0.04)) { low.push(chest(t, sz * lerp(0.03, 0.115, smooth(0.42, 0.06, t)), 0.006)); lh.push(frame(t).f); }
      strapOn(low, lh, 0.023);
    }
    const fb = frame(0.43), bp = chest(0.43, 0, 0.012);
    add(along(new THREE.CylinderGeometry(0.034, 0.034, 0.016, 32), fb.f, bp), M.alu, g, false);
    add(along(new THREE.CylinderGeometry(0.017, 0.019, 0.022, 24), fb.f, bp), M.red, g, false); }

  /* ================================================================ arms, hands, legs */
  const limb = (pa, pb, ra, rb, mat, bow = v3(), n = 10) => {
    const pts = []; for (let i = 0; i <= n; i++) { const f = i / n; pts.push(pa.clone().lerp(pb, f).addScaledVector(bow, Math.sin(Math.PI * f))); }
    const d = pb.clone().sub(pa).normalize(), hint = Math.abs(d.z) > 0.8 ? v3(0, 1, 0) : v3(0, 0, 1);
    return add(tube(pts, hint, (i, f) => ellipseLoop(lerp(ra, rb, f), lerp(ra, rb, f), 20)), mat);
  };
  const GRIP = {
    // right hand on the stick: the grip leans a little forward; knuckles forward and outboard, thumb over the top
    1: { G: P(1.792, 0, 1.372), axis: v3(0.28, 0.96, 0), out: v3(0.72, 0, 0.69), E: P(1.985, 0.255, 1.275), thumb: v3(-0.016, 0.060, -0.012), barR: 0.0185 },
    // left hand on the throttle: palm down on the handle, knuckles up and forward, thumb underneath
    [-1]: { G: P(1.712, -0.240, 1.392), axis: v3(0, 0, 1), out: v3(0.55, 0.83, 0), E: P(1.955, -0.275, 1.30), thumb: v3(-0.034, -0.012, 0.03), barR: 0.019 },
  };
  for (const sz of [1, -1]) {
    const K = GRIP[sz], S = P(2.085, sz * 0.196, 1.498), E = K.E;
    add(new THREE.SphereGeometry(0.058, 24, 16).scale(1, 0.94, 1).translate(S.x, S.y, S.z), M.suit);
    limb(S, E, 0.052, 0.044, M.suit, v3(0, -0.01, sz * 0.008));
    add(new THREE.SphereGeometry(0.045, 20, 14).translate(E.x, E.y, E.z), M.suit);
    let W = null, fd = null;
    if (hands) {
      try {
        const H = buildGripHand(sz > 0 ? hands.R : hands.L, { oblique: 14, G: K.G, axis: K.axis.clone().normalize(), out: K.out.clone().normalize(), elbow: E, thumbTip: K.G.clone().add(K.thumb), barR: K.barR });
        add(H.geometry, M.glove);
        const st = H.stub, A = (st.l[1] - st.l[0]) / 2, B = (st.n[1] - st.n[0]) / 2;
        W = H.wrist.clone().addScaledVector(H.across, (st.l[0] + st.l[1]) / 2).addScaledVector(H.palmN, (st.n[0] + st.n[1]) / 2); fd = W.clone().sub(E).normalize();
        const oval = (t0, t1, a0, b0, a1, b1, mat, n = 10) => { const pts = []; for (let i = 0; i <= n; i++) pts.push(W.clone().addScaledVector(fd, lerp(t0, t1, i / n))); return add(tube(pts, H.palmN, (i, f) => { const k = smooth(0, 1, f); return ellipseLoop(lerp(a0, a1, k), lerp(b0, b1, k), 28); }), mat); };
        limb(E, W.clone().addScaledVector(fd, -0.07), 0.045, 0.032, M.suit);                               // sleeve down towards the wrist
        oval(-0.115, -0.012, 0.044, 0.041, A + 0.003, B + 0.003, M.cuff, 14);                              // gauntlet cuff of the glove, over the sleeve
        oval(-0.0125, -0.002, A + 0.003, B + 0.003, A + 0.0016, B + 0.002, M.cuff, 5);
        oval(-0.058, -0.044, 0.0375, 0.035, 0.036, 0.0335, M.leather, 4);                                  // wrist strap
      } catch (e) { console.warn('pilot hand', e.message || e); W = null; }
    }
    if (!W) { W = K.G.clone().addScaledVector(K.out.clone().normalize(), 0.03); limb(E, W, 0.045, 0.034, M.suit); add(new THREE.SphereGeometry(0.042, 20, 14).scale(1, 0.8, 1).translate(W.x, W.y, W.z), M.glove); }
    // legs: thigh to the knee, shin down to the rudder pedal, boot
    const hip = P(2.0, sz * 0.092, 1.165), knee = P(1.56, sz * 0.118, 1.285), ank = P(1.19, sz * 0.115, 1.115), toe = P(1.085, sz * 0.115, 1.115);
    limb(hip, knee, 0.078, 0.06, M.suit, v3(0, 0.012, 0));
    add(new THREE.SphereGeometry(0.061, 20, 14).translate(knee.x, knee.y, knee.z), M.suit);
    limb(knee, ank, 0.056, 0.043, M.suit);
    limb(ank.clone().add(v3(-0.03, 0.05, 0)), ank.clone().add(v3(0.0, -0.035, 0)), 0.045, 0.043, M.boot);
    add(tube([ank.clone().add(v3(-0.045, -0.052, 0)), ank.clone().add(v3(0.03, -0.05, 0)), toe.clone().add(v3(0.02, -0.03, 0))], v3(0, 1, 0), (i, f) => squircleLoop(0.043 - 0.006 * f, 0.03 - 0.004 * f, 3, 16)), M.boot);
  }
  root.userData.head = head;
  root.userData.materials = Object.values(M);
  return root;
}
