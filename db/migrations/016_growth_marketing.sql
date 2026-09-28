-- 016_growth_marketing.sql — marketing opt-in, referrals, signup sources,
-- email campaigns with open/click tracking, lifecycle emails, promo videos.

ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_source TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_campaign TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users (referral_code) WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  referrer_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  referred_id TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'blocked')),
  reward INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rewarded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT 'opted_in',
  content JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns (status, scheduled_at);

CREATE TABLE IF NOT EXISTS campaign_sends (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);
CREATE INDEX IF NOT EXISTS campaign_sends_campaign_idx ON campaign_sends (campaign_id, status);

CREATE TABLE IF NOT EXISTS lifecycle_sends (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS promo_videos (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  length_sec INTEGER NOT NULL DEFAULT 30,
  package JSONB NOT NULL DEFAULT '{}',
  project_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same lockdown as 006/007: RLS on, only the app role gets a policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['referrals', 'campaigns', 'campaign_sends', 'lifecycle_sends', 'promo_videos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO tuberack_app', t);
      EXECUTE format('DROP POLICY IF EXISTS tuberack_app_all ON public.%I', t);
      EXECUTE format('CREATE POLICY tuberack_app_all ON public.%I TO tuberack_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
