# Phase 4: Outreach Dashboard & Export - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

A third "Outreach list" tab added to the existing OutreachTabs at `/dashboard/outreach`. The tab loads all rows from `outreach_channels` and displays them in a filterable TanStack Table with per-row Re-enrich and Delete buttons, bulk-delete via checkboxes, and a CSV export button in the toolbar that exports the currently filtered view.

In scope: Outreach list tab, filterable table (genre dropdown, min median views, max subscribers), per-row Re-enrich (in-place update), per-row Delete (immediate), bulk Delete via checkboxes, Export CSV button (filtered rows, UTF-8 comma-separated).
Out of scope: Outreach status tracking (contacted/replied/passed), Notion API integration, multi-keyword sweep, server-side filtering.

</domain>

<decisions>
## Implementation Decisions

### Saved Channels View Placement
- **D-01:** Add **"Outreach list"** as a **3rd tab** in the existing `OutreachTabs` component. Tab order stays: `Discover channels | Bulk enrich | Outreach list` (new tab appended at end — no reordering of existing tabs).
- **D-02:** The Outreach list tab loads all `outreach_channels` rows client-side on first render of that tab. No separate page or route needed.

### Re-enrich UX
- **D-03:** Re-enrich uses **in-place row update with spinner** — same pattern as Phase 3 D-06. Row fields show spinner/loading state while enrichment runs via `POST /api/outreach/enrich`, then top_games, genre, median_views, subscriber_count, email, and last_enriched_at update in place. No page reload.
- **D-04:** Delete is **immediate, no confirmation dialog**. Row disappears from the table on click. API call to delete the row from `outreach_channels` runs in the background; optimistic removal on the client.
- **D-05:** Both **per-row inline buttons** (Re-enrich button + Delete button on each row) AND **bulk delete via checkboxes** (header checkbox to select all visible rows, then a "Delete selected" button appears in the toolbar when any rows are checked).

### CSV Export
- **D-06:** Export CSV exports **filtered rows only** — respects the current filter state (genre, min median views, max subscribers). Exports whatever is currently visible in the table.
- **D-07:** CSV columns: `Channel name, URL, Subscribers, Top games, Genre, Median views, Last enriched, Email`. Email is always included in the CSV even though it may be null for some rows. Column headers use human-readable names (not DB column names).
- **D-08:** "Export CSV" button lives in the **toolbar above the table**, alongside the filter controls. Always visible when the Outreach list tab is active.

### Filters
- **D-09:** All filtering is **client-side** — load all `outreach_channels` rows once on tab mount, filter in the browser with `useMemo`. Consistent with the existing videos table pattern.
- **D-10:** **Genre filter:** Dropdown populated with distinct genre values derived from the loaded rows. "All genres" as default option. Computed client-side from the data (no extra DB query).
- **D-11:** **Max subscribers filter:** Single number input (not a min+max pair). Consistent with Discovery tab's max-subscribers filter. Channels with null subscriber_count pass the filter.
- **D-12:** **Min median views filter:** Single number input. Channels with null median_views are excluded when a filter is set.

