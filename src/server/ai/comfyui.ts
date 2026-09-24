import { getServerEnv } from "@/src/lib/env";
import { ProviderNotConfiguredError, type ImageProvider } from "@/src/lib/ai-gateway/types";

/**
 * ComfyUI image adapter (ComfyUI is GPL-3.0; it runs as a separate
 * process over its prompt API, so nothing is linked into TubeRack).
 * COMFYUI_WORKFLOW holds a workflow JSON template where {{PROMPT}} and
 * {{ASPECT}} are substituted per request, then POSTed to /prompt and
 * polled via /history. Checkpoints carry their own licenses — verify per
 * model. GPU required for practical use. Unset URL/workflow = boundary.
 */
export class ComfyUIImageProvider implements ImageProvider {
  readonly capability = "image" as const;
  readonly name = "comfyui";

  async generateImage(request: { prompt: string; aspectRatio?: string }): Promise<{ url: string; prompt: string }> {
    const prompt = request.prompt.trim();
    if (!prompt) throw new Error("ComfyUI generation failed: prompt cannot be empty.");
    const env = getServerEnv();
    const base = (env.COMFYUI_URL ?? "").trim().replace(/\/+$/, "");
    if (!base) throw new ProviderNotConfiguredError("image", "Set COMFYUI_URL to enable ComfyUI generation.");
    if (!env.COMFYUI_WORKFLOW) throw new ProviderNotConfiguredError("image", "Set COMFYUI_WORKFLOW to a workflow JSON template.");
    const aspect = request.aspectRatio === "9:16" || request.aspectRatio === "1:1" ? request.aspectRatio : "16:9";
    let workflow: unknown;
    try {
      workflow = JSON.parse(env.COMFYUI_WORKFLOW.replaceAll("{{PROMPT}}", prompt).replaceAll("{{ASPECT}}", aspect));
    } catch {
      throw new Error("ComfyUI generation failed: COMFYUI_WORKFLOW is not valid JSON.");
    }
    const auth: Record<string, string> = env.COMFYUI_API_KEY ? { Authorization: `Bearer ${env.COMFYUI_API_KEY}` } : {};
    const started = Date.now();
    const deadline = started + 10 * 60 * 1000;
    let promptId: string;
    try {
      const queued = await fetch(`${base}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...auth },
        body: JSON.stringify({ prompt: workflow }),
        signal: AbortSignal.timeout(60000),
      });
      const body = (await queued.json()) as { prompt_id?: string };
      if (!queued.ok || !body.prompt_id) throw new Error(`queue rejected (${queued.status})`);
      promptId = body.prompt_id;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("ComfyUI")) throw error;
      throw new Error("ComfyUI generation failed: service unreachable.");
    }
    // Poll history until the run completes or the deadline passes.
    for (;;) {
      if (Date.now() > deadline) throw new Error("ComfyUI generation failed: timed out waiting for output.");
      await new Promise((r) => setTimeout(r, 4000));
      let history: Record<string, { outputs?: Record<string, { images?: { filename?: string; subfolder?: string; type?: string }[] }> }> = {};
      try {
        const res = await fetch(`${base}/history/${encodeURIComponent(promptId)}`, {
          headers: { Accept: "application/json", ...auth },
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) history = (await res.json()) as typeof history;
      } catch {
        continue;
      }
      const outputs = history[promptId]?.outputs ?? {};
      for (const node of Object.values(outputs)) {
        const image = node.images?.[0];
        if (image?.filename) {
          const params = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? "", type: image.type ?? "output" });
          const file = await fetch(`${base}/view?${params.toString()}`, { headers: auth, signal: AbortSignal.timeout(120000) });
          if (!file.ok) throw new Error(`ComfyUI generation failed: output fetch (${file.status}).`);
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.length === 0) throw new Error("ComfyUI generation failed: empty output.");
          const mime = file.headers.get("content-type") ?? "image/png";
          return { url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`, prompt: request.prompt };
        }
      }
    }
  }
}
