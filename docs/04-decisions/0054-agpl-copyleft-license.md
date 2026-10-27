---
status: accepted
date: 2026-10-26
---

# 0054 — AGPLv3 copyleft for future versions

## Context

The author wants redistributed modifications to remain open source, including modifications offered to users as a network service. MIT does not require either. The author selected AGPLv3 after considering the narrower distribution-only GPLv3 requirement.

## Decision

- License original project source under GNU AGPL version 3 only (`AGPL-3.0-only`). Keep the official license text verbatim in LICENSE and the application copyright in NOTICE. Package metadata, the desktop extension, documentation and About text agree.
- Ship LICENSE, LICENSE-EXCEPTION and NOTICE with desktop builds and both integration archives. About links to the public source repository. Releases must retain matching source archives and the build instructions and dependency locks needed to reconstruct them.
- The author additionally approved the narrow section-7 permission in LICENSE-EXCEPTION for linking or combining with the unmodified Claude Agent SDK and its corresponding Claude Code executable. It exempts those proprietary components’ source from Studio’s corresponding-source obligation, without removing Studio’s own AGPLv3 obligations or granting rights in Anthropic’s code. Package metadata identifies the base AGPLv3 license; NOTICE and README point to the additional permission.
- Third-party components retain their own licenses. This decision does not claim to relicense proprietary agent software or replace providers' service terms.
- Already published MIT releases through v0.13.0 keep their original license. The new license applies going forward; it does not revoke existing grants.

This supersedes the MIT licensing part of [[0011-open-source-english]]. Its source-language, privacy and platform-integration decisions remain in force.
