# Requirements: YouTube Scraper — Outreach Edition

**Defined:** 2026-05-09
**Core Value:** Paste channel URLs, get back a CSV with top games, genre, and median views — ready for Notion import.

## v1 Requirements

### Database

- [ ] **DB-01**: `outreach_channels` Supabase table with fields: youtube_id, name, url, subscriber_count, top_games (array), genre, median_views, last_enriched_at
- [ ] **DB-02**: Supabase migration for `outreach_channels` table with RLS policies (authenticated read, service role write)

### Enrichment Pipeline

- [ ] **ENR-01**: User can paste one or more YouTube channel URLs (or handles) into a bulk input field
- [ ] **ENR-02**: For each channel, the app fetches the last 10 videos (titles + view counts) via InnerTube
- [ ] **ENR-03**: For each channel, the app fetches the channel About/description via InnerTube
- [ ] **ENR-04**: GPT analyzes video titles + description to extract top 3 games covered by the channel
- [ ] **ENR-05**: GPT classifies the channel's primary gaming genre (e.g. Indie, FPS, RPG, Cozy, Survival, Strategy)
- [ ] **ENR-06**: Median view count is calculated from the last 10 videos
- [ ] **ENR-07**: Enriched channel data is upserted into `outreach_channels` table
- [ ] **ENR-08**: User sees enrichment progress and a results summary after processing completes

### Channel Discovery

- [ ] **DIS-01**: User can enter a keyword (e.g. "hades gameplay", "cozy games") to search for relevant YouTube channels — search uses video search to surface micro-influencers of all sizes
- [ ] **DIS-02**: Search returns a deduplicated list of channels (by channel ID) sourced from InnerTube video search results
- [ ] **DIS-03**: Discovered channels display enriched data (top games, genre, median views, email) after the user selects and saves them — show-first / enrich-on-save model (approved in Phase 3 discuss-phase D-04)
- [ ] **DIS-04**: User can select up to 15 discovered channels and save them to `outreach_channels` in a single action (upsert — no duplicates)
- [ ] **DIS-05**: Business email is extracted from the channel About page description via regex during enrichment and stored in `outreach_channels.email`

### Outreach Dashboard

- [x] **DASH-01**: Outreach tab visible in the existing dashboard navigation
- [ ] **DASH-02**: Outreach tab displays all enriched channels in a filterable table (filter by genre, min median views, min/max subscribers)
- [ ] **DASH-03**: Table columns: channel name, YouTube link, subscribers, top 3 games, genre, median views, last enriched date
- [x] **DASH-04**: User can trigger re-enrichment of any channel from the table
- [x] **DASH-05**: User can delete a channel from the outreach database

### Export

- [ ] **EXP-01**: User can download all outreach channels as a CSV file
- [ ] **EXP-02**: CSV includes all table columns in a format ready for Notion import

## v2.0 Requirements

### Coverage

- [ ] **COV-01**: The "Discover channels" tab accepts multiple keywords (up to 5) entered as removable chips
- [ ] **COV-02**: Searching runs dual-variant InnerTube searches (relevance + recent-week) for all keywords in parallel, 5 pages each
- [ ] **COV-03**: Results from all keyword searches are merged and deduplicated by channel ID before display

### Email Enrichment

- [ ] **EML-01**: During enrichment, if a channel's social links include a website URL, the pipeline fetches that page and extracts an email address via regex
- [ ] **EML-02**: The website fetch has a 5-second timeout and fails silently — enrichment completes normally if the fetch fails or returns no email
- [ ] **EML-03**: Social platform URLs (youtube.com, twitter.com, instagram.com, twitch.tv, tiktok.com, facebook.com) are skipped and not fetched

### Twitch Discovery

