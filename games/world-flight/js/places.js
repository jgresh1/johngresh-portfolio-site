// places.js — two short lists, written by hand.
//
//   CITIES   the large cities of the world: named on the globe from far out, and used by the film to find an orbit
//            that passes over lights. [name, latitude, longitude, weight (roughly millions of people)]
//   IDEAS    flights worth making, offered under the globe. Each is a real place and a way to start there:
//            `apt` (an airport's code: lined up on its runway), or in the air at `alt` metres above the ground on
//            `hdg`. `look` is how far out the globe stops when it travels there (Earth radii above the ground).
export const CITIES = [
  ['Tokyo', 35.68, 139.77, 37], ['Delhi', 28.61, 77.21, 32], ['Shanghai', 31.23, 121.47, 28], ['São Paulo', -23.55, -46.63, 22], ['Mexico City', 19.43, -99.13, 22],
  ['Cairo', 30.04, 31.24, 21], ['Mumbai', 19.08, 72.88, 21], ['Beijing', 39.90, 116.40, 21], ['Dhaka', 23.81, 90.41, 22], ['Osaka', 34.69, 135.50, 19],
  ['New York', 40.71, -74.01, 19], ['Karachi', 24.86, 67.01, 16], ['Buenos Aires', -34.60, -58.38, 15], ['Istanbul', 41.01, 28.98, 15], ['Kolkata', 22.57, 88.36, 15],
  ['Lagos', 6.52, 3.38, 15], ['Manila', 14.60, 120.98, 14], ['Rio de Janeiro', -22.91, -43.17, 13], ['Guangzhou', 23.13, 113.26, 13], ['Los Angeles', 34.05, -118.24, 13],
  ['Moscow', 55.76, 37.62, 12], ['Paris', 48.86, 2.35, 11], ['Bangkok', 13.76, 100.50, 11], ['Jakarta', -6.21, 106.85, 11], ['London', 51.51, -0.13, 9.5],
  ['Lima', -12.05, -77.04, 11], ['Seoul', 37.57, 126.98, 10], ['Tehran', 35.69, 51.39, 9.5], ['Chicago', 41.88, -87.63, 9], ['Bogotá', 4.71, -74.07, 11],
  ['Johannesburg', -26.20, 28.05, 6], ['Hong Kong', 22.32, 114.17, 7.5], ['Singapore', 1.35, 103.82, 6], ['Madrid', 40.42, -3.70, 6.7], ['Toronto', 43.65, -79.38, 6.4],
  ['Sydney', -33.87, 151.21, 5.3], ['Riyadh', 24.71, 46.68, 7.5], ['Dubai', 25.20, 55.27, 3.5], ['Berlin', 52.52, 13.40, 3.7], ['Rome', 41.90, 12.50, 4.3],
  ['Nairobi', -1.29, 36.82, 5], ['Cape Town', -33.92, 18.42, 4.7], ['San Francisco', 37.77, -122.42, 4.7], ['Santiago', -33.45, -70.67, 6.8], ['Melbourne', -37.81, 144.96, 5.2],
  ['Honolulu', 21.31, -157.86, 1], ['Anchorage', 61.22, -149.90, 0.3], ['Reykjavík', 64.15, -21.94, 0.24], ['Auckland', -36.85, 174.76, 1.6], ['Kinshasa', -4.44, 15.27, 16],
  ['Denver', 39.74, -104.99, 3], ['Miami', 25.76, -80.19, 6.2], ['Vancouver', 49.28, -123.12, 2.6], ['Lisbon', 38.72, -9.14, 2.9], ['Kathmandu', 27.72, 85.32, 1.5],
];

export const IDEAS = [
  { name: 'Lukla', note: 'the runway on the side of Everest’s valley', lat: 27.6869, lon: 86.7298, apt: 'VNLK', look: 0.012 },
  { name: 'Manhattan', note: 'down the Hudson past the towers', lat: 40.742, lon: -74.022, alt: 420, hdg: 20, look: 0.006 },
  { name: 'Innsbruck', note: 'an airport walled in by the Alps', lat: 47.2602, lon: 11.3440, apt: 'LOWI', look: 0.012 },
  { name: 'Grand Canyon', note: 'below the rim, along the river', lat: 36.105, lon: -112.105, alt: 300, hdg: 285, look: 0.014 },
  { name: 'Rio de Janeiro', note: 'Sugarloaf, the bay and the city', lat: -22.955, lon: -43.130, alt: 500, hdg: 300, look: 0.008 },
  { name: 'The Matterhorn', note: 'round the peak from Zermatt', lat: 45.995, lon: 7.720, alt: 900, hdg: 235, look: 0.012 },
  { name: 'Paris', note: 'along the Seine to the tower', lat: 48.853, lon: 2.375, alt: 380, hdg: 285, look: 0.006 },
  { name: 'Tokyo', note: 'over the bay to the city', lat: 35.6197, lon: 139.7667, alt: 300, hdg: 350, look: 0.008 },
  { name: 'Hong Kong', note: 'the harbour between the peaks', lat: 22.285, lon: 114.215, alt: 380, hdg: 275, look: 0.007 },
  { name: 'Queenstown', note: 'a lake in the Southern Alps', lat: -45.0211, lon: 168.7392, apt: 'NZQN', look: 0.012 },
  { name: 'Monument Valley', note: 'buttes out of the desert floor', lat: 36.955, lon: -110.130, alt: 260, hdg: 20, look: 0.012 },
  { name: 'Madeira', note: 'a runway on stilts over the sea', lat: 32.6979, lon: -16.7745, apt: 'LPMA', look: 0.012 },
  { name: 'Yosemite', note: 'up the valley to Half Dome', lat: 37.722, lon: -119.660, alt: 500, hdg: 75, look: 0.012 },
  { name: 'Dubai', note: 'the towers and the palms', lat: 25.150, lon: 55.180, alt: 450, hdg: 35, look: 0.008 },
  { name: 'St Maarten', note: 'take off over the beach', lat: 18.0410, lon: -63.1089, apt: 'TNCM', look: 0.010 },
  { name: 'Mount Fuji', note: 'across the lakes to the cone', lat: 35.480, lon: 138.760, alt: 900, hdg: 190, look: 0.014 },
  { name: 'Sydney', note: 'the harbour, the bridge, the opera house', lat: -33.845, lon: 151.265, alt: 350, hdg: 255, look: 0.007 },
  { name: 'Iceland', note: 'glaciers down to black sand', lat: 63.980, lon: -16.900, alt: 800, hdg: 280, look: 0.02 },
  { name: 'Paro', note: 'the hardest approach in Bhutan', lat: 27.4032, lon: 89.4246, apt: 'VQPR', look: 0.012 },
  { name: 'Venice', note: 'the lagoon and the Grand Canal', lat: 45.425, lon: 12.365, alt: 300, hdg: 280, look: 0.006 },
];
