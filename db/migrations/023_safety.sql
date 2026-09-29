-- 023_safety.sql — safety guard: a one-way fingerprint of the network each
-- account signed up from (HMAC, never the raw IP) and flags for review.

ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_fp TEXT;
CREATE INDEX IF NOT EXISTS users_signup_fp_idx ON users (signup_fp, created_at) WHERE signup_fp IS NOT NULL;

CREATE TABLE IF NOT EXISTS safety_flags (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  evidence TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  auto_action TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT UNIQUE,
  resolved_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS safety_flags_open_idx ON safety_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS safety_flags_user_idx ON safety_flags (user_id);
CREATE INDEX IF NOT EXISTS safety_flags_resolved_by_idx ON safety_flags (resolved_by);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['safety_flags'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO tuberack_app', t);
      EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
      EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
