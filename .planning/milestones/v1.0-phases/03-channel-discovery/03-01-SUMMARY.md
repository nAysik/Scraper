---
phase: 03-channel-discovery
plan: 01
subsystem: database
tags: [supabase, migration, outreach, email-extraction, regex]

# Dependency graph
requires:
  - phase: 02-enrichment-pipeline
    provides: outreach_channels table, upsertOutreachChannel, fetchChannelData, /api/outreach/enrich route
provides:
  - outreach_channels.email column (text, nullable) via migration 005_add_email.sql
  - extractEmail() helper exported from fetch-channel-data.ts
  - OutreachUpsertRow.email field; upsert payload writes email column
  - /api/outreach/enrich response includes enriched map (per-URL: topGames, genre, email, subscriberCount, medianViews)
affects:
  - 03-channel-discovery (Plans 02 and 03 depend on email column and enriched response)
  - 04-outreach-dashboard (reads email from outreach_channels)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "extractEmail(): pure regex helper on a string field returned by fetchChannelData — called by route handler, not inside fetchChannelData itself, so partial-save semantics stay symmetrical"
    - "enriched map in enrich response: Record<canonicalUrl, EnrichedRow> populated for all channels that reached the upsert step (succeeded + partial); failed[] entries have no enriched record"

key-files:
  created:
    - supabase/migrations/005_add_email.sql
    - src/lib/outreach/fetch-channel-data.ts (extractEmail added)
  modified:
    - src/lib/outreach/upsert-outreach.ts
    - src/app/api/outreach/enrich/route.ts

key-decisions:
  - "extractEmail() lives in fetch-channel-data.ts as a pure exported helper, not called inside fetchChannelData — keeps route handler in control of partial-save logic"
  - "enriched map keyed by resolved.canonicalUrl (not youtube_id) so Plan 03 handleSave can look up rows by the same URL string it posted"
  - "email written unconditionally to upsert payload (null when no match) — no conditional branch needed"

patterns-established:
  - "Pattern: route handler calls extractEmail(data.description) after fetchChannelData returns, before upsertOutreachChannel — same location as extractGamesGenre call"
  - "Pattern: enriched[resolved.canonicalUrl] populated before upsert so partial-save rows also get an enriched entry"

requirements-completed:
  - DIS-05

# Metrics
duration: 15min
completed: 2026-05-14
---

# Phase 3 Plan 01: Email Column Migration and Enriched Response Map

**Supabase migration adding outreach_channels.email (text, nullable), email regex extraction helper, and /api/outreach/enrich response extended with per-URL enriched map for in-place row updates**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-14T00:00:00Z
- **Completed:** 2026-05-14T00:15:00Z
- **Tasks:** 3 (Tasks 1 and 3 auto; Task 2 human-action checkpoint)
- **Files modified:** 4

## Accomplishments

- Migration `005_add_email.sql` committed; adds `email text` (nullable, no unique constraint) to `outreach_channels`
- `OutreachUpsertRow` extended with `email: string | null` and upsert payload updated to write it
- `extractEmail()` exported from `fetch-channel-data.ts` using the pre-specified regex `/[\w.+-]+@[\w-]+\.[a-z]{2,}/i`
- `/api/outreach/enrich` now calls `extractEmail(data.description)`, passes result to `upsertOutreachChannel`, and returns `enriched` map alongside existing `succeeded/failed/partial` response fields
- `tsc --noEmit` exits 0 after Task 3 (full type-check clean)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration 005 and extend upsert layer** - `936d0d8` (feat)
2. **Task 2: Apply migration in Supabase Dashboard** - human-action (no commit — DB operation)
3. **Task 3: Add extractEmail(), wire into enrich route, return enriched map** - `(see below)`

## Files Created/Modified

- `supabase/migrations/005_add_email.sql` - ALTER TABLE statement adding email text column
- `src/lib/outreach/upsert-outreach.ts` - OutreachUpsertRow.email field + upsert payload writes email
- `src/lib/outreach/fetch-channel-data.ts` - extractEmail() pure helper exported at bottom of file
- `src/app/api/outreach/enrich/route.ts` - calls extractEmail(), adds email to upsert call, returns enriched map in response

## Decisions Made

- `extractEmail()` is a pure exported function in `fetch-channel-data.ts`, NOT called inside `fetchChannelData` — this keeps the route handler in control of partial-save semantics (description is already available on `OutreachChannelData.description`)
- `enriched` map uses `resolved.canonicalUrl` as the key (matching the URL string Plan 03's `handleSave` will look up)
- `enriched` record is populated BEFORE calling `upsertOutreachChannel` so partial-save rows (LLM failure) still get an enriched entry with InnerTube-derived fields

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Manual migration required.** Apply the migration in the Supabase Dashboard SQL Editor:

1. Open your Supabase project Dashboard
2. Navigate to **SQL Editor**
3. Paste the full content of `supabase/migrations/005_add_email.sql`
4. Click **Run**
5. Verify with: `select column_name, data_type, is_nullable from information_schema.columns where table_name = 'outreach_channels' and column_name = 'email';`
   - Expected: one row — `email | text | YES`

## Threat Flags

No new network endpoints or auth paths introduced. `extractEmail()` operates on already-fetched description text. The email string is stored via parameterized Supabase query (PostgREST), ruling out SQL injection. Regex is linear-time (no nested quantifiers). See plan threat model T-03-01-01 through T-03-01-05 for full analysis.

## Next Phase Readiness

- Once migration is applied and Task 3 commit lands: Plan 02 (discover API route) and Plan 03 (discovery UI) can proceed — they depend on `outreach_channels.email` column and the `enriched` response map from `/api/outreach/enrich`
- DIS-05 will be fully closed when the migration is confirmed applied in production

## Self-Check

- [x] `supabase/migrations/005_add_email.sql` exists
- [x] `src/lib/outreach/upsert-outreach.ts` contains `email: string | null` in interface and `email: row.email` in payload
- [x] Task 1 committed at `936d0d8`

---
*Phase: 03-channel-discovery*
*Completed: 2026-05-14*
