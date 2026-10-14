import type { Map as MapLibreMap, LngLatBoundsLike } from 'maplibre-gl'
import type { BuildingData, NetworkData, Extent, Bounds } from '../data/types'

function extendBounds(coordinates: unknown, bounds: Extent): void {
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw new Error('빈 좌표 배열')
  if (typeof coordinates[0] === 'number') {
    const [x, y] = coordinates
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('유효하지 않은 좌표')
    bounds[0] = Math.min(bounds[0], x)
    bounds[1] = Math.min(bounds[1], y)
    bounds[2] = Math.max(bounds[2], x)
    bounds[3] = Math.max(bounds[3], y)
    return
  }
  coordinates.forEach(value => extendBounds(value, bounds))
}

export function getBounds(collections: Array<BuildingData | NetworkData>): Bounds {
  const bounds: Extent = [Infinity, Infinity, -Infinity, -Infinity]
  for (const collection of collections) {
    for (const feature of collection.features) extendBounds(feature.geometry.coordinates, bounds)
  }
  return [[bounds[0], bounds[1]], [bounds[2], bounds[3]]]
}

export function geometryBounds(coordinates: unknown): Bounds {
  const extent: Extent = [Infinity, Infinity, -Infinity, -Infinity]
  extendBounds(coordinates, extent)
  return [[extent[0], extent[1]], [extent[2], extent[3]]]
}

function expandBounds(bounds: Bounds): Bounds {
  const [[west, south], [east, north]] = bounds
  const longitudeMargin = (east - west) * 0.65
  const latitudeMargin = (north - south) * 0.65
  return [[west - longitudeMargin, south - latitudeMargin], [east + longitudeMargin, north + latitudeMargin]]
}

export function fitPadding() {
  return window.innerWidth < 700 ? { top: 150, bottom: 90, left: 28, right: 28 } :
    { top: 80, bottom: 80, left: 390, right: 80 }
}

function overviewPadding(map: MapLibreMap) {
  return Math.floor(Math.min(24, map.getCanvas().clientWidth * 0.05, map.getCanvas().clientHeight * 0.05))
}

export function fit(map: MapLibreMap, bounds: LngLatBoundsLike) {
  map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 15, duration: 650 })
}

export function constrainMap(map: MapLibreMap, all: Bounds) {
  const minimumView = map.cameraForBounds(all, { padding: overviewPadding(map), maxZoom: 15 })
  if (typeof minimumView?.zoom === 'number') map.setMinZoom(Math.max(0, minimumView.zoom - 1))
  map.setMaxBounds(expandBounds(all))
}
