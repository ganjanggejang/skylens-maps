import { distanceMeters, projectPoint, type Coordinate, type LinePosition } from './geometry'

export type IndexedSegment = {
  featureId: number
  segmentIndex: number
  start: Coordinate
  end: Coordinate
  progressStart: number
  length: number
}
export type IndexedPosition = LinePosition & { featureId: number }

const CELL_METERS = 100
const meters = (point: Coordinate): Coordinate => [point[0] * 111_320, point[1] * 111_320]
const cell = (x: number, y: number) => `${x},${y}`

export class SegmentIndex {
  readonly segments: IndexedSegment[] = []
  private readonly cells = new Map<string, number[]>()

  addLine(featureId: number, line: number[][]) {
    let progress = 0
    for (let index = 1; index < line.length; index++) {
      const start = line[index - 1] as Coordinate, end = line[index] as Coordinate
      const length = distanceMeters(start, end)
      if (!(length > 0)) continue
      const segmentId = this.segments.length
      this.segments.push({ featureId, segmentIndex: index - 1, start, end,
        progressStart: progress, length })
      const [ax, ay] = meters(start), [bx, by] = meters(end)
      for (let x = Math.floor(Math.min(ax, bx) / CELL_METERS); x <= Math.floor(Math.max(ax, bx) / CELL_METERS); x++) {
        for (let y = Math.floor(Math.min(ay, by) / CELL_METERS); y <= Math.floor(Math.max(ay, by) / CELL_METERS); y++) {
          const bucket = cell(x, y)
          if (!this.cells.has(bucket)) this.cells.set(bucket, [])
          this.cells.get(bucket)!.push(segmentId)
        }
      }
      progress += length
    }
  }

  nearby(point: Coordinate, radius: number): IndexedPosition[] {
    const [px, py] = meters(point)
    const seen = new Set<number>()
    const result: IndexedPosition[] = []
    for (let x = Math.floor((px - radius) / CELL_METERS); x <= Math.floor((px + radius) / CELL_METERS); x++) {
      for (let y = Math.floor((py - radius) / CELL_METERS); y <= Math.floor((py + radius) / CELL_METERS); y++) {
        for (const segmentId of this.cells.get(cell(x, y)) ?? []) {
          if (seen.has(segmentId)) continue
          seen.add(segmentId)
          const segment = this.segments[segmentId]
          const projection = projectPoint(point, segment.start, segment.end)
          if (projection.distance > radius) continue
          result.push({ ...projection, progress: segment.progressStart + projection.fraction * segment.length,
            segmentIndex: segment.segmentIndex, featureId: segment.featureId })
        }
      }
    }
    return result.sort((a, b) => a.distance - b.distance || a.featureId - b.featureId || a.progress - b.progress)
  }

  nearest(point: Coordinate, radius: number): IndexedPosition | null {
    return this.nearby(point, radius)[0] ?? null
  }
}
