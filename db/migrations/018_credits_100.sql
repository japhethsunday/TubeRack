-- 018_credits_100.sql — new pricing: every account gets 100 credits a month
-- (one full generated video, or 10 images).
ALTER TABLE credit_accounts ALTER COLUMN monthly_grant SET DEFAULT 100;
