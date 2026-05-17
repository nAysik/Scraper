# Channel Activity Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the most recent YouTube video publish date per channel during enrichment and surface it as an "Active in last N days" filter in the Outreach List that gates CSV export.

**Architecture:** New `last_video_at` DB column populated during enrichment from `data.videos[0].publishedAt` (already fetched, currently discarded). GET channels route exposes it. Outreach List adds a `maxInactiveDays` filter that hides stale/null/Twitch rows from the table — and therefore from CSV export automatically.

**Tech Stack:** Supabase SQL migration, TypeScript, Next.js Route Handlers, React (useState/useMemo), TanStack Table.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `supabase/migrations/007_add_last_video_at.sql` | Create | DDL to add nullable `last_video_at timestamptz` |
| `src/lib/outreach/upsert-outreach.ts` | Modify | Add `lastVideoAt?: Date \| null` to interface + upsert object |
| `src/app/api/outreach/enrich/route.ts` | Modify | Pass `lastVideoAt: data.videos[0]?.publishedAt ?? null` |
| `src/app/api/outreach/channels/route.ts` | Modify | Add `last_video_at` to SELECT + `lastVideoAt` to camelCase map |
| `src/components/outreach/outreach-list.tsx` | Modify | Add field to `OutreachRow`, filter state, useMemo, toolbar input |

---

## Task 1: Migration file

**Files:**
- Create: `supabase/migrations/007_add_last_video_at.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/007_add_last_video_at.sql` with this exact content:

```sql
-- ============================================================
-- 007: Add last_video_at column to outreach_channels (Phase 9)
-- Records the publish date of the channel's most recent YouTube
-- video at the time of enrichment. Null for Twitch channels and
-- for channels enriched before this migration.
-- Apply in Supabase Dashboard SQL editor.
-- ============================================================

ALTER TABLE outreach_channels
  ADD COLUMN IF NOT EXISTS last_video_at timestamptz;
```

- [ ] **Step 2: Apply the migration in Supabase Dashboard**

Open your Supabase project → SQL Editor → paste the migration → Run.

Expected: no errors. The `outreach_channels` table now has a `last_video_at` column.

- [ ] **Step 3: Verify the column exists**

In the Supabase Dashboard Table Editor, open `outreach_channels` and confirm `last_video_at` appears as a nullable timestamptz column with no default.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_add_last_video_at.sql
git commit -m "feat(db): migration 007 — add last_video_at to outreach_channels"
```

---

## Task 2: Upsert layer + enrich route

**Files:**
- Modify: `src/lib/outreach/upsert-outreach.ts`
- Modify: `src/app/api/outreach/enrich/route.ts`

- [ ] **Step 1: Add `lastVideoAt` to `OutreachUpsertRow` interface**

In `src/lib/outreach/upsert-outreach.ts`, add one field to the interface after `platform?`:

```typescript
export interface OutreachUpsertRow {
  youtubeId: string;
  name: string;
  url: string;
  subscriberCount: number | null;
  topGames: string[] | null;
  genre: string | null;
  email: string | null;
  medianViews: number | null;
  lastEnrichedAt: string;   // ISO 8601 timestamp
  platform?: string;        // 'youtube' (default) | 'twitch'
  lastVideoAt?: Date | null; // most recent video publish date; null for Twitch
}
```

- [ ] **Step 2: Include `last_video_at` in the upsert object**

In the same file, inside `upsertOutreachChannel`, add one line to the upsert object after `platform`:

```typescript
      {
        youtube_id:       row.youtubeId,
        name:             row.name,
        url:              row.url,
        subscriber_count: row.subscriberCount,
        top_games:        row.topGames,
        genre:            row.genre,
        email:            row.email,
        median_views:     row.medianViews,
        last_enriched_at: row.lastEnrichedAt,
        platform:         row.platform ?? 'youtube',
        last_video_at:    row.lastVideoAt ?? null,
      },
```

- [ ] **Step 3: TypeScript check — upsert-outreach.ts**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit 2>&1 | Select-String "upsert-outreach"
```

Expected: no output (no errors in this file).

- [ ] **Step 4: Pass `lastVideoAt` in the enrich route**

In `src/app/api/outreach/enrich/route.ts`, update the `upsertOutreachChannel` call to include `lastVideoAt`. The call is currently around line 87. Add `lastVideoAt` after `lastEnrichedAt`:

```typescript
        await upsertOutreachChannel({
          youtubeId:       resolved.youtubeId,
          name:            data.name,
          url:             resolved.canonicalUrl,
          subscriberCount: data.subscriberCount,
          topGames:        extracted?.games ?? null,
          genre:           extracted?.genre ?? null,
          email,
          medianViews:     median,
          lastEnrichedAt:  new Date().toISOString(),
          lastVideoAt:     data.videos[0]?.publishedAt ?? null,
        });
```

`data.videos[0]?.publishedAt` is `Date | null` — the InnerTube fetch returns videos newest-first, so index 0 is the most recent. Supabase accepts `Date` objects for `timestamptz` columns.

