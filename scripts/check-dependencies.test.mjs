import { afterEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { checkDependencies, reportDependencies } from './check-dependencies.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const fixtureBase = resolve(projectRoot, 'artifacts/dependency-fixtures')
let fixtureRoot

afterEach(async () => {
  if (!fixtureRoot) return
  // Only remove the uniquely created fixture directory within this workspace.
  if (dirname(fixtureRoot) !== fixtureBase || !basename(fixtureRoot).startsWith('case-')) {
    throw new Error('Refusing to remove a directory outside the dependency fixtures')
  }
  await rm(fixtureRoot, { recursive: true, force: true })
  fixtureRoot = undefined
})

async function inspect(files) {
  await mkdir(fixtureBase, { recursive: true })
  fixtureRoot = await mkdtemp(resolve(fixtureBase, 'case-'))
  const entries = { 'tsconfig.json': JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx' },
  }), ...files }
  for (const [name, body] of Object.entries(entries)) {
    const path = resolve(fixtureRoot, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)
  }
  return checkDependencies(fixtureRoot)
}

const errors = result => result.violations.filter(violation => violation.rule.severity === 'error')
const named = (result, name) => result.violations.filter(violation => violation.rule.name === name)

it('allows shared data types and UI composition, including Vite worker URLs', async () => {
  const result = await inspect({
    'src/data/types.ts': 'export type SourceState = { state: string }',
    'src/data/place.ts': 'export type PlaceEntry = { id: string }',
    'src/data/useCityDataset.ts': "import { useState } from 'react'; export const useCityDataset = () => useState(null)",
    'src/i18n.tsx': "import { createContext } from 'react'; export const context = createContext(null); export type Language = 'en'",
    'src/layer/LayerControls.tsx': "import type { SourceState } from '../data/types'; export type Props = SourceState",
    'src/search/SearchInput.tsx': "import type { PlaceEntry } from '../data/place'; export const SearchInput = (entry: PlaceEntry) => entry",
    'src/routing/Directions.tsx': "export { SearchInput } from '../search/SearchInput'",
    'src/routing/useDirections.ts': "import { useState } from 'react'; export const useDirections = () => useState(null)",
    'src/routing/network.ts': "import type { PlaceEntry } from '../data/place'; export type Place = PlaceEntry",
    'src/routing/routing.worker.ts': "export type { Place } from './network'",
    'src/routing/worker-client.ts': "export const worker = new Worker(new URL('./routing.worker.ts', import.meta.url))",
    'src/map/createCityMap.ts': "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'; export { workerUrl }",
    'src/map/useCityMap.ts': "export { useCityDataset } from '../data/useCityDataset'; export type { useDirections } from '../routing/useDirections'",
    'src/sidebar/Sidebar.tsx': "export { SearchInput } from '../routing/Directions'",
    'src/MapView.tsx': "export { Sidebar } from './sidebar/Sidebar'; export { useCityMap } from './map/useCityMap'",
  })
  expect(errors(result)).toEqual([])
  const worker = result.fullGraph.modules.find(module => module.source === 'src/routing/routing.worker.ts')
  expect(worker).toBeDefined()
})

it.each([
  ['data-boundary', 'src/data/bad.ts', '../layer/value', 'src/layer/value.ts'],
  ['layer-boundary', 'src/layer/bad.ts', '../routing/value', 'src/routing/value.ts'],
  ['search-boundary', 'src/search/bad.ts', '../map/value', 'src/map/value.ts'],
  ['routing-boundary', 'src/routing/useDirections.ts', '../sidebar/value', 'src/sidebar/value.ts'],
  ['map-boundary', 'src/map/bad.ts', '../sidebar/value', 'src/sidebar/value.ts'],
  ['sidebar-boundary', 'src/sidebar/bad.ts', '../map/value', 'src/map/value.ts'],
  ['i18n-boundary', 'src/i18n.tsx', './data/value', 'src/data/value.ts'],
])('rejects a type-only violation of %s', async (rule, from, target, to) => {
  const result = await inspect({
    [from]: "import type { Value } from '" + target + "'; export type Copy = Value",
    [to]: 'export type Value = string',
  })
  expect(named(result, rule)).toEqual(expect.arrayContaining([
    expect.objectContaining({ from, to, rule: expect.objectContaining({ severity: 'error' }) }),
  ]))
})

