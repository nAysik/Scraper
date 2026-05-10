# Codebase Structure

**Analysis Date:** 2026-05-08

## Directory Layout

```
youtube-scraper/
├── src/
│   ├── app/                        # Next.js App Router root
│   │   ├── (auth)/                 # Route group — no layout; auth pages excluded from dashboard shell
│   │   │   ├── login/page.tsx      # Email/password sign-in (Client Component)
│   │   │   └── register/page.tsx   # Registration page (Client Component)
│   │   ├── auth/
│   │   │   └── callback/route.ts   # Supabase PKCE OAuth callback
│   │   ├── api/
│   │   │   ├── scrape/route.ts     # POST — manual user-triggered scrape
│   │   │   ├── cron/
│   │   │   │   ├── scrape/route.ts # GET — hourly channel refresh cron
│   │   │   │   └── shorts/route.ts # GET — daily Shorts sweep cron
│   │   │   └── auth/
│   │   │       └── signout/route.ts# POST — sign out and redirect
│   │   ├── dashboard/
│   │   │   ├── layout.tsx          # Dashboard shell: header + nav + main container
│   │   │   ├── page.tsx            # "Keywords Scraper" tab — regular videos
│   │   │   ├── charts/page.tsx     # "Top Viral Charts" tab — Shorts
│   │   │   ├── niches/page.tsx     # "Niche Insights" tab — per-niche aggregates
│   │   │   └── channel/
│   │   │       └── [youtubeId]/page.tsx  # Channel detail with stats + video list
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Public landing (redirects to /dashboard or /login)
│   │   ├── globals.css             # Tailwind v4 imports + CSS custom properties
│   │   └── favicon.ico
│   ├── components/
│   │   ├── ui/                     # shadcn/ui primitives (copied, not generated at build time)
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   └── table.tsx
│   │   ├── dashboard-nav.tsx       # Tab navigation (Client Component)
│   │   ├── keyword-frequency.tsx   # Word-frequency chip cloud for Shorts titles (Client Component)
│   │   ├── niche-stats-cards.tsx   # Summary stat cards (Client Component)
│   │   ├── search-form.tsx         # Keyword input + fetch to /api/scrape (Client Component)
│   │   └── videos-table.tsx        # TanStack Table with filters (Client Component); exports VideoRow type
│   └── lib/
│       ├── scraper/                # InnerTube access layer — no Supabase knowledge
│       │   ├── innertube.ts        # Singleton youtubei.js client
│       │   ├── proxy.ts            # Optional fetch proxy wrapper
│       │   ├── channels.ts         # Search channels; exports ChannelMeta
│       │   ├── videos.ts           # Fetch channel videos; exports VideoMeta, ChannelVideosResult
│       │   └── shorts.ts           # Sweep keywords for viral Shorts; exports ShortMeta
│       ├── pipeline/               # Business logic — compute and persist
│       │   ├── outlier.ts          # calcOutlierScore(views, subs) → number
│       │   ├── upsert.ts           # All Supabase write operations (service role)
│       │   ├── categorize.ts       # Perplexity AI categorization (wired up but unused in routes)
│       │   └── keyword-categorize.ts # Local keyword-match categorization (active path)
│       ├── supabase/               # Supabase client factories
│       │   ├── client.ts           # Browser client (createBrowserClient)
│       │   └── server.ts           # Server client (createServerClient) + service client
│       └── utils.ts                # cn() helper (clsx + tailwind-merge)
├── supabase/
│   └── migrations/                 # Ordered SQL migrations
│       ├── 001_initial.sql         # niches, channels, videos tables + RLS + seed data
│       ├── 002_add_is_short.sql    # is_short column + partial index
│       └── 003_video_snapshots.sql # video_snapshots table
├── public/                         # Static assets (SVG icons)
├── .planning/
│   └── codebase/                   # GSD codebase map documents
├── .claude/
│   └── settings.local.json
├── next.config.ts                  # Minimal Next.js config (no custom options)
├── tsconfig.json                   # strict mode; @/* → ./src/* alias
├── postcss.config.mjs              # Tailwind v4 PostCSS plugin
├── eslint.config.mjs               # ESLint 9 flat config
├── components.json                 # shadcn/ui registry config
├── vercel.json                     # Cron job definitions
├── package.json
├── package-lock.json
├── AGENTS.md                       # Agent/AI instructions
├── CLAUDE.md                       # Claude-specific project notes
└── README.md
```

## Directory Purposes

**`src/app/`:**
- Purpose: All Next.js pages and API routes; App Router convention
- Contains: Page RSCs, Route Handlers, layouts, auth pages
- Key files: `dashboard/page.tsx`, `api/scrape/route.ts`, `api/cron/scrape/route.ts`, `api/cron/shorts/route.ts`

**`src/app/(auth)/`:**
- Purpose: Login and register pages outside the dashboard layout shell
- Contains: Client Components only (use browser Supabase client directly)
- Key files: `login/page.tsx`, `register/page.tsx`

**`src/components/`:**
- Purpose: Reusable UI components; mixed Server and Client Components
- Contains: Feature components (table, form, nav, stats) + shadcn primitives in `ui/`
- Key files: `videos-table.tsx` (exports `VideoRow` type used across all pages), `search-form.tsx`

**`src/components/ui/`:**
- Purpose: shadcn/ui primitive components; hand-copied from the shadcn CLI, not generated at build time
- Generated: No (manually maintained)
- Committed: Yes

