---
status: accepted
date: 2026-10-14
---

# 0018 — Quick mode: describe it, attach PDFs, get the exported video

## Context

Making a video in the editor means steering Claude turn by turn. Often you just want the video: a description, maybe the lecture notes it should follow, and the finished mp4. Series mode ([[../01-product/roadmap|roadmap]]) needs the same thing, many times over.

## Decision

- **Quick video** (Home, File → Quick Video…, ⇧⌘N) asks for a description, optional PDFs, format, language, tone, theme and whether to export both themes. The voice is Settings → Voice's default; the dialog warns when that would leave the narration silent.
- **`src/main/quick.ts` runs it:** it creates the project (script first on), opens it, adds the PDFs as sources, and sends Claude the request on **autopilot**: the brief says nobody is watching, so Claude approves its own script ([[0016-script-first]]), never stops to ask, and finishes with a clean render.
- **Studio checks for itself.** After Claude's turn it renders, and sends Claude back with the error or the layout warnings, up to three times. Warnings left after that are reported; an error that remains fails the run. Then it queues the export ([[0017-background-export-queue]]).
- **The window shows progress instead of the editor** (`QuickView.tsx`): the steps, what Claude is doing, the latest preview, Stop, and when it's done, the files. The editor is a click away and the chat holds the whole conversation, so a quick video can be fixed by hand like any other.
- One quick run at a time. It uses the open project's chat, so it runs in the foreground; the export then runs in the background like any other.

## Consequences

- Needs a signed-in Claude and an installed environment; it says so up front instead of failing halfway.
- The quality bar is Claude's self-review plus Studio's checks (errors, layout warnings). Nobody looks at the video before it's exported, which is the point.
