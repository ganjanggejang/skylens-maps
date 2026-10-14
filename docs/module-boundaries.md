# Source module boundaries

Run `npm run check:deps` to validate imports without preparing city data. `npm run lint` runs ESLint and the same dependency check, and the PR lint job runs this command. `npm test` includes the checker fixtures.

Rules live in [.dependency-cruiser.cjs](../.dependency-cruiser.cjs). Use [scripts/check-dependencies.mjs](../scripts/check-dependencies.mjs) for the complete runtime and type checks.

## Allowed project dependencies

Each module may use its own files and the dependencies below. External packages are also subject to package declaration, runtime/dev-dependency and algorithm/framework rules.

| Source | Allowed other project modules |
| --- | --- |
| `data` | None |
| `layer` | `data`, `i18n` |
| `search` | `data`, `i18n` |
| Routing algorithms and workers | Non-React `data` and routing core files |
| Routing UI/adapters | `data`, `search`, `i18n` and routing files |
| `map` | `data`, `layer`, `routing` |
| `sidebar` | `data`, `search`, `routing`, `i18n` |
| `i18n` | None |
| `main`, `App`, `MapView` | Modules needed to compose the app |

Feature modules cannot import `main`, `App` or `MapView`. Imports, re-exports, dynamic imports and erased type references follow the same module boundaries.

The routing adapter list is explicit: `Directions.tsx`, `useDirections.ts`, `directions-model.ts`, `directions-layers.ts`, `worker-client.ts`. Other routing source files are core by default. Algorithms and worker contracts cannot reach these adapters, UI modules, React, React types, MapLibre or MapLibre types, even through an intermediate helper.

`data/useCityDataset.ts` is the React adapter. Other data files cannot reach this hook or React. Session loading may use browser APIs; this rule concerns React and feature dependencies.

For example, `layer/LayerControls.tsx -> data/types.ts` is valid. `routing/network.ts -> layer/network-objects.ts` and `routing/network.ts -> data/helper.ts -> data/useCityDataset.ts` are invalid.

## Runtime and type graphs

The runner makes two sequential dependency-cruiser passes:

- The full graph includes type references and validates boundaries, unresolved imports and package declarations. Cycles with erased type edges emit `no-type-circular` warnings.
- The runtime graph excludes erased TypeScript dependencies. Cycles emit `no-runtime-circular` errors.

Errors exit with code 1. Type-cycle warnings alone exit with code 0. Output names the violated rule and source/target files. Standalone dependency-cruiser CLI use defaults to the runtime graph; it does not replace `check:deps`.

Production files cannot import `.test.*` or `.spec.*` files. Test files may import subjects across feature boundaries and use declared dev dependencies. Production runtime imports of dev dependencies are errors; erased type references are permitted.

## Worker entries

dependency-cruiser does not extract the local `new Worker(new URL(..., import.meta.url))` connection. The runner scans all `src` files, including workers, so their own imports and transitive dependencies are checked independently.

A supplemental TypeScript AST check validates `Worker` and `SharedWorker` creation. The supported contract is a static URL relative to `import.meta.url`, targeting an existing `src/data/*.worker.ts` or `src/routing/*.worker.ts` file. These URL connections also obey module direction: data code cannot spawn a routing worker. Park area inference runs in a data worker and uses only data helpers.

Missing entries, UI entries and non-static worker URLs fail with `worker-entry-boundary`. Add an explicit supported contract and fixtures if a future feature needs another worker location or URL form.

## Changing the architecture

When adding a module or routing adapter, update the allowed directions and add a fixture showing intended dependencies. Prefer moving a misplaced shared model or helper over adding an exception for a single importing file.

[scripts/check-dependencies.test.mjs](../scripts/check-dependencies.test.mjs) creates temporary source trees under ignored `artifacts/dependency-fixtures/` and removes only directories it creates. It exercises allowed type imports, module violations, indirect UI/framework dependencies, runtime and type cycles, test/dev dependencies, worker contracts and CLI exit codes.
