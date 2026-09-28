import type { Feature, FeatureCollection, Point } from 'geojson'
import { normalizeText, propertyText } from './building-name'
import type { TransportMode } from './transport'

export const STATION_MODES = ['bus', 'train', 'tram', 'subway', 'ship', 'ferry'] as const
export type StationMode = typeof STATION_MODES[number]

const categories: Record<StationMode, { stops: string[]; facilities: string[]; depot?: string;
  maxDistance: number; matchNameAcrossAddresses: boolean }> = {
  bus: { stops: ['StopBus'], facilities: ['BuildingBus'], depot: 'DepotBus',
    maxDistance: 120, matchNameAcrossAddresses: true },
  train: { stops: ['StopPassengerTrain', 'StopCargoTrain'],
    facilities: ['BuildingPassengerTrain', 'BuildingCargoTrain'], depot: 'DepotTrain',
    maxDistance: 1000, matchNameAcrossAddresses: false },
  tram: { stops: ['StopTram'], facilities: ['BuildingTram'], depot: 'DepotTram',
    maxDistance: 120, matchNameAcrossAddresses: true },
  subway: { stops: ['StopSubway'], facilities: ['BuildingSubway'], depot: 'DepotSubway',
    maxDistance: 120, matchNameAcrossAddresses: false },
  ship: { stops: ['StopPassengerShip', 'StopCargoShip'],
    facilities: ['BuildingPassengerShip', 'BuildingCargoShip'],
    maxDistance: 1200, matchNameAcrossAddresses: false },
  ferry: { stops: ['StopFerry'], facilities: ['BuildingFerry'], depot: 'DepotFerry',
    maxDistance: 200, matchNameAcrossAddresses: false },
}

type StationPoi = { feature: Feature<Point>; sourceId: number; facility: boolean;
  address: string; name: string }
type Station = { members: StationPoi[] }

export function isStationMode(mode: TransportMode): mode is StationMode {
  return (STATION_MODES as readonly string[]).includes(mode)
}

export function depotCategory(mode: StationMode): string | undefined {
  return categories[mode].depot
}

export function hasCategory(feature: Feature<Point>, category: string): boolean {
  return String(feature.properties?.Category ?? '').split(',').some(token => token.trim() === category)
}

function stationAddress(properties: Record<string, unknown>): string {
  const fields = ['Address_District', 'Address_Street', 'Address_Number']
    .map(field => normalizeText(propertyText(properties, field)))
  return fields.every(Boolean) ? fields.join('|') : ''
}

function distanceMeters(a: number[], b: number[]): number {
  const latitude = (a[1] + b[1]) * Math.PI / 360
  return Math.hypot((a[0] - b[0]) * 111_320 * Math.cos(latitude), (a[1] - b[1]) * 111_320)
}

export function transportStations(pois: FeatureCollection<Point>, mode: StationMode): FeatureCollection<Point> {
  const config = categories[mode]
  const stations: Station[] = []
  for (const [sourceId, feature] of pois.features.entries()) {
    const facility = config.facilities.some(category => hasCategory(feature, category))
    if (!facility && !config.stops.some(category => hasCategory(feature, category))) continue
    const poi: StationPoi = { feature, sourceId, facility,
      address: stationAddress(feature.properties ?? {}),
      name: normalizeText(propertyText(feature.properties ?? {}, 'Name')) }
    const station = stations.find(candidate => candidate.members.some(member =>
      distanceMeters(member.feature.geometry.coordinates, feature.geometry.coordinates) <= config.maxDistance &&
      (poi.address && poi.address === member.address ||
        (config.matchNameAcrossAddresses || !poi.address || !member.address) &&
        poi.name && poi.name === member.name)))
    if (station) station.members.push(poi)
    else stations.push({ members: [poi] })
  }

  return { type: 'FeatureCollection', features: stations.map(({ members }, id) => {
    const representative = members.find(member => member.facility) ?? members[0]
    const stops = members.filter(member => !member.facility)
    const stopNames = new Map<string, { name: string; count: number }>()
    for (const stop of stops) {
      if (!stop.name) continue
      const previous = stopNames.get(stop.name)
      stopNames.set(stop.name, { name: propertyText(stop.feature.properties ?? {}, 'Name'),
        count: (previous?.count ?? 0) + 1 })
    }
    const mapLabel = [...stopNames.values()].sort((a, b) =>
      b.count - a.count || a.name.length - b.name.length)[0]?.name ||
      propertyText(representative.feature.properties ?? {}, 'Name')
    const coordinates = representative.facility ? representative.feature.geometry.coordinates : [
      members.reduce((sum, member) => sum + member.feature.geometry.coordinates[0], 0) / members.length,
      members.reduce((sum, member) => sum + member.feature.geometry.coordinates[1], 0) / members.length,
    ]
    return {
      type: 'Feature', id,
      properties: { ...representative.feature.properties,
        _mapLabel: mapLabel,
        _labelSortKey: -stops.length,
        _representativeSourceId: representative.sourceId,
        _stopIds: stops.map(stop => stop.sourceId) },
      geometry: { type: 'Point', coordinates },
    }
  }) }
}
