// rig.js (game copy): only the lap speed profile used to place brake boards.
import { W } from './world.js';

// lap speed profile for a modern F1 car (m/s per station)
export function speedProfile() {
  const N = W.N, ds = W.ds, v = new Float32Array(N), vmax = 91;
  // curvature of the racing line ~ smoothed centreline curvature (the line straightens corners)
  const k = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let j = -6; j <= 6; j++) s += Math.abs(W.kappa[(i + j + N) % N]); k[i] = s / 13 * 0.72; }
  for (let i = 0; i < N; i++) v[i] = Math.min(vmax, Math.sqrt((30 + 0.0038 * 80 * 80) / Math.max(k[i], 1e-4)));
  for (let pass = 0; pass < 2; pass++) {
    for (let t = 0; t < 2 * N; t++) { const i = t % N, j = (i + 1) % N, a = 13.5 * (1 - (v[i] / 104) ** 2) + 1; v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * a * ds)); }
    for (let t = 2 * N; t > 0; t--) { const i = t % N, j = (i - 1 + N) % N, b = 16 + 0.0042 * v[i] * v[i]; v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * b * ds)); }
  }
  return v;
}
