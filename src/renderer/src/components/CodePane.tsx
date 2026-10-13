import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import { FileCode2, FileText, Images, Play, Save, Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { editorBridge } from '../lib/editor-bridge'
import { isDark, onThemeChange } from '../lib/theme'
import { shortcut } from '../lib/platform'
import { markEdited, resolveConflict, saveScene, useStore } from '../store'
import { MediaPane } from './MediaPane'
import { SourcesPane } from './SourcesPane'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

monaco.editor.defineTheme('studio', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'e8eef7' },
    { token: 'comment', foreground: '5d6f8a', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ff9580' },
    { token: 'string', foreground: '86d6a0' },
    // Durations are what the timeline edits; they share its chalk yellow.
    { token: 'number', foreground: 'ffd166' },
    { token: 'type.identifier', foreground: '8fb2ff' },
    { token: 'identifier', foreground: 'dbe4f2' },
    { token: 'delimiter', foreground: '8d9db5' },
    { token: 'tag', foreground: '8fb2ff' },
  ],
  colors: {
    'editor.background': '#0b1626',
    'editor.foreground': '#e8eef7',
    'editor.lineHighlightBackground': '#111f3399',
    'editor.lineHighlightBorder': '#00000000',
    'editorLineNumber.foreground': '#34465f',
    'editorLineNumber.activeForeground': '#9eadc3',
    'editor.selectionBackground': '#6b97ff40',
    'editor.inactiveSelectionBackground': '#6b97ff22',
    'editorCursor.foreground': '#ffd166',
    'editorIndentGuide.background1': '#16243a',
    'editorIndentGuide.activeBackground1': '#283c5a',
    'editorWhitespace.foreground': '#1b2b43',
    'editorWidget.background': '#111f33',
    'editorWidget.border': '#283c5a',
    'editorHoverWidget.background': '#111f33',
    'editorHoverWidget.border': '#283c5a',
    'editorSuggestWidget.background': '#111f33',
    'editorSuggestWidget.selectedBackground': '#172840',
    'editorGutter.background': '#0b1626',
    'editorError.foreground': '#ff6f59',
    'editorWarning.foreground': '#ffd166',
    'scrollbarSlider.background': '#283c5a88',
    'scrollbarSlider.hoverBackground': '#36507a',
    'editorBracketMatch.background': '#6b97ff22',
    'editorBracketMatch.border': '#6b97ff66',
    'minimap.background': '#0b1626',
  },
})

// The same roles on paper: durations stay amber because the timeline edits them.
monaco.editor.defineTheme('studio-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '', foreground: '0d1a2b' },
    { token: 'comment', foreground: '7a879b', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c2412d' },
    { token: 'string', foreground: '1f7a43' },
    { token: 'number', foreground: '9a6400' },
    { token: 'type.identifier', foreground: '2f5fd0' },
    { token: 'identifier', foreground: '1d2b3e' },
    { token: 'delimiter', foreground: '5b6b82' },
    { token: 'tag', foreground: '2f5fd0' },
  ],
  colors: {
    'editor.background': '#f6f8fb',
    'editor.foreground': '#0d1a2b',
    'editor.lineHighlightBackground': '#e7ecf3aa',
    'editor.lineHighlightBorder': '#00000000',
    'editorLineNumber.foreground': '#a6b1c1',
    'editorLineNumber.activeForeground': '#46566c',
    'editor.selectionBackground': '#2f6df630',
    'editor.inactiveSelectionBackground': '#2f6df618',
    'editorCursor.foreground': '#c78a00',
    'editorIndentGuide.background1': '#e1e6ee',
    'editorIndentGuide.activeBackground1': '#c3ccd9',
    'editorWhitespace.foreground': '#d8dee8',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#c3ccd9',
    'editorHoverWidget.background': '#ffffff',
    'editorHoverWidget.border': '#c3ccd9',
    'editorSuggestWidget.background': '#ffffff',
    'editorSuggestWidget.selectedBackground': '#ebeff5',
    'editorGutter.background': '#f6f8fb',
    'editorError.foreground': '#dc4a33',
    'editorWarning.foreground': '#c78a00',
    'scrollbarSlider.background': '#c3ccd988',
    'scrollbarSlider.hoverBackground': '#a6b1c1',
    'editorBracketMatch.background': '#2f6df618',
    'editorBracketMatch.border': '#2f6df666',
    'minimap.background': '#f6f8fb',
  },
})

