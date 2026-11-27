// airports.js — the world's airports, and the runways laid at the ones the aircraft is near.
//
// The list is OurAirports' (public domain), cut down by tools/build_airports.py to the 13,000 airports that have at
// least one runway with both ends surveyed: those can be laid exactly over the runway in the photograph. It is one
// file, fetched once behind the title. Runways are built when the aircraft comes within a few kilometres of an
// airport (or is put on one), the ground is pressed level under them, and they are taken away again far behind.
import * as THREE from 'three';
import { Runway } from './fly/runway.js';

const D2R = Math.PI / 180;
const km = (lat0, lon0, lat1, lon1) => { let dl = lon1 - lon0; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360; return Math.hypot((lat1 - lat0) * 110.574, dl * 111.32 * Math.cos(lat0 * D2R)); };
const SIZES = ['airfield', 'airport', 'major airport'];

export class Airports {
  constructor() {
    this.list = []; this.grid = new Map(); this.ready = false; this.failed = false;
    this.active = new Map();                    // ident -> { a, runways: [Runway] }
    this.group = new THREE.Group(); this.group.name = 'runways'; this.group.matrixAutoUpdate = false;
    this.all = [];                              // every runway laid just now
    this.rev = 0; this.at0 = { lat: 1e9, lon: 1e9 };
    this.loaded = null;
  }

  load(url = new URL('../data/airports.json', import.meta.url).href) {
    return (this.loaded ??= fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((j) => {
      for (const r of j.airports) {
        const a = { id: r[0], iata: r[1], name: r[2], town: r[3], cc: r[4], lat: r[5], lon: r[6], elev: r[7], size: r[8], rw: r[9], kind: SIZES[r[8]] };
        a.longest = 0; for (const q of a.rw) a.longest = Math.max(a.longest, km(q[2], q[3], q[4], q[5]) * 1000);
        this.list.push(a);
        const k = Math.floor(a.lat) + '_' + Math.floor(a.lon); let cell = this.grid.get(k); if (!cell) this.grid.set(k, (cell = [])); cell.push(a);
      }
      this.ready = true; return this;
    }).catch((e) => { console.warn('airports', e.message || e); this.failed = true; return this; }));
  }

  // airports within `maxKm` of a place, nearest first: [{ a, d (km) }]
  near(lat, lon, maxKm = 50, minSize = 0) {
    const out = [], dLat = Math.ceil(maxKm / 110.5), dLon = Math.min(Math.ceil(maxKm / (111.3 * Math.max(Math.cos(lat * D2R), 0.05))), 180);
    for (let y = Math.floor(lat) - dLat; y <= Math.floor(lat) + dLat; y++) for (let x = Math.floor(lon) - dLon; x <= Math.floor(lon) + dLon; x++) {
      const cell = this.grid.get(y + '_' + (((x + 180) % 360 + 360) % 360 - 180)); if (!cell) continue;
      for (const a of cell) { if (a.size < minSize) continue; const d = km(lat, lon, a.lat, a.lon); if (d <= maxKm) out.push({ a, d }); }
    }
    return out.sort((p, q) => p.d - q.d);
  }
  byId(id) { id = (id || '').toUpperCase(); return this.list.find((a) => a.id === id || (a.iata && a.iata === id)) || null; }
  // airports whose code, name or town begins with or holds the words typed, best first
  search(text, max = 8) {
    const t = text.trim().toLowerCase(); if (t.length < 2) return [];
    const out = [];
    for (const a of this.list) {
      const id = a.id.toLowerCase(), ia = a.iata.toLowerCase(), nm = a.name.toLowerCase(), tw = a.town.toLowerCase();
      let s = 0;
      if (ia === t || id === t) s = 100; else if (tw === t) s = 60; else if (tw.startsWith(t)) s = 45; else if (nm.startsWith(t)) s = 40; else if (id.startsWith(t) && t.length >= 3) s = 30; else if (nm.includes(t) || tw.includes(t)) s = 15;
      if (s) out.push({ a, s: s + a.size * 12 + Math.min(a.longest / 400, 10) });
    }
    return out.sort((p, q) => q.s - p.s).slice(0, max).map((o) => o.a);
  }

