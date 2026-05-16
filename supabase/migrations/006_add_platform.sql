-- ============================================================
-- 006: Add platform column to outreach_channels (Phase 7 — Twitch Discovery)
-- ============================================================
-- Existing rows receive 'youtube' via the column DEFAULT.
-- The single-column unique constraint on youtube_id is replaced by a
-- composite (youtube_id, platform) unique to allow the same handle to
-- appear on different platforms (e.g. a creator whose Twitch login matches
-- their YouTube handle).
-- Apply in Supabase Dashboard SQL editor (same procedure as migrations 001-005).
-- ============================================================

ALTER TABLE outreach_channels
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'youtube';

ALTER TABLE outreach_channels
  DROP CONSTRAINT IF EXISTS outreach_channels_youtube_id_key;

ALTER TABLE outreach_channels
  ADD CONSTRAINT outreach_channels_platform_id_key
  UNIQUE (youtube_id, platform);
