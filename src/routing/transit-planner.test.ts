import { describe, expect, it } from 'vitest'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { TransitPlanner } from './transit-planner'
import { buildTransitData } from './transit'

const x = (value: number) => value * 0.01
function network(): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: [{ type: 'Feature',
    geometry: { type: 'LineString', coordinates: [0, 1, 2, 3, 4].map(value => [x(value), 0]) },
    properties: { Object: 'Road', Category: 'Small' } }] }
}
function pois(): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: [0, 1, 2, 3, 4].map(value => ({ type: 'Feature',
    geometry: { type: 'Point', coordinates: [x(value), 0] },
    properties: { Object: 'Stop', Category: 'StopBus', Name: `Stop ${value}` } })) }
}
function routes(pairs: number[][]): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: pairs.map(([a, b], index) => ({ type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[x(a), 0], [x((a + b) / 2), 0.001], [x(b), 0]] },
    properties: { Object: 'RoutePassenger', Transport: 'Bus', Name: `Bus ${index}`, Stop: 2 } })) }
}

describe('TransitPlanner', () => {
  it('follows the route geometry and charges boarding wait once', () => {
    const planner = new TransitPlanner(network(), pois(), routes([[0, 3]]))
    const journey = planner.route([0, 0], [x(3), 0]).journey!
    expect(journey.transfers).toBe(0)
    const ride = journey.legs.find(leg => leg.kind === 'ride')!
    expect(ride.coordinates.some(point => point[1] === 0.001)).toBe(true)
    expect(journey.legs.filter(leg => leg.kind === 'wait')).toHaveLength(1)
    expect(journey.seconds).toBeCloseTo(journey.legs.reduce((sum, leg) => sum + leg.seconds, 0), 6)
  })

  it('uses a transfer and limits the journey to two transfers', () => {
    const planner = new TransitPlanner(network(), pois(), routes([[0, 1], [1, 2], [2, 3], [3, 4]]))
    const journey = planner.route([0, 0], [x(3), 0]).journey!
    expect(journey.transfers).toBe(2)
    expect(journey.legs.filter(leg => leg.kind === 'ride')).toHaveLength(3)
    expect(planner.route([0, 0], [x(4), 0]).reason).toBe('disconnected')
  })

  it('excludes cargo and passenger air stops from service', () => {
    const cargo = pois()
    for (const feature of cargo.features) feature.properties!.Category = 'StopCargoTrain, StopPassengerAirplane'
    const planner = new TransitPlanner(network(), cargo, routes([[0, 2]]))
    expect(planner.route([0, 0], [x(2), 0]).reason).toBe('no-service')
  })

  it('can reach a stop through a nearby road when the closest path stub is isolated', () => {
    const walkNetwork: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0.0005], [0.02, 0.0005]] },
        properties: { Object: 'Road', Category: 'Small' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0.0199, 0], [0.0201, 0]] },
        properties: { Object: 'Pathway' } },
    ] }
    const stops: FeatureCollection<Point> = { type: 'FeatureCollection', features: [0, 0.02].map((value, index) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [value, 0.0005] },
      properties: { Object: 'Stop', Category: 'StopBus', Name: `Stop ${index}` },
    })) }
    const service: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [{
      type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0.0005], [0.02, 0.0005]] },
      properties: { Object: 'RoutePassenger', Transport: 'Bus', Name: 'Bus', Stop: 2 },
    }] }
    const planner = new TransitPlanner(walkNetwork, stops, service)
    const destination: [number, number] = [0.02, 0]
    expect(planner.walking.index.nearest(destination, 150)?.featureId).toBe(1)
    expect(planner.walking.fromPlace(destination, 1000).size).toBeGreaterThan(0)
    expect(planner.route([0, 0.0005], destination).journey).toBeDefined()
  })

  it('walks from a large place whose mapped center is 160 meters from the road', () => {
    const planner = new TransitPlanner(network(), pois(), routes([[0, 3]]))
    const journey = planner.route([0, 0.00144], [x(3), 0]).journey
    expect(journey?.legs[0].kind).toBe('walk')
    expect(journey?.legs[0].distance).toBeGreaterThan(150)
    expect(journey?.legs.some(leg => leg.kind === 'ride')).toBe(true)
  })

  it('reaches transit from a large building boundary when its center cannot reach a road', () => {
    const planner = new TransitPlanner(network(), pois(), routes([[0, 3]]))
    const building = { type: 'Polygon' as const, coordinates: [[
      [x(0), 0.0001], [x(2), 0.0001], [x(2), 0.02], [x(0), 0.02], [x(0), 0.0001],
    ]] }
    expect(planner.route([x(1), 0.01], [x(3), 0]).reason).toBe('access')
    const journey = planner.route(building, [x(3), 0]).journey
    expect(journey?.legs.some(leg => leg.kind === 'ride')).toBe(true)
    expect(journey?.legs[0].coordinates[0][1]).toBeCloseTo(0.0001, 6)
    expect(planner.route([x(3), 0], building).journey?.legs.some(leg => leg.kind === 'ride')).toBe(true)
  })

  it('keeps both occurrences of a stop at the seam of a closed route', () => {
    const stops: FeatureCollection<Point> = { type: 'FeatureCollection', features: [
      [0, 0], [0.02, 0], [0.02, 0.02],
    ].map((coordinates, index) => ({ type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: { Category: 'StopSubway', Name: `Station ${index}` },
    })) }
    const service: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [{
      type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [0.02, 0], [0.02, 0.02], [0, 0]] },
      properties: { Object: 'RoutePassenger', Transport: 'Subway', Stop: 3 },
    }] }
    const data = buildTransitData(stops, service)
    expect(data.routes).toHaveLength(1)
    expect(data.routes[0].occurrences).toHaveLength(4)
    expect(data.occurrencesByStop[0].map(id => data.occurrences[id].occurrenceIndex)).toEqual([0, 1])
    expect(data.occurrencesByStop[0].map(id => data.occurrences[id].position.progress)[0]).toBeCloseTo(0)
    expect(data.occurrencesByStop[0].map(id => data.occurrences[id].position.progress)[1]).toBeGreaterThan(6000)
  })
})
