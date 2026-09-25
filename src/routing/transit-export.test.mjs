import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { TransitPlanner } from './transit-planner'
import { placeCoordinate } from './geometry'

const root = join(process.cwd(), 'exported_files', 'GeoJSON')
const available = ['Network_Centerline.json', 'POI_Location.json', 'Route_Centerline.json']
  .every(name => existsSync(join(root, name)))
const read = name => JSON.parse(readFileSync(join(root, name), 'utf8').replace(/^\uFEFF/, ''))

it.skipIf(!available)('builds at least one usable journey from the current Export', () => {
  const start = performance.now()
  const planner = new TransitPlanner(read('Network_Centerline.json'),
    read('POI_Location.json'), read('Route_Centerline.json'))
  const buildMs = Math.round(performance.now() - start)
  expect(planner.data.routes.length).toBeGreaterThan(0)
  let found = false
  for (const route of planner.data.routes) {
    const first = planner.data.stops[planner.data.occurrences[route.occurrences[0]].stopId]
    const last = planner.data.stops[planner.data.occurrences[route.occurrences.at(-1)].stopId]
    const result = planner.route(first.point, last.point)
    if (result.journey) {
      console.log(`Transit Export: ${planner.data.routes.length} routes, ${planner.data.occurrences.length} occurrences, ${buildMs}ms build, ${Math.round(performance.now() - start - buildMs)}ms search, ${route.name}`)
      found = true
      break
    }
  }
  expect(found).toBe(true)
  const buildings = existsSync(join(root, 'Building_Boundary.json')) ? read('Building_Boundary.json').features : []
  const cityHall = buildings.find(feature => feature.properties?.Name === '줄리아나 구청')
  const presidentialOffice = buildings.find(feature => feature.properties?.Name === '대통령실')
  if (cityHall && presidentialOffice) {
    const result = planner.route(placeCoordinate(cityHall.geometry), placeCoordinate(presidentialOffice.geometry))
    expect(result.journey).toBeDefined()
  }
}, 120_000)
