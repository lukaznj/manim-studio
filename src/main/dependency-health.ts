import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type ManagedEnv = 'default' | 'omnivoice' | 'transcribe'
export const ENV_IMPORTS: Record<ManagedEnv, string[]> = {
  default: ['manim', 'manim_voiceover', 'cairo', 'manimpango', 'av', 'numpy', 'pypdfium2'],
  omnivoice: ['omnivoice', 'torch'],
  transcribe: ['faster_whisper'],
}
export const REPAIR_MESSAGE = 'Some video tools are missing or damaged. Reinstall them in Settings → Environment.'
export const INSTALLER_MESSAGE = 'The bundled installer is missing or damaged. Reinstall Manim Studio.'

export function usableExecutable(file: string, platform: NodeJS.Platform = process.platform): boolean {
  try { accessSync(file, platform === 'win32' ? constants.F_OK : constants.X_OK); return statSync(file).isFile() && statSync(file).size > 0 } catch { return false }
}
export const managedPython = (root: string, platform: NodeJS.Platform = process.platform) => join(root, platform === 'win32' ? 'python.exe' : 'bin/python')
export function envFilesReady(root: string, platform: NodeJS.Platform = process.platform): boolean {
  return usableExecutable(managedPython(root, platform), platform)
}
export function findLatexBin(root: string): string | null {
  try { return readdirSync(join(root, 'bin'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(root, 'bin', entry.name)).find((bin) => usableExecutable(join(bin, process.platform === 'win32' ? 'latex.exe' : 'latex'))) ?? null } catch { return null }
}
export function latexFilesReady(root: string): boolean {
  const bin = findLatexBin(root), suffix = process.platform === 'win32' ? '.exe' : ''
  return !!bin && ['latex', 'dvisvgm', 'kpsewhich'].every((name) => usableExecutable(join(bin, name + suffix)))
    && ['standalone/standalone.cls', 'preview/preview.sty', 'amsmath/amsmath.sty', 'xcolor/xcolor.sty'].every((file) => existsSync(join(root, 'texmf-dist', 'tex', 'latex', file)))
}

/** Recognize installation failures without calling ordinary scene/LaTeX syntax errors damaged tools. */
export function dependencyFailure(log: string, env: ManagedEnv): 'env' | 'omnivoice' | 'transcribe' | 'latex' | null {
  const missing = /(?:ModuleNotFoundError|ImportError): No module named ['"]([^'"]+)/.exec(log)?.[1]?.split('.')[0]
  if (missing && ENV_IMPORTS[env].includes(missing)) return env === 'default' ? 'env' : env
  if (/FileNotFoundError:[^\n]*['"\\/]ffmpeg(?:\.exe)?['"]/i.test(log)) return env === 'default' ? 'env' : env
  if (/FileNotFoundError:[^\n]*(?:['"\\/](?:latex|dvisvgm)(?:\.exe)?['"]|No such file[^\n]*(?:latex|dvisvgm))/i.test(log)
    || /I can't find the format file|(?:standalone\.cls|preview\.sty|amsmath\.sty|xcolor\.sty)[^\n]*(?:not found|missing)/i.test(log)) return 'latex'
  return null
}
