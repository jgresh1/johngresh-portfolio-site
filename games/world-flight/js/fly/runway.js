// runway.js — a runway laid exactly over the one in the photograph, at any airport whose runway ends are surveyed
// (airports.js gives the ends, the width and the names, from OurAirports).
//
//   where it is     the two surveyed ends
//   its height      the two ends' own elevations, a straight grade between them; a 1% fall to each edge
//   its markings    drawn by rule in the shader, to the ICAO pattern: threshold stripes, the designation, centre line,
//                   aiming points, touchdown zone bars on the long ones, side stripes, rubber where aircraft land and,
//                   after dark, edge and centre-line lights where the airport has them
//
// The ground model is pressed down 30 cm under it (Terrain.flatten), so the photo never shows through, and the
// aircraft's wheels run on this surface, not on the 30 m ground model. A grass or gravel strip gets no surface of its
// own (the photograph is the strip) but the ground is levelled the same way, so a take-off roll is smooth.
// It is built in metres round its own middle and placed by `frameAt`, so it survives the page moving its origin.
import * as THREE from 'three';
import { geoToWorld, frameAt } from '../geo.js';
import { patch } from '../atmo.js';

const PAD = 60, BANK = 6.5;                        // paved overrun at each end; the earth bank along each side, metres
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const D2R = Math.PI / 180;

