import type { UiLanguage } from './ui-languages'

const placeholders = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join('|')
const names = ['Manim Studio', 'Claude', 'Codex', 'Antigravity', 'ChatGPT', 'OpenAI', 'ElevenLabs', 'OmniVoice', 'Gemini']

/** Structural checks for offline translation drafts; these do not replace native-language review. */
export function uiCatalogIssues(language: UiLanguage, key: string, value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return ['missing message']
  const issues: string[] = []
  if (placeholders(key) !== placeholders(value)) issues.push('placeholders changed')
  if (/ZXQ\d+QXZ|\{9\d{3}\}|9\d{4}\s*[|｜]|<unk>/i.test(value)) issues.push('generation marker')
  for (const name of names)
    // Existing Croatian copy deliberately uses generic "agent" instead of "Claude" in some guidance.
    if (!(language === 'hr' && name === 'Claude') && key.includes(name) && !value.includes(name)) issues.push(`${name} changed`)
  for (const year of value.match(/\b(?:18|19|20)\d{2}\b/g) ?? [])
    if (!key.includes(year)) { issues.push('unexpected year'); break }
  const words = value.toLowerCase().match(/\p{L}+/gu) ?? []
  if (value !== key) {
    outer: for (let period = 2; period <= Math.min(16, Math.floor(words.length / 3)); period++) {
      for (let end = period * 3; end <= words.length; end++) {
        const chunk = words.slice(end - period, end).join(' ')
        if (chunk === words.slice(end - period * 2, end - period).join(' ') && chunk === words.slice(end - period * 3, end - period * 2).join(' ')) {
          issues.push('repetitive translation')
          break outer
        }
      }
    }
  }
  if (value.length > Math.max(400, key.length * 4)) issues.push('translation is unexpectedly long')
  return issues
}