### Claude's Discretion
- Data loading: fetch `outreach_channels` via Supabase client in the Outreach list tab component (client-side fetch on tab mount, ordered by `created_at desc` or `last_enriched_at desc` — planner decides sort).
- Delete API: new `DELETE /api/outreach/channels/[youtube_id]` route or `POST /api/outreach/delete` — planner picks the shape. Uses `createServiceClient()` per established pattern.
- CSV generation: pure client-side using a Blob + anchor download pattern (no server route needed). Planner implements.
- Bulk delete: "Delete selected" button appears in the toolbar above the table when at least one row is checked. Sends all selected `youtube_id` values in one request (or sequential — planner decides).
- Row selection for bulk delete uses TanStack Table's `RowSelectionState` — same pattern as Discovery table's existing checkbox implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` §Phase 4 — Goal, success criteria, requirements list (DASH-01 through DASH-05, EXP-01, EXP-02)
- `.planning/REQUIREMENTS.md` — DASH and EXP requirement groups

### Prior Phase Decisions
- `.planning/phases/03-channel-discovery/03-CONTEXT.md` — Discovery table implementation (D-06 in-place update pattern, D-07 TanStack Table setup, D-09 max-subscribers filter, D-10 already-saved badge). Phase 4 re-enrich follows D-06's in-place pattern.
- `.planning/phases/02-enrichment-pipeline/02-CONTEXT.md` — Enrichment pipeline decisions; enrich route shape, partial-save semantics.
- `.planning/phases/01-database-foundation/01-01-SUMMARY.md` — `outreach_channels` schema; service-role write pattern.

### Existing Components (mandatory reads)
- `src/components/outreach/discovery-table.tsx` — Full TanStack Table implementation with checkboxes, in-place row update, subscriber filter, save flow. Phase 4's Outreach list tab follows the same patterns. Also contains `OutreachTabs` — Phase 4 adds the 3rd tab here.
- `src/components/videos-table.tsx` — Client-side filter + TanStack Table pattern reference (the original filter model this project uses).
- `src/components/outreach/enrich-form.tsx` — Phase 2 bulk enrich form. Cap guard pattern, spinner, summary panel.

### Existing Routes
- `src/app/api/outreach/enrich/route.ts` — Re-enrich calls this endpoint with the channel's URL. Returns `{ succeeded, failed[], partial[], enriched{} }`.
- `src/app/dashboard/outreach/page.tsx` — Server Component shell that renders `<OutreachTabs />`. Phase 4 extends `OutreachTabs` in `discovery-table.tsx`.

### Schema
- `supabase/migrations/004_outreach_channels.sql` — Full `outreach_channels` schema (columns, indexes, RLS).
- `supabase/migrations/005_add_email.sql` — Adds `email text` column (nullable).

### Library
- `src/lib/supabase/server.ts` — `createClient()` (SSR) and `createServiceClient()` (service role). Phase 4 reads use `createClient()` in client components via a fetch API; deletes use `createServiceClient()` in a Route Handler.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`OutreachTabs` component** — `src/components/outreach/discovery-table.tsx` (lines 462–495). Phase 4 adds a 3rd tab button and conditionally renders the new `OutreachList` component.
- **TanStack Table with checkboxes and in-place row update** — `DiscoveryPanel` in `discovery-table.tsx`. The Outreach list table follows the same structure: `useReactTable` + `RowSelectionState` + `useMemo` filtering + in-place state update via `setRows`.
- **`fmt()` helper** — `discovery-table.tsx` line 48–52. Shared number formatter (M/K suffix). Reuse for subscribers and median views display.
- **`POST /api/outreach/enrich` endpoint** — Re-enrich sends the channel's URL to this existing endpoint. Response shape: `{ succeeded, failed[], partial[], enriched{} }`.
- **Max-subscribers filter pattern** — `DiscoveryPanel` lines 60, 99–102. Exact same input + `useMemo` filter pattern for Phase 4's max-subscribers filter.

### Established Patterns
- **In-place row update** — `setRows(prev => prev.map(r => r.channelId === target ? {...r, ...patch} : r))` pattern in `DiscoveryPanel.handleSave()`. Phase 4 re-enrich follows this exactly.
- **Auth gate in route handlers** — `supabase.auth.getUser()` check at the top of every Route Handler. New delete route must include this.
- **Service role for writes** — `createServiceClient()` from `src/lib/supabase/server.ts` for all `outreach_channels` mutations. Reads can use the SSR client or a client-side Supabase fetch.
- **Client-side CSV download** — No existing example in this codebase; use standard `Blob + URL.createObjectURL + <a>.click()` pattern.
- **`as any` casts** — Not needed for Supabase query results (typed via generated types or `as` casts). Only needed for youtubei.js nodes.

### Integration Points
- **`OutreachTabs`** (line 462, `discovery-table.tsx`) — Add 3rd tab button `'outreach-list'` and render `<OutreachList />` when active.
- **New `OutreachList` component** — Lives in `src/components/outreach/outreach-list.tsx` (planner decides filename). Fetches `outreach_channels`, renders filterable TanStack Table with re-enrich, delete, bulk-delete, and CSV export.
- **New delete Route Handler** — `src/app/api/outreach/channels/[youtubeId]/route.ts` (DELETE method) or equivalent. Auth-gated, service role delete.
- **No new Supabase migrations needed** — Phase 4 reads and deletes from the existing `outreach_channels` table; no schema changes required.

</code_context>

<specifics>
## Specific Ideas

- The "Export CSV" button should be in the toolbar row alongside genre/views/subscribers filters — visible at all times when the Outreach list tab is active, so users can export at any point without scrolling.
- Bulk delete: checkbox selection pattern is already fully implemented in `DiscoveryPanel` — copy the `RowSelectionState` + header checkbox logic directly. The "Delete selected" action button appears in the toolbar when `selectedCount > 0`.
- In-place re-enrich: the row should show some visual indicator while enriching (e.g., opacity-50 + spinner on the Re-enrich button) then snap to updated values when the enrich response comes back.

</specifics>

<deferred>
## Deferred Ideas

- **View-count filter on Discovery tab** — Noted in Phase 3 deferred. Not addressed in Phase 4 scope.
- **Multi-keyword sweep** — Phase 3 deferred. Not in scope.
- **Outreach status tracking** (contacted/replied/passed) — Out of scope per PROJECT.md; managed in Notion.
- **Re-enrich from discovery UI** — Phase 4 adds re-enrich only on the Outreach list tab, not on the Discovery table's already-saved rows.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-Outreach Dashboard & Export*
*Context gathered: 2026-05-15*
