import type { FeatureCollection, LineString, Point, Polygon } from 'geojson'
import type { PlaceEntry } from './place'
import { hasNetworkObject } from './network-objects'

export function indexPlaces(datasetId: string, source: 'buildings' | 'network' | 'poi' | 'route',
  data: FeatureCollection<Point | LineString | Polygon>): PlaceEntry[] {
  const entries: PlaceEntry[] = []
  for (const [index, feature] of data.features.entries()) {
    feature.id = index
    if (source === 'network' && !hasNetworkObject(feature.properties?.Object, 'Road')) continue
    entries.push({
      selection: { id: `${datasetId}:${source}:${index}`, sourceFeatureId: index,
        kind: source === 'buildings' ? 'building' : source === 'network' ? 'road' : source,
        properties: { ...feature.properties } },
      geometry: feature.geometry,
    })
  }
  return entries
}
