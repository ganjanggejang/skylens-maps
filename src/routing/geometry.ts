import type { LineString, Point, Polygon } from 'geojson'

export type Coordinate = [number, number]
const METERS_PER_DEGREE = 111_320

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const latitude = (a[1] + b[1]) / 2 * Math.PI / 180
  return Math.hypot((a[0] - b[0]) * METERS_PER_DEGREE * Math.cos(latitude),
    (a[1] - b[1]) * METERS_PER_DEGREE)
}

export function projectPoint(point: Coordinate, start: Coordinate, end: Coordinate) {
  const longitude = METERS_PER_DEGREE * Math.cos(point[1] * Math.PI / 180)
  const x = (point[0] - start[0]) * longitude
  const y = (point[1] - start[1]) * METERS_PER_DEGREE
  const dx = (end[0] - start[0]) * longitude
  const dy = (end[1] - start[1]) * METERS_PER_DEGREE
  const fraction = dx * dx + dy * dy ? Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy))) : 0
  const projected: Coordinate = [start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction]
  return { point: projected, fraction, distance: distanceMeters(point, projected) }
}

function insideRing(point: Coordinate, ring: number[][]) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index], b = ring[previous]
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

export function placeCoordinate(geometry: Point | LineString | Polygon): Coordinate {
  if (geometry.type === 'Point') return geometry.coordinates as Coordinate
  if (geometry.type === 'LineString') {
    const points = geometry.coordinates
    if (!points.length) throw new Error('빈 도로 선형')
    const lengths = points.slice(1).map((point, index) => distanceMeters(points[index] as Coordinate, point as Coordinate))
    let remaining = lengths.reduce((sum, value) => sum + value, 0) / 2
    for (let index = 0; index < lengths.length; index++) {
      if (remaining <= lengths[index]) {
        const fraction = lengths[index] ? remaining / lengths[index] : 0
        return [points[index][0] + (points[index + 1][0] - points[index][0]) * fraction,
          points[index][1] + (points[index + 1][1] - points[index][1]) * fraction]
      }
      remaining -= lengths[index]
    }
    return points.at(-1) as Coordinate
  }
  const outer = geometry.coordinates[0]
  if (!outer?.length) throw new Error('빈 건물 경계')
  const minX = Math.min(...outer.map(point => point[0])), maxX = Math.max(...outer.map(point => point[0]))
  const minY = Math.min(...outer.map(point => point[1])), maxY = Math.max(...outer.map(point => point[1]))
  const inside = (point: Coordinate) => insideRing(point, outer) &&
    geometry.coordinates.slice(1).every(hole => !insideRing(point, hole))
  const center: Coordinate = [(minX + maxX) / 2, (minY + maxY) / 2]
  if (inside(center)) return center
  for (let grid = 3; grid <= 15; grid += 2) {
    for (let row = 0; row < grid; row++) for (let column = 0; column < grid; column++) {
      const point: Coordinate = [minX + (maxX - minX) * (column + 0.5) / grid,
        minY + (maxY - minY) * (row + 0.5) / grid]
      if (inside(point)) return point
    }
  }
  return outer[0] as Coordinate
}
