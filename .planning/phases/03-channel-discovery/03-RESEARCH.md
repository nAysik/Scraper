# Phase 3: Channel Discovery - Research

**Researched:** 2026-05-14
**Domain:** InnerTube video search, channel deduplication, TanStack Table with checkboxes, Supabase column migration, email regex extraction
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Search Strategy**
- D-01: Run two parallel InnerTube video searches for every keyword: one with default relevance ranking, one sorted by upload date (`sort_by: 'upload_date'`). Merge and deduplicate results by channel ID. Total: 5 pages × 2 sort orders = ~200 raw video results.
- D-02: Fetch 5 pages per sort order. Target: ~60-100 unique channels after deduplication. InnerTube `search()` returns a `Search` object; call `.getContinuation()` for subsequent pages.
- D-03: From video search results, extract per-channel: `channelId`, `channelName`, `channelHandle` or URL, `subscriberCount` if available in video metadata. These fields are shown immediately — no extra InnerTube call at this stage.

**Enrichment Flow**
- D-04: Show-first, enrich-on-save. Results table renders immediately. Full enrichment only for selected channels.
- D-05: Save flow reuses the existing `POST /api/outreach/enrich` route. Cap stays at 15.
- D-06: After save, selected rows update in-place with enriched data.

**Results UI**
- D-07: TanStack Table with checkboxes. Columns: `☐ | Channel name | Subscribers | Top games | Genre | Email | Status badge`.
- D-08: Default sort: subscriber count ascending.
- D-09: Max-subscribers filter, client-side.
- D-10: "Already saved" badge on channels already in `outreach_channels`. Checkbox disabled for these.

**Email Extraction**
- D-11: Add `email text` column to `outreach_channels` via `005_add_email.sql`. Nullable. No unique constraint.
- D-12: Extract email from About page description using regex: `/[\w.+-]+@[\w-]+\.[a-z]{2,}/i`. First match wins.

**Already-Saved Check**
- D-13: Discovery API returns `youtube_id` per channel. Client or server includes `alreadySaved: boolean` flag per result.

### Claude's Discretion

- Search endpoint: `POST /api/outreach/discover` with body `{ keyword: string }`, returns `{ channels: DiscoveredChannel[] }`.
- Dual search concurrency: `Promise.all`; page continuation sequential within each sort order.
- Deduplication: `Map<channelId, DiscoveredChannel>` — first occurrence (relevance result) wins.
- Loading state: spinner + "Searching..." while both searches run.
- Page directory: `src/app/dashboard/outreach/discover/page.tsx` or integrated into existing outreach page as tab/section. Planner decides.
- Select-all checkbox: selects/deselects all visible (filtered) rows, capped at 15.

### Deferred Ideas (OUT OF SCOPE)

- Re-enrich from discovery UI (Phase 4 scope)
- Multi-keyword sweep
- View-count filter on discovered channels
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIS-01 | User can enter a keyword to search for relevant YouTube channels | Covered by `/api/outreach/discover` POST endpoint using `client.search(keyword, { type: 'video' })` |
| DIS-02 | Search returns a list of channels via InnerTube channel search | Verified: video search returns `Video` nodes with `author.id`, `author.name`, `author.url` — sufficient to deduplicate by channel |
| DIS-03 | Discovered channels are automatically enriched before being shown | Phase 3 CHANGES this to show-first / enrich-on-save (D-04). DIS-03 intent (enrichment available) is met at save time. |
| DIS-04 | User can add selected discovered channels to `outreach_channels` | Covered by reusing `POST /api/outreach/enrich` on save |
| DIS-05 | (email extraction, migration) | Covered by `005_add_email.sql` + regex in `fetchChannelData` |
</phase_requirements>

---

## Summary

Phase 3 adds a keyword-driven channel discovery flow on top of the already-completed enrichment pipeline. The core search mechanism uses youtubei.js's `client.search(keyword, filters)` with `type: 'video'`, running two parallel searches (default relevance + `upload_date: 'week'`) to surface both established and recently-active micro-influencer channels. The results are deduplicated by channel ID into a checkable TanStack Table, and full enrichment (playlist fetch, GPT, email regex) only runs for the channels the user explicitly selects and saves.

The most important technical finding is that **subscriber counts are NOT present on Video search result nodes** — only on Channel nodes (type: 'channel' search) and only from `getChannel()`. D-03 already anticipated this with "if available in video metadata." The practical resolution is to store `subscriberCount: null` for all discovered channels and show "—" in the table until enrichment runs (which does call `getChannelSubscriberCount()`). This is honest and consistent with the show-first philosophy.

