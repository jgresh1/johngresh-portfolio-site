// Gloved hands built on the WebXR "generic-hand" meshes (MIT licence, see vendor/hands/LICENSE-webxr-input-profiles.md).
// The mesh is read with a small GLB reader, welded, smoothed by Loop subdivision (skin weights carried along),
// its fingers are wrapped round a straight bar with the mesh's own joints, and the result is frozen into plain geometry.
import * as THREE from 'three';
import { DETAIL } from './geo.js';

const DEG = Math.PI / 180, clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const GET = { 5120: ['getInt8', 1], 5121: ['getUint8', 1], 5122: ['getInt16', 2], 5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4] };
const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const V = () => new THREE.Vector3(), cross = (a, b) => new THREE.Vector3().crossVectors(a, b);

export async function loadHand(url) {
  const res = await fetch(url); if (!res.ok) throw new Error(`hand mesh ${url}: ${res.status}`);
  const buf = await res.arrayBuffer(), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB file');
  let off = 12, json = null, bin = null;
  while (off < dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true); off += 8;
    if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off, len)));
    else if (type === 0x004E4942) bin = new DataView(buf, off, len);
    off += len;
  }
  const read = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = COMPS[a.type], [fn, sz] = GET[a.componentType];
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || sz * n, out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = bin[fn](base + k * stride + c * sz, true);
    return out;
  };
  const node = json.nodes.find((n) => n.mesh !== undefined && n.skin !== undefined), prim = json.meshes[node.mesh].primitives[0], skin = json.skins[node.skin];
  // joint nodes sit flat under the armature, so their translations are already rest-pose positions in the mesh's space
  const joints = skin.joints.map((ni) => ({ name: json.nodes[ni].name, p: new THREE.Vector3().fromArray(json.nodes[ni].translation || [0, 0, 0]) }));
  return { pos: read(prim.attributes.POSITION), idx: read(prim.indices), vj: read(prim.attributes.JOINTS_0), vw: read(prim.attributes.WEIGHTS_0), joints };
}

