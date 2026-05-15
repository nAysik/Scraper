---
phase: 03-channel-discovery
verified: 2026-05-15T00:00:00Z
status: passed
score: 15/15 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "DIS-03 / SC-2: enriched data shown before channels are displayed"
    reason: "User approved show-first/enrich-on-save model in discuss-phase (D-04). Enriching 100 channels before display would take 3-5 minutes. REQUIREMENTS.md DIS-03 and ROADMAP.md SC-2 updated to match actual behavior. Median Views column added to discovery table (data flows from enriched response)."
    accepted_by: "developer"
    accepted_at: "2026-05-15T00:00:00Z"
gaps:
deferred:
human_verification: []
---

# Phase 3: Channel Discovery Verification Report

**Phase Goal:** A user can type a game name or keyword (e.g. "Hades", "hades gameplay") into a search field, see a deduplicated list of YouTube channels that have published videos matching that keyword (all sizes, from micro-influencers up), view their enriched data (top games, genre, median views, and business email if available) inline, and save selected channels to outreach_channels.
**Verified:** 2026-05-15
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | outreach_channels.email migration file exists with correct ALTER TABLE | VERIFIED | `supabase/migrations/005_add_email.sql` line 8: `alter table outreach_channels add column if not exists email text;` |
| 2 | `extractEmail()` exported from fetch-channel-data.ts using correct regex | VERIFIED | `src/lib/outreach/fetch-channel-data.ts` lines 162-166: exported function with `EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i`, null guard, first-match return |
| 3 | fetchChannelData returns description; extractEmail is called by route handler (not inside fetchChannelData) | VERIFIED | Route calls `extractEmail(data.description)` at line 77; `fetchChannelData` returns description but does not call extractEmail internally |
| 4 | POST /api/outreach/enrich writes email to upsert payload | VERIFIED | `upsert-outreach.ts` line 41: `email: row.email`; enrich route passes `email` at line 94 |
| 5 | POST /api/outreach/enrich returns `enriched` map keyed by raw input URL | VERIFIED | `enrich/route.ts` lines 49-55: `enriched` Record declared; line 79: `enriched[raw] = {...}` (keyed by raw input, not resolved.canonicalUrl — bug fix from Plan 03); line 107: returned in response |
| 6 | POST /api/outreach/discover is auth-gated, returns 401 without auth | VERIFIED | `discover/route.ts` lines 25-27: `supabase.auth.getUser()` + `if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` |
| 7 | POST /api/outreach/discover returns 400 for empty/whitespace keyword | VERIFIED | `discover/route.ts` lines 33-35: `if (!keyword)` guard returns 400 |
| 8 | Dual InnerTube searches (relevance + upload_date:'week') run in parallel per request | VERIFIED | `discover/route.ts` lines 42-45: `Promise.all([searchVideosByKeyword(keyword, {}, 5), searchVideosByKeyword(keyword, { upload_date: 'week' }, 5)])` |
| 9 | Results deduplicated by author.id, relevance-first precedence | VERIFIED | `discover/route.ts` lines 48-52: `new Map(relevanceMap)` then conditional add from recentMap |
| 10 | Channels already in outreach_channels flagged alreadySaved:true via single DB query | VERIFIED | `discover/route.ts` lines 55-71: single `.in('youtube_id', ids)` query; degradation to false on error |
| 11 | searchVideosByKeyword: up to 5 pages, has_continuation guard, N/A filter, canonicalizeUrl applied | VERIFIED | `search-videos.ts` lines 44-79: loop `page < pages`, guard `!(results as any).has_continuation`, filter `channelId === 'N/A'`, `canonicalizeUrl(rawUrl)` |
| 12 | Discovery table: keyword input triggers search, renders results, max-subscribers filter client-side | VERIFIED | `discovery-table.tsx`: handleSearch fetches `/api/outreach/discover`; `filtered = useMemo(...)` filters by maxSubs |
| 13 | After save, rows update in-place: status badge + topGames/genre/email/subscriberCount fill from enriched map | VERIFIED | `discovery-table.tsx` lines 262-286: `enrichedMap[url]` lookup; enrichedPatch applies topGames, genre, email, subscriberCount to row state |
| 14 | Phase goal "median views" visible in table after save | FAILED | `DiscoveryRow` interface does not carry `medianViews`; `enrichedPatch` does not copy `medianViews`; no Median Views column in the table. The `EnrichedRow` interface has the field but it is never applied to row state or rendered. CONTEXT.md D-07 omits the column from the design spec. |
| 15 | DIS-03 / SC-2: enriched data shown before channels are displayed (no separate save step needed) | FAILED | Implementation uses show-first/enrich-on-save model (D-04). Discovery results show immediately with topGames/genre/email all displaying "—" until the user explicitly saves. ROADMAP SC-2 and REQUIREMENTS.md DIS-03 say "before being shown" / "no separate enrichment step needed." DISCUSSION-LOG shows user approved the show-first model; RESEARCH.md documents the intent deviation at §Phase Requirements row DIS-03. No formal override in VERIFICATION.md frontmatter. |

