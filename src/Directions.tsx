import { useEffect, useState } from 'react'
import { SearchInput } from './SearchInput'
import { searchEntryLabel, type SearchEntry } from './search-model'
import type { RouteOutcome, TransitOutcome } from './routing/types'
import { useI18n, localizeKnownError, localizeGeneratedName } from './i18n'
import './directions.css'

export type DirectionPlace = { entry: SearchEntry; label: string }

export function Directions({ entries, origin, destination, outcome, transitOutcome, transitStatus, transitError,
  selectedMode, onSelectMode, onLegSelect, calculating, error, onOrigin, onDestination,
  onSwap, onCalculate, onClose, onActivate }: {
  entries: SearchEntry[]; origin: DirectionPlace | null; destination: DirectionPlace | null
  outcome: RouteOutcome | null; calculating: boolean; error: string
  transitOutcome: TransitOutcome | null; transitStatus: 'loading' | 'calculating' | 'ready' | 'error'
  transitError: string; selectedMode: 'vehicle' | 'transit'
  onSelectMode: (mode: 'vehicle' | 'transit') => void
  onLegSelect: (index: number) => void
  onOrigin: (place: DirectionPlace | null) => void; onDestination: (place: DirectionPlace | null) => void
  onSwap: () => void; onCalculate: () => void; onClose: () => void; onActivate: () => void
}) {
  const { t, language, number } = useI18n()
  const [originQuery, setOriginQuery] = useState(origin?.label ?? '')
  const [destinationQuery, setDestinationQuery] = useState(destination?.label ?? '')
  useEffect(() => { if (origin) setOriginQuery(searchEntryLabel(origin.entry, language)) }, [origin, language])
  useEffect(() => { if (destination) setDestinationQuery(searchEntryLabel(destination.entry, language)) }, [destination, language])
  const places = entries.filter(entry => entry.selection.kind !== 'route')
  function select(entry: SearchEntry, side: 'origin' | 'destination') {
    const place = { entry, label: searchEntryLabel(entry, language) }
    if (side === 'origin') { setOriginQuery(place.label); onOrigin(place) }
    else { setDestinationQuery(place.label); onDestination(place) }
  }
  function swap() {
    setOriginQuery(destination ? searchEntryLabel(destination.entry, language) : '')
    setDestinationQuery(origin ? searchEntryLabel(origin.entry, language) : '')
    onSwap()
  }
  const same = origin && destination && origin.entry.selection.id === destination.entry.selection.id
  return <section className="directions" aria-label={t('directions')}>
    <div className="directions-heading"><button className="directions-back" type="button" onClick={onClose}>{t('back')}</button><h2>{t('directions')}</h2></div>
    <SearchInput id="directions-origin" label={t('origin')} query={originQuery} entries={places}
      showResults={!origin || originQuery !== searchEntryLabel(origin.entry, language)} onFocus={onActivate}
      onChange={query => { setOriginQuery(query); onOrigin(null) }} onSelect={entry => select(entry, 'origin')} />
    <button type="button" className="directions-swap" onClick={swap} aria-label={t('swapAria')}>{t('swap')}</button>
    <SearchInput id="directions-destination" label={t('destination')} query={destinationQuery} entries={places}
      showResults={!destination || destinationQuery !== searchEntryLabel(destination.entry, language)} onFocus={onActivate}
      onChange={query => { setDestinationQuery(query); onDestination(null) }} onSelect={entry => select(entry, 'destination')} />
    {same && <p className="directions-error" role="status">{t('samePlace')}</p>}
    {error && <p className="directions-error" role="alert">{localizeKnownError(error, t)}</p>}
    <button type="button" className="directions-submit" disabled={!origin || !destination || !!same || calculating}
      onClick={onCalculate}>{t(calculating ? 'calculating' : 'findRoute')}</button>
    {outcome && <div className={`directions-card${selectedMode === 'vehicle' ? ' is-selected' : ''}`} aria-live="polite">
      <button type="button" className="directions-card-select" onClick={() => onSelectMode('vehicle')}
        aria-label={t('showVehicle')} aria-pressed={selectedMode === 'vehicle'} />
      <h3>{t('vehicle')}</h3>
      {outcome.route ? <>
        <strong>{t('minutes', { count: number(Math.max(1, Math.round(outcome.route.seconds / 60))) })} · {(outcome.route.distance / 1000).toFixed(1)}km</strong>
        <p>{t('routeSummary', { count: number(outcome.route.featureIds.length), distance: number(Math.round(outcome.route.accessDistance)) })}</p>
      </> : <p>{t(outcome.reason === 'access' ? 'vehicleAccessFailed' : 'vehicleDisconnected')}</p>}
      <small>{t('vehicleNote')}</small>
    </div>}
    <div className={`directions-card${selectedMode === 'transit' ? ' is-selected' : ''}`} aria-live="polite">
      <button type="button" className="directions-card-select" onClick={() => onSelectMode('transit')}
        aria-label={t('showTransit')} aria-pressed={selectedMode === 'transit'} />
      <h3>{t('transit')}</h3>
      {transitOutcome?.journey ? <>
        <strong>{t('minutes', { count: number(Math.max(1, Math.round(transitOutcome.journey.seconds / 60))) })} · {(transitOutcome.journey.distance / 1000).toFixed(1)}km</strong>
        <p>{t('transfers', { count: number(transitOutcome.journey.transfers) })}</p>
        {selectedMode === 'transit' && <ol className="directions-legs">{transitOutcome.journey.legs.map((leg, index) =>
          <li key={index}><button type="button" onClick={() => onLegSelect(index)}>
            {leg.kind === 'ride' ? <><span className="directions-leg-swatch" style={{ backgroundColor: leg.color }} />
              <strong>{localizeGeneratedName(leg.routeName ?? '', t)}</strong> {localizeGeneratedName(leg.fromStop ?? '', t)} → {localizeGeneratedName(leg.toStop ?? '', t)}</> :
              leg.kind === 'walk' ? <>{t('walk', { distance: number(Math.round(leg.distance)) })}</> :
                <>{t('wait', { minutes: number(Math.round(leg.seconds / 60)) })}</>}
            <small>{t('minutes', { count: number(Math.max(1, Math.round(leg.seconds / 60))) })}</small>
          </button></li>)}</ol>}
        <small>{[t('assumptionStops'), t('assumptionBidirectional'), t('assumptionWait')].join(' · ')}</small>
      </> : transitOutcome?.reason ? <p>{t(transitOutcome.reason === 'no-service' ? 'transitNoService' :
        transitOutcome.reason === 'access' ? 'transitAccessFailed' : 'transitDisconnected')}</p> :
        <p>{transitStatus === 'error' ? localizeKnownError(transitError, t) : transitStatus === 'calculating' ? t('transitCalculating') :
          transitStatus === 'loading' ? t('transitDataLoading') : t('selectPlaces')}</p>}
    </div>
  </section>
}
