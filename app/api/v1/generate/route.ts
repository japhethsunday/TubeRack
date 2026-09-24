import { NextResponse } from "next/server";
import { z } from "zod";
import { gateway } from "@/src/server/ai/gateway";
import { JOB_INPUTS } from "@/src/server/jobs/runner";
import { createJob } from "@/src/server/jobs/store";
import { guardProviderCall, providerFailure, recordUsage } from "@/src/server/ai/guard";
import { toErrorResponse, validationError, zodToDetails } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

const body = z.object({
  type: z.enum(["generation", "audio", "transcription", "render"]),
  projectId: z.string().max(128).optional(),
  idempotencyKey: z.string().max(128).optional(),
  input: z.record(z.string(), z.unknown()),
});

/**
 * POST /api/v1/generate — queue a long-running provider job (editor+).
 * The provider must be configured now; the worker executes it later and
 * the client polls GET /api/v1/jobs/:id. Returns 503 when unconfigured.
 */
export async function POST(request: Request) {
  try {
    const caller = await guardProviderCall();
    const req = await parseBody(request, body);
    const parsed = JOB_INPUTS[req.type].safeParse(req.input);
    if (!parsed.success) throw validationError("Invalid job input.", zodToDetails(parsed.error));
    const input = parsed.data as { kind?: string; provider?: string };
    const route =
      req.type === "generation"
        ? gateway.image(input.provider)
        : req.type === "transcription"
          ? gateway.transcription(input.provider)
          : req.type === "render"
            ? gateway.render(input.provider)
            : input.kind === "music"
              ? gateway.music(input.provider)
              : gateway.tts(input.provider);
    const job = await createJob({
      workspaceId: caller.workspaceId,
      actorId: caller.user.id,
      projectId: req.projectId,
      type: req.type,
      provider: route.name,
      input: { ...parsed.data, provider: route.name },
      idempotencyKey: req.idempotencyKey,
    });
    await recordUsage(caller, { kind: req.type, provider: route.name, status: "completed", ref: job.id });
    return NextResponse.json({ data: job }, { status: 202 });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "This provider"));
  }
}
