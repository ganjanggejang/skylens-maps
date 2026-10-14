import { describe, expect, it } from 'vitest'
import { hasNetworkObject, networkObjectTypes } from './network-objects'

describe('Carto network Object labels', () => {
  it('recognizes individual types in combined labels', () => {
    expect(hasNetworkObject('Pathway, Road, Track', 'Road')).toBe(true)
    expect(hasNetworkObject('Road, Track', 'Pathway')).toBe(false)
    expect(hasNetworkObject('Waterway', 'Way')).toBe(false)
  })

  it('normalizes whitespace, repeated types, and empty tokens', () => {
    expect(networkObjectTypes(' Road, Track, Road, , ')).toEqual(['Road', 'Track'])
  })

  it('treats missing or non-string labels as having no types', () => {
    for (const value of [undefined, null, 42, [], {}, '']) {
      expect(networkObjectTypes(value)).toEqual([])
      expect(hasNetworkObject(value, 'Road')).toBe(false)
    }
  })
})
