// electron-builder afterPack hook (macOS): Electron's helper apps (Manim Studio Helper,
// Helper (Renderer), (GPU), (Plugin)) have no icon, so Activity Monitor shows a blank one for
// them. This gives each the app's icon. afterPack runs before signing, so the signature covers it.
const { execFileSync } = require('node:child_process')
const { copyFileSync, mkdirSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

exports.default = function helperIcons(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents')
  const frameworks = join(app, 'Frameworks')
  for (const helper of readdirSync(frameworks).filter((name) => name.endsWith('.app'))) {
    const contents = join(frameworks, helper, 'Contents')
    mkdirSync(join(contents, 'Resources'), { recursive: true })
    copyFileSync(join(app, 'Resources', 'icon.icns'), join(contents, 'Resources', 'icon.icns'))
    execFileSync('plutil', ['-replace', 'CFBundleIconFile', '-string', 'icon.icns', join(contents, 'Info.plist')])
  }
}
