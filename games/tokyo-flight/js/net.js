// net.js — where the map data comes from.
// On the published site every tile is asked for at the cache route (/gsi/..., /plateau/...) of
// https://tokyo.johngresh.org. A small Cloudflare Worker (worker/index.js) answers there: it fetches the tile
// from the survey's server once, keeps a copy at the edge and tells the browser it may keep its copy for a month.
// The page may itself be served from somewhere else (johngresh.org's front page is this page, copied into that
// site): it then asks the same Worker across origins, which the Worker allows for that site.
// Run from a folder on this PC, or if that route starts failing, tiles are fetched straight from the source.
const Q = new URLSearchParams(location.search);
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
const GSI = 'https://cyberjapandata.gsi.go.jp/xyz/', PLATEAU = 'https://assets.cms.plateau.reearth.io/assets/';

export const HOME = 'https://tokyo.johngresh.org';                    // the site that has the Worker and the map page
// ?proxy=1 on this PC means "the cache route of whatever is serving this page" (wrangler dev); ?proxy=live means the published one
const ROUTE = local && Q.get('proxy') !== 'live' ? location.origin : HOME;
export const NET = { proxy: Q.has('direct') ? false : Q.has('proxy') ? true : !local, route: ROUTE, fails: 0, viaCache: 0, direct: 0 };
// links to the map page work from wherever this page is served
export const EXPLORE = local || location.origin === HOME ? './explore.html' : HOME + '/explore.html';

export const gsi = (path) => (NET.proxy ? ROUTE + '/gsi/' : GSI) + path;
export const plateau = (url) => (NET.proxy && url.startsWith(PLATEAU) ? ROUTE + '/plateau/' + url.slice(PLATEAU.length) : url);

// the same file at its source
export function source(url) {
  const u = new URL(url, location.href);
  if (u.origin !== ROUTE) return url;
  if (u.pathname.startsWith('/gsi/')) return GSI + u.pathname.slice(5);
  if (u.pathname.startsWith('/plateau/')) return PLATEAU + u.pathname.slice(9);
  return url;
}

function failed() {
  if (++NET.fails >= 4 && NET.proxy) { NET.proxy = false; console.warn('map data: the cache route keeps failing, fetching from the source instead'); }
}

// A tile request that falls back to the source when the cache route (not the tile) is at fault.
// A plain 404 is an answer (open sea has no photo) and is passed on as it is.
export async function fetchTile(url, init) {
  const src = source(url);
  if (src === url) { NET.direct++; return fetch(url, init); }
  try {
    const r = await fetch(url, init);
    if (r.ok || r.status === 404) { NET.viaCache++; return r; }
  } catch (e) {
    if (e.name === 'AbortError') throw e;
  }
  failed(); NET.direct++;
  return fetch(src, init);
}
