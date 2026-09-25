import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { defaultWorkspace } from "@/src/server/sync";
import { toErrorResponse, notFound, rateLimited } from "@/src/server/errors";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { parseId } from "@/src/server/validate";
import { cancelJob, getJob, retryJob } from "@/src/server/jobs/store";

function idFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  return parseId(parts[parts.indexOf("jobs") + 1] ?? "", "job");
}

/** GET /api/v1/jobs/[id] — one execution record (viewer+). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const workspaceId = await defaultWorkspace(user);
    await requireMembership(workspaceId, user, "viewer");
    const job = await getJob(idFrom(request), workspaceId);
    if (!job) throw notFound("Job");
    return NextResponse.json({ data: job });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/v1/jobs/[id] — cancel or re-queue (editor+). */
export async function PATCH(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const workspaceId = await defaultWorkspace(user);
    await requireMembership(workspaceId, user, "editor");
    const id = idFrom(request);
    let body: { action?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    const job =
      body.action === "retry"
        ? await retryJob(id, workspaceId, user.id)
        : await cancelJob(id, workspaceId, user.id);
    if (!job) throw notFound("Job");
    return NextResponse.json({ data: job });
  } catch (error) {
    return toErrorResponse(error);
  }
}
