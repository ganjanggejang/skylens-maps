import { describe, expect, it } from 'vitest'
import type { FeatureCollection, LineString } from 'geojson'
import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl'
import { featureFilter } from '@maplibre/maplibre-gl-style-spec'
import { addBaseLayers } from './layers'
import { hasNetworkObject, prepareNetworkObjects } from './network-objects'

function network(...objects: string[]): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: objects.map(Object => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0]] },
    properties: { Object },
  })) }
}

describe('Carto network Object labels', () => {
  it('indexes every type on combined tram and bicycle roads', () => {
    const data = network('Road', 'Road, Track', 'Pathway, Road', 'Pathway, Road, Track')
    expect(prepareNetworkObjects(data)).toMatchObject({ Road: 4, Track: 2, Pathway: 2 })
    expect(data.features.map(feature => feature.properties?._objectTypes)).toEqual([
      ['Road'], ['Road', 'Track'], ['Pathway', 'Road'], ['Pathway', 'Road', 'Track'],
    ])
    expect(hasNetworkObject(data.features[3].properties?.Object, 'Road')).toBe(true)
    expect(hasNetworkObject(data.features[1].properties?.Object, 'Pathway')).toBe(false)
  })

  it('renders combined Object labels in the matching base layers', () => {
    const filters = new Map<string, FilterSpecification>()
    const map = { addLayer(layer: { id: string; filter?: FilterSpecification }) {
      if (layer.filter) filters.set(layer.id, layer.filter)
    } } as unknown as MapLibreMap
    addBaseLayers(map)
    const data = network('Road, Track', 'Pathway, Road, Track', 'Track')
    data.features[0].properties!.Category = 'Train'
    data.features[1].properties!.Category = 'Tram'
    data.features[2].properties!.Category = 'Subway'
    prepareNetworkObjects(data)
    const visible = (layer: string, index: number) => featureFilter(filters.get(layer), layer)
      .filter({ zoom: 15 }, { type: 2, properties: data.features[index].properties! })
    expect(visible('road-line', 0)).toBe(true)
    expect(visible('road-line', 1)).toBe(true)
    expect(visible('road-line', 2)).toBe(false)
    expect(visible('train-line', 0)).toBe(true)
    expect(visible('train-ties', 0)).toBe(true)
    expect(visible('track-line', 0)).toBe(false)
    expect(visible('track-line', 1)).toBe(true)
    expect(visible('train-line', 2)).toBe(false)
    expect(visible('track-line', 2)).toBe(false)
    expect(visible('path-line', 1)).toBe(true)
  })
})
