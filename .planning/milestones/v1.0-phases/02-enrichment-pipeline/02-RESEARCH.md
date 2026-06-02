# Phase 2: Enrichment Pipeline - Research

**Researched:** 2026-05-10
**Domain:** Server-side bulk channel enrichment (URL canonicalization → InnerTube fetch → LLM extraction → Supabase upsert) inside a Next.js 16 App Router route handler.
**Confidence:** HIGH on third-party APIs (youtubei.js, OpenAI, Vercel) verified against installed source and current docs. HIGH on existing-code patterns. MEDIUM on edge cases for legacy `/c/` and `/user/` URLs (training-data based; recommend testing).

## Summary

Every locked decision in CONTEXT.md (D-01..D-12 plus Claude's-discretion defaults) maps cleanly to existing project patterns or current third-party APIs. No re-litigation needed. The phase is technically routine: one new POST route, one new client form, ~5 small modules under `src/lib/outreach/`, one file deletion, one CLAUDE.md doc update.

The two non-obvious technical pivots are:

1. **`youtubei.js` does not accept bare `@handles` in `getChannel()`** — `getChannel()` requires a UC channel ID. To honour D-02 (liberal acceptance), the planner must add a resolution step using `client.resolveURL("https://www.youtube.com/@handle")` which returns a `NavigationEndpoint` whose `payload.browseId` is the channel ID. This is the *only* viable bridge from handle/legacy-URL to channel ID inside the library.

2. **OpenAI v6 SDK puts structured outputs at `client.chat.completions.parse(...)` (no longer `.beta.`)**, with two valid call shapes: hand-written JSON Schema or `zodResponseFormat()`. Since `zod` is **not** currently in `package.json`, the simpler path is hand-written JSON Schema with `strict: true` — no new dependency. The planner may install zod for ergonomics; either is correct.

**Primary recommendation:** Build the pipeline as five small modules under `src/lib/outreach/` (canonicalize-url → resolve-channel → fetch-channel-data → extract-games → upsert-outreach), orchestrated sequentially in a single POST route at `src/app/api/outreach/enrich/route.ts` with `export const maxDuration = 300`. Use hand-written JSON Schema for OpenAI structured outputs (no zod dependency). Use `client.resolveURL()` for any input that is not already a UC-prefixed channel ID, then call `getChannel(browseId)` with the resolved ID.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bulk URL paste textarea + submit button | Browser/Client | — | UI concern; `'use client'`; mirrors `src/components/search-form.tsx` |
| Auth gate on POST | API/Backend | — | Server-only; uses `supabase.auth.getUser()` from SSR client |
| URL canonicalization (strip query, lowercase host, normalise to `https://youtube.com/@handle` or `/channel/UC...`) | API/Backend | — | Pure server logic; runs before InnerTube call |
| Channel ID resolution (handle / legacy URL → UC ID) | API/Backend | — | youtubei.js is server-only (no browser support recommended) |
| Last-10 video fetch + about/description fetch | API/Backend | — | InnerTube tier; layer rule keeps `src/lib/scraper/` Supabase-free |
| Game/genre extraction via gpt-4o-mini | API/Backend | — | Server-only — `OPENAI_API_KEY` is a secret |
| Median view calculation | API/Backend | — | Pure function; sits in pipeline layer |
| Upsert to `outreach_channels` (service role) | API/Backend | Database | Service role bypasses RLS; `createServiceClient()` from `src/lib/supabase/server.ts` |
| Inline summary panel rendering | Browser/Client | — | Renders the JSON response from the single round-trip |
| Form-side validation (cap 15, non-empty) | Browser/Client | API/Backend | Cheap client guard; server re-validates as defence-in-depth |

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Single `<textarea>` input, one URL per line. Server splits on newlines and trims each line.
- **D-02:** Liberal acceptance — anything InnerTube can resolve: full URLs (`https://youtube.com/@handle`, `https://youtube.com/channel/UC...`, legacy `/c/` and `/user/`), bare `@handles`, channel IDs, with or without protocol/tracking params.
- **D-03:** No pre-submit preview. Submit-and-go.
- **D-04:** Cap 15 channels per submission. Larger pastes rejected with inline error before any work starts.
- **D-05:** Submit-and-wait. Single JSON response `{succeeded, failed, partial}` returned at the end. **No SSE, no polling.**
- **D-06:** Inline summary panel below form. Shows succeeded/partial/failed counts with expandable failure list. Form clears on success.
- **D-07:** `genre` enum = `Cozy | Survival | Roguelike | RPG | Strategy | Simulation | Horror | Platformer | Action/Adventure | Variety | Other`.
- **D-08:** OpenAI `gpt-4o-mini`. Adds `OPENAI_API_KEY` env var.
- **D-09:** Delete `src/lib/pipeline/categorize.ts`; remove `PERPLEXITY_API_KEY` from CLAUDE.md and `.env.local` references.
- **D-10:** Single LLM call per channel. Strict JSON schema. Returns `{games: string[<=3], genre: <enum>}`.
- **D-11:** LLM failure → save row with InnerTube data only (`top_games`/`genre` null). Counted as `partial`. Other channels in batch unaffected.
- **D-12:** Always enrich whatever videos exist. Skip only if 0 videos (count as `failed` with reason `no_videos`).

### Claude's Discretion

- URL canonicalization: strip query strings, lowercase host, resolve `@handle` → canonical `https://youtube.com/@handle`. Use canonical URL for `url` column.
- Concurrency: sequential `for…await` within a batch. May upgrade to `Promise.allSettled` with concurrency 3 if timing becomes an issue.
- InnerTube transient failure handling: one retry with 500ms backoff; second failure → hard `failed`.
- Failure reason taxonomy: `not_found | no_videos | llm_failed | timeout | unknown_error`.
- File layout: API at `src/app/api/outreach/enrich/route.ts`; pipeline modules under `src/lib/outreach/`; form at `src/components/outreach/enrich-form.tsx`; minimal page at `src/app/dashboard/outreach/page.tsx`.
- LLM prompt: system anchors closed enum + 3-game-max constraint; user prompt embeds 10 titles as JSON array + about/description as separate field. `temperature: 0`.
- Loading-state styling: matches `<SearchForm>` (button text changes, button disabled, spinner glyph). No skeleton table.

### Deferred Ideas (OUT OF SCOPE)

- Re-enrich button on existing rows → Phase 4 (DASH-04).
- Job queue / background processing for >15 channels.
- SSE/streaming progress feedback.
- Cleanup of duplicated service-role client construction in `src/lib/pipeline/upsert.ts` and `src/app/api/cron/scrape/route.ts` — Phase 2 only adds new code; existing duplication stays as legacy.
- CLAUDE.md Phase 2 documentation update — flagged as a final commit task or follow-up docs commit (draft provided in §CLAUDE.md Update Snippet below).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENR-01 | User can paste one or more YouTube channel URLs (or handles) into a bulk input | §Form & UX, §Code Examples §1; mirrors `<SearchForm>` pattern |
| ENR-02 | Fetch last 10 videos (titles + view counts) via InnerTube | §youtubei.js: Fetching last N videos; §Code Examples §3 |
| ENR-03 | Fetch channel about/description via InnerTube | §youtubei.js: Fetching channel about/description; §Code Examples §4 |
| ENR-04 | GPT extracts top 3 games | §OpenAI gpt-4o-mini structured output; §Code Examples §5 |
| ENR-05 | GPT classifies primary genre (closed enum from D-07) | §OpenAI gpt-4o-mini structured output; §Code Examples §5 |
| ENR-06 | Median view calc from last 10 (or whatever exists per D-12) | §Median calculation; §Code Examples §6 |
| ENR-07 | Upsert into `outreach_channels` | §Standard Stack (createServiceClient); §Code Examples §7 |
| ENR-08 | User sees enrichment progress and a results summary | §Form & UX (D-05 single-response model overrides ROADMAP SC#3 — see §ROADMAP Conflict) |

## ROADMAP Conflict (flagged)

**ROADMAP §Phase 2 Success Criterion #3** says: *"The UI shows per-channel progress while enrichment is running and a results summary (channels processed, any errors) when it completes."*

**CONTEXT.md D-05** locks: *submit-and-wait, single JSON response on completion, no SSE, no polling.*

**Resolution per orchestrator instructions:** **CONTEXT.md wins.** The planner must satisfy ENR-08 with the inline summary panel only (D-06). The "spinner + button-disabled + 'Enriching N channels…' text" satisfies the spirit of "progress feedback" without per-channel mid-flight updates. The `<VERIFY>` gate in `/gsd-verify-work` should not flag the absence of per-channel progress against ROADMAP SC#3.

## Standard Stack

### Core (already installed — reuse)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.4 | App Router route handlers, RSC dashboard page | Project convention; CLAUDE.md mandates Next.js 16 |
| `youtubei.js` | ^17.0.1 (current: 17.0.1) | InnerTube channel/video fetch | Project standard; `getClient()` singleton already in `src/lib/scraper/innertube.ts` |
| `openai` | ^6.34.0 (current: 6.37.0) | gpt-4o-mini structured outputs | Already installed; `chat.completions.parse()` is the v6 native method |
| `@supabase/supabase-js` | ^2.104.0 | Service-role writes to `outreach_channels` | Already installed; reached via `createServiceClient()` |
| `@supabase/ssr` | ^0.10.2 | Auth gate (`supabase.auth.getUser()`) | Already installed; reached via `createClient()` from `src/lib/supabase/server.ts` |
| `react` | 19.2.4 | Client form component | Existing |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@base-ui/react` | ^1.4.1 | Form primitive (Input). No `Textarea` primitive exists yet. | For the enrich form, use a plain `<textarea>` with Tailwind classes copied from `Input` styling, or add a new `src/components/ui/textarea.tsx`. **Recommend:** plain `<textarea>` styled inline (lighter; matches the lean theme). |
| `lucide-react` | ^1.8.0 | Icons (spinner already inlined as SVG in `<SearchForm>`) | Reuse the inline SVG spinner pattern from `<SearchForm>` rather than introduce a new icon |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written JSON Schema for OpenAI | `zod` + `zodResponseFormat()` from `openai/helpers/zod` | Zod gives type-safe schema declaration but adds a new dependency (`zod@^4.4.3`) and a small runtime cost. **Recommend hand-written JSON Schema** — no new dep, total schema is ~12 lines. Verified: `openai/helpers/zod.d.ts` (line 1-5) imports `zod/v3` and `zod/v4`, so any v3 or v4 zod works if you choose this path. |
| Sequential channel processing | `Promise.allSettled` with concurrency limit (e.g., `p-limit(3)`) | Sequential is simpler, totally adequate for ≤15 channels at ~4s each (≤60s well inside the 300s default). Parallel introduces an unverified rate-limit risk on InnerTube. **Recommend sequential per CONTEXT.md.** |
| `getChannel(handle)` directly | `resolveURL("https://www.youtube.com/@handle")` then `getChannel(browseId)` | youtubei.js's `getChannel(id)` accepts only a UC-prefixed channel ID (verified in `Innertube.d.ts` line 38: `getChannel(id: string)`). Passing a handle fails. The two-step resolve-then-fetch is the only working path for non-UC inputs. |

**No new packages required for Phase 2.** The dev-deps `tsx@^4.21.0` and `dotenv@^17.4.2` were added in Phase 1 for the smoke-test script and remain unused for runtime — leave them alone.

**Installation:** None. Verified versions:

```bash
npm view openai version    # 6.37.0  [VERIFIED: npm registry, 2026-05-10]
npm view youtubei.js version  # 17.0.1   [VERIFIED: npm registry, 2026-05-10]
npm view zod version       # 4.4.3   [VERIFIED: npm registry, 2026-05-10] — only relevant if planner picks zod path
```

## Architecture Patterns

### System Architecture Diagram

```
Browser
  ┌─────────────────────────────────────────────────────────┐
  │  /dashboard/outreach (Server Component, auth-gated)     │
  │     ├─ <EnrichForm /> (Client Component)                │
  │     │     ├─ <textarea> (newline-separated URLs)        │
  │     │     ├─ Submit button (disabled while loading)     │
  │     │     └─ <SummaryPanel /> (renders on response)     │
  │     └─ (Phase 4 expands here later)                     │
  └────────────┬────────────────────────────────────────────┘
               │ POST { text: "<textarea raw value>" }  (single round-trip)
               ▼
  ┌─────────────────────────────────────────────────────────┐
  │  /api/outreach/enrich  (App Router Route Handler)       │
  │     export const maxDuration = 300                      │
  │     1. createClient() → supabase.auth.getUser() → 401?  │
  │     2. parse body, split lines, trim, dedupe, cap 15    │
  │     3. for each line (sequential await):                │
  │         ┌─────────────────────────────────────────────┐ │
  │         │  src/lib/outreach/canonicalize-url.ts       │ │
  │         │  (pure: → canonical URL or null)            │ │
  │         └────────────┬────────────────────────────────┘ │
  │                      ▼                                  │
  │         ┌─────────────────────────────────────────────┐ │
  │         │  src/lib/outreach/resolve-channel.ts        │ │
  │         │  uses getClient().resolveURL() if not UC    │ │
  │         │  returns { youtubeId, canonicalUrl } | null │ │
  │         └────────────┬────────────────────────────────┘ │
  │                      ▼                                  │
  │         ┌─────────────────────────────────────────────┐ │
  │         │  src/lib/outreach/fetch-channel-data.ts     │ │
  │         │  channel = await client.getChannel(id)      │ │
  │         │  about    = await channel.getAbout()        │ │
  │         │  videos   = (existing) getChannelRecentVideos│ │
  │         │              with limit=10                  │ │
  │         │  + retry-once with 500ms backoff            │ │
  │         │  returns { name, subscriberCount,           │ │
  │         │            description, videos[] }          │ │
  │         └────────────┬────────────────────────────────┘ │
  │                      ▼                                  │
  │         ┌─────────────────────────────────────────────┐ │
  │         │  src/lib/outreach/median.ts (pure)          │ │
  │         │  medianViews(videos.map(v=>v.viewCount))    │ │
  │         └────────────┬────────────────────────────────┘ │
  │                      ▼                                  │
  │         ┌─────────────────────────────────────────────┐ │
  │         │  src/lib/outreach/extract-games.ts          │ │
  │         │  one OpenAI gpt-4o-mini parse() call        │ │
  │         │  → { games: string[], genre: <enum> }       │ │
  │         │  on error: catch → return null (D-11 partial)│ │
  │         └────────────┬────────────────────────────────┘ │
  │                      ▼                                  │
  │         ┌─────────────────────────────────────────────┐ │
  │         │  src/lib/outreach/upsert-outreach.ts        │ │
  │         │  createServiceClient().from('outreach_channels')│
  │         │    .upsert({...}, {onConflict:'youtube_id'})│ │
  │         └────────────┬────────────────────────────────┘ │
  │                      ▼                                  │
  │     4. Accumulate into { succeeded, failed, partial }   │
  │     5. Return NextResponse.json(...)                    │
  └────────────┬────────────────────────────────────────────┘
               │
               ▼
  Supabase Postgres (outreach_channels table from Phase 1 migration 004)
```

### Recommended Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── outreach/
│   │       └── enrich/
│   │           └── route.ts           # POST handler, auth gate, orchestration
│   └── dashboard/
│       └── outreach/
│           └── page.tsx               # Minimal Server Component, auth-gated, hosts EnrichForm
├── components/
│   └── outreach/
│       └── enrich-form.tsx            # 'use client', textarea + submit + summary panel
└── lib/
    └── outreach/
        ├── canonicalize-url.ts        # Pure: normalise input string → canonical URL/handle/null
        ├── resolve-channel.ts         # InnerTube resolveURL → browseId (UC ID)
        ├── fetch-channel-data.ts      # InnerTube: getChannel + getAbout + last 10 videos
        ├── median.ts                  # Pure: median(numbers)
        ├── extract-games.ts           # OpenAI: lazy singleton + one parse() call
        └── upsert-outreach.ts         # Service-role upsert into outreach_channels
```

**Layer rule (from `.planning/codebase/ARCHITECTURE.md`):** scraper layer (`src/lib/scraper/`) imports only `youtubei.js`; pipeline layer (`src/lib/outreach/`) imports scraper and `openai`; upsert sub-module imports `createServiceClient`. **Do not** put Supabase imports inside `fetch-channel-data.ts` or `extract-games.ts`.

**Why a new top-level `src/lib/outreach/` instead of extending `src/lib/scraper/` and `src/lib/pipeline/`:** outreach is a new vertical bounded context with its own input contract, its own LLM call, its own DB target. Co-locating the modules under `src/lib/outreach/` makes the phase auditable as a unit and avoids spreading Phase 2 changes across three existing folders. Phase 3 (Channel Discovery) reuses `fetch-channel-data.ts` and `extract-games.ts` — both are already in the right place under this layout.

### Pattern 1: Module-level lazy singleton (OpenAI client)

**What:** A `let openai: OpenAI | null = null` at module scope, initialised on first call to `getOpenAI()`. Avoids constructing the client at import time (which fails fast in dev if `OPENAI_API_KEY` is missing — bad UX).
**When to use:** New `src/lib/outreach/extract-games.ts`. Mirrors the `getOpenAI()` pattern in the to-be-deleted `src/lib/pipeline/categorize.ts` (lines 26-34) but with no `baseURL` (default api.openai.com) and `apiKey: process.env.OPENAI_API_KEY!`.

```typescript
// Source: existing src/lib/pipeline/categorize.ts pattern (lines 26-34, to be deleted per D-09)
import OpenAI from 'openai';

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return openai;
}
```

### Pattern 2: Per-channel try/catch with continue (already in shorts.ts)

**What:** Wrap each iteration in `try`. On scraper/network error: `console.error('[outreach/enrich]', err)` + push to `failed` array + `continue`. Other channels finish.
**When to use:** Inside the `for` loop in the route handler. Mirrors `src/lib/scraper/shorts.ts` lines 26-32.

### Pattern 3: Top-level try/catch in route, return 500 on truly-uncaught

**What:** Wrap the orchestration body in `try { ... } catch (err) { return NextResponse.json({error: ...}, {status: 500}) }`. Per-channel errors are caught and turn into entries in `failed[]`/`partial[]`; only programmer errors (e.g., missing env var, throw inside response building) reach this outer catch.
**When to use:** Top of `route.ts`. Mirrors `src/app/api/scrape/route.ts` lines 26-55.

### Anti-Patterns to Avoid

- **Do NOT replicate `src/lib/pipeline/upsert.ts`'s `getServiceClient()` pattern.** That file is grandfathered legacy. Phase 1 §What Phase 2 Needs to Know (`01-01-SUMMARY.md` line 90) explicitly says to use `createServiceClient()` from `src/lib/supabase/server.ts`. This is a documented architectural anti-pattern (see `.planning/codebase/ARCHITECTURE.md` §Anti-Patterns line 209).
- **Do NOT instantiate a new `Innertube.create()`.** Use `getClient()` from `src/lib/scraper/innertube.ts`. The singleton matters — instantiating per-call burns ~1s of init time on every channel.
- **Do NOT call OpenAI in batches.** The to-be-deleted `categorize.ts` batched 20 video titles per call. D-10 locks one call **per channel** combining 10 titles + description. The whole 15-channel batch makes 15 OpenAI calls, not 1.
- **Do NOT add a write policy to RLS.** Phase 1 SUMMARY (line 95) explicitly forbids adding `for insert/update/delete` policies; service-role writes bypass RLS by design. If the upsert fails with RLS error, the code is using the anon client by mistake.
- **Do NOT pass `@handle` to `getChannel()`.** It will error. Always resolve via `resolveURL` first when input is not a UC ID.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Channel-handle → channel-ID | Custom URL regex + HTTP scraping | `client.resolveURL(fullUrl)` from youtubei.js | YouTube's resolve_url endpoint handles legacy `/c/`, `/user/`, vanity URLs, redirects, renames. Custom regex won't. |
| JSON-mode parsing of LLM output | `JSON.parse(content)` + manual validation | `client.chat.completions.parse({response_format: {type:'json_schema', json_schema:{...,strict:true}}})` returning `message.parsed` | Strict mode is enforced by OpenAI's grammar-constrained decoder; outputs are guaranteed schema-compliant. `JSON.parse` of a freeform response can fail on malformed JSON, schema drift, or extra prose. |
| Median calc | Custom sort + index | A 5-line pure function (see §Median calculation) | The 5-line function is fine — but it must be *one* well-tested function, not inlined in the route handler. |
| URL canonicalization | Hand-rolled string ops with edge-case explosion | A small ruleset with `URL` constructor + simple regex (see §URL canonicalization) | Built-in `URL` parser handles protocol/host normalisation; the only YouTube-specific work is path-shape detection. |
| Sequential async loop with retry | Custom retry middleware / async libraries (`p-retry`, etc.) | A single inline `try { ... } catch { await sleep(500); try { ... } catch { ... } }` | One retry, fixed 500ms backoff (per discretion item) is too small for a library. Inline keeps the code grep-friendly. |
| Form-side validation lib | `react-hook-form`, `formik`, `zod` form schemas | Two `useState` flags + one `if` check | The form has one field. Adding a form lib is overkill for the lean v1. |

**Key insight:** This phase is ~250 LOC of glue between three already-installed libraries. Resist the urge to add abstractions.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **None installed.** The project's only static checks are `npm run lint` (ESLint 9) and `npx tsc --noEmit`. |
| Config file | None for tests. `tsconfig.json` (strict mode), `eslint.config.mjs`. |
| Quick run command | `npx tsc --noEmit && npm run lint` |
| Full suite command | `npx tsc --noEmit && npm run lint && npm run build` (build catches Next.js Route Handler shape errors that `tsc` alone misses) |
| Smoke-test pattern from Phase 1 | `scripts/verify-outreach-channels.ts` — async-IIFE-wrapped one-shot script run with `npx tsx`. Useful template if planner wants a Phase-2 smoke test. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ENR-01 | Textarea accepts paste; client splits on newlines | manual-only | Browser test on dev server | n/a (no test infra) |
| ENR-02 | InnerTube returns last 10 videos with titles + viewCount | smoke-script | `npx tsx scripts/verify-outreach-enrich.ts` (NEW, optional) | ❌ Wave 0 (optional) |
| ENR-03 | InnerTube returns about/description string | smoke-script | same as above | ❌ Wave 0 (optional) |
| ENR-04 | gpt-4o-mini returns ≤3 games for sample channel | smoke-script | same as above (requires `OPENAI_API_KEY`) | ❌ Wave 0 (optional) |
| ENR-05 | gpt-4o-mini returns one of the 11 enum values | type-check | `npx tsc --noEmit` (compile-time enum check via `as const`) | ✅ via TypeScript |
| ENR-06 | Median is correct for 1, 5, 10 video sets | unit-pure | Inline-call from a smoke-script, or eyeball during implementation | ❌ no unit framework |
| ENR-07 | Upsert uses `youtube_id` conflict, sets `last_enriched_at` | smoke-script (Phase 1's `verify-outreach-channels.ts` already proved insert/upsert works for this table) | `npx tsx scripts/verify-outreach-channels.ts` (existing) | ✅ existing |
| ENR-08 | `{succeeded, failed, partial}` shape returned with correct counts | manual-only (browser) + type-check | `npx tsc --noEmit` | ✅ via TypeScript |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (~3s on this codebase) — fast, catches all type errors and prop shape mismatches
- **Per wave merge:** `npx tsc --noEmit && npm run lint` (~10s) — catches eslint rule violations
- **Phase gate:** `npx tsc --noEmit && npm run lint && npm run build` (~25s) — catches Next.js route-config errors (e.g., bad `maxDuration`, missing exports), then **manual smoke test** in dev: paste 3 valid URLs (handle, channel-ID URL, full handle URL) + 1 invalid URL + 1 empty channel → verify summary panel shows correct succeeded/failed/partial counts.

### Wave 0 Gaps

- [ ] **No test framework installed** — establishing one is OUT OF SCOPE for Phase 2 per the lean theme. The planner should rely on `tsc --noEmit`, `eslint`, and a manual browser smoke test.
- [ ] **(Optional)** `scripts/verify-outreach-enrich.ts` — a one-shot smoke script that hits InnerTube + OpenAI for one known channel and prints the enriched record. Useful if planner wants automated post-deploy verification. Pattern: copy `scripts/verify-outreach-channels.ts` async-IIFE wrapper. Not required.
- [ ] **No e2e framework** (Playwright not installed) — manual browser test stands in.

*(If no gaps were appropriate to call out: would be "None — existing tooling covers Phase 2 verification." But the optional smoke script is genuinely useful and worth flagging.)*

## Code Examples

### §1. Form component skeleton (mirror of `<SearchForm>`)

```typescript
// Source: pattern from src/components/search-form.tsx (verified)
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface EnrichResponse {
  succeeded: number;
  failed: Array<{ url: string; reason: string }>;
  partial: Array<{ url: string; reason: string }>;
}

export default function EnrichForm() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnrichResponse | null>(null);
  const [error, setError] = useState('');

  // Cheap client-side line count (defence-in-depth; server re-validates)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const tooMany = lines.length > 15;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0 || tooMany) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/outreach/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Enrich failed');
      else { setResult(data); setText(''); }
    } catch (err) {
      console.error('[enrich-form] fetch failed', err);
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste channel URLs, one per line"
        rows={6}
        disabled={loading}
        className="w-full rounded-lg border border-input bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading || lines.length === 0 || tooMany}>
          {loading ? `Enriching ${lines.length}…` : `Enrich ${lines.length || ''} channels`}
        </Button>
        {tooMany && <p className="text-red-400 text-sm">Maximum 15 channels per batch.</p>}
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {result && <SummaryPanel data={result} />}
    </form>
  );
}
```

### §2. Route handler skeleton (mirror of `/api/scrape`)

```typescript
// Source: pattern from src/app/api/scrape/route.ts (verified)
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
// ... imports for the five outreach modules ...

export const maxDuration = 300;  // [VERIFIED: vercel.com/docs/functions/configuring-functions/duration — Pro default 300s, max 800s; Hobby max 300s]

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text : '';
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const unique = Array.from(new Set(lines));   // dedupe identical pastes

  if (unique.length === 0) return NextResponse.json({ error: 'No URLs provided' }, { status: 400 });
  if (unique.length > 15) return NextResponse.json({ error: 'Maximum 15 channels per batch' }, { status: 400 });

  const succeeded: Array<{ url: string }> = [];
  const failed:    Array<{ url: string; reason: string }> = [];
  const partial:   Array<{ url: string; reason: string }> = [];

  for (const raw of unique) {
    try {
      const canonical = canonicalizeUrl(raw);                  // §8
      if (!canonical) { failed.push({ url: raw, reason: 'not_found' }); continue; }

      const resolved = await resolveChannel(canonical);        // §3
      if (!resolved) { failed.push({ url: raw, reason: 'not_found' }); continue; }

      const data = await fetchChannelData(resolved.youtubeId); // §4 (with retry-once)
      if (!data || data.videos.length === 0) {
        failed.push({ url: raw, reason: 'no_videos' });
        continue;
      }

      const median = medianViews(data.videos.map(v => v.viewCount));    // §6
      const extracted = await extractGamesGenre(data.videos, data.description).catch(() => null);  // §5; D-11

      await upsertOutreachChannel({
        youtubeId:       resolved.youtubeId,
        name:            data.name,
        url:             resolved.canonicalUrl,
        subscriberCount: data.subscriberCount,
        topGames:        extracted?.games ?? null,
        genre:           extracted?.genre ?? null,
        medianViews:     median,
        lastEnrichedAt:  new Date().toISOString(),
      });   // §7

      if (extracted) succeeded.push({ url: raw });
      else           partial.push({ url: raw, reason: 'llm_failed' });
    } catch (err) {
      console.error('[outreach/enrich]', raw, err);
      failed.push({ url: raw, reason: 'unknown_error' });
    }
  }

  return NextResponse.json({ succeeded: succeeded.length, failed, partial });
}
```

### §3. youtubei.js: URL/handle → channel ID

```typescript
// Source: youtubei.js Innertube.d.ts line 38, 66 (verified in node_modules)
//         and Innertube.js lines 358-362 (resolveURL implementation, verified in node_modules)
//         and GitHub issue #413 confirmation: client.resolveURL("https://www.youtube.com/@handle")
import { getClient } from '@/lib/scraper/innertube';

const UC_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

export async function resolveChannel(canonicalUrlOrId: string): Promise<{ youtubeId: string; canonicalUrl: string } | null> {
  const client = await getClient();

  // Fast path: already a UC channel ID
  if (UC_ID_RE.test(canonicalUrlOrId)) {
    return { youtubeId: canonicalUrlOrId, canonicalUrl: `https://youtube.com/channel/${canonicalUrlOrId}` };
  }

  // Need a full URL for resolveURL; canonicalize-url.ts guarantees this
  let endpoint;
  try {
    endpoint = await client.resolveURL(canonicalUrlOrId);
  } catch {
    return null;
  }

  // payload shape on success: { browseId: 'UC...', canonicalBaseUrl?: '/@handle' or '/channel/UC...' }
  // (verified by reading NavigationEndpoint.d.ts — payload: any — and confirming via youtubei.js
  //  internal usage that channel browse_endpoints carry browseId)
  const browseId: string | undefined = endpoint?.payload?.browseId;
  if (!browseId || !UC_ID_RE.test(browseId)) return null;

  const handle: string | undefined = endpoint?.payload?.canonicalBaseUrl;  // e.g. "/@handle"
  const canonicalUrl = handle && handle.startsWith('/@')
    ? `https://youtube.com${handle}`
    : `https://youtube.com/channel/${browseId}`;

  return { youtubeId: browseId, canonicalUrl };
}
```

**[VERIFIED: node_modules/youtubei.js/dist/src/Innertube.d.ts]** `Innertube.resolveURL(url: string): Promise<NavigationEndpoint>` exists at line 66.
**[VERIFIED: node_modules/youtubei.js/dist/src/Innertube.js lines 358-362]** Implementation calls `/navigation/resolve_url` and returns `response.endpoint`.
**[VERIFIED: github.com/LuanRT/YouTube.js/issues/413 — comment by ChunkyProgrammer]** Confirms `client.resolveURL("https://www.youtube.com/@handle")` is the canonical pattern for handle resolution.
**[ASSUMED]** The exact name `payload.canonicalBaseUrl` for the handle string. The d.ts declares `payload: any`. The planner should `console.log(endpoint.payload)` once during implementation and adjust if the field is named differently. **Defensive fallback** in the snippet: if `canonicalBaseUrl` is missing or doesn't start with `/@`, fall back to the `/channel/UC...` form. Code remains correct either way.

### §4. youtubei.js: Fetching last 10 videos + about/description

```typescript
// Source: youtubei.js Channel.d.ts lines 88-90 (verified): getAbout() returns ChannelAboutFullMetadata | AboutChannel
//         existing src/lib/scraper/videos.ts (verified) for the videos+subscriberCount fetch
import { getClient } from '@/lib/scraper/innertube';
import { getChannelRecentVideos, type VideoMeta } from '@/lib/scraper/videos';

export interface OutreachChannelData {
  name: string;
  subscriberCount: number;
  description: string;
  videos: VideoMeta[];
}

async function fetchChannelDataOnce(channelId: string): Promise<OutreachChannelData> {
  const client = await getClient();
  const channel = await client.getChannel(channelId);

  // Channel name from metadata.title (verified Channel.d.ts line 23)
  const name: string = channel.metadata.title ?? '';

  // About / description: getAbout() returns ChannelAboutFullMetadata (legacy header)
  // OR AboutChannel (PageHeader-style). Both expose description as a Text-like string.
  let description = '';
  try {
    const about = await channel.getAbout() as any;
    // ChannelAboutFullMetadata.description: Text (has .toString())
    // AboutChannel.metadata: AboutChannelView (has .description: string | undefined)
    description = about?.description?.toString?.() ?? about?.metadata?.description ?? '';
  } catch {
    description = channel.metadata.description ?? '';   // metadata fallback (verified Channel.d.ts line 23)
  }

  // Reuse existing helper but with limit=10 and DROP the 90-day filter for outreach.
  // The existing getChannelRecentVideos applies a NINETY_DAYS_MS cutoff (line 92);
  // that's wrong for outreach — the user wants the last 10 videos period.
  // Recommend EITHER (a) inline a thin variant in fetch-channel-data.ts, OR
  // (b) extend getChannelRecentVideos with an optional skipDateFilter flag.
  // Below: option (a) — quick adaptation:
  const channelObj = channel;
  const videoTab = await channelObj.getVideos();
  const videos: VideoMeta[] = [];
  for (const item of videoTab.videos) {
    if (videos.length >= 10) break;
    const v = item as any;
    const id: string = v.video_id ?? v.id ?? '';
    const title: string = v.title?.toString() ?? '';
    if (!id || !title) continue;
    const viewText: string = v.view_count?.text ?? v.short_view_count?.text ?? '0';
    const publishedText: string = v.published?.text ?? v.published?.toString() ?? '';
    videos.push({
      youtubeId: id,
      title,
      viewCount: parseViewCount(viewText),  // imported from src/lib/scraper/videos.ts
      publishedAt: parseRelativeDate(publishedText),
    });
  }

  // Subscriber count: reuse existing getChannelSubscriberCount from shorts.ts
  // OR copy the inline logic from getChannelRecentVideos (header parsing).
  const subscriberCount = await getChannelSubscriberCount(channelId);

  return { name, subscriberCount, description, videos };
}

// One retry with 500ms backoff (per CONTEXT.md Claude's-discretion)
export async function fetchChannelData(channelId: string): Promise<OutreachChannelData | null> {
  try {
    return await fetchChannelDataOnce(channelId);
  } catch (err) {
    console.error('[outreach/fetch] retry after 500ms', err);
    await new Promise(r => setTimeout(r, 500));
    try {
      return await fetchChannelDataOnce(channelId);
    } catch (err2) {
      console.error('[outreach/fetch] failed after retry', err2);
      return null;
    }
  }
}
```

**[VERIFIED: node_modules/youtubei.js/dist/src/parser/youtube/Channel.d.ts line 88-90]** `getAbout(): Promise<ChannelAboutFullMetadata | AboutChannel>`.
**[VERIFIED: node_modules/youtubei.js/dist/src/parser/classes/ChannelAboutFullMetadata.d.ts]** Has `description: Text` field (Text has `.toString()`).
**[VERIFIED: node_modules/youtubei.js/dist/src/parser/classes/AboutChannelView.d.ts]** Has `description?: string` field (the wrapping `AboutChannel` exposes it as `.metadata.description`).
**[ASSUMED]** Which of the two return types you'll actually receive depends on the channel's header style (`PageHeader` returns `AboutChannel`/`AboutChannelView`; legacy `C4TabbedHeader` returns `ChannelAboutFullMetadata`). The defensive `(about?.description?.toString?.() ?? about?.metadata?.description ?? '')` chain handles both without branching. Final fallback to `channel.metadata.description` (always populated for any channel) means description is **never undefined** — at worst empty string.
**[VERIFIED: existing src/lib/scraper/videos.ts]** `parseViewCount`, `parseRelativeDate`, and `parseSubscriberCount` exports reusable.
**[VERIFIED: existing src/lib/scraper/shorts.ts line 64]** `getChannelSubscriberCount(channelId)` is already implemented and exported. **Reuse it** rather than re-implementing.
**Note for planner:** the inline 10-video loop above DROPS the 90-day cutoff that `getChannelRecentVideos` applies. This is intentional — for outreach, "last 10 videos" means the literal 10 most recent regardless of date. The planner should not call `getChannelRecentVideos(id, 10)` directly; that path silently drops videos older than 90 days, which would give a small/inactive channel a 0-video result and trigger D-12's `no_videos` failure incorrectly. Either inline the loop in `fetch-channel-data.ts` (recommended; keeps `videos.ts` unchanged) or add an optional `{ ignoreDateCutoff: true }` parameter to `getChannelRecentVideos`.

### §5. OpenAI gpt-4o-mini structured output

```typescript
// Source: openai npm v6.34.0+ — chat.completions.parse() is GA, not .beta.
//         [VERIFIED: node_modules/openai/helpers/zod.d.ts line 18 — example shows client.chat.completions.parse(...)]
//         [VERIFIED: node_modules/openai/resources/chat/completions/completions.js line 90 — header marks the parse helper]
import OpenAI from 'openai';
import type { VideoMeta } from '@/lib/scraper/videos';

const GENRES = [
  'Cozy', 'Survival', 'Roguelike', 'RPG', 'Strategy', 'Simulation',
  'Horror', 'Platformer', 'Action/Adventure', 'Variety', 'Other',
] as const;
export type Genre = (typeof GENRES)[number];

export interface GameGenreResult {
  games: string[];   // 0..3 entries (constraint enforced in prompt; see §JSON-schema strict-mode caveats)
  genre: Genre;
}

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai;
}

