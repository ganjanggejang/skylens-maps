import type { Map as MapLibreMap } from 'maplibre-gl'

export type SymbolTarget = { source: string; id: string | number; icon?: string }

export function createSymbolPress(map: MapLibreMap) {
  const originals = new Map<string, HTMLCanvasElement>()
  let active: { target: SymbolTarget; imageId?: string; original?: HTMLCanvasElement } | null = null
  let frame = 0
  let output: HTMLCanvasElement | undefined

  function draw(scale: number) {
    if (!active?.original || !active.imageId) return
    output ??= document.createElement('canvas')
    const context = output.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const original = active.original
    output.width = original.width
    output.height = original.height
    const width = original.width * scale
    const height = original.height * scale
    context.drawImage(original, (original.width - width) / 2, (original.height - height) / 2, width, height)
    map.updateImage(active.imageId, context.getImageData(0, 0, output.width, output.height))
  }

  function cancel() {
    cancelAnimationFrame(frame)
    frame = 0
    if (active) {
      map.setFeatureState(active.target, { pressed: false, pressProgress: 0 })
      draw(1)
      active = null
    }
  }

  return {
    start(target: SymbolTarget) {
      cancel()
      const imageId = target.icon ? `${target.icon}-pressed` : undefined
      let original = imageId ? originals.get(imageId) : undefined
      if (imageId && !original && map.hasImage(imageId)) {
        const image = map.getImage(imageId).data
        original = document.createElement('canvas')
        original.width = image.width
        original.height = image.height
        original.getContext('2d')!.putImageData(
          new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
        originals.set(imageId, original)
      }
      active = { target, imageId, original }
      draw(0.9)
      map.setFeatureState(target, { pressed: true, pressProgress: 1 })
    },
    release() {
      if (!active) return
      const start = performance.now()
      const tick = (now: number) => {
        if (!active) return
        const t = Math.min(1, (now - start) / 120)
        const eased = 1 - (1 - t) ** 3
        draw(0.9 + eased * 0.1)
        map.setFeatureState(active.target, { pressProgress: 1 - eased })
        if (t === 1) cancel()
        else frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    },
    cancel,
    dispose() {
      cancelAnimationFrame(frame)
      active = null
      originals.clear()
    },
  }
}
