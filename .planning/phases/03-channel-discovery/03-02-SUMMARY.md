---
phase: 03-channel-discovery
plan: 02
subsystem: backend/api
tags: [innertube, search, outreach, discovery, video-search]

# Dependency graph
requires:
  - phase: 03-channel-discovery
    plan: 01
    provides: nothing direct (independent Wave 1 plan)
  - phase: 02-enrichment-pipeline
    provides: canonicalize-url.ts, innertube singleton, supabase server client
provides:
  - searchVideosByKeyword() scraper in src/lib/scraper/search-videos.ts
  - DiscoveredChannel interface (canonical type consumed by Plan 03 UI)
  - POST /api/outreach/discover route (auth-gated, dual search, dedup, already-saved check)
affects:
  - 03-channel-discovery Plan 03 (UI imports DiscoveredChannel, calls /api/outreach/discover)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual search: Promise.all([relevance, upload_date:'week']) — relevance-first merge for dedup precedence"
    - "subscriberCount always null at discover time — populated post-save via enrichment"
    - "Single .in('youtube_id', ids) Supabase query for already-saved check — no N+1"

key-files:
  created:
    - src/lib/scraper/search-videos.ts
    - src/app/api/outreach/discover/route.ts

key-decisions:
  - "upload_date:'week' filter (not sort_by — field does not exist in SearchFilters v17)"
  - "subscriberCount: null always — getChannelSubscriberCount() not called at search time (would push latency to minutes)"
  - "canonicalizeUrl() applied to author.url to match outreach_channels.url unique constraint"
  - "author.id === 'N/A' guard prevents dead rows"
  - "Already-saved check degrades gracefully: DB error → log + continue with alreadySaved:false"

requirements-completed:
  - DIS-01
  - DIS-02

# Metrics
duration: 20min
completed: 2026-05-14
---

# Phase 3 Plan 02: Video Search Scraper + Discover API

**Paginated InnerTube video search (dual sort, 5 pages each) and POST /api/outreach/discover route with deduplication and already-saved channel flagging**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-05-14
- **Tasks:** 2 (both auto)
- **Files created:** 2

## Accomplishments

- `src/lib/scraper/search-videos.ts` — exports `searchVideosByKeyword()` and `DiscoveredChannel` interface. Runs paginated InnerTube `type:'video'` search with `has_continuation` guard and inner try/catch on page fetches. Filters `author.id === 'N/A'`, applies `canonicalizeUrl()` to every author URL. Returns `Map<channelId, DiscoveredChannel>`.
- `src/app/api/outreach/discover/route.ts` — auth-gated POST handler. Runs dual search in parallel (`Promise.all`), merges with relevance-first precedence, performs single `.in('youtube_id', ids)` already-saved check, returns `{ channels: DiscoveredChannel[] }`.
- `tsc --noEmit` exits 0. `npm run build` exits 0.

## Task Commits

1. **Task 1: searchVideosByKeyword** — `38f4ad9`
2. **Task 2: discover route** — `d509a4e` (includes TS fix: explicit `r: { youtube_id: string }` annotation on `.map()` callback)

## Files Created

- `src/lib/scraper/search-videos.ts` — scraper helper
- `src/app/api/outreach/discover/route.ts` — POST route

## Decisions Made

- `sort_by` does NOT exist in youtubei.js v17 `SearchFilters` — the "upload-date variant" uses `upload_date: 'week'` filter (research confirmed from node_modules types)
- All `subscriberCount` values are `null` at discover time — the `Video` node type has no subscriber field; counts arrive post-save via enrichment
- TypeScript fix: Supabase `.select('youtube_id')` returns `any[]` in this context; added explicit type annotation to the `.map()` callback

## Deviations from Plan

One minor TypeScript fix vs the plan's code block: `(saved ?? []).map((r: { youtube_id: string }) => r.youtube_id)` — the original `r => r.youtube_id as string` produced a `Parameter 'r' implicitly has an 'any' type` error under strict mode.

## Self-Check: PASSED

- [x] `searchVideosByKeyword` exported, uses `type: 'video'`, no `sort_by`, has `has_continuation` guard
- [x] `DiscoveredChannel` interface exported with `subscriberCount: number | null`
- [x] Route: auth gate, `Promise.all` dual search, relevance-first merge, single `.in()` query
- [x] `tsc --noEmit` exits 0
- [x] `npm run build` exits 0

---
*Phase: 03-channel-discovery*
*Completed: 2026-05-14*
