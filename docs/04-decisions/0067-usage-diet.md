---
status: accepted
date: 2026-11-17
---

# 0067 — Spend less of the user's plan: smaller study questions, fewer agent turns

## Context

One study chat question used 5–8% of a Claude Pro 5-hour limit on Opus. The usage log showed why: each question made three requests (two rounds of picking course references, then the answer), each carrying the whole course catalog plus up to 105,000 characters of evidence, about 65,000 tokens each. Claude Code also sent every one of those prompts to Haiku a second time for a 20-token side answer. Nothing was reused between requests, so all of it was written to the prompt cache and never read back.

Video agents had the same pattern at a larger scale. A Codex lesson made 30–78 `render_preview` calls and 45–59 shell commands. Each finished render returned the full timeline (about 22,000 characters for a ten-minute lesson). Codex stopped waiting for a render after 45 s, so most calls were polls, not renders (see the correction below). A progress-reporting tool added another 12–14 turns per lesson. Every turn re-reads the whole conversation, so turns, not output, are what cost.

## Decision

**Study chat** (`main/study-context.ts`, `shared/study-context.ts`, `main/study-assistant.ts`)
- One answer reads at most 16,000 characters of course evidence (`STUDY_EVIDENCE_CHARS`) and 2 page images, in chunks of 1,500 characters.
- A local search finds the evidence. Short labels with a digit (X1, D1, C8) are searchable.
- When the course holds more than fits, one small request picks what to read. It sees a short course outline and 300-character snippets of the top 12 search hits, never the material itself. It runs on the agent's small model at low effort: Claude Haiku, GPT-6.1 Terra, Gemini 3.8 Flash. It never changes the chat's remembered model. If it fails, the answer uses the search results.
- The answer's instructions hold the outline, the citation rules and the open lesson's script (12,000 characters). They are stable within a lesson, so follow-up questions read them from the provider's cache.
- The request itself carries the evidence, the last 6 turns (6,000 characters) and 2,000 characters of notes.
- A reply that failed before writing anything is not kept, so later questions don't show its loading dots.

**Claude Code** runs with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, which stops the hidden Haiku copy of every prompt (measured on 2.1.321). Plan usage still reads.

**Video agents**
- `render_preview` returns the result, sections and every warning; the full clip and voice list is `get_timeline`'s.
- Codex's render checks wait up to 270 s (`STUDIO_TOOL_WAIT_MS`, below Node fetch's 300 s), so one call usually gives the result. Claude Desktop keeps 45 s.
- A render still waiting for its turn says so ("Waiting in line…", with how many are queued), not "still rendering".
- Previews are 720p by default, and the old 1080 default moves to 720 once. A preview only has to show the layout, and 1080 made every render several times slower.
- `report_progress` is gone: progress is read from script.md (sections still marked `[pending]`) and scene.py (`next_section` blocks with animation), as [[0057-creation-progress-and-research]] already did for agents that skipped the tool.

**Errors.** Codex's `model_not_found` reply for a ChatGPT account says the plan's usage may have run out, in the user's language, and counts as a limit for automatic switching.

**Gemini defaults.** Gemini 4 Hydrogen is Antigravity's default for chat and video creation; Gemini 4 Neon plans courses (Argon until 0.22.1). One-off Antigravity questions start no tool server and get no tool or web permissions.

## Consequences

The measured question went from about 200,000 Opus tokens plus 180,000 Haiku tokens to about 6,000 Haiku and 20,000 Sonnet tokens, with as good an answer. The tutor now sees less of the course at once; a question that needs many distant pages may need a follow-up. The picker can choose badly from snippets, and then the answer says what it couldn't see. Progress shown during a video depends on the agent writing `[pending]` markers and matching section names, which every agent's instructions require.

## Correction (2026-11-23)

The 30–78 figure counted `render_preview` calls. In the Codex sessions of 31 lessons (Nov 10 and 16), 1,052 of 1,082 calls were 45-second "still rendering" polls, and 30 returned a result: 27 succeeded, 2 failed and 1 was cancelled. Claude lessons made 2–5 renders each. Their first render took 2–6 minutes and later ones 1–2, from manim's cache.

During parallel course production, 12 of the 31 Codex lessons never received a result. Their renders waited behind other lessons in the one-at-a-time drawing queue, sometimes for over 40 minutes. For those lessons, Studio's render check after the agent was the only render before export. Across 39 lessons the check sent back render errors in 2 and layout warnings in 5, so it stays.
