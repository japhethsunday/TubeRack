-- 011_rate_limits.sql — fixed-window counters shared by every server instance
-- (brute-force and cost-abuse protection that in-memory limiters can't give
-- on serverless).
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tuberack_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO tuberack_app;
    DROP POLICY IF EXISTS tuberack_app_all ON public.rate_limits;
    CREATE POLICY tuberack_app_all ON public.rate_limits TO tuberack_app USING (true) WITH CHECK (true);
  END IF;
END $$;
