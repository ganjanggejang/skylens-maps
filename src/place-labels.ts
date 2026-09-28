import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'
import { normalizeText, propertyText } from './building-name'

export type BuildingPlace = Feature<Polygon, { label: string; tier: number; sortKey: number;
  addressKey: string; category: string }>
export type BuildingPlaces = FeatureCollection<Polygon, BuildingPlace['properties']>

const METERS_PER_DEGREE = 111_320
const LOCAL_RADIUS = 600

function areaMeters(polygon: Polygon): number {
  const latitude = polygon.coordinates[0]?.[0]?.[1] ?? 0
  const scale = METERS_PER_DEGREE ** 2 * Math.cos(latitude * Math.PI / 180)
  return Math.abs(polygon.coordinates.reduce((total, ring, index) => {
    let doubleArea = 0
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = ring[i]
      const [nextX, nextY] = ring[(i + 1) % ring.length]
      doubleArea += x * nextY - nextX * y
    }
    return total + (index === 0 ? 1 : -1) * Math.abs(doubleArea)
  }, 0)) * scale / 2
}

function center(polygon: Polygon): [number, number] {
  const ring = polygon.coordinates[0] ?? []
  const points = ring.length > 1 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1] ?
    ring.slice(0, -1) : ring
  if (!points.length) return [0, 0]
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length]
}

function percentile(sorted: number[], value: number): number {
  if (!sorted.length) return 0
  let low = 0
  let high = sorted.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (sorted[middle] <= value) low = middle + 1
    else high = middle
  }
  const upper = low
  low = 0
  high = upper
  while (low < high) {
    const middle = (low + high) >>> 1
    if (sorted[middle] < value) low = middle + 1
    else high = middle
  }
  return (low + upper) / (2 * sorted.length)
}

function pointScore(p: number, high: number, medium: number, highPoints: number, mediumPoints: number) {
  return p >= high ? highPoints : p >= medium ? mediumPoints : 0
}

