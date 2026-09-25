import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { distanceMeters, type Coordinate } from './routing/geometry'
import type { RouteResult } from './routing/types'

const emptyLines: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] }
const emptyPoints: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] }

export function routeLines(result: RouteResult): FeatureCollection<LineString> {
  const lines: Coordinate[][] = []
  for (const [start, end] of result.coordinates) {
    const current = lines.at(-1)
    if (current && distanceMeters(current.at(-1)!, start) < 0.02) current.push(end)
    else lines.push([start, end])
  }
  return { type: 'FeatureCollection', features: lines.map(coordinates => ({
    type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates },
  })) }
}

export function addDirectionsLayers(map: MapLibreMap) {
  map.addSource('directions-line', { type: 'geojson', data: emptyLines })
  map.addSource('directions-points', { type: 'geojson', data: emptyPoints })
  map.addLayer({ id: 'directions-line', type: 'line', source: 'directions-line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#e16028', 'line-width': 6, 'line-opacity': 0.9 } })
  map.addLayer({ id: 'directions-points', type: 'circle', source: 'directions-points',
    paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })
}

export function showDirections(map: MapLibreMap, result: RouteResult | null,
  origin: Coordinate | null, destination: Coordinate | null) {
  map.getSource<GeoJSONSource>('directions-line')?.setData(result ? routeLines(result) : emptyLines)
  map.getSource<GeoJSONSource>('directions-points')?.setData({ type: 'FeatureCollection', features: [
    ...(origin ? [{ type: 'Feature' as const, properties: { color: '#258b72' },
      geometry: { type: 'Point' as const, coordinates: origin } }] : []),
    ...(destination ? [{ type: 'Feature' as const, properties: { color: '#b74539' },
      geometry: { type: 'Point' as const, coordinates: destination } }] : []),
  ] })
}
