---
status: accepted
date: 2026-10-14
---

# 0021 — Render servers: exports rendered by a worker on another machine

## Context

An export keeps a computer busy for minutes. With a home server around, a friend making videos on a laptop should be able to send the export there and keep working; how long it takes matters less than the laptop staying free. Anyone else with a spare machine should be able to do the same without our help.

## Decision

- **The worker** (`python/studio_worker`) is a small HTTP server, standard library only, that runs the same `studio_runner` as the app: slices in parallel ([[0020-parallel-exports]]), the final render, `studio_runner export`. It lives in this repository, so it always matches the app's version. **The renderer repository** (`lukaznj/manim-studio-renderer`) holds its Dockerfile, which builds it from a tagged release with TeX Live, plus a compose file and the documentation.
- **Pairing code.** On start the worker prints `msw1.` + base64url of `{"url", "token"}`. Settings → General → Render servers takes it, checks the worker answers, and keeps the token like the API keys (`safeStorage`). Every request carries the token; the worker compares it in constant time.
- **A job** is the export's copy of the project, packed as a tar.gz (`tar`, which macOS, Linux and Windows 10+ ship), plus its choices. The worker unpacks it with `tarfile`'s `data` filter (no paths outside the job, no links out, no devices), renders each theme, and keeps the files until the app downloads them and deletes the job. Unfetched jobs go after a day. A per-project cache on the worker reuses unchanged animations between exports.
- **Narration stays on your computer.** Before packing, the app runs a voice-only render (`--voice-only`: every animation skipped, nothing written), which makes any missing narration with your keys. The worker never generates narration (`STUDIO_VOICE_OFFLINE`) and has no keys; cached narration no longer needs a key to be found, and OmniVoice's is keyed by its reference's place in the project. Translation and dubbing of extra languages happen on your computer after the download.
- **The export dialog, quick mode and series mode** offer "Render on: this computer / a server" once one is paired. The queue runs one export at a time per machine, so a server export doesn't wait for a local one.
- **Networking is the user's choice:** the worker listens on a port; bind it to a private address (a Tailscale address, a LAN) and share it, or put it behind a tunnel. Recommended for friends: Tailscale, sharing the server node.

## Consequences

- Anyone with a server's token can run a scene's Python code inside its container. The README says so: share the code only with people you trust, and don't expose the port to the internet without a tunnel that adds its own login.
- The worker image must match the app's version (the narration cache keys and the runner's options move with it); `/info` reports its version and Settings shows it.
- Rendering on a slow server can take longer than on the laptop; it's still off the laptop.
