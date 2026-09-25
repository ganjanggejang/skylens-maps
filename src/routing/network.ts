import type { FeatureCollection, LineString } from 'geojson'
import { ROUTING_CONFIG } from './config'
import { accessPoints, distanceMeters, projectPoint, type Coordinate, type RoutePlace } from './geometry'
import { shortestPath } from './shortest-path'
import type { RouteOutcome, RouteResult, RoutingEdge, TravelMode } from './types'

type Direction = 'Both' | 'Forward' | 'Backward'
type Segment = { from: number; to: number; start: Coordinate; end: Coordinate;
  distance: number; seconds: number; featureId: number; direction: Direction }
type Snap = { segment: Segment; point: Coordinate; fraction: number; distance: number }

export class NetworkGraph {
  readonly adjacency: RoutingEdge[][] = []
  readonly segments: Segment[] = []
  readonly excluded = { geometry: 0, direction: 0, speed: 0, length: 0 }
  private readonly endpointNodes = new Map<string, number>()

  constructor(readonly mode: TravelMode, network: FeatureCollection<LineString>) {
    const roadEndpoints = new Set<string>()
    if (mode === 'vehicle') {
      for (const feature of network.features) {
        if (feature.properties?.Object !== 'Road' || feature.geometry?.type !== 'LineString') continue
        const line = feature.geometry.coordinates
        if (line.length < 2) continue
        roadEndpoints.add(this.pointKey(line[0] as Coordinate))
        roadEndpoints.add(this.pointKey(line.at(-1) as Coordinate))
      }
    }
    for (const [featureId, feature] of network.features.entries()) {
      const properties = feature.properties ?? {}
      const road = properties.Object === 'Road'
      if (mode === 'vehicle' ? !road : !(properties.Object === 'Pathway' ||
        road && properties.Category !== 'Highway')) continue
      const direction = properties.Direction
      if (direction !== 'Both' && direction !== 'Forward' && direction !== 'Backward') {
        this.excluded.direction++; continue
      }
      const line = feature.geometry?.coordinates
      if (feature.geometry?.type !== 'LineString' || !Array.isArray(line) || line.length < 2) {
        this.excluded.geometry++; continue
      }
      const limit = properties.Limit
      if (mode === 'vehicle' && (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0)) {
        this.excluded.speed++; continue
      }
      const speed = mode === 'vehicle' ? (limit as number) / 3.6 * ROUTING_CONFIG.vehicleSpeedFactor :
        ROUTING_CONFIG.walkingMetersPerSecond
      const closedRoad = mode === 'vehicle' && line.length >= 4 &&
        this.pointKey(line[0] as Coordinate) === this.pointKey(line.at(-1) as Coordinate)
      const nodes = line.map((coordinate, index) => this.node(coordinate as Coordinate,
        index === 0 || index === line.length - 1 ||
        closedRoad && roadEndpoints.has(this.pointKey(coordinate as Coordinate))))
      for (let index = 1; index < line.length; index++) {
        const start = line[index - 1] as Coordinate, end = line[index] as Coordinate
        const distance = distanceMeters(start, end)
        if (!(distance > 0)) { this.excluded.length++; continue }
        const segment: Segment = { from: nodes[index - 1], to: nodes[index], start, end, distance,
          seconds: distance / speed, featureId, direction: mode === 'walk' ? 'Both' : direction }
        this.segments.push(segment)
        if (segment.direction !== 'Backward') this.edge(this.adjacency, segment.from, segment.to,
          segment.start, segment.end, segment.distance, segment.seconds, featureId)
        if (segment.direction !== 'Forward') this.edge(this.adjacency, segment.to, segment.from,
          segment.end, segment.start, segment.distance, segment.seconds, featureId)
      }
    }
  }

  private pointKey(point: Coordinate) { return `${point[0]},${point[1]}` }

  private node(point: Coordinate, endpoint: boolean): number {
    const key = this.pointKey(point)
    if (endpoint) {
      const existing = this.endpointNodes.get(key)
      if (existing !== undefined) return existing
    }
    const id = this.adjacency.length
    this.adjacency.push([])
    if (endpoint) this.endpointNodes.set(key, id)
    return id
  }

  private edge(adjacency: RoutingEdge[][], from: number, to: number, start: Coordinate,
    end: Coordinate, distance: number, seconds: number, featureId: number | null,
    kind: RoutingEdge['kind'] = this.mode) {
    adjacency[from].push({ to, distance, seconds, coordinates: [start, end], featureId, kind })
  }

