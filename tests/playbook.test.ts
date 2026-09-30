import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYBOOK, playbookText } from "@/src/content/playbook";
import { HELP_ARTICLES, HELP_CATEGORIES } from "@/src/content/help";
import { FEATURES } from "@/src/lib/plans";

test("every playbook entry is complete", () => {
  const ids = new Set<string>();
  for (const e of PLAYBOOK) {
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`);
    ids.add(e.id);
    assert.ok(e.what.length > 20 && e.where && e.steps.length && e.problems.length, e.id);
  }
});

test("help articles have unique slugs and known categories", () => {
  const slugs = HELP_ARTICLES.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(HELP_ARTICLES.every((a) => HELP_CATEGORIES.includes(a.category)));
  assert.ok(HELP_ARTICLES.some((a) => a.slug === "guide-channel-creator"));
});

test("playbook plans agree with the plan rules", () => {
  const byName = (n: string) => PLAYBOOK.find((e) => e.id === n)!;
  assert.equal(byName("storyboard").plan, "Creator");
  assert.equal(FEATURES.storyboard.tier, "creator");
  assert.equal(byName("channel-creator").plan, "Pro");
  assert.equal(FEATURES["channel-creator"].tier, "pro");
  assert.equal(byName("abtest").plan, "Pro");
  assert.equal(FEATURES.abtest.tier, "pro");
  assert.equal(byName("calendar").plan, "Creator");
  assert.equal(byName("paying-niches").plan, "Creator");
  assert.equal(byName("video-recreator").plan, "Pro");
  assert.ok(playbookText().length < 30_000);
});
