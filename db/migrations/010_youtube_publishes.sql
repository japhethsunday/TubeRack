-- 010_youtube_publishes.sql — one row per "Publish to YouTube" run.
CREATE TABLE IF NOT EXISTS youtube_publishes (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  video_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT 'private',
  publish_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'published', 'scheduled', 'failed')),
  steps JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS youtube_publishes_project_idx ON youtube_publishes (workspace_id, project_id, created_at DESC);

ALTER TABLE public.youtube_publishes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_publishes FROM anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.youtube_publishes TO tuberack_app;
    DROP POLICY IF EXISTS tuberack_app_all ON public.youtube_publishes;
    CREATE POLICY tuberack_app_all ON public.youtube_publishes TO tuberack_app USING (true) WITH CHECK (true);
  END IF;
END $$;
