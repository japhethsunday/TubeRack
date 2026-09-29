-- 024_assistant_chats.sql — saved admin assistant conversations (one owner each).

CREATE TABLE IF NOT EXISTS admin_assistant_chats (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  admin_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  turns JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_assistant_chats_admin_idx ON admin_assistant_chats (admin_id, updated_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_assistant_chats'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO tuberack_app', t);
      EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
      EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
