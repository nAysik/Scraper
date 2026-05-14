# Phase 3: Channel Discovery - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

A keyword search UI (e.g. "Hades", "hades gameplay") that runs two parallel InnerTube video searches (relevance-sorted + upload-date-sorted), deduplicates results by channel ID, and displays up to ~100 unique channels in a checkable table. The table shows channel name and subscriber count immediately from search metadata. A max-subscribers filter lets the user narrow to micro-influencers. The user selects up to 15 channels and clicks Save — only selected channels are fully enriched (playlists + videos + About + GPT + email extraction) via the existing enrichment pipeline and upserted to `outreach_channels`. Already-saved channels appear with an "Already saved" badge and disabled checkbox.

In scope: video search, channel deduplication, results table with subscriber filter, select-to-save flow, full enrichment on save, email extraction + DB migration, already-saved badge.
Out of scope: CSV export (Phase 4), re-enrich button (Phase 4), filterable outreach dashboard table (Phase 4), full-text channel search (different from video search).

</domain>

<decisions>
## Implementation Decisions

### Search Strategy
- **D-01:** Run **two parallel InnerTube video searches** for every keyword: one with default relevance ranking, one sorted by upload date (`sort_by: 'upload_date'`). Merge and deduplicate results by channel ID. Purpose: relevance captures established channels; upload-date surfaces recent micro-influencer content. Total: 5 pages × 2 sort orders = ~200 raw video results.
- **D-02:** Fetch **5 pages** per sort order. Target: ~60-100 unique channels after deduplication. InnerTube `search()` returns a `Search` object; call `.getContinuation()` for subsequent pages.
- **D-03:** From video search results, extract per-channel: `channelId` (for deduplication key), `channelName`, `channelHandle` or URL (for the save step), `subscriberCount` if available in video metadata. These fields are shown immediately — no extra InnerTube call at this stage.