The existing `POST /api/outreach/enrich` route is reusable as-is for the save step: it accepts URLs, the discover endpoint stores `author.url` (canonicalized via the existing `canonicalizeUrl()` helper), and the channel URL flows cleanly into the enrich pipeline. The only new infrastructure is one new API route (`/api/outreach/discover`), one new scraper function (`searchVideosByKeyword`), one new page/section, one new table component, and one DB migration (`005_add_email.sql`).

**Primary recommendation:** Build the discover endpoint first (search + dedup + already-saved check), then the table component, then wire in the save-to-enrich flow. The `upsertOutreachChannel` function needs to be updated to include the new `email` column at the same time as the migration.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dual InnerTube video search + dedup | API / Backend | — | Network I/O, rate-limit concerns; not safe in browser |
| Already-saved check | API / Backend | — | Server includes `alreadySaved` flag in response; single Supabase query at search time |
| Results table with checkboxes | Browser / Client | — | All filtering and selection state is client-side; no extra API calls |
| Max-subscribers filter | Browser / Client | — | `useMemo` over already-fetched array (D-09) |
| Save → enrich flow | Browser / Client + API/Backend | — | Client sends URLs to existing `/api/outreach/enrich`; server runs full pipeline |
| Email regex extraction | API / Backend | — | Runs inside `fetchChannelData` during enrichment on save |
| DB migration (email column) | Database / Storage | — | Supabase migration applied before new code ships |
| Navigation tab highlighting | Browser / Client | — | DashboardNav uses `usePathname` exact match |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| youtubei.js | 17.0.1 (installed) | InnerTube API: video search, pagination, channel data | Already used throughout the project; singleton client in `innertube.ts` |
| @tanstack/react-table | 8.21.3 (installed) | Table state, sorting, filtering, row selection | Already used in `videos-table.tsx`; exact same API for checkbox column |
| @supabase/supabase-js | 2.104.0 (installed) | `outreach_channels` reads (already-saved check) and upserts | Canonical pattern via `createServiceClient()` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React (useState, useMemo) | 19.2.4 (installed) | Table state, filter, loading/save state machine | All client component state |
| shadcn Table, Input, Button, Badge | installed | UI primitives per UI-SPEC | No new installs needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `type: 'video'` search | `type: 'channel'` search | Channel search returns subscriber count directly but misses micro-influencers who rank by video, not channel prominence; video search is the correct approach for D-01 |
| `upload_date: 'week'` for recency | `prioritize: 'popularity'` | Popularity sort surfaces high-view channels, not micro-influencers; upload_date filter forces recency; these two searches together are complementary |
| Server-side already-saved flag | Client-side fetch of all youtube_ids | Server-side is a single query at search time; avoids a separate client fetch; cleaner |

**Installation:** No new packages needed. All dependencies already installed.

**Version verification:** [VERIFIED: package.json] — youtubei.js@17.0.1, @tanstack/react-table@8.21.3, next@16.2.4.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │  POST /api/outreach/discover { keyword }
  ▼
/api/outreach/discover  (new route handler)
  │
  ├─ Promise.all([
  │    searchVideosByKeyword(keyword, { pages: 5 })          ← relevance (no filter)
  │    searchVideosByKeyword(keyword, { pages: 5,
  │                           upload_date: 'week' })         ← recent uploads
  │  ])
  │
  ├─ deduplicate by channelId → Map<channelId, DiscoveredChannel>
  │    first-wins (relevance result takes precedence)
  │
  ├─ query outreach_channels WHERE youtube_id IN [discovered IDs]
  │    → set alreadySaved: true on matched channels
  │
  └─ return { channels: DiscoveredChannel[] }
        │
        ▼
Browser: renders DiscoveryTable (TanStack Table)
  ├─ max-subscribers filter (useMemo, client-side)
  ├─ checkbox selection (row selection model, cap 15)
  └─ Save N channels button
        │  POST /api/outreach/enrich { text: URLs, one per line }
        ▼
/api/outreach/enrich  (existing route — unchanged)
  │  for each selected channel URL:
  │    canonicalizeUrl → resolveChannel → fetchChannelData
  │    → extractGamesGenre → extractEmail (new, inside fetchChannelData)
  │    → upsertOutreachChannel (email column included)
  └─ return { succeeded, failed, partial }
        │
        ▼
