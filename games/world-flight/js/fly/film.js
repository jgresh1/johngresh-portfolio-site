// film.js — the opening, about a minute: the Earth from orbit, the two aircraft in their hangar, and down to the globe.
//
//   first light   low over the night side, city lights under the nose, the thin blue line of air along the limb;
//                 the sun comes over the edge of the world and the lens slowly tightens on it
//   edge of night along the terminator: day on one hand, lit cities on the other, a long slow zoom
//   the marble    the whole Earth, real clouds, drifting round it
//   glint         a very long lens on the sun's glint on the sea, clouds crossing it
//   hangar        dark; the lamps come on over both aircraft · the AD-1: a push in to the pilot's visor, the wing
//                 turning on its pivot seen from the roof, the blue band and the engine pods · the Katy: down the
//                 nose probe to her name, the lettering under the canopy, the rudder swung full and free · a
//                 dolly zoom on the one that was picked as its engine lights (the camera backs away while the lens
//                 tightens, so the aircraft holds still and the hangar swells behind it) · one long take from under
//                 the roof as the doors part and it rolls out into the morning
//   the fall      the Earth again, coming down to where a place is picked
//
// Every shot is one continuous move along a smooth curve: no cuts on a still camera, no shake, nothing sudden.
// Between the acts the picture dips to black and comes back; nothing burns out. Only what a camera could record:
// real lamps, a real sun through real doors, a lens that stops down for daylight, a flare when the sun is in frame.
// Everything is a function of the film's time, so any moment can be drawn on its own (film.at(t)).
import * as THREE from 'three';
import { CITIES } from '../places.js';
import { dirOf } from '../globe.js';

const D2R = Math.PI / 180, clamp = THREE.MathUtils.clamp;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1), ease = (k) => k * k * (3 - 2 * k), mix = (a, b, k) => a + (b - a) * k;
const pace = (k) => 0.3 * k + 0.7 * ease(k);              // already moving when the shot begins, still moving when it ends

const LEN = {
  first: 8.0, edge: 6.6, marble: 5.6, glint: 5.2,
  dark: 6.2, helmet: 3.4, pivot: 4.8, band: 3.0, probe: 2.8, name: 3.2, rudder: 2.8, vertigo: 4.6, doors: 9.0,
  fall: 5.2,
};
const ORDER = Object.keys(LEN), EARTH = new Set(['first', 'edge', 'marble', 'glint', 'fall']);
export const T = (() => { const at = {}; let t = 0; for (const k of ORDER) { at[k] = t; t += LEN[k]; } at.end = t; return at; })();
T.lamps = [T.dark + 1.0, T.dark + 1.9, T.dark + 2.8, T.dark + 3.7];
T.start = T.vertigo + 0.5;                                // the engine is lit
T.doorA = T.doors + 0.5; T.doorB = T.doors + 5.7; T.roll = T.doors + 3.7;
const ROLL_A = 1.7, STOP = 0.21, DIP = 0.55;
// open ocean, far from land: [latitude, longitude]
const SEAS = [[0, -140], [-22, -112], [18, -162], [-14, -24], [24, -46], [-22, 80], [-32, 62], [8, 160], [-36, -150], [34, -160], [-8, -90], [-40, -20], [-38, 100], [12, 62], [-18, 176]];              // m/s2 out of the hangar; how far the lens closes for daylight; seconds to and from black

