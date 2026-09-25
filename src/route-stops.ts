import type { SearchEntry } from './Search'
import { poiModes, routeMode } from './transport'

const MAX_STOP_DISTANCE_METERS = 50

function positionOnRoute(point: number[], line: number[][]): { distance: number; progress: number } {
  const metersPerLongitude = 111_320 * Math.cos(point[1] * Math.PI / 180)
  const metersPerLatitude = 111_320
  let nearest = { distance: Infinity, progress: Infinity }
  let traveled = 0
  for (let index = 1; index < line.length; index++) {
    const start = line[index - 1]
    const end = line[index]
    const x = (start[0] - point[0]) * metersPerLongitude
    const y = (start[1] - point[1]) * metersPerLatitude
    const dx = (end[0] - start[0]) * metersPerLongitude
    const dy = (end[1] - start[1]) * metersPerLatitude
    const lengthSquared = dx * dx + dy * dy
    const fraction = lengthSquared ? Math.max(0, Math.min(1, -(x * dx + y * dy) / lengthSquared)) : 0
    const segmentLength = Math.sqrt(lengthSquared)
    const distance = Math.hypot(x + fraction * dx, y + fraction * dy)
    if (distance < nearest.distance) nearest = { distance, progress: traveled + fraction * segmentLength }
    traveled += segmentLength
  }
  return nearest
}

export function distanceToRouteMeters(point: number[], line: number[][]): number {
  return positionOnRoute(point, line).distance
}

export function nearbyStops(route: SearchEntry, entries: SearchEntry[]): SearchEntry[] {
  if (route.selection.kind !== 'route' || route.geometry.type !== 'LineString') return []
  const mode = routeMode(route.selection.properties.Transport)
  if (!mode) return []
  const line = route.geometry.coordinates
  const count = route.selection.properties.Stop
  const limit = typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : Infinity
  const candidates = entries.flatMap(entry => {
    if (entry.selection.kind !== 'poi' || entry.geometry.type !== 'Point' ||
        typeof entry.selection.properties.Category !== 'string' ||
        !entry.selection.properties.Category.split(',').some(token => token.trim().startsWith('Stop')) ||
        !poiModes(entry.selection.properties.Category).includes(mode)) return []
    return [{ entry, ...positionOnRoute(entry.geometry.coordinates, line) }]
  })
  return candidates
    .filter(entry => entry.distance <= MAX_STOP_DISTANCE_METERS)
    .sort((a, b) => a.distance - b.distance || a.entry.selection.sourceFeatureId - b.entry.selection.sourceFeatureId)
    .slice(0, limit)
    .sort((a, b) => a.progress - b.progress || a.distance - b.distance)
    .map(candidate => candidate.entry)
}
