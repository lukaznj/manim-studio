// PDF sources, in <project>/sources/ (ADR 0014): what a video is made from. Each PDF is indexed once
// into .studio/sources/<name>/ (page text with page markers, page sizes, a thumbnail) by the Python
// runner, which also renders page images on demand. Claude reads them through read_source and
// view_source_pages: Claude Code can't open PDF pages itself without poppler.
import { dialog, shell } from 'electron'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { SourceImport, SourceItem } from '../shared/types'
import { requireProject } from './projects'
import { runRunner } from './runner'
import { slugify } from './slug'

const PDF = /\.pdf$/i
/** What read_source returns at most per call; a whole textbook would flood Claude's context. */
const MAX_TEXT = 60_000

interface SourceInfo {
  pages: number
  title: string
  noText: number[]
  sizes: [number, number][]
}

const folder = (dir = requireProject().path) => join(dir, 'sources')
const cache = (name: string, dir = requireProject().path) => join(dir, '.studio', 'sources', name)

/** One index run per file at a time: the panel and Claude may ask for the same PDF together. */
const indexing = new Map<string, Promise<SourceInfo>>()

function readInfo(name: string, dir = requireProject().path): SourceInfo | null {
  const file = join(cache(name, dir), 'info.json')
  // Re-indexed when the PDF is newer than its index (replaced under the same name).
  if (!existsSync(file) || statSync(file).mtimeMs < statSync(join(folder(dir), name)).mtimeMs) return null
  return JSON.parse(readFileSync(file, 'utf8')) as SourceInfo
}

async function info(name: string, dir = requireProject().path): Promise<SourceInfo> {
  const ready = readInfo(name, dir)
  if (ready) return ready
  const pdf = join(folder(dir), name)
  let running = indexing.get(pdf)
  if (!running) {
    running = (async () => {
      try {
        const done = await (await runRunner<{ info: SourceInfo }>('default', ['pdf-index', pdf, cache(name, dir)])).done
        return done.info
      } catch (e) {
        throw new Error(friendly(e as Error, name))
      } finally {
        indexing.delete(pdf)
      }
    })()
    indexing.set(pdf, running)
  }
  return running
}

/** A Python env from before PDF support lacks pypdfium2 until the user updates it on Home. */
function friendly(e: Error & { log?: string }, name: string): string {
  if (/pypdfium2/.test(`${e.message}\n${e.log ?? ''}`))
    return 'Studio is still updating its Manim environment, which reads PDFs. Try again in a minute; if this stays, click Update under Projects.'
  if (/password|encrypt/i.test(e.message)) return `${name} is password-protected. Save an unprotected copy and add that.`
  return `Couldn’t read ${name}: ${e.message.replace(/^\w+Error: /, '')}`
}

export async function listSources(): Promise<SourceItem[]> {
  const dir = folder()
  if (!existsSync(dir)) return []
  const items: SourceItem[] = []
  for (const name of readdirSync(dir)
    .filter((n) => PDF.test(n))
    .sort()) {
    const item: SourceItem = { name, size: statSync(join(dir, name)).size }
    try {
      const i = await info(name)
      Object.assign(item, { pages: i.pages, title: i.title || undefined, noText: i.noText, thumb: join(cache(name), 'thumb.png') })
    } catch (e) {
      item.error = (e as Error).message // still listed, so it can be removed
    }
    items.push(item)
  }
  return items
}

/** Copies PDFs into sources/ under tidy names and indexes them. With no paths, asks with a dialog.
 *  A file already there under its tidy name with the same size is the same PDF: it isn't copied again. */
export async function importSources(paths: string[]): Promise<SourceImport> {
  if (!paths.length) {
    const picked = await dialog.showOpenDialog({
      title: 'Add PDFs',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    })
    paths = picked.filePaths
  }
  paths = paths.filter(Boolean) // a drop of something that isn't a file on disk has no path
  if (!paths.length) return { items: await listSources(), added: [] }
  const dir = folder()
  mkdirSync(dir, { recursive: true })
  const skipped = paths.filter((p) => !PDF.test(p)).map((p) => basename(p))
  const added: string[] = []
  for (const src of paths.filter((p) => PDF.test(p))) {
    const stem = slugify(basename(src, extname(src))) || 'source'
    let name = `${stem}.pdf`
    if (existsSync(join(dir, name)) && statSync(join(dir, name)).size === statSync(src).size) {
      added.push(name)
      continue
    }
    for (let i = 2; existsSync(join(dir, name)); i++) name = `${stem}-${i}.pdf`
    copyFileSync(src, join(dir, name))
    added.push(name)
    ignorePdfs()
  }
  if (skipped.length) throw new Error(`Only PDFs can be added here; skipped ${skipped.join(', ')}. Pictures and videos go in Media.`)
  return { items: await listSources(), added }
}

