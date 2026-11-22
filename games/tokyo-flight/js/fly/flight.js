// flight.js — how the aircraft flies. No drawing in here, so it also runs in Node (tools/fly/run.mjs).
//
// Forces are worked out from the air actually meeting the wing: lift and drag from the angle of attack and the
// speed, thrust from a turbojet that takes time to spool, weight. The flight path therefore bends the way a real
// one does: pull and the nose leads, the wing loads up, the path follows, speed bleeds off in a hard turn, and
// below about 100 km/h the wing lets go.
// Turning the airframe is simpler than the real thing: the stick asks for a rate of roll, pitch or yaw, and the
// aircraft takes it up as fast as the air over the control surfaces allows (little at low speed, none stopped).
//
// Two ways to fly it:
//   easy   left / right sets a bank and the turn is held level for you; the nose stays where you leave it;
//          the wing cannot be stalled. This is what touch and keyboard get by default.
//   real   the stick is the stick: roll rate, pitch rate, rudder. Rolls and loops are yours to fly.
//
// Body frame: -Z forward, +Y up, +X starboard. World: x east, y up, z south (geo.js).
import { Vector3, Quaternion } from '../../vendor/three.module.js';

const G = 9.81, D2R = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Payen Pa 49B: 5.16 m span, about 650 kg loaded, one Turbomeca Palas of 160 kg thrust, 500 km/h flat out.
// The thrust here is a little more generous than the real engine's so a climb over the towers does not take all day.
export const SPEC = {
  mass: 640, S: 11.0, span: 5.16, gearH: 1.16,
  CLa: 2.9, aStall: 21 * D2R, CLflat: 0.95,
  CD0: 0.0125, k: 0.17, CDbrake: 0.05,
  thrust: 2050, lapse: 0.0012,              // static thrust (N) and how it falls away with speed (per m/s)
  pMax: 2.3, qMax: 1.05, rMax: 0.45,        // rad/s at full authority
  nMax: 6.5, nMin: -2.5,
  qRef: 0.5 * 1.225 * 62 * 62,              // dynamic pressure at which the controls have full authority
  bankEasy: 62 * D2R,
  easyKa: 8, easyLead: 0.10,                 // easy mode: how hard the nose is driven to the angle of attack wanted; how far ahead the held path is set
};

export class Flight {
  // world: { ground(x, z) -> { y, water }, roof(x, y, z) -> height of the highest thing at (x, z), or -Infinity if unknown }
  constructor(world, spec = SPEC) {
    this.world = world; this.spec = spec;
    this.pos = new Vector3(); this.vel = new Vector3(); this.quat = new Quaternion();
    this.p = 0; this.q = 0; this.r = 0;              // roll right, pitch up, yaw right (rad/s)
    this.spool = 0.6;                                // engine, 0..1
    this.input = { roll: 0, pitch: 0, yaw: 0, throttle: 0.6, brake: 0 };
    this.assist = 'easy';
    this.gammaT = 0;                                 // easy mode: the climb angle being held
    this._g0 = 0;
    this.onGround = false; this.crashed = false;
    this.events = [];                                // 'liftoff' | 'touchdown' | 'crash' | 'stall', read and cleared by the page
    this.t = 0;
    // read-outs
    this.V = 0; this.alpha = 0; this.beta = 0; this.n = 1; this.stall = 0; this.agl = 0; this.thrust = 0;
    this.heading = 0; this.pitch = 0; this.bank = 0; this.vs = 0; this.auth = 0; this.buffet = 0;
    this._f = new Vector3(); this._u = new Vector3(); this._r = new Vector3(); this._a = new Vector3(); this._l = new Vector3();
    this._vb = new Vector3(); this._qi = new Quaternion(); this._dq = new Quaternion(); this._w = new Vector3(); this._pt = new Vector3();
    this._gust = [0, 1, 2, 3].map((i) => ({ f: 0.19 + i * 0.23, ph: i * 2.1 }));        // slow swells of air, a few seconds each
  }

