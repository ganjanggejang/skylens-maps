# Web map implementation

This document records the implemented browser app and development data flow. Game integration and release packaging are documented in [mod_release_plan.md](mod_release_plan.md).

## Application and data

- The browser app is built with React, TypeScript, Vite, and MapLibre GL JS. It renders a local style without an external basemap or map API key.
- `src/MapView.tsx` loads the snapshot manifest, buildings, and network first; POIs and routes load after the initial map. Area data loads when its layer is requested. Each source has a visible loading, ready, empty, or error state.
- `src/place-labels.ts` ranks named buildings using category, asset frequency, footprint area, resident or employee count, and nearby building size. Building labels expand in three zoom stages relative to the city's overview zoom. Repeated low-priority names are omitted. Subway stations reuse the transit layer's station icon and show names independently of the route toggle; grouped stops share one label, and matching transport building labels are removed when station data loads. MapLibre collision placement limits visible names.
- `src/layers.ts` defines the base map and transit layers. Buildings, roads, railways, and water are on by default. Paths, waterways, districts, and transit modes have controls. Districts appear only when Carto provides district features; map tiles are not treated as districts.
- The map starts around the building area and constrains navigation to the exported extent. Coordinates are passed to MapLibre as longitude and latitude from Carto, without arbitrary rotation or reprojection. Alignment with the game view remains unvalidated.
- Source properties are preserved for details and search. Feature selection IDs include the dataset ID, source, and feature index, so they identify an item within one snapshot only.
- The interface supports English and Korean. Browser local storage remembers the selected language; exported names and addresses are displayed as supplied.

## Development preparation

`scripts/prepare-data.mjs` reads `exported_files/` and writes ignored files under `public/data/`. It validates seven GeoJSON FeatureCollections, expected geometry types, object properties, and finite coordinates. It records feature counts, bounds, byte sizes, SHA-256 hashes, and `Object` distributions in `manifest.json`. It also copies Carto rasters and styles, computes a dataset ID from source hashes, and invokes `scripts/prepare-water.mjs` to convert `Depth.tif` to `water-mask.png`. Raw inputs are copied without modification. A mask conversion error is recorded in the manifest so the rest of the map can load.

`npm run dev` and `npm run build` call this preparation step automatically. `npm run build:app` produces relative browser assets for the installed mod without embedding a development export. In the mod, the equivalent C# snapshot preparation is described in [mod_release_plan.md](mod_release_plan.md).

## Interaction and routing

- `src/Search.tsx` and `src/search-model.ts` search names, brands, addresses, roads, POIs, and routes. A result centers the map and opens its details. Selecting a transit route focuses it and lists nearby stops in estimated order. Transport facilities show nearby route candidates.
- `src/Directions.tsx` provides origin and destination selection and switches between driving and transit results. Routing calculations run in a web worker. Driving follows road centerlines, honors one-way direction, and estimates travel time from 80% of the road speed limit plus walking access at 4.5 km/h.
- Transit routing uses exported passenger routes and stops. Stops within 50 m of a route are projected onto its geometry; the exported `Stop` count limits candidates. Access walks are limited to 1 km, transfer walks to 300 m, and trips to two transfers. The estimate includes five minutes of average wait per boarding and two additional minutes per transfer. The displayed path uses route geometry and walking segments.
- Carto does not provide road turn restrictions, route-stop identifiers, stop order, transit direction, timetable, or live arrival data. Building entrances and short walking links are inferred. Directions and transit relationships therefore remain estimates.

## Verification recorded in the repository

`npm run typecheck`, `npm run test`, and `npm run build` are the web checks. Routing tests cover road direction and connections, transit stops and transfers, waiting time, and displayed geometry. `scripts/inspect-routing.mjs` diagnoses the current export without changing it. The production browser assets are also audited by `scripts/package-release.py` during packaging.
