import { isPark, type ParkAreas } from './parks'
import type { BuildingData, NetworkData } from './types'

// The initial individual polygons remain visible if inference fails or is cancelled.
export function inferParkAreas(buildings: BuildingData, network: NetworkData,
  consume: (parks: ParkAreas) => void) {
  if (!buildings.features.some(feature => isPark(feature.properties))) return () => {}
  const worker = new Worker(new URL('./parks.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ parks?: ParkAreas; error?: string }>) => {
    worker.terminate()
    if (event.data.parks) consume(event.data.parks)
    else console.warn('Park area inference failed:', event.data.error)
  }
  worker.onerror = event => { worker.terminate(); console.warn('Park area inference failed:', event.message) }
  worker.postMessage({ buildings, network })
  return () => { worker.terminate() }
}
