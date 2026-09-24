-- 006_supabase_lockdown.sql — Supabase hardening.
-- The app talks to Postgres only through its own API as the database owner,
-- so the PostgREST roles (anon, authenticated) get no access: RLS on, no
-- policies, privileges revoked. Also creates the private media bucket.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', false) ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
