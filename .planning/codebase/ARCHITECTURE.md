# Architecture

<!-- refreshed: 2026-05-08 -->
**Analysis Date:** 2026-05-08

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────┐
│                         Browser / Client                              │
│  Dashboard pages (React Server Components + client islands)           │
│  src/app/dashboard/page.tsx  charts/page.tsx  niches/page.tsx         │
│  src/components/videos-table.tsx  search-form.tsx  (Client Components)│
└──────────────────────────┬────────────────────────────────────────────┘
                           │ HTTP  (fetch / form POST)
┌──────────────────────────▼────────────────────────────────────────────┐
│                      Next.js App Router (Vercel Edge/Node)            │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────────┐   │
│  │ POST /api/scrape│  │GET /api/cron/   │  │ Auth routes           │   │
│  │ (user-triggered)│  │scrape  shorts   │  │ /auth/callback        │   │
│  │ route.ts        │  │ (Vercel cron)   │  │ /api/auth/signout     │   │
│  └───────┬────────┘  └────────┬────────┘  └──────────────────────┘   │
│          │                    │                                        │
│  ┌───────▼────────────────────▼──────────────────────────────────┐   │
│  │                   src/lib/pipeline/                            │   │
│  │  outlier.ts  upsert.ts  categorize.ts  keyword-categorize.ts  │   │
│  └───────┬──────────────────────────────┬────────────────────────┘   │
│          │                              │                              │
│  ┌───────▼───────────────┐   ┌──────────▼─────────────────────────┐  │
│  │  src/lib/scraper/     │   │  src/lib/supabase/                 │  │
│  │  innertube.ts         │   │  client.ts  server.ts              │  │
│  │  channels.ts          │   └──────────┬─────────────────────────┘  │
│  │  videos.ts  shorts.ts │              │                             │
│  │  proxy.ts             │              │                             │
│  └───────────────────────┘              │                             │
└─────────────────────────────────────────┼─────────────────────────────┘
                                          │
             ┌────────────────────────────▼──────────────────┐
             │              Supabase (hosted Postgres)        │
             │  niches · channels · videos · video_snapshots  │
             └────────────────────────────────────────────────┘
                                          ↕
             ┌────────────────────────────────────────────────┐
             │  YouTube InnerTube (youtubei.js, no API key)   │
             │  Perplexity AI (openai SDK, unused in prod)     │
             └────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File(s) |
|-----------|----------------|---------|
| InnerTube client | Singleton youtubei.js instance; optional proxy injection | `src/lib/scraper/innertube.ts` |
| Channel scraper | Search channels by keyword; parse subscriber counts | `src/lib/scraper/channels.ts` |
| Video scraper | Fetch channel's recent videos (90-day window, limit 30); parse view counts and relative dates | `src/lib/scraper/videos.ts` |
| Shorts scraper | Sweep 100+ hardcoded keywords for Shorts with ≥1M views in last 7 days; deduplicate across keywords | `src/lib/scraper/shorts.ts` |
| Proxy | Wrap fetch to route through `PROXY_URL` if set | `src/lib/scraper/proxy.ts` |
| Outlier score | Pure function: `views / subscriber_count` | `src/lib/pipeline/outlier.ts` |
| Upsert layer | All Supabase writes; insert-then-update strategy for videos to protect `is_short` flag | `src/lib/pipeline/upsert.ts` |
| Keyword categorizer | Local keyword-matching fallback; no network call | `src/lib/pipeline/keyword-categorize.ts` |
| AI categorizer | Perplexity `sonar` model via OpenAI SDK; batches of 20 | `src/lib/pipeline/categorize.ts` |
| Supabase browser client | `createBrowserClient()` for client components | `src/lib/supabase/client.ts` |
| Supabase server client | `createServerClient()` with cookie bridge for RSC/Route Handlers | `src/lib/supabase/server.ts` |
| Middleware | Auth gate for `/dashboard/*`; refreshes session cookies | `src/middleware.ts` |
| Manual scrape API | User-triggered pipeline: keyword → channels → videos | `src/app/api/scrape/route.ts` |
| Channel cron | Hourly: refresh stale channels (LRU order by `last_scraped`) | `src/app/api/cron/scrape/route.ts` |
| Shorts cron | Daily: keyword sweep → viral Shorts → upsert | `src/app/api/cron/shorts/route.ts` |
| Dashboard home | RSC; renders top-500 regular videos sorted by outlier score | `src/app/dashboard/page.tsx` |
| Viral charts | RSC; renders top-500 Shorts sorted by view count | `src/app/dashboard/charts/page.tsx` |
| Niche insights | RSC; loads 1000 videos and aggregates per-niche stats client-side | `src/app/dashboard/niches/page.tsx` |
| Channel detail | RSC; shows all videos for a single channel with stats bar | `src/app/dashboard/channel/[youtubeId]/page.tsx` |
| VideosTable | Client Component; TanStack Table with client-side sort/filter | `src/components/videos-table.tsx` |

