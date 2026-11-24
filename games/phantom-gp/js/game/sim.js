// sim.js — the driving model, the rival driver and the race. Both cars share one set of performance numbers, so the
// rival is fast because it drives well, not because it has a better car.
import { W, frameAt, nearestStation, surfaceAt, contactAt, groundClass, treeWithin, drawnBuilding, drawnBarrier } from '../track/world.js';
import { nearestRoad, roadAhead, roadSpeed } from '../track/roads.js';
import { due, dueN, breathe } from '../track/slice.js';

// tyre contact points in the car frame (x forward, z right): front axle 1.8 m ahead of the middle, rear 1.8 m behind;
// half-tracks from car.js (ZF, ZR). Order: front right, front left, rear right, rear left.
export const WHEELS = [[1.8, 0.8375], [1.8, -0.8375], [-1.8, 0.7875], [-1.8, -0.7875]];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/* ------------------------------------------------------------------ the car's performance */
export const PHYS = {
  aMech: 22, kAero: 0.0052,          // cornering: aMech + kAero v^2 (m/s^2): 2.2 g slow, 5.5 g at 290 km/h
  pm: 940, aTrac: 13.5, kTrac: 0.0016, // power to mass (W/kg) and the traction limit off the line
  kDrag: 0.00125, roll: 0.35,
  bMech: 17, kBrake: 0.0046,
  L: 3.6, R: 0.36,
};
export const grip = (v) => PHYS.aMech + PHYS.kAero * v * v;
const EDGE = 1.10;                 // the player's tyres hold a little more than the line speeds assume: room for an imperfect line
const steerFor = (alpha, ld, dmax) => clamp(Math.atan(2 * PHYS.L * Math.sin(alpha) / Math.max(ld, 3)) / Math.max(dmax, 0.01), -1, 1);   // pure pursuit
export const driveAcc = (v, boost = 0, draft = 0) => Math.min(PHYS.aTrac + PHYS.kTrac * v * v, PHYS.pm * (1 + 0.16 * boost) / Math.max(v, 6)) - PHYS.kDrag * (1 - 0.20 * draft) * v * v - PHYS.roll;
export const brakeAcc = (v) => PHYS.bMech + PHYS.kBrake * v * v + PHYS.kDrag * v * v;
const GEAR_TOP = [0, 24, 35, 46, 57, 67, 77, 86, 120];   // top speed of each gear (m/s)
export function gearFor(v, cur) {
  let g = clamp(cur || 1, 1, 8);
  while (g < 8 && v > GEAR_TOP[g] * 0.985) g++;
  while (g > 1 && v < GEAR_TOP[g - 1] * 0.86) g--;
  return g;
}
export const rpmFor = (v, g) => { const lo = g > 1 ? GEAR_TOP[g - 1] * 0.80 : 0, hi = GEAR_TOP[g]; return 5200 + 7300 * clamp((v - lo) / (hi - lo), 0, 1.04); };

/* ------------------------------------------------------------------ track data for driving */
export const TRACK = {};
export async function buildTrack() {
  const N = W.N, ds = W.ds, T = TRACK;
  T.N = N; T.ds = ds; T.L = W.L;
  // how far a car may go to each side: the road edge, or a wall that stands inside it (the old pit wall after La Source)
  const wr = new Float32Array(N).fill(99), wl = new Float32Array(N).fill(99), ns = {};
  const scan = (pts, closed) => {
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let k = 0; k <= n; k++) {
        const q = nearestStation(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, ns); if (!q || q.dist > 30) continue;
        const j = Math.floor(q.s / ds) % N; if (q.d > 0) wr[j] = Math.min(wr[j], q.d); else wl[j] = Math.min(wl[j], -q.d);
      }
    }
  };
  // only what is drawn can limit the road (world.js: drawnBarrier, drawnBuilding)
  for (const b of W.barriers) { if (due()) await breathe(); if (drawnBarrier(b)) scan(b.pts, false); }
  for (const b of W.buildings) { if (due()) await breathe(); if (drawnBuilding(b)) scan(b.pts, true); }
  const spread = (a, r, f) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) { let v = f === Math.min ? 1e9 : 0, c = 0; for (let j = -r; j <= r; j++) { const x = a[(i + j + N) % N]; if (f === Math.min) v = Math.min(v, x); else { v += x; c++; } } o[i] = f === Math.min ? v : v / c; } return o; };
  let dMax = new Float32Array(N), dMin = new Float32Array(N);
  for (let i = 0; i < N; i++) { dMax[i] = Math.min(W.hw[i] - 1.15, wr[i] - 1.7); dMin[i] = Math.min(W.hw[i] - 1.15, wl[i] - 1.7); }
  dMax = spread(spread(dMax, 10, Math.min), 10, null); dMin = spread(spread(dMin, 10, Math.min), 10, null);
  for (let i = 0; i < N; i++) dMin[i] = -dMin[i];
  // The racing line stays 1.8 m inside the road edge (a wheel's width of margin at 300 km/h) and a further 0.35 m
  // off any wall that narrows the road: a line that brushes the grass or a wall is a trap for whoever follows it.
  let line = new Float32Array(N);
  const nearL = new Float32Array(N), nearR = new Float32Array(N);       // 0 where a wall, not the road edge, sets the limit
  for (let i = 0; i < N; i++) { nearL[i] = wl[i] - 1.7 < W.hw[i] - 1.15 ? 0 : 1; nearR[i] = wr[i] - 1.7 < W.hw[i] - 1.15 ? 0 : 1; }
  const wlS = spread(nearL, 12, Math.min), wrS = spread(nearR, 12, Math.min);
  const lo2 = (i) => { const m = wlS[i] < 0.5 ? 1.0 : 0.65; return Math.min(dMin[i] + m, Math.max(dMin[i], -0.2)); };
  const hi2 = (i) => { const m = wrS[i] < 0.5 ? 1.0 : 0.65; return Math.max(dMax[i] - m, Math.min(dMax[i], 0.2)); };
  for (let i = 0; i < N; i++) line[i] = clamp(W.line[i], lo2(i), hi2(i));
  line = spread(line, 8, null);
  for (let i = 0; i < N; i++) line[i] = clamp(line[i], lo2(i), hi2(i));
  T.dMin = dMin; T.dMax = dMax; T.line = line;
  // the racing line and its curvature
  const lx = new Float32Array(N), lz = new Float32Array(N), fr = {};
  for (let i = 0; i < N; i++) { frameAt(i * ds, fr); lx[i] = fr.x + fr.rx * line[i]; lz[i] = fr.z + fr.rz * line[i]; }
  const raw = new Float32Array(N), H = 7;
  for (let i = 0; i < N; i++) {
    if (due()) await breathe();
    const a = (i - H + N) % N, b = (i + H) % N;
    const ax = lx[i] - lx[a], az = lz[i] - lz[a], bx = lx[b] - lx[i], bz = lz[b] - lz[i];
    const cr = ax * bz - az * bx, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(lx[b] - lx[a], lz[b] - lz[a]);
    raw[i] = 2 * cr / Math.max(1e-6, la * lb * lc);          // > 0 turns right (x east, z south)
  }
  const kl = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let j = -4; j <= 4; j++) s += raw[(i + j + N) % N]; kl[i] = s / 9; }
  // limit speed on the line, then what the car can actually reach under power and brakes
  const vp = new Float32Array(N), VMAX = 96;
  for (let i = 0; i < N; i++) { const k = Math.abs(kl[i]) / 0.985; vp[i] = k > PHYS.kAero * 1.02 ? Math.min(VMAX, Math.sqrt(PHYS.aMech / (k - PHYS.kAero))) : VMAX; }
  for (let pass = 0; pass < 2; pass++) {
    if (due()) await breathe();
    for (let t = 0; t < 2 * N; t++) { const i = t % N, j = (i + 1) % N, lat = Math.min(1, vp[i] * vp[i] * Math.abs(kl[i]) / grip(vp[i])), a = Math.max(0.5, driveAcc(vp[i])) * Math.sqrt(1 - 0.75 * lat * lat); vp[j] = Math.min(vp[j], Math.sqrt(vp[i] * vp[i] + 2 * a * ds)); }
    for (let t = 2 * N; t > 0; t--) { const i = t % N, j = (i - 1 + N) % N, lat = Math.min(1, vp[i] * vp[i] * Math.abs(kl[i]) / grip(vp[i])), b = brakeAcc(vp[i]) * 0.93 * Math.sqrt(1 - 0.75 * lat * lat); vp[j] = Math.min(vp[j], Math.sqrt(vp[i] * vp[i] + 2 * b * ds)); }
  }
  T.lx = lx; T.lz = lz; T.kl = kl; T.vp = vp;
  let lap = 0; for (let i = 0; i < N; i++) lap += ds / vp[i];
  T.lapTime = lap;
  buildWalls();
  return T;
}
const lerpA = (a, s) => { const f = ((s / TRACK.ds) % TRACK.N + TRACK.N) % TRACK.N, i = f | 0, j = (i + 1) % TRACK.N; return a[i] + (a[j] - a[i]) * (f - i); };
export const lineAt = (s) => lerpA(TRACK.line, s);
export const vpAt = (s) => { const f = ((s / TRACK.ds) % TRACK.N + TRACK.N) % TRACK.N, i = f | 0, j = (i + 1) % TRACK.N; return TRACK.vp[i] + (TRACK.vp[j] - TRACK.vp[i]) * (f - i); };

