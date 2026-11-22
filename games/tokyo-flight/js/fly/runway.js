// runway.js — Haneda's runway 16L/34R (runway C): 3,361 m by 60 m, modelled instead of left to the aerial photo.
// Take-offs here start at the 34R end, on a true heading of 330 degrees, which points 8 degrees right of Tokyo Tower.
//
//   where it is     its centre line from OpenStreetMap (three ways tagged 16L/34R, joined end to end)
//   its height      the 5 m laser survey sampled every 60 m along it, smoothed over 240 m; a 1% fall to each edge
//   its markings    drawn by rule in the shader, to the ICAO pattern for a precision runway of this length:
//                   threshold stripes, the designation, centre line, aiming point, touchdown zone bars, side stripes
//                   and, after dark, edge and centre-line lights
//
// The ground model is pressed down 30 cm under it (Terrain.flatten), so the photo never shows through, and the
// aircraft's wheels run on this surface, not on the survey's 5 m grid.
import * as THREE from 'three';
import { geoToWorld } from '../geo.js';
import { patch } from '../atmo.js';

const A = [35.5397123, 139.8051189], B = [35.5658659, 139.7865593];        // 34R end (take-offs start here), 16L end
const WIDTH = 60, SHOULDER = 7.5, HALF = WIDTH / 2 + SHOULDER;
const PAD = 60, BANK = 6.5;                        // paved overrun at each end; the earth bank along each side, metres
const STEP = 60, PROFILE = [7.44, 7.27, 7.08, 6.7, 6.4, 6.13, 5.93, 5.82, 5.77, 5.78, 5.82, 5.86, 5.88, 5.92, 5.94, 5.97, 6.0, 6.04, 6.08, 6.13, 6.16, 6.17, 6.14, 6.07, 5.99, 5.91, 5.84, 5.81, 5.8, 5.76,
  5.71, 5.65, 5.61, 5.57, 5.56, 5.57, 5.59, 5.59, 5.59, 5.59, 5.59, 5.58, 5.56, 5.54, 5.52, 5.46, 5.43, 5.41, 5.43, 5.53, 5.71, 5.92, 6.14, 6.34, 6.45, 6.5, 6.54];       // metres above sea level, every 60 m from the 34R end
const M_LAT = 110946, M_LON = 111320 * Math.cos(A[0] * Math.PI / 180);        // metres per degree here
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

const RUNWAY = {
  vertPars: 'attribute vec2 aRw; varying vec2 vRw;', vert: 'vRw = aRw;',
  fragPars: /* glsl */`
    varying vec2 vRw; uniform float uRwLen; uniform sampler2D tRwA, tRwB;
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
      // aiming point: two blocks 60 m long, 400 m in
      p = max( p, rBox( se, 400.0, 460.0, w.x ) * rBox( ad, 9.0, 18.0, w.y ) );
      // touchdown zone: bars 22.5 m long in threes, twos and ones
      float k = floor( se / 150.0 + 0.001 ), z = se - k * 150.0;
      float n = k < 0.5 ? 0.0 : k < 2.5 ? 3.0 : k < 3.5 ? 0.0 : k < 4.5 ? 2.0 : k < 6.5 ? 1.0 : 0.0;
      float j = floor( ( ad - 9.0 ) / 3.3 ), q = ad - 9.0 - j * 3.3;
      p = max( p, rBox( z, 0.0, 22.5, w.x ) * rBox( q, 0.0, 1.8, w.y ) * step( 9.0, ad ) * ( 1.0 - step( n - 0.5, j ) ) );
      return p;
    }`,
  color: /* glsl */`
    float rs = vRw.x, rd = vRw.y, ra = abs( rd ), rsB = uRwLen - rs;
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
    rP = max( rP, rBox( mod( rs - 110.0, 50.0 ), 0.0, 30.0, rw.x ) * rBox( rd, -0.45, 0.45, rw.y ) * step( 110.0, rs ) * step( 110.0, rsB ) );      // centre line
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
      totalEmissiveRadiance += ( vec3( 1.0, 0.93, 0.80 ) * ( rE * 7.0 + rC * 4.0 ) + vec3( 0.25, 1.0, 0.45 ) * rT * 5.0 ) * uNight * rK;
    }`,
};

