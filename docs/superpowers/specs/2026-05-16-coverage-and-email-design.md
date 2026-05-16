# Design: Expanded Coverage & Email Discovery

**Date:** 2026-05-16
**Status:** Approved
**Scope:** Three independent features that increase creator coverage and email yield

---

## Problem

The existing outreach tool discovers YouTube creators via a single-keyword search (5 pages × 2 variants) and extracts emails only from YouTube About page descriptions. Two gaps:

1. **Coverage** — YouTube's relevance ranking surfaces big channels first. Smaller creators are buried past page 5 or don't rank for the searched keyword at all.
2. **Email yield** — Many creators don't list their email on YouTube. They put it on their website, their Twitch bio, or their Linktree. The tool currently finds none of these.

---

## Solution Overview

Three additions, each independently shippable:

| Feature | Coverage gain | Email gain | New credentials |
|---------|--------------|------------|-----------------|
| Multi-keyword sweep | 3–5× more YouTube channels | None | None |
| Website email enrichment | None | ~30–50% more emails on enriched YouTube channels | None |
| Twitch discovery | 100 Twitch streamers per game search | High (Twitch bios have dense email coverage) | TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET |

---

## Feature 1: Multi-Keyword Sweep

### UI

The single keyword `<Input>` in the "Discover channels" tab is replaced with a **keyword chip input**. The user types a keyword and presses Enter or Tab to add it as a chip. Chips are removable via ×. The Search button fires once at least one chip is present.

- Max 5 keywords per sweep — a "N/5 keywords" counter shows when chips are present
- Placeholder on the input: `e.g. Hades, Hades gameplay, Hades review`
- Submit is disabled while a search is already running

### Backend

Each keyword runs the existing `searchVideosByKeyword()` function with both variants (relevance + `upload_date:'week'`), 5 pages each. All keyword × variant combinations fire in parallel via `Promise.all`. Results are merged into one `Map<channelId, DiscoveredChannel>`, deduped by `channelId` (first-seen wins).

- With 5 keywords: up to 10 parallel InnerTube searches, all within the existing `maxDuration: 300` budget
- Page depth stays at 5 — more keyword variants surfaces more creators than more pages of the same keyword
- Already-saved check, subscriber filter, and result table are unchanged — they operate on the merged result set

### Files changed

- `src/app/api/outreach/discover/route.ts` — accept `keywords: string[]` instead of `keyword: string`; `Promise.all` across all keywords × variants
- `src/components/outreach/discovery-table.tsx` (DiscoveryPanel) — replace single Input with chip input component

---

## Feature 2: Website Email Enrichment

### Where it fits

Inserts as a new step inside `src/lib/outreach/fetch-channel-data.ts`, after the InnerTube About page fetch, before the GPT call. No new pipeline stages — it adds data to the existing payload.

### Logic

After extracting the YouTube About page social links:

1. Find the first non-social-platform URL in the links array (skip `youtube.com`, `twitter.com`, `instagram.com`, `twitch.tv`, `tiktok.com`, `facebook.com`)
2. If a website URL is found and no email was already extracted from the YouTube description:
   - Fetch the URL with a 5-second `AbortController` timeout
   - Run the email regex on the full HTML response body
   - Take the first match
3. If the fetch fails, times out, or returns no email: continue silently — enrichment is not affected

### Expected yield

Creators who don't list email on YouTube but have it on their website's About or Contact page. Estimated 30–50% of currently email-less channels that have a website link will return an email.

### Files changed

- `src/lib/outreach/fetch-channel-data.ts` — add `websiteEmail` extraction step
- `src/lib/outreach/upsert.ts` — no change needed (`email` field already exists, just gets populated more often)

---

## Feature 3: Twitch Discovery Pipeline

### Authentication

