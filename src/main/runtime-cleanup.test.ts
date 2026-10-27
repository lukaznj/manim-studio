import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupRuntimes, runtimeCacheEnv, uninstallTarget } from './runtime-cleanup.ts'

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = await mkdtemp(join(tmpdir(), 'studio-cleanup-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const userData = join(base, 'data'), renderCache = join(base, 'cache')
  await mkdir(userData)
  const file = async (path: string, text = 'keep') => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, text) }
  const exists = async (path: string) => !!await lstat(path).catch(() => null)
  return { base, roots: { userData, renderCache }, file, exists }
}

test('cleanup removes only private downloads and render cache, preserving projects, conversations and sign-ins', async (t) => {
  const f = await fixture(t), root = f.roots.userData
  const removable = ['python-env/.pixi/envs/default/python', 'tinytex/bin/latex', 'runtime-cache/pixi/package', 'models/huggingface/hub/weights', 'models/huggingface/xet/chunks', 'models/huggingface/assets/index', 'models/torch/weights', 'codex/0.162.1/bin/codex', 'antigravity/1.3.6/antigravity']
  const preserved = ['settings.json', 'anthropic.secret', 'models/huggingface/token', 'antigravity/home/settings.json', 'antigravity/projects/abc/chat.json', 'codex/unknown-version/notes', 'IndexedDB/conversation', 'projects/course/episode/scene.py', 'recordings/take.wav', 'other-tool/cache/file']
  for (const path of removable) await f.file(join(root, path), 'remove')
  for (const path of preserved) await f.file(join(root, path))
  await f.file(join(f.roots.renderCache, 'frames/cache'))
  await f.file(join(f.base, 'shared/pixi/package'))
  const preview = await cleanupRuntimes(f.roots)
  assert.equal(preview.errors.length, 0)
  assert.equal(preview.removed.length, 10)
  assert.ok(preview.bytes > 0)
  assert.ok(await f.exists(join(root, removable[0])))
  const removed = await cleanupRuntimes(f.roots, true)
  assert.deepEqual(removed.removed, preview.removed)
  for (const path of removable) assert.equal(await f.exists(join(root, path)), false, path)
  for (const path of preserved) assert.equal(await readFile(join(root, path), 'utf8'), 'keep', path)
  assert.equal(await readFile(join(f.base, 'shared/pixi/package'), 'utf8'), 'keep')
  assert.equal((await cleanupRuntimes(f.roots, true)).removed.length, 0)
})

test('projects accidentally placed in a managed folder protect that whole folder, even with unreadable settings', async (t) => {
  const f = await fixture(t), root = f.roots.userData
  await f.file(join(root, 'settings.json'), 'broken json')
  await f.file(join(root, 'python-env/a/scene.py'))
  await f.file(join(root, 'python-env/a/project.json'))
  await f.file(join(root, 'tinytex/series.json'))
  await f.file(join(f.roots.renderCache, 'course/exercises.json'))
  const result = await cleanupRuntimes(f.roots, true)
  assert.equal(result.kept.length, 3)
  assert.equal(result.removed.length, 0)
  assert.equal(await readFile(join(root, 'python-env/a/scene.py'), 'utf8'), 'keep')
})

test('configured project directories are preserved before they contain any project markers', async (t) => {
  const f = await fixture(t), root = f.roots.userData
  await f.file(join(root, 'python-env/my-project/notes.md'))
  await f.file(join(root, 'tinytex/lecture.pdf'))
  await f.file(join(root, 'runtime-cache/package'))
  await f.file(join(root, 'settings.json'), JSON.stringify({ projectsDir: join(root, 'python-env/my-project'), recentProjects: [join(root, 'tinytex')] }))
  const result = await cleanupRuntimes(f.roots, true)
  assert.equal(result.kept.length, 2)
  assert.deepEqual(result.removed, [join(root, 'runtime-cache')])
})

test('linked roots and intermediate folders are kept; links inside an owned runtime never delete their targets', async (t) => {
  const f = await fixture(t), root = f.roots.userData
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  await f.file(join(f.base, 'external/package'))
  await symlink(join(f.base, 'external'), join(root, 'tinytex'), linkType)
  await symlink(join(f.base, 'external'), join(root, 'models'), linkType)
  await f.file(join(root, 'python-env/bin/python'))
  await symlink(join(f.base, 'external'), join(root, 'python-env/link'), linkType)
  await mkdir(join(root, 'codex'))
  await symlink(join(f.base, 'external'), join(root, 'codex/1.2.3'), linkType)
  const result = await cleanupRuntimes(f.roots, true)
  assert.equal(result.errors.length, 0)
  assert.equal(result.kept.length, 2)
  assert.equal(await f.exists(join(root, 'python-env')), false)
  assert.equal(await readFile(join(f.base, 'external/package'), 'utf8'), 'keep')
})

test('new runtime caches all stay within the private roots and development installs can never remove themselves', () => {
  const base = join(tmpdir(), 'studio-runtime'), env = runtimeCacheEnv(base)
  assert.equal(env.PIXI_CACHE_DIR, join(base, 'runtime-cache', 'pixi'))
  assert.equal(env.HF_HUB_CACHE, join(base, 'models', 'huggingface', 'hub'))
  assert.equal(env.HF_HOME, join(base, 'models', 'huggingface'))
  assert.equal(uninstallTarget(false, 'darwin', '/Applications/Manim Studio.app/Contents/MacOS/Manim Studio'), null)
  assert.deepEqual(uninstallTarget(true, 'darwin', '/Applications/Manim Studio.app/Contents/MacOS/Manim Studio'), { kind: 'trash', path: '/Applications/Manim Studio.app' })
  assert.equal(uninstallTarget(true, 'darwin', '/Applications/Other.app/Contents/MacOS/Other'), null)
  assert.equal(uninstallTarget(true, 'linux', '/tmp/.mount/usr/bin/studio'), null)
  assert.equal(uninstallTarget(true, 'linux', '/tmp/.mount/usr/bin/studio', 'relative.AppImage'), null)
  assert.deepEqual(uninstallTarget(true, 'linux', '/tmp/.mount/usr/bin/studio', '/home/me/Manim Studio.AppImage'), { kind: 'trash', path: '/home/me/Manim Studio.AppImage' })
  assert.deepEqual(uninstallTarget(true, 'win32', 'C:\\Users\\Me\\Manim Studio\\Manim Studio.exe'), { kind: 'nsis', path: 'C:\\Users\\Me\\Manim Studio\\Uninstall Manim Studio.exe' })
})