Browser: in-place row update (top_games, genre, email, status badge)
```

### Recommended Project Structure

```
src/
├── app/api/outreach/
│   ├── enrich/route.ts          # existing — no changes needed
│   └── discover/route.ts        # NEW: POST, auth-gated, dual search
├── app/dashboard/outreach/
│   ├── page.tsx                 # existing — add tab nav or link to discover
│   └── discover/page.tsx        # NEW: auth check + <DiscoveryPage> client component
├── lib/scraper/
│   └── search-videos.ts         # NEW: searchVideosByKeyword() with pagination
├── lib/outreach/
│   ├── fetch-channel-data.ts    # existing — add extractEmail() helper inline
│   └── upsert-outreach.ts       # existing — add email field to OutreachUpsertRow
└── components/outreach/
    ├── enrich-form.tsx           # existing
    └── discovery-table.tsx       # NEW: TanStack Table with checkboxes
supabase/migrations/
    └── 005_add_email.sql         # NEW: ALTER TABLE outreach_channels ADD COLUMN email text
```

### Pattern 1: Video Search with Pagination

**What:** Call `client.search(keyword, filters)`, then iterate pages via `.getContinuation()`. Each page's `.results` is an `ObservedArray<YTNode>` — filter for nodes where `item.type === 'Video'`.

**When to use:** Both the relevance and upload-date search variants.

**Example:**
```typescript
// Source: verified from node_modules/youtubei.js/dist/src/Innertube.d.ts
//         and node_modules/youtubei.js/dist/src/types/Misc.d.ts
import { getClient } from '@/lib/scraper/innertube';

export interface DiscoveredChannel {
  channelId: string;
  name: string;
  url: string;          // author.url (www-stripped by canonicalizeUrl)
  subscriberCount: null; // not available in video search results — always null here
  alreadySaved: boolean; // set by discover route after DB check
}

export async function searchVideosByKeyword(
  keyword: string,
  filters: { upload_date?: 'week' | 'month' } = {},
  pages = 5,
): Promise<Map<string, DiscoveredChannel>> {
  const client = await getClient();
  const seen = new Map<string, DiscoveredChannel>();

  let results = await client.search(keyword, { type: 'video', ...filters });

  for (let page = 0; page < pages; page++) {
    for (const item of results.results ?? []) {
      const v = item as any;
      if (item.type !== 'Video') continue;

      const channelId: string = v.author?.id ?? '';
      if (!channelId || channelId === 'N/A' || seen.has(channelId)) continue;

      const name: string = v.author?.name ?? '';
      // author.url from youtubei.js is https://www.youtube.com/...
      // canonicalizeUrl strips www. → https://youtube.com/...
      const rawUrl: string = v.author?.url ?? '';
      const url = canonicalizeUrl(rawUrl) ?? rawUrl;

      seen.set(channelId, { channelId, name, url, subscriberCount: null, alreadySaved: false });
    }

    if (!results.has_continuation || page === pages - 1) break;
    results = await results.getContinuation();
  }

  return seen;
}
```

### Pattern 2: Dual Search + Merge in Route Handler

**What:** Run both searches in parallel with `Promise.all`, then merge with first-wins (relevance result takes precedence).

**Example:**
```typescript
// Source: adapted from shorts.ts pattern (verified in codebase)
const [relevanceMap, recentMap] = await Promise.all([
  searchVideosByKeyword(keyword, {}, 5),
  searchVideosByKeyword(keyword, { upload_date: 'week' }, 5),
]);

// Merge: relevance first, then add any channels only in recentMap
const merged = new Map(relevanceMap);
for (const [id, channel] of recentMap) {
  if (!merged.has(id)) merged.set(id, channel);
}
const channels = Array.from(merged.values());
```

### Pattern 3: Already-Saved Check

**What:** After deduplication, query `outreach_channels` for all discovered channel IDs in one shot.

**Example:**
```typescript
// Source: Supabase JS v2 pattern (verified in existing upsert-outreach.ts)
const sb = createServiceClient();
const ids = channels.map(c => c.channelId);
const { data: saved } = await sb
  .from('outreach_channels')
  .select('youtube_id')
  .in('youtube_id', ids);

