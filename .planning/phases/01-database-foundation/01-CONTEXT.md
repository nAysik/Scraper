# Phase 1: Database Foundation - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the `outreach_channels` Supabase table via a new SQL migration file. Deliver the table schema, RLS policies, and any supporting indexes so Phases 2–4 can read and write enriched channel data. No application code in this phase — migration SQL only.

</domain>

<decisions>
## Implementation Decisions

### top_games Column Type
- **D-01:** `top_games` is stored as `text[]` (Postgres native text array), not jsonb. Stores exactly `["Minecraft", "Stardew Valley", "Terraria"]`. Simple to write from application code and straightforward to render in the dashboard.

### NULL Handling for Enriched Fields
- **D-02:** Enriched fields (`top_games`, `genre`, `median_views`, `last_enriched_at`) are nullable at the DB level. A row can exist in `outreach_channels` before enrichment completes (partial failures don't block row creation). Application code is responsible for completeness.

### Claude's Discretion
- `url` column semantics (full URL vs handle) and whether it needs a unique constraint — planner decides based on how Phase 2 uses it as input
- `subscriber_count` nullability — planner decides; likely nullable since it is fetched during enrichment
- Index strategy (e.g., on `genre`, `median_views`, `subscriber_count` for Phase 4 filtering) — planner decides whether to add now or defer to Phase 4
- Migration file number — follow sequential pattern (001, 002, 003 exist → next is 004)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Migration Pattern
- `supabase/migrations/001_initial.sql` — canonical RLS pattern, uuid primary key convention, timestamptz defaults, index naming (`{table}_{field}_idx`). Follow this exactly.

### Requirements
- `.planning/REQUIREMENTS.md` §Database — DB-01 (schema fields), DB-02 (migration + RLS)

### Supabase Client Pattern
- `src/lib/supabase/server.ts` — `createServiceClient()` is the single source of truth for service role writes; do not create new client instances elsewhere

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supabase/migrations/001_initial.sql`: complete RLS policy pattern to copy — `enable row level security` + `create policy "Authenticated read X" on X for select using (auth.role() = 'authenticated')`. Service role bypasses RLS automatically (no explicit write policy needed).
- `src/lib/supabase/server.ts`: `createServiceClient()` — all writes to `outreach_channels` must use this, not a new client.

### Established Patterns
- Primary key: `uuid primary key default gen_random_uuid()`
- Timestamp columns: `timestamptz default now()`
- `youtube_id text not null unique` — unique constraint exists on the `channels` table; same pattern expected here for safe upsert
- Migration numbering: sequential integers zero-padded to 3 digits (`001`, `002`, `003`) — next is `004`
- No seed data needed for this table (unlike `niches` which seeds 8 default values)

### Integration Points
- New migration file goes in `supabase/migrations/` — run in Supabase Dashboard SQL editor
- `outreach_channels` is a standalone table; no foreign key to existing `channels` or `niches` tables (separate data model and lifecycle)
- Phases 2–4 will import `createServiceClient()` from `src/lib/supabase/server.ts` for all writes

</code_context>

<specifics>
## Specific Ideas

- The `top_games` text array naturally supports `@>` containment queries if Phase 4 ever adds "filter by game" — no schema change needed later.
- Following the existing `channels` table pattern closely makes the codebase more predictable for future developers.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Database Foundation*
*Context gathered: 2026-05-10*