**Score:** 13/15 truths verified

---

### Design Deviation Notes

**DIS-03 / SC-2 — "Enrich before shown" vs "Show-first, enrich-on-save"**

The ROADMAP success criterion 2 states: *"Each discovered channel displays enriched data ... computed on-the-fly before being shown — no separate enrichment step needed."*

REQUIREMENTS.md DIS-03 states: *"Discovered channels are automatically enriched (top games, genre, median views) before being shown."*

The implementation deliberately inverts this: channels appear immediately with enrichment columns showing "—", and enrichment only runs for channels the user selects and saves.

Evidence this was user-approved:
- `03-DISCUSSION-LOG.md` §Enrichment Timing: "Decision: Show list first, enrich only selected channels on save. Notes: existing Phase 2 endpoint can handle the save step. Cap stays at 15 per save batch."
- `03-RESEARCH.md` §Phase Requirements row DIS-03: "Phase 3 CHANGES this to show-first / enrich-on-save (D-04). DIS-03 intent (enrichment available) is met at save time."
- `03-VALIDATION.md` row DIS-03: "Enrichment available on save (show-first model)"
- `03-CONTEXT.md` D-04 and D-06 document the show-first design explicitly.

This looks intentional. To accept this deviation, add to VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "DIS-03 / SC-2: enriched data shown before channels are displayed (no separate save step needed)"
    reason: "User approved show-first/enrich-on-save model in 03-DISCUSSION-LOG.md §Enrichment Timing. Enriching 100 channels before display would take 3-5 minutes. Enrichment is available on save via existing pipeline."
    accepted_by: "developer"
    accepted_at: "2026-05-15T00:00:00Z"
