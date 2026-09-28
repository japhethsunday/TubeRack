-- 015_support.sql — in-app support assistant conversations.
-- A signed-in user chats with the assistant; unresolved chats are handed to
-- the team (status 'handoff') and answered from the admin console.

CREATE TABLE IF NOT EXISTS support_conversations (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handoff', 'resolved')),
  subject TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  handoff_summary TEXT NOT NULL DEFAULT '',
  admin_unread BOOLEAN NOT NULL DEFAULT false,
  user_unread BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_conversations_user_idx ON support_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_conversations_status_idx ON support_conversations (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  conversation_id TEXT NOT NULL REFERENCES support_conversations (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'admin', 'system')),
  body TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_conv_idx ON support_messages (conversation_id, created_at);

-- Same lockdown as 006/007: RLS on, only the app role gets a policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['support_conversations', 'support_messages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO tuberack_app', t);
      EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
      EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
