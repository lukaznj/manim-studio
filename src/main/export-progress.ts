/** Aggregate completed animations across slices, including uneven slices and cached animations.
 * Each runner reports its global animation count, including those skipped before its range. */
export function sliceProgress(animations: number, slices: number, report: (percent: number) => void): (slice: number, clips: number) => void {
  const size = Math.ceil(animations / slices)
  const completed = Array<number>(slices).fill(0)
  return (slice, clips) => {
    const start = slice * size
    const count = Math.max(0, Math.min(Math.min(size, animations - start), clips - start))
    if (count <= completed[slice]) return
    completed[slice] = count
    report(completed.reduce((sum, n) => sum + n, 0) / animations)
  }
}
