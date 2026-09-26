import { getServerEnv } from "@/src/lib/env";

/**
 * Free AI video: open-source models (LTX-Video, Wan 2.2) running on public
 * Hugging Face GPU demos. No cost, but a small shared daily allowance and
 * queues, so each engine is tried in turn and failures are expected.
 */

interface Engine {
  id: string;
  label: string;
  base: string;
  /** Gradio endpoint and its argument list for this request. */
  call(input: VideoInput, image: FileData | null): { api: string; data: unknown[] } | null;
}

export interface VideoInput {
  prompt: string;
  /** Still image to animate (bytes + mime), or null for text-to-video. */
  image: { bytes: Uint8Array; mime: string } | null;
  aspect: "16:9" | "9:16" | "1:1";
  seconds: number;
}

interface FileData {
  path: string;
  meta: { _type: "gradio.FileData" };
  orig_name?: string;
}

const NEGATIVE = "worst quality, inconsistent motion, blurry, jittery, distorted, watermark, text";
const SIZES = { "16:9": [768, 448], "9:16": [448, 768], "1:1": [576, 576] } as const;

export const FREE_VIDEO_ENGINES: Engine[] = [
  {
    id: "ltx",
    label: "LTX-Video",
    base: "https://lightricks-ltx-video-distilled.hf.space",
    call: (input, image) => {
      const [width, height] = SIZES[input.aspect];
      const mode = image ? "image-to-video" : "text-to-video";
      return {
        api: image ? "image_to_video" : "text_to_video",
        data: [input.prompt, NEGATIVE, image, null, height, width, mode, input.seconds, 9, 42, true, 1, true],
      };
    },
  },
  {
    id: "wan",
    label: "Wan 2.2",
    base: "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space",
    // Image-to-video only.
    call: (input, image) => (image ? { api: "generate_video", data: [image, input.prompt, 4, NEGATIVE, input.seconds, 1, 1, 42, true] } : null),
  },
];

/** Works anonymously; an HF_TOKEN just raises the daily GPU allowance. FREE_VIDEO=off disables it. */
export function isFreeVideoConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return env.FREE_VIDEO?.trim().toLowerCase() !== "off";
}

function headers(): Record<string, string> {
  const token = getServerEnv().HF_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function upload(base: string, image: { bytes: Uint8Array; mime: string }, signal: AbortSignal): Promise<FileData> {
  const form = new FormData();
  const ext = image.mime.split("/")[1] ?? "png";
  form.append("files", new Blob([image.bytes as BlobPart], { type: image.mime }), `frame.${ext}`);
  const res = await fetch(`${base}/gradio_api/upload`, { method: "POST", headers: headers(), body: form, signal });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  const [path] = (await res.json()) as string[];
  if (!path) throw new Error("upload returned nothing");
  return { path, meta: { _type: "gradio.FileData" }, orig_name: `frame.${ext}` };
}

/** Pull the video URL out of a Gradio "complete" payload. */
export function videoUrlFrom(base: string, payload: unknown): string | null {
  const first = Array.isArray(payload) ? payload[0] : payload;
  const file = (first && typeof first === "object" && "video" in first ? (first as { video: unknown }).video : first) as { url?: string; path?: string } | null;
  if (!file || typeof file !== "object") return null;
  if (file.url) return file.url;
  return file.path ? `${base}/gradio_api/file=${file.path}` : null;
}

/** Read Gradio's event stream until the job completes or fails. */
export function parseEventStream(text: string): { done: true; data: unknown } | { done: false; error: string | null } {
  let event = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) {
      const raw = line.slice(5).trim();
      if (event === "complete") {
        try {
          return { done: true, data: JSON.parse(raw) };
        } catch {
          return { done: false, error: "bad response" };
        }
      }
      if (event === "error") return { done: false, error: raw && raw !== "null" ? raw.slice(0, 200) : "busy" };
    }
  }
  return { done: false, error: null };
}

async function runEngine(engine: Engine, input: VideoInput, deadline: number): Promise<{ bytes: Uint8Array; mime: string }> {
  const signal = AbortSignal.timeout(Math.max(5_000, deadline - Date.now()));
  const image = input.image ? await upload(engine.base, input.image, signal) : null;
  const request = engine.call(input, image);
  if (!request) throw new Error("not supported");
  const start = await fetch(`${engine.base}/gradio_api/call/${request.api}`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ data: request.data }),
    signal,
  });
  if (!start.ok) throw new Error(`start ${start.status}`);
  const { event_id } = (await start.json()) as { event_id?: string };
  if (!event_id) throw new Error("no job id");
  const stream = await fetch(`${engine.base}/gradio_api/call/${request.api}/${event_id}`, { headers: headers(), signal });
  if (!stream.ok) throw new Error(`result ${stream.status}`);
  const result = parseEventStream(await stream.text());
  if (!result.done) throw new Error(result.error ?? "no result");
  const url = videoUrlFrom(engine.base, result.data);
  if (!url) throw new Error("no video in result");
  const file = await fetch(url, { headers: headers(), signal });
  if (!file.ok) throw new Error(`download ${file.status}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength < 1000) throw new Error("empty video");
  return { bytes, mime: file.headers.get("content-type")?.startsWith("video/") ? file.headers.get("content-type")! : "video/mp4" };
}

/** Try each free engine in turn until one returns a clip or time runs out. */
export async function generateFreeVideo(input: VideoInput, budgetMs = 270_000): Promise<{ bytes: Uint8Array; mime: string; engine: string }> {
  const deadline = Date.now() + budgetMs;
  const errors: string[] = [];
  for (const engine of FREE_VIDEO_ENGINES) {
    if (!engine.call(input, input.image ? ({} as FileData) : null)) continue;
    if (deadline - Date.now() < 20_000) break;
    try {
      const clip = await runEngine(engine, input, deadline);
      return { ...clip, engine: engine.label };
    } catch (e) {
      errors.push(`${engine.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.warn("[free-video] all engines failed", errors.join(" | "));
  const quota = errors.some((e) => /quota|exceeded|GPU/i.test(e));
  throw new Error(
    quota
      ? "Today's free video allowance is used up. It resets daily — try again later."
      : "The free video engines are busy right now. Please try again in a few minutes.",
  );
}
