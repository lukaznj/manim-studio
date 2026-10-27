---
status: accepted
date: 2026-10-26
---

# 0053 — Ordered models at a usage limit

## Context

Manual provider takeover helped stalled courses, but unattended work still waited for a reset. Students also needed to continue a conversation on another connected model without discarding its history. Subscription allowance readings belong to accounts and sometimes model families; a second model does not necessarily have a separate allowance.

## Decision

- Settings → Agent offers an optional ordered list of connected provider, sign-in method, model and reasoning-effort routes. Automatic switching is off until enabled. Model catalogs come from the managed agents. Saved API keys enter the order only when explicitly added; discovering a key never authorizes spending it.
- New automatic jobs start on the highest available route in the order. When this policy is off, developer comparison episodes use their assigned model. Enabling ordered priority applies to production turns as well, so mixed comparison work is recorded as such. A real provider usage/quota rejection checkpoints the current conversation, closes the old agent, and continues unfinished work on the next available route, using current files and saved conversation as reference. Completed tool actions must not be replayed. Each rejected model is tried at most once per turn. Cancellation, authentication failures, ordinary network errors, capacity failures and tool failures do not trigger this usage policy.
- Series and exercise production recheck the enabled order before every agent turn, including reopened steps and saved fallback assignments. As soon as a higher-priority route’s reported reset expires, the next turn returns to that route with saved conversation and current files as context. An in-flight turn finishes before switching; rendering and exports are never restarted merely to change provider. Manual chat selections remain explicit.
- Blocked allowances are shared across concurrent jobs and persisted locally until the reported reset; an unknown reset gets a bounded 30-minute retry interval. A generic account limit blocks all models on that sign-in, including both Codex choices. An explicitly model-scoped Claude limit blocks only that family. Another provider or an explicitly included key has an independent allowance. When all ordered allowances are exhausted, background jobs retain their existing reset wait and manual takeover controls; chat returns its usage-limit error.
- Planning, tutor answers, note refinement and translation use the same bounded routing policy. Read-only structured requests restart cleanly; a streamed tutor answer retains its partial text and asks the next model to continue it. Episode assignments and metrics record actual changes, including mixed comparison episodes, and the saved video-agent conversation records takeover.
- Chat has a manual per-episode model picker, restricted to connected catalogs and disabled during a turn. Its model choice and automatically selected continuation route are saved with the episode. Switching retains all messages and screenshots; it does not change the account selected in global settings. Changing global chat defaults clears the current episode's route override so those defaults take effect on its next turn.
- The chat composer has a compact usage ring that opens account allowance details. It shows provider-reported window percentages and resets for connected account routes; unavailable readings are stated explicitly, never estimated from tokens. API-key routes explain separate billing rather than showing a fabricated subscription percentage. The same controls work in fullscreen.

This extends the explicit takeover decision in [[0048-switch-agent-at-usage-limit]]. The capacity-only Codex policy in [[0039-codex-model-discovery-and-capacity-recovery]] remains separate. With this new usage policy enabled, an explicit model assignment may continue elsewhere after quota exhaustion and is recorded as mixed work.

## Consequences

Unattended work can consume available allowances in a user-chosen order. Shared account pools prevent futile model switching. A continued conversation may have a different model than its original request, while its messages and completed project work remain available. Provider reporting gaps remain visible.
