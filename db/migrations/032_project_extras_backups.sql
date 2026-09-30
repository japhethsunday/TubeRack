-- 032_project_extras_backups.sql — allow the Video Studio's timeline backups
-- (the sync writes key 'timeline-backups'; the old check only allowed three keys).
ALTER TABLE project_extras DROP CONSTRAINT IF EXISTS project_extras_key_check;
ALTER TABLE project_extras ADD CONSTRAINT project_extras_key_check CHECK (key = ANY (ARRAY['loops', 'voices', 'consistency', 'timeline-backups']));
