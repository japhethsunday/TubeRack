import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __resetDb } from "@/src/server/db";
import { __resetEnvCache } from "@/src/lib/env";
import { BackendError } from "@/src/server/errors";
import {
  canTransition as canTransitionRender,
  assertTransition,
  isTerminal,
} from "@/src/lib/jobs/machine";
import {
  canTransition,
  clampProgress,
  cancelJob,
  claimJob,
  completeJob,
  createJob,
  failJob,
  getJob,
  listJobs,
  retryJob,
} from "@/src/server/jobs/store";

/** Hermetic: pure state machine + graceful degradation without a database. */
describe("render job state machine (existing)", () => {
  it("allows queued -> processing -> completed", () => {
    assert.equal(canTransitionRender("queued", "processing"), true);
    assert.equal(canTransitionRender("processing", "completed"), true);
  });

  it("rejects illegal jumps like queued -> completed", () => {
    assert.equal(canTransitionRender("queued", "completed"), false);
    assert.throws(() => assertTransition("queued", "completed"));
  });

  it("supports failure, retry, cancel, and re-queue recovery", () => {
    assert.equal(canTransitionRender("processing", "failed"), true);
    assert.equal(canTransitionRender("failed", "retrying"), true);
    assert.equal(canTransitionRender("retrying", "processing"), true);
    assert.equal(canTransitionRender("failed", "queued"), true);
    assert.equal(canTransitionRender("cancelled", "queued"), true);
  });

  it("marks completed/cancelled terminal only", () => {
    assert.equal(isTerminal("completed"), true);
    assert.equal(isTerminal("cancelled"), true);
    assert.equal(isTerminal("failed"), false);
    assert.equal(isTerminal("retrying"), false);
  });
});

describe("job state machine", () => {
  afterEach(() => {
    __resetDb();
    __resetEnvCache();
  });

  it("allows only legal transitions", () => {
    assert.equal(canTransition("queued", "processing"), true);
    assert.equal(canTransition("queued", "cancelled"), true);
    assert.equal(canTransition("queued", "completed"), false);
    assert.equal(canTransition("processing", "completed"), true);
    assert.equal(canTransition("processing", "failed"), true);
    assert.equal(canTransition("processing", "retrying"), true);
    assert.equal(canTransition("completed", "retrying"), false);
    assert.equal(canTransition("failed", "retrying"), true);
    assert.equal(canTransition("failed", "processing"), false);
    assert.equal(canTransition("cancelled", "retrying"), true);
    assert.equal(canTransition("retrying", "processing"), true);
    assert.equal(canTransition("retrying", "completed"), false);
  });

  it("clamps progress into 0-100 integers", () => {
    assert.equal(clampProgress(42.9), 42);
    assert.equal(clampProgress(-5), 0);
    assert.equal(clampProgress(500), 100);
    assert.equal(clampProgress("half"), 0);
    assert.equal(clampProgress(NaN), 0);
  });

  it("degrades to BACKEND_UNAVAILABLE without a database (never crashes)", async () => {
    delete process.env.DATABASE_URL;
    __resetEnvCache();
    __resetDb();
    for (const call of [
      () => createJob({ workspaceId: "w1", type: "render" }),
      () => claimJob("j1", "w1"),
      () => completeJob("j1", "w1", {}),
      () => failJob("j1", "w1", "boom"),
      () => cancelJob("j1", "w1"),
      () => retryJob("j1", "w1"),
      () => getJob("j1", "w1"),
      () => listJobs("w1"),
    ]) {
      await assert.rejects(call, (e: unknown) => e instanceof BackendError && e.code === "BACKEND_UNAVAILABLE");
    }
  });
});
