import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { applyUsage, __resetLedgerSequence } from "@/src/lib/credits/ledger";

describe("credit ledger", () => {
  beforeEach(() => __resetLedgerSequence());

  it("debits cost and records balanceAfter", () => {
    const { balanceAfter, transaction } = applyUsage({
      accountId: "acct_1",
      kind: "image",
      cost: 4,
      balance: 10,
      ref: "test",
      at: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(balanceAfter, 6);
    assert.equal(transaction.amount, -4);
    assert.equal(transaction.balanceAfter, 6);
    assert.equal(transaction.kind, "image");
  });

  it("rejects overdrafts", () => {
    assert.throws(() =>
      applyUsage({ accountId: "a", kind: "video", cost: 5, balance: 2 }),
    );
  });

  it("rejects non-positive costs", () => {
    assert.throws(() =>
      applyUsage({ accountId: "a", kind: "text", cost: 0, balance: 5 }),
    );
  });
});
