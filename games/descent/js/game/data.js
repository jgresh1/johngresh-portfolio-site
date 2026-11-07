// Descent: Evolve - all game data and tuning numbers. Balance lives here (and only here).
// Lengths are metres. "tier" = the player form (1..10) for which a creature is ideal food.

// ---------------------------------------------------------------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------------------------------------------------------------
export const MAX_LEVEL = 10;
export const FORM_LEN = [0.14, 0.21, 0.30, 0.42, 0.58, 0.80, 1.12, 1.58, 2.20, 3.20];
export const TIER_XP = (t) => 2 * Math.pow(1.35, t - 1);                       // XP of one ideal meal for form t
// growth needed per level. Fitted to bot play so a careful bot needs about 30 minutes in all (people take longer): tune here.
export const XP_NEED = [50, 70, 120, 200, 400, 650, 830, 1010, 1100, 1300];
export const XP_DROP = [1.0, 0.70, 0.45, 0.28, 0.15];                           // meal value when it is 0,1,2,3,4+ tiers below the player's form
export const ATTR_BASE_ELIGIBLE_FIRST = ['speed', 'appetite', 'vital', 'stealth', 'senses', 'turn'];

export const DIFFICULTY = {
  relaxed: { name: 'Relaxed', dmg: 0.65, notice: 0.80, xp: 1.15, regen: 1.4, deathLoss: 0.20, chase: 0.85, commit: 0.45 },
  normal:  { name: 'Normal',  dmg: 1.00, notice: 1.00, xp: 1.00, regen: 1.0, deathLoss: 0.35, chase: 1.00, commit: 0.62 },
  hard:    { name: 'Hard',    dmg: 1.35, notice: 1.20, xp: 0.90, regen: 0.8, deathLoss: 0.50, chase: 1.12, commit: 0.85 },
};

export const LEVEL_GOALS = [
  'Eat <b>plankton</b> and tiny shrimp. Hide in the seagrass when a big fish shows up.',
  '<b>Silversides</b> and <b>chromis</b> are good food now. Beware lizardfish on the sand.',
  'Head east to the <b>reef flat</b>. Big fish cannot follow you into the shallows.',
  'Hunt <b>crabs, damselfish</b> and <b>butterflyfish</b>. Keep clear of morays and lionfish.',
  'The <b>fore-reef</b> has bigger prey. Groupers lurk in the rocks.',
  'Take on <b>tangs, goatfish</b> and <b>fusiliers</b>. Sharks patrol the reef edge.',
  'The <b>wall</b> teems with snapper and mackerel. Stay close to the edge.',
  'Hunt <b>trevally</b> and <b>mahi</b> in the open blue. Watch for tuna packs.',
  'Tuna, big sharks and giants cruise the blue. You are nearly the biggest.',
  'Fill the bar. <b>Become the apex</b> of the reef.',
];

// where the world is (matches worldgen.js): lagoon x<90, reef flat 90-172, fore-reef 172-335 (floor < 28 m), wall (floor 28-125 m), open blue beyond
export const ZONES = {
  lagoon: { name: 'Seagrass Lagoon', short: 'Lagoon',    blurb: 'Warm, shallow and full of hiding places.', goal: [16, -14] },
  flat:   { name: 'Reef Flat',       short: 'Reef flat', blurb: 'Coral heads in knee-deep water. Big fish cannot follow you here.', goal: [128, 0] },
  fore:   { name: 'Fore-reef',       short: 'Fore-reef', blurb: 'Ridges and sandy channels. Groupers and sharks patrol.', goal: [262, 0] },
  wall:   { name: 'The Wall',        short: 'The wall',  blurb: 'The reef drops away into the blue. Hunters cruise the edge.', goal: [352, 0] },
  blue:   { name: 'Open Blue',       short: 'Open blue', blurb: 'Nothing to hide behind. Only the strong live here.', goal: [470, 0] },
};
export const LEVEL_ZONE = ['lagoon', 'lagoon', 'flat', 'flat', 'fore', 'fore', 'wall', 'wall', 'blue', 'blue'];

export function zoneAt(x, floorDepth) {
  if (x < 90) return 'lagoon';
  if (x < 172) return 'flat';
  if (floorDepth < 28) return 'fore';
  if (floorDepth < 125) return 'wall';
  return 'blue';
}

// play area (soft walls)
export const BOUNDS = { x0: -250, x1: 760, z0: -300, z1: 300, maxDepth: 110 };

