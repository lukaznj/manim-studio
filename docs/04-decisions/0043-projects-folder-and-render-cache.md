---
status: accepted
date: 2026-10-24
---

# 0043 — Projects stay out of cloud sync by default; the render cache lives outside projects

## Context

Projects went to `Documents/Manim Studio`. Documents is synced by iCloud on many Macs ("Desktop & Documents Folders", offered during macOS setup) and redirected into OneDrive on most new Windows PCs (OneDrive's folder backup, on by default with a Microsoft account). Most of a project's size is its render cache (`.studio/cache`: manim's partial movies per size and encoder, typeset text and formulas), which is rebuilt when missing. So syncing uploaded gigabytes of throwaway files; "Optimize Mac Storage" could evict cache files mid-render; OneDrive's upload locks can collide with a render's writes. And after a reinstall, nothing helped a returning user find their projects again.

## Decision

- **The render cache moved out of projects**, to one folder per project (a hash of its path) in a local cache that nothing syncs: `~/Library/Caches/Manim Studio` on macOS, `%LOCALAPPDATA%\Manim Studio\Render cache` on Windows, `$XDG_CACHE_HOME/manim-studio` on Linux (`render-cache.ts`). Previews and exports pass it to the runner (`STUDIO_CACHE_DIR`). A project's old `.studio/cache` is moved there the first time, or deleted if it's on another disk.
- **The cache is limited to 20 GB**: at startup and after every export, the least recently used projects' caches go first (never the open one). Settings → Video shows its size and clears it.
- **New installs put projects in `~/Manim Studio`**, which iCloud and OneDrive don't sync. Installs from before keep their folder.
- **Onboarding asks where projects go** (after "What will you do?"): only on this computer (recommended), in Documents (saying when iCloud, OneDrive, Dropbox or Google Drive syncs it, as backup that uses cloud storage), or a folder of the user's own. A synced folder is allowed; Settings → General says when the projects folder is synced (`folders.ts` `cloudSync`).
- **Returning users:** if the old `Documents/Manim Studio` holds projects, onboarding offers it first, with what it holds ("1 video and 1 course"); "I already have a Manim Studio folder somewhere else…" picks another. Choosing a folder repairs the absolute paths its courses and exercise sets store (another user name, another disk), and Home lists everything in it, a course's own exercise set included.

## Consequences

- Moving a project, or opening it on another computer, renders it from scratch once.
- The preview video stays in `.studio/preview`, since the study screen plays it; it's one file per project.
- iCloud's "Desktop & Documents" is detected by iCloud Drive holding Documents or Desktop (`~/Library/Mobile Documents/com~apple~CloudDocs/Documents`); to be confirmed on a Mac with it on. OneDrive is detected by its environment variables and folder names.
