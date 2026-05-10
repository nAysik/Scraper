# Roadmap: YouTube Scraper — Outreach Edition

**Milestone:** Outreach workflow v1
**Granularity:** Standard
**Coverage:** 17/17 v1 requirements mapped

---

## Phases

- [x] **Phase 1: Database Foundation** — Create `outreach_channels` Supabase table with migration and RLS
- [x] **Phase 2: Enrichment Pipeline** — Bulk URL paste → fetch last 10 videos + description → GPT game/genre extraction → upsert
- [ ] **Phase 3: Channel Discovery** — Keyword search → InnerTube channel results → auto-enrich → save selected channels
- [ ] **Phase 4: Outreach Dashboard & Export** — Outreach tab in existing dashboard with filterable table, re-enrich, delete, and CSV export

---

## Phase Details

### Phase 1: Database Foundation
**Goal:** The `outreach_channels` table exists in Supabase with correct schema, RLS policies, and a repeatable migration so all subsequent phases can read and write channel data.
**Depends on:** Nothing (first phase)
**Requirements:** DB-01, DB-02
**Success Criteria:**
1. Running the migration SQL in the Supabase dashboard creates the `outreach_channels` table with all required columns (youtube_id, name, url, subscriber_count, top_games, genre, median_views, last_enriched_at).
2. Authenticated users can read rows from `outreach_channels`; unauthenticated requests are rejected by RLS.
3. Service role writes (INSERT, UPDATE) to `outreach_channels` succeed without error from a Route Handler using `createServiceClient()`.
**Plans:** 1 plan
- [x] 01-01-PLAN.md — Author migration 004, apply via Supabase Dashboard, smoke-test RLS + service-role write

### Phase 2: Enrichment Pipeline
**Goal:** A user can paste one or more YouTube channel URLs (or handles) into a form, the app fetches the last 10 video titles + view counts and the channel description via InnerTube, GPT-4o-mini extracts the top 3 games covered and primary genre, median views are calculated, and the enriched record is upserted into `outreach_channels`.
**Depends on:** Phase 1
**Requirements:** ENR-01, ENR-02, ENR-03, ENR-04, ENR-05, ENR-06, ENR-07, ENR-08
**Success Criteria:**
1. Pasting a valid YouTube channel URL (e.g. `https://www.youtube.com/@mkbhd`) and submitting returns enriched data: top 3 games, primary genre, and median view count.
2. Pasting multiple channel URLs processes all of them and upserts each as a separate row in `outreach_channels`.
3. The UI shows per-channel progress while enrichment is running and a results summary (channels processed, any errors) when it completes.
4. GPT is called once per channel (not per video), combining video titles and channel description in a single prompt to control API cost.
5. Re-submitting a URL that already exists in `outreach_channels` updates (upserts) the existing row rather than creating a duplicate.
**Plans:** 5 plans
- [x] 02-01-PLAN.md — Delete dead Perplexity categorizer (D-09 cleanup)
- [x] 02-02-PLAN.md — Outreach pipeline library (canonicalize, resolve, fetch, median, extract, upsert)
- [x] 02-03-PLAN.md — POST /api/outreach/enrich route handler + smoke test
- [x] 02-04-PLAN.md — EnrichForm UI, /dashboard/outreach page, nav tab
- [x] 02-05-PLAN.md — CLAUDE.md docs update (env table swap, outreach data flow)
**UI hint**: yes

### Phase 3: Channel Discovery
**Goal:** A user can type a keyword (e.g. "indie game review") into a search field, see a list of matching YouTube channels returned via InnerTube, view their enriched data (top games, genre, median views) inline, and save selected channels to `outreach_channels`.
**Depends on:** Phase 2
**Requirements:** DIS-01, DIS-02, DIS-03, DIS-04
**Success Criteria:**
1. Entering a keyword and submitting returns a list of YouTube channels found via InnerTube channel search.
2. Each discovered channel displays enriched data (top games, genre, median views) computed on-the-fly before being shown — no separate enrichment step is needed.
3. The user can select one or more discovered channels and add them to the outreach database with a single action.
4. Adding a channel that is already in `outreach_channels` does not create a duplicate (upsert behaviour).
**Plans:** TBD
**UI hint**: yes

### Phase 4: Outreach Dashboard & Export
**Goal:** The existing dashboard gains an "Outreach" tab that displays all enriched channels in a filterable table, lets the user re-enrich or delete individual channels, and provides a one-click CSV download of the full list for Notion import.
**Depends on:** Phase 1, Phase 2
**Requirements:** DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, EXP-01, EXP-02
**Success Criteria:**
1. An "Outreach" tab appears in the existing dashboard navigation alongside the existing tabs.
2. The Outreach tab shows a table with columns: channel name, YouTube link, subscribers, top 3 games, genre, median views, last enriched date — and the table can be filtered by genre, minimum median views, and subscriber range.
3. Clicking "Re-enrich" on any row triggers the enrichment pipeline for that channel and refreshes its data in the table.
4. Clicking "Delete" on any row removes the channel from `outreach_channels` and it disappears from the table.
5. Clicking "Export CSV" downloads a file containing all table rows and columns in a format that imports cleanly into Notion (UTF-8, comma-separated, header row matching column names).
**Plans:** TBD
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Foundation | 1/1 | Complete | 2026-05-10 |
| 2. Enrichment Pipeline | 5/5 | Complete | 2026-05-10 |
| 3. Channel Discovery | 0/0 | Not started | - |
| 4. Outreach Dashboard & Export | 0/0 | Not started | - |