// ---------------------------------------------------------------------------------------------------------------------------------
// Looks. Fish use fishGeometry (js/fauna/fishgen.js) + the fish skin shader. pattern ids: 0 countershaded, 1 bars, 2 anthias, 3 tang,
// 4 butterflyfish, 5 stripe, 6 parrot, 7 lantern, 8 clown, 9 bluehead wrasse, 10 triggerfish, 11 mottled / spotted, 12 lionfish bars.
// ---------------------------------------------------------------------------------------------------------------------------------
export const VIS = {
  // ---- the ten player forms (also used by wild fish of the same kind)
  fry: {
    fam: 'fish', geo: { depth: 0.23, width: 0.55, body: 'slender', snout: 0.15, tail: { span: 0.27, length: 0.22, fork: 0.6, taper: 0.35 }, dorsal: { a: 0.50, b: 0.66, h: 0.08 }, anal: { a: 0.60, b: 0.82, h: 0.07 }, pect: { size: 0.16, y: -0.05 }, pelv: { size: 0.06, a: 0.34 }, eye: 0.038, eyeT: 0.135 },
    pattern: 13, colA: [0.30, 0.52, 0.58], colB: [0.60, 0.80, 0.82], colC: [0.86, 0.94, 0.94], colD: [0.60, 0.90, 1.0], finCol: [0.62, 0.80, 0.84], finSolid: 0.0, irid: 0.8, sheen: 0.8, bend: 0.14, freq: 7,
  },
  damsel: {
    fam: 'fish', geo: { depth: 0.44, width: 0.38, body: 'deep', tail: { span: 0.27, length: 0.21, fork: 0.6, taper: 0.3 }, dorsal: { a: 0.26, b: 0.76, h: 0.14 }, anal: { a: 0.60, b: 0.84, h: 0.10 }, pect: { size: 0.17, y: -0.08 }, eye: 0.038 },
    pattern: 0, colA: [0.02, 0.10, 0.50], colB: [0.04, 0.32, 0.82], colC: [0.10, 0.45, 0.85], colD: [0.9, 0.7, 0.05], finCol: [0.05, 0.28, 0.75], finSolid: 0.5, irid: 1.0, sheen: 0.55, bend: 0.12, freq: 6,
  },
  butterfly: {
    fam: 'fish', geo: { depth: 0.66, width: 0.26, body: 'deep', superN: 2.2, tail: { span: 0.2, length: 0.15, fork: 0.0, taper: 0.5 }, dorsal: { a: 0.22, b: 0.78, h: 0.17 }, anal: { a: 0.52, b: 0.80, h: 0.15 }, pect: { size: 0.17, y: -0.05 }, eye: 0.03, snout: 0.5 },
    pattern: 4, colA: [0.72, 0.56, 0.03], colB: [0.88, 0.82, 0.66], colC: [0.72, 0.58, 0.04], colD: [0.01, 0.01, 0.02], finCol: [0.66, 0.50, 0.04], finSolid: 0.9, sheen: 0.15, bend: 0.06, freq: 3.4,
  },
  wrasse: {
    fam: 'fish', geo: { depth: 0.25, width: 0.42, body: 'fusiform', snout: 0.15, tail: { span: 0.2, length: 0.19, fork: 0.05, taper: 0.45 }, dorsal: { a: 0.24, b: 0.88, h: 0.09 }, anal: { a: 0.54, b: 0.88, h: 0.07 }, pect: { size: 0.17, y: -0.1 }, pelv: { size: 0.07, a: 0.3 }, eye: 0.026 },
    pattern: 9, colA: [0.06, 0.34, 0.10], colB: [0.02, 0.18, 0.90], colC: [0.55, 0.62, 0.30], colD: [0.01, 0.02, 0.04], finCol: [0.08, 0.34, 0.55], finSolid: 0.6, irid: 0.3, sheen: 0.35, bend: 0.10, freq: 3.2,
  },
  trigger: {
    fam: 'fish', geo: { depth: 0.54, width: 0.28, body: 'deep', superN: 2.2, snout: 0.3, tail: { span: 0.22, length: 0.17, fork: 0.3, taper: 0.4, lobe: 1.0 }, dorsal: { a: 0.22, b: 0.30, h: 0.12 }, dorsal2: { a: 0.40, b: 0.84, h: 0.17, skew: 0.6 }, anal: { a: 0.44, b: 0.84, h: 0.16 }, pect: { size: 0.10, y: -0.08 }, pelv: { size: 0.06, a: 0.30 }, eye: 0.026, eyeT: 0.13 },
    pattern: 10, colA: [0.05, 0.26, 0.30], colB: [0.13, 0.40, 0.26], colC: [0.80, 0.62, 0.08], colD: [0.03, 0.22, 0.95], finCol: [0.05, 0.34, 0.70], finSolid: 0.8, irid: 0.2, sheen: 0.3, bend: 0.07, freq: 2.6,
  },
  parrot: {
    fam: 'fish', geo: { depth: 0.34, width: 0.46, body: 'parrot', tail: { span: 0.22, length: 0.18, fork: 0.2, taper: 0.4 }, dorsal: { a: 0.26, b: 0.82, h: 0.09 }, anal: { a: 0.56, b: 0.84, h: 0.08 }, pect: { size: 0.19, y: -0.1 }, eye: 0.020, snout: 0.1, hump: 0.1 },
    pattern: 6, colA: [0.03, 0.34, 0.30], colB: [0.60, 0.20, 0.42], colC: [0.08, 0.40, 0.42], colD: [0.5, 0.2, 0.3], finCol: [0.10, 0.40, 0.42], finSolid: 0.65, sheen: 0.28, bend: 0.07, freq: 2.4,
  },
  jack: {
    fam: 'fish', geo: { depth: 0.34, width: 0.36, body: 'jack', snout: 0.30, hump: 0.10, tail: { span: 0.25, length: 0.21, fork: 0.60, taper: 0.46, lobe: 0.95 }, dorsal: { a: 0.27, b: 0.43, h: 0.065, sweep: 0.03 }, dorsal2: { a: 0.47, b: 0.85, h: 0.085, skew: 0.30 }, anal: { a: 0.52, b: 0.85, h: 0.06 }, pect: { size: 0.24, y: -0.12, shape: 'sickle', aspect: 0.30, t: 0.25 }, eye: 0.014, eyeT: 0.085 },
    pattern: 0, colA: [0.030, 0.075, 0.095], colB: [0.62, 0.68, 0.70], colC: [0.80, 0.80, 0.76], colD: [0.75, 0.62, 0.15], finCol: [0.24, 0.24, 0.17], finSolid: 0, irid: 0.8, sheen: 0.9, pat2: [1, 0.85, 0, 0.30], bend: 0.10, freq: 2.2,
  },
  barracuda: {
    fam: 'fish', geo: { depth: 0.13, width: 0.6, body: 'torpedo', stations: 36, tail: { span: 0.14, length: 0.13, fork: 0.55, taper: 0.4 }, dorsal: { a: 0.62, b: 0.72, h: 0.05 }, dorsal2: { a: 0.80, b: 0.88, h: 0.05 }, anal: { a: 0.78, b: 0.86, h: 0.05 }, pect: { size: 0.09, y: -0.15 }, pelv: { size: 0.05, a: 0.55 }, eye: 0.014, snout: 0.35 },
    pattern: 0, colA: [0.05, 0.075, 0.07], colB: [0.52, 0.55, 0.54], colC: [0.72, 0.72, 0.66], colD: [0.08, 0.08, 0.07], finCol: [0.25, 0.26, 0.22], finSolid: 0.2, sheen: 0.7, bend: 0.06, freq: 1.6,
  },
  tuna: {
    fam: 'fish', geo: { depth: 0.27, width: 0.75, body: 'torpedo', superN: 2.2, snout: 0.12, tail: { span: 0.30, length: 0.22, fork: 0.82, taper: 0.22 }, dorsal: { a: 0.30, b: 0.42, h: 0.09 }, dorsal2: { a: 0.50, b: 0.62, h: 0.15, skew: 0.5 }, anal: { a: 0.62, b: 0.74, h: 0.14, }, pect: { size: 0.20, y: -0.14, shape: 'sickle', aspect: 0.22, t: 0.24 }, pelv: { size: 0.06, a: 0.30 }, eye: 0.018 },
    pattern: 5, colA: [0.012, 0.040, 0.10], colB: [0.34, 0.42, 0.48], colC: [0.78, 0.80, 0.78], colD: [0.85, 0.66, 0.05], finCol: [0.55, 0.46, 0.08], finSolid: 0.3, irid: 0.7, sheen: 0.8, pat2: [1, 0.9, 0, 0.12], bend: 0.07, freq: 1.8,
  },
  // ---- wild-only fish
  silverfry: {
    fam: 'fish', geo: { depth: 0.16, width: 0.5, body: 'slender', snout: 0.1, tail: { span: 0.22, length: 0.22, fork: 0.7, taper: 0.3 }, dorsal: { a: 0.48, b: 0.58, h: 0.05 }, anal: { a: 0.6, b: 0.78, h: 0.04 }, pect: { size: 0.1, y: -0.05 }, pelv: null, eye: 0.06 },
    pattern: 0, colA: [0.10, 0.17, 0.16], colB: [0.60, 0.68, 0.66], colC: [0.86, 0.88, 0.84], colD: [0.5, 0.5, 0.2], finCol: [0.5, 0.55, 0.5], finSolid: 0.0, irid: 0.8, sheen: 0.7, bend: 0.14, freq: 9,
  },
  silverside: {
    fam: 'fish', geo: { depth: 0.20, width: 0.30, body: 'fusiform', snout: 0.08, tail: { span: 0.24, length: 0.22, fork: 0.75, taper: 0.3 }, dorsal: { a: 0.42, b: 0.52, h: 0.06 }, anal: { a: 0.60, b: 0.78, h: 0.05 }, pect: { size: 0.11, y: -0.06 }, eye: 0.040 },
    pattern: 0, colA: [0.10, 0.15, 0.12], colB: [0.70, 0.76, 0.74], colC: [0.88, 0.88, 0.84], colD: [0.60, 0.50, 0.15], finCol: [0.50, 0.50, 0.40], finSolid: 0.25, irid: 0.8, sheen: 0.7, bend: 0.12, freq: 7,
  },
  chromis: {
    fam: 'fish', geo: { depth: 0.36, width: 0.38, body: 'deep', tail: { span: 0.28, length: 0.24, fork: 0.85, taper: 0.3 }, dorsal: { a: 0.30, b: 0.70, h: 0.13 }, anal: { a: 0.62, b: 0.84, h: 0.09 }, pect: { size: 0.14, y: -0.08 }, eye: 0.034 },
    pattern: 0, colA: [0.03, 0.20, 0.36], colB: [0.15, 0.52, 0.64], colC: [0.50, 0.70, 0.72], colD: [0.04, 0.14, 0.22], finCol: [0.10, 0.40, 0.48], finSolid: 0.45, irid: 1, sheen: 0.6, bend: 0.12, freq: 6.5,
  },
  sergeant: {
    fam: 'fish', geo: { depth: 0.46, width: 0.34, body: 'deep', tail: { span: 0.27, length: 0.20, fork: 0.5, taper: 0.35 }, dorsal: { a: 0.26, b: 0.78, h: 0.16 }, anal: { a: 0.58, b: 0.84, h: 0.11 }, pect: { size: 0.17, y: -0.1 }, eye: 0.030 },
    pattern: 1, colA: [0.72, 0.68, 0.16], colB: [0.60, 0.62, 0.50], colC: [0.70, 0.66, 0.2], colD: [0.02, 0.02, 0.03], finCol: [0.55, 0.55, 0.22], finSolid: 0.7, sheen: 0.22, bend: 0.11, freq: 4.5,
  },
  anthias: {
    fam: 'fish', geo: { depth: 0.30, width: 0.40, body: 'deep', tail: { span: 0.25, length: 0.24, fork: 0.85, taper: 0.3 }, dorsal: { a: 0.28, b: 0.72, h: 0.14, skew: 0.5 }, anal: { a: 0.64, b: 0.85, h: 0.08 }, pect: { size: 0.16, y: -0.08 }, eye: 0.030 },
    pattern: 2, colA: [0.62, 0.16, 0.24], colB: [0.85, 0.42, 0.22], colC: [0.70, 0.18, 0.34], colD: [0.9, 0.7, 0.2], finCol: [0.72, 0.18, 0.36], finSolid: 0.55, sheen: 0.30, bend: 0.12, freq: 5.5,
  },
  fusilier: {
    fam: 'fish', geo: { depth: 0.22, width: 0.42, body: 'fusiform', tail: { span: 0.28, length: 0.24, fork: 0.85, taper: 0.3 }, dorsal: { a: 0.36, b: 0.72, h: 0.07 }, anal: { a: 0.64, b: 0.84, h: 0.06 }, pect: { size: 0.16, y: -0.1 }, eye: 0.026 },
    pattern: 5, colA: [0.06, 0.24, 0.60], colB: [0.60, 0.66, 0.70], colC: [0.80, 0.80, 0.78], colD: [0.75, 0.62, 0.06], finCol: [0.55, 0.50, 0.15], finSolid: 0.1, irid: 1, sheen: 0.6, bend: 0.11, freq: 3.4,
  },
  tang: {
    fam: 'fish', geo: { depth: 0.52, width: 0.30, body: 'deep', tail: { span: 0.20, length: 0.20, fork: 0.35, taper: 0.4 }, dorsal: { a: 0.20, b: 0.80, h: 0.16 }, anal: { a: 0.50, b: 0.82, h: 0.14 }, pect: { size: 0.20, y: -0.1 }, eye: 0.026, snout: 0.25 },
    pattern: 3, colA: [0.02, 0.12, 0.62], colB: [0.05, 0.24, 0.76], colC: [0.62, 0.50, 0.04], colD: [0.012, 0.014, 0.04], finCol: [0.04, 0.16, 0.60], finSolid: 0.85, irid: 0.5, sheen: 0.45, bend: 0.08, freq: 2.8,
  },
  goatfish: {
    fam: 'fish', geo: { depth: 0.22, width: 0.40, body: 'fusiform', snout: 0.25, tail: { span: 0.24, length: 0.22, fork: 0.7, taper: 0.35 }, dorsal: { a: 0.26, b: 0.36, h: 0.09 }, dorsal2: { a: 0.50, b: 0.66, h: 0.08 }, anal: { a: 0.62, b: 0.78, h: 0.06 }, pect: { size: 0.14, y: -0.1 }, eye: 0.026 },
    pattern: 5, colA: [0.62, 0.42, 0.10], colB: [0.86, 0.80, 0.55], colC: [0.92, 0.88, 0.72], colD: [0.90, 0.72, 0.04], finCol: [0.80, 0.62, 0.10], finSolid: 0.5, sheen: 0.35, bend: 0.09, freq: 3,
  },
  snapper: {
    fam: 'fish', geo: { depth: 0.31, width: 0.40, body: 'fusiform', snout: 0.1, tail: { span: 0.22, length: 0.19, fork: 0.5, taper: 0.4 }, dorsal: { a: 0.30, b: 0.72, h: 0.10 }, anal: { a: 0.62, b: 0.84, h: 0.08 }, pect: { size: 0.17, y: -0.1 }, eye: 0.022 },
    pattern: 5, colA: [0.50, 0.46, 0.22], colB: [0.72, 0.70, 0.48], colC: [0.78, 0.72, 0.60], colD: [0.72, 0.58, 0.06], finCol: [0.60, 0.50, 0.12], finSolid: 0.15, sheen: 0.4, bend: 0.09, freq: 2.4,
  },
  sardine: {
    fam: 'fish', geo: { depth: 0.19, width: 0.34, body: 'fusiform', snout: 0.1, tail: { span: 0.26, length: 0.22, fork: 0.8, taper: 0.3 }, dorsal: { a: 0.40, b: 0.52, h: 0.06 }, anal: { a: 0.64, b: 0.80, h: 0.04 }, pect: { size: 0.10, y: -0.08 }, pelv: null, eye: 0.034 },
    pattern: 0, colA: [0.03, 0.10, 0.20], colB: [0.64, 0.70, 0.72], colC: [0.88, 0.90, 0.88], colD: [0.5, 0.55, 0.6], finCol: [0.40, 0.46, 0.50], finSolid: 0.1, irid: 1.0, sheen: 0.9, pat2: [0, 0.8, 0, 0.12], bend: 0.12, freq: 6.5,
  },
  mackerel: {
    fam: 'fish', geo: { depth: 0.20, width: 0.45, body: 'torpedo', snout: 0.1, tail: { span: 0.26, length: 0.22, fork: 0.82, taper: 0.28 }, dorsal: { a: 0.32, b: 0.44, h: 0.07 }, dorsal2: { a: 0.54, b: 0.64, h: 0.06 }, anal: { a: 0.60, b: 0.70, h: 0.05 }, pect: { size: 0.12, y: -0.1 }, eye: 0.026 },
    pattern: 0, colA: [0.02, 0.10, 0.12], colB: [0.40, 0.52, 0.55], colC: [0.80, 0.84, 0.82], colD: [0.1, 0.2, 0.2], finCol: [0.20, 0.30, 0.32], finSolid: 0.1, irid: 0.9, sheen: 0.85, pat2: [0, 0.8, 0, 0.12], bend: 0.09, freq: 3.2,
  },
  mahi: {
    fam: 'fish', geo: { depth: 0.30, width: 0.36, body: 'fusiform', snout: 0.0, hump: 0.32, tail: { span: 0.28, length: 0.22, fork: 0.8, taper: 0.3 }, dorsal: { a: 0.14, b: 0.90, h: 0.13, skew: 0.9 }, anal: { a: 0.52, b: 0.86, h: 0.08 }, pect: { size: 0.13, y: -0.1 }, eye: 0.024, eyeT: 0.09 },
    pattern: 5, colA: [0.02, 0.28, 0.20], colB: [0.60, 0.62, 0.18], colC: [0.88, 0.84, 0.58], colD: [0.10, 0.50, 0.9], finCol: [0.20, 0.50, 0.20], finSolid: 0.5, irid: 0.5, sheen: 0.55, bend: 0.09, freq: 2.4,
  },
  skipjack: {
    fam: 'fish', geo: { depth: 0.24, width: 0.5, body: 'torpedo', snout: 0.1, tail: { span: 0.28, length: 0.22, fork: 0.84, taper: 0.26 }, dorsal: { a: 0.32, b: 0.44, h: 0.08 }, dorsal2: { a: 0.54, b: 0.64, h: 0.06 }, anal: { a: 0.60, b: 0.70, h: 0.05 }, pect: { size: 0.12, y: -0.12 }, eye: 0.022 },
    pattern: 5, colA: [0.015, 0.06, 0.16], colB: [0.40, 0.46, 0.50], colC: [0.80, 0.80, 0.78], colD: [0.03, 0.05, 0.09], finCol: [0.14, 0.2, 0.3], finSolid: 0.1, irid: 0.8, sheen: 0.8, bend: 0.08, freq: 2.8,
  },
  wahoo: {
    fam: 'fish', geo: { depth: 0.14, width: 0.6, body: 'torpedo', stations: 36, snout: 0.4, tail: { span: 0.15, length: 0.14, fork: 0.6, taper: 0.4 }, dorsal: { a: 0.30, b: 0.84, h: 0.05 }, anal: { a: 0.70, b: 0.84, h: 0.04 }, pect: { size: 0.07, y: -0.15 }, pelv: { size: 0.04, a: 0.5 }, eye: 0.014 },
    pattern: 1, colA: [0.02, 0.10, 0.22], colB: [0.55, 0.62, 0.66], colC: [0.7, 0.75, 0.75], colD: [0.015, 0.04, 0.09], finCol: [0.12, 0.2, 0.3], finSolid: 0.2, irid: 0.8, sheen: 0.7, bend: 0.06, freq: 1.6,
  },
  // ---- ambushers and hunters
  lizardfish: {
    fam: 'fish', geo: { depth: 0.13, width: 0.9, body: 'torpedo', snout: 0.4, tail: { span: 0.13, length: 0.13, fork: 0.4, taper: 0.4 }, dorsal: { a: 0.35, b: 0.46, h: 0.08 }, anal: { a: 0.68, b: 0.80, h: 0.04 }, pect: { size: 0.08, y: -0.2 }, pelv: { size: 0.06, a: 0.4 }, eye: 0.026, eyeT: 0.08 },
    pattern: 11, colA: [0.30, 0.25, 0.15], colB: [0.55, 0.50, 0.34], colC: [0.72, 0.68, 0.52], colD: [0.10, 0.08, 0.05], finCol: [0.40, 0.34, 0.22], finSolid: 0.5, sheen: 0.12, bend: 0.08, freq: 3,
  },
  scorpionfish: {
    fam: 'fish', geo: { depth: 0.38, width: 0.80, body: 'deep', superN: 2.1, hump: 0.28, snout: 0.0, tail: { span: 0.20, length: 0.17, fork: 0.0, taper: 0.5 }, dorsal: { a: 0.20, b: 0.86, h: 0.16, skew: 0.8 }, anal: { a: 0.62, b: 0.84, h: 0.08 }, pect: { size: 0.30, y: -0.14 }, pelv: { size: 0.1, a: 0.3 }, eye: 0.028, eyeT: 0.13 },
    pattern: 11, colA: [0.30, 0.10, 0.06], colB: [0.50, 0.26, 0.14], colC: [0.60, 0.40, 0.25], colD: [0.08, 0.03, 0.02], finCol: [0.42, 0.18, 0.10], finSolid: 0.6, sheen: 0.05, bend: 0.05, freq: 2,
  },
  lionfish: {
    fam: 'fish', geo: { depth: 0.40, width: 0.50, body: 'deep', snout: 0.1, tail: { span: 0.26, length: 0.22, fork: 0.0, taper: 0.5, lobe: 1.0 }, dorsal: { a: 0.20, b: 0.58, h: 0.36, skew: 0.7 }, dorsal2: { a: 0.62, b: 0.84, h: 0.14 }, anal: { a: 0.62, b: 0.84, h: 0.12 }, pect: { size: 0.46, y: -0.05 }, pelv: { size: 0.2, a: 0.3 }, eye: 0.028 },
    pattern: 12, colA: [0.50, 0.07, 0.04], colB: [0.85, 0.82, 0.74], colC: [0.78, 0.30, 0.18], colD: [0.16, 0.03, 0.02], finCol: [0.60, 0.20, 0.12], finSolid: 0.35, sheen: 0.1, bend: 0.07, freq: 2.4,
  },
  trumpetfish: {
    fam: 'fish', geo: { depth: 0.055, width: 1.0, body: 'torpedo', stations: 40, snout: 0.7, tail: { span: 0.045, length: 0.07, fork: 0.1, taper: 0.5 }, dorsal: { a: 0.70, b: 0.86, h: 0.04 }, anal: { a: 0.70, b: 0.86, h: 0.04 }, pect: { size: 0.04, y: -0.1 }, pelv: { size: 0.03, a: 0.5 }, eye: 0.020, eyeT: 0.08 },
    pattern: 5, colA: [0.38, 0.30, 0.08], colB: [0.60, 0.50, 0.16], colC: [0.72, 0.66, 0.30], colD: [0.20, 0.14, 0.03], finCol: [0.50, 0.40, 0.10], finSolid: 0.5, sheen: 0.2, bend: 0.06, freq: 2.2,
  },
  moray: {
    fam: 'fish', geo: { depth: 0.062, width: 1.1, body: 'slender', stations: 60, radial: 12, snout: 0.25, tail: { span: 0.02, length: 0.03, fork: 0.0, taper: 0.5 }, dorsal: { a: 0.12, b: 0.97, h: 0.04 }, anal: { a: 0.45, b: 0.97, h: 0.035 }, pect: { size: 0.001, y: -0.1 }, pelv: null, eye: 0.012, eyeT: 0.045 },
    pattern: 11, colA: [0.28, 0.26, 0.07], colB: [0.52, 0.48, 0.14], colC: [0.60, 0.56, 0.22], colD: [0.05, 0.045, 0.02], finCol: [0.30, 0.28, 0.08], finSolid: 0.7, sheen: 0.12, bend: 0.12, freq: 1.3,
  },
  grouper: {
    fam: 'fish', geo: { depth: 0.34, width: 0.52, body: 'fusiform', snout: 0.0, chin: 0.6, tail: { span: 0.24, length: 0.20, fork: 0.0, taper: 0.4, lobe: 1.0 }, dorsal: { a: 0.26, b: 0.86, h: 0.11 }, anal: { a: 0.62, b: 0.86, h: 0.09 }, pect: { size: 0.20, y: -0.1 }, pelv: { size: 0.1, a: 0.32 }, eye: 0.020, eyeT: 0.09 },
    pattern: 11, colA: [0.30, 0.18, 0.10], colB: [0.52, 0.38, 0.24], colC: [0.66, 0.54, 0.38], colD: [0.10, 0.06, 0.035], finCol: [0.30, 0.20, 0.12], finSolid: 0.6, sheen: 0.2, bend: 0.07, freq: 1.8,
  },
  // ---- big hunters that reuse shark / squid / ray / turtle geometry
  reefshark:  { fam: 'hero', kind: 0, variant: 0, unit: 1.0, freq: 0.75, amp: 0.10 },
  hammerhead: { fam: 'hero', kind: 0, variant: 2, unit: 1.0, freq: 0.6, amp: 0.10 },
  whiteshark: { fam: 'hero', kind: 0, variant: 1, unit: 1.0, freq: 0.55, amp: 0.10 },
  tigershark: { fam: 'hero', kind: 0, variant: 3, unit: 1.0, freq: 0.6, amp: 0.10 },
  manta:      { fam: 'hero', kind: 1, variant: 0, unit: 0.85, freq: 0.32, amp: 0.55 },
  turtle:     { fam: 'hero', kind: 2, variant: 0, unit: 1.0, freq: 0.24, amp: 0.55 },
  squid:      { fam: 'hero', kind: 3, variant: 0, unit: 0.57, freq: 0.7, amp: 0.10 },
  // ---- bottom dwellers + jelly (crawlers.js)
  crawl_shrimp: { fam: 'crawl', model: 'shrimp', colA: [0.85, 0.55, 0.50], colB: [0.92, 0.82, 0.76], colC: [0.80, 0.10, 0.07], freq: 1.2 },
  crawl_crab:   { fam: 'crawl', model: 'crab', colA: [0.28, 0.09, 0.05], colB: [0.55, 0.22, 0.10], colC: [0.66, 0.30, 0.12], freq: 1.0 },
  crawl_hermit: { fam: 'crawl', model: 'hermit', colA: [0.55, 0.18, 0.08], colB: [0.80, 0.74, 0.60], colC: [0.30, 0.16, 0.08], freq: 1.0 },
  crawl_urchin: { fam: 'crawl', model: 'urchin', colA: [0.04, 0.025, 0.06], colB: [0.34, 0.12, 0.42], colC: [0, 0, 0], freq: 0.5 },
  crawl_worm:   { fam: 'crawl', model: 'worm', colA: [0.62, 0.55, 0.40], colB: [0.95, 0.42, 0.06], colC: [0.08, 0.42, 0.95], freq: 0.7 },
  crawl_nudi:   { fam: 'crawl', model: 'nudi', colA: [0.03, 0.20, 0.95], colB: [0.10, 0.50, 1.0], colC: [1.0, 0.45, 0.05], freq: 0.6 },
  jelly:        { fam: 'jelly', tint: [0.62, 0.72, 0.80], tint2: [0.62, 0.22, 0.46], freq: 0.42 },
};

