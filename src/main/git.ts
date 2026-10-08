// Version history = git (pure-JS isomorphic-git, so colleagues need no git install).
// Every successful render that changed something and every Claude turn is a commit;
// "restore" checks files out of an old commit and commits that as a new version.
import git from 'isomorphic-git'
import fs from 'node:fs'
import type { Commit } from '../shared/types'

const AUTHORS = {
  user: { name: 'Manim Studio', email: 'studio@local' },
  claude: { name: 'Claude', email: 'claude@local' },
}

export async function initRepo(dir: string): Promise<void> {
  await git.init({ fs, dir, defaultBranch: 'main' })
  await commitAll(dir, 'Novi projekt', 'user')
}

/** Stages every change (adds, edits, deletions) and commits; returns null if nothing changed. */
export async function commitAll(dir: string, message: string, who: keyof typeof AUTHORS): Promise<string | null> {
  if (!fs.existsSync(`${dir}/.git`)) await git.init({ fs, dir, defaultBranch: 'main' })
  const matrix = await git.statusMatrix({ fs, dir })
  let changed = false
  for (const [filepath, head, work, stage] of matrix) {
    if (head === work && work === stage) continue
    changed = true
    if (work === 0) await git.remove({ fs, dir, filepath })
    else await git.add({ fs, dir, filepath })
  }
  if (!changed) return null
  return git.commit({ fs, dir, message, author: AUTHORS[who] })
}

export async function history(dir: string, depth = 200): Promise<Commit[]> {
  try {
    const log = await git.log({ fs, dir, depth })
    return log.map((c) => ({
      oid: c.oid,
      message: c.commit.message.trim(),
      author: c.commit.author.name,
      at: c.commit.author.timestamp * 1000,
    }))
  } catch {
    return []
  }
}

export async function restore(dir: string, oid: string): Promise<void> {
  // Save whatever is uncommitted first, so restoring is itself undoable.
  await commitAll(dir, 'Prije vraćanja', 'user')
  const { commit } = await git.readCommit({ fs, dir, oid })
  await git.checkout({ fs, dir, ref: oid, force: true, noUpdateHead: true })
  // Files that didn't exist back then stay deleted by checkout's force; record the result.
  const when = new Date(commit.author.timestamp * 1000).toLocaleString('hr-HR')
  await commitAll(dir, `Vraćeno na verziju: ${commit.message.trim().split('\n')[0]} (${when})`, 'user')
}
