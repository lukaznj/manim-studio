---
status: accepted
date: 2026-10-26
---

# 0055 — Course evidence and navigable tutor references

## Context

The read-only tutor knew the current script and recent conversation, but not the original PDFs or what other episodes teach. It could not distinguish planned coverage from a finished video, or offer a reliable link to a related explanation.

## Decision

- Preserve complete original PDFs in a shared course `sources/` archive when creating a series, including inputs not assigned to an individual episode. Existing courses use the union of their surviving episode source copies, which also contain whole PDFs. Deduplicate identical files by content, while keeping distinct files whose tidy names collide.
- Every study question builds a course-scoped catalog of the entire plan, notation/bible, scripts, chapters and spoken transcript. The complete PDF text index is searchable across all pages; long pages and scripts retain every character in addressable chunks. The model receives bounded evidence, with up to two read-only selection rounds for additional searches, episode/chunk/page reads and PDF page images. It can request any indexed page, rather than only the first pages or the current episode's assigned range. Scans and visual mathematics use the existing PDF renderer. No new runtime dependency, embedding service or write-capable tutor agent is introduced.
- Use the same evidence selection with Claude, Codex and Antigravity, through existing one-off routing. Cancellation and usage-limit fallback remain effective. Source failures and missing original material are recorded as incomplete context; the tutor must acknowledge gaps. Recent conversation and the paused frame help resolve phrases such as “this concept”. Documents and scripts remain reference data, never instructions.
- Link only verified evidence ids, not model-supplied file paths or timestamps. Finished videos expose their actual chapter/transcript starts; planned or unfinished episodes can be described as upcoming coverage but have no playable references. PDF citations identify pages read as text or images. Retain cited targets with the saved answer so links survive reopening the app.
- New exports keep `study-context.json` with the exported duration, chapters and subtitles. For old exports, use their VTT timestamps; preview chapter timing is used only when the preview predates that export. This prevents a later edited preview from supplying timestamps for an older exported video.
- Render references as compact inline buttons, with a small expandable course-materials summary. Video references open that lesson and timestamp, including in fullscreen, and offer returning to the original viewing position. PDF references open a page preview. Revalidate saved references when clicked: the destination must still belong to the course; modified PDFs require a new citation, and changed videos need an unambiguous matching chapter or transcript anchor. Missing/stale evidence fails visibly rather than jumping to an unrelated location.
- Real-path containment prevents manifests, retrieval requests or escaping symlinks from admitting unrelated projects. Read requests contain catalog ids, not executable tools or arbitrary paths. The user’s selected agent receives the course evidence as part of their requested tutor question.

## Consequences

A student can ask about the whole course while studying one episode, get an explanation here, and follow relevant earlier/later coverage without losing the original position. Large documents remain accessible through retrieval instead of overflowing a model context. An unavailable/scanned document may require explicit page-image inspection; missing originals cannot be reconstructed from generated videos.

This extends [[0014-pdf-sources]], [[0028-watching-a-series]] and [[0051-study-assistant-and-notes]].