## Pattern Overview

**Overall:** Layered pipeline — thin scraper → pure business logic → Supabase write layer → Next.js RSC data-fetch layer → client table

**Key Characteristics:**
- Three distinct Supabase client flavors (browser, server with cookies, service role) used in different contexts; the service role client is duplicated in two places
- No shared state between requests; cron routes are stateless serverless functions
- All filtering and sorting for the main table happens client-side in the browser after a full page load (up to 500 rows fetched at once)
- No React Query, SWR, or other data-fetching library — RSC pages call Supabase directly via `async` Server Components
- AI categorization (`categorize.ts`) exists in the codebase but is not wired into any route; all active categorization uses local keyword matching

## Layers

**Scraper Layer:**
- Purpose: Speak InnerTube; return typed plain objects; no Supabase knowledge
- Location: `src/lib/scraper/`
- Contains: `innertube.ts`, `channels.ts`, `videos.ts`, `shorts.ts`, `proxy.ts`
- Depends on: `youtubei.js` only
- Used by: API routes and cron routes

**Pipeline Layer:**
- Purpose: Pure business logic — compute scores, categorize, write to DB
- Location: `src/lib/pipeline/`
- Contains: `outlier.ts`, `upsert.ts`, `categorize.ts`, `keyword-categorize.ts`
- Depends on: `@supabase/supabase-js` (upsert only), `openai` (categorize only)
- Used by: API routes and cron routes

**Supabase Client Layer:**
- Purpose: Create correctly-scoped Supabase clients; no query logic here
- Location: `src/lib/supabase/`
- Contains: `client.ts` (browser), `server.ts` (SSR + service role)
- Depends on: `@supabase/ssr`, `@supabase/supabase-js`
- Used by: Dashboard RSC pages, auth route handlers, middleware

**API / Route Handler Layer:**
- Purpose: HTTP boundary; auth check → orchestrate scraper + pipeline calls
- Location: `src/app/api/`
- Contains: `scrape/route.ts`, `cron/scrape/route.ts`, `cron/shorts/route.ts`, `auth/signout/route.ts`, `auth/callback/route.ts` (in `src/app/auth/`)
- Depends on: scraper layer, pipeline layer, supabase client layer

**UI Layer:**
- Purpose: Data display and user interaction; Server Components fetch, Client Components render interactively
- Location: `src/app/dashboard/`, `src/components/`
- Contains: Page RSCs (dashboard, charts, niches, channel detail), shared components
- Depends on: supabase client layer only (pages); no direct pipeline/scraper access

## Data Flow

### Manual Scrape (User-Triggered)

1. User submits keyword in `SearchForm` (`src/components/search-form.tsx`) → `POST /api/scrape`
2. Route handler (`src/app/api/scrape/route.ts`) checks `supabase.auth.getUser()` — 401 if unauthenticated
3. `searchChannelsByKeyword(keyword, 10)` via InnerTube → up to 10 `ChannelMeta` objects
4. For each channel: `getChannelRecentVideos(channelId, 30)` → `{ subscriberCount, videos[] }` (90-day window)
5. For each video: `calcOutlierScore(views, subs)`, `categorizeByKeywords(title)` → `nicheId`
6. `upsertChannel()` then `upsertVideo()` write to Supabase using service role key
7. Response: `{ channelsScraped, videosUpserted }`

### Channel Cron (Hourly Refresh)