/* walls: mapped barriers and building outlines, in a hash grid */
const CELL = 24; let wallSeg = null, wallGrid = null;
function buildWalls() {
  const segs = [], ns = {};
  const addLine = (pts, closed) => {
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) continue;
      // nothing solid may stand inside the corridor the cars use
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, n = nearestStation(mx, mz, ns);
      if (n && n.dist < 30) { const j = Math.floor(n.s / TRACK.ds) % TRACK.N; if (n.d > TRACK.dMin[j] - 0.4 && n.d < TRACK.dMax[j] + 0.4) continue; }
      segs.push(a[0], a[1], b[0], b[1]);
    }
  };
  // only what is drawn is solid: a wall nobody can see is a trap
  for (const b of W.barriers) if (drawnBarrier(b)) addLine(b.pts, false);
  for (const b of W.buildings) if (drawnBuilding(b)) addLine(b.pts, true);
  wallSeg = new Float32Array(segs); wallGrid = new Map();
  for (let k = 0; k < wallSeg.length; k += 4) {
    const x0 = Math.floor(Math.min(wallSeg[k], wallSeg[k + 2]) / CELL), x1 = Math.floor(Math.max(wallSeg[k], wallSeg[k + 2]) / CELL);
    const z0 = Math.floor(Math.min(wallSeg[k + 1], wallSeg[k + 3]) / CELL), z1 = Math.floor(Math.max(wallSeg[k + 1], wallSeg[k + 3]) / CELL);
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const key = i * 4096 + j; (wallGrid.get(key) || wallGrid.set(key, []).get(key)).push(k); }
  }
  TRACK.walls = wallSeg.length / 4;
}
// push a circle out of the walls; returns the contact normal (nx, nz, depth) of the deepest hit or null
const _hit = { nx: 0, nz: 0, depth: 0 };
function wallHit(x, z, r) {
  let best = null, bd = 0;
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const list = wallGrid.get(i * 4096 + j); if (!list) continue;
    for (const k of list) {
      const ax = wallSeg[k], az = wallSeg[k + 1], ex = wallSeg[k + 2] - ax, ez = wallSeg[k + 3] - az;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), 0, 1);
      const dx = x - (ax + ex * t), dz = z - (az + ez * t), d = Math.hypot(dx, dz);
      if (d < r && r - d > bd) { bd = r - d; _hit.nx = d > 1e-4 ? dx / d : -ez / Math.hypot(ex, ez); _hit.nz = d > 1e-4 ? dz / d : ex / Math.hypot(ex, ez); _hit.depth = bd; best = _hit; }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ shared car state */
