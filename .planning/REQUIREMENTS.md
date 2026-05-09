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

- [ ] **DIS-01**: User can enter a keyword (e.g. "indie game review", "cozy games", "survival game") to search for relevant YouTube channels
- [ ] **DIS-02**: Search returns a list of channels via InnerTube channel search
- [ ] **DIS-03**: Discovered channels are automatically enriched (top games, genre, median views) before being shown
- [ ] **DIS-04**: User can add selected discovered channels to the `outreach_channels` table

### Outreach Dashboard

- [ ] **DASH-01**: Outreach tab visible in the existing dashboard navigation
- [ ] **DASH-02**: Outreach tab displays all enriched channels in a filterable table (filter by genre, min median views, min/max subscribers)
- [ ] **DASH-03**: Table columns: channel name, YouTube link, subscribers, top 3 games, genre, median views, last enriched date
- [ ] **DASH-04**: User can trigger re-enrichment of any channel from the table
- [ ] **DASH-05**: User can delete a channel from the outreach database

### Export

- [ ] **EXP-01**: User can download all outreach channels as a CSV file
- [ ] **EXP-02**: CSV includes all table columns in a format ready for Notion import

## v2 Requirements

### Future Enhancements

- **V2-01**: Outreach status tracking (contacted / replied / passed) within the app
- **V2-02**: Notion API push integration (direct sync instead of CSV)
- **V2-03**: Bulk re-enrichment cron job to keep data fresh
- **V2-04**: Similarity search — find channels similar to ones already in the outreach list

## Out of Scope

| Feature | Reason |
|---------|--------|
| Outreach status tracking | Managed in Notion; no need to duplicate |
| Notion API integration | CSV export is sufficient; avoids Notion token setup |
| Non-YouTube platforms | YouTube-only for now |
| Mixing with existing outlier channels table | Different data models and lifecycles |
| Subscriber size filter on discovery | All sizes are relevant for this use case |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 — Database Foundation | Pending |
| DB-02 | Phase 1 — Database Foundation | Pending |
| ENR-01 | Phase 2 — Enrichment Pipeline | Pending |
| ENR-02 | Phase 2 — Enrichment Pipeline | Pending |
| ENR-03 | Phase 2 — Enrichment Pipeline | Pending |
| ENR-04 | Phase 2 — Enrichment Pipeline | Pending |
| ENR-05 | Phase 2 — Enrichment Pipeline | Pending |
| ENR-06 | Phase 2 — Enrichment Pipeline | Pending |
| ENR-07 | Phase 2 — Enrichment Pipeline | Pending |
| ENR-08 | Phase 2 — Enrichment Pipeline | Pending |
| DIS-01 | Phase 3 — Channel Discovery | Pending |
| DIS-02 | Phase 3 — Channel Discovery | Pending |
| DIS-03 | Phase 3 — Channel Discovery | Pending |
| DIS-04 | Phase 3 — Channel Discovery | Pending |
| DASH-01 | Phase 4 — Outreach Dashboard & Export | Pending |
| DASH-02 | Phase 4 — Outreach Dashboard & Export | Pending |
| DASH-03 | Phase 4 — Outreach Dashboard & Export | Pending |
| DASH-04 | Phase 4 — Outreach Dashboard & Export | Pending |
| DASH-05 | Phase 4 — Outreach Dashboard & Export | Pending |
| EXP-01 | Phase 4 — Outreach Dashboard & Export | Pending |
| EXP-02 | Phase 4 — Outreach Dashboard & Export | Pending |
