/** Page numbers as people write them: [3, 4, 5, 8] → "3–5, 8". */
export function pageRanges(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    while (sorted[i + 1] === sorted[i] + 1) i++
    out.push(start === sorted[i] ? String(start) : `${start}–${sorted[i]}`)
  }
  return out.join(', ')
}
