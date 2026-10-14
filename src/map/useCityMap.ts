import { useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { inferParkAreas } from '../data/park-worker-client'
import type { Selection } from '../data/selection'
import type { PlaceEntry } from '../data/place'
import { useCityDataset } from '../data/useCityDataset'
import { INITIAL_VISIBILITY, type GroupId } from '../layer/layers'
import type { useDirections } from '../routing/useDirections'
import { createCityMap, type CityMap } from './createCityMap'
import { createMapControls, type MapControls } from './createMapControls'
import { INITIAL_COUNTS, prepareMapData } from './prepare-map-data'

type RoutingLifecycle = ReturnType<typeof useDirections>['lifecycle']
type Runtime = { scene: CityMap; controls: MapControls; loadSearchSources: () => void; loadArea: () => void }

export function useCityMap(routing: RoutingLifecycle) {
  const containerRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<Runtime | null>(null)
  const { sourceStates, createLoader } = useCityDataset()
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [snapshotInfo, setSnapshotInfo] = useState<{ id: string; preparedAt: string } | null>(null)
  const [counts, setCounts] = useState(INITIAL_COUNTS)
  const [visibility, setVisibility] = useState({ ...INITIAL_VISIBILITY })
  const [searchEntries, setSearchEntries] = useState<PlaceEntry[]>([])
  const [selected, setSelected] = useState<{ selection: Selection | null; returnBuildingId: string | null }>({
    selection: null, returnBuildingId: null,
  })
  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const loader = createLoader()
    let scene: CityMap | null = null
    let cancelParks = () => {}

    async function start() {
      try {
        const dataset = await loader.loadInitial()
        if (!loader.active || !containerRef.current) return
        const current = createCityMap(containerRef.current, prepareMapData(dataset), (next, geometry) => {
          controls.selectFeature(next, geometry)
          if (next) {
            controls.setDirectionsOpen(false)
            setDirectionsOpen(false)
            routing.resetDirections()
            setSidebarCollapsed(false)
          }
        })
        scene = current
        const controls = createMapControls(current,
          (selection, returnBuildingId) => setSelected({ selection, returnBuildingId }),
          setVisibility, () => setSidebarCollapsed(false))
        const publishPlaces = () => {
          setCounts({ ...current.counts })
          setSearchEntries([...current.entries])
        }
        function loadSearchSources() {
          for (const key of ['poi', 'route'] as const) {
            void loader.loadTransport(key, data => {
              routing.provideTransitData(key, data)
              current.installTransport(key, data)
              publishPlaces()
              controls.updateTransportFocus()
            }).catch(() => { if (loader.active) routing.failTransitData(key) })
          }
        }
        function loadArea() {
          if (current.map.getSource('area')) return
          void loader.loadArea(data => {
            current.installArea(data)
            setCounts({ ...current.counts })
            setVisibility({ ...current.visibility })
          }).catch(() => {
            if (loader.active) {
              current.visibility.districts = false
              setVisibility({ ...current.visibility })
            }
          })
        }
        routing.initializeRouting(dataset.extraInfo.datasetId, dataset.network)
        setSnapshotInfo({ id: dataset.extraInfo.datasetId, preparedAt: dataset.extraInfo.preparedAt })
        publishPlaces()
        await current.ready
        if (!loader.active) return
        runtimeRef.current = { scene: current, controls, loadSearchSources, loadArea }
        setMap(current.map)
        setStatus('ready')
        cancelParks = inferParkAreas(dataset.buildings, dataset.network, parks => {
          if (loader.active) current.map.getSource<GeoJSONSource>('parks')?.setData(parks)
        })
        if (dataset.extraInfo.water.coordinates) {
          void loader.loadWater(current.installWater).catch(() => {})
        }
        loadSearchSources()
      } catch (cause) {
        if (loader.active) {
          setError(cause instanceof Error ? cause.message : String(cause))
          setStatus('error')
        }
      }
    }

    void start()
    return () => {
      loader.dispose()
      cancelParks()
      runtimeRef.current = null
      scene?.dispose()
      routing.disposeRouting()
    }
  }, [createLoader, routing])

  function loadSearchSources() { runtimeRef.current?.loadSearchSources() }
  function toggleGroup(id: GroupId) {
    const runtime = runtimeRef.current
    if (!runtime) return
    runtime.controls.toggleGroup(id)
    if (id === 'districts' && runtime.scene.visibility.districts) runtime.loadArea()
  }
  function openDirections() {
    const runtime = runtimeRef.current
    if (!runtime) return
    runtime.controls.setDirectionsOpen(true)
    setDirectionsOpen(true)
    setSidebarCollapsed(false)
    runtime.loadSearchSources()
  }
  function closeDirections() {
    runtimeRef.current?.controls.setDirectionsOpen(false)
    setDirectionsOpen(false)
    routing.resetDirections()
  }

  return { containerRef, map, status, error, snapshotInfo, counts, visibility, sourceStates, searchEntries,
    ...selected, directionsOpen, sidebarCollapsed, toggleGroup, loadSearchSources, openDirections, closeDirections,
    toggleSidebar: () => setSidebarCollapsed(previous => !previous),
    clearSelection: () => runtimeRef.current?.controls.selectFeature(null),
    selectSearchEntry: (entry: PlaceEntry) => runtimeRef.current?.controls.selectEntry(entry),
    selectBuildingRoute: (entry: PlaceEntry) => runtimeRef.current?.controls.selectBuildingRoute(entry),
    returnToBuilding: () => runtimeRef.current?.controls.returnToBuilding(),
    focusRouteStop: (entry: PlaceEntry) => runtimeRef.current?.controls.focusStop(entry),
  }
}
