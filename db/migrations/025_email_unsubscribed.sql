-- 025_email_unsubscribed.sql — remember an explicit "no email" (unsubscribe
-- link or switching product email off), separate from never having opted in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_unsubscribed_at TIMESTAMPTZ;