it('rejects feature dependencies on the application composition root', async () => {
  const result = await inspect({
    'src/search/bad.ts': "export { value } from '../MapView'",
    'src/MapView.tsx': 'export const value = 1',
  })
  expect(named(result, 'no-feature-to-composition').length).toBeGreaterThan(0)
})

it('rejects direct, re-exported and dynamic algorithm dependencies on UI', async () => {
  const result = await inspect({
    'src/routing/direct.ts': "import type { Props } from './Directions'; export type Copy = Props",
    'src/routing/reexport.ts': "export { value } from '../search/ui'",
    'src/routing/dynamic.ts': "export const load = () => import('../search/ui')",
    'src/routing/Directions.tsx': 'export type Props = string',
    'src/search/ui.ts': 'export const value = 1',
  })
  const sources = named(result, 'routing-core-no-ui').map(violation => violation.from)
  expect(sources).toEqual(expect.arrayContaining(['src/routing/direct.ts', 'src/routing/reexport.ts', 'src/routing/dynamic.ts']))
})

it('rejects algorithms reaching React through data helpers and a hook', async () => {
  const result = await inspect({
    'src/routing/network.ts': "export { useCityDataset } from '../data/helper'",
    'src/data/helper.ts': "export { useCityDataset } from './useCityDataset'",
    'src/data/useCityDataset.ts': "export { useState as useCityDataset } from 'react'",
  })
  expect(named(result, 'routing-core-no-ui')).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: 'src/routing/network.ts', to: 'src/data/useCityDataset.ts' }),
  ]))
  expect(named(result, 'routing-core-no-frameworks').length).toBeGreaterThan(0)
  expect(named(result, 'data-no-react').length).toBeGreaterThan(0)
})

it('rejects MapLibre type references in algorithm contracts', async () => {
  const result = await inspect({
    'src/routing/network.ts': "import type { Map } from 'maplibre-gl'; export type EngineMap = Map",
  })
  expect(named(result, 'routing-core-no-frameworks').length).toBeGreaterThan(0)
})

it('rejects runtime cycles', async () => {
  const result = await inspect({
    'src/data/a.ts': "import { b } from './b'; export const a = () => b()",
    'src/data/b.ts': "import { a } from './a'; export const b = () => a()",
  })
  expect(named(result, 'no-runtime-circular').length).toBeGreaterThan(0)
  expect(reportDependencies(result, { error: vi.fn(), warn: vi.fn(), log: vi.fn() })).toBe(1)
})

it('only warns on cycles that require erased type imports', async () => {
  const result = await inspect({
    'src/data/a.ts': "import type { B } from './b'; export type A = { b?: B }",
    'src/data/b.ts': "import type { A } from './a'; export type B = { a?: A }",
  })
  expect(errors(result)).toEqual([])
  expect(named(result, 'no-type-circular').length).toBeGreaterThan(0)
  expect(reportDependencies(result, { error: vi.fn(), warn: vi.fn(), log: vi.fn() })).toBe(0)
})

it('allows tests to use their subjects and dev dependencies, but forbids production imports of tests', async () => {
  const allowed = await inspect({
    'src/map/subject.ts': 'export const value = 1',
    'src/data/subject.test.ts': "import { expect } from 'vitest'; import { value } from '../map/subject'; expect(value).toBe(1)",
  })
  expect(errors(allowed)).toEqual([])
  await writeFile(resolve(fixtureRoot, 'src/map/subject.ts'), "export { value } from '../data/value.test'")
  await writeFile(resolve(fixtureRoot, 'src/data/value.test.ts'), 'export const value = 1')
  const forbidden = await checkDependencies(fixtureRoot)
  expect(named(forbidden, 'no-production-to-tests').length).toBeGreaterThan(0)
})

