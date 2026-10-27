import { RefreshCw, Wrench } from 'lucide-react'
import type { Component } from '../../../shared/types'
import { api } from '../lib/api'
import { localize, t as uiText } from '../lib/i18n'
import { installComponent, openDialog, useStore } from '../store'

/** Missing tools block new renders, never a student's existing videos or notes. */
export function EnvironmentRepair() {
  const setup = useStore((s) => s.setup)
  const returning = useStore((s) => !!s.settings?.onboardingDone)
  const releases = useStore((s) => s.app?.releasesUrl)
  if (!setup || !returning) return null
  const broken = (['env', 'latex'] as const).filter((c) => setup[c] !== 'ready')
  if (!broken.length) return null
  const installing = broken.every((c) => setup[c] === 'installing')
  return <aside className="environment-repair" role="status">
    <Wrench />
    <div><strong>{uiText(installing ? 'Installing…' : 'Video tools need repair')}</strong><span>{uiText('Your saved videos and projects are safe. Reinstall the tools to make videos again.')}</span></div>
    <div className="environment-repair-actions">
      {!setup.pixi ? <button className="btn small" onClick={() => releases && void api.openExternal(releases)}>{uiText('Reinstall Manim Studio')}</button> : broken.map((c: Component) => <button className="btn small" key={c} disabled={setup[c] === 'installing'} onClick={() => void installComponent(c, true)}><RefreshCw className={setup[c] === 'installing' ? 'spin' : ''} />{uiText('Reinstall')} · {localize(c === 'env' ? 'Manim environment' : 'LaTeX (TinyTeX)')}</button>)}
      <button className="btn small ghost" onClick={() => openDialog({ kind: 'settings', tab: 'env' })}>{uiText('Details')}</button>
    </div>
  </aside>
}
