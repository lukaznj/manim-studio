// GPU video encoding for exports (ADR 0034). The runner tries the hardware encoders this platform's
// ffmpeg has (studio_runner/encoder.py: VideoToolbox on macOS; NVENC for NVIDIA and Media
// Foundation for AMD on Windows; NVENC on Linux) with a few frames each, once per app run; exports
// then encode their partial movies with the first that works. Previews stay on the CPU: they're
// small, and opening a hardware encoder costs more than it saves there.
import type { VideoEncoderInfo } from '../shared/types'
import { setupStatus } from './env'
import { runRunner } from './runner'
import { getSettings } from './settings'

let found: Promise<VideoEncoderInfo> | null = null

/** What works on this computer; `again` tests it anew (after a driver update, say). */
export function videoEncoder(again = false): Promise<VideoEncoderInfo> {
  // Driving the app in tests: an encoder named here is used as if detected (mpeg4 works anywhere; h264_nvenc fails without a GPU).
  const forced = process.env.STUDIO_GPU_ENCODER
  if (forced) return Promise.resolve({ encoder: forced, label: forced, tried: [] })
  if (setupStatus().env !== 'ready') return Promise.resolve({ encoder: null, tried: [], waiting: true })
  if (!found || again)
    found = runRunner<VideoEncoderInfo>('default', ['encoders'])
      .then((job) => job.done)
      .catch((e: Error) => {
        found = null // try again next time
        return { encoder: null, tried: [], error: e.message }
      })
  return found
}

/** The encoder an export uses: the GPU's, unless it's switched off or there's none. */
export async function exportEncoder(): Promise<string | undefined> {
  if (getSettings().gpuEncoding === 'off') return undefined
  return (await videoEncoder()).encoder ?? undefined
}

/** The partial movies' cache folder for a size, frame rate and encoder, as render.py names it. */
export function partialFolder(width: number, height: number, fps: number, encoder?: string): string {
  const short: Record<string, string> = { h264_videotoolbox: 'vt', h264_nvenc: 'nvenc', h264_mf: 'mf' }
  return `${width}x${height}@${Math.round(fps)}${encoder ? `-${short[encoder] ?? encoder.replace('h264_', '')}` : ''}`
}
