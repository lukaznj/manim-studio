// Builds the Claude Desktop extension: mcpb/server.ts bundled with its dependencies, a manifest
// generated from the shared tool definitions, packed (and validated) by the official mcpb CLI
// into out/manim-studio.mcpb, which electron-builder ships in Resources. Part of `npm run build`.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { desktopTools } from '../src/shared/studio-tools.ts'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const dir = join(root, 'out', 'mcpb')
rmSync(dir, { recursive: true, force: true })
mkdirSync(join(dir, 'server'), { recursive: true })

await build({
  entryPoints: [join(root, 'mcpb', 'server.ts')],
  outfile: join(dir, 'server', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  define: { VERSION: JSON.stringify(pkg.version) },
  legalComments: 'none',
  logLevel: 'warning',
})
copyFileSync(join(root, 'build', 'icon-512.png'), join(dir, 'icon.png')) // Claude Desktop's recommended size

const manifest = {
  manifest_version: '0.3',
  name: 'manim-studio',
  display_name: 'Manim Studio',
  version: pkg.version,
  description: 'Make maths explainer videos: Claude writes the manim scene, Manim Studio renders it with narration, subtitles and a timeline.',
  long_description:
    'Ask Claude for a maths video and Manim Studio opens and does the work: Claude creates a project, writes the scene, renders it and looks at the frames until it is right. You watch it happen in the app, then retime clips, record your own narration and export a 1080p mp4 with subtitles. Needs the Manim Studio app.',
  author: { name: pkg.author },
  license: pkg.license,
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'server/index.js',
    mcp_config: { command: 'node', args: ['${__dirname}/server/index.js'], env: {} },
  },
  tools: Object.entries(desktopTools).map(([name, t]) => ({ name, description: t.description })),
  keywords: ['manim', 'maths', 'video', 'education', 'animation'],
  compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: '>=18.0.0' } },
}
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))

const cli = join(root, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js')
execFileSync(process.execPath, [cli, 'pack', dir, join(root, 'out', 'manim-studio.mcpb')], { stdio: 'inherit' })
