import type { FeatureCollection, LineString, Point } from 'geojson'
import { ROUTING_CONFIG } from './config'
import { accessPoints, distanceMeters, type Coordinate, type RoutePlace } from './geometry'
import { buildTransitData, rideGeometry, type TransitData, type TransitMode } from './transit'
import { WalkingGraph, type WalkPath } from './walking'
import type { JourneyLeg, TransitOutcome } from './types'

const SPEED_KMH: Record<TransitMode, number> = {
  bus: 25, train: 60, tram: 22, subway: 40, ship: 30, ferry: 20,
}
const WAIT_SECONDS = 300
const TRANSFER_SECONDS = 120
type Arc = { to: number; distance: number; seconds: number; coordinates: Coordinate[] }
type Step = { previous: number | null; legs: JourneyLeg[] }
type Item = { key: number; seconds: number }

class Heap {
  private items: Item[] = []
  get length() { return this.items.length }
  push(item: Item) {
    let at = this.items.length
    this.items.push(item)
    while (at) {
      const parent = (at - 1) >> 1
      if (this.items[parent].seconds <= item.seconds) break
      this.items[at] = this.items[parent]; at = parent
    }
    this.items[at] = item
  }
  pop(): Item {
    const first = this.items[0], last = this.items.pop()!
    if (this.items.length) {
      let at = 0
      while (2 * at + 1 < this.items.length) {
        const left = 2 * at + 1, right = left + 1
        const child = right < this.items.length && this.items[right].seconds < this.items[left].seconds ? right : left
        if (this.items[child].seconds >= last.seconds) break
        this.items[at] = this.items[child]; at = child
      }
      this.items[at] = last
    }
    return first
  }
}

function walkLeg(path: WalkPath, coordinates = path.coordinates): JourneyLeg {
  return { kind: 'walk', distance: path.distance, seconds: path.seconds, coordinates }
}
function waitLeg(seconds: number, point: Coordinate): JourneyLeg {
  return { kind: 'wait', distance: 0, seconds, coordinates: [], stopPoint: point }
}
function mergeRides(legs: JourneyLeg[]): JourneyLeg[] {
  const result: JourneyLeg[] = []
  for (const leg of legs) {
    const previous = result.at(-1)
    if (leg.kind === 'ride' && previous?.kind === 'ride' && previous.routeId === leg.routeId &&
      previous.coordinates.length && leg.coordinates.length &&
      distanceMeters(previous.coordinates.at(-1)!, leg.coordinates[0]) < 0.1) {
      previous.distance += leg.distance
      previous.seconds += leg.seconds
      previous.toStop = leg.toStop
      previous.coordinates.push(...leg.coordinates.slice(1))
    } else result.push({ ...leg, coordinates: leg.coordinates.slice() })
  }
  return result
}

export class TransitPlanner {
  readonly data: TransitData
  readonly walking: WalkingGraph
  private readonly rides: Arc[][]
  private readonly transferPaths = new Map<number, Map<number, WalkPath>>()

  constructor(network: FeatureCollection<LineString>, pois: FeatureCollection<Point>,
    routes: FeatureCollection<LineString>) {
    this.data = buildTransitData(pois, routes)
    const activeStops = [...new Set(this.data.occurrences.map(item => item.stopId))]
    this.walking = new WalkingGraph(network, this.data.stops, activeStops)
    this.rides = this.data.occurrences.map(() => [])
    for (const route of this.data.routes) {
      const speed = SPEED_KMH[route.mode] / 3.6
      for (let index = 1; index < route.occurrences.length; index++) {
        const a = this.data.occurrences[route.occurrences[index - 1]]
        const b = this.data.occurrences[route.occurrences[index]]
        const distance = b.position.progress - a.position.progress
        if (distance < 0.1) continue
        const coordinates = rideGeometry(this.data, a, b)
        this.rides[a.id].push({ to: b.id, distance, seconds: distance / speed, coordinates })
        this.rides[b.id].push({ to: a.id, distance, seconds: distance / speed,
          coordinates: coordinates.slice().reverse() })
      }
    }
  }

  private transfers(stopId: number) {
    let paths = this.transferPaths.get(stopId)
    if (!paths) {
      paths = this.walking.fromStop(stopId, 300)
      this.transferPaths.set(stopId, paths)
    }
    return paths
  }

