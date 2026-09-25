import { expect, it } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureCollection, LineString } from 'geojson'
import { routeLines, showDirections } from './directions-layers'

it('renders connected routing edges as one line without joining a real gap', () => {
  const lines = routeLines({
    distance: 0, seconds: 0, accessDistance: 0, featureIds: [],
    coordinates: [
      [[0, 0], [0.001, 0]],
      [[0.001, 0], [0.002, 0]],
      [[0.01, 0], [0.011, 0]],
    ],
  })
  expect(lines.features).toHaveLength(2)
  expect(lines.features[0].geometry.coordinates).toEqual([[0, 0], [0.001, 0], [0.002, 0]])
})

it('replaces the map overlay when switching between vehicle and transit results', () => {
  const data: Record<string, unknown> = {}
  const map = { getSource: (name: string) => ({ setData: (value: unknown) => { data[name] = value } }) } as unknown as MapLibreMap
  const car = { distance: 100, seconds: 20, accessDistance: 0, featureIds: [1],
    coordinates: [[[0, 0], [0.001, 0]]] as [[number, number], [number, number]][] }
  const transit = { distance: 100, seconds: 300, transfers: 0, assumptions: [], legs: [
    { kind: 'walk' as const, distance: 10, seconds: 8, coordinates: [[0, 0], [0.0001, 0]] as [number, number][] },
    { kind: 'ride' as const, distance: 90, seconds: 292,
      coordinates: [[0.0001, 0], [0.001, 0]] as [number, number][], color: '#123456' },
  ] }
  showDirections(map, car, null, [0, 0], [0.001, 0])
  expect((data['directions-line'] as FeatureCollection<LineString>).features).toHaveLength(1)
  expect((data['directions-transit'] as FeatureCollection<LineString>).features).toHaveLength(0)
  showDirections(map, null, transit, [0, 0], [0.001, 0])
  expect((data['directions-line'] as FeatureCollection<LineString>).features).toHaveLength(0)
  expect((data['directions-transit'] as FeatureCollection<LineString>).features.map(feature => feature.properties?.kind))
    .toEqual(['walk', 'ride'])
})
