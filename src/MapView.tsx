import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FeatureCollection, Geometry, LineString, Point, Polygon } from 'geojson'
import { addBaseLayers, addDistrictLayers, addTransportLayers, addWaterLayer, ALWAYS_VISIBLE, GROUP_ORDER, GROUPS, INITIAL_VISIBILITY, setGroupVisibility, setTransportFocus, type GroupId, type Visibility } from './layers'
import { poiModes, routeMode, TRANSPORT_MODES, type TransportMode } from './transport'
import { nearbyStops } from './route-stops'
import { linkedBuildingRoutes } from './building-routes'
import { addSelectionLayers, showSelection, type Selection } from './interaction'
import { Sidebar, type Counts, type SourceKey, type SourceState, type SourceStates } from './Sidebar'
import { LayerControls } from './LayerControls'
import { useI18n, localizeKnownError } from './i18n'
import type { SearchEntry, SearchSourceState } from './Search'
import type { DirectionPlace } from './Directions'
import type { RouteOutcome, TransitOutcome } from './routing/types'
import { placeCoordinate } from './routing/geometry'
import { addDirectionsLayers, showDirections } from './directions-layers'
import { ROUTING_CONFIG } from './routing/config'
import './snapshot.css'

type BuildingData = FeatureCollection<Polygon>
type NetworkData = FeatureCollection<LineString>
type Extent = [number, number, number, number]
type Bounds = [[number, number], [number, number]]
type AreaInfo = { objects: Record<string, number>; error?: string }
type WaterInfo = { coordinates?: [[number, number], [number, number], [number, number], [number, number]]; waterPixels?: number; error?: string }

let dataRoot = '/data'
let activeSnapshotId = ''
async function fetchMapResource(input: string | URL, init?: RequestInit) {
  try { return await fetch(input, init) }
  catch {
    throw new Error(import.meta.env.DEV ? '개발 서버에 연결할 수 없습니다' :
      '게임과 지도 연결이 끊겼습니다. 게임이 실행 중인지 확인한 뒤 게임에서 지도를 다시 여세요.')
  }
}
async function configureDataRoot() {
  if (import.meta.env.DEV) { dataRoot = '/data'; activeSnapshotId = ''; return }
  const response = await fetchMapResource(new URL('session.json', document.baseURI), { cache: 'no-store' })
  if (!response.ok) throw new Error(`게임 세션에 연결할 수 없습니다 (HTTP ${response.status}). 게임에서 지도를 다시 여세요.`)
  const session = await response.json()
  if (typeof session?.snapshotId !== 'string' || !/^[0-9a-f]{16}$/.test(session.snapshotId) ||
      session.dataRoot !== `snapshots/${session.snapshotId}/`) {
    throw new Error('게임 세션의 스냅샷 설정이 올바르지 않습니다')
  }
  activeSnapshotId = session.snapshotId
  dataRoot = new URL(session.dataRoot, document.baseURI).pathname.replace(/\/$/, '')
}
const INITIAL_COUNTS: Counts = { water: 0, buildings: 0, roads: 0, tracks: 0, pathways: 0, waterways: 0, districts: 0,
  bus: 0, train: 0, tram: 0, subway: 0, ship: 0, ferry: 0, air: 0 }

setWorkerUrl(workerUrl)

async function loadCollection<G extends Polygon | LineString | Point>(file: string, geometry: G['type'], allowEmpty = false) {
  const response = await fetchMapResource(`${dataRoot}/GeoJSON/${file}`)
  if (!response.ok) throw new Error(`${file} 요청 실패 (HTTP ${response.status})`)
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(`${file}의 JSON을 읽을 수 없습니다`)
  }
  if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'FeatureCollection' ||
      !('features' in data) || !Array.isArray(data.features) ||
      (!allowEmpty && data.features.length === 0) ||
      data.features.some(feature => feature?.type !== 'Feature' || feature.geometry?.type !== geometry ||
        !Array.isArray(feature.geometry.coordinates) || !feature.properties ||
        typeof feature.properties.Object !== 'string')) {
    throw new Error(`${file}의 GeoJSON 구조가 올바르지 않습니다`)
  }
  return data as FeatureCollection<G>
}

