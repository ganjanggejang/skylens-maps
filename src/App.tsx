import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FeatureCollection, LineString, Polygon } from 'geojson'

type BuildingData = FeatureCollection<Polygon>
type NetworkData = FeatureCollection<LineString>
type Extent = [number, number, number, number]
type Bounds = [[number, number], [number, number]]

const DATA_ROOT = '/data'

setWorkerUrl(workerUrl)

async function loadCollection<G extends Polygon | LineString>(file: string, geometry: G['type']) {
  const response = await fetch(`${DATA_ROOT}/${file}`)
  if (!response.ok) throw new Error(`${file} 요청 실패 (HTTP ${response.status})`)
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(`${file}의 JSON을 읽을 수 없습니다`)
  }
  if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'FeatureCollection' ||
      !('features' in data) || !Array.isArray(data.features) || data.features.length === 0 ||
      data.features.some(feature => feature?.type !== 'Feature' || feature.geometry?.type !== geometry ||
        !Array.isArray(feature.geometry.coordinates) || !feature.properties ||
        typeof feature.properties.Object !== 'string')) {
    throw new Error(`${file}의 GeoJSON 구조가 올바르지 않습니다`)
  }
  return data as FeatureCollection<G>
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

function expandBounds(bounds: Bounds): Bounds {
  const [[west, south], [east, north]] = bounds
  const longitudeMargin = (east - west) * 0.1
  const latitudeMargin = (north - south) * 0.1
  return [
    [west - longitudeMargin, south - latitudeMargin],
    [east + longitudeMargin, north + latitudeMargin],
  ]
}

function fitPadding() {
  const narrow = window.innerWidth < 700
  return narrow ? { top: 150, bottom: 90, left: 28, right: 28 } :
    { top: 80, bottom: 80, left: 320, right: 80 }
}

function overviewPadding(map: MapLibreMap) {
  return Math.floor(Math.min(24, map.getCanvas().clientWidth * 0.05, map.getCanvas().clientHeight * 0.05))
}

function fit(map: MapLibreMap, bounds: LngLatBoundsLike, overview = false) {
  map.fitBounds(bounds, {
    padding: overview ? overviewPadding(map) : fitPadding(),
    maxZoom: 15,
    duration: 650,
  })
}

function constrainMap(map: MapLibreMap, all: Bounds) {
  const minimumView = map.cameraForBounds(all, { padding: overviewPadding(map), maxZoom: 15 })
  if (typeof minimumView?.zoom === 'number') {
    map.setMinZoom(Math.max(0, minimumView.zoom - 0.1))
  }
  map.setMaxBounds(expandBounds(all))
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const extentsRef = useRef<{ city: Bounds; all: Bounds } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [counts, setCounts] = useState({ buildings: 0, roads: 0 })

  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | null = null

    async function start() {
      try {
        const [buildings, network] = await Promise.all([
          loadCollection<Polygon>('Building_Boundary.json', 'Polygon'),
          loadCollection<LineString>('Network_Centerline.json', 'LineString'),
        ])
        const roads = network.features.filter(feature => feature.properties?.Object === 'Road')
        if (roads.length === 0) throw new Error('Network_Centerline.json에 도로가 없습니다')
        const city = getBounds([buildings])
        const all = getBounds([buildings, network])
        if (cancelled || !containerRef.current) return

        setCounts({ buildings: buildings.features.length, roads: roads.length })
        extentsRef.current = { city, all }
        const currentMap = new MapLibreMap({
          container: containerRef.current,
          style: {
            version: 8,
            sources: {},
            layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8ece8' } }],
          },
          center: [0, 0],
          zoom: 10,
          pitch: 0,
          maxPitch: 0,
          dragRotate: false,
          renderWorldCopies: false,
          attributionControl: false,
        })
        map = currentMap
        mapRef.current = currentMap
        currentMap.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
        currentMap.on('resize', () => constrainMap(currentMap, all))
        currentMap.on('load', () => {
          if (cancelled) return
          currentMap.addSource('buildings', { type: 'geojson', data: buildings })
          currentMap.addSource('network', { type: 'geojson', data: network })
          currentMap.addLayer({
            id: 'building-fill', type: 'fill', source: 'buildings',
            paint: { 'fill-color': '#c49e86', 'fill-opacity': 0.9 },
          })
          currentMap.addLayer({
            id: 'building-outline', type: 'line', source: 'buildings',
            paint: { 'line-color': '#6f584d', 'line-width': 1 },
          })
          currentMap.addLayer({
            id: 'road-casing', type: 'line', source: 'network', filter: ['==', ['get', 'Object'], 'Road'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#6f7977', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 15, 7] },
          })
          currentMap.addLayer({
            id: 'road-line', type: 'line', source: 'network', filter: ['==', ['get', 'Object'], 'Road'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#fffdf6', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 15, 5] },
          })
          constrainMap(currentMap, all)
          fit(currentMap, city)
          setStatus('ready')
        })
        currentMap.on('error', event => {
          if (!cancelled) {
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
    }
  }, [])

  return (
    <main className="app">
      <div className="map" ref={containerRef} aria-label="도시 지도" />
      <header className="panel">
        <div className="eyebrow">CITIES: SKYLINES II · CARTO EXPORT</div>
        <h1>City Map</h1>
        <p>도로와 건물을 탐색하세요.</p>
        {status === 'ready' && <>
          <div className="counts">
            <div><strong>{counts.buildings.toLocaleString('ko-KR')}</strong><span>건물</span></div>
            <div><strong>{counts.roads.toLocaleString('ko-KR')}</strong><span>도로 구간</span></div>
          </div>
          <div className="actions">
            <button type="button" onClick={() => extentsRef.current && mapRef.current && fit(mapRef.current, extentsRef.current.city)}>도심 보기</button>
            <button type="button" onClick={() => extentsRef.current && mapRef.current && fit(mapRef.current, extentsRef.current.all, true)}>전체 보기</button>
          </div>
        </>}
        {status === 'loading' && <p className="notice" role="status">지도 데이터를 불러오는 중…</p>}
        {status === 'error' && <div className="error" role="alert">
          <strong>지도를 불러오지 못했습니다</strong>
          <span>{error}</span>
          <button type="button" onClick={() => window.location.reload()}>다시 시도</button>
        </div>}
      </header>
      <div className="map-note">배경지도 없이 Carto 좌표를 그대로 표시합니다.</div>
    </main>
  )
}
