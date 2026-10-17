// Read-only MCP smoke check against an isolated running Studio profile.
// STUDIO_USER_DATA=<driver data> node scripts/mcp-protocol-smoke.mjs
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

if (!process.env.STUDIO_USER_DATA) throw new Error('Set STUDIO_USER_DATA to an isolated running test profile.')
// Fail before connecting the bridge, which would otherwise launch the installed app.
const endpoint = JSON.parse(readFileSync(join(process.env.STUDIO_USER_DATA, 'mcp-endpoint.json'), 'utf8'))
const health = await fetch(`http://127.0.0.1:${endpoint.port}/health`, { headers: { authorization: `Bearer ${endpoint.token}` } })
assert(health.ok, 'Launch the isolated test app before running this check.')
const bridge = resolve('out/mcpb/server/index.js')
const connect = async (internal = false) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined))
  if (internal) env.STUDIO_PROJECT = 'test-project'
  else delete env.STUDIO_PROJECT
  const transport = new StdioClientTransport({ command: process.execPath, args: [bridge], env })
  const client = new Client({ name: 'studio-protocol-smoke', version: '1.0.0' })
  await client.connect(transport)
  return client
}
const external = await connect()
try {
  const { tools } = await external.listTools()
  assert(tools.some((tool) => tool.name === 'create_video'))
  assert(tools.some((tool) => tool.name === 'get_video'))
  const { resourceTemplates } = await external.listResourceTemplates()
  assert(resourceTemplates.some((resource) => resource.uriTemplate === 'studio-video://{job}/{index}'))
  const result = await external.callTool({ name: 'get_video', arguments: { job: 'missing' } })
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /Unknown video job/)
  await assert.rejects(external.readResource({ uri: 'studio-video://missing/0' }), /unavailable/)
  const unauthorized = await fetch(`http://127.0.0.1:${endpoint.port}/video/missing/0`)
  assert.equal(unauthorized.status, 401)
  console.log('External tools, resource discovery, missing-job errors and endpoint authentication passed.')
} finally {
  await external.close()
}
const internal = await connect(true)
try {
  const { tools } = await internal.listTools()
  assert(tools.some((tool) => tool.name === 'render_preview'))
  assert(!tools.some((tool) => tool.name === 'create_video' || tool.name === 'get_video' || tool.name === 'create_project'))
  console.log('Internal authoring bridge cannot recursively start desktop video jobs.')
} finally {
  await internal.close()
}
