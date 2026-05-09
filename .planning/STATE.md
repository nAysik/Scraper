# Project State

## Project Reference
See: .planning/PROJECT.md

**Core value:** Paste channel URLs, get back a CSV with top games, genre, and median views — ready for Notion import.
**Current focus:** Phase 1 — Database Foundation

## Phase Status

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 1 | Database Foundation | Not started | 0 |
| 2 | Enrichment Pipeline | Not started | 0 |
| 3 | Channel Discovery | Not started | 0 |
| 4 | Outreach Dashboard & Export | Not started | 0 |

## Current Position

**Active phase:** 1 — Database Foundation
**Active plan:** None
**Overall progress:** 0/4 phases complete

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 4 |
| Phases complete | 0 |
| Requirements mapped | 17/17 |
| Plans written | 0 |

## Accumulated Context

### Key Decisions
- Separate `outreach_channels` table — different data model and lifecycle from outlier `channels` table
- GPT-4o-mini called once per channel (titles + description combined) — controls cost
- CSV export over Notion API — simpler, no token setup required
- New Outreach tab in existing dashboard — reuses auth and nav already in place

### Architecture Notes
- Reuse `src/lib/scraper/innertube.ts` singleton for all InnerTube calls
- Reuse `parseViewCount`, `parseRelativeDate`, `parseSubscriberCount` from `src/lib/scraper/videos.ts`
- Adapt OpenAI batch call pattern from `src/lib/pipeline/categorize.ts` for game/genre detection
- Use `createServiceClient()` from `src/lib/supabase/server.ts` for all writes (do not create new service role client instances)
- New API routes live under `src/app/api/outreach/`
- New dashboard section at `src/app/dashboard/outreach/`

### Todos
- (none yet)

### Blockers
- (none)

## Session Continuity

**Last activity:** Initialized 2026-05-09
**Next action:** Run `/gsd-plan-phase 1` to create the execution plan for Phase 1 (Database Foundation)
