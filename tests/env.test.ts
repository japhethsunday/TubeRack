import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getServerEnv, __resetEnvCache } from "@/src/lib/env";

describe("server env", () => {
  afterEach(() => __resetEnvCache());

  it("applies safe defaults with no providers configured", () => {
    const env = getServerEnv({} as unknown as NodeJS.ProcessEnv);
    assert.equal(env.APP_URL, "http://localhost:3000");
    assert.equal(env.TEXT_API_KEY, undefined);
  });

  it("rejects invalid APP_URL", () => {
    assert.throws(() =>
      getServerEnv({ APP_URL: "not-a-url" } as unknown as NodeJS.ProcessEnv),
    );
  });
});
