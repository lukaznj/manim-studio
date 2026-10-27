---
status: accepted
date: 2026-10-26
---

# 0052 — Interface size and independent chat text sizing

## Context

Explanations can be difficult to read at the default text size. Enlarging only the entire interface also takes space away from the video and lesson navigation.

## Decision

- Settings → General has Interface size (75–150%, default 100%) and Chat text size (12–24 CSS px, default 13 px). Both persist locally across projects and restarts.
- Cmd/Ctrl + plus (including the unshifted equals key) increases interface size, minus decreases it, and zero resets it to 100%. The same actions are in the macOS View menu. Shortcuts also work while composing a question.
- Interface size uses Electron's web-content zoom so layout, pointer coordinates, dialogs and accessibility remain consistent. It changes the interface's display, never exported video resolution or project contents.
- Chat size independently applies to questions, tutor explanations, the composer and their math/code in both study and editor chats. Toolbars keep their interface size. Interface zoom then scales all of them together.
- Stored numbers are bounded and invalid values use defaults. No runtime dependency is added.

## Consequences

A student can enlarge explanations while keeping the player and navigation compact, or enlarge the whole interface. At large interface sizes the study panels can be collapsed or resized as described in [[0041-focused-study-workspace]]. Existing settings keep their previous display size.
