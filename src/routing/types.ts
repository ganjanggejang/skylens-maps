import type { Coordinate } from './geometry'
import type { TransitMode } from './transit'

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

export type JourneyLeg = {
  kind: 'walk' | 'wait' | 'ride'
  distance: number
  seconds: number
  coordinates: Coordinate[]
  routeId?: number
  routeName?: string
  mode?: TransitMode
  color?: string
  fromStop?: string
  toStop?: string
  stopPoint?: Coordinate
}
export type TransitJourney = {
  legs: JourneyLeg[]
  distance: number
  seconds: number
  transfers: number
  assumptions: string[]
}
export type TransitFailure = 'no-service' | 'access' | 'disconnected'
export type TransitOutcome = { journey: TransitJourney; reason?: never } |
  { journey?: never; reason: TransitFailure }
