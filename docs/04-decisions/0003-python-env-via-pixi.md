---
status: accepted
date: 2026-10-08
---

# 0003 — Python, manim and LaTeX are installed by the app

## Context

On macOS, `pip install manim` compiles pycairo, which needs Xcode, Homebrew cairo and pkg-config. It even failed on the lead dev's machine (the macOS 27 SDK mismatch). The colleagues aren't developers. manim's `MathTex` also needs a LaTeX installation.

## Decision

- **Python through pixi.** A pixi binary ships with the app (`resources/bin`, fetched and sha256-checked by `scripts/fetch-pixi.mjs`).
  - On first run the app copies `python/pixi.toml` + `pixi.lock` into its data folder and runs `pixi install --frozen`.
  - conda-forge provides prebuilt cairo/pango/pycairo/manimpango/av for macOS and Windows; manim and manim-voiceover come from PyPI.
  - Optional features (`omnivoice`, `transcribe`) are separate pixi environments installed on demand.
- **LaTeX through TinyTeX.**
  - The TinyTeX-1 release is unpacked into the data folder, `tlmgr` updates itself, then installs the packages manim's TexTemplate uses.
  - LaTeX counts as ready only once a marker file is written after the packages install.
- **Activation.** Renders run the env's python directly, with the activation variables from `pixi shell-hook --json` and TinyTeX's `bin` on PATH. Inherited `CONDA_*`, `PIXI_*` and `PYTHON*` variables are stripped.
- **Updates.** When an app update changes the manifest or lock, the hash mismatch triggers a quiet `pixi install` on next start.
- **Health and repair.** Folder/marker presence is insufficient: check managed Python and TinyTeX executables plus essential TeX packages. Bounded background execution checks the bundled installer, Python imports/native libraries and LaTeX tools at startup/on returning to the app; Settings → Environment can force a fresh check. Known missing-module/compiler failures from a runner also invalidate readiness, without treating ordinary scene bugs or invalid LaTeX as installation failures. Never fall back to a system Conda/Pixi/TeX installation to hide damage.
- **Reinstallation.** Offer a component-specific reinstall in Environment settings and a compact repair notice to returning users. Recreate only the affected app-owned environment prefix, invalidate activation caches and verify the result before reporting ready. Serialize Pixi operations, deduplicate repeated requests, refuse replacement during agents/renders/exports, settle an idle speech worker first, and protect installation work during quit. Projects, PDFs, videos, narration, credentials and other applications' runtimes are outside repair scope. A missing/damaged bundled installer links to reinstalling Studio itself.
- **Keep studying.** Initial onboarding still installs required tools automatically. A later missing/damaged runtime leaves the library, exported videos, chat history and notes accessible while the user chooses repair; it does not force them through first-run setup or silently start a large download.

## Consequences

- Colleagues need nothing installed. The first-run panel takes about a minute on a warm cache and longer on a fresh machine (roughly 750 MB + 250 MB).
- Videos look the same on every machine: Nunito is bundled and registered with Pango, because conda's fontconfig maps the generic sans-serif to a serif face.
- The app must never fall back to a `pixi` on PATH; an older one can't read the lock file. That actually happened in testing.
- These remain private app-managed dependencies, not separately registered system Conda or LaTeX installations. Bundling the small installer and downloading large runtimes on demand keeps application updates smaller. Deleting a macOS app bundle does not run an uninstall hook; any future cleanup flow must explicitly remove only app-owned runtimes/caches and retain user projects. Windows' existing app-data preservation policy is unchanged by repair.

[[0056-private-runtime-cleanup]] adds private package/model caches, a protected remove-tools action and platform uninstall integration. Shared system environments and legacy shared caches are never removed.