const editorTheme = (dark: boolean) => (dark ? 'studio' : 'studio-light')
onThemeChange((dark) => monaco.editor.setTheme(editorTheme(dark)))

export function CodePane() {
  const host = useRef<HTMLDivElement>(null)
  const savedSource = useStore((s) => s.savedSource)
  const projectPath = useStore((s) => s.project?.path)
  const dirty = useStore((s) => s.dirty)
  const conflict = useStore((s) => s.conflict)
  const chatBusy = useStore((s) => s.chatBusy)
  const tab = useStore((s) => s.leftTab)
  const setTab = (leftTab: 'code' | 'media' | 'sources') => useStore.setState({ leftTab })

  useEffect(() => {
    if (!host.current) return
    const model = monaco.editor.createModel(useStore.getState().savedSource, 'python')
    const editor = monaco.editor.create(host.current, {
      model,
      theme: editorTheme(isDark()),
      fontFamily: "'JetBrains Mono Variable', ui-monospace, Menlo, monospace",
      fontSize: 13,
      lineHeight: 21,
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 14, bottom: 14 },
      renderLineHighlight: 'all',
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking: 'smooth',
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      glyphMargin: false,
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 12,
      folding: true,
      bracketPairColorization: { enabled: false },
      guides: { indentation: true },
      stickyScroll: { enabled: false },
      overviewRulerBorder: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      wordWrap: 'off',
      fixedOverflowWidgets: true,
    })
    editorBridge.attach(monaco, editor)
    const sub = model.onDidChangeContent(() => markEdited(model.getValue()))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveScene({ render: true }))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void saveScene({ render: true }))
    const err = useStore.getState().render.error
    if (err) editorBridge.showError(err)
    return () => {
      sub.dispose()
      editorBridge.attach(monaco, null)
      editor.dispose()
      model.dispose()
    }
    // One editor per opened project.
  }, [projectPath])

  // A restore from history or a fresh open replaces the text from outside.
  useEffect(() => {
    if (editorBridge.getValue() !== savedSource && !useStore.getState().dirty) editorBridge.setValue(savedSource)
  }, [savedSource])

  return (
    <div className="code-pane">
      <div className="pane-head">
        <div className="pane-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'code'} className="file-tab" onClick={() => setTab('code')}>
            <FileCode2 />
            scene.py
            {dirty && <span className="dirty-dot" />}
          </button>
          <button role="tab" aria-selected={tab === 'media'} className="file-tab" onClick={() => setTab('media')} data-tour="media">
            <Images />
            Media
          </button>
          <button role="tab" aria-selected={tab === 'sources'} className="file-tab" onClick={() => setTab('sources')} title="PDFs the video is made from">
            <FileText />
            Sources
          </button>
        </div>
        <div className={`pane-actions ${tab !== 'code' ? 'hidden' : ''}`}>
          <button className="btn ghost small" disabled={!dirty} onClick={() => void saveScene({ render: false })} title="Save without rendering">
            <Save /> Save
          </button>
          <button className="btn small" onClick={() => void saveScene({ render: true })} title={`Save and render (${shortcut("S")})`}>
            <Play /> Render <span className="kbd">{shortcut("S")}</span>
          </button>
        </div>
      </div>
      {conflict !== null && (
        <div className="banner">
          <span>The file changed on disk while you were editing it.</span>
          <button className="btn small" onClick={() => resolveConflict('theirs')}>
            Load the new version
          </button>
          <button className="btn ghost small" onClick={() => resolveConflict('mine')}>
            Keep mine
          </button>
        </div>
      )}
      {/* Monaco stays mounted under the other panels so its undo history and cursor survive the switch. */}
      <div className={`code-host ${tab !== 'code' ? 'hidden' : ''}`} ref={host} />
      {tab === 'media' && <MediaPane />}
      {tab === 'sources' && <SourcesPane />}
      <div className={`claude-editing ${chatBusy ? 'on' : ''}`}>
        <Sparkles /> Claude is editing the scene…
      </div>
    </div>
  )
}
