// weather.js — the weather: what the open services report now, or a condition picked from the menu, turned into
// everything the game draws and feels from it.
//
// Live data, both free and open, no key:
//   Open-Meteo (open-meteo.com, CC BY 4.0; for Japan it serves the Japan Meteorological Agency's models): a grid of
//     nine points round the aircraft, each with cloud cover at three heights, rain, showers, snowfall, lying snow,
//     visibility, wind, gusts, temperature, dew point and a weather code. New values every 15 minutes.
//   NOAA Aviation Weather Center (aviationweather.gov, public domain): the airports' own reports (METAR) inside the
//     same area: measured cloud bases, visibility, wind, and what is falling. Every 30 minutes, or sooner on a change.
// The model says how much cloud there is everywhere; the nearest airport, when one is close, corrects the base
// height, the visibility, the wind and the kind of precipitation with what was actually seen there.
// Both are asked for through the site's own route (/wx/..., worker/index.js or serve.py), which keeps one answer
// for everybody for a few minutes. If that route is not there, Open-Meteo is asked directly (it allows that; the
// airport reports do not, and are then done without).
//
// A sky is a list of plain numbers (SKY below), so one sky can be blended into another: a change of weather drifts
// in over half a minute instead of switching.
import * as THREE from 'three';
import { ATMO } from './atmo.js';
import { worldToGeo, geoToWorld } from './geo.js';
import { HOME } from './net.js';

const D2R = Math.PI / 180, clamp = (x, a, b) => (x < a ? a : x > b ? b : x), lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Heights are metres above the sea. Kind of low cloud: 0 = a flat sheet (stratus, nimbostratus), 1 = heaps with level
// bases (cumulus), 2 = towers with an anvil (cumulonimbus); values between are mixtures (0.5 = stratocumulus).
export const SKY = {
  low: 0, lowBase: 1000, lowTop: 1900, lowKind: 1, lowSig: 0.032, lowErode: 0.42, anvil: 0, even: 1,
  mid: 0, midBase: 3600, midTop: 4300, midKind: 1, midSig: 0.009,
  high: 0, highAlt: 9800, highOp: 0.55,
  rain: 0,            // mm an hour of liquid water
  snow: 0,            // cm an hour of snow
  hail: 0,            // 0..1
  fine: 0,            // 1 = drizzle or snow grains: small drops, many of them
  freezing: 0,        // 1 = it freezes where it lands
  showery: 0,         // 1 = it falls only under the thick cloud, in curtains
  vis: 40000,         // how far one can see at the ground (m)
  fogTop: 0,          // the height the poor visibility reaches (0 = it is the ordinary haze, thinning over 1.4 km)
  wind: 3, windDir: 200, gust: 4,      // m/s, the direction it comes from
  thunder: 0, temp: 15, lying: 0,      // lightning 0..1, degrees C, snow lying (m)
  turb: 0.1,          // how rough the air is, 0..1
  dark: 0,            // how much a thick sky dims the day, 0..1
};
const sky = (o) => ({ ...SKY, ...o });
const SHEET = { lowKind: 0, lowSig: 0.021, lowErode: 0.22, midKind: 0 };
const RAINY = { ...SHEET, low: 1, lowKind: 0.12, mid: 1, midBase: 3000, midTop: 5400, midSig: 0.012, high: 0.4 };

