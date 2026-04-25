CREATE TABLE video_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  view_count  bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX video_snapshots_video_id_idx ON video_snapshots (video_id, recorded_at DESC);