const curve3 = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
const move = (pos, look, lens, lens1 = lens) => ({ pos: curve3(pos), look: curve3(look), lens, lens1 });
// hangar moves, in metres from the ground point under an aircraft's centre of gravity (x right, y up, z aft; the nose
// points at -z, towards the doors). `on` says which aircraft: 'a' the AD-1, 'k' the Katy, 'w' the hangar itself.
const SHOTS = {
  // from the dark of the floor by the doors, in and up towards the two of them, while the lamps come on
  dark: { on: 'w', ...move([[-2.6, 0.42, -22.6], [-2.0, 0.8, -20.2], [-1.3, 1.2, -17.8], [-0.6, 1.55, -15.6]], [[0, 1.0, 0.4], [0, 1.05, 0], [0, 1.1, -0.5], [0, 1.15, -1.0]], 42, 37) },
  // the AD-1: in to the pilot behind the long flat canopy, the lens tightening as the camera closes
  helmet: { on: 'a', ...move([[-2.7, 2.05, -5.3], [-1.9, 1.55, -4.2], [-1.12, 1.18, -3.2]], [[0, 0.74, -2.35], [0, 0.76, -2.28], [0, 0.78, -2.2]], 31, 20) },
  // from under the roof: the whole wing turns on its pivot, right tip forward, and comes part of the way back
  pivot: { on: 'a', ...move([[-3.8, 7.0, -3.6], [-2.9, 7.9, -1.0], [-1.6, 8.6, 2.0]], [[0, 0.85, 0.1], [0, 0.85, 0.4], [0, 0.85, 0.7]], 41, 36) },
  // along the blue band and the gold lines to the engine pods
  band: { on: 'a', ...move([[-4.1, 1.5, 1.0], [-3.6, 1.38, 2.1], [-3.0, 1.26, 3.2]], [[-0.3, 0.62, 2.5], [-0.3, 0.6, 2.95], [-0.3, 0.6, 3.4]], 28, 21) },
  // the Katy: down from above the nose probe and round to the red cone and the name painted on it
  probe: { on: 'k', ...move([[-0.66, 1.84, -4.16], [-0.86, 1.62, -3.66], [-1.02, 1.42, -3.15]], [[0, 1.245, -3.34], [-0.03, 1.25, -2.92], [-0.09, 1.255, -2.56]], 17, 16) },
  // under the canopy: along the lettering and down to the pilot's name beneath it
  name: { on: 'k', ...move([[-1.52, 1.47, -2.30], [-1.50, 1.455, -2.04], [-1.47, 1.44, -1.78]], [[-0.30, 1.415, -1.82], [-0.30, 1.40, -1.62], [-0.30, 1.385, -1.44]], 17, 15.5) },
  // close on the foot of the rudder while it is swung one way and the other
  rudder: { on: 'k', ...move([[-1.62, 1.66, 3.42], [-1.42, 1.74, 3.20], [-1.22, 1.83, 2.98]], [[0, 1.68, 1.84], [0, 1.74, 1.88], [0, 1.80, 1.92]], 19, 18) },
  // from under the roof behind the picked one down to the floor, and on after it as it goes
  doors: { on: 'h', ...move([[3.4, 6.2, 16], [2.6, 4.4, 13], [1.4, 2.8, 10], [0.4, 1.9, 5.5], [0, 1.72, -1.0]], [[0, 1.6, -6], [0, 1.6, -6.4], [0, 1.58, -7], [0, 1.56, -8], [0, 1.55, -9]], 30, 33) },
};

export class Film {
  // planes: { ad1: { jet, at: Vector3 (where its centre of gravity stands), gearH, nose, wide }, katy: {...} }
  // hero(): which one was picked ('ad1' | 'katy'); home(): { lat, lon, dist } the globe's view the film ends on
  constructor({ hangar, globe, planes, sound, hero = () => 'ad1', home = () => ({ lat: 25, lon: 0, dist: 3.3 }) }) {
    Object.assign(this, { hangar, globe, planes, sound, hero, home });
    this.t = 0; this.playing = false; this.end = T.end; this.fired = new Set(); this.rolled = 0;
    this.state = { stage: false, exposure: 1, bars: 1, done: false, look: { cloud: 1, night: 1, dim: 0, stars: 1, air: 1, glint: 1, flare: 1 } };
    this._p = new THREE.Vector3(); this._l = new THREE.Vector3(); this._u = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this.S = new THREE.Vector3(); this.E = new THREE.Vector3(); this.N = new THREE.Vector3(); this.psi = 0;
  }

  start() { this.t = 0; this.playing = true; this.fired.clear(); this.rolled = 0; this.frame(); }
  skip() { this.t = this.end; }

