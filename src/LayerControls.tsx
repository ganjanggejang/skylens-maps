import { useEffect, useRef, useState } from 'react'
import { GROUPS, TOGGLEABLE_GROUPS, type GroupId, type Visibility } from './layers'
import type { Counts, SourceStates } from './Sidebar'
import { useI18n, localizeKnownError } from './i18n'

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
  const { t, number } = useI18n()
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
        onClick={() => setOpen(previous => previous === 'map' ? null : 'map')}>{t('layers')}</button>
      <button type="button" className={open === 'transport' ? 'is-active' : ''}
        aria-controls={open === 'transport' ? 'transport-layer-menu' : undefined} aria-expanded={open === 'transport'}
        onClick={() => setOpen(previous => previous === 'transport' ? null : 'transport')}>{t('transit')}</button>
    </div>
    {open && <section className="map-layer-menu" id={open === 'map' ? 'map-layer-menu' : 'transport-layer-menu'}
      aria-label={t(open === 'map' ? 'mapLayers' : 'transitLayers')}>
      <h2>{t(open === 'map' ? 'layers' : 'transit')}</h2>
      {open === 'transport' && <p className="transport-note">{t('transportNote')}</p>}
      <div className="layer-list">
        {(open === 'map' ? MAP_GROUPS : TRANSPORT_GROUPS).map(id => {
          const group = GROUPS[id]
          const unavailable = counts[id] === 0
          const source = sourceStates[group.source]
          const loading = sourceStates.poi.state === 'loading' || sourceStates.route.state === 'loading'
          const note = open === 'transport' ?
            (unavailable ? loading ? t('loading') : t('noData') : t('count', { count: number(counts[id]) })) :
            source.state === 'error' ? (unavailable ? t('loadError') : t('retryLayer')) :
              unavailable ? t('noData') : source.state === 'loading' ? t('loading') : source.state === 'idle' ?
                t('loadOnEnable', { count: number(counts[id]) }) : t('count', { count: number(counts[id]) })
          return <label key={id} className={`layer-row${unavailable ? ' is-disabled' : ''}`}>
            <input type="checkbox" checked={visibility[id]} disabled={unavailable} onChange={() => onToggle(id)} />
            <span className="layer-swatch" style={{ backgroundColor: group.color }} aria-hidden="true" />
            <span className="layer-copy"><span>{t(id)}</span><small>{note}</small></span>
          </label>
        })}
      </div>
      {open === 'map' && <>
        {sourceStates.water.state === 'error' && <div className="layer-error" role="status">{t('waterData')} {localizeKnownError(sourceStates.water.error ?? '', t)}</div>}
        {sourceStates.area.state === 'error' && <div className="layer-error" role="status">{t('districtData')} {localizeKnownError(sourceStates.area.error ?? '', t)}</div>}
      </>}
      {open === 'transport' && <>
        {sourceStates.poi.state === 'error' && <div className="layer-error" role="status">{t('poiData')} {localizeKnownError(sourceStates.poi.error ?? '', t)}</div>}
        {sourceStates.route.state === 'error' && <div className="layer-error" role="status">{t('routeData')} {localizeKnownError(sourceStates.route.error ?? '', t)}</div>}
      </>}
    </section>}
  </div>
}
