import { expect, it } from 'vitest'
import type { Point } from 'geojson'
import type { PlaceEntry } from '../data/place'
import { nearbyStops } from './route-stops'
import { projectOnLine } from './geometry'

function route(line: number[][], transport = 'Subway', count = 0): PlaceEntry {
  return { selection: { id: 'route:0', kind: 'route', sourceFeatureId: 0,
    properties: { Transport: transport, Stop: count } }, geometry: { type: 'LineString', coordinates: line } }
}

function stop(id: number, coordinates: number[], category = 'StopSubway'): PlaceEntry & { geometry: Point } {
  return { selection: { id: `poi:${id}`, kind: 'poi', sourceFeatureId: id,
    properties: { Category: category } }, geometry: { type: 'Point', coordinates } }
}

it('matches full line projection, including repeated points, distance ties, and stop limits', () => {
  for (const latitude of [0, 60, 85]) {
    const line = Array.from({ length: 101 }, (_, i) => [i * 0.0001, latitude + Math.sin(i) * 0.0001])
    line.splice(20, 0, line[19])
    const entries = Array.from({ length: 240 }, (_, i) =>
      stop(i, [(i % 120) * 0.0001, latitude + (Math.floor(i / 120) ? 0.0002 : 0.002)]))
    entries.push(stop(241, entries[130].geometry.coordinates))
    for (const count of [0, 1, 8]) {
      const selected = route(line, 'Subway', count)
      const expected = entries.map(entry => ({ entry,
        position: projectOnLine(entry.geometry.coordinates as [number, number], line)! }))
        .filter(candidate => candidate.position.distance <= 50)
        .sort((a, b) => a.position.distance - b.position.distance ||
          a.entry.selection.sourceFeatureId - b.entry.selection.sourceFeatureId)
        .slice(0, count || Infinity)
        .sort((a, b) => a.position.progress - b.position.progress || a.position.distance - b.position.distance)
        .map(candidate => candidate.entry)
      expect(nearbyStops(selected, entries)).toEqual(expected)
    }
  }
})

it('keeps water distance thresholds and transport modes', () => {
  const selected = route([[-0.001, 0], [0.001, 0]], 'Ship')
  const entries = [stop(0, [0, 90 / 111_320], 'StopCargoShip'),
    stop(1, [0, 101 / 111_320], 'StopCargoShip'), stop(2, [0, 0])]
  expect(nearbyStops(selected, entries)).toEqual([entries[0]])
  expect(nearbyStops(route([[-0.001, 0], [0.001, 0]], 'Ferry'),
    [stop(3, [0, 81 / 111_320], 'StopFerry')])).toEqual([])
})

it('recomputes stop membership for new data even when the route ID is unchanged', () => {
  const selected = route([[-0.001, 0], [0.001, 0]])
  const oldEntries = [stop(0, [0, 0])]
  expect(nearbyStops(selected, oldEntries)).toEqual(oldEntries)
  const newEntries = [stop(0, [0, 0.01])]
  expect(nearbyStops(selected, newEntries)).toEqual([])
  expect(nearbyStops(route([[-0.001, 0.01], [0.001, 0.01]]), newEntries)).toEqual(newEntries)
})

it('handles an empty line and a line consisting of one zero length segment', () => {
  const entries = [stop(0, [0, 0])]
  expect(nearbyStops(route([]), entries)).toEqual([])
  expect(nearbyStops(route([[0, 0], [0, 0]]), entries)).toEqual(entries)
})

it('counts cargo rail stations instead of platforms and excludes passenger platforms', () => {
  const selected = route([[-0.01, 0], [0.01, 0]], 'Train', 3)
  selected.selection.properties.Object = 'RouteCargo'
  const entries = Array.from({ length: 6 }, (_, id) => {
    const station = Math.floor(id / 2)
    const entry = stop(id, [-0.005 + station * 0.005, (id + 1) / 111_320], 'StopCargoTrain')
    entry.selection.properties = { ...entry.selection.properties, Name: `Station ${station}`,
      Address_District: 'Central', Address_Street: 'Rail Street', Address_Number: station + 1 }
    return entry
  })
  entries.push(stop(6, [0, 0], 'StopPassengerTrain'))
  expect(nearbyStops(selected, entries).map(entry => entry.selection.sourceFeatureId)).toEqual([0, 1, 2, 3, 4, 5])

  const passenger = route([[-0.01, 0], [0.01, 0]], 'Train', 1)
  passenger.selection.properties.Object = 'RoutePassenger'
  expect(nearbyStops(passenger, entries)).toEqual([entries[6]])
})
