---
phase: 04-outreach-dashboard-export
verified: 2026-05-15T00:00:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Outreach list tab renders table with live data"
    expected: "Navigating to /dashboard/outreach, clicking 'Outreach list', shows a spinner then a populated table (or empty-state message). Genre dropdown, min-median-views, and max-subscribers inputs are visible in the toolbar."
    why_human: "Requires a running dev server with valid Supabase credentials and at least one row in outreach_channels to confirm the full data flow is visible."
  - test: "Re-enrich button updates a row in place"
    expected: "Clicking Re-enrich shows the Loader2 spinner and 'Enriching…' label, the row goes opacity-50, and after the API call completes the row fields (top_games, genre, medianViews, lastEnrichedAt) are updated without a page reload."
    why_human: "Real-time optimistic-update behaviour requires human observation against a live server."
  - test: "Export CSV downloads a valid Notion-compatible file"
    expected: "Clicking 'Export CSV' downloads outreach-channels-YYYY-MM-DD.csv. Opening the file shows a header row (Channel name, URL, Subscribers, Top games, Genre, Median views, Last enriched, Email) and one data row per visible channel. Importing into Notion reads each column without encoding issues."
    why_human: "File download and Notion import acceptance must be verified manually."
---

# Phase 4: Outreach Dashboard & Export Verification Report

**Phase Goal:** The existing dashboard gains an "Outreach list" tab (3rd tab in OutreachTabs) that displays all `outreach_channels` rows in a filterable TanStack Table, lets the user re-enrich or delete individual channels, supports bulk delete via checkboxes, and provides a CSV export button.
**Verified:** 2026-05-15
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "Outreach list" tab visible as 3rd tab in OutreachTabs | VERIFIED | `discovery-table.tsx` line 463-509: tab union includes `'outreach-list'`, button "Outreach list" renders at position 3, `OutreachList` mounts conditionally on `tab === 'outreach-list'` |
| 2 | Tab fetches all outreach_channels rows on first render | VERIFIED | `outreach-list.tsx` lines 55-76: `useEffect` with empty dep array calls `fetch('/api/outreach/channels')`, populates `rows` state. API route queries `supabase.from('outreach_channels').select(...)` ordered by `last_enriched_at desc`. |
| 3 | Table shows required columns (name/link, subs, top games, genre, median views, last enriched, email, checkbox, actions) | VERIFIED | `outreach-list.tsx` `columns` useMemo defines: select (checkbox), name (link), subscriberCount, topGames, genre, medianViews, lastEnrichedAt, email, actions (Re-enrich + Delete). All 9 plan-required columns present. |
| 4 | Genre, min-median-views, max-subscribers filters narrow rows client-side | VERIFIED | `outreach-list.tsx` lines 83-88: `filtered` useMemo applies all three filter conditions. Genre Select, min-views Input, and max-subs Input all present in toolbar JSX (lines 337-367). |
| 5 | Re-enrich button calls POST /api/outreach/enrich and updates row in place | VERIFIED | `handleReenrich` (lines 90-133): sets `status: 'enriching'`, POSTs to `/api/outreach/enrich`, patches row fields from `enrichedMap` on success. Actions column renders `<Loader2 animate-spin>` + "Enriching…" when `status === 'enriching'`. |
| 6 | Delete button removes row from table and calls DELETE /api/outreach/channels/[youtubeId] | VERIFIED | `handleDelete` (lines 135-147): optimistic removal from `rows` state, then `fetch('/api/outreach/channels/${youtubeId}', { method: 'DELETE' })`. Backup row restored on failure. |
| 7 | Bulk delete via checkboxes calls POST /api/outreach/channels/bulk-delete | VERIFIED | `handleBulkDelete` (lines 149-167): POSTs `{ ids: Object.keys(rowSelection) }` to `/api/outreach/channels/bulk-delete`. "Delete N channels" button visible only when `selectedCount > 0`. |
| 8 | Export CSV downloads filtered rows in UTF-8 CSV | VERIFIED | `handleExportCsv` (lines 304-328): uses `table.getRowModel().rows` (respects filters), 8 data columns, UTF-8 BOM prefix, Blob download triggered via anchor click. |

