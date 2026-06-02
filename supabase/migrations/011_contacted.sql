-- ============================================================
-- 011: Add contacted flag to outreach_channels
-- Tracks whether the creator has been manually contacted.
-- Apply in Supabase Dashboard SQL editor.
-- ============================================================

ALTER TABLE outreach_channels
  ADD COLUMN IF NOT EXISTS contacted boolean NOT NULL DEFAULT false;
