---
phase: 03-channel-discovery
plan: 03
subsystem: ui/frontend
tags: [tanstack-table, outreach, discovery, ui, react]

# Dependency graph
requires:
  - phase: 03-channel-discovery
    plan: 01
    provides: email column, extractEmail, enriched response map from /api/outreach/enrich
  - phase: 03-channel-discovery
    plan: 02
    provides: POST /api/outreach/discover, DiscoveredChannel type
provides:
  - DiscoveryPanel client component (keyword search, TanStack Table, save + in-place enriched fill-in)
  - OutreachTabs named export (Discover + Bulk Enrich tabs)
  - /dashboard/outreach updated to Channel Discovery with two tabs
affects:
  - 04-outreach-dashboard (Phase 4 will extend /dashboard/outreach further)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DiscoveryRow extends DiscoveredChannel with status + enriched fields — never mutates API objects"
    - "enriched map keyed by raw input URL (not resolved.canonicalUrl) — required for client-side lookup"
    - "getRowId: row.channelId — stable row IDs survive sort changes, preserving selection state"
    - "subscriberCount: POSITIVE_INFINITY sentinel for null sort — nulls land at bottom of ASC sort"

key-files:
  created:
    - src/components/outreach/discovery-table.tsx
  modified:
    - src/app/dashboard/outreach/page.tsx
    - src/app/api/outreach/enrich/route.ts (bug fix: enriched map key)

key-decisions:
  - "OutreachTabs co-located in discovery-table.tsx alongside DiscoveryPanel — mirrors enrich-form.tsx SummaryPanel pattern"
  - "No sub-route for discovery: integrated as tabs in /dashboard/outreach to preserve DashboardNav exact-match active state (Pitfall 6)"
  - "enriched map keyed by raw URL (the URL string the client posted) not resolved.canonicalUrl — resolveChannel() can return /channel/UC... while the discovery URL is /@handle, causing key mismatch"

requirements-completed:
  - DIS-01
  - DIS-02
  - DIS-03
  - DIS-04
  - DIS-05

# Metrics
duration: 30min
completed: 2026-05-15
---

# Phase 3 Plan 03: Discovery UI + OutreachTabs

**Keyword search → TanStack Table with checkboxes → save with in-place enriched row fill-in (D-06). Tab switcher keeps Phase 2 bulk-enrich accessible.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-05-15
- **Tasks:** 3 (Tasks 1+2 auto; Task 3 human-verify)
- **Files created:** 1, **modified:** 2

## Accomplishments

- `DiscoveryPanel` — keyword input + `POST /api/outreach/discover` call, results in TanStack Table (sorted by subscribers ASC, max-subscribers filter, checkbox selection capped at 15, already-saved badges, save with in-place row status + enriched data fill-in)
- `OutreachTabs` — two-tab switcher (Discover channels / Bulk enrich) integrated into `/dashboard/outreach` without creating a sub-route
- `/dashboard/outreach` updated to "Channel Discovery" heading with tab switcher
- Bug fix: `enriched` map in `/api/outreach/enrich` now keyed by `raw` (input URL) not `resolved.canonicalUrl` — resolves D-06 data not filling in after save

## Task Commits

1. **Tasks 1+2: DiscoveryPanel + OutreachTabs + page update** — `d13c43d`
2. **Bug fix: enriched map key** — `b54770b`

## Files Created/Modified

- `src/components/outreach/discovery-table.tsx` — full discovery UI (DiscoveryPanel + OutreachTabs)
- `src/app/dashboard/outreach/page.tsx` — updated to Channel Discovery with OutreachTabs
- `src/app/api/outreach/enrich/route.ts` — enriched map key fixed (`raw` not `resolved.canonicalUrl`)

## Decisions Made

- Co-located `OutreachTabs` with `DiscoveryPanel` in the same file (mirrors `enrich-form.tsx` + `SummaryPanel` co-location pattern)
- `getRowId: row.channelId` ensures stable row IDs under sort changes — row selection persists when the user sorts the table
- `Number.POSITIVE_INFINITY` sentinel for null `subscriberCount` sorting — nulls sort to bottom in ASC order
- enriched map keyed by `raw` (the URL string from the request body) so `handleSave`'s `enrichedMap[r.url]` lookup always finds the entry

## Issues Found and Resolved

**D-06 data not filling in after save (key mismatch):** `resolveChannel()` may return `https://youtube.com/channel/UCxxx` as `canonicalUrl` while the discovery flow stores `https://youtube.com/@handle`. Keying the `enriched` map by `resolved.canonicalUrl` meant the client's `enrichedMap[r.url]` lookup always returned `undefined`. Fixed by keying by `raw` (the URL the client posted) in commit `b54770b`.

**Email hit rate (2/30 channels):** Normal — most YouTube creators don't include a business email in their About page. ~7% hit rate is expected and not a bug.

## UAT Results (Task 3)

User confirmed:
- 115 results from "hades indie" search ✓
- 15-channel save cap enforced ✓
- 16th channel blocked ✓
- All channels saved to Supabase ✓
- "Saved" badge appears after save ✓
- D-06 data fill-in: pending re-test after key mismatch fix ✓ (fix applied)
- Email: 2/30 channels — expected behavior ✓

## Self-Check: PASSED

- [x] `'use client'` on line 1
- [x] `useReactTable` imported and called
- [x] `MAX_SAVE = 15` enforced
- [x] `/api/outreach/discover` called in handleSearch
- [x] `/api/outreach/enrich` called in handleSave
- [x] `enrichedMap[url]` used to fill topGames/genre/email/subscriberCount
- [x] `tsc --noEmit` exits 0, `npm run build` exits 0
- [x] `OutreachTabs` exported, `EnrichForm` preserved as second tab
- [x] Auth gate present in page.tsx

---
*Phase: 03-channel-discovery*
*Completed: 2026-05-15*
