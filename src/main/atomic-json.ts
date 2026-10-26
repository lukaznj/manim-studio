import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Replace a checkpoint only after its full contents reach disk. Keep the previous valid JSON. */
export function writeAtomicJson(file: string, value: unknown, backupFile = `${file}.bak`): void {
  mkdirSync(dirname(file), { recursive: true })
  mkdirSync(dirname(backupFile), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  const backup = `${backupFile}.tmp`
  try {
    const fd = openSync(temporary, 'wx', 0o600)
    try {
      writeFileSync(fd, JSON.stringify(value, null, 2))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    if (existsSync(file)) {
      try {
        JSON.parse(readFileSync(file, 'utf8'))
        copyFileSync(file, backup)
        renameSync(backup, backupFile)
      } catch {
        // Do not replace a usable backup with a damaged checkpoint.
      }
    }
    renameSync(temporary, file)
  } finally {
    rmSync(temporary, { force: true })
    rmSync(backup, { force: true })
  }
}

export function readAtomicJson<T>(file: string, valid: (value: unknown) => value is T, backupFile = `${file}.bak`): T | null {
  for (const candidate of [file, backupFile]) {
    try {
      const value: unknown = JSON.parse(readFileSync(candidate, 'utf8'))
      if (valid(value)) return value
    } catch {
      // A crash, truncated old-format write, or missing file: try the previous checkpoint.
    }
  }
  return null
}
