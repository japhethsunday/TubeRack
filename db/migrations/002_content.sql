-- 002_content.sql — projects and production documents.
-- Scripts, boards, and compositions are single JSONB documents per project
-- (sections, scenes, clips always load together). Query-heavy entities
-- (projects, events, assets, render requests) are normalized.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'Long-form video',
  platform TEXT NOT NULL DEFAULT 'YouTube',
  topic TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  stages JSONB NOT NULL DEFAULT '{}',
  current_stage TEXT NOT NULL DEFAULT 'idea',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_channel_idx ON projects (channel_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (workspace_id, status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS project_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_events_project_idx ON project_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_events_workspace_idx ON project_events (workspace_id, created_at DESC);

-- One script document per project: sections, versions, notes.
CREATE TABLE IF NOT EXISTS project_scripts (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  project_id TEXT NOT NULL UNIQUE REFERENCES projects (id) ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT 'YouTube long-form',
  tone TEXT NOT NULL DEFAULT 'Conversational',
  complexity TEXT NOT NULL DEFAULT 'Beginner',
  structure TEXT NOT NULL DEFAULT 'Standard',
  target_words INTEGER NOT NULL DEFAULT 900,
  wpm INTEGER NOT NULL DEFAULT 150,
  instruction TEXT NOT NULL DEFAULT '',
  sections JSONB NOT NULL DEFAULT '[]',
  versions JSONB NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One storyboard document per project: ordered scenes.
CREATE TABLE IF NOT EXISTS project_boards (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  project_id TEXT NOT NULL UNIQUE REFERENCES projects (id) ON DELETE CASCADE,
  scenes JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One composition document per project: tracks, clips, canvas, snapshots.
CREATE TABLE IF NOT EXISTS project_compositions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  project_id TEXT NOT NULL UNIQUE REFERENCES projects (id) ON DELETE CASCADE,
  tracks JSONB NOT NULL DEFAULT '[]',
  clips JSONB NOT NULL DEFAULT '[]',
  canvas JSONB NOT NULL DEFAULT '{}',
  snapshots JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Render requests are queue rows (workers consume in Phase 11+).
CREATE TABLE IF NOT EXISTS render_requests (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  preset TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  issues JSONB NOT NULL DEFAULT '[]',
  health TEXT NOT NULL DEFAULT 'review' CHECK (health IN ('ready', 'review', 'blocked')),
  status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('draft', 'saved', 'queued', 'rendering', 'processing', 'completed', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS render_requests_project_idx ON render_requests (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS render_requests_queue_idx ON render_requests (status, created_at) WHERE status IN ('queued', 'rendering', 'processing');

-- Media metadata is queryable; bytes live in object storage (storage_key) or
-- inline BYTEA for small files when storage is unreachable.
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  scene_ids TEXT[] NOT NULL DEFAULT '{}',
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'voice', 'music', 'sfx')),
  source TEXT NOT NULL CHECK (source IN ('local-draft', 'upload-session', 'provider-request')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'generating', 'processing', 'ready', 'failed', 'cancelled')),
  title TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  duration_sec DOUBLE PRECISION,
  width INTEGER,
  height INTEGER,
  file_size BIGINT,
  seed INTEGER,
  tags TEXT[] NOT NULL DEFAULT '{}',
  approval TEXT NOT NULL DEFAULT 'draft' CHECK (approval IN ('draft', 'reviewed', 'approved', 'used', 'rejected')),
  storage_key TEXT,
  inline_bytes BYTEA,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_project_idx ON media_assets (project_id, status, kind);
CREATE INDEX IF NOT EXISTS media_assets_workspace_idx ON media_assets (workspace_id, created_at DESC);
