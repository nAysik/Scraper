---
phase: 02-enrichment-pipeline
plan: 02
subsystem: outreach-pipeline
tags: [outreach, pipeline, innertube, openai, supabase, gpt-4o-mini, structured-outputs, library, types, contracts]
dependency_graph:
  requires: [01-01-SUMMARY]
  provides: [src/lib/outreach/* pipeline contracts]
  affects: [02-03-PLAN, 02-04-PLAN]
tech_stack:
  added: []
  patterns: [lazy-singleton, cast-to-any, retry-once-500ms, json-schema-strict, createServiceClient]
key_files:
  created:
    - src/lib/outreach/genre-taxonomy.ts
    - src/lib/outreach/canonicalize-url.ts
    - src/lib/outreach/median.ts
    - src/lib/outreach/extract-games.ts
    - src/lib/outreach/resolve-channel.ts
    - src/lib/outreach/fetch-channel-data.ts
    - src/lib/outreach/upsert-outreach.ts
  modified: []
decisions:
  - "No new npm dependencies added — hand-written JSON Schema instead of zod (per RESEARCH recommendation)"
  - "fetch-channel-data.ts inlines its own 10-video loop to avoid the 90-day filter in getChannelRecentVideos"
  - "resolveChannel uses resolveURL two-step (not getChannel(@handle)) per RESEARCH §Pitfall 1"
  - "upsert-outreach.ts uses createServiceClient() from @/lib/supabase/server (not direct @supabase/supabase-js)"
metrics:
  duration: ~15min
  completed_date: "2026-05-10"
  tasks_completed: 2
  files_count: 7
---

# Phase 2 Plan 2: Enrichment Pipeline Modules Summary

**One-liner:** Seven `src/lib/outreach/` pipeline primitives — URL canonicalization, InnerTube channel resolution, last-10 video fetch (no 90-day filter), median calc, gpt-4o-mini structured-output extractor, and service-role upsert — ready for Plan 03's route handler to orchestrate.

## Exported Contracts

### `genre-taxonomy.ts`
```typescript
export const GENRES = ['Cozy','Survival','Roguelike','RPG','Strategy','Simulation','Horror','Platformer','Action/Adventure','Variety','Other'] as const;
export type Genre = (typeof GENRES)[number];
```
Single source of truth for the D-07 closed enum. 11 values, order locked.

### `canonicalize-url.ts`
```typescript
export function canonicalizeUrl(input: string): string | null
```
Pure. Accepts UC IDs (returns as-is for fast-path in resolve-channel), bare `@handles`, and any `youtube.com`/`youtu.be`/`m.youtube.com` URL. Strips query+fragment, lowercases host, returns `https://youtube.com{path}` or `null`.

### `median.ts`
```typescript
export function medianViews(views: number[]): number
```
Pure. Returns `0` for empty array (caller decides whether to coerce to null for the DB `median_views bigint` column). Even-length arrays return the average of the two middle values, rounded.

### `extract-games.ts`
```typescript
export interface GameGenreResult { games: string[]; genre: Genre; }
export async function extractGamesGenre(videos: VideoMeta[], description: string): Promise<GameGenreResult>
```
Lazy singleton OpenAI client (`process.env.OPENAI_API_KEY`). Single `chat.completions.parse()` call (OpenAI v6 — no `.beta.` prefix). Strict JSON schema enforces `additionalProperties: false`, `required: ['games', 'genre']`, `enum: [...GENRES]`. No `minItems`/`maxItems` (strict mode forbids them) — `≤3 games` enforced via prompt + `.slice(0, 3)` post-process. 20-second `Promise.race` timeout. **Throws on any failure** — route handler catches and routes channel to `partial[]`.

### `resolve-channel.ts`
```typescript
export interface ResolvedChannel { youtubeId: string; canonicalUrl: string; }
export async function resolveChannel(canonicalUrlOrId: string): Promise<ResolvedChannel | null>
```
UC ID fast-path (no InnerTube call). Otherwise calls `client.resolveURL(url)` and extracts `payload.browseId` (UC ID). Validates browseId against `/^UC[A-Za-z0-9_-]{22}$/`. Uses `payload.canonicalBaseUrl` (defensive fallback to `/channel/UC...`) for the canonical URL. Returns `null` on any resolution failure.

### `fetch-channel-data.ts`
```typescript
export interface OutreachChannelData { name: string; subscriberCount: number; description: string; videos: VideoMeta[]; }
export async function fetchChannelData(channelId: string): Promise<OutreachChannelData | null>
```
Inlines its own 10-video loop — **does NOT call `getChannelRecentVideos`** (that function applies a 90-day cutoff via `NINETY_DAYS_MS` that would silently skip videos from quiet/infrequent indie channels). Reuses `parseViewCount`/`parseRelativeDate` from `@/lib/scraper/videos` and `getChannelSubscriberCount` from `@/lib/scraper/shorts`. One retry with 500ms backoff; second failure returns `null`.

### `upsert-outreach.ts`
```typescript
export interface OutreachUpsertRow { youtubeId: string; name: string; url: string; subscriberCount: number | null; topGames: string[] | null; genre: string | null; medianViews: number | null; lastEnrichedAt: string; }
export async function upsertOutreachChannel(row: OutreachUpsertRow): Promise<void>
```
Writes all 8 mutable columns from migration 004. `onConflict: 'youtube_id'` (both `youtube_id` and `url` are unique in the schema — keying on `youtube_id` lets re-enrichment update the canonical URL). Imports `createServiceClient` from `@/lib/supabase/server` — no direct `@supabase/supabase-js` import.

## OpenAI Extractor JSON Schema (reference for Plans 03/04/05)

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "games": { "type": "array", "items": { "type": "string" } },
    "genre": { "type": "string", "enum": ["Cozy","Survival","Roguelike","RPG","Strategy","Simulation","Horror","Platformer","Action/Adventure","Variety","Other"] }
  },
  "required": ["games", "genre"]
}
```

`response_format`: `{ type: 'json_schema', json_schema: { name: 'channel_extraction', strict: true, schema: <above> } }`

## Pitfall Notes Preserved in Code (for Plans 03/04/05)

**Pitfall 1 — Handle resolution:** `getChannel()` accepts only UC IDs. Passing `@handle` fails. `resolve-channel.ts` always goes through `resolveURL()` unless input already matches `/^UC[A-Za-z0-9_-]{22}$/`. Comment preserved in `resolve-channel.ts` header.

**Pitfall 3 — URL unique constraint:** `outreach_channels` has unique on both `youtube_id` AND `url`. Conflict is keyed on `youtube_id` so re-enrichment from a differently-formed URL updates the row rather than erroring. Comment preserved in `upsert-outreach.ts` header.

**Pitfall 4 — 90-day filter:** `getChannelRecentVideos` in `src/lib/scraper/videos.ts` silently drops videos older than 90 days. Outreach targets quiet indie channels that may post infrequently. `fetch-channel-data.ts` inlines its own loop with no date filter (D-12). Comment preserved in `fetch-channel-data.ts` header.

**Pitfall 5 — OpenAI timeout:** A hanging OpenAI call would stall the route's sequential batch loop. `extract-games.ts` wraps the completion promise in `Promise.race` against a 20s timeout that throws `'openai_timeout'`. Throw propagates to route handler's per-channel catch, which routes to `partial[]` — other channels continue unaffected.

## Scraper/Supabase Layer Integrity

No files in `src/lib/scraper/` or `src/lib/supabase/` were modified. Plan 02-02 is purely additive.

## No New Dependencies

All 7 modules use only packages already in `package.json`:
- `openai` (6.37.0) — `chat.completions.parse()` GA in v6 (no `.beta.`)
- `youtubei.js` (17.0.1) — `getClient()` singleton reused
- `@supabase/supabase-js` (via `createServiceClient()`) — no direct import

## Threat Mitigations Implemented

| Threat | Mitigation |
|--------|-----------|
| T-02-04: LLM injection into top_games/genre | `additionalProperties: false` + `enum: [...GENRES]` with `strict: true` — grammar-constrained decoder enforces exact schema |
| T-02-05: OPENAI_API_KEY in client bundle | `extract-games.ts` is server-only; lazy singleton reads `process.env.OPENAI_API_KEY` (no `NEXT_PUBLIC_` prefix) at call time, not import time |
| T-02-06: OpenAI call DoS/hang | `Promise.race` 20s timeout — throws become `partial[]` entries; other channels unaffected |
| T-02-07: InnerTube fetch hang | Two-call retry-with-backoff hard bounds per-channel fetch time |

## Deviations from Plan

None — all 7 modules copied verbatim from RESEARCH snippets as instructed. No behavioural changes, no additional abstractions.

## Known Stubs

None. All exports are fully implemented pipeline primitives; no placeholder data flows.

## Self-Check: PASSED

- [x] src/lib/outreach/genre-taxonomy.ts — exists, exports GENRES (11 values) and Genre
- [x] src/lib/outreach/canonicalize-url.ts — exists, exports canonicalizeUrl
- [x] src/lib/outreach/median.ts — exists, exports medianViews
- [x] src/lib/outreach/extract-games.ts — exists, exports extractGamesGenre and GameGenreResult
- [x] src/lib/outreach/resolve-channel.ts — exists, exports resolveChannel and ResolvedChannel
- [x] src/lib/outreach/fetch-channel-data.ts — exists, exports fetchChannelData and OutreachChannelData
- [x] src/lib/outreach/upsert-outreach.ts — exists, exports upsertOutreachChannel and OutreachUpsertRow
- [x] tsc --noEmit: exit 0
- [x] npm run lint: no errors in outreach files (pre-existing errors in other files are out of scope)
- [x] Commits: 404da42 (Task 1), 93859db (Task 2)
