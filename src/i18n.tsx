import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Language = 'ko' | 'en'

const ko = {
  language: '언어', menu: '지도 메뉴', intro: '도로와 건물을 탐색하세요.', directions: '길찾기',
  expandSidebar: '사이드바 펼치기', collapseSidebar: '사이드바 접기',
  mapLoading: '지도 데이터를 불러오는 중…', mapFailed: '지도를 불러오지 못했습니다', retry: '다시 시도',
  snapshot: '스냅샷', snapshotLoading: '지도 준비 중', snapshotReady: '지도 준비됨',
  snapshotPartial: '일부 데이터 오류', snapshotError: '지도 오류',
  routeDataLoading: '도로 경로 데이터를 준비하는 중…', map: '도시 지도',
  building: '건물', road: '도로', poi: '시설·정류장', route: '노선', transit: '대중교통',
  unnamed: '이름 없는 {kind}', detail: '선택한 객체 상세 정보', closeDetail: '상세 정보 닫기',
  setOrigin: '출발지로 설정', setDestination: '목적지로 설정', brand: '입점 업체',
  asset: '에셋', category: '분류', zoning: '용도지역', resident: '거주자', employee: '근로자',
  lane: '차선', limit: '속도 제한', direction: '방향', form: '형태', transport: '교통수단',
  color: '색상', length: '길이', passenger: '승객', stop: '정류장', usage: '이용률', vehicle: '차량', object: '종류',
  nearbyRoutes: '인근 대중교통 노선', transportLoading: '교통 데이터를 불러오는 중…',
  transportFailed: '교통 데이터를 불러오지 못했습니다.', noLinkedRoutes: '연결된 노선 후보를 찾지 못했습니다.',
  nearbyRoutesNote: '시설·정류장 위치를 기준으로 추정한 노선입니다. Export에 건물과 노선의 연결 ID는 없습니다.',
  nearbyStops: '인근 정류장', unnamedStop: '이름 없는 정류장 #{number}',
  stopsLoading: '정류장 데이터를 불러오는 중…', stopsFailed: '정류장 데이터를 불러오지 못했습니다.',
  noStops: '노선 가까이에서 정류장을 찾지 못했습니다.',
  nearbyStopsNote: '노선 선형의 시작점부터 가까운 순서로 정렬한 추정 목록입니다. Export에 정차 순서와 연결 ID가 없어 실제 게임 순서와 다를 수 있습니다.',
  extraInfoRegion: '추가 정보 영역', extraInfo: '추가 정보', noExtraInfo: '표시할 추가 정보가 없습니다.', internalId: '지도 내부 ID: {id}',
  searchRegion: '지도 검색', search: '검색', searchPlaceholder: '이름 또는 주소 검색', searchResults: '{count}개 결과',
  firstHundred: '처음 100개 표시', noResults: '검색 결과가 없습니다.', searchResultsAria: '{label} 검색 결과',
  searchLoading: '시설·노선 검색 데이터를 불러오는 중…', searchFailed: '{sources} 검색 데이터를 불러오지 못했습니다. 현재 결과는 일부입니다.',
  back: '← 뒤로 가기', origin: '출발지', destination: '도착지', swapAria: '출발지와 도착지 바꾸기',
  swap: '출발·도착 바꾸기 ↕', samePlace: '출발지와 도착지가 같습니다.', calculating: '경로 계산 중…', findRoute: '경로 찾기',
  showVehicle: '차량 경로 지도에 표시', showTransit: '대중교통 경로 지도에 표시',
  minutes: '{count}분', routeSummary: '도로 중심선 {count}개 구간 · 접근 {distance}m',
  vehicleAccessFailed: '출발지 또는 도착지에서 150m 이내 도로를 찾지 못했습니다.',
  vehicleDisconnected: '통행 방향을 따르는 연결 경로를 찾지 못했습니다.',
  vehicleNote: '예상 시간 · 교통상황 미반영 · 도로 속도 제한의 80% 적용',
  transfers: '환승 {count}회', walk: '도보 {distance}m', wait: '대기 {minutes}분',
  transitNoService: '이용할 수 있는 여객 노선과 정류장을 찾지 못했습니다.',
  transitAccessFailed: '출발지 또는 도착지에서 도보 1km 이내 정류장을 찾지 못했습니다.',
  transitDisconnected: '도보 연결과 최대 2회 환승으로 이어지는 경로를 찾지 못했습니다.',
  transitCalculating: '대중교통 경로 계산 중…', transitDataLoading: '정류장·노선 데이터를 준비하는 중…',
  selectPlaces: '출발지와 도착지를 선택해 경로를 찾으세요.',
  assumptionStops: '정류장 위치와 순서는 노선 선형에서 추정', assumptionBidirectional: '노선 양방향 운행 가정',
  assumptionWait: '배차 시간 대신 탑승당 평균 5분 대기',
  layers: '레이어', mapLayers: '지도 레이어', transitLayers: '대중교통 레이어',
  transportNote: '버스·기차·전차·지하철·선박·페리는 노선과 정류장·시설을 표시합니다. 항공은 정류장·시설만 표시합니다.',
  loading: '불러오는 중', noData: '데이터 없음', count: '{count}개', loadError: '로드 오류',
  retryLayer: '오류 · 다시 켜기', loadOnEnable: '{count}개 · 켜면 로드',
  waterData: '수역 데이터:', districtData: '행정구역 데이터:', poiData: '교통 시설·정류장 데이터:', routeData: '노선 데이터:',
  water: '수역', buildings: '건물', roads: '도로', tracks: '철도', pathways: '보행로', waterways: '항로', districts: '행정구역',
  bus: '버스', train: '기차', tram: '전차', subway: '지하철', ship: '선박', ferry: '페리', air: '항공',
  roadNotReady: '도로 데이터가 아직 준비되지 않았습니다.', waterMissing: '수심 데이터가 없습니다',
  mapRenderError: '지도 렌더링 오류: {detail}', unknownError: '알 수 없는 오류',
  workerTransitNotReady: '대중교통 경로 데이터가 준비되지 않았습니다.', workerRoadNotReady: '도로 데이터가 준비되지 않았습니다.',
  requestFailed: '{file} 요청 실패 (HTTP {status})', invalidJson: '{file}의 JSON을 읽을 수 없습니다',
  invalidGeojson: '{file}의 GeoJSON 구조가 올바르지 않습니다', missingDataset: '데이터셋 ID가 없습니다. npm run prepare:data를 다시 실행하세요',
  areaMetadataMissing: 'Area 메타데이터가 없습니다', areaMetadataInvalid: 'Area 메타데이터 구조가 올바르지 않습니다',
  waterMetadataMissing: '수심 메타데이터가 없습니다', waterMetadataInvalid: '수심 메타데이터 구조가 올바르지 않습니다',
  waterImageFailed: 'water-mask.png 이미지를 불러올 수 없습니다', emptyCoordinates: '빈 좌표 배열', invalidCoordinates: '유효하지 않은 좌표',
  transitSourceFailed: '{source} 데이터를 불러오지 못했습니다.', networkRoadMissing: 'Network_Centerline.json에 도로가 없습니다',
  transitPrepareFailed: '대중교통 데이터를 준비하지 못했습니다.', routingFailed: '경로 계산 오류',
  routingWorkerFailed: '경로 계산 작업자를 실행하지 못했습니다.', transitWorkerFailed: '대중교통 경로 계산 작업자를 실행하지 못했습니다.',
  stopName: '정류장 #{number}', routeName: '노선 #{number}',
} as const

