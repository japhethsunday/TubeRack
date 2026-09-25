import { test } from "node:test";
import assert from "node:assert/strict";
import { isCloudTtsConfigured, isVertexConfigured, serviceAccount, vertexOptions, wavToPcm } from "@/src/server/ai/google-cloud";
import { pcmToWavBase64 } from "@/src/server/ai/gemini";

const key = { client_email: "bot@proj.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n", project_id: "my-proj" };
const env = (extra: Record<string, string>) => extra as never;

test("google cloud: reads a service-account key as raw or base64 JSON", () => {
  const raw = serviceAccount(env({ GOOGLE_SERVICE_ACCOUNT_KEY: JSON.stringify(key) }));
  assert.equal(raw?.client_email, key.client_email);
  assert.ok(raw?.private_key.includes("\nabc\n"));
  const b64 = serviceAccount(env({ GOOGLE_SERVICE_ACCOUNT_KEY: Buffer.from(JSON.stringify(key)).toString("base64") }));
  assert.equal(b64?.project_id, "my-proj");
  assert.equal(serviceAccount(env({ GOOGLE_SERVICE_ACCOUNT_KEY: "not a key" })), null);
  assert.equal(serviceAccount(env({})), null);
});

test("google cloud: Vertex AI turns on with a key + project; Cloud TTS with a key or an API key", () => {
  const withKey = env({ GOOGLE_SERVICE_ACCOUNT_KEY: JSON.stringify(key) });
  assert.equal(isVertexConfigured(withKey), true);
  assert.equal(vertexOptions(withKey).project, "my-proj");
  assert.equal(vertexOptions(withKey).location, "global");
  assert.equal(vertexOptions(env({ GOOGLE_SERVICE_ACCOUNT_KEY: JSON.stringify(key), GOOGLE_CLOUD_PROJECT: "other", GOOGLE_CLOUD_LOCATION: "us-central1" })).location, "us-central1");
  assert.equal(isVertexConfigured(env({})), false);
  assert.equal(isCloudTtsConfigured(env({ GOOGLE_TTS_API_KEY: "k" })), true);
  assert.equal(isCloudTtsConfigured(env({})), false);
});

test("google cloud: LINEAR16 replies are unwrapped to PCM with their sample rate", () => {
  const pcm = Buffer.alloc(4800, 7);
  const wav = Buffer.from(pcmToWavBase64(pcm.toString("base64"), 24000), "base64");
  const out = wavToPcm(wav);
  assert.equal(out.rate, 24000);
  assert.equal(out.pcm.length, 4800);
});
