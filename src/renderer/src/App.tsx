import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { BoothDialog } from './components/RecordingBooth'
import { Editor } from './components/Editor'
import { ExportDialog } from './components/ExportDialog'
import { Home } from './components/Home'
import { NewProjectDialog } from './components/NewProjectDialog'
import { QuickDialog } from './components/QuickDialog'
import { QuickView } from './components/QuickView'
import { SeriesDialog } from './components/SeriesDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { TitleBar } from './components/TitleBar'
import { UsageDialog } from './components/UsageDialog'
import { Tour } from './components/Tour'
import { useStore } from './store'

export function App() {
  const screen = useStore((s) => s.screen)
  const ready = useStore((s) => !!s.app)
  const toasts = useStore((s) => s.toasts)
  // Quick mode shows its progress instead of the editor, until you ask for the editor.
  const quickHere = useStore((s) => !!s.quick && s.quick.project === s.project?.path && !s.quickEditor)

  return (
    <div className={`app ${window.studio ? '' : 'no-bridge'}`}>
      <TitleBar />
      <main className="app-main">{ready && (screen === 'home' ? <Home /> : quickHere ? <QuickView /> : <Editor />)}</main>
      <NewProjectDialog />
      <SettingsDialog />
      <BoothDialog />
      <ExportDialog />
      <QuickDialog />
      <SeriesDialog />
      <UsageDialog />
      {screen === 'editor' && !quickHere && <Tour />}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'error' ? <CircleAlert /> : t.kind === 'ok' ? <CircleCheck /> : <Info />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
