---
name: build-and-test-mod
description: >
  Build and verify the project after implementation changes at `/mod`.
  Use after completing code changes, or when asked to build,
  test, verify, validate, or check whether the project works.
---

## Build and test handoff

For changes that need verification in Cities: Skylines II, run the relevant automated checks and then create a complete installable ZIP with:

```powershell
npm.cmd run typecheck
npm.cmd run test
python scripts/package-release.py
```

`scripts/package-release.py` builds the Release mod and bundled web app with the official Modding Toolchain, audits the package, and writes `artifacts/release/SkylensMaps-<version>.zip` and its SHA-256 file. Confirm that the command succeeds before presenting the ZIP. Give the developer a clickable path to the ZIP and report which checks passed. A Vite development build or a test against `exported_files/` does not count as an in-game test.

The developer performs the installation and game test manually. Do not copy files into the game's `Mods` directory, launch the game, or publish the mod as part of this build and test handoff unless the developer explicitly asks you to do so.

## Instructions to give the developer

1. Close Cities: Skylines II. Keep Carto enabled. If the Paradox Mods version of SKYLENS MAPS is active, disable it in the playset during the manual test to avoid loading two copies.
2. Move any existing `CityMap` folder out of `%USERPROFILE%\AppData\LocalLow\Colossal Order\Cities Skylines II\Mods\` as a backup.
3. Extract the ZIP and copy its **`CityMap` folder** into that `Mods` directory. The ZIP itself is not the installed mod. Check that `Mods\CityMap\CityMap.dll` and `Mods\CityMap\web\index.html` exist, without an extra nested `CityMap` directory.
4. Start the game, load a city, and choose **Options > SKYLENS MAPS > Main > LAUNCH SKYLENS MAPS**. Check the changed behavior in the browser map using a fresh export.

Until the developer reports the result of step 4, describe the package as built and ready for manual game testing, not as verified in-game. If the test fails, ask for the observed behavior and the relevant game log or snapshot details before changing the implementation.