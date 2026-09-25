import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'exported_files', 'GeoJSON')
const features = name => JSON.parse(readFileSync(join(root, name), 'utf8').replace(/^\uFEFF/, '')).features
const routes = features('Route_Centerline.json').filter(feature => feature.properties.Object === 'RoutePassenger')
const walking = features('Network_Centerline.json').filter(feature => feature.properties.Object === 'Pathway' ||
  feature.properties.Object === 'Road' && feature.properties.Category !== 'Highway')
console.log('Walking centerline points', walking.reduce((sum, feature) => sum + feature.geometry.coordinates.length, 0))
const pois = features('POI_Location.json')
const categories = new Map()
for (const poi of pois) categories.set(poi.properties.Category, (categories.get(poi.properties.Category) ?? 0) + 1)
console.log('POI categories', JSON.stringify(Object.fromEntries([...categories].filter(([name]) => name?.includes('Stop')))))
console.log('Passenger routes', JSON.stringify(routes.map((route, index) => ({
  index, name: route.properties.Name, transport: route.properties.Transport,
  stop: route.properties.Stop, points: route.geometry.coordinates.length,
  first: route.geometry.coordinates[0], last: route.geometry.coordinates.at(-1),
}))))
