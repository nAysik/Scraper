# Design: Channel Activity Filter

**Date:** 2026-05-17
**Status:** Approved
**Scope:** Detect and filter dead YouTube channels before CSV export

---

## Problem

Saved outreach channels may include YouTube channels that have gone inactive — no new videos published in months. Contacting these is wasted effort. Users need to filter them out before exporting to CSV.

---

## Solution

Store the most recent video publish date (`last_video_at`) during enrichment and surface it as a filter in the Outreach List. The existing CSV export automatically respects the filter.

---

## Data Layer

### Migration 007

```sql
ALTER TABLE outreach_channels
  ADD COLUMN IF NOT EXISTS last_video_at timestamptz;
```

Nullable. Existing rows get null (treated as unknown activity).

### Enrichment pipeline changes

Two files:

**`src/lib/outreach/upsert-outreach.ts`**
- Add `lastVideoAt?: Date | null` to `OutreachUpsertRow` interface
- Include `last_video_at: row.lastVideoAt ?? null` in the upsert object

**`src/app/api/outreach/enrich/route.ts`**
- Pass `lastVideoAt: data.videos[0]?.publishedAt ?? null` when calling `upsertOutreachChannel`
- `data.videos[0]` is the most recent video (InnerTube returns videos newest-first); its `publishedAt` is a `Date | null` from `parseRelativeDate`
- YouTube channels only — Twitch channels have no `data.videos`, so `last_video_at` stays null

Re-enrich automatically refreshes `last_video_at` since it calls the same pipeline.

---

## UI Layer

### Outreach List filter

New number input in the toolbar alongside existing filters:

```
Active in last [___] days   (placeholder: "e.g. 90")
```

**Filter behaviour:**

| Row type | `last_video_at` | Filter active (e.g. 90 days) | Filter inactive |
|----------|----------------|------------------------------|-----------------|
| YouTube — recently active | within threshold | ✓ shown | ✓ shown |
| YouTube — stale | older than threshold | ✗ hidden | ✓ shown |
| YouTube — unknown (null) | null | ✗ hidden | ✓ shown |
| Twitch | null (always) | ✗ hidden | ✓ shown |

Twitch channels have null `last_video_at` by design. When the activity filter is active, Twitch rows are hidden alongside unknown YouTube rows — they are recent by discovery nature but the user explicitly asked for this behaviour.

**Implementation:** `useMemo` client-side filter, same pattern as existing genre/views/subscribers filters. State variable: `maxInactiveDays: number | null` (null = no filter).

Filter logic:
```typescript
if (maxInactiveDays !== null) {
  const cutoff = Date.now() - maxInactiveDays * 24 * 60 * 60 * 1000;
  if (!r.lastVideoAt || new Date(r.lastVideoAt).getTime() < cutoff) return false;
}
```

### CSV export

No changes needed. The existing "Export CSV" button exports `table.getRowModel().rows` — the currently filtered view. The activity filter gates the export automatically.

### No new table column

`last_video_at` is not displayed as a column. It is purely a filter signal.

---

## Out of Scope

- Showing `last_video_at` as a visible table column
- GPT-based relevance scoring
- Re-checking activity on demand (bulk InnerTube re-fetch)
- Configurable threshold defaults (the input is always blank/no filter on load)
- Twitch-specific activity signals (viewer history, stream frequency)

---

## Implementation Order

1. Migration 007 + upsert update (schema + data layer)
2. Enrich route change (capture `last_video_at` from videos[0])
3. Outreach List UI + GET channels route update (filter + `last_video_at` in SELECT)
