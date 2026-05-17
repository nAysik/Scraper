# Phase 9: Outreach Prioritizer — Context

**Gathered:** 2026-05-17
**Status:** Ready for planning

<domain>
## Phase Boundary

An AI-powered relevance scorer for the Outreach List. A "Score all" button opens a small inline form where the user enters their game name and 2–3 comparable titles. GPT-4o-mini then scores every channel in `outreach_channels` 1–10 for outreach fit and writes a one-sentence reason. Scores are stored persistently in the DB so the list can be sorted by score at any time without re-running GPT.

In scope: Score all button, game context form, batch GPT scoring (20 channels per call), score + reason stored in DB, score column in Outreach List (sortable), score badge (HIGH/MEDIUM/LOW).
Out of scope: Per-channel manual scoring, auto-score on enrich, score expiry/freshness tracking, scoring Twitch channels.

</domain>

<decisions>
## Implementation Decisions

### Scoring model and batching
- **D-01:** Use **gpt-4o-mini** — same model as game/genre extraction. ~$0.02–0.05 for 500 channels.
- **D-02:** Send **20 channels per GPT call** (batch to minimise API calls). Each call sends channel name, genre, top_games and gets back an array of `{ youtubeId, score, reason }`.
- **D-03:** Score only **YouTube channels** (`platform = 'youtube'`). Twitch channels have no top_games/genre so scoring is unreliable — skip them silently.

### Game context
- **D-04:** User provides **game name + 2–3 comparable titles** before scoring (e.g. "RealmWalker — similar to Slay the Spire and Hades"). This is a light context prompt, not a full description.
- **D-05:** The game context is **not persisted** — re-entered each time "Score all" is clicked. No settings table needed.

### Score schema
- **D-06:** Add two nullable columns to `outreach_channels`:
  - `priority_score int` — 1–10 (null = not yet scored)
  - `priority_reason text` — one sentence from GPT (null = not yet scored)
- **D-07:** Migration 009. Existing rows get null (unscored) — no backfill needed.

### Scoring trigger
- **D-08:** "Score all" button in the Outreach List toolbar (always visible, same row as other filters).
- **D-09:** Clicking opens a small **inline form** directly in the toolbar row (not a modal): two inputs — game name and comparable games — and a "Run scoring" button.
- **D-10:** While scoring runs: button shows spinner + "Scoring batch N of M…". Scores update in the table as each batch completes (optimistic row-by-row update).

### UI display
- **D-11:** New **Score** column in the Outreach List table, positioned after Genre and before Median views.
- **D-12:** Score displayed as a **badge**: 8–10 = green "HIGH", 5–7 = yellow "MEDIUM", 1–4 = red "LOW". Null = gray "—".
- **D-13:** Score column is **sortable** (descending by default when first scored — highest priority first).
- **D-14:** `priority_reason` shown as a **tooltip on hover** over the badge (not a separate column — keeps the table clean).

### API
- **D-15:** New route `POST /api/outreach/score-all` — auth-gated, accepts `{ gameName, comparables }`, loops through all YouTube channels in batches of 20, calls GPT, upserts scores, streams no progress (client polls or waits for response).
- **D-16:** Since running locally has no timeout issues, the route processes all batches sequentially and returns `{ scored, failed }` when done. Client updates the table by re-fetching `GET /api/outreach/channels` on completion.

### GET channels update
- **D-17:** `GET /api/outreach/channels` adds `priority_score` and `priority_reason` to the SELECT and camelCase mapping so they appear in the OutreachRow.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` §Phase 9
- `src/components/outreach/outreach-list.tsx` — Outreach List table (add Score column, scoring form, toolbar button)
- `src/app/api/outreach/channels/route.ts` — GET route to extend with priority_score/reason
- `src/lib/outreach/extract-games.ts` — existing gpt-4o-mini pattern to follow for the batch scorer
- `supabase/migrations/009_priority_score.sql` — new migration
</canonical_refs>

<deferred>
## Deferred Ideas

- Auto-score on enrich (every new channel gets scored immediately) — adds latency to save flow
- Score expiry / "re-score" freshness indicator
- Scoring Twitch channels
- Persisting the game context so you don't re-enter it each time
- Per-channel manual score override
</deferred>

---

*Phase: 9-Outreach Prioritizer*
*Context gathered: 2026-05-17*