class Body {
  constructor(name) {
    this.name = name;
    this.x = 0; this.z = 0; this.y = 0; this.psi = 0;          // heading: forward = (cos psi, sin psi) in (x, z)
    this.u = 0; this.w = 0;                                    // speed along and across the car (m/s)
    this.yaw = 0; this.steer = 0;                              // yaw rate, front wheel angle (rad)
    this.ax = 0; this.ay = 0;                                  // accelerations felt (m/s^2), for body motion and sound
    this.throttle = 0; this.brake = 0; this.boost = 0; this.energy = 1; this.draft = 0;
    this.gear = 1; this.rpm = 5000; this.shiftT = 0;
    this.s = 0; this.d = 0; this.prog = 0; this.hw = 6; this.surface = 1; this.kerb = 0;
    this.slip = 0; this.impact = 0; this.wheelAng = 0; this.wheelAngR = 0; this.spinR = 0;
    this.pitch = 0; this.rollA = 0; this.nx = 0; this.ny = 1; this.nz = 0; this._ns = {};
    this.wheelY = new Float32Array(4); this.wheelLift = new Float32Array(4);   // FR, FL, RR, RL (see WHEELS)
    this.yPlane = 0; this.vBody = 0;
    this.lap = 0; this.lapStart = 0; this.laps = []; this.done = false; this.finishT = 0;
  }
  get speed() { return Math.hypot(this.u, this.w); }
  locate() {
    const n = nearestStation(this.x, this.z, this._ns);
    if (n) { const ds = n.s - this.s, L = W.L, dd = ds > L / 2 ? ds - L : ds < -L / 2 ? ds + L : ds; if (Math.abs(dd) < 120) this.prog += dd; this.s = n.s; this.d = n.d; this.hw = n.hw; this.kerbW = n.kerb; }
    else this.d = 9999;                                       // nowhere near the circuit (free roam)
  }
  // Height, slope and bank from where the four tyres touch down (once per frame). The body plane goes through the
  // axle midpoints with no smoothing, so the tyres never sink on a climb or float on a descent; whatever one tyre
  // sits above or below that plane (a kerb under one wheel, a twist in the road) is that wheel's suspension travel.
  settle(dt) {
    const c = Math.cos(this.psi), s = Math.sin(this.psi), W2 = WHEELS, h = this.wheelY;
    for (let k = 0; k < 4; k++) { const [ax, az] = W2[k]; h[k] = contactAt(this.x + c * ax - s * az, this.z + s * ax + c * az); }
    const yF = (h[0] + h[1]) / 2, yR = (h[2] + h[3]) / 2;
    const yp = (yF + yR) / 2, sp = (yF - yR) / (W2[0][0] - W2[2][0]), bp = ((h[0] - h[1]) / (2 * W2[0][1]) + (h[2] - h[3]) / (2 * W2[2][1])) / 2;
    /* The body rides on springs. It follows the plane of the four contact points through a spring (2.6 Hz) and a
       damper that acts on the difference in vertical speed, so a steady climb is followed with no lag at all and
       a bump in the road moves the wheels more than the car. Slope and bank ease in over a few hundredths of a
       second. The tyres take up the difference (wheelLift), which is what keeps them on the ground. */
    // (a jump of more than 0.6 m beyond what the car's own speed explains is a reset or a teleport: start the springs afresh.
    // Measured against the speed, because on a steep climb at 300 km/h a slow frame alone rises more than 0.6 m.)
    if (dt > 0 && this.slope !== undefined && Math.abs(yp - this.yPlane) < 0.6 + Math.abs(this.u) * dt * 0.5) {
      const vp = (yp - this.yPlane) / dt, w = 2 * Math.PI * 2.6, n = Math.max(1, Math.ceil(dt / 0.006)), hdt = dt / n;
      for (let k = 0; k < n; k++) { const yq = this.yPlane + vp * hdt * (k + 1); this.vBody += (w * w * (yq - this.y) + 2 * 0.8 * w * (vp - this.vBody)) * hdt; this.y += this.vBody * hdt; }
      if (Math.abs(this.y - yp) > 0.05) { this.y = yp + Math.sign(this.y - yp) * 0.05; this.vBody = vp; }
      const ks = 1 - Math.exp(-dt / 0.045);
      this.slope += (sp - this.slope) * ks; this.bank += (bp - this.bank) * ks;
    } else { this.y = yp; this.vBody = 0; this.slope = sp; this.bank = bp; }
    this.yPlane = yp;
    for (let k = 0; k < 4; k++) { const [ax, az] = W2[k]; this.wheelLift[k] = clamp(h[k] - (this.y + this.slope * ax + this.bank * az), -0.12, 0.07); }
    // body motion on the springs (the wheels stay put: see CarView.sync)
    this.pitch = damp(this.pitch, clamp(-this.ax * 0.0006, -0.011, 0.009), 9, dt);
    this.rollA = damp(this.rollA, clamp(this.ay * 0.0003, -0.014, 0.014), 9, dt);
  }
  gears(dt) {
    const v = Math.abs(this.u), g = gearFor(v, this.gear);
    if (g !== this.gear) { this.shiftDir = g > this.gear ? 1 : -1; this.gear = g; this.shiftT = 0.09; }
    this.shiftT = Math.max(0, this.shiftT - dt);
    const target = rpmFor(v, this.gear) + (this.spinR > 0 ? 2500 * this.spinR : 0);
    this.rpm = damp(this.rpm, Math.min(12600, target), 22, dt);
  }
  lapCheck(t, race) {
    const L = W.L, lap = Math.floor(this.prog / L);
    if (lap > this.lap) {
      // from the grid the cars start behind the line: crossing it the first time begins lap 1, it is not a lap done
      const full = this.lap >= 0;
      if (full) this.laps.push(t - this.lapStart);
      this.lapStart = t; this.lap = lap; if (lap >= race.laps && !this.done) { this.done = true; this.finishT = t; }
      return full;
    }
    return false;
  }
}

