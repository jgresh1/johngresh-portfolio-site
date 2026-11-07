// Streams instanced life around the camera. The world is cut into CELL x CELL m cells;
// each species generates its instances per cell deterministically from the baked world
// data (height, slope, masks), so nothing pops or reshuffles as the camera moves.
import * as THREE from 'three';
import { U, OPTICS_VERT } from './optics.js';
import { mulberry32, hashStr } from './flora/geom.js';

export const CELL = 16;
const REBUCKET = 2.5;                  // metres of camera travel after which per-instance LODs are re-evaluated

// cheap smooth 2D value noise for clustering rules (independent of the GLSL noise)
const hash2 = (ix, iz) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function vnoise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm2 = (x, z, o = 3) => { let a = 0.5, s = 0, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise2(x, z); n += a; x = x * 2.03 + 11.7; z = z * 2.03 + 5.3; a *= 0.5; } return s / n; };
export const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();


// ---------------------------------------------------------------------------
// Contact shadows: a soft dark disc under every ground-hugging instance (cheap ambient occlusion).
// Drawn as "a black object" seen through the water, so it fogs correctly with distance.
// ---------------------------------------------------------------------------
let _decalMat = null, _decalGeo = null;
function decalResources() {
  if (_decalMat) return { mat: _decalMat, geo: _decalGeo };
  const g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2);
  _decalGeo = g;
  _decalMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uStrength: { value: 0.62 } }),
    vertexShader: /* glsl */`
      attribute vec2 aParam;                       // x footprint scale, y darkness
      varying vec2 vP; varying float vK; varying vec3 vW;
      void main() {
        vP = position.xz; vK = aParam.y;
        vec4 wp = instanceMatrix * vec4(position.x * aParam.x, 0.0, position.z * aParam.x, 1.0);
        wp.y += 0.035;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vP; varying float vK; varying vec3 vW;
      uniform float uStrength;
      uniform vec3 uKd, uExt, uVeil0; uniform vec4 uOptA;
      void main() {
        float r = length(vP);
        float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.4) * vK * uStrength;
        // black object seen through the water: only the in-scattered veil remains
        vec3 d = vW - cameraPosition; float dist = length(d); vec3 dir = d / max(dist, 1e-4);
        vec3 aa = max(uExt - uKd * dir.y, vec3(1e-4));
        float z0 = max(uOptA.y - cameraPosition.y, 0.0);
        vec3 L = uVeil0 * uOptA.w * uExt * exp(-uKd * z0) * (1.0 - exp(-aa * dist)) / aa;
        gl_FragColor = vec4(L, a);
      }`,
    transparent: true, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return { mat: _decalMat, geo: _decalGeo };
}

