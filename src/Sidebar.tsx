import { GROUPS, TOGGLEABLE_GROUPS, type GroupId, type Visibility } from './layers'
import type { Selection } from './interaction'
import { Search, type SearchEntry, type SearchSourceState } from './Search'
import { buildingBrand, buildingTitle, normalizeText, propertyText } from './building-name'
import { routeMode, TRANSPORT } from './transport'

export type SourceKey = 'buildings' | 'network' | 'area' | 'water' | 'poi' | 'route'
export type SourceState = { state: 'idle' | 'loading' | 'ready' | 'empty' | 'error'; error?: string }
export type SourceStates = Record<SourceKey, SourceState>
export type Counts = Record<GroupId, number>

type Props = {
  status: 'loading' | 'ready' | 'error'
  error: string
  counts: Counts
  sourceStates: SourceStates
  visibility: Visibility
  selection: Selection | null
  routeStops: SearchEntry[]
  buildingRoutes: SearchEntry[]
  collapsed: boolean
  onToggle: (id: GroupId) => void
  onToggleCollapsed: () => void
  onClearSelection: () => void
  searchEntries: SearchEntry[]
  searchStates: { poi: SearchSourceState; route: SearchSourceState }
  onSearchActivate: () => void
  onSearchSelect: (entry: SearchEntry) => void
  onStopFocus: (entry: SearchEntry) => void
  onBuildingRouteSelect: (entry: SearchEntry) => void
}

const buildingFields = [
  ['Asset', '에셋'], ['Category', '분류'], ['Zoning', '용도지역'],
  ['Resident', '거주자'], ['Employee', '근로자'],
] as const
const roadFields = [
  ['Asset', '에셋'], ['Category', '분류'], ['Lane', '차선'],
  ['Limit', '속도 제한'], ['Direction', '방향'], ['Form', '형태'],
] as const
const routeFields = [
  ['Transport', '교통수단'], ['Color', '색상'], ['Length', '길이'],
  ['Passenger', '승객'], ['Stop', '정류장'], ['Usage', '이용률'], ['Vehicle', '차량'],
] as const
const poiFields = [['Category', '분류'], ['Object', '종류']] as const

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString('ko-KR')
  return String(value)
}

function address(properties: Record<string, unknown>) {
  const parts = ['Address_District', 'Address_Street', 'Address_Number']
    .map(key => properties[key])
    .filter(hasValue)
    .map(formatValue)
  return parts.join(' ')
}

