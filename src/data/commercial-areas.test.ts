import { describe, expect, it } from 'vitest'
import type { Feature, LineString, Polygon } from 'geojson'
import { buildCommercialAreas } from './commercial-areas'
import { isCommercial, type CommercialAreas } from './commercial'
import { insideRing, METERS_PER_DEGREE, type Pair } from './park-geometry'
import type { BuildingData, NetworkData } from './types'

const coordinate = (p: number[]): Pair => [p[0] / METERS_PER_DEGREE, p[1] / METERS_PER_DEGREE]
const building = (
  x: number,
  y: number,
  w = 20,
  h = 20,
  Zoning = 'Commercial',
): Feature<Polygon> => ({
  type: 'Feature',
  properties: { Object: 'Building', Category: 'Property', Zoning },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
      ].map(coordinate),
    ],
  },
})
const road = (points: number[][], Form = 'Normal', Width = 10): Feature<LineString> => ({
  type: 'Feature',
  properties: { Object: 'Road', Form, Width },
  geometry: { type: 'LineString', coordinates: points.map(coordinate) },
})
const boundary = () => [
  road([
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
    [0, 0],
  ]),
]
const generate = (features: Feature<Polygon>[], roads: Feature<LineString>[] = []) =>
  buildCommercialAreas(
    { type: 'FeatureCollection', features },
    { type: 'FeatureCollection', features: roads },
  )
const includes = (areas: CommercialAreas, x: number, y: number) =>
  areas.features.some((f) =>
    f.geometry.coordinates.some(
      (p) =>
        insideRing(coordinate([x, y]), p[0] as Pair[]) &&
        !p.slice(1).some((ring) => insideRing(coordinate([x, y]), ring as Pair[])),
    ),
  )
const strip = () => [building(10, 10), building(10, 35), building(10, 60)]
const blocks = (areas: CommercialAreas) =>
  areas.features.filter((f) => f.properties.kind === 'block')

describe('commercial corridors', () => {
  it('uses exact zoning tokens including mixed use, independently of localized names', () => {
    expect(isCommercial({ Zoning: ' Residential , Commercial ', Zone: 'Localized' })).toBe(true)
    for (const Zoning of ['Office', 'Industrial', 'Residential', 'NonCommercial', 'None']) {
      expect(isCommercial({ Zoning })).toBe(false)
    }
    expect(isCommercial(null)).toBe(false)
    expect(isCommercial({ Zoning: 'Commercial', Category: 'Public, Park' })).toBe(false)
  })
  it('connects a shopping strip without extending over a large empty area', () => {
    const areas = generate(strip())
    expect(includes(areas, 20, 32)).toBe(true)
    expect(includes(areas, 20, 55)).toBe(true)
    expect(includes(areas, 50, 50)).toBe(false)
    expect(blocks(areas)).toHaveLength(0)
  })
  it('includes mixed-use shopping streets', () => {
    const features = strip().map((f) => ({
      ...f,
      properties: { ...f.properties, Zoning: 'Residential, Commercial' },
    }))
    expect(includes(generate(features), 20, 40)).toBe(true)
  })
  it('does not highlight isolated shops, one large mall, or two small shops', () => {
    expect(generate([building(10, 10)]).features).toHaveLength(0)
    expect(generate([building(10, 10, 100, 100)]).features).toHaveLength(0)
    expect(generate([building(10, 10), building(35, 10)]).features).toHaveLength(0)
    expect(
      generate([building(10, 10), building(200, 10), building(400, 10)]).features,
    ).toHaveLength(0)
  })
  it('recognizes two substantial adjacent commercial plots', () => {
    expect(includes(generate([building(0, 0, 35, 35), building(40, 0, 35, 35)]), 38, 15)).toBe(true)
  })
  it('does not count duplicate or contained exports as additional shops', () => {
    const big = building(10, 10, 50, 50)
    expect(generate([big, big, big, building(20, 20)]).features).toHaveLength(0)
  })
  it('cuts residential, office, industrial and park plots out of its margin', () => {
    for (const Zoning of ['Residential', 'Office', 'Industrial', 'None']) {
      const other = building(32, 35, 15, 15, Zoning)
      if (Zoning === 'None') other.properties!.Category = 'Public, Park'
      const areas = generate([...strip(), other])
      expect(includes(areas, 34, 40)).toBe(false)
      expect(includes(areas, 20, 40)).toBe(true)
    }
  })
  it('fills only broadly distributed commercial-dominated blocks', () => {
    const shops = [
      building(10, 10, 35, 35),
      building(55, 10, 35, 35),
      building(10, 55, 35, 35),
      building(55, 55, 35, 35),
    ]
    const areas = generate(shops, boundary())
    expect(blocks(areas)).toHaveLength(1)
    expect(includes(areas, 50, 50)).toBe(true)
    expect(includes(areas, 3, 50)).toBe(false)
    expect(includes(areas, -10, 50)).toBe(false)
    const mixed = generate([...strip(), building(45, 10, 45, 80, 'Residential')], boundary())
    expect(blocks(mixed)).toHaveLength(0)
    expect(includes(mixed, 70, 50)).toBe(false)
  })
  it('clips road widths and cul-de-sacs, including roads in compound object categories', () => {
    const divider = road(
      [
        [-10, 32],
        [60, 32],
      ],
      'Normal',
      6,
    )
    divider.properties!.Object = 'Road, Track'
    const areas = generate(strip(), [divider])
    expect(includes(areas, 20, 32)).toBe(false)
    expect(includes(areas, 20, 40)).toBe(true)
    const deadEnd = generate(strip(), [
      road(
        [
          [0, 45],
          [20, 45],
        ],
        'Normal',
        6,
      ),
    ])
    expect(includes(deadEnd, 20, 45)).toBe(false)
  })
  it('keeps elevated roads and tunnels from cutting the surface corridor', () => {
    for (const Form of ['Elevated', 'Tunnel']) {
      expect(
        includes(
          generate(strip(), [
            road(
              [
                [-10, 32],
                [60, 32],
              ],
              Form,
            ),
          ]),
          20,
          32,
        ),
      ).toBe(true)
    }
  })
  it('preserves courtyards through gap closing', () => {
    const features = strip()
    features[1].geometry.coordinates.push(
      [
        [15, 40],
        [15, 50],
        [25, 50],
        [25, 40],
        [15, 40],
      ].map(coordinate),
    )
    const areas = generate(features)
    expect(includes(areas, 20, 45)).toBe(false)
    expect(includes(areas, 12, 45)).toBe(true)
  })
  it('preserves disconnected inner road loops as holes in expanded blocks', () => {
    const shops = [
      building(10, 10, 30, 30),
      building(60, 10, 30, 30),
      building(10, 60, 30, 30),
      building(60, 60, 30, 30),
    ]
    const areas = generate(shops, [
      ...boundary(),
      road(
        [
          [43, 43],
          [57, 43],
          [57, 57],
          [43, 57],
          [43, 43],
        ],
        'Normal',
        4,
      ),
    ])
    expect(blocks(areas)).toHaveLength(1)
    expect(includes(areas, 50, 50)).toBe(false)
  })
  it('handles empty data and leaves inputs unchanged', () => {
    expect(generate([]).features).toHaveLength(0)
    const buildings: BuildingData = { type: 'FeatureCollection', features: strip() }
    const network: NetworkData = { type: 'FeatureCollection', features: boundary() }
    const before = JSON.stringify({ buildings, network })
    buildCommercialAreas(buildings, network)
    expect(JSON.stringify({ buildings, network })).toBe(before)
  })
})
