import { useState } from 'react'
import type { GroupId } from './layers'
import type { Selection } from './interaction'
import { Search, type SearchEntry, type SearchSourceState } from './Search'
import { buildingBrand, buildingTitle, normalizeText, propertyText } from './building-name'
import { routeMode, TRANSPORT } from './transport'
import { Directions, type DirectionPlace } from './Directions'
import type { RouteOutcome, TransitOutcome } from './routing/types'
import { searchEntryLabel } from './search-model'
import { useI18n } from './i18n'

export type SourceKey = 'buildings' | 'network' | 'area' | 'water' | 'poi' | 'route'
export type SourceState = { state: 'idle' | 'loading' | 'ready' | 'empty' | 'error'; error?: string }
export type SourceStates = Record<SourceKey, SourceState>
export type Counts = Record<GroupId, number>

type Props = {
  status: 'loading' | 'ready' | 'error'
  error: string
  sourceStates: SourceStates
  selection: Selection | null
  routeStops: SearchEntry[]
  buildingRoutes: SearchEntry[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onClearSelection: () => void
  searchEntries: SearchEntry[]
  searchStates: { poi: SearchSourceState; route: SearchSourceState }
  onSearchActivate: () => void
  onSearchSelect: (entry: SearchEntry) => void
  onStopFocus: (entry: SearchEntry) => void
  onBuildingRouteSelect: (entry: SearchEntry) => void
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

const buildingFields = [
  ['Asset', 'asset'], ['Category', 'category'], ['Zoning', 'zoning'],
  ['Resident', 'resident'], ['Employee', 'employee'],
] as const
const roadFields = [
  ['Asset', 'asset'], ['Category', 'category'], ['Lane', 'lane'],
  ['Limit', 'limit'], ['Direction', 'direction'], ['Form', 'form'],
] as const
const routeFields = [
  ['Transport', 'transport'], ['Color', 'color'], ['Length', 'length'],
  ['Passenger', 'passenger'], ['Stop', 'stop'], ['Usage', 'usage'], ['Vehicle', 'vehicle'],
] as const
const poiFields = [['Category', 'category'], ['Object', 'object']] as const

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

function formatValue(value: unknown, language = 'ko'): string {
  if (typeof value === 'number') return value.toLocaleString(language === 'en' ? 'en-US' : 'ko-KR')
  return String(value)
}

function address(properties: Record<string, unknown>) {
  const parts = ['Address_District', 'Address_Street', 'Address_Number']
    .map(key => properties[key])
    .filter(hasValue)
    .map(value => formatValue(value))
  return parts.join(' ')
}

function uniqueRouteStops(stops: SearchEntry[]): SearchEntry[] {
  const seen = new Set<string>()
  return stops.filter(entry => {
    const name = entry.selection.properties.Name
    const stopAddress = address(entry.selection.properties)
    if (!hasValue(name) || !stopAddress) return true
    const key = JSON.stringify([normalizeText(formatValue(name)), normalizeText(stopAddress)])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function Detail({ selection, routeStops, buildingRoutes, poiState, routeState, onClose, onStopFocus, onBuildingRouteSelect,
  onDirectionsPlace }: {
  selection: Selection; routeStops: SearchEntry[]; buildingRoutes: SearchEntry[];
  poiState: SourceState['state']; routeState: SourceState['state']; onClose: () => void
  onStopFocus: (entry: SearchEntry) => void
  onBuildingRouteSelect: (entry: SearchEntry) => void
  onDirectionsPlace: (side: 'origin' | 'destination') => void
}) {
  const { t, language } = useI18n()
  const { properties, kind, id } = selection
  const fields = kind === 'building' ? buildingFields : kind === 'road' ? roadFields : kind === 'route' ? routeFields : poiFields
  const location = kind === 'building' || kind === 'poi' ? address(properties) : ''
  const buildingName = buildingTitle(properties, id)
  const title = kind === 'building' ? (language === 'en' && !propertyText(properties, 'Name') && !buildingBrand(properties) ? `${t('building')} ${id}` : buildingName) :
    (hasValue(properties.Name) ? formatValue(properties.Name) : `${t(kind)} ${id}`)
  const brand = kind === 'building' ? buildingBrand(properties) : ''
  const listedStops = kind === 'route' ? uniqueRouteStops(routeStops) : []
  const isTransportBuilding = kind === 'building' && propertyText(properties, 'Category') === 'Public, Transportation'
  return <section className="detail" aria-label={t('detail')}>
    <button className="detail-close" type="button" onClick={onClose} aria-label={t('closeDetail')}>×</button>
    <span className="detail-kind">{t(kind)}</span>
    <h2>{title}</h2>
    {location && title !== location && <p className="detail-address">{location}</p>}
    {kind !== 'route' && <div className="detail-directions">
      <button type="button" onClick={() => onDirectionsPlace('origin')}>{t('setOrigin')}</button>
      <button type="button" onClick={() => onDirectionsPlace('destination')}>{t('setDestination')}</button>
    </div>}
    <dl className="detail-fields">
      {brand && normalizeText(brand) !== normalizeText(title) && <div><dt>{t('brand')}</dt><dd>{brand}</dd></div>}
      {fields.filter(([key]) => hasValue(properties[key])).map(([key, label]) =>
        <div key={key}><dt>{t(label)}</dt><dd>{formatValue(properties[key], language)}</dd></div>)}
    </dl>
    {isTransportBuilding && <section className="building-routes" aria-label={t('nearbyRoutes')}>
      <h3>{t('nearbyRoutes')} {buildingRoutes.length > 0 && `(${buildingRoutes.length})`}</h3>
      {buildingRoutes.length > 0 ? <ul>{buildingRoutes.map(entry => {
        const mode = routeMode(entry.selection.properties.Transport)
        const rawColor = entry.selection.properties.Color
        const color = typeof rawColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor :
          mode ? TRANSPORT[mode].color : '#6f7977'
        return <li key={entry.selection.id}><button type="button" onClick={() => onBuildingRouteSelect(entry)}>
          <span className="building-route-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
          <span><strong>{hasValue(entry.selection.properties.Name) ? formatValue(entry.selection.properties.Name) : t('unnamed', { kind: t('route').toLowerCase() })}</strong>
            <small>{mode ? t(mode) : t('transit')}</small></span>
        </button></li>
      })}</ul> : <p>{poiState === 'loading' || poiState === 'idle' || routeState === 'loading' || routeState === 'idle' ?
        t('transportLoading') : poiState === 'error' || routeState === 'error' ?
          t('transportFailed') : t('noLinkedRoutes')}</p>}
      <p className="route-stop-note">{t('nearbyRoutesNote')}</p>
    </section>}
    {kind === 'route' && <section className="route-stops" aria-label={t('nearbyStops')}>
      <h3>{t('nearbyStops')} {listedStops.length > 0 && `(${listedStops.length})`}</h3>
      {listedStops.length > 0 ? <ol>{listedStops.map(entry => {
        const name = entry.selection.properties.Name
        const stopAddress = address(entry.selection.properties)
        return <li key={entry.selection.id}>
          <button type="button" className="route-stop-button" onClick={() => onStopFocus(entry)}>
            <strong>{hasValue(name) ? formatValue(name) : t('unnamedStop', { number: entry.selection.sourceFeatureId + 1 })}</strong>
            {stopAddress && <small>{stopAddress}</small>}
          </button>
        </li>
      })}</ol> : <p>{poiState === 'loading' || poiState === 'idle' ? t('stopsLoading') :
        poiState === 'error' ? t('stopsFailed') : t('noStops')}</p>}
      <p className="route-stop-note">{t('nearbyStopsNote')}</p>
    </section>}
    <div className="detail-future" aria-label={t('extraInfoRegion')}>
      <h3>{t('extraInfo')}</h3>
      <p>{t('noExtraInfo')}</p>
    </div>
    <small className="detail-id">{t('internalId', { id })}</small>
  </section>
}

export function Sidebar({ status, error, sourceStates, selection,
  routeStops, buildingRoutes, collapsed, onToggleCollapsed, onClearSelection, searchEntries, searchStates,
  onSearchActivate, onSearchSelect, onStopFocus, onBuildingRouteSelect, directionsOpen, directionsOrigin,
  directionsDestination, directionsOutcome, transitOutcome, transitStatus, transitError,
  selectedDirectionsMode, onSelectDirectionsMode, onDirectionsLegSelect,
  directionsCalculating, directionsError, routingReady,
  onDirectionsOpen, onDirectionsClose, onDirectionPlace, onDirectionsSwap, onDirectionsCalculate }: Props) {
  const { t, language, setLanguage } = useI18n()
  const [searchActive, setSearchActive] = useState(false)
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
  return <>
    <aside className={`panel${expanded ? ' is-expanded' : ''}`} id="map-sidebar" aria-label={t('menu')} hidden={collapsed}>
    <div className="panel-header">
      <div className="eyebrow">CITIES: SKYLINES II · CARTO EXPORT</div>
      <h1>City Map</h1>
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
        <Search entries={searchEntries} optionalStates={searchStates}
          onActivate={() => { setSearchActive(true); onSearchActivate() }}
          onDeactivate={() => setSearchActive(false)} onSelect={entry => { setSearchActive(false); onSearchSelect(entry) }} />}
      {!directionsOpen && selection && <Detail selection={selection} routeStops={routeStops} buildingRoutes={buildingRoutes}
        poiState={sourceStates.poi.state} routeState={sourceStates.route.state}
        onClose={onClearSelection} onStopFocus={onStopFocus} onBuildingRouteSelect={onBuildingRouteSelect}
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
