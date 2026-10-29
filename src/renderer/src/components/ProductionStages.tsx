import { useEffect, useId, useState } from 'react'
import type { ExportJob } from '../../../shared/types'
import { phasePercent, type ProductionProgress } from '../../../shared/production-progress'
import { api } from '../lib/api'
import { t, format } from '../lib/i18n'

const stages = [
  { key: 'script', label: 'Writing the script' },
  { key: 'scene', label: 'Making the scenes' },
  { key: 'check', label: 'Checking the render' },
  { key: 'export', label: 'Exporting' },
] as const

export function useProductionProgress(project: string, active: boolean, stage?: number) {
  const [snapshot, setSnapshot] = useState<{ project: string; progress: ProductionProgress }>({ project, progress: {} })
  useEffect(() => {
    let mounted = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      const progress = await api.productionProgress(project).catch(() => ({}))
      if (!mounted) return
      setSnapshot({ project, progress })
      if (active) timer = setTimeout(poll, 1200)
    }
    void poll()
    return () => { mounted = false; clearTimeout(timer) }
  }, [project, stage, active])
  return snapshot.project === project ? snapshot.progress : {}
}

/** Shared by single videos, series and follow-ups. Unknown work stays indeterminate. */
export function ProductionStages({ project, stage: explicitStage, active = true, job }: { project: string; stage?: number; active?: boolean; job?: ExportJob }) {
  const id = useId()
  const progress = useProductionProgress(project, active, explicitStage)
  // Combined jobs (extra videos/exercises) do not expose a stage boundary until checking/export.
  const stage = explicitStage ?? (progress.check?.done ? 3 : progress.scene?.done || progress.preview ? 2 : progress.script?.done || progress.scene?.completed ? 1 : 0)
  return <ol className="creation-stages" aria-label={t('Production')}>
    {stages.map(({ key, label }, index) => {
      const completed = index < stage
      const current = index === stage
      const info = key === 'export' ? undefined : key === 'check' && !progress.check?.done ? progress.preview : progress[key]
      const percent = completed ? 100 : key === 'export' ? current && job?.percent !== undefined ? Math.floor(Math.max(0, Math.min(1, job.percent)) * 100) : undefined : phasePercent(info)
      const name = key === 'export' && current && job?.phase ? job.phase === 'rendering' ? 'Rendering' : 'Assembling' : label
      return <li key={key} className={`${completed ? 'complete' : current ? 'current' : 'pending'}`} aria-current={current ? 'step' : undefined}>
        <span className={`creation-dial ${current && active && percent === undefined ? 'indeterminate' : ''}`} role="progressbar" aria-labelledby={`${id}-${key}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <svg viewBox="0 0 64 64" aria-hidden="true"><circle className="dial-track" cx="32" cy="32" r="28" /><circle className="dial-value" cx="32" cy="32" r="28" pathLength="100" strokeDasharray="100" strokeDashoffset={percent === undefined ? 100 : 100 - percent} /></svg>
          <span className="mono">{percent !== undefined ? <>{percent}<small>%</small></> : current ? '—' : index + 1}</span>
        </span>
        <div className="creation-stage-copy"><strong id={`${id}-${key}`}>{t(name)}</strong>
          {info && info.total > 0 && key !== 'check' && <small>{format('{0} of {1} sections', [Math.min(info.completed, info.total), info.total])}</small>}
          {current && percent !== undefined && key !== 'export' && <small>{t('Estimated')}</small>}
        </div>
      </li>
    })}
  </ol>
}
