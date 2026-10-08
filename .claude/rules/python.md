---
paths:
  - "python/**/*.py"
  - "python/pixi.toml"
  - "templates/project/**"
---

# Python runner and studio package

- **manim imports.** Only `studio_runner` and `studio` import manim. The app never parses manim's own output; it reads `@studio `-prefixed JSON events from `studio_runner/events.py:emit`. Add an event type there before using it from TypeScript.
- **Config before import.** `render.configure()` must run before `studio` is imported: the frame constants (`PORTRAIT`, `SAFE_W`, …) are computed at import time.
- **Monkeypatches** live in `render.Recorder` and nowhere else. Keep them thin: record, then call the original.
- **Edit spans.** Columns are characters, not UTF-8 bytes (`source._chars`). Croatian letters earlier on a line must not shift edits.
- **Voice providers** must degrade to silence with a message in `voice.WARNINGS`, never raise out of a render.
- **Changing `pixi.toml`:**
  - Run `resources/bin/pixi lock` in `python/` and commit `pixi.lock`; installs use `--frozen`.
  - Torch features must exclude `osx-64`.
- **Template changes.** `templates/project/scene.py` must render warning-free in both 16:9 and 9:16. Check with the runner before committing.
- **Test.** `npm run test:python`.
