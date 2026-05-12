---
spike: 001
name: channel-playlists
type: standard
validates: "Given a gaming channel, when we call getPlaylists() via youtubei.js, then we receive playlist titles and video counts usable as a top-games signal"
verdict: VALIDATED
related: []
tags: [youtubei, innertube, playlists, top-games, outreach]
---

# Spike 001: Channel Playlists via youtubei.js

## What This Validates

Given a gaming channel, when we call `channel.getPlaylists()` via youtubei.js,
then we get back playlist titles and video counts that are directly usable as a
primary signal for which games a creator focuses on.

## Research

YouTube's API surface for playlists is the same LockupView shape introduced for the
videos tab (see `fetch-channel-data.ts` fix in commit a0cba35). The `GridPlaylist`
getter on the returned tab object is stale — it returns `[]`. The items are in
`playlistTab.playlists` but typed as `LockupView` nodes.

### Chosen approach

Parse `playlistTab.playlists` as LockupView:
- **Title**: `item.metadata.title.text`
- **Video count**: `item.content_image.primary_thumbnail.overlays[0].badges[0].text`
  (e.g. `"68 videos"` → parseInt → 68)

## How to Run

```
node .planning/spikes/001-channel-playlists/run.mjs [channelId]
# default: Northernlion UC3tNpTOHsTnkmbwztCs30sA
```

## What to Expect

A ranked list of playlists with video counts, plus top-10 by count.

## Investigation Trail

**Attempt 1**: Called `playlistTab.playlists` and mapped `.title` / `.video_count` —
returned 30 items but all showed "(no title)" and "?". `Object.keys(item)` showed
`LockupView` shape, not `GridPlaylist`.

**Pivot**: Printed full JSON of first item. Found:
- Title at `metadata.title.text` ✓
- Video count NOT in `metadata_rows` (only "View full playlist" link there)
- Video count in thumbnail overlay badge: `content_image.primary_thumbnail.overlays[0].badges[0].text` → "68 videos" ✓

**Attempt 2**: Updated parser with correct paths — 30/30 items yield both title and count.

## Results

**Verdict: VALIDATED**

Tested against Northernlion (UC3tNpTOHsTnkmbwztCs30sA), first page of playlists:

```
30/30 playlists have a title
30/30 playlists have a parseable video count

Top 10 by video count:
  1. Super Auto Pets — 1092 videos
  2. Best Videos! — 665 videos       ← noise (non-game collection)
  3. The Streaming of Isaac — 260 videos
  4. Fall Guys! — 177 videos
  5. Chess — 141 videos
  6. Spelunky 2! — 136 videos
  7. Sporcle! — 101 videos            ← noise (trivia show)
  8. Elden Ring — 68 videos
  9. Trackmania — 65 videos
  10. REACT COURT — 58 videos         ← noise (non-game)
```

### Key findings

1. **Data is accessible** — same LockupView fallback pattern already used in the video tab; 
   straightforward to add to `fetch-channel-data.ts`.
2. **Signal quality is high** — playlist titles are game names, counts reflect total body of work.
3. **Noise exists** — "Best Videos!", "REACT COURT", "Sporcle!" are not games. GPT-4o-mini
   should filter these naturally when asked to identify game names.
4. **First page only** — 30 playlists per page; most gaming channels have their primary games
   represented in the first 30. Pagination not needed for MVP.
5. **No extra API calls needed** — `getPlaylists()` is one InnerTube request; same cost as
   `getVideos()`.

### Design for hybrid approach

```
fetchChannelData():
  1. getVideos()   → last 10 video titles (recency signal)
  2. getPlaylists() → top playlists by video_count (body-of-work signal)

extractGamesGenre(prompt):
  "Playlists (primary signal): Super Auto Pets: 1092, Spelunky 2: 136, ...
   Recent videos (secondary): [titles]
   Identify top 3 games weighted heavily toward playlists with high counts."
```

GPT-4o-mini handles noise filtering (non-game playlists) and name normalization
("The Streaming of Isaac" → "The Binding of Isaac").
