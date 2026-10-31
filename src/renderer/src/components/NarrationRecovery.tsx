import { useEffect, useState } from 'react'
import { RefreshCw, VolumeX, Volume2 } from 'lucide-react'
import type { NarrationStatus } from '../../../shared/types'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { errorText, openDialog, toast, useStore } from '../store'

/** A voice failure never takes away the finished video or asks the writing agent to redo it. */
export function NarrationRecovery({ dir, status, preview = false }: { dir: string; status?: NarrationStatus; preview?: boolean }) {
  const jobs = useStore((s) => s.exports)
  const revision = jobs.findLast((job) => job.project === dir && job.state === 'done')?.id
  const pending = jobs.some((job) => job.project === dir && ['waiting', 'running'].includes(job.state))
  const last = jobs.findLast((job) => job.project === dir && job.options.narrationVoice)
  const ready = useStore((s) => s.setup?.omnivoice === 'ready')
  const eleven = useStore((s) => s.project?.path === dir && s.project.meta.voice.provider === 'elevenlabs')
  const [loaded, setLoaded] = useState<{ dir: string; status?: NarrationStatus } | null>(null)
  const [starting, setStarting] = useState(false)
  useEffect(() => {
    if (preview) return
    let active = true
    void api.watchDetail(dir).then((detail) => { if (active) setLoaded({ dir, status: detail.narration }) }).catch(() => undefined)
    return () => { active = false }
  }, [dir, revision, status, preview])
  const narration = !preview && loaded?.dir === dir ? loaded.status : status
  if (!narration || (!narration.silentBlocks && !narration.fallback)) return null
  const fallback = !!narration.fallback && !narration.silentBlocks
  const credits = narration.issues.some((issue) => issue.kind === 'credits')
  const recover = async (provider: 'elevenlabs' | 'omnivoice') => {
    setStarting(true)
    try { await api.recoverNarration(dir, provider) }
    catch (error) { toast(errorText(error), 'error') }
    finally { setStarting(false) }
  }
  return <section className={`narration-recovery ${fallback ? 'using-fallback' : ''}`} role="status">
    {fallback ? <Volume2 /> : <VolumeX />}
    <div><strong>{t(fallback ? 'Using OmniVoice narration' : credits ? 'ElevenLabs credits exhausted' : 'Some narration is missing')}</strong>
      <p>{t(fallback ? 'You can retry ElevenLabs after topping up.' : credits ? 'The video is ready. Missing narration is silent. Top up ElevenLabs, then retry, or use OmniVoice on this computer.' : 'The video is ready. Missing narration is silent. Check your voice settings, then retry.')}</p>
      {last?.state === 'failed' && <p className="narration-recovery-error">{last.error}</p>}
      <div className="narration-recovery-actions">
        <button className="btn small" disabled={starting || pending} onClick={() => void recover(eleven ? 'elevenlabs' : 'omnivoice')}><RefreshCw />{t(starting || pending ? 'Re-voicing…' : eleven ? 'Retry ElevenLabs' : 'Retry')}</button>
        {!fallback && eleven && <button className="btn small ghost" disabled={starting || pending} onClick={() => ready ? void recover('omnivoice') : openDialog({ kind: 'settings', tab: 'env' })}><Volume2 />{ready ? t('Use OmniVoice') : `${t('Install')} OmniVoice`}</button>}
        <button className="btn small ghost" onClick={() => openDialog({ kind: 'settings', tab: 'voice' })}>{t('Settings')}</button>
      </div>
    </div>
  </section>
}
