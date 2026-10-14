// Series mode: a batch of PDFs (a course's lectures) becomes a series of videos. Claude reads them
// and proposes the episodes and a series bible; the user edits and accepts the plan; Studio creates
// one project per episode in a series folder, and either makes them all in quick mode, one after
// another, or opens the first to make by hand. Each episode carries a copy of the bible, series.md,
// listing what the earlier episodes covered, so a video can refer back to them (ADR 0019).
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SCRIPT_FILE } from '../shared/script'
import { TONES } from '../shared/tone'
import type { ProjectMeta, SeriesPlan, SeriesRef, SeriesStart, Tone } from '../shared/types'
import { askClaude, claudeStatus, languageName } from './claude'
import { createProject, readMeta } from './projects'
import { parsePlan } from '../shared/series-plan'
import { ensureQuickReady, makeVideo, quickStopped } from './quick'
import { runRunner } from './runner'
import { getSettings, setSettings } from './settings'
import { slugify } from './slug'

/** Per PDF, at most this much text goes into the planning request. */
const MAX_TEXT = 40_000

/** Reads the PDFs and asks Claude for episodes and a bible. */
export async function planSeries(req: { pdfs: string[]; title?: string; language: string; tone: Tone }): Promise<SeriesPlan> {
  if (!req.pdfs.length) throw new Error('Add the PDFs the series is made from.')
  if (!(await claudeStatus()).loggedIn) throw new Error('Sign in to your agent first (Settings → Agent): it reads the PDFs and plans the episodes.')
  const work = join(tmpdir(), 'manim-studio-series', randomUUID())
  try {
    const material: string[] = []
    for (const [i, pdf] of req.pdfs.entries()) {
      const out = join(work, String(i))
      const { info } = await (await runRunner<{ info: { pages: number } }>('default', ['pdf-index', pdf, out])).done
      const text = readFileSync(join(out, 'text.txt'), 'utf8')
      material.push(`=== FILE: ${basename(pdf)} (${info.pages} pages) ===\n${text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[… the rest is cut here]` : text}`)
    }
    const tone = TONES.find((t) => t.value === req.tone) ?? TONES[1]
    const prompt = [
      `Plan an educational video series from this course material, in ${languageName(req.language)}.${req.title ? ` The series is called "${req.title}".` : ''}`,
      `Its tone: ${tone.brief}`,
      'Episodes: usually one per file, in the given order. Split a file that holds several big ideas into several episodes; merge files too thin for a video of their own. Each episode has one central idea and fits a focused video (typically 3 to 10 minutes). Name the pages each episode uses.',
      'The bible (series.md, Markdown) has: who the series is for and what it assumes; the arc (how the episodes build on each other); the notation used throughout (follow the material); the visual vocabulary, saying which colour (palette names TEXT, MUTED, ACCENT, HIGHLIGHT, POSITIVE, NEGATIVE) and which shape always stands for what; recurring visual devices. Aim for the clarity and consistency of 3Blue1Brown’s series.',
      'Answer with only JSON: {"title": string, "bible": string, "episodes": [{"title": string, "summary": string, "sources": [{"file": string, "pages": string}], "buildsOn": [1-based episode numbers]}]}',
      '',
      ...material,
    ].join('\n')
    const answer = await askClaude('You plan educational maths and engineering video series. You answer with JSON only.', prompt, 'plan the series')
    return parsePlan(answer, req.pdfs.map((p) => basename(p)), req.title)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const two = (n: number) => String(n).padStart(2, '0')

/** Creates the series folder and one project per episode; unattended, makes them all in quick mode. */
export async function startSeries(start: SeriesStart, openInWindow: (dir: string) => Promise<void>): Promise<void> {
  if (start.unattended) await ensureQuickReady()
  const { plan } = start
  const root = getSettings().projectsDir
  let folder = join(root, slugify(plan.title))
  for (let i = 2; existsSync(folder); i++) folder = join(root, `${slugify(plan.title)}-${i}`)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'series.md'), `# ${plan.title}\n\n${plan.bible}\n`)

  const byName = new Map(start.pdfs.map((p) => [basename(p), p]))
  const dirs: string[] = []
  for (const [i, ep] of plan.episodes.entries()) {
    const series: SeriesRef = { title: plan.title, folder, episode: i + 1, of: plan.episodes.length, brief: episodeBrief(ep) }
    const dir = await createProject({
      name: ep.title,
      aspect: start.aspect,
      theme: start.theme,
      tone: start.tone,
      scriptFirst: true,
      language: start.language,
      voice: start.voice,
      series,
      parentDir: folder,
    })
    // Episode folders sort in order: 01-…, 02-…
    const ordered = join(folder, `${two(i + 1)}-${basename(dir)}`)
    if (!existsSync(ordered)) renameSync(dir, ordered)
    mkdirSync(join(ordered, 'sources'), { recursive: true })
    for (const s of ep.sources) {
      const from = byName.get(s.file)
      if (from) copyFileSync(from, join(ordered, 'sources', sourceName(s.file)))
    }
    dirs.push(ordered)
  }
  writeFileSync(join(folder, 'series.json'), JSON.stringify({ plan, episodes: dirs.map((d) => basename(d)) }, null, 2))
  setSettings({ recentProjects: [...dirs, ...getSettings().recentProjects.filter((p) => !dirs.includes(p))] })

  if (!start.unattended) {
    writeEpisodeBible(dirs[0])
    await openInWindow(dirs[0])
    return
  }
  void (async () => {
    for (const [i, dir] of dirs.entries()) {
      writeEpisodeBible(dir)
      const meta = readMeta(dir)
      await makeVideo(dir, meta.name, { prompt: episodePrompt(meta), sources: [], export: start.export }, { title: plan.title, episode: i + 1, of: dirs.length }).catch(() => undefined)
      if (quickStopped()) break
    }
  })()
}

/** The name importSources would give a PDF: "Lecture 1.PDF" → lecture-1.pdf. */
const sourceName = (file: string) => `${slugify(basename(file, extname(file))) || 'source'}.pdf`

function episodeBrief(ep: SeriesPlan['episodes'][number]): string {
  const sources = ep.sources.map((s) => `sources/${sourceName(s.file)}${s.pages ? ` pages ${s.pages}` : ''}`)
  return [ep.summary, sources.length ? `Its material: ${sources.join('; ')}.` : '', ep.buildsOn?.length ? `It builds on episode ${ep.buildsOn.join(', ')}.` : '']
    .filter(Boolean)
    .join(' ')
}

/** What Claude is asked to make, for one episode in quick mode. */
function episodePrompt(meta: ProjectMeta): string {
  const s = meta.series!
  return `Make episode ${s.episode} of ${s.of} of the series "${s.title}": ${meta.name}.\n${s.brief}\nFollow the material, and series.md as the guide says.`
}

/** What Claude is told about an episode in every turn (the chat's brief and Claude Desktop's guide). */
export function seriesBrief(meta: ProjectMeta): string {
  const s = meta.series
  if (!s) return ''
  return [
    `This video is episode ${s.episode} of ${s.of} of the series "${s.title}". ${s.brief}`,
    'series.md in this project is the series bible, with what each episode covers: follow its notation and visual vocabulary exactly, assume what the earlier episodes taught, refer back to them where it helps ("in episode 2 we saw…") instead of explaining again, and leave later episodes’ topics to them.',
  ].join('\n')
}

/**
 * series.md for one episode: the bible, then the episodes, with what the finished ones actually
 * cover (their script's idea and sections). Written when the episode is started or opened.
 */
export function writeEpisodeBible(dir: string): void {
  const meta = readMeta(dir)
  const s = meta.series
  if (!s || !existsSync(join(s.folder, 'series.json'))) return
  const { plan, episodes } = JSON.parse(readFileSync(join(s.folder, 'series.json'), 'utf8')) as { plan: SeriesPlan; episodes: string[] }
  const bible = existsSync(join(s.folder, 'series.md')) ? readFileSync(join(s.folder, 'series.md'), 'utf8') : `# ${plan.title}\n\n${plan.bible}\n`
  const list = plan.episodes.map((ep, i) => {
    const here = i + 1 === s.episode
    const script = join(s.folder, episodes[i] ?? '', SCRIPT_FILE)
    const made = !here && existsSync(script) ? summarizeScript(readFileSync(script, 'utf8')) : ''
    return `${i + 1}. **${ep.title}**${here ? ' (this episode)' : ''}: ${ep.summary}${made ? `\n   ${made}` : ''}`
  })
  writeFileSync(join(dir, 'series.md'), `${bible.trimEnd()}\n\n## Episodes\n\n${list.join('\n')}\n`)
}

/** "The idea: …; sections: Intro, Formula, …" from an episode's script. */
function summarizeScript(text: string): string {
  const idea = text.match(/\*\*The idea:\*\*\s*(.+)/)?.[1]?.trim()
  const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
  return [idea ? `As made: ${idea}` : '', sections.length ? `Sections: ${sections.join(', ')}.` : ''].filter(Boolean).join(' ')
}
