// The one Monaco instance, reachable from the store and the timeline without prop drilling.
import type * as Monaco from 'monaco-editor'
import type { LayoutWarning, RenderError } from '../../../shared/types'
import type { TextEdit } from './edits'

let monaco: typeof Monaco | null = null
let editor: Monaco.editor.IStandaloneCodeEditor | null = null
let follow: Monaco.editor.IEditorDecorationsCollection | null = null
let selected: Monaco.editor.IEditorDecorationsCollection | null = null
let errorLine: Monaco.editor.IEditorDecorationsCollection | null = null
let followLine: number | null = null

const model = () => editor?.getModel() ?? null

export const editorBridge = {
  attach(m: typeof Monaco, e: Monaco.editor.IStandaloneCodeEditor | null) {
    monaco = m
    editor = e
    follow = e?.createDecorationsCollection() ?? null
    selected = e?.createDecorationsCollection() ?? null
    errorLine = e?.createDecorationsCollection() ?? null
    followLine = null
  },

  getValue(): string | null {
    return model()?.getValue() ?? null
  },

  /** Replaces the text as one undoable edit, keeping the view where it was. */
  setValue(source: string) {
    const m = model()
    if (!editor || !m || m.getValue() === source) return
    const view = editor.saveViewState()
    editor.pushUndoStop()
    m.pushEditOperations([], [{ range: m.getFullModelRange(), text: source }], () => null)
    editor.pushUndoStop()
    if (view) editor.restoreViewState(view)
  },

  applyEdit(edit: TextEdit): string | null {
    const m = model()
    if (!editor || !m || !monaco) return null
    editor.pushUndoStop()
    editor.executeEdits('timeline', [{ range: new monaco.Range(edit.startLine, edit.startCol, edit.endLine, edit.endCol), text: edit.text }])
    editor.pushUndoStop()
    return m.getValue()
  },

  revealLine(line: number, focus = false) {
    if (!editor) return
    editor.revealLineInCenterIfOutsideViewport(line, 0)
    editor.setPosition({ lineNumber: line, column: model()?.getLineFirstNonWhitespaceColumn(line) || 1 })
    if (focus) editor.focus()
  },

  /** The signature: the line producing what's on screen, marked while the video plays. */
  setFollowLine(line: number | null) {
    if (!monaco || !follow || line === followLine) return
    followLine = line
    follow.set(
      line
        ? [{ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: 'follow-line', linesDecorationsClassName: 'follow-gutter' } }]
        : [],
    )
    if (line && editor && !editor.hasTextFocus()) editor.revealLineInCenterIfOutsideViewport(line, 1)
  },

  setSelectedLines(lines: number[]) {
    if (!monaco || !selected) return
    const m = monaco
    selected.set([...new Set(lines)].map((l) => ({ range: new m.Range(l, 1, l, 1), options: { isWholeLine: true, className: 'selected-line' } })))
  },

  showError(error: RenderError | null) {
    const m = model()
    if (!monaco || !m || !errorLine) return
    const markers: Monaco.editor.IMarkerData[] = []
    if (error?.line) {
      const line = Math.min(error.line, m.getLineCount())
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: error.message,
        startLineNumber: line,
        startColumn: m.getLineFirstNonWhitespaceColumn(line) || 1,
        endLineNumber: line,
        endColumn: m.getLineMaxColumn(line),
      })
      errorLine.set([{ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: 'error-line' } }])
    } else errorLine.clear()
    monaco.editor.setModelMarkers(m, 'render', markers)
  },

  showWarnings(warnings: LayoutWarning[]) {
    const m = model()
    if (!monaco || !m) return
    const markers = warnings
      .filter((w) => w.line && w.line <= m.getLineCount())
      .map((w) => ({
        severity: monaco!.MarkerSeverity.Warning,
        message: w.message,
        startLineNumber: w.line!,
        startColumn: m.getLineFirstNonWhitespaceColumn(w.line!) || 1,
        endLineNumber: w.line!,
        endColumn: m.getLineMaxColumn(w.line!),
      }))
    monaco.editor.setModelMarkers(m, 'layout', markers)
  },

  setReadOnly(readOnly: boolean) {
    editor?.updateOptions({ readOnly, readOnlyMessage: { value: 'Claude is editing the scene right now. Wait for it to finish, or stop it.' } })
  },

  focus() {
    editor?.focus()
  },
}