  // The orbit the Earth shots are flown on: a plane through the sun's direction, turned so that the night half of it
  // passes over as many lit cities as it can at this hour.
  frame() {
    const S = this.S.copy(this.globe.sun), Y = this._u.set(0, 1, 0);
    const T0 = new THREE.Vector3().crossVectors(Y, S).normalize(), N0 = new THREE.Vector3().crossVectors(S, T0).normalize();
    let best = -1, bp = 0, bs = 1;
    for (const side of [1, -1]) for (const psi of [-34, -16, 0, 16, 32, 48]) {
      const E = this._a.copy(T0).multiplyScalar(Math.cos(psi * D2R) * side).addScaledVector(N0, Math.sin(psi * D2R));
      // the ground under the first shot: 24 to 34 degrees past the terminator on the night side
      const G = this._b.copy(S).multiplyScalar(Math.cos(118 * D2R)).addScaledVector(E, Math.sin(118 * D2R));
      let score = 0;
      for (const c of CITIES) { const d = dirOf(c[1], c[2], this._l), a = Math.acos(clamp(d.dot(G), -1, 1)) / D2R, night = d.dot(S) < -0.05; if (night && a < 26) score += c[3] * (1 - a / 26); }
      if (score > best) { best = score; bp = psi; bs = side; }
    }
    this.psi = bp; this.side = bs;
    this.E.copy(T0).multiplyScalar(Math.cos(bp * D2R) * bs).addScaledVector(N0, Math.sin(bp * D2R)).normalize();      // on the terminator, in the orbit's plane
    this.N.crossVectors(this.S, this.E).normalize();                                                                  // along the terminator
    // the open sea with the sun highest over it just now, for the shot of its glint
    this.ocean = new THREE.Vector3(); let hi = -2;
    for (const [la, lo] of SEAS) { const d = dirOf(la, lo, this._l), k = d.dot(S); if (k > hi) { hi = k; this.ocean.copy(d); } }
  }

  update(dt) {
    if (!this.playing) return this.state;
    const t0 = this.t; this.t = Math.min(this.t + dt, this.end);
    const cross = (at, fn) => { if (t0 <= at && this.t > at && !this.fired.has(at)) { this.fired.add(at); fn(); } };
    T.lamps.forEach((at) => cross(at, () => this.sound.hit('clunk')));
    cross(T.start, () => this.sound.hit('click'));
    cross(T.doorA, () => this.sound.door(T.doorB - T.doorA));
    const s = this.at(this.t, dt);
    // the music bed: in with first light, opening over the whole Earth, close in the hangar, wide again for the fall
    const t = this.t, level = ease(seg(t, 0.3, 4.5)) * (1 - 0.5 * ease(seg(t, this.end - 2.5, this.end)));
    const open = t < T.dark ? 0.25 + 0.6 * ease(seg(t, T.edge, T.glint)) : t < T.fall ? 0.16 + 0.5 * ease(seg(t, T.doorA, T.fall)) : 0.9;
    this.sound.music?.(level, open);
    if (this.t >= this.end) { this.playing = false; s.done = true; }
    return s;
  }

  shotAt(t) { let name = ORDER[0]; for (const k of ORDER) if (t >= T[k]) name = k; return name; }
  // Ask now for the ground an Earth shot will need at time t (nothing is drawn): the shot then opens on a sharp
  // picture. The camera is left where that shot has it; the caller poses it again for the frame it is about to draw.
  ahead(t, h) {
    if (t >= this.end) return false;
    const name = this.shotAt(t); if (!EARTH.has(name)) return false;
    if (!this.S.lengthSq()) this.frame();
    const st = this._ahead || (this._ahead = { look: {} });
    this.earth(name, seg(t, T[name], T[name] + LEN[name]), st); this.globe.refine(h, st.look);
    return true;
  }

  at(t, dt = 0) {
    const st = this.state, name = this.shotAt(t), k = seg(t, T[name], T[name] + LEN[name]);
    st.done = false; st.bars = 1 - ease(seg(t, this.end - 1.6, this.end - 0.3)); st.shot = name;
    // to black and back between the acts
    const dip = t < T.dark ? Math.min(ease(seg(t, 0, 1.6)), 1 - ease(seg(t, T.dark - DIP, T.dark - 0.04))) : ease(seg(t, T.fall + 0.05, T.fall + 0.9));
    if (EARTH.has(name)) { st.stage = false; this.earth(name, k, st); st.exposure = dip; this.sound.update({ spool: 0, where: 'hangar', dist: 400, gain: 0 }); return st; }
    st.stage = true; this.stage(name, k, t, dt, st);
    st.exposure *= ease(seg(t, T.dark, T.dark + 0.7));
    return st;
  }

