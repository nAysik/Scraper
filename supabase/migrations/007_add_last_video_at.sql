-- ============================================================
-- 007: Add last_video_at column to outreach_channels
-- Records the publish date of the channel's most recent YouTube
-- video at the time of enrichment. Null for Twitch channels and
-- for channels enriched before this migration.
-- Apply in Supabase Dashboard SQL editor.
-- ============================================================

ALTER TABLE outreach_channels
  ADD COLUMN IF NOT EXISTS last_video_at timestamptz;
