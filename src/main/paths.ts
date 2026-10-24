import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Where things live in dev (repo checkout) vs. a packaged app (Contents/Resources).
const resources = () => (app.isPackaged ? process.resourcesPath : app.getAppPath())

export const paths = {
  /** python/ — the studio + studio_runner packages and the pixi manifest. */
  python: () => join(resources(), 'python'),
  templates: () => join(resources(), 'templates'),
  userData: () => app.getPath('userData'),
  /** The managed Python environment (pixi.toml + .pixi/ copied from python/). */
  env: () => join(app.getPath('userData'), 'python-env'),
  tinytex: () => join(app.getPath('userData'), 'tinytex'),
  settingsFile: () => join(app.getPath('userData'), 'settings.json'),
  /** New installs: a folder in the home folder, which iCloud and OneDrive don't sync (ADR 0043). */
  defaultProjectsDir: () => process.env.STUDIO_PROJECTS_DIR ?? join(homedir(), 'Manim Studio'),
  /** Where projects went before 0.11: Documents, which iCloud and OneDrive often sync. */
  legacyProjectsDir: () => join(app.getPath('documents'), 'Manim Studio'),
  /**
   * The render cache (manim's partial movies, typeset text and formulas), one folder per project.
   * Big and rebuilt when needed, so it lives where nothing syncs or backs it up: ~/Library/Caches
   * on macOS, %LOCALAPPDATA% on Windows (not the roaming profile), XDG_CACHE_HOME on Linux.
   */
  renderCache(): string {
    if (process.env.STUDIO_USER_DATA) return join(process.env.STUDIO_USER_DATA, 'render-cache') // the test driver's own folder
    if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'Manim Studio')
    if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Manim Studio', 'Render cache')
    return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'manim-studio')
  },

  /** Bundled pixi (extraResources bin/; in dev, resources/bin/ from `npm run fetch-pixi`).
   *  Never one from PATH: an older pixi can't read our lock file. */
  pixi(): string {
    const exe = process.platform === 'win32' ? 'pixi.exe' : 'pixi'
    return app.isPackaged ? join(process.resourcesPath, 'bin', exe) : join(app.getAppPath(), 'resources', 'bin', exe)
  },

  /** The Claude Desktop extension (built by scripts/build-mcpb.mjs; extraResources in a package). */
  mcpb: () => (app.isPackaged ? join(process.resourcesPath, 'manim-studio.mcpb') : join(app.getAppPath(), 'out', 'manim-studio.mcpb')),
  desktopPlugin: () => (app.isPackaged ? join(process.resourcesPath, 'manim-studio-plugin.zip') : join(app.getAppPath(), 'out', 'manim-studio-plugin.zip')),

  /** The stdio MCP bridge to the app's local endpoint (mcpb/server.ts), which Codex runs for Studio's tools. */
  mcpBridge: () => (app.isPackaged ? join(process.resourcesPath, 'mcp-bridge.js') : join(app.getAppPath(), 'out', 'mcpb', 'server', 'index.js')),

  /** The Claude Code binary shipped inside the Agent SDK's platform package. */
  claude(): string {
    const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
    const exe = process.platform === 'win32' ? 'claude.exe' : 'claude'
    const base = app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', pkg) : join(app.getAppPath(), 'node_modules', pkg)
    return join(base, exe)
  },
}
