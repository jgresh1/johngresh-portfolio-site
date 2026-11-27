// geo.js — one local frame for everything: metres east (x), up (y), south (z) of a point on the Earth.
//
// In Tokyo Flight that point is Tokyo Station for good. Here it can be anywhere, and it moves: the page puts it
// under the place that was picked, and moves it again whenever the aircraft has flown some way from it
// (`moveOrigin`, which hands back the rigid move from the old frame to the new one, so everything already built
// is carried across exactly). Near the origin "up" is straight up and the ground is level, which is all the
// flight model and the cameras ever assume. The Earth's curve is kept: the ground drops away from the origin for real.
//
// Heights are metres above sea level everywhere (the elevation tiles, the airports' own figures), and sea level is
// taken to be the surface of the WGS84 ellipsoid. The few tens of metres between the two do not show.
import * as THREE from 'three';

export const ORIGIN = { lat: 0, lon: 0, rev: 0 };               // rev goes up each time it moves
const A = 6378137.0, F = 1 / 298.257223563, E2 = F * (2 - F);    // WGS84
const D2R = Math.PI / 180;
export const R_EARTH = 6371000;

export function ecef(lat, lon, h, out) {
  const p = lat * D2R, l = lon * D2R, sp = Math.sin(p), cp = Math.cos(p);
  const N = A / Math.sqrt(1 - E2 * sp * sp);
  out[0] = (N + h) * cp * Math.cos(l); out[1] = (N + h) * cp * Math.sin(l); out[2] = (N * (1 - E2) + h) * sp;
  return out;
}

const EAST = [0, 1, 0], NORTH = [0, 0, 1], UP = [1, 0, 0], C0 = [A, 0, 0];
// Earth-centred -> local, as a matrix (whole numbers of metres in the millions: kept in doubles, never on the graphics card)
export const ECEF_TO_WORLD = new THREE.Matrix4();

export function setOrigin(lat, lon) {
  ORIGIN.lat = lat; ORIGIN.lon = ((lon + 540) % 360) - 180; ORIGIN.rev++;
  const p0 = lat * D2R, l0 = lon * D2R;
  EAST[0] = -Math.sin(l0); EAST[1] = Math.cos(l0); EAST[2] = 0;
  NORTH[0] = -Math.sin(p0) * Math.cos(l0); NORTH[1] = -Math.sin(p0) * Math.sin(l0); NORTH[2] = Math.cos(p0);
  UP[0] = Math.cos(p0) * Math.cos(l0); UP[1] = Math.cos(p0) * Math.sin(l0); UP[2] = Math.sin(p0);
  ecef(lat, lon, 0, C0);                                         // sea level under the origin is y = 0
  ECEF_TO_WORLD.set(
    EAST[0], EAST[1], EAST[2], -(EAST[0] * C0[0] + EAST[1] * C0[1] + EAST[2] * C0[2]),
    UP[0], UP[1], UP[2], -(UP[0] * C0[0] + UP[1] * C0[1] + UP[2] * C0[2]),
    -NORTH[0], -NORTH[1], -NORTH[2], (NORTH[0] * C0[0] + NORTH[1] * C0[1] + NORTH[2] * C0[2]),
    0, 0, 0, 1,
  );
  return ORIGIN;
}
setOrigin(35.5494, 139.7798);       // somewhere real until the page says where (Haneda)

// Put the origin somewhere else. Returns the matrix that carries a point of the old frame to the same point of the
// Earth in the new frame (a turn of a fraction of a degree and a slide): multiply every placed thing by it.
const _old = new THREE.Matrix4();
export function moveOrigin(lat, lon, out = new THREE.Matrix4()) {
  _old.copy(ECEF_TO_WORLD).invert();
  setOrigin(lat, lon);
  return out.multiplyMatrices(ECEF_TO_WORLD, _old);
}

const _t = [0, 0, 0];
// latitude, longitude (degrees), height above sea level (m) -> local metres
export function geoToWorld(lat, lon, elev = 0, out = new THREE.Vector3()) {
  ecef(lat, lon, elev, _t);
  const dx = _t[0] - C0[0], dy = _t[1] - C0[1], dz = _t[2] - C0[2];
  out.x = EAST[0] * dx + EAST[1] * dy + EAST[2] * dz;
  out.y = UP[0] * dx + UP[1] * dy + UP[2] * dz;
  out.z = -(NORTH[0] * dx + NORTH[1] * dy + NORTH[2] * dz);
  return out;
}
export const llhToWorld = geoToWorld;