/* ------------------------------------------------------------------ the player's car */
export class Car extends Body {
  constructor() { super('player'); this.offT = 0; this.wrongT = 0; this.stuckT = 0; this.ghost = 0; this.auto = null; this.roam = false; this.road = null; }
  // free roam: stand the car anywhere, facing psi
  placeAt(x, z, psi, v = 0) {
    this.x = x; this.z = z; this.psi = psi; this.u = v; this.w = 0; this.yaw = 0; this.steer = 0; this.rev = false; this.impact = 0;
    this.gear = gearFor(v, 1); this.rpm = rpmFor(v, this.gear); this.locate(); this.settle(0);
  }
  place(s, d, v) {
    const fr = frameAt(s, {});
    this.x = fr.x + fr.rx * d; this.z = fr.z + fr.rz * d; this.psi = Math.atan2(fr.dz, fr.dx);
    this.u = v; this.w = 0; this.yaw = 0; this.steer = 0; this.s = s; this.d = d; this.y = surfaceAt(this.x, this.z); this.slope = undefined; this.bank = undefined;
    this.gear = gearFor(v, 1); this.rpm = rpmFor(v, this.gear); this.impact = 0; this.offT = 0; this.wrongT = 0; this.stuckT = 0;
    this.settle(0);
  }
  // inp: { steer -1..1 (+ right), throttle, brake, boost }; assist: 0 off, 1 brake help, 2 full
  step(dt, inp, assist, other) {
    this.locate();
    const fr = frameAt(this.s, this._fr || (this._fr = {}));
    const onRoad = Math.abs(this.d) < this.hw + (this.kerbW || 0) + 0.25;
    // free roam: off the circuit the car may be on one of the public roads (roads.js)
    let rd = null;
    if (this.roam && !onRoad) { rd = nearestRoad(this.x, this.z, this._rd || (this._rd = {}), this.psi + clamp(inp.steer, -1, 1) * 0.7); if (rd && Math.abs(rd.d) > rd.hw + 3) rd = null; }
    this.road = rd;
    const cls = onRoad || (rd && Math.abs(rd.d) < rd.hw + 0.2) ? 1 : groundClass(this.x, this.z);
    this.surface = cls; this.kerb = onRoad && Math.abs(this.d) > this.hw - 0.2 ? 1 : 0;
    const mu = cls === 1 ? 1 : cls === 2 ? 0.5 : 0.6;
    let steerIn = clamp(inp.steer, -1, 1), thr = clamp(inp.throttle, 0, 1), brk = clamp(inp.brake, 0, 1);
    const v = Math.abs(this.u), trackPsi = Math.atan2(fr.dz, fr.dx), headErr = wrapPi(trackPsi - this.psi);

    // ---- assists
    // which way the road runs for this car: along the circuit (either way round in free roam), or along a public road
    let refPsi = null, sgn = 1;
    if (rd) { sgn = rd.tx * Math.cos(this.psi) + rd.tz * Math.sin(this.psi) >= 0 ? 1 : -1; refPsi = roadAhead(rd, v * 0.15, sgn, this._ra || (this._ra = {})).psi; }
    else if (onRoad || !this.roam) {
      const back = this.roam && Math.abs(headErr) > Math.PI / 2, a3 = frameAt(this.s + (back ? -1 : 1) * v * 0.15, this._f3 || (this._f3 = {}));
      refPsi = Math.atan2(a3.dz, a3.dx) + (back ? Math.PI : 0); if (back) sgn = -1;
    }
    let vLim = vpAt(this.s + clamp(v * 0.05, 0, 6));
    if (rd) vLim = roadSpeed(rd, sgn, v, grip(v) * 0.6 * mu);            // public road: slow enough for the bends ahead
    else if (this.roam && (sgn < 0 || !onRoad)) vLim = 1e9;                // the wrong way round the circuit, or open ground: no advice
    if (assist >= 1 && (onRoad || rd) && (rd || this.roam || Math.abs(headErr) < 1.2)) {
      const over = v - vLim * (assist >= 2 ? 0.95 : 1.04);
      if (over > 0) { brk = Math.max(brk, clamp(over / 5, 0, 1)); thr = Math.min(thr, 1 - clamp(over / 2, 0, 1)); }
    }
    if (assist >= 1 && other && !this.rev) {
      // do not ram the car in front: tucked in behind it the help lifts, so the car sits in the tow until the driver pulls out
      const dx = other.x - this.x, dz = other.z - this.z, c0 = Math.cos(this.psi), s0 = Math.sin(this.psi), gapA = dx * c0 + dz * s0, side = -dx * s0 + dz * c0;
      if (gapA > 4.8 && gapA < 16 && Math.abs(side) < 1.7) {
        const tgt = other.u + (gapA - 7) * 1.1;
        if (v > tgt) { thr = Math.min(thr, 0.15); if (v > tgt + 1.5) brk = Math.max(brk, clamp((v - tgt - 1.5) / 6, 0, 0.7)); }
      }
    }
    if (assist >= 2 && v > 8 && !rd && sgn > 0 && (onRoad || !this.roam)) {
      // hold the racing line when the driver is not steering much (this form does the slow corners)
      const la = clamp(v * 0.22, 6, 26), f2 = frameAt(this.s + la, this._f2 || (this._f2 = {}));
      const ln = lineAt(this.s + la), tx = f2.x + f2.rx * ln, tz = f2.z + f2.rz * ln;
      const want = wrapPi(Math.atan2(tz - this.z, tx - this.x) - this.psi);
      const dmax = Math.min(0.42, Math.atan(PHYS.L * 1.15 * grip(v) * EDGE * mu / Math.max(v * v, 60)));
      const help = steerFor(want, Math.hypot(tx - this.x, tz - this.z), dmax), wgt = 1 - clamp(Math.abs(steerIn) * 1.5, 0, 1);
      steerIn = clamp(steerIn + help * wgt, -1, 1);
    }
    if (v > 5 && refPsi !== null && Math.abs(wrapPi(refPsi - this.psi)) < 1.0) {
      /* How the car steers (every help level). A racing car turns so hard that a key held a third of a second, or a
         thumb moved a centimetre, throws it off the road: at 300 km/h three degrees of heading is 4 m/s of drift.
         So the driver's input is read as "move across the road": the car aims along the road ahead plus an angle set
         by the input (at most ~7.5 m/s sideways), and with no input it runs parallel to the road. Grip is unchanged:
         too fast for a corner and the car still runs wide. Below walking pace, and whenever the car is pointing well
         away from the road's direction, the wheel is direct. */
      const TAU = 0.15, k = clamp((v - 5) / 8, 0, 1), blend = k * k * (3 - 2 * k);
      const maxAng = clamp(7.5 / v, 0.06, 0.4);
      let ang = clamp(inp.steer, -1, 1) * maxAng;
      const hands = 1 - clamp(Math.abs(inp.steer) * 1.5, 0, 1);
      if (assist >= 2 && !rd && sgn > 0) ang += clamp((lineAt(this.s + v * TAU) - this.d) / Math.max(v * 0.8, 8), -maxAng, maxAng) * hands;
      if (assist >= 2 && rd) ang += clamp((rd.hw * 0.42 - rd.d * sgn) / Math.max(v * 0.8, 8), -maxAng, maxAng) * hands;     // keep to the right-hand lane
      const rFull = 1.15 * grip(v) * EDGE * mu / Math.max(v, 4);                 // yaw rate at full lock
      const cmd = clamp(wrapPi(refPsi + ang - this.psi) / TAU / rFull, -1, 1);
      steerIn += (cmd - steerIn) * blend;
    } else if (v > 14) steerIn *= clamp(14 / v, 0.3, 1);        // no road to follow (open ground, or sideways): a gentler wheel at speed
    if (this.auto) { const a = this.auto(this, fr); steerIn = a.steer; thr = a.throttle; brk = a.brake; }

    // ---- along the car
    this.boost = inp.boost && this.energy > 0.02 && thr > 0.5 ? 1 : 0;
    if (this.boost) this.energy = Math.max(0, this.energy - dt / 9); else this.energy = Math.min(1, this.energy + dt * (0.022 + 0.11 * brk * clamp(v / 60, 0, 1)));
    let draft = 0;
    if (other) {
      const dx = other.x - this.x, dz = other.z - this.z, c = Math.cos(this.psi), s = Math.sin(this.psi), ahead = dx * c + dz * s, side = -dx * s + dz * c;
      if (ahead > 3 && ahead < 70 && Math.abs(side) < 2.6) draft = clamp((70 - ahead) / 45, 0, 1) * clamp((2.6 - Math.abs(side)) / 1.2, 0, 1) * clamp((v - 40) / 25, 0, 1);
    }
    this.draft = damp(this.draft, draft, 3, dt);
    let ax;
    const trac = cls === 1 ? 1 : cls === 2 ? 0.3 : 0.45;
    if (this.rev) { ax = -6 * brk; if (this.u < -9) ax = 0; }
    else ax = thr * (this.shiftT > 0 ? 0.25 : 1) * driveAcc(v, this.boost, this.draft) * trac + (1 - thr) * (-PHYS.kDrag * v * v - PHYS.roll - 1.2);
    if (!this.rev && brk > 0 && this.u > 0) ax -= brk * (brakeAcc(v) - PHYS.kDrag * v * v) * mu;
    if (cls !== 1) ax -= Math.sign(this.u) * (cls === 2 ? 4 + 0.2 * v : 2 + 0.09 * v);
    // reverse gear: hold the brake at a standstill
    if (!this.rev && v < 0.6 && brk > 0.6 && thr < 0.1) { this.revT = (this.revT || 0) + dt; if (this.revT > 0.45) this.rev = true; } else if (!this.rev) this.revT = 0;
    if (this.rev && (thr > 0.2 || brk < 0.1)) { this.rev = false; this.revT = 0; }
    if (this.rev && thr > 0.2) ax = 8;

    // ---- across the car: kinematic steering while the tyres can hold it, sliding wide when they cannot
    const aLat = grip(v) * EDGE * mu * Math.sqrt(Math.max(0.2, 1 - 0.55 * Math.min(1, (ax / (ax > 0 ? 16 : brakeAcc(v))) ** 2)));
    const dmax = Math.min(0.42, Math.atan(PHYS.L * 1.15 * aLat / Math.max(v * v, 60)));
    this.steer = damp(this.steer, steerIn * dmax, 14, dt);
    let r = this.u * Math.tan(this.steer) / PHYS.L;
    const rMax = 1.15 * aLat / Math.max(v, 4);
    const sat = Math.abs(r) > rMax ? 1 : 0; r = clamp(r, -rMax, rMax);
    this.yaw = damp(this.yaw, r, 16, dt);
    const need = this.yaw * this.u - this.w / 0.09;             // lateral acceleration wanted from the tyres (+ = to the right)
    const ay = clamp(need, -aLat, aLat);
    const over = Math.abs(need) - aLat;
    this.slip = damp(this.slip, clamp(Math.max(over / 12, Math.abs(this.w) / 5) + (brk > 0.9 && v > 12 ? 0.25 : 0), 0, 1), 10, dt);
    if (over > 0) ax -= clamp(over * 0.12, 0, 5);               // scrubbing speed when overdriven
    this.w += (ay - this.yaw * this.u) * dt;
    this.w *= Math.exp(-0.6 * dt);
    this.u += (ax + this.yaw * this.w * 0.0) * dt;
    if (!this.rev && this.u < 0) this.u = 0;
    this.ax = damp(this.ax, ax, 12, dt); this.ay = damp(this.ay, ay, 12, dt);
    // wheelspin off the line on full throttle
    this.spinR = damp(this.spinR, thr > 0.9 && v < 22 && !this.rev ? clamp(1 - v / 22, 0, 1) : 0, 8, dt);

    // ---- move
    const c = Math.cos(this.psi), s = Math.sin(this.psi);
    this.x += (this.u * c - this.w * s) * dt; this.z += (this.u * s + this.w * c) * dt;
    this.psi = wrapPi(this.psi + this.yaw * dt);
    this.throttle = thr; this.brake = brk;

    // ---- walls
    this.impact = Math.max(0, this.impact - dt * 3);
    for (const off of [1.75, -1.6]) {
      const px = this.x + Math.cos(this.psi) * off, pz = this.z + Math.sin(this.psi) * off, h = wallHit(px, pz, 0.98);
      if (!h) continue;
      this.x += h.nx * h.depth; this.z += h.nz * h.depth;
      const c2 = Math.cos(this.psi), s2 = Math.sin(this.psi);
      let vx = this.u * c2 - this.w * s2, vz = this.u * s2 + this.w * c2;
      const vn = vx * h.nx + vz * h.nz;
      if (vn < 0) {
        vx -= 1.2 * vn * h.nx; vz -= 1.2 * vn * h.nz;
        const fr2 = Math.exp(-(0.2 + Math.min(3, -vn * 0.25)) * 0.1); vx *= fr2; vz *= fr2;      // a glancing touch costs little, a square hit a lot
        this.impact = Math.max(this.impact, clamp(-vn / 14, 0.08, 1));
        // turn the nose along the wall so the car slides off instead of sticking
        const tx = -h.nz, tz = h.nx, sgn = Math.sign(tx * c2 + tz * s2) || 1, want = Math.atan2(tz * sgn, tx * sgn);
        this.psi = wrapPi(this.psi + wrapPi(want - this.psi) * clamp(0.25 + -vn * 0.03, 0, 0.7) * (off > 0 ? 1 : 0.3));
        const c3 = Math.cos(this.psi), s3 = Math.sin(this.psi);
        this.u = vx * c3 + vz * s3; this.w = (-vx * s3 + vz * c3) * 0.5; this.yaw *= 0.4;
      }
    }
    this.gears(dt);
    this.wheelAng += this.u / PHYS.R * dt; this.wheelAngR += (this.u / PHYS.R + this.spinR * 60) * dt;

    // ---- trouble: far off the circuit, facing the wrong way, or stuck
    const far = !this.roam && (Math.abs(this.d) > this.hw + 55 || (cls !== 1 && Math.abs(this.d) > this.hw + 28));
    this.offT = far ? this.offT + dt : 0;
    this.wrongT = !this.roam && Math.abs(headErr) > 2.0 && v > 4 ? this.wrongT + dt : 0;
    // free roam: a tree trunk stops the car
    if (this.roam && cls !== 1 && Math.abs(this.u) > 1 && treeWithin(this.x + Math.cos(this.psi) * 1.9 * Math.sign(this.u), this.z + Math.sin(this.psi) * 1.9 * Math.sign(this.u), 0.55)) {
      this.impact = Math.max(this.impact, clamp(Math.abs(this.u) / 14, 0.15, 1)); this.x -= Math.cos(this.psi) * 0.25 * Math.sign(this.u); this.z -= Math.sin(this.psi) * 0.25 * Math.sign(this.u); this.u *= -0.25; this.w *= 0.3;
    }
    this.stuckT = v < 1.5 && thr > 0.5 && !this.rev ? this.stuckT + dt : 0;
    this.ghost = Math.max(0, this.ghost - dt);
  }
  // put the car back on the circuit, rolling
  reset() {
    if (this.roam) {
      // free roam: back onto the nearest road, facing the way the car was going
      const rd = nearestRoad(this.x, this.z, {}, this.psi);
      if (rd && Math.abs(this.d) > this.hw + 6) { const sg = rd.tx * Math.cos(this.psi) + rd.tz * Math.sin(this.psi) >= 0 ? 1 : -1; this.placeAt(this.x - (-rd.tz) * rd.d, this.z - rd.tx * rd.d, Math.atan2(rd.tz * sg, rd.tx * sg), 0); return; }
      if (Math.abs(this.d) > this.hw + 30) { this.u = 0; this.w = 0; return; }
    }
    const s = this.s, prog = this.prog; this.place(s, lineAt(s), this.roam ? 0 : 28); this.prog = prog; this.ghost = 1.6; this.rev = false;
  }
}

