import { GROUPS, TOGGLEABLE_GROUPS, type GroupId, type Visibility } from './layers'
import type { Selection } from './interaction'

export type SourceKey = 'buildings' | 'network' | 'area' | 'water'
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
  collapsed: boolean
  onToggle: (id: GroupId) => void
  onToggleCollapsed: () => void
  onClearSelection: () => void
}

const buildingFields = [
  ['Asset', '에셋'], ['Category', '분류'], ['Zoning', '용도지역'],
  ['Resident', '거주자'], ['Employee', '근로자'],
] as const
const roadFields = [
  ['Asset', '에셋'], ['Category', '분류'], ['Lane', '차선'],
  ['Limit', '속도 제한'], ['Direction', '방향'], ['Form', '형태'],
] as const

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

function Detail({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const { properties, kind, id } = selection
  const fields = kind === 'building' ? buildingFields : roadFields
  const location = kind === 'building' ? address(properties) : ''
  const companyBuilding = kind === 'building' && typeof properties.Zoning === 'string' &&
    properties.Zoning.split(',').some(zone => ['Industrial', 'Office'].includes(zone.trim()))
  const brand = companyBuilding && hasValue(properties.Brand) ? formatValue(properties.Brand) : ''
  const title = brand || (companyBuilding && '빈 건물') ||
    (hasValue(properties.Name) ? formatValue(properties.Name) : `${kind === 'building' ? '건물' : '도로'} ${id}`)
  return <section className="detail" aria-label="선택한 객체 상세 정보">
    <button className="detail-close" type="button" onClick={onClose} aria-label="상세 정보 닫기">×</button>
    <span className="detail-kind">{kind === 'building' ? '건물' : '도로'}</span>
    <h2>{title}</h2>
    {location && title !== location && <p className="detail-address">{location}</p>}
    <dl className="detail-fields">
      {fields.filter(([key]) => hasValue(properties[key])).map(([key, label]) =>
        <div key={key}><dt>{label}</dt><dd>{formatValue(properties[key])}</dd></div>)}
    </dl>
    <div className="detail-future" aria-label="추가 정보 영역">
      <h3>추가 정보</h3>
      <p>표시할 추가 정보가 없습니다.</p>
    </div>
    <small className="detail-id">지도 내부 ID: {id}</small>
  </section>
}

export function Sidebar({ status, error, counts, sourceStates, visibility, selection,
  collapsed, onToggle, onToggleCollapsed, onClearSelection }: Props) {
  return <>
    <aside className="panel" id="map-sidebar" aria-label="지도 메뉴" hidden={collapsed}>
    <div className="panel-header">
      <div className="eyebrow">CITIES: SKYLINES II · CARTO EXPORT</div>
      <h1>City Map</h1>
      <p>도로와 건물을 탐색하세요.</p>
    </div>
    {status === 'ready' && <>
      {selection && <Detail selection={selection} onClose={onClearSelection} />}
      <div className="overview">
        <div className="counts">
          <div><strong>{counts.buildings.toLocaleString('ko-KR')}</strong><span>건물</span></div>
          <div><strong>{counts.roads.toLocaleString('ko-KR')}</strong><span>도로 구간</span></div>
        </div>
        {sourceStates.water.state === 'error' && <div className="layer-error" role="status">수역 데이터: {sourceStates.water.error}</div>}
        <section className="layer-section" aria-label="지도 레이어">
          <h2>레이어</h2>
          <div className="layer-list">
            {TOGGLEABLE_GROUPS.map(id => {
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
