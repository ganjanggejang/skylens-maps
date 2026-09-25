/// <reference lib="webworker" />
import type { FeatureCollection, LineString } from 'geojson'
import { NetworkGraph } from './network'
import { ROUTING_CONFIG } from './config'
import type { Coordinate } from './geometry'

let graph: NetworkGraph | null = null
let datasetId = ''

self.onmessage = (event: MessageEvent<
  { type: 'init'; datasetId: string; configVersion: number; network: FeatureCollection<LineString> } |
  { type: 'route'; datasetId: string; configVersion: number; requestId: number;
    origin: Coordinate; destination: Coordinate }
>) => {
  const message = event.data
  if (message.type === 'init') {
    if (message.configVersion !== ROUTING_CONFIG.version) return
    datasetId = message.datasetId
    graph = new NetworkGraph('vehicle', message.network)
    self.postMessage({ type: 'ready', datasetId, excluded: graph.excluded })
    return
  }
  if (!graph || datasetId !== message.datasetId || message.configVersion !== ROUTING_CONFIG.version) {
    self.postMessage({ type: 'error', requestId: message.requestId, datasetId: message.datasetId, error: '도로 데이터가 준비되지 않았습니다.' })
    return
  }
  self.postMessage({ type: 'result', requestId: message.requestId, datasetId,
    outcome: graph.route(message.origin, message.destination) })
}