const RUNWAY = {
  vertPars: 'attribute vec2 aRw; varying vec2 vRw;', vert: 'vRw = aRw;',
  fragPars: /* glsl */`
    varying vec2 vRw; uniform float uRwLen, uRwK, uRwAim, uRwTdz, uRwLit; uniform sampler2D tRwA, tRwB;
    float rBox( float x, float a, float b, float w ) { return smoothstep( a - w, a + w, x ) - smoothstep( b - w, b + w, x ); }
    // the paint at one end. se: metres from that end; d: metres across, + to the right of a pilot lined up there
    float rEnd( float se, float d, vec2 w, sampler2D num ) {
      float ad = abs( d ), p = 0.0;
      // threshold: sixteen stripes, 30 m long, 1.8 m wide
      float m = mod( ad - 1.8, 3.6 );
      p = max( p, rBox( se, 6.0, 36.0, w.x ) * rBox( m, 0.0, 1.8, w.y ) * step( 1.8, ad ) * ( 1.0 - step( 28.8, ad ) ) );
      // designation: letter nearer the threshold, number beyond it, 18 m characters
      vec2 uv = vec2( ( d + 9.0 ) / 18.0, ( se - 46.0 ) / 52.0 );
      float inside = step( 0.0, uv.x ) * step( uv.x, 1.0 ) * step( 0.0, uv.y ) * step( uv.y, 1.0 );
      p = max( p, smoothstep( 0.35, 0.65, texture2D( num, clamp( uv, 0.002, 0.998 ) ).r ) * inside );
      // aiming point: two blocks, further in the longer the runway
      p = max( p, rBox( se, uRwAim, uRwAim * 1.15, w.x ) * rBox( ad, 9.0, 18.0, w.y ) );
      // touchdown zone: bars 22.5 m long in threes, twos and ones
      float k = floor( se / 150.0 + 0.001 ), z = se - k * 150.0;
      float n = k < 0.5 ? 0.0 : k < 2.5 ? 3.0 : k < 3.5 ? 0.0 : k < 4.5 ? 2.0 : k < 6.5 ? 1.0 : 0.0;
      float j = floor( ( ad - 9.0 ) / 3.3 ), q = ad - 9.0 - j * 3.3;
      p = max( p, uRwTdz * rBox( z, 0.0, 22.5, w.x ) * rBox( q, 0.0, 1.8, w.y ) * step( 9.0, ad ) * ( 1.0 - step( n - 0.5, j ) ) );
      return p;
    }`,
  color: /* glsl */`
    // across the runway everything is measured as on a 60 m one and squeezed to this one's width
    float rs = vRw.x, rd = vRw.y / uRwK, ra = abs( rd ), rsB = uRwLen - rs;
    vec2 rw = vec2( fwidth( rs ), fwidth( rd ) ) * 0.75 + 1e-4;
    float rse = min( rs, rsB );
    // asphalt: laid in lanes, a shade lighter where wheels have polished it, darker shoulders
    float rN = apFbm( vec2( rd * 0.9, rs * 0.07 ) ), rF = apNoise( vec2( rd, rs ) * 9.0 );
    vec3 rCol = vec3( 0.112, 0.114, 0.118 ) * ( 0.80 + 0.30 * rN ) * ( 0.94 + 0.12 * rF );
    rCol *= 1.0 - 0.22 * rBox( abs( fract( rd / 7.5 ) - 0.5 ), 0.49, 0.6, rw.y / 7.5 + 0.004 );          // paving joints
    rCol *= 1.0 + 0.10 * exp( - pow( ( ra - 4.2 ) / 3.0, 2.0 ) );
    rCol = mix( rCol, vec3( 0.085, 0.087, 0.09 ) * ( 0.85 + 0.25 * rN ), smoothstep( 30.0, 30.3, ra ) );
    // the overruns: older, paler asphalt with yellow chevrons pointing at the threshold
    float rPad = 1.0 - smoothstep( -0.3, 0.3, rse );
    rCol = mix( rCol, vec3( 0.150, 0.150, 0.146 ) * ( 0.82 + 0.3 * rN ) * ( 0.94 + 0.12 * rF ), rPad );
    float rChev = rPad * rBox( mod( - rse + ra * 0.8, 15.0 ), 0.0, 0.9, rw.x + rw.y ) * ( 1.0 - step( 30.0, ra ) ) * step( rse, -2.0 );
    // paint
    float rP = max( rEnd( rs, rd, rw, tRwA ), rEnd( rsB, - rd, rw, tRwB ) );
    rP = max( rP, rBox( mod( rs - 110.0, 50.0 ), 0.0, 30.0, rw.x ) * rBox( rd * uRwK, -0.45, 0.45, rw.y * uRwK ) * step( 110.0, rs ) * step( 110.0, rsB ) );      // centre line
    rP = max( rP, rBox( ra, 29.1, 30.0, rw.y ) * step( 6.0, rse ) );                                              // side stripes
    // rubber where aircraft touch down: streaks along the runway that dull the asphalt and bury the paint
    float rRub = smoothstep( 110.0, 320.0, rse ) * ( 1.0 - smoothstep( 650.0, 1150.0, rse ) ) * exp( - pow( ( ra - 4.6 ) / 4.6, 2.0 ) ) * ( 0.35 + 0.65 * apFbm( vec2( rd * 2.3, rs * 0.021 ) ) );
    rCol *= 1.0 - 0.42 * rRub;
    vec3 rPaint = vec3( 0.80, 0.80, 0.76 ) * ( 0.78 + 0.22 * apNoise( vec2( rd, rs ) * 2.6 ) ) * ( 1.0 - 0.72 * rRub );
    diffuseColor.rgb = mix( rCol, rPaint, rP * ( 0.86 + 0.14 * rF ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.66, 0.50, 0.07 ) * ( 0.8 + 0.2 * rF ), rChev * 0.85 );
    // beyond the shoulder the surface turns down into a grass bank
    float rBank = smoothstep( 37.4, 37.9, ra );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.100, 0.122, 0.070 ) * ( 0.8 + 0.4 * rN ) * ( 0.8 + 0.4 * apNoise( vec2( rd, rs ) * 2.3 ) ) * ( 0.86 + 0.28 * rF ), rBank );`,
  rough: 'roughnessFactor = mix( 0.92, 0.72, max( rP * 0.6, rRub ) );',
  // after dark: white edge lights every 60 m, centre-line lights every 15 m, a bar across each end
  emissive: /* glsl */`
    if ( uNight > 0.01 ) {
      float rr = max( 0.32, max( rw.x, rw.y ) * 1.3 );
      float rE = ( 1.0 - smoothstep( rr * 0.6, rr, length( vec2( mod( rs + 30.0, 60.0 ) - 30.0, ra - 30.7 ) ) ) ) * step( -1.0, rse );
      float rC = ( 1.0 - smoothstep( rr * 0.4, rr * 0.75, length( vec2( mod( rs + 7.5, 15.0 ) - 7.5, rd ) ) ) ) * step( 0.0, rse );
      float rT = ( 1.0 - smoothstep( rr * 0.5, rr * 0.9, length( vec2( rse - 3.0, mod( ra + 1.5, 3.0 ) - 1.5 ) ) ) ) * ( 1.0 - step( 30.0, ra ) );
      float rK = 0.1024 / ( rr * rr );                                   // a far light covers more of a pixel than it should: dim it to match
      totalEmissiveRadiance += ( vec3( 1.0, 0.93, 0.80 ) * ( rE * 7.0 + rC * 4.0 * uRwTdz ) + vec3( 0.25, 1.0, 0.45 ) * rT * 5.0 ) * uNight * rK * uRwLit;
    }`,
};

