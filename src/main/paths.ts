import { app } from 'electron'
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
  defaultProjectsDir: () => process.env.STUDIO_PROJECTS_DIR ?? join(app.getPath('documents'), 'Manim Studio'),

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
