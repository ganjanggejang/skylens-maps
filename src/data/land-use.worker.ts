import { buildCommercialAreas } from './commercial-areas'
import { commercialBuildingIds } from './commercial-buildings'
import { buildParkAreas } from './park-areas'
import { prepareRoadGeometry } from './road-blocks'
import type { BuildingData, NetworkData } from './types'

self.onmessage = (event: MessageEvent<{ buildings: BuildingData; network: NetworkData }>) => {
  const { buildings, network } = event.data
  try {
    const roads = prepareRoadGeometry(network, buildings.features[0].geometry.coordinates[0][0][1])
    for (const [key, build] of [
      ['parks', buildParkAreas],
      ['commercial', buildCommercialAreas],
    ] as const) {
      try {
        if (key === 'commercial') {
          const commercial = buildCommercialAreas(buildings, network, roads)
          self.postMessage({ commercial, commercialBuildingIds: commercialBuildingIds(buildings, commercial) })
        } else {
          self.postMessage({ parks: build(buildings, network, roads) })
        }
      } catch (cause) {
        self.postMessage({
          error: `${key}: ${cause instanceof Error ? cause.message : String(cause)}`,
        })
      }
    }
  } catch (cause) {
    self.postMessage({ error: cause instanceof Error ? cause.message : String(cause) })
  } finally {
    self.postMessage({ done: true })
  }
}
