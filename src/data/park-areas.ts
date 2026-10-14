import { difference, intersection, union } from './park-clip'
import type { MultiPolygon, Polygon } from './park-geometry'
import type { BuildingData, NetworkData } from './types'
import { BoxIndex, box, insideRing, multiArea, overlaps, polygonArea, projection } from './park-geometry'
import { roadBlocks, roadCorridors } from './road-blocks'
import { isPark, type ParkAreas } from './parks'

export function buildParkAreas(buildings: BuildingData, network: NetworkData): ParkAreas {
  const result: ParkAreas = { type: 'FeatureCollection', features: [] }
  const parks = buildings.features.filter(f => isPark(f.properties))
  if (!parks.length) return result
  const { toMeters, toCoordinates } = projection(parks[0].geometry.coordinates[0][0][1])
  const footprints = buildings.features.map(f => {
    const polygon: Polygon = f.geometry.coordinates.map(ring => ring.map(toMeters))
    return { polygon, bounds: box(polygon[0]), park: isPark(f.properties), area: polygonArea(polygon) }
  })
  const buildingIndex = new BoxIndex(128)
  footprints.forEach((f, id) => { buildingIndex.add(id, f.bounds) })
  const { blocks, segments } = roadBlocks(network, toMeters)
  const corridors = roadCorridors(segments)
  const blockIndex = new BoxIndex(128)
  blocks.forEach((block, id) => { if (block.area <= 2_000_000) blockIndex.add(id, block.bounds) })
  const candidates = new Set<number>()
  for (const f of footprints) if (f.park) {
    for (const id of blockIndex.query(f.bounds)) if (overlaps(blocks[id].bounds, f.bounds)) candidates.add(id)
  }
  const covered = new Set<number>()
  const add = (coordinates: MultiPolygon, kind: 'block' | 'individual') => {
    if (!coordinates.length) return
    result.features.push({ type: 'Feature', properties: { kind },
      geometry: { type: 'MultiPolygon', coordinates: coordinates.map(p => p.map(r => r.map(toCoordinates))) } })
  }
  for (const id of candidates) {
    const block = blocks[id]
    // Disconnected road loops create nested faces: leave the inner block as a hole.
    const children = [...blockIndex.query(block.bounds)].filter(childId => childId !== id &&
      blocks[childId].area < block.area && overlaps(block.bounds, blocks[childId].bounds) &&
      blocks[childId].ring.slice(0, -1).every(p => insideRing(p, block.ring)))
    const clips = [...children.map(childId => [blocks[childId].ring]), ...corridors(block.bounds)]
    const face = union([block.ring])
    const interior = clips.length ? difference(face, union(clips[0], ...clips.slice(1))) : face
    const area = multiArea(interior)
    if (area < 100) continue
    const members: { id: number; shape: MultiPolygon; area: number }[] = []
    let otherArea = 0
    for (const buildingId of buildingIndex.query(block.bounds)) {
      const f = footprints[buildingId]
      if (!overlaps(f.bounds, block.bounds)) continue
      const shape = intersection(interior, f.polygon), overlap = multiArea(shape)
      if (overlap < 1) continue
      if (f.park) members.push({ id: buildingId, shape, area: overlap })
      else otherArea += overlap
    }
    if (!members.length) continue
    const parkShape = union(members[0].shape, ...members.slice(1).map(member => member.shape))
    const parkArea = multiArea(parkShape)
    const spread = box(parkShape.flatMap(p => p[0]))
    const bounds = box(interior.flatMap(p => p[0]))
    const parkOnly = otherArea <= 4
    const distributed = (parkOnly || members.length >= 3) &&
      (spread[2] - spread[0]) >= (bounds[2] - bounds[0]) * 0.55 &&
      (spread[3] - spread[1]) >= (bounds[3] - bounds[1]) * 0.55
    // Park-only blocks can contain generous gaps between facilities. Require the
    // same broad distribution, but less footprint coverage than mixed-use blocks.
    const minimumCoverage = distributed && parkOnly ? 0.10 : 0.15
    // Empty land alone is not evidence of a park. Limit expansion and mixed-use blocks.
    if (otherArea > Math.max(4, parkArea * 0.02) || parkArea / area < minimumCoverage ||
      (!distributed && parkArea / area < 0.45)) continue
    add(interior, 'block')
    for (const member of members) {
      if (member.area >= footprints[member.id].area * 0.98) covered.add(member.id)
    }
  }
  for (const [id, f] of footprints.entries()) if (f.park && !covered.has(id)) {
    const clips = corridors(f.bounds)
    add(clips.length ? difference(f.polygon, union(clips[0], ...clips.slice(1))) : union(f.polygon), 'individual')
  }
  return result
}
