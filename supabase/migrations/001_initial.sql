-- ============================================================
-- Niches
-- ============================================================
create table niches (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  description text,
  created_at  timestamptz default now()
);

-- ============================================================
-- Channels
-- ============================================================
create table channels (
  id               uuid        primary key default gen_random_uuid(),
  youtube_id       text        not null unique,
  name             text        not null,
  subscriber_count bigint      not null default 0,
  niche_id         uuid        references niches(id),
  last_scraped     timestamptz,
  created_at       timestamptz default now()
);

-- ============================================================
-- Videos
-- outlier_score is computed in application code before insert
-- (cross-table generated columns are not supported in Supabase).
-- ============================================================
create table videos (
  id            uuid        primary key default gen_random_uuid(),
  youtube_id    text        not null unique,
  channel_id    uuid        not null references channels(id) on delete cascade,
  title         text        not null,
  view_count    bigint      not null default 0,
  published_at  timestamptz not null,
  outlier_score numeric(10, 2) not null default 0,
  created_at    timestamptz default now()
);

create index videos_outlier_score_idx on videos (outlier_score desc);
create index videos_channel_id_idx    on videos (channel_id);
create index channels_last_scraped_idx on channels (last_scraped asc nulls first);

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table niches   enable row level security;
alter table channels enable row level security;
alter table videos   enable row level security;

-- Authenticated users can read all data
create policy "Authenticated read niches"
  on niches for select
  using (auth.role() = 'authenticated');

create policy "Authenticated read channels"
  on channels for select
  using (auth.role() = 'authenticated');

create policy "Authenticated read videos"
  on videos for select
  using (auth.role() = 'authenticated');

-- Service role bypasses RLS automatically (used by the scraper)

-- ============================================================
-- Seed: default niches
-- ============================================================
insert into niches (name, description) values
  ('Faceless Finance', 'Personal finance, investing, crypto — no on-camera presenter'),
  ('Tech Reviews',     'Consumer tech unboxings and comparisons'),
  ('AI Tools',         'Tutorials and reviews for AI software products'),
  ('Productivity',     'Workflows, tools, and time management'),
  ('Health & Fitness', 'Workout routines, nutrition, wellness'),
  ('Gaming Clips',     'Short highlight and montage channels'),
  ('Education',        'How-to and explainer content'),
  ('Other',            'Uncategorised');