**Score:** 7/7 truths VERIFIED (automated), 3 items require human verification for full confirmation.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/outreach/channels/route.ts` | GET all outreach_channels | VERIFIED | 29 lines, exports `GET` only, auth-gated, SSR client, returns camelCase channel objects |
| `src/app/api/outreach/channels/[youtubeId]/route.ts` | DELETE single channel | VERIFIED | 25 lines, exports `DELETE` only, auth-gated, service role, returns 404 when row not found |
| `src/app/api/outreach/channels/bulk-delete/route.ts` | POST bulk delete | VERIFIED | 29 lines, exports `POST` only, auth-gated, service role, 400 guard on empty/invalid ids |
| `src/components/outreach/outreach-list.tsx` | OutreachList client component | VERIFIED | 457 lines, `'use client'`, default export `OutreachList`, full implementation per plan spec |
| `src/components/outreach/discovery-table.tsx` | OutreachTabs with 3rd tab | VERIFIED | Imports `OutreachList` (line 27), tab union `'discover' | 'enrich' | 'outreach-list'` (line 464), 3rd button + conditional render present |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `outreach-list.tsx` | `/api/outreach/channels` | `fetch` in `useEffect` on mount | WIRED | Line 59: `fetch('/api/outreach/channels')` in useEffect with `[]` deps |
| `outreach-list.tsx` | `/api/outreach/enrich` | `handleReenrich` fetch POST | WIRED | Line 94: `fetch('/api/outreach/enrich', { method: 'POST', ... })` |
| `outreach-list.tsx` | `/api/outreach/channels/[youtubeId]` | `handleDelete` fetch DELETE | WIRED | Line 141: `fetch('/api/outreach/channels/${youtubeId}', { method: 'DELETE' })` |
| `outreach-list.tsx` | `/api/outreach/channels/bulk-delete` | `handleBulkDelete` fetch POST | WIRED | Line 157: `fetch('/api/outreach/channels/bulk-delete', { method: 'POST', ... })` |
| `discovery-table.tsx OutreachTabs` | `OutreachList` | conditional render on tab | WIRED | Line 506: `{tab === 'outreach-list' && <OutreachList />}` |
| `channels/route.ts` | `outreach_channels` table | `supabase.from('outreach_channels')` | WIRED | Line 9-12: full select with order by `last_enriched_at` desc |
| `channels/[youtubeId]/route.ts` | `createServiceClient()` | service role delete by youtube_id | WIRED | Line 13: `createServiceClient()`, line 15-19: `.delete().eq('youtube_id', youtubeId).select(...)` |
| `channels/bulk-delete/route.ts` | `createServiceClient()` | service role delete in ids | WIRED | Line 19: `createServiceClient()`, line 20-24: `.delete().in('youtube_id', ids).select(...)` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `outreach-list.tsx` | `rows` (renders table rows) | `GET /api/outreach/channels` → `supabase.from('outreach_channels').select(...)` | Yes — live DB query, ordered, all columns | FLOWING |
| `channels/route.ts` | `channels` (API response) | `supabase.from('outreach_channels').select(...)` | Yes — real Supabase query, not a static return | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compilation | `npx tsc --noEmit` | Exit 0, no output | PASS |
| GET route exports only GET | `grep -c "^export async function" channels/route.ts` | 1 (GET) | PASS |
| DELETE route exports only DELETE | `grep -c "^export async function" [youtubeId]/route.ts` | 1 (DELETE) | PASS |
| Bulk-delete route exports only POST | `grep -c "^export async function" bulk-delete/route.ts` | 1 (POST) | PASS |
| OutreachList is default export | `grep "export default function OutreachList"` in outreach-list.tsx | Found at line 44 | PASS |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| DASH-01 | Outreach tab visible in existing dashboard navigation | VERIFIED | `dashboard-nav.tsx` line 10: `{ label: 'Outreach', href: '/dashboard/outreach' }` pre-exists; Phase 4 adds "Outreach list" as 3rd sub-tab inside `OutreachTabs` |
| DASH-02 | Outreach tab displays all enriched channels in filterable table | VERIFIED | `outreach-list.tsx`: fetches all rows, genre/min-views/max-subs filters via `useMemo`, TanStack Table rendering |
| DASH-03 | Table columns: channel name, YouTube link, subscribers, top 3 games, genre, median views, last enriched date | VERIFIED | All 7 data columns present as `ColumnDef` entries in `columns` useMemo (plus checkbox and actions columns) |
| DASH-04 | User can trigger re-enrichment from table | VERIFIED | `handleReenrich` → POST `/api/outreach/enrich` → in-place row update; spinner shown during enrichment |
| DASH-05 | User can delete a channel from outreach database | VERIFIED | `handleDelete` → DELETE `/api/outreach/channels/${youtubeId}` via service role; optimistic removal with rollback |
| EXP-01 | User can download all outreach channels as CSV | VERIFIED | `handleExportCsv` uses `table.getRowModel().rows` (filtered view), Blob download triggered client-side |
| EXP-02 | CSV includes all table columns in Notion-import-ready format | VERIFIED | Headers: `['Channel name', 'URL', 'Subscribers', 'Top games', 'Genre', 'Median views', 'Last enriched', 'Email']`; UTF-8 BOM prefix (`﻿`) for Excel/Notion compatibility; all cells double-quote escaped |

**Note on DASH-01 scope interpretation:** The ROADMAP Phase 4 goal text provided by the user specifies "3rd tab in OutreachTabs" which is the `outreach-list` sub-tab. The main `/dashboard/outreach` navigation link was established in Phase 2/3. The ROADMAP SC-1 ("An 'Outreach' tab appears in the existing dashboard navigation") is satisfied by the pre-existing Phase 2 work plus Phase 4's addition of the "Outreach list" sub-tab. No gap.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No `TODO`, `FIXME`, placeholder returns, hardcoded empty data arrays that flow to rendering, or stub implementations found across the five files.

---

## Human Verification Required

### 1. Outreach list tab renders with live data

**Test:** Log in to the app at `/dashboard/outreach`, click the "Outreach list" tab.
**Expected:** A centered spinner appears briefly, then either the TanStack Table renders with `outreach_channels` rows, or the empty-state message "No outreach channels yet. Save channels from the Discover tab to populate this list." is shown. Genre dropdown, Min median views input, and Max subscribers input are visible in the toolbar.
**Why human:** Requires a running dev server, valid Supabase environment variables, and a live database connection. Cannot be verified statically.

### 2. Re-enrich button shows spinner and updates row in place

**Test:** With at least one channel in the table, click the "Re-enrich" button on any row.
**Expected:** Button immediately shows `<Loader2 spin>` + "Enriching…", button is disabled, row goes `opacity-50`. After the API call completes (~5-20 seconds depending on OpenAI), the row's Genre, Top games, Median views, and Last enriched columns update without a page reload. Button returns to "Re-enrich".
**Why human:** Real-time optimistic-update flow requires a running server with valid OpenAI and Supabase credentials.

### 3. Export CSV produces a Notion-compatible file

**Test:** With rows visible in the table, click "Export CSV".
**Expected:** Browser downloads `outreach-channels-YYYY-MM-DD.csv`. Opening the file in a text editor shows: first line is the header row (`"Channel name","URL","Subscribers","Top games","Genre","Median views","Last enriched","Email"`), subsequent lines contain one channel per row with all fields properly quoted. Importing into Notion (via "Import" → "CSV") maps each header to a Notion column without garbled characters.
**Why human:** File download mechanics and Notion import acceptance require manual browser interaction.

---

## Gaps Summary

No automated gaps found. All five deliverable files exist, are substantive (not stubs), are wired together correctly, and TypeScript compilation exits clean. Three human verification items remain for runtime and UX confirmation.

---

_Verified: 2026-05-15_
_Verifier: Claude (gsd-verifier)_
