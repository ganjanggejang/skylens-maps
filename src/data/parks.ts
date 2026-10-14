import type { FeatureCollection, MultiPolygon } from 'geojson'
import type { BuildingData } from './types'

export type ParkAreas = FeatureCollection<MultiPolygon, { kind: 'block' | 'individual' }>

export function isPark(properties: Record<string, unknown> | null) {
  return String(properties?.Category ?? '').split(',').some(token => token.trim() === 'Park')
}

export function individualParkAreas(buildings: BuildingData): ParkAreas {
  return { type: 'FeatureCollection', features: buildings.features.filter(f => isPark(f.properties)).map(f => ({
    type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [f.geometry.coordinates] },
    properties: { kind: 'individual' },
  })) }
}