/* ------------------------------------------------------------------ the rival: drives the racing line on rails */
// pace: fraction of the racing line's limit speed in corners. ease: how much the rival gives away when it is well
// clear in front (so a mistake does not end the race). push: how much it finds when it is behind.
export const SKILL = { rookie: { pace: 0.915, ease: 0.11, push: 0.035 }, pro: { pace: 0.965, ease: 0.085, push: 0.045 }, legend: { pace: 1.005, ease: 0.045, push: 0.04 } };
export class Rival extends Body {
  constructor(label = 'Voss', idx = 0) { super('rival'); this.label = label; this.idx = idx; this.active = idx === 0; this.dOff = 0; this.dRate = 0; this.skill = SKILL.pro; this.pace = 1; this.hold = 0; }
  place(s, d, v) {
    this.s = ((s % W.L) + W.L) % W.L; this.dOff = d - lineAt(s); this.u = v; this.w = 0; this.dRate = 0;
    this.gear = gearFor(v, 1); this.rpm = rpmFor(v, this.gear); this.pose(0); this.y = surfaceAt(this.x, this.z); this.slope = undefined; this.bank = undefined; this.settle(0);
  }
  pose(dt) {
    const fr = frameAt(this.s, this._fr || (this._fr = {}));
    const lo = lerpA(TRACK.dMin, this.s), hi = lerpA(TRACK.dMax, this.s), ln = lineAt(this.s);
    this.dOff = clamp(this.dOff, lo - ln, hi - ln);
    const d = ln + this.dOff;
    this.d = d; this.hw = fr.hw;
    const px = this.x, pz = this.z;
    this.x = fr.x + fr.rx * d; this.z = fr.z + fr.rz * d;
    if (dt > 0 && this.u > 2) { const want = Math.atan2(this.z - pz, this.x - px); this.psi = wrapPi(this.psi + wrapPi(want - this.psi) * (1 - Math.exp(-20 * dt))); }
    else this.psi = Math.atan2(fr.dz, fr.dx);
    return fr;
  }
  step(dt, P, race) {
    const T = TRACK, i = Math.floor(this.s / T.ds) % T.N, v = this.u, sk = this.skill;
    const gap = P.prog - this.prog;                              // > 0: the player is ahead
    // pace: a little more when chasing, a little less when clear in front, so the fight stays close
    let pace = sk.pace;
    let easing = 0;
    if (gap > 0) pace += sk.push * clamp(gap / 70, 0, 1);
    else if (gap < -20) { easing = clamp((-gap - 20) / 140, 0, 1); pace -= sk.ease * easing; }
    this.pace = damp(this.pace, pace, 1.5, dt);
    const lim = vpAt(this.s + 2), st = clamp((lim - 82) / 13, 0, 1);
    let vt = lim * (this.pace + (1 - this.pace) * st * st * (3 - 2 * st));       // the pace factor is for corners; straights are flat out
    vt *= 1 - 0.5 * sk.ease * easing * st;                                       // ... unless it is far ahead: then it lifts a little there too
    // off the line in a corner costs speed
    const offLine = Math.abs(this.dOff);
    vt *= 1 - clamp(offLine / 6, 0, 1) * clamp(Math.abs(T.kl[i]) * 60, 0, 1) * 0.07;

    // ---- where to put the car. The car it deals with (A) is the nearest one ahead within 45 m, the player or
    // another rival; with nobody that close ahead it is the player, wherever the player is.
    let A = P, gapA = gap;
    if (race.rivals.length > 1) for (const o of race.rivals) { if (o === this) continue; const g = o.prog - this.prog; if (g > 0 && g < 45 && (gapA <= 0 || g < gapA)) { A = o; gapA = g; } }
    let dTarget = 0;                                             // offset from the racing line
    const lineD = this.d - this.dOff, pd = A.d - lineD;          // that car's offset from the line
    const closing = v - A.u;
    if (gapA > 0 && gapA < 45 && (closing > -1.5 || gapA < 12)) {
      // attack: go for the side with more room
      const roomR = T.dMax[i] + 1.15 - A.d, roomL = A.d - T.dMin[i] + 1.15, side = roomR > roomL ? 1 : -1, room = side > 0 ? roomR : roomL;
      if (room > 3.5) dTarget = pd + side * 2.7;
      else if (gapA < 9) vt = Math.min(vt, A.u + 0.3 + gapA * 0.25);        // no room: sit behind
      if (gapA < 9 && Math.abs(this.d - A.d) < 2.2) vt = Math.min(vt, A.u + (gapA - 5.6) * 0.8);
    } else if (gap < 0 && gap > -30 && v - P.u < 1.5) {
      // defend against the player: one move towards the side the player is on, kept gentle
      dTarget = clamp(P.d - lineD, -1.6, 1.6) * 0.75;
    }
    // alongside any car: give it room
    for (const o of race.cars) { if (o === this) continue; if (Math.abs(o.prog - this.prog) < 7 && Math.abs(this.d - o.d) < 2.4) { dTarget = this.dOff + Math.sign(this.d - o.d || (this.idx % 2 ? -1 : 1)) * 1.2; break; } }
    dTarget = clamp(dTarget, T.dMin[i] - lineD, T.dMax[i] - lineD);
    // A car moves sideways only by driving forward: about 8 degrees off the road's direction at most, and not at all
    // before the lights go out. (It used to cross the grid sideways, standing still, while the lights counted down.)
    const latMax = race.state === 'green' || race.state === 'done' ? Math.min(2.6, v * 0.14) : 0;
    const rate = clamp((dTarget - this.dOff) * 1.6, -latMax, latMax);
    this.dRate = latMax ? clamp(damp(this.dRate, rate, 5, dt), -latMax, latMax) : 0;
    this.dOff += this.dRate * dt;

    // ---- speed
    let draft = 0;
    if (gapA > 3 && gapA < 70 && Math.abs(this.d - A.d) < 2.6) draft = clamp((70 - gapA) / 45, 0, 1) * clamp((v - 40) / 25, 0, 1);
    this.draft = damp(this.draft, draft, 3, dt);
    const wantBoost = (gap > 2 && gap < 60) || (gap < 0 && gap > -18);
    this.boost = wantBoost && this.energy > 0.05 && v < vt - 1 && v > 45 ? 1 : 0;
    if (this.boost) this.energy = Math.max(0, this.energy - dt / 9); else this.energy = Math.min(1, this.energy + dt * 0.035);
    let ax;
    if (race.state !== 'green' && race.state !== 'done') ax = -v / Math.max(dt, 1e-3);
    else if (this.hold > 0) { this.hold -= dt; ax = 0; }
    else if (v < vt) ax = Math.min(driveAcc(v, this.boost, this.draft) * (this.shiftT > 0 ? 0.25 : 1), (vt - v) / dt);
    else ax = -Math.min(brakeAcc(v) * 0.95, (v - vt) / dt);
    if (this.done) ax = Math.min(ax, v > 30 ? -6 : 0);
    this.u = Math.max(0, v + ax * dt);
    const fr0 = this._fr || frameAt(this.s, this._fr = {});
    const ds = this.u * dt / clamp(1 + fr0.kappa * this.d, 0.6, 1.5);        // kappa > 0 turns left, d > 0 is to the right: the outside is longer
    this.s = (this.s + ds) % W.L; this.prog += ds;
    this.pose(dt);
    const lat = this.u * this.u * T.kl[i];
    this.ax = damp(this.ax, ax, 12, dt); this.ay = damp(this.ay, lat, 12, dt); this.yaw = this.u * T.kl[i];
    this.steer = damp(this.steer, Math.atan(PHYS.L * T.kl[i]) + this.dRate * 0.02, 12, dt);
    this.throttle = ax > 0.5 ? 1 : 0; this.brake = ax < -3 ? 1 : 0;
    this.slip = damp(this.slip, ax < -30 ? 0.3 : 0, 8, dt);
    this.spinR = damp(this.spinR, this.throttle && v < 20 ? clamp(1 - v / 20, 0, 1) : 0, 8, dt);
    this.gears(dt);
    this.wheelAng += this.u / PHYS.R * dt; this.wheelAngR += (this.u / PHYS.R + this.spinR * 60) * dt;
  }
}