/** To the Trash, not deleted: a scene may still show its pages. */
export async function removeSource(name: string): Promise<SourceItem[]> {
  const path = join(folder(), basename(name))
  if (existsSync(path)) await shell.trashItem(path)
  rmSync(cache(basename(name)), { recursive: true, force: true })
  return listSources()
}

export async function sourcePageCount(name: string, dir = requireProject().path): Promise<number> {
  return (await info(requireSource(name, dir), dir)).pages
}

/** Page images (1-based page numbers), rendered once per width and kept in the index folder. */
export async function sourcePages(name: string, pages: number[], width: number, dir = requireProject().path): Promise<string[]> {
  name = requireSource(name, dir)
  const { pages: count } = await info(name, dir)
  const wanted = pages.filter((n) => Number.isInteger(n) && n >= 1 && n <= count)
  if (!wanted.length) return []
  const done = await (
    await runRunner<{ paths: string[] }>('default', [
      'pdf-pages',
      join(folder(dir), name),
      cache(name, dir),
      '--pages',
      wanted.join(','),
      '--width',
      String(width),
    ])
  ).done
  return done.paths
}

/** Complete local text index for course retrieval; unlike read_source this is not a prompt. */
export async function indexedSource(name: string, dir: string): Promise<{ pages: number; noText: number[]; text: string }> {
  name = requireSource(name, dir)
  const metadata = await info(name, dir)
  return { pages: metadata.pages, noText: metadata.noText, text: readFileSync(join(cache(name, dir), 'text.txt'), 'utf8') }
}

/** The text of pages from..to (1-based, inclusive), each after its "=== Page N ===" line. */
export async function sourceText(name: string, from = 1, to = Infinity, dir = requireProject().path): Promise<string> {
  name = requireSource(name, dir)
  const i = await info(name, dir)
  const last = Math.min(to, i.pages)
  if (from > last) throw new Error(`${name} has ${i.pages} pages.`)
  const text = readFileSync(join(cache(name, dir), 'text.txt'), 'utf8')
  const start = text.indexOf(`=== Page ${from} ===`)
  const end = last < i.pages ? text.indexOf(`=== Page ${last + 1} ===`) : text.length
  let out = text.slice(start, end).trimEnd()
  const notes = [`${name}: pages ${from}–${last} of ${i.pages}.`]
  if (out.length > MAX_TEXT) {
    out = out.slice(0, MAX_TEXT)
    const reached = [...out.matchAll(/=== Page (\d+) ===/g)].at(-1)?.[1]
    notes.push(`Cut off in page ${reached}: ask for fewer pages at a time.`)
  }
  const blank = i.noText.filter((n) => n >= from && n <= last)
  if (blank.length) notes.push(`Pages ${blank.join(', ')} have no text layer (scanned or only pictures): look at them with view_source_pages.`)
  return `${notes.join(' ')}\n\n${out}`
}

/** The PDF named by Claude, forgiving a "sources/" prefix; or an error that lists what is there. */
export function requireSource(name: string, dir = requireProject().path): string {
  const clean = basename(name.replace(/\\/g, '/'))
  if (existsSync(join(folder(dir), clean)) && PDF.test(clean)) return clean
  const there = sourceNames(dir).join(', ')
  throw new Error(`No source "${name}". In sources/: ${there || 'nothing yet'}`)
}

export function sourceNames(dir = requireProject().path): string[] {
  return existsSync(folder(dir))
    ? readdirSync(folder(dir))
        .filter((n) => PDF.test(n))
        .sort()
    : []
}

/** What Claude is told about the PDFs (in-app chat and Claude Desktop alike). */
export function sourcesNote(dir: string): string {
  const names = sourceNames(dir)
  if (!names.length) return 'The project has no PDF sources (sources/ is empty).'
  const listed = names.map((n) => {
    const i = readInfo(n, dir)
    if (!i) return n
    return `${n} (${i.pages} ${i.pages === 1 ? 'page' : 'pages'}${i.title ? `, "${i.title}"` : ''}${i.noText.length ? `; ${i.noText.length === i.pages ? 'scanned, no text layer' : `pages ${i.noText.join(', ')} have no text layer`}` : ''})`
  })
  return [
    `The user's PDF sources in sources/, the material the video is made from: ${listed.join(', ')}.`,
    'Read their text with read_source and look at pages (figures, tables, layout, handwriting, scans) with view_source_pages. Don’t open the PDF files with Read.',
    'Show a page, or part of one, in the video with pdf_page("name.pdf", page, crop=(left, top, right, bottom)) from studio (see studio/sources.py).',
  ].join(' ')
}

/** PDFs stay out of the version history (like videos, they can be big); added on first import. */
function ignorePdfs(): void {
  const file = join(requireProject().path, '.gitignore')
  const rules = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (rules.includes('sources/*.pdf')) return
  appendFileSync(file, '\n# PDF sources can be big; the history keeps scene.py, not the material it came from.\nsources/*.pdf\n')
}
