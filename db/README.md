# Database

PostgreSQL on Supabase (project `tuberack`, `DATABASE_URL` = transaction pooler string). Migrations are plain SQL,
applied in filename order inside transactions, recorded in
`schema_migrations`. Never edited after merge — always add a new file.

## Design choices

- **Normalized** where rows are queried across tenants: users, sessions,
  tokens, workspaces, memberships, channels, projects, events, assets,
  opportunities, analytics rows, credits, notifications, audit.
- **JSONB documents** where data is always scoped to one project: scripts,
  boards, compositions (+snapshots), intelligence, packaging. One row per
  project, validated shapes, 5 MB caps.
- Soft delete for users/workspaces/projects/channels; hard delete with
  `ON DELETE CASCADE` for owned children; audit rows use `SET NULL` so the
  trail survives account removal.

## Run migrations

```bash
# .env.local must define DATABASE_URL (never commit it)
npm run db:migrate
```

Re-running is safe (applied versions are skipped).

## Verify

```bash
curl -b cookies.txt http://localhost:3000/api/v1/system/db-status
# {"data":{"applied":["001_core","002_content","003_platform","004_project_extras","005_jobs","006_supabase_lockdown"],"upToDate":true}}
```

## Backups & recovery (production configuration)

Supabase project backups are managed in the Supabase dashboard (Database →
Backups) — enable scheduled backups there; this repo does not claim they
are active. Recovery procedure:

1. Restore the project backup to a staging project first.
2. Run `npm run db:migrate` against staging to confirm schema currency.
3. Point the app at the restored database only after verification.
4. Migration rollback: each file is additive; rolling back means restoring
   from backup, never `DROP TABLE` in production.

## What still needs production configuration

- Real `DATABASE_URL` per environment (dev/staging/prod).
- `JWT_SECRET` + `ENCRYPTION_KEY` generated per environment.
- Backups / PITR configured in the Supabase dashboard.
- Email provider for verification/recovery delivery (tokens work; sending waits).
- Storage bucket reachability confirmed via `/api/v1/system/status`.
