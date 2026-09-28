import { describe, expect, it } from 'vitest'
import type { LineString, Point, Polygon } from 'geojson'
import type { SearchEntry } from './Search'
import { linkedBuildingRoutes } from './building-routes'

const address = { Address_District: 'Harbor', Address_Street: 'Quay Road', Address_Number: 10 }

function entry(kind: SearchEntry['selection']['kind'], id: number, geometry: Point | LineString | Polygon,
  properties: Record<string, unknown>): SearchEntry {
  return { selection: { kind, id: `${kind}:${id}`, sourceFeatureId: id, properties }, geometry }
}

function building(): SearchEntry {
  return entry('building', 0, { type: 'Polygon', coordinates: [[
    [-0.00005, -0.00005], [0.00005, -0.00005], [0.00005, 0.00005],
    [-0.00005, 0.00005], [-0.00005, -0.00005],
  ]] }, { Name: 'Harbor terminal', Category: 'Public, Transportation', ...address })
}

function point(id: number, category: string, name: string, longitude: number, number = 10): SearchEntry {
  return entry('poi', id, { type: 'Point', coordinates: [longitude, 0] },
    { Name: name, Category: category, ...address, Address_Number: number })
}

function route(id: number, transport: string, longitude: number, offset: number): SearchEntry {
  return entry('route', id, { type: 'LineString', coordinates: [
    [longitude - 0.001, offset], [longitude + 0.001, offset],
  ] }, { Name: `${transport} line ${id}`, Transport: transport, Stop: 1 })
}

describe('linkedBuildingRoutes', () => {
  it('links a ship route to berths far from its terminal building', () => {
    const terminal = building()
    const ship = route(0, 'Ship', 0.005, 0.0007)
    const entries = [terminal, point(0, 'BuildingCargoShip', 'Harbor terminal', 0),
      point(1, 'StopCargoShip', 'Cargo berth', 0.005), ship]
    expect(linkedBuildingRoutes(terminal, entries).map(candidate => candidate.selection.id)).toEqual([ship.selection.id])
  })

  it('links a ferry route when the stop has another name and lies offshore', () => {
    const terminal = building()
    const ferry = route(0, 'Ferry', 0.0009, 0.0006)
    const entries = [terminal, point(0, 'BuildingFerry', 'Harbor terminal', 0),
      point(1, 'StopFerry', 'Quay stop', 0.0009), ferry]
    expect(linkedBuildingRoutes(terminal, entries).map(candidate => candidate.selection.id)).toEqual([ferry.selection.id])
  })

  it('links a ferry terminal with a named stop but no facility POI', () => {
    const terminal = building()
    const ferry = route(0, 'Ferry', 0.0009, 0.0006)
    const entries = [terminal, point(0, 'StopFerry', 'Harbor terminal', 0.0009), ferry]
    expect(linkedBuildingRoutes(terminal, entries).map(candidate => candidate.selection.id)).toEqual([ferry.selection.id])
  })

  it('does not link a nearby route through a stop at a different address', () => {
    const terminal = building()
    const unrelated = route(0, 'Ferry', 0.0009, 0.0006)
    const entries = [terminal, point(0, 'BuildingFerry', 'Harbor terminal', 0),
      point(1, 'StopFerry', 'Other quay', 0.0009, 20), unrelated]
    expect(linkedBuildingRoutes(terminal, entries)).toEqual([])
  })
})
