-- 003_platform.sql — intelligence, packaging, analytics, credits, ops.
-- Per-project intelligence/packaging are JSONB documents (always scoped to
-- one project). Analytics rows, credits, notifications, and audit are
-- normalized for filtering, pagination, and ledger integrity.

-- Workspace-level opportunities (optional project link).
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  angle TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  reasoning TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  source_task TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'chosen', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunities_workspace_idx ON opportunities (workspace_id, status, created_at DESC);

-- One intelligence document per project: audience, strategy, titles, hooks,
-- retention, brief, voice profiles, consistency, history.
CREATE TABLE IF NOT EXISTS project_intel (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  project_id TEXT NOT NULL UNIQUE REFERENCES projects (id) ON DELETE CASCADE,
  audience JSONB,
  strategy JSONB,
  titles JSONB NOT NULL DEFAULT '[]',
  hooks JSONB NOT NULL DEFAULT '[]',
  retention JSONB NOT NULL DEFAULT '[]',
  brief TEXT NOT NULL DEFAULT '',
  voices JSONB NOT NULL DEFAULT '[]',
  consistency JSONB NOT NULL DEFAULT '{}',
  history JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One packaging document per project: concepts, variants, titles, SEO,
-- platform packs, derivatives.
CREATE TABLE IF NOT EXISTS project_packaging (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  project_id TEXT NOT NULL UNIQUE REFERENCES projects (id) ON DELETE CASCADE,
  concepts JSONB NOT NULL DEFAULT '[]',
  variants JSONB NOT NULL DEFAULT '[]',
  titles JSONB NOT NULL DEFAULT '[]',
  seo JSONB NOT NULL DEFAULT '{}',
  packs JSONB NOT NULL DEFAULT '[]',
  items JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Self-reported + future platform performance. Source + timestamp per row.
CREATE TABLE IF NOT EXISTS perf_entries (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'youtube',
  date DATE NOT NULL,
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  watch_hours DOUBLE PRECISION,
  likes INTEGER CHECK (likes IS NULL OR likes >= 0),
  comments INTEGER CHECK (comments IS NULL OR comments >= 0),
  shares INTEGER CHECK (shares IS NULL OR shares >= 0),
  subs_gained INTEGER,
  impressions INTEGER CHECK (impressions IS NULL OR impressions >= 0),
  ctr DOUBLE PRECISION CHECK (ctr IS NULL OR (ctr >= 0 AND ctr <= 100)),
  avg_view_duration_sec DOUBLE PRECISION CHECK (avg_view_duration_sec IS NULL OR avg_view_duration_sec >= 0),
  retention_pct DOUBLE PRECISION CHECK (retention_pct IS NULL OR (retention_pct >= 0 AND retention_pct <= 100)),
  traffic_source TEXT,
  audience_note TEXT,
  notes TEXT,
  provenance TEXT NOT NULL DEFAULT 'manual' CHECK (provenance IN ('manual', 'platform', 'calculated', 'local')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS perf_entries_project_idx ON perf_entries (project_id, date DESC);
CREATE INDEX IF NOT EXISTS perf_entries_workspace_idx ON perf_entries (workspace_id, date DESC);

CREATE TABLE IF NOT EXISTS retention_notes (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  at_sec DOUBLE PRECISION,
  label TEXT NOT NULL,
  note TEXT NOT NULL,
  section_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS retention_notes_project_idx ON retention_notes (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_signals (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels (id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  implication TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channel_signals_workspace_idx ON channel_signals (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  range_days INTEGER NOT NULL DEFAULT 28,
  entry_count INTEGER NOT NULL DEFAULT 0,
  totals JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_snapshots_workspace_idx ON analytics_snapshots (workspace_id, created_at DESC);

-- Credits: balances change server-side only (grants + validated consumption).
CREATE TABLE IF NOT EXISTS credit_accounts (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces (id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  account_id TEXT NOT NULL REFERENCES credit_accounts (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_transactions_account_idx ON credit_transactions (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1 CHECK (units > 0),
  model TEXT,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_workspace_idx ON usage_events (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces (id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at, created_at DESC);

-- Append-only audit trail. Users null out (SET NULL) but rows never cascade.
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT REFERENCES workspaces (id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_workspace_idx ON audit_log (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (user_id, created_at DESC);
