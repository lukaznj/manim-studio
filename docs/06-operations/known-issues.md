# Known issues

Each item below was either measured during development, or not verified because something wasn't available at the time.

## Not verified yet

- **Windows and Linux.** CI builds and tests both (typecheck, unit tests, the Python end-to-end render, packaging), but nobody has run the installed app yet. Untested by hand:
  - TinyTeX unpacking on Windows (a 7-Zip self-extractor, run with `-y -o<dir>`)
  - the Windows SAPI voice, including a language whose voice pack isn't installed
  - `espeak-ng` on Linux, and the AppImage's microphone permission for the recording booth
  - the NSIS installer and its auto-update
- **Dubbed languages can drift.** A translation much longer than the original is sped up at most 1.6× and then pushes the next sentence back. The export lists each sentence that ends up more than 0.5 s behind its picture.
- **Other-language voices on Windows and Linux.** The system voice needs that language installed: a Windows language pack, or an espeak-ng voice. ElevenLabs and OmniVoice don't.
- **macOS asks for keychain access after some updates.** Unsigned (ad-hoc signed) builds change their code identity with every build, so the first launch after an update may ask to use "Manim Studio Safe Storage", where the saved API keys are. Choose Always Allow. A Developer ID signature removes this.
- **Plan usage relies on an experimental SDK call.** `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` may be renamed in a future Agent SDK. The meter then disappears, nothing breaks. Check it after updating the SDK.
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
