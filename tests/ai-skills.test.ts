import { test } from "node:test";
import assert from "node:assert/strict";
import { skillsFor, skillsForTask } from "@/src/server/ai/skills";

test("skills: honesty always included, requested playbooks added, none when not asked", () => {
  const text = skillsFor(["content", "marketing"]);
  assert.match(text, /Professional standards/);
  assert.match(text, /Content creation skill/);
  assert.match(text, /Marketing skill/);
  assert.doesNotMatch(text, /Digital product skill/);
  assert.equal(skillsFor(undefined), "");
  assert.ok(text.length < 6000, "kept compact");
});

test("skills: tasks map to the right playbooks", () => {
  assert.ok(skillsForTask("thumbnail-concepts").includes("youtube"));
  assert.ok(skillsForTask("platform-copy").includes("marketing"));
  assert.ok(skillsForTask("repurpose-plan").includes("influencer"));
});
