# Design: Playlist-Hybrid top_games Extraction

**Date:** 2026-05-12
**Status:** Approved
**Spike:** `.planning/spikes/001-channel-playlists` (VALIDATED)

## Problem

The current `extractGamesGenre` uses only the last 10 video titles + channel description as input for GPT-4o-mini. This gives a weak signal — 10 recent titles don't reflect what a creator has spent years covering. A channel with 1092 Super Auto Pets videos looks identical to one that uploaded SAP twice last week.

## Solution

Add channel playlists as a primary signal. Playlists with high video counts reflect a creator's total body of work. Last 10 titles become a secondary recency signal only.

## Architecture

Three files change. No new files, no schema changes, no new dependencies.

### 1. `src/lib/outreach/fetch-channel-data.ts`

**Add type:**
```ts
export interface PlaylistMeta {
  title: string;
  videoCount: number;
}
```

**Add to `OutreachChannelData`:**
```ts
playlists: PlaylistMeta[];
```

**Add after `getVideos()` call in `fetchChannelDataOnce`:**
- Call `channel.getPlaylists()`
- Parse items as LockupView (same fallback pattern used for videos):
  - Title: `item.metadata.title.text`
  - Video count: overlay badge text at `item.content_image.primary_thumbnail.overlays[0].badges[0].text` (e.g. `"68 videos"` → 68)
- Sort descending by `videoCount`, take top 20
- Wrap in `try/catch` — on any error, return `playlists: []` (non-fatal)

### 2. `src/lib/outreach/extract-games.ts`

**Updated signature:**
```ts
export async function extractGamesGenre(
  videos: VideoMeta[],
  description: string,
  playlists: PlaylistMeta[] = [],
): Promise<GameGenreResult>
```

**Updated system prompt:**
> You analyse a YouTube gaming channel. When playlist data is provided, weight it heavily — it reflects total body of work. Recent video titles indicate only what was uploaded recently. Return up to 3 games most prominently covered and the channel's primary genre (exactly one of: ...).

**Updated user message (when playlists present):**
```json
{
  "playlists_by_video_count": "Super Auto Pets: 1092, Spelunky 2: 136, ...",
  "recent_video_titles": ["...", "..."],
  "channel_about": "..."
}
```

**When `playlists` is empty** (no playlists or fetch failed): user message is unchanged from current behavior — `recent_video_titles` and `channel_about` only.

### 3. `src/app/api/outreach/enrich/route.ts`

One-line change at the `extractGamesGenre` call site:
```ts
// Before:
const extracted = await extractGamesGenre(data.videos, data.description)
// After:
const extracted = await extractGamesGenre(data.videos, data.description, data.playlists)
```

## Data Flow

```
fetchChannelData(channelId)
  ├── getVideos()    → last 10 videos (unchanged)
  ├── getPlaylists() → top 20 playlists sorted by videoCount (NEW)
  └── getAbout()     → description (unchanged)

extractGamesGenre(videos, description, playlists)
  └── GPT-4o-mini
        ├── primary:   playlist names weighted by video count
        └── secondary: recent video titles (recency signal)
```

## Error Handling

- `getPlaylists()` failure → `playlists: []`, pipeline continues with video-titles-only fallback
- `has_playlists === false` → `playlists: []`, same fallback
- Zero playlists returned → `playlists: []`, same fallback
- Existing partial-save path (LLM throws) is unchanged

## What Does Not Change

- JSON schema returned by `extractGamesGenre` (`games: string[]`, `genre: Genre`)
- `Genre` enum and `genre-taxonomy.ts`
- Timeout (20s), model (gpt-4o-mini), temperature (0)
- Partial-save semantics in the route handler
- All other fields in `OutreachChannelData`

## Success Criteria

- Channels with game-specific playlists return `top_games` reflecting their most-played games by volume, not just recent uploads
- Channels with no playlists behave identically to current behavior
- TypeScript compiles cleanly (`npx tsc --noEmit`)