1. Vercel calls `GET /api/cron/scrape` with `Authorization: Bearer <CRON_SECRET>`
2. `getStaleChannels(50)` — returns up to 50 channels ordered by `last_scraped ASC NULLS FIRST`
3. For each channel: `getChannelRecentVideos()` → videos → `upsertVideo()` + `upsertSnapshot()`
4. `channels.update({ last_scraped })` after processing each channel
5. Categorization: `categorizeByKeywords(title)` (local, no network call)

### Shorts Cron (Daily Sweep)

1. Vercel calls `GET /api/cron/shorts` with `Authorization: Bearer <CRON_SECRET>`
2. `scrapeViralShorts(SHORTS_KEYWORDS)` — searches ~100 hardcoded keywords; deduplicates by `youtubeId`; filters `viewCount >= 1_000_000` and `publishedAt >= 7 days ago`
3. Unique channels are extracted; `getChannelSubscriberCount()` called once per channel (not per Short)
4. `upsertChannel()` called for each unique channel (channels upserted before videos due to FK)
5. `upsertVideo(..., isShort: true)` for each Short; `outlierScore` computed inline
6. Note: `is_short` flag is set on INSERT only; subsequent updates preserve the original value to avoid the channel cron overwriting Shorts discovered here

### Dashboard Page Load

1. Browser hits `/dashboard` (or `/dashboard/charts`, `/dashboard/niches`)
2. Next.js middleware (`src/middleware.ts`) verifies session; redirects to `/login` if missing
3. RSC calls Supabase with anon key + session cookie → Postgres query with join: `videos → channels → niches`
4. Data mapped to `VideoRow[]` in the RSC; passed as props to `<VideosTable>` (Client Component)
5. Client-side filtering and sorting via TanStack Table (no further network calls)

**State Management:**
- No global client state; TanStack Table state (`sorting`, `minScore`, `maxSubs`, `selectedNiche`, `titleSearch`) is local `useState` inside `VideosTable`

## Key Abstractions

**`VideoRow`:**
- Purpose: Flat DTO used across all UI — joins channel and niche data onto each video
- Definition: `src/components/videos-table.tsx` (exported interface)
- Fields: `id`, `youtubeId`, `channelYoutubeId`, `title`, `channelName`, `subscriberCount`, `viewCount`, `outlierScore`, `niche`, `publishedAt`, `isShort`
- All dashboard pages map raw Supabase rows to this shape before rendering

**`ChannelMeta` / `VideoMeta` / `ShortMeta`:**
- Purpose: Scraper output types; never reach the DB directly — they pass through the pipeline layer
- Definitions: `src/lib/scraper/channels.ts`, `src/lib/scraper/videos.ts`, `src/lib/scraper/shorts.ts`

**`NicheName` enum (const):**
- 8 fixed values: `'Faceless Finance' | 'Tech Reviews' | 'AI Tools' | 'Productivity' | 'Health & Fitness' | 'Gaming Clips' | 'Education' | 'Other'`
- Defined in: `src/lib/pipeline/categorize.ts`
- Mirrored in: `src/lib/pipeline/keyword-categorize.ts` (keys of `NICHE_KEYWORDS`)
- Seeded in DB: `supabase/migrations/001_initial.sql`

## Entry Points

**`src/middleware.ts`:**
- Runs on every non-static request
- Triggers: all routes except `_next/static`, `_next/image`, `favicon.ico`, image files
- Responsibilities: refresh Supabase session cookies; redirect unauthenticated users away from `/dashboard/*`

**`src/app/layout.tsx`:**
- Root layout; wraps all pages

**`src/app/dashboard/layout.tsx`:**
- Dashboard shell: top header with sign-out button, `<DashboardNav>` tabs, `<main>` container

**`src/app/api/scrape/route.ts`:**
- Manual scrape trigger; requires authenticated session

**`src/app/api/cron/scrape/route.ts` + `src/app/api/cron/shorts/route.ts`:**
- Automated pipelines; require `CRON_SECRET` bearer token

## Architectural Constraints

