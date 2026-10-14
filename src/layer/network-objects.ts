import type { FeatureCollection, LineString } from 'geojson'
import { networkObjectTypes } from '../data/network-objects'

export function prepareNetworkObjects(network: FeatureCollection<LineString>): Record<string, number> {
  const counts: Record<string, number> = Object.create(null)
  for (const feature of network.features) {
    const types = networkObjectTypes(feature.properties?.Object)
    feature.properties!._objectTypes = types
    for (const type of types) counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}