it('independently checks workers even though their URL edges are omitted by dependency-cruiser', async () => {
  const result = await inspect({
    'src/routing/worker-client.ts': "export const worker = new Worker(new URL('./routing.worker.ts', import.meta.url))",
    'src/routing/routing.worker.ts': "export { value } from '../search/ui'",
    'src/search/ui.ts': 'export const value = 1',
  })
  expect(named(result, 'worker-entry-boundary')).toEqual([])
  expect(named(result, 'routing-core-no-ui')).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: 'src/routing/routing.worker.ts', to: 'src/search/ui.ts' }),
  ]))
})

it.each([
  ["new Worker(new URL('../sidebar/Sidebar.ts', import.meta.url))", 'src/sidebar/Sidebar.ts'],
  ["new Worker(new URL('./missing.worker.ts', import.meta.url))", 'src/routing/missing.worker.ts'],
  ['new Worker(variableUrl)', '(non-static worker entry)'],
])('rejects unsafe or uninspectable worker entry: %s', async (expression, to) => {
  const result = await inspect({
    'src/routing/worker-client.ts': 'export const worker = ' + expression,
    'src/sidebar/Sidebar.ts': 'export const value = 1',
  })
  expect(named(result, 'worker-entry-boundary')).toEqual([
    expect.objectContaining({ from: 'src/routing/worker-client.ts', to }),
  ])
})

it('fails the CLI with an actionable rule name for an invalid fixture', async () => {
  await inspect({
    'src/data/bad.ts': "export { value } from '../layer/value'",
    'src/layer/value.ts': 'export const value = 1',
  })
  const result = spawnSync(process.execPath, [resolve(projectRoot, 'scripts/check-dependencies.mjs'), '--root', fixtureRoot],
    { cwd: projectRoot, encoding: 'utf8' })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('data-boundary: src/data/bad.ts -> src/layer/value.ts')
})

it('warns on a mixed runtime/type cycle without failing the runtime-only graph', async () => {
  const result = await inspect({
    'src/data/a.ts': "import type { B } from './b'; export const a = 1; export type A = B",
    'src/data/b.ts': "import { a } from './a'; export const b = a; export type B = number",
  })
  expect(errors(result)).toEqual([])
  expect(named(result, 'no-type-circular').length).toBeGreaterThan(0)
})

it('checks module direction for worker URL edges as well as static imports', async () => {
  const result = await inspect({
    'src/data/bad.ts': "export const worker = new Worker(new URL('../routing/routing.worker.ts', import.meta.url))",
    'src/routing/routing.worker.ts': 'export const value = 1',
  })
  expect(named(result, 'data-boundary')).toEqual([
    expect.objectContaining({ from: 'src/data/bad.ts', to: 'src/routing/routing.worker.ts' }),
  ])
})

it('rejects unresolved imports and runtime dev dependencies', async () => {
  const result = await inspect({
    'src/data/missing.ts': "export { value } from './not-found'",
    'src/data/runtime.ts': "export { expect } from 'vitest'",
  })
  expect(named(result, 'no-unresolved').length).toBeGreaterThan(0)
  expect(named(result, 'no-runtime-dev-deps').length).toBeGreaterThan(0)
})

it('returns zero from the CLI for a valid fixture', async () => {
  await inspect({ 'src/data/types.ts': 'export type Value = string' })
  const result = spawnSync(process.execPath, [resolve(projectRoot, 'scripts/check-dependencies.mjs'), '--root', fixtureRoot],
    { cwd: projectRoot, encoding: 'utf8' })
  expect(result.status).toBe(0)
  expect(result.stdout).toContain('0 errors, 0 warnings')
})

it('accepts the shared config in the native dependency-cruiser DOT CLI', () => {
  const result = spawnSync(process.execPath,
    [resolve(projectRoot, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs'),
      'src', '--include-only', '^src', '--config', '.dependency-cruiser.cjs', '--output-type', 'dot'],
    { cwd: projectRoot, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toMatch(/\bdigraph\b/)
})
