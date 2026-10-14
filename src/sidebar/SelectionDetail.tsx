import type { Selection } from '../data/selection'
import type { SourceState } from '../data/types'
import type { PlaceEntry } from '../data/place'
import { buildingBrand, buildingTitle, normalizeText, propertyText } from '../data/building-name'
import { isTransportBuilding, routeMode, TRANSPORT } from '../data/transport'
import { useI18n } from '../i18n'

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

function uniqueRouteStops(stops: PlaceEntry[]): PlaceEntry[] {
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

export function SelectionDetail({ selection, routeStops, buildingRoutes, poiState, routeState, onClose, onBack, onStopFocus, onBuildingRouteSelect,
  onDirectionsPlace }: {
    selection: Selection; routeStops: PlaceEntry[]; buildingRoutes: PlaceEntry[];
    poiState: SourceState['state']; routeState: SourceState['state']; onClose: () => void
    onBack: (() => void) | null
    onStopFocus: (entry: PlaceEntry) => void
    onBuildingRouteSelect: (entry: PlaceEntry) => void
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
  const showBuildingRoutes = kind === 'building' && isTransportBuilding(properties)
  return <section className="detail" aria-label={t('detail')}>
    {kind === 'route' && onBack && <button className="detail-back" type="button" onClick={onBack}>{t('back')}</button>}
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
    {showBuildingRoutes && <section className="building-routes" aria-label={t('nearbyRoutes')}>
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

