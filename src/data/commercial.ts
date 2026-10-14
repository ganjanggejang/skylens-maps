import type { FeatureCollection, MultiPolygon } from 'geojson'
import { isPark } from './parks'

export type CommercialAreas = FeatureCollection<MultiPolygon, { kind: 'corridor' | 'block' }>

export function isCommercial(properties: Record<string, unknown> | null) {
  return (
    !isPark(properties) &&
    String(properties?.Zoning ?? '')
      .split(',')
      .some((token) => token.trim() === 'Commercial')
  )
}

export const emptyCommercialAreas = (): CommercialAreas => ({
  type: 'FeatureCollection',
  features: [],
})
