---
phase: 07-twitch-discovery
plan: "01"
subsystem: outreach-db
tags: [migration, schema, platform, twitch, upsert]
dependency_graph:
  requires: []
  provides: [platform-column, composite-unique-constraint, upsert-platform-field]
  affects: [outreach_channels, upsert-outreach.ts]
tech_stack:
  added: []
  patterns: [composite-unique-conflict, optional-field-with-default]
key_files:
  created:
    - supabase/migrations/006_add_platform.sql
  modified:
    - src/lib/outreach/upsert-outreach.ts
    - CLAUDE.md
decisions:
  - platform defaults to 'youtube' so all existing YouTube callers are backward-compatible
  - Composite unique (youtube_id, platform) replaces single-column youtube_id unique to allow same handle on both platforms
  - onConflict updated to 'youtube_id,platform' to match the new constraint exactly
metrics:
  duration: "~5 minutes"
  completed: "2026-05-16"
  tasks_completed: 3
  files_changed: 3
---

# Phase 7 Plan 01: Platform Column Migration Summary

**One-liner:** Composite (youtube_id, platform) unique constraint and platform field wired through upsert layer to enable Twitch rows alongside YouTube rows in outreach_channels.

## Status

Complete — all 3 tasks executed, TypeScript compilation clean (zero errors).

## What was built

- `supabase/migrations/006_add_platform.sql` — adds `platform text NOT NULL DEFAULT 'youtube'` column to `outreach_channels`, drops the old `outreach_channels_youtube_id_key` single-column unique constraint, and adds a composite `outreach_channels_platform_id_key` UNIQUE (youtube_id, platform) constraint. Must be applied manually in Supabase Dashboard (same procedure as migrations 001-005).

- `src/lib/outreach/upsert-outreach.ts` — `platform?: string` added to `OutreachUpsertRow` interface with comment `// 'youtube' (default) | 'twitch'`; `platform: row.platform ?? 'youtube'` added to the upsert object; `onConflict` changed from `'youtube_id'` to `'youtube_id,platform'`; file-header comment updated to explain the migration 006 conflict key change.

- `CLAUDE.md` — `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` rows added to the env table; data-flow comment updated from `onConflict: youtube_id` to `onConflict: youtube_id,platform`.

## Key decisions

1. **platform defaults to 'youtube'** — all existing callers that omit `platform` continue to upsert as YouTube rows without any code change. Zero breaking changes.
2. **Composite unique replaces single-column unique** — migration 006 explicitly drops `outreach_channels_youtube_id_key` before adding `outreach_channels_platform_id_key`; the `IF NOT EXISTS` / `IF EXISTS` guards make both DDL statements idempotent.
3. **onConflict must match constraint columns exactly** — Supabase requires the `onConflict` string to name the columns in the same order as the unique constraint; `'youtube_id,platform'` matches `UNIQUE (youtube_id, platform)`.

## Deviations from Plan

**1. [Rule 2 - Missing critical update] Updated CLAUDE.md data-flow comment**
- **Found during:** Task 3
- **Issue:** The data-flow section in CLAUDE.md still referenced `onConflict: youtube_id` after the constraint was changed to composite.
- **Fix:** Updated the comment to `onConflict: youtube_id,platform` for consistency with the implementation.
- **Files modified:** CLAUDE.md
- **Commit:** 970f6fa (included in the same commit)

## Commits

| Task | Description | Hash |
|------|-------------|------|
| 1+2+3 | feat(07-01): platform column migration, upsert update, Twitch env docs | 970f6fa |

## Self-Check: PASSED

- [x] `supabase/migrations/006_add_platform.sql` exists and contains `ADD COLUMN IF NOT EXISTS platform` and `ADD CONSTRAINT outreach_channels_platform_id_key`
- [x] `src/lib/outreach/upsert-outreach.ts` contains `platform?: string`, `platform: row.platform ?? 'youtube'`, and `onConflict: 'youtube_id,platform'`
- [x] `CLAUDE.md` contains `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`
- [x] `npx tsc --noEmit` — zero errors
- [x] Commit 970f6fa confirmed in git log