/* a driver for the player's car when nobody is driving it: follows the racing line at `pace` of the limit */
export function autopilot(pace = 0.9) {
  const f2 = {};
  return (car) => {
    const v = Math.abs(car.u), la = clamp(v * 0.24, 7, 30); frameAt(car.s + la, f2);
    const ln = lineAt(car.s + la), want = wrapPi(Math.atan2(f2.z + f2.rz * ln - car.z, f2.x + f2.rx * ln - car.x) - car.psi);
    const dmax = Math.min(0.42, Math.atan(PHYS.L * 1.15 * grip(v) * EDGE / Math.max(v * v, 60)));
    const vt = vpAt(car.s + v * 0.06) * pace;
    return { steer: steerFor(want, Math.hypot(f2.x + f2.rx * ln - car.x, f2.z + f2.rz * ln - car.z), dmax), throttle: v < vt ? 1 : 0, brake: v > vt + 0.4 ? clamp((v - vt) / 4, 0, 1) : 0 };
  };
}

/* contact between the two cars */
export function touch(P, R, dt) {
  if (P.ghost > 0) return 0;
  const c = Math.cos(R.psi), s = Math.sin(R.psi), dx = P.x - R.x, dz = P.z - R.z;
  const lon = dx * c + dz * s, lat = -dx * s + dz * c;
  const pl = 5.5 - Math.abs(lon), pw = 1.95 - Math.abs(lat);
  if (pl <= 0 || pw <= 0) return 0;
  let hit = 0;
  if (pw < pl * 0.5) {
    // side by side: push apart sideways, mostly the player
    const k = Math.sign(lat) || 1;
    P.x += -s * k * pw * 0.7; P.z += c * k * pw * 0.7; R.dOff -= k * pw * 0.3;
    const rel = wrapPi(P.psi - R.psi), wRel = P.w * Math.cos(rel) + P.u * Math.sin(rel);
    if (wRel * k < 0) { P.w -= wRel * Math.cos(rel) * 0.8; hit = clamp(Math.abs(wRel) / 6, 0.05, 0.6); }
  } else if (lon < 0) {
    // the player runs into the back of the rival
    P.x -= c * pl; P.z -= s * pl;
    if (P.u > R.u - 0.5) { hit = clamp((P.u - R.u) / 12, 0.05, 0.8); const m = (P.u + R.u) / 2; P.u = Math.min(P.u, m - 0.6); R.u = Math.max(R.u, m + 0.3); }
  } else {
    // the rival runs into the back of the player
    R.s = (R.s - pl + W.L) % W.L; R.prog -= pl;
    if (R.u > P.u - 0.5) { hit = clamp((R.u - P.u) / 12, 0.05, 0.8); const m = (P.u + R.u) / 2; R.u = Math.min(R.u, m - 0.6); P.u = Math.max(P.u, m + 0.3); R.hold = 0.15; }
  }
  if (hit) P.impact = Math.max(P.impact, hit);
  return hit;
}

