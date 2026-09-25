import type { Position } from 'geojson'
import type { SearchEntry } from './Search'
import { normalizeText, propertyText } from './building-name'
import { distanceToRouteMeters, nearbyStops } from './route-stops'
import { poiModes, routeMode, type TransportMode } from './transport'

const FACILITY_DISTANCE_METERS = 25
const STOP_DISTANCE_METERS = 80

function distanceToBuilding(point: Position, rings: Position[][]): number {
  const longitudeScale = 111_320 * Math.cos(point[1] * Math.PI / 180)
  const latitudeScale = 111_320
  let nearest = Infinity
  let inside = false
  for (const ring of rings) {
    for (let index = 0; index < ring.length - 1; index++) {
      const start = ring[index]
      const end = ring[index + 1]
      if ((start[1] > point[1]) !== (end[1] > point[1]) &&
          point[0] < (end[0] - start[0]) * (point[1] - start[1]) / (end[1] - start[1]) + start[0]) inside = !inside
      const x = (start[0] - point[0]) * longitudeScale
      const y = (start[1] - point[1]) * latitudeScale
      const dx = (end[0] - start[0]) * longitudeScale
      const dy = (end[1] - start[1]) * latitudeScale
      const lengthSquared = dx * dx + dy * dy
      const fraction = lengthSquared ? Math.max(0, Math.min(1, -(x * dx + y * dy) / lengthSquared)) : 0
      nearest = Math.min(nearest, Math.hypot(x + fraction * dx, y + fraction * dy))
    }
  }
  return inside ? 0 : nearest
}

function sameNameAndAddress(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const fields = ['Name', 'Address_District', 'Address_Street', 'Address_Number']
  return fields.every(key => propertyText(a, key) &&
    normalizeText(propertyText(a, key)) === normalizeText(propertyText(b, key)))
}

function isStop(entry: SearchEntry): boolean {
  return entry.selection.kind === 'poi' &&
    typeof entry.selection.properties.Category === 'string' &&
    entry.selection.properties.Category.split(',').some(token => token.trim().startsWith('Stop'))
}

export function linkedBuildingRoutes(building: SearchEntry, entries: SearchEntry[]): SearchEntry[] {
  if (building.selection.kind !== 'building' || building.geometry.type !== 'Polygon' ||
      propertyText(building.selection.properties, 'Category') !== 'Public, Transportation') return []
  const rings = building.geometry.coordinates
  const modes = new Set<TransportMode>()
  for (const entry of entries) {
    if (entry.selection.kind !== 'poi' || entry.geometry.type !== 'Point' || isStop(entry)) continue
    const category = propertyText(entry.selection.properties, 'Category')
    if (!category.split(',').some(token => /^(Building|Depot)/.test(token.trim()))) continue
    if (!sameNameAndAddress(building.selection.properties, entry.selection.properties) &&
        distanceToBuilding(entry.geometry.coordinates, rings) > FACILITY_DISTANCE_METERS) continue
    for (const mode of poiModes(category)) modes.add(mode)
  }
  if (!modes.size) return []
  const buildingStops = entries.filter(entry => entry.geometry.type === 'Point' && isStop(entry) &&
    poiModes(entry.selection.properties.Category).some(mode => modes.has(mode)) &&
    distanceToBuilding(entry.geometry.coordinates, rings) <= STOP_DISTANCE_METERS)
  const stopIds = new Set(buildingStops.map(entry => entry.selection.id))
  if (!stopIds.size) return []
  const routes: SearchEntry[] = []
  for (const entry of entries) {
    if (entry.selection.kind !== 'route' || entry.geometry.type !== 'LineString') continue
    const mode = routeMode(entry.selection.properties.Transport)
    if (!mode || !modes.has(mode)) continue
    const line = entry.geometry.coordinates
    if (!buildingStops.some(stop => stop.geometry.type === 'Point' &&
        distanceToRouteMeters(stop.geometry.coordinates, line) <= 50)) continue
    if (nearbyStops(entry, entries).some(stop => stopIds.has(stop.selection.id))) routes.push(entry)
  }
  return routes
}
