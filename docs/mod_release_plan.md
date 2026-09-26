# Mod integration and release record

This document records the completed Cities: Skylines II mod and release workflow. The browser app is described in [implementation.md](implementation.md).

## Game integration

- `mod/CityMap/` uses the official Cities: Skylines II `IMod`, `ModSetting`, and Modding Toolchain. The Options page exposes **LAUNCH SKYLENS MAPS**, **Reopen map**, and a read-only status row.
- Launch calls the installed Carto mod from the game thread. The adapter requests the available systems, vector geometries, properties, and rasters for that export without changing the player's saved Carto options. It checks the export result and required files.
- Carto writes to a unique staging directory. `SnapshotBuilder` validates the seven core GeoJSON files, copies Carto source files and QML styles, hashes the files, creates the manifest and water mask, and publishes an immutable snapshot. It writes `manifest.json` last as the completion marker. Missing or invalid core raw files prevent publication; a water-mask failure is a recorded warning.
- The game mod keeps the browser app in its package and serves it with the published snapshots over a random `127.0.0.1` port. A random session path, loopback Host and origin checks, path restrictions, and resource isolation headers limit access. `session.json` points the app at its snapshot. Earlier tabs retain their snapshot while the game session is active.
- Leaving or loading a city clears the current selection and invalidates pending work. Reopen uses the latest snapshot for the loaded city. The listener closes when the mod is disposed. Old staging and incomplete folders are cleaned up; completed older snapshots are pruned to the newest ten and a 5 GiB budget while the newest is retained. Snapshots served in the current session are preserved.

## Packaging and publication

- [PublishConfiguration.xml](../mod/CityMap/Properties/PublishConfiguration.xml) records SKYLENS MAPS mod ID `160718`, version `0.1.3`, Cities: Skylines II `1.6.*`, public access, and Carto dependency ID `87428`. The official Toolchain project builds the browser bundle and includes it under `web/`.
- `python scripts/package-release.py` regenerates runtime license notices, builds the C# project in Release configuration, audits the staged mod, and creates `artifacts/release/SkylensMaps-<version>.zip` plus a SHA-256 file. The package contains `SOURCE.zip` with the corresponding 0.1.3 project source; this keeps the published GPLv3 source available before repository changes are committed. The audit checks required DLLs, native UI binaries, web workers, release notes, the GPLv3 license and copyright/source notice, dependency licenses, source archive, and browser assets. It rejects loose development files, city exports, snapshots, and a bundled Carto DLL.
- Release ZIPs and checksums are generated under the ignored `artifacts/release/` directory. The publication settings and update profile are checked in, and the mod is distributed on Paradox Mods. Carto is installed separately by players.

## Recorded verification

The C# snapshot builder and JavaScript preparation were compared against the same local export. They produced the same dataset ID, seven GeoJSON counts and hashes, 50 raster and style hashes, and water pixel count. All 57 copied files matched their source hashes; decoded water-mask pixels matched exactly. A separately extracted Release ZIP passed the local HTTP route check. Its 15 installed files matched the Release stage by SHA-256, and an in-game run produced a snapshot with all seven GeoJSON files, four GeoTIFFs, and a water mask. The map opened in the browser, and search, water, transit, and directions were exercised in-game.

The repository does not record a test on a machine without development tools. The published package contains the prebuilt browser app, and players do not need Node.js.