  // heading in degrees clockwise from north; speed in m/s along the nose
  place({ x, y, z, heading = 0, pitch = 0, roll = 0, speed = 90, throttle = 0.6, ground = false }) {
    this.pos.set(x, y, z);
    const yaw = -heading * D2R;
    this.quat.setFromAxisAngle(this._a.set(0, 1, 0), yaw).multiply(this._dq.setFromAxisAngle(this._w.set(1, 0, 0), pitch * D2R));
    if (roll) this.quat.multiply(this._dq.setFromAxisAngle(this._w.set(0, 0, -1), roll * D2R));        // positive = right wing down
    this.axes();
    this.vel.copy(this._f).multiplyScalar(speed);
    this.p = this.q = this.r = 0; this.spool = throttle; this.input.throttle = throttle;
    this.onGround = ground; this.crashed = false; this.events.length = 0; this.gammaT = ground ? 0 : pitch * D2R;
    if (ground) { this.pos.y = this.world.ground(x, z).y + this.spec.gearH; this.vel.y = 0; }
    this.read();
  }

  axes() {
    this._f.set(0, 0, -1).applyQuaternion(this.quat); this._u.set(0, 1, 0).applyQuaternion(this.quat); this._r.set(1, 0, 0).applyQuaternion(this.quat);
  }

  read() {
    const f = this._f, u = this._u, r = this._r;
    this.heading = ((Math.atan2(f.x, -f.z) / D2R) % 360 + 360) % 360;
    this.pitch = Math.asin(clamp(f.y, -1, 1));
    this.bank = Math.atan2(-r.y, u.y);
    this.V = this.vel.length(); this.vs = this.vel.y;
  }

  step(dt) {
    if (this.crashed || dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n && !this.crashed; i++) this.sub(h);
    this.read();
  }

