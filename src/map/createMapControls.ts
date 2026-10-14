import type { Geometry } from 'geojson'
import type { Selection } from '../data/selection'
import type { PlaceEntry } from '../data/place'
import { poiModes, routeMode, TRANSPORT_MODES, type TransportMode } from '../data/transport'
import { nearbyStops } from '../routing/route-stops'
import { linkedBuildingRoutes } from '../routing/building-routes'
import { ALWAYS_VISIBLE, setGroupVisibility, setTransportFocus, type GroupId, type Visibility } from '../layer/layers'
import { showSelection } from '../layer/interaction'
import { fit, geometryBounds } from './camera'
import type { CityMap } from './createCityMap'

export function createMapControls(scene: CityMap, onSelection: (next: Selection | null, returnId: string | null) => void,
  onVisibility: (visibility: Visibility) => void, onReveal: () => void) {
  const { map } = scene
  let selection: Selection | null = null
  let returnBuildingId: string | null = null
  let directionsOpen = false
  const autoTransportModes = new Set<TransportMode>()

  function updateTransportFocus() {
    const selected = selection
    const entry = selected ? scene.entries.find(item => item.selection.id === selected.id) : undefined
    const routes = entry?.selection.kind === 'route' ? [entry] :
      entry?.selection.kind === 'building' ? linkedBuildingRoutes(entry, scene.entries) : []
    const neededModes = new Set<TransportMode>()
    if (!directionsOpen && entry?.selection.kind === 'building') {
      for (const route of routes) {
        const mode = routeMode(route.selection.properties.Transport)
        if (mode && mode !== 'air') neededModes.add(mode)
      }
    } else if (!directionsOpen && entry?.selection.kind === 'route') {
      const mode = routeMode(entry.selection.properties.Transport)
      if (mode && autoTransportModes.has(mode)) neededModes.add(mode)
    } else if (!directionsOpen && entry?.selection.kind === 'poi') {
      for (const mode of poiModes(entry.selection.properties.Category)) {
        if (autoTransportModes.has(mode)) neededModes.add(mode)
      }
    }
    const nextVisibility = { ...scene.visibility }
    for (const mode of autoTransportModes) {
      if (!neededModes.has(mode)) nextVisibility[mode] = false
    }
    for (const mode of neededModes) {
      if (!nextVisibility[mode]) {
        nextVisibility[mode] = true
        autoTransportModes.add(mode)
      }
    }
    for (const mode of [...autoTransportModes]) {
      if (!neededModes.has(mode)) autoTransportModes.delete(mode)
    }
    if (TRANSPORT_MODES.some(mode => nextVisibility[mode] !== scene.visibility[mode])) {
      Object.assign(scene.visibility, nextVisibility)
      onVisibility({ ...scene.visibility })
      for (const mode of TRANSPORT_MODES) setGroupVisibility(map, mode, nextVisibility[mode])
    }
    setTransportFocus(map, !directionsOpen && routes.length ? { routes: routes.flatMap(route => {
      const mode = routeMode(route.selection.properties.Transport)
      return mode ? [{ mode, routeId: route.selection.sourceFeatureId,
        stopIds: nearbyStops(route, scene.entries).map(stop => stop.selection.sourceFeatureId) }] : []
    }) } : null)
  }


  function selectFeature(next: Selection | null, geometry?: Geometry) {
    returnBuildingId = null
    selection = next
    onSelection(next, null)
    if (map.getLayer('selected-road')) {
      showSelection(map, next, geometry)
      updateTransportFocus()
    }
  }

  function selectEntry(entry: PlaceEntry, preserveAutoTransport = false) {
    const selectedMode = entry.selection.kind === 'route' ? routeMode(entry.selection.properties.Transport) : null
    const poiMode = entry.selection.kind === 'poi' ? poiModes(entry.selection.properties.Category)[0] : null
    const mode = selectedMode ?? poiMode
    if (mode && (entry.selection.kind === 'poi' || mode !== 'air')) {
      if (!preserveAutoTransport) autoTransportModes.delete(mode)
      scene.visibility[mode] = true
      onVisibility({ ...scene.visibility })
      setGroupVisibility(map, mode, true)
    }
    selectFeature(entry.selection, entry.selection.kind === 'route' && (!selectedMode || selectedMode === 'air') ? undefined : entry.geometry)
    onReveal()
    if (entry.geometry.type === 'Point') {
      map.flyTo({ center: [entry.geometry.coordinates[0], entry.geometry.coordinates[1]],
        zoom: Math.max(map.getZoom(), 15), duration: 650 })
    } else fit(map, geometryBounds(entry.geometry.coordinates))
  }

  function selectBuildingRoute(entry: PlaceEntry) {
    const building = selection
    if (building?.kind !== 'building') return
    selectEntry(entry, true)
    returnBuildingId = building.id
    onSelection(selection, returnBuildingId)
  }

  function returnToBuilding() {
    const building = scene.entries.find(entry => entry.selection.id === returnBuildingId)
    if (building?.selection.kind === 'building') selectEntry(building)
    else { returnBuildingId = null; onSelection(selection, null) }
  }

  function toggleGroup(id: GroupId) {
    if (ALWAYS_VISIBLE.has(id)) return
    const next = !scene.visibility[id]
    const building = selection?.kind === 'building' ?
      scene.entries.find(entry => entry.selection.id === selection?.id) : undefined
    const routes = building ? linkedBuildingRoutes(building, scene.entries) : []
    if (!next && selection &&
      ((id === 'buildings' && selection.kind === 'building') ||
       (id === 'roads' && selection.kind === 'road') ||
       (selection.kind === 'route' && routeMode(selection.properties.Transport) === id) ||
       (selection.kind === 'poi' && poiModes(selection.properties.Category).includes(id as TransportMode)) ||
       (selection.kind === 'building' && routes.some(route => routeMode(route.selection.properties.Transport) === id)))) selectFeature(null)
    scene.visibility[id] = next
    onVisibility({ ...scene.visibility })
    setGroupVisibility(map, id, next)
    updateTransportFocus()
  }

  function setDirectionsOpen(open: boolean) {
    directionsOpen = open
    if (open) { returnBuildingId = null; onSelection(selection, null) }
    updateTransportFocus()
  }

  function focusStop(entry: PlaceEntry) {
    if (entry.geometry.type !== 'Point') return
    map.flyTo({ center: [entry.geometry.coordinates[0], entry.geometry.coordinates[1]],
      zoom: Math.max(map.getZoom(), 15), duration: 700 })
  }

  return { selectFeature, selectEntry, selectBuildingRoute, returnToBuilding, toggleGroup,
    setDirectionsOpen, focusStop, updateTransportFocus }
}

export type MapControls = ReturnType<typeof createMapControls>
