import type { Coordinate } from './geometry'

export type TravelMode = 'vehicle' | 'walk'
export type RoutingEdge = {
  to: number
  distance: number
  seconds: number
  coordinates: [Coordinate, Coordinate]
  featureId: number | null
  kind: TravelMode | 'access'
}
export type RouteResult = {
  distance: number
  seconds: number
  coordinates: Coordinate[][]
  accessDistance: number
  featureIds: number[]
}
export type RouteFailure = 'access' | 'disconnected'
export type RouteOutcome = { route: RouteResult; reason?: never } | { route?: never; reason: RouteFailure }
