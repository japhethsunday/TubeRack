-- 012_market_channels.sql — niche market research and channel plans.

-- Public YouTube market samples, shared across workspaces (no user data):
-- one row per (query, region), refreshed after 24 h to protect API quota.
CREATE TABLE IF NOT EXISTS niche_market_cache (
  key TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_niches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, query, region)
);
CREATE INDEX IF NOT EXISTS saved_niches_ws_idx ON saved_niches (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  niche TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  inputs JSONB NOT NULL,
  plan JSONB NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT NOT NULL DEFAULT '',
  applied JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channel_plans_ws_idx ON channel_plans (workspace_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['niche_market_cache', 'saved_niches', 'channel_plans'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO tuberack_app', t);
      EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
      EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