function weld(h) {
  const nj = h.joints.length, map = new Map(), remap = new Int32Array(h.pos.length / 3), pos = [], w = [];
  for (let i = 0; i < remap.length; i++) {
    const x = h.pos[i * 3], y = h.pos[i * 3 + 1], z = h.pos[i * 3 + 2], key = `${Math.round(x * 2e5)},${Math.round(y * 2e5)},${Math.round(z * 2e5)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = pos.length / 3; map.set(key, id); pos.push(x, y, z);
      const row = new Float32Array(nj); let s = 0;
      for (let k = 0; k < 4; k++) { row[h.vj[i * 4 + k]] += h.vw[i * 4 + k]; s += h.vw[i * 4 + k]; }
      if (s > 0) for (let j = 0; j < nj; j++) row[j] /= s;
      w.push(row);
    }
    remap[i] = id;
  }
  const tris = [];
  for (let t = 0; t < h.idx.length; t += 3) { const a = remap[h.idx[t]], b = remap[h.idx[t + 1]], c = remap[h.idx[t + 2]]; if (a !== b && b !== c && a !== c) tris.push(a, b, c); }
  return { pos: Float64Array.from(pos), w, tris, nj };
}

function loop(m) {
  const { pos, w, tris, nj } = m, nv = pos.length / 3, edges = new Map(), nb = Array.from({ length: nv }, () => []);
  const ekey = (a, b) => (a < b ? a * nv + b : b * nv + a);
  for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = tris[t + k], b = tris[t + (k + 1) % 3], c = tris[t + (k + 2) % 3], key = ekey(a, b);
    let e = edges.get(key); if (!e) { e = { a, b, opp: [] }; edges.set(key, e); nb[a].push(e); nb[b].push(e); }
    e.opp.push(c);
  }
  const total = nv + edges.size, np = new Float64Array(total * 3), nw = new Array(total);
  const comb = (id, terms) => {
    const row = new Float32Array(nj); let x = 0, y = 0, z = 0;
    for (const [v, k] of terms) { x += pos[v * 3] * k; y += pos[v * 3 + 1] * k; z += pos[v * 3 + 2] * k; const r = w[v]; for (let j = 0; j < nj; j++) row[j] += r[j] * k; }
    np[id * 3] = x; np[id * 3 + 1] = y; np[id * 3 + 2] = z; nw[id] = row;
  };
  let id = nv;
  for (const e of edges.values()) { e.id = id; comb(id, e.opp.length === 2 ? [[e.a, 0.375], [e.b, 0.375], [e.opp[0], 0.125], [e.opp[1], 0.125]] : [[e.a, 0.5], [e.b, 0.5]]); id++; }
  for (let v = 0; v < nv; v++) {
    const es = nb[v], bnd = es.filter((e) => e.opp.length !== 2);
    if (bnd.length >= 2) comb(v, [[v, 0.75], ...bnd.slice(0, 2).map((e) => [e.a === v ? e.b : e.a, 0.125])]);
    else if (bnd.length === 1 || es.length < 3) comb(v, [[v, 1]]);
    else { const n = es.length, beta = n === 3 ? 3 / 16 : 3 / (8 * n); comb(v, [[v, 1 - n * beta], ...es.map((e) => [e.a === v ? e.b : e.a, beta])]); }
  }
  const nt = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2], ab = edges.get(ekey(a, b)).id, bc = edges.get(ekey(b, c)).id, ca = edges.get(ekey(c, a)).id;
    nt.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }
  return { pos: np, w: nw, tris: nt, nj };
}

function vertexNormals(pos, tris) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}

const cache = new WeakMap();
const smoothMesh = (raw, levels) => {
  let c = cache.get(raw); if (!c) { c = {}; cache.set(raw, c); }
  if (!c[levels]) { let m = weld(raw); for (let i = 0; i < levels; i++) m = loop(m); m.nBind = vertexNormals(m.pos, m.tris); c[levels] = m; }
  return c[levels];
};

// Wrap the hand round a straight bar and put it where the caller wants it.
//   o.G     where the bar centre under the middle finger goes        o.axis  bar direction, little finger towards index
//   o.out   direction from the bar centre to the knuckles            o.elbow elbow position (the wrist bends towards it)
//   o.barR  bar radius, o.fingerR half thickness of a gloved finger, o.back how far behind the knuckles the bar sits in the palm,
//   o.oblique degrees the bar is turned across the palm, o.glove glove thickness
export function buildGripHand(raw, o = {}) {
  const m = smoothMesh(raw, o.levels ?? DETAIL.hand);
  const J = Object.fromEntries(raw.joints.map((j, i) => [j.name, { i, p: j.p }])), P = (n) => J[n].p.clone();
  const wrist = P('wrist'), dF = P('middle-finger-tip').sub(wrist).normalize(), lat = P('pinky-finger-phalanx-proximal').sub(P('index-finger-phalanx-proximal'));
  const nP = cross(dF, lat).normalize();
  if (P('thumb-tip').sub(P('index-finger-phalanx-proximal')).dot(nP) < 0) nP.negate();          // the thumb hangs on the palm side
  const D = raw.joints.map(() => new THREE.Matrix4());
  const rot = (p, axis, ang) => new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, ang)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  const barR = o.barR ?? 0.019, fingerR = o.fingerR ?? 0.0105, rho = barR + fingerR;

  // the bar: along the knuckle line, in the plane of the palm, turned so its index end sits further out along the fingers
  const pMid = P('middle-finger-phalanx-proximal');
  let a = P('index-finger-phalanx-proximal').sub(P('pinky-finger-phalanx-proximal')); a.addScaledVector(nP, -a.dot(nP)).normalize();
  let dP = cross(nP, a); if (dP.dot(dF) < 0) dP.negate();
  const ob = (o.oblique ?? 12) * DEG; a = a.clone().multiplyScalar(Math.cos(ob)).addScaledVector(dP, Math.sin(ob)).normalize();
  dP = cross(nP, a); if (dP.dot(dF) < 0) dP.negate();
  const Q = pMid.clone().addScaledVector(nP, rho + (o.palm ?? 0)).addScaledVector(dP, -(o.back ?? 0.02));

  // fingers: every segment lies tangent to a circle of radius rho round the bar
  const fingerPts = [], angles = {}; let Cm = null;
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    const p1 = P(`${f}-finger-phalanx-proximal`), p2 = P(`${f}-finger-phalanx-intermediate`), p3 = P(`${f}-finger-phalanx-distal`), p4 = P(`${f}-finger-tip`);
    const d = p2.clone().sub(p1).normalize(), h = cross(d, nP).normalize(), n = cross(h, d);
    const Cf = Q.clone().addScaledVector(a, p1.clone().sub(Q).dot(h) / a.dot(h)), c = Cf.clone().sub(p1);
    let cx = c.dot(d), cy = c.dot(n), dc = Math.hypot(cx, cy); if (dc < rho * 1.03) { const k = rho * 1.03 / dc; cx *= k; cy *= k; dc = rho * 1.03; }
    const L1 = p2.distanceTo(p1), L2 = p3.distanceTo(p2), t1 = Math.min(Math.sqrt(dc * dc - rho * rho), L1 * 0.9);
    const th1 = Math.atan2(cy, cx) - Math.asin(rho / dc), th2 = 2 * Math.atan(Math.max(0.12, (L1 - t1) / rho)), th3 = 2 * Math.atan(clamp(L2 / rho - Math.tan(th2 / 2), Math.tan((o.tipMin ?? 22) * DEG / 2), 0.9));
    const D1 = rot(p1, h, th1), D2 = D1.clone().multiply(rot(p2, h, th2)), D3 = D2.clone().multiply(rot(p3, h, th3));
    D[J[`${f}-finger-phalanx-proximal`].i] = D1; D[J[`${f}-finger-phalanx-intermediate`].i] = D2; D[J[`${f}-finger-phalanx-distal`].i] = D3; D[J[`${f}-finger-tip`].i] = D3;
    angles[f] = [th1, th2, th3].map((x) => Math.round(x / DEG));
    if (f === 'middle') Cm = Cf;
    if (f === 'index' || f === 'middle') { const q2 = p2.applyMatrix4(D1), q3 = p3.applyMatrix4(D2), q4 = p4.applyMatrix4(D3); fingerPts.push(p1, p1.clone().lerp(q2, 0.5), q2, q2.clone().lerp(q3, 0.5), q3, q4); }
  }

  // where the hand goes: bar centre to G, bar axis to o.axis, knuckles towards o.out
  const um = pMid.clone().sub(Cm); um.addScaledVector(a, -um.dot(a)).normalize();
  const at = (o.axis || new THREE.Vector3(0, 1, 0)).clone().normalize(), ut = (o.out || new THREE.Vector3(1, 0, 0)).clone(); ut.addScaledVector(at, -ut.dot(at)).normalize();
  const R = new THREE.Matrix4().makeBasis(at, ut, cross(at, ut)).multiply(new THREE.Matrix4().makeBasis(a, um, cross(a, um)).transpose());
  const G = o.G || new THREE.Vector3(), place = new THREE.Matrix4().makeTranslation(G.x, G.y, G.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-Cm.x, -Cm.y, -Cm.z));

  // thumb: searched so that it rests on the bar without passing through it or the index finger
  let thumb; const altDs = [];
  { const tm = P('thumb-metacarpal'), tp = P('thumb-phalanx-proximal'), td = P('thumb-phalanx-distal'), tt = P('thumb-tip');
    const nT = nP.clone().multiplyScalar(0.5).addScaledVector(lat.clone().normalize(), 0.85).normalize(), hT = cross(td.clone().sub(tp).normalize(), nT).normalize();
    const mats = (x) => {
      const ang = Math.hypot(x[0], x[1], x[2]), A = ang > 1e-6 ? rot(tm, new THREE.Vector3(x[0], x[1], x[2]).divideScalar(ang), ang) : new THREE.Matrix4();
      const B = A.clone().multiply(rot(tp, hT, x[3])), C = B.clone().multiply(rot(td, hT, x[4]));
      return [A, B, C];
    };
    const lineDist = (p) => { const v = p.clone().sub(Q); return v.addScaledVector(a, -v.dot(a)).length(); };
    const inv = place.clone().invert(); let tipT = o.thumbTip ? o.thumbTip.clone().applyMatrix4(inv) : null;
    const planes = (o.planes || []).map(({ p, n }) => ({ p: p.clone().applyMatrix4(inv), n: n.clone().transformDirection(inv) }));
    const along = o.thumbAlong ?? 0, cost = (x) => {
      const [A, B, C] = mats(x), q1 = tp.clone().applyMatrix4(A), q2 = td.clone().applyMatrix4(B), q3 = tt.clone().applyMatrix4(C);
      const pts = [[q1, 0.0125], [q1.clone().lerp(q2, 0.5), 0.0115], [q2, 0.0105], [q2.clone().lerp(q3, 0.5), 0.0095], [q3, 0.0085]];
      let E = 0;
      pts.forEach(([p, r], k) => {
        const gap = lineDist(p) - (barR + r); E += gap < 0 ? 60 * gap * gap : (tipT ? 0.12 : k >= 2 ? 1 : 0.25) * gap * gap;
        for (const f of fingerPts) { const dd = p.distanceTo(f) - (r + fingerR); if (dd < 0) E += 60 * dd * dd; }
        for (const pl of planes) { const dd = t0.copy(p).sub(pl.p).dot(pl.n) - r; if (dd < 0) E += 60 * dd * dd; }
      });
      if (tipT) E += 2.5 * q3.distanceToSquared(tipT);
      return E * 1e4 + 0.02 * (x[0] * x[0] + x[1] * x[1] + x[2] * x[2]) + 0.03 * (x[3] * x[3] + x[4] * x[4]) - along * q3.clone().sub(q1).normalize().dot(a);
    };
    const t0 = V();
    let seed = 20261115; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.15;
    const solve = (preset, start, runs) => {
    let x = preset || start || [0, 0, 0, 0.2, 0.3], best = cost(x);
    if (!preset) for (let run = 0; run < runs; run++) {
      let xr = run ? [gauss() * 0.4, gauss() * 0.4, gauss() * 0.4, 0.3, 0.4] : x.slice(), br = cost(xr);
      for (let it = 0; it < 3500; it++) {
        const sg = 0.3 * Math.pow(0.02, it / 3500), y = xr.map((v) => v + gauss() * sg);
        const l = Math.hypot(y[0], y[1], y[2]); if (l > 1) { y[0] /= l; y[1] /= l; y[2] /= l; }
        y[3] = clamp(y[3], -0.1, 0.9); y[4] = clamp(y[4], -0.1, 1.1);
        const c = cost(y); if (c < br) { br = c; xr = y; }
      }
      if (br < best) { best = br; x = xr; }
    }
    return [x, best]; };
    let [x, best] = solve(o.thumb, null, 4);
    const [A, B, C] = mats(x);
    D[J['thumb-metacarpal'].i] = A; D[J['thumb-phalanx-proximal'].i] = B; D[J['thumb-phalanx-distal'].i] = C; D[J['thumb-tip'].i] = C;
    const r3 = (p) => p.clone().applyMatrix4(place).toArray().map((v) => +v.toFixed(3));
    thumb = { x: x.map((v) => +v.toFixed(3)), cost: +best.toFixed(4), base: r3(tm), knuckle: r3(tp.clone().applyMatrix4(A)), tip: r3(tt.clone().applyMatrix4(C)) };
    // further poses for the thumb (o.alts: [{ thumbTip: where its tip goes, thumb: the solved angles, to skip the search }]);
    // each search starts from the pose before it
    thumb.alts = []; let xs = x.slice();
    for (const al of o.alts || []) {
      tipT = al.thumbTip.clone().applyMatrix4(inv);
      const [x2, b2] = solve(al.thumb, xs, 1), [A2, B2, C2] = mats(x2), Dn = D.slice(); xs = x2.slice();
      Dn[J['thumb-metacarpal'].i] = A2; Dn[J['thumb-phalanx-proximal'].i] = B2; Dn[J['thumb-phalanx-distal'].i] = C2; Dn[J['thumb-tip'].i] = C2;
      altDs.push(Dn); thumb.alts.push({ x: x2.map((v) => +v.toFixed(3)), cost: +b2.toFixed(4), tip: r3(tt.clone().applyMatrix4(C2)) });
    }
  }

  // wrist: the stub of forearm on the mesh turns towards the elbow
  let bend = 0; const qW = new THREE.Quaternion();
  if (o.elbow) {
    const e = o.elbow.clone().applyMatrix4(place.clone().invert()).sub(wrist).normalize(), b = dF.clone().negate();
    qW.setFromUnitVectors(b, e); bend = b.angleTo(e);
    const cap = (o.maxBend ?? 60) * DEG; if (bend > cap) qW.slerpQuaternions(new THREE.Quaternion(), qW.clone(), cap / bend);
    D[J.wrist.i] = new THREE.Matrix4().makeTranslation(wrist.x, wrist.y, wrist.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(qW)).multiply(new THREE.Matrix4().makeTranslation(-wrist.x, -wrist.y, -wrist.z));
  }

  // linear blend skinning with the joint deltas
  const nv = m.pos.length / 3, v = V(), acc = V(), t = V(), nBind = m.nBind;
  const skin = (Dm) => {
    const out = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      v.set(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); acc.set(0, 0, 0);
      const row = m.w[i]; let s = 0;
      for (let j = 0; j < row.length; j++) if (row[j] > 1e-4) { acc.add(t.copy(v).applyMatrix4(Dm[j]).multiplyScalar(row[j])); s += row[j]; }
      if (s > 0) acc.multiplyScalar(1 / s); else acc.copy(v);
      out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
    }
    return out;
  };
  const out = skin(D);
  // size of the forearm stub at the wrist, for fitting the cuff: across the hand (l), through it (n), and its length
  const eW = dF.clone().negate().applyQuaternion(qW), nW = nP.clone().applyQuaternion(qW); nW.addScaledVector(eW, -nW.dot(eW)).normalize();
  const lW = cross(eW, nW), stub = { l: [1e9, -1e9], n: [1e9, -1e9], len: 0 }, wi = J.wrist.i;
  for (let i = 0; i < nv; i++) if (m.w[i][wi] > 0.97) {
    t.set(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]).sub(wrist); const l = t.dot(lW), n = t.dot(nW);
    stub.l[0] = Math.min(stub.l[0], l); stub.l[1] = Math.max(stub.l[1], l); stub.n[0] = Math.min(stub.n[0], n); stub.n[1] = Math.max(stub.n[1], n); stub.len = Math.max(stub.len, t.dot(eW));
  }
  // glove: a little thickness everywhere, a raised and darkened welt where the palm panel meets the back panel
  const nPose = vertexNormals(out, m.tris);
  const glove = o.glove ?? 0.0012, split = o.palmSplit ?? 0.12, col = new Float32Array(nv * 3), side = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const s = nBind[i * 3] * nP.x + nBind[i * 3 + 1] * nP.y + nBind[i * 3 + 2] * nP.z, sw = o.seamW ?? 0.1, seam = Math.exp(-Math.pow((s - split) / sw, 2)) + Math.exp(-Math.pow((s - split + 0.335) / sw, 2));
    side[i] = s; const k = glove + (o.seamH ?? 0.0005) * seam, c = 1 - (o.seamDark ?? 0.4) * seam;
    out[i * 3] += nPose[i * 3] * k; out[i * 3 + 1] += nPose[i * 3 + 1] * k; out[i * 3 + 2] += nPose[i * 3 + 2] * k;
    col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c;
  }
  // box-mapped UVs in metres from the rest pose (for the cloth bump)
  const uv = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    const ax = Math.abs(nBind[i * 3]), ay = Math.abs(nBind[i * 3 + 1]), az = Math.abs(nBind[i * 3 + 2]), x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
    if (ax >= ay && ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else if (az >= ay) { uv[i * 2] = x; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = z; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (let i = 0; i < nv; i++) side[i] -= split;
  g.setAttribute('palm', new THREE.BufferAttribute(side, 1)); g.setIndex(m.tris);
  g.applyMatrix4(place); g.computeVertexNormals();
  for (const altD of altDs) {
    // the same hand with the thumb in another pose, as a morph target (same glove thickness and welt)
    const o2 = skin(altD), n2 = vertexNormals(o2, m.tris);
    for (let i = 0; i < nv; i++) { const s = side[i] + split, sw = o.seamW ?? 0.1, seam = Math.exp(-Math.pow((s - split) / sw, 2)) + Math.exp(-Math.pow((s - split + 0.335) / sw, 2)), k = glove + (o.seamH ?? 0.0005) * seam; o2[i * 3] += n2[i * 3] * k; o2[i * 3 + 1] += n2[i * 3 + 1] * k; o2[i * 3 + 2] += n2[i * 3 + 2] * k; }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(o2, 3)); g2.setIndex(m.tris); g2.applyMatrix4(place); g2.computeVertexNormals();
    (g.morphAttributes.position ||= []).push(g2.attributes.position); (g.morphAttributes.normal ||= []).push(g2.attributes.normal); g.morphTargetsRelative = false;
  }
  const dir = (d) => d.clone().transformDirection(place);
  return {
    geometry: g, wrist: wrist.clone().applyMatrix4(place), palmN: dir(nW), across: dir(lW), fingers: dir(dF), stub, backC: wrist.clone().lerp(pMid, 0.56).addScaledVector(nP, -0.012).applyMatrix4(place), backN: dir(nP.clone().negate()), bend: Math.round(bend / DEG), angles, thumb, tris: m.tris.length / 3,
  };
}
