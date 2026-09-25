/// <reference lib="webworker" />
import type { FeatureCollection, LineString, Point } from 'geojson'
import { NetworkGraph } from './network'
import { TransitPlanner } from './transit-planner'
import { ROUTING_CONFIG } from './config'
import type { Coordinate } from './geometry'

let graph: NetworkGraph | null = null
let transit: TransitPlanner | null = null
let networkData: FeatureCollection<LineString> | null = null
let datasetId = ''

self.onmessage = (event: MessageEvent<
  { type: 'init'; datasetId: string; configVersion: number; network: FeatureCollection<LineString> } |
  { type: 'transit-data'; datasetId: string; configVersion: number;
    pois: FeatureCollection<Point>; routes: FeatureCollection<LineString> } |
  { type: 'route'; datasetId: string; configVersion: number; requestId: number;
    origin: Coordinate; destination: Coordinate } |
  { type: 'route-transit'; datasetId: string; configVersion: number; requestId: number;
    origin: Coordinate; destination: Coordinate }
>) => {
  const message = event.data
  if (message.type === 'init') {
    if (message.configVersion !== ROUTING_CONFIG.version) return
    datasetId = message.datasetId
    networkData = message.network
    graph = new NetworkGraph('vehicle', message.network)
    self.postMessage({ type: 'ready', datasetId, excluded: graph.excluded })
    return
  }
  if (message.type === 'transit-data') {
    if (datasetId !== message.datasetId || message.configVersion !== ROUTING_CONFIG.version || !networkData) return
    try {
      transit = new TransitPlanner(networkData, message.pois, message.routes)
      self.postMessage({ type: 'transit-ready', datasetId,
        routes: transit.data.routes.length, stops: transit.data.occurrences.length,
        excluded: transit.data.excluded })
    } catch (cause) {
      self.postMessage({ type: 'transit-error', datasetId,
        error: cause instanceof Error ? cause.message : String(cause) })
    }
    return
  }
  if (message.type === 'route-transit') {
    if (!transit || datasetId !== message.datasetId || message.configVersion !== ROUTING_CONFIG.version) {
      self.postMessage({ type: 'transit-result', requestId: message.requestId, datasetId: message.datasetId,
        error: '대중교통 경로 데이터가 준비되지 않았습니다.' })
      return
    }
    try {
      self.postMessage({ type: 'transit-result', requestId: message.requestId, datasetId,
        outcome: transit.route(message.origin, message.destination) })
    } catch (cause) {
      self.postMessage({ type: 'transit-result', requestId: message.requestId, datasetId,
        error: cause instanceof Error ? cause.message : String(cause) })
    }
    return
  }
  if (!graph || datasetId !== message.datasetId || message.configVersion !== ROUTING_CONFIG.version) {
    self.postMessage({ type: 'error', requestId: message.requestId, datasetId: message.datasetId, error: '도로 데이터가 준비되지 않았습니다.' })
    return
  }
  self.postMessage({ type: 'result', requestId: message.requestId, datasetId,
    outcome: graph.route(message.origin, message.destination) })
}
