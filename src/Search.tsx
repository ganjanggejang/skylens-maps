import { useState } from 'react'
import { SearchInput } from './SearchInput'
import type { SearchEntry, SearchSourceState } from './search-model'

export type { SearchEntry, SearchSourceState } from './search-model'
export { normalizeSearch, searchAddress, dedupeSearchEntries } from './search-model'

export function Search({ entries, optionalStates, onActivate, onDeactivate, onSelect }: {
  entries: SearchEntry[]
  optionalStates: { poi: SearchSourceState; route: SearchSourceState }
  onActivate: () => void
  onDeactivate?: () => void
  onSelect: (entry: SearchEntry) => void
}) {
  const [query, setQuery] = useState('')
  const pending = Object.values(optionalStates).some(state => state === 'idle' || state === 'loading')
  const failed = Object.entries(optionalStates).filter(([, state]) => state === 'error')
    .map(([key]) => key === 'poi' ? '시설·정류장' : '노선')
  const status = pending ? '시설·노선 검색 데이터를 불러오는 중…' : failed.length ?
    `${failed.join(', ')} 검색 데이터를 불러오지 못했습니다. 현재 결과는 일부입니다.` : undefined
  return <section aria-label="지도 검색" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget) && !query) onDeactivate?.()
  }}>
    <SearchInput id="map-search" label="검색" query={query} entries={entries} onChange={setQuery}
      onFocus={onActivate} onSelect={onSelect} status={status} />
  </section>
}