// the designation as a pilot lined up on it sees it: number at the far end of the block, letter nearer
function designation(number, letter) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#000'; cx.fillRect(0, 0, 256, 512); cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
  cx.font = 'bold 246px Arial, Helvetica, sans-serif';
  const put = (text, base, sx) => { cx.save(); cx.translate(128, base); cx.scale(sx, 1); cx.fillText(text, 0, 0); cx.restore(); };
  put(number, 197, 0.60); put(letter, 492, 0.52);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export class Runway {
  constructor() {
    const de = (B[1] - A[1]) * M_LON, dn = (B[0] - A[0]) * M_LAT;
    this.length = Math.hypot(de, dn);
    this.ue = de / this.length; this.un = dn / this.length;                    // unit vector along it (east, north)
    this.heading = ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360;          // degrees clockwise from north, 34R end to 16L end
    this.name = 'Haneda 34R';
    // surface mesh: a strip every 20 m along, seven lines across (edges, shoulders, centre)
    const s0 = -PAD, rows = Math.ceil((this.length + 2 * PAD) / 20), across = [-HALF - BANK, -HALF, -30, -15, 0, 15, 30, HALF, HALF + BANK];
    const c = this.point(this.length / 2, 0), n = (rows + 1) * across.length;
    const pos = new Float32Array(n * 3), rw = new Float32Array(n * 2), idx = [], v = new THREE.Vector3();
    for (let i = 0; i <= rows; i++) for (let j = 0; j < across.length; j++) {
      const s = Math.min(s0 + i * 20, this.length + PAD), d = across[j], k = i * across.length + j;
      this.point(s, d, v);
      if (Math.abs(d) > HALF) v.y -= 0.55;                              // the bank ends under the ground beside it
      pos[k * 3] = v.x - c.x; pos[k * 3 + 1] = v.y - c.y; pos[k * 3 + 2] = v.z - c.z; rw[k * 2] = s; rw[k * 2 + 1] = d;
      if (i < rows && j < across.length - 1) { const a = k, b = k + 1, e = k + across.length, f = e + 1; idx.push(a, b, e, b, f, e); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aRw', new THREE.BufferAttribute(rw, 2));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    if (g.attributes.normal.getY(0) < 0) { g.index.array.reverse(); g.computeVertexNormals(); }        // wound so the top faces the sky
    const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }), 'runway', RUNWAY,
      { uRwLen: { value: this.length }, tRwA: { value: designation('34', 'R') }, tRwB: { value: designation('16', 'L') } });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.position.copy(c); this.mesh.receiveShadow = true; this.mesh.name = 'runway';
    this.mesh.updateMatrixWorld(); this.mesh.matrixAutoUpdate = false;
  }

  // latitude, longitude -> metres along from the 34R end, metres across (+ right of the take-off direction)
  local(lat, lon) {
    const e = (lon - A[1]) * M_LON, n = (lat - A[0]) * M_LAT;
    return [e * this.ue + n * this.un, e * this.un - n * this.ue];
  }
  geo(s, d) { const e = s * this.ue + d * this.un, n = s * this.un - d * this.ue; return [A[0] + n / M_LAT, A[1] + e / M_LON]; }
  // height of the surface above sea level
  elev(s, d) {
    const x = clamp(s / STEP, 0, PROFILE.length - 1), i = Math.min(Math.floor(x), PROFILE.length - 2), f = x - i;
    return PROFILE[i] * (1 - f) + PROFILE[i + 1] * f - 0.0105 * Math.min(Math.abs(d), HALF);
  }
  point(s, d, out = new THREE.Vector3()) { const [lat, lon] = this.geo(s, d); return geoToWorld(lat, lon, this.elev(s, d), out); }

  // the surface height at a place on the runway or its shoulders, else null
  at(lat, lon) {
    const [s, d] = this.local(lat, lon);
    return s >= -PAD && s <= this.length + PAD && Math.abs(d) <= HALF ? this.elev(s, d) : null;
  }
  // for the ground model: the survey height h, pressed down to 30 cm under the runway and eased back over 40 m around it
  flatten(lat, lon, h) {
    const [s, d] = this.local(lat, lon);
    const out = Math.max(-s - PAD, s - this.length - PAD, Math.abs(d) - HALF) - 8;           // metres outside the surface, with 8 m to spare
    if (out > 40) return h;
    const under = this.elev(clamp(s, -PAD, this.length + PAD), d) - 0.3;
    if (out <= 0) return under;
    const k = out / 40, w = k * k * (3 - 2 * k);
    return under * (1 - w) + h * w;
  }
  // lined up for take-off: on the threshold stripes of 34R
  start(s = 30) { const [lat, lon] = this.geo(s, 0); return { lat, lon, heading: this.heading, s }; }
}
