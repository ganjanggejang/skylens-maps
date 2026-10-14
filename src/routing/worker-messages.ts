import type { FeatureCollection, LineString, Point } from 'geojson'
import type { RoutePlace } from './geometry'
import type { RouteOutcome, TransitOutcome } from './types'

type SessionMessage = { datasetId: string; configVersion: number }
type RouteRequest = { requestId: number; origin: RoutePlace; destination: RoutePlace }

export type RoutingRequest = SessionMessage & (
  { type: 'init'; network: FeatureCollection<LineString> } |
  { type: 'transit-data'; pois: FeatureCollection<Point>; routes: FeatureCollection<LineString> } |
  ({ type: 'route' | 'route-transit' } & RouteRequest)
)

export type RoutingResponse = { datasetId: string } & (
  { type: 'ready' | 'transit-ready' } |
  { type: 'transit-error'; error: string } |
  { type: 'result'; requestId: number; outcome: RouteOutcome } |
  { type: 'error'; requestId: number; error: string } |
  ({ type: 'transit-result'; requestId: number } & (
    { outcome: TransitOutcome; error?: never } | { error: string; outcome?: never }
  ))
)
