---
status: accepted
date: 2026-10-08
---

# 0001 — Desktop app on Electron

## Context

Rendering manim needs Python, cairo/pango, LaTeX and minutes of CPU per video, so a web app would need a render farm. The admins work on their own laptops. Claude's agent loop (the Agent SDK) runs the Claude Code binary as a local process.

## Decision

A desktop app built on Electron, with electron-vite (main, preload and renderer), React and TypeScript. That is the same React + Vite stack as the maturita admin. The renderer is sandboxed with context isolation, and everything privileged goes through a typed preload bridge (`StudioApi`).

## Consequences

- Rendering, voice and Claude all run locally, so there is no server to operate.
- Every OS needs its own build, and auto-update needs code signing on macOS ([[0006-auto-update-github-releases]]).
- Tauri would make a smaller app, but the Agent SDK is a Node library and Electron's main process is Node, so Electron is the direct fit.
