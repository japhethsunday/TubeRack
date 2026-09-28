import { test } from "node:test";
import assert from "node:assert/strict";
import { roleAllows } from "@/src/lib/admin-roles";

test("owners can do everything", () => {
  assert.equal(roleAllows("owner", "team.edit"), true);
  assert.equal(roleAllows("owner", "users.delete"), true);
});

test("team roles only reach their areas", () => {
  assert.equal(roleAllows("support", "support.act"), true);
  assert.equal(roleAllows("support", "credits.change"), false);
  assert.equal(roleAllows("finance", "credits.change"), true);
  assert.equal(roleAllows("finance", "bulk.grant"), true);
  assert.equal(roleAllows("finance", "users.delete"), false);
  assert.equal(roleAllows("operations", "features.edit"), true);
  assert.equal(roleAllows("operations", "team.edit"), false);
  // Exact-match actions don't leak to lookalikes.
  assert.equal(roleAllows("operations", "systemx"), false);
  for (const r of ["support", "finance", "operations"] as const) assert.equal(roleAllows(r, "team.view"), false);
});