Client credentials OAuth — no user login required. On first use, the server POSTs to `https://id.twitch.tv/oauth2/token` with `client_id`, `client_secret`, and `grant_type=client_credentials` to get a bearer token. Token is cached in a module-level variable; refreshed when it expires (~60 days). Pattern mirrors the InnerTube singleton in `src/lib/scraper/innertube.ts`.

**New env vars** (add to `.env.local` and CLAUDE.md env table):
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

### Discovery flow

```
POST /api/outreach/discover-twitch { game: string }
  → GET /helix/games?name={game}           # resolve game_id
  → GET /helix/streams?game_id={id}&first=100  # live streams, sorted by viewer_count desc
  → GET /helix/users?id=id1&id=id2...      # batch fetch bios (one request, up to 100 IDs)
  → email regex on each bio description
  → already-saved check (same Supabase query as YouTube discovery)
  → return TwitchChannel[]
```

### TwitchChannel shape

```typescript
interface TwitchChannel {
  twitchId: string;        // Twitch user ID
  login: string;           // e.g. "shroud"
  displayName: string;     // e.g. "shroud"
  url: string;             // https://twitch.tv/{login}
  viewerCount: number;     // live viewer count at time of search
  email: string | null;    // extracted from bio, or null
  alreadySaved: boolean;
}
```

Note: viewer count reflects live viewers at the moment of search, not follower count. Labeled "Live viewers" in the UI to avoid confusion.

### UI — new tab

A 4th tab **"Discover on Twitch"** added to `OutreachTabs` (tab order: Discover channels | Bulk enrich | Outreach list | Discover on Twitch).

The tab contains:
- A single game name input + Search button (same pattern as YouTube keyword search — single field, no chip input needed since Twitch search is by game, not freeform keyword)
- Results table: Display name (link to Twitch channel), Live viewers, Email, Status (already-saved badge)
- Max-subscribers-style filter: "Max live viewers" input to hide large streamers
- Save flow: select up to 15, save button → calls `POST /api/outreach/enrich` is NOT used here (no InnerTube step for Twitch) — instead calls a new `POST /api/outreach/save-twitch` route that directly upserts the selected rows
- No enrichment step for Twitch — bio data is already available from the discovery call

### Schema change — Migration 006

```sql
ALTER TABLE outreach_channels
  ADD COLUMN platform text NOT NULL DEFAULT 'youtube';
```

- All existing rows get `platform = 'youtube'` via the DEFAULT
- Twitch channels are stored with `youtube_id = {twitch_login}` and `platform = 'twitch'`
- The URL column stores `https://twitch.tv/{login}` for Twitch rows
- `subscriber_count` stores null for Twitch (follower count not fetched in v1; viewer count is not stored — it's ephemeral)
- `top_games` and `genre` are null for Twitch rows (no GPT enrichment)
- A unique constraint on `(youtube_id, platform)` prevents duplicate saves

### Outreach List changes

- `GET /api/outreach/channels` already fetches all rows — no change needed
- Outreach List table gets a **Platform** column: `<Badge>YouTube</Badge>` or `<Badge variant="secondary">Twitch</Badge>`
- "Re-enrich" button is hidden for Twitch rows (no InnerTube enrichment available)
- CSV export gets a **Platform** column between Channel name and URL

---

## Out of Scope

- Follower count for Twitch channels (requires per-user API call; viewer count is sufficient for v1)
- Auto-generated keyword suggestions (user-controlled chips cover the need)
- Linktree scraping (website fetch covers the general case; Linktree is one pattern among many)
- Twitch VOD history / non-live channel discovery
- Re-enrichment for Twitch rows
- Twitch-to-YouTube cross-reference (matching a Twitch streamer to their YouTube channel)

---

## Implementation Order

These are three independent features. Suggested shipping order:

1. **Multi-keyword sweep** — purely additive, no schema changes, highest coverage ROI
2. **Website email enrichment** — small change to existing pipeline, no schema changes
3. **Twitch discovery** — new integration, schema migration, most work

Each can be planned and executed as a separate phase.
