/** A folder name from a title: accents dropped (č→c, é→e), letters NFKD can't split mapped. */
export function slugify(name: string): string {
  const special: Record<string, string> = { đ: 'd', ß: 'ss', ø: 'o', æ: 'ae', ł: 'l', œ: 'oe', þ: 'th' }
  return (
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[đßøæłœþ]/g, (c) => special[c])
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .slice(0, 60) || 'project'
  )
}
