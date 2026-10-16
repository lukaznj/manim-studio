---
status: accepted
date: 2026-10-16
---

# 0029 — Learn, Create or both: the editor is for creators only

## Context

Two kinds of people use the app. Creators make and polish videos to publish; they want the code, the timeline, their own narration and exports for YouTube. Learners want explained videos of their own material and exercises, to watch and ask about; for them the editor is noise and a way to break things. The same thing (a series made from a course's PDFs) serves both, so the split is in who uses the app, not in the kind of project.

## Decision

- **A mode for the person, `settings.mode`:** chosen on first launch (closing the choice keeps Create, the app as it was) and changed in Settings → General.
- **Learn has no editor.** One gate (`canEdit` in the store): opening any project in Learn goes to its study screen instead: an exercise to its set, an episode or follow-up to its series' Watch screen, any other video to the Watch screen as a list of one. A screen that still ends up on the editor is sent back the same way (`leaveEditor`).
- **What Learn hides:** New project and Open folder on Home (which becomes the Library), "Open in editor" on the study screens and the quick-video screen (a finished quick video is watched instead), the series dialog's make-by-hand option (every episode is made), the Video settings, the Claude Desktop extension, the editor tour, and the macOS menu's editor items.
- **Create is unchanged**, with the study screens as a way to see what viewers will see.
- **Both,** for someone who studies and makes videos: Home's title becomes two tabs, Create (projects, opened in the editor) and Learn (the library, where everything opens on the study screen, as in Learn). The tab is remembered (`settings.homeTab`), and the editor stays reachable from the study screen.

## Consequences

- A learner can't reach the code, the timeline or the narration booth; switching to Create in Settings is the way back.
- New features have to say which mode they belong to: a learning feature lives on the study screens, a publishing one in the editor or exports.
- Exercise sets and series are still separate kinds in Learn; ADR 0030 makes them one.
