-- ============================================================
-- Outreach Channels
-- ============================================================
create table outreach_channels (
  id               uuid        primary key default gen_random_uuid(),
  youtube_id       text        not null unique,
  name             text        not null,
  url              text        not null unique,
  subscriber_count bigint,
  top_games        text[],
  genre            text,
  median_views     bigint,
  last_enriched_at timestamptz,
  created_at       timestamptz default now()
);

create index outreach_channels_genre_idx            on outreach_channels (genre);
create index outreach_channels_median_views_idx     on outreach_channels (median_views desc);
create index outreach_channels_subscriber_count_idx on outreach_channels (subscriber_count desc);

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table outreach_channels enable row level security;

create policy "Authenticated read outreach_channels"
  on outreach_channels for select
  using (auth.role() = 'authenticated');

-- Service role bypasses RLS automatically (used by the enrichment pipeline)
