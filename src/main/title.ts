// A project title from a quick-mode request, when the user gave none.

/** "Explain the vertex of a parabola, with two examples" → "Explain the vertex of a parabola". */
export function titleFrom(prompt: string): string {
  const first = prompt.trim().split(/[.!?\n]/)[0].replace(/\s+/g, ' ').trim()
  const short = first.length > 60 ? first.slice(0, 60).replace(/[\s,;:]+\S*$/, '') : first
  const clause = short.split(/,\s/)[0]
  return (clause.length >= 12 ? clause : short) || 'Quick video'
}