  /* ---------------------------------------------------------------- the Earth */
  earth(name, k, st) {
    const G = this.globe, S = this.S, E = this.E, N = this.N, P = this._p, L = this._l, U = this._u, A = this._a, B = this._b, e = pace(k), look = st.look;
    look.cloud = 1; look.night = 1; look.dim = 0; look.air = 1; look.glint = 1; look.flare = 1; look.stars = 0.5;
    if (name === 'first') {
      // 520 km up on the night side, flying towards the day: the sun starts 7 degrees under the limb and ends 9 over it
      const h = 0.082, dipA = Math.acos(1 / (1 + h)), th = Math.PI / 2 + dipA + mix(7.0, -9.0, e) * D2R;
      P.copy(S).multiplyScalar(Math.cos(th)).addScaledVector(E, Math.sin(th)); U.copy(P);
      A.copy(S).multiplyScalar(Math.sin(th)).addScaledVector(E, -Math.cos(th));                 // the way it is going
      B.copy(A).multiplyScalar(Math.cos(dipA * 0.66)).addScaledVector(U, -Math.sin(dipA * 0.66)); // the lens a little below level: the limb in the upper third
      B.applyAxisAngle(U, mix(0.16, 0.09, e));                                                    // the sun rises off to one side of the frame
      P.multiplyScalar(1 + h); L.copy(P).add(B);
      G.pose(P, L, U, mix(37, 28.5, e));
      look.stars = mix(1, 0.2, ease(seg(k, 0.35, 0.8)));
    } else if (name === 'edge') {
      // high over the terminator, travelling along it and a little into the night, the lens closing on the far limb
      const a = mix(-13, 15, e) * D2R, h = 0.52;
      P.copy(E).multiplyScalar(Math.cos(a)).addScaledVector(N, Math.sin(a)).addScaledVector(S, -0.17).normalize(); U.copy(P);
      L.copy(E).multiplyScalar(Math.cos(a + 0.72)).addScaledVector(N, Math.sin(a + 0.72)).addScaledVector(S, 0.05).normalize();
      P.multiplyScalar(1 + h);
      G.pose(P, L, U, mix(31, 21, e));
      look.stars = 0.35;
    } else if (name === 'marble') {
      // the whole of it, from the day side and a little round, drifting; the Earth sits off centre with space beside it
      const a = mix(-0.10, 0.10, e);
      P.copy(S).multiplyScalar(0.80).addScaledVector(E, 0.50).addScaledVector(N, 0.30).normalize().applyAxisAngle(N, a).multiplyScalar(mix(7.8, 6.5, e));
      U.copy(N); A.crossVectors(U, P).normalize();
      L.copy(A).multiplyScalar(-0.62);
      G.pose(P, L, U, mix(27.5, 24.5, e));
      look.stars = 0.3;
    } else if (name === 'glint') {
      // a very long lens on the place where the sea throws the sun back at the camera
      const a = mix(-0.05, 0.07, e);
      const O = this.ocean;                                         // a patch of open sea in daylight (frame())
      P.copy(O).multiplyScalar(2 * O.dot(S)).sub(S).normalize().applyAxisAngle(N, a);          // the sun mirrored in it: where the lens has to be
      L.copy(S).add(P).normalize();                                 // where the surface faces half way between the sun and the lens
      P.multiplyScalar(2.15); U.copy(N);
      G.pose(P, L, U, mix(13.5, 7.6, e));
      look.stars = 0; look.flare = 0.4;
    } else {
      // the fall: from far out down to the view a place is picked from, the night side filling with moonlight
      const H = this.home(), q = 1 - Math.pow(1 - k, 2.4);
      dirOf(H.lat + mix(24, 0, q), H.lon + mix(-46, 0, q), P).multiplyScalar(mix(7.4, H.dist, q)); U.set(0, 1, 0); L.set(0, 0, 0);
      G.pose(P, L, U, 30);
      G.jumpTo(H.lat, H.lon, H.dist);
      const m = ease(seg(k, 0.25, 1)); look.dim = mix(0, H.dim ?? 0.5, m); look.cloud = mix(1, H.cloud ?? 0.6, m); look.stars = mix(0.3, 0.7, m); look.flare = mix(1, 0.55, m);
    }
  }

