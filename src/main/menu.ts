// The macOS menu bar: every command lives here, the standard Mac way (Settings… is ⌘, in the app
// menu). Commands that need the window are sent to it as `menu` events and run the same code as
// the buttons. Rebuilt whenever what it shows changes: the open project, recents, appearance.
// Windows and Linux have no menu bar (the title bar is drawn by the page) and keep their buttons.
import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { mkdirSync } from 'node:fs'
import type { MenuAction } from '../shared/types'
import { checkForUpdates, RELEASES_URL } from './updater'
import { listProjects, project } from './projects'
import { getSettings } from './settings'

const REPO_URL = 'https://github.com/lukaznj/manim-studio'

/** The app's logs folder, where memory.ts writes memory.log. */
function showLogs(): void {
  const dir = app.getPath('logs')
  mkdirSync(dir, { recursive: true })
  void shell.openPath(dir)
}

let send: (action: MenuAction, extra?: { path?: string; value?: string }) => void = () => {}
let installExtension: () => void = () => {}

export function setupMenu(fn: typeof send, onInstallExtension: () => void): void {
  send = fn
  installExtension = onInstallExtension
  // Without a menu of our own, Electron keeps its default one: hidden by the page-drawn title bar,
  // but its accelerators still fire, so Ctrl+Shift+R (Record voice) force-reloaded the window.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  refreshMenu()
}

export function refreshMenu(): void {
  if (process.platform !== 'darwin') return
  const open = !!project()
  const appearance = getSettings().appearance
  const item = (label: string, action: MenuAction, accelerator?: string, extra: Partial<MenuItemConstructorOptions> = {}): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => send(action),
    ...extra,
  })
  // Space and R have no menu shortcut on purpose: the page handles them, and only when you're not
  // typing. On macOS even a display-only accelerator (registerAccelerator: false) still fires for
  // keys the page lets through, so typing a space in the chat would toggle playback.
  const recent = listProjects().filter((p) => !p.missing).slice(0, 10)

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => void checkForUpdates() },
        { type: 'separator' },
        item('Settings…', 'settings', 'Cmd+,'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        item('New Project…', 'new-project', 'Cmd+N'),
        item('Quick Video…', 'quick', 'Shift+Cmd+N'),
        item('New Series…', 'series'),
        item('Open Project…', 'open-project', 'Cmd+O'),
        {
          label: 'Open Recent',
          enabled: recent.length > 0,
          submenu: recent.map((p) => ({ label: p.name, click: () => send('open-recent', { path: p.path }) })),
        },
        { type: 'separator' },
        item('Save and Render', 'save', 'Cmd+S', { enabled: open }),
        item('Export Video…', 'export', 'Cmd+E', { enabled: open }),
        { type: 'separator' },
        { label: 'Show in Finder', enabled: open, click: () => open && shell.showItemInFolder(project()!.path) },
        item('Close Project', 'close-project', 'Shift+Cmd+W', { enabled: open }),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Video',
      submenu: [
        item('Play / Pause', 'play', undefined, { enabled: open }),
        item('Render Preview', 'render', undefined, { enabled: open }),
        { type: 'separator' },
        item('Record Voice…', 'booth', 'Shift+Cmd+R', { enabled: open }),
        item('Version History…', 'history', 'Cmd+Y', { enabled: open }),
      ],
    },
    {
      label: 'Claude',
      submenu: [
        item('New Conversation', 'new-conversation', undefined, { enabled: open }),
        { type: 'separator' },
        item('Account, Model and Usage…', 'claude-settings'),
        { label: 'Add to Claude Desktop…', click: installExtension },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Appearance',
          submenu: (['system', 'light', 'dark'] as const).map((value) => ({
            label: value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark',
            type: 'radio' as const,
            checked: appearance === value,
            click: () => send('appearance', { value }),
          })),
        },
        { type: 'separator' },
        ...(app.isPackaged ? [] : ([{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] as MenuItemConstructorOptions[])),
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        item('Show Tutorial', 'tutorial'),
        { type: 'separator' },
        { label: 'Manim Studio Help', click: () => void shell.openExternal(`${REPO_URL}#readme`) },
        { label: 'Manim Documentation', click: () => void shell.openExternal('https://docs.manim.community') },
        { type: 'separator' },
        { label: 'Releases', click: () => void shell.openExternal(RELEASES_URL) },
        { label: 'Report an Issue', click: () => void shell.openExternal(`${REPO_URL}/issues`) },
        { label: 'Show Logs', click: showLogs },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