// local metres -> { lat, lon, elev (above sea level) }
export function worldToGeo(v, out = {}) {
  const X = C0[0] + EAST[0] * v.x + UP[0] * v.y - NORTH[0] * v.z;
  const Y = C0[1] + EAST[1] * v.x + UP[1] * v.y - NORTH[1] * v.z;
  const Z = C0[2] + EAST[2] * v.x + UP[2] * v.y - NORTH[2] * v.z;
  const lon = Math.atan2(Y, X), p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - E2)), N = A, h = 0;
  for (let i = 0; i < 5; i++) {
    const s = Math.sin(lat);
    N = A / Math.sqrt(1 - E2 * s * s);
    h = p / Math.cos(lat) - N;
    lat = Math.atan2(Z, p * (1 - E2 * N / (N + h)));
  }
  out.lat = lat / D2R; out.lon = lon / D2R; out.h = h; out.elev = h;
  return out;
}

// The frame of a place of its own: x east, y up, z south there, as a matrix into the current local frame.
// Things built in metres round a point (a square of buildings, a runway) are placed with it.
const _e = [0, 0, 0], _n = [0, 0, 0], _u = [0, 0, 0], _c = [0, 0, 0];
export function frameAt(lat, lon, elev = 0, out = new THREE.Matrix4()) {
  const p = lat * D2R, l = lon * D2R;
  _e[0] = -Math.sin(l); _e[1] = Math.cos(l); _e[2] = 0;
  _n[0] = -Math.sin(p) * Math.cos(l); _n[1] = -Math.sin(p) * Math.sin(l); _n[2] = Math.cos(p);
  _u[0] = Math.cos(p) * Math.cos(l); _u[1] = Math.cos(p) * Math.sin(l); _u[2] = Math.sin(p);
  ecef(lat, lon, elev, _c);
  const W = (axis, v) => axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  const dx = _c[0] - C0[0], dy = _c[1] - C0[1], dz = _c[2] - C0[2];
  // columns: where the place's east, up and south point in the local frame; then where the place is
  const col = (v, s) => [s * W(EAST, v), s * W(UP, v), -s * W(NORTH, v)];
  const cE = col(_e, 1), cU = col(_u, 1), cS = col(_n, -1);
  out.set(
    cE[0], cU[0], cS[0], EAST[0] * dx + EAST[1] * dy + EAST[2] * dz,
    cE[1], cU[1], cS[1], UP[0] * dx + UP[1] * dy + UP[2] * dz,
    cE[2], cU[2], cS[2], -(NORTH[0] * dx + NORTH[1] * dy + NORTH[2] * dz),
    0, 0, 0, 1,
  );
  return out;
}

// metres east and north from one place to another near it, and the place that far from another
export function offsetMetres(lat0, lon0, lat, lon) {
  const m = 111320 * Math.cos(lat0 * D2R);
  let dl = lon - lon0; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
  return [dl * m, (lat - lat0) * 110574];
}
export function distanceKm(lat0, lon0, lat1, lon1) {
  const a = Math.sin((lat1 - lat0) * D2R / 2) ** 2 + Math.cos(lat0 * D2R) * Math.cos(lat1 * D2R) * Math.sin((lon1 - lon0) * D2R / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}
// the place `dist` metres from another along a true bearing (degrees)
export function destination(lat, lon, bearing, dist) {
  const d = dist / 6371000, b = bearing * D2R, p1 = lat * D2R, l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / D2R, ((l2 / D2R + 540) % 360) - 180];
}
export function bearing(lat0, lon0, lat1, lon1) {
  const p1 = lat0 * D2R, p2 = lat1 * D2R, dl = (lon1 - lon0) * D2R;
  return ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / D2R) + 360) % 360;
}

/* ---------------------------------------------------------------- web-mercator map tiles */
export const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
export const tileLat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / D2R;
export const lonTile = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const latTile = (lat, z) => ((1 - Math.asinh(Math.tan(Math.max(-85.0511, Math.min(85.0511, lat)) * D2R)) / Math.PI) / 2) * 2 ** z;
// ground metres per tile at latitude
export const tileMetres = (z, lat = ORIGIN.lat) => (40075016.686 * Math.cos(lat * D2R)) / 2 ** z;
// a tile column brought back into 0 .. 2^z - 1 (the map joins up at the date line)
export const wrapX = (x, z) => { const n = 2 ** z; return ((x % n) + n) % n; };
