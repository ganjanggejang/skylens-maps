import { useState } from 'react'
import { SearchInput } from './SearchInput'
import type { PlaceEntry } from '../data/place'
import type { SearchSourceState } from './search-model'
import { useI18n } from '../i18n'

export function Search({ entries, optionalStates, onActivate, onDeactivate, onSelect }: {
  entries: PlaceEntry[]
  optionalStates: { poi: SearchSourceState; route: SearchSourceState }
  onActivate: () => void
  onDeactivate?: () => void
  onSelect: (entry: PlaceEntry) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const pending = Object.values(optionalStates).some(state => state === 'idle' || state === 'loading')
  const failed = Object.entries(optionalStates).filter(([, state]) => state === 'error')
    .map(([key]) => t(key === 'poi' ? 'poi' : 'route'))
  const status = pending ? t('searchLoading') : failed.length ?
    t('searchFailed', { sources: failed.join(', ') }) : undefined
  return <section aria-label={t('searchRegion')} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget) && !query) onDeactivate?.()
  }}>
    <SearchInput id="map-search" label={t('search')} query={query} entries={entries} onChange={setQuery}
      onFocus={onActivate} onSelect={onSelect} status={status} />
  </section>
}
