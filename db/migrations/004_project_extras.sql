-- 004_project_extras.sql — generic per-project extension store.
-- Anything project-scoped that is not yet a normalized table (script loops,
-- voice profiles, consistency settings, future extras) lives here as
-- validated JSONB under a namespaced key, instead of new tables per feature.

CREATE TABLE IF NOT EXISTS project_extras (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key IN ('loops', 'voices', 'consistency')),
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
CREATE INDEX IF NOT EXISTS project_extras_project_idx ON project_extras (project_id, key);
