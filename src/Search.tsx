import { useMemo, useState } from 'react'
import type { LineString, Point, Polygon } from 'geojson'
import type { Selection } from './interaction'
import { brandMatchesQuery, buildingBrand, buildingTitle, normalizeText, propertyText as value } from './building-name'

export type SearchEntry = { selection: Selection; geometry: Point | LineString | Polygon }
export type SearchSourceState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export function normalizeSearch(value: string) {
  return normalizeText(value)
}

export function searchAddress(properties: Record<string, unknown>) {
  return ['Address_District', 'Address_Street', 'Address_Number'].map(key => value(properties, key)).filter(Boolean).join(' ')
}

function buildingPoiKey(properties: Record<string, unknown>) {
  const fields = ['Name', 'Address_District', 'Address_Street', 'Address_Number']
    .map(key => normalizeSearch(value(properties, key)))
  return fields.every(Boolean) ? JSON.stringify(fields) : null
}

const hiddenPoiCategories = new Set(['UtilityPylon', 'TrafficLight'])

export function dedupeSearchEntries(entries: SearchEntry[]) {
  const buildings = new Set(entries.filter(entry => entry.selection.kind === 'building')
    .map(entry => buildingPoiKey(entry.selection.properties)).filter((key): key is string => key !== null))
  return entries.filter(entry => entry.selection.kind !== 'poi' || (
    !hiddenPoiCategories.has(value(entry.selection.properties, 'Category')) &&
    !buildings.has(buildingPoiKey(entry.selection.properties) ?? '')
  ))
}

const labels: Record<Selection['kind'], string> = { building: '건물', road: '도로', poi: '시설·정류장', route: '노선' }

export function Search({ entries, optionalStates, onActivate, onSelect }: {
  entries: SearchEntry[]
  optionalStates: { poi: SearchSourceState; route: SearchSourceState }
  onActivate: () => void
  onSelect: (entry: SearchEntry) => void
}) {
  const [query, setQuery] = useState('')
  const normalized = normalizeSearch(query)
  const searchableEntries = useMemo(() => dedupeSearchEntries(entries), [entries])
  const results = useMemo(() => normalized ? searchableEntries.filter(({ selection }) => {
    const properties = selection.properties
    return normalizeSearch(`${value(properties, 'Name')} ${searchAddress(properties)}`).includes(normalized) ||
      (selection.kind === 'building' && brandMatchesQuery(properties, normalized))
  }) : [], [searchableEntries, normalized])
  const pending = Object.values(optionalStates).some(state => state === 'idle' || state === 'loading')
  const failed = Object.entries(optionalStates).filter(([, state]) => state === 'error').map(([key]) => key === 'poi' ? '시설·정류장' : '노선')

  return <section className="search" aria-label="지도 검색">
    <label htmlFor="map-search">검색</label>
    <input id="map-search" type="search" value={query} placeholder="이름 또는 주소 검색"
      onFocus={onActivate} onChange={event => { setQuery(event.target.value); onActivate() }} />
    {normalized && <>
      <p className="search-status" role="status">
        {pending ? '시설·노선 검색 데이터를 불러오는 중…' : failed.length ? `${failed.join(', ')} 검색 데이터를 불러오지 못했습니다. 현재 결과는 일부입니다.` :
          results.length ? `${results.length.toLocaleString('ko-KR')}개 결과` : '검색 결과가 없습니다.'}
      </p>
      {results.length > 0 && <ul className="search-results">
        {results.map(entry => {
          const { selection } = entry
          const name = selection.kind === 'building' ? buildingTitle(selection.properties, selection.id) :
            value(selection.properties, 'Name') || `이름 없는 ${labels[selection.kind]}`
          const brand = selection.kind === 'building' ? buildingBrand(selection.properties) : ''
          const address = searchAddress(selection.properties)
          return <li key={selection.id}><button type="button" onClick={() => onSelect(entry)}>
            <strong>{name}</strong><span>{labels[selection.kind]}{address ? ` · ${address}` : ''}</span>
            {brand && normalizeSearch(brand) !== normalizeSearch(name) && <span className="search-brand">입점 업체 · {brand}</span>}
            <small>#{selection.sourceFeatureId + 1}</small>
          </button></li>
        })}
      </ul>}
    </>}
  </section>
}
