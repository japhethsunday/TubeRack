-- 009_growth.sql — YouTube channel connection, competitor tracker, trend
-- radar, thumbnail A/B tests, and the content calendar. Workspace-scoped.

CREATE TABLE IF NOT EXISTS youtube_connections (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL DEFAULT '',
  channel_thumbnail TEXT NOT NULL DEFAULT '',
  uploads_playlist TEXT NOT NULL DEFAULT '',
  -- AES-256-GCM ciphertext (see src/server/secret-box.ts); never plaintext.
  refresh_token_enc TEXT NOT NULL,
  access_token_enc TEXT,
  access_expires_at TIMESTAMPTZ,
  scopes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  thumbnail TEXT NOT NULL DEFAULT '',
  subscribers BIGINT,
  uploads_playlist TEXT NOT NULL DEFAULT '',
  seen_outliers TEXT[] NOT NULL DEFAULT '{}',
  last_checked_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel_id)
);

CREATE TABLE IF NOT EXISTS trend_watches (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  email_digest BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_results JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, query, region)
);

CREATE TABLE IF NOT EXISTS thumb_tests (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  video_title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'stopped')),
  rotate_hours INT NOT NULL DEFAULT 24 CHECK (rotate_hours BETWEEN 12 AND 168),
  cycles INT NOT NULL DEFAULT 2 CHECK (cycles BETWEEN 1 AND 6),
  -- [{id,label,storageKey,mime}] and [{variantId,start,end}]
  variants JSONB NOT NULL DEFAULT '[]',
  windows JSONB NOT NULL DEFAULT '[]',
  current_index INT NOT NULL DEFAULT 0,
  next_rotate_at TIMESTAMPTZ,
  results JSONB NOT NULL DEFAULT '{}',
  ai_scores JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS thumb_tests_due_idx ON thumb_tests (status, next_rotate_at);

CREATE TABLE IF NOT EXISTS calendar_items (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id TEXT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'publish' CHECK (kind IN ('idea', 'script', 'record', 'edit', 'thumbnail', 'publish', 'promote', 'other')),
  date DATE NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'skipped')),
  notes TEXT NOT NULL DEFAULT '',
  remind BOOLEAN NOT NULL DEFAULT true,
  reminded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_items_ws_date_idx ON calendar_items (workspace_id, date);
CREATE INDEX IF NOT EXISTS calendar_items_remind_idx ON calendar_items (date) WHERE remind AND reminded_at IS NULL;

-- Same lockdown as 006/007: RLS on, only the app role gets a policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['youtube_connections', 'competitors', 'trend_watches', 'thumb_tests', 'calendar_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO tuberack_app', t);
      EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
      EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
