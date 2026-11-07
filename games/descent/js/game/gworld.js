// Game-side view of the world: habitat queries, cover (hiding) and play-area limits.
import { zoneAt, BOUNDS } from './data.js';
import { Solids } from './solids.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class GWorld {
  constructor(world, scatter) { this.world = world; this.scatter = scatter; this.solids = new Solids(scatter); this._m = [0, 0, 0, 0]; this._h = { zone: 'lagoon', depth: 3, sand: 0, reef: 0, rock: 0, grass: 0, slope: 0 }; }

  // the seabed exactly as drawn (base heightfield + the shader's rock relief): the fish, the camera and every creature rest on this
  floor(x, z) { return this.world.surface(x, z); }

  // habitat description at (x,z). Returns a shared object (copy what you keep).
  hab(x, z, out = this._h) {
    const w = this.world, h = w.height(x, z), m = w.masks(x, z, this._m);
    out.depth = -h; out.sand = m[0]; out.reef = m[1]; out.rock = m[2]; out.grass = m[3];
    const e = 2.5, gx = (w.height(x + e, z) - w.height(x - e, z)) / (2 * e), gz = (w.height(x, z + e) - w.height(x, z - e)) / (2 * e);
    out.slope = Math.hypot(gx, gz); out.gx = gx; out.gz = gz;
    out.zone = zoneAt(x, out.depth);
    return out;
  }

  // how hidden is something at (x,y,z): 0 open water .. 1 deep in cover. Seagrass hides the lower ~0.9 m, coral the lower ~1.3 m.
  cover(x, y, z) {
    const m = this.world.masks(x, z, this._m), h = y - this.floor(x, z);
    if (h < 0) return 1;
    const g = m[3] * clamp(1 - h / 0.95, 0, 1), r = m[1] * 0.85 * clamp(1 - h / 1.4, 0, 1), k = m[2] * 0.35 * clamp(1 - h / 0.6, 0, 1);
    return clamp(Math.max(g, r, k), 0, 1);
  }

  inBounds(x, z) { return x > BOUNDS.x0 && x < BOUNDS.x1 && z > BOUNDS.z0 && z < BOUNDS.z1; }

  // soft push back into the play area (returns a velocity to add, in m/s per m beyond the soft edge)
  boundsPush(x, z, out) {
    const m = 18; out.x = 0; out.z = 0;
    if (x < BOUNDS.x0 + m) out.x = (BOUNDS.x0 + m - x) / m; else if (x > BOUNDS.x1 - m) out.x = (BOUNDS.x1 - m - x) / m;
    if (z < BOUNDS.z0 + m) out.z = (BOUNDS.z0 + m - z) / m; else if (z > BOUNDS.z1 - m) out.z = (BOUNDS.z1 - m - z) / m;
    return out;
  }
}
