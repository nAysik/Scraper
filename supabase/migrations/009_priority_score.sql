-- 009: Add AI priority scoring columns to outreach_channels
-- priority_score: integer 1–10 assigned by gpt-4o-mini (null = not yet scored)
-- priority_reason: one-sentence explanation of the score (null = not yet scored)

ALTER TABLE outreach_channels
  ADD COLUMN IF NOT EXISTS priority_score  int,
  ADD COLUMN IF NOT EXISTS priority_reason text;
