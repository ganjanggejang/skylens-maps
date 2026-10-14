export const TRANSPORT_MODES = ['bus', 'train', 'tram', 'subway', 'ship', 'ferry', 'air'] as const
export type TransportMode = typeof TRANSPORT_MODES[number]

export const TRANSPORT = {
  bus: { label: '버스', color: '#258b72', route: true },
  train: { label: '기차', color: '#af5962', route: true },
  tram: { label: '전차', color: '#a16ac6', route: true },
  subway: { label: '지하철', color: '#5082d1', route: true },
  ship: { label: '선박', color: '#337c9c', route: true },
  ferry: { label: '페리', color: '#16a3ad', route: true },
  air: { label: '항공', color: '#74839e', route: false },
} as const

const routeModes: Record<string, TransportMode> = {
  Bus: 'bus', Train: 'train', Tram: 'tram', Subway: 'subway',
  Ship: 'ship', Ferry: 'ferry', Airplane: 'air',
}

export function routeMode(transport: unknown): TransportMode | null {
  return typeof transport === 'string' ? routeModes[transport] ?? null : null
}

export function poiModes(category: unknown): TransportMode[] {
  if (typeof category !== 'string') return []
  const tokens = category.split(',').map(token => token.trim())
  const modes = new Set<TransportMode>()
  for (const token of tokens) {
    if (/^(StopBus|BuildingBus|DepotBus)$/.test(token)) modes.add('bus')
    if (/^(Stop(Passenger|Cargo)Train|Building(Passenger|Cargo)Train|DepotTrain)$/.test(token)) modes.add('train')
    if (/^(StopTram|BuildingTram|DepotTram)$/.test(token)) modes.add('tram')
    if (/^(StopSubway|BuildingSubway|DepotSubway)$/.test(token)) modes.add('subway')
    if (/^(Stop(Passenger|Cargo)Ship|Building(Passenger|Cargo)Ship)$/.test(token)) modes.add('ship')
    if (/^(StopFerry|BuildingFerry|DepotFerry)$/.test(token)) modes.add('ferry')
    if (/^(Stop(Passenger|Cargo)Airplane|Building(Passenger|Cargo)Airplane)$/.test(token)) modes.add('air')
  }
  return [...modes]
}