// ---------------------------------------------------------------------------------------------------------------------------------
// The ten forms
// speed = cruise m/s, turn = rad/s, hp, stam = seconds of dash, regen = stamina per second, eat = biggest prey as a fraction of your length,
// sense = radius (m) in which food glows / shows on the radar, stealth = fraction of notice range hidden. Perks are applied in player.js.
// ---------------------------------------------------------------------------------------------------------------------------------
export const FORMS = [
  { id: 'fry',       name: 'Glass Fry',        len: FORM_LEN[0], speed: 1.5, turn: 6.0, hp: 60,  stam: 5.0, regen: 0.9, eat: 0.55, sense: 7,  stealth: 0.10, vis: 'fry',
    blurb: 'A see-through baby fish. Stay small, stay hidden, nibble plankton.',                                  perk: { name: 'Glassy',          text: 'Predators notice you from 25% less distance.', stealth: 0.25 } },
  { id: 'damsel',    name: 'Blue Damselfish',  len: FORM_LEN[1], speed: 1.9, turn: 6.0, hp: 75,  stam: 5.0, regen: 0.9, eat: 0.55, sense: 8,  stealth: 0.00, vis: 'damsel',
    blurb: 'Bright, bold and quick. Shrimp and silversides are on the menu.',                                   perk: { name: 'Quick Start',     text: '+10% swim speed. Dashing costs 15% less stamina.', speed: 0.10, dashCost: 0.85 } },
  { id: 'butterfly', name: 'Butterflyfish',    len: FORM_LEN[2], speed: 2.4, turn: 6.6, hp: 90,  stam: 5.0, regen: 1.0, eat: 0.55, sense: 9,  stealth: 0.00, vis: 'butterfly',
    blurb: 'A disc of yellow and black. The false eye spot confuses predators.',                                 perk: { name: 'False Eye',       text: '30% of bites aim for your false eye and miss.', miss: 0.30 } },
  { id: 'wrasse',    name: 'Bluehead Wrasse',  len: FORM_LEN[3], speed: 3.0, turn: 6.2, hp: 105, stam: 5.5, regen: 1.1, eat: 0.55, sense: 10, stealth: 0.00, vis: 'wrasse',
    blurb: 'A long, powerful swimmer. Crabs and small fish are fair game.',                                     perk: { name: 'Burst Swimmer',   text: 'Stamina recovers 40% faster.', regenMul: 1.4 } },
  { id: 'trigger',   name: 'Queen Triggerfish',len: FORM_LEN[4], speed: 3.6, turn: 5.6, hp: 125, stam: 5.5, regen: 1.1, eat: 0.55, sense: 11, stealth: 0.00, vis: 'trigger',
    blurb: 'Tough hide, strong teeth. Even spiny urchins are food.',                                            perk: { name: 'Armoured Hide',   text: 'Take 20% less damage. Spines cannot hurt you.', armor: 0.20, spineProof: true } },
  { id: 'parrot',    name: 'Parrotfish',       len: FORM_LEN[5], speed: 4.4, turn: 5.0, hp: 150, stam: 6.0, regen: 1.1, eat: 0.55, sense: 12, stealth: 0.00, vis: 'parrot',
    blurb: 'A beak that crunches coral and shells, and plenty of health.',                                       perk: { name: 'Crusher Beak',    text: '+10% health. Shelled prey gives extra growth.', hpMul: 1.10, shellBonus: 1.5 } },
  { id: 'jack',      name: 'Giant Trevally',   len: FORM_LEN[6], speed: 5.4, turn: 5.0, hp: 175, stam: 6.0, regen: 1.2, eat: 0.58, sense: 14, stealth: 0.00, vis: 'jack',
    blurb: 'A silver hunter of the reef edge. Fast, strong, and hungry.',                                       perk: { name: 'Pack Hunter',     text: 'You can swallow prey 3% larger.', eat: 0.03 } },
  { id: 'barracuda', name: 'Great Barracuda',  len: FORM_LEN[7], speed: 6.4, turn: 4.4, hp: 200, stam: 6.0, regen: 1.2, eat: 0.58, sense: 16, stealth: 0.00, vis: 'barracuda',
    blurb: 'A silver torpedo. Nothing in the reef is faster over a short distance.',                             perk: { name: 'Lightning Strike',text: 'Bite lunges reach 40% farther. Dash is 10% faster.', lunge: 1.4, dashMul: 1.10 } },
  { id: 'tuna',      name: 'Yellowfin Tuna',   len: FORM_LEN[8], speed: 7.7, turn: 4.0, hp: 230, stam: 7.0, regen: 1.3, eat: 0.58, sense: 18, stealth: 0.00, vis: 'tuna',
    blurb: 'Built for the open ocean. You can swim all day.',                                                    perk: { name: 'Tireless',        text: '+25% stamina and recovery.', stamMul: 1.25, regenMul: 1.25 } },
  { id: 'shark',     name: 'Great White',      len: FORM_LEN[9], speed: 9.4, turn: 3.4, hp: 280, stam: 7.0, regen: 1.3, eat: 0.58, sense: 22, stealth: 0.00, vis: 'whiteshark',
    blurb: 'The apex predator. The ocean is yours.',                                                            perk: { name: 'Apex',            text: 'Small fish flee from you. +10% growth from meals.', apex: true, xp: 0.10 } },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------------------------------------------------------------
export const ATTRS = {
  speed:    { name: 'Fast Fins',       icon: 'bolt',    max: 3, text: 'Swim 12% faster per rank.' },
  turn:     { name: 'Agile Tail',      icon: 'turn',    max: 3, text: 'Turn 18% faster per rank.' },
  stamina:  { name: 'Big Lungs',       icon: 'lungs',   max: 3, text: 'Dash 25% longer and recover faster per rank.' },
  armor:    { name: 'Thick Scales',    icon: 'shield',  max: 3, text: 'Take 10% less bite damage per rank.' },
  vital:    { name: 'Hardy Body',      icon: 'heart',   max: 3, text: '+18% health and faster healing per rank.' },
  jaws:     { name: 'Strong Jaws',     icon: 'jaw',     max: 3, text: 'Swallow prey 5% bigger and bite again sooner, per rank.' },
  senses:   { name: 'Keen Senses',     icon: 'eye',     max: 3, text: '+30% sense range per rank. Food glows from farther away.' },
  stealth:  { name: 'Camouflage',      icon: 'ghost',   max: 3, text: 'Predators notice you from 12% less distance per rank.' },
  appetite: { name: 'Quick Digestion', icon: 'stomach', max: 3, text: '+12% growth from every meal per rank.' },
  slick:    { name: 'Slippery Skin',   icon: 'drop',    max: 2, text: '35% chance per rank to wriggle free of a bite.' },
};
export const ABILITIES = {
  ink:   { name: 'Ink Cloud',    icon: 'ink',   cd: 18, dur: 5.0, text: 'Release a dark cloud. Hunters lose track of you for 5 seconds.' },
  stun:  { name: 'Shock Pulse',  icon: 'zap',   cd: 22, dur: 3.0, text: 'Freeze every creature near you for 3 seconds. Easy meals and free escapes.' },
  puff:  { name: 'Puff Up',      icon: 'puff',  cd: 26, dur: 5.0, text: 'Swell to twice your size for 5 seconds. Bites cannot swallow you and hurt half as much.' },
  rush:  { name: 'Torpedo Rush', icon: 'rush',  cd: 14, dur: 1.3, text: 'A straight, unstoppable burst. You cannot be bitten while it lasts.' },
  decoy: { name: 'Decoy Shoal',  icon: 'decoy', cd: 28, dur: 6.0, text: 'Release a swirl of shimmering fish. Hunters chase them instead of you.' },
};
export const PASSIVES = {
  frenzy: { name: 'Feeding Frenzy', icon: 'frenzy', text: 'Each meal within 3 seconds of the last makes you 6% faster (up to 5 times).' },
};
export const ABILITY_SLOTS = 2;

// ---------------------------------------------------------------------------------------------------------------------------------
// Wild creatures.  role: prey | pred | neutral | hazard.   beh: speck | sessile | crawl | shoal | solo | ambush | patrol | pack | drift | jelly
// hab: zones allowed, depth [min,max] of the water the creature swims in, place = where in the water column,
//      reef/grass/sand/rock = required range of that seabed mask.   dens = groups per hectare of suitable habitat.
// Speeds default from the length (see speedsFor) unless given.   hint = bestiary text.
// ---------------------------------------------------------------------------------------------------------------------------------
const Z = { all: ['lagoon', 'flat', 'fore', 'wall', 'blue'], shallow: ['lagoon', 'flat'], reef: ['lagoon', 'flat', 'fore'], deep: ['fore', 'wall', 'blue'], open: ['wall', 'blue'] };

export const SPECIES = {
  // ---- plankton and tiny swimmers (drawn as glowing specks, eaten by swimming through them)
  plankton: { name: 'Plankton', fam: 'speck', len: 0.008, tier: 1, role: 'prey', beh: 'speck', xp: 0.4, cloud: [12, 30, 1.0, 2.4], col: [0.12, 0.95, 0.62],
    hab: { zones: Z.all, depth: [0.8, 40], place: 'water' }, dens: 4.5, hint: 'Drifting specks of life. Swim through a cloud to feed.' },
  copepod: { name: 'Copepods', fam: 'speck', len: 0.018, tier: 1, role: 'prey', beh: 'copepod', xp: 1.0, cloud: [5, 12, 0.5, 1.2], col: [1.0, 0.65, 0.35],
    hab: { zones: Z.reef, depth: [1, 25], place: 'near', h: [0.2, 3], }, dens: 3, hint: 'Tiny jumpers. They dart away, so move slowly.' },
  mysid: { name: 'Glass Shrimp', fam: 'speck', len: 0.03, tier: 1, role: 'prey', beh: 'copepod', xp: 1.3, cloud: [4, 9, 0.4, 1.0], col: [0.85, 0.95, 1.0],
    hab: { zones: Z.shallow, depth: [1, 8], place: 'near', h: [0.1, 1.2], grass: [0.1, 1] }, dens: 2.5, hint: 'Clear little shrimp that hover over the seagrass.' },

  // ---- bottom dwellers
  worm: { name: 'Feather Worm', fam: 'crawl', model: 'worm', len: 0.04, tier: 1, role: 'prey', beh: 'sessile', xp: 1.6, cruise: 0, flee: 0,
    hab: { zones: Z.reef, depth: [1, 15], place: 'floor', reef: [0.25, 1] }, grp: [3, 8], dens: 3, hint: 'Colourful fans that snap shut when you come near. Sneak up.' },
  shrimp: { name: 'Banded Shrimp', fam: 'crawl', model: 'shrimp', len: 0.07, tier: 2, role: 'prey', beh: 'crawl', xp: 1.0, cruise: 0.05, flee: 0.55,
    hab: { zones: Z.reef, depth: [1, 20], place: 'floor', reef: [0.1, 1] }, grp: [1, 3], dens: 3, hint: 'Flicks backwards when it spots you.' },
  hermit: { name: 'Hermit Crab', fam: 'crawl', model: 'hermit', len: 0.08, tier: 2, role: 'prey', beh: 'crawl', xp: 1.1, shell: true, cruise: 0.025, flee: 0.12,
    hab: { zones: Z.reef, depth: [1, 22], place: 'floor', sand: [0.2, 1] }, grp: [1, 2], dens: 3, hint: 'A borrowed shell for a house. It hides when frightened.' },
  crab: { name: 'Rock Crab', fam: 'crawl', model: 'crab', len: 0.12, tier: 3, role: 'prey', beh: 'crawl', xp: 1.1, shell: true, cruise: 0.07, flee: 0.9,
    hab: { zones: Z.reef, depth: [1, 25], place: 'floor', rock: [0.2, 1] }, grp: [1, 2], dens: 2.4, hint: 'Quick on the seabed. Hard shell, soft middle.' },
  nudi: { name: 'Nudibranch', fam: 'crawl', model: 'nudi', len: 0.06, tier: 2, role: 'hazard', beh: 'crawl', xp: 1.2, toxic: 0.10, slow: true, cruise: 0.006, flee: 0.01,
    hab: { zones: Z.reef, depth: [1, 25], place: 'floor', reef: [0.2, 1] }, grp: [1, 1], dens: 1.2, hint: 'Bright colours mean poison. Eating one makes you sick.' },
  urchin: { name: 'Sea Urchin', fam: 'crawl', model: 'urchin', len: 0.12, tier: 4, role: 'hazard', beh: 'sessile', xp: 1.2, spiny: 0.12, slow: true, cruise: 0, flee: 0,
    hab: { zones: Z.reef, depth: [1, 25], place: 'floor', rock: [0.25, 1] }, grp: [1, 3], dens: 2.4, hint: 'Spines hurt unless you wear armour. Triggerfish flip them over.' },

  // ---- schooling prey
  silverfry: { name: 'Silver Fry', fam: 'fish', vis: 'silverfry', len: 0.045, tier: 1, role: 'prey', beh: 'shoal', xp: 0.6,
    hab: { zones: Z.shallow, depth: [1.2, 8], place: 'water', depthBand: [0.6, 3.0] }, grp: [20, 44], dens: 1.6, hint: 'Tiny silver babies in a tight ball.' },
  silverside: { name: 'Silversides', fam: 'fish', vis: 'silverside', len: 0.075, tier: 2, role: 'prey', beh: 'shoal', xp: 1.0,
    hab: { zones: Z.shallow, depth: [1.5, 12], place: 'near', h: [0.5, 2.5] }, grp: [30, 80], dens: 1.6, hint: 'Shimmering shoals over the lagoon sand.' },
  chromis: { name: 'Blue Chromis', fam: 'fish', vis: 'chromis', len: 0.085, tier: 2, role: 'prey', beh: 'shoal', xp: 1.1,
    hab: { zones: Z.reef, depth: [1.5, 20], place: 'near', h: [0.6, 3], reef: [0.15, 1] }, grp: [18, 45], dens: 1.8, hint: 'Hover above the coral and dive into it when scared.' },
  anthias: { name: 'Anthias', fam: 'fish', vis: 'anthias', len: 0.10, tier: 3, role: 'prey', beh: 'shoal', xp: 1.0,
    hab: { zones: ['fore', 'wall', 'flat'], depth: [3, 40], place: 'near', h: [1, 5], reef: [0.1, 1] }, grp: [14, 36], dens: 1.4, hint: 'Pink and orange clouds along the reef edge.' },
  sergeant: { name: 'Sergeant Major', fam: 'fish', vis: 'sergeant', len: 0.12, tier: 3, role: 'prey', beh: 'solo', xp: 1.0, group: [2, 5],
    hab: { zones: Z.reef, depth: [1.5, 15], place: 'near', h: [0.4, 2], reef: [0.15, 1] }, grp: [2, 5], dens: 1.6, hint: 'Barred, bold, and everywhere on the reef.' },
  butterfly: { name: 'Butterflyfish', fam: 'fish', vis: 'butterfly', len: 0.16, tier: 4, role: 'prey', beh: 'solo', xp: 1.0,
    hab: { zones: Z.reef, depth: [2, 25], place: 'near', h: [0.5, 2.5], reef: [0.2, 1] }, grp: [1, 2], dens: 1.4, hint: 'Swims in pairs and nibbles polyps.' },
  fusilier: { name: 'Fusiliers', fam: 'fish', vis: 'fusilier', len: 0.22, tier: 5, role: 'prey', beh: 'shoal', xp: 1.0,
    hab: { zones: ['flat', 'fore', 'wall'], depth: [3, 40], place: 'water', depthBand: [2, 18] }, grp: [24, 60], dens: 1.0, hint: 'Fast blue-and-yellow shoals in open water.' },
  tang: { name: 'Blue Tang', fam: 'fish', vis: 'tang', len: 0.26, tier: 5, role: 'prey', beh: 'solo', xp: 1.0,
    hab: { zones: Z.reef, depth: [2, 25], place: 'near', h: [0.5, 2.5], reef: [0.15, 1] }, grp: [2, 6], dens: 1.0, hint: 'Grazers that flash blue as they turn.' },
  sardine: { name: 'Sardines', fam: 'fish', vis: 'sardine', len: 0.15, tier: 4, role: 'prey', beh: 'shoal', xp: 0.8,
    hab: { zones: Z.open.concat(['fore']), depth: [6, 60], place: 'water', depthBand: [3, 22] }, grp: [90, 180], dens: 0.5, hint: 'Huge silver balls of fish. Everyone eats them.' },
  goatfish: { name: 'Goatfish', fam: 'fish', vis: 'goatfish', len: 0.30, tier: 6, role: 'prey', beh: 'solo', xp: 1.0,
    hab: { zones: ['lagoon', 'flat', 'fore'], depth: [2, 20], place: 'floor', sand: [0.4, 1] }, grp: [2, 5], dens: 0.8, hint: 'Feels the sand for worms with its chin whiskers.' },
  mackerel: { name: 'Mackerel', fam: 'fish', vis: 'mackerel', len: 0.34, tier: 6, role: 'prey', beh: 'shoal', xp: 1.0,
    hab: { zones: ['fore', 'wall', 'blue'], depth: [6, 60], place: 'water', depthBand: [3, 25] }, grp: [24, 60], dens: 0.7, hint: 'Streamlined shoals that race along the wall.' },
  snapper: { name: 'Yellow Snapper', fam: 'fish', vis: 'snapper', len: 0.40, tier: 7, role: 'prey', beh: 'shoal', xp: 1.0,
    hab: { zones: ['fore', 'wall'], depth: [4, 40], place: 'near', h: [1, 8], reef: [0.05, 1] }, grp: [8, 20], dens: 0.6, hint: 'Schools by the hundred over the reef.' },
  parrot: { name: 'Parrotfish', fam: 'fish', vis: 'parrot', len: 0.42, tier: 7, role: 'prey', beh: 'solo', xp: 1.0,
    hab: { zones: ['flat', 'fore'], depth: [1.5, 25], place: 'near', h: [0.4, 2.5], reef: [0.2, 1] }, grp: [1, 4], dens: 0.8, hint: 'Crunches coral with a beak and sleeps in a mucus bag.' },

  skipjack: { name: 'Skipjack Tuna', fam: 'fish', vis: 'skipjack', len: 0.62, tier: 8, role: 'prey', beh: 'shoal', xp: 1.0,
    hab: { zones: ['wall', 'blue', 'fore'], depth: [8, 80], place: 'water', depthBand: [3, 28] }, grp: [10, 24], dens: 0.35, hint: 'Fast, striped tuna that hunt sardines. Hard to catch, worth it.' },

  // ---- hunters that are also prey for the biggest forms
  jack: { name: 'Trevally Pack', fam: 'fish', vis: 'jack', len: 0.60, tier: 8, role: 'pred', beh: 'pack', xp: 1.0, det: 13, biteK: 1.0,
    hab: { zones: ['fore', 'wall', 'blue'], depth: [5, 70], place: 'water', depthBand: [3, 30] }, grp: [6, 14], dens: 0.22, hint: 'Hunt in gangs. Small fish should stay away.' },
  wahoo: { name: 'Wahoo', fam: 'fish', vis: 'wahoo', len: 1.25, tier: 9, role: 'pred', beh: 'pack', xp: 1.0, det: 17, biteK: 1.0,
    hab: { zones: ['wall', 'blue'], depth: [8, 90], place: 'water', depthBand: [2, 16] }, grp: [1, 3], dens: 0.16, hint: 'The fastest fish on the reef edge. A blur of blue bars.' },
  mahi: { name: 'Mahi-mahi', fam: 'fish', vis: 'mahi', len: 0.95, tier: 9, role: 'pred', beh: 'pack', xp: 1.0, det: 14, biteK: 1.0,
    hab: { zones: ['wall', 'blue'], depth: [5, 80], place: 'water', depthBand: [1, 10] }, grp: [2, 5], dens: 0.22, hint: 'Gold and electric blue, quick near the surface.' },
  tuna: { name: 'Yellowfin Tuna', fam: 'fish', vis: 'tuna', len: 1.70, tier: 10, role: 'pred', beh: 'pack', xp: 1.0, det: 20, biteK: 1.0,
    hab: { zones: ['wall', 'blue'], depth: [6, 90], place: 'water', depthBand: [4, 40] }, grp: [3, 6], dens: 0.1, hint: 'Packs of powerful, tireless swimmers.' },

  // ---- predators
  lizardfish: { name: 'Lizardfish', fam: 'fish', vis: 'lizardfish', len: 0.28, tier: 6, role: 'pred', beh: 'ambush', xp: 1.0, det: 5.0, biteK: 1.0,
    hab: { zones: Z.reef, depth: [1.2, 15], place: 'floor', sand: [0.5, 1] }, grp: [1, 1], dens: 0.7, hint: 'Lies still on the sand. If you pass close, snap.' },
  scorpionfish: { name: 'Scorpionfish', fam: 'fish', vis: 'scorpionfish', len: 0.30, tier: 6, role: 'pred', beh: 'ambush', xp: 1.0, det: 4.0, biteK: 1.0, venom: 0.06,
    hab: { zones: Z.reef, depth: [1.2, 25], place: 'floor', reef: [0.2, 1] }, grp: [1, 1], dens: 0.5, hint: 'Looks like a rock. Venomous.' },
  lionfish: { name: 'Lionfish', fam: 'fish', vis: 'lionfish', len: 0.38, tier: 7, role: 'pred', beh: 'solo-hunter', xp: 1.0, det: 9, biteK: 0.9, venom: 0.05,
    hab: { zones: Z.reef, depth: [1.5, 25], place: 'near', h: [0.3, 1.5], reef: [0.25, 1] }, grp: [1, 1], dens: 0.4, hint: 'Slow, striped and venomous. Herds small fish into corners.' },
  trumpetfish: { name: 'Trumpetfish', fam: 'fish', vis: 'trumpetfish', len: 0.70, tier: 8, role: 'pred', beh: 'stalker', xp: 1.0, det: 10, biteK: 0.9,
    hab: { zones: Z.reef, depth: [1.5, 25], place: 'near', h: [0.5, 3], reef: [0.15, 1] }, grp: [1, 1], dens: 0.32, hint: 'Hides head-down in the coral and sucks fish out of the water.' },
  moray: { name: 'Moray Eel', fam: 'fish', vis: 'moray', len: 1.2, tier: 9, role: 'pred', beh: 'den', xp: 1.0, det: 4.0, biteK: 1.15,
    hab: { zones: ['flat', 'fore', 'wall'], depth: [1.5, 40], place: 'floor', rock: [0.4, 1], steep: [0.35, 9] }, grp: [1, 1], dens: 0.3, hint: 'Lives in a hole. Do not swim past its door.' },
  grouper: { name: 'Grouper', fam: 'fish', vis: 'grouper', len: 1.3, tier: 9, role: 'pred', beh: 'ambush', xp: 1.0, det: 9, biteK: 1.1,
    hab: { zones: ['fore', 'wall'], depth: [3, 40], place: 'floor', rock: [0.2, 1] }, grp: [1, 1], dens: 0.22, hint: 'A huge mouth that swallows whole.' },
  barracuda: { name: 'Barracuda', fam: 'fish', vis: 'barracuda', len: 1.4, tier: 10, role: 'pred', beh: 'patrol', xp: 1.0, det: 17, biteK: 1.0,
    hab: { zones: ['fore', 'wall', 'blue'], depth: [4, 60], place: 'water', depthBand: [2, 18] }, grp: [1, 3], dens: 0.14, hint: 'Hangs motionless, then shoots forward.' },
  reefshark: { name: 'Blacktip Reef Shark', fam: 'hero', vis: 'reefshark', len: 1.9, tier: 10, role: 'pred', beh: 'patrol', xp: 1.0, det: 20, biteK: 1.15,
    hab: { zones: ['fore', 'wall', 'blue'], depth: [5, 70], place: 'water', depthBand: [3, 25] }, grp: [1, 2], dens: 0.08, hint: 'Patrols the reef edge. Its fins have black tips.' },
  hammerhead: { name: 'Hammerhead', fam: 'hero', vis: 'hammerhead', len: 3.5, tier: 10, role: 'pred', beh: 'patrol', xp: 1.0, det: 24, biteK: 1.15,
    hab: { zones: ['wall', 'blue'], depth: [8, 90], place: 'water', depthBand: [5, 40] }, grp: [1, 1], dens: 0.045, hint: 'Sweeps its wide head across the sand and the blue.' },
  tigershark: { name: 'Tiger Shark', fam: 'hero', vis: 'tigershark', len: 4.0, tier: 10, role: 'pred', beh: 'patrol', xp: 1.0, det: 26, biteK: 1.2,
    hab: { zones: ['blue', 'wall'], depth: [10, 100], place: 'water', depthBand: [6, 50] }, grp: [1, 1], dens: 0.03, hint: 'Eats almost anything.' },
  whiteshark: { name: 'Great White Shark', fam: 'hero', vis: 'whiteshark', len: 5.0, tier: 10, role: 'pred', beh: 'patrol', xp: 1.0, det: 28, biteK: 1.25,
    hab: { zones: ['blue', 'wall'], depth: [15, 105], place: 'water', depthBand: [8, 60] }, grp: [1, 1], dens: 0.022, hint: 'The biggest predator on this reef.' },

  // ---- neutrals and hazards
  turtle: { name: 'Green Turtle', fam: 'hero', vis: 'turtle', len: 1.1, tier: 10, role: 'neutral', beh: 'drift', xp: 0, det: 0,
    hab: { zones: ['lagoon', 'flat', 'fore'], depth: [2, 22], place: 'near', h: [0.8, 3] }, grp: [1, 1], dens: 0.18, hint: 'Gentle grazers. They ignore you and you cannot eat them.' },
  manta: { name: 'Manta Ray', fam: 'hero', vis: 'manta', len: 3.4, tier: 10, role: 'neutral', beh: 'drift', xp: 0, det: 0,
    hab: { zones: ['fore', 'wall', 'blue'], depth: [8, 90], place: 'water', depthBand: [4, 25] }, grp: [1, 1], dens: 0.06, hint: 'A gentle giant that eats plankton. Harmless.' },
  cleaner: { name: 'Cleaning Station', fam: 'crawl', model: 'shrimp', vis: 'crawl_shrimp', len: 0.07, tier: 1, role: 'neutral', beh: 'station', xp: 0, cruise: 0, flee: 0,
    hab: { zones: Z.reef, depth: [1.3, 22], place: 'floor', reef: [0.4, 1] }, grp: [1, 1], dens: 0.3, hint: 'A cleaner shrimp on a coral head. Hover still beside it and it will tend your wounds.' },
  jelly: { name: 'Moon Jelly', fam: 'jelly', vis: 'jelly', len: 0.22, tier: 10, role: 'hazard', beh: 'jelly', xp: 0, sting: 0.07,
    hab: { zones: Z.all, depth: [2, 60], place: 'water', depthBand: [1.5, 12] }, grp: [2, 7], dens: 0.35, hint: 'Pretty and stinging. Swim around the bell and its trailing arms.' },
};

// speeds (m/s) from length: v0 is how fast a fish of this size cruises when it means it. The player uses the same law (see FORMS).
export const v0 = (len) => 1.5 * Math.pow(len / 0.12, 0.55);
export function speedsFor(sp) {
  const base = v0(sp.len);
  return {
    cruise: sp.cruise ?? base * (sp.beh === 'shoal' ? 0.42 : 0.38),
    flee: sp.flee ?? base * 1.12,
    chase: sp.chase ?? base * (sp.beh === 'ambush' || sp.beh === 'den' ? 1.9 : 1.14),
    turn: sp.turn ?? Math.max(1.6, 5.2 - 1.6 * Math.log2(Math.max(sp.len, 0.05) / 0.12 + 1) * 0.5),
  };
}

// how far (m) a bite from a predator of length L reaches, how hard it hits (fraction of max HP) against a target of length t
export const biteDamage = (predLen, targetLen, k = 1) => Math.min(0.55, (0.17 + 0.095 * Math.log2(Math.max(predLen / targetLen, 1))) * k);
export const noticeRange = (sp) => sp.det ?? (8 + 9 * Math.pow(sp.len, 0.7));

// ---------------------------------------------------------------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------------------------------------------------------------
export const TIPS = [
  'Glowing dots are plankton. Swim through them to eat.',
  'Aim the centre of the screen at a green-ringed fish and click to bite.',
  'Shift dashes, but it drains stamina. Use it to escape, not to cruise.',
  'Seagrass and coral hide you. Predators notice you from far less distance there.',
  'Shallow water keeps the big fish out. The reef flat is a safe nursery.',
  'Q sends a sense pulse: food glows green, danger glows red.',
  'Meals in quick succession build a combo. Different species add a variety bonus.',
  'Eating a new species for the first time gives bonus growth and a Bestiary entry.',
];