// the designation as a pilot lined up on it sees it: number at the far end of the block, letter nearer
function designation(number, letter) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#000'; cx.fillRect(0, 0, 256, 512); cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
  cx.font = 'bold 246px Arial, Helvetica, sans-serif';
  const put = (text, base, sx) => { cx.save(); cx.translate(128, base); cx.scale(sx, 1); cx.fillText(text, 0, 0); cx.restore(); };
  if (letter) { put(number, 197, 0.60); put(letter, 492, 0.52); } else put(number, 420, 0.60);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const _F = new THREE.Matrix4(), _I = new THREE.Matrix4();
export class Runway {
  // a, b: [lat, lon] of the two ends (take-offs here start at `a`); names: ['34R', '16L'] as painted at a and b
  constructor({ a, b, width = 45, names = ['', ''], elev = [0, 0], hard = true, lit = true, airport = '' }) {
    this.A = a; this.B = b; this.width = width; this.half = width / 2; this.hard = hard; this.lit = lit; this.names = names;
    this.shoulder = hard ? Math.min(7.5, width * 0.125) : 0; this.edge = this.half + this.shoulder;
    this.mLat = 110574 + 1120 * Math.sin(a[0] * D2R) ** 2; this.mLon = 111320 * Math.cos(a[0] * D2R);
    let dl = b[1] - a[1]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    const de = dl * this.mLon, dn = (b[0] - a[0]) * this.mLat;
    this.length = Math.hypot(de, dn);
    this.ue = de / this.length; this.un = dn / this.length;                    // unit vector along it (east, north)
    this.heading = ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360;          // degrees clockwise from north, a to b
    this.e0 = elev[0]; this.e1 = elev[1];
    this.airport = airport; this.name = (airport ? airport + ' ' : '') + names[0];
    this.pad = hard ? PAD : 20;
    const mid = this.geo(this.length / 2, 0); this.latC = mid[0]; this.lonC = mid[1];
    this.reach = (this.length / 2 + 200) / 110000;                              // degrees of latitude round the middle it can touch
    this.mesh = null;
    if (hard) this.build();
  }