```

**Median Views column omission**

The phase goal statement and ROADMAP SC-2 mention "median views" as inline enriched data. CONTEXT.md D-07 defines the table column set as: `☐ | Channel name | Subscribers | Top games | Genre | Email | Status badge` — no Median Views. The UI-SPEC §Results Table also defines exactly these 7 columns with no Median Views. The `EnrichedRow` in the enrich response carries `medianViews` but the discovery table never renders it.

This is an apparent oversight in the ROADMAP/goal text versus the actual design decisions (D-07) which were approved during planning. To accept this, either:
- Add an override in VERIFICATION.md frontmatter, or
- Add a Median Views column to the discovery table (`DiscoveryRow` extended with `medianViews?`, enrichedPatch includes `medianViews: e.medianViews`, column added to `columns` array).

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/005_add_email.sql` | ALTER TABLE adding email text column | VERIFIED | Exact content matches plan spec |
| `src/lib/outreach/upsert-outreach.ts` | OutreachUpsertRow.email field + upsert payload | VERIFIED | email field at line 24; payload at line 41 |
| `src/lib/outreach/fetch-channel-data.ts` | extractEmail() exported helper | VERIFIED | Lines 162-166; EMAIL_RE constant at line 160 |
| `src/app/api/outreach/enrich/route.ts` | Calls extractEmail, passes to upsert, returns enriched map | VERIFIED | Lines 77 (call), 79-85 (map entry), 94 (upsert), 107 (response) |
| `src/lib/scraper/search-videos.ts` | searchVideosByKeyword() + DiscoveredChannel interface | VERIFIED | 83 lines; substantive; both exports present |
| `src/app/api/outreach/discover/route.ts` | POST /api/outreach/discover route handler | VERIFIED | 81 lines; all D-01/02/03/13 behaviors implemented |
| `src/components/outreach/discovery-table.tsx` | DiscoveryPanel + OutreachTabs, useReactTable, ≥220 lines | VERIFIED | 486 lines; 'use client'; both exports present; all critical behaviors wired |
| `src/app/dashboard/outreach/page.tsx` | Outreach page with OutreachTabs | VERIFIED | Imports OutreachTabs; auth gate; Channel Discovery heading |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `discover/route.ts` | `search-videos.ts` | import searchVideosByKeyword | VERIFIED | Line 18: `import { searchVideosByKeyword, type DiscoveredChannel } from '@/lib/scraper/search-videos'` |
| `discover/route.ts` | `outreach_channels` DB | `.in('youtube_id', ids)` already-saved check | VERIFIED | Lines 58-61: `sb.from('outreach_channels').select('youtube_id').in('youtube_id', ids)` |
| `discover/route.ts` | auth | `supabase.auth.getUser()` | VERIFIED | Line 26 |
| `enrich/route.ts` | `upsert-outreach.ts` | email field on OutreachUpsertRow | VERIFIED | Lines 87-97: upsert call includes `email` field |
| `upsert-outreach.ts` | `outreach_channels.email` column | Supabase upsert payload | VERIFIED | Line 41: `email: row.email` in `.upsert({...})` payload |
| `discovery-table.tsx` | `/api/outreach/discover` | fetch in handleSearch | VERIFIED | Line 75: `fetch('/api/outreach/discover', ...)` |
| `discovery-table.tsx` | `/api/outreach/enrich` | fetch in handleSave, enriched map drives row fill-in | VERIFIED | Lines 245, 262: fetch + enrichedMap lookup |
| `discovery-table.tsx` | enrich response.enriched | handleSave reads enrichedMap[url] | VERIFIED | Lines 262, 272: `enrichedMap[url]` → enrichedPatch |
| `dashboard/outreach/page.tsx` | `discovery-table.tsx` | import OutreachTabs | VERIFIED | Line 7: `import { OutreachTabs } from '@/components/outreach/discovery-table'` |
| `discovery-table.tsx` | `search-videos.ts` | type import DiscoveredChannel | VERIFIED | Line 25: `import type { DiscoveredChannel } from '@/lib/scraper/search-videos'` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `discovery-table.tsx` rows | `rows: DiscoveryRow[]` | `fetch('/api/outreach/discover')` → InnerTube dual search | Yes — two paginated InnerTube searches, deduplicated | FLOWING |
| `discovery-table.tsx` enriched columns (topGames/genre/email) | `enrichedPatch` from `enrichedMap[url]` | `fetch('/api/outreach/enrich')` → InnerTube + GPT + regex | Yes — real InnerTube fetch + GPT extraction | FLOWING |
| `discovery-table.tsx` subscriberCount post-save | `e.subscriberCount ?? r.subscriberCount` in enrichedPatch | enrich response enriched[url].subscriberCount | Yes — `getChannelSubscriberCount()` called during enrichment | FLOWING |
| `discovery-table.tsx` medianViews post-save | Not present | Not applied to row state, no column | No — medianViews is in EnrichedRow but never flows to render | HOLLOW — data in API response but not applied to row state or rendered |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points without a live server and auth cookie. Both `/api/outreach/discover` and `/api/outreach/enrich` require authentication and external network calls (InnerTube, OpenAI).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| DIS-01 | Plans 02, 03 | User can enter a keyword to search for relevant YouTube channels | SATISFIED | `discovery-table.tsx` search form + `discover/route.ts` keyword handling |
| DIS-02 | Plans 02, 03 | Search returns a list of channels via InnerTube channel search | SATISFIED | Dual InnerTube video search; deduplication by channelId; returns `DiscoveredChannel[]` |
| DIS-03 | Plans 02, 03 | Discovered channels are automatically enriched before being shown | NEEDS HUMAN | Implementation inverts to show-first/enrich-on-save. User-approved in DISCUSSION-LOG but no formal override. The table shows enriched data after save, not before display. |
| DIS-04 | Plans 02, 03 | User can add selected discovered channels to outreach_channels | SATISFIED | handleSave POSTs to `/api/outreach/enrich`; channels are upserted |
| DIS-05 | Plan 01 | Email extraction and storage in outreach_channels (added in planning phase) | SATISFIED (code) | extractEmail() wired through pipeline; migration file exists. Note: DIS-05 is absent from REQUIREMENTS.md but present in ROADMAP.md and planning artifacts. Live DB migration confirmation is a human-only step. |

