import { useRef, useState } from 'react'
import { SelectionDetail } from './SelectionDetail'
import type { Selection } from '../data/selection'
import { Search } from '../search/Search'
import type { PlaceEntry } from '../data/place'
import { Directions } from '../routing/Directions'
import type { DirectionPlace } from '../routing/directions-model'
import type { RouteOutcome, TransitOutcome } from '../routing/types'
import { searchEntryLabel } from '../search/search-model'
import { useI18n } from '../i18n'

import type { SourceStates } from '../data/types'

type Props = {
  status: 'loading' | 'ready' | 'error'
  error: string
  sourceStates: SourceStates
  selection: Selection | null
  routeStops: PlaceEntry[]
  buildingRoutes: PlaceEntry[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onClearSelection: () => void
  searchEntries: PlaceEntry[]
  onSearchActivate: () => void
  onSearchSelect: (entry: PlaceEntry) => void
  onStopFocus: (entry: PlaceEntry) => void
  onBuildingRouteSelect: (entry: PlaceEntry) => void
  onBackToBuilding: (() => void) | null
  directionsOpen: boolean
  directionsOrigin: DirectionPlace | null
  directionsDestination: DirectionPlace | null
  directionsOutcome: RouteOutcome | null
  transitOutcome: TransitOutcome | null
  transitStatus: 'loading' | 'calculating' | 'ready' | 'error'
  transitError: string
  selectedDirectionsMode: 'vehicle' | 'transit'
  onSelectDirectionsMode: (mode: 'vehicle' | 'transit') => void
  onDirectionsLegSelect: (index: number) => void
  directionsCalculating: boolean
  directionsError: string
  routingReady: boolean
  onDirectionsOpen: () => void
  onDirectionsClose: () => void
  onDirectionPlace: (side: 'origin' | 'destination', place: DirectionPlace | null) => void
  onDirectionsSwap: () => void
  onDirectionsCalculate: () => void
}

export function Sidebar({ status, error, sourceStates, selection,
  routeStops, buildingRoutes, collapsed, onToggleCollapsed, onClearSelection, searchEntries,
  onSearchActivate, onSearchSelect, onStopFocus, onBuildingRouteSelect, onBackToBuilding, directionsOpen, directionsOrigin,
  directionsDestination, directionsOutcome, transitOutcome, transitStatus, transitError,
  selectedDirectionsMode, onSelectDirectionsMode, onDirectionsLegSelect,
  directionsCalculating, directionsError, routingReady,
  onDirectionsOpen, onDirectionsClose, onDirectionPlace, onDirectionsSwap, onDirectionsCalculate }: Props) {
  const { t, language, setLanguage } = useI18n()
  const [searchActive, setSearchActive] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const expanded = directionsOpen || searchActive || selection !== null
  function openDirections() {
    setSearchActive(false)
    onDirectionsOpen()
  }
  function fromDetail(side: 'origin' | 'destination') {
    const entry = searchEntries.find(item => item.selection.id === selection?.id)
    if (!entry) return
    onDirectionPlace(side, { entry, label: searchEntryLabel(entry, language) })
    openDirections()
  }
  function showBuildingRoute(entry: PlaceEntry) {
    onBuildingRouteSelect(entry)
    panelRef.current?.scrollTo({ top: 0 })
  }
  function backToBuilding() {
    onBackToBuilding?.()
    panelRef.current?.scrollTo({ top: 0 })
  }
  return <>
    <aside ref={panelRef} className={`panel${expanded ? ' is-expanded' : ''}`} id="map-sidebar" aria-label={t('menu')} hidden={collapsed}>
      <div className="panel-header">
        <div className="eyebrow">Maps for CITIES: SKYLINES II</div>
        <h1>Skylens Maps</h1>
        <p>{t('intro')}</p>
        <div className="language-switch" role="group" aria-label={t('language')}>
          <button type="button" lang="ko" aria-pressed={language === 'ko'} onClick={() => setLanguage('ko')}>한국어</button>
          <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
        </div>
      </div>
      {status === 'ready' && <>
        {!directionsOpen && <button className="directions-open" type="button" onClick={openDirections}>{t('directions')}</button>}
        {directionsOpen ? <Directions
          entries={searchEntries} origin={directionsOrigin} destination={directionsDestination}
          outcome={directionsOutcome} calculating={directionsCalculating} error={directionsError}
          transitOutcome={transitOutcome} transitStatus={transitStatus} transitError={transitError}
          selectedMode={selectedDirectionsMode} onSelectMode={onSelectDirectionsMode} onLegSelect={onDirectionsLegSelect}
          onOrigin={place => onDirectionPlace('origin', place)} onDestination={place => onDirectionPlace('destination', place)}
          onSwap={onDirectionsSwap} onCalculate={onDirectionsCalculate} onClose={onDirectionsClose} onActivate={onSearchActivate} /> :
          <Search entries={searchEntries} optionalStates={{ poi: sourceStates.poi.state, route: sourceStates.route.state }}
            onActivate={() => { setSearchActive(true); onSearchActivate() }}
            onDeactivate={() => setSearchActive(false)} onSelect={entry => { setSearchActive(false); onSearchSelect(entry) }} />}
        {!directionsOpen && selection && <SelectionDetail selection={selection} routeStops={routeStops} buildingRoutes={buildingRoutes}
          poiState={sourceStates.poi.state} routeState={sourceStates.route.state}
          onClose={onClearSelection} onBack={onBackToBuilding ? backToBuilding : null}
          onStopFocus={onStopFocus} onBuildingRouteSelect={showBuildingRoute}
          onDirectionsPlace={fromDetail} />}
        {directionsOpen && !routingReady && <p className="notice" role="status">{t('routeDataLoading')}</p>}
      </>}
      {status === 'loading' && <p className="notice" role="status">{t('mapLoading')}</p>}
      {status === 'error' && <div className="error" role="alert">
        <strong>{t('mapFailed')}</strong>
        <span>{error}</span>
        <button type="button" onClick={() => window.location.reload()}>{t('retry')}</button>
      </div>}
    </aside>
    <button type="button" className={`sidebar-toggle${collapsed ? ' is-collapsed' : ''}`}
      onClick={onToggleCollapsed} aria-controls="map-sidebar" aria-expanded={!collapsed}
      aria-label={t(collapsed ? 'expandSidebar' : 'collapseSidebar')}
      title={t(collapsed ? 'expandSidebar' : 'collapseSidebar')}>
      {collapsed ? '☰' : '‹'}
    </button>
  </>
}
