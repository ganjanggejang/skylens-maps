import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { Geometry } from 'geojson'
import { routeMode, TRANSPORT } from './transport'

export type Selection = {
  id: string
  sourceFeatureId: number
  kind: 'building' | 'road' | 'poi' | 'route'
  properties: Record<string, unknown>
}

const selectionFilter = (id: number): FilterSpecification => ['==', ['id'], id]

export function addSelectionLayers(map: MapLibreMap) {
  map.addLayer({
    id: 'selected-building-fill', type: 'fill', source: 'buildings', filter: selectionFilter(-1),
    paint: { 'fill-color': '#f5b942', 'fill-opacity': 0.5 },
  })
  map.addLayer({
    id: 'selected-building-outline', type: 'line', source: 'buildings', filter: selectionFilter(-1),
    paint: { 'line-color': '#ad5d11', 'line-width': 3 },
  })
  map.addLayer({
    id: 'selected-road', type: 'line', source: 'network', filter: selectionFilter(-1),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ec8c23', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 15, 10] },
  })
  map.addSource('selected-extra', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'selected-route', type: 'line', source: 'selected-extra',
    filter: ['==', ['get', '_selectionKind'], 'route'],
    paint: { 'line-color': ['get', 'Color'], 'line-width': 6 } })
  map.addLayer({ id: 'selected-poi', type: 'circle', source: 'selected-extra',
    filter: ['==', ['get', '_selectionKind'], 'poi'],
    paint: { 'circle-radius': 9, 'circle-color': '#ed8228', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })
}

function selectedRouteColor(selection: Selection): string {
  const color = selection.properties.Color
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) return color
  const mode = routeMode(selection.properties.Transport)
  return mode ? TRANSPORT[mode].color : '#ed8228'
}

export function showSelection(map: MapLibreMap, selection: Selection | null, geometry?: Geometry) {
  const buildingFilter = selectionFilter(selection?.kind === 'building' ? selection.sourceFeatureId : -1)
  const roadFilter = selectionFilter(selection?.kind === 'road' ? selection.sourceFeatureId : -1)
  map.setFilter('selected-building-fill', buildingFilter)
  map.setFilter('selected-building-outline', buildingFilter)
  map.setFilter('selected-road', roadFilter)
  const source = map.getSource<import('maplibre-gl').GeoJSONSource>('selected-extra')
  if (source) source.setData({ type: 'FeatureCollection', features: selection && geometry && (selection.kind === 'poi' || selection.kind === 'route') ?
    [{ type: 'Feature', properties: { _selectionKind: selection.kind,
      Color: selection.kind === 'route' ? selectedRouteColor(selection) : undefined }, geometry }] : [] })
}
