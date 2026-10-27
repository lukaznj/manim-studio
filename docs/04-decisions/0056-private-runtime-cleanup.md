---
status: accepted
date: 2026-10-27
---

# 0056 — Remove private runtimes without deleting user work

## Context

Studio installs its Python environments, TinyTeX and optional managed agent CLIs outside its application bundle. Removing the application alone can leave gigabytes of downloaded tools. Deleting the entire application-data folder would also erase sign-ins, preferences and playback history, and risks deleting projects placed there by the user.

## Decision

- Keep runtimes as app-managed downloads rather than inflating every application update. New Pixi package downloads use `userData/runtime-cache/pixi`; speech model downloads use `userData/models/huggingface/{hub,xet,assets}` and `userData/models/torch`. Python receives these cache settings before importing model libraries. Legacy shared Pixi/Hugging Face caches, system Conda and system LaTeX remain untouched. An existing speech model in a shared cache may need downloading once into private storage.
- Settings → Environment offers **Remove downloaded tools…**, with a native confirmation listing the actual folders and their total size. This removes the private Python environments, TinyTeX, downloaded CLI version directories, private model/package caches and dedicated render cache. Reinstallation remains available through the normal environment controls.
- Packaged macOS and AppImage installs also offer **Uninstall Manim Studio…**. After the same confirmation and cleanup, the app moves only its own application bundle or AppImage to the Trash and quits. The macOS application menu exposes the same action. Development checkouts cannot remove themselves. Windows uses its installed NSIS uninstaller so shortcut/registry removal remains with the installer.
- A Windows `customUnInstall` hook runs the same bundled cleanup implementation before removing application files. Its `${isUpdated}` guard skips runtime cleanup during upgrades. `deleteAppDataOnUninstall` stays false. This hook is active once a version shipping this uninstaller has been installed.
- Cleanup uses a fixed main-process allowlist, never paths supplied by the renderer. Managed CLI `home` and `projects` directories, tokens, encrypted keys, settings, browser storage, conversations, PDFs, recordings, videos and exports are preserved. Unknown folders and shared caches are not candidates. Symlink candidates/ancestors are kept; traversal never follows links. Known project destinations or a discovered project/series/exercise manifest protect their enclosing candidate. Candidates are renamed to temporary siblings and scanned again before deletion; failures restore their original location when possible and are reported.
- Active production, renders, tutor requests, sign-in, Python jobs and installers prevent removal. Idle speech workers stop first. Maintenance blocks new IPC operations, Python launches and installs; critical-work tracking makes quit wait for deletion. A second preflight after confirmation catches work started while the dialog was open. Automatic updates never invoke cleanup.

## Consequences

The supported uninstall flow removes Studio’s private tools without removing user work or shared dependencies. Dragging the macOS application to the Trash directly cannot invoke this flow; use the application’s uninstall action first. No persistent watcher, login item or background uninstaller is installed. Retained project-containing folders and deletion failures are shown explicitly.

This extends [[0003-python-env-via-pixi]] and [[0043-projects-folder-and-render-cache]].
