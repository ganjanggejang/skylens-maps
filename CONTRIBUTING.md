# Contributing to SKYLENS MAPS

Bug reports, documentation corrections, and proposed code changes are welcome. Check existing [issues](https://github.com/ganjanggejang/skylens-maps/issues) before opening a new one. For a substantial change, describe the proposed behavior and data contract in an issue first so maintainers can discuss its scope.

## Report a bug

Include the steps to reproduce, the expected and actual result, your Cities: Skylines II, Carto, and SKYLENS MAPS versions, and the status shown under **Options → SKYLENS MAPS**. Relevant logs are in `%USERPROFILE%\AppData\LocalLow\Colossal Order\Cities Skylines II\Logs\` (`CityMap` and `Player.log`). Remove personal details before attaching logs. Do not upload `ModsData/CityMap/snapshots/` or `exported_files/` to a public issue; these contain your city data.

## Submit a change

1. Keep the pull request focused and explain the user-visible behavior and any changes to Carto data handling.
2. For web changes, use Node.js 20.19 or newer, run `npm ci`, then `npm run lint`, `npm run typecheck`, and `npm run test`. `npm run build` also requires a local Carto export in `exported_files/` and prepares ignored `public/data/`.
3. For mod changes, run `./scripts/lint-mod.ps1` in PowerShell. It checks formatting with `dotnet format` and compiles the C# code with Roslyn analyzer warnings treated as errors. It requires the installed game assemblies. Then build with the installed game and official Modding Toolchain. If packaging changes, run `python scripts/package-release.py` and review its audit and output. Describe any in-game verification you performed.
4. Do not commit exported city data, generated snapshots, `public/data/`, `dist/`, or `artifacts/`. Update the README and the relevant document under `docs/` when behavior or release steps change.

Pull requests automatically run web ESLint and C# whitespace formatting on GitHub-hosted runners. The full `./scripts/lint-mod.ps1` check also runs Roslyn analyzers and requires the locally installed game assemblies, so run it before submitting a mod change.

## License and rights

Original SKYLENS MAPS code, documentation, and artwork are licensed under [GPL-3.0-only](LICENSE.txt); see [COPYRIGHT.txt](COPYRIGHT.txt) for scope. By submitting a pull request, you agree that your contribution is licensed under GPL-3.0-only and confirm that you have the right to submit it. Keep existing copyright and license notices. Identify any third-party material and its license in the pull request; do not add material whose terms conflict with GPLv3. Carto and bundled dependencies retain their own terms, and exported city data is not part of the project license.
