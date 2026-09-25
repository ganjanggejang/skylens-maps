import { useEffect, useRef, useState } from 'react'
import { GROUPS, TOGGLEABLE_GROUPS, type GroupId, type Visibility } from './layers'
import type { Counts, SourceStates } from './Sidebar'

type LayerMenu = 'map' | 'transport'
type Props = {
  counts: Counts
  sourceStates: SourceStates
  visibility: Visibility
  onToggle: (id: GroupId) => void
}

const TRANSPORT_GROUPS = ['bus', 'train', 'tram', 'subway', 'ship', 'ferry', 'air'] as const
const MAP_GROUPS = TOGGLEABLE_GROUPS.filter(id => !TRANSPORT_GROUPS.includes(id as typeof TRANSPORT_GROUPS[number]))

export function LayerControls({ counts, sourceStates, visibility, onToggle }: Props) {
  const [open, setOpen] = useState<LayerMenu | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return <div className="map-layer-controls" ref={rootRef}>
    <div className="map-layer-buttons">
      <button type="button" className={open === 'map' ? 'is-active' : ''}
        aria-controls={open === 'map' ? 'map-layer-menu' : undefined} aria-expanded={open === 'map'}
        onClick={() => setOpen(previous => previous === 'map' ? null : 'map')}>레이어</button>
      <button type="button" className={open === 'transport' ? 'is-active' : ''}
        aria-controls={open === 'transport' ? 'transport-layer-menu' : undefined} aria-expanded={open === 'transport'}
        onClick={() => setOpen(previous => previous === 'transport' ? null : 'transport')}>대중교통</button>
    </div>
    {open && <section className="map-layer-menu" id={open === 'map' ? 'map-layer-menu' : 'transport-layer-menu'}
      aria-label={open === 'map' ? '지도 레이어' : '대중교통 레이어'}>
      <h2>{open === 'map' ? '레이어' : '대중교통'}</h2>
      {open === 'transport' && <p className="transport-note">버스·기차·전차·지하철·선박·페리는 노선과 정류장·시설을 표시합니다. 항공은 정류장·시설만 표시합니다.</p>}
      <div className="layer-list">
        {(open === 'map' ? MAP_GROUPS : TRANSPORT_GROUPS).map(id => {
          const group = GROUPS[id]
          const unavailable = counts[id] === 0
          const source = sourceStates[group.source]
          const loading = sourceStates.poi.state === 'loading' || sourceStates.route.state === 'loading'
          const note = open === 'transport' ?
            (unavailable ? loading ? '불러오는 중' : '데이터 없음' : `${counts[id].toLocaleString('ko-KR')}개`) :
            source.state === 'error' ? (unavailable ? '로드 오류' : '오류 · 다시 켜기') :
              unavailable ? '데이터 없음' : source.state === 'loading' ? '불러오는 중' : source.state === 'idle' ?
                `${counts[id].toLocaleString('ko-KR')}개 · 켜면 로드` : `${counts[id].toLocaleString('ko-KR')}개`
          return <label key={id} className={`layer-row${unavailable ? ' is-disabled' : ''}`}>
            <input type="checkbox" checked={visibility[id]} disabled={unavailable} onChange={() => onToggle(id)} />
            <span className="layer-swatch" style={{ backgroundColor: group.color }} aria-hidden="true" />
            <span className="layer-copy"><span>{group.label}</span><small>{note}</small></span>
          </label>
        })}
      </div>
      {open === 'map' && <>
        {sourceStates.water.state === 'error' && <div className="layer-error" role="status">수역 데이터: {sourceStates.water.error}</div>}
        {sourceStates.area.state === 'error' && <div className="layer-error" role="status">행정구역 데이터: {sourceStates.area.error}</div>}
      </>}
      {open === 'transport' && <>
        {sourceStates.poi.state === 'error' && <div className="layer-error" role="status">교통 시설·정류장 데이터: {sourceStates.poi.error}</div>}
        {sourceStates.route.state === 'error' && <div className="layer-error" role="status">노선 데이터: {sourceStates.route.error}</div>}
      </>}
    </section>}
  </div>
}
