# Known issues

Each item below was either measured during development, or not verified because something wasn't available at the time.

## Not verified yet

- **Claude chat, signed in, end to end.**
  - Verified: the Agent SDK starts with the app's exact options, lists the built-in and `mcp__studio__*` tools, connects the in-process MCP server, and reports a failed sign-in as an error the UI handles.
  - Not exercised: a real conversation (editing `scene.py`, calling `render_preview`/`view_frames`). The dev machine's Claude Code wasn't signed in.
  - First thing to try: Prijavi se → "Napravi uvod…".
- **Windows.** Nothing has run on Windows yet:
  - TinyTeX unpacking (a 7-Zip self-extractor, run with `-y -o<dir>`)
  - the SAPI hr-HR system voice (needs the Croatian language pack)
  - paths and the NSIS installer
- **Signed, notarized macOS build and an actual auto-update.** The local package was unsigned. Release metadata (`app-update.yml`, `latest-mac.yml`) is generated correctly.
- **ElevenLabs.** The REST call and timestamp alignment are written to the documented API, but no key was available to call it.

## Measured

- **First render in a fresh environment takes about 40 s.** Python compiles manim's bytecode on first import. Later renders take 2–10 s thanks to manim's cache.
- **OmniVoice.**
  - About 1.5 GB of environment plus about 3.3 GB of model weights, downloaded once.
  - The first synthesis after starting the worker took about 12 s for 7 s of speech on Apple Silicon (MPS); the next one about 6 s.
  - Its word timings are proportional, not exact.
- **Whisper alignment.** The first run downloads the `small` model (about 480 MB, roughly 30 s).
- **Python env install.** About 10 s on a warm pixi cache. A fresh machine downloads about 750 MB.
- **LaTeX install.** About 45 s (a 67 MB download plus `tlmgr`).
- **The manim docs' TinyTeX package list includes `ms`, which TeX Live no longer has.** `tlmgr` then aborts the whole install, so the app's list follows `tex_templates.py` instead.
