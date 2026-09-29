-- 027_promo_posted.sql — the YouTube video a promo became (hands-free autopilot).
ALTER TABLE promo_videos ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;
ALTER TABLE promo_videos ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE promo_videos ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';
