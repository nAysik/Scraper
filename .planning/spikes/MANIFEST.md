# Spike Manifest

## Idea

Improve `top_games` extraction for the outreach enrichment pipeline by replacing
"last 10 video titles only" with a hybrid approach: channel playlists (primary signal,
reflects total body of work) + last 10 video titles (secondary/recency signal).

## Requirements

- Must reuse the existing youtubei.js singleton (`getClient()`)
- Playlist parsing must use the LockupView fallback (same pattern as videos tab)
- GPT-4o-mini prompt must weight playlists heavily over recent titles
- First page of playlists (30 items) is sufficient — no pagination needed
- Non-game playlist noise ("Best Videos!", collections) filtered by GPT, not code

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | channel-playlists | standard | getPlaylists() returns usable titles + video counts | VALIDATED ✓ | youtubei, innertube, playlists, top-games |