const savedSet = new Set((saved ?? []).map(r => r.youtube_id));
for (const ch of channels) {
  ch.alreadySaved = savedSet.has(ch.channelId);
}
```

### Pattern 4: TanStack Table with Row Selection

**What:** Row selection state with per-row checkbox and select-all header checkbox. Extends the existing `videos-table.tsx` pattern.

**Example:**
```typescript
// Source: @tanstack/react-table v8 docs + verified from videos-table.tsx pattern
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender,
  type ColumnDef, type SortingState, type RowSelectionState,
} from '@tanstack/react-table';

const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
const [sorting, setSorting] = useState<SortingState>([
  { id: 'subscriberCount', desc: false }  // D-08: ASC by default
]);

const columns = useMemo<ColumnDef<DiscoveredChannel>[]>(() => [
  {
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        aria-label="Select all visible channels"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        disabled={row.original.alreadySaved}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
    enableSorting: false,
  },
  // ... other columns
], []);

const table = useReactTable({
  data: filtered,
  columns,
  state: { sorting, rowSelection },
  onSortingChange: setSorting,
  onRowSelectionChange: setRowSelection,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  enableRowSelection: (row) => !row.original.alreadySaved,
});
```

### Pattern 5: In-Place Row Update After Save

**What:** After the enrich response arrives, update individual rows in local state — no table remount.

**Example:**
```typescript
// State shape for the discovery component
const [channels, setChannels] = useState<DiscoveredChannel[]>([]);
const [rowStates, setRowStates] = useState<Record<string, RowSaveState>>({});

// After enrich response:
setChannels(prev => prev.map(ch => {
  if (!selectedIds.has(ch.channelId)) return ch;
  const enriched = enrichedMap.get(ch.channelId);
  if (!enriched) return ch; // failed row — rowStates handles badge
  return { ...ch, topGames: enriched.topGames, genre: enriched.genre, email: enriched.email, alreadySaved: true };
}));
```

### Pattern 6: Email Regex Extraction

**What:** Run the regex over the `description` string returned by `fetchChannelData`. First match wins.

**Example:**
```typescript
// Source: D-12 from CONTEXT.md — regex pre-chosen
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;

export function extractEmail(description: string): string | null {
  const match = description.match(EMAIL_RE);
  return match ? match[0] : null;
}
```

This function is called inside `fetchChannelData` (or in the enrich route handler after `fetchChannelData` returns) and the result is passed to `upsertOutreachChannel`.

### Pattern 7: Supabase Column Migration

**What:** Add `email text` nullable column to existing table.

**Example:**
```sql
-- supabase/migrations/005_add_email.sql
ALTER TABLE outreach_channels ADD COLUMN IF NOT EXISTS email text;
```

No index needed: email is an output field, not filtered/sorted in Phase 3.

### Anti-Patterns to Avoid

- **Fetching subscriber count per channel in the discover endpoint:** One `getChannel()` call per discovered channel would make the endpoint take 60-100 × ~1s = 1-2 minutes. The decision is to accept `null` subscriber count until enrichment runs.
- **Using `type: 'channel'` search instead of `type: 'video'`:** Channel search returns subscriber count but misses micro-influencers who appear in video search results but not channel search results for the same keyword.
- **Calling `getContinuation()` when `has_continuation` is false:** This throws; always guard with `if (!results.has_continuation || page === pages - 1) break`.
- **Passing `sort_by: 'upload_date'` to `client.search()`:** This field does NOT exist in `SearchFilters`. The correct approach is `upload_date: 'week'` (a date filter, not a sort). [VERIFIED: node_modules/youtubei.js/dist/src/types/Misc.d.ts]
- **Not stripping `www.` from `author.url`:** youtubei.js returns `https://www.youtube.com/...` for author URLs; `canonicalizeUrl()` strips `www.` at line 31 — pass URLs through it before storing.
- **Not guarding against `channelId === 'N/A'`:** The `Author` constructor falls back to `'N/A'` when no browseId is found. Skip these items.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination loop | Custom cursor management | `results.has_continuation` + `results.getContinuation()` | Built-in to youtubei.js Feed/Search; handles YouTube's continuation token opaquely |
| Channel URL construction | String concatenation from handle/ID | `author.url` (already a full URL from youtubei.js) + `canonicalizeUrl()` | Author.js builds the correct URL form; `canonicalizeUrl` normalizes it for the enrich pipeline |
| Already-saved check | Per-row Supabase queries | Single `.in('youtube_id', ids)` query | N+1 query problem; one batch query is instant |
| Table sorting/filtering | Custom sort/filter logic | TanStack Table `getSortedRowModel()` + `useMemo` filter | Already in the project; established pattern in `videos-table.tsx` |
| Email extraction | Complex parser | Single regex first-match | Business emails in YouTube About descriptions are simple; regex is sufficient for this use case |

