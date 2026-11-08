// World definition: seabed height + material masks, evaluated once on the GPU and
// baked into textures (heights: R32F, masks: RGBA8). CPU code samples the same data.
//
// Transect along +X (offshore):
//   x < 85      sand lagoon with patch-reef "bommies" and seagrass
//   85 .. 165   reef flat / crest (~1-2 m deep)
//   165 .. 340  fore-reef slope with spur-and-groove, 4 m -> 25 m
//   ~342        drop-off wall, 25 m -> 130 m
//   > 385       continental slope, then abyssal plain (~ -2900 m at x = 7000)
import { GLSL_NOISE } from './glsl.js';

export const WORLD = { x0: -1024, z0: -2048, sx: 8192, sz: 4096, nx: 4096, nz: 2048 };

export const WORLDGEN_GLSL = /* glsl */`
${GLSL_NOISE}

float sigm(float x, float x0, float w) { return 0.5 + 0.5 * tanh((x - x0) / w); }

float wallWarp(float z) {
  return 30.0 * (fbm2(vec2(z * 0.0055, 3.1), 4) - 0.5) + 7.0 * (fbm2(vec2(z * 0.031, 9.7), 3) - 0.5);
}

float baseProfile(float x, float z) {
  float xw = x + wallWarp(z);
  float y = -3.4;
  y += 2.3 * sigm(xw, 85.0, 24.0);       // rise onto the reef flat
  y -= 3.2 * sigm(xw, 160.0, 12.0);      // crest -> fore-reef
  y -= 19.0 * sigm(xw, 255.0, 60.0);     // fore-reef slope
  y -= 108.0 * sigm(xw, 342.0, 7.5);     // the wall
  float a = (xw - 385.0) / 34.0;
  float t = (a > 20.0) ? a * 34.0 : 34.0 * log(1.0 + exp(a));
  y -= 3300.0 * tanh(t / 4800.0);        // continental slope to the abyss
  return y;
}

float spurGroove(float x, float z, out float ridge) {
  float win = smoothstep(150.0, 195.0, x) * (1.0 - smoothstep(285.0, 335.0, x));
  float ph = z / 46.0 + 0.9 * fbm2(vec2(x * 0.012, z * 0.004), 3);
  float s = 0.5 + 0.5 * sin(6.2831853 * ph);
  ridge = win * s;
  return win * 5.5 * (pow(s, 1.6) - 0.35);
}

// patch reefs: isolated coral mounds on the lagoon floor
float bommies(vec2 p, out float cover) {
  vec2 c = p / 64.0, ic = floor(c);
  float h = 0.0; cover = 0.0;
  for (int j = -1; j <= LOOPN(1); j++) for (int i = -1; i <= 1; i++) {
    vec2 cell = ic + vec2(float(i), float(j));
    vec3 r = h23(cell);
    float present = step(0.40, h21(cell + 91.3));
    vec2 ctr = (cell + 0.15 + 0.7 * r.xy) * 64.0;
    float rad = mix(5.0, 16.0, r.z);
    float hgt = mix(1.3, 4.2, h21(cell + 12.7));
    vec2 q = p - ctr;
    q += 3.0 * (vec2(vn2(p * 0.11), vn2(p * 0.11 + 5.5)) - 0.5) * rad * 0.25;
    float d = length(q) / rad;
    float m = present * exp(-d * d * 1.7);
    h = max(h, hgt * m);
    cover = max(cover, present * exp(-d * d * 0.9));
  }
  return h;
}

float worldHeight(vec2 p, out float ridge, out float bcover) {
  float x = p.x, z = p.y;
  float y = baseProfile(x, z);
  y += spurGroove(x, z, ridge);
  float lag = 1.0 - smoothstep(55.0, 110.0, x);
  y += bommies(p, bcover) * lag;
  bcover *= lag;
  float rw = smoothstep(80.0, 130.0, x) * (1.0 - smoothstep(330.0, 430.0, x));
  y += (fbm2(p / 26.0, 5) - 0.5) * (2.6 + 4.5 * rw);
  float wm = exp(-pow((x + wallWarp(z) - 342.0) / 42.0, 2.0));
  y += (fbm2(vec2(x / 15.0, z / 9.5), 4) - 0.5) * 20.0 * wm;
  float dm = smoothstep(380.0, 900.0, x) * (1.0 - smoothstep(3500.0, 5200.0, x));
  y += (fbm2(vec2(x / 330.0, z / 140.0), 5) - 0.5) * 80.0 * dm;
  y += (fbm2(p / 700.0, 4) - 0.5) * 45.0 * smoothstep(3800.0, 5200.0, x);
  // hydrothermal vent mound
  float vd = length(p - vec2(6180.0, 240.0));
  float mound = exp(-pow(vd / 62.0, 2.0));
  y += mound * (16.0 + 5.0 * (fbm2(p / 7.0, 4) - 0.5));
  // soft cap just below the surface so mounds never breach it
  float aa = (-0.7 - y) / 0.35;
  float sp = (aa > 20.0) ? aa : log(1.0 + exp(aa));
  return -0.7 - 0.35 * sp;
}
float worldHeight(vec2 p) { float r, b; return worldHeight(p, r, b); }

// masks: x sand, y reef community (corals/sponges), z hard rock, w seagrass
vec4 worldMasks(vec2 p) {
  // the centre and four neighbours come from ONE call site in a real loop: Direct3D's compiler inlines every call, and five
  // inlined copies of worldHeight took ~8 s to compile on a first visit (same values as five separate calls)
  float ridge = 0.0, bcov = 0.0, h = 0.0, hx = 0.0, hz = 0.0;
  float e = 3.0;
  for (int k = 0; k < LOOPN(5); k++) {
    vec2 o = k == 1 ? vec2(e, 0.0) : k == 2 ? vec2(-e, 0.0) : k == 3 ? vec2(0.0, e) : k == 4 ? vec2(0.0, -e) : vec2(0.0);
    float rk, bk;
    float hk = worldHeight(p + o, rk, bk);
    if (k == 0) { h = hk; ridge = rk; bcov = bk; }
    else if (k == 1) hx += hk; else if (k == 2) hx -= hk; else if (k == 3) hz += hk; else hz -= hk;
  }
  float slope = length(vec2(hx, hz)) / (2.0 * e);           // tan(angle)
  float x = p.x;
  float depth = -h;

  float nA = fbm2(p / 34.0 + 3.0, 4);
  float nB = fbm2(p / 9.0 + 11.0, 3);
  float nC = fbm2(p / 120.0 + 27.0, 3);

  // sediment cover
  float sand = 1.0 - smoothstep(0.20, 0.55, slope);                // steep = bare rock
  sand *= 1.0 - 0.85 * bcov;                                        // bommies are hard
  float reefZone = smoothstep(80.0, 140.0, x) * (1.0 - smoothstep(320.0, 345.0, x));
  float flatZone0 = smoothstep(88.0, 118.0, x) * (1.0 - smoothstep(165.0, 195.0, x));
  sand *= 1.0 - reefZone * (0.35 + 0.55 * smoothstep(0.30, 0.75, ridge));   // spurs bare, grooves sandy
  sand *= 1.0 - flatZone0 * 0.45;
  sand = clamp(sand + (nA - 0.5) * 0.5 * (1.0 - smoothstep(0.7, 1.0, sand)), 0.0, 1.0);
  float deepMud = smoothstep(380.0, 700.0, x);
  sand = mix(sand, clamp(0.9 - 1.2 * (slope - 0.35), 0.0, 1.0), deepMud * 0.85);
  sand = clamp(sand, 0.0, 1.0);
  float ventM = smoothstep(120.0, 45.0, length(p - vec2(6180.0, 240.0)));
  sand *= 1.0 - ventM;

  float rock = clamp(1.0 - sand, 0.0, 1.0);

  // coral / sponge community
  float reef = 0.0;
  reef += bcov * 0.95;                                              // patch reefs
  reef += reefZone * (0.35 + 0.65 * smoothstep(0.2, 0.7, ridge)) * smoothstep(0.30, 0.55, nA + 0.25);
  float flatZone = smoothstep(88.0, 118.0, x) * (1.0 - smoothstep(165.0, 195.0, x));                 // reef flat + crest: coral heads, turf and rubble
  reef += flatZone * 0.80 * smoothstep(0.28, 0.50, fbm2(p / 13.0 + 57.0, 3) + 0.10 * nB);
  float wallZone = exp(-pow((x + wallWarp(p.y) - 342.0) / 60.0, 2.0));
  reef += wallZone * 0.75 * smoothstep(0.25, 0.45, nB);
  reef += smoothstep(380.0, 450.0, x) * (1.0 - smoothstep(900.0, 1600.0, x)) * 0.25 * smoothstep(0.55, 0.7, nA) * rock;
  reef = clamp(reef * smoothstep(0.0, 1.5, depth) * (1.0 - smoothstep(180.0, 900.0, depth)), 0.0, 1.0);

  // seagrass: sandy lagoon floor, patchy
  float grass = smoothstep(0.52, 0.66, fbm2(p / 46.0 + 71.0, 4));
  grass *= smoothstep(0.55, 0.9, sand) * (1.0 - smoothstep(60.0, 95.0, x)) * smoothstep(1.2, 2.2, depth) * (1.0 - smoothstep(9.0, 14.0, depth));
  grass *= 1.0 - bcov;

  return vec4(sand, reef, rock, grass);
}
`;
