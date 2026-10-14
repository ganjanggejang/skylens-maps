import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FeatureCollection, Geometry, LineString, Point, Polygon } from 'geojson'
import { indexPlaces } from '../data/place-index'
import type { Selection } from '../data/selection'
import { poiModes, routeMode, TRANSPORT_MODES, type TransportMode } from '../data/transport'
import { depotCategory, hasCategory, STATION_MODES, transportStations } from '../data/transport-stations'
import { addBaseLayers, addBuildingPlaceLayer, addDistrictLayers, addStationLayer, addSubwayPlaceLayers,
  addTransportLayers, addWaterLayer, GROUP_ORDER, INITIAL_VISIBILITY, setBuildingPlaceTier,
  setGroupVisibility } from '../layer/layers'
import { withoutSubwayBuildingDuplicates } from '../layer/place-labels'
import { addSelectionLayers } from '../layer/interaction'
import { addDirectionsLayers } from '../routing/directions-layers'
import { matchingStationBuilding } from '../routing/building-routes'
import { constrainMap, fit, fitPadding } from './camera'
import { installMapEvents } from './map-events'
import type { prepareMapData } from './prepare-map-data'

setWorkerUrl(workerUrl)

export function createCityMap(container: HTMLDivElement, data: ReturnType<typeof prepareMapData>,
  onSelect: (selection: Selection | null, geometry?: Geometry) => void) {
  const { buildings, network, extraInfo, city, all, lookup, places } = data
  let entries = data.entries
  const visibility = { ...INITIAL_VISIBILITY }
  let counts = data.counts
  let overviewZoom = 12
  let disposed = false
  let settled = false
  const transportCounts = {
    poi: Object.fromEntries(TRANSPORT_MODES.map(mode => [mode, 0])) as Record<TransportMode, number>,
    route: Object.fromEntries(TRANSPORT_MODES.map(mode => [mode, 0])) as Record<TransportMode, number>,
  }
  const map = new MapLibreMap({
    container,
    style: { version: 8, sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8ece8' } }] },
    center: [0, 0], zoom: 10, pitch: 0, maxPitch: 0,
    dragRotate: false, renderWorldCopies: false, attributionControl: false,
    crossSourceCollisions: true,
  })
  map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
  map.on('resize', () => constrainMap(map, all))
  let cancelReady = () => {}
  const ready = new Promise<void>((resolve, reject) => {
    cancelReady = resolve
    map.on('error', event => {
      if (!disposed && !settled) {
        settled = true
        reject(new Error(`지도 렌더링 오류: ${event.error?.message ?? '알 수 없는 오류'}`))
      }
    })
    map.on('load', () => {
      if (disposed || settled) return
      try {
        map.addSource('buildings', { type: 'geojson', data: buildings })
        map.addSource('network', { type: 'geojson', data: network })
        addBaseLayers(map)
        addBuildingPlaceLayer(map, places)
        for (const id of GROUP_ORDER) setGroupVisibility(map, id, visibility[id])
        addSelectionLayers(map)
        addDirectionsLayers(map)
        map.moveLayer('place-building-label')
        map.moveLayer('place-building-hover')
        installMapEvents(map, lookup, () => entries, onSelect)
        constrainMap(map, all)
        overviewZoom = map.cameraForBounds(city, { padding: fitPadding(), maxZoom: 15 })?.zoom ?? 12
        let shownTier = -1
        const updatePlaceZoom = () => {
          const delta = map.getZoom() - overviewZoom
          const tier = delta >= 3.5 ? 2 : delta >= 2 ? 1 : 0
          if (tier !== shownTier) { shownTier = tier; setBuildingPlaceTier(map, tier) }
        }
        map.on('zoom', updatePlaceZoom)
        fit(map, city)
        updatePlaceZoom()
        settled = true
        resolve()
      } catch (cause) { settled = true; reject(cause) }
    })
  })

  function installTransport(key: 'poi' | 'route', data: FeatureCollection<Point | LineString>) {
    const modeCounts = Object.fromEntries(TRANSPORT_MODES.map(mode => [mode, 0])) as Record<TransportMode, number>
    const additions = indexPlaces(extraInfo.datasetId, key, data)
    for (const [index, feature] of data.features.entries()) {
      feature.id = index
      const modes = key === 'poi' ? poiModes(feature.properties?.Category) :
        [routeMode(feature.properties?.Transport)].filter((mode): mode is TransportMode => mode !== null)
      feature.properties = { ...feature.properties,
        ...(key === 'poi' ? { _transportModes: modes } : { _transportMode: modes[0] ?? '' }) }
      for (const mode of modes) modeCounts[mode]++
      lookup.set(`${key}:${index}`, additions[index].selection)
    }
    map.addSource(key, { type: 'geojson', data })
    addTransportLayers(map, key)
    if (key === 'poi') {
      const pois = data as FeatureCollection<Point>
      for (const mode of STATION_MODES) {
        const stations = transportStations(pois, mode)
        addStationLayer(map, mode, stations)
        if (mode === 'subway') {
          addSubwayPlaceLayers(map, overviewZoom)
          map.getSource<GeoJSONSource>('building-places')?.setData(
            withoutSubwayBuildingDuplicates(places, stations))
        }
        const depot = depotCategory(mode)
        modeCounts[mode] = stations.features.length + (depot ?
          pois.features.filter(feature => hasCategory(feature, depot)).length : 0)
        for (const station of stations.features) {
          const sourceId = station.properties?._representativeSourceId
          if (typeof sourceId === 'number') {
            const building = mode === 'subway' ?
              matchingStationBuilding(station, entries) : undefined
            lookup.set(`${mode}-stations:${station.id}`,
              building?.selection ?? additions[sourceId].selection)
          }
        }
      }
    }

    transportCounts[key] = modeCounts
    counts = { ...counts, ...Object.fromEntries(TRANSPORT_MODES.map(mode =>
      [mode, transportCounts.poi[mode] + transportCounts.route[mode]])) }
    for (const mode of TRANSPORT_MODES) setGroupVisibility(map, mode, visibility[mode])
    entries = [...entries, ...additions]
  }

  function installArea(data: FeatureCollection<Polygon>) {
    const objects: Record<string, number> = Object.create(null)
    for (const feature of data.features) {
      const object = feature.properties?.Object
      if (typeof object === 'string') objects[object] = (objects[object] ?? 0) + 1
    }
    counts = { ...counts, districts: objects.District ?? 0 }
    if (!objects.District) visibility.districts = false
    if (data.features.length) {
      map.addSource('area', { type: 'geojson', data })
      addDistrictLayers(map, objects)
      setGroupVisibility(map, 'districts', visibility.districts)
    }
  }

  function installWater(image: HTMLImageElement) {
    try {
      addWaterLayer(map, extraInfo.water.coordinates!, image)
      setGroupVisibility(map, 'water', visibility.water)
    } catch (cause) {
      if (map.getLayer('water-raster')) map.removeLayer('water-raster')
      if (map.getSource('water')) map.removeSource('water')
      throw cause
    }
  }

  return { map, ready, get entries() { return entries }, visibility, get counts() { return counts },
    installTransport, installArea, installWater,
    dispose() {
      disposed = true
      cancelReady()
      map.remove()
      lookup.clear()
      entries = []
    },
  }
}

export type CityMap = ReturnType<typeof createCityMap>
