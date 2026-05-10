---
phase: 02-enrichment-pipeline
verified: 2026-05-10T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Full end-to-end pipeline with a real authenticated session"
    expected: "Paste https://www.youtube.com/@mkbhd, receive {succeeded:1, failed:[], partial:[]} with the row in outreach_channels containing non-null top_games, genre, and median_views"
    why_human: "Full pipeline touches InnerTube (channel resolution, video fetch), OpenAI (structured output), and Supabase upsert — all side-effect-bearing calls that cannot be tested with grep/static analysis"
  - test: "Textarea preserved on HTTP error"
    expected: "When the server returns a 4xx/5xx, the textarea still contains the pasted text and the error message appears below the button"
    why_human: "Requires browser interaction; the code path (setError without setText) is present but runtime behaviour must be confirmed visually"
  - test: "D-06 form clears on success"
    expected: "After a successful enrichment, the textarea empties and the summary panel appears below"
    why_human: "setText('') call is present on the success branch but the clearing behaviour needs visual confirmation"
---

# Phase 2: Enrichment Pipeline — Verification Report

**Phase Goal:** A user can paste one or more YouTube channel URLs (or handles) into a form, the app fetches the last 10 video titles + view counts and the channel description via InnerTube, GPT-4o-mini extracts the top 3 games covered and primary genre, median views are calculated, and the enriched record is upserted into `outreach_channels`.

**Verified:** 2026-05-10
**Status:** HUMAN_NEEDED — automated checks PASS (5/5 truths verified by static analysis); 3 items require manual browser testing
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Submitting a channel URL returns enriched data: top 3 games, primary genre, median view count | VERIFIED | Route calls `extractGamesGenre` (returns `{games, genre}`) and `medianViews`; both values flow into `upsertOutreachChannel` at lines 67-79 of `route.ts` |
| 2 | Multiple URLs are processed and each upserted as a separate row | VERIFIED | `for (const raw of unique)` loop in `route.ts` lines 51-87; `upsertOutreachChannel` called once per channel inside the loop |
| 3 | UI shows spinner during enrichment and a summary panel on completion | VERIFIED | `loading` state → `animate-spin` SVG + disabled button in `enrich-form.tsx` lines 72-78; `<SummaryPanel>` rendered at line 91 when `result` is non-null |
| 4 | GPT is called once per channel (not per video), combining titles + description | VERIFIED | `extractGamesGenre(data.videos, data.description)` — single call at `route.ts` line 67; `extract-games.ts` constructs one `chat.completions.parse` call with `recent_video_titles` array + `channel_about` string |
| 5 | Re-submitting a known URL upserts (no duplicate) | VERIFIED | `upsert-outreach.ts` line 43: `{ onConflict: 'youtube_id' }` — conflict key is the table's unique column from migration 004 |

