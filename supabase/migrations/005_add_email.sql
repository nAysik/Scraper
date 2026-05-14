-- ============================================================
-- 005: Add email column to outreach_channels (Phase 3, D-11)
-- ============================================================
-- email is extracted from the channel About description via regex during
-- enrichment (D-12). Nullable. No unique constraint (multiple channels may
-- share an email or have none).
-- ============================================================
alter table outreach_channels
  add column if not exists email text;
