import type { FeatureCollection, LineString } from 'geojson'
import { hasNetworkObject } from '../network-objects'
import { ROUTING_CONFIG } from './config'
import { distanceMeters, lineCumulativeDistances, sliceLine,
  type Coordinate, type LinePosition } from './geometry'
import { SegmentIndex } from './spatial'
import type { PassengerStop } from './transit'

type WalkArc = { to: number; distance: number; coordinates: Coordinate[] }
type Event = { node: number; position: LinePosition }
export type WalkPath = { distance: number; seconds: number; coordinates: Coordinate[] }

class Heap {
  private items: { node: number; distance: number }[] = []
  get length() { return this.items.length }
  push(item: { node: number; distance: number }) {
    let index = this.items.length
    this.items.push(item)
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.items[parent].distance <= item.distance) break
      this.items[index] = this.items[parent]; index = parent
    }
    this.items[index] = item
  }
  pop() {
    const top = this.items[0], last = this.items.pop()
    if (!this.items.length || !last) return top
    let index = 0
    while (index * 2 + 1 < this.items.length) {
      const left = index * 2 + 1, right = left + 1
      const child = right < this.items.length && this.items[right].distance < this.items[left].distance ? right : left
      if (this.items[child].distance >= last.distance) break
      this.items[index] = this.items[child]; index = child
    }
    this.items[index] = last
    return top
  }
}

function reverse(coordinates: Coordinate[]) { return coordinates.slice().reverse() }
function flatten(arcs: WalkArc[]): Coordinate[] {
  const result: Coordinate[] = []
  for (const arc of arcs) result.push(...(result.length ? arc.coordinates.slice(1) : arc.coordinates))
  return result
}

export class WalkingGraph {
  readonly adjacency: WalkArc[][] = []
  readonly stopNodes: Array<number | null>
  readonly index = new SegmentIndex()
  private readonly lines = new Map<number, number[][]>()
  private readonly events = new Map<number, Event[]>()
  private readonly endpointNodes = new Map<string, number>()
  private readonly stopAtNode = new Map<number, number>()
  private readonly activeStops = new Set<number>()

  constructor(network: FeatureCollection<LineString>, stops: PassengerStop[], activeStopIds: number[]) {
    this.stopNodes = stops.map(() => null)
    for (const stopId of activeStopIds) this.activeStops.add(stopId)
    const endpointKeys = new Set<string>()
    const vertexCounts = new Map<string, number>()
    for (const feature of network.features) {
      if (!this.walkable(feature.properties ?? {})) continue
      const line = feature.geometry?.coordinates
      if (!line || line.length < 2) continue
      endpointKeys.add(this.key(line[0] as Coordinate))
      endpointKeys.add(this.key(line.at(-1) as Coordinate))
      for (const point of line) {
        const key = this.key(point as Coordinate)
        vertexCounts.set(key, (vertexCounts.get(key) ?? 0) + 1)
      }
    }
    for (const [featureId, feature] of network.features.entries()) {
      if (!this.walkable(feature.properties ?? {})) continue
      const line = feature.geometry?.coordinates
      if (!line || line.length < 2) continue
      this.lines.set(featureId, line)
      this.index.addLine(featureId, line)
      const cumulative = lineCumulativeDistances(line)
      const events: Event[] = []
      for (let index = 0; index < line.length; index++) {
        if (index !== 0 && index !== line.length - 1 &&
          !endpointKeys.has(this.key(line[index] as Coordinate)) &&
          (vertexCounts.get(this.key(line[index] as Coordinate)) ?? 0) < 2) continue
        const point = line[index] as Coordinate
        const node = this.endpoint(point)
        events.push({ node, position: { point, distance: 0, progress: cumulative[index],
          segmentIndex: Math.min(index, line.length - 2), fraction: index === line.length - 1 ? 1 : 0 } })
      }
      this.events.set(featureId, events)
    }
    for (const stop of stops) {
      if (!this.activeStops.has(stop.id)) continue
      const nearest = this.index.nearest(stop.point, 150)
      if (!nearest) continue
      const stopNode = this.node(), projectedNode = this.node()
      this.stopNodes[stop.id] = stopNode
      this.stopAtNode.set(stopNode, stop.id)
      this.events.get(nearest.featureId)!.push({ node: projectedNode, position: nearest })
      this.connect(stopNode, projectedNode, [stop.point, nearest.point], nearest.distance)
    }
    for (const [featureId, events] of this.events) {
      const line = this.lines.get(featureId)!
      events.sort((a, b) => a.position.progress - b.position.progress || a.node - b.node)
      for (let index = 1; index < events.length; index++) {
        const from = events[index - 1], to = events[index]
        const distance = Math.max(0, to.position.progress - from.position.progress)
        const coordinates = sliceLine(line, from.position, to.position)
        this.connect(from.node, to.node, coordinates, distance)
      }
    }
  }

