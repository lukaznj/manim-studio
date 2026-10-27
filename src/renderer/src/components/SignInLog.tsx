import { t } from '../lib/i18n'
import { errorText, toast, useStore } from '../store'

export function SignInLog({ lines }: { lines: string[] }) {
  const developer = useStore((s) => !!s.settings?.developerMode)
  if (!developer || !lines.length) return null
  return (
    <details className="sign-in-log" open>
      <summary>{t('Sign-in log')}</summary>
      <pre tabIndex={0}>{lines.join('\n')}</pre>
      <button className="btn ghost small" onClick={() => void navigator.clipboard.writeText(lines.join('\n')).then(
        () => toast('Sign-in log copied', 'ok'), (e) => toast(errorText(e), 'error'),
      )}>{t('Copy sign-in log')}</button>
    </details>
  )
}