**Key insight:** Every component of this phase already has a working analog in the codebase — the work is adaptation and wiring, not invention.

---

## Runtime State Inventory

> Not a rename/refactor phase. Omit.

---

## Common Pitfalls

### Pitfall 1: No Subscriber Count in Video Search Results

**What goes wrong:** Code tries to read `v.subscriber_count` or `v.author.subscriber_count` from video search results and gets `undefined` or crashes.

**Why it happens:** `Video.d.ts` has no subscriber_count field. subscriber_count exists on `Channel` nodes (type: 'channel' search) and on `C4TabbedHeader` / `PageHeader` (channel page). It does NOT appear on video search result items.

**How to avoid:** Always type `subscriberCount: null` in `DiscoveredChannel` — accepted per D-03 ("if available in video metadata"). The table shows "—" for this column. After enrichment, `upsertOutreachChannel` writes the real value from `fetchChannelData` which calls `getChannelSubscriberCount()`.

**Warning signs:** TypeScript error "Property 'subscriber_count' does not exist on type Video" or silent `0` values for all channels.

### Pitfall 2: author.id Returns 'N/A' for Some Results

**What goes wrong:** The `Author` constructor falls back to `'N/A'` when `browseId` cannot be parsed from the navigation endpoint. Video search results for livestream previews, YouTube Originals, or sponsored content may have malformed author data.

**Why it happens:** Author.js line 18: `this.id = id || nav_text?.runs?.[0]?.endpoint?.payload?.browseId || nav_text?.endpoint?.payload?.browseId || 'N/A'`.

**How to avoid:** Filter early: `if (!channelId || channelId === 'N/A') continue;` before adding to the dedup map.

**Warning signs:** Channels with `channelId: 'N/A'` appearing in results; `resolveChannel()` failing with 'not_found' on save.

### Pitfall 3: `sort_by: 'upload_date'` Does Not Exist

**What goes wrong:** Developer reads CONTEXT.md's `sort_by: 'upload_date'` description and passes `{ type: 'video', sort_by: 'upload_date' }` to `client.search()`. TypeScript may or may not catch this (the parameter is typed as `SearchFilters`).

**Why it happens:** CONTEXT.md D-01 uses plain-English description. The actual `SearchFilters` type has `prioritize?: 'relevance' | 'popularity'` and `upload_date?: UploadDate`. There is no `sort_by` field.

**How to avoid:** The "upload-date sorted" search is `{ type: 'video', upload_date: 'week' }`. This is a date *filter* (last 7 days), not a sort. It surfaces recently uploaded content alongside relevance-sorted results.

[VERIFIED: node_modules/youtubei.js/dist/src/types/Misc.d.ts — SearchFilters has no sort_by]

**Warning signs:** TypeScript error "Object literal may only specify known properties, and 'sort_by' does not exist in type 'SearchFilters'".

### Pitfall 4: `getContinuation()` Throws When No Continuation Exists

**What goes wrong:** Loop calls `getContinuation()` unconditionally and throws on the last page.

**Why it happens:** `Feed.has_continuation` is `false` on the final page; calling `getContinuation()` when there's nothing to fetch throws an InnerTube error.

**How to avoid:** Always guard: `if (!results.has_continuation || page === pages - 1) break;` before calling `getContinuation()`.

[VERIFIED: node_modules/youtubei.js/dist/src/core/mixins/Feed.d.ts — has_continuation property and getContinuation() method]

### Pitfall 5: `author.url` Uses `www.youtube.com`

**What goes wrong:** `author.url` from youtubei.js includes `www.youtube.com` (because `Constants.URLS.YT_BASE = 'https://www.youtube.com'`). The `canonicalizeUrl()` function strips `www.` at line 31. If the discover endpoint stores `author.url` without running it through `canonicalizeUrl()`, the enrich endpoint may process duplicate URLs.

**Why it happens:** youtubei.js uses its own base URL constant. The enrich pipeline normalizes to `https://youtube.com/...`. The `outreach_channels.url` column has a UNIQUE constraint.

**How to avoid:** Always pass `author.url` through `canonicalizeUrl()` before storing in `DiscoveredChannel.url`. Alternatively, use the `author.id` (UC channel ID) as a bare string — `canonicalizeUrl` fast-paths UC IDs.

