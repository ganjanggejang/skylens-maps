import type { FeatureCollection, LineString } from 'geojson'
import { ROUTING_CONFIG } from './config'
import type { RoutingRequest, RoutingResponse } from './worker-messages'

export type RoutingWorker = {
  postMessage: (message: RoutingRequest) => void
  terminate: () => void
}

export function createRoutingWorker(datasetId: string, network: FeatureCollection<LineString>,
  onMessage: (message: RoutingResponse) => void, onError: () => void): RoutingWorker {
  const worker = new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<RoutingResponse>) => onMessage(event.data)
  worker.onerror = onError
  const client: RoutingWorker = {
    postMessage: message => worker.postMessage(message),
    terminate: () => worker.terminate(),
  }
  client.postMessage({ type: 'init', datasetId, configVersion: ROUTING_CONFIG.version, network })
  return client
}
