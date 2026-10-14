import { emptyCommercialAreas, isCommercial, type CommercialAreas } from './commercial'
import { buffer, difference, intersection, union } from './park-clip'
import {
  BoxIndex,
  box,
  insideRing,
  multiArea,
  overlaps,
  polygonArea,
  type MultiPolygon,
  type Polygon,
} from './park-geometry'
import { prepareRoadGeometry, roadCorridors, type RoadGeometry } from './road-blocks'
import type { BuildingData, NetworkData } from './types'

// Physical distances stay stable across zoom levels. Nearby plots can form a
// shopping street across a road, while isolated shops never seed a corridor.
const NEIGHBOR_RADIUS = 20
const EDGE_PADDING = 8
const MAX_BLOCK_AREA = 250_000

export function buildCommercialAreas(
  buildings: BuildingData,
  network: NetworkData,
  roads?: RoadGeometry,
): CommercialAreas {
  const result = emptyCommercialAreas()
  const first = buildings.features.find((f) => isCommercial(f.properties))
  if (!first) return result
  const { toMeters, toCoordinates, blocks, segments } =
    roads ?? prepareRoadGeometry(network, first.geometry.coordinates[0][0][1])
  const footprints = buildings.features.map((f) => {
    const polygon: Polygon = f.geometry.coordinates.map((ring) => ring.map(toMeters))
    return {
      polygon,
      bounds: box(polygon[0]),
      area: polygonArea(polygon),
      commercial: isCommercial(f.properties),
    }
  })
  const buildingIndex = new BoxIndex(128)
  footprints.forEach((f, id) => buildingIndex.add(id, f.bounds))
  const candidates: typeof footprints = []
  const candidateIndex = new BoxIndex(128)
  // Overlapping exports/extensions must not turn one plot into a dense cluster.
  for (const f of footprints
    .filter((f) => f.commercial && f.area >= 1)
    .sort((a, b) => b.area - a.area)) {
    if (
      [...candidateIndex.query(f.bounds)].some(
        (id) => multiArea(intersection(f.polygon, candidates[id].polygon)) >= f.area * 0.8,
      )
    )
      continue
    candidateIndex.add(candidates.length, f.bounds)
    candidates.push(f)
  }
  const expanded = candidates.map((f) => buffer(f.polygon, NEIGHBOR_RADIUS))
  const parents = candidates.map((_, id) => id)
  const root = (id: number): number => {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]]
      id = parents[id]
    }
    return id
  }
  const neighborIndex = new BoxIndex(128)
  expanded.forEach((shape, id) => {
    const bounds = box(shape.flatMap((p) => p[0]))
    for (const other of neighborIndex.query(bounds)) {
      if (multiArea(intersection(shape, expanded[other])) >= 1) parents[root(id)] = root(other)
    }
    neighborIndex.add(id, bounds)
  })
  const groups = new Map<number, number[]>()
  candidates.forEach((_, id) => {
    const key = root(id),
      group = groups.get(key) ?? []
    group.push(id)
    groups.set(key, group)
  })
  const eligible = new Set<number>()
  const corridors = roadCorridors(segments)
  const blockIndex = new BoxIndex(128)
  blocks.forEach((block, id) => {
    if (block.area <= MAX_BLOCK_AREA) blockIndex.add(id, block.bounds)
  })
  const emptyBlocks = new Map<number, boolean>()
  const trim = (shape: MultiPolygon) => {
    if (!shape.length) return shape
    const bounds = box(shape.flatMap((p) => p[0]))
    const exclusions: Polygon[] = [...corridors(bounds)]
    // Gap closing must not spill into a separate empty/residential road block,
    // including the inside of a disconnected road loop.
    for (const id of blockIndex.query(bounds)) {
      const block = blocks[id]
      if (!overlaps(block.bounds, bounds)) continue
      if (!emptyBlocks.has(id))
        emptyBlocks.set(
          id,
          ![...candidateIndex.query(block.bounds)].some(
            (member) => multiArea(intersection([block.ring], candidates[member].polygon)) >= 1,
          ),
        )
      if (emptyBlocks.get(id)) exclusions.push([block.ring])
    }
    for (const id of buildingIndex.query(bounds)) {
      const f = footprints[id]
      if (!overlaps(f.bounds, bounds)) continue
      if (!f.commercial) exclusions.push(f.polygon)
      // Keep known courtyards open even when a buffer would close them.
      for (const hole of f.polygon.slice(1)) exclusions.push([hole])
    }
    return exclusions.length
      ? difference(shape, union(exclusions[0], ...exclusions.slice(1)))
      : shape
  }
  const add = (shape: MultiPolygon, kind: 'corridor' | 'block') => {
    const clipped = trim(shape).filter((p) => polygonArea(p) >= 4)
    if (!clipped.length) return
    result.features.push({
      type: 'Feature',
      properties: { kind },
      geometry: {
        type: 'MultiPolygon',
        coordinates: clipped.map((p) => p.map((r) => r.map(toCoordinates))),
      },
    })
  }
  for (const ids of groups.values()) {
    const plots = union(
      candidates[ids[0]].polygon,
      ...ids.slice(1).map((id) => candidates[id].polygon),
    )
    if (ids.length < 3 && !(ids.length >= 2 && multiArea(plots) >= 1_800)) continue
    ids.forEach((id) => eligible.add(id))
    // Closing small gaps follows the local plots; it cannot bridge a large empty
    // area as a convex hull would. Erosion leaves only a modest outer margin.
    const joined = union(expanded[ids[0]], ...ids.slice(1).map((id) => expanded[id]))
    add(buffer(joined, -(NEIGHBOR_RADIUS - EDGE_PADDING)), 'corridor')
  }
  const relevant = new Set<number>()
  for (const id of eligible) {
    for (const blockId of blockIndex.query(candidates[id].bounds)) relevant.add(blockId)
  }
  for (const id of relevant) {
    const block = blocks[id]
    const children = [...blockIndex.query(block.bounds)].filter(
      (child) =>
        child !== id &&
        blocks[child].area < block.area &&
        blocks[child].ring.slice(0, -1).every((p) => insideRing(p, block.ring)),
    )
    const nested = children.map((child) => [blocks[child].ring])
    const interior = trim(
      nested.length
        ? difference([block.ring], union(nested[0], ...nested.slice(1)))
        : union([block.ring]),
    )
    const members = [...candidateIndex.query(block.bounds)]
      .filter((member) => eligible.has(member))
      .map((member) => intersection(interior, candidates[member].polygon))
      .filter((shape) => multiArea(shape) >= 1)
    if (members.length < 3) continue
    const plots = union(members[0], ...members.slice(1)),
      plotArea = multiArea(plots)
    const availableArea = multiArea(interior)
    const spread = box(plots.flatMap((p) => p[0]))
    // Only expand blocks with substantial, broadly distributed commercial plots.
    // Noncommercial plots are already cut out, but still count against dominance.
    const other = [...buildingIndex.query(block.bounds)]
      .filter((member) => !footprints[member].commercial)
      .map((member) => intersection([block.ring], footprints[member].polygon))
    const otherArea = other.length ? multiArea(union(other[0], ...other.slice(1))) : 0
    if (
      plotArea < availableArea * 0.25 ||
      plotArea < (plotArea + otherArea) * 0.7 ||
      spread[2] - spread[0] < (block.bounds[2] - block.bounds[0]) * 0.55 ||
      spread[3] - spread[1] < (block.bounds[3] - block.bounds[1]) * 0.55
    )
      continue
    add(interior, 'block')
  }
  return result
}
