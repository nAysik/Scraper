---
phase: 09-outreach-prioritizer
plan: "01"
subsystem: outreach
tags: [database, api, migration]
dependency_graph:
  requires: []
  provides: [outreach_channels.priority_score, outreach_channels.priority_reason, GET /api/outreach/channels priority fields]
  affects: [src/app/api/outreach/channels/route.ts]
tech_stack:
  added: []
  patterns: [additive migration with IF NOT EXISTS guard, camelCase mapping in route handler]
key_files:
  created:
    - supabase/migrations/009_priority_score.sql
  modified:
    - src/app/api/outreach/channels/route.ts
decisions:
  - "Used IF NOT EXISTS guard on ADD COLUMN for idempotent migration (safe to re-run)"
  - "priority_score and priority_reason are nullable — null means un-scored, not zero"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-17T17:03:17Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 9 Plan 01: Priority Score Migration & Route Update Summary

**One-liner:** Additive DB migration adds nullable `priority_score int` and `priority_reason text` to `outreach_channels`; GET route now selects and maps both columns as `priorityScore`/`priorityReason`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create migration 009_priority_score.sql | 1a88304 | supabase/migrations/009_priority_score.sql |
| 2 | Update GET /api/outreach/channels | 801a900 | src/app/api/outreach/channels/route.ts |

## Verification

- `supabase/migrations/009_priority_score.sql` exists with `ALTER TABLE outreach_channels ADD COLUMN IF NOT EXISTS priority_score int, ADD COLUMN IF NOT EXISTS priority_reason text`
- `npx tsc --noEmit` exits with zero errors
- `.select()` string includes `priority_score, priority_reason`
- Mapping object includes `priorityScore: c.priority_score ?? null` and `priorityReason: c.priority_reason ?? null`

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. The new fields carry `null` for un-scored channels by design — this is not a stub; Plan 02 will populate them via the scoring pipeline.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. The migration is applied manually in the Supabase Dashboard by an authenticated developer. The GET route's existing 401 auth gate is unchanged.

## Self-Check: PASSED

- `supabase/migrations/009_priority_score.sql`: FOUND
- `src/app/api/outreach/channels/route.ts`: modified and committed
- Commit 1a88304: FOUND
- Commit 801a900: FOUND