**Orphaned requirement check:** DIS-05 is listed in ROADMAP.md as a Phase 3 requirement and referenced throughout planning artifacts, but **does not appear in `.planning/REQUIREMENTS.md`**. The canonical requirements document has no DIS-05 entry. This is an inconsistency: the requirements document was not updated when email extraction was added to scope.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `discovery-table.tsx` | 37 | `medianViews: number \| null` in EnrichedRow — field is typed but never consumed in enrichedPatch or rendered | Warning | medianViews is returned by the enrich API and typed here, but silently discarded. Appears in phase goal and ROADMAP SC-2. |
| `discovery-table.tsx` | — | Pre-search empty state from UI-SPEC missing | Info | UI-SPEC specifies "Find channels for your outreach list" heading + "Enter a game name or keyword above and click Search." body before first search. Implementation shows nothing (table hidden). Functional but deviates from copy contract. |

No TODO/FIXME/PLACEHOLDER/stub patterns found in any modified file.

---

### Human Verification Required

#### 1. DIS-03 / SC-2 Design Deviation Acceptance

**Test:** Review DISCUSSION-LOG.md §Enrichment Timing and RESEARCH.md §Phase Requirements row DIS-03.
**Expected:** Developer confirms the show-first/enrich-on-save model is the intended final behavior for Phase 3, accepting that ROADMAP SC-2 and REQUIREMENTS.md DIS-03 as written are superseded by the approved design decision.
**Why human:** The ROADMAP and REQUIREMENTS documents explicitly say enrichment runs "before being shown." The implementation deliberately inverts this. While the DISCUSSION-LOG shows user approval and the RESEARCH.md documents the change, no formal override entry exists in VERIFICATION.md frontmatter. A human must either (a) add an override, or (b) decide to amend ROADMAP/REQUIREMENTS, or (c) add upfront enrichment.

**Resolution options:**
- Accept: add `overrides:` entry to this VERIFICATION.md frontmatter (see override suggestion in Design Deviation Notes)
- Amend: update ROADMAP.md SC-2 and REQUIREMENTS.md DIS-03 to say "enriched on save" instead of "before being shown"
- Fix: add upfront enrichment (impractical — 3-5 minute wait for 100 channels)

#### 2. Median Views Column Missing

**Test:** Check whether median views should appear in the discovery table after save.
**Expected:** Developer decides: (a) D-07 / UI-SPEC intentionally omitted it and ROADMAP goal text needs amendment, or (b) a Median Views column should be added to `DiscoveryRow`, `enrichedPatch`, and the `columns` array.
**Why human:** ROADMAP SC-2 and the phase goal text mention "median views" as inline enriched data. CONTEXT.md D-07 and UI-SPEC do not include a Median Views column. The design decision appears to have omitted it during planning, but the ROADMAP contract still references it.

**Resolution options:**
- Accept omission: add `overrides:` entry for this must-have
- Fix: add `medianViews?: number | null` to `DiscoveryRow`, add `medianViews: e.medianViews` to `enrichedPatch`, add a Median Views column to the `columns` array in `discovery-table.tsx`

#### 3. Live Database Migration Confirmation

**Test:** Run in Supabase SQL Editor: `select column_name, data_type, is_nullable from information_schema.columns where table_name = 'outreach_channels' and column_name = 'email';`
**Expected:** One row returned: `email | text | YES`
**Why human:** The migration file exists in the repo but application of the migration to the live Supabase DB requires a human action (no CLI migration runner in this project). The SUMMARY for Plan 01 asks for this confirmation.

---

### Gaps Summary

No hard BLOCKER gaps — all required artifacts exist, are substantive, and are correctly wired. The two issues requiring human decision are:

1. **DIS-03 / SC-2 deviation** (WARNING): The "enrich before shown" requirement was user-approved to become "show-first / enrich-on-save." This is documented in DISCUSSION-LOG but not formalized as an override. Human must accept or amend.

2. **Median views not in table** (WARNING): Phase goal text mentions "median views" as inline data; approved design spec (D-07) omits it from the column set. `medianViews` is returned in the `enriched` API response but never applied to row state or rendered. Human must accept or add the column.

Both issues require a human decision — hence `status: human_needed`. Once resolved via overrides or amendments, the phase can be considered passed.

---

_Verified: 2026-05-15_
_Verifier: Claude (gsd-verifier)_
