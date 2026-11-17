// Driver: helmet with visor, HANS device, race suit, arms on the wheel, gloves, harness.
// World units are metres; x forward, y up, z to the car's right.
import * as THREE from 'three';
import { v3, clamp, lerp, smooth, DEG, curve, range, loft, tube, rod, ellipseLoop, squircleLoop, projectDecal, DRIVE_BTN } from './geo.js';
import * as TX from './tex.js';
import { buildGripHand } from './hands.js';

// The right thumb's two extra poses, as where its tip goes in the steering wheel's own frame: held above the button,
// then down on it. The tip passes 6 mm beyond the button's axis so that the pad, not the nail, lands on the cap.
const PRESS = (lift) => v3(DRIVE_BTN.x + 0.0005, DRIVE_BTN.y + 0.006, DRIVE_BTN.top - DRIVE_BTN.travel + 0.0085 + lift);

export function buildDriver(M, o) {
  const X = o.X, g = new THREE.Group(); g.name = 'driver';
  const add = (geo, mat, parent = g, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
  const along = (geo, n, pos) => { geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), n)); geo.translate(pos.x, pos.y, pos.z); return geo; };

  // ================================================================ helmet (local: x forward, y up)
  const helmet = new THREE.Group(); helmet.position.set(X(1.585), 0.716, 0); helmet.rotation.z = -0.05; g.add(helmet);
  const HT = 0.137;
  const lowF = curve([[-0.125, 0.112], [-0.10, 0.138], [-0.06, 0.151], [-0.02, 0.149], [0, 0.146]]);
  const lowR = curve([[-0.125, 0.082], [-0.10, 0.104], [-0.06, 0.122], [-0.02, 0.132], [0, 0.136]]);
  const lowW = curve([[-0.125, 0.096], [-0.10, 0.112], [-0.06, 0.122], [-0.02, 0.127], [0, 0.128]]);
  const dims = (y) => { if (y < 0) return [lowF(y), lowR(y), lowW(y)]; const k = Math.pow(Math.max(0, 1 - Math.pow(y / HT, 2.3)), 1 / 2.3); return [0.146 * k, 0.136 * k, 0.128 * k]; };
  const shell0 = (y, phi) => {
    const [F, R, W] = dims(y), c = Math.cos(phi), s = Math.sin(phi), e = 2 / (c >= 0 ? lerp(2.35, 2.0, smooth(0.03, 0.12, y)) : 2.0);
    return v3((c >= 0 ? F : R) * Math.sign(c) * Math.pow(Math.abs(c), e), y, W * Math.sign(s) * Math.pow(Math.abs(s), e));
  };
  const shellN = (y, phi) => { const d = 0.004, yy = clamp(y, -0.12, HT - 0.008); return shell0(yy + d, phi).sub(shell0(yy - d, phi)).cross(shell0(yy, phi + d).sub(shell0(yy, phi - d))).normalize(); };
  const shell = (y, phi, off = 0) => { const p = shell0(y, phi); return off ? p.addScaledVector(shellN(y, phi), off) : p; };

  const ys = [...range(-0.125, 0, 0.125 / 14)]; for (let k = 1; k <= 24; k++) ys.push(HT * Math.sin(k / 24 * Math.PI / 2));
  const NS = 96, hr = ys.map((y) => { const r = []; for (let j = 0; j <= NS; j++) r.push(shell0(y, 2 * Math.PI * j / NS)); r[NS] = r[0].clone(); return r; });
  const hMask = (x, y, z, out) => {
    const E = 0.0011, sd = (d) => clamp(0.5 + d / (2 * E), 0, 1), az = Math.abs(z), yl = -0.052 + 0.27 * x;
    out[2] = sd(Math.max(yl - 0.006 - y, 0.017 - az));
    out[0] = sd(Math.max(0.006 - Math.abs(y - yl), Math.min(0.026 - az, az - 0.017)));
    // black: lower rim, and a band that frames the eye-port and runs back to the visor pivots
    out[1] = sd(Math.max(-0.097 - y, Math.min(Math.min(y + 0.034, 0.083 - y), x + 0.03)));
  };
  const gShell = loft(hr, { capStart: true, capMatStart: 1 });
  add(gShell, [M.livery(TX.liveryMask(hr, hMask, 1024, 512)), M.foam], helmet);

  // eye-port: rubber gasket, mirrored visor, sun strip
  const VY0 = -0.018, VY1 = 0.07, VPH = 90 * DEG, vyc = (VY0 + VY1) / 2, vh = (VY1 - VY0) / 2, TAB = 0.36, FLAT = 52 * DEG;
  // flat top and bottom edges at the front, tapering back to a short tab at each pivot
  const pmax = (Y, grow) => { const a = Math.abs(Y), base = a <= TAB ? VPH : lerp(VPH, FLAT, Math.pow((a - TAB) / (1 - TAB), 1.4)); return (base + grow * 7) * Math.pow(Math.max(0, 1 - Math.pow(a, 8)), 0.125); };
  const patch = (y0, y1, grow, off, rows, uvFn) => {
    const rings = [];
    for (let i = 0; i <= rows; i++) {
      const y = lerp(y0, y1, 0.5 - 0.5 * Math.cos(Math.PI * i / rows));
      const Y = clamp((y - vyc) / (vh + grow), -0.985, 0.985), pm = pmax(Y, grow);
      const r = []; for (let j = 0; j <= 64; j++) r.push(shell(y, lerp(-pm, pm, j / 64), off)); rings.push(r);
    }
    return loft(rings, { facing: v3(1, 0, 0), uvFn });
  };
  add(patch(VY0 - 0.005, VY1 + 0.005, 0.005, 0.0012, 26), M.black, helmet, false);
  add(patch(VY0, VY1, 0, 0.0034, 28), M.visor, helmet, false);
  add(patch(0.046, VY1 - 0.0006, 0, 0.0042, 8, (i, j, p) => [0.5 - Math.atan2(p.z / 0.128, p.x / 0.146) / (2 * VPH), (p.y - 0.046) / (VY1 - 0.046)]), M.visorStrip, helmet, false);

  // trim, pivots, vents, spoiler, tether posts
  { const rim = []; for (let j = 0; j < 64; j++) rim.push(shell(-0.1235, 2 * Math.PI * j / 64, 0.001));
    add(tube(rim, v3(0, 1, 0), () => ellipseLoop(0.0065, 0.0065, 10), { closedPath: true }), M.black, helmet);
    const sp = []; for (let a = 112; a <= 248; a += 4) sp.push(shell(0.066, a * DEG, 0.005));
    add(tube(sp, v3(0, 1, 0), (i, f) => squircleLoop(0.008 * Math.sin(Math.PI * clamp(f, 0.04, 0.96)) + 0.002, 0.0022, 3, 12)), M.gloss, helmet);
    for (const sz of [-1, 1]) {
      const pv = 90 * DEG * sz, n = shellN(vyc, pv);
      add(along(new THREE.CylinderGeometry(0.0115, 0.0125, 0.004, 24), n, shell(vyc, pv, 0.0052)), M.gloss, helmet, false);
      const tp = 128 * DEG * sz;
      add(along(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 12), shellN(-0.052, tp), shell(-0.052, tp, 0.003)), M.gloss, helmet, false);
    } }
  { const d27 = TX.textDecal('27', { px: 200 });
    for (const sz of [-1, 1]) { const ph = 118 * DEG * sz, m = new THREE.Mesh(projectDecal([gShell], shell(0.04, ph), shellN(0.04, ph), v3(0, 1, 0), 0.075, 0.075 / d27.aspect, 0.06), M.decal(d27.map)); m.renderOrder = 2; helmet.add(m); } }

  // ================================================================ torso
  const spS = curve([[0, 1.34], [0.33, 1.42], [0.7, 1.535], [1, 1.625]]), spY = curve([[0, 0.215], [0.33, 0.295], [0.7, 0.425], [1, 0.535]]);
  const wA = curve([[0, 0.165], [0.33, 0.150], [0.7, 0.180], [0.9, 0.196], [1, 0.200]]);
  const wF = curve([[0, 0.100], [0.33, 0.095], [0.7, 0.108], [0.9, 0.098], [1, 0.076]]);
  const wB = curve([[0, 0.090], [0.33, 0.085], [0.7, 0.090], [1, 0.070]]);
  const NT = 2.6;
  const frame = (t) => {
    const a = clamp(t - 0.01, 0, 1), b = clamp(t + 0.01, 0, 1); let dx = X(spS(b)) - X(spS(a)), dy = spY(b) - spY(a); const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    return { p: v3(X(spS(t)), spY(t), 0), d: v3(dx, dy, 0), f: v3(dy, -dx, 0) };
  };
  const chest = (t, z, off = 0) => { const fr = frame(t), k = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(z) / wA(t)), NT)), 1 / NT); return fr.p.addScaledVector(fr.f, wF(t) * k + off).setZ(z); };
  const tr = [];
  const tRing = (c, f, a, bF, bB) => { const r = []; for (let j = 0; j <= 56; j++) { const ph = 2 * Math.PI * j / 56, cs = Math.cos(ph), sn = Math.sin(ph), e = 2 / NT; r.push(c.clone().addScaledVector(f, (cs >= 0 ? bF : bB) * Math.sign(cs) * Math.pow(Math.abs(cs), e)).setZ(a * Math.sign(sn) * Math.pow(Math.abs(sn), e))); } r[56] = r[0].clone(); return r; };
  for (const t of range(0, 1, 0.04)) { const fr = frame(t); tr.push(tRing(fr.p, fr.f, wA(t), wF(t), wB(t))); }
  { const fr = frame(1); for (const u of [0.3, 0.6, 0.85, 1]) tr.push(tRing(fr.p.clone().addScaledVector(fr.d, 0.05 * u), fr.f, 0.2 * lerp(1, 0.4, Math.pow(u, 1.6)), 0.076 * lerp(1, 0.86, u), 0.07 * lerp(1, 0.86, u))); }
  const gTorso = loft(tr, { capStart: true, capEnd: true });
  add(gTorso, M.suit);
  { const fr = frame(1), top = fr.p.clone().addScaledVector(fr.d, 0.052);
    add(along(new THREE.TorusGeometry(0.068, 0.014, 12, 36).rotateX(Math.PI / 2), fr.d, top), M.suit);
    add(rod(top.clone().addScaledVector(fr.d, -0.02), v3(X(1.588), 0.63, 0), 0.057, 24), M.balaclava);
    const word = TX.textDecal('PHANTOM', { px: 160, spacing: '6px' }), f78 = frame(0.8);
    const m = new THREE.Mesh(projectDecal([gTorso], chest(0.8, 0), f78.f, f78.d, 0.25, 0.25 / word.aspect, 0.1), M.suitDecal(word.map)); m.renderOrder = 2; g.add(m); }

  // ================================================================ arms, legs, hands
  const limb = (pa, pb, ra, rb, mat, bow = v3(), n = 10) => {
    const pts = []; for (let i = 0; i <= n; i++) { const f = i / n; pts.push(pa.clone().lerp(pb, f).addScaledVector(bow, Math.sin(Math.PI * f))); }
    const d = pb.clone().sub(pa).normalize(), hint = Math.abs(d.z) > 0.8 ? v3(0, 1, 0) : v3(0, 0, 1);
    return add(tube(pts, hint, (i, f) => ellipseLoop(lerp(ra, rb, f), lerp(ra, rb, f), 20)), mat, armG);
  };
  let armG = g;
  const gloveWord = TX.textDecal('PHANTOM', { px: 120, spacing: '5px' });
  const sw = o.sw; sw.updateMatrixWorld(true);
  // Gloved hand from the hand mesh, wrapped round the grip in the wheel's own frame (x right, y up the wheel, z towards the driver).
  const meshHand = (sx, E, ho) => {
    const roll = (ho.roll ?? -35) * DEG, lean = (ho.lean ?? 0) * DEG;
    const H = buildGripHand(sx > 0 ? o.hands.R : o.hands.L, {
      oblique: 16, ...ho, G: v3(sx * (ho.gx ?? 0.1335), ho.gy ?? -0.012, ho.gz ?? 0.004), axis: v3(-sx * Math.sin(lean), Math.cos(lean), 0),
      out: v3(sx * Math.cos(roll), 0, Math.sin(roll)), elbow: E.clone().applyMatrix4(sw.matrixWorld.clone().invert()),
      thumbTip: v3(sx * (ho.tx ?? 0.099), ho.ty ?? 0.04, ho.tz ?? 0.024), planes: [{ p: v3(0, 0, 0.0114), n: v3(0, 0, 1) }],      // thumb rests on the top of the grip, clear of the wheel face
      // right hand: a second thumb pose, its pad on the button above the grip (BTN in car.js); the film blends between the two
      alts: sx > 0 ? [{ thumbTip: PRESS(0.020) }, { thumbTip: PRESS(0.0027) }] : null,      // (tuned so the pad stops 2.2 mm into the cap's 2.6 mm of travel)
    });
    H.geometry.applyMatrix4(sw.matrixWorld);
    const mp = H.geometry.morphAttributes;
    if (mp.position) { const nm = new THREE.Matrix3().getNormalMatrix(sw.matrixWorld); for (const a of mp.position) a.applyMatrix4(sw.matrixWorld); for (const a of mp.normal) a.applyNormalMatrix(nm); }
    const m = new THREE.Mesh(H.geometry, M.gloveHand); m.castShadow = true; m.receiveShadow = true; m.name = sx > 0 ? 'handR' : 'hand'; armG.add(m);
    if (mp.position) { m.morphTargetInfluences = mp.position.map(() => 0); m.userData.thumb = H.thumb; }
    H.wrist.applyMatrix4(sw.matrixWorld); H.backC.applyMatrix4(sw.matrixWorld);
    for (const d of [H.palmN, H.across, H.backN, H.fingers]) d.transformDirection(sw.matrixWorld);
    const dm = new THREE.Mesh(projectDecal([H.geometry], H.backC, H.backN, H.fingers, 0.058, 0.058 / gloveWord.aspect, 0.03, 0.0005), M.gloveDecal(gloveWord.map)); dm.renderOrder = 2; armG.add(dm);
    return H;
  };
  // Stand-in hand made of tubes, used only if the hand meshes did not load.
  const hand = (sx) => {
    const parts = [], G = v3(sx * 0.133, -0.006, 0.003), dir = (a) => v3(sx * Math.cos(a), 0, Math.sin(a));
    const gripR = 0.019, a0 = 38 * DEG, tip = (f, at) => (f > at ? Math.sqrt(Math.max(0.06, 1 - Math.pow((f - at) / (1 - at), 2) * 0.8)) : 1);
    // four fingers, each curling from its knuckle round the front of the grip
    [[0.030, 0.0098, -188], [0.0085, 0.0102, -196], [-0.0125, 0.0096, -188], [-0.033, 0.0086, -172]].forEach(([y, r, a1]) => {
      const rc = gripR + r * 0.92, pts = [], rr = [];
      for (let i = 0; i <= 28; i++) { const f = i / 28; pts.push(G.clone().add(v3(0, y, 0)).addScaledVector(dir(lerp(a0, a1 * DEG, f)), rc + 0.011 * Math.pow(1 - f, 3))); rr.push(r * tip(f, 0.88)); }
      parts.push([tube(pts, v3(0, 1, 0), (i) => ellipseLoop(rr[i], rr[i] * 1.05, 14)), M.glove]);
      const kn = new THREE.SphereGeometry(r * 1.12, 14, 10), kp = G.clone().add(v3(0, y, 0)).addScaledVector(dir(a0 + 0.1), rc + 0.0105); kn.translate(kp.x, kp.y, kp.z); parts.push([kn, M.glove]);
    });
    // body of the hand from the wrist to the knuckles: a full, rounded volume, not a flat strap
    const wr = G.clone().addScaledVector(dir(78 * DEG), 0.118).add(v3(0, -0.02, 0)), kc = G.clone().addScaledVector(dir(a0 + 0.1), gripR + 0.0185).add(v3(0, -0.002, 0));
    const bp = [], sp = [], bt = [], bb = [];
    const dx = kc.x - wr.x, dz = kc.z - wr.z, dl = Math.hypot(dx, dz), mid = wr.clone().lerp(kc, 0.5);
    let nOut = v3(-dz / dl, 0, dx / dl); if (nOut.dot(v3(mid.x - G.x, 0, mid.z - G.z)) < 0) nOut.negate();
    for (let i = 0; i <= 12; i++) {
      const f = i / 12, p = wr.clone().lerp(kc, f).addScaledVector(nOut, 0.006 * Math.sin(Math.PI * f));
      bp.push(p); bt.push(lerp(0.0205, 0.0155, f)); bb.push(lerp(0.031, 0.0455, Math.pow(f, 0.8)));
      if (i >= 2 && i <= 10) sp.push(p.clone().addScaledVector(nOut, bt[i] + 0.0006).add(v3(0, 0.004, 0)));
    }
    parts.push([tube(bp, v3(0, 1, 0), (i) => squircleLoop(bt[i], bb[i], 2.3, 26)), M.glove]);
    parts.push([tube(sp, v3(0, 1, 0), () => squircleLoop(0.0012, 0.0075, 3, 10)), M.cuff]);
    // thumb: grows out of the hand body, thick at its root (no separate pad), and lies along the rear face of the grip
    const tb = bp[7].clone().add(v3(0, bb[7] * 0.5, 0)); tb.lerp(v3(G.x, tb.y, G.z), 0.22);
    const tp = new THREE.CatmullRomCurve3([tb, G.clone().addScaledVector(dir(106 * DEG), 0.03).add(v3(0, 0.031, 0)), G.clone().add(v3(-sx * 0.012, 0.044, 0.027)), G.clone().add(v3(-sx * 0.037, 0.055, 0.021))], false, 'centripetal').getPoints(22);
    parts.push([tube(tp, v3(0, 0, 1), (i, f) => { const r = lerp(0.0172, 0.0105, Math.pow(f, 0.7)) * tip(f, 0.86); return ellipseLoop(r, r, 16); }), M.glove]);
    for (const [geo, mat] of parts) { geo.applyMatrix4(sw.matrixWorld); add(geo, mat, armG); }
    return wr.applyMatrix4(sw.matrixWorld);
  };
  const buildArms = (ho = {}) => {
    armG = new THREE.Group(); armG.name = 'arms'; g.add(armG);
    const info = [];
    for (const sz of [-1, 1]) {
      const S = v3(X(1.625), 0.532, sz * 0.176), E = v3(X(1.335), 0.415, sz * 0.178);
      const sh = new THREE.SphereGeometry(0.061, 24, 16); sh.scale(1, 0.94, 1); sh.translate(S.x, S.y, S.z); add(sh, M.sleeve, armG);
      limb(S, E, 0.054, 0.046, M.sleeve, v3(0, -0.012, sz * 0.006));
      const el = new THREE.SphereGeometry(0.047, 20, 14); el.translate(E.x, E.y, E.z); add(el, M.sleeve, armG);
      if (o.hands) {
        const H = meshHand(sz, E, ho), st = H.stub, A = (st.l[1] - st.l[0]) / 2, B = (st.n[1] - st.n[0]) / 2;
        const W = H.wrist.clone().addScaledVector(H.across, (st.l[0] + st.l[1]) / 2).addScaledVector(H.palmN, (st.n[0] + st.n[1]) / 2), fd = W.clone().sub(E).normalize();
        const oval = (t0, t1, a0, b0, a1, b1, mat, n = 10) => {
          const pts = []; for (let i = 0; i <= n; i++) pts.push(W.clone().addScaledVector(fd, lerp(t0, t1, i / n)));
          return add(tube(pts, H.palmN, (i, f) => { const k = smooth(0, 1, f); return ellipseLoop(lerp(a0, a1, k), lerp(b0, b1, k), 28); }), mat, armG);
        };
        limb(E, W.clone().addScaledVector(fd, -0.058), 0.047, 0.03, M.sleeve);                                                // sleeve down towards the wrist
        const g0 = -0.086, g1 = -0.014, ga = (t) => { const k = smooth(0, 1, (t - g0) / (g1 - g0)); return [lerp(0.039, A + 0.003, k), lerp(0.0365, B + 0.003, k)]; };
        const band = (t0, t1, d, mat) => { const [a0, b0] = ga(t0), [a1, b1] = ga(t1); return oval(t0, t1, a0 + d, b0 + d, a1 + d, b1 + d, mat, 4); };
        oval(g0, g1, 0.039, 0.0365, A + 0.003, B + 0.003, M.glove, 14);                                                       // gauntlet in dark knit, lightly flared over the sleeve
        oval(g1 - 0.0005, -0.003, A + 0.003, B + 0.003, A + 0.0018, B + 0.0022, M.glove, 5);                                   // rolled in at the wrist
        band(-0.052, -0.034, 0.0014, M.cuff);                                                                                  // closure strap in the glove colour
        band(-0.0875, -0.0805, 0.001, M.cuff);                                                                                 // hem
        info.push({ side: sz, bend: H.bend, angles: H.angles, thumb: H.thumb, stub: st, tris: H.tris });
      } else {
        const W = hand(sz), fd = W.clone().sub(E).normalize();
        limb(E, W.clone().addScaledVector(fd, -0.04), 0.047, 0.031, M.sleeve);                                               // sleeve down to the wrist
        limb(W.clone().addScaledVector(fd, -0.082), W.clone().addScaledVector(fd, -0.004), 0.0385, 0.034, M.glove);           // gauntlet, flared over the sleeve
        limb(W.clone().addScaledVector(fd, -0.006), W.clone().addScaledVector(fd, 0.024), 0.034, 0.0265, M.glove);            // tapering in to the wrist
        limb(W.clone().addScaledVector(fd, -0.05), W.clone().addScaledVector(fd, -0.036), 0.0372, 0.0364, M.cuff);            // closure strap in the accent colour
      }
      limb(v3(X(1.33), 0.25, sz * 0.09), v3(X(1.03), 0.40, sz * 0.075), 0.074, 0.058, M.suit);
    }
    const grp = armG; armG = g;
    return { grp, info };
  };
  let arms = buildArms(o.handPose || {});
  g.userData.handInfo = arms.info;
  g.userData.rehand = (ho) => { arms.grp.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); g.remove(arms.grp); arms = buildArms(ho || {}); g.userData.handInfo = arms.info; return arms.info; };

  // ================================================================ HANS device
  { const cx = X(1.60), path = [], hh = [];
    for (let b = -84; b <= 84; b += 6) { const k = Math.abs(b) / 84; path.push(v3(cx - 0.129 * Math.cos(b * DEG), 0.588 - 0.022 * k * k, 0.129 * Math.sin(b * DEG))); hh.push(lerp(0.054, 0.03, k * k)); }
    add(tube(path, v3(0, 1, 0), (i) => squircleLoop(0.0055, hh[i], 4, 16)), M.carbonGloss);
    for (const sz of [-1, 1]) {
      const pts = [v3(cx - 0.02, 0.572, sz * 0.118)]; for (const t of range(1.0, 0.7, -0.05)) pts.push(chest(t, sz * 0.08, 0.008));
      add(tube(pts, (i) => frame(clamp(1.05 - i * 0.05, 0.7, 1)).f, () => squircleLoop(0.026, 0.0058, 4, 14)), M.carbonGloss);
      const post = shell(-0.052, 128 * DEG * sz, 0.006).applyMatrix4(helmet.updateMatrixWorld() || helmet.matrixWorld);
      add(rod(post, v3(cx - 0.105, 0.628, sz * 0.085), 0.0035, 8), M.belt, g, false);
    } }

  // ================================================================ harness over the driver
  { const strap = (pts, hints, w) => add(tube(pts, (i) => hints[i], () => squircleLoop(w, 0.0022, 4, 12)), M.belt, g, false);
    for (const sz of [-1, 1]) {
      const pts = [v3(X(1.745), 0.548, sz * 0.078), v3(X(1.70), 0.59, sz * 0.078)], hints = [v3(0.3, 1, 0), v3(0.5, 1, 0)];
      for (const t of range(1.02, 0.24, -0.04)) { const tt = clamp(t, 0, 1), z = sz * lerp(0.022, 0.078, smooth(0.26, 0.62, tt)); pts.push(chest(tt, z, lerp(0.005, 0.017, smooth(0.66, 0.74, tt)))); hints.push(frame(tt).f); }
      strap(pts, hints, 0.026);
      const lap = [], lh = []; for (const z of range(0.035, 0.15, 0.0165)) { lap.push(chest(0.2 - 0.25 * (z - 0.035), sz * z, 0.005)); lh.push(frame(0.2).f); }
      strap(lap, lh, 0.023);
    }
    const fb = frame(0.215), bp = chest(0.215, 0, 0.011);
    add(along(new THREE.CylinderGeometry(0.031, 0.031, 0.012, 28), fb.f, bp), M.alu, g, false);
    add(along(new THREE.CylinderGeometry(0.015, 0.015, 0.016, 20), fb.f, bp), M.accent, g, false);
  }
  return g;
}
