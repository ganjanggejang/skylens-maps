import { describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { installMapEvents } from './map-events'

function setup() {
  const handlers = new Map<string, (event: { point: { x: number; y: number } }) => void>()
  let hit: { source: string; id?: number } | null = null
  let moving = false
  const setFeatureState = vi.fn()
  const onSelect = vi.fn()
  const canvas = { style: { cursor: '' } }
  const map = {
    on: (name: string, handler: (event: { point: { x: number; y: number } }) => void) => {
      handlers.set(name, handler)
    },
    getLayer: () => true,
    getCanvas: () => canvas,
    isMoving: () => moving,
    setFeatureState,
    queryRenderedFeatures: (_point: unknown, options: { layers: string[] }) =>
      options.layers.includes('place-building-label') && options.layers.includes('place-subway-label') && hit ? [hit] : [],
  } as unknown as MapLibreMap
  installMapEvents(map, new Map(), () => [], onSelect)
  return { setFeatureState, onSelect, canvas,
    hit: (next: typeof hit) => { hit = next },
    move: (next: boolean) => { moving = next },
    emit: (name: string) => handlers.get(name)!({ point: { x: 100, y: 100 } }),
  }
}

describe('map symbol hover', () => {
  it('highlights one symbol at a time, distinguishing matching IDs in different sources', () => {
    const scene = setup()
    scene.hit({ source: 'building-places', id: 0 })
    scene.emit('mousemove')
    scene.emit('mousemove')
    expect(scene.setFeatureState).toHaveBeenCalledTimes(1)
    scene.hit({ source: 'subway-stations', id: 0 })
    scene.emit('mousemove')
    expect(scene.setFeatureState.mock.calls).toEqual([
      [{ source: 'building-places', id: 0 }, { hover: true }],
      [{ source: 'building-places', id: 0 }, { hover: false }],
      [{ source: 'subway-stations', id: 0 }, { hover: true }],
    ])
    expect(scene.onSelect).not.toHaveBeenCalled()
  })

  it('restores the previous color over empty space or an unidentified feature', () => {
    const scene = setup()
    scene.hit({ source: 'building-places', id: 7 })
    scene.emit('mousemove')
    scene.hit(null)
    scene.emit('mousemove')
    scene.hit({ source: 'building-places' })
    scene.emit('mousemove')
    expect(scene.setFeatureState).toHaveBeenCalledTimes(2)
    expect(scene.setFeatureState).toHaveBeenLastCalledWith({ source: 'building-places', id: 7 }, { hover: false })
  })

  it('clears hover on movement and exit, and does not highlight symbols during movement', () => {
    const scene = setup()
    scene.hit({ source: 'building-places', id: 7 })
    scene.emit('mousemove')
    scene.emit('movestart')
    scene.move(true)
    scene.emit('mousemove')
    expect(scene.setFeatureState).toHaveBeenCalledTimes(2)
    scene.move(false)
    scene.emit('mousemove')
    scene.emit('mouseout')
    expect(scene.setFeatureState).toHaveBeenCalledTimes(4)
    expect(scene.setFeatureState).toHaveBeenLastCalledWith({ source: 'building-places', id: 7 }, { hover: false })
    expect(scene.canvas.style.cursor).toBe('')
    expect(scene.onSelect).not.toHaveBeenCalled()
  })
})
