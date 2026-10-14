import type { FeatureCollection, Polygon, LineString, Point } from 'geojson'
import type { AreaInfo, WaterInfo } from './types'

// Each view owns a session so asynchronous loads cannot switch another view's data root.
export function createDataSession() {
  let dataRoot = '/data'
  let activeSnapshotId = ''
  async function fetchMapResource(input: string | URL, init?: RequestInit) {
    try { return await fetch(input, init) } catch {
      throw new Error(import.meta.env.DEV ? '개발 서버에 연결할 수 없습니다' :
        '게임과 지도 연결이 끊겼습니다. 게임이 실행 중인지 확인한 뒤 게임에서 지도를 다시 여세요.')
    }
  }
  async function configure() {
    if (import.meta.env.DEV) { dataRoot = '/data'; activeSnapshotId = ''; return }
    const response = await fetchMapResource(new URL('session.json', document.baseURI), { cache: 'no-store' })
    if (!response.ok) throw new Error(`게임 세션에 연결할 수 없습니다 (HTTP ${response.status}). 게임에서 지도를 다시 여세요.`)
    const session = await response.json()
    if (typeof session?.snapshotId !== 'string' || !/^[0-9a-f]{16}$/.test(session.snapshotId) ||
        session.dataRoot !== `snapshots/${session.snapshotId}/`) {
      throw new Error('게임 세션의 스냅샷 설정이 올바르지 않습니다')
    }
    activeSnapshotId = session.snapshotId
    dataRoot = new URL(session.dataRoot, document.baseURI).pathname.replace(/\/$/, '')
  }
  async function loadCollection<G extends Polygon | LineString | Point>(file: string, geometry: G['type'], allowEmpty = false) {
    const response = await fetchMapResource(`${dataRoot}/GeoJSON/${file}`)
    if (!response.ok) throw new Error(`${file} 요청 실패 (HTTP ${response.status})`)
    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new Error(`${file}의 JSON을 읽을 수 없습니다`)
    }
    if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'FeatureCollection' ||
        !('features' in data) || !Array.isArray(data.features) ||
        (!allowEmpty && data.features.length === 0) ||
        data.features.some(feature => feature?.type !== 'Feature' || feature.geometry?.type !== geometry ||
          !Array.isArray(feature.geometry.coordinates) || !feature.properties ||
          typeof feature.properties.Object !== 'string')) {
      throw new Error(`${file}의 GeoJSON 구조가 올바르지 않습니다`)
    }
    return data as FeatureCollection<G>
  }

  async function loadExtraInfo(): Promise<{ datasetId: string; preparedAt: string; area: AreaInfo; water: WaterInfo }> {
    try {
      const response = await fetchMapResource(`${dataRoot}/manifest.json`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`manifest.json 요청 실패 (HTTP ${response.status})`)
      const manifest = await response.json()
      if (typeof manifest?.datasetId !== 'string' || !/^[0-9a-f]{16}$/.test(manifest.datasetId)) {
        throw new Error('스냅샷 manifest에 데이터셋 ID가 없습니다')
      }
      if (activeSnapshotId && manifest.datasetId !== activeSnapshotId) {
        throw new Error('스냅샷 ID가 세션 설정과 일치하지 않습니다')
      }
      let area: AreaInfo
      try {
        const entry = manifest?.files?.['Area_Boundary.json']
        if (!entry || typeof entry !== 'object') throw new Error('Area 메타데이터가 없습니다')
        if (entry.error) throw new Error(`Area_Boundary.json: ${entry.error}`)
        if (!Number.isInteger(entry.features) || !entry.objects || typeof entry.objects !== 'object') {
          throw new Error('Area 메타데이터 구조가 올바르지 않습니다')
        }
        area = { objects: entry.objects }
      } catch (cause) {
        area = { objects: {}, error: cause instanceof Error ? cause.message : String(cause) }
      }

      let water: WaterInfo
      try {
        const entry = manifest?.rasters?.water
        if (!entry || typeof entry !== 'object') throw new Error('수심 메타데이터가 없습니다')
        if (entry.error) throw new Error(`Depth.tif: ${entry.error}`)
        if (entry.file !== 'water-mask.png' || !Number.isInteger(entry.waterPixels) || entry.waterPixels < 1 ||
            !Array.isArray(entry.coordinates) || entry.coordinates.length !== 4 ||
            entry.coordinates.some((point: unknown) => !Array.isArray(point) || point.length !== 2 ||
              !point.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)))) {
          throw new Error('수심 메타데이터 구조가 올바르지 않습니다')
        }
        water = { coordinates: entry.coordinates, waterPixels: entry.waterPixels }
      } catch (cause) {
        water = { error: cause instanceof Error ? cause.message : String(cause) }
      }
      return { datasetId: manifest.datasetId, preparedAt: String(manifest.preparedAt ?? ''), area, water }
    } catch (cause) {
      throw cause instanceof Error ? cause : new Error(String(cause))
    }
  }

  function loadWaterImage(): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(import.meta.env.DEV ? 'water-mask.png 이미지를 불러올 수 없습니다' :
        '수역 이미지를 불러올 수 없습니다. 게임 연결 상태를 확인하세요.'))
      image.src = `${dataRoot}/water-mask.png`
    })
  }

  return { configure, loadCollection, loadExtraInfo, loadWaterImage }
}
