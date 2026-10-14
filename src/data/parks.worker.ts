import { buildParkAreas } from './park-areas'
import type { BuildingData, NetworkData } from './types'

self.onmessage = (event: MessageEvent<{ buildings: BuildingData; network: NetworkData }>) => {
  try {
    self.postMessage({ parks: buildParkAreas(event.data.buildings, event.data.network) })
  } catch (cause) {
    self.postMessage({ error: cause instanceof Error ? cause.message : String(cause) })
  }
}
