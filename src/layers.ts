import type { FilterSpecification, ImageSource, Map as MapLibreMap } from 'maplibre-gl'
import { TRANSPORT, TRANSPORT_MODES, type TransportMode } from './transport'

export const GROUPS = {
  water: { label: '수역', source: 'water', layers: ['water-raster'], defaultVisible: true, color: '#a6d0dd' },
  buildings: { label: '건물', source: 'buildings', layers: ['building-fill', 'building-outline'], defaultVisible: true, color: '#c49e86' },
  roads: { label: '도로', source: 'network', layers: ['road-casing', 'road-line'], defaultVisible: true, color: '#6f7977' },
  tracks: { label: '철도', source: 'network', layers: ['track-casing', 'track-line'], defaultVisible: true, color: '#6b5967' },
  pathways: { label: '보행로', source: 'network', layers: ['path-casing', 'path-line'], defaultVisible: false, color: '#a78052' },
  waterways: { label: '항로', source: 'network', layers: ['waterway-casing', 'waterway-line'], defaultVisible: false, color: '#5c97a7' },
  districts: { label: '행정구역', source: 'area', layers: ['district-fill', 'district-outline'], defaultVisible: false, color: '#679c83' },
  bus: { label: '버스', source: 'route', layers: ['transport-bus-route', 'transport-bus-poi'], defaultVisible: false, color: TRANSPORT.bus.color },
  train: { label: '기차', source: 'route', layers: ['transport-train-route', 'transport-train-poi'], defaultVisible: false, color: TRANSPORT.train.color },
  tram: { label: '전차', source: 'route', layers: ['transport-tram-route', 'transport-tram-poi'], defaultVisible: false, color: TRANSPORT.tram.color },
  subway: { label: '지하철', source: 'route', layers: ['transport-subway-route', 'transport-subway-poi'], defaultVisible: false, color: TRANSPORT.subway.color },
  ship: { label: '선박', source: 'route', layers: ['transport-ship-route', 'transport-ship-poi'], defaultVisible: false, color: TRANSPORT.ship.color },
  ferry: { label: '페리', source: 'route', layers: ['transport-ferry-route', 'transport-ferry-poi'], defaultVisible: false, color: TRANSPORT.ferry.color },
  air: { label: '항공', source: 'poi', layers: ['transport-air-poi'], defaultVisible: false, color: TRANSPORT.air.color },
} as const

export type GroupId = keyof typeof GROUPS
export type Visibility = Record<GroupId, boolean>

export const ALWAYS_VISIBLE = new Set<GroupId>(['water', 'buildings', 'roads', 'tracks'])
export const GROUP_ORDER: GroupId[] = ['water', 'buildings', 'roads', 'tracks', 'pathways', 'waterways', 'districts', ...TRANSPORT_MODES]
export const TOGGLEABLE_GROUPS = GROUP_ORDER.filter(id => !ALWAYS_VISIBLE.has(id))

export const INITIAL_VISIBILITY = Object.fromEntries(
  GROUP_ORDER.map(id => [id, GROUPS[id].defaultVisible]),
) as Visibility

const objectFilter = (object: string): ['==', ['get', string], string] => ['==', ['get', 'Object'], object]

export function addWaterLayer(map: MapLibreMap, coordinates: [[number, number], [number, number], [number, number], [number, number]], image: HTMLImageElement) {
  map.addSource('water', { type: 'image', coordinates })
  map.addLayer({
    id: 'water-raster', type: 'raster', source: 'water',
    layout: { visibility: 'none' },
    paint: { 'raster-fade-duration': 0 },
  }, 'building-fill')
  const source = map.getSource<ImageSource>('water')
  if (!source) throw new Error('수역 이미지 소스를 만들지 못했습니다')
  source.updateImage({ image })
}

