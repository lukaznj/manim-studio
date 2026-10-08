# Development

## Setup

```bash
npm install
npm run fetch-pixi        # resources/bin/pixi for this machine (sha256-checked)
npm run dev               # electron-vite dev: hot reload for the renderer
```

On first launch, the home screen installs the Python environment and LaTeX into the app's data folder (`~/Library/Application Support/Manim Studio` on macOS).

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
curl -s localhost:7357 -d 'click-text Novi projekt'
curl -s localhost:7357 -d 'quit'
```

The commands are `launch`, `ss`, `click`, `click-text`, `mouse`, `drag <sel> <dx>`, `fill`, `type`, `press`, `wait`, `gone`, `sleep`, `eval`, `main` (evaluate in the main process), `text`, `size`, `logs` and `quit`.

`DRIVE_EXECUTABLE=".../Manim Studio.app/Contents/MacOS/Manim Studio"` drives a packaged build instead.

Things that bit during development:

- Scope selectors to `dialog[open]`. Closed dialogs stay in the DOM.
- Monaco has no `Cmd+End`; click a line and type.

## Python runner by hand

```bash
ENV=~/Library/Application\ Support/Manim\ Studio/python-env/.pixi/envs/default
PYTHONPATH=python $ENV/bin/python -m studio_runner render path/to/project
```
