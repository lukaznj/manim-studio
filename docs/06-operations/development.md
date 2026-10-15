# Development

## Setup

```bash
npm install
npm run fetch-pixi        # resources/bin/pixi for this machine (sha256-checked)
npm run dev               # electron-vite dev: hot reload for the renderer
```

On first launch, the home screen installs the Python environment and LaTeX into the app's data folder:

- macOS: `~/Library/Application Support/Manim Studio`
- Windows: `%APPDATA%\Manim Studio`
- Linux: `~/.config/Manim Studio`

Needs Node 24, and no Python, Homebrew or Xcode. The exception is packaging for macOS: electron-builder compiles the Icon Composer icon with `actool`, which needs Xcode 26+.

If `npm install` skipped Electron's binary (`node_modules/electron/dist` is empty), run `node node_modules/electron/install.js`.

## Checks

```bash
npm run typecheck         # main + renderer
npm test                  # node:test unit tests (src/**/*.test.ts)
npm run test:python       # renders python/tests/fixture end to end (needs pixi)
```

## Driving the app (screenshots, smoke tests)

`scripts/drive.mjs` launches the built app through Playwright and takes commands over HTTP. It uses isolated data and projects folders, so it never touches your real ones.

```bash
npm run build
node scripts/drive.mjs &                  # STUDIO_USER_DATA / STUDIO_PROJECTS_DIR / SCREENSHOT_DIR optional
curl -s localhost:7357 -d 'launch'
curl -s localhost:7357 -d 'ss home'       # → $TMPDIR/manim-studio-drive/shots/home.png
curl -s localhost:7357 -d 'click-text New project'
curl -s localhost:7357 -d 'quit'
```

The commands are `launch`, `ss`, `click`, `click-text`, `mouse`, `drag <sel> <dx>`, `fill`, `type`, `press`, `wait`, `gone`, `sleep`, `eval`, `main` (evaluate in the main process), `text`, `size`, `logs` and `quit`.

`DRIVE_EXECUTABLE=".../Manim Studio.app/Contents/MacOS/Manim Studio"` drives a packaged build instead.

Things that bit during development:

- Scope selectors to `dialog[open]`. Closed dialogs stay in the DOM.
- `STUDIO_FAKE_AGENT=1 node scripts/drive.mjs` makes a series' background agents stand-ins (`src/main/agent-fake.ts`): they write a script and a scene and render them, so a whole unattended series runs without a signed-in agent. `limit` also hits one usage limit. Honored only with `STUDIO_USER_DATA`.
- Secrets (API keys, render server tokens) are plain files in the driver's data folder (`STUDIO_PLAIN_SECRETS`, honored only with `STUDIO_USER_DATA`). Otherwise `safeStorage` would use the installed app's keychain item, macOS would ask the generic "Electron" binary for access, and the main process would block until someone answers.
- The driver leaves `prefers-color-scheme` to the app (Playwright would pin it to light). Switch themes with `eval window.studio.setSettings({appearance:'light'})`.
- Monaco has no `Cmd+End`; click a line and type.
- Screenshots for the docs go in `docs/05-design/screenshots/`, resized with `sips -Z 1600`. Never commit one that shows an account (Settings → Claude shows the e-mail).

## Memory log

`src/main/memory.ts` checks the memory of everything the app runs once a minute: its Electron processes, Claude Code and the Python jobs. On macOS it reads the physical footprint, what Activity Monitor shows. `ps`'s rss leaves out compressed memory and the GPU memory PyTorch uses on Apple Silicon. A process over 2.5 GB, or all of them together over 5 GB, appends a snapshot to `memory.log` in the app's logs folder, `~/Library/Logs/Manim Studio/` on macOS (Help → Show Logs). The snapshot lists every process with its command, the open project, and each running Python job with its last log lines. Another one is written for each further GB.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`, on macOS, Windows and Linux:

1. typecheck and unit tests
2. the Python end-to-end render
3. packaging

The installers are attached to the run for a week, which is the easiest way to try a branch on another OS.

## Claude Desktop extension

`npm run build` also builds `out/manim-studio.mcpb` (`scripts/build-mcpb.mjs`, validated by the official `mcpb` CLI). To exercise it without Claude Desktop, run `scripts/desktop-smoke.mjs` against a running app. It starts the extension over stdio, as Claude Desktop does, and makes a short video:

```bash
npm run build && node scripts/drive.mjs &        # the driver's isolated app
curl -s localhost:7357 -d launch
STUDIO_USER_DATA=$TMPDIR/manim-studio-drive/data node scripts/desktop-smoke.mjs
```

Without `STUDIO_USER_DATA`, the extension looks for the real app and starts the installed one.

Only one copy of the app runs per data folder. Quit an installed Manim Studio before `npm run dev`, or the dev copy brings the installed one forward and exits.

## Python runner by hand

```bash
ENV=~/Library/Application\ Support/Manim\ Studio/python-env/.pixi/envs/default
PYTHONPATH=python $ENV/bin/python -m studio_runner render path/to/project
```
