// Carto can label one network segment with several Object types in a single string.
export function networkObjectTypes(value: unknown): string[] {
  return typeof value === 'string' ? [...new Set(value.split(',').map(type => type.trim()).filter(Boolean))] : []
}

export function hasNetworkObject(value: unknown, type: string): boolean {
  return networkObjectTypes(value).includes(type)
}
