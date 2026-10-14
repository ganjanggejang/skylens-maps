import { expect, it } from 'vitest'
import type { FeatureCollection, LineString } from 'geojson'
import { indexPlaces } from './place-index'

it('preserves original feature IDs while excluding non-road network objects', () => {
  const data: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [
    'Track', 'Pathway, Road', 'Waterway', 'Road',
  ].map(Object => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    properties: { Object, Name: 'Original' } })) }
  const entries = indexPlaces('snapshot', 'network', data)
  expect(entries.map(entry => entry.selection.id)).toEqual(['snapshot:network:1', 'snapshot:network:3'])
  expect(entries.map(entry => entry.selection.sourceFeatureId)).toEqual([1, 3])
  expect(data.features.map(feature => feature.id)).toEqual([0, 1, 2, 3])
  data.features[1].properties!.Name = 'Changed'
  expect(entries[0].selection.properties.Name).toBe('Original')
  expect(entries[0].selection.kind).toBe('road')
})