  /* ---------------------------------------------------------------- the hangar */
  stage(name, k, t, dt, st) {
    const H = this.hangar, cam = H.camera, PL = this.planes, heroName = this.hero(), hero = PL[heroName], other = PL[heroName === 'ad1' ? 'katy' : 'ad1'];
    let n = 0; for (const at of T.lamps) n += ease(seg(t, at, at + 0.5));
    H.setLamps(n); H.setDoor(seg(t, T.doorA, T.doorB));
    // the picked one rolls out; the other stays where it stands
    const d = t > T.roll ? 0.5 * ROLL_A * (t - T.roll) ** 2 : 0;
    hero.jet.root.position.set(hero.at.x, hero.gearH, hero.at.z - d); hero.jet.root.quaternion.identity(); if (hero.blob) hero.blob.position.z = hero.at.z + 0.4 - d;
    other.jet.root.position.set(other.at.x, other.gearH, other.at.z); other.jet.root.quaternion.identity(); if (other.blob) other.blob.position.z = other.at.z + 0.4;
    // engine: lit in the dolly zoom, idling by the long take, a little more to roll
    const spool = 0.34 * ease(seg(t, T.start, T.start + 4.4)) + 0.2 * ease(seg(t, T.roll - 0.8, T.roll + 1.8));
    hero.jet.uHeat.value = 0.4 * Math.pow(spool / 0.54, 1.5); hero.jet.uLamp.value = 0.9 * seg(t, T.start - 0.4, T.start);
    other.jet.uHeat.value = 0; other.jet.uLamp.value = 0;
    // full and free: the AD-1's wing on its pivot, the Katy's rudder, each in its own close shot
    const sw = (a, b) => (t > a && t < b ? Math.sin(((t - a) / (b - a)) * Math.PI * 2) : 0);
    const pk = seg(t, T.pivot, T.pivot + LEN.pivot), sweep = t >= T.pivot && t < T.band ? ease(seg(pk, 0.06, 0.56)) - 0.55 * ease(seg(pk, 0.66, 0.98)) : 0;
    const poseOf = (P, isHero) => {
      const ad = P === PL.ad1;
      P.jet.pose(dt, { yaw: ad ? 0 : sw(T.rudder + 0.35, T.rudder + 2.35), sweep: ad ? sweep : 0, throttle: isHero ? spool / 0.72 : 0,
        parked: isHero ? 1 - seg(t, T.start + 0.4, T.start + 1.4) : 1, wheel: isHero ? d - this.rolled : 0, look: ad ? 0 : (t > T.name && t < T.rudder ? -0.6 : 0) });
    };
    poseOf(hero, true); poseOf(other, false); this.rolled = d;
    const e = pace(k), L = this._l;
    let fov, wideShot = false;
    if (name === 'vertigo') {
      // The dolly zoom: the camera backs away down the hangar while the lens tightens to keep the aircraft the same
      // size, so it holds still and the far wall, the lamps and the other aircraft swell up behind it.
      const d0 = hero.wide * 0.82, d1 = hero.wide * 1.9, dist = mix(d0, d1, ease(k)), side = hero.at.x < 0 ? 1 : -1;
      cam.position.set(hero.at.x + side * mix(1.5, 0.5, e), mix(1.5, 1.08, e), hero.at.z + hero.nose * 0.42 - dist);
      L.set(hero.at.x, hero.gearH + 0.32, hero.at.z + hero.nose * 0.42);
      fov = (2 * Math.atan((hero.wide * 0.74) / (dist * Math.max(cam.aspect, 0.6)))) / D2R; wideShot = true;
    } else {
      const S = SHOTS[name], P = S.on === 'a' ? PL.ad1 : S.on === 'k' ? PL.katy : S.on === 'h' ? hero : null;
      S.pos.getPointAt(e, cam.position); S.look.getPointAt(e, L);
      if (P) {
        // an aircraft's shots are in its own metres; the Katy's were drawn with her standing at the hangar's middle
        const k0 = S.on === 'h' ? Math.min(hero.wide / 5.4, 1.2) : 1;
        if (S.on === 'h') { cam.position.x *= k0; cam.position.z *= k0; cam.position.y = 1.2 + (cam.position.y - 1.2) * k0; }
        cam.position.x += P.at.x; cam.position.z += P.at.z; L.x += P.at.x; L.z += P.at.z;
        if (S.on === 'h') { L.y = hero.gearH + 0.4; L.z -= 0.85 * d; }                          // the look goes with it as it rolls away
      }
      fov = mix(S.lens, S.lens1, e);
    }
    cam.up.set(0, 1, 0); cam.lookAt(L); cam.fov = wideShot ? fov : fov * Math.max(1, 1.5 / Math.max(cam.aspect, 0.4)); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // the lens stops down as the doors let the day in; over the last moments the picture dips to black
    st.exposure = H.exposure * mix(1, STOP, ease(seg(t, T.doorA + 0.3, T.doorB - 0.4))) * (1 - ease(seg(t, T.fall - 0.8, T.fall - 0.05)));
    this.sound.update({ spool, where: 'hangar', dist: cam.position.distanceTo(hero.jet.root.position) });
  }
}
