# Decisions

One note per non-obvious decision, from [[_template]]. Keep this index in sync: an agent reads the status here before changing anything a decision covers. If a change contradicts an *accepted* decision, say so and update the ADR, don't silently route around it.

| ADR | Decision | Status |
|---|---|---|
| [[0001-electron-desktop-app]] | Desktop app on Electron, not a web app | accepted |
| [[0002-timeline-derived-from-render]] | The timeline is produced by each render; no separate model | accepted |
| [[0003-python-env-via-pixi]] | Private Python/Pixi and TinyTeX installs, health checks, safe component reinstall and continued access to saved videos | accepted |
| [[0004-claude-via-agent-sdk]] | Claude through the Agent SDK with each user's own sign-in or API key | accepted |
| [[0005-voice-providers]] | ElevenLabs, OmniVoice and recordings, chosen per project; sidecar subtitles | accepted |
| [[0006-auto-update-github-releases]] | Auto-update from this repo's GitHub Releases, three platforms | accepted |
| [[0007-history-is-git]] | Version history is git, committed automatically | accepted |
| [[0008-ink-at-night-design]] | "Ink at night" design language with a light twin (System by default), rounded M mark and Liquid Glass icon on plain navy | accepted |
| [[0009-mcp-server-later]] | Claude Desktop drives Studio through an extension (.mcpb) and a local endpoint | accepted |
| [[0010-fixed-aspect-per-project]] | 16:9 or 9:16 chosen per project, fixed | accepted |
| [[0011-open-source-english]] | Open source, English, platform integrations in forks; MIT licensing superseded by 0054 | accepted (licensing superseded) |
| [[0012-own-media-in-scenes]] | Your own pictures and videos go into the scene through studio helpers, not a separate track | accepted |
| [[0013-export-versions-and-languages]] | Export light and dark versions, dubbed audio tracks and subtitles; preserve project look metadata without Settings controls | accepted |
| [[0014-pdf-sources]] | PDFs are sources in the project, read by Claude through Studio tools and shown with pdf_page() | accepted |
| [[0015-tone-and-pacing]] | Tone per project (professional, warm, playful); pacing by clarity, no target length | accepted |
| [[0016-script-first]] | Every agent plans in script.md before scene.py; scripting is always enabled and series share a series.md | accepted |
| [[0017-background-export-queue]] | Exports run in a background queue, one at a time, each on a copy of its project | accepted |
| [[0018-quick-mode]] | Quick video uses resumable project-bound background agents, the configured export theme and shared production progress | accepted |
| [[0019-series-mode]] | Series mode: Claude plans episodes and a series bible from a course's PDFs; episodes refer back through series.md | accepted |
| [[0020-parallel-exports]] | Exports draw slices of the animations in parallel into the shared cache, then render once | accepted |
| [[0021-render-servers]] | Exports can render on a paired worker (Docker, pairing code with a token); narration stays local | accepted |
| [[0022-codex-as-second-agent]] | Codex as a second agent: installed on demand, its own sign-in, Studio's tools through the MCP bridge | accepted |
| [[0023-parallel-series-episodes]] | A series writes scripts in order and starts every ready video without an agent-count ceiling | accepted |
| [[0024-usage-per-project]] | Recorded project tokens; subscription accounts show account-wide limit percentages, with API estimates restricted to known key usage or developer mode | accepted |
| [[0025-exercise-sets]] | Exercise sets: exercises read from text, pictures and PDFs; a checked written solution first, then a short video each | accepted |
| [[0026-thumbnail-card]] | The exported thumbnail is a card: the scene's marked key picture, a hook, the episode number and the series name | accepted |
| [[0027-subtitle-band]] | New projects keep the bottom of the frame (and, in portrait, the right edge) clear of text for viewers' subtitles; a layout warning, not a rule | accepted |
| [[0028-watching-a-series]] | A series can be watched: study player, synced transcript, a chat that knows the moment, follow-up videos per episode | accepted |
| [[0029-learn-and-create]] | Learn, Create or Both: chosen at first launch; Learn hides the editor everywhere and opens every video on a study screen; Both has a Home tab for each | accepted |
| [[0030-courses]] | A course is a series with its own exercise set in it, studied on one screen with its lessons and exercises together | accepted |
| [[0031-antigravity-as-third-agent]] | Antigravity (Gemini 4 Argon) as a third agent: pinned CLI with its own home, contained by permission rules without the skip flag, Google sign-in through a pseudo-terminal or a Gemini key | accepted |
| [[0032-searchable-transcript]] | The study screen's transcript follows the video line by line; searching what's said moves the video to each match | accepted |
| [[0033-every-agent-in-the-background]] | Codex and Antigravity run the background agents too (the bridge names its project); Settings → Accounts shows every agent's sign-in and key | accepted |
| [[0034-gpu-video-encoding]] | Exports encode on the GPU (VideoToolbox, NVENC, Media Foundation for AMD) when one works, in a cache of their own, with the CPU as the fallback | accepted |
| [[0035-720p-study-videos]] | Previews and exports default to 1080p in all modes; 720p and 1440p remain explicit choices; no 24 fps exports | accepted |
| [[0036-settings-onboarding-and-languages]] | Guided onboarding, offline national-language UI across Europe with English macOS menus, connected agents and shared Voice/Video defaults; simplified theme/background controls | accepted |
| [[0037-desktop-conversation-videos]] | Desktop chat video jobs, mode-aware delivery and shared Claude/Codex/ChatGPT local bridge | accepted |
| [[0038-developer-episode-model-comparison]] | Hidden Develop settings and persistent provider/model assignments per Learn episode | accepted |
| [[0039-codex-model-discovery-and-capacity-recovery]] | Managed CLI availability for GPT-6 Astra and GPT-6.1 Sol, with opt-in OpenAI capacity fallback | accepted |
| [[0040-developer-episode-measurements]] | Local per-episode and combined HTML usage, timing and hardware reports; measured episodes run serially | accepted |
| [[0041-focused-study-workspace]] | Focused study page with navigation only when needed for standalone videos, collapsible sidebars and resizable assistant, compact video controls and expandable courses | accepted |
| [[0042-study-playback-preferences]] | Per-video resume and sidebar progress, per-course selected view, continuous playback preserving fullscreen with the assistant, and remembered playback preferences | accepted |
| [[0043-projects-folder-and-render-cache]] | Render cache in a local, unsynced cache folder (20 GB, LRU); new installs keep projects out of iCloud/OneDrive; onboarding asks where projects go and finds a returning user's folder | accepted |
| [[0044-full-window-onboarding]] | Full-window first launch that explains the app, installs the engine and LaTeX in the background from the mode choice, and waits for them before the app opens | accepted |
| [[0045-series-planner-and-maker]] | Separate series planner; episodes inherit the creation model with an optional advanced override; series without PDFs; planner names titles | accepted |
| [[0046-app-sounds]] | Short UI cues synthesized with the Web Audio API, played from state transitions (renders you waited for, exports, episodes, series, setup, failures); deduplicated native notifications and attention cues at agent usage limits; on/off and volume in Settings → General | accepted |
| [[0047-guided-tours]] | Guided tours for Home and the study page (and the editor) from one component; each shows once on first visit, replayable from Settings → General | accepted |
| [[0048-switch-agent-at-usage-limit]] | At a usage limit, explicitly switch unfinished series episodes (including comparisons) or an exercise set to another signed-in agent or saved API key | accepted |
| [[0049-series-recovery-and-shutdown]] | Journalled series creation and planning drafts, atomic checkpoints, independent per-course scheduling and graceful quit/system shutdown with idle-sleep protection | accepted |
| [[0050-course-production-workspace]] | Course-owned production overview and unfinished-lesson views; compact library status, retained controls, historical recovery and per-episode retry | accepted |
| [[0051-study-assistant-and-notes]] | Persistent per-episode conversations, study chat tools and text-first video offers, selected frame areas and enlarged screenshot previews, collapsible timestamp detours, and local notes with reviewed AI revisions | accepted |
| [[0052-interface-and-chat-text-size]] | Persistent interface zoom with Cmd/Ctrl shortcuts and independently adjustable chat text, including math and code | accepted |
| [[0053-ordered-model-usage-fallback]] | Optional ordered model takeover across connected accounts and explicit keys, persistent chat model choices, and expandable provider usage rings; production returns to the highest available priority between turns | accepted |
| [[0054-agpl-copyleft-license]] | AGPLv3-only for future source and distributions, preserving prior MIT grants and third-party licenses | accepted |
| [[0055-course-aware-study-evidence]] | Read-only full-course/PDF retrieval, verified persisted lesson/timestamp/page references, and return navigation | accepted |
| [[0056-private-runtime-cleanup]] | App-owned runtime caches and protected tool cleanup; Settings-only macOS/AppImage uninstall and Windows uninstall hook, retaining projects and sign-ins | accepted |
| [[0057-creation-progress-and-research]] | Shared section-based authoring estimates, provider web research and nonblocking series planning | accepted |
| [[0058-independent-production-jobs]] | Independent concurrent courses and quick videos, reusable saved plans, optional shared agent capacity and queued local drawing | accepted |
| [[0059-narration-credit-recovery]] | Playable silent fallback, credit-specific recovery notices and explicit retry/OmniVoice exports preserving the original video and voice choice | accepted |
