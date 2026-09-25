# City Map mod: stages 1–4

The project uses the official Cities: Skylines II `IMod`, `ModSetting`, and
Modding Toolchain. In a loaded city, open **Options > SKYLENS MAPS > Main > LAUNCH
SKYLENS MAPS**. Carto exports on the game thread. File validation, copying,
hashing, and water-mask conversion then run on a worker.

## Installed environment, 2026-09-25

- Game: `1.6.2f1 (767.21d1) [6300.26419]`.
- Carto DLL: `1.0.17`, Paradox Mods cache package `87428_34`.
- The Toolchain postprocessor requests .NET 6, while this machine has .NET 8/9/10.
  In PowerShell use `$env:DOTNET_ROLL_FORWARD='Major'; dotnet build
  mod\CityMap\CityMap.csproj` to build and install the local mod.

## Carto export contract

City Map calls `Carto.Settings.GetOptions()` through the installed Carto assembly,
then changes only `CustomDirectory`, `CompletionDialog`, and `CompletionSound`
for this job. It does not change the user's saved Carto settings. With the
currently observed settings, Carto must write all of these files:

- GeoJSON: `Area_Boundary.json`, `Building_Boundary.json`,
  `Network_Boundary.json`, `Network_Centerline.json`, `POI_Location.json`,
  `Route_Centerline.json`, `Zoning_Boundary.json`.
- GeoTIFF: `Depth.tif`, `Elevation.tif`, `WorldDepth.tif`,
  `WorldElevation.tif`.

The adapter checks both `ExportResult.FilesWritten` and the actual files. If
Carto settings no longer produce exactly this set, it reports missing or extra
names and does not publish an incomplete snapshot. QML styles are copied from Carto's
`ModsData/Carto/Styles` directory.

## Snapshot contract

Carto writes to a unique `ModsData/CityMap/staging/<job-id>/` directory. The
builder validates the seven GeoJSON collections, copies all eleven source
files byte-for-byte, and copies the QML styles. The published snapshot retains
Carto's `GeoJSON/`, `GeoTIFF/`, `Styles/Plan`, `Styles/Street`, and `Styles/Topo`
folders. The web app reads GeoJSON from that structure. The snapshot also
contains `manifest.json` and a derived
`water-mask.png`.

The manifest records feature counts, byte sizes, SHA-256 hashes, bounds, and
`Object` counts for GeoJSON; it records source-file hashes under `cartoFiles`.
All eleven raw data files are required. Valid empty GeoJSON collections are
accepted. Invalid or missing raw files stop publication. A water-mask
conversion failure is recorded as a warning; the raw `Depth.tif` remains in
the snapshot. The private bundle is moved into
`ModsData/CityMap/snapshots/<datasetId>/`, its Carto folders are restored, and
`manifest.json` is written last as the completion marker.

The C# and JS preparation paths were compared using `exported_files`. They
produced the same dataset ID, seven GeoJSON counts and hashes, 50 Carto raster
and style hashes, and 1,652,215 water pixels. All 57 copied files in the C#
snapshot matched their source SHA-256 hashes. Decoded water-mask pixels matched
exactly; UTM inverse coordinates differed by less than 0.000000001 degrees.
The full-output version still needs an in-game run.

Files from two separate export runs need not have identical hashes if the city
changes between runs. City Map's snapshot copies the bytes from its own Carto
export without rewriting the raw files.

## Browser connection (stage 3)

`npm run build:app` builds the app with relative asset URLs and no development
data. The normal Modding Toolchain build runs that command and copies `dist/`
into the mod's `web/` directory. The user's machine does not need Node or Vite.

After a snapshot is published, City Map starts an HTTP listener on a random
`127.0.0.1` port and opens the default browser. The URL contains a random
session path. `session.json` tells the app which immutable snapshot URL to read;
the app displays its dataset ID and preparation time. Only the packaged app
and snapshots published during the current game session are served. Existing
tabs keep reading their original snapshots after another export. The listener
closes when the mod is disposed. If browser launch fails, the Options
status shows a URL that can be opened manually.

The development workflow still uses `npm run dev` and `public/data`.

## In-game controls and lifecycle (stage 4)

The Options page offers **LAUNCH SKYLENS MAPS**, **Reopen map**, and a read-only
**Status** row. Launch exports a new snapshot and opens the map in the browser.
Reopen opens the latest snapshot for the loaded city without another export.
Status shows a small rotating symbol while launch is queued or snapshot data is
being prepared. Carto's export runs synchronously on the game thread, so the
symbol cannot animate during Carto's own export call.

Loading or leaving a city clears the current map selection and invalidates any
preparation still in progress. A late result cannot become the new city's map.
Previously opened tabs can continue reading snapshots published in that game
session. On mod disposal, the listener closes. Port selection retries a collision
up to ten times. The server requires the random session path and loopback Host,
rejects foreign Origin / Fetch-Site requests, and sends frame and resource
isolation headers.

Carto staging folders are deleted after each preparation attempt. On mod load,
staging and incomplete snapshot folders older than one day are removed. Completed
snapshots from previous sessions keep the newest ten up to 5 GiB, always
retaining the newest one; this cleanup finishes before new snapshot preparation.
Snapshots served in the current session are never pruned.

The official Toolchain build includes the browser app bundle under `web/`.
The Options controls and status were verified in-game on 2026-09-25.

Stage 3 passed the official Toolchain build and HTTP route checks. On
2026-09-25, the installed mod also completed an in-game export and opened the
map in the default browser. Unity exposed an invalid `Assembly.Location` path
in that run, so the web root now resolves from the local mod installation
first and falls back to assembly paths for other packaging layouts.

Carto source references: [Options](https://github.com/taipei-native/Carto/blob/main/IO/Options.cs),
[Settings](https://github.com/taipei-native/Carto/blob/main/Settings.cs),
[Export](https://github.com/taipei-native/Carto/blob/main/IO/IO.cs).
