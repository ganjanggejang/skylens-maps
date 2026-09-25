import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FeatureCollection, LineString, Point, Polygon } from 'geojson'
import { addBaseLayers, addDistrictLayers, addWaterLayer, ALWAYS_VISIBLE, GROUP_ORDER, GROUPS, INITIAL_VISIBILITY, setGroupVisibility, type GroupId, type Visibility } from './layers'
import { addSelectionLayers, showSelection, type Selection } from './interaction'
import { Sidebar, type Counts, type SourceKey, type SourceState, type SourceStates } from './Sidebar'
import type { SearchEntry, SearchSourceState } from './Search'

type BuildingData = FeatureCollection<Polygon>
type NetworkData = FeatureCollection<LineString>
type Extent = [number, number, number, number]
type Bounds = [[number, number], [number, number]]
type AreaInfo = { objects: Record<string, number>; error?: string }
type WaterInfo = { coordinates?: [[number, number], [number, number], [number, number], [number, number]]; waterPixels?: number; error?: string }

const DATA_ROOT = '/data'
const INITIAL_COUNTS: Counts = { water: 0, buildings: 0, roads: 0, tracks: 0, pathways: 0, waterways: 0, districts: 0 }

setWorkerUrl(workerUrl)

async function loadCollection<G extends Polygon | LineString | Point>(file: string, geometry: G['type'], allowEmpty = false) {
  const response = await fetch(`${DATA_ROOT}/${file}`)
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

async function loadExtraInfo(): Promise<{ datasetId: string; area: AreaInfo; water: WaterInfo }> {
  try {
    const response = await fetch(`${DATA_ROOT}/manifest.json`)
    if (!response.ok) throw new Error(`manifest.json 요청 실패 (HTTP ${response.status})`)
    const manifest = await response.json()
    if (typeof manifest?.datasetId !== 'string' || !/^[0-9a-f]{16}$/.test(manifest.datasetId)) {
      throw new Error('데이터셋 ID가 없습니다. npm run prepare:data를 다시 실행하세요')
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
    return { datasetId: manifest.datasetId, area, water }
  } catch (cause) {
    throw cause instanceof Error ? cause : new Error(String(cause))
  }
}

function loadWaterImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('water-mask.png 이미지를 불러올 수 없습니다'))
    image.src = `${DATA_ROOT}/water-mask.png`
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
  const longitudeMargin = (east - west) * 0.1
  const latitudeMargin = (north - south) * 0.1
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
  if (typeof minimumView?.zoom === 'number') map.setMinZoom(Math.max(0, minimumView.zoom - 0.1))
  map.setMaxBounds(expandBounds(all))
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const visibilityRef = useRef<Visibility>({ ...INITIAL_VISIBILITY })
  const areaPromiseRef = useRef<Promise<void> | null>(null)
  const waterInfoRef = useRef<WaterInfo | null>(null)
  const waterPromiseRef = useRef<Promise<void> | null>(null)
  const selectionRef = useRef<Selection | null>(null)
  const featureLookupRef = useRef<Map<string, Selection>>(new Map())
  const datasetIdRef = useRef('')
  const searchStartedRef = useRef(false)
  const searchEntriesRef = useRef<SearchEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [visibility, setVisibility] = useState<Visibility>({ ...INITIAL_VISIBILITY })
  const [counts, setCounts] = useState<Counts>(INITIAL_COUNTS)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([])
  const [searchStates, setSearchStates] = useState<{ poi: SearchSourceState; route: SearchSourceState }>({ poi: 'idle', route: 'idle' })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sourceStates, setSourceStates] = useState<SourceStates>({
    buildings: { state: 'loading' }, network: { state: 'loading' }, area: { state: 'idle' }, water: { state: 'idle' },
  })

  function updateSource(key: SourceKey, state: SourceState) {
    setSourceStates(previous => ({ ...previous, [key]: state }))
  }

  function selectFeature(next: Selection | null, geometry?: SearchEntry['geometry']) {
    selectionRef.current = next
    setSelection(next)
    const map = mapRef.current
    if (map?.getLayer('selected-road')) showSelection(map, next, geometry)
  }

  function loadSearchSources() {
    if (searchStartedRef.current || !datasetIdRef.current) return
    searchStartedRef.current = true
    setSearchStates({ poi: 'loading', route: 'loading' })
    const load = async <G extends Point | LineString>(key: 'poi' | 'route', file: string, geometry: G['type']) => {
      try {
        const data = await loadCollection<G>(file, geometry, true)
        if (!mapRef.current) return
        const additions: SearchEntry[] = data.features.map((feature, index) => ({
          selection: { id: `${datasetIdRef.current}:${key}:${index}`, sourceFeatureId: index,
            kind: key, properties: { ...feature.properties } }, geometry: feature.geometry,
        }))
        searchEntriesRef.current = [...searchEntriesRef.current, ...additions]
        setSearchEntries([...searchEntriesRef.current])
        setSearchStates(previous => ({ ...previous, [key]: additions.length ? 'ready' : 'empty' }))
      } catch {
        if (mapRef.current) setSearchStates(previous => ({ ...previous, [key]: 'error' }))
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
    selectFeature(entry.selection, entry.geometry)
    setSidebarCollapsed(false)
    if (entry.geometry.type === 'Point') {
      map.flyTo({ center: [entry.geometry.coordinates[0], entry.geometry.coordinates[1]], zoom: Math.max(map.getZoom(), 15), duration: 650 })
    } else {
      fit(map, geometryBounds(entry.geometry.coordinates))
    }
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
       (id === 'roads' && selectionRef.current.kind === 'road'))) selectFeature(null)
    visibilityRef.current = { ...visibilityRef.current, [id]: next }
    setVisibility({ ...visibilityRef.current })
    const map = mapRef.current
    if (!map) return
    if (GROUPS[id].source === 'area' && next && !map.getSource('area')) loadArea()
    else setGroupVisibility(map, id, next)
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
        datasetIdRef.current = datasetId
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
          currentMap.on('click', event => {
            const building = currentMap.queryRenderedFeatures(event.point, { layers: ['building-fill'] })[0]
            const radius = 6
            const point = event.point
            const road = building ? undefined : currentMap.queryRenderedFeatures(
              [[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]],
              { layers: ['road-line'] },
            )[0]
            const hit = building ?? road
            const next = hit?.id === undefined ? null : featureLookupRef.current.get(`${hit.source}:${hit.id}`) ?? null
            selectFeature(next)
            if (next?.kind === 'building') setSidebarCollapsed(false)
          })
          currentMap.on('mousemove', event => {
            const point = event.point
            const building = currentMap.queryRenderedFeatures(point, { layers: ['building-fill'] }).length > 0
            const road = building || currentMap.queryRenderedFeatures(
              [[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]],
              { layers: ['road-line'] },
            ).length > 0
            currentMap.getCanvas().style.cursor = building || road ? 'pointer' : ''
          })
          constrainMap(currentMap, all)
          fit(currentMap, city)
          mapReady = true
          setStatus('ready')
          if (waterInfo.coordinates) loadWater()
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
    }
  }, [])

  return (
    <main className="app">
      <div className="map" ref={containerRef} aria-label="도시 지도" />
      <Sidebar status={status} error={error} counts={counts} sourceStates={sourceStates}
        visibility={visibility} selection={selection} collapsed={sidebarCollapsed}
        onToggle={toggleGroup} onToggleCollapsed={() => setSidebarCollapsed(previous => !previous)}
        onClearSelection={() => selectFeature(null)} searchEntries={searchEntries} searchStates={searchStates}
        onSearchActivate={loadSearchSources} onSearchSelect={selectSearchEntry} />
    </main>
  )
}