// JSON Schema for strict mode. Constraints documented inline:
// - additionalProperties: false (REQUIRED for strict mode)
// - all properties listed in `required` (REQUIRED for strict mode)
// - games is an array of strings — NOTE: minItems/maxItems are NOT supported
//   in strict mode. We enforce ≤3 in the prompt only.
// - genre is enum, single value, exact match required by strict mode
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    games: { type: 'array', items: { type: 'string' } },
    genre: { type: 'string', enum: [...GENRES] },
  },
  required: ['games', 'genre'],
} as const;

export async function extractGamesGenre(
  videos: VideoMeta[],
  description: string,
): Promise<GameGenreResult> {
  const client = getOpenAI();
  const titles = videos.map(v => v.title);

  const completion = await client.chat.completions.parse({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          `You analyse a YouTube gaming channel's recent videos and About page.\n` +
          `Return the up-to-3 games most prominently covered (strings; pick at most 3, prefer fewer if uncertain) ` +
          `and the channel's primary genre — exactly one of: ${GENRES.join(', ')}. ` +
          `Use "Other" only when none of the listed genres fit. Use "Variety" for general gaming channels not focused on one genre.`,
      },
      {
        role: 'user',
        content: JSON.stringify({ recent_video_titles: titles, channel_about: description }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'channel_extraction', strict: true, schema: SCHEMA },
    },
  });

  const parsed = completion.choices[0]?.message?.parsed as GameGenreResult | null;
  if (!parsed) throw new Error('No parsed result from gpt-4o-mini');

  // Enforce ≤3 games defensively (strict mode can't enforce maxItems)
  return { games: parsed.games.slice(0, 3), genre: parsed.genre };
}
```

**[VERIFIED: node_modules/openai/helpers/zod.d.ts line 18]** Documentation example shows `client.chat.completions.parse(...)` as the canonical method.
**[VERIFIED: openai@6.37.0 npm registry]** `chat.completions.parse` is GA (no `.beta.` prefix needed).
**[CITED: platform.openai.com/docs/guides/structured-outputs]** Strict mode requires `additionalProperties: false` and all properties listed in `required`. **Confirmed unsupported in strict mode:** `minItems`, `maxItems`, `anyOf`, recursive schemas. Workaround: enforce in prompt + post-process.
**[VERIFIED: openai community forum thread "min- & maxItems are not supported in Structured Output"]** `maxItems: 3` would silently be ignored by the model. The `.slice(0, 3)` defensive guard is the recommended pattern.
**[VERIFIED]** `gpt-4o-mini` supports `response_format: {type: 'json_schema', strict: true}` — listed in OpenAI's structured-outputs guide as one of the supported model snapshots.

### §6. Median calculation

```typescript
// Pure function — works for arrays of length 1..N. Returns 0 for empty array.
// Note on BigInt: YouTube view counts are bigint in Postgres but fit in Number for any
// channel under ~9.0e15 views (which is far above any human-followable channel).
// Number arithmetic is fine here. The Postgres column is bigint and we coerce on insert.
export function medianViews(views: number[]): number {
  if (views.length === 0) return 0;
  const sorted = [...views].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  if (Number.isInteger(mid)) {
    // Even length: average the two middle values
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  // Odd length: middle index
  return sorted[Math.floor(mid)];
}
```

**[VERIFIED]** All current YouTube view counts (max ~10B for the most-viewed video ever) fit comfortably in JS Number's safe integer range (2^53 ≈ 9 × 10^15). `BigInt` is not necessary. The Postgres `bigint` column accepts a JS Number on insert via supabase-js — no coercion needed.

### §7. Upsert into `outreach_channels`

```typescript
// Source: Phase 1 §What Phase 2 Needs to Know (01-01-SUMMARY.md line 90):
//         "Use createServiceClient() from src/lib/supabase/server.ts for all writes"
//         migration 004 schema (verified) — youtube_id has unique constraint, top_games is text[]
import { createServiceClient } from '@/lib/supabase/server';

export interface OutreachUpsertRow {
  youtubeId: string;
  name: string;
  url: string;
  subscriberCount: number | null;
  topGames: string[] | null;
  genre: string | null;
  medianViews: number | null;
  lastEnrichedAt: string;   // ISO timestamp
}

export async function upsertOutreachChannel(row: OutreachUpsertRow): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb
    .from('outreach_channels')
    .upsert(
      {
        youtube_id:       row.youtubeId,
        name:             row.name,
        url:              row.url,
        subscriber_count: row.subscriberCount,
        top_games:        row.topGames,    // pass JS array → Postgres text[] (Phase 1 SUMMARY line 93)
        genre:            row.genre,
        median_views:     row.medianViews,
        last_enriched_at: row.lastEnrichedAt,
      },
      { onConflict: 'youtube_id' }
    );
  if (error) throw new Error(`upsertOutreachChannel: ${error.message}`);
}
```

**[VERIFIED: supabase/migrations/004_outreach_channels.sql]** Columns confirmed: `youtube_id text not null unique`, `top_games text[]`, `url text not null unique`. Note: **both** `youtube_id` AND `url` have unique constraints. The upsert specifies `onConflict: 'youtube_id'`. If the canonical URL ever differs between two paste forms of the same channel, `youtube_id` resolves the conflict and overwrites `url` to the new canonical form — that's the desired behaviour.

### §8. URL canonicalization

```typescript
// Pure function. Input: anything the user might paste. Output: a URL that resolveURL can handle,
// OR a UC channel ID directly (fast-path), OR null (if input is unintelligible).
//
// Decision rule:
// 1. Trim, strip leading/trailing whitespace
// 2. If matches /^UC[A-Za-z0-9_-]{22}$/  → return the UC ID directly (resolve-channel.ts fast-paths this)
// 3. If starts with '@' (bare handle) → wrap as 'https://youtube.com/@<handle>'
// 4. If parseable as URL with youtube.com or youtu.be host → strip query, lowercase host, normalise to https,
//    return the URL string
// 5. Otherwise → null
const UC_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_RE = /^@[A-Za-z0-9._-]{3,30}$/;