**Score: 5/5 truths verified**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/outreach/genre-taxonomy.ts` | D-07: 11-genre closed enum | VERIFIED | Exports `GENRES` (11 values) and `Genre` type; order matches CONTEXT.md exactly |
| `src/lib/outreach/canonicalize-url.ts` | D-02: liberal URL acceptance | VERIFIED | Handles UC IDs, @handles, full URLs with any schema, strips query/fragment, lowercases host |
| `src/lib/outreach/resolve-channel.ts` | Resolves any canonical form → UC ID | VERIFIED | Fast-path for `UC...` IDs; uses `client.resolveURL()` for all other forms per RESEARCH pitfall 1 |
| `src/lib/outreach/fetch-channel-data.ts` | Last 10 videos + description, no 90-day filter | VERIFIED | Inlines own video loop with `videos.length >= 10` cap; explicitly avoids `getChannelRecentVideos`; D-12 compliant |
| `src/lib/outreach/median.ts` | Pure median calculation | VERIFIED | Handles even/odd lengths; returns 0 for empty array |
| `src/lib/outreach/extract-games.ts` | Single gpt-4o-mini call with strict JSON schema | VERIFIED | `chat.completions.parse` (no `.beta.` prefix); strict JSON schema; 20s `Promise.race` timeout; throws on failure (D-11) |
| `src/lib/outreach/upsert-outreach.ts` | Service-role upsert on `youtube_id` conflict | VERIFIED | Imports `createServiceClient` from `@/lib/supabase/server`; `onConflict: 'youtube_id'` |
| `src/app/api/outreach/enrich/route.ts` | Auth-gated POST, sequential loop, 4-reason taxonomy | VERIFIED | Auth gate before body parse; sequential `for...await`; all 4 reason codes present |
| `src/components/outreach/enrich-form.tsx` | D-01 textarea, D-05 submit-and-wait, D-06 summary | VERIFIED | Single `<textarea>`; spinner + disabled button; `SummaryPanel` with succeeded/partial/failed counts |
| `src/app/dashboard/outreach/page.tsx` | Minimal auth-gated page hosting EnrichForm | VERIFIED | `createClient().auth.getUser()` + `redirect('/login')`; renders `<EnrichForm />` |
| `src/components/dashboard-nav.tsx` | Outreach tab added | VERIFIED | 4th tab `{ label: 'Outreach', href: '/dashboard/outreach' }` present |
| `scripts/verify-outreach-pipeline.ts` | Smoke test for auth gate | VERIFIED | Checks 4 env vars + asserts 401 for unauthenticated POST (with and without body) |
| `src/lib/pipeline/categorize.ts` (DELETED) | D-09: Perplexity categorizer removed | VERIFIED | File absent from `src/lib/pipeline/` (only `keyword-categorize.ts`, `outlier.ts`, `upsert.ts` remain) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `enrich-form.tsx` | `POST /api/outreach/enrich` | `fetch('/api/outreach/enrich', { method: 'POST' })` | WIRED | Line 33-37 of form; `JSON.stringify({ text })` body shape |
| `route.ts` | `canonicalize-url.ts` | `canonicalizeUrl(raw)` | WIRED | Line 53 |
| `route.ts` | `resolve-channel.ts` | `resolveChannel(canonical)` | WIRED | Line 56 |
| `route.ts` | `fetch-channel-data.ts` | `fetchChannelData(resolved.youtubeId)` | WIRED | Line 59 |
| `route.ts` | `median.ts` | `medianViews(data.videos.map(v => v.viewCount))` | WIRED | Line 66 |
| `route.ts` | `extract-games.ts` | `extractGamesGenre(data.videos, data.description).catch(() => null)` | WIRED | Lines 67-68 |
| `route.ts` | `upsert-outreach.ts` | `upsertOutreachChannel({ ... })` | WIRED | Lines 70-79 |
| `upsert-outreach.ts` | `createServiceClient()` | `import { createServiceClient } from '@/lib/supabase/server'` | WIRED | Line 15 — canonical helper, no direct `@supabase/supabase-js` import |
| `outreach/page.tsx` | `enrich-form.tsx` | `<EnrichForm />` | WIRED | Imported and rendered |
| `dashboard-nav.tsx` | `/dashboard/outreach` | `href: '/dashboard/outreach'` in tabs array | WIRED | Tab 4 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `enrich-form.tsx` SummaryPanel | `result` (EnrichResponse) | `fetch('/api/outreach/enrich')` response JSON | Yes — populated by actual pipeline run | FLOWING |
| `route.ts` | `extracted` (GameGenreResult) | `extractGamesGenre(data.videos, data.description)` | Yes — live OpenAI call with real InnerTube-fetched titles | FLOWING |
| `route.ts` | `data` (OutreachChannelData) | `fetchChannelData(resolved.youtubeId)` | Yes — live InnerTube `getChannel` + `getVideos` + `getAbout` calls | FLOWING |
| `route.ts` | `median` | `medianViews(data.videos.map(v => v.viewCount))` | Yes — computed from actual view counts | FLOWING |

---

## Decision Compliance (D-01 through D-12)

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01: Single textarea, newline split | PASS | `<textarea>` in form; `text.split('\n').map(s=>s.trim()).filter(Boolean)` in both form and route |
| D-02: Liberal URL acceptance | PASS | `canonicalize-url.ts` handles UC IDs, @handles, full URLs (all schemes, m.youtube.com, youtu.be), strips query+fragment |
| D-03: No pre-submit preview | PASS | Form state machine has no `preview` state; goes directly IDLE → LOADING → SUCCESS/ERROR |
| D-04: Cap 15 per batch | PASS | Client: `tooMany = lines.length > MAX_BATCH (15)`, button disabled; Server: `unique.length > 15` → 400 |
| D-05: No SSE/polling | PASS | No `EventSource`, `text/event-stream`, or `ReadableStream` anywhere in route or form |
| D-06: Inline summary, form clears on success, textarea preserved on failure | PASS (code) | `setText('')` in success branch; `setError` without `setText` in error branches; `<SummaryPanel>` renders below form — requires human visual confirmation |
| D-07: 11-genre closed enum | PASS | `genre-taxonomy.ts` exports exactly `['Cozy','Survival','Roguelike','RPG','Strategy','Simulation','Horror','Platformer','Action/Adventure','Variety','Other']` |
| D-08: gpt-4o-mini + OPENAI_API_KEY | PASS | `model: 'gpt-4o-mini'` in `extract-games.ts` line 54; `OPENAI_API_KEY` in CLAUDE.md env table and smoke script REQUIRED_ENV |
| D-09: categorize.ts deleted, no PERPLEXITY_API_KEY | PASS | `src/lib/pipeline/categorize.ts` absent; zero PERPLEXITY mentions in `src/`; zero in CLAUDE.md |
| D-10: Single LLM call per channel, strict JSON schema | PASS | One `chat.completions.parse` call in `extractGamesGenre`; `strict: true`, `additionalProperties: false` in schema |
| D-11: LLM failure → row saved with null game/genre, partial[] | PASS | `extractGamesGenre(...).catch(() => null)` at route line 67-68; upsert called regardless at line 70; `extracted` null → `topGames: null, genre: null`; `partial.push({ url: raw, reason: 'llm_failed' })` |
| D-12: Zero-video skip ONLY | PASS | Skip only when `data.videos.length === 0` (route line 61); `fetch-channel-data.ts` has no date filter — grabs up to 10 most-recent videos regardless of publish date |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| ENR-01 | Paste one or more channel URLs into bulk input | SATISFIED | `<textarea>` in `enrich-form.tsx`; D-01 compliant |
| ENR-02 | Fetch last 10 videos (titles + view counts) per channel | SATISFIED | `fetch-channel-data.ts` fetches up to 10 videos with `title` and `viewCount` per `VideoMeta` |
| ENR-03 | Fetch channel About/description per channel | SATISFIED | `channel.getAbout()` in `fetch-channel-data.ts` lines 37-48 |
| ENR-04 | GPT extracts top 3 games from titles + description | SATISFIED | `extractGamesGenre(data.videos, data.description)` — `games.slice(0, 3)` returned |
| ENR-05 | GPT classifies primary gaming genre | SATISFIED | `genre` field in `GameGenreResult`; constrained to 11-value enum via JSON schema |
| ENR-06 | Median view count calculated from last 10 videos | SATISFIED | `medianViews(data.videos.map(v => v.viewCount))` |
| ENR-07 | Enriched data upserted into `outreach_channels` | SATISFIED | `upsertOutreachChannel` writes all 8 columns; `onConflict: 'youtube_id'` |
| ENR-08 | User sees enrichment progress and results summary | SATISFIED (code) | Spinner + disabled button during request; `<SummaryPanel>` with succeeded/partial/failed after — visual confirmation needed |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `CLAUDE.md` | 106 | Stale "Balancing knobs" entry: `NICHE_NAMES` in `src/lib/pipeline/categorize.ts` — file was deleted in Plan 01 | WARNING | Documentation only — misleads future agents that read CLAUDE.md for taxonomy tuning. The actual regular-video route uses `keyword-categorize.ts` (no LLM); the taxonomy claim is doubly wrong. |

**Note on the stale knob:** The "Balancing knobs" section at line 106 of CLAUDE.md still reads:
```
- Regular video niche taxonomy: `NICHE_NAMES` in `src/lib/pipeline/categorize.ts` (also update the Supabase `niches` seed data)
```
`categorize.ts` does not exist. `NICHE_NAMES` is not defined anywhere in `src/`. The regular-video scrape pipeline uses `keyword-categorize.ts` which contains `NICHE_KEYWORDS` — not `NICHE_NAMES`. Plan 05 updated the `Key library boundaries` section and the `Data flow — regular videos` block correctly, but did not update this line in the "Balancing knobs" section. This is a documentation stale reference, not a runtime blocker.

No runtime anti-patterns detected: no `return null` stubs, no hardcoded empty arrays flowing to rendering, no `return {}` in route handlers, no `TODO`/`FIXME` left in new code.

---

## Behavioral Spot-Checks

Static-only verification (full pipeline requires live InnerTube + OpenAI):

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| Auth gate: 401 before body parse | `route.ts` — `supabase.auth.getUser()` is first statement before `request.json()` | Confirmed by reading lines 28-30 vs 34-35 | PASS (static) |
| D-05: No SSE | grep for `EventSource`, `text/event-stream`, `ReadableStream` in route and form | 0 matches | PASS |
| D-09: categorize.ts deleted | `src/lib/pipeline/` directory listing | Only `keyword-categorize.ts`, `outlier.ts`, `upsert.ts` | PASS |
| D-08: gpt-4o-mini (not sonar/perplexity) | model field in `extract-games.ts` | `'gpt-4o-mini'` at line 54 | PASS |
| D-10: one LLM call per channel | `extractGamesGenre` function body | Single `client.chat.completions.parse(...)` call | PASS |
| Upsert conflict key | `upsert-outreach.ts` | `{ onConflict: 'youtube_id' }` at line 43 | PASS |
| createServiceClient not @supabase/supabase-js | import in `upsert-outreach.ts` | `import { createServiceClient } from '@/lib/supabase/server'` | PASS |
| fetch-channel-data.ts avoids 90-day filter | Grep for `getChannelRecentVideos` | Comment only (explains why NOT used); no actual call | PASS |
| `chat.completions.parse` not `.beta.` | Line 52 of `extract-games.ts` | `client.chat.completions.parse` — no `.beta.` | PASS |

---

## Human Verification Required

### 1. Full E2E Pipeline

**Test:** Log in at `/login`, navigate to `/dashboard/outreach`, paste `https://www.youtube.com/@mkbhd` in the textarea, click "Enrich 1 channel".
**Expected:** Spinner appears; button is disabled; after ~5-10s the summary panel renders showing `Succeeded: 1`, `Partial: 0`, `Failed: 0`. The `outreach_channels` table in Supabase shows a row with non-null `top_games` (3 game strings), non-null `genre` (one of the 11 enum values), and a `median_views` value > 0.
**Why human:** Requires live InnerTube channel resolution, live `getChannel`/`getVideos`/`getAbout` calls, live OpenAI structured-output call, and Supabase upsert — none of which can be asserted without side effects.