export function addBaseLayers(map: MapLibreMap) {
  map.addLayer({
    id: 'building-fill', type: 'fill', source: 'buildings',
    paint: { 'fill-color': '#c49e86', 'fill-opacity': 0.9 },
  })
  map.addLayer({
    id: 'building-outline', type: 'line', source: 'buildings',
    paint: { 'line-color': '#6f584d', 'line-width': 1 },
  })

  map.addLayer({
    id: 'waterway-casing', type: 'line', source: 'network', filter: objectFilter('Waterway'),
    layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#477a8a', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 15, 8] },
  })
  map.addLayer({
    id: 'waterway-line', type: 'line', source: 'network', filter: objectFilter('Waterway'),
    layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#a5d6dd', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 15, 6] },
  })
  map.addLayer({
    id: 'road-casing', type: 'line', source: 'network', filter: objectFilter('Road'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#6f7977', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 15, 7] },
  })
  map.addLayer({
    id: 'road-line', type: 'line', source: 'network', filter: objectFilter('Road'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#fffdf6', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 15, 5] },
  })
  map.addLayer({
    id: 'path-casing', type: 'line', source: 'network', filter: objectFilter('Pathway'),
    layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#98744c', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 15, 5] },
  })
  map.addLayer({
    id: 'path-line', type: 'line', source: 'network', filter: objectFilter('Pathway'),
    layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#f4dfae', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 15, 3] },
  })
  map.addLayer({
    id: 'track-casing', type: 'line', source: 'network', filter: objectFilter('Track'),
    layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#534750', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 15, 6] },
  })
  map.addLayer({
    id: 'track-line', type: 'line', source: 'network', filter: objectFilter('Track'),
    layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#d8cbd1', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 15, 3] },
  })
}

export function addDistrictLayers(map: MapLibreMap, objects: Record<string, number>) {
  if (objects.District) {
    map.addLayer({
      id: 'district-fill', type: 'fill', source: 'area', filter: objectFilter('District'),
      layout: { visibility: 'none' },
      paint: { 'fill-color': '#81b79a', 'fill-opacity': 0.22 },
    }, 'building-fill')
    map.addLayer({
      id: 'district-outline', type: 'line', source: 'area', filter: objectFilter('District'),
      layout: { visibility: 'none' },
      paint: { 'line-color': '#4e8468', 'line-width': 1.5 },
    }, 'building-fill')
  }
}

export function addTransportLayers(map: MapLibreMap, source: 'poi' | 'route') {
  for (const mode of TRANSPORT_MODES) {
    const group = TRANSPORT[mode]
    if (source === 'route' && group.route) {
      map.addLayer({
        id: `transport-${mode}-route`, type: 'line', source: 'route',
        filter: ['==', ['get', '_transportMode'], mode],
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['coalesce', ['get', 'Color'], group.color],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 15, 5],
          'line-opacity': 0.9 },
      }, map.getLayer('transport-bus-poi') ? 'transport-bus-poi' : 'selected-building-fill')
    }
    if (source === 'poi') {
      map.addLayer({
        id: `transport-${mode}-poi`, type: 'circle', source: 'poi',
        filter: ['in', mode, ['get', '_transportModes']],
        layout: { visibility: 'none' },
        paint: { 'circle-color': group.color, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 6],
          'circle-stroke-color': '#fffdf9', 'circle-stroke-width': 1.5 },
      }, 'selected-building-fill')
    }
  }
}

export function setGroupVisibility(map: MapLibreMap, id: GroupId, visible: boolean) {
  const next = ALWAYS_VISIBLE.has(id) ? true : visible
  for (const layerId of GROUPS[id].layers) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', next ? 'visible' : 'none')
  }
}

export type TransportFocus = { routes: Array<{ mode: TransportMode; routeId: number; stopIds: number[] }> }

export function setTransportFocus(map: MapLibreMap, focus: TransportFocus | null) {
  for (const mode of TRANSPORT_MODES) {
    const routeLayer = `transport-${mode}-route`
    const poiLayer = `transport-${mode}-poi`
    const routeIds = focus?.routes.filter(route => route.mode === mode).map(route => route.routeId) ?? []
    const stopIds = focus?.routes.filter(route => route.mode === mode).flatMap(route => route.stopIds) ?? []
    if (map.getLayer(routeLayer)) {
      const filter: FilterSpecification = focus ?
        routeIds.length ? ['in', ['id'], ['literal', routeIds]] : ['==', ['id'], -1] :
        ['==', ['get', '_transportMode'], mode]
      map.setFilter(routeLayer, filter)
    }
    if (map.getLayer(poiLayer)) {
      const filter: FilterSpecification = focus ?
        stopIds.length ? ['in', ['id'], ['literal', stopIds]] : ['==', ['id'], -1] :
        ['in', mode, ['get', '_transportModes']]
      map.setFilter(poiLayer, filter)
    }
  }
}
