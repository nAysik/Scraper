# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build (also runs type generation)
npm run lint     # ESLint
npx tsc --noEmit # type-check without emitting (no test suite exists)
```

Node.js must be on PATH. On this machine it installs to `C:\Program Files\nodejs\` and is not auto-added to the shell PATH — prefix commands with `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` in PowerShell, or use `npx.cmd` directly.

## Environment

Copy `.env.local` and fill in all five keys before running anything:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe in browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-only, bypasses RLS |
| `PERPLEXITY_API_KEY` | Perplexity `sonar` model for niche categorization |
| `CRON_SECRET` | Bearer token protecting `GET /api/cron/scrape` |
| `PROXY_URL` | Optional residential proxy for InnerTube requests |

## Database

Apply `supabase/migrations/001_initial.sql` in the Supabase Dashboard SQL editor before first run. It creates three tables (`niches`, `channels`, `videos`), indexes, RLS policies, and seeds 8 default niches.

`outlier_score` is **not** a generated column — it is computed in application code (`views / subscriber_count`) and stored on insert/upsert. RLS allows authenticated users to read all tables; writes go through the service role client only.

## Architecture

### Data flow

```
POST /api/scrape {keyword}
  → searchChannelsByKeyword()   # InnerTube channel search
  → getChannelRecentVideos()    # InnerTube videos tab, last 90 days
  → calcOutlierScore()          # views / subscribers, drop < 1x
  → categorizeInBatches()       # GPT-4o-mini, batches of 20
  → upsertChannel() / upsertVideo()   # Supabase service role

GET /api/cron/scrape (Bearer token)
  → getStaleChannels(50)        # ordered by last_scraped ASC NULLS FIRST
  → same video/score/upsert loop as above
```

### Key library boundaries

- **`src/lib/scraper/`** — InnerTube only. `innertube.ts` holds a module-level singleton client (re-created if `PROXY_URL` is set). `channels.ts` and `videos.ts` cast youtubei.js nodes to `any` because the library's internal node types are not reliably exported.
- **`src/lib/pipeline/`** — pure business logic. `outlier.ts` is a one-liner. `categorize.ts` owns the niche taxonomy (`NICHE_NAMES` const array) and the OpenAI prompt. `upsert.ts` owns all Supabase writes and uses the service role client directly (not the SSR cookie client).
- **`src/lib/supabase/server.ts`** — SSR client (cookie-based session) for Server Components and Route Handlers that need the logged-in user. Also exports `createServiceClient()` but `upsert.ts` calls `@supabase/supabase-js` directly to avoid the import cycle.

### Auth

`src/middleware.ts` guards `/dashboard/*` — any unauthenticated request redirects to `/login`. The session is refreshed on every request via `@supabase/ssr`. Auth pages live in `src/app/(auth)/` (route group, no shared layout). Email-confirm callback is at `src/app/auth/callback/route.ts`.

### Dashboard

`src/app/dashboard/page.tsx` is a Server Component that fetches up to 500 videos ordered by `outlier_score desc` and passes them to the `<VideosTable>` client component. All filtering (min score, max subscribers, niche) happens client-side in TanStack Table via `useMemo` — no additional API calls. The `<SearchForm>` component triggers `POST /api/scrape` and shows a result summary; it does **not** auto-refresh the table (reload the page after scraping).

### Automation

`vercel.json` runs `GET /api/cron/scrape` hourly when deployed on Vercel. `.github/workflows/cron-scrape.yml` is an alternative for non-Vercel deployments — set `APP_URL` and `CRON_SECRET` as GitHub Actions secrets.

## Balancing knobs

- Niche taxonomy: `NICHE_NAMES` array in `src/lib/pipeline/categorize.ts` (also update the Supabase `niches` seed data)
- Outlier score threshold for scrape inclusion: `score < 1` check in both API route handlers
- Video recency window: `NINETY_DAYS_MS` in `src/lib/scraper/videos.ts`
- Channels per keyword scrape: `limit` arg to `searchChannelsByKeyword` (default 10)
- Cron batch size: `getStaleChannels(50)` in `src/app/api/cron/scrape/route.ts`