const en: Record<keyof typeof ko, string> = {
  language: 'Language', menu: 'Map menu', intro: 'Explore roads and buildings.', directions: 'Directions',
  expandSidebar: 'Expand sidebar', collapseSidebar: 'Collapse sidebar',
  mapLoading: 'Loading map data…', mapFailed: 'Could not load the map', retry: 'Try again',
  snapshot: 'Snapshot', snapshotLoading: 'Loading map', snapshotReady: 'Map ready',
  snapshotPartial: 'Some data unavailable', snapshotError: 'Map error',
  routeDataLoading: 'Preparing road routing data…', map: 'City map',
  building: 'Building', road: 'Road', poi: 'Facility · stop', route: 'Route', transit: 'Public transit',
  unnamed: 'Unnamed {kind}', detail: 'Selected feature details', closeDetail: 'Close details',
  setOrigin: 'Set as origin', setDestination: 'Set as destination', brand: 'Business',
  asset: 'Asset', category: 'Category', zoning: 'Zoning', resident: 'Residents', employee: 'Employees',
  lane: 'Lanes', limit: 'Speed limit', direction: 'Direction', form: 'Form', transport: 'Transport',
  color: 'Color', length: 'Length', passenger: 'Passengers', stop: 'Stops', usage: 'Usage', vehicle: 'Vehicles', object: 'Type',
  nearbyRoutes: 'Nearby transit routes', transportLoading: 'Loading transit data…',
  transportFailed: 'Could not load transit data.', noLinkedRoutes: 'No connected route candidates found.',
  nearbyRoutesNote: 'Routes are estimated from facility and stop locations. The export has no building-to-route IDs.',
  nearbyStops: 'Nearby stops', unnamedStop: 'Unnamed stop #{number}',
  stopsLoading: 'Loading stop data…', stopsFailed: 'Could not load stop data.',
  noStops: 'No stops found near this route.',
  nearbyStopsNote: 'This estimated list follows the route geometry from its start. The export has no stop order or connection IDs, so game order may differ.',
  extraInfoRegion: 'Additional information region', extraInfo: 'Additional information', noExtraInfo: 'No additional information to show.', internalId: 'Internal map ID: {id}',
  searchRegion: 'Map search', search: 'Search', searchPlaceholder: 'Search name or address', searchResults: '{count} results',
  firstHundred: 'showing first 100', noResults: 'No search results.', searchResultsAria: '{label} results',
  searchLoading: 'Loading facility and route search data…', searchFailed: 'Could not load search data for {sources}. Results may be incomplete.',
  back: '← Back', origin: 'Origin', destination: 'Destination', swapAria: 'Swap origin and destination',
  swap: 'Swap origin and destination ↕', samePlace: 'Origin and destination are the same.', calculating: 'Calculating route…', findRoute: 'Find route',
  showVehicle: 'Show driving route on map', showTransit: 'Show transit route on map',
  minutes: '{count} min', routeSummary: '{count} road segments · {distance}m access',
  vehicleAccessFailed: 'No road found within 150m of the origin or destination.',
  vehicleDisconnected: 'No connected route found in the allowed travel direction.',
  vehicleNote: 'Estimated time · traffic excluded · 80% of road speed limits',
  transfers: '{count} transfers', walk: 'Walk {distance}m', wait: 'Wait {minutes} min',
  transitNoService: 'No available passenger routes and stops found.',
  transitAccessFailed: 'No stop found within a 1km walk of the origin or destination.',
  transitDisconnected: 'No route found with walking links and up to two transfers.',
  transitCalculating: 'Calculating transit route…', transitDataLoading: 'Preparing stop and route data…',
  selectPlaces: 'Choose an origin and destination to find a route.',
  assumptionStops: 'Stop locations and order estimated from route geometry', assumptionBidirectional: 'Routes assumed to run in both directions',
  assumptionWait: 'Average 5-minute wait per boarding instead of schedules',
  layers: 'Layers', mapLayers: 'Map layers', transitLayers: 'Transit layers',
  transportNote: 'Bus, train, tram, subway, ship and ferry show routes, stops and facilities. Air shows stops and facilities only.',
  loading: 'Loading', noData: 'No data', count: '{count} items', loadError: 'Load error',
  retryLayer: 'Error · toggle to retry', loadOnEnable: '{count} items · enable to load',
  waterData: 'Water data:', districtData: 'District data:', poiData: 'Transit facility and stop data:', routeData: 'Route data:',
  water: 'Water', buildings: 'Buildings', roads: 'Roads', tracks: 'Railways', pathways: 'Paths', waterways: 'Waterways', districts: 'Districts',
  bus: 'Bus', train: 'Train', tram: 'Tram', subway: 'Subway', ship: 'Ship', ferry: 'Ferry', air: 'Air',
  roadNotReady: 'Road data is not ready yet.', waterMissing: 'No depth data available',
  mapRenderError: 'Map rendering error: {detail}', unknownError: 'Unknown error',
  workerTransitNotReady: 'Transit route data is not ready.', workerRoadNotReady: 'Road data is not ready.',
  requestFailed: '{file} request failed (HTTP {status})', invalidJson: 'Could not read JSON from {file}',
  invalidGeojson: 'Invalid GeoJSON structure in {file}', missingDataset: 'Dataset ID is missing. Run npm run prepare:data again.',
  areaMetadataMissing: 'Area metadata is missing', areaMetadataInvalid: 'Invalid Area metadata',
  waterMetadataMissing: 'Depth metadata is missing', waterMetadataInvalid: 'Invalid depth metadata',
  waterImageFailed: 'Could not load water-mask.png', emptyCoordinates: 'Empty coordinate array', invalidCoordinates: 'Invalid coordinates',
  transitSourceFailed: 'Could not load {source} data.', networkRoadMissing: 'No roads in Network_Centerline.json',
  transitPrepareFailed: 'Could not prepare transit data.', routingFailed: 'Route calculation error',
  routingWorkerFailed: 'Could not start the routing worker.', transitWorkerFailed: 'Could not start the transit routing worker.',
  stopName: 'Stop #{number}', routeName: 'Route #{number}',
}

