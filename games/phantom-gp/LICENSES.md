# Licences and attribution

## Data

**LiDAR terrain (heights, banking, tree and building heights)**
Service public de Wallonie (SPW) — Relief de la Wallonie — Modèle Numérique de Terrain (MNT) 2021-2022, and the
matching surface model (MNS) 2021-2022. Licence: CC BY 4.0. The data was resampled, smoothed and merged with a road
model (modifications must be stated when reusing it).
https://geoportail.wallonie.be/catalogue/a004e570-99d6-4fe5-b83d-49b774409278.html

**Orthophotos (`assets/near_ortho.jpg`, `assets/far_ortho.jpg`, and the masks derived from them)**
© Service public de Wallonie (SPW) — Orthophotos 2023 Été and its infrared version; the 2024 orthophoto was used
only for edge tracing. Licence: CC BY 4.0, as stated in SPW's metadata catalogue for the dataset "Orthophotos 2023
Été" (record ad55c2ce-62ad-4c3c-b3cf-8fbc270a6b6e, checked 15 Nov 2026): the data may be used, modified and
published, and so may works derived from it, if the source is cited. The images were read from SPW's public
*viewing* web service, which has its own conditions of use ("Conditions d'accès et d'utilisation des services web
géographiques de visualisation", LicServicesSPW.pdf); those cover how the service may be called and have not been
read in full. The near photo was modified (resampled, baked shadows lifted near the circuit).
https://metawal.wallonie.be/geonetwork/srv/fre/catalog.search#/metadata/ad55c2ce-62ad-4c3c-b3cf-8fbc270a6b6e

**Map data (centreline, buildings, barriers, gravel traps)**
© OpenStreetMap contributors, Open Database License (ODbL) 1.0. https://www.openstreetmap.org/copyright
The files in `assets/` derived from it (`track.bin`, `buildings.json`, `barriers.json`) are a derivative database
under the same licence.

## Code

- three.js r186 and its add-ons in `vendor/` — MIT (see `vendor/LICENSE-three.txt`).
- Hand meshes in `vendor/hands/` — WebXR Input Profiles "generic-hand", © 2019 Amazon, MIT
  (see `vendor/hands/LICENSE-webxr-input-profiles.md`).
- Everything else in `js/` was written for this project. All detail textures are generated on canvas.

## Music and sound

The score is **"Vanguard" by Scott Buckley**, released under Creative Commons Attribution 4.0 International
(CC BY 4.0), from the composer's own library: https://www.scottbuckley.com.au/library/vanguard/
Attribution, in the composer's format: 'Vanguard' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au

Changes made (CC BY asks that they be stated): the piece is cut and joined to fit the opening film
(`assets/audio/film.mp3`) and looped for the race (`assets/audio/race.mp3`); a camera-shutter sound on each still
and a sub-bass layer under two hits are added; the level is raised through a limiter. `tools/build_score.py` does
all of it from the original MP3, which is not kept in this folder. The credit is shown on the title screen.

Engine, tyre, impact and gear-change sounds are synthesised in the browser by `js/game/audio.js`.

## The car

The Phantom P-26 is an original design. Its number, its sponsors (Northwind, Kite, Ohm Labs) and the trackside
banner names are invented; no real team, series or company is shown.

## Names

"Spa-Francorchamps" and the corner names are used descriptively. No circuit, series or sponsor logos are reproduced.

## Free roam roads

`assets/roads.json`: road centrelines, names and classes from OpenStreetMap, © OpenStreetMap contributors, Open Database Licence (ODbL) 1.0. Extracted by `tools/build_roads.py`; the road surfaces themselves are fitted by the game.
