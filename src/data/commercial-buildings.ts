import type { CommercialAreas } from './commercial'
import { intersection, union } from './park-clip'
import { BoxIndex, box, multiArea, overlaps, polygonArea, projection } from './park-geometry'
import { isPark } from './parks'
import type { BuildingData } from './types'

// Return array positions: indexPlaces assigns the same IDs to the building source.
// Use the final clipped areas, not zoning or cluster membership, so isolated shops
// and plots removed by roads/exclusions retain the ordinary building color.
export function commercialBuildingIds(buildings: BuildingData, areas: CommercialAreas): number[] {
  if (!areas.features.length) return []
  const { toMeters } = projection(areas.features[0].geometry.coordinates[0][0][0][1])
  const polygons = areas.features.flatMap(f => f.geometry.coordinates).map(p => {
    const polygon = p.map(r => r.map(toMeters))
    return { polygon, bounds: box(polygon[0]) }
  })
  const index = new BoxIndex(128)
  polygons.forEach((p, id) => index.add(id, p.bounds))
  const ids: number[] = []
  for (const [id, feature] of buildings.features.entries()) {
    if (isPark(feature.properties)) continue
    const polygon = feature.geometry.coordinates.map(r => r.map(toMeters))
    const area = polygonArea(polygon), bounds = box(polygon[0])
    if (area < 1) continue
    const pieces = [...index.query(bounds)].filter(i => overlaps(bounds, polygons[i].bounds))
      .map(i => intersection(polygon, polygons[i].polygon)).filter(p => multiArea(p) > 0)
    if (!pieces.length) continue
    // Union overlapping corridor/block intersections before measuring coverage.
    const covered = multiArea(union(pieces[0], ...pieces.slice(1)))
    if (covered >= 1 && covered >= area * 0.5) ids.push(id)
  }
  return ids
}
