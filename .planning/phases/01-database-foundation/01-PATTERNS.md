# Phase 1: Database Foundation - Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 1 (new migration SQL file)
**Analogs found:** 3 / 1 (three existing migrations cover all sub-patterns)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/004_outreach_channels.sql` | migration | CRUD | `supabase/migrations/001_initial.sql` | exact |

## Pattern Assignments

### `supabase/migrations/004_outreach_channels.sql` (migration, CRUD)

**Primary analog:** `supabase/migrations/001_initial.sql`
**Secondary analogs:** `supabase/migrations/002_add_is_short.sql`, `supabase/migrations/003_video_snapshots.sql`

---

**Section header / comment block pattern** (`001_initial.sql` lines 1–2, 13–14, 29–31):
```sql
-- ============================================================
-- Channels
-- ============================================================
create table channels (
```
Use the same `-- ===...=== / -- TableName / -- ===...===` banner for each logical section.

---

**Primary key convention** (`001_initial.sql` line 15):
```sql
  id               uuid        primary key default gen_random_uuid(),
```
Every table uses `uuid primary key default gen_random_uuid()`. No integer sequences, no serial.

---

**Unique identity column for YouTube entities** (`001_initial.sql` line 16):
```sql
  youtube_id       text        not null unique,
```
The `channels` table enforces `not null unique` on `youtube_id` so upserts are safe. Apply the same pattern to `outreach_channels.youtube_id`.

---

**Nullable vs. not-null column convention** (`001_initial.sql` lines 17–21):
```sql
  name             text        not null,
  subscriber_count bigint      not null default 0,
  niche_id         uuid        references niches(id),
  last_scraped     timestamptz,
  created_at       timestamptz default now()
```
- Identity/name fields: `not null`
- Count fields on the existing `channels` table use `not null default 0`, but per decision D-02 enriched fields on `outreach_channels` are nullable (no `default 0`)
- Optional timestamps (e.g. `last_scraped`, `last_enriched_at`): no default, nullable
- Audit timestamp (`created_at`): `timestamptz default now()`

---

**Text array column** (no direct analog in existing migrations — use standard Postgres syntax):
```sql
  top_games        text[],
```
Postgres native array; nullable per D-02. Supports `@>` containment queries without a schema change.

---

**Index naming convention** (`001_initial.sql` lines 40–42):
```sql
create index videos_outlier_score_idx on videos (outlier_score desc);
create index videos_channel_id_idx    on videos (channel_id);
create index channels_last_scraped_idx on channels (last_scraped asc nulls first);
```
Pattern: `{table}_{field}_idx`. Directional modifier (`desc`, `asc nulls first`) is added when the dominant query order is known.

**Partial index variant** (`002_add_is_short.sql` lines 3–5):
```sql
CREATE INDEX videos_is_short_idx ON videos (is_short)
  WHERE is_short = true;
```
Use a partial index when the indexed value is sparse (only a small subset of rows). Not needed for `outreach_channels` fields, but available if Phase 4 adds one.

**Composite index variant** (`003_video_snapshots.sql` line 8):
```sql
CREATE INDEX video_snapshots_video_id_idx ON video_snapshots (video_id, recorded_at DESC);
```
Use a composite index when queries filter on one column and order by another. Candidate for `outreach_channels` if Phase 4 orders by `median_views desc` or `subscriber_count desc`.

---

**RLS enable pattern** (`001_initial.sql` lines 47–49):
```sql
alter table niches   enable row level security;
alter table channels enable row level security;
alter table videos   enable row level security;
```
One `alter table X enable row level security;` statement per table, grouped together after all `create index` statements.

---

**Authenticated read policy — `auth.role()` style** (`001_initial.sql` lines 52–63):
```sql
create policy "Authenticated read channels"
  on channels for select
  using (auth.role() = 'authenticated');
```
This is the canonical style used in `001`. Note: `003_video_snapshots.sql` uses an alternative style (`TO authenticated USING (true)`) — the planner should pick one style and be consistent. `001` style is preferred as the canonical reference.

**Alternative RLS style for reference** (`003_video_snapshots.sql` lines 12–15):
```sql
CREATE POLICY "Authenticated users can read snapshots"
  ON video_snapshots FOR SELECT
  TO authenticated
  USING (true);
```
Both are functionally equivalent. Use `001` style for `outreach_channels` for consistency.

---

**Service role write comment** (`001_initial.sql` line 64):
```sql
-- Service role bypasses RLS automatically (used by the scraper)
```
No explicit write policy is needed. Include this comment after the read policy to document intent.

---

**No seed data** — unlike `niches`, `outreach_channels` needs no seed rows. Omit the `insert into` block entirely.

---

## Shared Patterns

### Migration file casing
`001_initial.sql` uses lowercase SQL keywords (`create table`, `alter table`, `create index`, `create policy`). `002` and `003` use uppercase. The planner should follow `001` lowercase style since it is the canonical reference stated in CONTEXT.md.

### Timestamp columns
**Source:** `supabase/migrations/001_initial.sql` lines 8, 21, 37
**Apply to:** every table
```sql
created_at  timestamptz default now()
```
`last_enriched_at` is a nullable `timestamptz` with no default (same pattern as `last_scraped` on `channels`).

### UUID primary key
**Source:** `supabase/migrations/001_initial.sql` lines 5, 15, 31
**Apply to:** every new table
```sql
id  uuid  primary key default gen_random_uuid()
```

### Authenticated read RLS
**Source:** `supabase/migrations/001_initial.sql` lines 52–63
**Apply to:** every new table
```sql
alter table {table} enable row level security;

create policy "Authenticated read {table}"
  on {table} for select
  using (auth.role() = 'authenticated');

-- Service role bypasses RLS automatically (used by the scraper)
```

## No Analog Found

None — all required patterns are covered by the three existing migration files.

## Full Schema Reference (assembled from patterns above)

The planner should produce a migration roughly matching this shape:

```sql
-- ============================================================
-- Outreach Channels
-- ============================================================
create table outreach_channels (
  id               uuid        primary key default gen_random_uuid(),
  youtube_id       text        not null unique,
  name             text        not null,
  url              text        not null,          -- full URL or handle; unique TBD by planner
  subscriber_count bigint,                        -- nullable: fetched during enrichment
  top_games        text[],                        -- e.g. {"Minecraft","Stardew Valley"}
  genre            text,                          -- e.g. "Indie", "FPS"
  median_views     bigint,
  last_enriched_at timestamptz,
  created_at       timestamptz default now()
);

create index outreach_channels_genre_idx           on outreach_channels (genre);
create index outreach_channels_median_views_idx    on outreach_channels (median_views desc);
create index outreach_channels_subscriber_count_idx on outreach_channels (subscriber_count desc);

alter table outreach_channels enable row level security;

create policy "Authenticated read outreach_channels"
  on outreach_channels for select
  using (auth.role() = 'authenticated');

-- Service role bypasses RLS automatically (used by the enrichment pipeline)
```

Note: index set and `url` uniqueness are marked as planner discretion per CONTEXT.md decisions section.

## Metadata

**Analog search scope:** `supabase/migrations/`
**Files scanned:** 3 (`001_initial.sql`, `002_add_is_short.sql`, `003_video_snapshots.sql`)
**Pattern extraction date:** 2026-05-10
