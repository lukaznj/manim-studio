// Real Electron/MCP browser capture and encoding in a disposable project; no provider calls.
// STUDIO_USER_DATA=<driver profile> STUDIO_MOTION_PROJECT=<fixture> STUDIO_MOTION_HTML=<html> DRIVE_PORT=<port> node scripts/motion-smoke.mjs
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const data = process.env.STUDIO_USER_DATA, project = process.env.STUDIO_MOTION_PROJECT, htmlFile = process.env.STUDIO_MOTION_HTML ?? resolve('scripts/fixtures/motion.html')
assert(data && project, 'Supply an isolated driver profile and fixture project.')
const command = async (body) => {
  const response = await fetch(`http://127.0.0.1:${process.env.DRIVE_PORT ?? 7357}`, { method: 'POST', body })
  const text = await response.text()
  if (/^(ERROR:|Error:|NOT_FOUND)/.test(text)) throw Error(text)
  return text
}
await command('launch')
assert.equal(JSON.parse(await command("main app.getPath('userData')")), resolve(data))
const endpoint = JSON.parse(readFileSync(join(data, 'mcp-endpoint.json'), 'utf8'))
const call = async (name, args) => {
  const response = await fetch(`http://127.0.0.1:${endpoint.port}/tools/${name}`, { method: 'POST', headers: { authorization: `Bearer ${endpoint.token}`, 'content-type': 'application/json', 'x-studio-project': encodeURIComponent(resolve(project)) }, body: JSON.stringify(args) })
  assert(response.ok)
  return response.json()
}
const describe = (result) => result.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
const assertOk = (result) => { assert(!result.isError, describe(result)); return result }
const open = await fetch(`http://127.0.0.1:${endpoint.port}/tools/open_project`, { method: 'POST', headers: { authorization: `Bearer ${endpoint.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ project: resolve(project) }) })
assertOk(await open.json())
for (const internal of [false, true]) {
  const env = { ...process.env }
  if (internal) env.STUDIO_PROJECT = resolve(project)
  else delete env.STUDIO_PROJECT
  const client = new Client({ name: 'motion-smoke', version: '1' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('out/mcpb/server/index.js')], env }))
  try { assert((await client.listTools()).tools.some((tool) => tool.name === 'render_motion'), `Motion is missing from ${internal ? 'internal Codex/Antigravity' : 'external desktop'} tools`) }
  finally { await client.close() }
}
const poll = async (name, finished) => {
  for (let i = 0; i < 150; i++) {
    const result = assertOk(await call('render_motion', { name, mode: 'status' }))
    if (finished(describe(result))) return result
    await new Promise((r) => setTimeout(r, 500))
  }
  throw Error('Motion did not finish.')
}
const clipName = `gear-train-${Date.now().toString(36)}`
const html = readFileSync(htmlFile, 'utf8')
const started = Date.now()
let preview = assertOk(await call('render_motion', { name: clipName, html, seconds: 5 }))
if (!describe(preview).includes('Preview ready')) preview = await poll(clipName, (s) => s.includes('Preview ready'))
const images = preview.content.filter((part) => part.type === 'image')
assert.equal(images.length, 3)
assert.equal(new Set(images.map((image) => createHash('sha256').update(image.data).digest('hex'))).size, 3, 'The animation must change at all three sampled times')
images.forEach((image, i) => writeFileSync(join(data, `motion-preview-${i}.png`), Buffer.from(image.data, 'base64')))
const previewMs = Date.now() - started
assertOk(await call('render_motion', { name: clipName, mode: 'render' }))
const complete = await poll(clipName, (s) => s.includes('Motion ready'))
const name = describe(complete).match(/VideoClip\("([^"]+)"\)/)?.[1]
assert(name && existsSync(join(project, 'media', name)))
const before = readFileSync(join(project, 'media', name))
const cached = assertOk(await call('render_motion', { name: clipName, html, seconds: 5 }))
assert.match(describe(cached), /cached/)
assert.equal(Buffer.compare(before, readFileSync(join(project, 'media', name))), 0)
const encodeMs = Date.now() - started - previewMs
// Deleted derived media can be rebuilt from saved source in the same app session.
renameSync(join(project, 'media', name), join(data, `${clipName}-previous.mp4`))
assertOk(await call('render_motion', { name: clipName, mode: 'render' }))
await poll(clipName, (s) => s.includes('Motion ready'))
assert(existsSync(join(project, 'media', name)))

// No Node or Studio API, no network or file access, no popups or navigation.
let requests = 0
const server = createServer((_req, response) => { requests++; response.end('should never reach this server') })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
try {
  const target = `http://127.0.0.1:${server.address().port}`
  const hostile = `<html><script>if(typeof require!=='undefined'||window.studio)throw Error('Host API exposed');const blocked=Promise.all([fetch('${target}/fetch').then(()=>true,()=>false),fetch('file:///etc/hosts').then(()=>true,()=>false)]);new Image().src='${target}/image';window.open('${target}/popup');window.renderFrame=async t=>{if((await blocked).some(Boolean))throw Error('Network or file read succeeded');document.body.style.background=t?'red':'blue'};</script></html>`
  let result = assertOk(await call('render_motion', { name: 'isolation', html: hostile, seconds: 0.5 }))
  if (!describe(result).includes('Preview ready')) result = await poll('isolation', (s) => s.includes('Preview ready'))
  assert.equal(requests, 0, 'Untrusted source contacted the network')
  assert.equal(JSON.parse(await command('main BrowserWindow.getAllWindows().length')), 1, 'Hidden renderer/popup leaked')
} finally { server.close() }
for (const args of [{ name: '../escape', html, seconds: 1 }, { name: 'too-long', html, seconds: 13 }, { name: 'unpreviewed', mode: 'render' }, { name: 'broken', html: '<html>missing renderFrame</html>', seconds: 1 }, { name: 'busy-loop', html: '<script>window.renderFrame=()=>{while(true){}}</script>', seconds: 0.5 }])
  assert((await call('render_motion', args)).isError, `Bad source was accepted: ${args.name}`)
assert.equal(JSON.parse(await command('main BrowserWindow.getAllWindows().length')), 1, 'Failed renderer leaked')
assert((await call('render_motion', { name: clipName, html: '<html>Broken revision</html>', seconds: 1 })).isError)
assert.equal(Buffer.compare(before, readFileSync(join(project, 'media', name))), 0, 'Failed work changed an existing clip')
assert.match(describe(assertOk(await call('render_motion', { name: clipName, html, seconds: 5 }))), /cached/)
writeFileSync(join(data, 'motion-result.json'), JSON.stringify({ name, previewMs, encodeMs, bytes: before.length }, null, 2))
console.log(`Passed: real three-frame preview (${previewMs}ms), 1080p clip (${encodeMs}ms), cache reuse, desktop/Codex/Antigravity tool discovery, isolated session, blocked network/files/popups, validation, missing-function and hung-frame recovery. Media: ${name}`)
