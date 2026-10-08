# Releasing

How auto-update works: [[../04-decisions/0006-auto-update-github-releases|ADR 0006]].

## Each release

```bash
npm version minor          # or patch; bumps package.json and tags vX.Y.Z
git push --follow-tags     # .github/workflows/release.yml takes it from here
```

1. CI creates a draft release for the tag.
2. It builds macOS arm64 (dmg + zip), Windows x64 (NSIS) and Linux x64 (AppImage), and uploads each with its `latest*.yml` and blockmaps.
3. Once all three succeed, it publishes the release. If one fails, the draft stays. Fix it, delete the draft and the tag, and tag again.

Installed apps notice within 4 hours, or on their next start. Users click the update pill, and the update installs on restart. If the release changed `python/pixi.toml` or `pixi.lock`, the app re-syncs its Python environment on the next start.

Before the first public release, settle the open sign-in question in [[../04-decisions/0004-claude-via-agent-sdk|ADR 0004]].

## Signing (optional)

Nothing is required: CI publishes with the workflow's own `GITHUB_TOKEN`. Without the secrets below:

- macOS builds are ad-hoc signed. Users open them once through **System Settings → Privacy & Security → Open Anyway**. They can't update themselves, so the app links to the release page instead.
- Windows installers are unsigned, so SmartScreen warns until the publisher builds reputation.

To sign and notarize macOS builds, add these repository secrets:

| Secret | What |
|---|---|
| `MAC_CERT_P12_BASE64` | "Developer ID Application" certificate + key, exported as .p12, then `base64 -i cert.p12` |
| `MAC_CERT_PASSWORD` | The .p12 password |
| `APPLE_ID` | Apple ID e-mail of the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | appleid.apple.com → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-character team id |

## Local package (no publish)

```bash
npm run fetch-pixi
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 -c.mac.identity=- --publish never
```

This produces `dist/Manim Studio-<v>-arm64.dmg` (about 270 MB) and `latest-mac.yml`. Add `--dir` for just the `.app`. For another OS, run `node scripts/fetch-pixi.mjs <platform> <arch>` first (`win32 x64`, `linux x64`), or take the installers from a CI run.

## Alternatives

- **Intel Macs:**
  - `resources/bin` would need an x64 pixi next to the arm64 one. Today it holds a single binary.
  - Both arches must build in one job, because two jobs would each write their own `latest-mac.yml`.
- **R2 or S3 instead of GitHub:** set `publish: { provider: generic, url: https://<bucket-domain>/manim-studio }`, build with `--publish never`, and upload `dist/latest*.yml`, the installers and the `.blockmap` files.
