-- 029_scheduled_posts.sql — TikTok posts queued for a set time.
-- TikTok's API has no scheduling, so the video is uploaded now and a
-- background job posts it when `post_at` arrives.
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'tiktok' CHECK (platform IN ('tiktok')),
  project_id TEXT,
  promo_id TEXT,
  file_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  post_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posting', 'posted', 'failed', 'cancelled')),
  publish_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_posts_due ON scheduled_posts (post_at) WHERE status = 'pending';
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
