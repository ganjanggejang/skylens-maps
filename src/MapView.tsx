import { useMemo } from 'react'
import { Sidebar } from './sidebar/Sidebar'
import { SnapshotInfo } from './sidebar/SnapshotInfo'
import { LayerControls } from './layer/LayerControls'
import { useI18n, localizeKnownError } from './i18n'
import { useDirections } from './routing/useDirections'
import { nearbyStops } from './routing/route-stops'
import { linkedBuildingRoutes } from './routing/building-routes'
import { useCityMap } from './map/useCityMap'
import { useDirectionsMap } from './map/useDirectionsMap'

export function MapView() {
  const { t } = useI18n()
  const directions = useDirections()
  const { containerRef, map, status, error, snapshotInfo, visibility, counts, sourceStates, selection,
    returnBuildingId, searchEntries, directionsOpen, sidebarCollapsed, toggleSidebar, clearSelection,
    loadSearchSources, toggleGroup, selectSearchEntry, selectBuildingRoute, returnToBuilding, focusRouteStop,
    openDirections, closeDirections } = useCityMap(directions.lifecycle)
  const { directionsOrigin, directionsDestination, directionsOutcome, transitOutcome, selectedDirectionsMode,
    transitStatus, transitError, directionsCalculating, directionsError, routingReady, setSelectedDirectionsMode,
    setDirectionPlace, calculateDirections, swapDirections } = directions
  const focusLeg = useDirectionsMap(map, directionsOpen, directions)

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

  return (
    <main className="app">
      <div className="map" ref={containerRef} aria-label={t('map')} />
      {snapshotInfo && <SnapshotInfo snapshot={snapshotInfo} status={status} sourceStates={sourceStates} />}
      {status === 'ready' && <LayerControls counts={counts} sourceStates={sourceStates}
        visibility={visibility} onToggle={toggleGroup} />}
      <Sidebar status={status} error={localizeKnownError(error, t)} sourceStates={sourceStates}
        selection={selection} routeStops={routeStops} buildingRoutes={buildingRoutes} collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onClearSelection={clearSelection} searchEntries={searchEntries}
        onSearchActivate={loadSearchSources} onSearchSelect={selectSearchEntry} onStopFocus={focusRouteStop}
        onBuildingRouteSelect={selectBuildingRoute}
        onBackToBuilding={selection?.kind === 'route' && returnBuildingId ? returnToBuilding : null}
        directionsOpen={directionsOpen}
        directionsOrigin={directionsOrigin} directionsDestination={directionsDestination}
        directionsOutcome={directionsOutcome} directionsCalculating={directionsCalculating}
        transitOutcome={transitOutcome} transitStatus={transitStatus} transitError={transitError}
        selectedDirectionsMode={selectedDirectionsMode} onSelectDirectionsMode={setSelectedDirectionsMode}
        onDirectionsLegSelect={focusLeg}
        directionsError={directionsError} routingReady={routingReady}
        onDirectionsOpen={openDirections}
        onDirectionsClose={closeDirections}
        onDirectionPlace={setDirectionPlace}
        onDirectionsSwap={swapDirections}
        onDirectionsCalculate={calculateDirections} />
    </main>
  )
}
