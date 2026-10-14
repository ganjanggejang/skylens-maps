import { describe, expect, it } from 'vitest'
import type { LineString, Point, Polygon } from 'geojson'
import type { PlaceEntry } from '../data/place'
import { linkedBuildingRoutes, matchingStationBuilding } from './building-routes'

const address = { Address_District: 'Harbor', Address_Street: 'Quay Road', Address_Number: 10 }

function entry(kind: PlaceEntry['selection']['kind'], id: number, geometry: Point | LineString | Polygon,
  properties: Record<string, unknown>): PlaceEntry {
  return { selection: { kind, id: `${kind}:${id}`, sourceFeatureId: id, properties }, geometry }
}

function building(): PlaceEntry {
  return entry('building', 0, { type: 'Polygon', coordinates: [[
    [-0.00005, -0.00005], [0.00005, -0.00005], [0.00005, 0.00005],
    [-0.00005, 0.00005], [-0.00005, -0.00005],
  ]] }, { Name: 'Harbor terminal', Category: 'Public, Transportation', ...address })
}

function point(id: number, category: string, name: string, longitude: number, number = 10): PlaceEntry {
  return entry('poi', id, { type: 'Point', coordinates: [longitude, 0] },
    { Name: name, Category: category, ...address, Address_Number: number })
}

function route(id: number, transport: string, longitude: number, offset: number): PlaceEntry {
  return entry('route', id, { type: 'LineString', coordinates: [
    [longitude - 0.001, offset], [longitude + 0.001, offset],
  ] }, { Name: `${transport} line ${id}`, Transport: transport, Stop: 1 })
}

describe('linkedBuildingRoutes', () => {
  it('links train routes for a station with both parking and transportation categories', () => {
    const station = building()
    station.selection.properties.Category = 'Public, Parking, Transportation'
    const train = route(0, 'Train', 0, 0)
    const entries = [station, point(0, 'BuildingPassengerTrain', 'Harbor terminal', 0),
      point(1, 'StopPassengerTrain', 'Platform', 0), train]
    expect(linkedBuildingRoutes(station, entries)).toEqual([train])
  })

  it('links an airport cargo railway by address when its facility name differs and lies outside the building', () => {
    const airport = building()
    airport.selection.properties.Name = 'Renamed cargo terminal'
    const train = route(0, 'Train', 0.005, 0)
    const entries = [airport, point(0, 'BuildingCargoAirplane, BuildingCargoTrain', '테스트 화물 터미널', 0.004),
      point(1, 'StopCargoTrain', '테스트 화물 터미널', 0.005), train]
    expect(linkedBuildingRoutes(airport, entries)).toEqual([train])
    entries[1].selection.properties.Address_Number = 20
    entries[2].selection.properties.Address_Number = 20
    expect(linkedBuildingRoutes(airport, entries)).toEqual([])
  })

  it('links a renamed station through an addressed stop even without a facility POI', () => {
    const station = building()
    const train = route(0, 'Train', 0.005, 0)
    const entries = [station, point(0, 'StopPassengerTrain', 'Old station name', 0.005), train]
    expect(linkedBuildingRoutes(station, entries)).toEqual([train])
  })

  it('links a ship route to berths far from its terminal building', () => {
    const terminal = building()
    const ship = route(0, 'Ship', 0.005, 0.0007)
    const entries = [terminal, point(0, 'BuildingCargoShip', 'Harbor terminal', 0),
      point(1, 'StopCargoShip', 'Cargo berth', 0.005), ship]
    expect(linkedBuildingRoutes(terminal, entries).map(candidate => candidate.selection.id))
      .toEqual([ship.selection.id])
  })

  it('links a ferry route when the stop has another name and lies offshore', () => {
    const terminal = building()
    const ferry = route(0, 'Ferry', 0.0009, 0.0006)
    const entries = [terminal, point(0, 'BuildingFerry', 'Harbor terminal', 0),
      point(1, 'StopFerry', 'Quay stop', 0.0009), ferry]
    expect(linkedBuildingRoutes(terminal, entries).map(candidate => candidate.selection.id))
      .toEqual([ferry.selection.id])
  })

  it('links a ferry terminal with a named stop but no facility POI', () => {
    const terminal = building()
    const ferry = route(0, 'Ferry', 0.0009, 0.0006)
    const entries = [terminal, point(0, 'StopFerry', 'Harbor terminal', 0.0009), ferry]
    expect(linkedBuildingRoutes(terminal, entries).map(candidate => candidate.selection.id))
      .toEqual([ferry.selection.id])
  })

  it('does not link a nearby route through a stop at a different address', () => {
    const terminal = building()
    const unrelated = route(0, 'Ferry', 0.0009, 0.0006)
    const entries = [terminal, point(0, 'BuildingFerry', 'Harbor terminal', 0),
      point(1, 'StopFerry', 'Other quay', 0.0009, 20), unrelated]
    expect(linkedBuildingRoutes(terminal, entries)).toEqual([])
  })
})

describe('matchingStationBuilding', () => {
  it('recognizes a station with additional public building categories', () => {
    const terminal = building()
    terminal.selection.properties.Category = 'Transportation, Public, Parking'
    const station = { type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [0, 0] }, properties: { ...address } }
    expect(matchingStationBuilding(station, [terminal])).toBe(terminal)
  })

  it('selects the station building by address even when the icon lies outside it and has another name', () => {
    const terminal = building()
    const unrelated = entry('building', 1, terminal.geometry,
      { Name: 'Other station', Category: 'Public, Transportation', ...address, Address_Number: 20 })
    const station = { type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [0.002, 0] },
      properties: { Name: 'Subway platform', Category: 'BuildingSubway', ...address } }

    expect(matchingStationBuilding(station, [unrelated, terminal])).toBe(terminal)
    expect(matchingStationBuilding({ ...station, properties: { ...station.properties, Address_Number: 30 } },
      [unrelated, terminal])).toBeUndefined()
  })

  it('does not guess when multiple transport buildings share an address', () => {
    const terminal = building()
    const other = entry('building', 1, terminal.geometry,
      { ...terminal.selection.properties, Name: 'Other station' })
    const station = { type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [0, 0] },
      properties: { Name: 'Subway platform', Category: 'StopSubway', ...address } }

    expect(matchingStationBuilding(station, [terminal, other])).toBeUndefined()
    expect(matchingStationBuilding({ ...station, properties: { ...station.properties, Name: 'Other station' } },
      [terminal, other])).toBe(other)
  })
})
