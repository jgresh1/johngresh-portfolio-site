// geo.js — one local frame for everything: metres east (x), up (y), south (z) of Tokyo Station.
// The PLATEAU tiles are in Earth-centred coordinates; the ground tiles are built from latitude / longitude.
// Both go through the same rigid transform, so the Earth's curve is kept (the horizon drops away for real).
import * as THREE from 'three';

export const ORIGIN = { lat: 35.6812, lon: 139.7671 };          // Tokyo Station, Marunouchi side
const A = 6378137.0, F = 1 / 298.257222101, E2 = F * (2 - F);    // GRS80, the ellipsoid of JGD2011
const D2R = Math.PI / 180;

// Height of the geoid (mean sea level) above the ellipsoid. The ground model is in metres above sea level,
// the building tiles are in metres above the ellipsoid, so this is what seats the buildings on the ground.
// Fitted in the scene itself (__tokyo.calib with ?cal=1): the lowest point of every building against the
// ground under it, at ten places from Kasai to Hachioji, 600 to 4,500 buildings each. It slopes about 1.5 m
// across the wards and steepens towards the western hills. Fit error: under 0.2 m in the wards, 0.3 m in Tama.
// The constant leaves buildings 0.12 m into the ground rather than hovering over it.
export const GEOID = { n0: 36.65, dLat: 6.16, dLon: -4.43, west: 15, westFrom: 0.2 };
export function geoid(lat, lon) {
  const dl = lon - ORIGIN.lon, w = Math.max(0, -dl - GEOID.westFrom);
  return GEOID.n0 + GEOID.dLat * (lat - ORIGIN.lat) + GEOID.dLon * dl + GEOID.west * w * w;
}

function ecef(lat, lon, h, out) {
  const p = lat * D2R, l = lon * D2R, sp = Math.sin(p), cp = Math.cos(p);
  const N = A / Math.sqrt(1 - E2 * sp * sp);
  out[0] = (N + h) * cp * Math.cos(l); out[1] = (N + h) * cp * Math.sin(l); out[2] = (N * (1 - E2) + h) * sp;
  return out;
}

const p0 = ORIGIN.lat * D2R, l0 = ORIGIN.lon * D2R;
const EAST = [-Math.sin(l0), Math.cos(l0), 0];
const NORTH = [-Math.sin(p0) * Math.cos(l0), -Math.sin(p0) * Math.sin(l0), Math.cos(p0)];
const UP = [Math.cos(p0) * Math.cos(l0), Math.cos(p0) * Math.sin(l0), Math.sin(p0)];
const C0 = ecef(ORIGIN.lat, ORIGIN.lon, GEOID.n0, [0, 0, 0]);    // sea level under the origin is y = 0

const _t = [0, 0, 0];
// latitude, longitude (degrees), height above the ellipsoid (m) -> local metres
export function llhToWorld(lat, lon, h, out = new THREE.Vector3()) {
  ecef(lat, lon, h, _t);
  const dx = _t[0] - C0[0], dy = _t[1] - C0[1], dz = _t[2] - C0[2];
  out.x = EAST[0] * dx + EAST[1] * dy + EAST[2] * dz;
  out.y = UP[0] * dx + UP[1] * dy + UP[2] * dz;
  out.z = -(NORTH[0] * dx + NORTH[1] * dy + NORTH[2] * dz);
  return out;
}
// latitude, longitude, height above sea level -> local metres
export function geoToWorld(lat, lon, elev = 0, out) { return llhToWorld(lat, lon, elev + geoid(lat, lon), out); }

// local metres -> { lat, lon, h (ellipsoid), elev (sea level) }
export function worldToGeo(v) {
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
  const la = lat / D2R, lo = lon / D2R;
  return { lat: la, lon: lo, h, elev: h - geoid(la, lo) };
}

// Earth-centred -> local, as a matrix for the tile groups
export const ECEF_TO_WORLD = new THREE.Matrix4().set(
  EAST[0], EAST[1], EAST[2], -(EAST[0] * C0[0] + EAST[1] * C0[1] + EAST[2] * C0[2]),
  UP[0], UP[1], UP[2], -(UP[0] * C0[0] + UP[1] * C0[1] + UP[2] * C0[2]),
  -NORTH[0], -NORTH[1], -NORTH[2], (NORTH[0] * C0[0] + NORTH[1] * C0[1] + NORTH[2] * C0[2]),
  0, 0, 0, 1,
);

/* ---------------------------------------------------------------- web-mercator map tiles */
export const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
export const tileLat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / D2R;
export const lonTile = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const latTile = (lat, z) => ((1 - Math.asinh(Math.tan(lat * D2R)) / Math.PI) / 2) * 2 ** z;
// ground metres per tile at latitude
export const tileMetres = (z, lat = ORIGIN.lat) => (40075016.686 * Math.cos(lat * D2R)) / 2 ** z;
