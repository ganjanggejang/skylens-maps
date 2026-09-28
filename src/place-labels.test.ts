import { describe, expect, it } from 'vitest'
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'
import { buildingPlaces, withoutSubwayBuildingDuplicates } from './place-labels'

function building(name: string, zone: string, asset: string, category: string, x: number,
  size = 0.0001, resident = 0): Feature<Polygon> {
  return { type: 'Feature', properties: { Name: name, Zone: zone, Asset: asset, Category: category,
    Zoning: 'Residential', Resident: resident, Employee: 0,
    Address_District: 'Central', Address_Street: 'Main', Address_Number: x === 0 ? 10 : 20 },
  geometry: { type: 'Polygon', coordinates: [[
    [x, 0], [x + size, 0], [x + size, size], [x, size], [x, 0],
  ]] } }
}

describe('buildingPlaces', () => {
  it('promotes a named, rare, physically prominent property without promoting generic one-off assets', () => {
    const ordinary = Array.from({ length: 100 }, (_, index) =>
      building('Residential', 'Residential', `standard-${index}`, 'Property', index * .001 + .01))
    const landmark = building('Brooklyn Tower', 'Residential', 'Brooklyn Tower', 'Property', 0,
      .001, 800)
    const places = buildingPlaces({ type: 'FeatureCollection', features: [landmark, ...ordinary] })

    expect(places.features).toHaveLength(1)
    expect(places.features[0].id).toBe(0)
    expect(places.features[0].properties).toMatchObject({ label: 'Brooklyn Tower', tier: 0 })
  })

  it('keeps individually named ordinary properties for closer zoom and skips parking extensions', () => {
    const data: FeatureCollection<Polygon> = { type: 'FeatureCollection', features: [
      building('Corner cafe', 'Commercial', 'store-1', 'Property', 0),
      building('Parking garage', 'Unzoned', 'garage', 'Public, Parking', .01),
      building('School wing', 'Unzoned', 'school-wing', 'Extension, Public, Education', .02),
    ] }
    const places = buildingPlaces(data)
    expect(places.features.map(feature => feature.properties.label)).toEqual(['Corner cafe'])
    expect(places.features[0].properties.tier).toBeGreaterThan(0)
  })

  it('ranks a locally prominent building above an equal-sized isolated building', () => {
    const neighbors = Array.from({ length: 12 }, (_, index) =>
      building('Residential', 'Residential', 'ordinary', 'Property', .0005 + index * .0002))
    const distant = Array.from({ length: 30 }, (_, index) =>
      building('Residential', 'Residential', 'ordinary', 'Property', .2 + index * .01, .001))
    const places = buildingPlaces({ type: 'FeatureCollection', features: [
      building('Local Hall', 'Residential', 'Local Hall', 'Property', 0, .0003),
      building('Remote Hall', 'Residential', 'Remote Hall', 'Property', .1, .0003),
      ...neighbors, ...distant,
    ] })
    expect(places.features[0].properties.sortKey).toBeLessThan(places.features[1].properties.sortKey)
  })

  it('drops repeated generic park names while keeping a distinct civic building', () => {
    const parks = Array.from({ length: 12 }, (_, index) =>
      building('Small park', 'Unzoned', 'park', 'Public, Park', index * .001))
    const places = buildingPlaces({ type: 'FeatureCollection', features: [
      ...parks, building('City Hall', 'Unzoned', 'hall', 'Public, Admin', .02),
    ] })
    expect(places.features.map(feature => feature.properties.label)).toEqual(['City Hall'])
  })

  it('removes a subway building duplicate at the station address only', () => {
    const places = buildingPlaces({ type: 'FeatureCollection', features: [
      building('Central station', 'Unzoned', 'station', 'Public, Transportation', 0),
      building('City hall', 'Unzoned', 'hall', 'Public, Admin', .01),
      building('Other station', 'Unzoned', 'station2', 'Public, Transportation', .02),
    ] })
    const stations: FeatureCollection<Point> = { type: 'FeatureCollection', features: [{
      type: 'Feature', properties: { Name: 'Central', Address_District: 'Central',
        Address_Street: 'Main', Address_Number: 10 },
      geometry: { type: 'Point', coordinates: [0, 0] },
    }] }
    expect(withoutSubwayBuildingDuplicates(places, stations).features.map(feature =>
      feature.properties.label)).toEqual(['City hall', 'Other station'])
  })
})
