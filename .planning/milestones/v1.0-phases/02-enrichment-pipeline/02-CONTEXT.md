# Phase 2: Enrichment Pipeline - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

A bulk channel URL paste form that fetches each channel's last 10 videos (titles + view counts) and channel about/description via InnerTube, has OpenAI gpt-4o-mini extract the top 3 games covered + primary genre from a single combined prompt per channel, computes median view count, and upserts the enriched record into the `outreach_channels` table created in Phase 1.

In scope: paste form, server-side URL canonicalization, InnerTube fetches, single-call LLM extraction, median calc, upsert, results summary.
Out of scope: Outreach tab/dashboard (Phase 4), channel discovery via keyword (Phase 3), CSV export (Phase 4), re-enrich button on existing rows (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Bulk Input UX
- **D-01:** Single `<textarea>` input, one URL per line. Server splits on newlines and trims each line. Matches the existing `<SearchForm>` aesthetic in `src/components/search-form.tsx` — the user paste from any source (Notion, spreadsheet, browser). No file upload, no per-row inputs.
- **D-02:** Liberal acceptance — anything InnerTube can resolve: full URLs (`https://youtube.com/@handle`, `https://youtube.com/channel/UC...`, legacy `/c/` and `/user/`), bare `@handles`, channel IDs, with or without protocol, with or without tracking params. Server normalises each line before resolving via youtubei.js.
- **D-03:** No pre-submit preview. User pastes → clicks Submit → server processes. Results summary at the end (per ENR-08) shows what worked / what failed.
- **D-04:** Cap submissions at **15 channels per batch**. Larger pastes are rejected with a clear inline error before any work starts. Matches the existing scraper's 10-channel pattern; keeps 15 × ~4s ≈ 60s within Vercel Pro's serverless function timeout. User splits longer lists into batches.

### Progress Feedback
- **D-05:** **Submit-and-wait** model. Disabled button + spinner + "Enriching N channels…" text while the request is in flight. Single JSON response `{succeeded: number, failed: Array<{url, reason}>, partial: Array<{url, reason}>}` returned at the end. No SSE, no polling.
- **D-06:** Inline summary panel renders below the form when the response arrives. Summary shows succeeded/partial/failed counts with an expandable list of failure URLs + reasons. Form clears so the user can submit another batch. No redirect — the user stays on the Outreach page.

### Genre Taxonomy
- **D-07:** `genre` is a **closed enum**, exactly one of: `Cozy`, `Survival`, `Roguelike`, `RPG`, `Strategy`, `Simulation`, `Horror`, `Platformer`, `Action/Adventure`, `Variety`, `Other`. The LLM is constrained to pick exactly one via JSON schema (strict mode in gpt-4o-mini's `response_format`). Phase 4's filter dropdown stays stable; data is queryable by exact match.

### LLM Provider
- **D-08:** Switch to **OpenAI gpt-4o-mini** for game/genre extraction. Adds `OPENAI_API_KEY` to `.env.local` (and Vercel project env).
- **D-09:** Cleanup: **delete `src/lib/pipeline/categorize.ts`** and remove `PERPLEXITY_API_KEY` from the env requirement list (CLAUDE.md, `.env.local` references). Per the architecture map, this code is never called by any route handler — safe to delete. Removes a documented anti-pattern. New OpenAI categorizer lives in a fresh file (planner picks the path; suggested: `src/lib/outreach/extract-games.ts`).
- **D-10:** Single LLM call per channel (locked from PROJECT.md), combining the channel's last-10 video titles + about/description. Returns `{ games: string[<=3], genre: <enum from D-07> }`. Strict JSON schema enforcement via gpt-4o-mini's `response_format: { type: 'json_schema', strict: true }`.
- **D-11:** When the LLM call fails for a single channel (timeout, parse error, 5xx), **save the row with InnerTube data only** (`name`, `url`, `youtube_id`, `subscriber_count`, `median_views` populated; `top_games` and `genre` null). Counted as `partial` in the summary. Leverages D-02 nullability from Phase 1. The user can re-enrich later in Phase 4. Other channels in the batch are unaffected.

### Small-Channel Behavior
- **D-12:** Always enrich with whatever videos exist. A channel with 1 video gets a 1-video median; a channel with 5 videos gets a 5-video median; the LLM extracts games/genre from whatever titles are available. **Skip only if the channel has zero videos** — count as failure with reason "no videos found".

### Claude's Discretion

The user opted out of discussing the items below. Planner may act on these defaults without re-asking:

- **URL canonicalization rule:** strip query strings (`?si=`, `?utm_*`), lowercase host, resolve `@handle` → canonical `https://youtube.com/@handle` form. Use the canonicalized URL for the `url` column's unique constraint.
- **Concurrency within a batch:** sequential channel processing (`for ... await`) to stay simple and avoid InnerTube rate-limit concerns. If timing becomes an issue, planner may switch to bounded `Promise.allSettled` (e.g., concurrency = 3).
- **InnerTube transient failure handling:** one retry with a 500ms backoff for InnerTube fetches; on second failure, the channel is recorded as a hard failure (no row written). Distinct from D-11 (LLM failure → partial save).
- **Failure reason taxonomy:** `not_found` (InnerTube can't resolve), `no_videos` (channel exists but has 0 videos), `llm_failed` (partial — InnerTube succeeded), `timeout`, `unknown_error`.
- **File layout:** API route at `src/app/api/outreach/enrich/route.ts`. Pipeline modules under `src/lib/outreach/` (e.g., `resolve-channel.ts`, `fetch-channel-data.ts`, `extract-games.ts`, `upsert-outreach.ts`). Form component at `src/components/outreach/enrich-form.tsx` (or similar). Path under `src/app/dashboard/outreach/page.tsx` is reserved for Phase 4's tab; Phase 2 may add a minimal page that hosts only the enrich form.
- **LLM prompt template:** system prompt anchors the closed enum + 3-game-max constraint; user prompt embeds the 10 titles as a JSON array + the about/description as a separate field. Temperature 0 for determinism.
- **Loading-state styling:** matches existing `<SearchForm>` (button text changes, button disabled, spinner glyph). No skeleton table.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Enrichment Pipeline — ENR-01 through ENR-08
- `.planning/ROADMAP.md` §Phase 2 — Goal statement and 5 success criteria
- `.planning/PROJECT.md` — Locked decision: GPT called once per channel (now realised as gpt-4o-mini per D-08)

### Prior Phase Decisions
- `.planning/phases/01-database-foundation/01-CONTEXT.md` — D-01 (`top_games text[]`), D-02 (enriched fields nullable)
- `.planning/phases/01-database-foundation/01-01-SUMMARY.md` — Phase 1 outcomes; service-role write pattern; column-by-column schema reference

### Existing Code (mandatory reads)
- `src/lib/scraper/innertube.ts` — Singleton InnerTube client. Reuse, do not instantiate a new one.
- `src/lib/scraper/videos.ts` — Existing helpers `parseViewCount`, `parseRelativeDate`, `parseSubscriberCount`, `getChannelRecentVideos`. Reuse where shape matches; add new helpers for "fetch about/description" and "fetch last N videos with titles+views" if existing ones don't fit.
- `src/lib/scraper/channels.ts` — `searchChannelsByKeyword` (relevant for Phase 3) and channel-meta parsing patterns.
- `src/lib/supabase/server.ts` — `createServiceClient()` is the **only** sanctioned service-role client. Phase 2 must NOT instantiate `createClient` from `@supabase/supabase-js` directly (the existing `upsert.ts` pattern is grandfathered legacy; new outreach code must use `createServiceClient()`).
- `src/components/search-form.tsx` — Pattern reference for the new enrich form (state shape, error display, disabled button, fetch handling).
- `src/app/api/scrape/route.ts` — Pattern reference for the new enrich API route (auth check via `supabase.auth.getUser()`, top-level `try/catch` returning `{error}` 500, request body parsing).

### Migration & Schema
- `supabase/migrations/004_outreach_channels.sql` — The actual schema Phase 2 writes to. Re-read for exact column names, nullability, and unique constraints before authoring upsert logic.

### Codebase Intel
- `.planning/codebase/ARCHITECTURE.md` — Layer boundaries (scraper → pipeline → upsert → route). Phase 2 must respect.
- `.planning/codebase/STRUCTURE.md` — File-tree conventions.
- `.planning/codebase/INTEGRATIONS.md` — InnerTube and OpenAI SDK integration patterns already in use.

### CLAUDE.md
- `CLAUDE.md` — Will need a Phase 2 update at the end of the phase: replace `PERPLEXITY_API_KEY` row in the env table with `OPENAI_API_KEY`; add an "Outreach pipeline" data-flow section. Out of scope for the planner; flag for the executor's last commit or a follow-up doc commit.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **InnerTube singleton** — `src/lib/scraper/innertube.ts`. Module-level client, optionally proxied. New outreach scraper code imports and reuses; do not instantiate a fresh `Innertube` instance anywhere.
- **Video parsers** — `parseViewCount`, `parseRelativeDate`, `parseSubscriberCount` already cover all numeric YouTube parsing this phase needs. `getChannelRecentVideos(channelId, limit)` returns `{ subscriberCount, videos }` — likely reusable directly for the "last 10 videos" fetch with `limit = 10`.
- **OpenAI SDK** — `openai` package already installed (`package.json`). Reuse but with a default baseURL (no Perplexity override) and a fresh module-level client constructed with `OPENAI_API_KEY`.
- **Service-role Supabase client** — `createServiceClient()` from `src/lib/supabase/server.ts`. Use for all `outreach_channels` writes (upserts on `youtube_id` conflict).
- **Auth pattern** — `supabase.auth.getUser()` check from `src/lib/supabase/server.ts`'s SSR `createClient()` at the top of route handlers. The enrich route is user-triggered, not cron-triggered; it gates on authenticated user (matches `/api/scrape`).
- **Form pattern** — `src/components/search-form.tsx` is the closest analog: client component, single text input (now textarea), disabled button + error state + result summary. Reuse the state-machine shape.

### Established Patterns
- **InnerTube node casts to `any`.** youtubei.js internal types are unreliable; the existing scraper code casts to `any` everywhere. New outreach scraper must follow this — do not try to import unexported node types.
- **Layer rule:** scraper layer (`src/lib/scraper/`) speaks InnerTube only and returns plain typed objects. Pipeline layer (`src/lib/pipeline/` or `src/lib/outreach/`) does pure business logic. Upsert layer (or inline in pipeline) talks to Supabase. Routes orchestrate. New outreach code must respect these layers.
- **Top-level `try/catch` in route handlers** wraps the full pipeline and returns `NextResponse.json({error: msg}, {status: 500})`. Inner per-channel `try/catch` in cron/shorts logs the error and `continue`s — Phase 2 follows this same pattern (per-channel failures don't abort the batch; they're recorded in the `failed[]` or `partial[]` arrays).
- **Env-keyed singletons** for SDK clients — see `categorize.ts`'s `getOpenAI()` pattern. New OpenAI extractor follows this shape (lazy module-level singleton).

### Integration Points
- New API route: `src/app/api/outreach/enrich/route.ts` — `POST` only; auth-gated; body `{urls: string[]}` (or freeform `{text: string}` if the form sends raw textarea content).
- New form component: under `src/components/` (planner picks exact path). Renders the textarea + submit button + inline summary panel.
- New page (minimal in Phase 2): `src/app/dashboard/outreach/page.tsx` to host the enrich form. Phase 4 expands this into the full dashboard tab.
- New pipeline modules: `src/lib/outreach/*` (planner picks file split). Includes URL canonicalization, channel resolution, video fetch, description fetch, LLM extraction, median calc, upsert.
- Writes target: `outreach_channels` table (Phase 1's `004_outreach_channels.sql`). Conflict key: `youtube_id`.
- LLM call target: OpenAI `https://api.openai.com/v1/chat/completions`, model `gpt-4o-mini`, `response_format: { type: 'json_schema', strict: true, json_schema: ... }`.
- Cleanup target: delete `src/lib/pipeline/categorize.ts` and update CLAUDE.md's env table + data-flow diagram in the same phase.

</code_context>

<specifics>
## Specific Ideas

- The "lean" theme runs through every decision: single textarea, no preview, submit-and-wait, closed enum, sequential processing, save-with-nulls on partial failure. Optimise for shipping a working v1, not a polished long-running batch system.
- Indie-PC marketing focus drives the genre list. The 11 genres bias toward what indie creators actually cover (Cozy, Survival, Roguelike top of mind). FPS and Sports were deliberately excluded — they would mostly map to AAA channels outside the user's outreach target.
- Cap of 15 per batch is opinionated: it forces the user to chunk their lists, which is a feature (smaller failure blast radius) rather than a bug.
- "Always enrich what's available" preserves coverage of small/new indie channels — the exact long-tail the user wants to reach for outreach.

</specifics>

<deferred>
## Deferred Ideas

- **Re-enrich button on existing rows** — already in scope for Phase 4 (DASH-04). Phase 2 only handles fresh enrichment of pasted URLs.
- **Job queue / background processing** for >15 channels — surfaced as the alternative to the size cap. Out of scope for v1; revisit if user wants to enrich hundreds of channels at once. v2-style enhancement.
- **SSE/streaming progress feedback** — surfaced and deferred. Submit-and-wait is good enough for ≤15 channels × ~4s. Reconsider if the cap is ever raised significantly.
- **Cleanup of the duplicated service-role client construction** in `src/lib/pipeline/upsert.ts` and `src/app/api/cron/scrape/route.ts` — flagged in `.planning/codebase/ARCHITECTURE.md` as an anti-pattern. Phase 2 only adds new code that follows the canonical pattern; existing duplication stays as legacy. Cleanup should be a separate phase or a backlog item.
- **CLAUDE.md Phase 2 documentation update** — env table swap (PERPLEXITY → OPENAI), new outreach data-flow section. Not part of the plan-phase deliverables; planner should flag it as a final commit task or defer to a separate docs commit.

</deferred>

---

*Phase: 2-Enrichment Pipeline*
*Context gathered: 2026-05-10*
