import type { SearchEntry } from './Search'
import { poiModes, routeMode } from './transport'
import { distanceMeters, projectOnLine, projectPoint, type Coordinate, type LinePosition } from './routing/geometry'

const MAX_STOP_DISTANCE_METERS = 50
// Water routes run offshore, so their centerlines can be farther from the dock markers.
const WATER_STOP_DISTANCE_METERS = { ship: 100, ferry: 80 } as const

// Search entries are replaced when a source or snapshot changes. Weak keys let
// old datasets (and their cached stop lists) be collected without manual cleanup.
const stopCache = new WeakMap<SearchEntry[], Map<SearchEntry, SearchEntry[]>>()

function nearbyProjector(line: number[][], radius: number) {
  let progress = 0
  const segments = line.slice(1).map((end, index) => {
    const start = line[index] as Coordinate
    const length = distanceMeters(start, end as Coordinate)
    const segment = { start, end: end as Coordinate, length, progress, index,
      minX: Math.min(start[0], end[0]), maxX: Math.max(start[0], end[0]),
      minY: Math.min(start[1], end[1]), maxY: Math.max(start[1], end[1]) }
    progress += length
    return segment
  })
  const latitudePadding = radius / 111_320
  return (point: Coordinate): LinePosition | null => {
    let nearest: LinePosition | null = null
    for (const segment of segments) {
      if (point[1] < segment.minY - latitudePadding || point[1] > segment.maxY + latitudePadding) continue
      // distanceMeters uses the mean latitude of the point and projection.
      // Use the smallest possible longitude scale for a conservative bound.
      const latitude = Math.max(Math.abs(point[1]), Math.abs(segment.minY), Math.abs(segment.maxY))
      const longitudePadding = radius / (111_320 * Math.max(0, Math.cos(latitude * Math.PI / 180)))
      if (point[0] < segment.minX - longitudePadding || point[0] > segment.maxX + longitudePadding) continue
      const projection = projectPoint(point, segment.start, segment.end)
      if (projection.distance <= radius && (!nearest || projection.distance < nearest.distance)) {
        nearest = { ...projection, progress: segment.progress + projection.fraction * segment.length,
          segmentIndex: segment.index }
      }
    }
    return nearest
  }
}

export function distanceToRouteMeters(point: number[], line: number[][]): number {
  return projectOnLine(point as [number, number], line)?.distance ?? Infinity
}

export function nearbyStops(route: SearchEntry, entries: SearchEntry[]): SearchEntry[] {
  if (route.selection.kind !== 'route' || route.geometry.type !== 'LineString') return []
  const mode = routeMode(route.selection.properties.Transport)
  if (!mode) return []
  let cached = stopCache.get(entries)
  if (!cached) { cached = new Map(); stopCache.set(entries, cached) }
  const previous = cached.get(route)
  if (previous) return previous
  const maxDistance = mode === 'ship' || mode === 'ferry' ? WATER_STOP_DISTANCE_METERS[mode] : MAX_STOP_DISTANCE_METERS
  const line = route.geometry.coordinates
  const projectNearby = nearbyProjector(line, maxDistance)
  const count = route.selection.properties.Stop
  const limit = typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : Infinity
  const candidates = entries.flatMap(entry => {
    if (entry.selection.kind !== 'poi' || entry.geometry.type !== 'Point' ||
        typeof entry.selection.properties.Category !== 'string' ||
        !entry.selection.properties.Category.split(',').some(token => token.trim().startsWith('Stop')) ||
        !poiModes(entry.selection.properties.Category).includes(mode)) return []
    const position = projectNearby(entry.geometry.coordinates as Coordinate)
    return position ? [{ entry, ...position }] : []
  })
  const stops = candidates
    .filter(entry => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.entry.selection.sourceFeatureId - b.entry.selection.sourceFeatureId)
    .slice(0, limit)
    .sort((a, b) => a.progress - b.progress || a.distance - b.distance)
    .map(candidate => candidate.entry)
  cached.set(route, stops)
  return stops
}
