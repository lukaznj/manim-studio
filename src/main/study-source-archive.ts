import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { slugify } from './slug.ts'

/** Preserve complete original course inputs, even when a planner assigns only some PDFs. */
export function archiveStudySources(root: string, files: string[]): { original: string; name: string }[] {
  const folder = join(root, 'sources')
  mkdirSync(folder, { recursive: true })
  return files.map((file) => {
    const original = basename(file), stem = slugify(basename(file, extname(file))) || 'source'
    const bytes = readFileSync(file), hash = createHash('sha256').update(bytes).digest('hex')
    let name = `${stem}.pdf`
    for (let i = 2; existsSync(join(folder, name)) && createHash('sha256').update(readFileSync(join(folder, name))).digest('hex') !== hash; i++) name = `${stem}-${i}.pdf`
    if (!existsSync(join(folder, name))) copyFileSync(file, join(folder, name))
    return { original, name }
  })
}
