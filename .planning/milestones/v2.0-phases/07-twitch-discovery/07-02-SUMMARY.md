---
phase: 07-twitch-discovery
plan: "02"
subsystem: twitch-api
tags: [twitch, oauth, api, outreach, route-handler]
dependency_graph:
  requires: [07-01]
  provides: [twitch-client, twitch-search, discover-twitch-route, save-twitch-route]
  affects: [outreach_channels]
tech_stack:
  added: []
  patterns: [client-credentials-oauth, module-level-token-cache, batch-api-request, email-regex-extraction]
key_files:
  created:
    - src/lib/twitch/client.ts
    - src/lib/twitch/search.ts
    - src/app/api/outreach/discover-twitch/route.ts
    - src/app/api/outreach/save-twitch/route.ts
  modified: []
decisions:
  - Token cached module-level with 60-second pre-expiry refresh buffer — avoids per-request token fetches without risking expired token use
  - Twitch login stored in youtube_id column with platform='twitch' as discriminator — reuses existing composite unique constraint from migration 006
  - save-twitch uses upsertOutreachChannel (not direct Supabase call) for consistency with outreach bounded context
  - No enrichment step for Twitch — bio data from discovery call is the full dataset; LLM enrichment not needed
  - Twitch search errors return 502 (upstream failure) not 500 — clearer signal to caller
metrics:
  duration: "10m"
  completed: "2026-05-16"
  tasks_completed: 3
  files_created: 4
  files_modified: 0
---

# Phase 7 Plan 02: Twitch API Library + Route Handlers Summary

Cached Twitch client-credentials OAuth token manager plus a game-to-streamers search pipeline, wired into two auth-gated Next.js route handlers.

## What Was Built

- **`src/lib/twitch/client.ts`** — Module-level cached client credentials OAuth token manager. Refreshes automatically 60 seconds before expiry. Exposes `getTwitchToken()` and `getTwitchHeaders(token)`.
- **`src/lib/twitch/search.ts`** — Three-step Twitch Helix pipeline: game name → game_id, game_id → live streams (up to 100), stream user_ids → batch user profiles. Merges results and extracts emails from streamer bios via regex. Returns `TwitchChannel[]`.
- **`src/app/api/outreach/discover-twitch/route.ts`** — `POST /api/outreach/discover-twitch`. Auth-gated. Validates and trims game string (max 200 chars). Calls `searchTwitchStreamers`, then checks `outreach_channels` for rows matching login + `platform='twitch'` to set `alreadySaved` flags. Returns `{ channels }`.
- **`src/app/api/outreach/save-twitch/route.ts`** — `POST /api/outreach/save-twitch`. Auth-gated. Accepts up to 15 `TwitchChannel` objects. Calls `upsertOutreachChannel` for each with `platform: 'twitch'`, Twitch login as `youtubeId`. Returns `{ saved, failed }`.

## Key Decisions

1. **Token cached module-level with 60s pre-expiry buffer** — avoids per-request token fetches without risking expired token use on high-traffic instances.
2. **Twitch login in `youtube_id` column, `platform='twitch'` as discriminator** — reuses the composite unique constraint `(youtube_id, platform)` from migration 006 without schema changes.
3. **`upsertOutreachChannel` for saves** — consistent with outreach bounded context; no direct Supabase calls in route handlers.
4. **No LLM enrichment step** — streamer bio data from the discovery call is the full dataset for Twitch channels; game/genre extraction is not applicable.
5. **Twitch search errors → 502** — distinguishes upstream Helix API failures from server bugs (500).

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

All four threats from the plan's `<threat_model>` are mitigated in implementation:
- T-07-02-01: Auth gate (`supabase.auth.getUser()`, 401 before any Twitch call) — both routes.
- T-07-02-02: `game` validated as string, trimmed, sliced to 200 chars before reaching Twitch API.
- T-07-02-03: Max-15 cap enforced server-side; only `login/displayName/url/email` fields used in upsert.
- T-07-02-04: `TWITCH_CLIENT_SECRET` read server-side only via `process.env`; never returned to client.

## Self-Check: PASSED

Files verified:
- `src/lib/twitch/client.ts` — FOUND
- `src/lib/twitch/search.ts` — FOUND
- `src/app/api/outreach/discover-twitch/route.ts` — FOUND
- `src/app/api/outreach/save-twitch/route.ts` — FOUND

Commit `02e6513` verified in git log.
TypeScript: `npx tsc --noEmit` — zero errors.
