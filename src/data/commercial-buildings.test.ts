import { describe, expect, it } from 'vitest'
import type { Feature, Polygon } from 'geojson'
import { buildCommercialAreas } from './commercial-areas'
import { commercialBuildingIds } from './commercial-buildings'
import type { CommercialAreas } from './commercial'
import { METERS_PER_DEGREE, type Pair } from './park-geometry'
import type { BuildingData } from './types'

const coordinate = (p: number[]): Pair => [p[0] / METERS_PER_DEGREE, p[1] / METERS_PER_DEGREE]
const rectangle = (x: number, y: number, w: number, h: number) =>
  [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(coordinate)
const building = (x: number, y = 0, w = 20, h = 20): Feature<Polygon> => ({
  type: 'Feature', properties: { Category: 'Property', Zoning: 'Commercial' },
  geometry: { type: 'Polygon', coordinates: [rectangle(x, y, w, h)] },
})
const buildings = (...features: Feature<Polygon>[]): BuildingData => ({ type: 'FeatureCollection', features })
const areas = (...polygons: number[][][][]): CommercialAreas => ({
  type: 'FeatureCollection', features: polygons.map(p => ({
    type: 'Feature', properties: { kind: 'corridor' },
    geometry: { type: 'MultiPolygon', coordinates: [p] },
  })),
})

describe('buildings within commercial areas', () => {
  it('uses at least half of the actual footprint, rather than zoning or bounding boxes', () => {
    const data = buildings(building(0), building(20), building(29), building(100))
    data.features[0].properties!.Zoning = 'None'
    expect(commercialBuildingIds(data, areas([rectangle(0, 0, 30, 20)]))).toEqual([0, 1])
  })
  it('unions coverage from multiple areas without counting overlaps twice', () => {
    const data = buildings(building(0))
    const left = [rectangle(0, 0, 6, 20)], right = [rectangle(14, 0, 6, 20)]
    expect(commercialBuildingIds(data, areas(left, right))).toEqual([0])
    expect(commercialBuildingIds(data, areas(left, left))).toEqual([])
  })
  it('respects area holes, building courtyards, and park exclusions', () => {
    const courtyard = building(0, 0, 40, 40)
    courtyard.geometry.coordinates.push(rectangle(10, 10, 20, 20))
    const park = building(0)
    park.properties!.Category = 'Public, Park'
    const data = buildings(courtyard, building(15, 15, 5, 5), park)
    expect(commercialBuildingIds(data, areas([rectangle(0, 0, 40, 40), rectangle(10, 10, 20, 20)])))
      .toEqual([0])
  })
  it('colors inferred strip members but excludes isolated shops and clipped residential plots', () => {
    const housing = building(32, 35, 15, 15)
    housing.properties!.Zoning = 'Residential'
    const data = buildings(building(10, 10), building(10, 35), building(10, 60), building(200), housing)
    const inferred = buildCommercialAreas(data, { type: 'FeatureCollection', features: [] })
    expect(commercialBuildingIds(data, inferred)).toEqual([0, 1, 2])
  })
  it('handles empty areas and degenerate buildings without changing inputs', () => {
    const data = buildings(building(0), building(0, 0, 0, 0))
    const region = areas([rectangle(0, 0, 20, 20)])
    const before = JSON.stringify({ data, region })
    expect(commercialBuildingIds(data, areas())).toEqual([])
    expect(commercialBuildingIds(data, region)).toEqual([0])
    expect(JSON.stringify({ data, region })).toBe(before)
  })
})
