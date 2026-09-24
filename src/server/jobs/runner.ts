import { z } from "zod";
import { gateway } from "@/src/server/ai/gateway";
import { toSrt, toVtt } from "@/src/server/ai/whisperx";
import { storeBytes, extForMime } from "@/src/server/ai/guard";
import { storageGet, storageSignedUrl } from "@/src/server/storage";
import {
  claimJob,
  completeJob,
  failJob,
  isCancelled,
  reportProgress,
  type JobRow,
} from "@/src/server/jobs/store";

/**
 * Job runner: executes one claimed job through the AI gateway and writes
 * the result to Supabase Storage + the job row. Runs in the worker process
 * (src/worker), never inside a request — self-hosted GPU/render providers
 * can take minutes. Every input is validated; malformed input fails the
 * job permanently instead of retrying forever.
 */

export class PermanentJobError extends Error {}

const imageInput = z.object({
  kind: z.literal("image"),
  prompt: z.string().trim().min(1).max(4000),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  provider: z.string().max(40).optional(),
});
const ttsInput = z.object({
  kind: z.literal("tts"),
  text: z.string().trim().min(1).max(5000),
  voice: z.string().max(80).optional(),
  provider: z.string().max(40).optional(),
});
const musicInput = z.object({
  kind: z.literal("music"),
  prompt: z.string().trim().min(1).max(1000),
  durationSec: z.number().int().min(5).max(300).default(30),
  provider: z.string().max(40).optional(),
});
const transcriptionInput = z.object({
  file: z.string().regex(/^\/api\/v1\/(generated|uploads)\/[0-9a-f-]{36}(-output)?\.(wav|mp3|ogg|mp4|webm)$/, "Unsupported media reference."),
  language: z.string().max(10).optional(),
  provider: z.string().max(40).optional(),
});
const renderInput = z.object({
  composition: z.record(z.string(), z.unknown()),
  format: z.enum(["mp4", "webm", "gif"]).default("mp4"),
  provider: z.string().max(40).optional(),
});

export const JOB_INPUTS = {
  generation: imageInput,
  audio: z.discriminatedUnion("kind", [ttsInput, musicInput]),
  transcription: transcriptionInput,
  render: renderInput,
} as const;

/** Map an app file URL to its storage key inside the job's workspace (no cross-tenant reads). */
export function storageKeyFor(workspaceId: string, appUrl: string): string {
  const m = /^\/api\/v1\/(generated|uploads)\/([0-9a-f-]{36}(?:-output)?\.[a-z0-9]+)$/.exec(appUrl);
  if (!m) throw new PermanentJobError("Unsupported media reference.");
  return `${workspaceId}/${m[1]}/${m[2]}`;
}

async function persist(workspaceId: string, base64: string, mime: string): Promise<string> {
  const url = await storeBytes(workspaceId, Buffer.from(base64, "base64"), mime, extForMime(mime));
  if (!url) throw new PermanentJobError("File storage is not configured.");
  return url;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new PermanentJobError(`Invalid job input: ${parsed.error.issues[0]?.message ?? "malformed"}.`);
  return parsed.data;
}

/**
 * Replace app media URLs inside a composition with 2-hour signed links so an
 * external renderer can fetch them. Only this workspace's files resolve.
 */
