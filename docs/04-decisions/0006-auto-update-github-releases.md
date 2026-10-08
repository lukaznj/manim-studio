---
status: accepted
date: 2026-10-08
---

# 0006 — Auto-update from a public releases repo

## Context

The lead dev will keep iterating, and colleagues must get updates without reinstalling. The source repo is private, like maturita's, and a private GitHub Releases feed would need a token embedded in every install.

## Decision

- **Updater.** electron-updater with the `github` provider, pointed at a *public* releases-only repo, `lukaznj/manim-studio-releases`. The source repo stays private.
- **CI.** `.github/workflows/release.yml` builds on each `v*` tag: macOS arm64 is signed and notarized, Windows x64 is unsigned NSIS. CI publishes with a `RELEASES_TOKEN`; installed apps need no token.
- **In the app.** It checks 10 s after start and every 4 hours. The title-bar pill offers the download, then "restart to update". Downloading is the user's choice and installs on quit.
- **Unsigned macOS builds.** They can't replace themselves (Squirrel.Mac checks the signature). For those, a found update offers the manual download page instead.
- **Python environment.** It updates with the app ([[0003-python-env-via-pixi]]).

## Consequences

- macOS auto-update needs an Apple Developer ID certificate and notarization credentials in CI secrets (the maturita iOS work already has a developer account).
- Release binaries are public. They contain no secrets: every feature needs the user's own sign-in or key.
- R2 with the `generic` provider is a drop-in alternative if public binaries become a concern ([[../06-operations/releasing|releasing]]).
