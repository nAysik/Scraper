# Roadmap: YouTube Scraper — Outreach Edition

**Milestone:** Coverage & Email Expansion v2.0
**Granularity:** Standard
**Coverage:** 17/17 v1 requirements (complete) + 10/10 v2.0 requirements mapped

---

## Phases

- [x] **Phase 1: Database Foundation** — Create `outreach_channels` Supabase table with migration and RLS
- [x] **Phase 2: Enrichment Pipeline** — Bulk URL paste → fetch last 10 videos + description → GPT game/genre extraction → upsert
- [x] **Phase 3: Channel Discovery** — Keyword search → InnerTube channel results → auto-enrich → save selected channels
- [x] **Phase 4: Outreach Dashboard & Export** — Outreach tab in existing dashboard with filterable table, re-enrich, delete, and CSV export
- [ ] **Phase 5: Multi-Keyword Sweep** — Replace single keyword input with chip input; search up to 5 keywords in parallel; merge and dedup results
- [ ] **Phase 6: Website Email Enrichment** — Follow website links from YouTube About page during enrichment to extract additional email addresses
- [x] **Phase 7: Twitch Discovery** — New Discover on Twitch tab; search live streamers by game; extract emails from bios; save to unified outreach list with platform badge (completed 2026-05-16)

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
**Goal:** A user can type a game name or keyword (e.g. "Hades", "hades gameplay") into a search field, see a deduplicated list of YouTube channels that have published videos matching that keyword (all sizes, from micro-influencers up), view their enriched data (top games, genre, median views, and business email if available) inline, and save selected channels to `outreach_channels`.
**Depends on:** Phase 2
**Requirements:** DIS-01, DIS-02, DIS-03, DIS-04, DIS-05
**Success Criteria:**
1. Entering a keyword and submitting searches InnerTube for *videos* matching that keyword, then extracts and deduplicates the unique channels behind those results — returning creators of all sizes, not just large channels.
2. Each discovered channel displays enriched data (top games, genre, median views, business email if found in About page) after the user selects and saves — show-first / enrich-on-save model (approved in discuss-phase D-04).
3. The user can select one or more discovered channels and save them to `outreach_channels` with a single action.
4. Saving a channel that already exists in `outreach_channels` upserts (no duplicates).
5. Business email is extracted from the channel's About page description via regex during enrichment and stored in `outreach_channels.email`.
**Plans:** 3 plans
- [ ] 03-01-PLAN.md — Migration 005 (add email column) + plumb email through upsert + enrich route
- [ ] 03-02-PLAN.md — searchVideosByKeyword scraper + POST /api/outreach/discover route (dual search, dedup, already-saved check)
- [ ] 03-03-PLAN.md — DiscoveryPanel UI + OutreachTabs integration at /dashboard/outreach
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
**Plans:** 2/2 plans executed
- [x] 04-01-PLAN.md — API routes: GET /api/outreach/channels, DELETE /api/outreach/channels/[youtubeId], POST /api/outreach/channels/bulk-delete
- [x] 04-02-PLAN.md — OutreachList component + OutreachTabs 3rd tab wiring
**UI hint**: yes

---

### Phase 5: Multi-Keyword Sweep
**Goal:** The "Discover channels" tab accepts up to 5 keywords as removable chips. Submitting runs the existing dual-variant InnerTube search for every keyword in parallel, merges all results into one deduplicated channel list, and displays them in the existing table with all existing filters intact.
**Depends on:** Phase 3
**Requirements:** COV-01, COV-02, COV-03
**Success Criteria:**
1. The keyword input field is replaced by a chip input — typing a keyword and pressing Enter adds it as a chip; chips can be removed via ×; max 5 chips.
2. Submitting with 3 chips runs 6 parallel InnerTube searches (3 keywords × 2 variants) and returns a merged, deduplicated channel list.
3. The subscriber filter, already-saved badge, and save flow work identically on the merged result set.
**Plans:** 2 plans
- [ ] 05-01-PLAN.md — Update /api/outreach/discover to accept keywords[] array with parallel multi-keyword search
- [ ] 05-02-PLAN.md — Chip input UI in DiscoveryPanel replacing single keyword Input
**UI hint**: yes

### Phase 6: Website Email Enrichment
**Goal:** The enrichment pipeline follows website links found in a channel's YouTube About social links and extracts email addresses from the fetched page HTML, increasing email yield without requiring new credentials or changing the enrichment UX.
**Depends on:** Phase 2
**Requirements:** EML-01, EML-02, EML-03
**Success Criteria:**
1. Enriching a channel that has a website link but no YouTube About email attempts to fetch the website and extract an email.
2. Social platform URLs (twitter.com, instagram.com, twitch.tv, tiktok.com, facebook.com, youtube.com) are skipped.
3. If the website fetch times out (>5 seconds), errors, or returns no email, enrichment completes normally with no error surfaced to the user.
**Plans:** 1 plan
- [ ] 06-01-PLAN.md — Add website email extraction to fetch-channel-data.ts; use as fallback in enrich route

### Phase 7: Twitch Discovery
**Goal:** A "Discover on Twitch" tab lets the user search live Twitch streamers by game name, view up to 100 results with live viewer counts and bio-extracted emails, and save selected streamers to the unified outreach_channels table with platform='twitch'. The Outreach List and CSV export show a Platform column distinguishing YouTube from Twitch entries.
**Depends on:** Phase 4 (Outreach List), Phase 5 (schema pattern)
**Requirements:** TWI-01, TWI-02, TWI-03, TWI-04, TWI-05, TWI-06, TWI-07
**Success Criteria:**
1. Migration 006 adds `platform text DEFAULT 'youtube'` to `outreach_channels`; all existing rows retain 'youtube'; `(youtube_id, platform)` uniqueness is enforced.
2. The "Discover on Twitch" tab appears as the 4th tab in OutreachTabs.
3. Searching by game name (e.g. "Hades") returns live Twitch streamers with display name, Twitch link, live viewer count, and email (if found in bio).
4. Saving selected Twitch channels upserts them to `outreach_channels` with `platform='twitch'` — no enrichment step needed (bio data used directly).
5. The Outreach List shows a Platform badge (YouTube / Twitch) for every row; Twitch rows have no Re-enrich button.
6. The CSV export includes a Platform column.
**Plans:** 3/3 plans complete
- [x] 07-01-PLAN.md — Migration 006 (platform column, composite unique) + upsert update + CLAUDE.md env vars
- [x] 07-02-PLAN.md — Twitch API lib (client.ts, search.ts) + discover-twitch + save-twitch routes
- [x] 07-03-PLAN.md — TwitchDiscoveryPanel UI + OutreachTabs 4th tab + Outreach List platform column/CSV/Re-enrich guard
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Foundation | 1/1 | Complete | 2026-05-10 |
| 2. Enrichment Pipeline | 5/5 | Complete | 2026-05-10 |
| 3. Channel Discovery | 3/3 | Complete | 2026-05-15 |
| 4. Outreach Dashboard & Export | 2/2 | Complete | 2026-05-15 |
| 5. Multi-Keyword Sweep | 0/2 | In progress | — |
| 6. Website Email Enrichment | 0/1 | Not started | — |
| 7. Twitch Discovery | 3/3 | Complete   | 2026-05-16 |
