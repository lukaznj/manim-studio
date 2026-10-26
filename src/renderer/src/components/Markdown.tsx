// Just enough Markdown for the agent's replies and an exercise's problem and solution: paragraphs,
// headings, lists, code, bold, inline code, and maths between $…$ (inline) and $$…$$ (display),
// typeset with KaTeX. Bad LaTeX shows as written, in red, rather than breaking the text around it.
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { ReactNode } from 'react'

function math(tex: string, display: boolean, key: number): ReactNode {
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' })
  return display ? (
    <div key={key} className="md-math" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span key={key} dangerouslySetInnerHTML={{ __html: html }} />
  )
}

const LIST = /^\s*([-*]|\d+[.)])\s/

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(
        <pre key={blocks.length} className="md-code mono">
          {code.join('\n')}
        </pre>,
      )
      continue
    }
    if (line.trim().startsWith('$$') || line.trim().startsWith('\\[')) {
      // Display maths, on one line or several: up to the line that ends with $$.
      const closing = line.trim().startsWith('$$') ? '$$' : '\\]'
      const tex: string[] = [line.trim().slice(2)]
      while (!tex[tex.length - 1].trimEnd().endsWith(closing) && i + 1 < lines.length) tex.push(lines[++i])
      i++
      blocks.push(math(tex.join('\n').trimEnd().replace(/(?:\$\$|\\\])$/, ''), true, blocks.length))
      continue
    }
    if (LIST.test(line)) {
      const items: string[] = []
      const ordered = /^\s*\d+[.)]/.test(line)
      while (i < lines.length && LIST.test(lines[i])) items.push(lines[i++].replace(LIST, ''))
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={blocks.length}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>,
      )
      continue
    }
    if (/^#{1,4}\s/.test(line)) {
      blocks.push(
        <p key={blocks.length} className="md-h">
          {inline(line.replace(/^#+\s/, ''))}
        </p>,
      )
      i++
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !lines[i].trim().startsWith('$$') && !lines[i].trim().startsWith('\\[') && !LIST.test(lines[i]))
      para.push(lines[i++])
    blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
  }
  return <>{blocks}</>
}

export function inline(text: string): ReactNode[] {
  return text.split(/(\\\([^\n]+?\\\)|\\\[[^\n]+?\\\]|\$\$[^$]+\$\$|\$[^$\n]+\$|`[^`]+`|\*\*[^*]+\*\*)/g).map((seg, k) => {
    if (seg.startsWith('\\(') && seg.endsWith('\\)')) return math(seg.slice(2, -2), false, k)
    if (seg.startsWith('\\[') && seg.endsWith('\\]')) return math(seg.slice(2, -2), true, k)
    if (seg.startsWith('$$') && seg.endsWith('$$') && seg.length > 4) return math(seg.slice(2, -2), true, k)
    if (seg.startsWith('$') && seg.endsWith('$') && seg.length > 2) return math(seg.slice(1, -1), false, k)
    if (seg.startsWith('`') && seg.endsWith('`')) return <code key={k}>{seg.slice(1, -1)}</code>
    if (seg.startsWith('**') && seg.endsWith('**')) return <strong key={k}>{seg.slice(2, -2)}</strong>
    return seg
  })
}
