-- 030_scheduled_posts_cron.sql — every 5 minutes, ask the app to post
-- scheduled TikTok videos that are due (the endpoint needs no secret).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule('recktube-scheduled-posts', '*/5 * * * *', $$SELECT net.http_get(url := 'https://www.recktube.xyz/api/cron/posts', timeout_milliseconds := 60000)$$);
