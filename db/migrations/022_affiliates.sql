-- 022_affiliates.sql — affiliate partners: tracked links, attributed sign-ups,
-- commissions on paying customers and payouts.

CREATE TABLE IF NOT EXISTS affiliates (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paused')),
  commission_pct INTEGER NOT NULL DEFAULT 30 CHECK (commission_pct BETWEEN 0 AND 90),
  website TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  payout_details TEXT NOT NULL DEFAULT '',
  clicks INTEGER NOT NULL DEFAULT 0,
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_id TEXT REFERENCES affiliates (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_affiliate_id_idx ON users (affiliate_id) WHERE affiliate_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  affiliate_id TEXT NOT NULL REFERENCES affiliates (id) ON DELETE CASCADE,
  referred_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  sale_minor BIGINT NOT NULL CHECK (sale_minor >= 0),
  commission_minor BIGINT NOT NULL CHECK (commission_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'void')),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS affiliate_commissions_aff_idx ON affiliate_commissions (affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_commissions_user_idx ON affiliate_commissions (referred_user_id);
CREATE INDEX IF NOT EXISTS affiliate_commissions_by_idx ON affiliate_commissions (created_by);

-- Same lockdown as the other app tables: RLS on, only the app role gets a policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['affiliates', 'affiliate_commissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO tuberack_app', t);
      EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
      EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
