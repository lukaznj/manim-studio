// Plays Claude Desktop: starts the built extension (out/mcpb) over stdio, as Claude Desktop does,
// and makes a short video through it. Run it against a running app, e.g. the driver's:
//   npm run build && node scripts/drive.mjs &   curl -s localhost:7357 -d launch
//   STUDIO_USER_DATA=<the driver's data folder> node scripts/desktop-smoke.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { resolve } from 'node:path'

const server = resolve(import.meta.dirname, '..', 'out', 'mcpb', 'server', 'index.js')
const client = new Client({ name: 'desktop-smoke', version: '1' })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], env: process.env }))

const show = (name, r) => {
  const parts = r.content.map((c) => (c.type === 'text' ? c.text : `[${c.type} ${c.mimeType}, ${Math.round(c.data.length * 0.75 / 1024)} kB]`))
  console.log(`\n## ${name}${r.isError ? ' (error)' : ''}\n${parts.join('\n').slice(0, 900)}`)
  return r
}
const call = async (name, args = {}) => show(name, await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 }))

console.log('instructions:', client.getInstructions()?.slice(0, 120), '…')
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '))

await call('list_projects')
await call('create_project', { title: `Pythagoras smoke ${Date.now() % 10000}`, format: '16:9', language: 'en' })
await call('write_scene', {
  source: `from manim import *
from studio import *


class Video(StudioScene):
    def construct(self):
        self.next_section("Intro")
        title = Text("Pythagoras", weight=BOLD, color=TEXT).scale(1.1)
        with self.voiceover("In a right triangle, a squared plus b squared equals c squared."):
            self.play(Write(title), run_time=1.5)
            formula = MathTex("a^2 + b^2 = c^2", color=ACCENT).next_to(title, DOWN, buff=0.6)
            self.play(FadeIn(formula), run_time=1.0)
        self.wait(0.5)
`,
})
await call('render_preview')
await call('view_frames', { times: [1, 2.5] })
await call('edit_scene', { old_text: 'run_time=1.0', new_text: 'run_time=1.4' })
await call('render_preview')
await call('get_timeline')
await call('edit_scene', { old_text: 'not in the file', new_text: 'x' })
await client.close()
