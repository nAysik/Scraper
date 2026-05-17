# Design: Gaming-Only Filter

**Date:** 2026-05-17
**Status:** Approved
**Scope:** Filter non-gaming channels from the Outreach List before CSV export

---

## Problem

The Outreach List contains YouTube channels where GPT enrichment found no gaming signal — `top_games` is empty and `genre` is null. These are false positives that should be removable before export.

---

## Solution

A "Gaming only" toggle in the Outreach List toolbar. When on, hides YouTube rows where both `top_games` is null/empty and `genre` is null. Twitch rows always pass.

---

## Filter Logic

```typescript
if (gamingOnly && r.platform === 'youtube') {
  const hasGames = r.topGames && r.topGames.length > 0;
  const hasGenre = Boolean(r.genre);
  if (!hasGames && !hasGenre) return false;
}
```

| Row | `top_games` | `genre` | Filter ON result |
|-----|-------------|---------|-----------------|
| YouTube — has games | non-empty | any | ✓ shown |
| YouTube — has genre only | empty/null | set | ✓ shown |
| YouTube — no signal | empty/null | null | ✗ hidden |
| Twitch | null (always) | null (always) | ✓ shown |

---

## UI

- Toggle button in the toolbar, label "Gaming only"
- Default: OFF
- Active state visually distinct (e.g. `variant="secondary"` vs `variant="outline"`)
- CSV export gates automatically via `table.getRowModel().rows`

---

## Out of Scope

- GPT relevance scoring
- Game title detection in channel names
- Manual flagging per row
- Schema changes