export type TranslationKey = keyof typeof ko
const messages = { ko, en }
const STORAGE_KEY = 'cities-maps-language'

type I18n = { language: Language; setLanguage: (language: Language) => void; t: (key: TranslationKey, values?: Record<string, string | number>) => string; number: (value: number) => string }
const Context = createContext<I18n | null>(null)

function initialLanguage(): Language {
  try { return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ko' } catch { return 'ko' }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage)
  useEffect(() => {
    document.documentElement.lang = language
    try { window.localStorage.setItem(STORAGE_KEY, language) } catch { /* Storage may be disabled. */ }
  }, [language])
  const t: I18n['t'] = (key, values = {}) => messages[language][key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
  const number = (value: number) => new Intl.NumberFormat(language === 'ko' ? 'ko-KR' : 'en-US').format(value)
  return <Context.Provider value={{ language, setLanguage, t, number }}>{children}</Context.Provider>
}

export function useI18n(): I18n {
  const context = useContext(Context)
  if (!context) throw new Error('I18nProvider is missing')
  return context
}

export function localizeKnownError(message: string, t: I18n['t']): string {
  const known: Record<string, TranslationKey> = {
    '도로 데이터가 아직 준비되지 않았습니다.': 'roadNotReady',
    '수심 데이터가 없습니다': 'waterMissing',
    '대중교통 경로 데이터가 준비되지 않았습니다.': 'workerTransitNotReady',
    '도로 데이터가 준비되지 않았습니다.': 'workerRoadNotReady',
    '데이터셋 ID가 없습니다. npm run prepare:data를 다시 실행하세요': 'missingDataset',
    'Area 메타데이터가 없습니다': 'areaMetadataMissing',
    'Area 메타데이터 구조가 올바르지 않습니다': 'areaMetadataInvalid',
    '수심 메타데이터가 없습니다': 'waterMetadataMissing',
    '수심 메타데이터 구조가 올바르지 않습니다': 'waterMetadataInvalid',
    'water-mask.png 이미지를 불러올 수 없습니다': 'waterImageFailed',
    '빈 좌표 배열': 'emptyCoordinates',
    '유효하지 않은 좌표': 'invalidCoordinates',
    'Network_Centerline.json에 도로가 없습니다': 'networkRoadMissing',
    '대중교통 데이터를 준비하지 못했습니다.': 'transitPrepareFailed',
    '경로 계산 오류': 'routingFailed',
    '경로 계산 작업자를 실행하지 못했습니다.': 'routingWorkerFailed',
    '대중교통 경로 계산 작업자를 실행하지 못했습니다.': 'transitWorkerFailed',
  }
  if (known[message]) return t(known[message])
  const request = message.match(/^(.*?) 요청 실패 \(HTTP (\d+)\)$/)
  if (request) return t('requestFailed', { file: request[1], status: request[2] })
  const json = message.match(/^(.*?)의 JSON을 읽을 수 없습니다$/)
  if (json) return t('invalidJson', { file: json[1] })
  const geojson = message.match(/^(.*?)의 GeoJSON 구조가 올바르지 않습니다$/)
  if (geojson) return t('invalidGeojson', { file: geojson[1] })
  const source = message.match(/^(정류장|노선) 데이터를 불러오지 못했습니다\.$/)
  if (source) return t('transitSourceFailed', { source: source[1] === '정류장' ? t('stop') : t('route') })
  if (message.startsWith('지도 렌더링 오류: ')) return t('mapRenderError', { detail: localizeKnownError(message.slice('지도 렌더링 오류: '.length), t) })
  return message
}

export function localizeGeneratedName(name: string, t: I18n['t']): string {
  const stop = name.match(/^정류장 #(\d+)$/)
  if (stop) return t('stopName', { number: stop[1] })
  const route = name.match(/^노선 #(\d+)$/)
  if (route) return t('routeName', { number: route[1] })
  return name
}
