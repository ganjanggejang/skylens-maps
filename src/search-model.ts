import type { LineString, Point, Polygon } from 'geojson'
import type { Selection } from './interaction'
import { brandMatchesQuery, buildingBrand, buildingTitle, normalizeText, propertyText } from './building-name'
import type { Language } from './i18n'

export type SearchEntry = { selection: Selection; geometry: Point | LineString | Polygon }
export type SearchSourceState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'
export const normalizeSearch = normalizeText

export function searchAddress(properties: Record<string, unknown>) {
  return ['Address_District', 'Address_Street', 'Address_Number']
    .map(key => propertyText(properties, key)).filter(Boolean).join(' ')
}

function buildingPoiKey(properties: Record<string, unknown>) {
  const fields = ['Name', 'Address_District', 'Address_Street', 'Address_Number']
    .map(key => normalizeSearch(propertyText(properties, key)))
  return fields.every(Boolean) ? JSON.stringify(fields) : null
}

const hiddenPoiCategories = new Set(['UtilityPylon', 'TrafficLight'])

export function dedupeSearchEntries(entries: SearchEntry[]) {
  const buildings = new Set(entries.filter(entry => entry.selection.kind === 'building')
    .map(entry => buildingPoiKey(entry.selection.properties)).filter((key): key is string => key !== null))
  return entries.filter(entry => entry.selection.kind !== 'poi' || (
    !hiddenPoiCategories.has(propertyText(entry.selection.properties, 'Category')) &&
    !buildings.has(buildingPoiKey(entry.selection.properties) ?? '')
  ))
}

export function searchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const normalized = normalizeSearch(query)
  if (!normalized) return []
  return dedupeSearchEntries(entries).filter(({ selection }) => {
    const properties = selection.properties
    return normalizeSearch(`${propertyText(properties, 'Name')} ${searchAddress(properties)}`).includes(normalized) ||
      (selection.kind === 'building' && brandMatchesQuery(properties, normalized))
  })
}

const labels: Record<Selection['kind'], string> = { building: '건물', road: '도로', poi: '시설·정류장', route: '노선' }

export function searchEntryLabel(entry: SearchEntry, language: Language = 'ko') {
  const { selection } = entry
  if (selection.kind === 'building') {
    const title = buildingTitle(selection.properties, selection.id)
    return language === 'en' && !propertyText(selection.properties, 'Name') && !buildingBrand(selection.properties) ?
      `Building ${selection.id}` : title
  }
  return propertyText(selection.properties, 'Name') || (language === 'en' ?
    `Unnamed ${{ building: 'building', road: 'road', poi: 'facility or stop', route: 'route' }[selection.kind]}` :
    `이름 없는 ${labels[selection.kind]}`)
}

export function searchEntryKind(entry: SearchEntry, language: Language = 'ko') {
  return language === 'en' ? { building: 'Building', road: 'Road', poi: 'Facility · stop', route: 'Route' }[entry.selection.kind] : labels[entry.selection.kind]
}
export function searchEntryBrand(entry: SearchEntry) {
  return entry.selection.kind === 'building' ? buildingBrand(entry.selection.properties) : ''
}
