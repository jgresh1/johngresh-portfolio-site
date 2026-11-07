// Seagrass (turtle-grass) tuft: a bundle of curved strap blades. uv.x = across the blade, aInfo.x = along.
import * as THREE from 'three';
import { Builder, mulberry32 } from './geom.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function seagrassTuft(seed, o = {}) {
  const rnd = mulberry32(seed), b = new Builder();
  const { blades = 12, rows = 6, lenLo = 0.20, lenHi = 0.42, width = 0.0125, radius = 0.05 } = o;
  for (let k = 0; k < blades; k++) {
    const a = rnd() * 6.283, r0 = Math.sqrt(rnd()) * radius;
    const base = V(Math.cos(a) * r0, -0.01, Math.sin(a) * r0);
    const L = lenLo + (lenHi - lenLo) * Math.pow(rnd(), 0.8);
    const lean = 0.18 + rnd() * 0.55, la = a + (rnd() - 0.5) * 1.2;
    const leanDir = V(Math.cos(la), 0, Math.sin(la));
    const twist = (rnd() - 0.5) * 1.6, w0 = width * (0.75 + 0.5 * rnd());
    const rr = rnd();
    const pts = [];
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const p = base.clone();
      p.y += L * t * (1 - 0.22 * t);
      p.addScaledVector(leanDir, L * lean * t * t);
      pts.push(p);
    }
    const start = b.count;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const tan = pts[Math.min(i + 1, rows)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
      // blade plane: width axis perpendicular to tangent, rotated by twist and by a base heading
      const side = new THREE.Vector3().crossVectors(tan, leanDir).normalize();
      if (side.lengthSq() < 0.01) side.set(1, 0, 0);
      side.applyAxisAngle(tan, twist * t + (a % 1.0) * 1.2);
      const nrm = new THREE.Vector3().crossVectors(side, tan).normalize();
      // taper to a rounded tip
      const wt = w0 * (t < 0.85 ? 1 : Math.sqrt(Math.max(1 - (t - 0.85) / 0.15, 0.0))) * (0.5 + 0.5 * Math.min(1, t * 8 + 0.3));
      const info = [t, rr, 0, 9];
      b.vertex(pts[i].clone().addScaledVector(side, -wt), nrm, 0, t, [t, rr, 0, 9]);
      b.vertex(pts[i].clone().addScaledVector(side, wt), nrm, 1, t, [t, rr, 1, 9]);
    }
    for (let i = 0; i < rows; i++) {
      const a0 = start + i * 2, a1 = a0 + 1, a2 = a0 + 2, a3 = a0 + 3;
      b.tri(a0, a2, a1); b.tri(a1, a2, a3);
    }
  }
  const g = b.toGeometry();
  // aInfo.z carries the across-blade coordinate for vein shading (0..1)
  return g;
}
