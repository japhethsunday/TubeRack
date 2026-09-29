-- 020_tiktok.sql — TikTok account connections and posts.
CREATE TABLE IF NOT EXISTS tiktok_connections (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  open_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  -- AES-256-GCM ciphertext (see src/server/secret-box.ts); never plaintext.
  refresh_token_enc TEXT NOT NULL,
  access_token_enc TEXT,
  access_expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  scopes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tiktok_posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id TEXT,
  publish_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('direct', 'draft')),
  caption TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'processing',
  fail_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tiktok_posts_ws ON tiktok_posts (workspace_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tiktok_connections', 'tiktok_posts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO tuberack_app', t);
      EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
      EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
