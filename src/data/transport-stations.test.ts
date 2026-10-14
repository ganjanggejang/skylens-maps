import { describe, expect, it } from 'vitest'
import type { FeatureCollection, Point } from 'geojson'
import { transportStations } from './transport-stations'

function poi(name: string, category: string, address: number, longitude: number) {
  return { type: 'Feature' as const,
    properties: { Name: name, Category: category, Address_District: 'Central',
      Address_Street: 'Station Street', Address_Number: address },
    geometry: { type: 'Point' as const, coordinates: [longitude, 0] } }
}

function collection(...features: ReturnType<typeof poi>[]): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features }
}

describe('transportStations', () => {
  it('uses one subway facility icon for directional stops and preserves stop IDs', () => {
    const stations = transportStations(collection(
      poi('Central', 'StopSubway', 10, 0),
      poi('Other', 'StopSubway', 20, 0.002),
      poi('Central (Line 2)', 'BuildingSubway', 10, 0.0001),
      poi('Central', 'StopSubway', 10, 0.0002),
      poi('Bus stop', 'StopBus', 10, 0.0001),
      poi('Train depot', 'DepotSubway', 10, 0.0001),
    ), 'subway').features

    expect(stations).toHaveLength(2)
    expect(stations[0].geometry.coordinates).toEqual([0.0001, 0])
    expect(stations[0].properties?._representativeSourceId).toBe(2)
    expect(stations[0].properties?._stopIds).toEqual([0, 3])
    expect(stations[0].properties?._mapLabel).toBe('Central')
    expect(stations[1].properties?._stopIds).toEqual([1])
  })

  it('uses the stop name when a subway facility has an unrelated asset name', () => {
    const stations = transportStations(collection(
      poi('Market Square', 'StopSubway', 10, 0),
      poi('Asset company', 'BuildingSubway', 10, 0.0001),
      poi('Market Square', 'StopSubway', 10, 0.0002),
    ), 'subway').features
    expect(stations[0].properties?._mapLabel).toBe('Market Square')
    expect(stations[0].properties?.Name).toBe('Asset company')
  })

  it.each(['bus', 'tram'] as const)('groups nearby %s stops by name across addresses', mode => {
    const stop = mode === 'bus' ? 'StopBus' : 'StopTram'
    const stations = transportStations(collection(
      poi('Central', stop, 10, 0), poi('Central', stop, 12, 0.0004),
      poi('Central', stop, 14, 0.01),
    ), mode).features
    expect(stations).toHaveLength(2)
    expect(stations[0].geometry.coordinates).toEqual([0.0002, 0])
    expect(stations[0].properties?._stopIds).toEqual([0, 1])
  })

  it('groups passenger and cargo train platforms by station, excluding the depot', () => {
    const stations = transportStations(collection(
      poi('Cargo terminal A', 'StopCargoTrain', 10, 0),
      poi('Cargo terminal A', 'BuildingCargoTrain', 10, 0.004),
      poi('Cargo terminal A', 'StopCargoTrain', 10, 0.008),
      poi('Main station', 'StopPassengerTrain', 20, 0.003),
      poi('Main station', 'BuildingPassengerTrain', 20, 0.0031),
      poi('Rail depot', 'DepotTrain', 10, 0.002),
    ), 'train').features
    expect(stations).toHaveLength(2)
    expect(stations[0].geometry.coordinates).toEqual([0.004, 0])
    expect(stations[0].properties?._stopIds).toEqual([0, 2])
    expect(stations[1].properties?._stopIds).toEqual([3])
  })

  it('keeps same-named ferry docks with different addresses separate', () => {
    const stations = transportStations(collection(
      poi('Coastal ferry', 'StopFerry', 10, 0),
      poi('Coastal ferry', 'StopFerry', 11, 0.0005),
      poi('Coastal ferry', 'BuildingFerry', 10, 0.00005),
    ), 'ferry').features
    expect(stations).toHaveLength(2)
    expect(stations[0].properties?._stopIds).toEqual([0])
  })

  it('groups ship berths along one terminal while keeping other terminals separate', () => {
    const stations = transportStations(collection(
      poi('Cargo A', 'StopCargoShip', 10, 0),
      poi('Cargo A', 'StopCargoShip', 10, 0.008),
      poi('Cargo B', 'StopCargoShip', 20, 0.004),
    ), 'ship').features
    expect(stations).toHaveLength(2)
    expect(stations[0].properties?._stopIds).toEqual([0, 1])
    expect(stations[0].geometry.coordinates[0]).toBeCloseTo(0.004)
  })
})
