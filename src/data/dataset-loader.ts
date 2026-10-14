import type { FeatureCollection, LineString, Point, Polygon } from 'geojson'
import { createDataSession } from './session-client'
import type { SourceKey, SourceState, SourceStates } from './types'

export const initialSourceStates = (): SourceStates => ({
  buildings: { state: 'loading' }, network: { state: 'loading' }, area: { state: 'idle' },
  water: { state: 'idle' }, poi: { state: 'idle' }, route: { state: 'idle' },
})

export type CityDataset = {
  buildings: FeatureCollection<Polygon>
  network: FeatureCollection<LineString>
  extraInfo: Awaited<ReturnType<ReturnType<typeof createDataSession>['loadExtraInfo']>>
}

export function createDatasetLoader(onState: (key: SourceKey, state: SourceState) => void,
  session = createDataSession()) {
  let active = true
  const pending = new Map<SourceKey, Promise<void>>()
  const loaded = new Set<SourceKey>()
  const update = (key: SourceKey, state: SourceState) => { if (active) onState(key, state) }

  async function track<T>(key: SourceKey, load: () => Promise<T>, consume: (data: T) => void,
    isEmpty: (data: T) => boolean = () => false): Promise<T> {
    update(key, { state: 'loading' })
    try {
      const data = await load()
      if (active) {
        consume(data)
        update(key, { state: isEmpty(data) ? 'empty' : 'ready' })
      }
      return data
    } catch (cause) {
      update(key, { state: 'error', error: cause instanceof Error ? cause.message : String(cause) })
      throw cause
    }
  }

  function once<T>(key: SourceKey, load: () => Promise<T>, consume: (data: T) => void,
    isEmpty?: (data: T) => boolean) {
    if (!active || loaded.has(key)) return Promise.resolve()
    const existing = pending.get(key)
    if (existing) return existing
    const promise = track(key, load, consume, isEmpty).then(() => {
      if (active) loaded.add(key)
    }).finally(() => { pending.delete(key) })
    pending.set(key, promise)
    return promise
  }

  async function loadInitial(): Promise<CityDataset> {
    await session.configure()
    const [buildings, network, extraInfo] = await Promise.all([
      track('buildings', () => session.loadCollection<Polygon>('Building_Boundary.json', 'Polygon'), () => {}),
      track('network', () => session.loadCollection<LineString>('Network_Centerline.json', 'LineString'), () => {}),
      session.loadExtraInfo(),
    ])
    if (extraInfo.area.error) update('area', { state: 'error', error: extraInfo.area.error })
    else if (!extraInfo.area.objects.District) update('area', { state: 'empty' })
    if (extraInfo.water.error || !extraInfo.water.coordinates) {
      update('water', { state: 'error', error: extraInfo.water.error ?? '수심 데이터가 없습니다' })
    }
    return { buildings, network, extraInfo }
  }

  function loadTransport(key: 'poi' | 'route', consume: (data: FeatureCollection<Point | LineString>) => void) {
    return once<FeatureCollection<Point | LineString>>(key, () => key === 'poi' ?
      session.loadCollection<Point>('POI_Location.json', 'Point', true) :
      session.loadCollection<LineString>('Route_Centerline.json', 'LineString', true),
    consume, data => data.features.length === 0)
  }

  return {
    get active() { return active },
    loadInitial, loadTransport,
    loadArea: (consume: (data: FeatureCollection<Polygon>) => void) =>
      once('area', () => session.loadCollection<Polygon>('Area_Boundary.json', 'Polygon', true),
        consume, data => data.features.length === 0),
    loadWater: (consume: (image: HTMLImageElement) => void) => once('water', session.loadWaterImage, consume),
    dispose: () => { active = false },
  }
}
