import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { errorText, toast } from '../store'

/** The CLI's first-run choice must stay visible even though its terminal is hidden. */
export function AntigravityConsent({ onContinue }: { onContinue: () => void }) {
  const [busy, setBusy] = useState(false)
  const firstAction = useRef<HTMLButtonElement>(null)
  useEffect(() => firstAction.current?.focus(), [])
  const continueLogin = async (shareData: boolean) => {
    setBusy(true)
    try {
      await api.antigravityLoginConsent(shareData)
      onContinue()
    } catch (e) {
      toast(t(errorText(e)), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="antigravity-consent">
      <p className="hint">
        {t('Before Google sign-in, Antigravity needs its first-time setup. By continuing, you agree to Google’s terms.')}
      </p>
      <p className="hint">
        <button className="link-btn" onClick={() => void api.openExternal('https://antigravity.google/terms')}>
          {t('Google terms')}
        </button>
        {' · '}
        <button className="link-btn" onClick={() => void api.openExternal('https://policies.google.com/privacy')}>
          {t('Google privacy policy')}
        </button>
      </p>
      <p className="hint">{t('Allow Google to collect and use your interactions to improve Antigravity?')}</p>
      <div className="antigravity-consent-actions">
        <button ref={firstAction} className="btn primary small" disabled={busy} onClick={() => void continueLogin(false)}>
          {t('Continue without sharing')}
        </button>
        <button className="btn ghost small" disabled={busy} onClick={() => void continueLogin(true)}>
          {t('Continue and share interactions')}
        </button>
      </div>
    </div>
  )
}
