-- Content Creator: every generated idea set is kept in the workspace (like channel_plans).
CREATE TABLE IF NOT EXISTS content_idea_sets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  niche TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_idea_sets_ws_idx ON content_idea_sets (workspace_id, created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.content_idea_sets ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.content_idea_sets FROM anon, authenticated;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_idea_sets TO tuberack_app;
    DROP POLICY IF EXISTS tuberack_app_all ON public.content_idea_sets;
    CREATE POLICY tuberack_app_all ON public.content_idea_sets TO tuberack_app USING (true) WITH CHECK (true);
  END IF;
END $$;
