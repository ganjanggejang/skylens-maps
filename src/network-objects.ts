import type { FeatureCollection, LineString } from 'geojson'

// Carto can label one network segment with several Object types in a single string.
export function networkObjectTypes(value: unknown): string[] {
  return typeof value === 'string' ? [...new Set(value.split(',').map(type => type.trim()).filter(Boolean))] : []
}

export function hasNetworkObject(value: unknown, type: string): boolean {
  return networkObjectTypes(value).includes(type)
}

export function prepareNetworkObjects(network: FeatureCollection<LineString>): Record<string, number> {
  const counts: Record<string, number> = Object.create(null)
  for (const feature of network.features) {
    const types = networkObjectTypes(feature.properties?.Object)
    feature.properties!._objectTypes = types
    for (const type of types) counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}
