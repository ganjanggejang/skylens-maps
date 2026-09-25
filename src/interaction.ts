import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl'

export type Selection = {
  id: string
  sourceFeatureId: number
  kind: 'building' | 'road'
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
}

export function showSelection(map: MapLibreMap, selection: Selection | null) {
  const buildingFilter = selectionFilter(selection?.kind === 'building' ? selection.sourceFeatureId : -1)
  const roadFilter = selectionFilter(selection?.kind === 'road' ? selection.sourceFeatureId : -1)
  map.setFilter('selected-building-fill', buildingFilter)
  map.setFilter('selected-building-outline', buildingFilter)
  map.setFilter('selected-road', roadFilter)
}
