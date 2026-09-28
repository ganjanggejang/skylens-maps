import type { SearchEntry } from './Search'
import { poiModes, routeMode } from './transport'
import { projectOnLine } from './routing/geometry'

const MAX_STOP_DISTANCE_METERS = 50
// Water routes run offshore, so their centerlines can be farther from the dock markers.
const WATER_STOP_DISTANCE_METERS = { ship: 100, ferry: 80 } as const

export function distanceToRouteMeters(point: number[], line: number[][]): number {
  return projectOnLine(point as [number, number], line)?.distance ?? Infinity
}

export function nearbyStops(route: SearchEntry, entries: SearchEntry[]): SearchEntry[] {
  if (route.selection.kind !== 'route' || route.geometry.type !== 'LineString') return []
  const mode = routeMode(route.selection.properties.Transport)
  if (!mode) return []
  const maxDistance = mode === 'ship' || mode === 'ferry' ? WATER_STOP_DISTANCE_METERS[mode] : MAX_STOP_DISTANCE_METERS
  const line = route.geometry.coordinates
  const count = route.selection.properties.Stop
  const limit = typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : Infinity
  const candidates = entries.flatMap(entry => {
    if (entry.selection.kind !== 'poi' || entry.geometry.type !== 'Point' ||
        typeof entry.selection.properties.Category !== 'string' ||
        !entry.selection.properties.Category.split(',').some(token => token.trim().startsWith('Stop')) ||
        !poiModes(entry.selection.properties.Category).includes(mode)) return []
    const position = projectOnLine(entry.geometry.coordinates as [number, number], line)
    return position ? [{ entry, ...position }] : []
  })
  return candidates
    .filter(entry => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.entry.selection.sourceFeatureId - b.entry.selection.sourceFeatureId)
    .slice(0, limit)
    .sort((a, b) => a.progress - b.progress || a.distance - b.distance)
    .map(candidate => candidate.entry)
}