[VERIFIED: node_modules/youtubei.js/dist/src/utils/Constants.js — YT_BASE is www.youtube.com; canonicalize-url.ts line 31 strips www.]

### Pitfall 6: Navigation Tab Doesn't Highlight for `/dashboard/outreach/discover`

**What goes wrong:** If the discovery page lives at `/dashboard/outreach/discover`, the nav tab for "Outreach" doesn't show as active because `DashboardNav` uses exact `pathname === tab.href` matching.

**Why it happens:** `dashboard-nav.tsx` uses `const active = pathname === tab.href` — no prefix/startsWith matching.

**How to avoid:** Either (a) integrate the discovery UI into the existing `src/app/dashboard/outreach/page.tsx` as a second section with internal tabs (no navigation change needed), or (b) update DashboardNav to use `pathname.startsWith(tab.href)`. The UI-SPEC says "planner decides." Option (a) is lower risk.

[VERIFIED: src/components/dashboard-nav.tsx line 15 — exact match]

### Pitfall 7: `OutreachUpsertRow` Doesn't Include Email Yet

**What goes wrong:** `upsertOutreachChannel()` is called with an `email` field but the interface and upsert call don't include it, so the column is never written.

**Why it happens:** `upsert-outreach.ts` was written in Phase 2 before the email column was designed.

**How to avoid:** Two coordinated changes required:
1. Add `email: string | null` to `OutreachUpsertRow` interface
2. Include `email: row.email` in the Supabase upsert payload

And one change in the enrich route handler:
3. Call `extractEmail(data.description)` and pass the result into `upsertOutreachChannel`.

These three changes happen in the same task/commit as `005_add_email.sql`.

### Pitfall 8: Enrich Route Timeout with 15 Channels

**What goes wrong:** Saving 15 channels from discovery runs the full enrichment pipeline (getChannel + getAbout + getVideos + getPlaylists + GPT) sequentially. At ~4s/channel this is ~60s. The existing `maxDuration = 300` in `enrich/route.ts` handles this, but Vercel Hobby is capped at 60s (not relevant here per existing Phase 2 architecture decision).

**How to avoid:** No change needed — `maxDuration = 300` is already set. Document for planner awareness only.

---

## Code Examples

Verified patterns from official sources:

### SearchFilters Type (verified from types)

```typescript
// Source: node_modules/youtubei.js/dist/src/types/Misc.d.ts
type SearchFilters = {
  upload_date?: 'all' | 'today' | 'week' | 'month' | 'year';
  type?: 'all' | 'video' | 'shorts' | 'channel' | 'playlist' | 'movie';
  duration?: 'all' | 'over_twenty_mins' | 'under_three_mins' | 'three_to_twenty_mins';
  prioritize?: 'relevance' | 'popularity';
  features?: Array<'hd' | 'subtitles' | 'creative_commons' | '3d' | 'live' | ...>;
};
```

### Video Node Fields Available from Video Search

```typescript
// Source: node_modules/youtubei.js/dist/src/parser/classes/Video.d.ts
//         and Video.js constructor
const v = item as any;  // item.type === 'Video'

// Available:
v.video_id           // string: the video ID
v.author.id          // string: UC channel ID (or 'N/A' on parse failure)
v.author.name        // string: channel display name
v.author.url         // string: https://www.youtube.com/@handle or /u/UCid
v.view_count?.text   // string | undefined: "1.2M views"
v.short_view_count?.text  // string | undefined
v.published?.text    // string | undefined: "3 days ago"

// NOT available:
// subscriber_count — not on Video nodes, only on Channel nodes
```

### Supabase `.in()` Query for Already-Saved Check

```typescript
// Source: Supabase JS v2 pattern (verified from upsert-outreach.ts createServiceClient usage)
const sb = createServiceClient();
const { data, error } = await sb
  .from('outreach_channels')
  .select('youtube_id')
  .in('youtube_id', channelIds);  // single query for all IDs
```

### `005_add_email.sql` Migration

```sql
-- Source: pattern from supabase/migrations/004_outreach_channels.sql
ALTER TABLE outreach_channels ADD COLUMN IF NOT EXISTS email text;
```

### Email Regex

```typescript
// Source: CONTEXT.md D-12 — pre-chosen regex
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
// First match wins — covers business emails like contact@studiogame.dev
// Avoids matching: placeholder@example.com is a false positive risk
// (acceptable — user sees email in table and can verify)
```

### Reusing the Enrich Route for Save

