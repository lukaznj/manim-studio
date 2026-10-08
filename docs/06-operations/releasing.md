# Releasing

How auto-update works: [[../04-decisions/0006-auto-update-github-releases|ADR 0006]].

## One-time setup

1. Create the **public** repo `lukaznj/manim-studio-releases`. It can be empty; CI uploads releases to it.
2. In the source repo, add these GitHub Actions secrets:

   | Secret | What |
   |---|---|
   | `RELEASES_TOKEN` | Fine-grained PAT with *Contents: read & write* on `manim-studio-releases` |
   | `MAC_CERT_P12_BASE64` | "Developer ID Application" certificate + key, exported as .p12, then `base64 -i cert.p12` |
   | `MAC_CERT_PASSWORD` | The .p12 password |
   | `APPLE_ID` | Apple ID email of the developer account |
   | `APPLE_APP_SPECIFIC_PASSWORD` | appleid.apple.com → App-Specific Passwords |
   | `APPLE_TEAM_ID` | 10-character team id |

   Without the Apple secrets the macOS build is unsigned. It installs (right-click → Open the first time), but can't auto-update; the app then offers the release page instead.

## Each release

```bash
npm version minor          # or patch; bumps package.json and tags vX.Y.Z
git push --follow-tags     # CI builds macOS arm64 + Windows x64 and publishes
```

Installed apps notice within 4 hours, or on next start. Colleagues click the update pill, and the update installs on restart. If the release changed `python/pixi.toml` or `pixi.lock`, the app re-syncs its Python environment on the next start.

## Local package (no publish)

```bash
npm run fetch-pixi
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --publish never
```

This produces `dist/Manim Studio-<v>-arm64.dmg` (about 270 MB) and `latest-mac.yml`.

## Alternatives

- **Intel Macs:** add a `macos-13` job with `--mac --x64` and `node scripts/fetch-pixi.mjs darwin x64`. Merging two `latest-mac.yml` files from separate jobs needs care, so build both arches in one job if both are needed.
- **R2 instead of GitHub:** set `publish: { provider: generic, url: https://<bucket-domain>/manim-studio }`, build with `--publish never`, and upload `dist/latest*.yml`, the installers and the `.blockmap` files.
