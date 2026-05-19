-- 010: Add has_hidden_email signal from YouTube can_reveal_email
-- null  = channel not yet enriched (or enriched before this migration)
-- true  = YouTube reports a hidden business email behind the reCAPTCHA reveal button
-- false = YouTube confirms no hidden email on this channel

ALTER TABLE outreach_channels
  ADD COLUMN IF NOT EXISTS has_hidden_email boolean;
