# Technology Stack

**Analysis Date:** 2026-05-08

## Languages

**Primary:**
- TypeScript 5.x — all application code in `src/`
- SQL — Supabase migrations in `supabase/migrations/`

**Secondary:**
- CSS (PostCSS) — Tailwind v4 utility classes; one global file at `src/app/globals.css`

## Runtime

**Environment:**
- Node.js (version not pinned; no `.nvmrc` or `.node-version` file)
- Target: ES2017 (set in `tsconfig.json`)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.2.4 (App Router) — full-stack framework; all pages use the `src/app/` convention
- React 19.2.4 — UI rendering
- React DOM 19.2.4 — DOM renderer

**UI / Styling:**
- Tailwind CSS 4.x (`tailwindcss ^4`, `@tailwindcss/postcss ^4`) — utility-first CSS; no config file (v4 CSS-first config via `globals.css`)
- shadcn/ui 4.4.0 (`shadcn` package) — component primitives; components copied into `src/components/ui/`
- `tw-animate-css ^1.4.0` — animation utilities imported in `globals.css`
- `class-variance-authority ^0.7.1` — variant-based class composition for shadcn components
- `clsx ^2.1.1` + `tailwind-merge ^3.5.0` — combined in `src/lib/utils.ts` as `cn()`
- `lucide-react ^1.8.0` — icon library
- `@base-ui/react ^1.4.1` — additional headless UI primitives (installed but shadcn components are the primary pattern)

**Data / Table:**
- `@tanstack/react-table ^8.21.3` — client-side table with sorting and filtering used in `src/components/videos-table.tsx`

**Build / Dev:**
- TypeScript compiler via `next build`
- ESLint 9 (`eslint-config-next 16.2.4`) — linting; config at `eslint.config.mjs`
- PostCSS (`postcss.config.mjs`) — Tailwind CSS processing

## Key Dependencies

**YouTube InnerTube API:**
- `youtubei.js ^17.0.1` — scrapes YouTube without an official API key using the InnerTube protocol; singleton client instantiated in `src/lib/scraper/innertube.ts`

**Supabase:**
- `@supabase/supabase-js ^2.104.0` — base Supabase client; used directly in pipeline upsert functions and cron routes
- `@supabase/ssr ^0.10.2` — SSR-aware client wrappers for Next.js middleware and server components; used in `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, and `src/middleware.ts`

**AI Categorization:**
- `openai ^6.34.0` — OpenAI SDK; configured in `src/lib/pipeline/categorize.ts` to call Perplexity AI's `sonar` model (not OpenAI directly) via a custom `baseURL`

## Configuration

**Environment Variables Required:**
- `NEXT_PUBLIC_SUPABASE_URL` — public, available browser-side
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, available browser-side
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; used for all write operations (bypasses RLS)
- `CRON_SECRET` — bearer token that guards `/api/cron/scrape` and `/api/cron/shorts`
- `PERPLEXITY_API_KEY` — API key for the Perplexity AI endpoint (passed to OpenAI SDK as `apiKey`)
- `PROXY_URL` — optional; when set, all InnerTube requests are routed through `buildProxiedFetch()` in `src/lib/scraper/proxy.ts`

**Build:**
- `next.config.ts` — minimal, no custom configuration
- `tsconfig.json` — strict mode on; path alias `@/*` maps to `./src/*`
- `postcss.config.mjs` — Tailwind v4 PostCSS plugin
- `components.json` — shadcn/ui component registry config

## Platform Requirements

**Development:**
- Node.js + npm
- Supabase project (remote or local CLI)
- Optional: proxy server URL for InnerTube request routing

**Production:**
- Deployed on Vercel
- Cron jobs defined in `vercel.json`: `/api/cron/scrape` hourly (`0 * * * *`), `/api/cron/shorts` daily (`0 0 * * *`)
- All server-side secrets injected via Vercel environment variables

---

*Stack analysis: 2026-05-08*