export class Scatter {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.species = [];
    this.cache = new Map();
    this.lcx = 1e9; this.lcz = 1e9; this.dirty = true;
    this.group = new THREE.Group(); scene.add(this.group);
    this.stats = { instances: 0, tris: 0, cellsGenerated: 0 };
  }

  // def: { id, variants:[[geoLOD0, geoLOD1?],...], material, radius, lod1, capacity, castShadow, gen(ctx) }
  add(def) {
    def.meshes = def.variants.map((v) => v.map((geo, lod) => {
      const m = new THREE.InstancedMesh(geo, def.material, def.capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(def.capacity * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false;
      m.castShadow = (def.castShadow ?? true) && lod === 0; m.receiveShadow = true;
      this.group.add(m);
      return m;
    }));
    def.lodDist = def.lodDist ?? (def.lod1 ? [def.lod1] : []);
    if (def.shadow) {
      const { mat, geo } = decalResources();
      const g = geo.clone();
      const cap = def.capacity * 2;
      g.setAttribute('aParam', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2));
      const dm = new THREE.InstancedMesh(g, mat, cap);
      dm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dm.count = 0; dm.frustumCulled = false; dm.renderOrder = 3;
      this.group.add(dm); def.decal = dm;
    }
    def.seed = def.seed ?? hashStr(def.id);
    this.species.push(def);
    this.dirty = true;
    return def;
  }

  // positions of currently loaded instances of species `id` (LOD0 meshes) near the camera, nearest first
  instancePositions(id, cam, R, cap = 64) {
    const sp = this.species.find((q) => q.id === id); if (!sp) return [];
    const out = [], R2 = R * R;
    for (const variantMeshes of sp.meshes) for (const m of variantMeshes) {
      const a = m.instanceMatrix.array;
      for (let i = 0; i < m.count; i++) {
        const x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14], dx = x - cam.x, dz = z - cam.z, d2 = dx * dx + dz * dz;
        if (d2 < R2) out.push({ x, y, z, d: Math.sqrt(d2), s: Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]) });
      }
    }
    out.sort((p, q) => p.d - q.d);
    return out.slice(0, cap);
  }

  sample(x, z, o = {}) {
    const w = this.world, hb = w.height(x, z);
    const e = 1.6;
    const hx = w.height(x + e, z) - hb, hz = w.height(x, z + e) - hb;
    const nx = -hx / e, nz = -hz / e, inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
    const h = hb + w.detail(x, z, 0);                              // plant on the surface that is DRAWN (base + rock relief); slope / normal stay smooth
    o.h = h; o.hb = hb; o.depth = -hb; o.slope = Math.sqrt(nx * nx + nz * nz);
    o.nx = nx * inv; o.ny = inv; o.nz = nz * inv;
    o.m = w.masks(x, z, o.m || [0, 0, 0, 0]);
    return o;
  }

  _cell(sp, cx, cz) {
    const key = sp.id + ':' + cx + ',' + cz;
    let c = this.cache.get(key);
    if (c) return c;
    const nv = sp.variants.length;
    const lists = Array.from({ length: nv }, () => []);
    const rnd = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ sp.seed) >>> 0);
    const s = {};
    const ctx = {
      cx, cz, x0: cx * CELL, z0: cz * CELL, S: CELL, rnd, sample: (x, z) => this.sample(x, z, s),
      push: (variant, x, y, z, sx, sy, sz, yaw, align, nrm, color) => {
        // orientation: yaw about the local up, up tilted toward the terrain normal by `align`
        _n.set(0, 1, 0);
        if (align > 0 && nrm) _n.set(nrm[0] * align, 1 - align + nrm[1] * align, nrm[2] * align).normalize();
        _q.setFromUnitVectors(_up, _n);
        _q2.setFromAxisAngle(_up, yaw);
        _q.multiply(_q2);
        _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
        lists[variant].push(_m.elements.slice(), color);
      },
    };
    sp.gen(ctx);
    c = { lists };
    this.cache.set(key, c);
    this.stats.cellsGenerated++;
    if (this.cache.size > 6000) { const k = this.cache.keys().next().value; this.cache.delete(k); }
    return c;
  }

  // budgetMs: max time spent generating new cells this call (interactive); Infinity = build everything now.
  // Re-buckets instances (LOD per instance) when the camera crosses a cell OR has moved > REBUCKET m since the last rebuild, and only
  // gives every instance buffer a fresh GL buffer holding only the used part (a full-capacity in-place upload cost 100+ ms at every cell crossing).
  update(cam, budgetMs = 5) {
    const ccx = Math.floor(cam.x / CELL), ccz = Math.floor(cam.z / CELL);
    const cellChanged = ccx !== this.lcx || ccz !== this.lcz;
    const moved = Math.hypot(cam.x - (this.lx ?? 1e9), cam.z - (this.lz ?? 1e9));
    if (!this.dirty && !cellChanged && moved < REBUCKET) return;
    const t0 = performance.now();
    let incomplete = false;
    for (const sp of this.species) {
      if (!this.dirty && !cellChanged && sp.lodDist.length === 0) continue;            // nothing about this species can have changed
      const R = sp.radius * (sp.radiusScale ?? 1), rc = Math.ceil(R / CELL) + 1;
      const perLOD = sp.variants.map((v) => v.map(() => []));
      for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        const mx = (cx + 0.5) * CELL - cam.x, mz = (cz + 0.5) * CELL - cam.z;
        const d = Math.hypot(mx, mz);
        if (d > R + CELL * 0.7) continue;
        const key = sp.id + ':' + cx + ',' + cz;
        if (!this.cache.has(key) && performance.now() - t0 > budgetMs) { incomplete = true; continue; }
        const c = this._cell(sp, cx, cz);
        const nl = sp.lodDist.length;
        for (let v = 0; v < c.lists.length; v++) {
          const L = c.lists[v], buckets = perLOD[v], maxL = buckets.length - 1;
          for (let i = 0; i < L.length; i += 2) {
            // LOD per INSTANCE (a 16 m cell can hold instances 2 m and 20 m from the camera)
            const m = L[i], ddx = m[12] - cam.x, ddz = m[14] - cam.z, di = Math.sqrt(ddx * ddx + ddz * ddz);
            let lod = 0; for (let q = 0; q < nl; q++) if (di > sp.lodDist[q]) lod++;
            buckets[lod > maxL ? maxL : lod].push(m, L[i + 1], di);
          }
        }
      }
      for (let v = 0; v < perLOD.length; v++) for (let l = 0; l < perLOD[v].length; l++) {
        const mesh = sp.meshes[v][l], list = perLOD[v][l];
        let n = list.length / 3;
        if (n > sp.capacity) {                       // keep the nearest
          const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => list[a * 3 + 2] - list[b * 3 + 2]).slice(0, sp.capacity);
          const keep = []; for (const i of order) keep.push(list[i * 3], list[i * 3 + 1], list[i * 3 + 2]);
          list.length = 0; list.push(...keep); n = sp.capacity;
        }
        if (n === 0) { mesh.count = 0; continue; }
        // CPU scratch arrays (full capacity) are reused; the GL side gets a brand-new buffer holding only the used part. Writing into a buffer
        // the GPU is still drawing from stalls the driver for a couple of frames; a fresh buffer never does (the old one is freed by the driver
        // once the GPU is done with it).
        const ud = mesh.userData;
        const cpuM = ud.cpuM || (ud.cpuM = mesh.instanceMatrix.array), cpuC = ud.cpuC || (ud.cpuC = mesh.instanceColor.array);
        for (let i = 0; i < n; i++) {
          cpuM.set(list[i * 3], i * 16);
          const col = list[i * 3 + 1]; cpuC[i * 3] = col[0]; cpuC[i * 3 + 1] = col[1]; cpuC[i * 3 + 2] = col[2];
        }
        const slack = Math.min(sp.capacity, n + 8 + (n >> 3));
        mesh.dispose();
        mesh.instanceMatrix = new THREE.InstancedBufferAttribute(cpuM.subarray(0, slack * 16), 16); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(cpuC.subarray(0, slack * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = n;
      }
      if (sp.decal) {
        const dm = sp.decal, ud = dm.userData;
        const cpuM = ud.cpuM || (ud.cpuM = dm.instanceMatrix.array), cpuP = ud.cpuP || (ud.cpuP = dm.geometry.attributes.aParam.array), cap = cpuM.length / 16;
        let k = 0;
        for (let v = 0; v < perLOD.length && k < cap; v++) for (let l = 0; l < perLOD[v].length; l++) {
          const list = perLOD[v][l];
          for (let i = 0; i < list.length / 3 && k < cap; i++) {
            if (list[i * 3 + 2] > (sp.shadow.range ?? 32)) continue;
            cpuM.set(list[i * 3], k * 16);
            cpuP[k * 2] = sp.shadow.r; cpuP[k * 2 + 1] = sp.shadow.k ?? 1;
            k++;
          }
        }
        dm.count = k;
        if (k > 0) {
          const slack = Math.min(cap, k + 8 + (k >> 3));
          dm.dispose(); dm.geometry.dispose();                       // frees the old instance + aParam GL buffers (the circle geometry re-uploads itself)
          dm.instanceMatrix = new THREE.InstancedBufferAttribute(cpuM.subarray(0, slack * 16), 16); dm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          dm.geometry.setAttribute('aParam', new THREE.InstancedBufferAttribute(cpuP.subarray(0, slack * 2), 2));
        }
      }
    }
    let inst = 0, tris = 0;
    for (const sp of this.species) for (const vm of sp.meshes) for (const m of vm) {
      inst += m.count; tris += m.count * (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3);
    }
    this.stats.instances = inst; this.stats.tris = tris;
    this.dirty = incomplete;
    if (!incomplete) { this.lcx = ccx; this.lcz = ccz; this.lx = cam.x; this.lz = cam.z; }
  }
}
