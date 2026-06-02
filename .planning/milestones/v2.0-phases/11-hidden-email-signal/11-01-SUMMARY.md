---
phase: 11-hidden-email-signal
plan: "01"
subsystem: outreach-pipeline
tags: [database, enrichment, api, hidden-email]
dependency_graph:
  requires: []
  provides: [has_hidden_email-column, canRevealEmail-field, hasHiddenEmail-api-field]
  affects: [outreach_channels-table, enrich-pipeline, channels-get-api]
tech_stack:
  added: []
  patterns: [factual-signal-always-upsert, nullable-boolean-tristate]
key_files:
  created:
    - supabase/migrations/010_hidden_email.sql
  modified:
    - src/lib/outreach/fetch-channel-data.ts
    - src/lib/outreach/upsert-outreach.ts
    - src/app/api/outreach/enrich/route.ts
    - src/app/api/outreach/channels/route.ts
decisions:
  - "has_hidden_email stored as nullable boolean (null=not enriched, true=hidden email exists, false=no hidden email)"
  - "has_hidden_email always unconditionally upserted (factual signal, not user data) unlike email which never overwrites"
  - "canRevealEmail defaults to false via ?? false if can_reveal_email absent from InnerTube About metadata"
metrics:
  duration: "73s"
  completed: "2026-05-19"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
---

# Phase 11 Plan 01: Hidden Email Signal — Migration and Pipeline Summary

Added `has_hidden_email` boolean column to `outreach_channels`, captured YouTube's `can_reveal_email` signal from InnerTube About metadata during enrichment, and exposed the tri-state value through the GET channels API.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Migration 010 — add has_hidden_email column | f36dc63 | supabase/migrations/010_hidden_email.sql |
| 2 | Pipeline — capture canRevealEmail through all layers | a9438f1 | fetch-channel-data.ts, upsert-outreach.ts, enrich/route.ts, channels/route.ts |

## What Was Built

### Migration
`supabase/migrations/010_hidden_email.sql` adds `has_hidden_email boolean` (no default, nullable) to `outreach_channels` using `IF NOT EXISTS` guard for safe re-execution. The column uses null as a meaningful third state: null=not yet enriched, true=YouTube reports hidden email, false=YouTube confirms none.

### fetch-channel-data.ts
- Added `canRevealEmail: boolean` to `OutreachChannelData` interface
- After the `getAbout()` try/catch block, reads `(about as any)?.can_reveal_email ?? false` — defaults to false if the field is absent (T-11-01 tamper protection)
- Included `canRevealEmail` in the return object

### upsert-outreach.ts
- Added `hasHiddenEmail?: boolean | null` to `OutreachUpsertRow` interface
- Added `has_hidden_email: row.hasHiddenEmail ?? null` unconditionally in the upsert object — unlike `email` which uses conditional spread to preserve manual entries, this is a factual YouTube signal and should always be overwritten on re-enrich

### enrich/route.ts
- Passes `hasHiddenEmail: data.canRevealEmail` to `upsertOutreachChannel` after `lastVideoAt`

### channels/route.ts
- Appended `has_hidden_email` to the `.select()` string
- Added `hasHiddenEmail: c.has_hidden_email ?? null` to the camelCase mapping

## Verification Results

```
canRevealEmail matches in fetch-channel-data.ts: 3 (interface, assignment, return)
hasHiddenEmail matches in upsert-outreach.ts:    2 (interface field, upsert column)
hasHiddenEmail matches in enrich/route.ts:       1 (upsert call)
has_hidden_email matches in channels/route.ts:   2 (select, mapping)
has_hidden_email matches in 010_hidden_email.sql: 1 (column name)
TypeScript: 0 errors
```

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-11-01 | `?? false` default on can_reveal_email read prevents non-boolean propagation; TypeScript type enforces boolean at compile time |
| T-11-02 | Accepted — hasHiddenEmail is non-sensitive metadata on an already auth-gated route |
| T-11-03 | Accepted — has_hidden_email always overwritten on re-enrich; no user-supplied path exists |

## Known Stubs

None — all fields are wired end-to-end from InnerTube through to the API response.

## Threat Flags

None — no new security-relevant surface introduced beyond what is covered in the plan's threat model.

## Self-Check: PASSED

- [x] supabase/migrations/010_hidden_email.sql exists with ADD COLUMN IF NOT EXISTS has_hidden_email boolean
- [x] OutreachChannelData.canRevealEmail: boolean (line 31)
- [x] fetchChannelDataOnce reads can_reveal_email with ?? false default (line 144)
- [x] OutreachUpsertRow.hasHiddenEmail?: boolean | null (line 30)
- [x] upsertOutreachChannel writes has_hidden_email unconditionally (line 51)
- [x] enrich/route.ts passes hasHiddenEmail: data.canRevealEmail (line 98)
- [x] channels/route.ts selects has_hidden_email and maps to hasHiddenEmail (lines 11, 30)
- [x] TypeScript: 0 errors
- [x] Commits f36dc63 and a9438f1 verified in git log