function numberProperty(properties: Record<string, unknown>, key: string): number {
  const value = properties[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function addressKey(properties: Record<string, unknown>): string {
  const parts = ['Address_District', 'Address_Street', 'Address_Number']
    .map(key => normalizeText(propertyText(properties, key)))
  return parts.every(Boolean) ? parts.join('|') : ''
}

function comparableName(value: string): string {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, '')
}

function publicClass(category: string): string | null {
  const tokens = category.split(',').map(token => token.trim())
  if (!tokens.includes('Public') || tokens.includes('Extension')) return null
  if (tokens.includes('Parking')) return 'Parking'
  return ['Admin', 'Research', 'Health', 'Transportation', 'Education', 'Police', 'Fire',
    'Disaster', 'Park'].find(token => tokens.includes(token)) ?? 'Other'
}

type Measured = { feature: Feature<Polygon>; index: number; area: number; x: number; y: number }

export function buildingPlaces(buildings: FeatureCollection<Polygon>): BuildingPlaces {
  const measured: Measured[] = buildings.features.map((feature, index) => {
    const [longitude, latitude] = center(feature.geometry)
    return { feature, index, area: areaMeters(feature.geometry),
      x: longitude * METERS_PER_DEGREE * Math.cos(latitude * Math.PI / 180),
      y: latitude * METERS_PER_DEGREE }
  })
  const assets = new Map<string, number>()
  const names = new Map<string, number>()
  const byZone = new Map<string, Measured[]>()
  const byCell = new Map<string, Measured[]>()
  const publicAreas: number[] = []
  for (const item of measured) {
    const properties = item.feature.properties ?? {}
    const asset = propertyText(properties, 'Asset')
    const name = normalizeText(propertyText(properties, 'Name'))
    assets.set(asset, (assets.get(asset) ?? 0) + 1)
    names.set(name, (names.get(name) ?? 0) + 1)
    if (propertyText(properties, 'Category') === 'Property') {
      const zone = propertyText(properties, 'Zoning')
      const peers = byZone.get(zone) ?? []
      peers.push(item)
      byZone.set(zone, peers)
      const key = `${Math.floor(item.x / LOCAL_RADIUS)}:${Math.floor(item.y / LOCAL_RADIUS)}`
      const cell = byCell.get(key) ?? []
      cell.push(item)
      byCell.set(key, cell)
    } else if (publicClass(propertyText(properties, 'Category'))) publicAreas.push(item.area)
  }
  publicAreas.sort((a, b) => a - b)
  const zoneMetrics = new Map([...byZone].map(([zone, peers]) => [zone, {
    areas: peers.map(item => item.area).sort((a, b) => a - b),
    residents: peers.map(item => numberProperty(item.feature.properties ?? {}, 'Resident')).sort((a, b) => a - b),
    employees: peers.map(item => numberProperty(item.feature.properties ?? {}, 'Employee')).sort((a, b) => a - b),
  }]))

  const features: BuildingPlace[] = []
  for (const item of measured) {
    const properties = item.feature.properties ?? {}
    const name = propertyText(properties, 'Name')
    if (!name) continue
    const category = propertyText(properties, 'Category')
    let score: number
    let tier: number
    if (category === 'Property') {
      const zoneName = propertyText(properties, 'Zone')
      if (!zoneName || normalizeText(name) === normalizeText(zoneName)) continue
      const metrics = zoneMetrics.get(propertyText(properties, 'Zoning'))
      if (!metrics) continue
      const asset = propertyText(properties, 'Asset')
      const assetCount = assets.get(asset) ?? 0
      const areaPercentile = percentile(metrics.areas, item.area)
      const resident = numberProperty(properties, 'Resident')
      const employee = numberProperty(properties, 'Employee')
      const capacityPercentile = Math.max(
        resident > 0 ? percentile(metrics.residents, resident) : 0,
        employee > 0 ? percentile(metrics.employees, employee) : 0,
      )
      const cellX = Math.floor(item.x / LOCAL_RADIUS)
      const cellY = Math.floor(item.y / LOCAL_RADIUS)
      const localAreas: number[] = []
      for (let x = cellX - 1; x <= cellX + 1; x++) {
        for (let y = cellY - 1; y <= cellY + 1; y++) {
          for (const peer of byCell.get(`${x}:${y}`) ?? []) {
            if (Math.hypot(peer.x - item.x, peer.y - item.y) <= LOCAL_RADIUS) localAreas.push(peer.area)
          }
        }
      }
      localAreas.sort((a, b) => a - b)
      const localPercentile = localAreas.length >= 10 ? percentile(localAreas, item.area) : 0
      const comparable = comparableName(name)
      const assetName = comparableName(asset)
      score = 95 + (assetCount === 1 ? 12 : assetCount <= 3 ? 6 : 0) +
        (comparable.length >= 4 && assetName.includes(comparable) ? 6 : 0) +
        pointScore(areaPercentile, .99, .95, 25, 15) +
        pointScore(capacityPercentile, .95, .8, 18, 8) +
        pointScore(localPercentile, .9, .75, 10, 5)
      tier = score >= 145 ? 0 : score >= 120 ? 1 : 2
    } else {
      const kind = publicClass(category)
      if (!kind || kind === 'Parking') continue
      const base: Record<string, number> = { Admin: 95, Research: 95, Health: 85,
        Transportation: 85, Education: 77, Police: 70, Fire: 70, Disaster: 70,
        Park: 45, Other: 45 }
      const frequency = names.get(normalizeText(name)) ?? 1
      score = base[kind] + (frequency === 1 ? 10 : frequency <= 3 ? 5 : frequency >= 10 ? -8 : 0) +
        pointScore(percentile(publicAreas, item.area), .99, .9, 25, 15)
      if (score < 45) continue
      tier = score >= 115 ? 0 : score >= 80 ? 1 : 2
    }
    features.push({ type: 'Feature', id: item.index, geometry: item.feature.geometry,
      properties: { label: name, tier, sortKey: -score, addressKey: addressKey(properties), category } })
  }
  return { type: 'FeatureCollection', features }
}

export function withoutSubwayBuildingDuplicates(places: BuildingPlaces,
  stations: FeatureCollection<Point>): BuildingPlaces {
  const stationAddresses = new Set(stations.features.map(station =>
    addressKey(station.properties ?? {})).filter(Boolean))
  return { type: 'FeatureCollection', features: places.features.filter(feature =>
    !feature.properties.category.split(',').map(token => token.trim()).includes('Transportation') ||
    !feature.properties.addressKey || !stationAddresses.has(feature.properties.addressKey)) }
}
