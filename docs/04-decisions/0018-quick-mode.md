---
status: accepted
date: 2026-10-14
---

# 0018 — Quick mode: describe it, attach PDFs, get the exported video

## Context

Making a video in the editor means steering Claude turn by turn. Often you just want the video: a description, maybe the lecture notes it should follow, and the finished mp4. Series mode ([[../01-product/roadmap|roadmap]]) needs the same thing, many times over.

## Decision

- **Quick video** uses the current creation model, narration, aspect, tone and output defaults from Settings. Its brief and optional PDFs are the main inputs. It exports only the configured video theme; the creation dialog has no light-and-dark variant option. Render-server selection is available when servers are configured.
- **`src/main/quick.ts` runs a project-bound background agent**, shared with series production. Script approval and video implementation are separate turns; Studio independently renders, repairs and exports. All three providers, ordered fallback and returning to a higher-priority available model apply. Its conversation is saved in the project.
- **Navigation never owns the job.** The initial progress page opens once; users can go to the library, study other lessons, work in another project or plan a course. A persistent title-bar button returns to the quick job. Background edits do not trigger a second automatic preview render in the open editor.
- **Independent concurrent quick jobs**, each with its own checkpoint and controls, alongside any series ([[0058-independent-production-jobs]]). Work and export remain bound to their project even when another project is open. The production page offers Stop, Continue, completed files and Watch; editing is available after stopping or completing production.
- **Checkpoint each transition atomically** with the request and copied-source state. Stop cancels the agent, preview and queued export. After restart an interrupted job is stopped, never silently spending usage. Continue keeps its project and approved script, resumes checking/export at their saved stages and recognizes a completed export receipt. Quit waits for quick work to settle. Initial project creation is a protected transaction.
- **Progress is shared with course production** (see [[0057-creation-progress-and-research]]), using section estimates for writing and actual renderer/export counters when available.

## Consequences

Quick videos use the same agent routing and shutdown protections as other production work. Files and conversations stay editable afterward. Forced termination may repeat the unfinished turn or export, while completed stages and source copies survive.
