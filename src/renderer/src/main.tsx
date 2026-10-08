import './lib/theme' // first: sets html[data-theme] before anything paints
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/nunito'
import './styles/base.css'
import './styles/app.css'
import './styles/editor.css'
import './styles/timeline.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { boot } from './store'

void boot()
createRoot(document.getElementById('root')!).render(<App />)
