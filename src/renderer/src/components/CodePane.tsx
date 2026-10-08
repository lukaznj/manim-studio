import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import { FileCode2, Play, Save, Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { editorBridge } from '../lib/editor-bridge'
import { markEdited, resolveConflict, saveScene, useStore } from '../store'

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

export function CodePane() {
  const host = useRef<HTMLDivElement>(null)
  const savedSource = useStore((s) => s.savedSource)
  const projectPath = useStore((s) => s.project?.path)
  const dirty = useStore((s) => s.dirty)
  const conflict = useStore((s) => s.conflict)
  const chatBusy = useStore((s) => s.chatBusy)

  useEffect(() => {
    if (!host.current) return
    const model = monaco.editor.createModel(useStore.getState().savedSource, 'python')
    const editor = monaco.editor.create(host.current, {
      model,
      theme: 'studio',
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
        <div className="file-tab">
          <FileCode2 />
          scene.py
          {dirty && <span className="dirty-dot" />}
        </div>
        <div className="pane-actions">
          <button className="btn ghost small" disabled={!dirty} onClick={() => void saveScene({ render: false })} title="Spremi bez rendera">
            <Save /> Spremi
          </button>
          <button className="btn small" onClick={() => void saveScene({ render: true })} title="Spremi i renderiraj (⌘S)">
            <Play /> Renderiraj <span className="kbd">⌘S</span>
          </button>
        </div>
      </div>
      {conflict !== null && (
        <div className="banner">
          <span>Datoteka je promijenjena izvana dok si je uređivao.</span>
          <button className="btn small" onClick={() => resolveConflict('theirs')}>
            Učitaj novu verziju
          </button>
          <button className="btn ghost small" onClick={() => resolveConflict('mine')}>
            Zadrži moju
          </button>
        </div>
      )}
      <div className="code-host" ref={host} />
      <div className={`claude-editing ${chatBusy ? 'on' : ''}`}>
        <Sparkles /> Claude uređuje scenu…
      </div>
    </div>
  )
}
