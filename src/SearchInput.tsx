import { useMemo, useState } from 'react'
import type { SearchEntry } from './search-model'
import { normalizeSearch, searchAddress, searchEntries, searchEntryBrand, searchEntryKind, searchEntryLabel } from './search-model'
import { useI18n } from './i18n'

export function SearchInput({ id, label, query, entries, onChange, onSelect, onFocus, status, showResults = true }: {
  id: string; label: string; query: string; entries: SearchEntry[]
  onChange: (query: string) => void; onSelect: (entry: SearchEntry) => void
  onFocus?: () => void; status?: string; showResults?: boolean
}) {
  const { t, language, number } = useI18n()
  const [active, setActive] = useState(0)
  const results = useMemo(() => searchEntries(entries, query), [entries, query])
  const visible = results.slice(0, 100)
  function choose(entry: SearchEntry) { onSelect(entry); setActive(0) }
  return <div className="search">
    <label htmlFor={id}>{label}</label>
    <input id={id} type="search" value={query} placeholder={t('searchPlaceholder')} autoComplete="off"
      aria-controls={showResults && normalizeSearch(query) ? `${id}-results` : undefined}
      aria-activedescendant={showResults && query && visible[active] ? `${id}-result-${active}` : undefined}
      onFocus={onFocus} onChange={event => { onChange(event.target.value); setActive(0); onFocus?.() }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape') { onChange(''); setActive(0) }
        if (event.key === 'ArrowDown' && visible.length) { event.preventDefault(); setActive(index => Math.min(index + 1, visible.length - 1)) }
        if (event.key === 'ArrowUp' && visible.length) { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
        if (event.key === 'Enter' && visible[active]) { event.preventDefault(); choose(visible[active]) }
      }} />
    {showResults && normalizeSearch(query) && <>
      <p className="search-status" role="status">{status ?? (results.length ?
        `${t('searchResults', { count: number(results.length) })}${results.length > visible.length ? ` · ${t('firstHundred')}` : ''}` : t('noResults'))}</p>
      {visible.length > 0 && <ul className="search-results" id={`${id}-results`} role="listbox" aria-label={t('searchResultsAria', { label })}>
        {visible.map((entry, index) => {
          const name = searchEntryLabel(entry, language)
          const brand = searchEntryBrand(entry)
          const address = searchAddress(entry.selection.properties)
          return <li key={entry.selection.id} id={`${id}-result-${index}`} role="option" aria-selected={index === active}>
            <button type="button" onClick={() => choose(entry)}>
              <strong>{name}</strong><span>{searchEntryKind(entry, language)}{address ? ` · ${address}` : ''}</span>
              {brand && normalizeSearch(brand) !== normalizeSearch(name) && <span className="search-brand">{t('brand')} · {brand}</span>}
              <small>#{entry.selection.sourceFeatureId + 1}</small>
            </button>
          </li>
        })}</ul>}
    </>}
  </div>
}
