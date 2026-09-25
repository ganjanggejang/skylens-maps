import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { Geometry } from 'geojson'

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
    paint: { 'line-color': '#ed8228', 'line-width': 6 } })
  map.addLayer({ id: 'selected-poi', type: 'circle', source: 'selected-extra',
    paint: { 'circle-radius': 9, 'circle-color': '#ed8228', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })
}

export function showSelection(map: MapLibreMap, selection: Selection | null, geometry?: Geometry) {
  const buildingFilter = selectionFilter(selection?.kind === 'building' ? selection.sourceFeatureId : -1)
  const roadFilter = selectionFilter(selection?.kind === 'road' ? selection.sourceFeatureId : -1)
  map.setFilter('selected-building-fill', buildingFilter)
  map.setFilter('selected-building-outline', buildingFilter)
  map.setFilter('selected-road', roadFilter)
  const source = map.getSource<import('maplibre-gl').GeoJSONSource>('selected-extra')
  if (source) source.setData({ type: 'FeatureCollection', features: selection && geometry && (selection.kind === 'poi' || selection.kind === 'route') ?
    [{ type: 'Feature', properties: {}, geometry }] : [] })
}