  route(origin: RoutePlace, destination: RoutePlace): TransitOutcome {
    if (!this.data.occurrences.length) return { reason: 'no-service' }
    const pathsFrom = (place: RoutePlace) => {
      const paths = new Map<number, WalkPath>()
      const points = accessPoints(place,
        point => this.walking.index.nearest(point, ROUTING_CONFIG.walkingSnapMeters)?.distance ?? null,
        ROUTING_CONFIG.walkingSnapMeters)
      for (const point of points) {
        for (const [stopId, path] of this.walking.fromPlace(point, ROUTING_CONFIG.walkingAccessMeters)) {
          if (path.seconds < (paths.get(stopId)?.seconds ?? Infinity)) paths.set(stopId, path)
        }
      }
      return paths
    }
    const access = pathsFrom(origin)
    const egress = pathsFrom(destination)
    if (!access.size || !egress.size) return { reason: 'access' }
    const count = this.data.occurrences.length
    const size = count * 3 * 2
    const keyFor = (occurrenceId: number, boardings: number, ridden: boolean) =>
      ((boardings - 1) * count + occurrenceId) * 2 + Number(ridden)
    const best = new Float64Array(size).fill(Infinity)
    const steps: Array<Step | undefined> = Array(size)
    const heap = new Heap()
    const push = (key: number, seconds: number, step: Step) => {
      if (seconds >= best[key]) return
      best[key] = seconds
      steps[key] = step
      heap.push({ key, seconds })
    }
    for (const [stopId, path] of access) {
      for (const occurrenceId of this.data.occurrencesByStop[stopId]) {
        const stop = this.data.stops[stopId]
        push(keyFor(occurrenceId, 1, false), path.seconds + WAIT_SECONDS, { previous: null,
          legs: [...(path.distance > 0.1 ? [walkLeg(path)] : []), waitLeg(WAIT_SECONDS, stop.point)] })
      }
    }
    let finalKey = -1, finalSeconds = Infinity, finalEgress: WalkPath | null = null
    while (heap.length) {
      const current = heap.pop()
      if (current.seconds !== best[current.key] || current.seconds >= finalSeconds) continue
      const boardings = Math.floor(current.key / (count * 2)) + 1
      const occurrenceId = Math.floor(current.key / 2) % count
      const ridden = current.key % 2 === 1
      const occurrence = this.data.occurrences[occurrenceId]
      const route = this.data.routes[occurrence.routeId]
      const fromStop = this.data.stops[occurrence.stopId]
      const finish = egress.get(occurrence.stopId)
      if (ridden && finish && current.seconds + finish.seconds < finalSeconds) {
        finalKey = current.key
        finalSeconds = current.seconds + finish.seconds
        finalEgress = finish
      }
      for (const arc of this.rides[occurrenceId]) {
        const next = this.data.occurrences[arc.to]
        push(keyFor(arc.to, boardings, true), current.seconds + arc.seconds,
          { previous: current.key, legs: [{ kind: 'ride', distance: arc.distance, seconds: arc.seconds,
            coordinates: arc.coordinates, routeId: route.id, routeName: route.name, mode: route.mode,
            color: route.color, fromStop: fromStop.name, toStop: this.data.stops[next.stopId].name }] })
      }
      if (boardings === 3 || !ridden) continue
      for (const [stopId, path] of this.transfers(occurrence.stopId)) {
        for (const nextId of this.data.occurrencesByStop[stopId]) {
          const next = this.data.occurrences[nextId]
          if (next.routeId === occurrence.routeId) continue
          const stop = this.data.stops[stopId]
          const legs = path.distance > 0.1 ? [walkLeg(path)] : []
          legs.push(waitLeg(TRANSFER_SECONDS + WAIT_SECONDS, stop.point))
          push(keyFor(nextId, boardings + 1, false),
            current.seconds + path.seconds + TRANSFER_SECONDS + WAIT_SECONDS,
            { previous: current.key, legs })
        }
      }
    }
    if (finalKey < 0 || !finalEgress) return { reason: 'disconnected' }
    const segments: JourneyLeg[][] = []
    for (let key: number | null = finalKey; key !== null;) {
      const step: Step = steps[key]!
      segments.push(step.legs)
      key = step.previous
    }
    const legs = mergeRides([...segments.reverse().flat(),
      ...(finalEgress.distance > 0.1 ? [walkLeg(finalEgress, finalEgress.coordinates.slice().reverse())] : [])])
    return { journey: { legs, distance: legs.reduce((sum, leg) => sum + leg.distance, 0),
      seconds: legs.reduce((sum, leg) => sum + leg.seconds, 0),
      transfers: Math.floor(finalKey / (count * 2)),
      assumptions: ['정류장 위치와 순서는 노선 선형에서 추정', '노선 양방향 운행 가정',
        '배차 시간 대신 탑승당 평균 5분 대기'] } }
  }
}
