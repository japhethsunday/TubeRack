import type { CreditTransaction, UsageKind } from "@/src/types/domain";

export interface ApplyUsageInput {
  accountId: string;
  kind: UsageKind;
  /** Positive integer cost in credits. */
  cost: number;
  balance: number;
  ref?: string;
  at?: string;
}

let seq = 0;

/**
 * Central credit-ledger helper. All expensive operations must flow through here
 * so future subscription tiers require no architectural change.
 * Pure function: throws on invalid debit, never mutates external state.
 */
export function applyUsage(input: ApplyUsageInput): {
  balanceAfter: number;
  transaction: CreditTransaction;
} {
  if (!Number.isInteger(input.cost) || input.cost <= 0) {
    throw new Error("Usage cost must be a positive integer");
  }
  if (!Number.isInteger(input.balance) || input.balance < 0) {
    throw new Error("Balance must be a non-negative integer");
  }
  if (input.balance < input.cost) {
    throw new Error("Insufficient credits");
  }
  const balanceAfter = input.balance - input.cost;
  seq += 1;
  return {
    balanceAfter,
    transaction: {
      id: `txn_${Date.now().toString(36)}_${seq}`,
      accountId: input.accountId,
      kind: input.kind,
      amount: -input.cost,
      balanceAfter,
      ref: input.ref,
      createdAt: input.at ?? new Date().toISOString(),
    },
  };
}

/** For tests: reset deterministic id sequence. */
export function __resetLedgerSequence(): void {
  seq = 0;
}