```typescript
// Source: src/components/outreach/enrich-form.tsx pattern
// The discover component builds a newline-separated URL string and POSTs to /api/outreach/enrich
const selectedUrls = selectedChannels.map(ch => ch.url).join('\n');
const res = await fetch('/api/outreach/enrich', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: selectedUrls }),
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sort_by: 'upload_date'` (not a real field) | `upload_date: 'week'` filter | Always — sort_by never existed in youtubei.js | Planner must use correct field name |
| Manual continuation token management | `results.getContinuation()` + `results.has_continuation` | Always — built into youtubei.js Feed | Just call the method; no token parsing |

**Deprecated/outdated:**
- The `Channel.subscriber_count` XXX comment in `Channel.js` line 26 notes that `subscriberCountText` is now the channel handle and `videoCountText` is subscriber count in `type: 'channel'` search results. This means even if someone tries to get sub count from a Channel-type search result in the future, the field swap may cause bugs. Irrelevant to Phase 3 (we use `type: 'video'`).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `author.id` from `Video` nodes in a `type: 'video'` search is reliably the UC channel ID (not 'N/A') for normal video content | Pitfall 2, Pattern 1 | Planner should add explicit guard `channelId === 'N/A'` filter to be safe |
| A2 | `upload_date: 'week'` returns enough unique channels (not all the same channels as relevance search) to justify running both searches | Pattern 2 | Could be that the two searches return highly overlapping results; net unique channel count may be lower than 60-100 target. Acceptable — D-02 is a target, not a hard requirement |
| A3 | The enrich route's `maxDuration = 300` is sufficient for 15 channels from discovery (same as from paste form) | Pitfall 8 | No change needed — Phase 2 already validated this |
| A4 | `author.url` from youtubei.js always produces a URL that `canonicalizeUrl()` can process | Pattern 1 | If it returns an unusual path, `canonicalizeUrl()` returns null; `resolveChannel()` would then fail for that channel on save |
| A5 | The `has_continuation` property is always reliably set and doesn't change during iteration | Pitfall 4 | If not, loop guard `page === pages - 1` still ensures termination |

---

## Open Questions

1. **Where does the discover UI live — new page or integrated section?**
   - What we know: UI-SPEC shows a `/dashboard/outreach/discover` separate page OR integration into the existing outreach page. DashboardNav uses exact match, so a sub-page breaks the active state.
   - What's unclear: Whether the planner wants to restructure DashboardNav or use a simpler intra-page tab/section.
   - Recommendation: Integrate as a tabbed section within `src/app/dashboard/outreach/page.tsx` — update the page to have an "Enrich" tab and a "Discover" tab. No nav changes needed.

2. **Should the discover endpoint also return subscriber count by making a separate getChannel() call per channel?**
   - What we know: D-03 says "subscriberCount if available in video metadata" — it's not available, so the field is null. D-08 requires default sort by subscriberCount ASC. Sorting nulls in TanStack Table puts them at top or bottom depending on comparator.
   - What's unclear: Whether nulls sorting first (top of table) with ASC is acceptable UX.
   - Recommendation: Accept null subscriber counts, sort nulls last (or treat 0), and show "—" in the table. After enrichment, the row updates with the real count.

3. **What exactly does `upload_date: 'week'` return — videos from the past 7 days, or the past calendar week?**
   - What we know: shorts.ts uses `upload_date: 'week'` + `SEVEN_DAYS_MS` cutoff guard, implying it's approximately 7 days.
   - What's unclear: Whether YouTube's definition is exactly 7 days or a rolling Monday-Sunday week.
   - Recommendation: Use `'week'` as designed; the shorts.ts code already applies a 7-day guard for age-filtering. For discovery, no date filtering is needed — any recent content is useful.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 is purely code/config changes using already-installed packages. No new external dependencies. Node.js/npm already verified working in Phase 2.

---

## Validation Architecture

`nyquist_validation: true` in config.json — include this section.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — no test suite exists (per CLAUDE.md) |
| Config file | none |
| Quick run command | `npx.cmd tsc --noEmit` (type-check as proxy for correctness) |
| Full suite command | `npm run build` (compilation + lint) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIS-01 | Keyword input triggers search and returns channels | manual-only | `npx.cmd tsc --noEmit` (type check) | n/a |
| DIS-02 | Video search returns deduped channel list | manual-only | `npx.cmd tsc --noEmit` | n/a |
| DIS-03 | Enrichment available on save (show-first model) | manual-only | `npm run build` | n/a |
| DIS-04 | Selected channels saved to outreach_channels | manual-only | `npx.cmd tsc --noEmit` | n/a |
| DIS-05 | email column exists and is populated on save | manual-only (DB migration + enrichment run) | `npx.cmd tsc --noEmit` | n/a |