### Enrichment Flow
- **D-04:** **Show-first, enrich-on-save**. The search results table renders immediately with name + subscriber count. Full enrichment (playlists, videos, About, GPT-4o-mini, email regex) only runs for channels the user selects and saves. No enrichment on unselected channels.
- **D-05:** Save flow reuses the existing `POST /api/outreach/enrich` route with channel URLs derived from search results. Cap stays at **15 channels per save batch** (matching Phase 2). If user selects more than 15, show an inline over-limit message (same client-side guard as Phase 2's textarea cap).
- **D-06:** After save, selected rows update **in place** — spinner while enriching, then top_games, genre, and email fill in on the same table row. Table stays visible. No redirect, no page reload.

### Results UI
- **D-07:** **Simple table with checkboxes**, using TanStack Table (already installed — `@tanstack/react-table`). Columns: `☐ | Channel name | Subscribers | Top games (empty until saved) | Genre (empty until saved) | Email (empty until saved) | Status badge`.
- **D-08:** Table sorted by **subscriber count ascending** by default — smallest channels rise to the top, biasing toward micro-influencers in the default view.
- **D-09:** **Max-subscribers filter** — text/number input above the table. Filters client-side. Default: no filter (show all). Example: user types "10000" to see only channels under 10k subscribers.
- **D-10:** **"Already saved" badge** on channels whose `youtube_id` already exists in `outreach_channels`. Checkbox is disabled for these rows (no re-save from discovery UI — use Phase 4's re-enrich button for that).

### Email Extraction
- **D-11:** Add `email text` column to `outreach_channels` via a new Supabase migration (`005_add_email.sql`). Nullable. No unique constraint.
- **D-12:** During enrichment (on save), extract email from channel About page description using regex: `/[\w.+-]+@[\w-]+\.[a-z]{2,}/i`. First match wins. Stored in `email` column. If no match, `email` remains null.

### Already-Saved Check
- **D-13:** Discovery API endpoint returns `youtube_id` for each discovered channel. The client fetches the current set of `youtube_id` values from `outreach_channels` (or the server includes an `already_saved: boolean` flag per result) and applies the badge client-side.

### Claude's Discretion

- **Search endpoint shape:** `POST /api/outreach/discover` with body `{ keyword: string }`. Returns `{ channels: DiscoveredChannel[] }` where `DiscoveredChannel = { channelId, name, url, subscriberCount, alreadySaved }`.
- **Concurrency for dual search:** Both sort orders run with `Promise.all`. Page continuation fetched sequentially within each sort order.
- **Deduplication:** `Map<channelId, DiscoveredChannel>` — first occurrence wins (relevance result takes precedence over upload-date result for the same channel).
- **Loading state:** Spinner + "Searching..." while both searches run. Results table appears when complete. Matches existing Phase 2 spinner pattern.
- **Page directory:** Discovery search UI lives at `src/app/dashboard/outreach/discover/page.tsx` or integrated into the existing `src/app/dashboard/outreach/page.tsx` as a tab/section. Planner decides.
- **Select-all checkbox:** Include a header checkbox that selects/deselects all visible (filtered) rows, capped at 15. Standard TanStack Table pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Channel Discovery — DIS-01 through DIS-05
- `.planning/ROADMAP.md` §Phase 3 — Updated goal with video search approach, email, all-size discovery

### Prior Phase Decisions
- `.planning/phases/02-enrichment-pipeline/02-CONTEXT.md` — Full enrichment pipeline decisions (D-01 through D-12). Phase 3 reuses the enrichment pipeline on save.
- `.planning/phases/01-database-foundation/01-01-SUMMARY.md` — `outreach_channels` schema; service-role write pattern.

### Existing Code (mandatory reads)
- `src/lib/scraper/innertube.ts` — Singleton InnerTube client. Reuse. Do NOT instantiate a new one.
- `src/lib/scraper/channels.ts` — `searchChannelsByKeyword()` uses `client.search(keyword, { type: 'channel' })`. Phase 3 uses `type: 'video'` instead — read this file for the search+continuation pattern and adapt.
- `src/lib/scraper/shorts.ts` — Uses `client.search(keyword, { type: 'shorts', upload_date: 'week' })` with `sort_by` and pagination. Directly relevant to Phase 3's upload-date search variant.
- `src/lib/outreach/fetch-channel-data.ts` — Full enrichment function reused on save. `PlaylistMeta`, `OutreachChannelData`, `fetchChannelData()`.
- `src/lib/outreach/extract-games.ts` — `extractGamesGenre()` with playlist-hybrid prompt. Called during save enrichment.
- `src/lib/outreach/upsert-outreach.ts` — `upsertOutreachChannel()`. Phase 3's save step calls this after enrichment.
- `src/app/api/outreach/enrich/route.ts` — Existing enrich endpoint. Phase 3's save may call this directly or share its pipeline logic.
- `src/components/outreach/enrich-form.tsx` — Phase 2 form pattern: submit-and-wait, inline summary, cap guard. Reference for Phase 3's save button behavior.
- `src/components/videos-table.tsx` — TanStack Table implementation reference for the discovery results table.

### Schema
- `supabase/migrations/004_outreach_channels.sql` — Current schema Phase 3 writes to.
- New: `supabase/migrations/005_add_email.sql` — Must be created in Phase 3 to add `email text` column.

### Spike Findings
- `.planning/spikes/001-channel-playlists/README.md` — LockupView parsing pattern for playlists. Already implemented but useful reference for understanding the `as any` cast convention.
- `.planning/spikes/MANIFEST.md` — Spike overview.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **InnerTube singleton** — `src/lib/scraper/innertube.ts`. Import `getClient()`.
- **Search + continuation pattern** — `src/lib/scraper/channels.ts` `searchChannelsByKeyword()` and `src/lib/scraper/shorts.ts` show how to call `client.search()` and iterate pages via `.getContinuation()`. Phase 3 adapts this for `type: 'video'`.
- **Full enrichment pipeline** — `src/lib/outreach/fetch-channel-data.ts` + `extract-games.ts` + `upsert-outreach.ts`. Reused verbatim on save.
- **TanStack Table** — `@tanstack/react-table` already installed; `src/components/videos-table.tsx` has the full useMemo + filter pattern. Phase 3's discovery table follows this pattern.
- **Phase 2 cap guard** — Client-side row count check in `src/components/outreach/enrich-form.tsx`. Phase 3 applies same logic to checkbox selection count.

### Established Patterns
- `as any` casts for youtubei.js nodes — video search results will return node types that need the same treatment.
- Sequential `for...await` within a single search direction; `Promise.all` across the two parallel searches.
- Service role client (`createServiceClient()`) for all `outreach_channels` writes.
- Auth gate: `supabase.auth.getUser()` check at the top of all route handlers.

### Integration Points
- New API route: `src/app/api/outreach/discover/route.ts` — POST, auth-gated, body `{ keyword: string }`.
- New page/section: under `src/app/dashboard/outreach/` — planner picks exact path.
- DB migration: `supabase/migrations/005_add_email.sql` — adds `email text` nullable column to `outreach_channels`.
- Save step: calls existing `/api/outreach/enrich` (or its shared pipeline logic) with the selected channel URLs.
- Already-saved check: query `outreach_channels` for `youtube_id` values matching discovered channels — either server-side (return `alreadySaved` flag per result) or client-side (fetch all saved IDs on page load).

</code_context>

<specifics>
## Specific Ideas

- The dual-search approach (relevance + upload-date) is the key insight for micro-influencer discovery — "show-first, enrich-on-save" is the key insight for handling 100 results without a 5-minute wait.
- Table sorted ascending by subscribers by default puts micro-influencers at the top without any extra action from the user.
- Email extraction is zero-cost (regex over the About page text we already fetch) and high-value for outreach.

</specifics>

<deferred>
## Deferred Ideas

- **Re-enrich from discovery UI** — already in Phase 4 scope (re-enrich button on outreach dashboard). Already-saved channels in the discovery table are read-only (badge only).
- **Multi-keyword sweep** — user suggested they might want to run "hades", "hades gameplay", "hades indie" as separate searches. Not in scope for Phase 3; could be a future enhancement where the discovery page accepts multiple keywords.
- **View-count filter on discovered channels** — could be useful alongside the subscriber filter, but not discussed. Note for Phase 4 or a future discovery iteration.

</deferred>

---

*Phase: 3-Channel Discovery*
*Context gathered: 2026-05-14*
