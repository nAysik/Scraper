# YouTube Scraper — Outreach Edition

## What This Is

A Next.js tool for indie game marketing teams to discover and enrich YouTube content creator data for outreach campaigns. It scrapes channel stats, detects which games a creator covers, and exports enriched lists to CSV for import into Notion or other outreach trackers.

## Core Value

Give a marketer a bulk list of YouTube channel URLs and hand back a CSV with the data they need to decide who to pitch — top games covered, genre, median views, subscriber count.

## Requirements

### Validated

- ✓ Keyword-based YouTube channel search via InnerTube (no API key) — existing
- ✓ Recent video fetching per channel (last 90 days) — existing
- ✓ Outlier score calculation (views / subscribers) — existing
- ✓ Niche categorization via GPT-4o-mini — existing
- ✓ Shorts pipeline with keyword sweep — existing
- ✓ Filterable video dashboard — existing
- ✓ Supabase auth (email/password) — existing
- ✓ Hourly cron refresh (Vercel + GitHub Actions) — existing

### Active

- [ ] Outreach tab in the existing dashboard
- [ ] Bulk YouTube channel URL paste → enrichment pipeline
- [ ] Per-channel: fetch last 10 videos + channel About description
- [ ] GPT extraction of top 3 games covered + primary genre from titles + description
- [ ] Median view count calculated from last 10 videos
- [ ] `outreach_channels` Supabase table (separate from existing outlier tables)
- [ ] Gaming channel discovery via keyword search (indie reviewers, genres, competitor games)
- [ ] Enrichment applied to discovered channels before saving
- [ ] CSV export of enriched outreach channel data

### Out of Scope

- Outreach status tracking (contacted / replied / passed) — managed in Notion
- Notion API integration — manual CSV import/export is sufficient
- Non-YouTube platforms — YouTube only for now
- Deduplication with existing `channels` table — outreach and outlier tracking are separate concerns

## Context

This is a brownfield addition to an existing outlier-tracking scraper. The InnerTube client, Supabase setup, GPT pipeline, and auth are all in place. New work adds an independent outreach workflow on top — a new DB table, new enrichment logic (game/genre detection), a new dashboard section, and CSV export.

The user runs indie PC game marketing and maintains a Notion database of YouTubers to pitch for game coverage (reviews, let's plays, livestreams). They need richer channel data — specifically which games a creator focuses on and typical view performance — to prioritize who to contact and personalize the pitch.

**Existing relevant patterns to reuse:**
- `src/lib/scraper/innertube.ts` — singleton InnerTube client
- `src/lib/scraper/videos.ts` — `parseViewCount`, `parseRelativeDate`, `parseSubscriberCount`
- `src/lib/pipeline/categorize.ts` — OpenAI batch call pattern (adapt for game detection)
- `src/lib/supabase/server.ts` — SSR and service role clients
- `src/app/dashboard/page.tsx` — Server Component + client table pattern

## Constraints

- **Tech stack**: Must stay within Next.js 16, Supabase, OpenAI SDK, youtubei.js — no new backend services
- **InnerTube limits**: youtubei.js node types are unreliable; cast to `any` as established in existing scraper code
- **Cost**: GPT calls for game detection should batch or be per-channel (not per-video) to control spend

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Separate `outreach_channels` table | Outlier tracking and outreach are different data models with different lifecycles | — Pending |
| GPT for game/genre detection | Video titles alone are ambiguous; combining with channel description gives reliable results | — Pending |
| CSV export (not Notion API) | Simpler, no Notion token setup required, works with any destination | — Pending |
| New Outreach tab in existing dashboard | Avoids maintaining a separate app; auth and nav already in place | — Pending |

## Evolution

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions

**After milestone completion:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Update Context with current state

---
*Last updated: 2026-05-09 after initialization*