function uniqueRouteStops(stops: SearchEntry[]): SearchEntry[] {
  const seen = new Set<string>()
  return stops.filter(entry => {
    const name = entry.selection.properties.Name
    const stopAddress = address(entry.selection.properties)
    if (!hasValue(name) || !stopAddress) return true
    const key = JSON.stringify([normalizeText(formatValue(name)), normalizeText(stopAddress)])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function Detail({ selection, routeStops, buildingRoutes, poiState, routeState, onClose, onStopFocus, onBuildingRouteSelect }: {
  selection: Selection; routeStops: SearchEntry[]; buildingRoutes: SearchEntry[];
  poiState: SourceState['state']; routeState: SourceState['state']; onClose: () => void
  onStopFocus: (entry: SearchEntry) => void
  onBuildingRouteSelect: (entry: SearchEntry) => void
}) {
  const { properties, kind, id } = selection
  const fields = kind === 'building' ? buildingFields : kind === 'road' ? roadFields : kind === 'route' ? routeFields : poiFields
  const location = kind === 'building' || kind === 'poi' ? address(properties) : ''
  const title = kind === 'building' ? buildingTitle(properties, id) :
    (hasValue(properties.Name) ? formatValue(properties.Name) : `${kind === 'road' ? '도로' : kind === 'poi' ? '시설·정류장' : '노선'} ${id}`)
  const brand = kind === 'building' ? buildingBrand(properties) : ''
  const listedStops = kind === 'route' ? uniqueRouteStops(routeStops) : []
  const isTransportBuilding = kind === 'building' && propertyText(properties, 'Category') === 'Public, Transportation'
  return <section className="detail" aria-label="선택한 객체 상세 정보">
    <button className="detail-close" type="button" onClick={onClose} aria-label="상세 정보 닫기">×</button>
    <span className="detail-kind">{kind === 'building' ? '건물' : kind === 'road' ? '도로' : kind === 'poi' ? '시설·정류장' : '노선'}</span>
    <h2>{title}</h2>
    {location && title !== location && <p className="detail-address">{location}</p>}
    <dl className="detail-fields">
      {brand && normalizeText(brand) !== normalizeText(title) && <div><dt>입점 업체</dt><dd>{brand}</dd></div>}
      {fields.filter(([key]) => hasValue(properties[key])).map(([key, label]) =>
        <div key={key}><dt>{label}</dt><dd>{formatValue(properties[key])}</dd></div>)}
    </dl>
    {isTransportBuilding && <section className="building-routes" aria-label="건물 인근 대중교통 노선">
      <h3>인근 대중교통 노선 {buildingRoutes.length > 0 && `(${buildingRoutes.length})`}</h3>
      {buildingRoutes.length > 0 ? <ul>{buildingRoutes.map(entry => {
        const mode = routeMode(entry.selection.properties.Transport)
        const rawColor = entry.selection.properties.Color
        const color = typeof rawColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor :
          mode ? TRANSPORT[mode].color : '#6f7977'
        return <li key={entry.selection.id}><button type="button" onClick={() => onBuildingRouteSelect(entry)}>
          <span className="building-route-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
          <span><strong>{hasValue(entry.selection.properties.Name) ? formatValue(entry.selection.properties.Name) : '이름 없는 노선'}</strong>
            <small>{mode ? TRANSPORT[mode].label : '대중교통'}</small></span>
        </button></li>
      })}</ul> : <p>{poiState === 'loading' || poiState === 'idle' || routeState === 'loading' || routeState === 'idle' ?
        '교통 데이터를 불러오는 중…' : poiState === 'error' || routeState === 'error' ?
          '교통 데이터를 불러오지 못했습니다.' : '연결된 노선 후보를 찾지 못했습니다.'}</p>}
      <p className="route-stop-note">시설·정류장 위치를 기준으로 추정한 노선입니다. Export에 건물과 노선의 연결 ID는 없습니다.</p>
    </section>}
    {kind === 'route' && <section className="route-stops" aria-label="인근 정류장 목록">
      <h3>인근 정류장 {listedStops.length > 0 && `(${listedStops.length})`}</h3>
      {listedStops.length > 0 ? <ol>{listedStops.map(entry => {
        const name = entry.selection.properties.Name
        const stopAddress = address(entry.selection.properties)
        return <li key={entry.selection.id}>
          <button type="button" className="route-stop-button" onClick={() => onStopFocus(entry)}>
            <strong>{hasValue(name) ? formatValue(name) : `이름 없는 정류장 #${entry.selection.sourceFeatureId + 1}`}</strong>
            {stopAddress && <small>{stopAddress}</small>}
          </button>
        </li>
      })}</ol> : <p>{poiState === 'loading' || poiState === 'idle' ? '정류장 데이터를 불러오는 중…' :
        poiState === 'error' ? '정류장 데이터를 불러오지 못했습니다.' : '노선 가까이에서 정류장을 찾지 못했습니다.'}</p>}
      <p className="route-stop-note">노선 선형의 시작점부터 가까운 순서로 정렬한 추정 목록입니다. Export에 정차 순서와 연결 ID가 없어 실제 게임 순서와 다를 수 있습니다.</p>
    </section>}
    <div className="detail-future" aria-label="추가 정보 영역">
      <h3>추가 정보</h3>
      <p>표시할 추가 정보가 없습니다.</p>
    </div>
    <small className="detail-id">지도 내부 ID: {id}</small>
  </section>
}

export function Sidebar({ status, error, counts, sourceStates, visibility, selection,
  routeStops, buildingRoutes, collapsed, onToggle, onToggleCollapsed, onClearSelection, searchEntries, searchStates,
  onSearchActivate, onSearchSelect, onStopFocus, onBuildingRouteSelect }: Props) {
  return <>
    <aside className="panel" id="map-sidebar" aria-label="지도 메뉴" hidden={collapsed}>
    <div className="panel-header">
      <div className="eyebrow">CITIES: SKYLINES II · CARTO EXPORT</div>
      <h1>City Map</h1>
      <p>도로와 건물을 탐색하세요.</p>
    </div>
    {status === 'ready' && <>
      <Search entries={searchEntries} optionalStates={searchStates} onActivate={onSearchActivate} onSelect={onSearchSelect} />
      {selection && <Detail selection={selection} routeStops={routeStops} buildingRoutes={buildingRoutes}
        poiState={sourceStates.poi.state} routeState={sourceStates.route.state}
        onClose={onClearSelection} onStopFocus={onStopFocus} onBuildingRouteSelect={onBuildingRouteSelect} />}
      <div className="overview">
        <div className="counts">
          <div><strong>{counts.buildings.toLocaleString('ko-KR')}</strong><span>건물</span></div>
          <div><strong>{counts.roads.toLocaleString('ko-KR')}</strong><span>도로 구간</span></div>
        </div>
        {sourceStates.water.state === 'error' && <div className="layer-error" role="status">수역 데이터: {sourceStates.water.error}</div>}
        <section className="layer-section" aria-label="지도 레이어">
          <h2>레이어</h2>
          <div className="layer-list">
            {TOGGLEABLE_GROUPS.filter(id => !['bus', 'train', 'tram', 'subway', 'ship', 'ferry', 'air'].includes(id)).map(id => {
              const group = GROUPS[id]
              const source = sourceStates[group.source]
              const unavailable = counts[id] === 0
              const note = source.state === 'error' ? (unavailable ? '로드 오류' : '오류 · 다시 켜기') :
                unavailable ? '데이터 없음' : source.state === 'loading' ? '불러오는 중' : source.state === 'idle' ?
                  `${counts[id].toLocaleString('ko-KR')}개 · 켜면 로드` : `${counts[id].toLocaleString('ko-KR')}개`
              return <label key={id} className={`layer-row${unavailable ? ' is-disabled' : ''}`}>
                <input type="checkbox" checked={visibility[id]} disabled={unavailable} onChange={() => onToggle(id)} />
                <span className="layer-swatch" style={{ backgroundColor: group.color }} aria-hidden="true" />
                <span className="layer-copy"><span>{group.label}</span><small>{note}</small></span>
              </label>
            })}
          </div>
          {sourceStates.area.state === 'error' && <div className="layer-error" role="status">행정구역 데이터: {sourceStates.area.error}</div>}
        </section>
        <section className="layer-section" aria-label="대중교통 레이어">
          <h2>대중교통</h2>
          <p className="transport-note">버스·기차·전차·지하철·선박·페리는 노선과 정류장·시설을 표시합니다. 항공은 정류장·시설만 표시합니다.</p>
          <div className="layer-list">
            {(['bus', 'train', 'tram', 'subway', 'ship', 'ferry', 'air'] as const).map(id => {
              const group = GROUPS[id]
              const unavailable = counts[id] === 0
              const loading = sourceStates.poi.state === 'loading' || sourceStates.route.state === 'loading'
              return <label key={id} className={`layer-row${unavailable ? ' is-disabled' : ''}`}>
                <input type="checkbox" checked={visibility[id]} disabled={unavailable} onChange={() => onToggle(id)} />
                <span className="layer-swatch" style={{ backgroundColor: group.color }} aria-hidden="true" />
                <span className="layer-copy"><span>{group.label}</span><small>{unavailable ? loading ? '불러오는 중' : '데이터 없음' : `${counts[id].toLocaleString('ko-KR')}개`}</small></span>
              </label>
            })}
          </div>
          {sourceStates.poi.state === 'error' && <div className="layer-error" role="status">교통 시설·정류장 데이터: {sourceStates.poi.error}</div>}
          {sourceStates.route.state === 'error' && <div className="layer-error" role="status">노선 데이터: {sourceStates.route.error}</div>}
        </section>
      </div>
    </>}
    {status === 'loading' && <p className="notice" role="status">지도 데이터를 불러오는 중…</p>}
    {status === 'error' && <div className="error" role="alert">
      <strong>지도를 불러오지 못했습니다</strong>
      <span>{error}</span>
      <button type="button" onClick={() => window.location.reload()}>다시 시도</button>
    </div>}
    </aside>
    <button type="button" className={`sidebar-toggle${collapsed ? ' is-collapsed' : ''}`}
      onClick={onToggleCollapsed} aria-controls="map-sidebar" aria-expanded={!collapsed}
      aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
      title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}>
      {collapsed ? '☰' : '‹'}
    </button>
  </>
}
