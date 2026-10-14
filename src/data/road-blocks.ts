import type { Pair, Polygon } from './park-geometry'
import type { NetworkData } from './types'
import { hasNetworkObject } from './network-objects'
import { BoxIndex, box, overlaps, roundedPoint, signedArea, simplifyLine, type Box } from './park-geometry'

type Segment = { a: Pair; b: Pair; width: number; bounds: Box; cuts: number[] }
type Edge = { from: number; to: number; reverse: number; visited: boolean }
export type RoadBlock = { ring: Pair[]; bounds: Box; area: number }
const cross = (a: Pair, b: Pair) => a[0] * b[1] - a[1] * b[0]
const subtract = (a: Pair, b: Pair): Pair => [a[0] - b[0], a[1] - b[1]]

function nodePair(a: Segment, b: Segment) {
  const r = subtract(a.b, a.a), s = subtract(b.b, b.a), q = subtract(b.a, a.a)
  const divisor = cross(r, s)
  if (Math.abs(divisor) > 1e-8) {
    const t = cross(q, s) / divisor, u = cross(q, r) / divisor
    if (t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8) {
      a.cuts.push(Math.max(0, Math.min(1, t))); b.cuts.push(Math.max(0, Math.min(1, u)))
    }
  } else if (Math.abs(cross(q, r)) < 1e-6) {
    const project = (point: Pair, segment: Segment) => {
      const d = subtract(segment.b, segment.a), p = subtract(point, segment.a)
      const t = (p[0] * d[0] + p[1] * d[1]) / (d[0] * d[0] + d[1] * d[1])
      if (t > 0 && t < 1) segment.cuts.push(t)
    }
    project(a.a, b); project(a.b, b); project(b.a, a); project(b.b, a)
  }
}

export function roadBlocks(network: NetworkData, toMeters: (p: number[]) => Pair) {
  const segments: Segment[] = []
  const index = new BoxIndex()
  for (const feature of network.features) {
    if (!hasNetworkObject(feature.properties?.Object, 'Road') ||
      ['Tunnel', 'Elevated'].includes(String(feature.properties?.Form))) continue
    const points = simplifyLine(feature.geometry.coordinates.map(toMeters))
    const width = Number(feature.properties?.Width) > 0 ? Number(feature.properties?.Width) : 8
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01) continue
      const segment = { a, b, width, bounds: box([a, b]), cuts: [0, 1] }
      for (const id of index.query(segment.bounds)) {
        if (overlaps(segment.bounds, segments[id].bounds)) nodePair(segment, segments[id])
      }
      index.add(segments.length, segment.bounds)
      segments.push(segment)
    }
  }

  const points: Pair[] = [], outgoing: number[][] = [], edges: Edge[] = []
  const pointIndex = new BoxIndex(0.2)
  const vertex = (point: Pair) => {
    const bounds: Box = [point[0] - 0.1, point[1] - 0.1, point[0] + 0.1, point[1] + 0.1]
    for (const id of pointIndex.query(bounds)) {
      if (Math.hypot(points[id][0] - point[0], points[id][1] - point[1]) <= 0.1) return id
    }
    const id = points.length
    points.push(roundedPoint(point)); outgoing.push([]); pointIndex.add(id, box([point]))
    return id
  }
  const connections = new Set<string>()
  for (const segment of segments) {
    const cuts = [...new Set(segment.cuts)].sort((a, b) => a - b)
    const vertices = cuts.map(t => vertex([segment.a[0] + (segment.b[0] - segment.a[0]) * t,
      segment.a[1] + (segment.b[1] - segment.a[1]) * t]))
    for (let i = 1; i < vertices.length; i++) {
      const from = vertices[i - 1], to = vertices[i]
      const key = `${Math.min(from, to)},${Math.max(from, to)}`
      if (from === to || connections.has(key)) continue
      connections.add(key)
      const id = edges.length
      edges.push({ from, to, reverse: id + 1, visited: false }, { from: to, to: from, reverse: id, visited: false })
      outgoing[from].push(id); outgoing[to].push(id + 1)
    }
  }
  const rank = new Int32Array(edges.length)
  for (const [id, list] of outgoing.entries()) {
    list.sort((a, b) => {
      const p = points[edges[a].to], q = points[edges[b].to], origin = points[id]
      return Math.atan2(p[1] - origin[1], p[0] - origin[0]) - Math.atan2(q[1] - origin[1], q[0] - origin[0])
    })
    list.forEach((edge, position) => { rank[edge] = position })
  }
  const blocks: RoadBlock[] = []
  for (let start = 0; start < edges.length; start++) {
    if (edges[start].visited) continue
    const ring: Pair[] = []
    let id = start
    do {
      const edge = edges[id]
      edge.visited = true; ring.push(points[edge.from])
      const list = outgoing[edge.to]
      id = list[(rank[edge.reverse] + list.length - 1) % list.length]
    } while (id !== start && !edges[id].visited)
    if (id !== start || ring.length < 3) continue
    ring.push(ring[0])
    const area = signedArea(ring)
    // The outer, unbounded face has clockwise winding and must never become a park.
    if (area >= 100) blocks.push({ ring, bounds: box(ring), area })
  }
  return { blocks, segments }
}

export function roadCorridors(segments: ReturnType<typeof roadBlocks>['segments']) {
  const shapes: Polygon[] = []
  const index = new BoxIndex()
  const caps = new Set<string>()
  const add = (shape: Polygon) => {
    const rounded = shape.map(ring => ring.map(roundedPoint))
    index.add(shapes.length, box(rounded[0])); shapes.push(rounded)
  }
  for (const { a, b, width } of segments) {
    const radius = width / 2
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const nx = -(b[1] - a[1]) / length * radius, ny = (b[0] - a[0]) / length * radius
    add([[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny],
      [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]])
    for (const point of [a, b]) {
      const key = `${point[0]},${point[1]},${radius}`
      if (caps.has(key)) continue
      caps.add(key)
      const ring: Pair[] = Array.from({ length: 12 }, (_, i) => {
        const angle = i / 12 * Math.PI * 2
        return [point[0] + Math.cos(angle) * radius, point[1] + Math.sin(angle) * radius]
      })
      ring.push(ring[0]); add([ring])
    }
  }
  return (bounds: Box) => [...index.query(bounds)].map(id => shapes[id]).filter(shape => overlaps(box(shape[0]), bounds))
}
