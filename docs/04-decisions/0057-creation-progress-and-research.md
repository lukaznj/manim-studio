---
status: accepted
date: 2026-10-29
---

# 0057 — Visible creation progress and web research

## Context

Quick video still used the foreground chat, and course production showed percentages only during export. Users could not tell whether a script or its implementation was progressing. Research capabilities differed by provider. Series planning trapped navigation in a modal despite already running asynchronously.

## Decision

- Use one connected-circle production stepper for quick videos, course episodes and additional videos. Each circle is a percentage dial, with the current step highlighted. Show script, scene implementation, checking and export independently. Do not infer writing completion from time elapsed, token count or source-line count.
- Every writing agent receives `report_progress` through the existing scene-tool boundary. It reports saved completed sections and the total planned sections. These are labelled **Estimated**, capped at 99% until the coordinator finishes the turn. Store checkpoints under `.studio/production-progress.json`. Where reports are absent, derive a conservative fallback from script section bodies and matching `self.next_section` names; an outline with `[pending]` sections is not complete. Unknown totals remain indeterminate. Revised phases reopen and invalidate later completion.
- Preview rendering uses its previous known clip count, when available; a changed or first render may have no reliable denominator. Export keeps separate rendering and assembly percentages. Completing a writing stage is not a quality approval; Studio still renders, repairs and inspects the result.
- Creation agents may research public web material. Claude keeps WebSearch/WebFetch; Codex explicitly enables hosted live search while command networking remains disabled; Antigravity permits `read_url(*)` while leaving shell execution and browser actuation unapproved. Existing project file boundaries remain. Web pages are untrusted evidence, user PDFs take precedence where appropriate, and queries must not contain private document contents or credentials. Cite useful URLs in the script; report unavailable research instead of inventing it.
- Series planning can be dismissed without cancellation. Its mounted controller preserves progress and the eventual plan; a title-bar button reopens it, and a ready notification invites review without stealing focus. Stop planning is separate. Starting the actual series remains a short guarded operation. Existing draft persistence survives application restart.

## Consequences

Authoring percentages communicate section coverage, not exact code completion, quality or time remaining. Agent estimates may change when the outline changes. No additional runtime dependency or external search account is required. Provider outages and account/organization restrictions can still prevent research.

References: [Codex web search](https://learn.chatgpt.com/docs/web-search), [Antigravity permissions](https://antigravity.google/docs/permissions/).
