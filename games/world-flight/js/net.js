// net.js — where the world comes from. Four open sources, none needing an account or a key:
//
//   photo      Esri World Imagery (satellite and aerial photographs, the whole Earth; a metre or better over most land)
//   height     the Terrain Tiles on AWS Open Data ("terrarium": SRTM and national surveys on land, GEBCO under the sea)
//   map        OpenFreeMap's vector tiles of OpenStreetMap: water, buildings, woods, runways, place names
//   weather    Open-Meteo and NOAA's airport reports (weather.js)
//
// Every tile is asked for straight from its source; they are all built to be read by pages on other sites.
// One place to change if a source moves: this file.
const Q = new URLSearchParams(location.search);
export const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
export const HOME = local ? location.origin : new URL('..', import.meta.url).href.replace(/\/$/, '');      // where this page's own files and weather route are

// The live weather is asked for through a small route that keeps one answer for every visitor for a few minutes and
// can read the airports' own reports (a page cannot, directly): serve.py on this PC; on the published site the route
// Tokyo Flight's Worker already has (it takes any place on Earth, and allows johngresh.org). If it does not answer,
// weather.js asks Open-Meteo itself and does without the airports.
export const WX = local ? location.origin : 'https://tokyo.johngresh.org';

export const NET = { photo: 0, height: 0, map: 0, fails: 0, bytes: 0 };
// Esri answers with this exact little picture ("Map data not yet available") where it has nothing sharper
export const PHOTO_BLANK = 2521;
export const PHOTO_MAX = 19;

const PHOTO = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
const HEIGHT = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/';
const MAPS = 'https://tiles.openfreemap.org/planet';

const wrap = (x, z) => { const n = 2 ** z; return ((x % n) + n) % n; };
export const photoUrl = (z, x, y) => `${PHOTO}${z}/${y}/${wrap(x, z)}`;
export const heightUrl = (z, x, y) => `${HEIGHT}${z}/${wrap(x, z)}/${y}.png`;

// The vector tiles' address carries the date of the weekly build, so it is read from the service's own
// description once (a small JSON file) and every tile is asked for at the address that gives.
let mapTemplate = null, mapAsked = null;
export function mapReady() {
  return (mapAsked ??= fetch(MAPS).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((j) => { mapTemplate = j.tiles[0]; return mapTemplate; })
    .catch((e) => { console.warn('map tiles: no address', e.message || e); mapAsked = null; NET.fails++; return null; }));
}
export const mapUrl = (z, x, y) => (mapTemplate ? mapTemplate.replace('{z}', z).replace('{x}', wrap(x, z)).replace('{y}', y) : null);

// kept as a function of its own so every tile goes through one door (counts, and one place to add a cache route)
export function fetchTile(url, init) { return fetch(url, init); }

export const CREDITS = 'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community · Heights: Mapzen / AWS Terrain Tiles (SRTM, GEBCO and national surveys) · Map: OpenFreeMap © OpenMapTiles, data from OpenStreetMap · Weather: Open-Meteo, NOAA · Airports: OurAirports · Clouds and city lights on the globe: NASA EOSDIS GIBS';
export const opt = (k, d = null) => (Q.has(k) ? Q.get(k) : d);
