import { afterEach, expect, it, vi } from 'vitest'
import { createDatasetLoader } from './dataset-loader'
import type { SourceState } from './types'

const collection = { type: 'FeatureCollection', features: [{
  type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { Object: 'Stop' },
}] }
afterEach(() => vi.unstubAllGlobals())

it('shares an in-flight source load and marks it ready only after installing the data', async () => {
  let finish!: (response: Response) => void
  const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', fetchMock)
  const states: SourceState[] = []
  const install = vi.fn(() => expect(states.at(-1)?.state).toBe('loading'))
  const loader = createDatasetLoader((_, state) => states.push(state))
  const first = loader.loadTransport('poi', install)
  const second = loader.loadTransport('poi', install)
  expect(first).toBe(second)
  finish(Response.json(collection))
  await first
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(install).toHaveBeenCalledTimes(1)
  expect(states.map(state => state.state)).toEqual(['loading', 'ready'])
  await loader.loadTransport('poi', install)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('reports empty optional data after installing the empty collection', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ type: 'FeatureCollection', features: [] })))
  const onState = vi.fn()
  const install = vi.fn()
  const loader = createDatasetLoader(onState)
  await loader.loadTransport('route', install)
  expect(install).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] })
  expect(onState).toHaveBeenLastCalledWith('route', { state: 'empty' })
})

it('allows a failed request to be retried without keeping its error state', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json(collection))
  vi.stubGlobal('fetch', fetchMock)
  const states: SourceState[] = []
  const loader = createDatasetLoader((_, state) => states.push(state))
  await expect(loader.loadTransport('poi', () => {})).rejects.toThrow('HTTP 503')
  await loader.loadTransport('poi', () => {})
  expect(states.map(state => state.state)).toEqual(['loading', 'error', 'loading', 'ready'])
})

it('reports installation failures as source errors rather than ready data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(collection)))
  const onState = vi.fn()
  const loader = createDatasetLoader(onState)
  await expect(loader.loadTransport('poi', () => { throw new Error('install failed') })).rejects.toThrow('install failed')
  expect(onState).toHaveBeenLastCalledWith('poi', { state: 'error', error: 'install failed' })
})

it('does not install late data or publish state after the map lifetime ends', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  const onState = vi.fn()
  const install = vi.fn()
  const loader = createDatasetLoader(onState)
  const pending = loader.loadTransport('poi', install)
  loader.dispose()
  finish(Response.json(collection))
  await pending
  expect(install).not.toHaveBeenCalled()
  expect(onState).toHaveBeenCalledTimes(1)
  expect(onState).toHaveBeenCalledWith('poi', { state: 'loading' })
})
