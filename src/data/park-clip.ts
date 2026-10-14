import ClipperLib from 'clipper-lib'
import type { MultiPolygon, Pair, Polygon } from './park-geometry'

type Geometry = Polygon | MultiPolygon
const { Clipper, PolyTree, PolyType, PolyFillType, ClipType, JS } = ClipperLib
const SCALE = 100 // Integer centimeters avoid unstable nearly coincident floating-point edges.

function paths(geometry: Geometry) {
  if (!geometry.length) return []
  const polygons: MultiPolygon = typeof geometry[0][0]?.[0] === 'number' ? [geometry as Polygon] : geometry as MultiPolygon
  return polygons.flatMap(polygon => polygon.map((ring, index) => {
    const path = ring.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }))
    if (Clipper.Orientation(path) !== (index === 0)) path.reverse()
    return path
  }))
}

function clip(type: ClipperLib.ClipType, subject: Geometry, clips: Geometry[]): MultiPolygon {
  const operation = new Clipper()
  operation.StrictlySimple = true
  operation.AddPaths(paths(subject), PolyType.ptSubject, true)
  for (const geometry of clips) operation.AddPaths(paths(geometry), PolyType.ptClip, true)
  const tree = new PolyTree()
  if (!operation.Execute(type, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) {
    if (!subject.length) return []
    throw new Error('Could not construct park polygons')
  }
  const ring = (path: ClipperLib.Path): Pair[] => {
    const result: Pair[] = path.map(p => [p.X / SCALE, p.Y / SCALE])
    if (result.length) result.push(result[0])
    return result
  }
  return JS.PolyTreeToExPolygons(tree).map(polygon => [ring(polygon.outer), ...polygon.holes.map(ring)])
}

export const difference = (subject: Geometry, ...clips: Geometry[]) => clip(ClipType.ctDifference, subject, clips)
export const intersection = (subject: Geometry, other: Geometry) => clip(ClipType.ctIntersection, subject, [other])
export const union = (subject: Geometry, ...others: Geometry[]) => clip(ClipType.ctUnion, subject, others)
