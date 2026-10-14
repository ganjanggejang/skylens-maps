import { describe, expect, it } from 'vitest'
import type { Feature, LineString, Polygon } from 'geojson'
import { buildParkAreas } from './park-areas'
import { individualParkAreas, isPark, type ParkAreas } from './parks'
import { insideRing, METERS_PER_DEGREE, multiArea, type Pair } from './park-geometry'
import { difference, union } from './park-clip'
import type { BuildingData, NetworkData } from './types'

const coordinate = (p: number[]): Pair => [p[0] / METERS_PER_DEGREE, p[1] / METERS_PER_DEGREE]
const road = (points: number[][], Form = 'Normal', Width = 10): Feature<LineString> => ({
  type: 'Feature', geometry: { type: 'LineString', coordinates: points.map(coordinate) },
  properties: { Object: 'Road', Form, Width },
})
const building = (x: number, y: number, w: number, h: number, Category = 'Public, Park'): Feature<Polygon> => ({
  type: 'Feature', properties: { Category }, geometry: { type: 'Polygon', coordinates: [
    [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(coordinate),
  ] },
})
const boundary = (Form = 'Normal') => [road([[0, 0], [100, 0]], Form), road([[100, 0], [100, 100]], Form),
  road([[100, 100], [0, 100]], Form), road([[0, 100], [0, 0]], Form)]
const scattered = () => [building(10, 10, 20, 20), building(70, 10, 20, 20),
  building(10, 70, 20, 20), building(70, 70, 20, 20)]
const generate = (features = scattered(), roads = boundary()) => buildParkAreas(
  { type: 'FeatureCollection', features }, { type: 'FeatureCollection', features: roads })
const includes = (areas: ParkAreas, x: number, y: number) => areas.features.some(f =>
  f.geometry.coordinates.some(p => insideRing(coordinate([x, y]), p[0] as Pair[]) &&
    p.slice(1).every(r => !insideRing(coordinate([x, y]), r as Pair[]))))
const blocks = (areas: ParkAreas) => areas.features.filter(f => f.properties.kind === 'block')

describe('inferred park areas with synthetic meter coordinates', () => {
  it('fills the gaps between scattered parks up to the inside of the road', () => {
    const areas = generate()
    expect(blocks(areas)).toHaveLength(1)
    expect(includes(areas, 50, 50)).toBe(true)
    expect(includes(areas, 6, 50)).toBe(true)
    expect(includes(areas, 4, 50)).toBe(false)
    expect(includes(areas, -10, 50)).toBe(false)
  })
  it('recognizes a single large park but does not expand a small neighborhood playground', () => {
    expect(blocks(generate([building(10, 10, 80, 80)]))).toHaveLength(1)
    const small = generate([building(10, 10, 20, 20)])
    expect(blocks(small)).toHaveLength(0)
    expect(includes(small, 20, 20)).toBe(true)
    expect(includes(small, 50, 50)).toBe(false)
  })
  it('rejects mixed residential blocks', () => {
    const areas = generate([...scattered(), building(40, 40, 20, 20, 'Property')])
    expect(blocks(areas)).toHaveLength(0)
    expect(includes(areas, 50, 50)).toBe(false)
  })
  it('fills a park-only block with widely distributed facilities covering between 10 and 15 percent', () => {
    const sparse = [building(10, 10, 15, 15), building(75, 10, 15, 15),
      building(10, 75, 15, 15), building(75, 75, 15, 15)]
    const areas = generate(sparse)
    expect(blocks(areas)).toHaveLength(1)
    expect(includes(areas, 50, 50)).toBe(true)
    expect(includes(areas, 4, 50)).toBe(false)
    expect(blocks(generate([...sparse, building(40, 40, 3, 3, 'Property')]))).toHaveLength(0)
  })
  it('does not expand sparse facilities clustered in one corner of an otherwise empty block', () => {
    const areas = generate([building(10, 10, 15, 15), building(25, 10, 15, 15),
      building(10, 25, 15, 15), building(25, 25, 15, 15)])
    expect(blocks(areas)).toHaveLength(0)
    expect(includes(areas, 70, 70)).toBe(false)
  })
  it('fills a park-only block with two substantial facilities distributed across its interior', () => {
    const parks = [building(10, 10, 35, 35), building(55, 55, 35, 35)]
    const areas = generate(parks)
    expect(blocks(areas)).toHaveLength(1)
    expect(includes(areas, 50, 50)).toBe(true)
    expect(includes(areas, 4, 50)).toBe(false)
    expect(blocks(generate([...parks, building(70, 10, 20, 20, 'Property')]))).toHaveLength(0)
  })
  it('judges a broadly distributed single park by its footprint rather than its facility count', () => {
    const parks = [building(20, 20, 60, 60)]
    const areas = generate(parks)
    expect(blocks(areas)).toHaveLength(1)
    expect(includes(areas, 10, 50)).toBe(true)
    expect(blocks(generate(Array.from({ length: 5 }, () => parks[0])))).toHaveLength(1)
  })
  it('requires actual park coverage and not just three tiny corner facilities', () => {
    expect(blocks(generate([building(10, 10, 3, 3), building(87, 10, 3, 3), building(10, 87, 3, 3)])))
      .toHaveLength(0)
  })
  it('does not count overlapping extensions as additional coverage', () => {
    const areas = generate(Array.from({ length: 5 }, () => building(10, 10, 20, 20)))
    expect(blocks(areas)).toHaveLength(0)
  })
  it('keeps an open road boundary from enclosing the unbounded outside region', () => {
    const areas = generate(scattered(), boundary().slice(0, 3))
    expect(blocks(areas)).toHaveLength(0)
    expect(includes(areas, 50, 50)).toBe(false)
  })
  it('ignores park paths, tunnels and elevated roads as block dividers', () => {
    const path = road([[50, 0], [50, 100]])
    path.properties!.Object = 'Pathway'
    const areas = generate(scattered(), [...boundary(), path,
      road([[50, 0], [50, 100]], 'Tunnel'), road([[0, 50], [100, 50]], 'Elevated')])
    expect(blocks(areas)).toHaveLength(1)
    expect(includes(areas, 50, 50)).toBe(true)
    expect(blocks(generate(scattered(), boundary('Elevated')))).toHaveLength(0)
  })
  it('nodes roads intersecting the middle of another segment and keeps road space unfilled', () => {
    const parks = [building(10, 10, 30, 30), building(10, 60, 30, 30),
      building(60, 10, 30, 30), building(60, 60, 30, 30)]
    const areas = generate(parks, [...boundary(), road([[50, -10], [50, 110]])])
    expect(blocks(areas)).toHaveLength(2)
    expect(includes(areas, 50, 50)).toBe(false)
    expect(includes(areas, 25, 50)).toBe(true)
  })
  it('preserves a cul-de-sac cut into an otherwise qualifying park block', () => {
    const areas = generate(scattered(), [...boundary(), road([[50, 0], [50, 50]], 'Normal', 6)])
    expect(blocks(areas)).toHaveLength(1)
    expect(includes(areas, 50, 40)).toBe(false)
    expect(includes(areas, 50, 60)).toBe(true)
  })
  it('keeps a disconnected inner road loop and its non-park interior as a hole', () => {
    const areas = generate(scattered(), [...boundary(),
      road([[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]], 'Normal', 4)])
    expect(blocks(areas)).toHaveLength(1)
    expect(includes(areas, 50, 50)).toBe(false)
    expect(includes(areas, 35, 50)).toBe(true)
  })
  it('clips individual parks away from road footprints and keeps holes', () => {
    const park = building(0, 0, 40, 40)
    park.geometry.coordinates.push([[20, 20], [20, 30], [30, 30], [30, 20], [20, 20]].map(coordinate))
    const areas = generate([park], [road([[-10, 0], [50, 0]])])
    expect(includes(areas, 10, 2)).toBe(false)
    expect(includes(areas, 10, 10)).toBe(true)
    expect(includes(areas, 25, 25)).toBe(false)
  })
  it('matches complete category tokens and leaves the input unchanged', () => {
    expect(isPark({ Category: ' Public , Park , Parking ' })).toBe(true)
    expect(isPark({ Category: 'Public, Parking' })).toBe(false)
    const buildings: BuildingData = { type: 'FeatureCollection', features: scattered() }
    const network: NetworkData = { type: 'FeatureCollection', features: boundary() }
    const before = JSON.stringify({ buildings, network })
    expect(individualParkAreas(buildings).features).toHaveLength(4)
    buildParkAreas(buildings, network)
    expect(JSON.stringify({ buildings, network })).toBe(before)
    expect(buildParkAreas({ type: 'FeatureCollection', features: [] }, network).features).toHaveLength(0)
  })
  it('normalizes holes independently of input winding and measures overlapping polygons once', () => {
    const a = [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]] as Pair[][]
    const hole = [[[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]]] as Pair[][]
    expect(multiArea(difference(a, hole))).toBe(300)
    expect(multiArea(union(a, a))).toBe(400)
  })
})
