import { getServerEnv } from "@/src/lib/env";
import { ProviderNotConfiguredError, type RenderingProvider } from "@/src/lib/ai-gateway/types";

/**
 * External rendering adapter (Rendiv-compatible deployment contract).
 * Our composition stays the source of truth; this adapter hands it to a
 * self-hosted renderer exposing
 *   POST /v1/renders { "composition": {...}, "format": "mp4" } -> { "job_id": "..." }
 *   GET  /v1/renders/:id -> { "status": "queued|processing|completed|failed", "url?": "..." }
 * (see docs/MEDIA_PIPELINE.md). Needs Node + headless Chromium + FFmpeg on
 * the runner — never Vercel serverless. Unset URL = boundary error.
 */
export class ExternalRenderingProvider implements RenderingProvider {
  readonly capability = "video" as const;
  readonly name = "rendiv";

  async render(request: { composition: unknown; format?: "mp4" | "webm" | "gif" }): Promise<{ jobId: string }> {
    if (!request.composition || typeof request.composition !== "object") {
      throw new Error("Rendering failed: composition must be an object.");
    }
    const format = request.format === "webm" || request.format === "gif" ? request.format : "mp4";
    const env = getServerEnv();
    const base = (env.RENDIV_URL ?? "").trim().replace(/\/+$/, "");
    if (!base) throw new ProviderNotConfiguredError("video", "Set RENDIV_URL to enable server rendering.");
    let response: Response;
    try {
      response = await fetch(`${base}/v1/renders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ composition: request.composition, format }),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new Error("Rendering failed: renderer unreachable.");
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new Error(`Rendering failed: unexpected response (${response.status}).`);
    }
    if (!response.ok) throw new Error(`Rendering failed (${response.status}).`);
    if (typeof payload.job_id !== "string" || !payload.job_id) throw new Error("Rendering failed: no job id returned.");
    return { jobId: payload.job_id };
  }

  /** Poll a render job (status passthrough for the jobs runner). */
  async renderStatus(jobId: string): Promise<{ status: string; url?: string }> {
    const env = getServerEnv();
    const base = (env.RENDIV_URL ?? "").trim().replace(/\/+$/, "");
    if (!base) throw new ProviderNotConfiguredError("video", "Set RENDIV_URL to enable server rendering.");
    const response = await fetch(`${base}/v1/renders/${encodeURIComponent(jobId)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Render status check failed (${response.status}).`);
    const payload = (await response.json()) as { status?: unknown; url?: unknown };
    return {
      status: typeof payload.status === "string" ? payload.status : "unknown",
      url: typeof payload.url === "string" ? payload.url : undefined,
    };
  }
}