export async function signCompositionMedia(workspaceId: string, value: unknown): Promise<unknown> {
  if (typeof value === "string") {
    if (!/^\/api\/v1\/(generated|uploads)\//.test(value)) return value;
    return storageSignedUrl(storageKeyFor(workspaceId, value), 7200);
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => signCompositionMedia(workspaceId, v)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await signCompositionMedia(workspaceId, v);
    return out;
  }
  return value;
}

/** Execute a job's work. Returns the output object stored on the job row. */
export async function executeJob(job: JobRow, progress: (p: number) => Promise<void>): Promise<Record<string, unknown>> {
  const ws = job.workspace_id;
  if (job.type === "generation") {
    const input = parse(JOB_INPUTS.generation, job.input);
    const { name, provider } = gateway.image(input.provider);
    await progress(20);
    const out = await provider.generateImage({ prompt: input.prompt, aspectRatio: input.aspectRatio });
    const m = /^data:([^;]+);base64,(.+)$/.exec(out.url);
    if (!m) throw new Error("Provider returned an unexpected image format.");
    await progress(85);
    return { kind: "image", provider: name, url: await persist(ws, m[2], m[1]), mime: m[1] };
  }
  if (job.type === "audio") {
    const input = parse(JOB_INPUTS.audio, job.input);
    if (input.kind === "tts") {
      const { name, provider } = gateway.tts(input.provider);
      await progress(20);
      const out = await provider.synthesizeSpeech({ text: input.text, voice: input.voice });
      await progress(85);
      return { kind: "tts", provider: name, model: out.model, url: await persist(ws, out.audioBase64, out.mimeType), mime: out.mimeType };
    }
    const { name, provider } = gateway.music(input.provider);
    await progress(15);
    const out = await provider.composeMusic({ prompt: input.prompt, durationSec: input.durationSec });
    await progress(85);
    return { kind: "music", provider: name, model: out.model, url: await persist(ws, out.audioBase64, out.mimeType), mime: out.mimeType, durationSec: input.durationSec };
  }
  if (job.type === "transcription") {
    const input = parse(JOB_INPUTS.transcription, job.input);
    const { name, provider } = gateway.transcription(input.provider);
    let media: { bytes: Uint8Array; mime: string };
    try {
      media = await storageGet(storageKeyFor(ws, input.file));
    } catch {
      throw new PermanentJobError("The media file was not found in this workspace.");
    }
    if (media.bytes.byteLength > 100 * 1024 * 1024) throw new PermanentJobError("Media exceeds the 100 MB transcription limit.");
    await progress(25);
    const out = await provider.transcribe({
      audioBase64: Buffer.from(media.bytes).toString("base64"),
      mimeType: media.mime,
      language: input.language,
    });
    return { kind: "transcript", provider: name, text: out.text, segments: out.segments, srt: toSrt(out.segments), vtt: toVtt(out.segments), language: out.language };
  }
  if (job.type === "render") {
    const input = parse(JOB_INPUTS.render, job.input);
    const { name, provider } = gateway.render(input.provider);
    const composition = await signCompositionMedia(ws, input.composition);
    const started = await provider.render({ composition, format: input.format });
    await progress(10);
    const deadline = Date.now() + 30 * 60 * 1000;
    for (let tick = 0; Date.now() < deadline; tick++) {
      await new Promise((r) => setTimeout(r, 5000));
      if (await isCancelled(job.id, ws)) throw new PermanentJobError("Cancelled.");
      const status = await provider.renderStatus!(started.jobId);
      if (status.status === "failed" || status.status === "error") throw new Error("The renderer reported a failure.");
      if (status.status === "completed" || status.status === "done") {
        if (!status.url) throw new Error("The renderer finished without an output URL.");
        const file = await fetch(status.url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
        if (!file.ok) throw new Error(`Could not download the render (${file.status}).`);
        const mime = file.headers.get("content-type") ?? `video/${input.format}`;
        const url = await storeBytes(ws, new Uint8Array(await file.arrayBuffer()), mime, extForMime(mime));
        if (!url) throw new PermanentJobError("File storage is not configured.");
        return { kind: "video", provider: name, url, mime, externalJobId: started.jobId };
      }
      await progress(Math.min(90, 10 + tick * 3));
    }
    throw new Error("Render timed out after 30 minutes.");
  }
  throw new PermanentJobError(`Unknown job type "${job.type}".`);
}

/**
 * Claim → execute → complete/fail. Permanent errors burn remaining
 * attempts so malformed input never loops. Returns the final status.
 */
export async function runJob(id: string, workspaceId: string): Promise<"completed" | "failed" | "retrying" | "skipped"> {
  const job = await claimJob(id, workspaceId);
  if (!job) return "skipped";
  try {
    const output = await executeJob(job, async (p) => {
      await reportProgress(id, workspaceId, p);
    });
    if (await isCancelled(id, workspaceId)) return "skipped";
    await completeJob(id, workspaceId, output);
    return "completed";
  } catch (error) {
    if (await isCancelled(id, workspaceId)) return "skipped";
    if (error instanceof PermanentJobError) {
      const { getDb } = await import("@/src/server/db");
      const db = getDb();
      if (db) await db`UPDATE jobs SET attempts = max_attempts WHERE id = ${id} AND workspace_id = ${workspaceId}`;
    }
    const after = await failJob(id, workspaceId, error);
    return after?.status === "retrying" ? "retrying" : "failed";
  }
}
