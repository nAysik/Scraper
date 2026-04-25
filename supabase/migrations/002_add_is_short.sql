ALTER TABLE videos
  ADD COLUMN is_short boolean NOT NULL DEFAULT false;

CREATE INDEX videos_is_short_idx ON videos (is_short)
  WHERE is_short = true;
