import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { distanceMeters, type Coordinate } from './routing/geometry'
import type { RouteResult, TransitJourney } from './routing/types'

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
  map.addSource('directions-transit', { type: 'geojson', data: emptyLines })
  map.addSource('directions-points', { type: 'geojson', data: emptyPoints })
  map.addLayer({ id: 'directions-line', type: 'line', source: 'directions-line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#e16028', 'line-width': 6, 'line-opacity': 0.9 } })
  map.addLayer({ id: 'directions-transit-walk', type: 'line', source: 'directions-transit',
    filter: ['==', ['get', 'kind'], 'walk'], layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#445b6b', 'line-width': 4, 'line-dasharray': [1, 2] } })
  map.addLayer({ id: 'directions-transit-ride', type: 'line', source: 'directions-transit',
    filter: ['==', ['get', 'kind'], 'ride'], layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 6, 'line-opacity': 0.95 } })
  map.addLayer({ id: 'directions-points', type: 'circle', source: 'directions-points',
    paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })
}

export function showDirections(map: MapLibreMap, result: RouteResult | null, journey: TransitJourney | null,
  origin: Coordinate | null, destination: Coordinate | null) {
  map.getSource<GeoJSONSource>('directions-line')?.setData(result ? routeLines(result) : emptyLines)
  map.getSource<GeoJSONSource>('directions-transit')?.setData(journey ? {
    type: 'FeatureCollection', features: journey.legs.filter(leg => leg.kind !== 'wait' && leg.coordinates.length >= 2)
      .map(leg => ({ type: 'Feature', properties: { kind: leg.kind, color: leg.color ?? '#445b6b' },
        geometry: { type: 'LineString', coordinates: leg.coordinates } })),
  } : emptyLines)
  const boardingPoints = journey ? journey.legs.filter(leg => leg.kind === 'ride' && leg.coordinates.length)
    .flatMap(leg => [{ point: leg.coordinates[0], color: '#f7f8f2' },
      { point: leg.coordinates.at(-1)!, color: leg.color ?? '#445b6b' }]) : []
  map.getSource<GeoJSONSource>('directions-points')?.setData({ type: 'FeatureCollection', features: [
    ...boardingPoints.map(({ point, color }) => ({ type: 'Feature' as const, properties: { color },
      geometry: { type: 'Point' as const, coordinates: point } })),
    ...(origin ? [{ type: 'Feature' as const, properties: { color: '#258b72' },
      geometry: { type: 'Point' as const, coordinates: origin } }] : []),
    ...(destination ? [{ type: 'Feature' as const, properties: { color: '#b74539' },
      geometry: { type: 'Point' as const, coordinates: destination } }] : []),
  ] })
}
