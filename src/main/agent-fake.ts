// A stand-in for Claude in a series' background agents, for driving the app in tests without a
// signed-in agent (STUDIO_FAKE_AGENT=1; "limit" also hits one usage limit, STUDIO_FAKE_LIMIT_MS long). It writes a real script
// and scene and renders them through the same per-project path a real agent's tools use.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentOptions, EpisodeAgent } from './agent'
import { appendUsage } from './usage'
import { readMeta } from './projects'
import { currentOrNewRender } from './render'
import { setTimeout as delay } from 'node:timers/promises'
import type { SeriesDraft, SeriesPlan, SeriesPlanProgress } from '../shared/types'

/** Only in a driven test profile (with STUDIO_USER_DATA), never in a real install. */
export const fakeAgents = (): boolean => !!(process.env.STUDIO_FAKE_AGENT && process.env.STUDIO_USER_DATA)

let limitedOnce = false
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Exercise the real planning lifecycle without sending documents or spending an account's usage. */
export async function fakeSeriesPlan(req: SeriesDraft['request'], report: (p: SeriesPlanProgress) => void, signal?: AbortSignal): Promise<SeriesPlan> {
  report({ stage: 'planning', total: req.pdfs.length, read: [], episodes: [], startedAt: Date.now() })
  await delay(2500, undefined, { signal })
  return { title: req.topic ?? 'Recovery test', bible: 'Use consistent notation.', episodes: [1, 2].map((n) => ({ title: `Test episode ${n}`, summary: `Teach topic ${n}.`, sources: [], buildsOn: n > 1 ? [n - 1] : [] })) }
}

export function fakeAgent(dir: string, { onTool, onUsage, model }: AgentOptions): EpisodeAgent {
  const meta = readMeta(dir)
  const n = meta.series?.episode ?? 1
  // What a turn would have used: made up, but shaped like the real thing.
  const used = (step: string, tools: Record<string, number>, scale: number) => {
    const entry = {
      at: Date.now(),
      step,
      models: {
        [model || 'claude-sonnet-5-5']: {
          input: 2_000 * scale,
          output: 9_000 * scale,
          cacheRead: 180_000 * scale,
          cacheWrite: 30_000 * scale,
          costUSD: 0.35 * scale,
        },
      },
      tools,
      ms: 2_500,
    }
    appendUsage(dir, entry)
    onUsage(entry)
  }
  return {
    async turn(text, step) {
      await sleep(1000)
      if (/^Solve the exercise/.test(text)) {
        onTool('Checking a calculation')
        await sleep(1200)
        used(step, { Read: 2, mcp__studio__calculate: 2, Write: 1 }, 0.4)
        writeFileSync(
          join(dir, 'solution.md'),
          `---\ntopic: Quadratic equations\ntags: [roots, factoring, parabola]\nanswer: $x = 2$ or $x = 3$\n---\n# ${meta.name}\n\nWe factor the quadratic and read off the roots.\n\n## Factor\nWe look for two numbers with sum $5$ and product $6$: they are $2$ and $3$, so\n$$x^2 - 5x + 6 = (x - 2)(x - 3).$$\n\n## Zero product\nA product is zero when one factor is: $x - 2 = 0$ or $x - 3 = 0$.\n\n## Answer\n$x = 2$ or $x = 3$. Check: $2^2 - 5 \\cdot 2 + 6 = 0$.\n`,
        )
        return { ok: true }
      }
      if (/only the script/.test(text)) {
        onTool('Writing script.md')
        await sleep(1500)
        used(step, { Read: 3, mcp__studio__read_source: 2, Write: 1 }, 1)
        writeFileSync(
          join(dir, 'script.md'),
          `---\nstatus: approved\n---\n# ${meta.name}\n\n**The idea:** what episode ${n} is about.\n\n## Opening\n**Narration:**\n> Hello.\n`,
        )
        return { ok: true }
      }
      if (process.env.STUDIO_FAKE_AGENT === 'limit' && n === 2 && !limitedOnce) {
        limitedOnce = true
        return { ok: false, error: 'limit', limitedUntil: Date.now() + Number(process.env.STUDIO_FAKE_LIMIT_MS ?? 5_000) }
      }
      onTool('Writing scene.py')
      writeFileSync(
        join(dir, 'scene.py'),
        `from manim import *\nfrom studio import *\n\n\nclass Video(StudioScene):\n    def construct(self):\n        self.next_section("${meta.exercise ? 'Exercise' : 'Opening'}")\n        t = Text("${meta.exercise ? `Exercise ${meta.exercise.number}` : `Episode ${n}`}", font_size=56)\n        self.play(Write(t))\n        for i in range(14):\n            ${meta.exercise ? 'if i % 4 == 3:\n                self.next_section(["Factor", "Zero product", "Answer"][i // 4])\n            ' : ''}self.play(t.animate.shift(UP * 0.2 if i % 2 else DOWN * 0.2), run_time=0.5)\n        self.wait(1)\n`,
      )
      onTool('Rendering the preview')
      await currentOrNewRender(dir)
      onTool('Looking at frames 1.0s, 4.0s')
      await sleep(800)
      used(step, { Write: 1, Edit: 4, mcp__studio__render_preview: 3, mcp__studio__view_frames: 5 }, 3)
      return { ok: true }
    },
    close() {},
  }
}
