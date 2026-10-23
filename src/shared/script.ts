// Script first (ADR 0016): Claude plans the video in script.md, the user approves it, then the code
// follows it. Shared by the main process (Claude's brief) and the renderer (the Script tab).

export const SCRIPT_FILE = 'script.md'
export type ScriptStatus = 'draft' | 'approved'

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function scriptStatus(text: string): ScriptStatus {
  return /^status:\s*approved\s*$/m.test(text.match(FRONT)?.[1] ?? '') ? 'approved' : 'draft'
}

/** The script with its status set, adding the front matter if it has none. */
export function withScriptStatus(text: string, status: ScriptStatus): string {
  const front = text.match(FRONT)
  if (!front) return `---\nstatus: ${status}\n---\n\n${text}`
  const body = /^status:.*$/m.test(front[1]) ? front[1].replace(/^status:.*$/m, `status: ${status}`) : `${front[1]}\nstatus: ${status}`
  return text.replace(FRONT, `---\n${body}\n---\n`)
}

/** The script without its front matter, for showing it. */
export const scriptBody = (text: string): string => text.replace(FRONT, '')

const FORMAT = `script.md looks like this (section names become the scene's self.next_section names):

---
status: draft
---
# The video's title

**The idea:** the one thing the viewer should leave with, in a sentence.
**For:** who it's for, and what they already know.
**Length:** about N minutes.

## Section name
**Goal:** what this section does for the viewer.
**Narration:**
> Every sentence, exactly as it will be spoken.
**On screen:** what appears, where, and how it moves, in order.
**Source:** notes.pdf p. 4 (when it follows a source)`

const CRAFT = `What makes a great explainer (think 3Blue1Brown): one central idea; a question or a concrete example before the definition; intuition built visually before the formula; every visual carries part of the explanation; the same colour and shape always mean the same thing; a short recap that ties back to the opening question.`

/**
 * Claude's instructions for the script. `auto`: quick and series mode, where Claude approves its own
 * script and goes straight on (the user reviews the finished video instead). `desktop`: Claude
 * Desktop, which writes files only through Studio's tools.
 */
export function scriptBrief(opts: { auto?: boolean; desktop?: boolean } = {}): string {
  const { auto = false, desktop = false } = opts
  const approval = auto
    ? '2. Review it yourself as a demanding teacher would, improve it, then set its status to approved and go straight on.'
    : `2. Then stop: tell the user the script is ready in the Script tab${desktop ? ' of Manim Studio' : ''}, in two or three sentences, and wait. They approve it there (its status becomes approved${desktop ? '; get_script shows it' : ''}) or ask for changes.`
  return [
    'Always plan the video in words before writing code:',
    `1. Write script.md ${desktop ? 'with write_script' : 'in the project folder'} from the request and the sources. Leave scene.py alone for now.`,
    approval,
    '3. Once it is approved, write scene.py from it: one self.next_section per script section, with the same name; the narration word for word; the visuals as described. Render and check as usual.',
    '4. Later: a change to the narration or the structure goes into script.md first (and back to the user for approval); a purely visual fix can go straight into the code.',
    CRAFT,
    FORMAT,
  ].join('\n')
}
