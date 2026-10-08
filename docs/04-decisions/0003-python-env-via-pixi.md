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

## Consequences

- Colleagues need nothing installed. The first-run panel takes about a minute on a warm cache and longer on a fresh machine (roughly 750 MB + 250 MB).
- Videos look the same on every machine: Nunito is bundled and registered with Pango, because conda's fontconfig maps the generic sans-serif to a serif face.
- The app must never fall back to a `pixi` on PATH; an older one can't read the lock file. That actually happened in testing.