- [ ] **TWI-01**: `outreach_channels` table gains a `platform text DEFAULT 'youtube'` column (Migration 006); existing rows get 'youtube'; `(youtube_id, platform)` is a unique pair
- [x] **TWI-02**: A "Discover on Twitch" tab is added to OutreachTabs (4th tab)
- [ ] **TWI-03**: Searching by game name returns up to 100 live Twitch streamers with display name, Twitch URL, live viewer count, and email extracted from bio
- [ ] **TWI-04**: Selected Twitch streamers (up to 15) can be saved to `outreach_channels` with `platform='twitch'` in a single action
- [x] **TWI-05**: The Outreach List table shows a Platform column (YouTube / Twitch badge) for all rows
- [x] **TWI-06**: The CSV export includes a Platform column
- [x] **TWI-07**: The Re-enrich button is hidden for rows with `platform='twitch'`

### Deferred (future milestones)

- Outreach status tracking (contacted / replied / passed) — managed in Notion
- Notion API push integration — CSV export is sufficient
- Bulk re-enrichment cron job
- Similarity search (find channels similar to ones in the outreach list)
- Twitch follower count (requires per-user API call; viewer count sufficient for v1)
- Twitch-to-YouTube cross-reference

## Out of Scope

| Feature | Reason |
|---------|--------|
| Outreach status tracking | Managed in Notion; no need to duplicate |
| Notion API integration | CSV export is sufficient; avoids Notion token setup |
| Mixing with existing outlier channels table | Different data models and lifecycles |
| Subscriber size filter on discovery | All sizes are relevant for this use case |
| Linktree scraping | Website fetch covers the general case |
| Twitch VOD history / non-live discovery | Live streams sufficient for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 — Database Foundation | Complete |
| DB-02 | Phase 1 — Database Foundation | Complete |
| ENR-01 | Phase 2 — Enrichment Pipeline | Complete |
| ENR-02 | Phase 2 — Enrichment Pipeline | Complete |
| ENR-03 | Phase 2 — Enrichment Pipeline | Complete |
| ENR-04 | Phase 2 — Enrichment Pipeline | Complete |
| ENR-05 | Phase 2 — Enrichment Pipeline | Complete |
| ENR-06 | Phase 2 — Enrichment Pipeline | Complete |
| ENR-07 | Phase 2 — Enrichment Pipeline | Complete |
| ENR-08 | Phase 2 — Enrichment Pipeline | Complete |
| DIS-01 | Phase 3 — Channel Discovery | Complete |
| DIS-02 | Phase 3 — Channel Discovery | Complete |
| DIS-03 | Phase 3 — Channel Discovery | Complete |
| DIS-04 | Phase 3 — Channel Discovery | Complete |
| DIS-05 | Phase 3 — Channel Discovery | Complete |
| DASH-01 | Phase 4 — Outreach Dashboard & Export | Complete |
| DASH-02 | Phase 4 — Outreach Dashboard & Export | Complete |
| DASH-03 | Phase 4 — Outreach Dashboard & Export | Complete |
| DASH-04 | Phase 4 — Outreach Dashboard & Export | Complete |
| DASH-05 | Phase 4 — Outreach Dashboard & Export | Complete |
| EXP-01 | Phase 4 — Outreach Dashboard & Export | Complete |
| EXP-02 | Phase 4 — Outreach Dashboard & Export | Complete |
| COV-01 | Phase 5 — Multi-Keyword Sweep | Pending |
| COV-02 | Phase 5 — Multi-Keyword Sweep | Pending |
| COV-03 | Phase 5 — Multi-Keyword Sweep | Pending |
| EML-01 | Phase 6 — Website Email Enrichment | Pending |
| EML-02 | Phase 6 — Website Email Enrichment | Pending |
| EML-03 | Phase 6 — Website Email Enrichment | Pending |
| TWI-01 | Phase 7 — Twitch Discovery | Pending |
| TWI-02 | Phase 7 — Twitch Discovery | Complete |
| TWI-03 | Phase 7 — Twitch Discovery | Pending |
| TWI-04 | Phase 7 — Twitch Discovery | Pending |
| TWI-05 | Phase 7 — Twitch Discovery | Complete |
| TWI-06 | Phase 7 — Twitch Discovery | Complete |
| TWI-07 | Phase 7 — Twitch Discovery | Complete |