  private walkable(properties: Record<string, unknown>) {
    return hasNetworkObject(properties.Object, 'Pathway') ||
      hasNetworkObject(properties.Object, 'Road') && properties.Category !== 'Highway'
  }
  private key(point: Coordinate) { return `${point[0]},${point[1]}` }
  private node() { const id = this.adjacency.length; this.adjacency.push([]); return id }
  private endpoint(point: Coordinate) {
    const key = this.key(point)
    const existing = this.endpointNodes.get(key)
    if (existing !== undefined) return existing
    const id = this.node(); this.endpointNodes.set(key, id); return id
  }
  private connect(a: number, b: number, coordinates: Coordinate[], distance: number,
    adjacency = this.adjacency) {
    if (a === b) return
    adjacency[a].push({ to: b, distance, coordinates })
    adjacency[b].push({ to: a, distance, coordinates: reverse(coordinates) })
  }

  private search(adjacency: WalkArc[][], origin: number, maxDistance: number): Map<number, WalkPath> {
    const best = new Float64Array(adjacency.length).fill(Infinity)
    const previous: Array<WalkArc | undefined> = Array(adjacency.length)
    const from = new Int32Array(adjacency.length).fill(-1)
    const heap = new Heap()
    const result = new Map<number, WalkPath>()
    best[origin] = 0; heap.push({ node: origin, distance: 0 })
    while (heap.length) {
      const current = heap.pop()!
      if (current.distance !== best[current.node] || current.distance > maxDistance) continue
      const stopId = this.stopAtNode.get(current.node)
      if (stopId !== undefined) {
        const path: WalkArc[] = []
        for (let node = current.node; node !== origin; node = from[node]) {
          const arc = previous[node]
          if (!arc) break
          path.push(arc)
        }
        result.set(stopId, { distance: current.distance,
          seconds: current.distance / ROUTING_CONFIG.walkingMetersPerSecond,
          coordinates: flatten(path.reverse()) })
      }
      for (const arc of adjacency[current.node]) {
        const next = current.distance + arc.distance
        if (next > maxDistance || next >= best[arc.to]) continue
        best[arc.to] = next
        previous[arc.to] = arc
        from[arc.to] = current.node
        heap.push({ node: arc.to, distance: next })
      }
    }
    return result
  }

  fromStop(stopId: number, maxDistance: number): Map<number, WalkPath> {
    const node = this.stopNodes[stopId]
    return node === null ? new Map() : this.search(this.adjacency, node, maxDistance)
  }

  fromPlace(point: Coordinate, maxDistance: number): Map<number, WalkPath> {
    const accessRadius = Math.min(ROUTING_CONFIG.walkingSnapMeters, maxDistance)
    const nearby = this.index.nearby(point, accessRadius)
    const nearest = nearby[0]
    if (!nearest) return new Map()
    const adjacency = this.adjacency.slice()
    const origin = adjacency.length
    adjacency.push([])
    // A building may touch an isolated path stub while a connected walkable road is nearby.
    const cutoff = Math.min(accessRadius, Math.max(75, nearest.distance + 25))
    const usedFeatures = new Set<number>()
    for (const candidate of nearby) {
      if (candidate.distance > cutoff || usedFeatures.size >= 30) break
      if (usedFeatures.has(candidate.featureId)) continue
      usedFeatures.add(candidate.featureId)
      const events = this.events.get(candidate.featureId)!
      const line = this.lines.get(candidate.featureId)!
      let nextIndex = events.findIndex(event => event.position.progress >= candidate.progress)
      if (nextIndex < 0) nextIndex = events.length - 1
      const adjacent = new Set([Math.max(0, nextIndex - 1), nextIndex])
      for (const index of adjacent) {
        const event = events[index]
        const part = sliceLine(line, candidate, event.position)
        const coords = [point, candidate.point, ...part.slice(1)]
        const distance = candidate.distance + Math.abs(candidate.progress - event.position.progress)
        adjacency[event.node] = adjacency[event.node].slice()
        this.connect(origin, event.node, coords, distance, adjacency)
      }
    }
    return this.search(adjacency, origin, maxDistance)
  }
}