*No test suite exists per CLAUDE.md. All validation is manual UAT + type-check + build. No Wave 0 gaps — there is no test infrastructure to scaffold.*

### Sampling Rate

- **Per task commit:** `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx.cmd tsc --noEmit`
- **Per wave merge:** `npm run build`
- **Phase gate:** `npm run build` green + manual UAT checklist before `/gsd-verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements (test infrastructure = none, so no gaps to scaffold).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getUser()` at top of `/api/outreach/discover` (same pattern as all existing routes) |
| V3 Session Management | no | Handled by existing middleware — no new session logic |
| V4 Access Control | yes | `discover` route is auth-gated; service role only used for DB writes |
| V5 Input Validation | yes | `keyword` input: validate non-empty, trim, max length ~200 chars; reject empty keyword with 400 |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns for {InnerTube + Supabase + Next.js}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Keyword injection (crafted keyword causing InnerTube to throw) | Tampering | Top-level try/catch in route handler; error returns 500 with safe message |
| Unauthenticated discover endpoint | Elevation of Privilege | `supabase.auth.getUser()` check at route top — same as enrich route |
| Oversized keyword (DoS InnerTube) | Denial of Service | Max-length server-side check on keyword (e.g., 200 chars) before calling InnerTube |
| Email regex matching internal/system emails | Information Disclosure | Acceptable — email is user-visible in their own outreach table; no privacy concern |
| Duplicate channel URLs conflicting with `url` UNIQUE constraint | Tampering | `canonicalizeUrl()` normalizes before upsert; `onConflict: 'youtube_id'` upsert handles re-saves |

---

## Sources

### Primary (HIGH confidence)
- `node_modules/youtubei.js/dist/src/types/Misc.d.ts` — SearchFilters type (upload_date, type, prioritize fields)
- `node_modules/youtubei.js/dist/src/parser/classes/Video.d.ts` and `Video.js` — Video node fields (video_id, author, view_count, no subscriber_count)
- `node_modules/youtubei.js/dist/src/parser/classes/misc/Author.d.ts` and `Author.js` — author.id, author.name, author.url construction
- `node_modules/youtubei.js/dist/src/core/mixins/Feed.d.ts` — has_continuation, getContinuation()
- `node_modules/youtubei.js/dist/src/Innertube.d.ts` — search() signature
- `node_modules/youtubei.js/dist/src/Innertube.js` — search() implementation, filter → proto mapping
- `node_modules/youtubei.js/dist/src/utils/Constants.js` — YT_BASE = 'https://www.youtube.com'
- `node_modules/youtubei.js/dist/protos/generated/misc/params.js` — SearchFilter_Prioritize enum (RELEVANCE: 0, POPULARITY: 3), SearchFilter_Filters_UploadDate (WEEK: 3)
- `src/lib/scraper/shorts.ts` — existing pagination pattern with upload_date + has_continuation guard
- `src/lib/scraper/channels.ts` — existing search + type: 'channel' pattern
- `src/lib/outreach/fetch-channel-data.ts` — enrichment pipeline; where extractEmail() will be added
- `src/lib/outreach/upsert-outreach.ts` — OutreachUpsertRow interface to extend with email
- `src/app/api/outreach/enrich/route.ts` — existing enrich route reused for save
- `src/components/outreach/enrich-form.tsx` — save flow pattern (spinner, summary panel)
- `src/components/videos-table.tsx` — TanStack Table implementation reference
- `src/components/dashboard-nav.tsx` — exact pathname match (active tab pitfall)
- `src/lib/outreach/canonicalize-url.ts` — www. stripping at line 31
- `supabase/migrations/004_outreach_channels.sql` — migration pattern for 005

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 through D-13 — cross-verified against youtubei.js types to confirm technical feasibility

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified in installed node_modules
- Architecture: HIGH — all API shapes verified from youtubei.js source; enrich reuse confirmed from route handler source
- Pitfalls: HIGH — each pitfall verified from actual source code (not assumed from training data)
- Subscriber count gap: HIGH — verified absence of field in Video.d.ts and Video.js constructor

**Research date:** 2026-05-14
**Valid until:** 2026-06-14 (youtubei.js pinned at 17.0.1 — valid until a major upgrade)