export function canonicalizeUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  if (UC_ID_RE.test(s)) return s;                              // bare UC ID — resolveChannel fast-paths
  if (HANDLE_RE.test(s)) return `https://youtube.com/${s}`;    // bare @handle

  // Try as URL (auto-prepend https:// if missing protocol)
  let url: URL;
  try {
    url = new URL(s.match(/^https?:\/\//) ? s : `https://${s}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'm.youtube.com') return null;

  // Strip query string and fragment
  // Keep path; resolveURL handles /@handle, /channel/UC..., /c/legacy, /user/legacy
  const pathname = url.pathname.replace(/\/+$/, '');           // strip trailing slash
  if (!pathname || pathname === '/') return null;              // youtube.com root is not a channel

  return `https://youtube.com${pathname}`;
}
```

**Why canonicalize before `resolveURL`:** stripping `?si=...` tracking params and lowercasing host means two pastes of the same channel from different sources hash to the same `outreach_channels.url`. Without this, the unique constraint fires twice with conflicting rows.

**Why fast-path UC IDs:** `resolveURL` requires a full URL. A bare UC ID would need wrapping anyway. Recognising it early lets `resolve-channel.ts` skip the round-trip entirely.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenAI `response_format: { type: 'json_object' }` (free-form JSON) | `response_format: { type: 'json_schema', strict: true, json_schema: {...} }` | Aug 2024 (Structured Outputs GA) | Schema-constrained decoding eliminates JSON parse errors and schema drift; replaces prompt-engineering enum-enforcement |
| `client.beta.chat.completions.parse(...)` | `client.chat.completions.parse(...)` (GA) | openai-node SDK v5+ | The to-be-deleted `categorize.ts` predates this and uses `chat.completions.create` with `json_object` — DO NOT copy that pattern |
| Vercel Pro `maxDuration` default 60s | 300s default, 800s max (with Fluid Compute, default) | 2025 platform update | A 15-channel batch at ~4s each (~60s) is well inside the new default; no `maxDuration` export strictly needed but recommend `export const maxDuration = 300` for explicit safety |
| `youtubei.js` legacy `getChannel(handle)` | Always `resolveURL(fullUrl)` first, then `getChannel(browseId)` | Permanent — `getChannel` only ever accepted UC IDs | Existing code in `src/lib/scraper/videos.ts` already passes a UC ID; no breakage |

**Deprecated/outdated in our codebase:**
- **`src/lib/pipeline/categorize.ts`** — uses Perplexity via OpenAI SDK with custom `baseURL`. Pattern is fine but model is wrong (sonar vs gpt-4o-mini), no structured outputs, batches multiple titles. **D-09 deletes this entire file.** Verified dead code: `grep` for imports across `src/` returns zero hits except for the file's own internal calls.

## Project Constraints (from CLAUDE.md)

- **Next.js version:** 16. Read `node_modules/next/dist/docs/` before writing any Next.js-specific code. Phase 2 only uses two stable Next.js 16 features: App Router Route Handler (`route.ts`) and Server Component (`page.tsx`) — both unchanged from Next 13+. The `export const maxDuration` pattern is unchanged in Next 16 (verified via Vercel docs; v16 only changed `dynamic`, `dynamicParams`, `revalidate`, `fetchCache` for Cache Components, none of which affect this phase).
- **Node not on PATH:** prefix shell commands with `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` in PowerShell, or use `npx.cmd`. Per `01-01-SUMMARY.md` Deviation #2, scripts use the async-IIFE wrapper (no top-level await) under `tsx`/CJS.
- **Service-role client:** use `createServiceClient()` from `src/lib/supabase/server.ts`. Do not import `createClient` from `@supabase/supabase-js` directly in new outreach code. (`src/lib/pipeline/upsert.ts` is grandfathered.)
- **InnerTube node casts to `any`:** youtubei.js internal node types are unreliable. New outreach scraper code must follow this — do not import unexported node types. The defensive `?.` chains in §3 and §4 are the canonical pattern.
- **Lowercase SQL keywords**, banner comment blocks above each table (Phase 1 patterns-established). Not relevant for Phase 2 — no new migrations.
- **No test framework convention:** project uses `npx tsc --noEmit` and `npm run lint` only.

## Common Pitfalls

### Pitfall 1: Passing `@handle` directly to `client.getChannel()`

**What goes wrong:** youtubei.js throws an unhelpful "Failed to fetch channel" error.
**Why it happens:** `getChannel(id)` is documented (Innertube.d.ts line 38) as accepting a channel ID — implementation only handles UC-prefixed IDs.
**How to avoid:** Always go through `resolveURL` for non-UC inputs (see §3 Code Example).
**Warning signs:** Errors thrown immediately on the first non-channel-ID input in the batch.

### Pitfall 2: Strict-mode JSON schema rejected by API

**What goes wrong:** OpenAI returns `400 Invalid schema for response_format`. Most common causes: `additionalProperties` not set to false; some field omitted from `required`; using `minItems`/`maxItems`; using `anyOf`.
**Why it happens:** Strict mode has a published-but-easy-to-miss subset of JSON Schema. `additionalProperties: false` is mandatory at every object level.
**How to avoid:** Match the schema in §5 exactly. If extending, use the OpenAI playground's JSON Schema validator first.
**Warning signs:** First call fails immediately; works in `json_object` mode but not `json_schema` strict.

### Pitfall 3: Two pastes of the same channel hit the URL unique constraint

**What goes wrong:** User pastes `@mkbhd` then `https://www.youtube.com/@MKBHD?si=tracker`. Without canonicalization, two `outreach_channels.url` values would conflict on the second insert. With `onConflict: 'youtube_id'` + canonicalization, both resolve to the same canonical URL — which means the second paste UPDATEs the first row (correct behaviour).
**Why it happens:** Migration 004 has `url text not null unique` AND `youtube_id text not null unique`. Two unique constraints. The upsert specifies `onConflict: 'youtube_id'` so the URL field is treated as a free-update field on conflict.
**How to avoid:** Canonicalise to one form per channel (the §8 function). Always specify `onConflict: 'youtube_id'`. Lowercase the handle component (some YouTube handles are case-different from the URL casing).
**Warning signs:** `duplicate key value violates unique constraint "outreach_channels_url_key"` error during upsert.

### Pitfall 4: Existing `getChannelRecentVideos` silently filters by 90 days

**What goes wrong:** A small/quiet channel with its last upload >90 days ago returns an empty videos array. Phase 2 then counts it as `no_videos` failure (D-12). User sees "no videos found" for a channel that has perfectly fine content — just none recent.
**Why it happens:** `src/lib/scraper/videos.ts` line 47 hard-codes `NINETY_DAYS_MS` and line 107 drops anything older.
**How to avoid:** Inline a thin variant in `fetch-channel-data.ts` that doesn't apply the date cutoff. See §4 example. Alternative: extend `getChannelRecentVideos` with an optional `{ skipDateFilter: boolean }` argument — but that touches the existing scraper which the lean theme discourages.
**Warning signs:** Quiet niche channels reported as `no_videos` when manually verified to have videos on YouTube.

### Pitfall 5: OpenAI call timing out and aborting the whole batch

**What goes wrong:** A single OpenAI hang stalls the for-loop; eventually the route hits `maxDuration` and the user gets a 504 with no partial results.
**Why it happens:** No per-request timeout on the OpenAI client by default. A network blip can hang for tens of seconds.
**How to avoid:** Wrap the OpenAI call in a `Promise.race` with a 15-20s timeout, and let the catch path push to `partial[]`. The `extract-games.ts` snippet in §5 throws on missing parsed result; the route handler's `.catch(() => null)` (§2) treats any throw as `partial`. Recommend adding an explicit timeout:

```typescript
const completion = await Promise.race([
  client.chat.completions.parse({ ... }),
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000)),
]) as Awaited<ReturnType<typeof client.chat.completions.parse>>;
```

**Warning signs:** Route returns 504 instead of a JSON summary.

### Pitfall 6: User can't tell `partial` from `failed` in the summary panel

**What goes wrong:** Summary shows "3 succeeded, 2 failed" but the user doesn't realise 1 of the "failed" was actually a partial save (row IS in DB, just missing games/genre).
**Why it happens:** Lean v1 might collapse partial+failed into one count.
**How to avoid:** Render three numbers (succeeded / partial / failed) with distinct colours, and put the partial-list reason as `'llm_failed (saved without games/genre)'` so the expandable detail makes the row state clear.
**Warning signs:** Phase 4 dashboard shows rows with null `top_games` that the user didn't realise were saved.

## CLAUDE.md Update Snippet (for the deferred docs commit)

Per CONTEXT.md `<deferred>`: not part of plan-phase deliverables, but the planner should include a final task that performs this edit so it's not forgotten.

**Section: env table (lines 24-31)**

Replace this row:
```markdown
| `PERPLEXITY_API_KEY` | Perplexity `sonar` model for niche categorization |
```

With:
```markdown
| `OPENAI_API_KEY` | OpenAI gpt-4o-mini for outreach game/genre extraction |
```

**Section: Architecture (after line 67, before `### Key library boundaries`)**

Add a new data-flow block:
```markdown
### Data flow — outreach enrichment

\`\`\`
POST /api/outreach/enrich {text}    # newline-separated URLs, max 15
  → canonicalizeUrl()                # strip query, normalise host, accept handle/UC/full URL
  → resolveChannel()                 # InnerTube resolveURL → browseId
  → fetchChannelData()               # InnerTube getChannel + getAbout + last 10 videos
  → medianViews()                    # pure: middle / avg-of-two-middle
  → extractGamesGenre()              # OpenAI gpt-4o-mini, structured output, single call
  → upsertOutreachChannel()          # service role, onConflict: youtube_id

Response: { succeeded: number, failed: [{url,reason}], partial: [{url,reason}] }
\`\`\`

The outreach pipeline DOES NOT use the legacy `categorize.ts` (deleted in Phase 2) and runs entirely from a user-triggered route — there is no cron equivalent in v1.
```

**Section: Key library boundaries (line 71-73)**

Strike the bullet that mentions `categorize.ts` and replace with:
```markdown
- **`src/lib/outreach/`** — Phase 2's bounded context. Imports `youtubei.js` (via `src/lib/scraper/innertube.ts`'s singleton), `openai`, and `createServiceClient()`. Owns the gpt-4o-mini extractor (`extract-games.ts`), URL canonicalization, channel resolution, and the upsert into `outreach_channels`.
```

## Sources

### Primary (HIGH confidence)

- **`node_modules/youtubei.js/dist/src/Innertube.d.ts`** — verified `getChannel(id: string): Promise<Channel>` (line 38), `resolveURL(url: string): Promise<NavigationEndpoint>` (line 66)
- **`node_modules/youtubei.js/dist/src/Innertube.js`** lines 358-362 — verified `resolveURL` calls `/navigation/resolve_url` and returns `response.endpoint`
- **`node_modules/youtubei.js/dist/src/parser/youtube/Channel.d.ts`** — verified `getAbout(): Promise<ChannelAboutFullMetadata | AboutChannel>` (line 88-90), `metadata.description` field (line 23)
- **`node_modules/youtubei.js/dist/src/parser/classes/ChannelAboutFullMetadata.d.ts`** — verified `description: Text` field
- **`node_modules/youtubei.js/dist/src/parser/classes/AboutChannelView.d.ts`** — verified `description?: string` field
- **`node_modules/openai/helpers/zod.d.ts`** — verified `chat.completions.parse(...)` is the canonical method (no `.beta.` prefix)
- **`node_modules/openai/package.json`** — verified installed version 6.34.0
- **[github.com/LuanRT/YouTube.js issues/413](https://github.com/LuanRT/YouTube.js/issues/413)** (via `gh issue view`) — confirmed `client.resolveURL("https://www.youtube.com/@handle")` is the canonical handle-resolution pattern
- **[Vercel docs: Configuring Maximum Duration for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/duration)** — verified Pro plan defaults: 300s default, 800s max (with Fluid Compute, default-on)
- **[Next.js docs: Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)** — verified `maxDuration` segment-config option works in Next.js 16.2.6 (current)
- **`supabase/migrations/004_outreach_channels.sql`** (in repo) — verified column names, types, and unique constraints
- **`.planning/phases/01-database-foundation/01-01-SUMMARY.md`** — verified service-role write pattern decisions for Phase 2
- **`src/lib/scraper/videos.ts`**, **`src/lib/scraper/shorts.ts`**, **`src/lib/scraper/innertube.ts`** (in repo) — verified existing scraper patterns and reusable helpers

### Secondary (MEDIUM confidence — verified against multiple sources)

- **[OpenAI Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs)** — strict-mode requirements (`additionalProperties: false`, all properties in `required`); model snapshot support for `gpt-4o-mini`. Confirmed via WebFetch and community thread cross-references.
- **[OpenAI community: "min- & maxItems are not supported in Structured Output"](https://community.openai.com/t/min-maxitems-are-not-supported-in-structured-output/958567)** — confirmed limitation; recommends prompt-side enforcement + post-processing
- **[Hooshmand: Using Zod and zodResponseFormat for Structured Outputs](https://hooshmand.net/zod-zodresponseformat-structured-outputs-openai/)** — confirms zod-based path is optional alternative to hand-written schema

### Tertiary (LOW confidence — flagged in inline `[ASSUMED]` tags)

- **`NavigationEndpoint.payload.canonicalBaseUrl` exact field name for handle URL** — declared as `payload: any` in d.ts; the snippet in §3 includes a defensive fallback. Test once during implementation; adjust if the field is named e.g. `canonicalBaseURL` or `vanityChannelUrl`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `NavigationEndpoint.payload.canonicalBaseUrl` carries the `/@handle` form on resolveURL responses | §Code Examples §3 | Low — defensive fallback to `/channel/UC...` form already in snippet. Final URL stored in DB is still well-formed; just not the prettier `/@handle` form. |
| A2 | Either `ChannelAboutFullMetadata` or `AboutChannel`'s description is non-empty for any active channel | §Code Examples §4 | Low — falls back to `channel.metadata.description` (always populated for any reachable channel; Channel.d.ts line 23). Worst case: empty string passed to LLM, which then leans more heavily on titles. Game/genre extraction still works. |
| A3 | Vercel deployment is on Pro plan (matches the existing CLAUDE.md cron-mention which assumes Pro-tier function durations) | §Standard Stack maxDuration choice | Low — `maxDuration = 300` works on Hobby (which caps at 300s) and Pro (default 300s). Only a problem if Hobby is in use AND batch hits the cap; mitigated by D-04's 15-channel limit. |
| A4 | All current YouTube view counts fit in JS Number (2^53 safe-int range) | §Code Examples §6 | Effectively zero — would require a single video with >9 quadrillion views. Use BigInt only if a future requirement demands it. |
| A5 | `gpt-4o-mini`'s strict JSON Schema decoder is reliable enough for production v1 | §Code Examples §5 | Low — if reliability is poor, fall back to `chat.completions.create` with `json_object` + manual `JSON.parse` + try/catch (the to-be-deleted `categorize.ts` pattern). The D-11 partial-save handler already absorbs this failure mode. |
| A6 | Project deployment timezone / runtime region is unchanged from Phase 1 | §none directly | Effectively zero — Vercel function regions are configured in `vercel.json` if needed; not relevant to enrichment correctness. |

## Open Questions

1. **Does `resolveURL` reliably handle legacy `/c/<vanity>` and `/user/<legacy>` URL formats?**
   - What we know: `resolveURL` calls YouTube's official `navigation/resolve_url` endpoint, which is the same endpoint the YouTube web app uses to navigate to a channel. YouTube itself supports legacy URLs.
   - What's unclear: Whether some legacy URLs that have been "deactivated" (channels migrated entirely to handles) still resolve, or whether they 404.
   - Recommendation: Accept these inputs in `canonicalize-url.ts`; if `resolveURL` throws or returns no `browseId`, push to `failed` with reason `not_found`. The user gets a clear failure for unresolvable legacy URLs and can re-paste with the modern handle.

2. **Should the form auto-redirect to Phase 4's outreach tab on success?**
   - What we know: D-06 says "no redirect — user stays on the Outreach page" and D-03 says submit-and-go.
   - What's unclear: Whether the Phase 2 minimal page IS the outreach page or a sub-route. The SUMMARY says `/dashboard/outreach/page.tsx` is "minimal in Phase 2" (the form only) — Phase 4 expands it to include the table.
   - Recommendation: Place the form at `/dashboard/outreach/page.tsx`. Phase 4 inserts the table alongside (e.g. form on top, table below, or split into tabs). No redirect needed — the form itself is on the eventual Outreach page.

3. **Is the user OK with cold-start latency on the first call?**
   - What we know: `Innertube.create()` runs once per process. On a Vercel cold start, this adds ~1-2s. The OpenAI client constructor is essentially free.
   - What's unclear: Whether the user notices and would consider this a UX regression vs the existing scraper (which has the same cold-start cost).
   - Recommendation: No action. The cold-start cost matches the existing manual scrape; no expectation difference for a power-user feature.

4. **Should the planner add a `/dashboard/outreach` tab to `dashboard-nav.tsx` in Phase 2 or wait for Phase 4?**
   - What we know: Phase 4 SC#1 says the Outreach tab appears in the existing dashboard nav. Phase 2's CONTEXT.md doesn't say.
   - What's unclear: Whether Phase 2 should add a tab now (so the user can navigate to the form) or whether the user accesses it directly via URL until Phase 4.
   - Recommendation: **Add the tab in Phase 2.** The form is unreachable from the existing dashboard nav otherwise. One line in `dashboard-nav.tsx`. Phase 4 then expands the page itself.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, dev server | ✓ | 20+ (per `@types/node@^20`) | — |
| `npm` | Package management | ✓ | bundled | — |
| `next` | Route handler / RSC | ✓ | 16.2.4 | — |
| `youtubei.js` | InnerTube fetch | ✓ | 17.0.1 | — |
| `openai` | LLM extraction | ✓ | 6.34.0 (current 6.37.0) | — |
| `@supabase/supabase-js` + `@supabase/ssr` | DB writes / auth | ✓ | 2.104.0 / 0.10.2 | — |
| `OPENAI_API_KEY` env var | LLM extraction | ✗ at config time (not in old `.env.local`; `PERPLEXITY_API_KEY` is being removed) | — | None — required for ENR-04/05. Planner must add a task to set this in `.env.local` AND Vercel env. |
| `SUPABASE_SERVICE_ROLE_KEY` env var | service-role upsert | ✓ (already required by Phase 1) | — | — |
| `outreach_channels` table | upsert target | ✓ (Phase 1 complete) | migration 004 applied | — |
| Test framework (vitest/jest/playwright) | test automation | ✗ | — | Use `tsc --noEmit`, `eslint`, manual browser smoke test (per Phase 1 precedent) |

**Missing dependencies with no fallback:**
- `OPENAI_API_KEY` — must be provisioned by user before first run. Planner should make this a Wave 0 / human-checkpoint task (parallel to Phase 1's "apply migration in Supabase Dashboard").

**Missing dependencies with fallback:**
- Test framework — fallback is `tsc --noEmit` + manual smoke. Acceptable per project convention.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, versions verified against npm registry on 2026-05-10
- Architecture (file layout, layer rules): HIGH — matches existing project conventions verified via direct file reads
- youtubei.js APIs (resolveURL, getAbout, getChannel): HIGH — verified directly from `node_modules/youtubei.js/dist/src/*.d.ts` source
- OpenAI structured outputs: HIGH — verified from `node_modules/openai/helpers/zod.d.ts` and OpenAI guide; one supporting community thread for unsupported features
- Vercel maxDuration limits: HIGH — verified via Vercel official docs (last_updated: 2026-02-27)
- Pitfalls: MEDIUM-HIGH — Pitfalls 1-4 verified by reading existing codebase; Pitfalls 5-6 are reasoned guidance based on documented platform behaviour
- URL canonicalization: MEDIUM — the rule is reasonable but legacy `/c/` / `/user/` resolution is not test-verified in this session (Open Question 1)

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (30 days for stable third-party APIs; if Phase 2 starts after this date, re-verify openai SDK version and Vercel duration limits, both of which moved within the last 18 months)
