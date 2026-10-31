import { z } from 'zod'

/** Small, reusable inserts; the lesson, narration and timeline stay in manim. */
export const motionInput = {
  name: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/).describe('A short reusable name, e.g. gear-train'),
  mode: z.enum(['preview', 'render', 'status']).optional(),
  html: z.string().min(1).max(100_000).optional().describe('Self-contained HTML with window.renderFrame(seconds). No imports, network, timers or external assets. Use inline SVG, Canvas and CSS.'),
  seconds: z.number().min(0.5).max(12).optional().describe('Clip length; required with new HTML. At most 12 seconds.'),
}
export const motionRequest = z.object(motionInput)
export type MotionInput = z.infer<typeof motionRequest>
export const motionSource = z.object({ html: z.string().min(1).max(100_000), seconds: z.number().min(0.5).max(12), portrait: z.boolean() })
export type MotionSource = z.infer<typeof motionSource>
export const MOTION_FPS = 30
export const motionSize = (portrait: boolean) => portrait ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
export const motionFrames = (seconds: number) => Math.ceil(seconds * MOTION_FPS)
export const motionTimes = (seconds: number) => [0, seconds / 2, Math.max(0, seconds - 1 / MOTION_FPS)]

// These documents run in a separate sandbox with no preload or application session.
export const MOTION_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

export const motionBrief = 'For a complex visual that is materially easier in SVG/Canvas than manim (e.g. a dense mechanism, particle field, or interface demonstration), you may use render_motion. Keep equations, ordinary diagrams, narration and the overall lesson in manim. Do not use motion inserts for decoration or remake the whole video in HTML. Use the current selected agent; do not launch another model or paid service. First preview one short, self-contained insert (0.5–12 s, 1080p, 30 fps), inspect its returned first/middle/last frames, then render it and poll status until ready. Reuse its cached MP4 with VideoClip; leave voiceover in StudioScene and match its length to the narration. Rendering is local; authoring and reviewing still consume the agent’s normal usage. Reuse the source and cached result instead of regenerating. If it is slow or fails, simplify it or return to manim. Use the project palette, narration language, and subtitle-safe area. HTML must define window.renderFrame(t) as a pure seek to time t in seconds, including backward seeks; no timers, requestAnimationFrame loops, randomness, imports, downloads, audio, or external fonts. window.innerWidth/innerHeight are the video dimensions. CSS animations are paused and sought by Studio. Use inline SVG or Canvas, inline styles/scripts and embedded data images only. Tool mode preview is the default; mode render requires a successful preview; mode status only inspects progress. Supply HTML and seconds once, then just name and mode. The result tells you the exact VideoClip media name. Never claim the insert is ready before status says ready.'
