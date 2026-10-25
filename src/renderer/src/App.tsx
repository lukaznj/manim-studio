import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { BoothDialog } from './components/RecordingBooth'
import { Editor } from './components/Editor'
import { ExportDialog } from './components/ExportDialog'
import { AddExercisesDialog, LectureDialog, NewExerciseSetDialog } from './components/ExerciseDialogs'
import { StudyView } from './components/StudyView'
import { Onboarding, SetupGate, requiredReady, startInstalls } from './components/Onboarding'
import { Home } from './components/Home'
import { NewProjectDialog } from './components/NewProjectDialog'
import { QuickDialog } from './components/QuickDialog'
import { QuickView } from './components/QuickView'
import { SeriesDialog } from './components/SeriesDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { TitleBar } from './components/TitleBar'
import { UsageDialog } from './components/UsageDialog'
import { Tour } from './components/Tour'
import { canEdit, leaveEditor, useStore } from './store'
import { startSoundCues } from './lib/sounds'

export function App() {
  // Language updates rerender the complete interface without remounting open dialogs or editors.
  useStore((s) => s.settings?.uiLanguage)
  const screen = useStore((s) => s.screen)
  const ready = useStore((s) => !!s.app)
  // First launch is its own screen until a mode is chosen; after it, nothing opens until the engine is in.
  const onboarding = useStore((s) => !!s.settings && !s.settings.mode)
  const installing = useStore((s) => !!s.settings?.mode && !!s.setup && !requiredReady(s.setup))
  const toasts = useStore((s) => s.toasts)
  // Quick mode shows its progress instead of the editor, until you ask for the editor.
  const quickHere = useStore((s) => !!s.quick && s.quick.project === s.project?.path && !s.quickEditor)
  const learn = useStore((s) => !canEdit(s))
  const editorBarred = learn && screen === 'editor' && !quickHere
  useEffect(() => {
    if (editorBarred) void leaveEditor()
  }, [editorBarred])
  useEffect(() => startSoundCues(), [])
  // Dialogs sit in the top layer, above any z-index; showing the toasts again puts them above the newest one.
  const toastLayer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = toastLayer.current
    if (!el?.showPopover) return
    if (el.matches(':popover-open')) el.hidePopover()
    if (toasts.length) el.showPopover()
  }, [toasts])
  // What the mode needs installs by itself: after onboarding, and when Settings switches Learn to Create.
  const mode = useStore((s) => s.settings?.mode)
  const setupLoaded = useStore((s) => !!s.setup)
  useEffect(() => {
    if (mode && setupLoaded) startInstalls(mode)
  }, [mode, setupLoaded])

  return (
    <div className={`app ${window.studio ? '' : 'no-bridge'}`}>
      <TitleBar />
      <main className="app-main">
        {onboarding ? (
          <Onboarding />
        ) : installing ? (
          <SetupGate />
        ) : (
          ready && (screen === 'home' ? <Home /> : screen === 'study' ? <StudyView /> : quickHere ? <QuickView /> : editorBarred ? null : <Editor />)
        )}
      </main>
      <NewProjectDialog />
      <SettingsDialog />
      <BoothDialog />
      <ExportDialog />
      <QuickDialog />
      <SeriesDialog />
      <UsageDialog />
      <NewExerciseSetDialog />
      <AddExercisesDialog />
      <LectureDialog />
      <Tour />
      <div className="toast-stack" aria-live="polite" popover="manual" ref={toastLayer}>
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
