import { Check, FolderOpen, HardDrive, Cloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FolderInfo, ProjectsFolders } from '../../../shared/types'
import { api } from '../lib/api'
import { currentLanguage, format, t } from '../lib/i18n'
import { uiLocale } from '../../../shared/ui-languages'

type Say = (en: string, croatian: string) => string

/** Labeled counts avoid inventing a two-form plural system for every language. */
export function foundText(found: NonNullable<FolderInfo['found']>): string {
  const parts = [
    found.videos && format('Videos: {0}', [found.videos]),
    found.courses && format('Courses: {0}', [found.courses]),
    found.exerciseSets && format('Exercise sets: {0}', [found.exerciseSets]),
  ].filter(Boolean) as string[]
  return new Intl.ListFormat(uiLocale(currentLanguage()), { style: 'long', type: 'conjunction' }).format(parts)
}

/**
 * Onboarding: where projects go (ADR 0043). Only on this computer by default; Documents, saying
 * when a cloud drive syncs it; or a folder that already holds Manim Studio projects (a returning
 * user's), which Home then lists. Render caches stay out of every one of them.
 */
export function ProjectsFolderStep({ say, value, onChange }: { say: Say; value: string | null; onChange: (path: string) => void }) {
  const [folders, setFolders] = useState<ProjectsFolders | null>(null)
  const [picked, setPicked] = useState<FolderInfo | null>(null)
  useEffect(() => {
    void api.projectsFolders().then((f) => {
      setFolders(f)
      // A returning user's projects in the old place come first; otherwise this computer.
      if (!value) onChange(f.documents.found ? f.documents.path : f.local.path)
    })
  }, [])
  if (!folders) return <p className="faint">…</p>

  const choose = async () => {
    const dir = await api.pickFolder(say('Your Manim Studio folder', 'Vaša mapa Manim Studija'), folders.documents.path)
    if (!dir) return
    const info = await api.inspectFolder(dir)
    setPicked(info)
    onChange(info.path)
  }
  const card = (info: FolderInfo, title: string, text: string, icon: React.ReactNode, recommended = false) => (
    <button
      key={info.path + title}
      role="radio"
      aria-checked={value === info.path}
      className={`provider-card folder-card ${value === info.path ? 'on' : ''}`}
      onClick={() => onChange(info.path)}
    >
      <span className="folder-card-head">
        {icon}
        <strong>{title}</strong>
        {recommended && <span className="badge sun">{say('Recommended', 'Preporučeno')}</span>}
        {value === info.path && <Check className="folder-card-check" />}
      </span>
      <span className="mono faint folder-card-path">{info.path}</span>
      {info.found && <span className="folder-card-found">{foundText(info.found)}</span>}
      <span className="hint">{text}</span>
    </button>
  )
  const syncedText = (cloud: string) => format('{0} syncs this folder: your projects are backed up and on your other devices, but they use your cloud storage, and exports are big. Studio keeps its render cache out of it.', [cloud])

  return (
    <>
      <p>
        {say(
          'Projects hold your videos’ code, narration, media and exports. Exports in particular are big, so by default they stay on this computer, out of iCloud or OneDrive.',
          'Projekti sadrže kod, pripovijedanje, medije i izvoze vaših videozapisa. Izvozi su posebno veliki, pa su zadano na ovom računalu, izvan iClouda ili OneDrivea.',
        )}
      </p>
      <div className="folder-choices" role="radiogroup" aria-label={say('Projects folder', 'Mapa projekata')}>
        {folders.documents.found &&
          card(
            folders.documents,
            say('Your existing projects', 'Vaši postojeći projekti'),
            folders.documents.cloud
              ? syncedText(folders.documents.cloud)
              : say('Where Manim Studio kept them before.', 'Gdje ih je Manim Studio prije spremao.'),
            <FolderOpen />,
          )}
        {card(
          folders.local,
          say('Only on this computer', 'Samo na ovom računalu'),
          say(
            'Nothing is uploaded. Back it up like your other files, with Time Machine or File History, or an external disk.',
            'Ništa se ne prenosi. Sigurnosno ga kopirajte kao i ostale datoteke, Time Machineom, Poviješću datoteka ili vanjskim diskom.',
          ),
          <HardDrive />,
          !folders.documents.found,
        )}
        {!folders.documents.found &&
          card(
            folders.documents,
            say('In Documents', 'U Dokumentima'),
            folders.documents.cloud ? syncedText(folders.documents.cloud) : say('Your Documents folder.', 'Vaša mapa Dokumenti.'),
            folders.documents.cloud ? <Cloud /> : <FolderOpen />,
          )}
        {picked &&
          picked.path !== folders.local.path &&
          picked.path !== folders.documents.path &&
          card(
            picked,
            say('The folder you chose', 'Mapa koju ste odabrali'),
            picked.found
              ? picked.cloud
                ? syncedText(picked.cloud)
                : say('Home lists everything in it.', 'Početna stranica prikazuje sve u njoj.')
              : say('No Manim Studio projects in it yet: new ones go here.', 'U njoj još nema projekata Manim Studija: novi idu ovdje.'),
            picked.cloud ? <Cloud /> : <FolderOpen />,
          )}
      </div>
      <button className="link-btn" onClick={() => void choose()}>
        {say('I already have a Manim Studio folder somewhere else…', 'Već imam mapu Manim Studija negdje drugdje…')}
      </button>
    </>
  )
}
