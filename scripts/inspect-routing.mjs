import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'exported_files', 'GeoJSON')
function collection(name) {
  return JSON.parse(readFileSync(join(root, name), 'utf8').replace(/^\uFEFF/, '')).features
}

const network = collection('Network_Centerline.json')
const roads = network.filter(feature => feature.properties.Object === 'Road')
const counts = items => Object.fromEntries([...new Set(items)].sort().map(key => [key, items.filter(item => item === key).length]))
const distance = (a, b) => Math.hypot((a[0] - b[0]) * 111_320 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 111_320)
const lineLength = line => line.slice(1).reduce((sum, point, index) => sum + distance(line[index], point), 0)
const key = point => `${point[0]},${point[1]}`
const parent = new Map()
function find(value) {
  const previous = parent.get(value)
  if (previous === undefined) { parent.set(value, value); return value }
  if (previous === value) return value
  const root = find(previous)
  parent.set(value, root)
  return root
}
function union(a, b) { parent.set(find(a), find(b)) }

const invalid = { geometry: 0, zeroLength: 0, direction: 0, limit: 0 }
const ratios = []
const endpoints = new Map()
for (const road of roads) {
  const line = road.geometry?.coordinates
  if (road.geometry?.type !== 'LineString' || !Array.isArray(line) || line.length < 2) { invalid.geometry++; continue }
  const length = lineLength(line)
  if (!(length > 0)) { invalid.zeroLength++; continue }
  if (!['Both', 'Forward', 'Backward'].includes(road.properties.Direction)) invalid.direction++
  if (!(road.properties.Limit > 0)) invalid.limit++
  const declared = road.properties.Length
  if (declared > 0) ratios.push(length / declared)
  const start = key(line[0]), end = key(line.at(-1))
  endpoints.set(start, (endpoints.get(start) ?? 0) + 1)
  endpoints.set(end, (endpoints.get(end) ?? 0) + 1)
  union(start, end)
}
ratios.sort((a, b) => a - b)
const componentSizes = new Map()
for (const point of parent.keys()) {
  const root = find(point)
  componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1)
}

const routes = collection('Route_Centerline.json')
const pois = collection('POI_Location.json')
const passengerRoutes = routes.filter(feature => feature.properties.Object === 'RoutePassenger')
const stopPois = pois.filter(feature => typeof feature.properties.Category === 'string' &&
  feature.properties.Category.split(',').some(token => token.trim().startsWith('Stop')))
console.log(JSON.stringify({
  roads: roads.length,
  direction: counts(roads.map(feature => feature.properties.Direction)),
  category: counts(roads.map(feature => feature.properties.Category)),
  limit: counts(roads.map(feature => feature.properties.Limit)),
  invalid,
  sharedEndpointLocations: [...endpoints.values()].filter(value => value > 1).length,
  isolatedEndpointLocations: [...endpoints.values()].filter(value => value === 1).length,
  components: componentSizes.size,
  largestComponentsByNodes: [...componentSizes.values()].sort((a, b) => b - a).slice(0, 10),
  coordinateLengthToExportLength: { samples: ratios.length, p10: ratios[Math.floor(ratios.length * 0.1)],
    median: ratios[Math.floor(ratios.length * 0.5)], p90: ratios[Math.floor(ratios.length * 0.9)] },
  passengerRoutes: passengerRoutes.length,
  stopPois: stopPois.length,
}, null, 2))
