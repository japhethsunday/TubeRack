-- 007_app_role.sql — dedicated least-privilege login for the app server.
-- DATABASE_URL connects as tuberack_app (via the Supabase pooler as
-- tuberack_app.<project_ref>). The password is set out-of-band, never in git:
--   ALTER ROLE tuberack_app PASSWORD '<secret>';
-- RLS stays on; this role gets a permissive policy, anon/authenticated get none.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
    CREATE ROLE tuberack_app LOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO tuberack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tuberack_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tuberack_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tuberack_app;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
    EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
