-- ============================================================
-- 008: Email campaigns + per-send tracking
-- Already applied in Supabase Dashboard.
-- ============================================================

create table campaigns (
  id                   uuid        primary key default gen_random_uuid(),
  name                 text        not null,
  subject_template     text        not null,
  body_text_template   text        not null,
  body_html_template   text        not null,
  status               text        not null default 'draft',
  created_at           timestamptz default now()
);

create table campaign_sends (
  id            uuid        primary key default gen_random_uuid(),
  campaign_id   uuid        not null references campaigns(id) on delete cascade,
  youtube_id    text        not null,
  email         text        not null,
  channel_name  text        not null,
  status        text        not null default 'pending',
  sent_at       timestamptz,
  clicked_at    timestamptz
);

create index campaign_sends_campaign_id_idx on campaign_sends (campaign_id);

alter table campaigns      enable row level security;
alter table campaign_sends enable row level security;

create policy "Authenticated read campaigns"
  on campaigns for select using (auth.role() = 'authenticated');

create policy "Authenticated read campaign_sends"
  on campaign_sends for select using (auth.role() = 'authenticated');