  sub(h) {
    const S = this.spec, I = this.input, pos = this.pos, vel = this.vel;
    this.t += h;
    this.axes();
    const f = this._f, u = this._u, r = this._r;
    const V = vel.length();
    const vb = this._vb.copy(vel).applyQuaternion(this._qi.copy(this.quat).invert());
    const fwd = -vb.z;
    const alpha = V > 2 ? Math.atan2(-vb.y, Math.max(fwd, 0.5)) : 0;
    const beta = V > 2 ? Math.asin(clamp(vb.x / V, -1, 1)) : 0;
    const rho = 1.225 * Math.exp(-Math.max(pos.y, 0) / 9000), qd = 0.5 * rho * V * V;
    const auth = clamp(Math.pow(qd / S.qRef, 0.6), 0, 1.12);
    const g = this.world.ground(pos.x, pos.z), agl = pos.y - g.y;

    /* ---- lift, drag, side force */
    const aa = Math.abs(alpha), st = smooth(S.aStall - 4 * D2R, S.aStall + 7 * D2R, aa);
    let CL = S.CLa * alpha * (1 - st) + Math.sign(alpha) * S.CLflat * Math.sin(2 * Math.min(aa, 1.4)) * st;
    CL *= 1 + 0.12 * smooth(S.span * 0.6, 0.6, agl);                       // the cushion close to the ground
    const sb = Math.sin(beta);
    const CD = S.CD0 + S.k * CL * CL + 1.3 * st * Math.sin(aa) ** 2 + S.CDbrake * I.brake + 0.8 * sb * sb;
    const L = qd * S.S * CL, D = qd * S.S * CD, Y = -qd * S.S * 0.9 * beta;
    const up = I.throttle > this.spool;
    this.spool += (I.throttle - this.spool) * (1 - Math.exp(-h / (up ? 1.9 : 1.2)));
    const T = S.thrust * this.spool * Math.max(0.55, 1 - S.lapse * V) * Math.pow(rho / 1.225, 0.7);
    const a = this._a.set(0, -G, 0);
    a.addScaledVector(f, T / S.mass);
    if (V > 0.5) {
      const vh = this._w.copy(vel).multiplyScalar(1 / V);
      a.addScaledVector(vh, -D / S.mass);
      const ld = this._l.crossVectors(r, vh);
      const ll = ld.length();
      if (ll > 1e-4) {
        ld.multiplyScalar(1 / ll);
        a.addScaledVector(ld, L / S.mass);
        a.addScaledVector(this._pt.crossVectors(vh, ld), Y / S.mass);
      }
    }
    // rough air: a few slow waves, stronger low over the city, plus the shake of a wing near the stall
    let gx = 0, gy = 0;
    for (const w of this._gust) { gx += Math.sin(this.t * w.f + w.ph); gy += Math.sin(this.t * w.f * 1.31 + w.ph * 1.7); }
    const rough = (0.05 + 0.08 * smooth(600, 60, agl)) * Math.min(V / 60, 1.4) * (this.onGround ? 0 : 1);
    a.addScaledVector(u, gy * rough * 0.3); a.addScaledVector(r, gx * rough * 0.15);
    this.buffet = st * Math.min(qd / 900, 1) + 0.25 * I.brake * Math.min(qd / S.qRef, 1.5);

    /* ---- what the stick asks for */
    const bank = Math.atan2(-r.y, u.y), theta = Math.asin(clamp(f.y, -1, 1));
    const Vs = Math.max(V, 22);
    const qUp = Math.min(S.qMax * auth, ((S.nMax - 1) * G) / Vs), qDn = Math.min(S.qMax * auth, ((1 - S.nMin) * G) / Vs);
    let pc, qc, rc;
    if (this.onGround) {
      const rot = smooth(26, 38, V);                                            // the elevators can lift the nose from about 100 km/h
      pc = -bank * 6;
      qc = I.pitch > 0.05 && theta < 13 * D2R ? I.pitch * 0.42 * rot : -theta * 3.5;
      const steer = clamp(I.yaw + (this.assist === 'easy' ? I.roll : 0), -1, 1);
      rc = steer * 0.62 * Math.min(V / 5, 1) / (1 + V / 10);                    // tight at taxi speed, a few degrees a second on the take-off roll
    } else if (this.assist === 'easy') {
      // left / right asks for a bank; pulling as well asks for a steeper one, so "turn + up" is a tight turn
      const lim = (S.bankEasy + 15 * D2R * Math.max(I.pitch, 0)) * (0.55 + 0.45 * smooth(28, 45, V));
      const want = I.roll * lim, err = want - bank;
      // rolls towards the bank asked for and eases into it: quick while far off, no overshoot arriving
      pc = clamp(err * 4.2 - this.p * 0.35, -S.pMax, S.pMax) * Math.max(auth, 0.25);
      // The stick bends the flight path up or down at a rate; let go and the path it has reached is held, through
      // turns and speed changes. It is done the way a fly-by-wire aircraft does it: work out the load on the wing
      // that path needs, the angle of attack that gives that load, and steer the nose to that angle. The wing
      // answers within a quarter of a second, and stops answering as soon as the stick is let go.
      const gamma = V > 6 ? Math.asin(clamp(vel.y / V, -1, 1)) : theta;
      const cb = Math.cos(bank), sbk = Math.sin(bank);
      const ask = I.pitch * (I.pitch > 0 ? 0.34 : 0.30) * (0.25 + 0.75 * cb * cb);     // rad/s; steeply banked, a pull goes into the turn, not a climb
      const top = Math.min(42 * D2R, (-10 + 52 * smooth(30, 50, V)) * D2R);           // too slow to climb: the path is lowered for you
      const gRate = clamp((gamma - this._g0) / h, -0.6, 0.6); this._g0 = gamma;
      if (Math.abs(I.pitch) > 0.03) this.gammaT = gamma + gRate * S.easyLead;              // while the stick is held the target is where the path will coast to if it is let go now
      this.gammaT = clamp(this.gammaT, -40 * D2R, top);
      let gdot = clamp(ask + (this.gammaT - gamma) * 1.6, -0.5, 0.5);
      if ((gamma > top && gdot > 0) || (gamma < -40 * D2R && gdot < 0)) gdot = (clamp(gamma, -40 * D2R, top) - gamma) * 1.6;
      const nCmd = clamp((Math.cos(gamma) + (Vs * gdot) / G) / Math.max(cb, 0.22), -0.6, 4.6);
      const aCmd = clamp((nCmd * S.mass * G) / Math.max(qd * S.S, 50) / S.CLa, -9 * D2R, S.aStall - 6 * D2R);      // never past the stall
      qc = (aCmd - alpha) * S.easyKa + gdot * cb;
      if (Math.abs(bank) < 1.4) qc += (G / Vs) * sbk * (sbk / Math.max(cb, 0.22)) * Math.cos(theta);      // the nose rate a level turn needs
      qc = clamp(qc, -qDn, qUp);
      rc = I.yaw * S.rMax * auth + (G / Vs) * sbk * Math.cos(theta);
    } else {
      pc = I.roll * S.pMax * auth;
      qc = I.pitch >= 0 ? I.pitch * qUp : I.pitch * qDn;
      rc = I.yaw * S.rMax * auth;
    }
    if (!this.onGround) {
      rc += 2.6 * beta * auth;                                                     // the fin swings the nose into the wind
      pc -= 0.7 * beta * auth;
      const over = aa - (S.aStall - 2 * D2R);
      if (over > 0) {                                                               // stalled: the nose drops and a wing goes
        qc -= Math.sign(alpha) * over * 5 * Math.min(qd / 600, 1);
        pc += Math.sin(this.t * 2.3) * over * 6;
      }
      const dead = 1 - smooth(0.05, 0.4, auth);                                     // no airspeed: nose-heavy, it falls through
      qc -= Math.cos(theta) * 1.1 * dead;
    }
    this.p += (pc - this.p) * (1 - Math.exp(-h * (9 * auth + 1.5)));
    this.q += (qc - this.q) * (1 - Math.exp(-h * (7 * auth + 1.5)));
    this.r += (rc - this.r) * (1 - Math.exp(-h * (5 * auth + 1.5)));

    /* ---- on its wheels */
    if (this.onGround) {
      const weightOn = clamp(1 - (L * Math.max(u.y, 0)) / (S.mass * G), 0, 1);
      if (a.y <= 0 && agl <= S.gearH + 0.001) { a.y = 0; if (vel.y < 0) vel.y = 0; }
      const hv = Math.hypot(vel.x, vel.z);
      if (hv > 0.02) {
        const mu = (0.022 + 0.42 * I.brake) * weightOn * G, k = Math.min(mu * h / hv, 1);
        vel.x -= vel.x * k; vel.z -= vel.z * k;
        // tyres do not slide sideways
        const side = vel.x * r.x + vel.z * r.z, kk = 1 - Math.exp(-h * 9 * weightOn);
        vel.x -= r.x * side * kk; vel.z -= r.z * side * kk;
      } else if (T < 150) { vel.x = vel.z = 0; }
    }

    /* ---- move */
    vel.addScaledVector(a, h);
    pos.addScaledVector(vel, h);
    const w = this._w.set(this.q, -this.r, -this.p), wl = w.length();
    if (wl > 1e-7) { this.quat.multiply(this._dq.setFromAxisAngle(w.multiplyScalar(1 / wl), wl * h)).normalize(); }

    /* ---- the ground and everything standing on it */
    const g2 = this.world.ground(pos.x, pos.z), h2 = pos.y - g2.y;
    if (this.onGround) {
      if (h2 > S.gearH + 0.05) { this.onGround = false; this.gammaT = Math.asin(clamp(vel.y / Math.max(V, 1), -1, 1)); this.events.push('liftoff'); }
      else {
        if (h2 < S.gearH) { pos.y = g2.y + S.gearH; if (vel.y < 0) vel.y = 0; }       // the wheels hold it up; nothing holds it down
        this.axes();
        if (this._f.y < 0) {                                                        // the nose wheel holds the nose up
          const th = Math.asin(clamp(this._f.y, -1, 1));
          this.quat.multiply(this._dq.setFromAxisAngle(this._w.set(1, 0, 0), -th)); if (this.q < 0) this.q = 0;
        }
        if (g2.water) this.crash('water');
      }
    } else if (h2 <= S.gearH) {
      const sink = -vel.y, th = Math.asin(clamp(f.y, -1, 1));
      if (!g2.water && sink < 4.2 && Math.abs(bank) < 14 * D2R && th > -3 * D2R && th < 17 * D2R) {
        this.onGround = true; pos.y = g2.y + S.gearH; vel.y = 0; this.events.push('touchdown');
      } else this.crash(g2.water ? 'water' : 'ground');
    }
    if (!this.crashed) {
      // nose, tail and both wing tips against the roofs
      for (const [bx, by, bz] of [[0, -0.1, -3.0], [0, 0.6, 2.2], [2.5, -0.15, 1.2], [-2.5, -0.15, 1.2]]) {
        const pt = this._pt.set(bx, by, bz).applyQuaternion(this.quat).add(pos);
        const top = this.world.roof(pt.x, pt.y, pt.z);
        if (pt.y < top - 0.6) { this.crash('building'); break; }
      }
    }
    this.alpha = alpha; this.beta = beta; this.n = (L * 1) / (S.mass * G); this.stall = st; this.agl = h2; this.auth = auth; this.thrust = T;
  }

  crash(what) { this.crashed = true; this.events.push('crash:' + what); }
}
