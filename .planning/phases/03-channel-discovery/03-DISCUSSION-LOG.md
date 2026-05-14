# Phase 3: Channel Discovery — Discussion Log

**Date:** 2026-05-14
**Participants:** User + Claude

---

## Areas Discussed

### Results Scale

**Question:** How many channels to surface per keyword search?
**Options presented:** ~20 (1 page), ~50 (3 pages, recommended), ~100 (5 pages)
**Decision:** 100 channels / 5 pages

**Notes:** This drove the decision to not enrich all channels upfront (would take 3-5 minutes at 5 pages × full enrichment).

---

### Enrichment Timing

**Question:** How should enrichment work when 50+ channels are discovered?
**Options presented:** Show list first + enrich on save (recommended), Progressive SSE, Enrich all then show
**Decision:** Show list first, enrich only selected channels on save

**Notes:** Existing Phase 2 `/api/outreach/enrich` endpoint can handle the save step. Cap stays at 15 per save batch.

---

### Discovery UI

**Q1:** Results layout
**Options:** Simple table with checkboxes (recommended), Card grid, You decide
**Decision:** Simple table with checkboxes (TanStack Table — already installed)

**Q2:** Post-save behavior
**Options:** Enrich + save in place (recommended), Redirect to dashboard, Clear + summary
**Decision:** Enrich in place — rows fill in with top_games/genre/email after save, table stays visible

**Q3:** Save cap
**Options:** Keep Phase 2 cap (15), Raise to 50, You decide
**Decision:** Keep at 15

---

### Already-Saved Handling

**Question:** Channels already in outreach_channels — show with badge, hide, or show normally?
**Options:** Badge "Already saved" (recommended), Hide, Show normally
**Decision:** Show with "Already saved" badge, checkbox disabled

---

### Micro-Influencer Coverage (user-raised)

**Context:** User raised concern that video search might miss low-view channels.

**Question:** How to improve micro-influencer coverage?
**Options:** Dual search relevance + upload-date (recommended), Upload-date only, Relevance + subscriber filter
**Decision:** Dual search — run both in parallel, deduplicate by channel ID

**Q2:** Subscriber count filter on results?
**Options:** Yes — max-subscribers input (recommended), No — sort by subs ascending, You decide
**Decision:** Yes — add max-subscribers filter input above table (client-side filtering)

---

## Deferred Ideas

- Multi-keyword sweep (run "hades", "hades gameplay" together as one search session)
- View-count filter on discovery results
- Re-enrich from discovery UI (already Phase 4)
