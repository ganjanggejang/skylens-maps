import { useEffect } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { placeCoordinate } from '../routing/geometry'
import { showDirections } from '../routing/directions-layers'
import type { useDirections } from '../routing/useDirections'
import { fit, geometryBounds } from './camera'

type DirectionsState = Pick<ReturnType<typeof useDirections>, 'directionsOrigin' | 'directionsDestination' |
  'directionsOutcome' | 'transitOutcome' | 'selectedDirectionsMode'>

export function useDirectionsMap(map: MapLibreMap | null, open: boolean, state: DirectionsState) {
  const { directionsOrigin, directionsDestination, directionsOutcome, transitOutcome, selectedDirectionsMode } = state
  useEffect(() => {
    if (!map?.getSource('directions-line')) return
    let origin = directionsOrigin ? placeCoordinate(directionsOrigin.entry.geometry) : null
    let destination = directionsDestination ? placeCoordinate(directionsDestination.entry.geometry) : null
    const car = open && selectedDirectionsMode === 'vehicle' ? directionsOutcome?.route ?? null : null
    const journey = open && selectedDirectionsMode === 'transit' ? transitOutcome?.journey ?? null : null
    if (car?.coordinates.length) {
      origin = car.coordinates[0][0]
      destination = car.coordinates.at(-1)!.at(-1)!
    } else if (journey) {
      const drawn = journey.legs.filter(leg => leg.coordinates.length)
      if (drawn.length) {
        origin = drawn[0].coordinates[0]
        destination = drawn.at(-1)!.coordinates.at(-1)!
      }
    }
    showDirections(map, car, journey, open ? origin : null, open ? destination : null)
    if (car) fit(map, geometryBounds(car.coordinates))
    if (journey) {
      const coordinates = journey.legs.flatMap(leg => leg.coordinates)
      if (coordinates.length) fit(map, geometryBounds(coordinates))
    }
  }, [map, open, directionsOrigin, directionsDestination, directionsOutcome, transitOutcome, selectedDirectionsMode])

  return function focusLeg(index: number) {
    const leg = transitOutcome?.journey?.legs[index]
    if (!leg || !map) return
    if (leg.coordinates.length >= 2) fit(map, geometryBounds(leg.coordinates))
    else if (leg.stopPoint) map.flyTo({ center: leg.stopPoint, zoom: Math.max(map.getZoom(), 15), duration: 650 })
  }
}
