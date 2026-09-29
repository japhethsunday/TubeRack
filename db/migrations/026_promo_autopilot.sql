-- 026_promo_autopilot.sql — promos written automatically each day.
ALTER TABLE promo_videos ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE promo_videos ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready';
CREATE INDEX IF NOT EXISTS promo_videos_created_idx ON promo_videos (created_at DESC);
