// CreatureRenderer: one record per look (fish skin or hero model). Every record owns 3 detail levels (fish) of instanced meshes whose
// instance buffers are rewritten every frame from the CPU simulation. Creatures are plain objects with the fields used in draw().
import * as THREE from 'three';
import { VIS } from './data.js';
import { fishLODs, heroGeometry, fishUniforms, heroUniforms, makeFishMaterial, makeHeroMaterial } from './models.js';
import { crawlGeometry, crawlUniforms, makeCrawlMaterial, jellyGameGeometry, jellyUniforms, makeJellyMaterial } from './crawlers.js';

const DYN = THREE.DynamicDrawUsage;

export function lodFor(dist, len) {
  const d = dist / Math.max(len, 0.03);
  return d < 60 ? 0 : (d < 190 ? 1 : 2);
}

class Rec {
  constructor(key, vis, cap, group, nominal, castShadow) {
    this.key = key; this.vis = vis; this.cap = cap; this.unit = vis.unit ?? 1; this.fam = vis.fam; this.lods = [];
    const geos = vis.fam === 'hero' ? [{ body: heroGeometry(vis), fins: null }] : vis.fam === 'crawl' ? [{ body: crawlGeometry(vis.model), fins: null }] : vis.fam === 'jelly' ? [{ body: jellyGameGeometry(), fins: null }] : fishLODs(vis, key);
    const uni = vis.fam === 'hero' ? heroUniforms(vis) : vis.fam === 'crawl' ? crawlUniforms(vis) : vis.fam === 'jelly' ? jellyUniforms(vis) : fishUniforms(vis, nominal);
    geos.forEach((g, li) => {
      const M = new Float32Array(cap * 16), C = new Float32Array(cap * 3), A = new Float32Array(cap * 4), S = new Float32Array(cap * 4), H = new Float32Array(cap * 4);
      const mk = (a, n) => { const t = new THREE.InstancedBufferAttribute(a, n); t.setUsage(DYN); return t; };
      const attrs = { M: mk(M, 16), C: mk(C, 3), A: mk(A, 4), S: mk(S, 4), H: mk(H, 4) };
      const meshes = [];
      for (const [part, geo] of [['body', g.body], ['fins', g.fins]]) {
        if (!geo) continue;
        geo.setAttribute('aAnim', attrs.A); geo.setAttribute('aSeed', attrs.S); geo.setAttribute('aHint', attrs.H);
        const mat = vis.fam === 'hero' ? makeHeroMaterial(vis.kind, uni) : vis.fam === 'crawl' ? makeCrawlMaterial(uni) : vis.fam === 'jelly' ? makeJellyMaterial(uni) : makeFishMaterial(part, uni, vis.pattern > 12.5);
        const m = new THREE.InstancedMesh(geo, mat, cap);
        m.instanceMatrix = attrs.M; m.instanceColor = attrs.C;
        m.count = 0; m.visible = false; m.frustumCulled = false;
        m.castShadow = !!castShadow && li === 0 && part === 'body'; m.receiveShadow = false;
        if (part === 'fins') m.renderOrder = 2;
        else if (vis.pattern > 12.5) m.renderOrder = 3;              // see-through body: drawn after its fins, so the far fins show through it
        if (vis.fam === 'jelly') m.renderOrder = 5;
        group.add(m); meshes.push(m);
      }
      this.lods.push({ n: 0, M, C, A, S, H, attrs, meshes });
    });
  }
}

export class CreatureRenderer {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'game-creatures'; scene.add(this.group);
    this.recs = new Map();
    this.stats = { instances: 0, drawn: 0 };
  }

  // visKey: key of VIS (or an inline vis object with .key). cap = most instances of this look drawn at once.
  ensure(visKey, cap = 48, nominal = 0.5, castShadow = false) {
    let r = this.recs.get(visKey);
    if (r) return r;
    const vis = typeof visKey === 'string' ? VIS[visKey] : visKey;
    if (!vis) throw new Error('unknown look ' + visKey);
    r = new Rec(typeof visKey === 'string' ? visKey : visKey.key, vis, cap, this.group, nominal, castShadow);
    this.recs.set(visKey, r);
    return r;
  }

  begin() { for (const r of this.recs.values()) for (const l of r.lods) l.n = 0; this.stats.drawn = 0; }

  // c: x,y,z (position), fx,fy,fz (unit heading), roll, len (metres), ph (tail phase), amp, turn, flash, hr,hg,hb,ha (rim hint), tr,tg,tb (tint), s0..s3 (seed)
  draw(rec, lod, c) {
    const L = rec.lods[rec.lods.length === 1 ? 0 : lod];
    const i = L.n; if (i >= rec.cap) return false;
    L.n = i + 1;
    // basis: forward f, side = f x up, up = side x f, then roll about f
    let fx = c.fx, fy = c.fy, fz = c.fz, sx = -fz, sz = fx, sl = Math.hypot(sx, sz);
    if (sl < 1e-4) { sx = 0; sz = 1; sl = 1; }
    sx /= sl; sz /= sl;
    let ux = -sz * fy, uy = sz * fx - sx * fz, uz = sx * fy;
    const r = c.roll || 0, cr = Math.cos(r), sr = Math.sin(r), s = c.len * rec.unit;
    const Ux = (ux * cr + sx * sr) * s, Uy = (uy * cr) * s, Uz = (uz * cr + sz * sr) * s;
    const Sx = (sx * cr - ux * sr) * s, Sy = (-uy * sr) * s, Sz = (sz * cr - uz * sr) * s;
    const M = L.M, o = i * 16;
    M[o] = fx * s; M[o + 1] = fy * s; M[o + 2] = fz * s; M[o + 3] = 0;
    M[o + 4] = Ux; M[o + 5] = Uy; M[o + 6] = Uz; M[o + 7] = 0;
    M[o + 8] = Sx; M[o + 9] = Sy; M[o + 10] = Sz; M[o + 11] = 0;
    M[o + 12] = c.x; M[o + 13] = c.y; M[o + 14] = c.z; M[o + 15] = 1;
    let q = i * 4; const A = L.A;
    A[q] = c.ph; A[q + 1] = c.amp; A[q + 2] = c.turn; A[q + 3] = c.flash;
    const S4 = L.S; S4[q] = c.s0; S4[q + 1] = c.s1; S4[q + 2] = c.s2; S4[q + 3] = c.s3;
    const H = L.H; H[q] = c.hr; H[q + 1] = c.hg; H[q + 2] = c.hb; H[q + 3] = c.ha;
    const k = i * 3, C = L.C; C[k] = c.tr; C[k + 1] = c.tg; C[k + 2] = c.tb;
    this.stats.drawn++;
    return true;
  }

  end() {
    for (const r of this.recs.values()) for (const l of r.lods) {
      const n = l.n, vis = n > 0;
      for (const m of l.meshes) { m.count = n; m.visible = vis; }
      if (!vis) continue;
      const a = l.attrs;
      for (const [k, w] of [['M', 16], ['C', 3], ['A', 4], ['S', 4], ['H', 4]]) { const t = a[k]; t.clearUpdateRanges(); t.addUpdateRange(0, n * w); t.needsUpdate = true; }
    }
  }

  setVisible(v) { this.group.visible = v; }
}