- **InnerTube singleton:** `src/lib/scraper/innertube.ts` holds a module-level `let client` — shared across requests within a single serverless function instance. In a cold start, the client is re-created. This is acceptable in stateless Vercel functions but means the client is not re-created when `PROXY_URL` changes without a redeploy.
- **Service role duplication:** The service role Supabase client is constructed in two independent places: `src/lib/pipeline/upsert.ts` (`getServiceClient`) and `src/lib/supabase/server.ts` (`createServiceClient`). These are not connected; cron routes and `upsert.ts` construct their own clients directly.
- **Client-side aggregation:** `src/app/dashboard/niches/page.tsx` fetches 1000 videos from Supabase and groups them by niche in the RSC JavaScript, not in SQL. This becomes expensive as the video count grows.
- **No pagination:** Dashboard pages hard-limit queries to 500 (videos/shorts) or 1000 (niches) rows. All filtering and sorting happens in the browser on this full set.
- **Relative date parsing:** `parseRelativeDate()` in `src/lib/scraper/videos.ts` converts YouTube's human-readable strings (e.g. "3 days ago") to `Date` objects using fixed multipliers (month = 30 days, year = 365 days). Accuracy degrades for older videos.
- **Threading:** Single-threaded Node.js event loop; cron routes process channels/shorts sequentially in `for` loops with `await` — no parallelism within a single cron invocation.
- **Global state:** Module-level InnerTube singleton in `src/lib/scraper/innertube.ts`; module-level OpenAI singleton in `src/lib/pipeline/categorize.ts`.

## Anti-Patterns

### Duplicated service role client construction

**What happens:** Both `src/lib/pipeline/upsert.ts` and `src/lib/supabase/server.ts` define their own `getServiceClient()`/`createServiceClient()` functions with identical logic. `src/app/api/cron/scrape/route.ts` also constructs a third inline service client via `createClient` imported directly from `@supabase/supabase-js`.

**Why it's wrong:** Three separate code paths means env var reads and client instantiation logic can diverge. Adding connection options (timeout, retry) requires changes in three places.

**Do this instead:** Centralise in `src/lib/supabase/server.ts`'s `createServiceClient()` and import it everywhere. Remove the internal `getServiceClient()` from `upsert.ts` and the inline construction in `cron/scrape/route.ts`.

### AI categorizer exists but is never called

**What happens:** `src/lib/pipeline/categorize.ts` implements `categorizeInBatches()` with the Perplexity model, but all three route handlers (`/api/scrape`, `/api/cron/scrape`, `/api/cron/shorts`) call the local `categorizeByKeywords()` instead.

**Why it's wrong:** `PERPLEXITY_API_KEY` is required in the environment but provides no value; the code creates a false impression that AI categorization is active.

**Do this instead:** Either wire `categorizeInBatches` into the pipeline (replacing keyword matching) or delete `categorize.ts` and remove the env var requirement.

## Error Handling

**Strategy:** Throw on unrecoverable errors; catch at the Route Handler boundary and return JSON with appropriate HTTP status.

**Patterns:**
- Scraper functions throw bare `Error` objects on Supabase `.error` responses (e.g., `throw new Error(\`upsertChannel: \${error.message}\`)`)
- Cron routes wrap the full pipeline in `try/catch`; return `{ error: message }` with status 500
- Shorts cron wraps each individual keyword search in a nested `try/catch` so a failed keyword does not abort the full sweep — the error is logged and the loop `continue`s
- Auth errors surface to the user as inline form error messages (login/register pages)
- Missing `CRON_SECRET` causes an immediate 403 response; cron routes check this before any scraping work

## Cross-Cutting Concerns

**Logging:** `console.error()` only; no structured logger or log levels. Prefixed with route name: `[cron/scrape]`, `[cron/shorts]`, `[shorts]`, `[search-form]`.

**Validation:** Minimal — only `keyword` presence is validated in `/api/scrape`. InnerTube responses are accessed with `as any` casts and optional chaining (`?.`) throughout the scraper layer.

**Authentication:**
- User-facing pages: middleware redirect + RSC `supabase.auth.getUser()` double-check with explicit `redirect('/login')`
- Cron endpoints: shared secret via `Authorization: Bearer` header; checked before any work begins

---

*Architecture analysis: 2026-05-08*
