import { useI18n } from '../i18n'
import type { SourceStates } from '../data/types'
import './snapshot.css'

type Props = {
  snapshot: { id: string; preparedAt: string }
  status: 'loading' | 'ready' | 'error'
  sourceStates: SourceStates
}

export function SnapshotInfo({ snapshot, status, sourceStates }: Props) {
  const { t } = useI18n()
  return <div className="snapshot-info" role="status">
    <strong>{t('snapshot')} {snapshot.id}</strong>
    {snapshot.preparedAt && <span>{new Date(snapshot.preparedAt).toLocaleString()}</span>}
    <span>{status === 'error' ? t('snapshotError') : status === 'loading' ? t('snapshotLoading') :
      Object.values(sourceStates).some(source => source.state === 'error') ? t('snapshotPartial') : t('snapshotReady')}</span>
  </div>
}