// Every condition a report can name. The same list is the menu.
export const CONDITIONS = {
  clear: { name: 'Clear', sky: sky({ high: 0.06, vis: 55000 }) },
  few: { name: 'A few clouds', sky: sky({ low: 0.17, lowBase: 1150, lowTop: 2000, high: 0.2, vis: 42000 }) },
  scattered: { name: 'Scattered cloud', sky: sky({ low: 0.40, lowBase: 1050, lowTop: 2350, mid: 0.08, high: 0.3, vis: 34000, turb: 0.2 }) },
  broken: { name: 'Broken cloud', sky: sky({ low: 0.72, lowKind: 0.6, lowBase: 950, lowTop: 1950, lowErode: 0.34, mid: 0.3, high: 0.3, vis: 26000, turb: 0.2, dark: 0.1 }) },
  overcast: { name: 'Overcast', sky: sky({ ...SHEET, low: 1, lowBase: 650, lowTop: 1300, mid: 0.85, high: 0.3, vis: 16000, dark: 0.3 }) },
  haze: { name: 'Haze', sky: sky({ high: 0.2, vis: 4500, fogTop: 1100 }) },
  mist: { name: 'Mist', sky: sky({ ...SHEET, low: 0.5, lowBase: 240, lowTop: 520, vis: 2400, fogTop: 230, high: 0.15, wind: 1.5, gust: 2 }) },
  fog: { name: 'Fog', sky: sky({ ...SHEET, low: 1, lowBase: -70, lowTop: 250, lowSig: 0.014, lowErode: 0.1, vis: 9000, high: 0.1, wind: 1, gust: 1.5, temp: 6, turb: 0.03 }) },
  rimefog: { name: 'Freezing fog', sky: sky({ ...SHEET, low: 1, lowBase: -70, lowTop: 220, lowSig: 0.016, lowErode: 0.1, vis: 9000, wind: 1, gust: 1.5, temp: -3, freezing: 1, lying: 0.004, turb: 0.03 }) },
  drizzle: { name: 'Drizzle', sky: sky({ ...SHEET, low: 1, lowBase: 280, lowTop: 950, mid: 0.6, rain: 0.5, fine: 1, vis: 4500, fogTop: 420, temp: 11, dark: 0.4 }) },
  fzdrizzle: { name: 'Freezing drizzle', sky: sky({ ...SHEET, low: 1, lowBase: 260, lowTop: 900, mid: 0.6, rain: 0.5, fine: 1, freezing: 1, vis: 4000, fogTop: 400, temp: -1.5, dark: 0.4 }) },
  lightrain: { name: 'Light rain', sky: sky({ ...RAINY, lowBase: 620, lowTop: 2700, rain: 1.6, vis: 9000, fogTop: 800, temp: 12, wind: 4, gust: 7, dark: 0.45 }) },
  rain: { name: 'Rain', sky: sky({ ...RAINY, lowBase: 460, lowTop: 2900, rain: 5.5, vis: 5500, fogTop: 650, temp: 12, wind: 6, gust: 10, turb: 0.2, dark: 0.58 }) },
  heavyrain: { name: 'Heavy rain', sky: sky({ ...RAINY, lowBase: 300, lowTop: 3300, lowSig: 0.028, rain: 18, vis: 2400, fogTop: 520, temp: 13, wind: 9, gust: 16, turb: 0.35, dark: 0.72 }) },
  fzrain: { name: 'Freezing rain', sky: sky({ ...RAINY, lowBase: 420, lowTop: 2600, rain: 3, freezing: 1, vis: 5000, fogTop: 600, temp: -1, wind: 5, gust: 8, turb: 0.2, dark: 0.55 }) },
  sleet: { name: 'Sleet', sky: sky({ ...RAINY, lowBase: 420, lowTop: 2600, rain: 2, snow: 1.2, vis: 3500, fogTop: 600, temp: 1, wind: 6, gust: 10, turb: 0.2, dark: 0.55 }) },
  showers: { name: 'Showers', sky: sky({ low: 0.52, lowKind: 1.45, lowBase: 850, lowTop: 5200, lowSig: 0.036, anvil: 0.2, even: 0.8, mid: 0.2, high: 0.3, rain: 6, showery: 1, vis: 22000, wind: 6, gust: 11, turb: 0.4, dark: 0.15 }) },
  heavyshowers: { name: 'Heavy showers', sky: sky({ low: 0.62, lowKind: 1.7, lowBase: 750, lowTop: 7600, lowSig: 0.04, anvil: 0.5, even: 0.7, mid: 0.3, high: 0.4, rain: 20, showery: 1, vis: 18000, wind: 8, gust: 15, turb: 0.55, dark: 0.25 }) },
  thunder: { name: 'Thunderstorm', sky: sky({ low: 0.7, lowKind: 2, lowBase: 700, lowTop: 11500, lowSig: 0.045, anvil: 1, even: 0.6, mid: 0.4, high: 0.5, highAlt: 12200, rain: 24, showery: 1, thunder: 1, vis: 14000, wind: 9, gust: 19, temp: 24, turb: 0.8, dark: 0.45 }) },
  hail: { name: 'Thunderstorm with hail', sky: sky({ low: 0.74, lowKind: 2, lowBase: 650, lowTop: 12000, lowSig: 0.048, anvil: 1, even: 0.6, mid: 0.4, high: 0.5, highAlt: 12600, rain: 16, hail: 1, showery: 1, thunder: 1, vis: 12000, wind: 10, gust: 22, temp: 22, turb: 0.9, dark: 0.5 }) },
  lightsnow: { name: 'Light snow', sky: sky({ ...RAINY, lowBase: 520, lowTop: 2300, snow: 0.6, vis: 4200, fogTop: 700, temp: -1, lying: 0.02, wind: 3, gust: 5, dark: 0.3 }) },
  snow: { name: 'Snow', sky: sky({ ...RAINY, lowBase: 400, lowTop: 2500, snow: 2.2, vis: 1500, fogTop: 600, temp: -2, lying: 0.08, wind: 5, gust: 8, turb: 0.15, dark: 0.38 }) },
  heavysnow: { name: 'Heavy snow', sky: sky({ ...RAINY, lowBase: 280, lowTop: 2800, lowSig: 0.027, snow: 5.5, vis: 600, fogTop: 520, temp: -3, lying: 0.22, wind: 8, gust: 14, turb: 0.3, dark: 0.45 }) },
  snowgrains: { name: 'Snow grains', sky: sky({ ...SHEET, low: 1, lowBase: 300, lowTop: 850, mid: 0.4, snow: 0.3, fine: 1, vis: 3500, fogTop: 450, temp: -2, lying: 0.01, dark: 0.3 }) },
  snowshowers: { name: 'Snow showers', sky: sky({ low: 0.55, lowKind: 1.4, lowBase: 700, lowTop: 4200, lowSig: 0.034, anvil: 0.2, even: 0.8, mid: 0.2, high: 0.3, snow: 3, showery: 1, vis: 20000, temp: -2, lying: 0.05, wind: 7, gust: 12, turb: 0.4, dark: 0.15 }) },
};
export const MENU = ['clear', 'few', 'scattered', 'broken', 'overcast', 'haze', 'mist', 'fog', 'drizzle', 'lightrain', 'rain', 'heavyrain', 'showers', 'thunder', 'hail', 'sleet', 'fzrain', 'lightsnow', 'snow', 'heavysnow', 'snowshowers'];
// the weather code the model gives (WMO table 4677, as Open-Meteo uses it) -> condition
const CODE = { 0: 'clear', 1: 'few', 2: 'scattered', 3: 'overcast', 45: 'fog', 48: 'rimefog', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'fzdrizzle', 57: 'fzdrizzle',
  61: 'lightrain', 63: 'rain', 65: 'heavyrain', 66: 'fzrain', 67: 'fzrain', 71: 'lightsnow', 73: 'snow', 75: 'heavysnow', 77: 'snowgrains',
  80: 'showers', 81: 'showers', 82: 'heavyshowers', 85: 'snowshowers', 86: 'snowshowers', 95: 'thunder', 96: 'hail', 99: 'hail' };
const OKTA = { SKC: 0, CLR: 0, NSC: 0, NCD: 0, CAVOK: 0, FEW: 0.19, SCT: 0.44, BKN: 0.75, OVC: 1, OVX: 1 };
const KEYS = Object.keys(SKY);

