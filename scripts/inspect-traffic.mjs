import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'exported_files', 'GeoJSON')
for (const name of ['Network_Centerline', 'Network_Boundary', 'Route_Centerline', 'POI_Location']) {
  const data = JSON.parse(readFileSync(join(root, `${name}.json`), 'utf8').replace(/^\uFEFF/, ''))
  const keys = new Map(), objects = new Map()
  for (const feature of data.features) {
    objects.set(feature.properties.Object, (objects.get(feature.properties.Object) ?? 0) + 1)
    for (const key of Object.keys(feature.properties)) keys.set(key, (keys.get(key) ?? 0) + 1)
  }
  console.log(name, JSON.stringify({ features: data.features.length,
    objects: Object.fromEntries(objects), keys: Object.fromEntries(keys) }))
  if (name === 'Network_Centerline') {
    const roads = data.features.filter(feature => feature.properties.Object === 'Road')
    const closed = roads.filter(feature => {
      const line = feature.geometry.coordinates
      return line.length >= 4 && line[0][0] === line.at(-1)[0] && line[0][1] === line.at(-1)[1]
    })
    const endpoints = new Map()
    for (const feature of roads) {
      const line = feature.geometry.coordinates
      for (const point of [line[0], line.at(-1)]) {
        const key = `${point[0]},${point[1]}`
        endpoints.set(key, (endpoints.get(key) ?? 0) + 1)
      }
    }
    const matched = closed.map(feature => ({
      name: feature.properties.Name,
      direction: feature.properties.Direction,
      matches: feature.geometry.coordinates.slice(1, -1).filter(point =>
        endpoints.has(`${point[0]},${point[1]}`)).length,
    }))
    console.log('closed-road-centerlines', JSON.stringify({ total: closed.length,
      withEndpointMatches: matched.filter(feature => feature.matches > 0).length,
      names: Object.fromEntries([...new Set(matched.map(feature => feature.name))]
        .map(name => [name, matched.filter(feature => feature.name === name).length])),
      matchedVertices: matched.reduce((sum, feature) => sum + feature.matches, 0),
      sample: matched.slice(0, 8) }))
  }
}
