---
status: accepted
date: 2026-10-17
---

# 0039 — Discover Codex models and opt into capacity fallback

## Context

The Codex picker exposed only the account default. A model that is temporarily at capacity could stop a chat or an unattended episode, with no Studio setting for a substitute.

## Decision

- Discover model IDs and supported reasoning efforts through the managed CLI's read-only `app-server` `initialize` / `model/list` protocol. Handle pagination, timeout and process cleanup. Studio never reads login tokens. The catalog is not a guarantee that every request will be admitted.
- Settings → Agent, with Codex selected, offers a same-account OpenAI fallback model. It is off by default; Studio never selects a substitute provider or changes authentication on its own.
- A chat or background video turn rejected for explicit model/service capacity gets one delayed retry. If it fails for capacity again, try the configured fallback once and keep it for that conversation. Report retries and the chosen fallback in the saved conversation.
- Never replay a turn automatically after it produced output or tool work. Authentication, unsupported model, account quota, usage/rate limits, permission and tool failures do not trigger substitution. Cancellation stops recovery. One-off planning/translation requests retain their explicit model and return their errors; this fallback applies to conversational video work.
- Developer episode comparisons disable substitution ([[0038-developer-episode-model-comparison]]).

## Consequences

Users choose their preferred tradeoff when an OpenAI model is busy. Recovery is bounded and preserves conversation history, while evaluation episodes keep their stated identity. CLI catalog failures stay visible instead of inventing a list of model IDs. See [OpenAI's model discovery protocol](https://learn.chatgpt.com/docs/app-server) and [capacity guidance](https://developers.openai.com/api/docs/guides/rate-limits).
