import { isCommercial, type CommercialAreas } from './commercial'
import { isPark, type ParkAreas } from './parks'
import { hasNetworkObject } from './network-objects'
import type { BuildingData, NetworkData } from './types'

export type LandUseResult = {
  parks?: ParkAreas
  commercial?: CommercialAreas
  commercialBuildingIds?: number[]
  error?: string
  done?: boolean
}

// Keep individual parks and the empty commercial source if inference fails.
export function inferLandUseAreas(
  buildings: BuildingData,
  network: NetworkData,
  consume: (areas: LandUseResult) => void,
) {
  if (
    !buildings.features.some(
      (feature) => isPark(feature.properties) || isCommercial(feature.properties),
    )
  )
    return () => {}
  let worker: Worker | undefined
  let active = true
  try {
    worker = new Worker(new URL('./land-use.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<LandUseResult>) => {
      if (!active) return
      if (event.data.parks || event.data.commercial) consume(event.data)
      if (event.data.error) console.warn('Land use area inference failed:', event.data.error)
      if (event.data.done) {
        active = false
        worker?.terminate()
      }
    }
    worker.onerror = (event) => {
      active = false
      worker?.terminate()
      console.warn('Land use area inference failed:', event.message)
    }
    // Clone only inference inputs, rather than names, addresses, statistics and
    // unrelated transport geometry from the full city export.
    worker.postMessage({
      buildings: {
        type: 'FeatureCollection',
        features: buildings.features.map((f) => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: { Category: f.properties?.Category, Zoning: f.properties?.Zoning },
        })),
      },
      network: {
        type: 'FeatureCollection',
        features: network.features
          .filter(
            (f) =>
              hasNetworkObject(f.properties?.Object, 'Road') &&
              !['Tunnel', 'Elevated'].includes(String(f.properties?.Form)),
          )
          .map((f) => ({
            type: 'Feature',
            geometry: f.geometry,
            properties: {
              Object: f.properties?.Object,
              Form: f.properties?.Form,
              Width: f.properties?.Width,
            },
          })),
      },
    })
  } catch (cause) {
    active = false
    worker?.terminate()
    console.warn('Land use area inference failed:', cause)
  }
  return () => {
    active = false
    worker?.terminate()
  }
}
