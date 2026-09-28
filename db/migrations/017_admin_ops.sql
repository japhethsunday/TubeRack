-- 017_admin_ops.sql — admin operations: pricing plans, settings (feature
-- switches, provider cost rates), and admin team members with roles.

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  kind TEXT NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription', 'pack')),
  price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (char_length(currency) = 3),
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  active BOOLEAN NOT NULL DEFAULT true,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY CHECK (char_length(key) <= 60),
  value JSONB NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_members (
  email TEXT PRIMARY KEY CHECK (char_length(email) <= 254),
  role TEXT NOT NULL CHECK (role IN ('support', 'finance', 'operations')),
  added_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plans', 'admin_settings', 'admin_members'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO tuberack_app', t);
      EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
      EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
