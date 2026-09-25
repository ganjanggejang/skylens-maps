import { useEffect, useState } from 'react'
import { SearchInput } from './SearchInput'
import { searchEntryLabel, type SearchEntry } from './search-model'
import type { RouteOutcome } from './routing/types'
import './directions.css'

export type DirectionPlace = { entry: SearchEntry; label: string }

export function Directions({ entries, origin, destination, outcome, calculating, error, onOrigin, onDestination,
  onSwap, onCalculate, onClose, onActivate }: {
  entries: SearchEntry[]; origin: DirectionPlace | null; destination: DirectionPlace | null
  outcome: RouteOutcome | null; calculating: boolean; error: string
  onOrigin: (place: DirectionPlace | null) => void; onDestination: (place: DirectionPlace | null) => void
  onSwap: () => void; onCalculate: () => void; onClose: () => void; onActivate: () => void
}) {
  const [originQuery, setOriginQuery] = useState(origin?.label ?? '')
  const [destinationQuery, setDestinationQuery] = useState(destination?.label ?? '')
  useEffect(() => { if (origin) setOriginQuery(origin.label) }, [origin])
  useEffect(() => { if (destination) setDestinationQuery(destination.label) }, [destination])
  const places = entries.filter(entry => entry.selection.kind !== 'route')
  function select(entry: SearchEntry, side: 'origin' | 'destination') {
    const place = { entry, label: searchEntryLabel(entry) }
    if (side === 'origin') { setOriginQuery(place.label); onOrigin(place) }
    else { setDestinationQuery(place.label); onDestination(place) }
  }
  function swap() {
    setOriginQuery(destination?.label ?? '')
    setDestinationQuery(origin?.label ?? '')
    onSwap()
  }
  const same = origin && destination && origin.entry.selection.id === destination.entry.selection.id
  return <section className="directions" aria-label="길찾기">
    <div className="directions-heading"><h2>길찾기</h2><button type="button" onClick={onClose} aria-label="길찾기 닫기">×</button></div>
    <SearchInput id="directions-origin" label="출발지" query={originQuery} entries={places}
      showResults={!origin || originQuery !== origin.label} onFocus={onActivate}
      onChange={query => { setOriginQuery(query); onOrigin(null) }} onSelect={entry => select(entry, 'origin')} />
    <button type="button" className="directions-swap" onClick={swap} aria-label="출발지와 도착지 바꾸기">출발·도착 바꾸기 ↕</button>
    <SearchInput id="directions-destination" label="도착지" query={destinationQuery} entries={places}
      showResults={!destination || destinationQuery !== destination.label} onFocus={onActivate}
      onChange={query => { setDestinationQuery(query); onDestination(null) }} onSelect={entry => select(entry, 'destination')} />
    {same && <p className="directions-error" role="status">출발지와 도착지가 같습니다.</p>}
    {error && <p className="directions-error" role="alert">{error}</p>}
    <button type="button" className="directions-submit" disabled={!origin || !destination || !!same || calculating}
      onClick={onCalculate}>{calculating ? '경로 계산 중…' : '경로 찾기'}</button>
    {outcome && <div className="directions-card" aria-live="polite">
      <h3>차량</h3>
      {outcome.route ? <>
        <strong>{Math.max(1, Math.round(outcome.route.seconds / 60))}분 · {(outcome.route.distance / 1000).toFixed(1)}km</strong>
        <p>도로 중심선 {outcome.route.featureIds.length}개 구간 · 접근 {Math.round(outcome.route.accessDistance)}m</p>
      </> : <p>{outcome.reason === 'access' ? '출발지 또는 도착지에서 150m 이내 도로를 찾지 못했습니다.' :
        '통행 방향을 따르는 연결 경로를 찾지 못했습니다.'}</p>}
      <small>예상 시간 · 교통상황 미반영 · 도로 속도 제한의 80% 적용</small>
    </div>}
    <div className="directions-card"><h3>대중교통</h3><p>정류장·노선 연결 계산을 구현 중입니다.</p></div>
  </section>
}
