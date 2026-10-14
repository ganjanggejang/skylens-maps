import { afterEach, describe, expect, it, vi } from 'vitest'
import { inferLandUseAreas } from './land-use-worker-client'
import { emptyCommercialAreas } from './commercial'
import type { BuildingData, NetworkData } from './types'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage?: (event: MessageEvent) => void
  onerror?: (event: ErrorEvent) => void
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    FakeWorker.instances.push(this)
  }
  receive(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}
const buildings: BuildingData = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { Category: 'Property', Zoning: 'Commercial', Name: 'Unneeded', Resident: 0 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0.001, 0],
            [0.001, 0.001],
            [0, 0.001],
            [0, 0],
          ],
        ],
      },
    },
  ],
}
const network: NetworkData = {
  type: 'FeatureCollection',
  features: ['Road, Track', 'Road', 'Pathway'].map((Object, id) => ({
    type: 'Feature',
    properties: { Object, Form: id === 1 ? 'Tunnel' : 'Normal', Width: 10, Name: 'Unneeded' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0.001, 0],
      ],
    },
  })),
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  FakeWorker.instances = []
})

describe('land use worker lifecycle', () => {
  it('publishes independent results and stops only after completion', () => {
    vi.stubGlobal('Worker', FakeWorker)
    const consume = vi.fn(),
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    inferLandUseAreas(buildings, network, consume)
    const worker = FakeWorker.instances[0]
    worker.receive({ error: 'parks: failed' })
    expect(warn).toHaveBeenCalled()
    worker.receive({ commercial: emptyCommercialAreas() })
    expect(consume).toHaveBeenCalledOnce()
    expect(worker.terminate).not.toHaveBeenCalled()
    worker.receive({ done: true })
    expect(worker.terminate).toHaveBeenCalledOnce()
    worker.receive({ commercial: emptyCommercialAreas() })
    expect(consume).toHaveBeenCalledOnce()
  })
  it('ignores late results after disposal and sends only required inference data', () => {
    vi.stubGlobal('Worker', FakeWorker)
    const consume = vi.fn(),
      cancel = inferLandUseAreas(buildings, network, consume)
    const worker = FakeWorker.instances[0]
    const message = worker.postMessage.mock.calls[0][0]
    expect(message.buildings.features[0].properties).toEqual({
      Category: 'Property',
      Zoning: 'Commercial',
    })
    expect(message.network.features).toHaveLength(1)
    expect(message.network.features[0].properties).toEqual({
      Object: 'Road, Track',
      Form: 'Normal',
      Width: 10,
    })
    cancel()
    worker.receive({ commercial: emptyCommercialAreas() })
    expect(consume).not.toHaveBeenCalled()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it('keeps the map usable when worker startup fails or no land use candidates exist', () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Unavailable')
        }
      },
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consume = vi.fn()
    expect(() => inferLandUseAreas(buildings, network, consume)()).not.toThrow()
    expect(consume).not.toHaveBeenCalled()
    vi.stubGlobal('Worker', FakeWorker)
    inferLandUseAreas({ type: 'FeatureCollection', features: [] }, network, consume)
    expect(FakeWorker.instances).toHaveLength(0)
  })
})