async function loadExtraInfo(): Promise<{ datasetId: string; preparedAt: string; area: AreaInfo; water: WaterInfo }> {
  try {
    const response = await fetchMapResource(`${dataRoot}/manifest.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`manifest.json 요청 실패 (HTTP ${response.status})`)
    const manifest = await response.json()
    if (typeof manifest?.datasetId !== 'string' || !/^[0-9a-f]{16}$/.test(manifest.datasetId)) {
      throw new Error('스냅샷 manifest에 데이터셋 ID가 없습니다')
    }
    if (activeSnapshotId && manifest.datasetId !== activeSnapshotId) {
      throw new Error('스냅샷 ID가 세션 설정과 일치하지 않습니다')
    }
    let area: AreaInfo
    try {
      const entry = manifest?.files?.['Area_Boundary.json']
      if (!entry || typeof entry !== 'object') throw new Error('Area 메타데이터가 없습니다')
      if (entry.error) throw new Error(`Area_Boundary.json: ${entry.error}`)
      if (!Number.isInteger(entry.features) || !entry.objects || typeof entry.objects !== 'object') {
        throw new Error('Area 메타데이터 구조가 올바르지 않습니다')
      }
      area = { objects: entry.objects }
    } catch (cause) {
      area = { objects: {}, error: cause instanceof Error ? cause.message : String(cause) }
    }

    let water: WaterInfo
    try {
      const entry = manifest?.rasters?.water
      if (!entry || typeof entry !== 'object') throw new Error('수심 메타데이터가 없습니다')
      if (entry.error) throw new Error(`Depth.tif: ${entry.error}`)
      if (entry.file !== 'water-mask.png' || !Number.isInteger(entry.waterPixels) || entry.waterPixels < 1 ||
          !Array.isArray(entry.coordinates) || entry.coordinates.length !== 4 ||
          entry.coordinates.some((point: unknown) => !Array.isArray(point) || point.length !== 2 ||
            !point.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)))) {
        throw new Error('수심 메타데이터 구조가 올바르지 않습니다')
      }
      water = { coordinates: entry.coordinates, waterPixels: entry.waterPixels }
    } catch (cause) {
      water = { error: cause instanceof Error ? cause.message : String(cause) }
    }
    return { datasetId: manifest.datasetId, preparedAt: String(manifest.preparedAt ?? ''), area, water }
  } catch (cause) {
    throw cause instanceof Error ? cause : new Error(String(cause))
  }
}

function loadWaterImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(import.meta.env.DEV ? 'water-mask.png 이미지를 불러올 수 없습니다' :
      '수역 이미지를 불러올 수 없습니다. 게임 연결 상태를 확인하세요.'))
    image.src = `${dataRoot}/water-mask.png`
  })
}

function countObjects(data: BuildingData | NetworkData | FeatureCollection<Polygon>) {
  const counts: Record<string, number> = Object.create(null)
  for (const feature of data.features) {
    const object = feature.properties?.Object
    if (typeof object === 'string') counts[object] = (counts[object] ?? 0) + 1
  }
  return counts
}

function extendBounds(coordinates: unknown, bounds: Extent): void {
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw new Error('빈 좌표 배열')
  if (typeof coordinates[0] === 'number') {
    const [x, y] = coordinates
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('유효하지 않은 좌표')
    bounds[0] = Math.min(bounds[0], x)
    bounds[1] = Math.min(bounds[1], y)
    bounds[2] = Math.max(bounds[2], x)
    bounds[3] = Math.max(bounds[3], y)
    return
  }
  coordinates.forEach(value => extendBounds(value, bounds))
}

function getBounds(collections: Array<BuildingData | NetworkData>): Bounds {
  const bounds: Extent = [Infinity, Infinity, -Infinity, -Infinity]
  for (const collection of collections) {
    for (const feature of collection.features) extendBounds(feature.geometry.coordinates, bounds)
  }
  return [[bounds[0], bounds[1]], [bounds[2], bounds[3]]]
}

function geometryBounds(coordinates: unknown): Bounds {
  const extent: Extent = [Infinity, Infinity, -Infinity, -Infinity]
  extendBounds(coordinates, extent)
  return [[extent[0], extent[1]], [extent[2], extent[3]]]
}

function expandBounds(bounds: Bounds): Bounds {
  const [[west, south], [east, north]] = bounds
  const longitudeMargin = (east - west) * 0.65
  const latitudeMargin = (north - south) * 0.65
  return [[west - longitudeMargin, south - latitudeMargin], [east + longitudeMargin, north + latitudeMargin]]
}

function fitPadding() {
  return window.innerWidth < 700 ? { top: 150, bottom: 90, left: 28, right: 28 } :
    { top: 80, bottom: 80, left: 390, right: 80 }
}

function overviewPadding(map: MapLibreMap) {
  return Math.floor(Math.min(24, map.getCanvas().clientWidth * 0.05, map.getCanvas().clientHeight * 0.05))
}

function fit(map: MapLibreMap, bounds: LngLatBoundsLike) {
  map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 15, duration: 650 })
}

function constrainMap(map: MapLibreMap, all: Bounds) {
  const minimumView = map.cameraForBounds(all, { padding: overviewPadding(map), maxZoom: 15 })
  if (typeof minimumView?.zoom === 'number') map.setMinZoom(Math.max(0, minimumView.zoom - 1))
  map.setMaxBounds(expandBounds(all))
}

export function MapView() {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const visibilityRef = useRef<Visibility>({ ...INITIAL_VISIBILITY })
  const autoTransportModesRef = useRef<Set<TransportMode>>(new Set())
  const directionsOpenRef = useRef(false)
  const areaPromiseRef = useRef<Promise<void> | null>(null)
  const waterInfoRef = useRef<WaterInfo | null>(null)
  const waterPromiseRef = useRef<Promise<void> | null>(null)
  const selectionRef = useRef<Selection | null>(null)
  const featureLookupRef = useRef<Map<string, Selection>>(new Map())
  const datasetIdRef = useRef('')
  const routingWorkerRef = useRef<Worker | null>(null)
  const routingRequestRef = useRef(0)
  const transitReadyRef = useRef(false)
  const transitFailedRef = useRef(false)
  const transitDataRef = useRef<{ poi?: FeatureCollection<Point>; route?: FeatureCollection<LineString> }>({})
  const transitPendingRef = useRef<{ requestId: number; origin: SearchEntry['geometry']; destination: SearchEntry['geometry'] } | null>(null)
  const searchStartedRef = useRef(false)
  const transportCountsRef = useRef<{ poi: Record<TransportMode, number>; route: Record<TransportMode, number> }>({
    poi: Object.fromEntries(TRANSPORT_MODES.map(mode => [mode, 0])) as Record<TransportMode, number>,
    route: Object.fromEntries(TRANSPORT_MODES.map(mode => [mode, 0])) as Record<TransportMode, number>,
  })
  const searchEntriesRef = useRef<SearchEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [snapshotInfo, setSnapshotInfo] = useState<{ id: string; preparedAt: string } | null>(null)
  const [visibility, setVisibility] = useState<Visibility>({ ...INITIAL_VISIBILITY })
  const [counts, setCounts] = useState<Counts>(INITIAL_COUNTS)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([])
  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [directionsOrigin, setDirectionsOrigin] = useState<DirectionPlace | null>(null)
  const [directionsDestination, setDirectionsDestination] = useState<DirectionPlace | null>(null)
  const [directionsOutcome, setDirectionsOutcome] = useState<RouteOutcome | null>(null)
  const [transitOutcome, setTransitOutcome] = useState<TransitOutcome | null>(null)
  const [selectedDirectionsMode, setSelectedDirectionsMode] = useState<'vehicle' | 'transit'>('vehicle')
  const [transitStatus, setTransitStatus] = useState<'loading' | 'calculating' | 'ready' | 'error'>('loading')
  const [transitError, setTransitError] = useState('')
  const [directionsCalculating, setDirectionsCalculating] = useState(false)
  const [directionsError, setDirectionsError] = useState('')
  const [routingReady, setRoutingReady] = useState(false)
  const [searchStates, setSearchStates] = useState<{ poi: SearchSourceState; route: SearchSourceState }>({ poi: 'idle', route: 'idle' })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sourceStates, setSourceStates] = useState<SourceStates>({
    buildings: { state: 'loading' }, network: { state: 'loading' }, area: { state: 'idle' }, water: { state: 'idle' },
    poi: { state: 'idle' }, route: { state: 'idle' },
  })
  const routeStops = useMemo(() => {
    if (selection?.kind !== 'route') return []
    const route = searchEntries.find(entry => entry.selection.id === selection.id)
    return route ? nearbyStops(route, searchEntries) : []
  }, [selection, searchEntries])
  const buildingRoutes = useMemo(() => {
    if (selection?.kind !== 'building') return []
    const building = searchEntries.find(entry => entry.selection.id === selection.id)
    return building ? linkedBuildingRoutes(building, searchEntries) : []
  }, [selection, searchEntries])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('directions-line')) return
    let origin = directionsOrigin ? placeCoordinate(directionsOrigin.entry.geometry) : null
    let destination = directionsDestination ? placeCoordinate(directionsDestination.entry.geometry) : null
    const car = directionsOpen && selectedDirectionsMode === 'vehicle' ? directionsOutcome?.route ?? null : null
    const journey = directionsOpen && selectedDirectionsMode === 'transit' ? transitOutcome?.journey ?? null : null
    if (car?.coordinates.length) {
      origin = car.coordinates[0][0]
      destination = car.coordinates.at(-1)!.at(-1)!
    } else if (journey) {
      const drawn = journey.legs.filter(leg => leg.coordinates.length)
      if (drawn.length) {
        origin = drawn[0].coordinates[0]
        destination = drawn.at(-1)!.coordinates.at(-1)!
      }
    }
    showDirections(map, car, journey, directionsOpen ? origin : null, directionsOpen ? destination : null)
    if (car) fit(map, geometryBounds(car.coordinates))
    if (journey) {
      const coordinates = journey.legs.flatMap(leg => leg.coordinates)
      if (coordinates.length) fit(map, geometryBounds(coordinates))
    }
  }, [directionsOpen, directionsOrigin, directionsDestination, directionsOutcome, transitOutcome, selectedDirectionsMode])

  function setDirectionPlace(side: 'origin' | 'destination', place: DirectionPlace | null) {
    routingRequestRef.current++
    setDirectionsOutcome(null)
    setTransitOutcome(null)
    transitPendingRef.current = null
    setTransitStatus(transitFailedRef.current ? 'error' : transitReadyRef.current ? 'ready' : 'loading')
    setDirectionsCalculating(false)
    setDirectionsError('')
    if (side === 'origin') setDirectionsOrigin(place)
    else setDirectionsDestination(place)
  }

  function requestDirections(originPlace: DirectionPlace | null, destinationPlace: DirectionPlace | null) {
    if (!originPlace || !destinationPlace || !routingReady || !routingWorkerRef.current) {
      setDirectionsError('도로 데이터가 아직 준비되지 않았습니다.')
      return
    }
    if (originPlace.entry.selection.id === destinationPlace.entry.selection.id) return
    const requestId = ++routingRequestRef.current
    const origin = originPlace.entry.geometry
    const destination = destinationPlace.entry.geometry
    setDirectionsOutcome(null)
    setTransitOutcome(null)
    setTransitStatus(transitFailedRef.current ? 'error' : 'calculating')
    setSelectedDirectionsMode('vehicle')
    setDirectionsError('')
    setDirectionsCalculating(true)
    transitPendingRef.current = transitFailedRef.current ? null : { requestId, origin, destination }
    routingWorkerRef.current.postMessage({ type: 'route', requestId, datasetId: datasetIdRef.current,
      configVersion: ROUTING_CONFIG.version, origin, destination })
    if (transitReadyRef.current) requestTransit()
  }

  function requestTransit() {
    const pending = transitPendingRef.current
    if (!pending || !transitReadyRef.current || !routingWorkerRef.current) return
    routingWorkerRef.current.postMessage({ type: 'route-transit', datasetId: datasetIdRef.current,
      configVersion: ROUTING_CONFIG.version, ...pending })
    transitPendingRef.current = null
  }

  function calculateDirections() { requestDirections(directionsOrigin, directionsDestination) }

  function updateSource(key: SourceKey, state: SourceState) {
    setSourceStates(previous => ({ ...previous, [key]: state }))
  }

  function updateTransportFocus(map: MapLibreMap) {
    const selected = selectionRef.current
    const entry = selected ? searchEntriesRef.current.find(item => item.selection.id === selected.id) : undefined
    const routes = entry?.selection.kind === 'route' ? [entry] :
      entry?.selection.kind === 'building' ? linkedBuildingRoutes(entry, searchEntriesRef.current) : []
    const neededModes = new Set<TransportMode>()
    if (!directionsOpenRef.current && entry?.selection.kind === 'building') {
      for (const route of routes) {
        const mode = routeMode(route.selection.properties.Transport)
        if (mode && mode !== 'air') neededModes.add(mode)
      }
    } else if (!directionsOpenRef.current && entry?.selection.kind === 'route') {
      const mode = routeMode(entry.selection.properties.Transport)
      if (mode && autoTransportModesRef.current.has(mode)) neededModes.add(mode)
    } else if (!directionsOpenRef.current && entry?.selection.kind === 'poi') {
      for (const mode of poiModes(entry.selection.properties.Category)) {
        if (autoTransportModesRef.current.has(mode)) neededModes.add(mode)
      }
    }
    const nextVisibility = { ...visibilityRef.current }
    for (const mode of autoTransportModesRef.current) {
      if (!neededModes.has(mode)) nextVisibility[mode] = false
    }
    for (const mode of neededModes) {
      if (!nextVisibility[mode]) {
        nextVisibility[mode] = true
        autoTransportModesRef.current.add(mode)
      }
    }
    for (const mode of [...autoTransportModesRef.current]) {
      if (!neededModes.has(mode)) autoTransportModesRef.current.delete(mode)
    }
    if (TRANSPORT_MODES.some(mode => nextVisibility[mode] !== visibilityRef.current[mode])) {
      visibilityRef.current = nextVisibility
      setVisibility(nextVisibility)
      for (const mode of TRANSPORT_MODES) setGroupVisibility(map, mode, nextVisibility[mode])
    }
    setTransportFocus(map, !directionsOpenRef.current && routes.length ? { routes: routes.flatMap(route => {
      const mode = routeMode(route.selection.properties.Transport)
      return mode ? [{ mode, routeId: route.selection.sourceFeatureId,
        stopIds: nearbyStops(route, searchEntriesRef.current).map(stop => stop.selection.sourceFeatureId) }] : []
    }) } : null)
  }

  function selectFeature(next: Selection | null, geometry?: Geometry) {
    selectionRef.current = next
    setSelection(next)
    const map = mapRef.current
    if (map?.getLayer('selected-road')) {
      showSelection(map, next, geometry)
      updateTransportFocus(map)
    }
  }

  function closeDirections() {
    if (!directionsOpenRef.current) return
    directionsOpenRef.current = false
    setDirectionsOpen(false)
    routingRequestRef.current++
    transitPendingRef.current = null
    setDirectionsCalculating(false)
    setDirectionsOutcome(null)
    setTransitOutcome(null)
    setTransitStatus(transitFailedRef.current ? 'error' : transitReadyRef.current ? 'ready' : 'loading')
    const map = mapRef.current
    if (map?.getLayer('selected-road')) updateTransportFocus(map)
  }

  function openDirections() {
    directionsOpenRef.current = true
    setDirectionsOpen(true)
    setSidebarCollapsed(false)
    loadSearchSources()
    const map = mapRef.current
    if (map?.getLayer('selected-road')) updateTransportFocus(map)
  }

  function loadSearchSources() {
    if (searchStartedRef.current || !datasetIdRef.current) return
    searchStartedRef.current = true
    setSearchStates({ poi: 'loading', route: 'loading' })
    const load = async <G extends Point | LineString>(key: 'poi' | 'route', file: string, geometry: G['type']) => {
      updateSource(key, { state: 'loading' })
      try {
        const data = await loadCollection<G>(file, geometry, true)
        if (key === 'poi') transitDataRef.current.poi = data as FeatureCollection<Point>
        else transitDataRef.current.route = data as FeatureCollection<LineString>
        if (transitDataRef.current.poi && transitDataRef.current.route && routingWorkerRef.current) {
          routingWorkerRef.current.postMessage({ type: 'transit-data', datasetId: datasetIdRef.current,
            configVersion: ROUTING_CONFIG.version,
            pois: transitDataRef.current.poi, routes: transitDataRef.current.route })
        }
        const map = mapRef.current
        if (!map) return
        const modeCounts = Object.fromEntries(TRANSPORT_MODES.map(mode => [mode, 0])) as Record<TransportMode, number>
        const additions: SearchEntry[] = data.features.map((feature, index) => ({
          selection: { id: `${datasetIdRef.current}:${key}:${index}`, sourceFeatureId: index,
            kind: key, properties: { ...feature.properties } }, geometry: feature.geometry,
        }))
        for (const [index, feature] of data.features.entries()) {
          feature.id = index
          const modes = key === 'poi' ? poiModes(feature.properties?.Category) :
            [routeMode(feature.properties?.Transport)].filter((mode): mode is TransportMode => mode !== null)
          feature.properties = { ...feature.properties,
            ...(key === 'poi' ? { _transportModes: modes } : { _transportMode: modes[0] ?? '' }) }
          for (const mode of modes) modeCounts[mode]++
          featureLookupRef.current.set(`${key}:${index}`, additions[index].selection)
        }
        map.addSource(key, { type: 'geojson', data })
        addTransportLayers(map, key)
        transportCountsRef.current[key] = modeCounts
        setCounts(previous => ({ ...previous, ...Object.fromEntries(TRANSPORT_MODES.map(mode =>
          [mode, transportCountsRef.current.poi[mode] + transportCountsRef.current.route[mode]])) }))
        for (const mode of TRANSPORT_MODES) setGroupVisibility(map, mode, visibilityRef.current[mode])
        searchEntriesRef.current = [...searchEntriesRef.current, ...additions]
        setSearchEntries([...searchEntriesRef.current])
        updateTransportFocus(map)
        setSearchStates(previous => ({ ...previous, [key]: additions.length ? 'ready' : 'empty' }))
        updateSource(key, { state: additions.length ? 'ready' : 'empty' })
      } catch (cause) {
        if (mapRef.current) {
          transitFailedRef.current = true
          transitPendingRef.current = null
          setTransitStatus('error')
          setTransitError(`${key === 'poi' ? '정류장' : '노선'} 데이터를 불러오지 못했습니다.`)
          setSearchStates(previous => ({ ...previous, [key]: 'error' }))
          updateSource(key, { state: 'error', error: cause instanceof Error ? cause.message : String(cause) })
        }
      }
    }
    void Promise.all([
      load<Point>('poi', 'POI_Location.json', 'Point'),
      load<LineString>('route', 'Route_Centerline.json', 'LineString'),
    ])
  }

  function selectSearchEntry(entry: SearchEntry) {
    const map = mapRef.current
    if (!map) return
    const selectedMode = entry.selection.kind === 'route' ? routeMode(entry.selection.properties.Transport) : null
    const poiMode = entry.selection.kind === 'poi' ? poiModes(entry.selection.properties.Category)[0] : null
    const mode = selectedMode ?? poiMode
    if (mode && (entry.selection.kind === 'poi' || mode !== 'air')) {
      autoTransportModesRef.current.delete(mode)
      visibilityRef.current = { ...visibilityRef.current, [mode]: true }
      setVisibility({ ...visibilityRef.current })
      setGroupVisibility(map, mode, true)
    }
    selectFeature(entry.selection, entry.selection.kind === 'route' && (!selectedMode || selectedMode === 'air') ? undefined : entry.geometry)
    setSidebarCollapsed(false)
    if (entry.geometry.type === 'Point') {
      map.flyTo({ center: [entry.geometry.coordinates[0], entry.geometry.coordinates[1]], zoom: Math.max(map.getZoom(), 15), duration: 650 })
    } else {
      fit(map, geometryBounds(entry.geometry.coordinates))
    }
  }

  function focusRouteStop(entry: SearchEntry) {
    const map = mapRef.current
    if (!map || entry.geometry.type !== 'Point') return
    map.flyTo({ center: [entry.geometry.coordinates[0], entry.geometry.coordinates[1]],
      zoom: Math.max(map.getZoom(), 15), duration: 700 })
  }

  function loadArea() {
    const map = mapRef.current
    if (!map || map.getSource('area') || areaPromiseRef.current) return
    updateSource('area', { state: 'loading' })
    const promise = loadCollection<Polygon>('Area_Boundary.json', 'Polygon', true)
      .then(data => {
        if (mapRef.current !== map) return
        if (data.features.length === 0) {
          updateSource('area', { state: 'empty' })
          visibilityRef.current = { ...visibilityRef.current, districts: false }
          setVisibility({ ...visibilityRef.current })
          setCounts(previous => ({ ...previous, districts: 0 }))
          return
        }
        const objects = countObjects(data)
        map.addSource('area', { type: 'geojson', data })
        addDistrictLayers(map, objects)
        setCounts(previous => ({ ...previous, districts: objects.District ?? 0 }))
        if (!objects.District) {
          visibilityRef.current = {
            ...visibilityRef.current,
            districts: false,
          }
          setVisibility({ ...visibilityRef.current })
        }
        setGroupVisibility(map, 'districts', visibilityRef.current.districts)
        updateSource('area', { state: 'ready' })
      })
      .catch(cause => {
        if (mapRef.current !== map) return
        visibilityRef.current = { ...visibilityRef.current, districts: false }
        setVisibility({ ...visibilityRef.current })
        updateSource('area', { state: 'error', error: cause instanceof Error ? cause.message : String(cause) })
      })
      .finally(() => { areaPromiseRef.current = null })
    areaPromiseRef.current = promise
  }

  function loadWater() {
    const map = mapRef.current
    const info = waterInfoRef.current
    if (!map || !info?.coordinates || map.getSource('water') || waterPromiseRef.current) return
    updateSource('water', { state: 'loading' })
    const promise = loadWaterImage()
      .then(image => {
        if (mapRef.current !== map) return
        addWaterLayer(map, info.coordinates!, image)
        setGroupVisibility(map, 'water', visibilityRef.current.water)
        updateSource('water', { state: 'ready' })
      })
      .catch(cause => {
        if (mapRef.current !== map) return
        if (map.getLayer('water-raster')) map.removeLayer('water-raster')
        if (map.getSource('water')) map.removeSource('water')
        updateSource('water', { state: 'error', error: cause instanceof Error ? cause.message : String(cause) })
      })
      .finally(() => { waterPromiseRef.current = null })
    waterPromiseRef.current = promise
  }

  function toggleGroup(id: GroupId) {
    if (ALWAYS_VISIBLE.has(id)) return
    const next = !visibilityRef.current[id]
    if (!next && selectionRef.current &&
      ((id === 'buildings' && selectionRef.current.kind === 'building') ||
       (id === 'roads' && selectionRef.current.kind === 'road') ||
       (selectionRef.current.kind === 'route' && routeMode(selectionRef.current.properties.Transport) === id) ||
       (selectionRef.current.kind === 'poi' && poiModes(selectionRef.current.properties.Category).includes(id as TransportMode)) ||
       (selectionRef.current.kind === 'building' && buildingRoutes.some(route => routeMode(route.selection.properties.Transport) === id)))) selectFeature(null)
    visibilityRef.current = { ...visibilityRef.current, [id]: next }
    setVisibility({ ...visibilityRef.current })
    const map = mapRef.current
    if (!map) return
    if (GROUPS[id].source === 'area' && next && !map.getSource('area')) loadArea()
    else setGroupVisibility(map, id, next)
    updateTransportFocus(map)
  }

  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | null = null
    let mapReady = false

    async function loadRequired<G extends Polygon | LineString>(key: SourceKey, file: string, geometry: G['type']) {
      try {
        const data = await loadCollection<G>(file, geometry)
        if (!cancelled) updateSource(key, { state: 'ready' })
        return data
      } catch (cause) {
        if (!cancelled) updateSource(key, { state: 'error', error: cause instanceof Error ? cause.message : String(cause) })
        throw cause
      }
    }

    async function start() {
      try {
        await configureDataRoot()
        const [buildings, network, extraInfo] = await Promise.all([
          loadRequired<Polygon>('buildings', 'Building_Boundary.json', 'Polygon'),
          loadRequired<LineString>('network', 'Network_Centerline.json', 'LineString'),
          loadExtraInfo(),
        ])
        if (cancelled || !containerRef.current) return
        const networkObjects = countObjects(network)
        if (!networkObjects.Road) throw new Error('Network_Centerline.json에 도로가 없습니다')
        const city = getBounds([buildings])
        const all = getBounds([buildings, network])
        const { area: areaInfo, water: waterInfo, datasetId } = extraInfo
        setSnapshotInfo({ id: datasetId, preparedAt: extraInfo.preparedAt })
        datasetIdRef.current = datasetId
        const routingWorker = new Worker(new URL('./routing/routing.worker.ts', import.meta.url), { type: 'module' })
        routingWorkerRef.current = routingWorker
        routingWorker.onmessage = (event: MessageEvent<{ type: string; datasetId: string; requestId?: number;
          outcome?: RouteOutcome | TransitOutcome; error?: string }>) => {
          const message = event.data
          if (message.datasetId !== datasetIdRef.current) return
          if (message.type === 'ready') { setRoutingReady(true); return }
          if (message.type === 'transit-ready') {
            transitReadyRef.current = true
            setTransitStatus('ready')
            requestTransit()
            return
          }
          if (message.type === 'transit-error') {
            transitFailedRef.current = true
            transitPendingRef.current = null
            setTransitStatus('error')
            setTransitError(message.error ?? '대중교통 데이터를 준비하지 못했습니다.')
            return
          }
          if (message.requestId !== routingRequestRef.current) return
          if (message.type === 'transit-result') {
            if (message.error) { setTransitStatus('error'); setTransitError(message.error) }
            else { setTransitOutcome(message.outcome as TransitOutcome); setTransitStatus('ready') }
            return
          }
          setDirectionsCalculating(false)
          if (message.type === 'result') setDirectionsOutcome(message.outcome as RouteOutcome)
          else setDirectionsError(message.error ?? '경로 계산 오류')
        }
        routingWorker.onerror = () => {
          setDirectionsCalculating(false)
          setDirectionsError('경로 계산 작업자를 실행하지 못했습니다.')
          transitFailedRef.current = true
          setTransitStatus('error')
          setTransitError('대중교통 경로 계산 작업자를 실행하지 못했습니다.')
        }
        routingWorker.postMessage({ type: 'init', datasetId, configVersion: ROUTING_CONFIG.version, network })
        const lookup = new Map<string, Selection>()
        const entries: SearchEntry[] = []
        for (const [index, feature] of buildings.features.entries()) {
          const id = `${datasetId}:buildings:${index}`
          feature.id = index
          const selected: Selection = { id, sourceFeatureId: index, kind: 'building', properties: { ...feature.properties } }
          lookup.set(`buildings:${index}`, selected)
          entries.push({ selection: selected, geometry: feature.geometry })
        }
        for (const [index, feature] of network.features.entries()) {
          const id = `${datasetId}:network:${index}`
          feature.id = index
          if (feature.properties?.Object === 'Road') {
            const selected: Selection = { id, sourceFeatureId: index, kind: 'road', properties: { ...feature.properties } }
            lookup.set(`network:${index}`, selected)
            entries.push({ selection: selected, geometry: feature.geometry })
          }
        }
        featureLookupRef.current = lookup
        searchEntriesRef.current = entries
        setSearchEntries(entries)
        setCounts({
          water: waterInfo.waterPixels ? 1 : 0,
          buildings: buildings.features.length,
          roads: networkObjects.Road ?? 0,
          tracks: networkObjects.Track ?? 0,
          pathways: networkObjects.Pathway ?? 0,
          waterways: networkObjects.Waterway ?? 0,
          districts: areaInfo.objects.District ?? 0,
          bus: 0, train: 0, tram: 0, subway: 0, ship: 0, ferry: 0, air: 0,
        })
        if (areaInfo.error) updateSource('area', { state: 'error', error: areaInfo.error })
        else if (!areaInfo.objects.District) updateSource('area', { state: 'empty' })
        if (waterInfo.error || !waterInfo.coordinates) {
          updateSource('water', { state: 'error', error: waterInfo.error ?? '수심 데이터가 없습니다' })
        }
        waterInfoRef.current = waterInfo
        const currentMap = new MapLibreMap({
          container: containerRef.current,
          style: {
            version: 8, sources: {},
            layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8ece8' } }],
          },
          center: [0, 0], zoom: 10, pitch: 0, maxPitch: 0,
          dragRotate: false, renderWorldCopies: false, attributionControl: false,
        })
        map = currentMap
        mapRef.current = currentMap
        currentMap.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
        currentMap.on('resize', () => constrainMap(currentMap, all))
        currentMap.on('load', () => {
          if (cancelled) return
          currentMap.addSource('buildings', { type: 'geojson', data: buildings })
          currentMap.addSource('network', { type: 'geojson', data: network })
          addBaseLayers(currentMap)
          for (const id of GROUP_ORDER) setGroupVisibility(currentMap, id, visibilityRef.current[id])
          addSelectionLayers(currentMap)
          addDirectionsLayers(currentMap)
          currentMap.on('click', event => {
            const radius = 6
            const point = event.point
            const transportPoiLayers = TRANSPORT_MODES.map(mode => `transport-${mode}-poi`).filter(id => currentMap.getLayer(id))
            const transportRouteLayers = TRANSPORT_MODES.map(mode => `transport-${mode}-route`).filter(id => currentMap.getLayer(id))
            const poi = transportPoiLayers.length ? currentMap.queryRenderedFeatures(event.point, { layers: transportPoiLayers })[0] : undefined
            const poiIsFacility = typeof poi?.properties?.Category === 'string' &&
              poi.properties.Category.split(',').some((token: string) => /^(Building|Depot)/.test(token.trim()))
            const route = !poi && transportRouteLayers.length ? currentMap.queryRenderedFeatures(
              [[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]],
              { layers: transportRouteLayers },
            )[0] : undefined
            const building = poi && !poiIsFacility || route ? undefined :
              currentMap.queryRenderedFeatures(event.point, { layers: ['building-fill'] })[0]
            const road = building || poi || route ? undefined : currentMap.queryRenderedFeatures(
              [[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]],
              { layers: ['road-line'] },
            )[0]
            const hit = poiIsFacility && building ? building : poi ?? route ?? building ?? road
            const next = hit?.id === undefined ? null : featureLookupRef.current.get(`${hit.source}:${hit.id}`) ?? null
            const selectedGeometry = next?.kind === 'poi' || next?.kind === 'route' ?
              searchEntriesRef.current.find(entry => entry.selection.id === next.id)?.geometry : undefined
            selectFeature(next, selectedGeometry)
            if (next) {
              closeDirections()
              setSidebarCollapsed(false)
            }
          })
          currentMap.on('mousemove', event => {
            const point = event.point
            const building = currentMap.queryRenderedFeatures(point, { layers: ['building-fill'] }).length > 0
            const transportLayers = TRANSPORT_MODES.flatMap(mode => [`transport-${mode}-poi`, `transport-${mode}-route`])
              .filter(id => currentMap.getLayer(id))
            const transport = transportLayers.length > 0 && currentMap.queryRenderedFeatures(
              [[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]], { layers: transportLayers },
            ).length > 0
            const road = building || currentMap.queryRenderedFeatures(
              [[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]],
              { layers: ['road-line'] },
            ).length > 0
            currentMap.getCanvas().style.cursor = building || transport || road ? 'pointer' : ''
          })
          constrainMap(currentMap, all)
          fit(currentMap, city)
          mapReady = true
          setStatus('ready')
          if (waterInfo.coordinates) loadWater()
          loadSearchSources()
        })
        currentMap.on('error', event => {
          if (!cancelled && !mapReady) {
            setError(`지도 렌더링 오류: ${event.error?.message ?? '알 수 없는 오류'}`)
            setStatus('error')
          }
        })
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause))
          setStatus('error')
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
      featureLookupRef.current.clear()
      searchEntriesRef.current = []
      datasetIdRef.current = ''
      routingWorkerRef.current?.terminate()
      routingWorkerRef.current = null
      transitReadyRef.current = false
      transitFailedRef.current = false
      transitDataRef.current = {}
      transitPendingRef.current = null
    }
  }, [])

  return (
    <main className="app">
      <div className="map" ref={containerRef} aria-label={t('map')} />
      {snapshotInfo && <div className="snapshot-info" role="status">
        <strong>{t('snapshot')} {snapshotInfo.id}</strong>
        {snapshotInfo.preparedAt && <span>{new Date(snapshotInfo.preparedAt).toLocaleString()}</span>}
        <span>{status === 'error' ? t('snapshotError') : status === 'loading' ? t('snapshotLoading') :
          Object.values(sourceStates).some(source => source.state === 'error') ? t('snapshotPartial') : t('snapshotReady')}</span>
      </div>}
      {status === 'ready' && <LayerControls counts={counts} sourceStates={sourceStates}
        visibility={visibility} onToggle={toggleGroup} />}
      <Sidebar status={status} error={localizeKnownError(error, t)} sourceStates={sourceStates}
        selection={selection} routeStops={routeStops} buildingRoutes={buildingRoutes} collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(previous => !previous)}
        onClearSelection={() => selectFeature(null)} searchEntries={searchEntries} searchStates={searchStates}
        onSearchActivate={loadSearchSources} onSearchSelect={selectSearchEntry} onStopFocus={focusRouteStop}
        onBuildingRouteSelect={selectSearchEntry} directionsOpen={directionsOpen}
        directionsOrigin={directionsOrigin} directionsDestination={directionsDestination}
        directionsOutcome={directionsOutcome} directionsCalculating={directionsCalculating}
        transitOutcome={transitOutcome} transitStatus={transitStatus} transitError={transitError}
        selectedDirectionsMode={selectedDirectionsMode} onSelectDirectionsMode={setSelectedDirectionsMode}
        onDirectionsLegSelect={index => {
          const leg = transitOutcome?.journey?.legs[index]
          const map = mapRef.current
          if (!leg || !map) return
          if (leg.coordinates.length >= 2) fit(map, geometryBounds(leg.coordinates))
          else if (leg.stopPoint) map.flyTo({ center: leg.stopPoint, zoom: Math.max(map.getZoom(), 15), duration: 650 })
        }}
        directionsError={directionsError} routingReady={routingReady}
        onDirectionsOpen={openDirections}
        onDirectionsClose={closeDirections}
        onDirectionPlace={setDirectionPlace}
        onDirectionsSwap={() => {
          routingRequestRef.current++
          transitPendingRef.current = null
          setDirectionsOrigin(directionsDestination)
          setDirectionsDestination(directionsOrigin)
          setDirectionsOutcome(null)
          setTransitOutcome(null)
          setTransitStatus(transitFailedRef.current ? 'error' : transitReadyRef.current ? 'ready' : 'loading')
          setDirectionsCalculating(false)
          if (directionsOrigin && directionsDestination) requestDirections(directionsDestination, directionsOrigin)
        }}
        onDirectionsCalculate={calculateDirections} />
    </main>
  )
}
