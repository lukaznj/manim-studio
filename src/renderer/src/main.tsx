import './lib/theme' // first: sets html[data-theme] before anything paints
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/nunito'
import './styles/base.css'
import './styles/app.css'
import './styles/editor.css'
import './styles/timeline.css'
import './styles/exercises.css'
import './styles/study.css'
import './styles/study-assistant.css'
import './styles/onboarding.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { boot, errorText, toast } from './store'

// A failed call to the main process that no caller handled still tells you what broke.
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason instanceof Error ? event.reason.message : ''
  if (!message.startsWith('Error invoking remote method')) return
  event.preventDefault()
  toast(errorText(event.reason), 'error')
})

void boot()
createRoot(document.getElementById('root')!).render(<App />)
