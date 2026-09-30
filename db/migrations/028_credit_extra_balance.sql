-- 028_credit_extra_balance.sql — monthly credits no longer roll over.
-- `balance` stays the total a workspace can spend. `extra_balance` is the
-- part of it that was bought (credit packs) or gifted (admin, codes,
-- referrals): it carries over. At each 30-day reset the balance becomes
-- monthly_grant + whatever extra credits are still unspent.
ALTER TABLE credit_accounts ADD COLUMN IF NOT EXISTS extra_balance INTEGER NOT NULL DEFAULT 0;
-- Existing accounts keep what they hold above their monthly allowance as extra credits.
UPDATE credit_accounts SET extra_balance = GREATEST(0, balance - monthly_grant) WHERE extra_balance = 0;
