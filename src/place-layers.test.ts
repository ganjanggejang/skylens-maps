import { describe, expect, it } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { addSubwayPlaceLayers, setGroupVisibility } from './layers'

describe('subway place icon', () => {
  it('reuses the station image and leaves one icon visible when the route layer is toggled', () => {
    const layers = new Map<string, { layout: Record<string, unknown> }>()
    const map = {
      addLayer(layer: { id: string; layout: Record<string, unknown> }) { layers.set(layer.id, layer) },
      getLayer(id: string) { return layers.get(id) },
      setLayoutProperty(id: string, property: string, value: unknown) {
        layers.get(id)!.layout[property] = value
      },
    } as unknown as MapLibreMap

    addSubwayPlaceLayers(map, 12)
    layers.set('transport-subway-poi', { layout: { visibility: 'none', 'icon-image': 'subway-station' } })
    expect(layers.get('place-subway-label')?.layout['icon-image']).toBe('subway-station')
    setGroupVisibility(map, 'subway', true)
    expect(layers.get('place-subway-label')?.layout['icon-image']).toBe('')
    expect(layers.get('transport-subway-poi')?.layout.visibility).toBe('visible')
    setGroupVisibility(map, 'subway', false)
    expect(layers.get('place-subway-label')?.layout['icon-image']).toBe('subway-station')
    expect(layers.get('transport-subway-poi')?.layout.visibility).toBe('none')
  })
})
