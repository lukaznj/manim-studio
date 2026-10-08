# Known issues

Each item below was either measured during development, or not verified because something wasn't available at the time.

## Not verified yet

- **Windows and Linux.** CI builds and tests both (typecheck, unit tests, the Python end-to-end render, packaging), but nobody has run the installed app yet. Untested by hand:
  - TinyTeX unpacking on Windows (a 7-Zip self-extractor, run with `-y -o<dir>`)
  - the Windows SAPI voice, including a language whose voice pack isn't installed
  - `espeak-ng` on Linux, and the AppImage's microphone permission for the recording booth
  - the NSIS installer and its auto-update
- **The Claude Desktop extension.**
  - Tested end to end on macOS with an MCP client that plays Claude Desktop (`scripts/desktop-smoke.mjs`): create, write, render, frames, edit, export.
  - Starting the packaged app from cold works too: the first call answered in 3.1 s.
  - Not yet installed into Claude Desktop itself and used from a real conversation.
  - Windows and Linux start Studio through `manim-studio://`, which is untested. AppImages may not register it, and then the extension asks the user to open Studio.
- **Signed, notarized macOS build and an actual auto-update.** There's no Developer ID yet, so macOS builds are ad-hoc signed. Release metadata (`app-update.yml`, `latest-mac.yml`) is generated correctly.
- **ElevenLabs.** The REST call and timestamp alignment are written to the documented API, but no key was available to call it.

## Measured

- **Claude chat, signed in with a Pro plan.** Claude edited `scene.py`, called `render_preview`, `get_timeline` and `view_frames`, and the turn was committed. A bug where parallel frame grabs collided (Claude got stale or broken images) was found this way and fixed: frames now come from one batch command into a fresh folder.

- **First render in a fresh environment takes about 40 s.** Python compiles manim's bytecode on first import. Later renders take 2–10 s thanks to manim's cache.
- **OmniVoice.**
  - About 1.5 GB of environment plus about 3.3 GB of model weights, downloaded once.
  - The first synthesis after starting the worker took about 12 s for 7 s of speech on Apple Silicon (MPS); the next one about 6 s.
  - Its word timings are proportional, not exact.
- **Whisper alignment.** The first run downloads the `small` model (about 480 MB, roughly 30 s).
- **Python env install.** About 10 s on a warm pixi cache. A fresh machine downloads about 750 MB.
- **LaTeX install.** About 45 s (a 67 MB download plus `tlmgr`).
- **The manim docs' TinyTeX package list includes `ms`, which TeX Live no longer has.** `tlmgr` then aborts the whole install, so the app's list follows `tex_templates.py` instead.
