// Standard camera views for regression checks / portfolio stills. Each view: [name, opts for O.shot()]
// (terrain-relative helpers are resolved by the caller through `world`).
export function suiteViews(world) {
  const h = (x, z) => world.height(x, z);
  const at = (x, z, up) => [x, h(x, z) + up, z];
  return [
    ['s01_lagoon_grass',  { pos: at(-300, -105, 1.3), look: [-292, h(-292, -103) + 0.4, -103], fov: 60, aperture: 4, focus: 6 }],
    ['s02_reef_garden',   { pos: at(196, 2, 1.6), look: [212, h(212, 6) + 1.0, 6], fov: 58, aperture: 4, focus: 6 }],
    ['s03_reef_crest',    { pos: at(180, -25, 1.8), look: [160, h(160, -20) + 0.6, -20], fov: 66, aperture: 3, focus: 6 }],
    ['s04_spur_groove',   { pos: at(225, -8, 3.0), look: [255, h(255, -12) - 1, -12], fov: 62, aperture: 4, focus: 8 }],
    ['s05_wall_edge',     { pos: [363, -35, 9], look: [343, -41, 2], fov: 74, aperture: 3, focus: 12, noclamp: true, school: { name: 'jack', at: [353, -34, 3], heading: [0, 1], frame: false } }],
    ['s06_blue_water',    { school: { name: 'jack', anchor: [440, -24, -28], seed: 3, dist: 9, yaw: 2.3, up: 1.2 }, fov: 62, aperture: 3, focus: 9 }],
    ['s07_snell_window',  { pos: [-20, -2.6, 10], look: [-14, 0, 14], fov: 80, time: 7 }],
    ['s08_looking_up',    { pos: at(250, -10, 6), look: [262, -3, -6], fov: 66 }],
    ['s09_deep_slope',    { pos: at(440, 8, 2.2), look: [452, h(452, 10) + 0.3, 10], fov: 66, lamp: true }],
    ['s10_abyss',         { pos: at(6500, 0, 3), look: [6494, h(6494, 0) + 0.4, 1.5], fov: 64, lamp: true }],
    ['s11_above',         { pos: [60, 9, -30], look: [210, -3, 10], fov: 62 }],
    ['s12_wall_strobe',   { pos: [362, -46, -8], look: [343, -50, 8], fov: 72, strobe: 60, aperture: 3, focus: 9, noclamp: true }],
  ];
}
