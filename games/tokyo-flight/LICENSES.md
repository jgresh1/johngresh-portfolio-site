# Data and code credits

Nothing below is bundled except the two libraries. The data is fetched from its publishers at run time.

## Data

| What | Publisher | Terms | Credit line used on the page |
|---|---|---|---|
| 3D city model of Tokyo (buildings, bridges), 3D Tiles | Project PLATEAU, Ministry of Land, Infrastructure, Transport and Tourism (MLIT), Japan. Catalogue: https://api.plateau.reearth.io/datacatalog/plateau-datasets | PLATEAU site policy: free to copy, adapt and use commercially with the source stated; compatible with CC BY 4.0 | Buildings: Project PLATEAU, MLIT Japan (CC BY 4.0) |
| Seamless aerial photo tiles | Geospatial Information Authority of Japan (GSI). https://maps.gsi.go.jp/development/ichiran.html | GSI content terms of use: free with the source stated. At small scales the layer includes Landsat 8 imagery (GSI, TSIC, GEO Grid / AIST; courtesy of the U.S. Geological Survey) and GEBCO bathymetry | Ground photo and elevation: GSI Japan |
| Elevation tiles (10 m model, 5 m laser survey) | GSI, same page | Same | Same |
| Names and positions of shops and other places (`data/pois/`, used for the signs) | OpenStreetMap contributors, fetched through the Overpass API by `tools/build_pois.py` | Open Database Licence (ODbL) 1.0: credit required, and a database made from it must stay under ODbL | Place names: © OpenStreetMap contributors |
| Live weather: cloud, rain, snow, wind, visibility, temperature on a grid of points | Open-Meteo (https://open-meteo.com/), from the Japan Meteorological Agency's models | CC BY 4.0; free for non-commercial use without a key, up to 10,000 calls a day | Weather: Open-Meteo (CC BY 4.0) |
| Live weather: airport reports (METAR) | NOAA Aviation Weather Center (https://aviationweather.gov/) | U.S. government work, public domain | NOAA Aviation Weather Center |

The signs show real business names as plain text. They do not reproduce logos, lettering or colours of any
business, and their placement on the building is generated.

The terms above are my reading of the publishers' pages, not legal advice. Before publishing this anywhere
public, read both terms pages; GSI asks for an application for some kinds of redistribution of its tiles,
which does not apply to a page that loads them live from GSI.

Building names, heights and uses shown in the info card come from the PLATEAU attribute tables.

## Code

| What | Licence | Where |
|---|---|---|
| three.js r186 | MIT | `site/vendor/three.*.js`, `site/vendor/addons/`, `site/vendor/LICENSE-three.txt` |
| Draco decoder (Google), shipped with three.js | Apache 2.0 | `site/vendor/addons/libs/draco/` |
| 3d-tiles-renderer 0.5.4 (NASA-AMMOS) | Apache 2.0 | `site/vendor/3d-tiles-renderer/`, `site/vendor/LICENSE-3d-tiles-renderer.txt` |

## Tokyo Flight

- **Aircraft model**: Payen Pa 49B Katy, modelled by John Gresh (Desktop/katy_studio), exported with
  `tools/export_jet.py`. The pilot figure, the hangar, the flight model, the film and all sound are original
  to this project; nothing in them is recorded or downloaded.
- **Second aircraft**: NASA AD-1 (N805NA), modelled by John Gresh (Desktop/ad1_studio) from the dimensions in NASA
  TP-2224 and NASA's photographs, exported with `tools/export_ad1.py`. The NASA insignia and the maker's logo are
  left off the model; the registration and the fin number are the aircraft's own. This project is not connected
  with NASA or endorsed by it.
- **Map data** is the same as the map page's (above): Project PLATEAU (CC BY 4.0) and GSI Japan. On the
  published site the tiles pass through a cache on the site's own address (`worker/index.js`); they are not
  altered, and the credit line stays on screen.
- **Pilot's hands**: the gloved hands are the WebXR Input Profiles generic hand meshes (`site/assets/hands/`,
  MIT licence, text beside them), the same files Phantom GP uses.
- **Airfield layout**: Haneda's taxiway centre lines, stand lead-in lines, apron outlines, windsocks and
  holding positions (`site/assets/airfield/`, built by `tools/build_airfield.py`) are from OpenStreetMap
  (© OpenStreetMap contributors, ODbL 1.0), credited on the page. The light, sign and aerial models are original.
- **Music**: the bed under the film is synthesised in the browser (`site/js/fly/sound.js`); no recording is used.
- **Runway position**: the centre line of Haneda's runway 16L/34R is from OpenStreetMap (© OpenStreetMap
  contributors, ODbL), credited on the page. Its markings are drawn to the published ICAO pattern.
