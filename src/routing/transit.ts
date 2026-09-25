import type { FeatureCollection, LineString, Point } from 'geojson'
import { routeMode, TRANSPORT, type TransportMode } from '../transport'
import { distanceMeters, sliceLine, type Coordinate, type LinePosition } from './geometry'
import { SegmentIndex, type IndexedPosition } from './spatial'

export type TransitMode = Exclude<TransportMode, 'air'>
export type PassengerStop = { id: number; sourceId: number; name: string; point: Coordinate; mode: TransitMode }
export type PassengerRoute = { id: number; sourceId: number; name: string; mode: TransitMode;
  color: string; line: number[][]; occurrences: number[] }
export type StopOccurrence = { id: number; routeId: number; stopId: number;
  position: LinePosition; occurrenceIndex: number }
export type TransitData = { stops: PassengerStop[]; routes: PassengerRoute[];
  occurrences: StopOccurrence[]; occurrencesByStop: number[][];
  excluded: { ambiguous: number; tooFewStops: number } }

const STOP_CATEGORY: Record<TransitMode, string> = {
  bus: 'StopBus', train: 'StopPassengerTrain', tram: 'StopTram', subway: 'StopSubway',
  ship: 'StopPassengerShip', ferry: 'StopFerry',
}

function stopMode(category: unknown): TransitMode | null {
  if (typeof category !== 'string') return null
  const tokens = new Set(category.split(',').map(token => token.trim()))
  for (const [mode, token] of Object.entries(STOP_CATEGORY) as [TransitMode, string][]) {
    if (tokens.has(token)) return mode
  }
  return null
}

function bestOccurrence(positions: IndexedPosition[], total: number, closed: boolean):
  { positions: IndexedPosition[]; ambiguous: boolean } | null {
  if (!positions.length) return null
  const sorted = positions.slice().sort((a, b) => a.progress - b.progress)
  const clusters: IndexedPosition[][] = []
  for (const position of sorted) {
    const cluster = clusters.at(-1)
    if (cluster && position.progress - cluster.at(-1)!.progress <= 25) cluster.push(position)
    else clusters.push([position])
  }
  const choices = clusters.map(cluster => cluster.reduce((best, position) =>
    position.distance < best.distance ? position : best))
    .sort((a, b) => a.distance - b.distance || a.progress - b.progress)
  const alternatives = choices.filter(position => position.distance <= choices[0].distance + 5)
  if (alternatives.length === 2 && closed) {
    const first = alternatives.find(position => position.progress <= 25)
    const last = alternatives.find(position => total - position.progress <= 25)
    if (first && last && first !== last) return { positions: [first, last], ambiguous: false }
  }
  return { positions: [choices[0]], ambiguous: alternatives.length > 1 }
}

export function buildTransitData(pois: FeatureCollection<Point>, routeFeatures: FeatureCollection<LineString>): TransitData {
  const stops: PassengerStop[] = pois.features.flatMap((feature, sourceId) => {
    const mode = stopMode(feature.properties?.Category)
    if (!mode || feature.geometry?.type !== 'Point') return []
    return [{ id: 0, sourceId, mode, point: feature.geometry.coordinates as Coordinate,
      name: String(feature.properties?.Name || `정류장 #${sourceId + 1}`) }]
  })
  stops.forEach((stop, id) => { stop.id = id })
  const routes: PassengerRoute[] = []
  const occurrences: StopOccurrence[] = []
  const occurrencesByStop: number[][] = stops.map(() => [])
  const excluded = { ambiguous: 0, tooFewStops: 0 }

  for (const [sourceId, feature] of routeFeatures.features.entries()) {
    if (feature.properties?.Object !== 'RoutePassenger' || feature.geometry?.type !== 'LineString') continue
    const mode = routeMode(feature.properties.Transport)
    if (!mode || mode === 'air') continue
    const line = feature.geometry.coordinates
    if (line.length < 2) continue
    const index = new SegmentIndex()
    index.addLine(sourceId, line)
    const total = index.segments.at(-1)
    if (!total) continue
    const length = total.progressStart + total.length
    const closed = distanceMeters(line[0] as Coordinate, line.at(-1) as Coordinate) <= 1
    const candidates: { stop: PassengerStop; positions: IndexedPosition[] }[] = []
    for (const stop of stops) {
      if (stop.mode !== mode) continue
      const occurrence = bestOccurrence(index.nearby(stop.point, 50), length, closed)
      if (!occurrence) continue
      if (occurrence.ambiguous) { excluded.ambiguous++; continue }
      candidates.push({ stop, positions: occurrence.positions })
    }
    const limit = feature.properties.Stop
    if (typeof limit === 'number' && Number.isInteger(limit)) {
      candidates.sort((a, b) => a.positions[0].distance - b.positions[0].distance || a.stop.sourceId - b.stop.sourceId)
      candidates.length = Math.min(candidates.length, Math.max(0, limit))
    }
    if (candidates.length < 2) { excluded.tooFewStops++; continue }
    const ordered = candidates.flatMap(({ stop, positions }) => positions.map(position => ({ stop, position })))
      .sort((a, b) => a.position.progress - b.position.progress || a.stop.sourceId - b.stop.sourceId)
    const routeId = routes.length
    const rawColor = feature.properties.Color
    const color = typeof rawColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawColor) ?
      rawColor : TRANSPORT[mode].color
    const route: PassengerRoute = { id: routeId, sourceId, mode, color, line,
      name: String(feature.properties.Name || `노선 #${sourceId + 1}`), occurrences: [] }
    routes.push(route)
    const occurrenceCounts = new Map<number, number>()
    for (const { stop, position } of ordered) {
      const id = occurrences.length
      const occurrenceIndex = occurrenceCounts.get(stop.id) ?? 0
      occurrenceCounts.set(stop.id, occurrenceIndex + 1)
      const occurrence: StopOccurrence = { id, routeId, stopId: stop.id, position, occurrenceIndex }
      occurrences.push(occurrence)
      occurrencesByStop[stop.id].push(id)
      route.occurrences.push(id)
    }
  }
  return { stops, routes, occurrences, occurrencesByStop, excluded }
}

export function rideGeometry(data: TransitData, from: StopOccurrence, to: StopOccurrence): Coordinate[] {
  return sliceLine(data.routes[from.routeId].line, from.position, to.position)
}
