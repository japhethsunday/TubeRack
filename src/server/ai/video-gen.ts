import { arkStartVideo, arkVideoModels, arkVideoStatus, isArkConfigured } from "@/src/server/ai/ark";
import { generateFreeVideo, type VideoInput } from "@/src/server/ai/free-video";

/**
 * AI video clips: Seedance first (best quality), then the free open-source
 * engines. Each Seedance model is tried in turn; any failure (no credit,
 * busy, timeout) moves on, so a clip still comes back whenever one works.
 */

const POLL_MS = 4000;

async function seedance(input: VideoInput, model: string, deadline: number): Promise<{ bytes: Uint8Array; mime: string; seconds: number }> {
  const image = input.image ? `data:${input.image.mime};base64,${Buffer.from(input.image.bytes).toString("base64")}` : undefined;
  const seconds = 5;
  const id = await arkStartVideo(input.prompt, { model, aspect: input.aspect, seconds, image });
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const st = await arkVideoStatus(id);
    if (st.status === "succeeded" && st.videoUrl) {
      const file = await fetch(st.videoUrl, { signal: AbortSignal.timeout(Math.max(5000, deadline - Date.now())) });
      if (!file.ok) throw new Error(`download ${file.status}`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength < 1000) throw new Error("empty video");
      return { bytes, mime: "video/mp4", seconds };
    }
    if (st.status === "failed" || st.status === "cancelled") throw new Error(st.error ?? st.status);
  }
  throw new Error("timeout");
}

export async function generateVideoClip(input: VideoInput, budgetMs = 280_000): Promise<{ bytes: Uint8Array; mime: string; engine: string; seconds: number }> {
  const deadline = Date.now() + budgetMs;
  if (isArkConfigured()) {
    // Leave the free engines enough time to run if every Seedance model fails.
    const arkDeadline = deadline - 100_000;
    for (const model of arkVideoModels()) {
      if (arkDeadline - Date.now() < 30_000) break;
      try {
        return { ...(await seedance(input, model, arkDeadline)), engine: "seedance" };
      } catch (e) {
        console.warn(`[video] seedance ${model} failed:`, e instanceof Error ? e.message.slice(0, 200) : e);
        // A missing credit or key fails every model the same way: skip ahead.
        if (e instanceof Error && /40[13]|quota|balance|insufficient|overdue|account/i.test(e.message)) break;
      }
    }
  }
  const clip = await generateFreeVideo(input, Math.max(30_000, deadline - Date.now()));
  return { ...clip, seconds: input.seconds };
}
