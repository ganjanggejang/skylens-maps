export function propertyText(properties: Record<string, unknown>, key: string): string {
  const value = properties[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

export function normalizeText(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase()
}

export function buildingBrand(properties: Record<string, unknown>): string {
  return propertyText(properties, 'Brand')
}

export function buildingTitle(properties: Record<string, unknown>, id: string): string {
  const name = propertyText(properties, 'Name')
  const zone = propertyText(properties, 'Zone')
  const brand = buildingBrand(properties)
  const zoning = propertyText(properties, 'Zoning').split(',').map(value => value.trim())
  const hasBusinessZoning = zoning.some(value => ['Industrial', 'Office', 'Commercial'].includes(value))

  if (name && (!zone || normalizeText(name) !== normalizeText(zone))) return name
  if (hasBusinessZoning && brand) return brand
  return name || brand || `건물 ${id}`
}

export function brandMatchesQuery(properties: Record<string, unknown>, normalizedQuery: string): boolean {
  const brand = normalizeText(buildingBrand(properties))
  if (!brand) return false
  return brand.includes(normalizedQuery) ||
    brand.replace(/\s+/g, '').includes(normalizedQuery.replace(/\s+/g, ''))
}
