-- 031_promo_scheduled_for.sql — when a hands-free promo goes public on YouTube (null = posted at once).
ALTER TABLE promo_videos ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
