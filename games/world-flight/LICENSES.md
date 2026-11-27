# Sources and their terms

World Flight stores none of the world. The page asks these services directly as it runs, and shows this credit line
on the title, the globe and in the menu (`CREDITS` in `site/js/net.js`).

| What | Source | Terms | Note |
|---|---|---|---|
| Ground and globe photographs | Esri World Imagery (`server.arcgisonline.com`) | Esri Master License Agreement; attribution required | **Read before publishing.** The tiles answer without a key and are widely used that way, but I could not confirm that an unkeyed public site is within Esri's terms. Esri's developer pages ask for "Powered by Esri" and the data providers' names to be shown, and offer a free developer account with a key. If it has to change, it is one address in `net.js`. Alternatives checked: EOX Sentinel-2 cloudless 2016 (CC BY 4.0, 10 m a pixel: soft below 2,000 m), USGS imagery (public domain, United States only) |
| Ground heights | Terrain Tiles on AWS Open Data ("terrarium", from Mapzen) | Open; attribution to the underlying sets (SRTM, GMTED, GEBCO, national surveys) | |
| Water, buildings, names | OpenFreeMap vector tiles (OpenMapTiles layout) of OpenStreetMap | OpenStreetMap: ODbL. OpenMapTiles: CC BY 4.0. OpenFreeMap's public server: free, no key, no limit stated | Credit: "OpenFreeMap © OpenMapTiles, data from OpenStreetMap" |
| Airports and runways | OurAirports (`ourairports.com`) | Public domain | Cut down by `tools/build_airports.py` into `site/data/airports.json` |
| Live weather | Open-Meteo | CC BY 4.0, free for non-commercial use | |
| Airport weather reports | NOAA Aviation Weather Center | Public domain | Only through `serve.py` here; a published copy needs a small route of its own or does without them |
| Clouds on the globe | NASA GIBS, VIIRS (NOAA-20) corrected reflectance | Public domain; NASA asks to be credited | Credited as "NASA EOSDIS GIBS" |
| City lights on the globe | NASA GIBS, VIIRS Black Marble 2016 | Public domain; NASA asks to be credited | Same |
| Place search | Open-Meteo geocoding (GeoNames data) | CC BY 4.0 | What is typed in the search box is sent to it |
| three.js | `site/vendor/` | MIT | |

The two aircraft are John Gresh's own models (`Desktop/katy_studio`, `Desktop/ad1_studio`). NASA's insignia are left
off the AD-1. The name "NASA AD-1" and the registration N805NA describe the real aircraft.
