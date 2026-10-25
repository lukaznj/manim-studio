import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useEffect } from 'react'
import { BoothDialog } from './components/RecordingBooth'
import { Editor } from './components/Editor'
import { ExportDialog } from './components/ExportDialog'
import { AddExercisesDialog, LectureDialog, NewExerciseSetDialog } from './components/ExerciseDialogs'
import { StudyView } from './components/StudyView'
import { Onboarding, SetupGate, requiredReady } from './components/Onboarding'
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
      {screen === 'editor' && !quickHere && !learn && <Tour />}
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
