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
    const landmark = building('Test Landmark', 'Residential', 'Test Landmark', 'Property', 0,
      .001, 800)
    const places = buildingPlaces({ type: 'FeatureCollection', features: [landmark, ...ordinary] })

    expect(places.features).toHaveLength(1)
    expect(places.features[0].id).toBe(0)
    expect(places.features[0].properties).toMatchObject({ label: 'Test Landmark', tier: 0, icon: 'building-landmark' })
  })

  it('selects landmarks by city-relative size and occupancy, without name keywords', () => {
    const ordinary = Array.from({ length: 100 }, (_, index) =>
      building('Residential', 'Residential', 'ordinary', 'Property', .02 + index * .001, .0002, 40))
    const candidate = building('새로운 중심', 'Residential', 'custom asset', 'Property', 0, .0005, 700)
    const places = buildingPlaces({ type: 'FeatureCollection', features: [candidate, ...ordinary] })
    expect(places.features[0].properties.icon).toBe('building-landmark')
    expect(buildingPlaces({ type: 'FeatureCollection', features: [candidate] }).features[0].properties.icon).toBe('')
  })

  it('requires at least 700 residents or employees, without adding the two counts', () => {
    const ordinary = Array.from({ length: 100 }, (_, index) =>
      building('Residential', 'Residential', 'ordinary', 'Property', .02 + index * .001, .0002, 40))
    const candidate = building('Civic Tower', 'Residential', 'custom asset', 'Property', 0, .0005, 699)
    const icon = () => buildingPlaces({ type: 'FeatureCollection', features: [candidate, ...ordinary] }).features[0].properties.icon
    expect(icon()).toBe('')
    candidate.properties!.Employee = 699
    expect(icon()).toBe('')
    candidate.properties!.Employee = 700
    expect(icon()).toBe('building-landmark')
    candidate.properties!.Employee = 0
    candidate.properties!.Resident = 700
    expect(icon()).toBe('building-landmark')
  })

  it('does not classify rarity, a tower name, or a large footprint alone as a landmark', () => {
    const ordinary = Array.from({ length: 100 }, (_, index) =>
      building('Residential', 'Residential', 'ordinary', 'Property', .1 + index * .001, .0002, 40))
    const candidates = [
      building('Tiny Tower', 'Residential', 'tiny', 'Property', 0, .0001, 500),
      building('Empty Monument', 'Residential', 'empty', 'Property', .01, .0005, 0),
      ...Array.from({ length: 4 }, (_, i) => building(`Repeated ${i}`, 'Residential', 'repeated', 'Property', .02 + i * .001, .0005, 500)),
      building('Residential', 'Residential', 'generic', 'Property', .03, .0005, 500),
    ]
    const places = buildingPlaces({ type: 'FeatureCollection', features: [...candidates, ...ordinary] })
    expect(places.features.every(f => f.properties.icon !== 'building-landmark')).toBe(true)
  })

  it('keeps specialized icons and excludes industrial and transport buildings', () => {
    const ordinary = Array.from({ length: 100 }, (_, index) =>
      building('Commercial', 'Commercial', 'ordinary', 'Property', .1 + index * .001, .0002, 40))
    for (const feature of ordinary) feature.properties!.Zoning = 'Commercial'
    const hotel = building('Grand Hotel', 'Commercial', 'Grand Hotel', 'Property', 0, .0005, 500)
    hotel.properties!.Zoning = 'Commercial'
    const factory = building('Great Works', 'Industrial', 'factory', 'Property', .01, .0005, 500)
    factory.properties!.Zoning = 'Industrial'
    const station = building('Central Tower', 'Unzoned', 'station', 'Public, Transportation', .02, .0005, 500)
    const places = buildingPlaces({ type: 'FeatureCollection', features: [hotel, factory, station, ...ordinary] })
    expect(places.features.find(f => f.id === 0)?.properties.icon).toBe('building-hotel')
    expect(places.features.every(f => f.properties.icon !== 'building-landmark')).toBe(true)
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

  it('hides Park names except venues, while keeping other specialized icons', () => {
    const places = buildingPlaces({ type: 'FeatureCollection', features: [
      building('Unique park', 'Unzoned', 'park', 'Public, Park', 0),
      building('Art collection', 'Unzoned', 'Art Museum', 'Public, Park', .01),
      building('Grand Arena', 'Unzoned', 'arena', ' Park , Public ', .02),
      building('Park school', 'Unzoned', 'school', 'Public, Education, Park', .03),
      building('Parking school', 'Unzoned', 'school', 'Public, Education', .04),
    ] })
    expect(places.features.map(feature => [feature.id, feature.properties.label, feature.properties.icon]))
      .toEqual([[1, '', 'building-museum'], [2, 'Grand Arena', 'building-venue'], [3, '', 'building-school'],
        [4, 'Parking school', 'building-school']])
  })

  it('uses one stable point per building across tile boundaries, preserving source IDs', () => {
    const places = buildingPlaces({ type: 'FeatureCollection', features: [
      building('Arena', 'Unzoned', 'stadium', 'Public, Park', -.001, .002),
      building('Hospital', 'Unzoned', 'hospital', 'Public, Health', .001, .002),
    ] })
    expect(places.features.map(feature => [feature.id, feature.geometry])).toEqual([
      [0, { type: 'Point', coordinates: [0, .001] }],
      [1, { type: 'Point', coordinates: [.002, .001] }],
    ])
    expect(places.features.map(feature => feature.properties.label)).toEqual(['Arena', 'Hospital'])
  })

  it('drops repeated generic park names while keeping a distinct civic building', () => {
    const parks = Array.from({ length: 12 }, (_, index) =>
      building('Small park', 'Unzoned', 'park', 'Public, Park', index * .001))
    const places = buildingPlaces({ type: 'FeatureCollection', features: [
      ...parks, building('City Hall', 'Unzoned', 'hall', 'Public, Admin', .02),
    ] })
    expect(places.features.map(feature => feature.properties.label)).toEqual(['City Hall'])
  })

  it('shows education buildings with fewer than 100 employees at a closer zoom', () => {
    const small = building('Small school', 'Unzoned', 'small-school', 'Public, Education', 0)
    const large = building('Large school', 'Unzoned', 'large-school', 'Public, Education', .01)
    const unknown = building('Unknown school', 'Unzoned', 'unknown-school', 'Public, Education', .02)
    small.properties!.Employee = 99
    large.properties!.Employee = 100
    delete unknown.properties!.Employee

    const places = buildingPlaces({ type: 'FeatureCollection', features: [small, large, unknown] })
    expect(places.features.map(feature => feature.properties.tier)).toEqual([2, 1, 1])
    expect(places.features[0].properties.sortKey).toBeGreaterThan(places.features[1].properties.sortKey)
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