**`src/lib/scraper/`:**
- Purpose: All YouTube InnerTube interaction; no Supabase imports
- Key constraint: These files must not import from `src/lib/supabase/` or `src/lib/pipeline/upsert.ts`

**`src/lib/pipeline/`:**
- Purpose: Stateless business logic; `upsert.ts` is the only file that writes to Supabase
- Key constraint: `outlier.ts` and `keyword-categorize.ts` are pure functions with no side effects

**`src/lib/supabase/`:**
- Purpose: Supabase client creation only; no query logic
- Key constraint: Query logic belongs in RSC pages or route handlers directly, not here

**`supabase/migrations/`:**
- Purpose: Versioned SQL schema migrations applied to the Supabase project
- Generated: No
- Committed: Yes; run manually or via Supabase CLI

## Key File Locations

**Entry Points:**
- `src/middleware.ts` — runs on every request; auth gating
- `src/app/layout.tsx` — root HTML shell
- `src/app/dashboard/layout.tsx` — authenticated app shell

**Configuration:**
- `tsconfig.json` — TypeScript; strict mode; `@/*` path alias
- `vercel.json` — cron schedules
- `next.config.ts` — Next.js (currently empty)
- `globals.css` — Tailwind v4 theme tokens (CSS custom properties, not JS config)

**Core Logic:**
- `src/lib/scraper/videos.ts` — `parseViewCount`, `parseRelativeDate`, `parseSubscriberCount` (also imported by `shorts.ts`)
- `src/lib/pipeline/upsert.ts` — single source of all DB writes; `upsertChannel`, `upsertVideo`, `upsertSnapshot`, `getStaleChannels`, `getNicheIdMap`
- `src/lib/pipeline/outlier.ts` — `calcOutlierScore` (3 lines; pure)

**Shared Types:**
- `VideoRow` — `src/components/videos-table.tsx` (exported)
- `ChannelMeta` — `src/lib/scraper/channels.ts`
- `VideoMeta`, `ChannelVideosResult` — `src/lib/scraper/videos.ts`
- `ShortMeta` — `src/lib/scraper/shorts.ts`
- `NicheName` — `src/lib/pipeline/categorize.ts`

**Database Schema:**
- `supabase/migrations/001_initial.sql` — full schema + seed niches

## Naming Conventions

**Files:**
- kebab-case for all files: `videos-table.tsx`, `keyword-frequency.tsx`, `keyword-categorize.ts`
- Route files follow Next.js convention: `route.ts` for API, `page.tsx` for pages, `layout.tsx` for layouts
- UI primitives match shadcn names: `badge.tsx`, `button.tsx`, `card.tsx`

**Directories:**
- kebab-case: `dashboard-nav`, route groups use `(auth)` with parens
- Feature grouping: `scraper/`, `pipeline/`, `supabase/` under `src/lib/`

**TypeScript:**
- Interfaces named in PascalCase: `ChannelMeta`, `VideoMeta`, `VideoRow`, `ShortMeta`
- Functions in camelCase: `getClient`, `upsertChannel`, `calcOutlierScore`, `categorizeByKeywords`
- Constants in UPPER_SNAKE_CASE: `NINETY_DAYS_MS`, `SEVEN_DAYS_MS`, `NICHE_KEYWORDS`, `SHORTS_KEYWORDS`, `NICHE_NAMES`, `STOP_WORDS`
- `as const` used for the `NICHE_NAMES` tuple and `SHORTS_KEYWORDS` array

## Where to Add New Code

**New scraper target (new YouTube data type):**
- Implementation: `src/lib/scraper/<new-target>.ts` — export typed interface + async function; import `getClient()` from `innertube.ts`
- Wire up: add route handler in `src/app/api/`; reuse `upsert.ts` functions for DB writes

**New pipeline operation (new business logic step):**
- Implementation: `src/lib/pipeline/<operation>.ts` — pure functions preferred; if DB writes needed, add to `upsert.ts`

**New dashboard page / tab:**
- Implementation: `src/app/dashboard/<tab>/page.tsx` — RSC; follow pattern of `page.tsx` (fetch → map → render)
- Register tab: add to `tabs` array in `src/components/dashboard-nav.tsx`
- Set `export const dynamic = 'force-dynamic'` to opt out of static caching

**New shared UI component:**
- Feature component: `src/components/<name>.tsx` — use `'use client'` directive if it needs state or event handlers
- Primitive (shadcn): `src/components/ui/<name>.tsx` — follow shadcn CLI output pattern; use `cn()` from `src/lib/utils.ts`

**New Supabase table:**
- Migration: `supabase/migrations/00N_<description>.sql` — increment the prefix number
- Types: add TypeScript interface in the relevant module
- RLS: always add RLS policies matching the pattern in `001_initial.sql`

**New environment variable:**
- Read at the call site with `process.env.VAR_NAME!` (non-null assertion is the convention)
- Document in `INTEGRATIONS.md`

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD codebase map documents consumed by planning and execution commands
- Generated: Yes (by `/gsd-map-codebase`)
- Committed: Recommended

**`.claude/`:**
- Purpose: Claude Code local settings
- Generated: Yes (by Claude Code)
- Committed: Recommended (settings only; no secrets)

**`.next/`:**
- Purpose: Next.js build output and dev cache
- Generated: Yes
- Committed: No (in `.gitignore`)

**`public/`:**
- Purpose: Static files served at `/`; currently only Next.js default SVG assets
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-05-08*
