import { describe, expect, it } from 'vitest'
import { buildingIcon } from './building-icons'
import { buildingPlaces } from './place-labels'
import type { Feature, Polygon } from 'geojson'

describe('important building icons', () => {
  it('recognizes venue keywords in building names regardless of case or asset', () => {
    for (const Name of ['Ice Dome', 'CITY STADIUM', 'Bay Arena', 'Grand Coliseum']) {
      expect(buildingIcon({ Name, Category: 'Public, Park', Asset: 'Other asset' }, 100)).toBe('venue')
    }
    expect(buildingIcon({ Name: 'Concert Hall', Asset: 'Arena', Category: 'Public, Park' }, 100)).toBeNull()
    expect(buildingIcon({ Name: 'Arena wing', Category: 'Extension, Public, Park' }, 100)).toBeNull()
    expect(buildingIcon({ Name: 'Spotify Santana Bay Arena', Category: 'Public, Transportation' }, 100)).toBeNull()
    expect(buildingIcon({ Name: 'Bay Arena Ferry Terminal', Category: 'Public, Transportation' }, 100)).toBeNull()
    expect(buildingIcon({ Name: 'Stadium parking', Category: 'Public, Parking' }, 100)).toBeNull()
  })
  it('uses category tokens and excludes extensions and renamed transport facilities', () => {
    expect(buildingIcon({ Category: 'Public, Education, Health' }, 100)).toBe('school')
    expect(buildingIcon({ Category: 'Public, Police' }, 100)).toBe('police')
    expect(buildingIcon({ Category: 'Public, Health' }, 100)).toBe('hospital')
    expect(buildingIcon({ Category: 'Extension, Public, Health' }, 100)).toBeNull()
    expect(buildingIcon({ Category: 'Public, Fire' }, 100)).toBeNull()
    expect(buildingIcon({ Category: 'Extension, Public, Police' }, 100)).toBeNull()
    expect(buildingIcon({ Category: 'Public, Transportation', Name: 'Art Museum', Asset: 'Ferry stop' }, 100)).toBeNull()
    expect(buildingIcon({ Category: 'Public, Admin', Name: 'National Museum', Asset: 'Ventura City Hall' }, 100)).toBe('admin')
  })

  it('recognizes tourism assets across categories and localized products', () => {
    expect(buildingIcon({ Category: 'Public, Park', Asset: '현대 미술관' }, 100)).toBe('museum')
    expect(buildingIcon({ Category: 'Property', Zoning: 'Commercial', Asset: '해양 박물관' }, 100)).toBe('museum')
    expect(buildingIcon({ Category: 'Property', Zoning: 'Commercial', Product: '숙박 시설', Asset: 'Building 1' }, 100)).toBe('hotel')
    expect(buildingIcon({ Category: 'Property', Zoning: 'Residential', Name: 'Hotel', Asset: 'Apartment' }, 100)).toBeNull()
  })

  it('requires both restaurant identity and sufficient size or staffing', () => {
    const restaurant = { Category: 'Property', Zoning: 'Commercial', Product: '식사' }
    expect(buildingIcon({ ...restaurant, Employee: 15 }, 200)).toBeNull()
    expect(buildingIcon({ ...restaurant, Employee: 50 }, 200)).toBe('restaurant')
    expect(buildingIcon(restaurant, 1000)).toBe('restaurant')
    expect(buildingIcon({ ...restaurant, Product: '음료' }, 5000)).toBeNull()
  })

  it('keeps tourism landmarks even when generic property naming or park ranking would hide them', () => {
    const feature = (properties: Record<string, unknown>): Feature<Polygon> => ({
      type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [[[0, 0], [.001, 0], [.001, .001], [0, .001], [0, 0]]] },
    })
    const places = buildingPlaces({ type: 'FeatureCollection', features: [
      feature({ Name: 'Commercial', Zone: 'Commercial', Category: 'Property', Zoning: 'Commercial', Asset: 'Hotel' }),
      feature({ Name: 'Small park', Category: 'Public, Park', Asset: 'Art Museum' }),
      feature({ Name: 'Wing', Category: 'Extension, Property', Zoning: 'Commercial', Asset: 'Hotel' }),
    ] })
    expect(places.features.map(f => [f.id, f.properties.icon, f.properties.tier])).toEqual([
      [0, 'building-hotel', 1], [1, 'building-museum', 1],
    ])
    expect(places.features[1].properties.label).toBe('')
  })

  it('replaces generic hotel and restaurant zone names with brands while preserving custom names', () => {
    const properties = { Name: '북미 스타일 고밀도 상업지', Zone: '북미 스타일 고밀도 상업지',
      Category: 'Property', Zoning: 'Commercial', Employee: 83 }
    const feature = (extra: Record<string, unknown>): Feature<Polygon> => ({
      type: 'Feature', properties: { ...properties, ...extra },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [.001, 0], [.001, .001], [0, .001], [0, 0]]] },
    })
    const places = buildingPlaces({ type: 'FeatureCollection', features: [
      feature({ Product: '식사', Asset: 'NA 고밀도 상업지구 01 - L5 4x4', Brand: 'NomSobaNoodle' }),
      feature({ Product: '숙박 시설', Asset: 'NA 상업지구 호텔 01 - L5 6x6', Brand: 'BragAndRoost' }),
      feature({ Name: 'My Hotel', Asset: 'Hotel', Brand: 'BragAndRoost' }),
      feature({ Asset: 'Country Hotel', Brand: '' }),
    ] })
    expect(places.features.map(f => f.properties.label)).toEqual([
      'NomSobaNoodle', 'BragAndRoost', 'My Hotel', 'Country Hotel',
    ])
  })
})