### 2. Partial-save path (D-11)

**Test:** Force the LLM path to fail by temporarily setting `OPENAI_API_KEY` to an invalid value, then submit a valid channel URL.
**Expected:** The route returns `{succeeded:0, failed:[], partial:[{url:'...', reason:'llm_failed'}]}`; the `outreach_channels` row exists with `top_games=null` and `genre=null` but `name`, `subscriber_count`, and `median_views` populated.
**Why human:** Requires a live Supabase write; the code path (`extractGamesGenre(...).catch(() => null)` → upsert with nulls → `partial.push`) is statically verified but the DB row must be confirmed.

### 3. D-06 UI behaviour (form clears + textarea preserved on error)

**Test (success path):** After a successful enrichment, confirm textarea becomes empty.
**Test (error path):** Submit an invalid URL that triggers a server 400; confirm textarea still contains the original text and the error message appears.
**Expected:** `setText('')` on success (present at `enrich-form.tsx` line 44); no `setText` on error paths (confirmed by reading lines 41-42 and 47-48 — only `setError` is called).
**Why human:** React state transitions require browser rendering to confirm.

---

## Gaps Summary

No code-level gaps. All 5 success criteria are implemented in the codebase with real, non-stub logic. The three human-verification items above are run-time confirmation requirements, not missing implementations.

**One documentation WARNING (non-blocking):**

`CLAUDE.md` line 106 (Balancing knobs section) contains a stale entry:
```
- Regular video niche taxonomy: `NICHE_NAMES` in `src/lib/pipeline/categorize.ts`
```
This file was deleted in Plan 01 and `NICHE_NAMES` does not exist anywhere in the codebase. The entry should be either deleted or replaced with a reference to `NICHE_KEYWORDS` in `src/lib/pipeline/keyword-categorize.ts`. This has no runtime effect but would mislead a future agent or developer reading the docs.

---

_Verified: 2026-05-10_
_Verifier: Claude (gsd-verifier)_