  private nearest(point: Coordinate, limit: number): Snap | null {
    let best: Snap | null = null
    for (const segment of this.segments) {
      const projection = projectPoint(point, segment.start, segment.end)
      if (projection.distance > limit || best && projection.distance >= best.distance) continue
      best = { segment, ...projection }
    }
    return best
  }

  route(origin: RoutePlace, destination: RoutePlace): RouteOutcome {
    const radius = this.mode === 'vehicle' ? ROUTING_CONFIG.vehicleAccessMeters : ROUTING_CONFIG.walkingAccessMeters
    const snaps = (place: RoutePlace) => {
      const cache = new Map<string, Snap | null>()
      const nearest = (point: Coordinate) => {
        const key = this.pointKey(point)
        if (!cache.has(key)) cache.set(key, this.nearest(point, radius))
        return cache.get(key)!
      }
      return accessPoints(place, point => nearest(point)?.distance ?? null, radius)
        .flatMap(point => {
          const snap = nearest(point)
          return snap ? [{ point, snap }] : []
        })
    }
    const starts = snaps(origin), ends = snaps(destination)
    if (!starts.length || !ends.length) return { reason: 'access' }
    const adjacency = this.adjacency.map(edges => edges.slice())
    const start = adjacency.length, finish = start + 1
    adjacency.push([], [])
    const walkingSpeed = ROUTING_CONFIG.walkingMetersPerSecond
    const connect = (from: number, to: number, a: Coordinate, b: Coordinate,
      distance: number, seconds: number, featureId: number | null, kind: RoutingEdge['kind']) =>
      this.edge(adjacency, from, to, a, b, distance, seconds, featureId, kind)
    const attach = (snap: Snap, node: number, departure: boolean) => {
      const segment = snap.segment
      const first = segment.distance * snap.fraction
      const second = segment.distance - first
      if (segment.direction !== 'Backward') {
        if (departure) connect(node, segment.to, snap.point, segment.end, second,
          segment.seconds * (1 - snap.fraction), segment.featureId, this.mode)
        else connect(segment.from, node, segment.start, snap.point, first,
          segment.seconds * snap.fraction, segment.featureId, this.mode)
      }
      if (segment.direction !== 'Forward') {
        if (departure) connect(node, segment.from, snap.point, segment.start, first,
          segment.seconds * snap.fraction, segment.featureId, this.mode)
        else connect(segment.to, node, segment.end, snap.point, second,
          segment.seconds * (1 - snap.fraction), segment.featureId, this.mode)
      }
    }
    const startNodes = starts.map(({ point, snap }) => {
      const node = adjacency.length
      adjacency.push([])
      connect(start, node, point, snap.point, snap.distance,
        snap.distance / walkingSpeed, null, 'access')
      attach(snap, node, true)
      return node
    })
    const endNodes = ends.map(({ point, snap }) => {
      const node = adjacency.length
      adjacency.push([])
      attach(snap, node, false)
      connect(node, finish, snap.point, point, snap.distance,
        snap.distance / walkingSpeed, null, 'access')
      return node
    })
    for (const [i, { snap: startSnap }] of starts.entries()) {
      for (const [j, { snap: endSnap }] of ends.entries()) {
        if (startSnap.segment !== endSnap.segment) continue
        const segment = startSnap.segment
        const delta = endSnap.fraction - startSnap.fraction
        if (delta >= 0 && segment.direction !== 'Backward' || delta <= 0 && segment.direction !== 'Forward') {
          connect(startNodes[i], endNodes[j], startSnap.point, endSnap.point,
            Math.abs(delta) * segment.distance, Math.abs(delta) * segment.seconds, segment.featureId, this.mode)
        }
      }
    }
    const edges = shortestPath(adjacency, start, finish)
    if (!edges) return { reason: 'disconnected' }
    const route: RouteResult = {
      distance: edges.reduce((sum, edge) => sum + edge.distance, 0),
      seconds: edges.reduce((sum, edge) => sum + edge.seconds, 0),
      accessDistance: edges.filter(edge => edge.kind === 'access').reduce((sum, edge) => sum + edge.distance, 0),
      coordinates: edges.map(edge => edge.coordinates),
      featureIds: [...new Set(edges.flatMap(edge => edge.featureId === null ? [] : [edge.featureId]))],
    }
    return { route }
  }
}