  // the runways of one airport, built: elevAt(lat, lon) gives the ground where the list has no height for an end
  lay(a, elevAt) {
    let rec = this.active.get(a.id); if (rec) return rec;
    rec = { a, runways: [] };
    for (const q of a.rw) {
      const e0 = q[8] ?? a.elev ?? elevAt?.(q[2], q[3]) ?? 0, e1 = q[9] ?? a.elev ?? elevAt?.(q[4], q[5]) ?? 0;
      const r = new Runway({ a: [q[2], q[3]], b: [q[4], q[5]], width: q[6], names: [q[0], q[1]], elev: [e0, e1], hard: q[7] === 0, lit: !!q[10], airport: a.iata || a.id });
      rec.runways.push(r); if (r.mesh) this.group.add(r.mesh);
    }
    this.active.set(a.id, rec); this.all = [...this.active.values()].flatMap((x) => x.runways); this.rev++;
    return rec;
  }
  lift(id) {
    const rec = this.active.get(id); if (!rec) return;
    for (const r of rec.runways) r.dispose();
    this.active.delete(id); this.all = [...this.active.values()].flatMap((x) => x.runways); this.rev++;
  }

  // Now and then, with the aircraft's place. Returns the airports whose runways were just laid (their ground needs building again).
  update(lat, lon, elevAt, inKm = 11, outKm = 19) {
    if (!this.ready) return [];
    if (km(lat, lon, this.at0.lat, this.at0.lon) < 0.6) return [];
    this.at0.lat = lat; this.at0.lon = lon;
    const laid = [];
    for (const { a } of this.near(lat, lon, inKm + 4)) if (!this.active.has(a.id) && km(lat, lon, a.lat, a.lon) < inKm + a.longest / 2000) { this.lay(a, elevAt); laid.push(a); }
    for (const [id, rec] of this.active) if (km(lat, lon, rec.a.lat, rec.a.lon) > outKm + rec.a.longest / 2000 && !rec.keep) this.lift(id);
    return laid;
  }

  // the ground model is pressed level under every runway laid
  flatten = (lat, lon, h) => { for (const r of this.all) h = r.flatten(lat, lon, h); return h; };
  // the surface height where a place is on a runway, else null
  at(lat, lon) { let best = null; for (const r of this.all) { const e = r.at(lat, lon); if (e != null && (best == null || e > best)) best = e; } return best; }
  rebase() { for (const r of this.all) r.place(); }

  // the runway to take off from at an airport: its longest hard one (else its longest), from the end that faces most into the wind
  pick(a, windFrom = null, elevAt = null) {
    const rec = this.lay(a, elevAt); rec.keep = true;
    let best = rec.runways[0]; for (const r of rec.runways) if ((r.hard ? 1e6 : 0) + r.length > (best.hard ? 1e6 : 0) + best.length) best = r;
    // Which end. Downhill, where the runway has a real slope (Lukla, Courchevel). Else towards the lower ground, where
    // one end faces a mountain (Innsbruck, Paro). Else into the wind. Else from the end it is listed from.
    let far = false, why = 'as listed';
    const slope = (best.e1 - best.e0) / best.length;
    const ahead = (fromB) => { let worst = -1e9; if (!elevAt) return 0; for (const d of [1200, 2500, 4500, 7500]) { const [la, lo] = fromB ? best.geo(-d, 0) : best.geo(best.length + d, 0); worst = Math.max(worst, (elevAt(la, lo) - (fromB ? best.e0 : best.e1)) / d); } return worst; };
    const r0 = ahead(false), r1 = ahead(true);
    if (Math.abs(slope) > 0.012) { far = slope > 0; why = 'downhill'; }
    else if (Math.abs(r0 - r1) > 0.018) { far = r1 < r0; why = 'towards the lower ground'; }
    else if (windFrom != null) { far = Math.abs(((best.heading - windFrom + 540) % 360) - 180) > 90; why = 'into the wind'; }
    return { runway: best, far, why };
  }
}