- [ ] **Step 5: TypeScript check — enrich route**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit 2>&1 | Select-String "enrich"
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/outreach/upsert-outreach.ts src/app/api/outreach/enrich/route.ts
git commit -m "feat(enrich): store last_video_at from most recent video during enrichment"
```

---

## Task 3: GET channels route

**Files:**
- Modify: `src/app/api/outreach/channels/route.ts`

- [ ] **Step 1: Add `last_video_at` to the SELECT query**

The current `.select(...)` string is:
```
'youtube_id, name, url, subscriber_count, top_games, genre, median_views, last_enriched_at, email, platform'
```

Replace it with:
```
'youtube_id, name, url, subscriber_count, top_games, genre, median_views, last_enriched_at, last_video_at, email, platform'
```

- [ ] **Step 2: Add `lastVideoAt` to the camelCase mapping**

In the `.map((c: Record<string, unknown>) => ({...}))` block, add after `lastEnrichedAt`:

```typescript
  const channels = (data ?? []).map((c: Record<string, unknown>) => ({
    youtubeId:       c.youtube_id,
    name:            c.name,
    url:             c.url,
    subscriberCount: c.subscriber_count,
    topGames:        c.top_games,
    genre:           c.genre,
    medianViews:     c.median_views,
    lastEnrichedAt:  c.last_enriched_at,
    lastVideoAt:     c.last_video_at ?? null,
    email:           c.email,
    platform:        c.platform ?? 'youtube',
  }));
```

- [ ] **Step 3: TypeScript check**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit 2>&1 | Select-String "channels/route"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/outreach/channels/route.ts
git commit -m "feat(api): include last_video_at in GET /api/outreach/channels response"
```

---

## Task 4: Outreach List UI

**Files:**
- Modify: `src/components/outreach/outreach-list.tsx`

- [ ] **Step 1: Add `lastVideoAt` to `OutreachRow` interface**

Find the `OutreachRow` interface (around line 25) and add `lastVideoAt` after `lastEnrichedAt`:

```typescript
interface OutreachRow {
  youtubeId: string;
  name: string;
  url: string;
  subscriberCount: number | null;
  topGames: string[] | null;
  genre: string | null;
  medianViews: number | null;
  lastEnrichedAt: string | null;
  lastVideoAt: string | null;   // ISO timestamp; null for Twitch and pre-migration rows
  email: string | null;
  platform: string;
  status: OutreachRowStatus;
}
```

- [ ] **Step 2: Add `maxInactiveDays` filter state**

After the existing filter state variables (`genreFilter`, `minMedianViews`, `maxSubs`), add:

```typescript
const [maxInactiveDays, setMaxInactiveDays] = useState<number | null>(null);
```

- [ ] **Step 3: Update the `filtered` useMemo to apply the activity filter**

Find the `filtered` useMemo. It currently filters on `genreFilter`, `minMedianViews`, and `maxSubs`. Add the activity check as a new condition and add `maxInactiveDays` to the dependency array:

```typescript
  const filtered = useMemo(() => rows.filter(r => {
    if (genreFilter && r.genre !== genreFilter) return false;
    if (minMedianViews !== null && (r.medianViews === null || r.medianViews < minMedianViews)) return false;
    if (maxSubs !== null && maxSubs > 0 && r.subscriberCount !== null && r.subscriberCount > maxSubs) return false;
    if (maxInactiveDays !== null) {
      const cutoff = Date.now() - maxInactiveDays * 24 * 60 * 60 * 1000;
      if (!r.lastVideoAt || new Date(r.lastVideoAt).getTime() < cutoff) return false;
    }
    return true;
  }), [rows, genreFilter, minMedianViews, maxSubs, maxInactiveDays]);
```

- [ ] **Step 4: Add the filter input to the toolbar**

In the toolbar JSX (the `<div className="flex items-center gap-3 flex-wrap">` that contains the genre Select, min median views Input, and max subscribers Input), add the activity filter input after the max subscribers input:

```tsx
      {/* Activity filter */}
      <Input
        type="number"
        placeholder="e.g. 90"
        min={1}
        value={maxInactiveDays ?? ''}
        onChange={e => setMaxInactiveDays(e.target.value ? Number(e.target.value) : null)}
        className="w-36 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
      />
      {maxInactiveDays !== null && (
        <span className="text-xs text-gray-500 -ml-2 whitespace-nowrap">days active</span>
      )}
```

The label "days active" appears only when a value is set, keeping the toolbar compact when unused. The placeholder `e.g. 90` communicates the unit.

- [ ] **Step 5: TypeScript check — full project**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Manual smoke test**

Start the dev server (`npm run dev`), log in, go to `/dashboard/outreach` → Outreach list tab.

Verify:
1. The toolbar shows a new number input after "Max subscribers"
2. Entering `90` in the input hides channels where `last_video_at` is older than 90 days (or null)
3. Enriching a channel and checking the Outreach List shows that channel passes the filter
4. Export CSV with the filter active — only active channels appear in the downloaded file

- [ ] **Step 7: Commit**

```bash
git add src/components/outreach/outreach-list.tsx
git commit -m "feat(ui): add activity filter to Outreach List — hides channels inactive > N days"
```

---

## Final: push

```bash
git push origin master
```
