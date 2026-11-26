// merge.js — fewer draw calls for the aircraft and its pilot.
//
// Every draw call costs the processor time, and a small laptop has little of it. The aircraft is 150 separate
// parts. Each cast a shadow, so each was drawn again into the shadow map; and a part can only cast one if it is on
// the layer the world is drawn from, so each was also drawn in the world pass and then drawn properly in the
// aircraft's own pass. Three draws a part, every frame.
//
// Here the casting is handed to stand-ins: every caster that moves together is welded into one mesh that is drawn
// into shadow maps and nowhere else. The parts themselves then live only on the aircraft's layer and are drawn once.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Matrix3(), I4 = new THREE.Matrix4();

// One geometry from several. parts: [{ geometry, matrix }] (matrix null = as built). `full` keeps normals, uv and
// (where every part has one) vertex colour; without it only the shape is kept, which is all a shadow needs.
export function mergeGeo(parts, full = true) {
  let nv = 0, ni = 0;
  for (const { geometry: g } of parts) { const n = g.attributes.position.count; nv += n; ni += g.index ? g.index.count : n; }
  const pos = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const nor = full ? new Float32Array(nv * 3) : null;
  const uv = full && parts.some((p) => p.geometry.attributes.uv) ? new Float32Array(nv * 2) : null;
  const col = full && parts.every((p) => p.geometry.attributes.color) ? new Float32Array(nv * 3) : null;
  let v0 = 0, i0 = 0;
  for (const { geometry: g, matrix } of parts) {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color, n = P.count;
    const plain = P.array instanceof Float32Array && !P.isInterleavedBufferAttribute && !P.normalized;
    if (plain && !matrix) pos.set(P.array.subarray(0, n * 3), v0 * 3);
    else for (let i = 0; i < n; i++) { _v.fromBufferAttribute(P, i); if (matrix) _v.applyMatrix4(matrix); pos[(v0 + i) * 3] = _v.x; pos[(v0 + i) * 3 + 1] = _v.y; pos[(v0 + i) * 3 + 2] = _v.z; }
    if (nor && N) {
      if (matrix) _n.getNormalMatrix(matrix);
      for (let i = 0; i < n; i++) { _v.fromBufferAttribute(N, i); if (matrix) _v.applyMatrix3(_n).normalize(); nor[(v0 + i) * 3] = _v.x; nor[(v0 + i) * 3 + 1] = _v.y; nor[(v0 + i) * 3 + 2] = _v.z; }
    }
    if (uv && U) for (let i = 0; i < n; i++) { uv[(v0 + i) * 2] = U.getX(i); uv[(v0 + i) * 2 + 1] = U.getY(i); }
    if (col) for (let i = 0; i < n; i++) { col[(v0 + i) * 3] = C.getX(i); col[(v0 + i) * 3 + 1] = C.getY(i); col[(v0 + i) * 3 + 2] = C.getZ(i); }
    if (g.index) { const a = g.index.array, k = a.length; for (let i = 0; i < k; i++) idx[i0 + i] = a[i] + v0; i0 += k; }
    else { for (let i = 0; i < n; i++) idx[i0 + i] = v0 + i; i0 += n; }
    v0 += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

// Seen by shadow maps only. It has to be on the world's layer to cast at all, so the colour pass does meet it;
// an empty draw range there means nothing of it is sent to the graphics card.
const UNSEEN = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
export class ShadowProxy extends THREE.Mesh {
  constructor(geometry, material = UNSEEN) {
    super(geometry, material);
    this.isShadowProxy = true; this.name = 'shadow'; this.castShadow = true; this.receiveShadow = false; this.layers.set(0);
  }
  onBeforeShadow() { this.geometry.setDrawRange(0, Infinity); }
  onBeforeRender() { this.geometry.setDrawRange(0, -1); }
}

// every mesh under `root`, with the node it moves with (the nearest of `anchors` above it, else root) and where it
// sits in that node's frame
function byAnchor(root, anchors, want) {
  const A = new Set(anchors); A.add(root);
  const found = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isShadowProxy || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material) || !want(o)) return;
    const m = new THREE.Matrix4(); let a = o;
    while (a && !A.has(a)) { if (a.matrixAutoUpdate) a.updateMatrix(); m.premultiply(a.matrix); a = a.parent; }
    if (a) found.push({ mesh: o, anchor: a, geometry: o.geometry, matrix: m.equals(I4) ? null : m });
  });
  return found;
}

// Hand the shadow casting of everything under `root` to one stand-in per moving node. Returns how many were made.
export function shadowProxies(root, anchors = []) {
  const groups = new Map();
  for (const f of byAnchor(root, anchors, (o) => o.castShadow)) { if (!groups.has(f.anchor)) groups.set(f.anchor, []); groups.get(f.anchor).push(f); }
  for (const [anchor, parts] of groups) {
    anchor.add(new ShadowProxy(mergeGeo(parts, false)));
    for (const p of parts) p.mesh.castShadow = false;
  }
  return groups.size;
}

// Weld meshes that move together and share a material into one. For things built here part by part (the pilot);
// call it after shadowProxies, which is what remembers which parts cast.
export function mergeByMaterial(root, anchors = []) {
  const groups = new Map();
  for (const f of byAnchor(root, anchors, (o) => !o.castShadow)) {
    const key = f.anchor.uuid + '|' + f.mesh.material.uuid + '|' + f.mesh.renderOrder + '|' + f.mesh.receiveShadow + '|' + f.mesh.layers.mask + '|' + f.mesh.visible;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(f);
  }
  let saved = 0;
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const first = parts[0].mesh, m = new THREE.Mesh(mergeGeo(parts, true), first.material);
    m.name = first.material.name || first.name; m.castShadow = false; m.receiveShadow = first.receiveShadow; m.renderOrder = first.renderOrder; m.layers.mask = first.layers.mask;
    parts[0].anchor.add(m);
    for (const p of parts) { p.mesh.removeFromParent(); p.geometry.dispose(); }
    saved += parts.length - 1;
  }
  return saved;
}
