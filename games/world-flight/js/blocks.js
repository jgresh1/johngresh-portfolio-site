// blocks.js — how a plain block of a building is drawn: a roof in the colour of the photograph under it, walls with
// floors, window bays and glass that are made up (nobody surveyed them), lit windows after dark.
// The recipe is Tokyo Flight's (city.js there), with one change: the window grid is laid out in the building tile's
// own metres (vLp) and not the scene's, so it does not shift when the page moves its origin.
const FACADE_PARS = /* glsl */`
  varying vec3 vBld; varying vec2 vLp;
  uniform sampler2D tGroundA, tGroundB; uniform vec4 uGroundA, uGroundB;
  float bBox( float x, float a, float b, float w ) { return smoothstep( a - w, a + w, x ) - smoothstep( b - w, b + w, x ); }
  // the aerial photo under a point (sharp copy near the view, wide copy beyond)
  vec3 bPhoto( vec2 xz ) {
    vec2 ua = vec2( xz.x - uGroundA.x, uGroundA.y - xz.y ) * uGroundA.z + 0.5;
    vec2 ub = vec2( xz.x - uGroundB.x, uGroundB.y - xz.y ) * uGroundB.z + 0.5;
    vec2 ea = abs( ua - 0.5 ), eb = abs( ub - 0.5 );
    float ia = uGroundA.w * ( 1.0 - smoothstep( 0.44, 0.49, max( ea.x, ea.y ) ) );
    float ib = uGroundB.w * ( 1.0 - smoothstep( 0.44, 0.49, max( eb.x, eb.y ) ) );
    vec3 c = mix( vec3( 0.33, 0.34, 0.34 ), texture2D( tGroundB, ub ).rgb, ib );
    return mix( c, texture2D( tGroundA, ua ).rgb, ia );
  }`;

// shared by both kinds: facade coordinates and the window grid
const FACADE_GRID = /* glsl */`
  float bWall = 1.0 - smoothstep( 0.30, 0.62, abs( vWn.y ) );
  float bSeed = vBld.z, bH = max( vBld.y, 2.5 ), bY = vBld.x;
  float bDist = length( vWp - cameraPosition );
  vec2 bT = normalize( vec2( - vWn.z, vWn.x ) + vec2( 1e-5, 0.0 ) );
  vec2 bFc = vec2( dot( vLp, bT ), bY );
  float bFl = bH > 45.0 ? 3.9 : ( bH < 11.0 ? 2.7 : 3.2 );
  float bBay = mix( 1.4, 3.2, fract( bSeed * 7.13 ) );
  vec2 bQ = bFc / vec2( bBay, bFl );
  vec2 bF = fract( bQ ), bCell = floor( bQ ), bW = fwidth( bQ ) * 0.75;
  float bLod = smoothstep( 0.35, 0.9, max( bW.x, bW.y ) );
  float bR = apHash( bCell + bSeed * 91.7 );
  // after dark: a few buildings stay busy, most keep a handful of lights on, some are dark
  float bBusy = fract( bSeed * 2.3 );
  float bLitFrac = bBusy > 0.85 ? 0.55 : ( bBusy > 0.25 ? mix( 0.06, 0.28, fract( bSeed * 9.1 ) ) : 0.015 );
  float bOn = mix( step( 1.0 - bLitFrac, fract( bR * 7.7 + bSeed ) ), bLitFrac, bLod ) * ( 0.45 + 0.9 * fract( bR * 3.1 ) );
  // one lamp colour per building (warm homes, cool offices), with a little spread window to window
  vec3 bLamp = mix( vec3( 1.0, 0.66, 0.36 ), vec3( 0.78, 0.88, 1.0 ), smoothstep( 0.35, 0.65, fract( bSeed * 13.7 ) + ( fract( bR * 13.3 ) - 0.5 ) * 0.3 * ( 1.0 - bLod ) ) );`;

