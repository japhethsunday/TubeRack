-- 001_core.sql — identity, tenancy, brand.
-- Design: normalized tables for access-controlled entities. Project-scoped
-- documents (scripts, boards, intel) live in 002/003 as JSONB rows because
-- they are always read/written per project, never queried across rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users own everything through workspaces. Email compare is case-insensitive
-- via a functional unique index (no citext dependency).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email)) WHERE deleted_at IS NULL;

-- Opaque session tokens: only SHA-256 hashes are stored, raw values live in
-- httpOnly cookies. Rotation links families for reuse detection.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_from TEXT REFERENCES auth_sessions (id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id, expires_at);

-- Verification + recovery tokens. Hashes only; email delivery is a later phase.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'recovery')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id, purpose);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  owner_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_unique ON workspaces (lower(slug)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'editor', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS memberships_workspace_idx ON memberships (workspace_id, role);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  niche TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS channels_workspace_idx ON channels (workspace_id, updated_at DESC);

-- Brand/Channel DNA: one row per channel, consumed by every studio.
CREATE TABLE IF NOT EXISTS brand_profiles (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  channel_id TEXT NOT NULL UNIQUE REFERENCES channels (id) ON DELETE CASCADE,
  identity TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  voice TEXT NOT NULL DEFAULT '',
  topics TEXT NOT NULL DEFAULT '',
  pillars TEXT NOT NULL DEFAULT '',
  formats TEXT NOT NULL DEFAULT '',
  visual_identity TEXT NOT NULL DEFAULT '',
  use_words TEXT NOT NULL DEFAULT '',
  avoid_words TEXT NOT NULL DEFAULT '',
  positioning TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
