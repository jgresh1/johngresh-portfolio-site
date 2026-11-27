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

// NASA AD-1: 9.8 m span, 8.6 square metres of wing that turns on a pivot by up to 60 degrees (right tip forward),
// two small turbojets of 100 kg thrust each. Lighter here than the real one's 970 kg and with a little more thrust,
// for the same reason as above. The wing turns by itself with speed, slowly, as its electric motor did: straight
// for take-off and landing, fully turned by 400 km/h. Turned, it makes less drag, and less lift for the same angle.
export const AD1 = {
  mass: 700, S: 8.64, span: 9.8, gearH: 0.50,
  CLa: 5.2, aStall: 15 * D2R, CLflat: 0.95,
  CD0: 0.028, k: 0.038, CDbrake: 0.05,
  thrust: 2300, lapse: 0.0012,
  pMax: 1.9, qMax: 0.95, rMax: 0.42,
  nMax: 5.5, nMin: -2.0,
  qRef: 0.5 * 1.225 * 58 * 58,
  bankEasy: 60 * D2R,
  easyKa: 8, easyLead: 0.10,
  sweepV: [68, 112], sweepCL: 0.40, sweepCD: -0.007, sweepK: 0.085,      // speeds (m/s) between which the wing turns; what full turn does to lift slope, drag and drag due to lift
  rotMax: 9, rotV: [28, 40], pullAt: 140,                                // a long tail: the nose comes up 9 degrees on the runway, no more; km/h to pull at
  hit: [[0, -0.3, -6.2], [0, 1.5, 4.5], [4.7, 0.4, 0.55], [-4.7, 0.4, 0.55]],
};
// nose, tail and both wing tips (body frame, metres from the centre of gravity): what is tried against the roofs
const HIT = [[0, -0.1, -3.0], [0, 0.6, 2.2], [2.5, -0.15, 1.2], [-2.5, -0.15, 1.2]];

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
    // the weather (weather.js sets these every frame): the air's own movement over the ground (m/s), and how rough it is (0 calm .. 1 a storm)
    this.wind = new Vector3(); this.rough = 0; this._va = new Vector3();
    this.sweep = 0;                                  // a wing that turns: 0 straight .. 1 fully turned
    this.slope = 0;                                  // the ground under the wheels: metres up per metre along
  }

  // another aircraft takes over where this one is: same place, same speed
  setSpec(spec) {
    if (spec === this.spec) return;
    this.spec = spec;
    if (this.onGround) this.pos.y = this.world.ground(this.pos.x, this.pos.z).y + spec.gearH;
    this.sweep = spec.sweepV ? smooth(spec.sweepV[0], spec.sweepV[1], this.V) : 0;
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
    this.sweep = this.spec.sweepV ? smooth(this.spec.sweepV[0], this.spec.sweepV[1], speed) : 0;
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
    this.V = this._va.copy(this.vel).addScaledVector(this.wind, this.assist === 'easy' ? -0.5 : -1).length(); this.vs = this.vel.y;      // speed through the air
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
    // The wing flies in the air, and the air moves: every force comes from the speed through the air, while the
    // aircraft's path over the ground is that plus the wind. Easy flying feels half the wind.
    const va = this._va.copy(vel).addScaledVector(this.wind, this.assist === 'easy' ? -0.5 : -1);
    const V = va.length();
    const vb = this._vb.copy(va).applyQuaternion(this._qi.copy(this.quat).invert());
    const fwd = -vb.z;
    const alpha = V > 2 ? Math.atan2(-vb.y, Math.max(fwd, 0.5)) : 0;
    const beta = V > 2 ? Math.asin(clamp(vb.x / V, -1, 1)) : 0;
    const rho = 1.225 * Math.exp(-Math.max(pos.y, 0) / 9000), qd = 0.5 * rho * V * V;
    const auth = clamp(Math.pow(qd / S.qRef, 0.6), 0, 1.12);
    const g = this.world.ground(pos.x, pos.z), agl = pos.y - g.y;
    // a wing that turns is asked round by the speed and takes a few seconds to get there
    if (S.sweepV) this.sweep += (smooth(S.sweepV[0], S.sweepV[1], V) - this.sweep) * (1 - Math.exp(-h / 2.2)); else this.sweep = 0;
    const sw = this.sweep, CLa = S.CLa * (1 - (S.sweepCL || 0) * sw), CD0 = S.CD0 + (S.sweepCD || 0) * sw, kI = S.k + (S.sweepK || 0) * sw;

    /* ---- lift, drag, side force */
    const aa = Math.abs(alpha), st = smooth(S.aStall - 4 * D2R, S.aStall + 7 * D2R, aa);
    let CL = CLa * alpha * (1 - st) + Math.sign(alpha) * S.CLflat * Math.sin(2 * Math.min(aa, 1.4)) * st;
    CL *= 1 + 0.12 * smooth(S.span * 0.6, 0.6, agl);                       // the cushion close to the ground
    const sb = Math.sin(beta);
    const CD = CD0 + kI * CL * CL + 1.3 * st * Math.sin(aa) ** 2 + S.CDbrake * I.brake + 0.8 * sb * sb;
    const L = qd * S.S * CL, D = qd * S.S * CD, Y = -qd * S.S * 0.9 * beta;
    const up = I.throttle > this.spool;
    this.spool += (I.throttle - this.spool) * (1 - Math.exp(-h / (up ? 1.9 : 1.2)));
    const T = S.thrust * this.spool * Math.max(0.55, 1 - S.lapse * V) * Math.pow(rho / 1.225, 0.7);
    const a = this._a.set(0, -G, 0);
    a.addScaledVector(f, T / S.mass);
    if (V > 0.5) {
      const vh = this._w.copy(va).multiplyScalar(1 / V);
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
    const wxr = this.rough * (this.assist === 'easy' ? 0.6 : 1);
    const rough = (0.05 + 0.08 * smooth(600, 60, agl) + 0.75 * wxr) * Math.min(V / 60, 1.4) * (this.onGround ? 0 : 1);
    a.addScaledVector(u, gy * rough * 0.3); a.addScaledVector(r, gx * rough * 0.15);
    // rough air from the weather also has a quicker chop in it, and nudges the wings and the nose
    const chop = wxr * Math.min(V / 60, 1.4) * (this.onGround ? 0 : 1), tt = this.t;
    const c1 = Math.sin(tt * 1.37 + 0.4) + Math.sin(tt * 2.31 + 1.9) * 0.7 + Math.sin(tt * 3.9 + 4.1) * 0.4, c2 = Math.sin(tt * 1.13 + 2.2) + Math.sin(tt * 2.77 + 0.3) * 0.7 + Math.sin(tt * 4.3 + 1.1) * 0.4;
    a.addScaledVector(u, c1 * chop * 0.55);
    this.buffet = st * Math.min(qd / 900, 1) + 0.25 * I.brake * Math.min(qd / S.qRef, 1.5);

    /* ---- what the stick asks for */
    const bank = Math.atan2(-r.y, u.y), theta = Math.asin(clamp(f.y, -1, 1));
    const Vs = Math.max(V, 22);
    const qUp = Math.min(S.qMax * auth, ((S.nMax - 1) * G) / Vs), qDn = Math.min(S.qMax * auth, ((1 - S.nMin) * G) / Vs);
    let pc, qc, rc;
    if (this.onGround) {
      const rot = smooth(S.rotV ? S.rotV[0] : 26, S.rotV ? S.rotV[1] : 38, V);     // the elevators can lift the nose from about 100 km/h
      pc = -bank * 6;
      qc = I.pitch > 0.05 && theta < (S.rotMax || 13) * D2R ? I.pitch * 0.42 * rot : -theta * 3.5;
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
      const gamma = V > 6 ? Math.asin(clamp(va.y / V, -1, 1)) : theta;
      const cb = Math.cos(bank), sbk = Math.sin(bank);
      const ask = I.pitch * (I.pitch > 0 ? 0.34 : 0.30) * (0.25 + 0.75 * cb * cb);     // rad/s; steeply banked, a pull goes into the turn, not a climb
      const top = Math.min(42 * D2R, (-10 + 52 * smooth(30, 50, V)) * D2R);           // too slow to climb: the path is lowered for you
      const gRate = clamp((gamma - this._g0) / h, -0.6, 0.6); this._g0 = gamma;
      if (Math.abs(I.pitch) > 0.03) this.gammaT = gamma + gRate * S.easyLead;              // while the stick is held the target is where the path will coast to if it is let go now
      this.gammaT = clamp(this.gammaT, -40 * D2R, top);
      let gdot = clamp(ask + (this.gammaT - gamma) * 1.6, -0.5, 0.5);
      if ((gamma > top && gdot > 0) || (gamma < -40 * D2R && gdot < 0)) gdot = (clamp(gamma, -40 * D2R, top) - gamma) * 1.6;
      const nCmd = clamp((Math.cos(gamma) + (Vs * gdot) / G) / Math.max(cb, 0.22), -0.6, 4.6);
      const aCmd = clamp((nCmd * S.mass * G) / Math.max(qd * S.S, 50) / CLa, -9 * D2R, S.aStall - 6 * D2R);      // never past the stall
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
    if (!this.onGround) { pc += c2 * chop * 0.13; qc += c1 * chop * 0.035; }
    this.p += (pc - this.p) * (1 - Math.exp(-h * (9 * auth + 1.5)));
    this.q += (qc - this.q) * (1 - Math.exp(-h * (7 * auth + 1.5)));
    this.r += (rc - this.r) * (1 - Math.exp(-h * (5 * auth + 1.5)));

    /* ---- on its wheels */
    if (this.onGround) {
      const weightOn = clamp(1 - (L * Math.max(u.y, 0)) / (S.mass * G), 0, 1);
      if (a.y <= 0 && agl <= S.gearH + 0.001) { a.y = 0; if (vel.y < 0) vel.y = 0; }
      const hv = Math.hypot(vel.x, vel.z);
      if (hv > 0.5 && this.slope) { const down = -G * this.slope / Math.sqrt(1 + this.slope * this.slope) * weightOn; a.x += down * vel.x / hv; a.z += down * vel.z / hv; }      // the slope's own pull
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
    // the ground it is rolling or landing on may slope: how fast it rises under the aircraft, and the angle of that
    const hv2 = Math.hypot(vel.x, vel.z), vyG = hv2 > 0.5 ? clamp((g2.y - g.y) / h, -0.3 * hv2, 0.3 * hv2) : 0, thG = hv2 > 0.5 ? Math.atan(vyG / hv2) : 0;
    this.slope = hv2 > 0.5 ? vyG / hv2 : 0;
    if (this.onGround) {
      const flying = L * Math.max(u.y, 0) > S.mass * G;                             // the wing is carrying all of it
      // it leaves the ground when the wing lifts it off, or when the ground drops away from under it (the end of Lukla's runway)
      if (h2 > S.gearH + 0.05 && (flying || h2 > S.gearH + 0.7)) { this.onGround = false; this.gammaT = Math.asin(clamp(vel.y / Math.max(V, 1), -1, 1)); this.events.push('liftoff'); }
      else {
        // the wheels follow the ground, up hill and down; nothing but the wing lifts it off
        if (h2 !== S.gearH && !(flying && h2 > S.gearH)) pos.y = g2.y + S.gearH;
        if (vel.y < vyG || !flying) vel.y = Math.max(vyG, flying ? vel.y : -1e9);
        this.axes();
        const th = Math.asin(clamp(this._f.y, -1, 1));
        if (th < thG) { this.quat.multiply(this._dq.setFromAxisAngle(this._w.set(1, 0, 0), thG - th)); if (this.q < 0) this.q = 0; }      // the nose wheel holds the nose up, along the slope
        if (g2.water) this.crash('water');
      }
    } else if (h2 <= S.gearH) {
      const sink = -(vel.y - vyG), th = Math.asin(clamp(f.y, -1, 1)) - thG;       // both measured against the slope it meets
      if (!g2.water && sink < 4.2 && Math.abs(bank) < 14 * D2R && th > -3 * D2R && th < 17 * D2R) {
        this.onGround = true; pos.y = g2.y + S.gearH; vel.y = vyG; this.events.push('touchdown');
      } else this.crash(g2.water ? 'water' : 'ground');
    }
    if (!this.crashed) {
      // nose, tail and both wing tips against the roofs
      for (const [bx, by, bz] of S.hit || HIT) {
        const pt = this._pt.set(bx, by, bz).applyQuaternion(this.quat).add(pos);
        const top = this.world.roof(pt.x, pt.y, pt.z);
        if (pt.y < top - 0.6) { this.crash('building'); break; }
      }
    }
    this.alpha = alpha; this.beta = beta; this.n = (L * 1) / (S.mass * G); this.stall = st; this.agl = h2; this.auth = auth; this.thrust = T;
  }

  crash(what) { this.crashed = true; this.events.push('crash:' + what); }
}
