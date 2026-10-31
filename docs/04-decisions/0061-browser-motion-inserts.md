---
status: accepted
date: 2026-10-31
---

# 0061 — Short, provider-neutral browser motion inserts

## Context

Claude Design/Motion, Gemini Canvas and coding agents can produce editable, code-based visuals. Some dense mechanisms, particle diagrams or interface demonstrations are easier to author with SVG/Canvas than manim. This does not replace mathematical construction, narration, or the render-derived timeline. We found no documented public endpoint for embedding Claude Motion itself; its product access and usage rules are separate from an Agent SDK tool.

## Decision

- Give Claude, Codex and Antigravity the same `render_motion` scene tool through the existing SDK/MCP paths. It renders agent-authored HTML locally, without a separate design-product login, model, paid video service, browser automation, or runtime dependency.
- Manim remains the default. The shared agent brief permits an insert only when it materially simplifies a difficult visual, not for decoration or a whole lesson. It uses the currently selected model and ordinary account/API usage; source generation and reviewing images still consume usage. We cannot predict a subscription percentage or completion time for a proposed insert.
- The tool saves editable HTML in `media/motion-<name>.json`. The first call supplies `name`, `html`, and `seconds`; later calls use just `name` and `mode`. Preview is the default and returns first/middle/last images. A successful preview must exist before a full render is accepted. Status polls neither restart a render nor resend source. Callers must inspect the preview and wait for ready before using the result.
- `window.renderFrame(t)` seeks to absolute seconds, including backward seeks. Source must be self-contained: inline SVG, Canvas, CSS and embedded data images/fonts, with no external assets, timers, randomness or animation loops. CSS animations are paused and sought for each frame. The tool does not promise determinism for code that ignores this contract.
- Inserts are bounded to 0.5–12 seconds, 1080p in the project's orientation, 30 fps (at most 360 frames). Three preview images are downscaled; full frames retain 1080p. Frame operations time out after five seconds, and an active task after two minutes. Browser capture and manim use the same local drawing queue. This preserves [[0035-720p-study-videos]]' final-export defaults; 1440p delivery may upscale the insert.
- A hidden Electron renderer runs in an ephemeral session with sandbox and context isolation, no preload, no Node integration, no Studio bridge, no permissions, no popups, no navigation and no webviews. CSP and a request filter block network, files, frames, workers and remote resources. Agent-generated code never runs in the application renderer.
- A content hash covers source, timing, orientation, name, platform and renderer version. Source stays with the project; previews and intermediate PNGs live in the app render cache, and a successful silent MP4 becomes ordinary `media/motion-<name>-<hash>.mp4`. Repeated calls reuse it; changed source leaves earlier media untouched. Encoding uses existing PyAV/libx264, replaces the output atomically and removes temporary frames on failure/cancellation.
- A scene uses the returned file with the existing `VideoClip` helper, and keeps narration/subtitles and chapter boundaries in `StudioScene`. No timeline-contract extension is needed. The MP4 remains viewable without this browser renderer or any agent account.
- Active tasks participate in busy/quit/uninstall checks. Shutdown cancels browser work, stops encoding and removes incomplete frames; the saved source can be previewed/rendered again after reopening. A missing cache or unfinished job does not masquerade as a completed clip.

## Evidence checked on 2026-10-31

- [Claude Motion](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion): code-based animations, MP4 export, Team/Enterprise beta, and longer/complex animations consuming more plan usage.
- [Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design): designs/prototypes and Claude Code handoff; current design work shares Claude limits. Earlier separate allowances are not a reliable guide to current usage.
- [Gemini 3.1 Pro](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/): animated SVGs and interactive graphics generated as code. [Canvas](https://blog.google/products-and-platforms/products/gemini/gemini-collaboration-features/) previews HTML/React.
- [OpenAI's frontend guidance](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4) documents Codex's visual coding workflow. This supports a shared code-generation route; it does not establish a Claude Motion-equivalent service or comparative speed.
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security) and [offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) inform the isolated renderer and capture implementation.

No official source above establishes a fixed latency, tokens per animation, or percentage of a subscription limit. Studio therefore reports actual job progress and the existing provider usage data, not guessed animation prices or usage percentages.

## Consequences

The feature adds a narrowly scoped alternative drawing surface while retaining the existing video pipeline. It supports intricate 2D/browser visuals, not arbitrary Blender projects, remote design-product features, photorealistic video generation, or externally imported web dependencies. Large scenes should be simplified or returned to manim. All text inside the insert must follow the project's narration language, palette and subtitle-safe area.
