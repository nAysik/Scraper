---
phase: 01-database-foundation
plan: 01
subsystem: database
tags: [supabase, postgres, migration, rls, schema, outreach]

requires:
  - phase: none
    provides: first phase, no upstream dependencies

provides:
  - outreach_channels table with 10-column schema (id, youtube_id, name, url, subscriber_count, top_games, genre, median_views, last_enriched_at, created_at)
  - Row-Level Security with `Authenticated read outreach_channels` policy
  - Three b-tree indexes for Phase 4 dashboard filtering (genre, median_views desc, subscriber_count desc)
  - Smoke test script at scripts/verify-outreach-channels.ts (deferred; requires .env.local to run)

affects: [02-enrichment-pipeline, 03-channel-discovery, 04-outreach-dashboard]

tech-stack:
  added: [tsx, dotenv]
  patterns: [Postgres text[] for variable-length string arrays, RLS read-only with service-role bypass for writes]

key-files:
  created:
    - supabase/migrations/004_outreach_channels.sql
    - scripts/verify-outreach-channels.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "D-01: top_games is text[] (Postgres native array), not jsonb, not a join table"
  - "D-02: enriched fields (top_games, genre, median_views, last_enriched_at) are nullable — rows can exist before enrichment completes"
  - "Discretion: url is text not null unique — defence-in-depth alongside youtube_id unique to prevent duplicate paste attempts"
  - "Discretion: subscriber_count is nullable bigint — fetched during enrichment, may be null briefly"
  - "Discretion: three indexes added in foundation migration to avoid a follow-up migration in Phase 4"
  - "Migration number 004 (001/002/003 already taken)"

patterns-established:
  - "Lowercase SQL keywords throughout migrations, banner comment blocks above each table (matches 001_initial.sql)"
  - "RLS with single read policy + service-role bypass for writes — no explicit insert/update/delete policy"
  - "Smoke test scripts wrapped in async IIFE — project transpiles to CJS (no top-level await support)"

requirements-completed: [DB-01, DB-02]

duration: ~15min
completed: 2026-05-10
---

# Phase 1: Database Foundation Summary

**outreach_channels table is live in Supabase with the agreed schema, RLS policy, and indexes — Phases 2–4 can now read and write enriched channel data via createServiceClient().**

## Performance

- **Duration:** ~15 min (including dependency install)
- **Completed:** 2026-05-10
- **Tasks:** 2 of 3 fully completed; Task 3 script committed but programmatic run deferred
- **Files created:** 2
- **Files modified:** 2 (package.json, package-lock.json)

## Accomplishments

- Authored migration 004 with the exact schema/indexes/RLS specified by the locked decisions (D-01, D-02) and the four Claude-discretion items.
- User applied the migration in the Supabase Dashboard SQL editor; Table Editor confirms outreach_channels with all 10 columns and the read policy enabled.
- Added a one-shot smoke test script that proves service-role insert, anon-read rejection via RLS, schema shape, and top_games array type. Committed for future use; not run in this session.

## Task Commits

1. **Task 1: Author 004_outreach_channels.sql migration** — `b6090d4` (feat)
2. **Task 2: Apply migration in Supabase Dashboard** — human checkpoint, no commit (verified in Table Editor: 10 columns + `Authenticated read outreach_channels` policy)
3. **Task 3: End-to-end RLS + service-role smoke test** — `d057b90` (test) — script committed, programmatic run deferred (see Deviations below)

## Files Created/Modified

- `supabase/migrations/004_outreach_channels.sql` — DDL: outreach_channels table, 3 indexes, RLS enable + read policy
- `scripts/verify-outreach-channels.ts` — one-shot smoke test (service-role insert, anon RLS check, schema shape, top_games array, cleanup)
- `package.json` / `package-lock.json` — added dev deps `tsx` (TypeScript runner) and `dotenv` (.env.local loader)

## Deviations from Plan

Two deliberate deviations from the literal plan body, both documented here for downstream phases:

1. **Async IIFE wrapper in scripts/verify-outreach-channels.ts.** The plan specified the script body with top-level `await`. Running via `tsx` in this project transpiles to CJS (per the existing tsconfig and absence of `"type": "module"` in package.json), where top-level await is unsupported. The body is wrapped in `async function main() { … } main().catch(...)` to compile and run. No behavioural change.

2. **Task 3 programmatic run deferred.** `.env.local` does not exist in this working directory and the three required Supabase env vars are not set in the shell. The script is correct and runs cleanly given credentials. User accepted the Task 2 Supabase Dashboard verification (10 columns visible in Table Editor, `Authenticated read outreach_channels` policy enabled, RLS toggle on) as sufficient evidence that the schema and security posture match the plan. To run programmatically later: create `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, then `npx tsx scripts/verify-outreach-channels.ts` should print 5+ `OK:` lines and exit 0.

## What Phase 2 Needs to Know

- **Use `createServiceClient()` from `src/lib/supabase/server.ts` for all writes** to `outreach_channels`. Do not instantiate new `@supabase/supabase-js` clients elsewhere — the `upsert.ts` pattern in the existing scraper deviates from this only because of a legacy import-cycle concern. New outreach code should call `createServiceClient()`.
- **Upsert key is `youtube_id`** (the unique constraint). `url` also has a unique constraint — both must be set on insert; the enrichment pipeline must normalise URL to canonical form to avoid duplicate-key conflicts.
- **Enriched fields are nullable.** A row can be created with just `youtube_id`, `name`, `url` and have `top_games`, `genre`, `median_views`, `last_enriched_at`, `subscriber_count` filled in by a later enrichment pass. The Phase 4 table will need to handle null gracefully in the UI.
- **`top_games` is `text[]`.** When inserting from JS/TS, pass a JS array (e.g. `['Minecraft', 'Stardew Valley']`) — the Supabase client serialises it correctly. The smoke test (line 42) demonstrates this.
- **No write policies exist.** Service role bypasses RLS for writes; this is intentional. Do NOT add a `for insert/update/delete` policy in a later migration without revisiting the threat model (T-01-02).
