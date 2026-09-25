import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { defaultWorkspace } from "@/src/server/sync";
import {
  toErrorResponse,
  validationError,
  zodToDetails,
  rateLimited,
} from "@/src/server/errors";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { createJob, listJobs, JOB_TYPES, JOB_STATUSES } from "@/src/server/jobs/store";

const listQuery = z.object({
  status: z.enum(JOB_STATUSES as unknown as [string, ...string[]]).optional(),
  type: z.enum(JOB_TYPES as unknown as [string, ...string[]]).optional(),
  projectId: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const createBody = z.object({
  projectId: z.string().max(128).optional(),
  type: z.enum(JOB_TYPES as unknown as [string, ...string[]]),
  provider: z.string().max(60).default(""),
  model: z.string().max(120).default(""),
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().max(128).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});

/** GET /api/v1/jobs — workspace execution records (viewer+). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const workspaceId = await defaultWorkspace(user);
    await requireMembership(workspaceId, user, "viewer");
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = listQuery.safeParse(params);
    if (!parsed.success) throw validationError("Invalid query.", zodToDetails(parsed.error));
    const jobs = await listJobs(workspaceId, {
      status: parsed.data.status as never,
      type: parsed.data.type as never,
      projectId: parsed.data.projectId,
      limit: parsed.data.limit,
    });
    return NextResponse.json({ data: jobs });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/jobs — queue an execution record (editor+). */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const workspaceId = await defaultWorkspace(user);
    await requireMembership(workspaceId, user, "editor");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationError("Request body must be valid JSON.");
    }
    const parsed = createBody.safeParse(body);
    if (!parsed.success) throw validationError("Invalid job.", zodToDetails(parsed.error));
    const job = await createJob({
      workspaceId,
      actorId: user.id,
      projectId: parsed.data.projectId,
      type: parsed.data.type as never,
      provider: parsed.data.provider,
      model: parsed.data.model,
      input: parsed.data.input,
      idempotencyKey: parsed.data.idempotencyKey,
      maxAttempts: parsed.data.maxAttempts,
    });
    return NextResponse.json({ data: job }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
