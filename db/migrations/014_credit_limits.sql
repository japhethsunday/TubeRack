-- 014_credit_limits.sql — monthly credit allowance per workspace, managed by admins.
ALTER TABLE credit_accounts ADD COLUMN IF NOT EXISTS monthly_grant INTEGER NOT NULL DEFAULT 500 CHECK (monthly_grant >= 0);
ALTER TABLE credit_accounts ADD COLUMN IF NOT EXISTS unlimited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE credit_accounts ADD COLUMN IF NOT EXISTS refilled_at TIMESTAMPTZ;
INSERT INTO credit_accounts (workspace_id, balance)
  SELECT w.id, 0 FROM workspaces w LEFT JOIN credit_accounts c ON c.workspace_id = w.id WHERE c.id IS NULL;
