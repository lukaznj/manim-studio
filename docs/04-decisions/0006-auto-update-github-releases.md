---
status: accepted
date: 2026-10-08
---

# 0006 — Auto-update from GitHub Releases

## Context

Users must get updates without reinstalling. The first plan kept the source private and published binaries to a separate public releases-only repo (`manim-studio-releases`), so installs wouldn't need a token. Once the source went public ([[0011-open-source-english]]), that second repo had no reason to exist.

## Decision

- **Updater.** electron-updater with the `github` provider, reading releases of the source repo, `lukaznj/manim-studio`. Public releases need no token.
- **CI.** `.github/workflows/release.yml` runs on each `v*` tag:
  1. It creates a **draft** release.
  2. macOS arm64 (dmg + zip), Windows x64 (NSIS) and Linux x64 (AppImage) build in parallel and upload into the draft.
  3. Once all three succeed, the release is published.

  Installed apps never see a release with half its files. CI uses the workflow's own `GITHUB_TOKEN`, so there's no personal access token to rotate.
- **In the app.** It checks 10 s after start and every 4 hours. The title-bar pill offers the download, then "Restart to update". Downloading is the user's choice, and the update installs on quit.
- **Unsigned macOS builds.**
  - They are ad-hoc signed. A downloaded bundle with no signature at all counts as "damaged", while an ad-hoc one only needs "Open Anyway".
  - Squirrel.Mac checks the signature, so these builds can't replace themselves. When an update is available, the pill links to the release page instead.
- **Linux** ships as an AppImage, which updates itself. A `.deb` would need a maintainer e-mail in the package.
- **Python environment.** It updates with the app ([[0003-python-env-via-pixi]]).

## Consequences

- macOS auto-update needs an Apple Developer ID certificate and notarization credentials in the repo's secrets. Without them everything else still works.
- Windows installers are unsigned, so SmartScreen warns until a code-signing certificate is added.
- Release binaries contain no secrets: every feature needs the user's own sign-in or key.
- R2 or S3 with the `generic` provider is a drop-in alternative ([[../06-operations/releasing|releasing]]).