  build() {
    // surface mesh: a strip every 20 m along, nine lines across (banks, shoulders, quarter lines, centre)
    const H = this.half, E = this.edge, s0 = -this.pad, rows = Math.ceil((this.length + 2 * this.pad) / 20), across = [-E - BANK, -E, -H, -H / 2, 0, H / 2, H, E, E + BANK];
    const n = (rows + 1) * across.length;
    const pos = new Float32Array(n * 3), rw = new Float32Array(n * 2), idx = [], v = new THREE.Vector3();
    const inv = _I.copy(frameAt(this.latC, this.lonC, 0, _F)).invert();
    for (let i = 0; i <= rows; i++) for (let j = 0; j < across.length; j++) {
      const s = Math.min(s0 + i * 20, this.length + this.pad), d = across[j], k = i * across.length + j;
      this.point(s, d, v);
      if (Math.abs(d) > E) v.y -= 0.55;                                 // the bank ends under the ground beside it
      v.applyMatrix4(inv);
      pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; rw[k * 2] = s; rw[k * 2 + 1] = d;
      if (i < rows && j < across.length - 1) { const a = k, b = k + 1, e = k + across.length, f = e + 1; idx.push(a, b, e, b, f, e); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aRw', new THREE.BufferAttribute(rw, 2));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    if (g.attributes.normal.getY(0) < 0) { g.index.array.reverse(); g.computeVertexNormals(); }        // wound so the top faces the sky
    const L = this.length, split = (nm) => { const m = /^(\d{1,2})([LRC]?)/.exec(nm || ''); return m ? [m[1].padStart(2, '0'), m[2]] : ['', '']; };
    const na = split(this.names[0]), nb = split(this.names[1]);
    this.texA = designation(na[0], na[1]); this.texB = designation(nb[0], nb[1]);
    const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }), 'runway', RUNWAY, {
      uRwLen: { value: L }, uRwK: { value: this.half / 30 }, uRwAim: { value: L >= 2400 ? 400 : L >= 1200 ? 300 : L >= 800 ? 250 : 150 }, uRwTdz: { value: L >= 1500 ? 1 : 0 }, uRwLit: { value: this.lit ? 1 : 0 },
      tRwA: { value: this.texA }, tRwB: { value: this.texB } });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true; this.mesh.name = 'runway'; this.mesh.matrixAutoUpdate = false;
    this.place();
  }
  // where it sits in the scene now (again after the page moves its origin)
  place() { if (this.mesh) { frameAt(this.latC, this.lonC, 0, this.mesh.matrix); this.mesh.matrixWorld.copy(this.mesh.matrix); } }
  dispose() { if (!this.mesh) return; this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.texA?.dispose(); this.texB?.dispose(); this.mesh = null; }

  // latitude, longitude -> metres along from end a, metres across (+ right of the take-off direction)
  local(lat, lon) {
    let dl = lon - this.A[1]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    const e = dl * this.mLon, n = (lat - this.A[0]) * this.mLat;
    return [e * this.ue + n * this.un, e * this.un - n * this.ue];
  }
  geo(s, d) { const e = s * this.ue + d * this.un, n = s * this.un - d * this.ue; return [this.A[0] + n / this.mLat, this.A[1] + e / this.mLon]; }
  // height of the surface above sea level
  elev(s, d) {
    const k = clamp(s / this.length, 0, 1);
    return this.e0 + (this.e1 - this.e0) * k - 0.0105 * Math.min(Math.abs(d), this.edge);
  }
  point(s, d, out = new THREE.Vector3()) { const [lat, lon] = this.geo(s, d); return geoToWorld(lat, lon, this.elev(s, d), out); }

  // the surface height at a place on the runway or its shoulders, else null
  at(lat, lon) {
    if (Math.abs(lat - this.latC) > this.reach) return null;
    const [s, d] = this.local(lat, lon);
    return s >= -this.pad && s <= this.length + this.pad && Math.abs(d) <= this.edge ? this.elev(s, d) : null;
  }
  // for the ground model: the height h, pressed down to 30 cm under the runway and eased back over 60 m around it
  flatten(lat, lon, h) {
    if (Math.abs(lat - this.latC) > this.reach) return h;
    const [s, d] = this.local(lat, lon);
    const out = Math.max(-s - this.pad, s - this.length - this.pad, Math.abs(d) - this.edge) - 8;           // metres outside the surface, with 8 m to spare
    if (out > 60) return h;
    const under = this.elev(clamp(s, -this.pad, this.length + this.pad), d) - (this.hard ? 0.3 : 0);
    if (out <= 0) return under;
    const k = out / 60, w = k * k * (3 - 2 * k);
    return under * (1 - w) + h * w;
  }
  // lined up for take-off at end a (`s` metres in), or at the other end looking back along it
  start(s = 30, far = false) {
    const [lat, lon] = this.geo(far ? this.length - s : s, 0);
    return { lat, lon, heading: far ? (this.heading + 180) % 360 : this.heading, s };
  }
}
