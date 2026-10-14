import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Geometry } from 'geojson'
import type { Selection } from '../data/selection'
import type { PlaceEntry } from '../data/place'
import { TRANSPORT_MODES } from '../data/transport'
import { STATION_MODES } from '../data/transport-stations'

export function installMapEvents(map: MapLibreMap, lookup: Map<string, Selection>, getEntries: () => PlaceEntry[],
  onSelect: (selection: Selection | null, geometry?: Geometry) => void) {
  let hovered: { source: string; id: string | number } | null = null
  const clearHover = () => {
    if (hovered) map.setFeatureState(hovered, { hover: false })
    hovered = null
  }
  map.on('mouseout', () => {
    clearHover()
    map.getCanvas().style.cursor = ''
  })
  map.on('movestart', clearHover)
  map.on('click', event => {
    const radius = 6
    const point = event.point
    const transportPoiLayers = [...TRANSPORT_MODES.map(mode => `transport-${mode}-poi`),
      ...STATION_MODES.map(mode => `transport-${mode}-depot`),
      'place-subway-label'].filter(id => map.getLayer(id))
    const transportRouteLayers = TRANSPORT_MODES.map(mode => `transport-${mode}-route`).filter(id => map.getLayer(id))
    const poi = transportPoiLayers.length ? map.queryRenderedFeatures(event.point, { layers: transportPoiLayers })[0] : undefined
    const poiIsFacility = !poi?.layer.id.startsWith('place-') && typeof poi?.properties?.Category === 'string' &&
      poi.properties.Category.split(',').some((token: string) => /^(Building|Depot)/.test(token.trim()))
    const route = !poi && transportRouteLayers.length ? map.queryRenderedFeatures(
      [[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]],
      { layers: transportRouteLayers },
    )[0] : undefined
    const building = poi && !poiIsFacility || route ? undefined :
      map.queryRenderedFeatures(event.point, { layers: ['place-building-label', 'building-fill'] })[0]
    const road = building || poi || route ? undefined : map.queryRenderedFeatures(
      [[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]],
      { layers: ['road-line'] },
    )[0]
    const hit = poiIsFacility && building ? building : poi ?? route ?? building ?? road
    const next = hit?.id === undefined ? null : lookup.get(`${hit.source}:${hit.id}`) ?? null
    const selectedGeometry = next?.kind === 'poi' || next?.kind === 'route' ?
      hit?.source.endsWith('-stations') ? hit.geometry as Geometry :
        getEntries().find(entry => entry.selection.id === next.id)?.geometry : undefined
    onSelect(next, selectedGeometry)
  })
  map.on('mousemove', event => {
    const point = event.point
    const hoverLayers = ['place-building-label', 'place-subway-label',
      ...TRANSPORT_MODES.map(mode => `transport-${mode}-poi`),
      ...STATION_MODES.map(mode => `transport-${mode}-depot`)]
      .filter(id => map.getLayer(id))
    const hit = !map.isMoving() && hoverLayers.length ?
      map.queryRenderedFeatures(point, { layers: hoverLayers })[0] : undefined
    const next = hit?.id === undefined ? null : { source: hit.source, id: hit.id }
    if (next?.source !== hovered?.source || next?.id !== hovered?.id) {
      clearHover()
      hovered = next
      if (hovered) map.setFeatureState(hovered, { hover: true })
    }
    const building = map.queryRenderedFeatures(point,
      { layers: ['place-building-label', 'building-fill'] }).length > 0
    const transportLayers = [...TRANSPORT_MODES.flatMap(mode => [`transport-${mode}-poi`, `transport-${mode}-route`]),
      ...STATION_MODES.map(mode => `transport-${mode}-depot`),
      'place-subway-label']
      .filter(id => map.getLayer(id))
    const transport = transportLayers.length > 0 && map.queryRenderedFeatures(
      [[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]], { layers: transportLayers },
    ).length > 0
    const road = building || map.queryRenderedFeatures(
      [[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]],
      { layers: ['road-line'] },
    ).length > 0
    map.getCanvas().style.cursor = building || transport || road ? 'pointer' : ''
  })
}
