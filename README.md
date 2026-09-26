# SKYLENS MAPS

SKYLENS MAPS opens your city map with ONE CLICK.

Add to Paradox Mods Playlists: https://mods.paradoxplaza.com/mods/160718/Windows 

## Install and use

1. On Cities: Skylines II 1.6.x, add [Carto](https://mods.paradoxplaza.com/mods/87428/Windows) and [SKYLENS MAPS](https://mods.paradoxplaza.com/mods/160718/Windows) to the same playset and enable both.
2. Load a city. Open **Options → SKYLENS MAPS → Main → LAUNCH SKYLENS MAPS**.
3. Wait for Carto to export the city and for the browser to open automatically. **Reopen map** opens the latest map for the loaded city without another export.

The local map server runs only while the game and mod are running. Existing browser tabs stop loading map data after the game closes. Each export creates a snapshot under the game's `ModsData/CityMap/snapshots/` directory. The mod download does not include Carto or your city data.

## Map features

- Browse buildings, roads, railways, and water; optionally show paths, waterways, districts when present, and transit layers.
- Click a building, road, route, or transit stop to inspect its exported details. Select a transit route to see nearby stops; select a transport facility to see nearby route candidates.
- Search building names, brands, addresses, roads, POIs, and routes. Results can be used as an origin or destination.
- Compare estimated driving and public transit routes. Driving follows exported road centerlines and one-way direction. Transit uses passenger routes, nearby stops, walking links, and up to two transfers.
- Switch the interface between English and Korean. The choice is stored in the browser; names and addresses from Carto remain in their original language.

Directions are estimates, not the game's route planner. The export does not provide turn restrictions, stop-to-route IDs, exact stop order, schedules, or service direction. Transit links and waiting times are inferred, and transit routes are treated as bidirectional. Map orientation and distance accuracy have not been validated against the game view. Large exports can briefly pause the game, and water is unavailable if depth-mask generation fails. See [release notes](mod/CityMap/RELEASE_NOTES.md) for player-facing limitations and troubleshooting.

## Develop locally

The web app uses React, TypeScript, Vite, and MapLibre GL JS. Development requires Node.js 20.19 or newer, the dependencies in `package-lock.json`, and a local Carto export in `exported_files/`. The development preparation script requires the seven GeoJSON files (`Area_Boundary`, `Building_Boundary`, `Network_Boundary`, `Network_Centerline`, `POI_Location`, `Route_Centerline`, and `Zoning_Boundary`, each with `.json`), four GeoTIFFs (`Depth`, `Elevation`, `WorldDepth`, and `WorldElevation`, each with `.tif`), and the exported `Styles/` directory. The in-game mod performs its own export and does not need these files in the repository.

```powershell
npm ci
npm run dev
```

Open <http://localhost:3000>. The `predev` script validates and copies the local export into ignored `public/data/`, creates a manifest, and derives the water mask. Port 3000 is fixed in development. Useful checks:

```powershell
npm run typecheck
npm run test
npm run build
```

`npm run build` also prepares development data. `npm run build:app` builds only the browser bundle for the mod. Building the C# mod requires the installed game and its official Modding Toolchain; the project is [mod/CityMap/CityMap.csproj](mod/CityMap/CityMap.csproj). The [implementation record](docs/implementation.md) describes the web app and data contracts, and the [mod release record](docs/mod_release_plan.md) describes the completed game integration and packaging.

## Contribute and report issues

Issues and proposed changes are welcome through [GitHub Issues](https://github.com/ganjanggejang/skylens-maps/issues) and pull requests. Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting code, documentation, or artwork. Include reproduction steps, game/Carto/SKYLENS MAPS versions, the Options status, and relevant logs when reporting a bug. Do not post exported city snapshots or other private game data in a public issue.

The original SKYLENS MAPS code, documentation, and artwork are licensed under the **GNU General Public License v3.0 only** ([GPL-3.0-only](LICENSE.txt)); see the [copyright notice](COPYRIGHT.txt). Contributions are submitted under the same license. Third-party components retain their own terms in [THIRD_PARTY_NOTICES.txt](mod/CityMap/Properties/THIRD_PARTY_NOTICES.txt). Carto is a separate mod, and your exported city data is not part of this license grant.
