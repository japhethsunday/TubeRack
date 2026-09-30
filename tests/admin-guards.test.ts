import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("admin assistant guardrails", () => {
  before(() => {
    process.env.JWT_SECRET = "test-secret-for-admin-guards-0123456789abcdef";
  });

  it("flags removals, emails to everyone and big grants as high impact", async () => {
    const { highImpact } = await import("@/src/server/admin-agent/guards");
    assert.deepEqual(highImpact([{ name: "remove_credits", args: { amount: 10 } }]), [true]);
    assert.deepEqual(highImpact([{ name: "email_everyone", args: {} }]), [true]);
    assert.deepEqual(highImpact([{ name: "give_credits", args: { amount: 1000 } }]), [true]);
    assert.deepEqual(highImpact([{ name: "give_credits", args: { amount: 100 } }]), [false]);
    assert.deepEqual(highImpact([{ name: "send_email", args: {} }]), [false]);
  });

  it("flags a batch of credit changes over 3 accounts or 500 credits", async () => {
    const { highImpact } = await import("@/src/server/admin-agent/guards");
    const four = Array.from({ length: 4 }, () => ({ name: "give_credits", args: { amount: 10 } }));
    assert.ok(highImpact(four).every(Boolean));
    const two = [{ name: "give_credits", args: { amount: 300 } }, { name: "give_credits", args: { amount: 300 } }];
    assert.ok(highImpact(two).every(Boolean));
    const small = [{ name: "give_credits", args: { amount: 50 } }, { name: "send_email", args: {} }];
    assert.deepEqual(highImpact(small), [false, false]);
  });

  it("recognises emails that claim credits were added", async () => {
    const { claimsCreditsAdded } = await import("@/src/server/admin-agent/guards");
    assert.ok(claimsCreditsAdded("Admin credit bonus: 500 credits added"));
    assert.ok(claimsCreditsAdded("we have added 500 bonus credits to your account"));
    assert.ok(claimsCreditsAdded("Your credits have been credited."));
    assert.ok(claimsCreditsAdded("You've received 200 credits from the team"));
    // Offers and explanations are fine.
    assert.ok(!claimsCreditsAdded("Earn 100 bonus credits for every friend who joins. Your friends also receive 100 free credits."));
    assert.ok(!claimsCreditsAdded("Each video uses 100 credits."));
    assert.ok(!claimsCreditsAdded("That email was sent by mistake and no credits were added."));
  });

  it("carries the high-impact flag inside the signed card", async () => {
    const { signProposal, verifyProposal } = await import("@/src/server/admin-agent/agent");
    const high = verifyProposal(signProposal("admin-1", "remove_credits", { email: "a@b.co", amount: 5, reason: "x" }, true), "admin-1");
    assert.equal(high?.high, true);
    const normal = verifyProposal(signProposal("admin-1", "give_credits", { email: "a@b.co", amount: 5, reason: "x" }), "admin-1");
    assert.equal(normal?.high, false);
  });
});
