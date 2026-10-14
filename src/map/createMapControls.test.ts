import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlaceEntry } from '../data/place'
import { INITIAL_VISIBILITY } from '../layer/layers'
import type { CityMap } from './createCityMap'
import { createMapControls } from './createMapControls'

afterEach(() => vi.unstubAllGlobals())

function setup(transport: string, category: string) {
  vi.stubGlobal('window', { innerWidth: 1200 })
  const building: PlaceEntry = {
    selection: { kind: 'building', id: 'building:0', sourceFeatureId: 0,
      properties: { Name: 'Station', Category: 'Public, Transportation' } },
    geometry: { type: 'Polygon', coordinates: [[[-0.0001, -0.0001], [0.0001, -0.0001],
      [0.0001, 0.0001], [-0.0001, 0.0001], [-0.0001, -0.0001]]] },
  }
  const stop: PlaceEntry = {
    selection: { kind: 'poi', id: 'poi:0', sourceFeatureId: 0, properties: { Category: `Stop${category}` } },
    geometry: { type: 'Point', coordinates: [0, 0] },
  }
  const facility: PlaceEntry = { ...stop,
    selection: { ...stop.selection, id: 'poi:1', sourceFeatureId: 1, properties: { Category: `Building${category}` } } }
  const route: PlaceEntry = {
    selection: { kind: 'route', id: 'route:0', sourceFeatureId: 0, properties: { Transport: transport, Stop: 1 } },
    geometry: { type: 'LineString', coordinates: [[-0.001, 0], [0.001, 0]] },
  }
  const scene = { entries: [building, facility, stop, route], visibility: { ...INITIAL_VISIBILITY },
    map: { getLayer: () => true, getSource: () => undefined,
      setFilter: vi.fn(), setLayoutProperty: vi.fn(), fitBounds: vi.fn() } } as unknown as CityMap
  return { scene, building, route, controls: createMapControls(scene, vi.fn(), vi.fn(), vi.fn()) }
}

describe('connected transit route selection', () => {
  it.each([
    ['bus', 'Bus', 'Bus'], ['train', 'Train', 'PassengerTrain'], ['tram', 'Tram', 'Tram'],
    ['subway', 'Subway', 'Subway'], ['ship', 'Ship', 'PassengerShip'], ['ferry', 'Ferry', 'Ferry'],
  ] as const)('hides automatically shown %s after clearing the connected route', (mode, transport, category) => {
    const { scene, building, route, controls } = setup(transport, category)
    controls.selectFeature(building.selection)
    expect(scene.visibility[mode]).toBe(true)
    controls.selectBuildingRoute(route)
    expect(scene.visibility[mode]).toBe(true)
    controls.selectFeature(null)
    expect(scene.visibility[mode]).toBe(false)
  })

  it('keeps a manually enabled layer visible after clearing the connected route', () => {
    const { scene, building, route, controls } = setup('Ferry', 'Ferry')
    controls.toggleGroup('ferry')
    controls.selectFeature(building.selection)
    controls.selectBuildingRoute(route)
    controls.selectFeature(null)
    expect(scene.visibility.ferry).toBe(true)
  })

  it('preserves explicitly selected search route visibility', () => {
    const { scene, building, route, controls } = setup('Subway', 'Subway')
    controls.selectFeature(building.selection)
    controls.selectEntry(route)
    controls.selectFeature(null)
    expect(scene.visibility.subway).toBe(true)
  })
})