/* ------------------------------------------------------------------ the services */
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const ROUTE = local || location.origin === HOME ? location.origin : HOME;
const MODEL_VARS = 'temperature_2m,dew_point_2m,rain,showers,snowfall,snow_depth,weather_code,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,cape';
const GN = 3, GH = (GN - 1) / 2, DLAT = 0.6, DLON = 0.7;          // the grid asked for: 3 x 3 points, 67 km apart north-south, 63 km east-west

async function getJson(url, ms = 9000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

// One fetch of everything round (lat, lon). Returns { at, lat0, lon0, pts[9], stations[] }.
export async function fetchWeather(lat, lon) {
  const lat0 = Math.round(lat / 0.2) * 0.2, lon0 = Math.round(lon / 0.2) * 0.2, lats = [], lons = [];
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { lats.push((lat0 + (GH - j) * DLAT).toFixed(2)); lons.push((lon0 + (i - GH) * DLON).toFixed(2)); }      // rows run north to south
  const q = `lat=${lats.join(',')}&lon=${lons.join(',')}`;
  let model;
  try { model = await getJson(`${ROUTE}/wx/model?${q}`); }
  catch { model = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=${MODEL_VARS}&wind_speed_unit=ms&timezone=Asia%2FTokyo`); }
  if (!Array.isArray(model) || model.length !== GN * GN) throw new Error('weather: unexpected answer');
  const pts = model.map((m) => {
    const c = m.current || {}, per = 3600 / (c.interval || 900);
    return { code: c.weather_code ?? 0, low: (c.cloud_cover_low ?? 0) / 100, mid: (c.cloud_cover_mid ?? 0) / 100, high: (c.cloud_cover_high ?? 0) / 100,
      rain: ((c.rain ?? 0) + (c.showers ?? 0)) * per, showers: (c.showers ?? 0) * per, snow: (c.snowfall ?? 0) * per, lying: c.snow_depth ?? 0,
      vis: c.visibility ?? 30000, t: c.temperature_2m ?? 15, td: c.dew_point_2m ?? 8, wind: c.wind_speed_10m ?? 3, dir: c.wind_direction_10m ?? 200, gust: c.wind_gusts_10m ?? 4,
      cape: c.cape ?? 0, time: c.time || '', elev: m.elevation ?? 0 };
  });
  let stations = [];
  try {
    const box = [lat0 - 0.9, lon0 - 1.0, lat0 + 0.9, lon0 + 1.0].map((v) => v.toFixed(2)).join(',');
    const raw = await getJson(`${ROUTE}/wx/metar?bbox=${box}`, 7000);
    if (Array.isArray(raw)) stations = raw.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)).map(readMetar);
  } catch { /* no airport reports: the model alone */ }
  return { at: Date.now(), lat0, lon0, pts, stations };
}

// an airport's report, as the Aviation Weather Center gives it, in this file's units
export function readMetar(s) {
  const wx = ' ' + (s.wxString || '') + ' ', raw = s.rawOb || '';
  const has = (re) => re.test(wx);
  const kt = 0.514444, sm = typeof s.visib === 'string' ? (s.visib.endsWith('+') ? Infinity : parseFloat(s.visib)) : s.visib;
  const layers = (s.clouds || []).filter((c) => OKTA[c.cover] != null && Number.isFinite(c.base)).map((c) => ({ cover: OKTA[c.cover], base: c.base * 0.3048 + (s.elev || 0) }));
  return {
    id: s.icaoId, name: (s.name || s.icaoId || '').split(',')[0], lat: s.lat, lon: s.lon, elev: s.elev || 0, time: s.reportTime || '', raw,
    temp: s.temp, dew: s.dewp, dir: Number.isFinite(s.wdir) ? s.wdir : null, wind: (s.wspd || 0) * kt, gust: (s.wgst || s.wspd || 0) * kt,
    vis: Number.isFinite(sm) ? sm * 1609.34 : null, layers, clearBelow: /CAVOK|\bCLR\b|\bSKC\b|\bNSC\b|\bNCD\b/.test(raw),
    light: has(/ -\w/), heavy: has(/ \+\w/), ts: has(/TS/), sh: has(/SH/), fz: has(/FZ/),
    dz: has(/DZ/), ra: has(/RA/), sn: has(/SN/), sg: has(/SG/), pl: has(/PL/), gr: has(/GR|GS/), fg: has(/FG/), br: has(/BR/), hz: has(/HZ|FU|DU|SA/),
  };
}

/* ------------------------------------------------------------------ from a report to a sky */
// the model's values at a point of the grid -> a whole sky
export function skyFromModel(p) {
  let key = CODE[p.code] || 'clear';
  const s = { ...CONDITIONS[key].sky };
  s.low = p.low; s.mid = p.mid; s.high = p.high;
  s.temp = p.t; s.wind = p.wind; s.windDir = p.dir; s.gust = Math.max(p.gust, p.wind); s.lying = p.lying;
  s.vis = Math.min(s.vis > 30000 ? 80000 : s.vis * 1.6, Math.max(p.vis, 60));
  const wet = p.rain > 0.05 || p.snow > 0.05;
  // the base: where air lifted from the ground reaches its dew point (125 m for each degree between them), lower in rain
  const lcl = clamp(125 * (p.t - p.td), 120, 3200) * (wet ? 0.7 : 1) + Math.max(p.elev, 0);
  const fog = key === 'fog' || key === 'rimefog';
  if (!fog) {
    s.lowBase = lcl;
    if (s.lowKind >= 0.9) {
      // heaps: taller where the air is unstable; flatter and wider (stratocumulus) where they cover most of the sky
      const unstable = clamp(p.cape / 1500, 0, 1);
      if (s.lowKind < 1.2) { s.lowKind = lerp(1, 0.45, smooth(0.55, 0.95, p.low)); s.lowErode = lerp(0.42, 0.3, smooth(0.55, 0.95, p.low)); }
      const deep = s.lowKind >= 1.2 ? s.lowTop - 800 : 700 + 900 * p.low + 2200 * unstable;
      s.lowTop = lcl + deep;
    } else s.lowTop = lcl + (CONDITIONS[key].sky.lowTop - CONDITIONS[key].sky.lowBase);
    if (wet && p.low < 0.5) s.low = Math.max(p.low, 0.6);                     // it is raining: there is cloud to rain from
    s.midBase = Math.max(s.midBase, s.lowKind >= 1.2 ? 0 : s.lowTop + 500); s.midTop = s.midBase + (CONDITIONS[key].sky.midTop - CONDITIONS[key].sky.midBase);
  } else s.low = 1;
  if (wet) { s.rain = p.rain; s.snow = p.snow; if (p.snow > 0.05 && p.rain < 0.05) s.rain = 0; }
  else { s.rain = 0; s.snow = 0; }
  s.turb = clamp(s.turb + 0.02 * Math.max(s.gust - s.wind, 0) + 0.25 * clamp(p.cape / 2000, 0, 1), 0, 1);
  // how much the day is dimmed: by what is falling (the condition's own figure), else only by the cloud that is really there
  s.dark = clamp(Math.max(wet || fog ? s.dark : 0, 0.3 * smooth(0.7, 1, s.low) + 0.25 * smooth(0.6, 1, p.mid)), 0, 1);
  return { key, sky: s };
}
// correct a sky with what an airport saw; w = how much to believe it here (1 at the airport, 0 far from it)
export function applyStation(m, st, w) {
  const s = { ...m.sky }; let key = m.key;
  if (w <= 0) return { key, sky: s };
  const mix = (k, v) => { if (Number.isFinite(v)) s[k] = lerp(s[k], v, w); };
  mix('temp', st.temp); mix('wind', st.wind); mix('gust', Math.max(st.gust, st.wind));
  if (st.dir != null) { const d = ((st.dir - s.windDir + 540) % 360) - 180; s.windDir = (s.windDir + d * w + 360) % 360; }
  if (st.vis != null) s.vis = lerp(s.vis, st.vis, w);
  // cloud: the lowest reported layer under 2 km sets the low base; the fullest low layer sets the cover
  const lows = st.layers.filter((l) => l.base - st.elev < 2000), mids = st.layers.filter((l) => l.base - st.elev >= 2000 && l.base - st.elev < 6000);
  if (lows.length && !(key === 'fog' || key === 'rimefog')) {
    const deep = s.lowTop - s.lowBase, base = Math.min(...lows.map((l) => l.base)), cov = Math.max(...lows.map((l) => l.cover));
    s.lowBase = lerp(s.lowBase, base, w); s.lowTop = s.lowBase + deep; s.low = lerp(s.low, Math.max(cov, s.rain + s.snow > 0.05 ? 0.6 : 0), w);
    if (s.midBase < s.lowTop + 300 && s.lowKind < 1.2) { const dm = s.midTop - s.midBase; s.midBase = s.lowTop + 300; s.midTop = s.midBase + dm; }
  } else if (st.clearBelow || (st.layers.length && !lows.length)) s.low = lerp(s.low, 0, w * 0.9);
  if (mids.length) { const dm = s.midTop - s.midBase, base = Math.min(...mids.map((l) => l.base)); s.midBase = lerp(s.midBase, Math.max(base, s.lowKind < 1.2 ? s.lowTop + 300 : base), w); s.midTop = s.midBase + dm; s.mid = lerp(s.mid, Math.max(...mids.map((l) => l.cover)), w); }
  if (w < 0.5) return { key, sky: s };
  // what is falling, as seen
  const amount = st.heavy ? 2 : st.light ? 0 : 1;
  let seen = null;
  if (st.ts) seen = st.gr ? 'hail' : 'thunder';
  else if (st.gr) seen = 'hail';
  else if (st.fz && st.ra) seen = 'fzrain'; else if (st.fz && st.dz) seen = 'fzdrizzle';
  else if (st.pl || (st.ra && st.sn)) seen = 'sleet';
  else if (st.sn) seen = st.sh ? 'snowshowers' : ['lightsnow', 'snow', 'heavysnow'][amount];
  else if (st.sg) seen = 'snowgrains';
  else if (st.ra) seen = st.sh ? (amount === 2 ? 'heavyshowers' : 'showers') : ['lightrain', 'rain', 'heavyrain'][amount];
  else if (st.dz) seen = 'drizzle';
  else if (st.fg) seen = st.fz || (st.temp ?? 5) < 0 ? 'rimefog' : 'fog';
  else if (st.br && key !== 'fog') seen = 'mist';
  else if (st.hz) seen = 'haze';
  if (seen && seen !== key) {
    // the airport names something the model did not: take that condition's shape and what falls, keep the measured numbers
    const c = CONDITIONS[seen].sky, keep = { temp: s.temp, wind: s.wind, gust: s.gust, windDir: s.windDir, lying: Math.max(s.lying, c.lying), vis: Math.min(s.vis, st.vis ?? c.vis) };
    const cloud = seen === 'mist' || seen === 'haze' ? { low: s.low, lowBase: s.lowBase, lowTop: s.lowTop, lowKind: s.lowKind, mid: s.mid, high: s.high } : { lowBase: st.layers.length && lows.length ? s.lowBase : c.lowBase, lowTop: (st.layers.length && lows.length ? s.lowBase : c.lowBase) + (c.lowTop - c.lowBase), high: Math.max(s.high, c.high) };
    Object.assign(s, c, keep, cloud); key = seen;
  } else if (!seen && s.rain + s.snow > 0.05 && st.raw && !/\bAUTO\b/.test(st.raw)) {
    // a person at the airport reports nothing falling where the model has some: believe the person
    s.rain = lerp(s.rain, 0, w); s.snow = lerp(s.snow, 0, w);
    if (['lightrain', 'rain', 'heavyrain', 'drizzle', 'lightsnow', 'snow', 'heavysnow'].includes(key)) key = s.low > 0.85 ? 'overcast' : s.low > 0.55 ? 'broken' : 'scattered';
  }
  return { key, sky: s };
}
// in plain words
export function describe(key, s, units = 'm') {
  const ft = units === 'ft';
  let name = CONDITIONS[key]?.name || 'Weather';
  // with nothing falling, the words come from the cloud that is there (a sky full of thin high cloud is not "overcast")
  if (['clear', 'few', 'scattered', 'broken', 'overcast'].includes(key)) {
    const c = Math.max(s.low, s.mid * 0.9);
    name = c < 0.06 ? (s.high > 0.5 ? 'High cloud' : s.high > 0.15 ? 'Clear, some high cloud' : 'Clear') : c < 0.28 ? 'A few clouds' : c < 0.58 ? 'Scattered cloud' : c < 0.88 ? 'Broken cloud' : 'Overcast';
  }
  const parts = [name];
  if (s.low > 0.08 && s.lowBase > 30) parts.push(`base ${ft ? Math.round(s.lowBase * 3.28084 / 100) * 100 + ' ft' : Math.round(s.lowBase / 10) * 10 + ' m'}`);
  parts.push(`${Math.round(s.temp)} °C`);
  parts.push(s.wind < 0.5 ? 'calm' : `wind ${String(Math.round(s.windDir / 10) * 10 || 360).padStart(3, '0')}° ${ft ? Math.round(s.wind / 0.514444) + ' kt' : Math.round(s.wind * 3.6) + ' km/h'}`);
  const vis = key === 'fog' || key === 'rimefog' ? Math.min(s.vis, 3 / s.lowSig) : s.vis;
  parts.push(vis >= 10000 ? 'visibility over 10 km' : `visibility ${vis >= 1000 ? (vis / 1000).toFixed(vis < 5000 ? 1 : 0) + ' km' : Math.round(vis / 50) * 50 + ' m'}`);
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ the weather the game is in */
const MAPN = 16, MAPSIZE = 240000;          // the cover map handed to the clouds: 16 x 16 values over 240 km
export class Weather {
  // clouds: the Clouds drawer; hooks.changed(): the light or the look of the sky has moved enough to redo what depends on it
  constructor(clouds, hooks = {}) {
    this.clouds = clouds; this.hooks = hooks;
    this.mode = 'live'; this.key = 'few'; this.liveKey = 'few';
    this.now = { ...CONDITIONS.few.sky }; this.want = { ...this.now };
    this.map = new Float32Array(MAPN * MAPN * 4); this.mapWant = new Float32Array(MAPN * MAPN * 4);
    this.mapC = new THREE.Vector2(); this.mapDirty = true;
    this.data = null; this.fetching = false; this.failed = 0; this.nextTry = 0; this.station = null; this.pointTime = '';
    this.pos = { lat: 35.68, lon: 139.77 }; this.alt = 500;
    this.rate = 1 / 22;                     // how fast one sky drifts into the next (1/s)
    this.wind = new THREE.Vector3();        // the air's own movement at the aircraft (m/s, world)
    this.grey = 0; this.sunCut = 1; this.ambient = 1; this.exposure = 1; this.inCloud = 0; this.bump = 0;
    this.wet = 0; this.lying = 0;
    this.rainHere = 0; this.snowHere = 0; this.hailHere = 0;
    this.flash = { t: 1e9, seq: [], pos: new THREE.Vector3(), amp: 0, next: 4, heard: [] };
    this.onThunder = null; this.onStrike = null;
    this.drift = { lx: 0, lz: 0, mx: 0, mz: 0 };
    this._envKey = ''; this._since = 0; this._v = new THREE.Vector3(); this._t = 0;
    this.fill(this.mapWant, this.now, 1); this.map.set(this.mapWant);
  }

  // pick a condition from the menu, or 'live'. now = true puts it in place at once (no drift)
  choose(key, now = false) {
    if (key !== 'live' && !CONDITIONS[key]) return false;
    this.mode = key === 'live' ? 'live' : 'set';
    if (this.mode === 'set') { this.key = key; this.want = { ...CONDITIONS[key].sky }; this.fill(this.mapWant, this.want, 1); this.station = null; }
    else { this.nextTry = 0; if (this.data) this.derive(); }
    this.rate = 1 / 5;
    if (now) this.settle();
    return true;
  }
  // everything that drifts jumps to where it is going
  settle() {
    Object.assign(this.now, this.want); this.map.set(this.mapWant); this.mapDirty = true;
    this.wet = this.want.rain > 0.05 && this.want.temp > 0 ? 1 : 0; this.lying = clamp(this.want.lying / 0.05, 0, 1);
    this.clouds.reset = true; this._envKey = '';
  }

  // an even sky all over the map (a condition from the menu)
  fill(m, s, rain) { for (let i = 0; i < MAPN * MAPN; i++) { m[i * 4] = s.low; m[i * 4 + 1] = s.mid; m[i * 4 + 2] = s.high; m[i * 4 + 3] = s.rain + s.snow > 0.03 ? rain : 0; } }

  // the live data, worked out for where the aircraft is now
  derive() {
    const D = this.data; if (!D) return;
    const { lat, lon } = this.pos;
    // the grid's values under the aircraft, between its four nearest points
    const fx = clamp((lon - D.lon0) / DLON + GH, 0, GN - 1.001), fy = clamp((D.lat0 - lat) / DLAT + GH, 0, GN - 1.001), i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
    const P = (i, j) => D.pts[j * GN + i], near = P(Math.round(fx), Math.round(fy));
    const bl = (k) => lerp(lerp(P(i0, j0)[k], P(i0 + 1, j0)[k], tx), lerp(P(i0, j0 + 1)[k], P(i0 + 1, j0 + 1)[k], tx), ty);
    const here = { ...near }; for (const k of ['low', 'mid', 'high', 'rain', 'showers', 'snow', 'lying', 'vis', 't', 'td', 'wind', 'gust', 'cape']) here[k] = bl(k);
    let out = skyFromModel(here);
    // the nearest airport, believed fully within 12 km and not at all past 45
    let best = null, bd = 1e9;
    for (const st of D.stations) { const d = Math.hypot((st.lat - lat) * 111000, (st.lon - lon) * 91000); if (d < bd) { bd = d; best = st; } }
    const w = best ? 1 - smooth(12000, 45000, bd) : 0;
    if (best && w > 0) out = applyStation(out, best, w);
    this.station = best && w > 0.05 ? { id: best.id, name: best.name, km: bd / 1000, raw: best.raw, w } : null;
    this.pointTime = near.time;
    this.liveKey = out.key; this.key = out.key; this.want = out.sky;
    // the cover map: every cell from the grid, pulled towards the airport's cover near the airport
    const c = geoToWorld(lat, lon, 0, this._v); this.mapC.set(Math.round(c.x / 5000) * 5000, Math.round(c.z / 5000) * 5000);
    const m = this.mapWant, g = { lat: 0, lon: 0 }, v = this._v, norm = Math.max(out.sky.rain + out.sky.snow, 0.3);
    for (let j = 0; j < MAPN; j++) for (let i = 0; i < MAPN; i++) {
      v.set(this.mapC.x + ((i + 0.5) / MAPN - 0.5) * MAPSIZE, 0, this.mapC.y + ((j + 0.5) / MAPN - 0.5) * MAPSIZE);
      const q = worldToGeo(v); g.lat = q.lat; g.lon = q.lon;
      const gx = clamp((g.lon - D.lon0) / DLON + GH, 0, GN - 1.001), gy = clamp((D.lat0 - g.lat) / DLAT + GH, 0, GN - 1.001), a = Math.floor(gx), b = Math.floor(gy), u = gx - a, t = gy - b;
      const B = (k) => lerp(lerp(P(a, b)[k], P(a + 1, b)[k], u), lerp(P(a, b + 1)[k], P(a + 1, b + 1)[k], u), t);
      const far = Math.hypot(v.x - c.x, v.z - c.z), near1 = 1 - smooth(15000, 60000, far);
      const o = (j * MAPN + i) * 4, fall = B('rain') + B('snow');
      m[o] = lerp(fall > 0.05 ? Math.max(B('low'), 0.6) : B('low'), out.sky.low, near1 * w);
      m[o + 1] = lerp(B('mid'), out.sky.mid, near1 * w); m[o + 2] = B('high');
      m[o + 3] = clamp(lerp(fall / norm, out.sky.rain + out.sky.snow > 0.03 ? 1 : 0, near1 * w), 0, 1);
    }
  }

  async refresh() {
    if (this.fetching) return;
    this.fetching = true;
    try {
      this.data = await fetchWeather(this.pos.lat, this.pos.lon);
      this.failed = 0; this.nextTry = performance.now() + 900000;          // the model has new values every 15 minutes
      const first = !this._had; this._had = true;
      if (this.mode === 'live') { this.derive(); this.rate = 1 / 22; if (first) this.settle(); }
      this.hooks.report?.();
    } catch (e) {
      this.failed++; this.nextTry = performance.now() + Math.min(30000 * this.failed, 300000);
      if (this.failed === 1) console.warn('weather: no live data (' + (e.message || e) + '); fair weather until it answers');
      this.hooks.report?.();
    } finally { this.fetching = false; }
  }

  // the report line for the read-out and the menu
  line(units = 'm') { return describe(this.key, this.want, units); }
  source() {
    if (this.mode !== 'live') return 'Chosen in the menu.';
    if (!this.data) return this.failed ? 'No live weather could be read just now: fair weather is shown. It is tried again every minute.' : 'Reading the live weather…';
    const t = (this.pointTime || '').slice(11, 16);
    return `Live${t ? ', ' + t + ' Tokyo time' : ''}. Cloud, rain and wind from the Japan Meteorological Agency's model through Open-Meteo` + (this.station ? `; corrected by the report from ${this.station.name} (${this.station.id}), ${this.station.km.toFixed(0)} km away: ${this.station.raw}` : '.');
  }
  summary() { const s = this.now; return { mode: this.mode, key: this.key, low: +s.low.toFixed(2), base: Math.round(s.lowBase), top: Math.round(s.lowTop), kind: +s.lowKind.toFixed(2), mid: +s.mid.toFixed(2), high: +s.high.toFixed(2), rain: +s.rain.toFixed(1), snow: +s.snow.toFixed(1), vis: Math.round(s.vis), wind: +s.wind.toFixed(1), dir: Math.round(s.windDir), grey: +this.grey.toFixed(2), station: this.station?.id || null, ms: +this.clouds.ms.toFixed(2) }; }

  // cover at a place in the scene, from the map: [low, mid, high, rain]
  coverAt(x, z, out) {
    const fx = clamp(((x - this.mapC.x) / MAPSIZE + 0.5) * MAPN - 0.5, 0, MAPN - 1.001), fy = clamp(((z - this.mapC.y) / MAPSIZE + 0.5) * MAPN - 0.5, 0, MAPN - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, m = this.map, o = (j * MAPN + i) * 4;
    for (let k = 0; k < 4; k++) out[k] = lerp(lerp(m[o + k], m[o + 4 + k], tx), lerp(m[o + MAPN * 4 + k], m[o + MAPN * 4 + 4 + k], tx), ty);
    // the slow variation the clouds are drawn with (clouds.js, placeAt): lanes in ordinary cloud, cells in showers and storms
    const N = this.clouds.noise, D = this.clouds.drift, v = N.varyAt(x, z, 53000, 0), vb = N.varyAt(x, z, 53000, 2), smst = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const lanes = clamp(out[0] + (v - 0.5) * 2.2 * out[0] * (1 - out[0]), 0, 1), cell = clamp((this.now.lowKind - 1.15) * 2, 0, 1) * (1 - clamp((this.now.lowKind - 1.75) * 4, 0, 1));
    out[0] = lerp(lanes, clamp(out[0] * 2.15 * smst(0.30, 0.75, v), 0, 1), cell);
    out[1] = clamp(out[1] + (vb - 0.5) * 2.2 * out[1] * (1 - out[1]), 0, 1);
    return out;
  }

  // Every frame. camera: where the view is; alt: its height above the sea; plane: the aircraft's place in the scene (or null on the ground in the hangar)
  update(dt, camera, alt, plane) {
    const S = this.now, W = this.want, C = this.clouds, A = ATMO.uniforms, now = performance.now();
    this._t += dt; this.alt = alt;
    /* ---- where the aircraft is, and whether the live data is due */
    if (plane && (this._since += dt) > 2) {
      this._since = 0;
      const g = worldToGeo(this._v.copy(plane)); this.pos.lat = g.lat; this.pos.lon = g.lon;
      if (this.mode === 'live' && this.data) {
        const far = Math.hypot((g.lat - this.data.lat0) * 111000, (g.lon - this.data.lon0) * 91000);
        if (far > 38000) this.nextTry = Math.min(this.nextTry, now);                       // flown out of the middle of the grid
        this.derive();
      }
    }
    if (this.mode === 'live' && now >= this.nextTry && !this.fetching) this.refresh();
    /* ---- one sky drifts into the next */
    const k = 1 - Math.exp(-dt * this.rate);
    for (const key of KEYS) { if (key === 'windDir') { const d = ((W.windDir - S.windDir + 540) % 360) - 180; S.windDir = (S.windDir + d * k + 360) % 360; } else S[key] += (W[key] - S[key]) * k; }
    let moved = this.mapDirty; const m = this.map, mw = this.mapWant;
    for (let i = 0; i < m.length; i++) { const d = mw[i] - m[i]; if (d > 0.002 || d < -0.002) { m[i] += d * k; moved = true; } }
    if (moved) { const px = C.wx.image.data; for (let i = 0; i < m.length; i++) px[i] = Math.round(clamp(m[i], 0, 1) * 255); C.wx.needsUpdate = true; this.mapDirty = false; }
    /* ---- the clouds' shape */
    const F = C.field, here = this.coverAt(camera.position.x, camera.position.z, this._c || (this._c = [0, 0, 0, 0]));
    F.uWxST.value.set(1 / MAPSIZE, 1 / MAPSIZE, 0.5 - this.mapC.x / MAPSIZE, 0.5 - this.mapC.y / MAPSIZE);
    F.uLow.value.set(S.lowBase, Math.max(S.lowTop, S.lowBase + 120), S.lowKind, S.lowSig);
    F.uLow2.value.set(S.lowErode, S.anvil, S.showery * clamp((S.rain + S.snow * 2) / 12, 0, 1.6) * 5.5e-4, S.even);
    F.uMid.value.set(S.midBase, Math.max(S.midTop, S.midBase + 120), S.midKind, S.midSig);
    const wd = S.windDir * D2R, wx = -Math.sin(wd), wz = Math.cos(wd);                  // the way the wind blows towards (x east, z south)
    F.uHigh.value.set(S.highAlt, S.highOp, wx, wz);
    let any = 0; for (let i = 0; i < m.length; i += 4) any = Math.max(any, m[i], m[i + 1], m[i + 2]);
    C.on = any > 0.012;
    // the wind is stronger and veered higher up; each layer goes with the wind at its own height
    const up = (h) => S.wind * (1 + 1.3 * clamp(h / 2500, 0, 1.6)), veer = (h) => wd + 0.35 * clamp(h / 3000, 0, 1.5);
    const vl = up((S.lowBase + S.lowTop) / 2), al = veer((S.lowBase + S.lowTop) / 2), vm = up(S.midBase), am = veer(S.midBase);
    this.drift.lx = -Math.sin(al) * vl; this.drift.lz = Math.cos(al) * vl; this.drift.mx = -Math.sin(am) * vm; this.drift.mz = Math.cos(am) * vm;
    C.advance(dt, this.drift);
    const va = up(Math.max(alt, 0)), aa = veer(Math.max(alt, 0));
    this.wind.set(-Math.sin(aa) * va, 0, Math.cos(aa) * va);
    /* ---- how closed the sky is over the camera, and what that does to the light */
    const under = (base, top) => 1 - smooth(base + 0.25 * (top - base), top, alt);
    const cl = here[0] * under(S.lowBase, S.lowTop), cm = here[1] * under(S.midBase, S.midTop), ch = here[2] * under(S.highAlt - 300, S.highAlt + 300);
    const closed = 1 - (1 - cl) * (1 - 0.8 * cm) * (1 - 0.3 * ch * S.highOp);
    this.grey = smooth(0.45, 0.97, closed);
    const dark = S.dark * smooth(0.5, 1, closed);
    this.sunCut = (1 - 0.94 * cl) * (1 - 0.7 * cm) * (1 - 0.25 * ch);
    // inside the low layer, in cloud: the air is rougher there, and under heaps on a sunny day it rises
    const inLow = smooth(S.lowBase - 60, S.lowBase + 80, alt) * (1 - smooth(S.lowTop - 150, S.lowTop + 50, alt));
    this.inCloud = inLow * here[0];
    this.bump = clamp(S.turb * (0.5 + 0.5 * (alt < S.lowTop ? 1 : 0.35)) + this.inCloud * (0.15 + 0.3 * clamp(S.lowKind, 0, 2)) + 0.5 * S.thunder * here[0] * under(S.lowBase, S.lowTop), 0, 1.4);
    const K = ATMO.clear, lum = 0.3 * K.hor.r + 0.55 * K.hor.g + 0.15 * K.hor.b, g = this.grey;
    const ov = lum * (0.98 - 0.52 * dark);
    A.uHorizon.value.setRGB(lerp(K.hor.r, ov * 0.93, g), lerp(K.hor.g, ov * 0.97, g), lerp(K.hor.b, ov * 1.04, g));
    A.uZenith.value.setRGB(lerp(K.zen.r, ov * 0.70, g), lerp(K.zen.g, ov * 0.74, g), lerp(K.zen.b, ov * 0.82, g));
    A.uGrey.value = g;
    // haze from the visibility: what a metre of air stops = 3 / the distance one can see
    const vis = Math.max(S.vis, 40), sig = 3 / vis;
    if (S.fogTop > 1) { const bg = Math.min(sig, 3 / 22000); A.uHaze.value = Math.max(K.haze, bg); A.uFog.value.set(Math.max(sig - bg, 0), S.fogTop, 0); }
    else { A.uHaze.value = Math.max(K.haze, sig); A.uFog.value.set(0, 120, 0); }
    // the clouds' own light: the sun on them, the sky above them, what comes up from below
    const u = C.u, day = K.light, n = ATMO.night;
    u.uSunE.value = 1.75 * day;
    const ah = 0.58;
    u.uAmbHi.value.setRGB(ah * lerp(K.zen.r * 0.55 + K.hor.r * 0.5, ov * 0.9, g * 0.5) + 0.004, ah * lerp(K.zen.g * 0.55 + K.hor.g * 0.5, ov * 0.92, g * 0.5) + 0.005, ah * lerp(K.zen.b * 0.5 + K.hor.b * 0.5, ov * 0.97, g * 0.5) + 0.008);
    const bl = lum * (0.34 - 0.2 * S.dark);                                             // undersides: grey, darker the thicker the sky; at night the city's glow
    u.uAmbLo.value.setRGB(bl * 0.96 + 0.036 * n, bl * 1.0 + 0.025 * n, bl * 1.08 + 0.017 * n);
    A.uShadeFar.value.set(1 - 0.85 * here[0], 1 - 0.6 * here[1]);
    A.uEnvCloud.value.set(cl, cm, ch * S.highOp);
    // what the ground gets: the sky's own light holds up under cloud, the picture is opened up a little, a storm is dark
    this.ambient = lerp(1, 1.22 - 0.75 * dark, g);
    this.exposure = lerp(1, 1.18 - 0.42 * dark, g);
    /* ---- what is falling here */
    const below = alt < lerp(S.lowBase, S.lowTop, 0.5) ? 1 : 1 - smooth(lerp(S.lowBase, S.lowTop, 0.5), S.lowTop, alt);
    const share = S.showery > 0.5 ? smooth(0.35, 0.75, here[0]) * here[3] : here[3];
    this.rainHere = S.rain * share * below; this.snowHere = S.snow * share * below; this.hailHere = S.hail * share * below * smooth(0.5, 0.8, here[0]);
    const falling = this.rainHere > 0.05 && S.temp > -0.5;
    this.wet = clamp(this.wet + (falling ? dt / 18 : -dt / 200), 0, 1);
    this.lying = clamp(this.lying + (clamp(S.lying / 0.05, 0, 1) - this.lying) * (1 - Math.exp(-dt / 30)), 0, 1);
    A.uWet.value = this.wet; A.uSnow.value = this.lying; A.uSea.value = clamp(S.wind / 13, 0.05, 1);
    /* ---- lightning */
    this.lightning(dt, camera, S, here);
    /* ---- tell the page when the light has moved enough to redo the reflection map and the lamps */
    const key = `${Math.round(g * 14)}|${Math.round(cl * 10)}|${Math.round(cm * 8)}|${Math.round(ch * 6)}|${Math.round(dark * 10)}`;
    if (key !== this._envKey) { this._envKey = key; this.hooks.changed?.(); }
  }

  // Strokes inside the storm cloud, a few kilometres off: the cloud lights from within, the ground flickers, the
  // thunder follows by the distance.
  lightning(dt, camera, S, here) {
    const F = this.flash, A = ATMO.uniforms, u = this.clouds.u.uFlash.value;
    F.t += dt;
    if (S.thunder > 0.3 && here[0] > 0.2) {
      F.next -= dt * S.thunder;
      if (F.next <= 0) {
        F.next = 3.5 + Math.random() * 9;
        const a = Math.random() * Math.PI * 2, d = 1500 + Math.random() * Math.random() * 15000;
        F.pos.set(camera.position.x + Math.sin(a) * d, 0, camera.position.z + Math.cos(a) * d);
        F.alt = S.lowBase + (0.1 + 0.5 * Math.random()) * (S.lowTop - S.lowBase) * 0.5; F.dist = d;
        // two to four flickers in a third of a second
        F.seq = []; let t = 0; for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) { F.seq.push([t, 0.05 + Math.random() * 0.07, 0.5 + Math.random() * 0.5]); t += 0.07 + Math.random() * 0.1; }
        F.t = 0; F.ground = Math.random() < 0.45;
        this.onStrike?.(F);
        F.heard.push({ at: this._t + d / 343, d });
      }
    }
    let amp = 0; for (const [t0, len, a] of F.seq) { const x = (F.t - t0) / len; if (x >= 0 && x < 1) amp = Math.max(amp, a * (1 - x * x)); }
    F.amp = amp;
    if (amp > 0) { u.set(F.pos.x - camera.position.x, F.alt - this.alt, F.pos.z - camera.position.z, amp * 6); A.uFlash.value = amp * 2.4 / (1 + (F.dist / 5000) ** 2); }
    else { u.w = 0; A.uFlash.value = 0; }
    while (F.heard.length && F.heard[0].at <= this._t) { const h = F.heard.shift(); this.onThunder?.(h.d); }
  }
}

// Tokyo's own clock: the hour (0..24) and the day of the year, now
export function tokyoNow() {
  const d = new Date(Date.now() + 9 * 3600000);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return { hour: d.getUTCHours() + d.getUTCMinutes() / 60, day: Math.floor((d.getTime() - start) / 86400000) };
}