const plain = (windows) => ({
  vertPars: 'attribute vec3 aBld; varying vec3 vBld; varying vec2 vLp;', vert: 'vBld = aBld * vec3( 0.05, 0.05, 1.0 / 65535.0 ); vLp = position.xz;',
  fragPars: FACADE_PARS,
  color: /* glsl */`
    ${FACADE_GRID}
    vec3 bRoofPhoto = bPhoto( vWp.xz );
    vec3 bIn = bPhoto( vWp.xz - normalize( vWn.xz + vec2( 1e-5, 0.0 ) ) * 2.5 );
    // low roofs take the photo; tall ones lean away from their footprint in the photo, so they get a plain deck
    vec3 bRoofGen = vec3( 0.40, 0.41, 0.42 ) * ( 0.90 + 0.14 * apNoise( vLp * 0.07 ) + 0.06 * apNoise( vLp * 1.9 ) );
    vec3 bRoof = mix( bRoofPhoto, bRoofGen, smoothstep( 28.0, 60.0, bH ) );
    vec3 bPal = mix( vec3( 0.70, 0.68, 0.64 ), vec3( 0.46, 0.45, 0.44 ), fract( bSeed * 5.3 ) );
    bPal = mix( bPal, vec3( 0.52, 0.40, 0.32 ), step( 0.80, fract( bSeed * 11.9 ) ) * 0.75 );
    bPal = mix( bPal, vec3( 0.80, 0.79, 0.76 ), step( 0.70, fract( bSeed * 17.7 ) ) * 0.8 );
    float bInL = dot( bIn, vec3( 0.333 ) );
    vec3 bWallC = mix( bPal, mix( vec3( bInL ), bIn, 0.45 ) * 0.9 + 0.1, 0.30 );
    float bGrain = apNoise( vec2( bFc.x * 1.7, bFc.y * 5.0 ) + vLp * 0.5 ) * 0.5 + apNoise( bFc * 9.0 ) * 0.5;
    bWallC *= ( 0.92 + 0.16 * bGrain ) * 0.86;
    float bWin = 0.0, bWinN = 0.0;
    vec3 bGlass = vec3( 0.03 );
    ${windows ? /* glsl */`
    // three facade types: punched windows, ribbon windows, curtain wall (more likely the taller the building)
    float bStyle = mix( fract( bSeed * 3.91 ), 0.92, smoothstep( 45.0, 110.0, bH ) * 0.75 );
    float bx0 = bStyle > 0.8 ? 0.03 : ( bStyle > 0.5 ? -1.0 : 0.22 );
    float by0 = bStyle > 0.8 ? 0.08 : 0.41, by1 = bStyle > 0.8 ? 0.95 : 0.77;
    bWin = bBox( bF.x, bx0, 1.0 - bx0, bW.x ) * bBox( bF.y, by0, by1, bW.y );
    float bCover = ( bx0 < 0.0 ? 1.0 : 1.0 - 2.0 * bx0 ) * ( by1 - by0 );
    bWin = mix( bWin, bCover, bLod ) * bWall * smoothstep( bH - 0.5, bH - 1.4, bY );
    bWinN = bWin;
    bGlass = mix( vec3( 0.022, 0.032, 0.042 ), vec3( 0.40, 0.40, 0.38 ), mix( step( 0.80, bR ), 0.2, bLod ) * 0.6 );      // some blinds are down
    // glass seen from outside by day is mostly the sky it reflects, not a black hole
    vec3 bRv = reflect( normalize( vWp - cameraPosition ), normalize( vWn ) );
    bGlass = mix( bGlass, apSky( normalize( vec3( bRv.x, abs( bRv.y ) * 0.6 + 0.10, bRv.z ) ) ) * 0.40, 0.70 * ( 1.0 - uNight ) );
    // a thin shadow line under each floor slab
    bWallC *= 1.0 - 0.16 * bBox( bF.y, by1, by1 + 0.07, bW.y ) * ( 1.0 - bLod );` : /* glsl */`
    bWallC = vec3( 0.47, 0.47, 0.46 ) * ( 0.86 + 0.28 * bGrain );
    bRoof = mix( bRoofGen * 1.1, bWallC, 0.5 );`}
    diffuseColor.rgb = mix( bRoof, mix( bWallC, bGlass, bWin ), bWall );`,
  rough: /* glsl */`
    roughnessFactor = mix( 0.90, 0.10, bWin );`,
  emissive: /* glsl */`
    totalEmissiveRadiance += bLamp * bWinN * bOn * uNight * 1.5;`,
});
export const PLAIN = { bldg: plain(true), brid: plain(false) };
