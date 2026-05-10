# External Integrations

**Analysis Date:** 2026-05-08

## APIs & External Services

**YouTube (InnerTube):**
- Service: YouTube InnerTube API (unofficial, reverse-engineered)
- SDK/Client: `youtubei.js ^17.0.1`
- Auth: None — InnerTube does not require an API key
- Singleton client: `src/lib/scraper/innertube.ts` — module-level `let client: Innertube | null` initialized once per process
- Proxy: When `PROXY_URL` env var is set, a custom fetch wrapper in `src/lib/scraper/proxy.ts` prepends the proxy URL as a query parameter (`?url=<target>`)
- Operations used:
  - `client.search(keyword, { type: 'channel' })` — find channels by keyword (`src/lib/scraper/channels.ts`)
  - `client.getChannel(channelId)` — fetch channel header (subscriber count) and videos tab (`src/lib/scraper/videos.ts`, `src/lib/scraper/shorts.ts`)
  - `client.search(keyword, { type: 'shorts', upload_date: 'week' })` — find recent Shorts (`src/lib/scraper/shorts.ts`)

**Perplexity AI (via OpenAI SDK):**
- Service: Perplexity AI API (`https://api.perplexity.ai`)
- SDK/Client: `openai ^6.34.0` — pointed at the Perplexity base URL with `baseURL: 'https://api.perplexity.ai'`
- Auth: `PERPLEXITY_API_KEY` env var (passed as `apiKey` to the OpenAI constructor)
- Model: `sonar` (not GPT-4o-mini; the client is the OpenAI SDK but the endpoint and model are Perplexity's)
- Location: `src/lib/pipeline/categorize.ts`
- Used for: classifying video titles into one of 8 fixed niches in batches of 20 via `categorizeInBatches()`
- Response format: `json_object` with `{"results": [{"id": "...", "niche": "..."}]}`
- Note: This function (`categorizeVideos` / `categorizeInBatches`) is NOT currently called in any cron or API route. The active categorization path uses `categorizeByKeywords()` (local keyword matching) from `src/lib/pipeline/keyword-categorize.ts` instead.

## Data Storage

**Databases:**
- Type: PostgreSQL (Supabase-hosted)
- Connection: `NEXT_PUBLIC_SUPABASE_URL` (project URL) + key (anon or service role depending on context)
- Schema (4 tables):
  - `niches` — 8 pre-seeded rows; `id uuid`, `name text unique`, `description text`, `created_at`
  - `channels` — `id uuid`, `youtube_id text unique`, `name text`, `subscriber_count bigint`, `niche_id uuid FK→niches`, `last_scraped timestamptz`
  - `videos` — `id uuid`, `youtube_id text unique`, `channel_id uuid FK→channels ON DELETE CASCADE`, `title text`, `view_count bigint`, `published_at timestamptz`, `outlier_score numeric(10,2)`, `is_short boolean DEFAULT false`
  - `video_snapshots` — `id uuid`, `video_id uuid FK→videos ON DELETE CASCADE`, `view_count bigint`, `recorded_at timestamptz DEFAULT now()`
- Indexes:
  - `videos_outlier_score_idx` on `videos(outlier_score DESC)`
  - `videos_channel_id_idx` on `videos(channel_id)`
  - `videos_is_short_idx` partial index on `videos(is_short) WHERE is_short = true`
  - `channels_last_scraped_idx` on `channels(last_scraped ASC NULLS FIRST)` — drives stale-channel selection
  - `video_snapshots_video_id_idx` on `video_snapshots(video_id, recorded_at DESC)`
- RLS: Enabled on all 4 tables; authenticated users can SELECT; writes go through service role (bypasses RLS)
- Migrations: `supabase/migrations/001_initial.sql`, `002_add_is_short.sql`, `003_video_snapshots.sql`

**File Storage:** Local filesystem only — no Supabase Storage or S3

**Caching:** None — all pages use `export const dynamic = 'force-dynamic'`; no Redis, Upstash, or in-memory cache beyond the InnerTube singleton

## Authentication & Identity

**Auth Provider:** Supabase Auth (email/password)
- Browser client: `src/lib/supabase/client.ts` — `createBrowserClient()` from `@supabase/ssr`; used in client components like `src/app/(auth)/login/page.tsx`
- Server client: `src/lib/supabase/server.ts` — `createServerClient()` with cookie bridge; used in Server Components and Route Handlers
- Service client: two locations (both do the same thing):
  - `src/lib/supabase/server.ts` → `createServiceClient()` using `require('@supabase/supabase-js')`
  - `src/lib/pipeline/upsert.ts` → internal `getServiceClient()` using `createClient()` from `@supabase/supabase-js`
- OAuth callback: `src/app/auth/callback/route.ts` — exchanges PKCE code for session
- Sign-out: `src/app/api/auth/signout/route.ts` — POST handler that calls `supabase.auth.signOut()` and redirects to `/login`
- Middleware guard: `src/middleware.ts` — calls `supabase.auth.getUser()` on every non-static request; redirects unauthenticated requests to `/dashboard/*` → `/login`

## Monitoring & Observability

**Error Tracking:** None — no Sentry, Datadog, or similar

**Logs:**
- `console.error()` in cron route handlers with prefixes: `[cron/scrape]`, `[cron/shorts]`, `[shorts]`, `[search-form]`
- No structured logging library

## CI/CD & Deployment

**Hosting:** Vercel
- Cron schedule defined in `vercel.json`: `scrape` hourly, `shorts` daily at midnight UTC
- Crons call GET endpoints authenticated with `Authorization: Bearer <CRON_SECRET>`

**CI Pipeline:** Not detected — no `.github/workflows/` or similar CI config files in the repository

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (public)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (secret, server-only)
- `CRON_SECRET` — Bearer token for cron endpoint authentication (secret)
- `PERPLEXITY_API_KEY` — Perplexity AI API key (secret; unused unless `categorizeInBatches` is wired up)

**Optional env vars:**
- `PROXY_URL` — HTTP proxy URL for routing InnerTube requests; if absent, direct fetch is used

**Secrets location:** Vercel environment variables (production); local `.env.local` for development (not committed)

## Webhooks & Callbacks

**Incoming:**
- `GET /api/cron/scrape` — Vercel cron, hourly; refreshes stale channels
- `GET /api/cron/shorts` — Vercel cron, daily; sweeps 100+ keywords for viral Shorts
- `GET /app/auth/callback` — Supabase OAuth PKCE callback

**Outgoing:**
- None — app does not push webhooks to external services

---

*Integration audit: 2026-05-08*
