import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetProjectIds,
  archiveProject,
  buildEvent,
  completeCurrentStage,
  createChannel,
  createProject,
  duplicateProject,
  filterProjects,
  mostRecentActive,
  progressOf,
  continueLabelFor,
  renameProject,
  restoreProject,
  setStageState,
  sortProjects,
} from "@/src/lib/projects/store";
import { emptyBundle, parseBundle } from "@/src/lib/projects/storage";
import type { ProjectInput } from "@/src/lib/projects/types";

const INPUT: ProjectInput = {
  name: "Hook study",
  contentType: "Long-form video",
  platform: "YouTube",
  channelId: "ch_1",
  topic: "Payoff-first openings",
  description: "A test episode.",
  goal: "100k views",
};

describe("project store", () => {
  beforeEach(() => __resetProjectIds());

  it("creates a draft at the idea stage", () => {
    const p = createProject(INPUT, { id: "p1", at: "2026-01-01T00:00:00.000Z" });
    assert.equal(p.status, "draft");
    assert.equal(p.currentStage, "idea");
    assert.equal(p.stages.idea, "in-progress");
    assert.equal(p.stages.script, "not-started");
    assert.equal(progressOf(p), 0);
    assert.equal(continueLabelFor(p), "Refine idea");
  });

  it("renames, duplicates, archives, restores", () => {
    const p = createProject(INPUT, { id: "p1" });
    const renamed = renameProject(p, "  New name  ");
    assert.equal(renamed.name, "New name");
    assert.throws(() => renameProject(p, "   "));
    const copy = duplicateProject(renamed, { id: "p2" });
    assert.equal(copy.name, "New name (copy)");
    assert.equal(copy.status, "draft");
    assert.notEqual(copy.id, p.id);
    const archived = archiveProject(copy);
    assert.equal(archived.status, "archived");
    assert.equal(continueLabelFor(archived), "Restore to continue");
    assert.equal(restoreProject(archived).status, "draft");
  });

  it("advances one stage at a time and tracks progress", () => {
    let p = createProject(INPUT, { id: "p1" });
    p = completeCurrentStage(p);
    assert.equal(p.stages.idea, "complete");
    assert.equal(p.currentStage, "research");
    assert.equal(p.stages.research, "in-progress");
    assert.equal(p.status, "active");
    assert.equal(progressOf(p), 7); // 1 of 15
    assert.equal(continueLabelFor(p), "Continue research");
    const moved = setStageState(p, "script", "complete");
    assert.equal(moved.stages.script, "complete");
  });

  it("filters by query, status, and channel; sorts by recency, name, progress", () => {
    const a = createProject({ ...INPUT, name: "Alpha hooks", channelId: "ch_1" }, { id: "a", at: "2026-01-01T00:00:00.000Z" });
    const b = completeCurrentStage(createProject({ ...INPUT, name: "Beta retention", channelId: "ch_2" }, { id: "b", at: "2026-02-01T00:00:00.000Z" }));
    const c = archiveProject(createProject({ ...INPUT, name: "Gamma archive", channelId: "ch_1" }, { id: "c", at: "2026-03-01T00:00:00.000Z" }));
    const all = [a, b, c];

    assert.deepEqual(filterProjects(all, "retention", "all", "all").map((p) => p.id), ["b"]);
    assert.deepEqual(filterProjects(all, "", "archived", "all").map((p) => p.id), ["c"]);
    assert.deepEqual(filterProjects(all, "", "all", "all").map((p) => p.id), ["a", "b"]);
    assert.deepEqual(filterProjects(all, "", "all", "ch_2").map((p) => p.id), ["b"]);
    assert.deepEqual(filterProjects(all, "zzz", "all", "all"), []);

    assert.deepEqual(sortProjects([a, b], "recent").map((p) => p.id), ["b", "a"]);
    assert.deepEqual(sortProjects([b, a], "name").map((p) => p.id), ["a", "b"]);
    assert.deepEqual(sortProjects([a, b], "progress").map((p) => p.id), ["b", "a"]);

    assert.equal(mostRecentActive(all)?.id, "b");
    assert.equal(mostRecentActive([c]), null);
    assert.equal(mostRecentActive([]), null);
  });

  it("creates channels and builds categorized events", () => {
    const ch = createChannel("  Studio Ada  ", "Education", { id: "ch_9" });
    assert.equal(ch.name, "Studio Ada");
    assert.throws(() => createChannel("   ", ""));
    const evt = buildEvent("project.created", "Hook study", "Created.", { id: "e1", projectId: "p1" });
    assert.equal(evt.category, "projects");
    assert.equal(buildEvent("project.stage", "X", "d").category, "editing");
    assert.equal(buildEvent("channel.created", "Y", "d").category, "system");
  });
});

describe("workspace storage", () => {
  it("round-trips valid bundles and rejects garbage", () => {
    const bundle = emptyBundle();
    assert.deepEqual(parseBundle(JSON.parse(JSON.stringify(bundle))), bundle);
    assert.throws(() => parseBundle({}), /workspace file/);
    assert.throws(() => parseBundle({ version: 1, projects: [{ id: "x" }], channels: [], events: [] }), /workspace file/);
    assert.throws(() => parseBundle("nope"), /workspace file/);
  });
});
