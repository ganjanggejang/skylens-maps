export type Pair = [number, number]
export type Polygon = Pair[][]
export type MultiPolygon = Polygon[]

export type Box = [number, number, number, number]
export const METERS_PER_DEGREE = 111_320
export const roundedPoint = (p: Pair): Pair => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]

export function projection(latitude: number) {
  const scaleX = METERS_PER_DEGREE * Math.cos(latitude * Math.PI / 180)
  return {
    toMeters: (p: number[]): Pair => roundedPoint([p[0] * scaleX, p[1] * METERS_PER_DEGREE]),
    toCoordinates: (p: Pair): Pair => [p[0] / scaleX, p[1] / METERS_PER_DEGREE],
  }
}

export function box(points: Pair[]): Box {
  const bounds: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of points) {
    bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y)
    bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y)
  }
  return bounds
}

export function overlaps(a: Box, b: Box) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

export function signedArea(ring: Pair[]) {
  let sum = 0
  const origin = ring[0]
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i]
    sum += (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1])
  }
  return sum / 2
}

export function polygonArea(polygon: Polygon) {
  return Math.abs(signedArea(polygon[0])) - polygon.slice(1).reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0)
}

export function multiArea(polygons: MultiPolygon) {
  return polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0)
}

export function insideRing(point: Pair, ring: Pair[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

// Used for both segment noding and local building/road queries. Coordinates are meters.
export class BoxIndex {
  private cells = new Map<string, number[]>()
  constructor(private size = 64) {}
  private keys(bounds: Box) {
    const keys: string[] = []
    for (let x = Math.floor(bounds[0] / this.size); x <= Math.floor(bounds[2] / this.size); x++)
      for (let y = Math.floor(bounds[1] / this.size); y <= Math.floor(bounds[3] / this.size); y++) keys.push(`${x},${y}`)
    return keys
  }
  add(id: number, bounds: Box) {
    for (const key of this.keys(bounds)) {
      const cell = this.cells.get(key)
      if (cell) cell.push(id)
      else this.cells.set(key, [id])
    }
  }
  query(bounds: Box) {
    const result = new Set<number>()
    for (const key of this.keys(bounds)) for (const id of this.cells.get(key) ?? []) result.add(id)
    return result
  }
}

export function segmentDistance(point: Pair, a: Pair, b: Pair) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy)
}

// Carto exports densely sampled curves; retain their shape to within 20 cm.
export function simplifyLine(points: Pair[]): Pair[] {
  if (points.length < 3) return points
  const keep = new Set([0, points.length - 1])
  const pending = [[0, points.length - 1]]
  while (pending.length) {
    const [start, end] = pending.pop()!
    let farthest = -1, distance = 0.2
    for (let i = start + 1; i < end; i++) {
      const value = segmentDistance(points[i], points[start], points[end])
      if (value > distance) { distance = value; farthest = i }
    }
    if (farthest !== -1) {
      keep.add(farthest)
      pending.push([start, farthest], [farthest, end])
    }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i])
}