/* contact between two rivals. Both run on the racing line with an offset, so they are parted along it and across it:
   side by side each gives way sideways; nose to tail the one behind drops back and they trade a little speed. */
export function bump(A, B) {
  const c = Math.cos(B.psi), s = Math.sin(B.psi), dx = A.x - B.x, dz = A.z - B.z;
  const lon = dx * c + dz * s, lat = -dx * s + dz * c;
  const pl = 5.5 - Math.abs(lon), pw = 1.95 - Math.abs(lat);
  if (pl <= 0 || pw <= 0) return;
  if (pw < pl * 0.5) { const k = Math.sign(lat) || (A.idx < B.idx ? 1 : -1); A.dOff += k * pw * 0.5; B.dOff -= k * pw * 0.5; return; }
  const back = lon < 0 ? A : B, front = lon < 0 ? B : A;
  back.s = (back.s - pl + W.L) % W.L; back.prog -= pl;
  if (back.u > front.u - 0.5) { const m = (back.u + front.u) / 2; back.u = Math.min(back.u, m - 0.6); front.u = Math.max(front.u, m + 0.3); back.hold = 0.15; }
}

/* ------------------------------------------------------------------ the race */
// A race is the player and one to four rivals. The first rival is the one the opening film cuts to.
export const RIVALS = ['Voss', 'Halden', 'Marek', 'Ilves'];
export class Race {
  // R: one rival or the list of all that exist; `rivals` is the ones in this race, `cars` everyone in it
  constructor(P, R) { this.P = P; this.all = Array.isArray(R) ? R : [R]; this.R = this.all[0]; this.rivals = [this.R]; this.cars = [P, this.R]; this.state = 'idle'; this.t = 0; this.laps = 1; this.lights = 0; this.events = []; }
  // rolling: the player and the first rival already at speed (the cut from the opening film). grid: standing start
  // under the lights, `cars` cars in two columns, the rivals in order from pole and the player on the last slot.
  start({ laps = 1, mode = 'grid', s0 = 560, skill = 'pro', cars = 2 } = {}) {
    const P = this.P, L = W.L, n = mode === 'rolling' ? 1 : clamp(Math.round(cars) - 1, 1, this.all.length);
    this.all.forEach((r, k) => { r.active = k < n; });
    this.rivals = this.all.slice(0, n); this.cars = [P, ...this.rivals]; const R = this.R = this.rivals[0];
    this.laps = laps; this.t = 0; this.mode = mode; this.events.length = 0; this.result = null;
    for (const c of this.cars) { c.lap = 0; c.laps = []; c.lapStart = 0; c.done = false; c.finishT = 0; c.energy = 1; c.boost = 0; c.draft = 0; c.impact = 0; c.rev = false; }
    // the first rival drives at the chosen level; each one after it gives a little away in the corners and finds a little more when it is behind
    const base = SKILL[skill] || SKILL.pro;
    this.rivals.forEach((r, k) => { r.skill = k ? { pace: base.pace - 0.012 * k, ease: base.ease, push: base.push + 0.006 * k } : base; r.pace = r.skill.pace; r.hold = 0; });
    if (mode === 'rolling') {
      const v = vpAt(s0) * 0.97;
      P.place(s0, lineAt(s0), v); P.prog = s0;
      R.place(s0 + 17, lineAt(s0 + 17), v); R.prog = s0 + 17;
      this.state = 'green'; this.lights = -1;
    } else {
      // grid slot k: 9 m behind the line and 8 m a row, left then right
      const slot = (c, k) => { const sk = L - 9 - 8 * k, f = frameAt(sk, {}); c.place(sk, (k % 2 ? 1 : -1) * Math.min(2.6, f.hw - 2), 0); c.prog = -9 - 8 * k; };
      this.rivals.forEach(slot); slot(P, n);
      this.state = 'lights'; this.lights = 0; this.lightT = -0.8;
    }
    for (const c of this.cars) c.lap = Math.floor(c.prog / L);
  }
  update(dt) {
    const P = this.P;
    if (this.state === 'lights') {
      this.lightT += dt;
      const n = clamp(Math.floor(this.lightT / 0.9) + 1, 0, 5);
      if (n !== this.lights) { this.lights = n; this.events.push('light'); }
      if (this.lightT > 0.9 * 4 + 1.1) { this.state = 'green'; this.lights = -1; this.events.push('go'); this.rivals.forEach((r, k) => { r.hold = 0.22 + 0.06 * k; }); }
      return;
    }
    if (this.state !== 'green') return;
    this.t += dt;
    if (P.lapCheck(this.t, this)) this.events.push(P.done ? 'finish' : P.lap === this.laps - 1 ? 'final' : 'lap');
    for (const r of this.rivals) r.lapCheck(this.t, this);
    if (!this.result) {
      let first = null; for (const c of this.cars) if (c.done && (!first || c.finishT < first.finishT)) first = c;
      if (first) {
        const won = first === P;
        this.result = { won, t: this.t, gap: 0, first, pos: 0, n: this.cars.length };
        this.endT = this.t + (won ? 4.5 : this.rivals.length > 1 ? 10 : 7);
        this.events.push(won ? 'win' : 'lose');
      }
    }
    if (this.result) {
      // the gap that is told afterwards: the player to the winner, or the winner (the player) to the best of the rest
      const a = this.result.first, b = a === P ? this.best() : P;
      if (b.done && !this.result.gap) this.result.gap = b.finishT - a.finishT;
      const settled = P.done && this.t > P.finishT + 3.2 && (a !== P || this.rivals.every((r) => r.done));
      if (this.t > this.endT || settled) {
        if (!this.result.gap) this.result.gap = Math.max(0.1, (a.prog - b.prog) / Math.max(20, b.speed));
        this.result.pos = this.pos;
        this.state = 'done'; this.events.push('done');
      }
    }
  }
  // is rival r ahead of the player? (a finished car is ahead of one still running)
  ahead(r) { const P = this.P; return r.done ? !P.done || r.finishT < P.finishT : !P.done && r.prog > P.prog; }
  // the rival furthest on
  best() { let b = this.rivals[0]; for (const r of this.rivals) if (r.done ? !b.done || r.finishT < b.finishT : !b.done && r.prog > b.prog) b = r; return b; }
  // the rival the gap on the screen is to: the one just ahead of the player, or just behind when the player leads
  get ref() {
    const P = this.P; let up = null, dn = null;
    for (const r of this.rivals) { if (this.ahead(r)) { if (!up || r.prog < up.prog) up = r; } else if (!dn || r.prog > dn.prog) dn = r; }
    return up || dn || this.R;
  }
  // seconds the player is ahead (+) of that rival or behind (-)
  get gap() { const P = this.P, R = this.ref, d = P.prog - R.prog; return d / Math.max(18, d > 0 ? R.speed : P.speed); }
  get pos() { let p = 1; for (const r of this.rivals) if (this.ahead(r)) p++; return p; }
  // the rival the player's own car reacts to (the tow, and the help that will not ram): the nearest one in front of its nose
  near() {
    const P = this.P, c = Math.cos(P.psi), s = Math.sin(P.psi); let b = this.R, bd = 1e9;
    for (const r of this.rivals) { const dx = r.x - P.x, dz = r.z - P.z, f = dx * c + dz * s; if (f > -2 && f < bd && Math.abs(-dx * s + dz * c) < 6) { bd = f; b = r; } }
    return b;
  }
}
