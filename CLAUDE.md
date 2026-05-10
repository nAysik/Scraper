# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Next.js version

This project uses **Next.js 16** — APIs, conventions, and file structure may differ from older versions. Read `node_modules/next/dist/docs/` before writing any Next.js-specific code.

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build
npm run lint     # ESLint
npx tsc --noEmit # type-check (no test suite exists)
```

Node.js must be on PATH. On this machine it installs to `C:\Program Files\nodejs\` and is not auto-added to the shell PATH — prefix commands with `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` in PowerShell, or use `npx.cmd` directly.

## Environment

Copy `.env.local` and fill in all keys before running anything:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe in browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-only, bypasses RLS |
| `PERPLEXITY_API_KEY` | Perplexity `sonar` model for niche categorization |
| `CRON_SECRET` | Bearer token protecting cron endpoints |
| `PROXY_URL` | Optional residential proxy for InnerTube requests |

## Database

Apply `supabase/migrations/001_initial.sql` in the Supabase Dashboard SQL editor before first run. It creates three tables (`niches`, `channels`, `videos`), indexes, RLS policies, and seeds 8 default niches.

`outlier_score` is **not** a generated column — it is computed in application code (`views / subscriber_count`) and stored on insert/upsert. RLS allows authenticated users to read all tables; writes go through the service role client only.

## Architecture

### Data flow — regular videos

```
POST /api/scrape {keyword}
  → searchChannelsByKeyword()       # InnerTube channel search
  → getChannelRecentVideos()        # InnerTube videos tab, last 90 days
  → calcOutlierScore()              # views / subscribers, drop < 1x
  → categorizeInBatches()           # Perplexity `sonar` via OpenAI SDK (custom baseURL), batches of 20
  → upsertChannel() / upsertVideo() # Supabase service role

GET /api/cron/scrape (Bearer token)
  → getStaleChannels(50)            # ordered by last_scraped ASC NULLS FIRST
  → same video/score/upsert loop as above
```

### Data flow — Shorts

```
GET /api/cron/shorts (Bearer token)
  → scrapeViralShorts(SHORTS_KEYWORDS)    # InnerTube search, type:'shorts', last 7 days, ≥1M views
  → getChannelSubscriberCount()           # one call per unique channel
  → calcOutlierScore()
  → categorizeByKeywords()                # keyword-based, no LLM
  → upsertChannel() / upsertVideo()       # isShort: true
```

The Shorts pipeline skips the LLM categorizer entirely and uses `src/lib/pipeline/keyword-categorize.ts` (a `NICHE_KEYWORDS` map) to avoid rate limits and latency across hundreds of keywords.

### Key library boundaries

- **`src/lib/scraper/`** — InnerTube only. `innertube.ts` holds a module-level singleton client (re-created if `PROXY_URL` is set). `channels.ts` and `videos.ts` cast youtubei.js nodes to `any` because the library's internal node types are not reliably exported. `shorts.ts` follows the same pattern and also exports `getChannelSubscriberCount`.
- **`src/lib/pipeline/`** — pure business logic. `outlier.ts` is a one-liner. `categorize.ts` owns the niche taxonomy (`NICHE_NAMES` array) and the OpenAI prompt for regular videos. `keyword-categorize.ts` owns `NICHE_KEYWORDS` for Shorts. `upsert.ts` owns all Supabase writes and calls `@supabase/supabase-js` directly to avoid import cycles with the SSR client.
- **`src/lib/supabase/server.ts`** — SSR client (cookie-based session) for Server Components and Route Handlers that need the logged-in user. Also exports `createServiceClient()` but `upsert.ts` bypasses it.

### Auth

`src/middleware.ts` guards `/dashboard/*` — unauthenticated requests redirect to `/login`. Session is refreshed on every request via `@supabase/ssr`. Auth pages live in `src/app/(auth)/` (route group, no shared layout). Email-confirm callback is at `src/app/auth/callback/route.ts`.

### Dashboard

`src/app/dashboard/page.tsx` is a Server Component that fetches up to 500 videos ordered by `outlier_score desc` and passes them to the `<VideosTable>` client component. All filtering (min score, max subscribers, niche) happens client-side in TanStack Table via `useMemo` — no additional API calls. The `<SearchForm>` component triggers `POST /api/scrape` and shows a result summary; it does **not** auto-refresh the table (reload the page after scraping).

### Automation

`vercel.json` schedules `/api/cron/scrape` hourly (`0 * * * *`) and `/api/cron/shorts` daily at 00:00 UTC (`0 0 * * *`) when deployed on Vercel. `.github/workflows/cron-scrape.yml` is an alternative for non-Vercel deployments — set `APP_URL` and `CRON_SECRET` as GitHub Actions secrets.

## Balancing knobs

- Regular video niche taxonomy: `NICHE_NAMES` in `src/lib/pipeline/categorize.ts` (also update the Supabase `niches` seed data)
- Shorts niche taxonomy: `NICHE_KEYWORDS` in `src/lib/pipeline/keyword-categorize.ts`
- Shorts keyword sweep: `SHORTS_KEYWORDS` array in `src/app/api/cron/shorts/route.ts`
- Outlier score threshold: `score < 1` check in both API route handlers
- Video recency window: `NINETY_DAYS_MS` in `src/lib/scraper/videos.ts`
- Shorts recency window: `SEVEN_DAYS_MS` in `src/lib/scraper/shorts.ts`
- Shorts minimum view threshold: `minViews` arg to `scrapeViralShorts` (default 1,000,000)
- Channels per keyword scrape: `limit` arg to `searchChannelsByKeyword` (default 10)
- Cron batch size: `getStaleChannels(50)` in `src/app/api/cron/scrape/route.ts`
