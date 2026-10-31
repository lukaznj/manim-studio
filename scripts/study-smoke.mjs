// Uses real fixture videos and the real watch, exercise and Add lesson IPC paths in an isolated profile.
// Only sign-in/catalog and follow-up generation are stand-ins. Add lesson uses STUDIO_FAKE_AGENT.
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const data = process.env.STUDIO_USER_DATA
const source = process.env.STUDIO_FIXTURE_PROJECT
if (!data || !source) throw new Error('Set STUDIO_USER_DATA and STUDIO_FIXTURE_PROJECT to isolated fixture paths.')
const command = async (body) => {
  const response = await fetch(`http://127.0.0.1:${process.env.DRIVE_PORT ?? 7357}`, { method: 'POST', body })
  const text = await response.text()
  if (!response.ok || /^(ERROR:|Error:|NOT_FOUND)/.test(text)) throw new Error(text)
  return text
}
const evaluate = async (fn) => JSON.parse(await command(`eval (${fn.toString()})()`))
const main = async (fn) => JSON.parse(await command(`main (${fn.toString()})()`))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const json = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2))
assert.equal(await main(() => app.getPath('userData')), resolve(data))
assert.equal(await main(() => !!process.env.STUDIO_FAKE_AGENT), true)
const root = join(dirname(data), 'projects', `study-course-${Date.now()}`)
mkdirSync(root, { recursive: true })
const titles = [
  'Konturne struje: manje nepoznanica, isti krug',
  'Naponi čvorova: opiši mrežu jednostavnije',
  'Superpozicija: doprinos svakog izvora',
  'Thévenin: što vidi potrošač',
  'Radna točka: gdje se susreću krivulje',
  'Norton: isti priključci, drukčiji model',
  'Tri faze i zvijezda: što znači napon',
  'Zvijezda i trokut: prati gdje teče struja',
]
const paragraphs = [
  'Kako odrediti struju ove središnje grane, a da svih šest struja ne uzmemo kao zasebne nepoznanice?',
  'Pogledaj ovaj krug. Ima šest grana, a svakoj smo zadali referentni smjer struje.',
  'Kad bismo izravno pisali Kirchhoffove zakone za struje i napone, dobili bismo šest jednadžbi sa šest nepoznatih struja.',
  'Ali na crtežu se vide tri unutarnja okna. Upravo ćemo njih iskoristiti da isti krug opišemo s tri nepoznanice.',
  'Nijedan element ne mijenjamo. Mijenjamo samo veličine koje prvo tražimo.',
]
const subtitles = Array.from({ length: 30 }, (_, i) => ({ start: i * 0.3, end: (i + 1) * 0.3, text: paragraphs[i % paragraphs.length] }))
const sections = ['Šest grana, koliko nepoznanica?', 'Pomoćna struja za svako okno', 'Zašto u zajedničkoj grani oduzimamo?'].map((name, i) => ({
  name,
  start: i * 3,
  end: (i + 1) * 3,
  line: null,
}))
function fixture(dir, title, number, exercise = false, omitExport = false) {
  cpSync(source, dir, {
    recursive: true,
    filter: (path) =>
      !['.git', 'episode-metrics.json', 'episode-report.html', 'usage.json'].includes(basename(path)) && (!omitExport || basename(path) !== 'exports'),
  })
  const meta = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'))
  meta.name = title
  meta.voice = { provider: 'elevenlabs', language: 'hr', elevenlabs: { voiceId: 'test-voice' } }
  if (exercise) {
    delete meta.series
    meta.exercise = { set: dirname(dir), title: 'Practice', number }
  } else meta.series = { title: 'Osnove elektrotehnike', folder: root, episode: number, of: titles.length, brief: title }
  json(join(dir, 'project.json'), meta)
  const timelinePath = join(dir, '.studio/preview/timeline.json')
  const replace = (value) =>
    typeof value === 'string'
      ? value.replaceAll(source, dir)
      : Array.isArray(value)
        ? value.map(replace)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]))
          : value
  const timeline = replace(JSON.parse(readFileSync(timelinePath, 'utf8')))
  timeline.sections = sections
  timeline.subtitles = subtitles
  json(timelinePath, timeline)
  const video = join(dir, 'exports', 'codex-episode', 'codex-episode.mp4')
  const vttTime = (seconds) => `00:00:${seconds.toFixed(3).padStart(6, '0')}`
  if (existsSync(video))
    writeFileSync(video.replace(/\.mp4$/, '.hr.vtt'), 'WEBVTT\n\n' + subtitles.map((s) => `${vttTime(s.start)} --> ${vttTime(s.end)}\n${s.text}\n`).join('\n'))
  if (exercise) {
    writeFileSync(join(dir, 'problem.md'), '# Struja u grani\n\nFind the current through a 5 Ω resistor at 10 V.')
    writeFileSync(join(dir, 'solution.md'), '---\nstatus: checked\ntopic: Ohm’s law\nanswer: $I=2$ A\n---\n## Apply Ohm’s law\n\n$I=U/R=10/5=2$ A.')
    json(join(dir, '.studio/exercise.json'), { video, subtitles: video.replace(/\.mp4$/, '.hr.vtt'), warnings: [] })
  }
  return dir
}
const dirs = titles.map((title, i) => fixture(join(root, `${String(i + 1).padStart(2, '0')}-lesson`), title, i + 1))
json(join(root, 'series.json'), {
  plan: {
    title: 'Osnove elektrotehnike',
    bible: 'Use consistent circuit notation.',
    episodes: titles.map((title) => ({ title, summary: title, sources: [] })),
  },
  episodes: dirs.map((dir) => basename(dir)),
})
writeFileSync(join(root, 'series.md'), '# Circuit notation\nUse the same voltages and currents throughout the course.')
const exerciseRoot = join(root, 'exercises')
mkdirSync(exerciseRoot)
const exercise = fixture(join(exerciseRoot, '01-current'), 'Struja u grani', 1, true)
json(join(exerciseRoot, 'exercises.json'), {
  title: 'Practice',
  course: root,
  createdAt: new Date().toISOString(),
  aspect: '16:9',
  theme: 'dark',
  tone: 'warm',
  language: 'hr',
  voice: { provider: 'elevenlabs', language: 'hr' },
  exercises: [basename(exercise)],
})
await main(() => {
  for (const name of ['claudeStatus', 'claudeUsage', 'chatModels', 'requestFollowUp']) ipcMain.removeHandler(name)
  ipcMain.handle('claudeStatus', (_e, agent = 'codex') => ({ loggedIn: true, method: 'account', agent }))
  ipcMain.handle('claudeUsage', () => null)
  ipcMain.handle('chatModels', () => [{ value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', efforts: ['medium', 'high'], description: '' }])
  ipcMain.handle('requestFollowUp', (_e, dir, at, text) => {
    globalThis.studyFollowUp = { dir, at, text }
  })
  return true
})
await command(
  `eval window.studio.setSettings(${JSON.stringify({ agent: 'codex', codexModel: 'gpt-6.1-sol', mode: 'learn', onboardingDone: true, uiLanguage: 'en', appearance: 'dark', recentProjects: [...dirs, exercise], projectsDir: root, gpuEncoding: 'off', developerMode: false })})`,
)
await command('eval location.reload()')
await sleep(500)
await command('click .series-card')
await sleep(500)
assert.equal(await evaluate(() => document.querySelector('video').controls), false)
assert((await evaluate(() => document.querySelector('video').src)).includes(encodeURIComponent(root)), 'Open the current fixture course')
assert((await evaluate(() => document.querySelector('video').duration)) > 8)
const gap = await evaluate(() => {
  const list = document.querySelector('.lyrics'),
    first = list.querySelector('.lyric')
  return first.getBoundingClientRect().top - list.getBoundingClientRect().top
})
assert(gap < 20, `Transcript has ${gap}px of leading space`)
assert.equal(await evaluate(() => !!document.querySelector('input[aria-label="Search all exercises"]')), false)
await evaluate(() => {
  document.querySelector('video').currentTime = 1.4
  return true
})
await sleep(100)
await command('ss study-redesign-dark')
await evaluate(async () => {
  await window.studio.setSettings({ appearance: 'light' })
  return true
})
await sleep(180)
await command('ss study-redesign-light')
await command('click .study-play')
await sleep(120)
assert.equal(await evaluate(() => document.querySelector('video').paused), false)
await command('click .study-play')
await command('click button[aria-label="Mute"]')
assert.equal(await evaluate(() => document.querySelector('video').muted), true)
await command('click button[aria-label="Unmute"]')
await command('click button[aria-label="Playback speed"]')
await sleep(80)
await command('click .study-speed-menu button:nth-of-type(5)')
await sleep(120)
assert.equal(await evaluate(() => document.querySelector('video').playbackRate), 1.5)
await command('click button[aria-label="Browse chapters"]')
await sleep(100)
await command('ss study-chapters')
await command('click dialog[open] .study-chapter-item:nth-child(2)')
await sleep(250)
await evaluate(() => {
  document.querySelector('video').pause()
  return true
})
assert((await evaluate(() => document.querySelector('video').currentTime)) >= 3)
await command('fill .lyrics-search>label>input Kirchhoff')
await sleep(220)
const matched = await evaluate(() => ({ time: document.querySelector('video').currentTime, marks: document.querySelectorAll('.lyric mark').length }))
assert(matched.time >= 0.6 && matched.marks > 0)
await command('click-text Chat')
await sleep(250)
assert.equal(await evaluate(() => document.querySelector('.study-panel.active .chat-pane') !== null), true)
await command('click-text Transcript')
await sleep(250)
assert.equal(await evaluate(() => document.querySelector('input[aria-label="Search what’s said in the video"]').value), 'Kirchhoff')
await command('click button[aria-label="Clear the search"]')
await command('click-text Go deeper')
await sleep(180)
const when = await evaluate(() => document.querySelector('video').currentTime)
await evaluate(() => {
  document.querySelector('video').currentTime = 6
  return true
})
await command('fill #watch-follow Explain the shared branch more slowly')
await command('click-text Create follow-up video')
await sleep(250)
const follow = await main(() => globalThis.studyFollowUp)
assert(Math.abs(follow.at - when) < 0.1 && follow.text.includes('shared branch'))
await command('click-text Exercises')
await sleep(180)
assert.equal(await evaluate(() => !!document.querySelector('input[aria-label="Search all exercises"]')), true)
assert.equal(await evaluate(() => document.querySelectorAll('.study-library-content .ex-row').length), 1)
await command('ss study-exercises')
await command('click-text Lessons')
await sleep(180)
await command('click-text Add lesson')
await sleep(180)
await command('fill #lesson-title Maximum power transfer')
await command('fill #lesson-topic Explain matching the load to the source intuitively.')
await command('ss study-add-lesson')
await command('click-text Create lesson')
await sleep(600)
let course, added
for (let i = 0; i < 120; i++) {
  course = JSON.parse(await command(`eval window.studio.watchSeries(${JSON.stringify(root)})`))
  added = course.episodes.at(-1)
  if (added?.title === 'Maximum power transfer' && added.video) break
  if (added?.state === 'failed') throw new Error(added.error)
  await sleep(1000)
}
assert.equal(course.episodes.length, titles.length + 1)
assert(added.video && existsSync(added.video), 'Added lesson did not export')
assert.deepEqual(
  course.episodes.slice(0, -1).map((e) => e.title),
  titles,
)
for (const dir of [...dirs, added.dir]) assert.equal(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).series.of, titles.length + 1)
console.log(
  'Passed: compact transcript, custom playback, chapters, transcript search and retained tab state, frozen follow-up moment, Exercises tab, and real Add lesson append/render/export.',
)
console.log(`Fixture: ${root}`)

// Invalid attachments must fail before creating any project or changing the course index.
const beforeInvalid = readdirSync(root).sort()
await assert.rejects(
  () =>
    command(
      `eval window.studio.addCourseLesson(${JSON.stringify(root)},${JSON.stringify({ title: 'Invalid attachment', prompt: 'Test', sources: [join(root, 'missing.pdf')] })})`,
    ),
  /ENOENT|no such file/,
)
assert.deepEqual(readdirSync(root).sort(), beforeInvalid)
await command('click .study-library-content .ex-row')
await sleep(250)
await command('click button[aria-label="Subtitles"]')
assert.equal(await evaluate(() => document.querySelector('video').textTracks[0].mode), 'hidden')
await command('click button[aria-label="Subtitles"]')
assert.equal(await evaluate(() => document.querySelector('video').textTracks[0].mode), 'showing')
await evaluate(() => {
  const input = document.querySelector('input[aria-label="Video position"]')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})
await sleep(120)
assert(Math.abs((await evaluate(() => document.querySelector('video').currentTime)) - 2) < 0.1)
await command('mouse button[aria-label="Full screen"]')
await sleep(200)
assert.equal(await evaluate(() => !!document.fullscreenElement), true)
// Browser automation bypasses Electron's native drag hit testing. Check the region
// as well as the tabs: the hidden window titlebar must not intercept fullscreen clicks.
assert.equal(await evaluate(() => getComputedStyle(document.querySelector('.titlebar')).getPropertyValue('-webkit-app-region')), 'no-drag')
await command('press Escape')
await sleep(200)
assert.equal(await evaluate(() => !!document.fullscreenElement), false)
assert.equal(await evaluate(() => getComputedStyle(document.querySelector('.titlebar')).getPropertyValue('-webkit-app-region')), 'drag')
await evaluate(() => {
  document.querySelector('.study-player').focus()
  return true
})
await command('press k')
await sleep(120)
assert.equal(await evaluate(() => document.querySelector('video').paused), false)
await command('press k')
await command('press ArrowRight')
await sleep(200)
assert.equal(JSON.parse(await command(`eval window.studio.watchSeries(${JSON.stringify(root)})`)).episodes[0].watched, true)
await command('click-text Exercises')
await command('click .study-library-content .ex-row')
await sleep(250)
assert.match(await command('text .ex-main'), /Apply Ohm/)
await command('fill .ex-side-head>.ex-search>input resistor')
await sleep(350)
assert.equal(await evaluate(() => document.querySelectorAll('.study-library-content .ex-row').length), 1)
await command('ss study-exercise-detail')
await command('click-text Lessons')
await command('click .study-library-content .ex-row')
await sleep(250)
await command('size 1000 760')
await sleep(200)
const layout = await evaluate(() =>
  ['.ex-side', '.ex-main', '.ex-chat', '.study-control-row'].map((s) => {
    const el = document.querySelector(s)
    return { selector: s, width: el.clientWidth, scroll: el.scrollWidth }
  }),
)
assert(
  layout.every((p) => p.scroll <= p.width + 2),
  JSON.stringify(layout),
)
await command('ss study-compact')
await main(async () => {
  const target = BrowserWindow.getAllWindows()[0].webContents
  target.debugger.attach('1.3')
  await target.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  return true
})
assert.equal(await evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
assert.equal(await evaluate(() => getComputedStyle(document.querySelector('.study-panel')).transitionDuration), '0s')
await main(async () => {
  const target = BrowserWindow.getAllWindows()[0].webContents
  await target.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
  target.debugger.detach()
  return true
})
await command('size 1480 920')
// Reload an interrupted lesson from disk, then retry its real background render/export flow.
const failedDir = fixture(join(root, '10-interrupted'), 'Interrupted lesson', 10, false, true)
json(join(failedDir, '.studio/lesson.json'), { request: 'Explain a short circuit example.', failed: 'A synthetic interruption for the retry check.' })
const savedCourse = JSON.parse(readFileSync(join(root, 'series.json'), 'utf8'))
savedCourse.episodes.push(basename(failedDir))
savedCourse.plan.episodes.push({ title: 'Interrupted lesson', summary: 'Retry check', sources: [] })
json(join(root, 'series.json'), savedCourse)
assert.equal(JSON.parse(await command(`eval window.studio.watchSeries(${JSON.stringify(root)})`)).episodes.at(-1).state, 'failed')
await command('eval location.reload()')
await sleep(450)
await command('click .series-card')
await sleep(250)
await command('click .study-library-content .ex-list>li:last-child .ex-row')
await sleep(250)
assert.match(await command('text .ex-main'), /synthetic interruption/)
await command('click-text Try again')
let retried
for (let i = 0; i < 120; i++) {
  retried = JSON.parse(await command(`eval window.studio.watchSeries(${JSON.stringify(root)})`)).episodes.at(-1)
  if (retried.video) break
  if (retried.state === 'failed') throw new Error(retried.error)
  await sleep(1000)
}
assert(retried.video && existsSync(retried.video))
assert(!JSON.parse(readFileSync(join(failedDir, '.studio/lesson.json'), 'utf8')).failed)
console.log(
  'Passed: subtitle toggle, seek slider, full screen, keyboard playback, watched marking, exercise search/detail, compact layout, reduced motion, attachment validation, and persisted lesson retry/export.',
)
