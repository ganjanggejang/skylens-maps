import type { CityDataset } from '../data/dataset-loader'
import { indexPlaces } from '../data/place-index'
import { individualParkAreas, isPark } from '../data/parks'
import { buildingPlaces } from '../layer/place-labels'
import { prepareNetworkObjects } from '../layer/network-objects'
import type { Counts } from '../layer/types'
import { getBounds } from './camera'

export const INITIAL_COUNTS: Counts = { water: 0, buildings: 0, roads: 0, tracks: 0, pathways: 0,
  waterways: 0, districts: 0, bus: 0, train: 0, tram: 0, subway: 0, ship: 0, ferry: 0, air: 0 }

export function prepareMapData({ buildings, network, extraInfo }: CityDataset) {
  for (const feature of buildings.features) {
    feature.properties = { ...feature.properties, _isPark: isPark(feature.properties) }
  }
  const parks = individualParkAreas(buildings)
  const objects = prepareNetworkObjects(network)
  if (!objects.Road) throw new Error('Network_Centerline.json에 도로가 없습니다')
  const city = getBounds([buildings])
  const all = getBounds([buildings, network])
  const entries = [...indexPlaces(extraInfo.datasetId, 'buildings', buildings),
    ...indexPlaces(extraInfo.datasetId, 'network', network)]
  const lookup = new Map(entries.map(entry => [
    `${entry.selection.kind === 'building' ? 'buildings' : 'network'}:${entry.selection.sourceFeatureId}`,
    entry.selection,
  ]))
  const places = buildingPlaces(buildings)
  for (const feature of places.features) {
    lookup.set(`building-places:${feature.id}`, lookup.get(`buildings:${feature.id}`)!)
  }
  const counts: Counts = {
    ...INITIAL_COUNTS, water: extraInfo.water.waterPixels ? 1 : 0, buildings: buildings.features.length,
    roads: objects.Road ?? 0, tracks: objects.Track ?? 0, pathways: objects.Pathway ?? 0,
    waterways: objects.Waterway ?? 0, districts: extraInfo.area.objects.District ?? 0,
  }
  return { buildings, network, extraInfo, city, all, entries, lookup, places, counts, parks }
}
