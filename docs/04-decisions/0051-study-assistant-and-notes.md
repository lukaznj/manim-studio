---
status: accepted
date: 2026-10-26
---

# 0051 — A study assistant with explicit creation tools, video detours and notes

## Context

Separate question and follow-up buttons obscured the difference between a text answer and a rendered video. A modal covered the video while composing. Suggested prompts were untranslated, follow-ups crowded lesson navigation, and students had no place to keep notes about the video.

## Decision

- Conversations are saved locally per episode (including additional videos and exercises) in `.studio/chat.json`, without truncating older messages. Switching episodes, agents or restarting retains the history; leaving during a tutor answer checkpoints the partial text. There is no New conversation/reset control or IPC endpoint that deletes this history. Only recent messages are sent as model context; that does not remove the saved conversation.
- The study chat has a quiet empty state and a **Study tools** menu: additional explanation video, practice exercises, and selecting an area of the current frame. Selecting a creation tool pauses the video and captures the timestamp; a removable composer pill makes the intended action explicit. Additional-video creation is offered only through Study tools in chat; there is no separate prompt row under the player. Ordinary questions stay read-only.
- Additional video requests first ask the tutor whether a concise text answer fully resolves the question. When it does, show the explanation and a persistent **Create the video anyway** offer. This retains the original request, moment, topic title and selected image across navigation/restarts. Otherwise start the video immediately. The tutor supplies a short descriptive title in the user's language rather than copying the prompt.
- The tutor uses a separate per-agent model/effort in Settings → Agent. Claude defaults to Sonnet 5.5 / high, Codex to GPT-6.1 Sol / high. Creation and series settings remain independent. Tutor questions, notes refinement and exercise drafting use that selection. All user requests carry recent visible conversation, the script, notes and current moment as reference data; tutor calls cannot edit the video. [[0055-course-aware-study-evidence]] extends this to the complete course/PDF index with bounded retrieval and validated, persistent navigation references.
- Additional videos live in a collapsible group under their lesson and in a compact list below that lesson's player. Near a finished video's source timestamp, a player cue offers a voluntary detour. It starts that additional video from the beginning, then returns to the original timestamp and paused/playing state when it ends. A Return action allows leaving early. Manual navigation cancels the detour.
- The viewer can draw a rectangle over a paused frame and attach that crop to a question or creation request. Coordinates refer to the video image, excluding controls. Main validates and bounds PNG input. The selected image is retained with a video offer and saved into the created project's context so the creator sees the same area.
- Every studied video has Markdown/LaTeX notes below the player, stored locally in `.studio/notes.json` with atomic writes. Timestamp insertions link back to the player. AI refinement produces a preview: keeping the original, applying the revision and undoing it are explicit actions. Notes are not replaced by the AI automatically.
- A streaming answer follows the bottom only while the viewer remains there. Manual upward scrolling pauses following without interrupting the answer; returning to the bottom or choosing Jump to latest resumes it. Sending a new question starts following its answer. This applies in the normal and fullscreen assistant.
- Attached screenshot thumbnails open a large native modal preview with the original question below the image. The image remains in the saved episode conversation and can be inspected later, including while the assistant is docked in fullscreen. Keyboard activation, close button, backdrop and Escape are supported.
- Chat and note previews use the existing bundled KaTeX renderer for `$…$`, `$$…$$`, `\(…\)` and `\[…\]`. No new runtime dependency. UI product copy ships in all supported offline catalogs; user/agent content retains its own language.

## Consequences

This supersedes the follow-up modal and two-button shortcut in [[0041-focused-study-workspace]], and refines follow-up navigation in [[0028-watching-a-series]] and manual playback in [[0042-study-playback-preferences]]. Video creation still uses the existing background generation/check/export flow, and exercises use the course's existing checked-solution pipeline. Text recommendations and notes refinement consume account usage; requesting a video anyway starts the more expensive creation work only after explicit user intent.
